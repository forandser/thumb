/**
 * 연출 프리셋 7종 데이터 (리서치 §⑤(b) 그대로).
 *
 * 원리: 프리셋은 "실사 프롬프트의 카메라/조명/배경 블록"을 담는 구조 데이터다.
 * 프롬프트 블록은 이미지 생성 모델(나노바나나)에 들어가는 영어 지시라 여기 둔다
 * (사용자에게 노출되지 않음). 카드에 보이는 한글 라벨·설명은 i18n ko.create.presets에 있고
 * key로 1:1 매칭된다 — 사용자 노출 문구는 ko.ts 경유 원칙 준수.
 *
 * 카메라 언어(렌즈·조리개·각도) + 조명 방향 명시 + 배경/소품은 리서치 §④ "실제 사진처럼"
 * 조건(방향 있는 부드러운 빛·절제된 채도·불완전함)을 각 연출 의도에 맞게 고정한 값이다.
 */

/** 프리셋 식별자. ko.create.presets의 키와 동일. analyze의 recommendedPreset도 이 집합. */
export type PresetKey =
  | "morningMarket"
  | "premiumDark"
  | "juicyCut"
  | "onTheTable"
  | "farmFresh"
  | "studioClean"
  | "seasonMood"

export interface StylePreset {
  key: PresetKey
  /** 프롬프트 [카메라·렌즈] 블록(영어). */
  camera: string
  /** 프롬프트 [조명 방향·질] 블록(영어). 방향을 반드시 명시(리서치 §④). */
  lighting: string
  /** 프롬프트 [배경·소품] 블록(영어). 소품 1~2개 제한. */
  background: string
  /**
   * 한글 텍스트 오버레이 허용 여부. 스튜디오 클린은 오픈마켓 대표이미지 단독컷이라
   * 글자 금지(스펙 §STEP3) → false. UI가 오버레이 도구 활성/비활성 판단에 쓴다.
   */
  allowsTextOverlay: boolean
  /**
   * 실물 보존 대표이미지(썸네일 단독컷)로 적합한지. 스튜디오 클린만 true —
   * 나머지는 연출/상세용. UI의 모드·용도 안내에 쓴다.
   */
  heroSafe: boolean
}

/**
 * 7종 프리셋. 배열 순서 = 카드 노출 순서(리서치 표 순서).
 * 프롬프트 블록은 prompt-engine이 조립할 때 그대로 삽입된다.
 */
export const PRESETS: readonly StylePreset[] = [
  {
    key: "morningMarket",
    camera: "shot on Canon 5D, 85mm f/2.8, eye-level at a 45-degree angle, generous negative space",
    lighting:
      "soft north-facing window light from the left at 45 degrees, 5500K, gentle side light that reveals surface texture",
    background:
      "bright linen and light wood surface, airy white tones, a few tiny fresh water droplets, one simple prop at most",
    allowsTextOverlay: true,
    heroSafe: false,
  },
  {
    key: "premiumDark",
    camera: "shot on Canon 5D, 100mm f/4, low three-quarter angle, tight composition with breathing room",
    lighting:
      "chiaroscuro low-key lighting, a single narrow soft side light, deep controlled shadows, 5200K",
    background:
      "dark slate surface and moody dark backdrop, luxury gift-set mood, no competing props",
    allowsTextOverlay: true,
    heroSafe: false,
  },
  {
    key: "juicyCut",
    camera: "100mm macro f/2.8, close-up of a clean cross-section, single focal plane",
    lighting:
      "backlight passing through the fruit flesh for a translucent glow, juicy specular highlights, 5600K",
    background:
      "clean minimal surface with a few water droplets, all attention on the cut section and its inner texture",
    allowsTextOverlay: true,
    heroSafe: false,
  },
  {
    key: "onTheTable",
    camera: "shot on Sony A7, 50mm f/2.0 at a 45-degree angle, shallow depth of field with soft background blur",
    lighting: "soft diffused daylight from the side, natural editorial lifestyle mood, 5400K",
    background:
      "a styled dining table with a ceramic bowl, a linen napkin and one or two seasonal props, Korean premium grocery styling",
    allowsTextOverlay: true,
    heroSafe: false,
  },
  {
    key: "farmFresh",
    camera: "shot on Fujifilm, 35mm f/4 at a natural outdoor angle, honest documentary framing",
    lighting: "natural outdoor daylight under soft overcast, authentic and unstyled, 5600K",
    background: "a rustic wooden crate with green leaves, farm-direct authenticity, earthy tones",
    allowsTextOverlay: true,
    heroSafe: false,
  },
  {
    key: "studioClean",
    camera: "shot on Canon 5D, 85mm f/8, straight-on product angle, centered with balanced margins",
    lighting: "a large softbox side light, even soft illumination, minimal soft contact shadow, 5500K",
    background: "a seamless plain white to cream backdrop, no props, clean e-commerce thumbnail look",
    allowsTextOverlay: false,
    heroSafe: true,
  },
  {
    key: "seasonMood",
    camera: "shot on Sony A7, 50mm f/2.8 at a 45-degree angle, seasonal editorial framing",
    lighting: "soft directional light matched to the season, 5500K",
    background:
      "a seasonal color palette and props — summer: ice cubes and cool blue tones; winter: warm knit and cozy textures",
    allowsTextOverlay: true,
    heroSafe: false,
  },
] as const

/** 프리셋 key 목록(카드 렌더 순서). */
export const PRESET_KEYS: readonly PresetKey[] = PRESETS.map((p) => p.key)

/** 주어진 문자열이 유효한 PresetKey인지(analyze 응답 검증용 타입 가드). */
export function isPresetKey(v: unknown): v is PresetKey {
  return typeof v === "string" && PRESETS.some((p) => p.key === v)
}

/** key로 프리셋 조회. 없으면 undefined. */
export function getPreset(key: PresetKey): StylePreset | undefined {
  return PRESETS.find((p) => p.key === key)
}

/**
 * analyze 실패·무효 key 시 안전 기본값. 스튜디오 클린 = 오픈마켓 대표이미지 단독컷으로
 * 실물 보존 모드 기본 흐름에 가장 안전(스펙 §STEP2).
 */
export const DEFAULT_PRESET_KEY: PresetKey = "studioClean"
