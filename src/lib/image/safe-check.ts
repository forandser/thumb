/**
 * 플랫폼 세이프 체크 — 최종 출력(정사각 캔버스)과 인코딩된 JPEG 크기를 분석하는 순수 함수.
 *
 * 쿠팡 대표이미지 규격을 기준으로 통과/경고/확인 필요를 판정한다(스펙 §②).
 * 다운로드를 막지 않는다 — 결과는 안내용이다. 자동 판정 불가 항목(텍스트·로고)은
 * 정직하게 "직접 확인"으로 표기한다. 문구 조립은 UI(i18n)가, 여기서는 수치·판정만 만든다.
 */

/** pass=통과 / warn=경고 / fail=실패 표기 / check=직접 확인(자동 판정 불가). */
export type SafeVerdict = "pass" | "warn" | "fail" | "check"

export interface SafeCheckResult {
  /** 규격(1000×1000 이상 + 정사각). */
  size: { verdict: SafeVerdict; w: number; h: number }
  /** 파일 용량(JPEG ≤10MB). */
  fileSize: { verdict: SafeVerdict; bytes: number }
  /** 순백 배경 — 가장자리 근백색 비율(0..1). */
  whiteBg: { verdict: SafeVerdict; ratio: number }
  /** 상품 비율 — 비백색 바운딩박스 면적비(0..1). 배경 판단 불가면 null. */
  productArea: { verdict: SafeVerdict; ratio: number | null }
  /** 중앙 정렬 — 바운딩박스 중심의 캔버스 중심 대비 최대 편차(0..0.5). 판단 불가면 null. */
  centering: { verdict: SafeVerdict; offset: number | null }
}

/** 근백색 판정 임계(R,G,B 모두 이상이면 흰색으로 간주). */
const NEAR_WHITE = 250
/** 상품(비백색) 픽셀 판정 임계(min(R,G,B)가 이 미만이면 상품). */
const PRODUCT_THRESHOLD = 240
/** 쿠팡 JPEG 용량 상한. */
const MAX_JPEG_BYTES = 10 * 1024 * 1024
/** 순백 배경 통과/경고 경계. */
const WHITE_PASS = 0.9
const WHITE_WARN = 0.7
/** 상품 비율 권장 하한. */
const AREA_MIN = 0.85
/** 중앙 정렬 허용 편차(±5%). */
const CENTER_TOL = 0.05

/**
 * 정사각 출력 캔버스 + 인코딩된 JPEG 바이트 크기를 분석한다.
 * 비율·배경 검사는 이 캔버스 픽셀로, 용량은 인자로 받은 바이트로 판정한다.
 */
export function runSafeCheck(canvas: HTMLCanvasElement, jpegBytes: number): SafeCheckResult {
  const w = canvas.width
  const h = canvas.height
  const square = Math.max(w, h) > 0 ? Math.abs(w - h) / Math.max(w, h) < 0.01 : true
  const sizeVerdict: SafeVerdict = w >= 1000 && h >= 1000 && square ? "pass" : "warn"
  const fileVerdict: SafeVerdict = jpegBytes <= MAX_JPEG_BYTES ? "pass" : "warn"

  const ctx = canvas.getContext("2d", { willReadFrequently: true })
  if (!ctx) {
    return {
      size: { verdict: sizeVerdict, w, h },
      fileSize: { verdict: fileVerdict, bytes: jpegBytes },
      whiteBg: { verdict: "check", ratio: 0 },
      productArea: { verdict: "check", ratio: null },
      centering: { verdict: "check", offset: null },
    }
  }

  const { data } = ctx.getImageData(0, 0, w, h)
  const band = Math.max(2, Math.round(Math.min(w, h) * 0.06))
  let borderTotal = 0
  let borderWhite = 0
  let minX = w
  let minY = h
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < h; y++) {
    const onYEdge = y < band || y >= h - band
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4
      const r = data[idx]
      const g = data[idx + 1]
      const b = data[idx + 2]
      if (onYEdge || x < band || x >= w - band) {
        borderTotal++
        if (r >= NEAR_WHITE && g >= NEAR_WHITE && b >= NEAR_WHITE) borderWhite++
      }
      if (Math.min(r, g, b) < PRODUCT_THRESHOLD) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }

  const ratio = borderTotal > 0 ? borderWhite / borderTotal : 0
  const whiteVerdict: SafeVerdict = ratio >= WHITE_PASS ? "pass" : ratio >= WHITE_WARN ? "warn" : "fail"
  const bgUsable = ratio >= WHITE_WARN
  const hasProduct = maxX >= 0

  let productArea: SafeCheckResult["productArea"]
  let centering: SafeCheckResult["centering"]
  if (!hasProduct || !bgUsable) {
    // 배경이 순백이 아니면(또는 상품 픽셀을 못 찾으면) 비율·정렬은 판단 불가.
    productArea = { verdict: "check", ratio: null }
    centering = { verdict: "check", offset: null }
  } else {
    const bw = maxX - minX + 1
    const bh = maxY - minY + 1
    const areaRatio = (bw * bh) / (w * h)
    productArea = { verdict: areaRatio >= AREA_MIN ? "pass" : "warn", ratio: areaRatio }
    const cx = (minX + maxX) / 2 / w
    const cy = (minY + maxY) / 2 / h
    const offset = Math.max(Math.abs(cx - 0.5), Math.abs(cy - 0.5))
    centering = { verdict: offset <= CENTER_TOL ? "pass" : "warn", offset }
  }

  return {
    size: { verdict: sizeVerdict, w, h },
    fileSize: { verdict: fileVerdict, bytes: jpegBytes },
    whiteBg: { verdict: whiteVerdict, ratio },
    productArea,
    centering,
  }
}
