"use client"

/**
 * 생성 → 검수 → 자동 재생성 상태 머신 (제작 트랙의 핵심).
 *
 * 흐름(스펙 §품질 파이프라인):
 *   1) prompt-engine으로 프롬프트를 로컬 조립(무료·1회).
 *   2) 후보 N장을 동시 2 상한 + 지수 백오프로 생성(실물 보존=editImage / 새로 그리기=generateImage).
 *   3) 후보마다 클로드 A컷 13항목 검수(원본 재료와 대조). 클로드 키가 없으면 검수 생략(뱃지 표기).
 *   4) 불합격(judgeInspection=fail)이면 retryHint를 붙여 재생성+재검수. 후보당 1회·회차 전체 2장 상한.
 *   5) 중단(Abort) 지원 — 진행 중 호출만 과금.
 *
 * 후보 목록은 이 훅이 소유한다(dataURL). STEP3의 리터치·구도 베리에이션도 여기서 gemini 호출을
 * 태워 Abort·비용을 한 곳에서 관리한다. 동시성 제어는 보정 트랙(PhotoRetouch)의 워커 풀 패턴을 승계.
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { AiError, type AiErrorCode } from "@/lib/ai/anthropic"
import { editImage, generateImage, modelForQuality, type GeminiQuality } from "@/lib/ai/gemini"
import { generateCostFor, INSPECT_COST_KRW } from "@/lib/ai/costs"
import { inspectCandidate } from "@/lib/ai/inspect"
import { appendRetryHint, buildPrompt, buildRetouchInstruction, VARIATION_INSTRUCTION } from "@/lib/create/prompt-engine"
import { imageToAiBase64 } from "@/lib/image/source"
import { generationInputBase64s, type Candidate, type PipelineConfig, type PipelinePhase } from "./create-types"

/** 후보 생성 동시 처리 상한(스펙 §구현 지침). */
const CONCURRENCY = 2
/** 429/529 자동 백오프 재시도 최대 횟수와 대기(ms). Retry-After가 있으면 그 값 우선. */
const MAX_AUTO_RETRY = 2
const BACKOFF_MS = [3000, 8000]
/** 회차 전체 자동 재생성 상한(장). 후보당은 1회. */
const REGEN_BUDGET = 2
/** 리터치 이력 보관 최대 개수(칩). */
const RETOUCH_HISTORY_MAX = 3

/** signal로 중단 가능한 sleep. abort 시 AbortError로 reject. */
function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"))
      return
    }
    const cleanup = () => {
      clearTimeout(timer)
      signal.removeEventListener("abort", onAbort)
    }
    const onAbort = () => {
      cleanup()
      reject(new DOMException("Aborted", "AbortError"))
    }
    const timer = setTimeout(() => {
      cleanup()
      resolve()
    }, ms)
    signal.addEventListener("abort", onAbort)
  })
}

/** rate_limited/overloaded면 지수 백오프로 재시도. 그 외 에러·취소는 그대로 전파. */
async function withRetry<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  let attempt = 0
  for (;;) {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError")
    try {
      return await fn(signal)
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") throw e
      const code: AiErrorCode = e instanceof AiError ? e.code : "unknown"
      if ((code === "rate_limited" || code === "overloaded") && attempt < MAX_AUTO_RETRY) {
        let wait = BACKOFF_MS[attempt] ?? 8000
        if (code === "rate_limited" && e instanceof AiError && typeof e.retryAfterMs === "number") {
          wait = e.retryAfterMs
        }
        attempt += 1
        await abortableSleep(wait, signal)
        continue
      }
      throw e
    }
  }
}

/** dataURL을 검수/편집 입력용 AI base64(접두사 없는 JPEG)로 변환. */
function dataUrlToAiBase64(dataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(imageToAiBase64(img))
    img.onerror = () => reject(new Error("decode-failed"))
    img.src = dataUrl
  })
}

/**
 * config → 생성 프롬프트. 초기 생성은 [대표, 보조…]를 함께 싣지만, 재생성은 스펙 §생성대로
 * 대표 1장만 싣는다(단일 이미지 입력 — 변경 없음). 재생성 프롬프트에서는 실제로 보조 컷이
 * 함께 가지 않으므로 다각도 지시(auxCount)도 빼서 지시와 입력을 일치시킨다.
 */
function buildConfigPrompt(config: PipelineConfig, regen = false): string {
  return buildPrompt({
    mode: config.mode,
    presetKey: config.presetKey,
    referenceStyle: config.referenceStyle,
    variety: config.variety,
    count: config.count,
    condition: config.condition,
    customPrompt: config.customPrompt,
    auxCount: regen ? 0 : config.auxBase64s.length,
  })
}

export function useCreatePipeline({
  claudeKey,
  geminiKey,
  hasClaudeKey,
  hasGeminiKey,
  onSpend,
}: {
  claudeKey: string
  geminiKey: string
  hasClaudeKey: boolean
  hasGeminiKey: boolean
  onSpend: (krw: number) => void
}) {
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [phase, setPhase] = useState<PipelinePhase>("idle")
  /** 리터치·베리에이션 등 후속 작업 에러(코드별 i18n). */
  const [opError, setOpError] = useState<AiErrorCode | null>(null)

  // 진행 중 모든 호출을 한 번에 끊는 컨트롤러(중단·언마운트·사진 전환).
  const abortRef = useRef<AbortController | null>(null)
  // 현재 회차 품질 티어. 베리에이션·리터치는 config를 받지 않으므로, start()가 세운 이 값으로
  // 같은 티어의 모델·단가를 이어 쓴다(생성과 후속 편집의 품질을 일치시킴 — 스펙 §①).
  const qualityRef = useRef<GeminiQuality>("default")
  // "후보 N" 라벨 카운터(베리에이션 추가에도 이어서 증가).
  const indexRef = useRef(0)
  const idRef = useRef(0)
  const nextId = () => `c${++idRef.current}-${Date.now()}`

  useEffect(() => {
    return () => abortRef.current?.abort()
  }, [])

  const patch = useCallback((id: string, partial: Partial<Candidate>) => {
    setCandidates((prev) => prev.map((c) => (c.id === id ? { ...c, ...partial } : c)))
  }, [])

  /**
   * 설정·모드에 맞는 1장 생성(재생성/베리에이션은 별도 prompt 전달).
   * singleInput=true면 실물 보존이라도 대표 1장만 싣는다(재생성 경로 — 스펙 §생성 단일 이미지).
   */
  const genOne = useCallback(
    (config: PipelineConfig, prompt: string, signal: AbortSignal, singleInput = false): Promise<string> => {
      // 실물 보존 초기 생성은 [대표, 보조…]를 함께 실어 편집(레퍼런스 픽셀은 구조적으로 미포함).
      // 재생성은 대표 1장만 실어 v0.4와 동일한 단일 이미지 입력을 유지한다.
      // 품질 티어 → 모델(기본 3.1 Flash / 최고 3 Pro). 재생성도 같은 티어를 유지한다.
      const model = modelForQuality(config.quality)
      const call =
        config.mode === "preserve"
          ? editImage(
              geminiKey,
              singleInput ? config.materialBase64 : generationInputBase64s(config),
              prompt,
              signal,
              model,
            )
          : generateImage(geminiKey, prompt, signal, model)
      return call.then((r) => r.dataUrl)
    },
    [geminiKey],
  )

  /** 후보 1장 검수 → 결과 반영. verdict fail이고 예산 남으면 1회 재생성+재검수. */
  const inspectAndMaybeRegen = useCallback(
    async (
      config: PipelineConfig,
      id: string,
      dataUrl: string,
      signal: AbortSignal,
      reserveRegen: () => boolean,
    ) => {
      // 클로드 키 없으면 검수 생략(셀러가 눈으로 판단).
      if (!hasClaudeKey) {
        patch(id, { status: "done", inspectSkipped: true, inspectError: false })
        return
      }
      // 재검수 시작 — 직전 검수 오류 뱃지를 지운다(수동 재생성 후 성공하면 정상 뱃지로 복귀).
      patch(id, { status: "inspecting", inspectError: false })
      // 검수·자동 재생성 단계의 오류는 "생성 실패"와 분리한다. 생성은 이미 성공·과금됐으므로
      // 검수 호출이 흔들려도(네트워크·서버 오류·응답 파싱 실패 등) 후보를 폐기하지 않고
      // status:'done' + inspectError 뱃지로 살려 셀러가 선택할 수 있게 둔다. 검수는 보조·이중
      // 안전장치이기 때문(스펙 §품질 파이프라인). 취소(Abort)만 상위로 전파해 전체를 멈춘다.
      try {
        const candB64 = await dataUrlToAiBase64(dataUrl)
        const r = await withRetry(
          (s) => inspectCandidate(claudeKey, config.materialBase64, candB64, s),
          signal,
        )
        onSpend(INSPECT_COST_KRW)
        patch(id, { inspection: r, status: "done" })

        // 불합격 + 예산 확보 성공 시에만 재생성(후보당 1회는 reserveRegen 호출 전 status로 보장).
        if (r.verdict === "fail" && reserveRegen()) {
          patch(id, { status: "regenerating", regenerated: true })
          // 재생성은 대표 1장 단일 입력(스펙 §생성) — 프롬프트도 다각도 지시 없이 조립한다.
          const retryPrompt = appendRetryHint(buildConfigPrompt(config, true), r.retryHint)
          const dataUrl2 = await withRetry((s) => genOne(config, retryPrompt, s, true), signal)
          onSpend(generateCostFor(config.quality))
          patch(id, { dataUrl: dataUrl2, status: "inspecting" })
          const candB642 = await dataUrlToAiBase64(dataUrl2)
          const r2 = await withRetry(
            (s) => inspectCandidate(claudeKey, config.materialBase64, candB642, s),
            signal,
          )
          onSpend(INSPECT_COST_KRW)
          patch(id, { inspection: r2, status: "done" })
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") throw e
        // 검수/재생성 실패 — 생성된 이미지·선택은 유지, 뱃지로만 표시.
        patch(id, { status: "done", inspectError: true })
      }
    },
    [claudeKey, hasClaudeKey, onSpend, patch, genOne],
  )

  /**
   * 파이프라인 시작. 후보 N 슬롯을 만들고 동시 2 워커로 생성→검수→(재생성)을 돌린다.
   * 자동 재생성 예산은 회차 전체 REGEN_BUDGET장으로 공유(체크·감소가 동기 실행이라 원자적).
   */
  const start = useCallback(
    async (config: PipelineConfig) => {
      if (!hasGeminiKey) return
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      const signal = controller.signal
      setOpError(null)
      // 이 회차의 품질 티어를 고정 — 이후 베리에이션·리터치가 같은 티어를 이어 쓴다.
      qualityRef.current = config.quality

      const slots: Candidate[] = Array.from({ length: config.candidateCount }, () => ({
        id: nextId(),
        index: ++indexRef.current,
        kind: "generated" as const,
        status: "generating" as const,
        regenerated: false,
      }))
      setCandidates(slots)
      setPhase("running")

      const prompt = buildConfigPrompt(config)

      let regenRemaining = REGEN_BUDGET
      // 동기 실행(체크→감소 사이에 await 없음)이라 워커 경합에도 안전.
      const reserveRegen = () => {
        if (regenRemaining > 0) {
          regenRemaining -= 1
          return true
        }
        return false
      }

      const runOne = async (slot: Candidate) => {
        try {
          const dataUrl = await withRetry((s) => genOne(config, prompt, s), signal)
          onSpend(generateCostFor(config.quality))
          patch(slot.id, { dataUrl, status: "done" })
          await inspectAndMaybeRegen(config, slot.id, dataUrl, signal, reserveRegen)
        } catch (e) {
          if (e instanceof DOMException && e.name === "AbortError") return
          patch(slot.id, {
            status: "failed",
            errorCode: e instanceof AiError ? e.code : "unknown",
          })
        }
      }

      const queue = [...slots]
      const worker = async () => {
        while (queue.length) {
          if (signal.aborted) return
          const slot = queue.shift()
          if (!slot) return
          await runOne(slot)
        }
      }
      await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()))

      if (abortRef.current === controller) abortRef.current = null
      setPhase(signal.aborted ? "canceled" : "done")
    },
    [hasGeminiKey, onSpend, patch, genOne, inspectAndMaybeRegen],
  )

  /** 단일 후보 수동 재생성("다시 생성") — 같은 프롬프트로 생성+검수(예산과 무관). */
  const regenerateOne = useCallback(
    async (config: PipelineConfig, id: string) => {
      if (!hasGeminiKey) return
      const controller = abortRef.current ?? new AbortController()
      abortRef.current = controller
      const signal = controller.signal
      // 재생성은 대표 1장만 입력하는 단일 이미지 경로(스펙 §생성) — 프롬프트도 다각도 지시 없이 조립.
      const prompt = buildConfigPrompt(config, true)
      patch(id, { status: "generating", errorCode: undefined })
      try {
        const dataUrl = await withRetry((s) => genOne(config, prompt, s, true), signal)
        onSpend(generateCostFor(config.quality))
        // inspectSkipped도 함께 초기화한다 — 이 재생성분은 inspectAndMaybeRegen이 다시 검수하므로,
        // 이전 '검수 생략'(클로드 키 없던 시점) 뱃지를 지워 새 pass/fail 결과가 가려지지 않게 한다.
        patch(id, { dataUrl, status: "done", regenerated: false, inspection: undefined, inspectSkipped: false })
        // 수동 재생성은 예산과 무관하게 자동 재생성을 허용하지 않는다(reserveRegen: 항상 false).
        await inspectAndMaybeRegen(config, id, dataUrl, signal, () => false)
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return
        patch(id, { status: "failed", errorCode: e instanceof AiError ? e.code : "unknown" })
      }
    },
    [hasGeminiKey, onSpend, patch, genOne, inspectAndMaybeRegen],
  )

  /**
   * 구도 베리에이션 — 확정본을 입력으로 앵글·거리만 변형 N장. 재검수 없음(A컷 신뢰 승계).
   * 결과는 후보 목록에 "베리에이션" 뱃지로 추가한다.
   */
  const runVariation = useCallback(
    async (sourceDataUrl: string, n: number) => {
      if (!hasGeminiKey) return
      const controller = abortRef.current ?? new AbortController()
      abortRef.current = controller
      const signal = controller.signal
      setOpError(null)

      const slots: Candidate[] = Array.from({ length: n }, () => ({
        id: nextId(),
        index: ++indexRef.current,
        kind: "variation" as const,
        status: "generating" as const,
        regenerated: false,
        inspectSkipped: true,
      }))
      setCandidates((prev) => [...prev, ...slots])

      let base64: string
      try {
        base64 = await dataUrlToAiBase64(sourceDataUrl)
      } catch {
        slots.forEach((s) => patch(s.id, { status: "failed", errorCode: "unknown" }))
        return
      }

      const queue = [...slots]
      const worker = async () => {
        while (queue.length) {
          if (signal.aborted) return
          const slot = queue.shift()
          if (!slot) return
          try {
            const model = modelForQuality(qualityRef.current)
            const { dataUrl } = await editImage(geminiKey, base64, VARIATION_INSTRUCTION, signal, model)
            onSpend(generateCostFor(qualityRef.current))
            patch(slot.id, { dataUrl, status: "done" })
          } catch (e) {
            if (e instanceof DOMException && e.name === "AbortError") return
            const code: AiErrorCode = e instanceof AiError ? e.code : "unknown"
            patch(slot.id, { status: "failed", errorCode: code })
            setOpError(code)
          }
        }
      }
      await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()))
    },
    [hasGeminiKey, geminiKey, onSpend, patch],
  )

  /** 대화형 리터치 — 선택 후보를 지시대로 편집하고 이미지를 교체(되돌리기용 이력 보관). */
  const retouchCandidate = useCallback(
    async (id: string, instruction: string): Promise<boolean> => {
      if (!hasGeminiKey) return false
      const target = candidates.find((c) => c.id === id)
      if (!target?.dataUrl) return false
      const controller = abortRef.current ?? new AbortController()
      abortRef.current = controller
      const signal = controller.signal
      setOpError(null)
      const prev = target.dataUrl
      patch(id, { retouching: true })
      try {
        const base64 = await dataUrlToAiBase64(prev)
        const model = modelForQuality(qualityRef.current)
        // 셀러 자유 문장을 실물 보존 래퍼로 감싸 전달한다(개수·색·형태·과분 불변 + 글자 금지 +
        // photoreal). Step2 customPrompt와 동일 정책 — 다른 픽셀 편집 경로의 실물 보존 불변식과 일치.
        const wrapped = buildRetouchInstruction(instruction)
        const { dataUrl } = await editImage(geminiKey, base64, wrapped, signal, model)
        onSpend(generateCostFor(qualityRef.current))
        const history = [prev, ...(target.retouchHistory ?? [])].slice(0, RETOUCH_HISTORY_MAX)
        patch(id, { dataUrl, retouchHistory: history, retouching: false })
        return true
      } catch (e) {
        patch(id, { retouching: false })
        if (e instanceof DOMException && e.name === "AbortError") return false
        setOpError(e instanceof AiError ? e.code : "unknown")
        return false
      }
    },
    [hasGeminiKey, geminiKey, candidates, onSpend, patch],
  )

  /** 리터치 1단계 되돌리기 — 직전 이미지로 복원. */
  const revertRetouch = useCallback(
    (id: string) => {
      setCandidates((prev) =>
        prev.map((c) => {
          if (c.id !== id || !c.retouchHistory?.length) return c
          const [last, ...rest] = c.retouchHistory
          return { ...c, dataUrl: last, retouchHistory: rest }
        }),
      )
    },
    [],
  )

  const cancel = useCallback(() => {
    abortRef.current?.abort()
    setPhase("canceled")
  }, [])

  const reset = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setCandidates([])
    setPhase("idle")
    setOpError(null)
    indexRef.current = 0
  }, [])

  const dismissOpError = useCallback(() => setOpError(null), [])

  return {
    candidates,
    phase,
    opError,
    start,
    regenerateOne,
    runVariation,
    retouchCandidate,
    revertRetouch,
    cancel,
    reset,
    dismissOpError,
  }
}
