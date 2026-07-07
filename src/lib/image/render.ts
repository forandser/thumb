/**
 * 보정 렌더 파이프라인 (미리보기·다운로드 공용).
 *
 * 순서: [rotate90 소스] → [미세각도 회전(수평 보정) + cover 확대로 프레임 채움]
 *      → [크롭] → [밝기/대비/채도(ctx.filter 또는 픽셀 폴백)] → [색온도 채널 게인].
 *
 * 크롭은 "수평 보정까지 끝난 화면"을 기준으로 자른다(사용자가 크롭 작업대에서 본 그대로).
 * 미리보기와 다운로드가 같은 함수를 타므로 픽셀 연산이 동일하다. 다만 다운로드는
 * 정사각(forceSquare)으로 가운데를 한 번 더 자르므로, 크롭이 정사각이 아니면
 * 미리보기(전체)와 저장(정사각) 프레이밍이 달라질 수 있다 — 미리보기의 1:1 가이드로 안내한다.
 */
import type { Crop, EditState } from "./types"

export type Source = HTMLImageElement | HTMLCanvasElement

function sourceW(src: Source): number {
  return src instanceof HTMLImageElement ? src.naturalWidth : src.width
}
function sourceH(src: Source): number {
  return src instanceof HTMLImageElement ? src.naturalHeight : src.height
}

/**
 * 원본 이미지에 90° 회전을 구워 캔버스로 만든다.
 * 호출부는 (이미지, rotate90) 기준으로 메모이즈해 슬라이더 드래그마다 재계산하지 않는다.
 */
export function makeRotatedSource(src: Source, rotate90: number): HTMLCanvasElement {
  const turns = ((rotate90 % 4) + 4) % 4
  const w = sourceW(src)
  const h = sourceH(src)
  const swap = turns === 1 || turns === 3
  const canvas = document.createElement("canvas")
  canvas.width = swap ? h : w
  canvas.height = swap ? w : h
  const ctx = canvas.getContext("2d")
  if (!ctx) return canvas
  ctx.save()
  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate((turns * Math.PI) / 2)
  ctx.drawImage(src, -w / 2, -h / 2, w, h)
  ctx.restore()
  return canvas
}

/** 밝기/대비/채도 → ctx.filter(=CSS filter) 문자열. 색온도는 별도 처리. */
export function buildFilterString(state: EditState): string {
  const b = Math.max(0, 1 + state.brightness / 100)
  const c = Math.max(0, 1 + state.contrast / 100)
  const s = Math.max(0, 1 + state.saturation / 100)
  return `brightness(${round(b)}) contrast(${round(c)}) saturate(${round(s)})`
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000
}

/** 밝기/대비/채도 중 하나라도 기본값이 아닌지. */
function hasBcs(state: EditState): boolean {
  return state.brightness !== 0 || state.contrast !== 0 || state.saturation !== 0
}

/**
 * ctx.filter(캔버스 CSS 필터) 지원 여부 감지 (Safari 17 미만은 미지원 → no-op).
 * 임시 1px 캔버스에 brightness(2)를 적용해 실제로 밝아지는지 픽셀로 확인하고 캐시한다.
 */
let filterSupport: boolean | null = null
export function supportsCtxFilter(): boolean {
  if (filterSupport !== null) return filterSupport
  try {
    if (typeof document === "undefined") {
      filterSupport = false
      return false
    }
    const c = document.createElement("canvas")
    c.width = 1
    c.height = 1
    const ctx = c.getContext("2d")
    if (!ctx) {
      filterSupport = false
      return false
    }
    ctx.fillStyle = "rgb(100,100,100)"
    ctx.filter = "brightness(2)"
    ctx.fillRect(0, 0, 1, 1)
    // 지원되면 100 → 200 근처, 미지원이면 필터가 무시돼 100 그대로.
    filterSupport = ctx.getImageData(0, 0, 1, 1).data[0] > 150
  } catch {
    filterSupport = false
  }
  return filterSupport
}

/** 회전한 rect가 w×h 프레임을 빈틈없이 덮도록 하는 최소 확대율. */
function coverScale(w: number, h: number, angle: number): number {
  const c = Math.abs(Math.cos(angle))
  const s = Math.abs(Math.sin(angle))
  const scaleW = (w * c + h * s) / w
  const scaleH = (w * s + h * c) / h
  return Math.max(scaleW, scaleH)
}

/** 크롭 rect(정규화)를 수평 보정된 프레임(rw×rh) 픽셀 좌표로 변환. */
function cropToPixels(
  crop: Crop | null,
  rw: number,
  rh: number,
): { sx: number; sy: number; sw: number; sh: number } {
  const c = crop ?? { x: 0, y: 0, w: 1, h: 1 }
  return { sx: c.x * rw, sy: c.y * rh, sw: c.w * rw, sh: c.h * rh }
}

export interface RenderOptions {
  /** 색·밝기·색온도 적용 여부. false면 기하(크롭/회전)만 — Before(보정 전) 비교용. */
  withAdjustments: boolean
  /** 정사각 강제 출력(다운로드 프리셋). 크롭이 정사각이 아니면 가운데를 잘라 정사각으로. */
  forceSquare?: boolean
  /** 정사각 출력 변 길이(px). forceSquare일 때 필수. */
  targetSize?: number
  /** 미리보기 최대 변 길이(px, DPR 반영). forceSquare가 아닐 때 사용. */
  maxPreview?: number
}

/**
 * 편집 상태를 새 캔버스에 렌더한다.
 *
 * 좌표계: 크롭은 "rotate90 + 미세각도(수평 보정)까지 적용된 프레임"(= rw×rh) 기준이다.
 * 따라서 한 번의 합성 변환으로 [출력←크롭 rect] 매핑 위에 [수평 보정 회전]을 얹어
 * 중간 캔버스 없이 곧바로 굽는다(수평 보정 후 자른 화면 == 저장 픽셀).
 *
 * @param rotatedSource makeRotatedSource 결과(90° 적용된 캔버스)
 */
export function renderEdit(
  rotatedSource: HTMLCanvasElement,
  state: EditState,
  opts: RenderOptions,
): HTMLCanvasElement {
  const rw = rotatedSource.width
  const rh = rotatedSource.height

  // 크롭 rect(수평 보정된 프레임 기준) → 픽셀
  const crop = cropToPixels(state.crop, rw, rh)
  let { sx, sy, sw, sh } = crop

  // 정사각 강제: 크롭 rect의 가운데를 잘라 정사각으로 (다운로드 규격).
  if (opts.forceSquare && sw !== sh) {
    const side = Math.min(sw, sh)
    sx += (sw - side) / 2
    sy += (sh - side) / 2
    sw = side
    sh = side
  }

  // 출력 크기 결정
  let outW: number
  let outH: number
  if (opts.forceSquare) {
    outW = outH = opts.targetSize ?? Math.round(Math.min(sw, sh))
  } else {
    const maxPrev = opts.maxPreview ?? 1024
    const scale = Math.min(1, maxPrev / Math.max(sw, sh))
    outW = Math.max(1, Math.round(sw * scale))
    outH = Math.max(1, Math.round(sh * scale))
  }

  const withAdj = opts.withAdjustments
  const filterSupported = withAdj ? supportsCtxFilter() : false
  const bcsFallback = withAdj && !filterSupported && hasBcs(state)
  const tempOn = withAdj && state.temperature !== 0
  const needsPixelRead = bcsFallback || tempOn

  const canvas = document.createElement("canvas")
  canvas.width = outW
  canvas.height = outH
  const ctx = canvas.getContext("2d", { willReadFrequently: needsPixelRead })
  if (!ctx) return canvas

  // 흰 배경 — 미세각도 코너·투명 영역 방지(PNG/JPG 공통 순백 배경).
  ctx.fillStyle = "#FFFFFF"
  ctx.fillRect(0, 0, outW, outH)

  const angle = (state.fineAngle * Math.PI) / 180
  ctx.save()
  // 출력 캔버스 ← 크롭 rect(sx,sy,sw,sh) 매핑
  ctx.scale(outW / sw, outH / sh)
  ctx.translate(-sx, -sy)
  // 수평 보정(fineAngle) — 전체 프레임(rw×rh) 중심 회전 + cover 확대로 빈 코너 제거.
  if (angle !== 0) {
    ctx.translate(rw / 2, rh / 2)
    ctx.rotate(angle)
    const cover = coverScale(rw, rh, angle)
    ctx.scale(cover, cover)
    ctx.translate(-rw / 2, -rh / 2)
  }
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = "high"
  ctx.filter = withAdj && filterSupported ? buildFilterString(state) : "none"
  ctx.drawImage(rotatedSource, 0, 0)
  ctx.restore()
  ctx.filter = "none"

  // 밝기/대비/채도 폴백(ctx.filter 미지원 시) + 색온도 — getImageData 한 번에 처리.
  if (needsPixelRead) {
    applyPixelAdjustments(ctx, outW, outH, state, bcsFallback, tempOn)
  }

  return canvas
}

/**
 * 픽셀 단위 보정.
 * @param bcs true면 밝기/대비/채도를 CSS filter와 동일 순서로 적용(Safari<17 폴백).
 * @param temp true면 색온도 채널 게인 적용.
 * CSS filter 규약: brightness → contrast → saturate 순, 이후 색온도(별도 채널 게인).
 */
function applyPixelAdjustments(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  state: EditState,
  bcs: boolean,
  temp: boolean,
): void {
  const image = ctx.getImageData(0, 0, w, h)
  const d = image.data
  const b = bcs ? Math.max(0, 1 + state.brightness / 100) : 1
  const c = bcs ? Math.max(0, 1 + state.contrast / 100) : 1
  const s = bcs ? Math.max(0, 1 + state.saturation / 100) : 1
  const warmth = state.temperature / 100 // -1..1
  const rGain = temp ? 1 + 0.2 * warmth : 1
  const bGain = temp ? 1 - 0.2 * warmth : 1
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i]
    let g = d[i + 1]
    let bl = d[i + 2]
    if (bcs) {
      // 밝기
      r *= b
      g *= b
      bl *= b
      // 대비 (중간값 127.5 기준)
      r = (r - 127.5) * c + 127.5
      g = (g - 127.5) * c + 127.5
      bl = (bl - 127.5) * c + 127.5
      // 채도 (Rec.709 luma 기준으로 회색↔원색 보간)
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * bl
      r = luma + s * (r - luma)
      g = luma + s * (g - luma)
      bl = luma + s * (bl - luma)
    }
    if (temp) {
      // warmth>0 → R↑ B↓ (따뜻하게)
      r *= rGain
      bl *= bGain
    }
    d[i] = clamp255(r)
    d[i + 1] = clamp255(g)
    d[i + 2] = clamp255(bl)
  }
  ctx.putImageData(image, 0, 0)
}

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v
}
