"use client"

import { useEffect, useRef, useState } from "react"
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
  const [autoSaved, setAutoSaved] = useState(false)

  // 모달이 "열리는 순간"에만 저장된 값으로 입력칸을 동기화하고 플래시를 초기화한다.
  // (열려 있는 동안 keys가 바뀌어도 리셋하지 않는다 — 자동 저장이 keys를 바꾸는 순간
  //  방금 켠 "자동 저장됨" 표기를 같은 커밋에서 꺼버리던 결함 수정. prevOpen으로 열림 전환만 감지.)
  const prevOpen = useRef(false)
  useEffect(() => {
    const justOpened = open && !prevOpen.current
    prevOpen.current = open
    if (justOpened) {
      setClaude(keys.claude)
      setGemini(keys.gemini)
      setSavedFlash(false)
      setAutoSaved(false)
    }
  }, [open, keys.claude, keys.gemini])

  // v0.6 자동 저장 — 입력이 바뀌면 400ms 디바운스 후 저장(onSave)하고 "자동 저장됨" 표기.
  // 저장본과 같으면(열릴 때 동기화분·저장 직후) 스킵해 불필요한 저장·깜빡임을 막는다.
  useEffect(() => {
    if (!open) return
    if (claude.trim() === keys.claude && gemini.trim() === keys.gemini) return
    const id = window.setTimeout(() => {
      onSave({ claude, gemini })
      setAutoSaved(true)
      window.setTimeout(() => setAutoSaved(false), 1600)
    }, 400)
    return () => window.clearTimeout(id)
  }, [open, claude, gemini, keys.claude, keys.gemini, onSave])

  const handleSave = () => {
    onSave({ claude, gemini })
    setSavedFlash(true)
    window.setTimeout(() => setSavedFlash(false), 1600)
  }

  // 닫기 직전, 디바운스가 아직 저장하지 못한 편집이 남아 있으면 즉시 저장(flush)한다.
  // (키 붙여넣기 후 400ms 이내에 닫으면 대기 타이머가 취소돼 입력이 유실되던 경로 방지.)
  const handleClose = () => {
    if (claude.trim() !== keys.claude || gemini.trim() !== keys.gemini) {
      onSave({ claude, gemini })
    }
    onClose()
  }

  return (
    <>
      <Modal open={open} onClose={handleClose} title={t.keySettings.title} maxWidth={520}>
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
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
            marginTop: 20,
          }}
        >
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: autoSaved ? "var(--color-success)" : "var(--color-ink-tertiary)",
            }}
          >
            {autoSaved ? `✓ ${t.keySettings.autoSaved}` : t.keySettings.autoSaveHint}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={handleClose}
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
