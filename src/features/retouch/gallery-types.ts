/**
 * 갤러리(다중 사진) 도메인 모델.
 *
 * 메모리: 원본은 File 참조로만 들고(디스크 포인터), 카드에는 240px 축소본(objectURL)만.
 * 풀 작업 소스는 열려 있는 사진만 lazy 생성한다(Workbench 내부). EditState는 사진별로 보존.
 */
import type { EditState } from "@/lib/image/types"
import type { AiErrorCode } from "@/lib/ai/anthropic"

/** 일괄 AI 처리 중 카드에 보여줄 진행 상태(뱃지와 별개). idle = 진행 아님. */
export type AiStatus = "idle" | "queued" | "running" | "failed" | "canceled"

/** AI 픽셀 편집(누끼·화질) 직전 스냅샷 — "AI 적용 전으로" 1단계 되돌리기용. */
export interface AiUndo {
  /** 직전 AI 소스(File). undefined면 원본 파일을 쓰던 상태. */
  file?: File
  /** 직전 편집 상태(색·크롭·회전). */
  edit: EditState
  /** 직전 AI 코멘트. */
  comment?: string
}

export interface GalleryItem {
  id: string
  /** 원본 업로드 파일 — AI 편집으로 바뀌지 않는다("원본으로"·Before 비교의 기준). */
  file: File
  /**
   * AI 픽셀 편집(누끼·화질) 결과 File. 있으면 이 파일이 활성 작업 소스가 되고
   * 다운로드·ZIP·썸네일·미리보기가 모두 이 픽셀을 본다. undefined면 원본 사용.
   */
  aiFile?: File
  /** AI 편집 직전 스냅샷("AI 적용 전으로"). */
  aiUndo?: AiUndo
  /** 원본 파일명(다운로드 파일명·표시용). */
  name: string
  /** 240px 축소본 objectURL(카드 미리보기). revoke는 갤러리 소유. */
  thumbUrl: string
  thumbW: number
  thumbH: number
  /** 사진별 보정 상태(보존). */
  edit: EditState
  /**
   * edit의 "외부(부모) 변경" 버전. AI 진단이 edit를 덮어쓸 때만 증가한다.
   * 작업대는 이 값 변화를 감지해 자신의 편집 엔진을 재시드(결과 유실 방어선).
   */
  editVersion: number
  /** AI 보정 코멘트(있으면 "AI 보정됨" 계열). */
  aiComment?: string
  /** 일괄 처리 진행 상태. */
  aiStatus: AiStatus
  aiErrorCode?: AiErrorCode
}

export type Badge = "original" | "ai" | "manual"

/** 일괄 AI 보정 진행 상태(부모가 소유, 갤러리 진행 모달이 렌더). */
export interface BatchState {
  running: boolean
  done: number
  total: number
  failed: number
  cancelling: boolean
}
