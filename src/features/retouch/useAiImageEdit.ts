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

export type AiEditKind = "cutout" | "enhance" | "spot" | "declutter" | "relight"

/**
 * 보정 리터치 3종 공통 꼬리말(스펙 §②) — AI 티(플라스틱·CGI)를 억제하고 실사진 질감을 유지시킨다.
 * 3종 지시문 끝에 붙여 "진짜 사진"임을 반복 강조한다.
 */
const PHOTOREAL_TAIL =
  "photorealistic, looks like a real photograph, natural texture, no plastic/CGI look, no added objects or text."

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

/**
 * 잡티·이물 제거(spot) — 표면·배경의 먼지·이물·잔티만 지우고, 과일 실물은 완전히 보존한다.
 * 과분(자연 분)·자연 반점 등 진짜 질감을 인위적으로 매끈하게 지우지 않도록 명시한다.
 */
const SPOT_INSTRUCTION = [
  "Remove ONLY dust, lint, stray fibers, small debris, and tiny surface specks from this product photo (on the fruit surface and the background).",
  "Keep the fruit exactly as it is: do not change its number, color, shape, ripeness, size, natural blemishes, the surface bloom (natural powdery coating), or its real texture.",
  "Do not smooth away or fabricate texture, and do not add or remove any objects.",
  PHOTOREAL_TAIL,
  "Return only the edited image.",
].join(" ")

/**
 * 배경 정리(declutter) — 배경의 어수선한 요소만 깔끔히 정돈하고, 과일은 그대로 둔다.
 * 인위적(스튜디오·합성) 배경을 새로 만들지 않도록 못박아 실사진 느낌을 지킨다.
 */
const DECLUTTER_INSTRUCTION = [
  "Tidy up ONLY the background of this product photo: remove distracting clutter and stray objects and make the background clean and calm.",
  "Keep the fruit/product pixels exactly as they are (number, color, shape, ripeness, size, texture) and keep it fully in frame.",
  "Do NOT invent an artificial or studio-composited background; keep the existing background's real look and lighting, just cleaner.",
  PHOTOREAL_TAIL,
  "Return only the edited image.",
].join(" ")

/**
 * 그림자·역광 보정(relight) — 강한 그림자·역광만 완화해 고른 조명으로, 과일 색·형태는 불변.
 * 자연광 사진처럼 보이게 하되 인위적 스튜디오 라이팅으로 바꾸지 않는다.
 */
const RELIGHT_INSTRUCTION = [
  "Even out ONLY harsh shadows and backlight in this product photo so the lighting is soft and evenly balanced.",
  "Keep the fruit's color, shape, number, size, and surface texture unchanged; do not recolor or reshape anything.",
  "Make it look like natural daylight photography, not artificial studio relighting.",
  PHOTOREAL_TAIL,
  "Return only the edited image.",
].join(" ")

const INSTRUCTIONS: Record<AiEditKind, string> = {
  cutout: CUTOUT_INSTRUCTION,
  enhance: ENHANCE_INSTRUCTION,
  spot: SPOT_INSTRUCTION,
  declutter: DECLUTTER_INSTRUCTION,
  relight: RELIGHT_INSTRUCTION,
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
