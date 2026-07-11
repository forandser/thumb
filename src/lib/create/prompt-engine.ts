/**
 * 실사 프롬프트 로컬 조립 (무료·결정적).
 *
 * 원리: 프롬프트 생성은 AI를 쓰지 않고 로컬에서 문자열로 조립한다(비용 0, 재현 가능).
 * 리서치 §④ 공식을 그대로 따른다:
 *   [피사체+품종+개수+상태] + [카메라·렌즈] + [조명 방향·질] + [배경·소품] + [불완전함] + [네거티브]
 * 프리셋(presets.ts)의 카메라/조명/배경 블록에 분석 결과(품종·개수)를 끼워 넣고,
 * 공통 불완전함·네거티브를 붙인다. 레퍼런스 모드면 프리셋 대신 분석의 referenceStyle 텍스트를 쓴다.
 *
 * 프롬프트는 이미지 생성 모델(나노바나나)에 들어가는 영어 지시라 사용자에게 노출되지 않는다
 * (한글 UI 문구는 ko.ts). 실물 보존 모드에는 "과일 픽셀 불변" 필수 문구를 넣어(스펙 §품질
 * 파이프라인 1) 개수·색·형태·과분(bloom)을 지키고 배경·소품·조명만 교체하게 강제한다.
 */
import { getPreset, type PresetKey, type StylePreset } from "./presets"

/** 생성 모드. preserve=실물 보존(재료 픽셀 유지), generate=새로 그리기(text-only). */
export type CreateMode = "preserve" | "generate"

/** prompt-engine 입력 — 분석 결과 일부 + 프리셋/레퍼런스 스타일 + 모드. */
export interface PromptInput {
  mode: CreateMode
  /** 프리셋 key. 레퍼런스 따라가기 모드면 null. */
  presetKey: PresetKey | null
  /**
   * 레퍼런스 스타일 묘사(analyze.referenceStyle). presetKey가 null일 때 프리셋 블록 대신 쓴다.
   * 비어 있고 presetKey도 null이면 중립 스튜디오 스타일로 폴백.
   */
  referenceStyle?: string
  /** 품종 추정. 비면 "fresh fruit". */
  variety?: string
  /** 개수. 0/미지정이면 개수 지시를 생략(원본 유지). 양수면 홀수 유도 문구를 붙인다. */
  count?: number
  /** 상태 한 줄(신선도·흠집) — 영어/한국어 무엇이든 참고 정보로 덧붙는다. */
  condition?: string
  /**
   * 실물 보존 생성 입력에 함께 실린 보조 컷 수(v0.5, 최대 2). 0/미지정이면 대표 1장뿐.
   * 양수면 "첫 이미지가 기준, 나머지는 같은 상품 다른 각도"라는 다각도 지시를 덧붙인다.
   */
  auxCount?: number
  /**
   * 셀러 자유 입력(v0.7, 선택). 프리셋 스타일 위에 셀러 요청을 얹는다. 비면 무시.
   * 스타일 뒤·네거티브/PRESERVE_CLAUSE 앞에 넣어 실물 보존·텍스트 금지가 항상 우선하게 한다.
   * 과도한 새니타이즈 없이 그대로 전달하되 최대 길이만 컷(CUSTOM_PROMPT_MAX).
   */
  customPrompt?: string
}

/** 셀러 자유 입력 최대 길이(스펙 §① — 과도한 새니타이즈 없이 길이만 컷). */
export const CUSTOM_PROMPT_MAX = 300

/**
 * 불완전함 주입(리서치 §④) — 플라스틱 질감·과한 완벽함 방지. 모드별로 분기한다.
 *
 * 실물 보존 모드: 원본 사진에 "없던 사물"(물방울·과분)을 새로 만들지 않는다. 만들면
 *   (1) PRESERVE_CLAUSE('과분·물방울을 바꾸지 말라')와 정면 충돌하고,
 *   (2) 실제 상품보다 더 신선해 보이게 하는 연출이라 식품표시광고법 오인 소지가 있다.
 *   그래서 질감 노이즈(필름그레인·미세 불완전함)만 남긴다.
 * 새로 그리기 모드: 원본 픽셀을 쓰지 않으므로 물방울·과분 등 신선도 신호까지 유도한다.
 */
const IMPERFECTION_PRESERVE =
  "subtle film grain ISO 400, natural imperfections, avoid an overly perfect plastic look — do not add water droplets or bloom that are not in the source photo"
const IMPERFECTION_GENERATE =
  "subtle film grain ISO 400, natural imperfections, tiny water droplets, visible natural bloom on the skin"
// studioClean(디지털 캡처·순백 대표컷) 전용 불완전함 절 — 필름 그레인 문구를 뺀다.
// 디지털 카메라(Canon 5D) 지시와 'film grain ISO 400'이 충돌하고, 순백(#FFFFFF) 배경에 그레인을
// 유도하면 쿠팡·네이버 흰배경 규정과 어긋난다(광학 절 제외 skipOptical와 같은 취지의 비대칭 정리).
const IMPERFECTION_PRESERVE_NO_FILM =
  "natural imperfections, avoid an overly perfect plastic look — do not add water droplets or bloom that are not in the source photo"

/**
 * 공통 실사 절(v0.6 신설, preserve/generate 공통) — 리서치 §④(플라스틱 질감·과채도·
 * 반복 패턴·불가능한 완벽함) 대응. 기존 "photorealistic..." 한 줄을 이 절로 대체·확장한다.
 */
const REALISM_CLAUSE =
  "authentic photograph, shot on film, natural film grain, realistic subsurface scattering on the fruit skin, visible natural surface texture and micro-blemishes, true-to-life color (not oversaturated), imperfect organic shapes"
// studioClean 전용 실사 절 — 'shot on film, natural film grain'을 뺀 디지털 캡처 변형(순백 대표컷).
const REALISM_CLAUSE_NO_FILM =
  "authentic photograph, realistic subsurface scattering on the fruit skin, visible natural surface texture and micro-blemishes, true-to-life color (not oversaturated), imperfect organic shapes"

/** 광학 사실성 절(v0.6 신설) — CGI처럼 균일한 배경 보케를 억제한다. */
const OPTICAL_CLAUSE =
  "natural optical depth of field, soft imperfect background bokeh, subtle lens vignetting, gentle natural falloff"

/** 공통 네거티브(리서치 §④). v0.6에서 플라스틱·CGI 신호 네거티브를 강화. */
const NEGATIVE =
  "avoid: illustration, 3D render, CGI, plastic texture, oversaturated colors, perfect symmetry, any text or letters or logos, waxy plastic highlights, CGI sheen, airbrushed skin, uniform repeating patterns, artificial perfect bokeh, digital over-smoothing"

/** 레퍼런스·프리셋 모두 없을 때의 중립 폴백 스타일. */
const NEUTRAL_STYLE =
  "clean studio product photography, soft directional side light at 5500K, seamless neutral backdrop, balanced negative space"

/** 실물 보존 필수 문구(스펙 §품질 파이프라인 1) — 과일 픽셀 불변, 배경·연출만 교체. */
const PRESERVE_CLAUSE =
  "CRITICAL: keep the exact fruit from the provided source photo unchanged — do not alter the count, color, shape, ripeness, or natural bloom of the fruit. Only replace the background, props, and lighting. Preserve the real fruit pixels."

/**
 * 다각도 보조 컷 지시(v0.5, 실물 보존 + auxCount>0). editImage에 [대표, 보조…]를 함께 넣을 때,
 * 첫 이미지가 보존 기준이고 나머지는 같은 상품의 다른 각도 참고임을 모델에 못박는다(스펙 §생성).
 * 이 문구가 없으면 모델이 여러 이미지를 별개 상품으로 합쳐 개수를 늘릴 수 있다.
 */
const MULTI_ANGLE_CLAUSE =
  "The FIRST provided image is the reference product and must be preserved exactly. Any additional provided images are the SAME single product photographed from other angles — use them only as extra reference for the real shape, color, and count. Do not merge them into multiple products or add fruit."

/**
 * [피사체+품종+개수+상태] 블록. count 양수면 홀수 유도(리서치 §④).
 *
 * 개수 지시는 **새로 그리기 모드에서만** 넣는다. 실물 보존 모드는 원본 픽셀을 그대로 두는 것이
 * 목적이라 개수는 원본이 이미 정의하며(PRESERVE_CLAUSE가 불변을 강제), 분석 추정치(틀릴 수 있음)를
 * 'exactly N pieces'로 강제하면 모델이 과일을 더하거나 지워 실물 보존을 깨고 검수 #3을 반복 미통과시킨다.
 */
function subjectBlock(input: PromptInput): string {
  const variety = (input.variety ?? "").trim() || "fresh fruit"
  const parts: string[] = [`hero shot of ${variety}`]
  if (input.mode === "generate" && input.count && input.count > 0) {
    const oddNote = input.count % 2 === 0 ? " (arrange in a natural, non-symmetric cluster)" : ""
    parts.push(`exactly ${input.count} pieces${oddNote}`)
  }
  const cond = (input.condition ?? "").trim()
  if (cond) parts.push(`condition: ${cond}`)
  return parts.join(", ")
}

/** 프리셋 → 카메라/조명/배경 블록. */
function presetStyleBlock(preset: StylePreset): string {
  return [preset.camera, preset.lighting, preset.background].join(". ")
}

/** 레퍼런스 스타일 → 스타일 블록(프리셋 대체). */
function referenceStyleBlock(referenceStyle: string): string {
  const s = referenceStyle.trim()
  return s ? `match this reference style: ${s}` : NEUTRAL_STYLE
}

/**
 * 셀러 자유 입력 → 프롬프트 절(v0.7). 비면 null. 최대 길이만 컷(과도한 새니타이즈 금지 — 스펙 §①).
 * 스타일 뒤에 얹되 뒤의 NEGATIVE·PRESERVE_CLAUSE가 항상 우선(고가중치)이라 "빨갛게"·"글자 넣어"
 * 같은 요청이 와도 실물 보존·텍스트 금지를 깨지 못한다.
 */
function customPromptBlock(customPrompt?: string): string | null {
  const s = (customPrompt ?? "").trim()
  if (!s) return null
  return `Additional request from the seller: ${s.slice(0, CUSTOM_PROMPT_MAX)}`
}

/**
 * 프롬프트 조립. preserve/generate 공통 본문 + 실물 보존 모드는 PRESERVE_CLAUSE 추가.
 *
 * @example
 *   const prompt = buildPrompt({
 *     mode: "preserve", presetKey: analysis.recommendedPreset,
 *     variety: analysis.variety, count: analysis.count, condition: analysis.condition,
 *   })
 *   // preserve → editImage(materialB64, prompt) / generate → generateImage(prompt)
 */
export function buildPrompt(input: PromptInput): string {
  const preset = input.presetKey ? getPreset(input.presetKey) : undefined
  const styleBlock = preset
    ? presetStyleBlock(preset)
    : referenceStyleBlock(input.referenceStyle ?? "")

  // studioClean은 깔끔한 순백·정면 e-커머스 단독컷이라 배경 보케·렌즈 비네팅 지시(OPTICAL_CLAUSE)를
  // 넣지 않는다 — 필름 스톡 제외(presets.ts)와 같은 취지로, 순백 배경이 어두워지거나 흐려지는 것을 막는다.
  // 같은 이유로 필름 그레인 언어(REALISM_CLAUSE·IMPERFECTION_PRESERVE의 'film grain')도 제외한다
  // (디지털 캡처 지시와 충돌·순백 규정 저하 방지 — 광학 절 제외와 대칭).
  const isStudioClean = preset?.key === "studioClean"
  const skipOptical = isStudioClean

  // 셀러 자유 입력(있으면)은 스타일 뒤·불완전함/네거티브/PRESERVE_CLAUSE 앞에 얹는다.
  const customBlock = customPromptBlock(input.customPrompt)

  const imperfection =
    input.mode === "preserve"
      ? isStudioClean
        ? IMPERFECTION_PRESERVE_NO_FILM
        : IMPERFECTION_PRESERVE
      : IMPERFECTION_GENERATE

  const blocks: string[] = [
    subjectBlock(input),
    styleBlock,
    ...(customBlock ? [customBlock] : []),
    imperfection,
    // 공통 실사 절 + 광학 사실성 절 — preserve/generate 양쪽에 포함(스펙 §③).
    // 단 studioClean(순백 클린 단독컷)은 광학 사실성 절과 필름 그레인 언어를 제외한다.
    isStudioClean ? REALISM_CLAUSE_NO_FILM : REALISM_CLAUSE,
    ...(skipOptical ? [] : [OPTICAL_CLAUSE]),
    NEGATIVE,
  ]
  if (input.mode === "preserve") {
    blocks.push(PRESERVE_CLAUSE)
    if (input.auxCount && input.auxCount > 0) blocks.push(MULTI_ANGLE_CLAUSE)
  }
  return blocks.join(". ") + "."
}

/**
 * 재생성 시 검수 힌트를 프롬프트에 덧붙인다(스펙 §품질 파이프라인 4).
 * 힌트가 비면 원본 프롬프트를 그대로 반환.
 */
export function appendRetryHint(prompt: string, retryHint: string): string {
  const hint = retryHint.trim()
  if (!hint) return prompt
  // 재생성 힌트에도 실사 절을 재강조(스펙 §③) — 문제 수정 중 다시 매끈해지지 않게.
  return `${prompt} Fix these issues from the previous attempt: ${hint}. Keep it an authentic film photograph with natural grain and true-to-life color, not a smooth CGI render.`
}

/**
 * 대화형 리터치 지시 래퍼(스펙 §STEP3, 실물 보존 불변식).
 *
 * 셀러가 리터치 입력창에 넣은 자유 문장(instruction)을 Gemini 픽셀 편집에 그대로 넘기면
 * "사과를 더 빨갛게"·"흠집을 없애줘"·"포도알을 더 많게"처럼 실물을 미화·왜곡하는 요청이
 * 실제 과일의 색·과분·흠집·개수를 바꿔 저장돼 식품표시광고법(과대·오인) 위반 산출물이 된다.
 * 그래서 Step2 자유입력(customPrompt)과 동일한 정책으로, 셀러 요청 뒤에 실물 보존 필수 문구
 * (PRESERVE_CLAUSE: 개수·색·형태·과분 불변)와 텍스트 금지 네거티브(NEGATIVE)를 고가중치로 얹어
 * 배경·소품·조명만 바꾸도록 강제한다(UI가 이미 '실물 보존·글자 금지는 항상 지켜져요'라고 약속).
 * 길이는 자유입력과 같은 상한만 컷(과도한 새니타이즈 금지 — 스펙 §①).
 */
export function buildRetouchInstruction(instruction: string): string {
  const req = (instruction ?? "").trim().slice(0, CUSTOM_PROMPT_MAX)
  return [
    `Apply this edit requested by the seller: ${req}`,
    IMPERFECTION_PRESERVE,
    REALISM_CLAUSE,
    NEGATIVE,
    PRESERVE_CLAUSE,
  ].join(". ") + "."
}

/**
 * 구도 베리에이션 지시(스펙 §STEP3) — 확정본을 입력으로 앵글·거리만 변형.
 * 피사체·스타일·개수·과분은 그대로 유지(재검수 없이 A컷 신뢰 승계).
 */
export const VARIATION_INSTRUCTION =
  "same subject, same styling, same fruit and count, vary only the camera angle and distance. Keep colors, bloom, and lighting mood identical. " +
  REALISM_CLAUSE +
  ". " +
  OPTICAL_CLAUSE +
  ". " +
  NEGATIVE +
  "."
