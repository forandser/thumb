"use client"

import { useRef, useState } from "react"
import { t, fmt } from "@/lib/i18n"
import { validateImageFile } from "@/lib/image/validate"
import type { ImageSlot } from "./create-types"

/** 이미지 파일만 걸러 배열로. 클릭 선택·드래그 드롭 공용(상한·초과 안내는 부모가 처리). */
function pickImageFiles(list: FileList | null): File[] {
  return Array.from(list ?? []).filter((f) => validateImageFile(f).ok)
}

/** 화질 경고 임계(가장 긴 변 px 미만이면 경고). 스펙 §STEP1. */
const QUALITY_MIN_SIDE = 1000

/**
 * STEP 1 — 사진 올리기. 재료(필수·픽셀 사용, 대표 1 + 보조 다수)와 레퍼런스(선택·참조 전용)를
 * 각각 그리드로 여러 장 업로드한다.
 * - 재료: 첫 장 자동 대표, 카드 클릭으로 대표 변경(대표 뱃지). 대표가 저화질이면 경고+보정 탭 버튼,
 *   보조 컷 저화질은 카드에 작은 '저화질' 뱃지만(대표만 픽셀 기준이라 차단 없음).
 * - 레퍼런스: 전 장 '참조 전용' 뱃지 + 저작권 주의.
 * 실제 디코드·base64 생성은 부모(CreateWizard)가 담당하고 여기선 File 검증·표시만 한다.
 */
export function Step1Upload({
  materials,
  heroIndex,
  references,
  materialMax,
  referenceMax,
  error,
  onAddMaterial,
  onRemoveMaterial,
  onSetHero,
  onAddReference,
  onRemoveReference,
  onGoRetouch,
}: {
  materials: ImageSlot[]
  heroIndex: number
  references: ImageSlot[]
  materialMax: number
  referenceMax: number
  error: string | null
  onAddMaterial: (files: File[]) => void
  onRemoveMaterial: (index: number) => void
  onSetHero: (index: number) => void
  onAddReference: (files: File[]) => void
  onRemoveReference: (index: number) => void
  onGoRetouch: () => void
}) {
  const heroLow =
    !!materials[heroIndex] && materials[heroIndex].maxSide < QUALITY_MIN_SIDE

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* 재료 섹션 */}
      <section style={sectionCard}>
        <div style={sectionHead}>
          <h3 style={{ fontSize: 14, fontWeight: 800 }}>{t.create.materialTitle}</h3>
          <span style={countTag}>
            {fmt(t.create.uploadCount, { n: materials.length, max: materialMax })}
          </span>
        </div>
        <p style={hintText}>{t.create.materialHint}</p>

        <div style={grid}>
          {materials.map((slot, i) => (
            <ImageTile
              key={slot.url}
              slot={slot}
              alt={fmt(t.create.materialTileAlt, { n: i + 1 })}
              isHero={i === heroIndex}
              heroLabel={t.create.heroBadge}
              lowLabel={
                i !== heroIndex && slot.maxSide < QUALITY_MIN_SIDE
                  ? t.create.lowQualityBadge
                  : null
              }
              onClick={i === heroIndex ? undefined : () => onSetHero(i)}
              setHeroTitle={t.create.setHero}
              onRemove={() => onRemoveMaterial(i)}
              removeLabel={t.create.removeImage}
            />
          ))}
          {materials.length < materialMax && (
            <AddTile label={t.create.materialUpload} onPick={onAddMaterial} />
          )}
        </div>

        {heroLow && (
          <div style={warnBox}>
            <span>⚠️ {fmt(t.create.qualityLow, { px: materials[heroIndex].maxSide })}</span>
            <button type="button" onClick={onGoRetouch} style={warnBtn}>
              {t.create.qualityGoRetouch}
            </button>
          </div>
        )}
      </section>

      {/* 레퍼런스 섹션 */}
      <section style={sectionCard}>
        <div style={sectionHead}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h3 style={{ fontSize: 14, fontWeight: 800 }}>{t.create.referenceTitle}</h3>
            <span style={refBadge}>{t.create.referenceBadge}</span>
          </div>
          <span style={countTag}>
            {fmt(t.create.uploadCount, { n: references.length, max: referenceMax })}
          </span>
        </div>
        <p style={hintText}>{t.create.referenceHint}</p>

        <div style={grid}>
          {references.map((slot, i) => (
            <ImageTile
              key={slot.url}
              slot={slot}
              alt={fmt(t.create.referenceTileAlt, { n: i + 1 })}
              badge={t.create.referenceBadge}
              onRemove={() => onRemoveReference(i)}
              removeLabel={t.create.removeImage}
            />
          ))}
          {references.length < referenceMax && (
            <AddTile label={t.create.referenceUpload} onPick={onAddReference} />
          )}
        </div>
      </section>

      <p style={copyrightNote}>⚠ {t.create.copyrightWarn}</p>

      {error && <p style={errorNote}>{error}</p>}
    </div>
  )
}

/** 업로드된 사진 1장 타일 — 대표 뱃지·저화질 뱃지·대표 지정 클릭·삭제. */
function ImageTile({
  slot,
  alt,
  isHero,
  heroLabel,
  lowLabel,
  badge,
  onClick,
  setHeroTitle,
  onRemove,
  removeLabel,
}: {
  slot: ImageSlot
  alt: string
  isHero?: boolean
  heroLabel?: string
  lowLabel?: string | null
  badge?: string
  onClick?: () => void
  setHeroTitle?: string
  onRemove: () => void
  removeLabel: string
}) {
  const clickable = !!onClick
  return (
    <div style={{ position: "relative" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={slot.url}
        alt={alt}
        onClick={onClick}
        title={clickable ? setHeroTitle : undefined}
        style={{
          width: "100%",
          aspectRatio: "1 / 1",
          objectFit: "cover",
          background: "var(--color-bg-subtle)",
          borderRadius: "var(--radius-md)",
          border: isHero ? "2px solid var(--color-primary)" : "1px solid var(--color-line)",
          cursor: clickable ? "pointer" : "default",
          display: "block",
        }}
      />
      {isHero && heroLabel && <span style={heroTag}>★ {heroLabel}</span>}
      {badge && <span style={tileRefTag}>{badge}</span>}
      {lowLabel && <span style={lowTag}>{lowLabel}</span>}
      <button type="button" onClick={onRemove} aria-label={removeLabel} title={removeLabel} style={removeBtn}>
        ✕
      </button>
    </div>
  )
}

/**
 * 사진 추가 타일 — 클릭 선택 + 드래그&드롭(v0.7, 보정 트랙 UploadDropzone 패턴 이식).
 * 일괄 선택·다중 드롭분은 한 번에 배열로 넘겨 상한 판정·초과 안내를 부모가 일관 처리한다.
 * 드래그 오버 시 테두리·배경을 강조해 놓을 위치를 알린다.
 */
function AddTile({ label, onPick }: { label: string; onPick: (files: File[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        const files = pickImageFiles(e.dataTransfer.files)
        if (files.length) onPick(files)
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") inputRef.current?.click()
      }}
      style={{
        ...addTile,
        borderColor: dragging ? "var(--color-primary)" : "var(--color-line-strong)",
        background: dragging ? "var(--color-primary-soft)" : "var(--color-bg-subtle)",
        transition: "background 0.15s, border-color 0.15s",
      }}
    >
      <span style={{ fontSize: 28 }} aria-hidden>
        ＋
      </span>
      <span style={{ fontSize: 12, fontWeight: 700, color: "var(--color-primary)", textAlign: "center" }}>
        {label}
      </span>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        onChange={(e) => {
          const files = pickImageFiles(e.target.files)
          if (files.length) onPick(files)
          e.target.value = ""
        }}
        style={{ display: "none" }}
      />
    </div>
  )
}

const sectionCard: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
  padding: 18,
  borderRadius: "var(--radius-lg)",
  background: "var(--color-bg-surface)",
  border: "1px solid var(--color-line)",
}

const sectionHead: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  flexWrap: "wrap",
}

const hintText: React.CSSProperties = {
  margin: 0,
  fontSize: 12,
  color: "var(--color-ink-tertiary)",
  lineHeight: 1.5,
}

const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
  gap: 10,
}

const countTag: React.CSSProperties = {
  fontSize: 11.5,
  fontWeight: 700,
  color: "var(--color-ink-tertiary)",
}

const addTile: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  aspectRatio: "1 / 1",
  padding: 8,
  borderRadius: "var(--radius-md)",
  border: "2px dashed var(--color-line-strong)",
  background: "var(--color-bg-subtle)",
  cursor: "pointer",
  textAlign: "center",
}

const heroTag: React.CSSProperties = {
  position: "absolute",
  top: 6,
  left: 6,
  padding: "2px 8px",
  borderRadius: "var(--radius-pill)",
  background: "var(--color-primary)",
  color: "#fff",
  fontSize: 10.5,
  fontWeight: 800,
}

const tileRefTag: React.CSSProperties = {
  position: "absolute",
  top: 6,
  left: 6,
  padding: "2px 8px",
  borderRadius: "var(--radius-pill)",
  background: "var(--color-warning-soft)",
  color: "#8a5a08",
  fontSize: 10,
  fontWeight: 800,
}

const lowTag: React.CSSProperties = {
  position: "absolute",
  bottom: 6,
  left: 6,
  padding: "2px 7px",
  borderRadius: "var(--radius-pill)",
  background: "rgba(138,90,8,0.9)",
  color: "#fff",
  fontSize: 10,
  fontWeight: 800,
}

const removeBtn: React.CSSProperties = {
  position: "absolute",
  top: 6,
  right: 6,
  width: 22,
  height: 22,
  borderRadius: "50%",
  border: "none",
  background: "rgba(0,0,0,0.55)",
  color: "#fff",
  fontSize: 12,
  lineHeight: 1,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
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
