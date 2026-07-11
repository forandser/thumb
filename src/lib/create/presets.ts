/**
 * 연출 프리셋 8종 데이터 (리서치 §⑤(b) + v0.7 handHeld 신설).
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
  | "handHeld"

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
 * 8종 프리셋. 배열 순서 = 카드 노출 순서.
 * v0.7: 실용 구도(흰배경 누끼컷·손에 든 컷·단면컷)를 앞쪽에 배치해 셀러가 먼저 만나게 한다.
 * 프리셋 key·프롬프트 블록은 불변(코드 안정) — 순서만 조정하고 handHeld를 신설했다.
 * 프롬프트 블록은 prompt-engine이 조립할 때 그대로 삽입된다.
 */
export const PRESETS: readonly StylePreset[] = [
  {
    key: "studioClean",
    // 스튜디오 클린만 필름 스톡 미병기 — 깔끔한 오픈마켓 단독컷이라 디지털 캡처 유지(스펙 §③).
    // v0.8: 쿠팡·네이버 대표이미지 흰배경 규정 준수를 위해 배경은 순백(#FFFFFF) 유지 — ko 라벨·analyze
    // 설명("무지 흰 배경")과 일치시킨다(v0.8 재튜닝의 크림/연그레이 그라디언트는 규정 위반 위험이라 되돌림).
    // 저가 티 방지는 배경색이 아니라 2등 조명(키+리플렉터 필)·정확 화이트밸런스·무광 표면·미세 질감으로 살린다.
    // 오픈마켓 대표이미지라 중앙 정렬은 유지(스펙 §STEP3).
    camera: "shot on Canon 5D, 85mm f/8, straight-on product angle, subject centered with clean breathing room",
    lighting:
      "a soft key light at 45 degrees with an opposite reflector fill, gentle even illumination, minimal soft contact shadow, accurate neutral white balance so whites read pure white, neutral 5500K",
    background:
      "a seamless pure-white background (#FFFFFF), evenly lit so it reads true solid white with no colour cast, matte non-reflective surface, no props, clean marketplace thumbnail with high micro-detail on the skin",
    allowsTextOverlay: false,
    heroSafe: true,
  },
  {
    key: "handHeld",
    // v0.7 신설 — 사람 손이 과일을 자연스럽게 든 라이프스타일 컷(실물감·크기감 전달).
    // v0.8: 손 해부 정확성·창측 45도 광·따뜻한 중립 WB·주방/마켓 배경(균일 보케 금지)·자연 과분 명시.
    camera:
      "shot on Sony A7, 50mm f/2.0 at eye level, a person's hand with correct human anatomy naturally holding the fruit toward the camera, on Kodak Portra 400 film",
    lighting: "soft window light from 45 degrees, warm and inviting, gentle wrap, warm-neutral 5200K",
    background:
      "a softly blurred home kitchen or market setting (not a uniform bokeh wall), natural human hand with real skin texture holding the fruit, visible natural bloom, shallow depth of field",
    allowsTextOverlay: true,
    heroSafe: false,
  },
  {
    key: "juicyCut",
    // v0.8: 역광 매크로 유지, 과채도(네온) 억제·따뜻한 중립 WB. 균일 보케·플라스틱 광택 제거,
    // 실제 과즙 윤기·과육 섬유·절단면 결로·껍질 미세 질감 명시(식욕컷 사실성).
    camera:
      "100mm macro f/2.8, close-up of a clean cross-section, single focal plane, on Kodak Ektar 100 film",
    lighting:
      "backlight passing through the fruit flesh for a translucent glow, a soft rim light through the pulp, restrained vibrance not neon, warm-neutral 5200K",
    background:
      "a clean matte surface, real juice sheen and pulp fibers with condensation on the cut face, natural micro-texture on the rind, all attention on the inner flesh",
    allowsTextOverlay: true,
    heroSafe: false,
  },
  {
    key: "morningMarket",
    // v0.8: 순백 냉감 제거 → 컬리식 크림톤(따뜻한 중립 5200K). 구김 살린 오프화이트 리넨·무광 오크,
    // 창측 45도 확산광+약한 필, 부드러운 반그림자 접지, 절제된 vibrance·형광톤 금지.
    camera:
      "shot on Canon 5D, 85mm f/2.8, eye-level at a 45-degree angle, generous negative space, on Kodak Portra 400 film",
    lighting:
      "soft diffused window light from the left at 45 degrees, gentle wrap with a low-key fill, warm-neutral 5200K, restrained vibrance, no fluorescent cast",
    background:
      "crumpled off-white linen and matte oiled-oak wood, warm cream tones, a few tiny fresh water droplets, a natural contact shadow with soft penumbra, one simple prop at most",
    allowsTextOverlay: true,
    heroSafe: false,
  },
  {
    key: "premiumDark",
    // v0.8: 백화점 선물세트 키아로스쿠로 강화 — 측면 단일 소프트박스·깊은 폴오프·따뜻한 앰버 키(4800K),
    // 주인공만 빛에 담그고 주변 어둡게. SSG 명화 모티브(회화적 정물·미술관 프린트), 무광·정갈한 배열.
    camera:
      "shot on Canon 5D, 100mm f/4, low three-quarter angle, tight composition with breathing room, on Kodak Portra 800 film",
    lighting:
      "chiaroscuro low-key lighting, a single narrow softbox from the side, deep controlled falloff into shadow, warm amber key 4800K, subject pooled in light",
    background:
      "a dark charcoal linen or matte slate backdrop with a muted hanji wrap, painterly still-life mood with museum-print elegance, tidy orderly arrangement, no competing props",
    allowsTextOverlay: true,
    heroSafe: false,
  },
  {
    key: "onTheTable",
    // v0.8: 컬리풍 라이프스타일 식탁 — 따뜻한 가정광(5000K), 생활감 있는 자연 스타일링, 부드러운 비대칭,
    // 소품은 1~2개·낮은 채도로 뒤로 물러나게, 넉넉한 여백, 균일 배경 보케 금지.
    camera:
      "shot on Sony A7, 50mm f/2.0 at a 45-degree angle, shallow depth of field with soft background blur, on Kodak Portra 400 film",
    lighting: "soft directional window light from the side, warm ambient home mood, warm-neutral 5000K",
    background:
      "a lived-in styled dining table with a ceramic bowl, a linen napkin and one or two seasonal props in lower saturation, gentle asymmetry and negative space, Korean premium grocery styling",
    allowsTextOverlay: true,
    heroSafe: false,
  },
  {
    key: "farmFresh",
    // v0.8: 야외 진정성 유지, 과채도·HDR 티 제거. 잎·줄기 붙은 신선함, 과분 보존, 흙먼지·미세 흠집 허용,
    // 부드러운 흐린날 확산 또는 골든아워(5400K), 클래러티 후광 금지, 자연 접지 그림자.
    camera:
      "shot on Fujifilm, 35mm f/4 at a natural outdoor angle, honest documentary framing, on Kodak Portra 400 film",
    lighting:
      "natural outdoor daylight under soft overcast diffusion, restrained vibrance, no HDR clarity halo, warm 5400K",
    background:
      "a rustic wooden crate with fresh leaves and stems attached, preserved natural bloom on the skin, a little soil dust and tiny blemishes, farm-direct authenticity with a natural grounded shadow, earthy tones",
    allowsTextOverlay: true,
    heroSafe: false,
  },
  {
    key: "seasonMood",
    // v0.8: 계절 팔레트 유지하되 필터 과함 억제 — 색은 배경에만, 과일 색은 참되게. 소품 1~2개로 절제,
    // 여름 크리스프 5600K(얼음·결로·블루그레이 리넨) / 겨울 따뜻한 앰버 4600K(니트·한지·잔잔한 김).
    camera:
      "shot on Sony A7, 50mm f/2.8 at a 45-degree angle, seasonal editorial framing, on Kodak Portra 400 film",
    lighting:
      "soft directional light matched to the season, keep the fruit color true with no heavy color-filter cast — summer: crisp 5600K; winter: warm amber 4600K",
    background:
      "a palette-tinted background (not the fruit) with one or two restrained seasonal props — summer: ice and condensation with blue-grey linen; winter: warm knit texture, hanji and subtle steam",
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
