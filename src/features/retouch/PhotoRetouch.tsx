"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { t } from "@/lib/i18n"
import { Crop, DEFAULT_EDIT, EditState, isDefaultEdit } from "@/lib/image/types"
import { makeRotatedSource, type Source } from "@/lib/image/render"
import { validateImageFile } from "@/lib/image/validate"
import { UploadDropzone } from "./UploadDropzone"
import { AdjustPanel } from "./AdjustPanel"
import { DownloadPanel } from "./DownloadPanel"
import { PreviewStage, CompareStage } from "./Stages"
import { CropStage } from "./CropStage"

type Mode = "preview" | "compare" | "crop"

/** 초대형 사진 다운스케일 상한(최대 변 px). 출력이 최대 1080이라 화질 손실 없음. */
const MAX_SOURCE = 4096

function editsEqual(a: EditState, b: EditState): boolean {
  return (
    a.brightness === b.brightness &&
    a.contrast === b.contrast &&
    a.saturation === b.saturation &&
    a.temperature === b.temperature &&
    a.rotate90 === b.rotate90 &&
    a.fineAngle === b.fineAngle &&
    JSON.stringify(a.crop) === JSON.stringify(b.crop)
  )
}

export function PhotoRetouch() {
  const [img, setImg] = useState<Source | null>(null)
  const [error, setError] = useState<string | null>(null)
  const objectUrlRef = useRef<string | null>(null)

  const [edit, setEdit] = useState<EditState>(DEFAULT_EDIT)
  const editRef = useRef<EditState>(DEFAULT_EDIT)
  const lastCommitted = useRef<EditState>(DEFAULT_EDIT)
  const [history, setHistory] = useState<EditState[]>([])
  const [mode, setMode] = useState<Mode>("preview")

  // 90° 회전만 반영한 소스 캔버스 — 슬라이더 드래그마다 재계산하지 않도록 메모.
  const rotatedSource = useMemo(
    () => (img ? makeRotatedSource(img, edit.rotate90) : null),
    [img, edit.rotate90],
  )

  // 측정된 스테이지 박스 크기
  const stageWrapRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState(520)
  useEffect(() => {
    const el = stageWrapRef.current
    if (!el || typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 520
      setBox(Math.max(240, Math.min(600, Math.floor(w))))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [img])

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    }
  }, [])

  const resetAllState = useCallback((next: EditState) => {
    editRef.current = next
    lastCommitted.current = next
    setEdit(next)
    setHistory([])
    setMode("preview")
  }, [])

  const handleFile = useCallback((file: File) => {
    // 업로드·교체 공통 검증 (형식/HEIC).
    const check = validateImageFile(file)
    if (!check.ok) {
      setError(check.message)
      return
    }
    setError(null)
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    const url = URL.createObjectURL(file)
    objectUrlRef.current = url
    const image = new Image()
    image.onload = () => {
      // 초대형 사진은 최대 변 4096px로 다운스케일해 작업 소스로 사용
      // (iOS 캔버스 면적 한도·메모리 보호). 조용히 내부 처리.
      const maxSide = Math.max(image.naturalWidth, image.naturalHeight)
      let source: Source = image
      if (maxSide > MAX_SOURCE) {
        const scale = MAX_SOURCE / maxSide
        const c = document.createElement("canvas")
        c.width = Math.max(1, Math.round(image.naturalWidth * scale))
        c.height = Math.max(1, Math.round(image.naturalHeight * scale))
        const cx = c.getContext("2d")
        if (cx) {
          cx.imageSmoothingEnabled = true
          cx.imageSmoothingQuality = "high"
          cx.drawImage(image, 0, 0, c.width, c.height)
          source = c
        }
      }
      setImg(source)
      setError(null)
      resetAllState(DEFAULT_EDIT)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      objectUrlRef.current = null
      setError(t.retouch.loadError)
    }
    image.src = url
  }, [resetAllState])

  // 라이브 변경(슬라이더) — 히스토리에 쌓지 않음
  const change = useCallback((partial: Partial<EditState>) => {
    setEdit((prev) => {
      const next = { ...prev, ...partial }
      editRef.current = next
      return next
    })
  }, [])

  // 커밋(슬라이더 놓을 때) — 직전 커밋 상태를 히스토리에 저장
  const commit = useCallback(() => {
    const cur = editRef.current
    if (!editsEqual(cur, lastCommitted.current)) {
      const prev = lastCommitted.current
      setHistory((h) => [...h, prev])
      lastCommitted.current = cur
    }
  }, [])

  // 이산 동작(회전/크롭 적용/1:1 맞추기/원본복원) — 적용과 동시에 히스토리 저장
  const applyCommit = useCallback((next: EditState) => {
    setHistory((h) => [...h, lastCommitted.current])
    lastCommitted.current = next
    editRef.current = next
    setEdit(next)
  }, [])

  const rotate = useCallback(
    (dir: -1 | 1) => {
      // 회전하면 이전 좌표계 크롭이 무효 → 크롭 해제.
      applyCommit({
        ...editRef.current,
        rotate90: (((editRef.current.rotate90 + dir) % 4) + 4) % 4,
        crop: null,
      })
    },
    [applyCommit],
  )

  const undo = useCallback(() => {
    if (history.length === 0) return
    const prev = history[history.length - 1]
    setHistory(history.slice(0, -1))
    lastCommitted.current = prev
    editRef.current = prev
    setEdit(prev)
    setMode((m) => (m === "crop" ? "preview" : m))
  }, [history])

  const reset = useCallback(() => {
    if (isDefaultEdit(editRef.current)) return
    applyCommit(DEFAULT_EDIT)
    setMode("preview")
  }, [applyCommit])

  const applyCrop = useCallback(
    (crop: Crop) => {
      applyCommit({ ...editRef.current, crop })
      setMode("preview")
    },
    [applyCommit],
  )

  const fitSquare = useCallback(() => {
    if (!rotatedSource) return
    const rw = rotatedSource.width
    const rh = rotatedSource.height
    const side = Math.min(rw, rh)
    const crop: Crop = {
      x: (rw - side) / 2 / rw,
      y: (rh - side) / 2 / rh,
      w: side / rw,
      h: side / rh,
    }
    applyCommit({ ...editRef.current, crop })
  }, [applyCommit, rotatedSource])

  if (!img || !rotatedSource) {
    return (
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 20px" }}>
        <UploadDropzone onFile={handleFile} error={error} />
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: "20px" }}>
      {/* 파일 오류 안내 (교체 실패·로드 실패) */}
      {error && (
        <div
          role="alert"
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
            marginBottom: 16,
            padding: "12px 14px",
            borderRadius: "var(--radius-sm)",
            background: "var(--color-danger-soft, #fdecea)",
            border: "1px solid var(--color-danger, #d64545)",
            color: "var(--color-danger, #a62a2a)",
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          <span aria-hidden>⚠️</span>
          <span style={{ flex: 1 }}>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            aria-label={t.keySettings.close}
            style={{
              flexShrink: 0,
              border: "none",
              background: "none",
              color: "inherit",
              fontSize: 15,
              lineHeight: 1,
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* 상단: 다른 사진 / 비교 토글 */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <button type="button" onClick={() => document.getElementById("thumb-replace")?.click()} style={outlineBtn}>
          ↺ {t.retouch.replace}
        </button>
        <input
          id="thumb-replace"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) handleFile(f)
            e.target.value = ""
          }}
          style={{ display: "none" }}
        />
        {mode !== "crop" && (
          <button
            type="button"
            onClick={() => setMode((m) => (m === "compare" ? "preview" : "compare"))}
            style={mode === "compare" ? primaryToggle : outlineBtn}
          >
            {mode === "compare" ? `✓ ${t.retouch.compareOn}` : `◨ ${t.retouch.compare}`}
          </button>
        )}
      </div>

      {/* 3열 레이아웃 */}
      <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
        {/* 좌: 보정 패널 */}
        {mode !== "crop" && (
          <aside style={panelCol}>
            <AdjustPanel
              edit={edit}
              onChange={change}
              onCommit={commit}
              onRotate={rotate}
              onEnterCrop={() => setMode("crop")}
              onUndo={undo}
              onReset={reset}
              canUndo={history.length > 0}
              canReset={!isDefaultEdit(edit)}
            />
          </aside>
        )}

        {/* 중앙: 스테이지 */}
        <section
          ref={stageWrapRef}
          style={{
            flex: "1 1 360px",
            minWidth: 260,
            display: "flex",
            justifyContent: "center",
          }}
        >
          {mode === "crop" ? (
            <CropStage
              rotatedSource={rotatedSource}
              edit={edit}
              box={box}
              onApply={applyCrop}
              onCancel={() => setMode("preview")}
            />
          ) : mode === "compare" ? (
            <CompareStage rotatedSource={rotatedSource} edit={edit} box={box} />
          ) : (
            <PreviewStage rotatedSource={rotatedSource} edit={edit} box={box} />
          )}
        </section>

        {/* 우: 다운로드 */}
        {mode !== "crop" && (
          <aside style={panelCol}>
            <DownloadPanel rotatedSource={rotatedSource} edit={edit} onFitSquare={fitSquare} />
          </aside>
        )}
      </div>
    </div>
  )
}

const panelCol: React.CSSProperties = {
  flex: "0 0 280px",
  maxWidth: 320,
  minWidth: 240,
  padding: 18,
  borderRadius: "var(--radius-lg)",
  background: "var(--color-bg-surface)",
  border: "1px solid var(--color-line)",
  boxShadow: "var(--shadow-card)",
}

const outlineBtn: React.CSSProperties = {
  padding: "8px 16px",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--color-line-strong)",
  background: "var(--color-bg-surface)",
  color: "var(--color-ink)",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
}

const primaryToggle: React.CSSProperties = {
  ...outlineBtn,
  border: "1px solid var(--color-primary)",
  background: "var(--color-primary-soft)",
  color: "var(--color-primary-dark)",
}
