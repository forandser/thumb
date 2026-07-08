/**
 * Gemini 2.5 Flash Image("나노바나나") 이미지 편집 어댑터 (BYOK, 브라우저 직접 호출).
 *
 * 원리: 클로드 진단(anthropic.ts)과 달리 여기서는 "픽셀을 새로 굽는" 편집이다.
 * 현재 보정을 구운 이미지를 보내고, 지시(instruction)에 따라 편집된 이미지를 dataURL로 돌려받는다.
 * 호출부(누끼·화질 개선)는 instruction만 갈아끼워 재사용한다 — v0.4 생성 트랙까지 같은 시그니처.
 *
 * fdp 사이트의 검증된 gemini-flash-image.ts 요청/응답 형식을 승계하되,
 * 에러 매트릭스는 thumb anthropic.ts의 AiError 코드 체계를 그대로 재사용해 i18n을 공유한다.
 *
 * 정적 사이트라 서버가 없다 — 키는 사용자 브라우저에서 직접 Google로만 간다.
 */
import { AiError, type AiErrorCode } from "./anthropic"

/** 모델 ID(별명 "나노바나나"). */
export const GEMINI_IMAGE_MODEL = "gemini-2.5-flash-image"
const API_BASE = "https://generativelanguage.googleapis.com/v1beta"

/** 장당 나노바나나 호출 추정 비용(KRW, 기획 확정치 ~55원). 비용 트래커·버튼 라벨 공용. */
export const GEMINI_COST_KRW = 55

interface GeminiErrorBody {
  error?: {
    code?: number
    message?: string
    status?: string
    /** google.rpc.RetryInfo 등 구조화 세부정보(429의 retryDelay가 여기 담긴다). */
    details?: Array<{ "@type"?: string; retryDelay?: string }>
  }
}

interface GeminiResponse {
  candidates?: Array<{
    finishReason?: string
    content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string } }> }
  }>
  promptFeedback?: { blockReason?: string }
}

/** finishReason이 아래에 해당하면 안전 필터 거절로 취급. */
const SAFETY_FINISH = new Set(["SAFETY", "IMAGE_SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST"])

function isGeoMessage(combined: string): boolean {
  return (
    combined.includes("region") ||
    combined.includes("country") ||
    combined.includes("location") ||
    combined.includes("unsupported")
  )
}

/** HTTP 상태 + 에러 본문 → AiErrorCode(anthropic.ts 코드 체계 공유). */
function classifyStatus(status: number, body: GeminiErrorBody | null): AiErrorCode {
  const msg = (body?.error?.message ?? "").toLowerCase()
  const st = (body?.error?.status ?? "").toLowerCase()
  const combined = `${msg} ${st}`
  if (status === 400) {
    if (combined.includes("api key not valid") || combined.includes("api_key_invalid")) {
      return "invalid_key"
    }
    if (isGeoMessage(combined)) return "geo_blocked"
    return "unknown"
  }
  if (status === 401 || status === 403) return isGeoMessage(combined) ? "geo_blocked" : "invalid_key"
  if (status === 429) return "rate_limited"
  if (status === 500 || status === 503) return "overloaded"
  return "unknown"
}

/** 429 응답의 Retry-After 헤더를 밀리초로(초 정수 또는 HTTP 날짜). 없으면 undefined. */
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

/**
 * Google 429는 재시도 지연을 Retry-After 헤더가 아니라 응답 본문의
 * error.details[]{ "@type": ".../google.rpc.RetryInfo", retryDelay: "38s" }로 돌려준다.
 * 헤더가 없을 때의 대체값으로 이 RetryInfo를 밀리초로 파싱한다.
 */
function parseRetryInfo(body: GeminiErrorBody | null): number | undefined {
  const details = body?.error?.details
  if (!Array.isArray(details)) return undefined
  for (const d of details) {
    if (typeof d?.["@type"] === "string" && d["@type"].includes("RetryInfo")) {
      const m = typeof d.retryDelay === "string" ? d.retryDelay.match(/^([\d.]+)s$/) : null
      if (m) {
        const secs = Number(m[1])
        if (Number.isFinite(secs) && secs >= 0) return Math.round(secs * 1000)
      }
    }
  }
  return undefined
}

/**
 * 이미지 1장 편집. base64Jpeg는 접두사 없는 JPEG(줄바꿈 없음), instruction은 편집 지시문.
 * 성공 시 편집된 이미지의 dataURL을 반환한다.
 * 실패는 AiError(code)로 던진다. 취소(AbortError)는 그대로 전파해 호출부가 구분한다.
 */
export async function editImage(
  apiKey: string,
  base64Jpeg: string,
  instruction: string,
  signal?: AbortSignal,
): Promise<{ dataUrl: string }> {
  let res: Response
  try {
    res = await fetch(
      `${API_BASE}/models/${GEMINI_IMAGE_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        signal,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { text: instruction },
                { inline_data: { mime_type: "image/jpeg", data: base64Jpeg } },
              ],
            },
          ],
          generationConfig: { responseModalities: ["IMAGE"] },
        }),
      },
    )
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err
    throw new AiError("network")
  }

  if (!res.ok) {
    let body: GeminiErrorBody | null = null
    try {
      body = (await res.json()) as GeminiErrorBody
    } catch {
      /* 본문 없거나 JSON 아님 */
    }
    const retryMs = res.status === 429 ? (parseRetryAfter(res) ?? parseRetryInfo(body)) : undefined
    throw new AiError(classifyStatus(res.status, body), retryMs)
  }

  let data: GeminiResponse
  try {
    data = (await res.json()) as GeminiResponse
  } catch {
    throw new AiError("parse")
  }

  const cand = Array.isArray(data.candidates) ? data.candidates[0] : undefined
  const finish = (cand?.finishReason ?? "").toUpperCase()
  if (SAFETY_FINISH.has(finish)) throw new AiError("refusal")

  const parts = cand?.content?.parts
  const inline = Array.isArray(parts)
    ? parts.find((p) => p?.inlineData?.data)?.inlineData
    : undefined
  if (!inline?.data) {
    // 프롬프트 차단(blockReason)이면 거절, 아니면 빈 응답.
    throw new AiError(data.promptFeedback?.blockReason ? "refusal" : "empty")
  }

  return { dataUrl: `data:${inline.mimeType ?? "image/png"};base64,${inline.data}` }
}
