"use client"

import { useState } from "react"
import { Modal } from "@/components/ui/Modal"
import { t, fmt } from "@/lib/i18n"

/**
 * "이 보정값을 다른 사진에도 적용" 다이얼로그.
 * 대상: 갤러리에서 체크한 장(selected) 또는 전체(all). 색 보정만 복사(크롭·회전 제외)는 부모가 처리.
 */
export function ApplyOthersDialog({
  open,
  onClose,
  selectedCount,
  totalOthers,
  onApply,
}: {
  open: boolean
  onClose: () => void
  selectedCount: number
  totalOthers: number
  onApply: (target: "selected" | "all") => number
}) {
  const [applied, setApplied] = useState<number | null>(null)

  const close = () => {
    setApplied(null)
    onClose()
  }

  const run = (target: "selected" | "all") => {
    const n = onApply(target)
    setApplied(n)
  }

  return (
    <Modal open={open} onClose={close} title={t.applyOthers.title} maxWidth={440}>
      {applied === null ? (
        <>
          <p
            style={{
              fontSize: 13,
              color: "var(--color-ink-secondary)",
              lineHeight: 1.6,
              marginBottom: 20,
            }}
          >
            {t.applyOthers.body}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <button
              type="button"
              onClick={() => run("selected")}
              disabled={selectedCount === 0}
              style={{
                ...primaryBtn,
                opacity: selectedCount === 0 ? 0.45 : 1,
                cursor: selectedCount === 0 ? "default" : "pointer",
              }}
            >
              {fmt(t.applyOthers.toSelected, { n: selectedCount })}
            </button>
            <button type="button" onClick={() => run("all")} style={ghostBtn}>
              {fmt(t.applyOthers.toAll, { n: totalOthers })}
            </button>
            {selectedCount === 0 && (
              <p style={{ fontSize: 12, color: "var(--color-ink-tertiary)", lineHeight: 1.5 }}>
                {t.applyOthers.needSelection}
              </p>
            )}
          </div>
        </>
      ) : (
        <>
          <p
            style={{
              fontSize: 14,
              color: "var(--color-ink)",
              lineHeight: 1.6,
              marginBottom: 20,
            }}
          >
            ✅ {fmt(t.applyOthers.applied, { n: applied })}
          </p>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button type="button" onClick={close} style={primaryBtn}>
              {t.zip.close}
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}

const primaryBtn: React.CSSProperties = {
  padding: "11px 18px",
  borderRadius: "var(--radius-sm)",
  border: "none",
  background: "var(--color-primary)",
  color: "#fff",
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
}

const ghostBtn: React.CSSProperties = {
  padding: "11px 18px",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--color-line-strong)",
  background: "var(--color-bg-surface)",
  color: "var(--color-ink)",
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
}
