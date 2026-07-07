"use client"

import { useEffect } from "react"

/**
 * 재사용 모달 셸 — 배경 딤 + 카드. ESC/배경 클릭으로 닫힘.
 * v0.1에 필요한 최소 기능만(포커스 트랩 등은 접근성 개선 시 추가).
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  maxWidth = 560,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  maxWidth?: number
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    // 배경 스크롤 잠금 — 이전 값을 저장해 닫힐 때 복원(중첩 모달도 안전).
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(20, 24, 33, 0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        zIndex: 100,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth,
          maxHeight: "90vh",
          overflowY: "auto",
          background: "var(--color-bg-surface)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-modal)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "18px 22px",
            borderBottom: "1px solid var(--color-line)",
            position: "sticky",
            top: 0,
            background: "var(--color-bg-surface)",
            borderTopLeftRadius: "var(--radius-lg)",
            borderTopRightRadius: "var(--radius-lg)",
          }}
        >
          <h2 style={{ fontSize: 17, fontWeight: 800, color: "var(--color-ink)" }}>{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            style={{
              width: 32,
              height: 32,
              borderRadius: "var(--radius-xs)",
              border: "1px solid var(--color-line-strong)",
              background: "var(--color-bg-surface)",
              color: "var(--color-ink-secondary)",
              fontSize: 18,
              lineHeight: 1,
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>
        <div style={{ padding: 22 }}>{children}</div>
      </div>
    </div>
  )
}
