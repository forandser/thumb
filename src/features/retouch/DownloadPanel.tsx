"use client"

import { useState } from "react"
import { t } from "@/lib/i18n"
import type { EditState } from "@/lib/image/types"
import { renderEdit } from "@/lib/image/render"
import { DOWNLOAD_PRESETS, DownloadPreset, canvasToBlob, downloadBlob } from "@/lib/image/download"

/**
 * 다운로드 패널 — 1080 PNG(기본) / 1080 JPG / 쿠팡 1000. 모두 정사각 출력.
 * 현재 크롭이 정사각이 아니면 가운데를 잘라 저장한다고 안내하고 [1:1 맞추기] 제공.
 */
export function DownloadPanel({
  rotatedSource,
  edit,
  onFitSquare,
}: {
  rotatedSource: HTMLCanvasElement | null
  edit: EditState
  onFitSquare: () => void
}) {
  const [busy, setBusy] = useState<string | null>(null)

  const effective = effectiveCropDims(rotatedSource, edit)
  const isSquare = effective ? Math.abs(effective.w - effective.h) / Math.max(effective.w, effective.h) < 0.01 : true

  const doDownload = async (preset: DownloadPreset) => {
    if (!rotatedSource) return
    setBusy(preset.id)
    try {
      const canvas = renderEdit(rotatedSource, edit, {
        withAdjustments: true,
        forceSquare: true,
        targetSize: preset.size,
      })
      const blob = await canvasToBlob(canvas, preset)
      if (blob) downloadBlob(blob, preset.filename)
    } finally {
      setBusy(null)
    }
  }

  if (!rotatedSource) {
    return (
      <div
        style={{
          padding: 16,
          borderRadius: "var(--radius-md)",
          background: "var(--color-bg-subtle)",
          fontSize: 13,
          color: "var(--color-ink-tertiary)",
          textAlign: "center",
        }}
      >
        {t.download.needImage}
      </div>
    )
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <h3 style={{ fontSize: 14, fontWeight: 800 }}>{t.download.title}</h3>

      {!isSquare && (
        <div
          style={{
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
          }}
        >
          <span>⚠️ {t.download.notSquareWarn}</span>
          <button
            type="button"
            onClick={onFitSquare}
            style={{
              alignSelf: "flex-start",
              padding: "6px 12px",
              borderRadius: "var(--radius-xs)",
              border: "1px solid var(--color-warning)",
              background: "#fff",
              color: "#8a5a08",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {t.download.fitSquare}
          </button>
        </div>
      )}

      <DownloadButton
        primary
        label={t.download.png}
        note={t.download.pngNote}
        busy={busy === DOWNLOAD_PRESETS.png.id}
        onClick={() => doDownload(DOWNLOAD_PRESETS.png)}
      />
      <DownloadButton
        label={t.download.jpg}
        note={t.download.jpgNote}
        busy={busy === DOWNLOAD_PRESETS.jpg.id}
        onClick={() => doDownload(DOWNLOAD_PRESETS.jpg)}
      />
      <DownloadButton
        label={t.download.coupang}
        note={t.download.coupangNote}
        busy={busy === DOWNLOAD_PRESETS.coupang.id}
        onClick={() => doDownload(DOWNLOAD_PRESETS.coupang)}
      />
    </div>
  )
}

function DownloadButton({
  label,
  note,
  primary = false,
  busy,
  onClick,
}: {
  label: string
  note: string
  primary?: boolean
  busy: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: 2,
        padding: "12px 16px",
        borderRadius: "var(--radius-sm)",
        border: primary ? "none" : "1px solid var(--color-line-strong)",
        background: primary ? "var(--color-primary)" : "var(--color-bg-surface)",
        color: primary ? "#fff" : "var(--color-ink)",
        cursor: busy ? "default" : "pointer",
        textAlign: "left",
        opacity: busy ? 0.7 : 1,
      }}
    >
      <span style={{ fontSize: 14, fontWeight: 700 }}>
        {busy ? t.download.saving : `⬇ ${label}`}
      </span>
      <span
        style={{
          fontSize: 11,
          color: primary ? "rgba(255,255,255,0.85)" : "var(--color-ink-tertiary)",
        }}
      >
        {note}
      </span>
    </button>
  )
}

/** 현재 편집의 유효 크롭(rotate90 소스 기준) 픽셀 크기. */
function effectiveCropDims(
  rs: HTMLCanvasElement | null,
  edit: EditState,
): { w: number; h: number } | null {
  if (!rs) return null
  if (!edit.crop) return { w: rs.width, h: rs.height }
  return { w: edit.crop.w * rs.width, h: edit.crop.h * rs.height }
}
