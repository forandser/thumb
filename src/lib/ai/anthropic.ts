/**
 * 클로드 비전 사진 진단 어댑터 (BYOK, 브라우저 직접 호출).
 *
 * 원리: 픽셀 생성이 아니라 "진단"이다. 사진을 클로드에 보내 보수적 보정 파라미터를
 * JSON으로 받아 기존 renderEdit 파이프라인(밝기·대비·채도·색온도·미세각도)에 넣는다.
 * 사용자는 이후 슬라이더로 자유롭게 미세조정한다.
 *
 * fdp 사이트의 anthropic-adapter.ts 패턴을 승계하되(SDK 없이 경량 fetch),
 * 특히 헤더(anthropic-dangerous-direct-browser-access / anthropic-version)와
 * 에러 매트릭스(401 키 오류 / 403 지역 차단 / 429 재시도 / 529 혼잡)를 그대로 가져온다.
 *
 * 정적 사이트라 서버가 없다 — 키는 사용자 브라우저에서 직접 Anthropic으로만 간다.
 */
import { DEFAULT_EDIT, EditState, RANGE } from "@/lib/image/types"

/** v0.2 모델 — 클로드 Opus 4.8 (비전·구조화 출력 지원). */
export const AI_MODEL = "claude-opus-4-8"
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
const ANTHROPIC_VERSION = "2023-06-01"

/** 장당 AI 호출 추정 비용(KRW, 고정 추정치) — 비용 트래커·버튼 라벨 공용. */
export const AI_COST_KRW = 30

export type AiErrorCode =
  | "invalid_key"
  | "geo_blocked"
  | "rate_limited"
  | "overloaded"
  | "network"
  | "empty"
  | "parse"
  | "refusal"
  | "truncated"
  | "unknown"

export class AiError extends Error {
  code: AiErrorCode
  /** 429의 Retry-After(밀리초). 자동 백오프에서 우선 적용. */
  retryAfterMs?: number
  constructor(code: AiErrorCode, retryAfterMs?: number) {
    super(code)
    this.code = code
    this.retryAfterMs = retryAfterMs
    this.name = "AiError"
  }
}

/** 클로드가 돌려줄 보정 진단(각 필드는 파싱 후 슬라이더 범위로 클램프). */
export interface AiDiagnosis {
  brightness: number
  contrast: number
  saturation: number
  temperature: number
  /** 미세각도(수평 보정) -15..15 */
  angle: number
  /** 무엇을 왜 바꿨는지 한국어 한 줄. */
  comment: string
}

/**
 * 응답 JSON 스키마 강제(output_config.format). 구조화 출력은 숫자 min/max 제약을
 * 지원하지 않으므로(스키마에 넣으면 400 위험) 범위는 프롬프트로만 안내하고 파싱 후 클램프한다.
 */
const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    brightness: { type: "number" },
    contrast: { type: "number" },
    saturation: { type: "number" },
    temperature: { type: "number" },
    angle: { type: "number" },
    comment: { type: "string" },
  },
  required: ["brightness", "contrast", "saturation", "temperature", "angle", "comment"],
  additionalProperties: false,
} as const

const SYSTEM_PROMPT = `당신은 온라인 판매용 과일 사진의 보정값을 진단하는 전문가입니다.
목표는 "실물 그대로 잘 보이게" 하는 보수적인 보정입니다. 화려하게 만드는 것이 아닙니다.

원칙(우선순위 순):
1) 화이트밸런스 중립이 최우선. 형광등의 누런빛/파란빛 등 색 캐스트를 걷어내 실제 색으로.
2) 과채도 금지. 채도는 실물보다 색이 뻥튀기되지 않게 아주 조심스럽게만.
3) 밝기·대비는 어둡거나 밋밋할 때만 소폭.
4) 수평이 눈에 띄게 틀어졌을 때만 미세각도로 바로잡기(대부분은 0).

보정이 필요 없으면 해당 값은 0으로 두세요. 과감한 값은 클레임 위험이 있으니 지양합니다.

값의 의미와 허용 범위:
- brightness: 밝기, ${RANGE.brightness.min}~${RANGE.brightness.max} (0=원본)
- contrast: 대비, ${RANGE.contrast.min}~${RANGE.contrast.max} (0=원본)
- saturation: 채도, ${RANGE.saturation.min}~${RANGE.saturation.max} (0=원본, 양수는 아주 소폭만)
- temperature: 색온도, ${RANGE.temperature.min}~${RANGE.temperature.max} (음수=차갑게/파랑, 양수=따뜻하게/빨강)
- angle: 미세각도(수평 보정), ${RANGE.fineAngle.min}~${RANGE.fineAngle.max} (거의 항상 0)
- comment: 무엇을 왜 바꿨는지 셀러가 이해할 한국어 한 줄 (예: "형광등 누런빛을 걷어내고 밝기를 살짝 올렸어요")`

const USER_TEXT = `이 과일 사진의 보수적인 보정값을 진단해 JSON으로만 답하세요. 보정이 불필요한 값은 0으로 두세요.`

function clamp(v: unknown, min: number, max: number): number {
  const n = typeof v === "number" && Number.isFinite(v) ? v : 0
  return n < min ? min : n > max ? max : n
}

/** 진단값 → EditState 부분(색 보정 + 미세각도). 크롭/90도 회전은 건드리지 않는다. */
export function diagnosisToEdit(d: AiDiagnosis): Partial<EditState> {
  return {
    brightness: clamp(d.brightness, RANGE.brightness.min, RANGE.brightness.max),
    contrast: clamp(d.contrast, RANGE.contrast.min, RANGE.contrast.max),
    saturation: clamp(d.saturation, RANGE.saturation.min, RANGE.saturation.max),
    temperature: clamp(d.temperature, RANGE.temperature.min, RANGE.temperature.max),
    fineAngle: clamp(d.angle, RANGE.fineAngle.min, RANGE.fineAngle.max),
  }
}

/** 진단값을 기존 EditState에 얹은 새 상태(크롭·90도 회전 보존). */
export function applyDiagnosis(base: EditState, d: AiDiagnosis): EditState {
  return { ...base, ...diagnosisToEdit(d) }
}

/** AI 진단 초기 EditState(원본에서 시작). */
export function diagnosisAsEdit(d: AiDiagnosis): EditState {
  return applyDiagnosis(DEFAULT_EDIT, d)
}

interface AnthropicErrorBody {
  error?: { type?: string; message?: string }
}

function classifyStatus(status: number, body: AnthropicErrorBody | null): AiErrorCode {
  const errType = (body?.error?.type ?? "").toLowerCase()
  const errMsg = (body?.error?.message ?? "").toLowerCase()
  const combined = `${errType} ${errMsg}`
  if (status === 401) return "invalid_key"
  if (
    status === 403 ||
    combined.includes("region") ||
    combined.includes("country") ||
    combined.includes("unsupported_country")
  ) {
    return "geo_blocked"
  }
  if (status === 429) return "rate_limited"
  if (status === 529 || combined.includes("overloaded")) return "overloaded"
  return "unknown"
}

/** 응답 텍스트에서 JSON 파싱(코드펜스/잡음 방어). */
function extractDiagnosis(text: string): AiDiagnosis | null {
  const tryParse = (s: string): AiDiagnosis | null => {
    try {
      const o = JSON.parse(s)
      if (o && typeof o === "object") return o as AiDiagnosis
    } catch {
      /* noop */
    }
    return null
  }
  const direct = tryParse(text.trim())
  if (direct) return direct
  // 코드펜스/설명이 섞였을 때 첫 { ... } 블록만 추출.
  const start = text.indexOf("{")
  const end = text.lastIndexOf("}")
  if (start >= 0 && end > start) return tryParse(text.slice(start, end + 1))
  return null
}

/**
 * 사진 1장 진단. base64는 접두사 없는 JPEG(줄바꿈 없음).
 * 실패는 AiError(code)로 던진다. 취소(AbortError)는 그대로 전파해 호출부가 구분한다.
 */
export async function diagnosePhoto(
  apiKey: string,
  base64Jpeg: string,
  signal?: AbortSignal,
): Promise<AiDiagnosis> {
  let res: Response
  try {
    res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: AI_MODEL,
        max_tokens: 800,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: "image/jpeg", data: base64Jpeg },
              },
              { type: "text", text: USER_TEXT },
            ],
          },
        ],
        output_config: { format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
      }),
    })
  } catch (err) {
    // 취소는 그대로 전파.
    if (err instanceof DOMException && err.name === "AbortError") throw err
    throw new AiError("network")
  }

  if (!res.ok) {
    let body: AnthropicErrorBody | null = null
    try {
      body = (await res.json()) as AnthropicErrorBody
    } catch {
      /* 본문 없거나 JSON 아님 */
    }
    throw new AiError(classifyStatus(res.status, body), parseRetryAfter(res))
  }

  let data: { content?: Array<{ type?: string; text?: string }>; stop_reason?: string }
  try {
    data = await res.json()
  } catch {
    throw new AiError("parse")
  }

  // stop_reason 우선 처리 — 거절/잘림은 파싱 실패와 구분해 정확히 안내한다.
  if (data.stop_reason === "refusal") throw new AiError("refusal")

  const textBlock = Array.isArray(data.content)
    ? data.content.find((b) => b?.type === "text" && typeof b.text === "string")
    : undefined
  if (!textBlock?.text) {
    throw new AiError(data.stop_reason === "max_tokens" ? "truncated" : "empty")
  }

  const parsed = extractDiagnosis(textBlock.text)
  if (!parsed) {
    throw new AiError(data.stop_reason === "max_tokens" ? "truncated" : "parse")
  }
  return parsed
}

/** 429 응답의 Retry-After 헤더를 밀리초로 파싱(초 정수 또는 HTTP 날짜). 없으면 undefined. */
function parseRetryAfter(res: Response): number | undefined {
  if (res.status !== 429) return undefined
  const raw = res.headers.get("retry-after")
  if (!raw) return undefined
  const secs = Number(raw)
  if (Number.isFinite(secs) && secs >= 0) return secs * 1000
  const dateMs = Date.parse(raw)
  if (!Number.isNaN(dateMs)) return Math.max(0, dateMs - Date.now())
  return undefined
}
