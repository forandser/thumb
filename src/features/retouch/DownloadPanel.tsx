"use client"

import { useEffect, useState } from "react"
import { t, fmt } from "@/lib/i18n"
import type { EditState } from "@/lib/image/types"
import { renderEdit } from "@/lib/image/render"
import { DOWNLOAD_PRESETS, DownloadPreset, canvasToBlob, downloadBlob } from "@/lib/image/download"
import { runSafeCheck, type SafeCheckResult, type SafeVerdict } from "@/lib/image/safe-check"
import { drawAiWatermark, embedAiMetadata } from "@/lib/image/ai-mark"

/**
 * 다운로드 패널 — 1080 PNG(기본) / 1080 JPG / 쿠팡 1000. 모두 정사각 출력.
 * 현재 크롭이 정사각이 아니면 가운데를 잘라 저장한다고 안내하고 [1:1 맞추기] 제공.
 *
 * 두 트랙 공용(스펙 §다운로드). AI 생성/편집 결과(aiApplied=true)는 인코딩 직후 AI 표시
 * 메타데이터를 삽입하고(embedAiMetadata), 워터마크 토글(기본 off)을 함께 노출한다.
 * onBeforeBlob은 인코딩 직전 최종 캔버스를 후처리하는 훅(제작 트랙의 한글 텍스트 오버레이).
 */
export function DownloadPanel({
  rotatedSource,
  edit,
  onFitSquare,
  aiApplied = false,
  onBeforeBlob,
}: {
  rotatedSource: HTMLCanvasElement | null
  edit: EditState
  onFitSquare: () => void
  /** AI 생성/편집 결과 — 메타데이터 삽입 + 워터마크 토글 + 안내를 켠다. */
  aiApplied?: boolean
  /** 인코딩 직전 캔버스 후처리(오버레이 등). 워터마크보다 먼저 적용된다. */
  onBeforeBlob?: (canvas: HTMLCanvasElement) => void
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [watermark, setWatermark] = useState(false)

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
      // 오버레이(상품명·가격) → 워터마크 순서로 최종 캔버스에 굽는다.
      onBeforeBlob?.(canvas)
      if (aiApplied && watermark) drawAiWatermark(canvas)
      let blob = await canvasToBlob(canvas, preset)
      // AI 결과는 인코딩 직후 메타데이터 삽입(항상). 실패해도 원본 blob으로 저장.
      if (aiApplied && blob) blob = await embedAiMetadata(blob)
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

      {aiApplied && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 12.5,
              fontWeight: 600,
              color: "var(--color-ink)",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={watermark}
              onChange={(e) => setWatermark(e.target.checked)}
            />
            {t.create.watermarkToggle}
          </label>
          <p style={{ margin: 0, fontSize: 11, color: "var(--color-ink-tertiary)", lineHeight: 1.5 }}>
            {t.create.aiMetaNote}
          </p>
        </div>
      )}

      <SafeCheckSection rotatedSource={rotatedSource} edit={edit} onBeforeBlob={onBeforeBlob} />
    </div>
  )
}

/**
 * 플랫폼 세이프 체크 — 쿠팡 규격(1000 정사각 JPEG)으로 최종 출력을 분석해 통과/경고/확인 안내.
 * 다운로드를 막지 않는다. 보정이 바뀌면 결과를 무효화하고 재검사를 안내한다.
 */
function SafeCheckSection({
  rotatedSource,
  edit,
  onBeforeBlob,
}: {
  rotatedSource: HTMLCanvasElement
  edit: EditState
  /** 인코딩 직전 후처리 훅(오버레이·필름 그레인). 검수를 실제 저장본 픽셀로 돌리기 위해 동일 적용. */
  onBeforeBlob?: (canvas: HTMLCanvasElement) => void
}) {
  const [result, setResult] = useState<SafeCheckResult | null>(null)
  const [stale, setStale] = useState(false)
  const [running, setRunning] = useState(false)

  // 보정이 바뀌면 이전 결과는 낡았지만 조용히 지우지 않고 "다시 검사" 안내와 함께 남긴다.
  // (결과가 이유 없이 사라지면 셀러가 당황함 — 재검사 유도가 더 친절.)
  useEffect(() => {
    setStale(true)
  }, [edit, rotatedSource, onBeforeBlob])

  const run = async () => {
    setRunning(true)
    try {
      const preset = DOWNLOAD_PRESETS.coupang
      const canvas = renderEdit(rotatedSource, edit, {
        withAdjustments: true,
        forceSquare: true,
        targetSize: preset.size,
      })
      // 검수=저장: 실제 다운로드와 동일하게 오버레이·필름 그레인 후처리를 적용한 뒤 검사한다.
      // (후처리 전 캔버스를 검사하면 흰 배경/상품비율 판정이 저장본과 어긋난다 — v0.6 결함 수정.)
      onBeforeBlob?.(canvas)
      const blob = await canvasToBlob(canvas, preset)
      setResult(runSafeCheck(canvas, blob ? blob.size : 0))
      setStale(false)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div
      style={{
        marginTop: 4,
        paddingTop: 12,
        borderTop: "1px solid var(--color-line)",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <h3 style={{ fontSize: 13.5, fontWeight: 800 }}>{t.safeCheck.title}</h3>
      <p style={{ margin: 0, fontSize: 11.5, color: "var(--color-ink-tertiary)", lineHeight: 1.5 }}>
        {t.safeCheck.intro}
      </p>
      <button
        type="button"
        onClick={run}
        disabled={running}
        style={{
          alignSelf: "flex-start",
          padding: "9px 14px",
          borderRadius: "var(--radius-sm)",
          border: "1px solid var(--color-line-strong)",
          background: "var(--color-bg-surface)",
          color: "var(--color-ink)",
          fontSize: 13,
          fontWeight: 700,
          cursor: running ? "default" : "pointer",
          opacity: running ? 0.6 : 1,
        }}
      >
        {running ? t.safeCheck.running : result ? `↻ ${t.safeCheck.rerun}` : `✓ ${t.safeCheck.run}`}
      </button>

      {result && stale && !running && (
        <p style={{ margin: 0, fontSize: 11.5, color: "var(--color-warning)", lineHeight: 1.5 }}>
          {t.safeCheck.stale}
        </p>
      )}

      {result && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {buildRows(result).map((row) => (
            <SafeRow key={row.key} verdict={row.verdict} label={row.label} detail={row.detail} />
          ))}
          <p
            style={{
              margin: "2px 0 0",
              fontSize: 11,
              color: "var(--color-ink-tertiary)",
              lineHeight: 1.5,
            }}
          >
            {t.safeCheck.coupangNote}
            <br />
            {t.safeCheck.smartstoreNote}
          </p>
        </div>
      )}
    </div>
  )
}

interface SafeRowData {
  key: string
  verdict: SafeVerdict
  label: string
  detail: string
}

/** 검사 결과 → 화면 행(라벨·판정·상세 문구). 문구는 여기서 i18n으로 조립한다. */
function buildRows(r: SafeCheckResult): SafeRowData[] {
  const pct = (v: number) => Math.round(v * 100)
  const mb = (bytes: number) => (bytes / (1024 * 1024)).toFixed(2)

  const area =
    r.productArea.ratio == null
      ? t.safeCheck.rowAreaUnknown
      : fmt(t.safeCheck.rowAreaVal, { pct: pct(r.productArea.ratio) })

  const center =
    r.centering.verdict === "check"
      ? t.safeCheck.rowCenterUnknown
      : r.centering.verdict === "pass"
        ? t.safeCheck.rowCenterOk
        : t.safeCheck.rowCenterWarn

  const white =
    r.whiteBg.verdict === "fail"
      ? fmt(t.safeCheck.rowWhiteBgFail, { pct: pct(r.whiteBg.ratio) })
      : fmt(t.safeCheck.rowWhiteBgVal, { pct: pct(r.whiteBg.ratio) })

  return [
    {
      key: "size",
      verdict: r.size.verdict,
      label: t.safeCheck.rowSize,
      detail: fmt(t.safeCheck.rowSizeVal, { w: r.size.w, h: r.size.h }),
    },
    {
      key: "file",
      verdict: r.fileSize.verdict,
      label: t.safeCheck.rowFile,
      detail: fmt(t.safeCheck.rowFileVal, { mb: mb(r.fileSize.bytes) }),
    },
    { key: "white", verdict: r.whiteBg.verdict, label: t.safeCheck.rowWhiteBg, detail: white },
    { key: "area", verdict: r.productArea.verdict, label: t.safeCheck.rowArea, detail: area },
    { key: "center", verdict: r.centering.verdict, label: t.safeCheck.rowCenter, detail: center },
    {
      key: "text",
      verdict: "check",
      label: t.safeCheck.rowText,
      detail: t.safeCheck.rowTextCheck,
    },
  ]
}

const VERDICT_STYLE: Record<SafeVerdict, { label: string; bg: string; color: string }> = {
  pass: { label: t.safeCheck.verdictPass, bg: "var(--color-success-soft, #e6f4ea)", color: "#1b7a3d" },
  warn: { label: t.safeCheck.verdictWarn, bg: "var(--color-warning-soft)", color: "#8a5a08" },
  fail: { label: t.safeCheck.verdictFail, bg: "var(--color-danger-soft, #fdecea)", color: "#a62a2a" },
  check: { label: t.safeCheck.verdictCheck, bg: "var(--color-bg-subtle)", color: "var(--color-ink-secondary)" },
}

function SafeRow({
  verdict,
  label,
  detail,
}: {
  verdict: SafeVerdict
  label: string
  detail: string
}) {
  const v = VERDICT_STYLE[verdict]
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
      <span
        style={{
          flexShrink: 0,
          padding: "2px 8px",
          borderRadius: "var(--radius-pill)",
          background: v.bg,
          color: v.color,
          fontSize: 10.5,
          fontWeight: 800,
          whiteSpace: "nowrap",
          marginTop: 1,
        }}
      >
        {v.label}
      </span>
      <div style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--color-ink)" }}>{label}</span>
        <span style={{ fontSize: 11, color: "var(--color-ink-tertiary)", lineHeight: 1.4 }}>
          {detail}
        </span>
      </div>
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
