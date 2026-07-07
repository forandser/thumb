"use client"

import { t } from "@/lib/i18n"
import { EditState, RANGE, isFieldOver } from "@/lib/image/types"

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
