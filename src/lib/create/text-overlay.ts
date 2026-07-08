/**
 * 한글 텍스트 오버레이 — 캔버스 렌더(무료·결정적).
 *
 * 원리: 나노바나나(이미지 생성 모델)의 한글 렌더가 불안정하다는 리서치 근거에 따라,
 * 상품명·가격 같은 한글 글자는 절대 생성 모델에 맡기지 않고 여기서 캔버스에 직접 그린다.
 * 미리보기와 다운로드가 같은 함수(drawTextOverlay)를 타므로 화면=저장 픽셀이 보장된다.
 *
 * 좌표·폰트 크기는 모두 canvas.width에 대한 비율로 계산한다 → 미리보기(작은 캔버스)와
 * 다운로드(1080/1000 캔버스) 양쪽에서 같은 구도로 그려진다. Pretendard를 우선 사용한다.
 *
 * 스튜디오 클린·실물 보존 대표용 프리셋에서는 UI가 오버레이 도구 자체를 비활성화하므로
 * (플랫폼 대표이미지 글자 금지), 이 함수는 "연출컷"에서만 호출된다.
 */

/** 오버레이 위치 프리셋 4곳. */
export type OverlayPosition = "topLeft" | "topRight" | "bottomLeft" | "bottomRight"
/** 글자 크기 3단. */
export type OverlaySize = "s" | "m" | "l"
/** 글자 색 3종(외곽선은 항상 대비색으로 자동). */
export type OverlayColor = "white" | "black" | "point"

export interface TextOverlay {
  /** 상품명 1줄(주). */
  line1: string
  /** 보조 1줄(가격·뱃지). */
  line2: string
  position: OverlayPosition
  size: OverlaySize
  color: OverlayColor
}

export const DEFAULT_OVERLAY: TextOverlay = {
  line1: "",
  line2: "",
  position: "bottomLeft",
  size: "m",
  color: "white",
}

/** 포인트 색(브랜드 오렌지 — TopBar 로고와 동일 계열). */
const POINT_COLOR = "#F0654A"

/** 크기 단계 → canvas.width 대비 1줄(상품명) 폰트 비율. */
const SIZE_SCALE: Record<OverlaySize, number> = { s: 0.05, m: 0.065, l: 0.085 }

/** 글자가 하나라도 있으면 true(렌더/다운로드 반영 여부 판단). */
export function hasOverlayText(o: TextOverlay): boolean {
  return o.line1.trim().length > 0 || o.line2.trim().length > 0
}

function fillFor(color: OverlayColor): string {
  if (color === "black") return "#141821"
  if (color === "point") return POINT_COLOR
  return "#FFFFFF"
}

/** 외곽선 색 — 채움이 밝으면 어둡게, 어두우면 밝게(어떤 배경에서도 가독). */
function strokeFor(color: OverlayColor): string {
  return color === "white" ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.85)"
}

/**
 * 캔버스에 오버레이를 그린다(in-place). 좌표·폰트는 canvas.width 비율 기준이라 해상도 독립.
 * 글자가 비어 있으면 아무것도 하지 않는다.
 *
 * @example
 *   drawTextOverlay(finalSquareCanvas, overlay) // 다운로드 직전
 */
export function drawTextOverlay(canvas: HTMLCanvasElement, overlay: TextOverlay): void {
  if (!hasOverlayText(overlay)) return
  const ctx = canvas.getContext("2d")
  if (!ctx) return

  const W = canvas.width
  const H = canvas.height
  const pad = Math.round(W * 0.06)
  const size1 = Math.max(14, Math.round(W * SIZE_SCALE[overlay.size]))
  const size2 = Math.round(size1 * 0.62)
  const gap = Math.round(size1 * 0.28)

  const top = overlay.position === "topLeft" || overlay.position === "topRight"
  const left = overlay.position === "topLeft" || overlay.position === "bottomLeft"
  const align: CanvasTextAlign = left ? "left" : "right"
  const x = left ? pad : W - pad

  const line1 = overlay.line1.trim()
  const line2 = overlay.line2.trim()

  const fill = fillFor(overlay.color)
  const stroke = strokeFor(overlay.color)

  ctx.save()
  ctx.textAlign = align
  ctx.lineJoin = "round"

  // 위쪽 정렬이면 위에서부터, 아래쪽이면 아래에서부터 쌓는다.
  const drawLine = (text: string, fontPx: number, y: number) => {
    ctx.font = `800 ${fontPx}px Pretendard, sans-serif`
    ctx.textBaseline = "alphabetic"
    ctx.lineWidth = Math.max(2, fontPx / 6)
    ctx.strokeStyle = stroke
    ctx.fillStyle = fill
    ctx.strokeText(text, x, y)
    ctx.fillText(text, x, y)
  }

  if (top) {
    let y = pad + size1
    if (line1) {
      drawLine(line1, size1, y)
      y += gap + size2
    }
    if (line2) drawLine(line2, size2, y)
  } else {
    // 아래쪽: line2가 맨 아래, line1이 그 위.
    let y = H - pad
    if (line2) {
      drawLine(line2, size2, y)
      y -= size2 + gap
    }
    if (line1) drawLine(line1, size1, y)
  }
  ctx.restore()
}
