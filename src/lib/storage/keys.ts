/**
 * 저장소 키 중앙 정의 — 컴포넌트가 각자 다른 키 이름을 쓰는 사고 방지.
 * v0.1은 localStorage만 사용(암호화 IndexedDB는 AI 키를 실제로 쓰는 v0.2+에서 도입 검토).
 */
export const STORAGE_KEYS = {
  CLAUDE_KEY: "thumb:claude-key",
  GEMINI_KEY: "thumb:gemini-key",
  /** 내 보정 프리셋(색 4필드) — v0.3. */
  PRESETS: "thumb:presets",
} as const

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS]
