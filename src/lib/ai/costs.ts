/**
 * 썸네일 제작 트랙 비용 상수 단일 출처 (KRW 고정 추정치).
 *
 * 원리: 비용 트래커·버튼 라벨·STEP2 예상 비용이 모두 여기 한 곳을 본다.
 * v0.8 모델 2티어: 생성 비용이 품질(기본 3.1 Flash / 최고 3 Pro)에 따라 갈린다.
 *   - 기본(GENERATE_COST_DEFAULT=95): 나노바나나 기본 모델(=GEMINI_COST_KRW). 보정 트랙 편집도 이 값.
 *   - 최고(GENERATE_COST_PRO=190): 3 Pro 모델.
 * 진단(anthropic.AI_COST_KRW=30)·검수(75)와 값 정의가 흩어지지 않도록,
 * 기본 생성 95원은 GEMINI_COST_KRW를 재사용해 이중 정의를 막는다.
 */
import { GEMINI_COST_KRW, type GeminiQuality } from "./gemini"

/** 클로드 재료/레퍼런스 분석 1콜(analyze.ts). */
export const ANALYZE_COST_KRW = 30

/** 나노바나나 기본 모델(3.1 Flash) 생성·재생성·리터치·베리에이션 장당(=GEMINI_COST_KRW). */
export const GENERATE_COST_DEFAULT = GEMINI_COST_KRW
/** 최고 품질(3 Pro) 생성 장당. */
export const GENERATE_COST_PRO = 190

/** 품질 티어 → 생성 장당 비용. onSpend·예상 비용이 공용으로 참조한다. */
export function generateCostFor(quality: GeminiQuality): number {
  return quality === "pro" ? GENERATE_COST_PRO : GENERATE_COST_DEFAULT
}

/** 클로드 A컷 13항목 검수 1콜(inspect.ts, 비전 2이미지). */
export const INSPECT_COST_KRW = 75

/** STEP2 예상 비용 분해. UI가 "분석 30 + (생성+검수)×N + 재생성 여유"로 병기한다. */
export interface CreateCostEstimate {
  /** 분석 1콜 비용. */
  analyze: number
  /** 후보 1장당 생성+검수 비용(품질에 따라 95+75 또는 190+75). */
  perCandidate: number
  /** 후보 수. */
  candidates: number
  /** 재생성 여유(회차 전체 2장 상한 = (생성+검수)×2). */
  retryReserve: number
  /** 재생성 여유까지 포함한 상한 추정 총액. */
  total: number
}

/**
 * 후보 수·품질 기준 예상 비용 산출.
 * 재생성은 후보당 1회·회차 전체 2장 상한(스펙 §품질 파이프라인 4)이므로
 * 여유분은 (생성+검수)×2로 고정한다. 품질(기본/최고)에 따라 생성 단가가 갈린다.
 */
export function estimateCreateCost(
  candidateCount: number,
  quality: GeminiQuality = "default",
): CreateCostEstimate {
  const n = Math.max(0, Math.floor(candidateCount))
  const perCandidate = generateCostFor(quality) + INSPECT_COST_KRW
  const retryReserve = perCandidate * 2
  return {
    analyze: ANALYZE_COST_KRW,
    perCandidate,
    candidates: n,
    retryReserve,
    total: ANALYZE_COST_KRW + perCandidate * n + retryReserve,
  }
}
