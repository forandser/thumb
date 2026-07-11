/**
 * 클로드 재료/레퍼런스 분석 (BYOK, 브라우저 직접 호출).
 *
 * 원리: 생성 파이프라인에 앞서 "재료 사진(필수)과 레퍼런스(선택)를 보고" 프롬프트 품질을
 * 끌어올릴 메타데이터를 뽑는다. 비전 1콜로 {품종·개수·상태·요약·레퍼런스 스타일 묘사·추천 프리셋}을
 * json_schema로 받는다. 레퍼런스는 저작권 차단을 위해 픽셀을 생성에 넣지 않고, 클로드가
 * "스타일을 텍스트로만" 묘사하게 해 그 텍스트만 프롬프트에 반영한다(스펙 §STEP2·레퍼런스 규칙).
 *
 * 분석은 어디까지나 프롬프트 보조라, 실패해도 마법사는 계속 진행할 수 있어야 한다 →
 * 호출부가 try/catch로 AiError를 삼키고 프리셋 기본값으로 진행하도록 설계했다.
 *
 * anthropic.ts의 헤더·에러 매트릭스·json_schema·JSON 추출 패턴을 그대로 승계한다.
 */
import { AI_MODEL, AiError, type AiErrorCode } from "./anthropic"
import { DEFAULT_PRESET_KEY, isPresetKey, PRESET_KEYS, type PresetKey } from "@/lib/create/presets"

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
const ANTHROPIC_VERSION = "2023-06-01"

/** 재료(+레퍼런스) 분석 결과. 프롬프트 조립(prompt-engine)과 STEP2 분석 카드에 쓴다. */
export interface MaterialAnalysis {
  /** 품종 추정(예: "샤인머스캣"). 불확실하면 상위 과일명. */
  variety: string
  /** 재료 사진 속 과일 개수(정수 추정). 홀수 유도의 근거가 된다. */
  count: number
  /** 신선도·흠집 등 상태 한 줄. */
  condition: string
  /** 재료 요약 한 줄(셀러가 읽을 한국어). */
  summary: string
  /**
   * 레퍼런스 스타일 묘사(구도·광원·배경·톤을 텍스트로). 레퍼런스가 없으면 빈 문자열.
   * prompt-engine이 "레퍼런스 따라가기" 모드에서 프리셋 대신 이 문자열을 쓴다.
   */
  referenceStyle: string
  /** 추천 프리셋 key(항상 유효한 PresetKey로 보정됨). */
  recommendedPreset: PresetKey
}

/**
 * json_schema — 숫자 min/max는 스키마에 넣지 않고(400 위험) 프롬프트로 안내 후 파싱 시 보정.
 * recommendedPreset은 문자열로 받고 파싱 후 isPresetKey로 검증·보정한다.
 */
const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    variety: { type: "string" },
    count: { type: "number" },
    condition: { type: "string" },
    summary: { type: "string" },
    referenceStyle: { type: "string" },
    recommendedPreset: { type: "string" },
  },
  required: ["variety", "count", "condition", "summary", "referenceStyle", "recommendedPreset"],
  additionalProperties: false,
} as const

// 주의: 자동 추천 대상은 아래 7개뿐이다. 8번째 프리셋 handHeld("손에 든 컷")는 실물 보존과
// 궁합이 까다로워(스펙 §②) 자동 추천에서 의도적으로 제외하고 STEP2 수동 선택 전용으로 둔다.
// (isPresetKey는 8종을 모두 검증하므로 수동 선택은 정상 동작한다.) 프리셋 종류를 늘릴 때
// "아래 7개" 문구와 목록을 함께 갱신할 것.
const SYSTEM_PROMPT = `당신은 온라인 판매용 과일 사진의 상세페이지 썸네일 연출을 돕는 분석가입니다.
재료 사진(대표 1장 + 보조 여러 장일 수 있음, 필수)과 참고 사진(여러 장일 수 있음, 있을 때만)을 보고 아래를 판단해 JSON으로만 답하세요.

원칙:
- 재료 사진의 과일은 "실물 그대로" 관찰합니다. 개수·색·형태를 상상으로 바꾸지 마세요.
- 재료 사진이 여러 장이면 **같은 상품을 다른 각도에서 찍은 것**입니다(여러 상품이 아님). 첫 번째(대표)를 기준으로 삼고, 보조 컷은 품종·개수·상태 판정을 돕는 보조 근거로만 쓰세요. 개수는 대표 컷에 보이는 것을 기준으로 판단합니다.
- 참고 사진은 저작권 때문에 픽셀을 재사용하지 않습니다. 오직 "스타일(구도·광원 방향·배경·톤)"만 텍스트로 묘사하세요. 참고 사진이 여러 장이면 공통된 스타일(구도·광원·배경·톤)을 하나의 묘사로 종합하세요. 참고 사진이 없으면 referenceStyle은 빈 문자열("")로 두세요.
- recommendedPreset은 아래 7개 중 하나의 key만 고르세요.

프리셋 key와 의도:
- morningMarket: 밝은 데일리 신선함
- premiumDark: 어두운 배경 프리미엄 선물세트 고급감
- juicyCut: 단면·과즙 강조 식욕 자극
- onTheTable: 식탁 위 라이프스타일 연출
- farmFresh: 농가 직거래 야외 자연광
- studioClean: 무지 흰 배경 오픈마켓 대표이미지 단독컷
- seasonMood: 계절 팔레트·소품

필드:
- variety: 품종 추정(불확실하면 상위 과일명)
- count: 재료 사진 속 과일 개수(정수)
- condition: 신선도·흠집 등 상태를 한 줄로
- summary: 셀러가 읽을 재료 요약 한국어 한 줄
- referenceStyle: 참고 사진 스타일 묘사(없으면 "")
- recommendedPreset: 위 key 중 하나`

/** 재료 대표 1장 + 보조 최대 2장 전송(스펙 §분석 — 비용·요청 크기 관리). */
const MATERIAL_AUX_LIMIT = 2
/** 참고 사진 최대 5장 전송(스펙 §분석). */
const REFERENCE_LIMIT = 5

/**
 * 이미지 구성을 알려주는 사용자 안내문(대표 몇 장·보조 몇 장·참고 몇 장). 순서는
 * [대표, 보조…, 참고…]이며, 모델이 어느 이미지가 무엇인지 헷갈리지 않게 개수를 명시한다.
 */
function buildUserText(materialCount: number, referenceCount: number): string {
  const auxCount = Math.max(0, materialCount - 1)
  const parts = [
    `처음 1장은 재료 대표 사진입니다.`,
    auxCount > 0 ? `이어지는 ${auxCount}장은 같은 상품의 다른 각도(보조 재료)입니다.` : "",
    referenceCount > 0
      ? `마지막 ${referenceCount}장은 참고 사진이니 스타일만 텍스트로 종합 묘사하세요.`
      : `참고 사진은 없으니 referenceStyle은 ""로 두세요.`,
    `재료의 과일을 실물 그대로 관찰해 JSON으로만 답하세요.`,
  ]
  return parts.filter(Boolean).join(" ")
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

interface RawAnalysis {
  variety?: unknown
  count?: unknown
  condition?: unknown
  summary?: unknown
  referenceStyle?: unknown
  recommendedPreset?: unknown
}

/** 응답 텍스트에서 JSON 파싱(코드펜스/잡음 방어) — anthropic.ts와 동일 전략. */
function extractRaw(text: string): RawAnalysis | null {
  const tryParse = (s: string): RawAnalysis | null => {
    try {
      const o = JSON.parse(s)
      if (o && typeof o === "object") return o as RawAnalysis
    } catch {
      /* noop */
    }
    return null
  }
  const direct = tryParse(text.trim())
  if (direct) return direct
  const start = text.indexOf("{")
  const end = text.lastIndexOf("}")
  if (start >= 0 && end > start) return tryParse(text.slice(start, end + 1))
  return null
}

function str(v: unknown): string {
  return typeof v === "string" ? v : ""
}

/** 원시 응답을 안전한 MaterialAnalysis로 보정(타입·프리셋 key 검증). */
function normalize(raw: RawAnalysis): MaterialAnalysis {
  const countNum = typeof raw.count === "number" && Number.isFinite(raw.count) ? Math.max(0, Math.round(raw.count)) : 0
  return {
    variety: str(raw.variety),
    count: countNum,
    condition: str(raw.condition),
    summary: str(raw.summary),
    referenceStyle: str(raw.referenceStyle),
    recommendedPreset: isPresetKey(raw.recommendedPreset) ? raw.recommendedPreset : DEFAULT_PRESET_KEY,
  }
}

/**
 * 재료(대표+보조) + 선택 레퍼런스(여러 장) 분석. base64는 접두사 없는 JPEG(줄바꿈 없음).
 * materialBase64s는 [대표, 보조…] 순서(1장 이상 필수) — 보조는 앞 2장만 전송한다.
 * referenceBase64s는 참고 사진들(0장 이상) — 앞 5장만 전송한다.
 * 실패는 AiError(code)로 던진다(호출부가 삼켜 기본 프리셋으로 진행). 취소는 그대로 전파.
 *
 * 비용은 이미지 수와 무관하게 ANALYZE_COST_KRW(30원) 고정으로 계상한다 — 다중 이미지의
 * 토큰 증가분은 근사 오차로 간주(스펙 §분석). 정확 과금이 필요해지면 여기 개수 기반으로 조정.
 *
 * @example
 *   try {
 *     const a = await analyzeMaterial(claudeKey, [heroB64, ...auxB64s], refB64s, ac.signal)
 *     // a.recommendedPreset, a.referenceStyle 을 prompt-engine에 전달
 *   } catch (e) {
 *     // 분석 실패 — DEFAULT_PRESET_KEY로 진행
 *   }
 */
export async function analyzeMaterial(
  apiKey: string,
  materialBase64s: string[],
  referenceBase64s: string[],
  signal?: AbortSignal,
): Promise<MaterialAnalysis> {
  // 대표 1장 + 보조 최대 2장, 참고 최대 5장으로 자른다(요청 크기·비용 관리).
  const materials = materialBase64s.slice(0, 1 + MATERIAL_AUX_LIMIT)
  const references = referenceBase64s.slice(0, REFERENCE_LIMIT)

  const content: Array<Record<string, unknown>> = []
  for (const data of [...materials, ...references]) {
    content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data } })
  }
  content.push({ type: "text", text: buildUserText(materials.length, references.length) })

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
        max_tokens: 1000,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content }],
        output_config: { format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
      }),
    })
  } catch (err) {
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

  if (data.stop_reason === "refusal") throw new AiError("refusal")

  const textBlock = Array.isArray(data.content)
    ? data.content.find((b) => b?.type === "text" && typeof b.text === "string")
    : undefined
  if (!textBlock?.text) {
    throw new AiError(data.stop_reason === "max_tokens" ? "truncated" : "empty")
  }

  const raw = extractRaw(textBlock.text)
  if (!raw) {
    throw new AiError(data.stop_reason === "max_tokens" ? "truncated" : "parse")
  }
  return normalize(raw)
}

/** 프리셋 key 목록 재노출(프롬프트·검증 참조 편의). */
export { PRESET_KEYS }
