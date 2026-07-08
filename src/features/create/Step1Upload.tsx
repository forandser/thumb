"use client"

import { useRef } from "react"
import { t, fmt } from "@/lib/i18n"
import { validateImageFile } from "@/lib/image/validate"
import type { ImageSlot } from "./create-types"

/** 화질 경고 임계(가장 긴 변 px 미만이면 경고). 스펙 §STEP1. */
const QUALITY_MIN_SIDE = 1000

/**
 * STEP 1 — 사진 올리기. 재료(필수·픽셀 사용)와 레퍼런스(선택·참조 전용) 업로드.
 * 재료 저화질이면 경고 + 보정 탭 연결 버튼. 레퍼런스에는 '참조 전용' 뱃지·저작권 주의.
 * 실제 디코드·base64 생성은 부모(CreateWizard)가 담당하고 여기선 File 검증·표시만 한다.
 */
export function Step1Upload({
  material,
  reference,
  error,
  onPickMaterial,
  onPickReference,
  onRemoveMaterial,
  onRemoveReference,
  onGoRetouch,
}: {
  material: ImageSlot | null
  reference: ImageSlot | null
  error: string | null
  onPickMaterial: (file: File) => void
  onPickReference: (file: File) => void
  onRemoveMaterial: () => void
  onRemoveReference: () => void
  onGoRetouch: () => void
}) {
  const materialLow = !!material && material.maxSide < QUALITY_MIN_SIDE

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 16,
        }}
      >
        <SlotCard
          title={t.create.materialTitle}
          hint={t.create.materialHint}
          uploadLabel={t.create.materialUpload}
          slot={material}
          onPick={onPickMaterial}
          onRemove={onRemoveMaterial}
        >
          {materialLow && (
            <div style={warnBox}>
              <span>⚠️ {fmt(t.create.qualityLow, { px: material!.maxSide })}</span>
              <button type="button" onClick={onGoRetouch} style={warnBtn}>
                {t.create.qualityGoRetouch}
              </button>
            </div>
          )}
        </SlotCard>

        <SlotCard
          title={t.create.referenceTitle}
          hint={t.create.referenceHint}
          uploadLabel={t.create.referenceUpload}
          slot={reference}
          badge={t.create.referenceBadge}
          onPick={onPickReference}
          onRemove={onRemoveReference}
        />
      </div>

      <p style={copyrightNote}>⚠ {t.create.copyrightWarn}</p>

      {error && <p style={errorNote}>{error}</p>}
    </div>
  )
}

function SlotCard({
  title,
  hint,
  uploadLabel,
  slot,
  badge,
  onPick,
  onRemove,
  children,
}: {
  title: string
  hint: string
  uploadLabel: string
  slot: ImageSlot | null
  badge?: string
  onPick: (file: File) => void
  onRemove: () => void
  children?: React.ReactNode
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div style={slotCol}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <h3 style={{ fontSize: 14, fontWeight: 800 }}>{title}</h3>
        {badge && <span style={refBadge}>{badge}</span>}
      </div>
      <p style={{ margin: 0, fontSize: 12, color: "var(--color-ink-tertiary)", lineHeight: 1.5 }}>
        {hint}
      </p>

      {slot ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={slot.url}
            alt={title}
            style={{
              width: "100%",
              aspectRatio: "1 / 1",
              objectFit: "contain",
              background: "var(--color-bg-subtle)",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--color-line)",
            }}
          />
          <button type="button" onClick={onRemove} style={outlineBtn}>
            ↺ {t.create.removeImage}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          style={dropzone}
        >
          <span style={{ fontSize: 34 }} aria-hidden>
            📷
          </span>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--color-primary)" }}>
            + {uploadLabel}
          </span>
          <span style={{ fontSize: 11, color: "var(--color-ink-tertiary)" }}>
            {t.retouch.uploadFormats}
          </span>
        </button>
      )}

      {children}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f && validateImageFile(f).ok) onPick(f)
          e.target.value = ""
        }}
        style={{ display: "none" }}
      />
    </div>
  )
}

const slotCol: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
  padding: 18,
  borderRadius: "var(--radius-lg)",
  background: "var(--color-bg-surface)",
  border: "1px solid var(--color-line)",
}

const dropzone: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  minHeight: 220,
  padding: 24,
  borderRadius: "var(--radius-md)",
  border: "2px dashed var(--color-line-strong)",
  background: "var(--color-bg-subtle)",
  cursor: "pointer",
}

const refBadge: React.CSSProperties = {
  padding: "2px 8px",
  borderRadius: "var(--radius-pill)",
  background: "var(--color-warning-soft)",
  color: "#8a5a08",
  fontSize: 10.5,
  fontWeight: 800,
}

const warnBox: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  padding: "10px 12px",
  borderRadius: "var(--radius-sm)",
  background: "var(--color-warning-soft)",
  border: "1px solid #f0d199",
  fontSize: 12,
  color: "#8a5a08",
  lineHeight: 1.5,
}

const warnBtn: React.CSSProperties = {
  alignSelf: "flex-start",
  padding: "6px 12px",
  borderRadius: "var(--radius-xs)",
  border: "1px solid var(--color-warning)",
  background: "#fff",
  color: "#8a5a08",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
}

const outlineBtn: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--color-line-strong)",
  background: "var(--color-bg-surface)",
  color: "var(--color-ink)",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
}

const copyrightNote: React.CSSProperties = {
  margin: 0,
  padding: "10px 14px",
  borderRadius: "var(--radius-sm)",
  background: "var(--color-bg-subtle)",
  fontSize: 12,
  color: "var(--color-ink-secondary)",
  lineHeight: 1.6,
}

const errorNote: React.CSSProperties = {
  margin: 0,
  fontSize: 12.5,
  color: "var(--color-danger)",
  fontWeight: 600,
}
