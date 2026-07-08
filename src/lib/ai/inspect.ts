/**
 * 클로드 A컷 13항목 검수 (BYOK, 브라우저 직접 호출).
 *
 * 원리: 생성 후보가 "실제 사진처럼·실물 그대로"인지 원본 재료 사진과 대조 채점한다.
 * 비전 1콜에 [원본 재료, 생성 후보] 2이미지를 넣고, 리서치 §⑤(a) 13항목(ko.create.inspectItems
 * 원문)을 기준으로 항목별 pass/reason을 받는다. 검수는 실물 신뢰의 이중 안전장치라 비용 상향(75원).
 *
 * 불합격 판정은 모델의 verdict를 신뢰하지 않고 항목 결과로 **로컬 순수 함수(judgeInspection)**가
 * 최종 결정한다 — UI 뱃지·자동 재생성·테스트가 같은 규칙을 쓰도록. 규칙(스펙 §품질 파이프라인 3):
 * fail이 2개 이상, 또는 #3(개수·배열)·#4(품종 정합)·#6(채도 절제) 중 하나라도 fail이면 불합격.
 *
 * anthropic.ts 패턴(헤더·에러 매트릭스·json_schema·JSON 추출)을 그대로 승계한다.
 */
import { AI_MODEL, AiError, type AiErrorCode } from "./anthropic"
import { t } from "@/lib/i18n"

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
const ANTHROPIC_VERSION = "2023-06-01"

/** 검수 항목 총 개수(=13). ko.create.inspectItems 배열 길이를 단일 출처로 삼는다. */
export const INSPECT_ITEM_COUNT = t.create.inspectItems.length

/**
 * 무관용 항목(하나라도 fail이면 불합격). 실물 신뢰 3항목:
 * #3 과일 개수·배열, #4 품종 정합, #6 채도 절제.
 */
export const CRITICAL_ITEM_IDS: readonly number[] = [3, 4, 6]

/** fail 개수가 이 값 이상이면 불합격. */
export const FAIL_THRESHOLD = 2

export interface InspectionItemResult {
  /** 1..13 (ko.create.inspectItems 배열 인덱스+1). */
  id: number
  pass: boolean
  /** 판정 사유(한국어 한 줄) — 실패 항목 툴팁에 노출. */
  reason: string
}

export interface InspectionResult {
  items: InspectionItemResult[]
  /** 최종 판정 — 항상 judgeInspection(items) 결과(모델 verdict가 아님). */
  verdict: "pass" | "fail"
  /** 재생성 시 프롬프트에 덧붙일 개선 힌트(모델 제공). */
  retryHint: string
}

/**
 * 불합격 판정 순수 함수 — UI·자동 재생성·테스트 공용.
 * fail ≥ FAIL_THRESHOLD, 또는 CRITICAL_ITEM_IDS 중 하나라도 fail이면 "fail".
 * 항목이 비어 있으면(검수 자체 실패 방어) 보수적으로 "fail".
 */
export function judgeInspection(items: readonly InspectionItemResult[]): "pass" | "fail" {
  if (items.length === 0) return "fail"
  let failCount = 0
  for (const it of items) {
    if (!it.pass) {
      failCount++
      if (CRITICAL_ITEM_IDS.includes(it.id)) return "fail"
    }
  }
  return failCount >= FAIL_THRESHOLD ? "fail" : "pass"
}

/** 통과 항목 수(뱃지 "A컷 검수 {pass}/{total}"용). */
export function passCount(items: readonly InspectionItemResult[]): number {
  return items.reduce((n, it) => n + (it.pass ? 1 : 0), 0)
}

/** 불합격에 기여한 항목만(툴팁 나열용): critical fail 우선, 그 외 fail. */
export function failedItems(items: readonly InspectionItemResult[]): InspectionItemResult[] {
  return items.filter((it) => !it.pass)
}

// 13항목을 "id. 설명" 목록으로 프롬프트에 삽입(ko.create.inspectItems 원문 그대로).
const ITEMS_BLOCK = t.create.inspectItems.map((desc, i) => `${i + 1}. ${desc}`).join("\n")

const SYSTEM_PROMPT = `당신은 신선식품(과일) 상세페이지 대표 컷의 품질을 검수하는 엄격한 심사관입니다.
첫 번째 이미지는 셀러가 올린 "원본 재료 사진", 두 번째 이미지는 그 재료로 만든 "생성 후보"입니다.
아래 13개 항목을 각각 pass(true)/fail(false)로 채점하고, 각 항목에 판정 사유를 한국어 한 줄로 쓰세요.

핵심 원칙:
- 후보의 과일이 원본 재료와 "실물로 일치"하는지가 최우선입니다. 특히 개수·배열(#3), 품종 형태·색(#4), 과채도 절제(#6)는 무관용으로 봅니다.
- "실제 사진처럼" 보이는지도 봅니다(플라스틱 질감·과채도·반복 패턴·불가능한 완벽함은 fail).
- 애매하면 셀러 보호를 위해 보수적으로 fail 쪽으로 판단하세요.

검수 항목:
${ITEMS_BLOCK}

또한 개선 힌트(retryHint)를 한 줄로 쓰세요. 불합격 시 재생성 프롬프트에 붙일 구체적 지시입니다
(예: "과일 개수를 5개로 정확히, 흰 접시는 순백으로, 채도를 낮춰 자연스럽게").
items는 id 1부터 ${t.create.inspectItems.length}까지 모두 포함하세요. JSON으로만 답하세요.`

const USER_TEXT = `첫 번째=원본 재료, 두 번째=생성 후보. 13개 항목을 채점해 JSON으로만 답하세요.`

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "number" },
          pass: { type: "boolean" },
          reason: { type: "string" },
        },
        required: ["id", "pass", "reason"],
        additionalProperties: false,
      },
    },
    verdict: { type: "string" },
    retryHint: { type: "string" },
  },
  required: ["items", "verdict", "retryHint"],
  additionalProperties: false,
} as const

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

interface RawInspection {
  items?: unknown
  retryHint?: unknown
}

function extractRaw(text: string): RawInspection | null {
  const tryParse = (s: string): RawInspection | null => {
    try {
      const o = JSON.parse(s)
      if (o && typeof o === "object") return o as RawInspection
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

/**
 * 원시 items를 id 1..13 완전한 배열로 정규화. 모델이 빠뜨린 id는 fail(보수적)로 채우고,
 * 범위를 벗어난 id는 버린다. 이렇게 해야 judgeInspection·뱃지 계산이 항상 13항목 기준으로 안정적.
 */
function normalizeItems(raw: unknown): InspectionItemResult[] {
  const byId = new Map<number, InspectionItemResult>()
  if (Array.isArray(raw)) {
    for (const r of raw) {
      const id = typeof r?.id === "number" ? Math.round(r.id) : NaN
      if (!Number.isInteger(id) || id < 1 || id > INSPECT_ITEM_COUNT) continue
      byId.set(id, {
        id,
        pass: r?.pass === true,
        reason: typeof r?.reason === "string" ? r.reason : "",
      })
    }
  }
  const items: InspectionItemResult[] = []
  for (let id = 1; id <= INSPECT_ITEM_COUNT; id++) {
    items.push(byId.get(id) ?? { id, pass: false, reason: "검수 항목 응답이 누락됐어요." })
  }
  return items
}

/**
 * 후보 1장 검수. base64는 접두사 없는 JPEG(줄바꿈 없음).
 * materialBase64=원본 재료, candidateBase64=생성 후보. 실패는 AiError, 취소는 그대로 전파.
 * 반환 verdict는 항상 judgeInspection(items) — 모델 판정을 로컬 규칙으로 덮어쓴다.
 *
 * @example
 *   const r = await inspectCandidate(claudeKey, matB64, candB64, signal)
 *   if (r.verdict === "fail") regenerate(appendRetryHint(prompt, r.retryHint))
 *   const badge = fmt(t.create.inspectBadge, { pass: passCount(r.items), total: INSPECT_ITEM_COUNT })
 */
export async function inspectCandidate(
  apiKey: string,
  materialBase64: string,
  candidateBase64: string,
  signal?: AbortSignal,
): Promise<InspectionResult> {
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
        // 응답은 13항목 각각 한국어 reason + verdict + retryHint 구조라 진단(800)·분석(1000)보다
        // 출력량이 구조적으로 크다. 한글은 토큰 밀도가 높아 2000이면 잘림(max_tokens→truncated)
        // 위험이 있어 여유를 둔다. 잘리면 후보가 '검수 못 마침'으로 처리돼 재생성을 유발한다.
        max_tokens: 3000,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: "image/jpeg", data: materialBase64 } },
              { type: "image", source: { type: "base64", media_type: "image/jpeg", data: candidateBase64 } },
              { type: "text", text: USER_TEXT },
            ],
          },
        ],
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

  const items = normalizeItems(raw.items)
  return {
    items,
    verdict: judgeInspection(items),
    retryHint: typeof raw.retryHint === "string" ? raw.retryHint : "",
  }
}
