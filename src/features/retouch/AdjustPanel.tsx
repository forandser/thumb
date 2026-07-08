"use client"

import { useState } from "react"
import { t, fmt } from "@/lib/i18n"
import { EditState, RANGE, isFieldOver } from "@/lib/image/types"
import { usePresets, type PresetColor } from "@/lib/storage/presets"

/**
 * 좌측 보정 패널 — 크롭 진입, 회전·수평, 밝기/대비/채도/색온도 슬라이더, 실행취소/원본복원.
 * 슬라이더는 onChange(라이브 미리보기) + onCommit(놓을 때 히스토리 저장)로 분리한다.
 */
export function AdjustPanel({
  edit,
  onChange,
  onCommit,
  onRotate,
  onEnterCrop,
  onUndo,
  onReset,
  canUndo,
  canReset,
}: {
  edit: EditState
  onChange: (partial: Partial<EditState>) => void
  onCommit: () => void
  onRotate: (dir: -1 | 1) => void
  onEnterCrop: () => void
  onUndo: () => void
  onReset: () => void
  canUndo: boolean
  canReset: boolean
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* 크롭 */}
      <Group title={t.retouch.cropGroup}>
        <button type="button" onClick={onEnterCrop} style={secondaryBtn}>
          ✂ {t.retouch.cropEnter}
        </button>
      </Group>

      {/* 회전 · 수평 */}
      <Group title={t.retouch.rotateGroup}>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={() => onRotate(-1)} style={{ ...secondaryBtn, flex: 1 }}>
            ↺ {t.retouch.rotateLeft}
          </button>
          <button type="button" onClick={() => onRotate(1)} style={{ ...secondaryBtn, flex: 1 }}>
            ↻ {t.retouch.rotateRight}
          </button>
        </div>
        <Slider
          label={t.retouch.fineAngle}
          value={edit.fineAngle}
          min={RANGE.fineAngle.min}
          max={RANGE.fineAngle.max}
          step={0.5}
          suffix="°"
          onChange={(v) => onChange({ fineAngle: v })}
          onCommit={onCommit}
        />
      </Group>

      {/* 색 · 밝기 */}
      <Group title={t.retouch.colorGroup}>
        <Slider
          label={t.retouch.brightness}
          value={edit.brightness}
          min={RANGE.brightness.min}
          max={RANGE.brightness.max}
          warn={isFieldOver("brightness", edit.brightness)}
          onChange={(v) => onChange({ brightness: v })}
          onCommit={onCommit}
        />
        <Slider
          label={t.retouch.contrast}
          value={edit.contrast}
          min={RANGE.contrast.min}
          max={RANGE.contrast.max}
          onChange={(v) => onChange({ contrast: v })}
          onCommit={onCommit}
        />
        <Slider
          label={t.retouch.saturation}
          value={edit.saturation}
          min={RANGE.saturation.min}
          max={RANGE.saturation.max}
          warn={isFieldOver("saturation", edit.saturation)}
          onChange={(v) => onChange({ saturation: v })}
          onCommit={onCommit}
        />
        <Slider
          label={t.retouch.temperature}
          value={edit.temperature}
          min={RANGE.temperature.min}
          max={RANGE.temperature.max}
          warn={isFieldOver("temperature", edit.temperature)}
          leftHint={t.retouch.tempCool}
          rightHint={t.retouch.tempWarm}
          onChange={(v) => onChange({ temperature: v })}
          onCommit={onCommit}
        />
      </Group>

      {/* 내 프리셋(색 4필드) */}
      <PresetsGroup edit={edit} onChange={onChange} onCommit={onCommit} />

      {/* 과보정 경고 */}
      {(isFieldOver("saturation", edit.saturation) ||
        isFieldOver("brightness", edit.brightness) ||
        isFieldOver("temperature", edit.temperature)) && (
        <div
          style={{
            display: "flex",
            gap: 8,
            padding: "10px 12px",
            borderRadius: "var(--radius-sm)",
            background: "var(--color-warning-soft)",
            border: "1px solid #f0d199",
            fontSize: 12,
            color: "#8a5a08",
            lineHeight: 1.5,
          }}
        >
          <span aria-hidden>⚠️</span>
          <span>{t.retouch.overWarn}</span>
        </div>
      )}

      {/* 실행취소 · 원본복원 */}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          style={{ ...secondaryBtn, flex: 1, opacity: canUndo ? 1 : 0.45 }}
        >
          ⟲ {t.retouch.undo}
        </button>
        <button
          type="button"
          onClick={onReset}
          disabled={!canReset}
          style={{ ...secondaryBtn, flex: 1, opacity: canReset ? 1 : 0.45 }}
        >
          {t.retouch.reset}
        </button>
      </div>
    </div>
  )
}

/**
 * 내 프리셋 — 색 보정 4필드만 저장/적용(크롭·회전 제외). 전역 localStorage.
 * 적용은 색 4필드만 병합하므로 크롭·회전·"다른 사진 일괄 적용"과 자연스럽게 조합된다.
 */
function PresetsGroup({
  edit,
  onChange,
  onCommit,
}: {
  edit: EditState
  onChange: (partial: Partial<EditState>) => void
  onCommit: () => void
}) {
  const { presets, add, remove, atLimit } = usePresets()
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState("")
  const [notice, setNotice] = useState<string | null>(null)

  const currentColor: PresetColor = {
    brightness: edit.brightness,
    contrast: edit.contrast,
    saturation: edit.saturation,
    temperature: edit.temperature,
  }

  const startNaming = () => {
    if (atLimit) {
      setNotice(t.presets.limitReached)
      return
    }
    setNotice(null)
    setName(fmt(t.presets.defaultName, { n: presets.length + 1 }))
    setNaming(true)
  }

  const confirmSave = () => {
    const ok = add(name, currentColor)
    if (!ok) {
      setNotice(t.presets.limitReached)
      return
    }
    setNaming(false)
    setName("")
  }

  const apply = (color: PresetColor) => {
    onChange({
      brightness: color.brightness,
      contrast: color.contrast,
      saturation: color.saturation,
      temperature: color.temperature,
    })
    onCommit()
  }

  const del = (id: string) => {
    if (typeof window !== "undefined" && !window.confirm(t.presets.deleteConfirm)) return
    remove(id)
  }

  return (
    <Group title={t.presets.title}>
      {naming ? (
        <div style={{ display: "flex", gap: 6 }}>
          <input
            type="text"
            value={name}
            placeholder={t.presets.namePlaceholder}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") confirmSave()
              if (e.key === "Escape") setNaming(false)
            }}
            style={{
              flex: 1,
              minWidth: 0,
              padding: "8px 10px",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--color-line-strong)",
              background: "var(--color-bg-surface)",
              fontSize: 13,
              fontFamily: "var(--font-family)",
            }}
          />
          <button type="button" onClick={confirmSave} style={{ ...secondaryBtn, flexShrink: 0 }}>
            {t.presets.save}
          </button>
          <button
            type="button"
            onClick={() => setNaming(false)}
            style={{ ...secondaryBtn, flexShrink: 0 }}
          >
            {t.presets.cancel}
          </button>
        </div>
      ) : (
        <button type="button" onClick={startNaming} style={secondaryBtn}>
          ⭐ {t.presets.saveBtn}
        </button>
      )}

      {notice && (
        <p style={{ margin: 0, fontSize: 11.5, color: "var(--color-warning)", lineHeight: 1.5 }}>
          {notice}
        </p>
      )}

      {presets.length === 0 ? (
        <p style={{ margin: 0, fontSize: 11.5, color: "var(--color-ink-tertiary)", lineHeight: 1.5 }}>
          {t.presets.empty}
        </p>
      ) : (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {presets.map((p) => (
              <span
                key={p.id}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "5px 6px 5px 10px",
                  borderRadius: "var(--radius-pill)",
                  border: "1px solid var(--color-line-strong)",
                  background: "var(--color-bg-surface)",
                }}
              >
                <button
                  type="button"
                  onClick={() => apply(p.edit)}
                  style={{
                    border: "none",
                    background: "none",
                    color: "var(--color-ink)",
                    fontSize: 12.5,
                    fontWeight: 600,
                    cursor: "pointer",
                    padding: 0,
                    maxWidth: 140,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {p.name}
                </button>
                <button
                  type="button"
                  onClick={() => del(p.id)}
                  aria-label={t.presets.delete}
                  style={{
                    border: "none",
                    background: "none",
                    color: "var(--color-ink-tertiary)",
                    fontSize: 13,
                    lineHeight: 1,
                    cursor: "pointer",
                    padding: "0 2px",
                  }}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <p style={{ margin: 0, fontSize: 11, color: "var(--color-ink-tertiary)", lineHeight: 1.5 }}>
            {t.presets.applyHint}
          </p>
        </>
      )}
    </Group>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <h3
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: "var(--color-ink-tertiary)",
          letterSpacing: 0.3,
        }}
      >
        {title}
      </h3>
      {children}
    </section>
  )
}

function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  warn = false,
  suffix = "",
  leftHint,
  rightHint,
  onChange,
  onCommit,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  warn?: boolean
  suffix?: string
  leftHint?: string
  rightHint?: string
  onChange: (v: number) => void
  onCommit: () => void
}) {
  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 4,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600 }}>{label}</span>
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: warn ? "var(--color-warning)" : "var(--color-ink-secondary)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {value > 0 ? "+" : ""}
          {value}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        className={warn ? "warn" : undefined}
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={onCommit}
        onKeyUp={onCommit}
        onTouchEnd={onCommit}
      />
      {(leftHint || rightHint) && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 10,
            color: "var(--color-ink-tertiary)",
            marginTop: 2,
          }}
        >
          <span>{leftHint}</span>
          <span>{rightHint}</span>
        </div>
      )}
    </div>
  )
}

const secondaryBtn: React.CSSProperties = {
  padding: "9px 14px",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--color-line-strong)",
  background: "var(--color-bg-surface)",
  color: "var(--color-ink)",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
}
