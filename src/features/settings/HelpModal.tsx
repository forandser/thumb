"use client"

import { useState } from "react"
import { Modal } from "@/components/ui/Modal"
import { t } from "@/lib/i18n"

type HelpTab = "claude" | "gemini"

/**
 * API 키 발급 방법 도움말 모달 — 탭 2개(클로드/구글), 각 1-2-3 단계 카드 + 공식 링크.
 * 키 설정 모달의 [연결 방법 보기]에서 열리며 initialTab으로 해당 탭을 먼저 보여준다.
 */
export function HelpModal({
  open,
  onClose,
  initialTab = "claude",
}: {
  open: boolean
  onClose: () => void
  initialTab?: HelpTab
}) {
  const [tab, setTab] = useState<HelpTab>(initialTab)

  // 열릴 때마다 요청된 탭으로 맞춘다.
  const [lastOpen, setLastOpen] = useState(false)
  if (open && !lastOpen) {
    setLastOpen(true)
    setTab(initialTab)
  }
  if (!open && lastOpen) setLastOpen(false)

  const isClaude = tab === "claude"
  const steps = isClaude ? t.help.claudeSteps : t.help.geminiSteps
  const link = isClaude ? t.help.claudeLink : t.help.geminiLink
  const linkLabel = isClaude ? t.help.claudeLinkLabel : t.help.geminiLinkLabel

  return (
    <Modal open={open} onClose={onClose} title={t.help.title} maxWidth={560}>
      {/* 탭 */}
      <div
        style={{
          display: "flex",
          gap: 4,
          background: "var(--color-bg-subtle)",
          borderRadius: "var(--radius-pill)",
          padding: 4,
          marginBottom: 18,
        }}
      >
        <HelpTabButton label={t.help.tabClaude} active={isClaude} onClick={() => setTab("claude")} />
        <HelpTabButton
          label={t.help.tabGemini}
          active={!isClaude}
          onClick={() => setTab("gemini")}
        />
      </div>

      {/* 단계 카드 */}
      <ol style={{ display: "flex", flexDirection: "column", gap: 10, margin: 0, padding: 0 }}>
        {steps.map((step, i) => (
          <li
            key={i}
            style={{
              display: "flex",
              gap: 12,
              alignItems: "flex-start",
              padding: 14,
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--color-line)",
              background: "var(--color-bg-subtle)",
              listStyle: "none",
            }}
          >
            <span
              aria-hidden
              style={{
                flexShrink: 0,
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: "var(--color-primary)",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 800,
                fontSize: 14,
              }}
            >
              {i + 1}
            </span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>{step.title}</div>
              <div style={{ fontSize: 13, color: "var(--color-ink-secondary)", lineHeight: 1.5 }}>
                {step.body}
              </div>
            </div>
          </li>
        ))}
      </ol>

      {/* 공식 링크 */}
      <a
        href={link}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          marginTop: 16,
          padding: "10px 16px",
          borderRadius: "var(--radius-sm)",
          background: "var(--color-primary)",
          color: "#fff",
          fontSize: 14,
          fontWeight: 700,
          textDecoration: "none",
        }}
      >
        {linkLabel}
        <span aria-hidden>↗</span>
      </a>

      {/* 프라이버시 문구 */}
      <p
        style={{
          marginTop: 16,
          fontSize: 12,
          color: "var(--color-ink-tertiary)",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span aria-hidden>🔒</span>
        {t.help.privacy}
      </p>
    </Modal>
  )
}

function HelpTabButton({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        padding: "8px 12px",
        borderRadius: "var(--radius-pill)",
        border: "none",
        background: active ? "var(--color-bg-surface)" : "transparent",
        color: active ? "var(--color-primary)" : "var(--color-ink-secondary)",
        fontSize: 14,
        fontWeight: active ? 700 : 500,
        cursor: "pointer",
        boxShadow: active ? "0 1px 4px rgba(20, 24, 33, 0.1)" : "none",
      }}
    >
      {label}
    </button>
  )
}
