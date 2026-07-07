"use client"

import { useEffect, useState } from "react"
import { Modal } from "@/components/ui/Modal"
import { HelpModal } from "./HelpModal"
import { t } from "@/lib/i18n"
import type { ApiKeys } from "@/lib/storage/api-keys"

/**
 * 키 설정 모달 — 클로드/구글 키 입력칸 2개 + 연결 상태등 + [연결 방법 보기].
 * 저장은 부모(useApiKeys)로 위임. 값 존재 여부만으로 상태등을 켠다.
 */
export function KeySettingsModal({
  open,
  onClose,
  keys,
  onSave,
}: {
  open: boolean
  onClose: () => void
  keys: ApiKeys
  onSave: (next: ApiKeys) => void
}) {
  const [claude, setClaude] = useState(keys.claude)
  const [gemini, setGemini] = useState(keys.gemini)
  const [showClaude, setShowClaude] = useState(false)
  const [showGemini, setShowGemini] = useState(false)
  const [help, setHelp] = useState<null | "claude" | "gemini">(null)
  const [savedFlash, setSavedFlash] = useState(false)

  // 모달이 열릴 때 저장된 값으로 입력칸을 동기화.
  useEffect(() => {
    if (open) {
      setClaude(keys.claude)
      setGemini(keys.gemini)
      setSavedFlash(false)
    }
  }, [open, keys.claude, keys.gemini])

  const handleSave = () => {
    onSave({ claude, gemini })
    setSavedFlash(true)
    window.setTimeout(() => setSavedFlash(false), 1600)
  }

  return (
    <>
      <Modal open={open} onClose={onClose} title={t.keySettings.title} maxWidth={520}>
        <p
          style={{
            fontSize: 13,
            color: "var(--color-ink-secondary)",
            marginBottom: 20,
            lineHeight: 1.5,
          }}
        >
          {t.keySettings.subtitle}
        </p>

        <KeyField
          label={t.keySettings.claudeLabel}
          placeholder={t.keySettings.claudePlaceholder}
          value={claude}
          onChange={setClaude}
          show={showClaude}
          onToggleShow={() => setShowClaude((v) => !v)}
          onHelp={() => setHelp("claude")}
        />

        <div style={{ height: 16 }} />

        <KeyField
          label={t.keySettings.geminiLabel}
          placeholder={t.keySettings.geminiPlaceholder}
          value={gemini}
          onChange={setGemini}
          show={showGemini}
          onToggleShow={() => setShowGemini((v) => !v)}
          onHelp={() => setHelp("gemini")}
        />

        {/* 프라이버시 문구 */}
        <p
          style={{
            marginTop: 20,
            fontSize: 12,
            color: "var(--color-ink-tertiary)",
            display: "flex",
            alignItems: "center",
            gap: 6,
            lineHeight: 1.5,
          }}
        >
          <span aria-hidden>🔒</span>
          {t.keySettings.privacy}
        </p>

        {/* 액션 */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "10px 18px",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--color-line-strong)",
              background: "var(--color-bg-surface)",
              color: "var(--color-ink)",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {t.keySettings.close}
          </button>
          <button
            type="button"
            onClick={handleSave}
            style={{
              padding: "10px 22px",
              borderRadius: "var(--radius-sm)",
              border: "none",
              background: savedFlash ? "var(--color-success)" : "var(--color-primary)",
              color: "#fff",
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
              minWidth: 96,
            }}
          >
            {savedFlash ? t.keySettings.saved : t.keySettings.save}
          </button>
        </div>
      </Modal>

      <HelpModal
        open={help !== null}
        onClose={() => setHelp(null)}
        initialTab={help ?? "claude"}
      />
    </>
  )
}

function KeyField({
  label,
  placeholder,
  value,
  onChange,
  show,
  onToggleShow,
  onHelp,
}: {
  label: string
  placeholder: string
  value: string
  onChange: (v: string) => void
  show: boolean
  onToggleShow: () => void
  onHelp: () => void
}) {
  const connected = value.trim().length > 0
  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 6,
        }}
      >
        <label style={{ fontSize: 13, fontWeight: 700, color: "var(--color-ink)" }}>{label}</label>
        {/* 연결 상태등 */}
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            fontSize: 11,
            fontWeight: 600,
            color: connected ? "var(--color-success)" : "var(--color-ink-tertiary)",
          }}
        >
          <span
            aria-hidden
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: connected ? "var(--color-success)" : "var(--color-line-strong)",
            }}
          />
          {connected ? t.keySettings.statusConnected : t.keySettings.statusEmpty}
        </span>
      </div>

      <div style={{ display: "flex", gap: 6 }}>
        <input
          type={show ? "text" : "password"}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          autoComplete="off"
          style={{
            flex: 1,
            padding: "10px 12px",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--color-line-strong)",
            background: "var(--color-bg-surface)",
            fontSize: 14,
            fontFamily: "var(--font-family)",
          }}
        />
        <button
          type="button"
          onClick={onToggleShow}
          style={{
            padding: "0 12px",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--color-line-strong)",
            background: "var(--color-bg-surface)",
            color: "var(--color-ink-secondary)",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          {show ? t.keySettings.hide : t.keySettings.show}
        </button>
      </div>

      <button
        type="button"
        onClick={onHelp}
        style={{
          marginTop: 6,
          padding: 0,
          border: "none",
          background: "none",
          color: "var(--color-primary)",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          textDecoration: "underline",
        }}
      >
        {t.keySettings.howTo} →
      </button>
    </div>
  )
}
