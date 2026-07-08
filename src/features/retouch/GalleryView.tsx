"use client"

import { useRef, useState } from "react"
import { t, fmt } from "@/lib/i18n"
import { AI_COST_KRW } from "@/lib/ai/anthropic"
import { DOWNLOAD_PRESETS, type DownloadPreset } from "@/lib/image/download"
import { exportZip } from "@/lib/image/zip"
import { Modal } from "@/components/ui/Modal"
import { GalleryCard } from "./GalleryCard"
import type { BatchState, GalleryItem } from "./gallery-types"

const ACCEPT = "image/jpeg,image/png,image/webp"

function won(n: number): string {
  return `₩${n.toLocaleString("ko-KR")}`
}

/** 저장 시 가운데 1:1로 잘리는(정사각 아님) 사진인지 대략 판정(썸네일 비율 기준). */
function isItemSquare(item: GalleryItem): boolean {
  const swap = item.edit.rotate90 % 2 === 1
  const fw = swap ? item.thumbH : item.thumbW
  const fh = swap ? item.thumbW : item.thumbH
  const c = item.edit.crop
  const w = c ? c.w * fw : fw
  const h = c ? c.h * fh : fh
  const m = Math.max(w, h)
  return m <= 0 ? true : Math.abs(w - h) / m < 0.02
}

export function GalleryView({
  items,
  selected,
  onToggleSelect,
  onSelectAll,
  onClearSelection,
  onOpen,
  onRemove,
  onAddPhotos,
  addNotice,
  onDismissNotice,
  batch,
  onStartBatch,
  onCancelBatch,
  onRetry,
  hasKey,
  onNeedKey,
}: {
  items: GalleryItem[]
  selected: Set<string>
  onToggleSelect: (id: string) => void
  onSelectAll: () => void
  onClearSelection: () => void
  onOpen: (id: string) => void
  onRemove: (id: string) => void
  onAddPhotos: (files: FileList) => void
  addNotice: string | null
  onDismissNotice: () => void
  batch: BatchState
  onStartBatch: (ids: string[]) => void
  onCancelBatch: () => void
  onRetry: (id: string) => void
  hasKey: boolean
  onNeedKey: () => void
}) {
  const addInputRef = useRef<HTMLInputElement>(null)
  const [confirmBatch, setConfirmBatch] = useState(false)
  const [batchModal, setBatchModal] = useState(false)

  const selCount = selected.size
  const targetIds = selCount > 0 ? [...selected] : items.map((i) => i.id)
  const targets = items.filter((i) => targetIds.includes(i.id))

  const openBatchConfirm = () => {
    if (!hasKey) {
      onNeedKey()
      return
    }
    setConfirmBatch(true)
  }
  const startBatch = () => {
    setConfirmBatch(false)
    setBatchModal(true)
    onStartBatch(targetIds)
  }

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: "20px" }}>
      {/* 헤더 */}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 14,
          flexWrap: "wrap",
        }}
      >
        <h2 style={{ fontSize: 20, fontWeight: 800 }}>
          {t.gallery.title}{" "}
          <span style={{ color: "var(--color-ink-tertiary)", fontWeight: 700 }}>
            {items.length}
            {t.gallery.countSuffix}
          </span>
        </h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={onSelectAll} style={miniBtn}>
            {t.gallery.selectAll}
          </button>
          <button
            type="button"
            onClick={onClearSelection}
            disabled={selCount === 0}
            style={{ ...miniBtn, opacity: selCount === 0 ? 0.45 : 1 }}
          >
            {t.gallery.clearSelection}
            {selCount > 0 ? ` (${selCount})` : ""}
          </button>
        </div>
      </div>

      {/* 추가 안내(초과·건너뜀) */}
      {addNotice && (
        <div
          role="alert"
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
            marginBottom: 14,
            padding: "10px 12px",
            borderRadius: "var(--radius-sm)",
            background: "var(--color-warning-soft)",
            border: "1px solid #f0d199",
            color: "#8a5a08",
            fontSize: 12.5,
            lineHeight: 1.6,
            whiteSpace: "pre-line",
          }}
        >
          <span aria-hidden>⚠️</span>
          <span style={{ flex: 1 }}>{addNotice}</span>
          <button
            type="button"
            onClick={onDismissNotice}
            aria-label={t.keySettings.close}
            style={{
              flexShrink: 0,
              border: "none",
              background: "none",
              color: "inherit",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* 그리드 */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
          gap: 12,
        }}
      >
        {items.map((item) => (
          <GalleryCard
            key={item.id}
            item={item}
            selected={selected.has(item.id)}
            onToggleSelect={() => onToggleSelect(item.id)}
            onOpen={() => onOpen(item.id)}
            onRemove={() => onRemove(item.id)}
            onRetry={() => onRetry(item.id)}
          />
        ))}

        {/* + 사진 추가 카드 */}
        <button
          type="button"
          onClick={() => addInputRef.current?.click()}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            minHeight: 140,
            aspectRatio: "1 / 1",
            borderRadius: "var(--radius-md)",
            border: "2px dashed var(--color-line-strong)",
            background: "var(--color-bg-subtle)",
            color: "var(--color-ink-tertiary)",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          <span style={{ fontSize: 28 }} aria-hidden>
            +
          </span>
          {t.gallery.addPhoto}
        </button>
        <input
          ref={addInputRef}
          type="file"
          accept={ACCEPT}
          multiple
          onChange={(e) => {
            if (e.target.files && e.target.files.length) onAddPhotos(e.target.files)
            e.target.value = ""
          }}
          style={{ display: "none" }}
        />
      </div>

      {/* 하단 액션바 */}
      <div
        style={{
          position: "sticky",
          bottom: 0,
          marginTop: 18,
          padding: "12px 0",
          background: "linear-gradient(to top, var(--color-bg-page) 70%, transparent)",
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <button type="button" onClick={openBatchConfirm} style={primaryBar}>
          ✨{" "}
          {selCount > 0
            ? fmt(t.gallery.batchAiSelected, { n: selCount })
            : fmt(t.gallery.batchAiAll, { n: items.length })}
        </button>
        <ZipButton items={targets} label={
          selCount > 0
            ? fmt(t.gallery.downloadSelected, { n: selCount })
            : fmt(t.gallery.downloadAll, { n: items.length })
        } />
      </div>

      {/* AI 일괄 확인 다이얼로그 */}
      <Modal
        open={confirmBatch}
        onClose={() => setConfirmBatch(false)}
        title={t.batch.confirmTitle}
        maxWidth={420}
      >
        <p style={{ fontSize: 14, color: "var(--color-ink)", lineHeight: 1.6, marginBottom: 6 }}>
          {fmt(t.batch.confirmBody, { n: targetIds.length })}
        </p>
        <p style={{ fontSize: 13, color: "var(--color-ink-secondary)", marginBottom: 20 }}>
          {fmt(t.batch.confirmCost, { krw: won(targetIds.length * AI_COST_KRW) })}
        </p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" onClick={() => setConfirmBatch(false)} style={ghostBtn}>
            {t.batch.cancel}
          </button>
          <button type="button" onClick={startBatch} style={primaryBtn}>
            {t.batch.confirmOk}
          </button>
        </div>
      </Modal>

      {/* AI 일괄 진행 모달 */}
      <Modal
        open={batchModal}
        onClose={() => {
          if (!batch.running) setBatchModal(false)
        }}
        title={t.batch.confirmTitle}
        maxWidth={420}
      >
        <ProgressBar done={batch.done} total={batch.total} />
        <p
          style={{
            fontSize: 13,
            color: "var(--color-ink-secondary)",
            marginTop: 10,
            marginBottom: 18,
          }}
        >
          {batch.running
            ? batch.cancelling
              ? t.batch.cancelling
              : `${t.batch.progress} ${batch.done}/${batch.total}`
            : fmt(t.batch.doneSummary, { done: batch.done - batch.failed, failed: batch.failed })}
        </p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          {batch.running ? (
            <button
              type="button"
              onClick={onCancelBatch}
              disabled={batch.cancelling}
              style={{ ...ghostBtn, opacity: batch.cancelling ? 0.5 : 1 }}
            >
              {t.batch.cancelRun}
            </button>
          ) : (
            <button type="button" onClick={() => setBatchModal(false)} style={primaryBtn}>
              {t.batch.close}
            </button>
          )}
        </div>
      </Modal>
    </div>
  )
}

/** ZIP 일괄 다운로드 버튼 + 형식 선택/진행 모달(자체 상태). */
function ZipButton({ items, label }: { items: GalleryItem[]; label: string }) {
  const [phase, setPhase] = useState<"closed" | "choose" | "running" | "done">("closed")
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [saved, setSaved] = useState(0)
  const abortRef = useRef<AbortController | null>(null)

  const anyNonSquare = items.some((i) => !isItemSquare(i))

  const run = async (preset: DownloadPreset) => {
    const controller = new AbortController()
    abortRef.current = controller
    setProgress({ done: 0, total: items.length })
    setPhase("running")
    try {
      const n = await exportZip(
        // AI 교체 소스가 있으면 그 파일을 굽고(다운로드=미리보기 픽셀 원칙), aiApplied면 메타 삽입.
        items.map((i) => ({ name: i.name, file: i.aiFile ?? i.file, edit: i.edit, aiApplied: !!i.aiFile })),
        preset,
        (done, total) => setProgress({ done, total }),
        controller.signal,
      )
      setSaved(n)
      setPhase("done")
    } catch {
      // 취소/실패 — 조용히 닫는다.
      setPhase("closed")
    }
  }

  const close = () => {
    if (phase === "running") abortRef.current?.abort()
    setPhase("closed")
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setPhase("choose")}
        disabled={items.length === 0}
        style={{ ...ghostBar, opacity: items.length === 0 ? 0.5 : 1 }}
      >
        ⬇ {label}
      </button>

      <Modal open={phase !== "closed"} onClose={close} title={t.zip.title} maxWidth={420}>
        {phase === "choose" && (
          <>
            <p style={{ fontSize: 13, color: "var(--color-ink-secondary)", marginBottom: 14 }}>
              {t.zip.chooseFormat}
            </p>
            {anyNonSquare && (
              <p
                style={{
                  fontSize: 12.5,
                  color: "#8a5a08",
                  background: "var(--color-warning-soft)",
                  border: "1px solid #f0d199",
                  borderRadius: "var(--radius-sm)",
                  padding: "8px 10px",
                  marginBottom: 14,
                  lineHeight: 1.5,
                }}
              >
                ⚠️ {t.zip.nonSquareWarn}
              </p>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button type="button" onClick={() => run(DOWNLOAD_PRESETS.png)} style={primaryBtn}>
                {t.download.png}
              </button>
              <button type="button" onClick={() => run(DOWNLOAD_PRESETS.jpg)} style={ghostBtn}>
                {t.download.jpg}
              </button>
              <button type="button" onClick={() => run(DOWNLOAD_PRESETS.coupang)} style={ghostBtn}>
                {t.download.coupang}
              </button>
            </div>
          </>
        )}
        {phase === "running" && (
          <>
            <ProgressBar done={progress.done} total={progress.total} />
            <p style={{ fontSize: 13, color: "var(--color-ink-secondary)", margin: "10px 0 18px" }}>
              {progress.done >= progress.total
                ? t.zip.zipping
                : `${t.zip.progress} ${progress.done}/${progress.total}`}
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button type="button" onClick={close} style={ghostBtn}>
                {t.zip.cancel}
              </button>
            </div>
          </>
        )}
        {phase === "done" && (
          <>
            <p style={{ fontSize: 14, color: "var(--color-ink)", marginBottom: 18 }}>
              {saved > 0 ? `✅ ${fmt(t.zip.doneMsg, { n: saved })}` : t.zip.emptyMsg}
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button type="button" onClick={() => setPhase("closed")} style={primaryBtn}>
                {t.zip.close}
              </button>
            </div>
          </>
        )}
      </Modal>
    </>
  )
}

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  return (
    <div
      style={{
        height: 10,
        borderRadius: "var(--radius-pill)",
        background: "var(--color-bg-subtle)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: `${pct}%`,
          height: "100%",
          background: "var(--color-primary)",
          transition: "width 0.2s",
        }}
      />
    </div>
  )
}

const miniBtn: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--color-line-strong)",
  background: "var(--color-bg-surface)",
  color: "var(--color-ink)",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
}

const primaryBar: React.CSSProperties = {
  flex: "1 1 220px",
  padding: "12px 18px",
  borderRadius: "var(--radius-sm)",
  border: "none",
  background: "var(--color-primary)",
  color: "#fff",
  fontSize: 14,
  fontWeight: 800,
  cursor: "pointer",
}

const ghostBar: React.CSSProperties = {
  flex: "1 1 220px",
  padding: "12px 18px",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--color-line-strong)",
  background: "var(--color-bg-surface)",
  color: "var(--color-ink)",
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
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
