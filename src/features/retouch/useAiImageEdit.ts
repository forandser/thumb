"use client"

/**
 * AI 픽셀 편집(흰배경 누끼 · 화질 개선) 공통 훅.
 *
 * 두 기능은 "현재 보정을 구운 이미지 → 나노바나나로 편집 → 결과 dataURL을 새 소스로 교체"라는
 * 동일 메커니즘을 공유한다(스펙 §①③). 지시문만 갈아끼워 중복을 없앤다.
 * 실물 보존 원칙(과일 자체 변경 금지, 식품표시광고법)을 지시문에 고정한다.
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { AiError, type AiErrorCode } from "@/lib/ai/anthropic"
import { editImage, GEMINI_COST_KRW } from "@/lib/ai/gemini"
import { renderEdit } from "@/lib/image/render"
import { imageToAiBase64, AI_MAX_SIDE } from "@/lib/image/source"
import type { EditState } from "@/lib/image/types"

export type AiEditKind = "cutout" | "enhance"

/**
 * 흰배경 누끼 지시문 — 배경만 순백으로, 상품 픽셀(개수·색·형태·과분)은 절대 불변.
 * 모델 준수율을 위해 영어로 고정(사용자 노출 문구 아님 → i18n 대상 아님).
 */
const CUTOUT_INSTRUCTION = [
  "Replace ONLY the background of this product photo with a pure, solid, uniform pure-white background (#FFFFFF).",
  "Keep the fruit/product pixels exactly as they are: do not change their number, color, shape, ripeness, blemishes, surface bloom (the natural powdery coating), or size.",
  "Do NOT add any shadows, gradients, reflections, vignettes, props, decorations, text, watermarks, or logos.",
  "Keep the entire product fully in frame and not cropped.",
  "Return only the edited image.",
].join(" ")

/**
 * 화질 개선 지시문 — 노이즈·블러 제거와 선명도 개선만, 내용물·구도·색감·개수는 절대 불변.
 */
const ENHANCE_INSTRUCTION = [
  "Improve only the technical image quality of this product photo: reduce noise and blur and increase sharpness and clarity.",
  "Do NOT change the content, composition, framing, background, colors, color grade, white balance, brightness, or the number of items.",
  "Keep the fruit surface texture realistic and true to life. Do not smooth away real texture, and do not add or remove anything.",
  "Return only the edited image.",
].join(" ")

const INSTRUCTIONS: Record<AiEditKind, string> = {
  cutout: CUTOUT_INSTRUCTION,
  enhance: ENHANCE_INSTRUCTION,
}

export function useAiImageEdit({
  geminiKey,
  hasGeminiKey,
  onNeedKey,
  onSpend,
  onReplaced,
}: {
  geminiKey: string
  hasGeminiKey: boolean
  onNeedKey: () => void
  onSpend: (krw: number) => void
  /** 편집 결과 dataURL을 새 작업 소스로 반영(스냅샷·썸네일 갱신 포함). */
  onReplaced: (dataUrl: string, kind: AiEditKind) => Promise<void>
}) {
  const [running, setRunning] = useState<AiEditKind | null>(null)
  const [error, setError] = useState<AiErrorCode | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // 언마운트/사진 전환 시 진행 중 호출 중단(비용·경합 방지).
  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  const run = useCallback(
    async (kind: AiEditKind, rotatedSource: HTMLCanvasElement, edit: EditState) => {
      if (!hasGeminiKey) {
        onNeedKey()
        return
      }
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      setError(null)
      setRunning(kind)
      try {
        // 현재 보정(색·크롭·회전)을 구운 이미지를 전송한다(미리보기=전송 픽셀 원칙).
        const baked = renderEdit(rotatedSource, edit, {
          withAdjustments: true,
          maxPreview: AI_MAX_SIDE,
        })
        const base64 = imageToAiBase64(baked)
        const { dataUrl } = await editImage(geminiKey, base64, INSTRUCTIONS[kind], controller.signal)
        await onReplaced(dataUrl, kind)
        onSpend(GEMINI_COST_KRW)
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return
        setError(e instanceof AiError ? e.code : "unknown")
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null
          setRunning(null)
        }
      }
    },
    [hasGeminiKey, onNeedKey, geminiKey, onSpend, onReplaced],
  )

  const dismissError = useCallback(() => setError(null), [])

  return { run, running, error, dismissError }
}
