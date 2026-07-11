/**
 * 후처리 필름 질감 (v0.6 — AI 티 감소, 의존성 없이 캔버스 픽셀 조작).
 *
 * 원리: 생성 결과의 "매끈한 AI 티"(노이즈 0 → 플라스틱 질감, 균일한 배경)를 완화하려고
 * 다운로드 직전 캔버스에 (a)미세 모노크롬 그레인 + (b)약한 원형 비네팅을 얹는다.
 * 리서치 §④("불가능한 완벽함"·"반복 패턴"이 대표 AI 신호) 대응의 후처리 축이다.
 *
 * 순수 함수(캔버스 in-place). 결정적일 필요 없음(시각 노이즈)이라 Math.random을 쓴다 —
 * 브라우저 런타임 전용이라 워크플로의 결정성 제약과 무관하다.
 *
 * 적용 지점(스펙 §④): 제작 트랙 다운로드(후보 즉시 저장 + 작업대 onBeforeBlob)와
 * 미리보기(OverlayPreview) 양쪽에 동일 강도로 적용해 "화면=저장"을 지킨다.
 * 보정 트랙(누끼·화질)에는 적용하지 않는다(실사진 보정이라 불필요).
 */

/** 필름 질감 강도. off=미적용, light=기본, medium=강. */
export type FilmStrength = "off" | "light" | "medium"

/** 강도별 파라미터 — grain=그레인 진폭(±값 범위), vignette=가장자리 최대 감광 비율. */
const PARAMS: Record<Exclude<FilmStrength, "off">, { grain: number; vignette: number }> = {
  light: { grain: 7, vignette: 0.1 },
  medium: { grain: 14, vignette: 0.18 },
}

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v
}

/**
 * 캔버스에 필름 질감(그레인+비네팅)을 in-place로 적용한다.
 * strength가 off거나 컨텍스트를 못 얻으면 아무 것도 하지 않는다(방어).
 *
 * vignette=false면 비네팅(가장자리 감광)을 끄고 그레인만 얹는다 — 흰 배경 대표이미지
 * (studioClean 등)에서 모서리가 어두워져 순백 규격을 깨고 세이프 체크(후처리 전 검사)와
 * 저장본이 어긋나던 문제를 막기 위함(v0.6 결함 수정). 순백 배경은 비네팅을 제외한다.
 *
 * @example
 *   drawTextOverlay(canvas, overlay)   // 오버레이 먼저
 *   applyFilmTexture(canvas, { strength: "light" })  // 그 다음 그레인
 *   applyFilmTexture(canvas, { strength: "light", vignette: false })  // 흰 배경: 그레인만
 *   // → 이후 워터마크/ai-mark
 */
export function applyFilmTexture(
  canvas: HTMLCanvasElement,
  { strength, vignette = true }: { strength: FilmStrength; vignette?: boolean },
): void {
  if (strength === "off") return
  const w = canvas.width
  const h = canvas.height
  if (w === 0 || h === 0) return
  const ctx = canvas.getContext("2d")
  if (!ctx) return

  const { grain, vignette: vignetteAmount } = PARAMS[strength]
  const image = ctx.getImageData(0, 0, w, h)
  const d = image.data

  const cx = w / 2
  const cy = h / 2
  const maxDist = Math.hypot(cx, cy) || 1

  for (let y = 0; y < h; y++) {
    const dy = y - cy
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      // 모노크롬 그레인 — R/G/B에 동일 노이즈량을 더해 색을 왜곡하지 않고 질감만 준다.
      const n = (Math.random() - 0.5) * grain
      // 비네팅(옵션) — 중심 절반은 그대로, 바깥으로 갈수록 부드럽게(제곱) 어둡게.
      // 흰 배경 대표이미지에서는 vignette=false로 꺼서 모서리를 순백으로 유지한다.
      let vFactor = 1
      if (vignette) {
        const dist = Math.hypot(x - cx, dy) / maxDist
        const edge = dist <= 0.5 ? 0 : (dist - 0.5) / 0.5
        vFactor = 1 - vignetteAmount * edge * edge
      }
      d[i] = clamp255((d[i] + n) * vFactor)
      d[i + 1] = clamp255((d[i + 1] + n) * vFactor)
      d[i + 2] = clamp255((d[i + 2] + n) * vFactor)
    }
  }
  ctx.putImageData(image, 0, 0)
}
