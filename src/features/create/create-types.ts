/**
 * 썸네일 제작(생성) 트랙 도메인 모델.
 *
 * 마법사 상태는 메모리에만 둔다(새로고침 시 초기화 허용 — 내부용, 스펙 §공통 규칙).
 * 재료 사진만 픽셀을 실제로 쓰고(aiBase64 보관), 레퍼런스는 분석 텍스트에만 반영한다
 * (픽셀 입력 금지 — 저작권 차단, 스펙 §STEP1). 후보 이미지는 dataURL로 들고 다닌다.
 */
import type { InspectionResult } from "@/lib/ai/inspect"
import type { AiErrorCode } from "@/lib/ai/anthropic"
import type { CreateMode } from "@/lib/create/prompt-engine"
import type { PresetKey } from "@/lib/create/presets"

/** 업로드된 이미지 슬롯(재료·레퍼런스 공용). aiBase64는 AI 전송용(접두사 없는 JPEG). */
export interface ImageSlot {
  file: File
  /** 미리보기 objectURL. 소유자(마법사)가 revoke 책임. */
  url: string
  /** 가장 긴 변(px) — 화질 검사·안내용. */
  maxSide: number
  /** AI 전송용 base64(접두사 없는 JPEG, ≤1024px). */
  aiBase64: string
}

/** 스타일 선택 — 프리셋 7종 중 하나 또는 레퍼런스 따라가기. */
export type StyleChoice = PresetKey | "reference"

/** 후보 1장의 진행/결과 상태. */
export type CandidateStatus =
  | "generating" // 생성 중
  | "inspecting" // 검수 중
  | "regenerating" // 재생성 중(불합격 → 힌트 붙여 다시)
  | "done" // 이미지 확보(검수 통과/미통과/생략 무관)
  | "failed" // 생성 자체 실패

export interface Candidate {
  id: string
  /** "후보 N" 라벨용 표시 번호. */
  index: number
  /** generated=검수 대상, variation=구도 베리에이션(재검수 없음). */
  kind: "generated" | "variation"
  status: CandidateStatus
  /** 현재 이미지(dataURL). 생성 성공 후 채워진다. */
  dataUrl?: string
  /** 검수 결과. inspectSkipped=true거나 아직 검수 전이면 undefined. */
  inspection?: InspectionResult
  /** 검수를 건너뛴 후보(클로드 키 없음 or 베리에이션). */
  inspectSkipped?: boolean
  /**
   * 검수 호출 자체가 실패(네트워크·서버 오류 등)했지만 생성은 성공한 후보.
   * 이미지·선택은 살려 두고(생성 실패와 구분) 뱃지로만 표시한다 — 검수는 보조 단계라
   * 실패해도 이미 과금된 후보를 폐기하지 않는다(스펙 §품질 파이프라인).
   */
  inspectError?: boolean
  /** 이 후보가 자동 재생성을 이미 1회 썼는지(후보당 1회 상한). */
  regenerated: boolean
  errorCode?: AiErrorCode
  /** 대화형 리터치 직전 이미지들(되돌리기용, 최근 3개까지). */
  retouchHistory?: string[]
  /** 리터치 진행 중 표시. */
  retouching?: boolean
}

/** 파이프라인 전체 진행 단계. */
export type PipelinePhase = "idle" | "running" | "done" | "canceled"

/** 파이프라인 시작 설정(prompt-engine 입력 + 재료 base64 + 후보 수). */
export interface PipelineConfig {
  /** 재료 사진 AI base64(실물 보존 편집 + 검수 대조 재료). */
  materialBase64: string
  mode: CreateMode
  /** 프리셋 key. 레퍼런스 따라가기면 null. */
  presetKey: PresetKey | null
  referenceStyle?: string
  variety?: string
  count?: number
  condition?: string
  candidateCount: number
}
