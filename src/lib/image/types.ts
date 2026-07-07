/**
 * 사진 보정 편집 상태 모델.
 *
 * 핵심 원칙: 미리보기와 다운로드는 "같은 값 → 같은 픽셀 연산"으로 굽는다.
 * 밝기/대비/채도는 canvas 2D의 ctx.filter(= CSS filter와 동일 문법)로 처리하되,
 * ctx.filter 미지원 브라우저(Safari 17 미만)에서는 동일 연산을 픽셀 폴백으로 대체한다.
 * 색온도는 RGB 채널 게인 근사로 처리한다. 두 경로 모두 render.ts 한 곳을 거치므로
 * 같은 값이면 같은 픽셀 연산이 보장된다(해상도만 다름).
 */

/**
 * 정규화 크롭 사각형 — rotate90 + fineAngle(수평 보정)까지 적용된 프레임 기준(0..1).
 * 즉 크롭 작업대에서 보이는 "수평이 맞춰진 화면"을 그대로 자른 좌표다. null이면 전체.
 */
export interface Crop {
  x: number
  y: number
  w: number
  h: number
}

export interface EditState {
  /** -100..100 (0=원본). CSS brightness(1 + v/100) */
  brightness: number
  /** -100..100. CSS contrast(1 + v/100) */
  contrast: number
  /** -100..100. CSS saturate(1 + v/100) */
  saturation: number
  /** -100..100. 음수=차갑게(파랑), 양수=따뜻하게(빨강). RGB 채널 게인 근사. */
  temperature: number
  /** 90° 시계방향 회전 횟수 0..3 */
  rotate90: number
  /** -15..15° 미세 회전(수평 보정). 빈 코너는 살짝 확대(cover)해 채운다. */
  fineAngle: number
  /** 크롭. null = 전체 */
  crop: Crop | null
}

export const DEFAULT_EDIT: EditState = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  temperature: 0,
  rotate90: 0,
  fineAngle: 0,
  crop: null,
}

/** 슬라이더 범위 정의 (UI·클램프 공용). */
export const RANGE = {
  brightness: { min: -100, max: 100 },
  contrast: { min: -100, max: 100 },
  saturation: { min: -100, max: 100 },
  temperature: { min: -100, max: 100 },
  fineAngle: { min: -15, max: 15 },
} as const

/** 과보정 경고 임계값 — 이 근처면 "실물과 달라 보임" 경고. */
export const OVER_WARN = {
  saturation: 55, // 채도는 위로만 위험(색 뻥튀기)
  brightness: 60, // 밝기는 절대값
  temperature: 65, // 색온도는 절대값
} as const

/** 특정 슬라이더 값이 과보정 경고 구간인지. */
export function isFieldOver(field: keyof typeof OVER_WARN, value: number): boolean {
  if (field === "saturation") return value >= OVER_WARN.saturation
  return Math.abs(value) >= OVER_WARN[field]
}

/** 편집 상태 전체에 과보정 항목이 하나라도 있는지. */
export function hasOverCorrection(state: EditState): boolean {
  return (
    isFieldOver("saturation", state.saturation) ||
    isFieldOver("brightness", state.brightness) ||
    isFieldOver("temperature", state.temperature)
  )
}

export function isDefaultEdit(state: EditState): boolean {
  return (
    state.brightness === 0 &&
    state.contrast === 0 &&
    state.saturation === 0 &&
    state.temperature === 0 &&
    state.rotate90 === 0 &&
    state.fineAngle === 0 &&
    state.crop === null
  )
}
