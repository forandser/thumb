"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { t } from "@/lib/i18n"
import { Crop, DEFAULT_EDIT, EditState, isDefaultEdit } from "@/lib/image/types"
import { makeRotatedSource, renderEdit, type Source } from "@/lib/image/render"
import {
  decodeImageFile,
  makeWorkingSource,
  imageToAiBase64,
  sourceMaxSide,
  AI_MAX_SIDE,
} from "@/lib/image/source"
import { validateImageFile } from "@/lib/image/validate"
import {
  AiError,
  AI_COST_KRW,
  applyDiagnosis,
  diagnosePhoto,
  type AiDiagnosis,
  type AiErrorCode,
} from "@/lib/ai/anthropic"
import { fmt } from "@/lib/i18n"
import type { GalleryItem } from "./gallery-types"
import { useAiImageEdit, type AiEditKind } from "./useAiImageEdit"
import { AdjustPanel } from "./AdjustPanel"
import { DownloadPanel } from "./DownloadPanel"
import { PreviewStage, CompareStage } from "./Stages"
import { CropStage } from "./CropStage"
import { ApplyOthersDialog } from "./ApplyOthersDialog"

type Mode = "preview" | "compare" | "crop"

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

/**
 * 단일 사진 작업대 — v0.1의 편집 엔진(슬라이더·크롭·회전·Before/After·다운로드)을 그대로 옮기고
 * v0.2의 AI 자동 보정·보정값 일괄 적용·갤러리 복귀를 얹었다.
 *
 * key={item.id}로 마운트되므로 사진을 바꾸면 엔진이 그 사진의 저장된 EditState에서 새로 시작한다.
 * 커밋될 때마다 부모(갤러리 아이템)에 보정값을 되돌려 저장해 카드/ZIP/일괄적용이 항상 최신을 본다.
 * 풀 작업 소스는 여기서만 lazy 디코드하고, 언마운트/교체 시 참조를 놓아 GC되게 한다.
 */
export function Workbench({
  item,
  editVersion,
  showBackToGallery,
  onBack,
  onReplace,
  onEditCommit,
  onAiApplied,
  onReset,
  onRestoreOriginal,
  onAiReplace,
  onUndoAi,
  apiKey,
  hasKey,
  geminiKey,
  hasGeminiKey,
  onNeedKey,
  onSpend,
  selectedCount,
  totalOthers,
  onApplyToOthers,
  onSendToCreate,
  notice,
  onDismissNotice,
}: {
  item: GalleryItem
  /** 부모가 외부에서 item.edit를 바꿀 때 증가. 변화 감지 시 편집 엔진을 재시드한다. */
  editVersion: number
  showBackToGallery: boolean
  onBack: () => void
  onReplace: (file: File) => void
  onEditCommit: (edit: EditState) => void
  onAiApplied: (edit: EditState, comment: string) => void
  onReset: () => void
  /** AI 소스까지 폐기하고 원본 파일로 복원. */
  onRestoreOriginal: () => void
  /** AI 편집 결과 dataURL을 새 작업 소스로 반영. */
  onAiReplace: (dataUrl: string, kind: AiEditKind) => Promise<void>
  /** "AI 적용 전으로" — 직전 스냅샷 복원. */
  onUndoAi: () => void
  apiKey: string
  hasKey: boolean
  geminiKey: string
  hasGeminiKey: boolean
  onNeedKey: () => void
  onSpend: (krw: number) => void
  selectedCount: number
  totalOthers: number
  onApplyToOthers: (source: EditState, target: "selected" | "all") => number
  /** 현재 활성 이미지(보정 반영본)를 제작 트랙 재료로 넘긴다. */
  onSendToCreate: (file: File) => void
  /** 업로드 스킵 등 안내(작업대 직행 시에도 표시). */
  notice: string | null
  onDismissNotice: () => void
}) {
  const [img, setImg] = useState<Source | null>(null)
  // Before/After 비교의 Before 기준 — 원본 파일 소스(AI 소스가 있을 때만 별도 디코드).
  const [baseImg, setBaseImg] = useState<Source | null>(null)
  const [error, setError] = useState<string | null>(null)

  // 활성 작업 소스 파일 — AI 편집 결과가 있으면 그 파일, 없으면 원본.
  const activeFile = item.aiFile ?? item.file
  const hasAiFile = !!item.aiFile

  // 편집 엔진 상태(v0.1 그대로) — 최초 진입값은 사진에 저장된 EditState.
  const [edit, setEdit] = useState<EditState>(item.edit)
  const editRef = useRef<EditState>(item.edit)
  const lastCommitted = useRef<EditState>(item.edit)
  const [history, setHistory] = useState<EditState[]>([])
  const [mode, setMode] = useState<Mode>("preview")

  // 클로드 자동 보정 상태(진단).
  const [autoRunning, setAutoRunning] = useState(false)
  const [aiError, setAiError] = useState<AiErrorCode | null>(null)
  const [applyOpen, setApplyOpen] = useState(false)
  const runAiAbortRef = useRef<AbortController | null>(null)

  // 나노바나나 픽셀 편집(누끼·화질) — 공통 훅.
  const aiEdit = useAiImageEdit({
    geminiKey,
    hasGeminiKey,
    onNeedKey,
    onSpend,
    onReplaced: onAiReplace,
  })
  const anyAiBusy = autoRunning || aiEdit.running !== null

  // 방어선 2: 부모가 이 사진의 edit를 외부에서 바꾸면(주로 AI 진단) 편집 엔진을 재시드한다.
  // 자신의 커밋(onEditCommit)은 editVersion을 올리지 않으므로 히스토리가 초기화되지 않는다.
  const itemRef = useRef(item)
  itemRef.current = item
  const seededVersion = useRef(editVersion)
  useEffect(() => {
    if (seededVersion.current === editVersion) return
    seededVersion.current = editVersion
    const fresh = itemRef.current.edit
    lastCommitted.current = fresh
    editRef.current = fresh
    setEdit(fresh)
    setHistory([])
    setMode("preview")
  }, [editVersion])

  // 언마운트 시 진행 중인 단건 AI 호출 중단(비용·경합 방지).
  useEffect(() => {
    return () => {
      runAiAbortRef.current?.abort()
    }
  }, [])

  // 활성 작업 소스 lazy 디코드 (열려 있는 사진만 메모리에 올린다). AI 소스 교체 시 재디코드.
  useEffect(() => {
    let cancelled = false
    setImg(null)
    setError(null)
    decodeImageFile(activeFile)
      .then((decoded) => {
        if (!cancelled) setImg(makeWorkingSource(decoded))
      })
      .catch(() => {
        if (!cancelled) setError(t.retouch.loadError)
      })
    return () => {
      cancelled = true
    }
  }, [activeFile])

  // Before 비교용 원본 소스 — AI 소스가 있을 때만 원본 파일을 별도 디코드(실물 대조).
  useEffect(() => {
    if (!hasAiFile) {
      setBaseImg(null)
      return
    }
    let cancelled = false
    decodeImageFile(item.file)
      .then((decoded) => {
        if (!cancelled) setBaseImg(makeWorkingSource(decoded))
      })
      .catch(() => {
        /* Before 비교용이라 실패해도 조용히 무시(활성 소스로 대체) */
      })
    return () => {
      cancelled = true
    }
  }, [item.file, hasAiFile])

  const rotatedSource = useMemo(
    () => (img ? makeRotatedSource(img, edit.rotate90) : null),
    [img, edit.rotate90],
  )

  // Before(원본) 회전 소스 — AI 소스가 있을 때만 별도. 없으면 활성 소스와 동일(현행 동작).
  const beforeRotated = useMemo(
    () => (baseImg ? makeRotatedSource(baseImg, edit.rotate90) : null),
    [baseImg, edit.rotate90],
  )

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

  // 라이브 변경(슬라이더) — 히스토리·저장 없음.
  const change = useCallback((partial: Partial<EditState>) => {
    setEdit((prev) => {
      const next = { ...prev, ...partial }
      editRef.current = next
      return next
    })
  }, [])

  // 커밋(슬라이더 놓을 때) — 직전 커밋을 히스토리에, 부모에 저장.
  const commit = useCallback(() => {
    const cur = editRef.current
    if (!editsEqual(cur, lastCommitted.current)) {
      setHistory((h) => [...h, lastCommitted.current])
      lastCommitted.current = cur
      onEditCommit(cur)
    }
  }, [onEditCommit])

  // 이산 동작(회전/크롭/1:1) — 적용과 동시에 히스토리+저장.
  const applyCommit = useCallback(
    (next: EditState) => {
      setHistory((h) => [...h, lastCommitted.current])
      lastCommitted.current = next
      editRef.current = next
      setEdit(next)
      onEditCommit(next)
    },
    [onEditCommit],
  )

  const rotate = useCallback(
    (dir: -1 | 1) => {
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
    onEditCommit(prev)
  }, [history, onEditCommit])

  // 원본 복원 — AI 소스가 있으면 그 픽셀까지 폐기(부모가 재디코드·재시드). 없으면 보정만 초기화.
  const reset = useCallback(() => {
    if (hasAiFile) {
      onRestoreOriginal()
      return
    }
    if (isDefaultEdit(editRef.current)) return
    setHistory((h) => [...h, lastCommitted.current])
    lastCommitted.current = DEFAULT_EDIT
    editRef.current = DEFAULT_EDIT
    setEdit(DEFAULT_EDIT)
    setMode("preview")
    onReset()
  }, [hasAiFile, onRestoreOriginal, onReset])

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

  // AI 자동 보정 — 진단값을 현재 보정 위에 얹고 히스토리에 남겨 실행취소 가능.
  const applyAi = useCallback(
    (d: AiDiagnosis) => {
      const next = applyDiagnosis(editRef.current, d)
      setHistory((h) => [...h, lastCommitted.current])
      lastCommitted.current = next
      editRef.current = next
      setEdit(next)
      onAiApplied(next, d.comment)
    },
    [onAiApplied],
  )

  const runAi = useCallback(async () => {
    if (!hasKey) {
      onNeedKey()
      return
    }
    if (!img) return
    runAiAbortRef.current?.abort()
    const controller = new AbortController()
    runAiAbortRef.current = controller
    setAiError(null)
    setAutoRunning(true)
    try {
      const base64 = imageToAiBase64(img)
      const d = await diagnosePhoto(apiKey, base64, controller.signal)
      applyAi(d)
      onSpend(AI_COST_KRW)
    } catch (e) {
      // 취소(언마운트/재실행)는 조용히 무시.
      if (e instanceof DOMException && e.name === "AbortError") return
      setAiError(e instanceof AiError ? e.code : "unknown")
    } finally {
      if (runAiAbortRef.current === controller) {
        runAiAbortRef.current = null
        setAutoRunning(false)
      }
    }
  }, [hasKey, onNeedKey, img, apiKey, applyAi, onSpend])

  // 나노바나나 픽셀 편집(누끼·화질) — 현재 회전 소스+편집을 훅에 넘긴다.
  const runGeminiEdit = useCallback(
    (kind: AiEditKind) => {
      if (!rotatedSource) return
      void aiEdit.run(kind, rotatedSource, editRef.current)
    },
    [aiEdit, rotatedSource],
  )

  // 활성 소스가 1024px보다 크면 화질 개선 결과가 줄어든다는 정직한 안내(차단 안 함).
  const activeMaxSide = img ? sourceMaxSide(img) : 0
  const enhanceShrinks = activeMaxSide > AI_MAX_SIDE

  // 보정 → 제작 연결 — 현재 보정을 구운 이미지를 File로 만들어 제작 트랙 재료로 넘긴다.
  const sendToCreate = useCallback(() => {
    if (!rotatedSource) return
    const canvas = renderEdit(rotatedSource, editRef.current, {
      withAdjustments: true,
      maxPreview: 2048,
    })
    canvas.toBlob(
      (blob) => {
        if (blob) onSendToCreate(new File([blob], `${item.name}-${t.create.sendToCreateFileSuffix}.jpg`, { type: "image/jpeg" }))
      },
      "image/jpeg",
      0.92,
    )
  }, [rotatedSource, onSendToCreate, item.name])

  if (!img || !rotatedSource) {
    return (
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "20px" }}>
        {notice && <NoticeBar message={notice} onClose={onDismissNotice} />}
        {error ? (
          <ErrorBar message={error} onClose={() => setError(null)} />
        ) : (
          <div
            style={{
              minHeight: 320,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--color-ink-tertiary)",
              fontSize: 14,
            }}
          >
            불러오는 중...
          </div>
        )}
        {showBackToGallery && (
          <div style={{ marginTop: 16 }}>
            <button type="button" onClick={onBack} style={outlineBtn}>
              ← {t.gallery.backToGallery}
            </button>
          </div>
        )}
      </div>
    )
  }

  const showComment = !!item.aiComment && (!isDefaultEdit(edit) || hasAiFile)

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: "20px" }}>
      {error && <ErrorBar message={error} onClose={() => setError(null)} />}
      {notice && <NoticeBar message={notice} onClose={onDismissNotice} />}

      {/* 상단: 갤러리로 / 다른 사진 · 비교 토글 */}
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
        {showBackToGallery ? (
          <button type="button" onClick={onBack} style={outlineBtn}>
            ← {t.gallery.backToGallery}
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => document.getElementById("thumb-replace")?.click()}
              style={outlineBtn}
            >
              ↺ {t.retouch.replace}
            </button>
            <input
              id="thumb-replace"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) {
                  const check = validateImageFile(f)
                  if (!check.ok) setError(check.message)
                  else onReplace(f)
                }
                e.target.value = ""
              }}
              style={{ display: "none" }}
            />
          </>
        )}
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

      <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
        {/* 좌: AI + 보정 패널 + 일괄 적용 */}
        {mode !== "crop" && (
          <aside style={panelCol}>
            <AiPanel
              autoRunning={autoRunning}
              geminiRunning={aiEdit.running}
              anyAiBusy={anyAiBusy}
              autoErrorCode={aiError}
              geminiErrorCode={aiEdit.error}
              comment={showComment ? item.aiComment : undefined}
              canUndoAi={!!item.aiUndo}
              enhanceShrinks={enhanceShrinks}
              enhanceCurrentPx={activeMaxSide}
              onRunAuto={runAi}
              onRunCutout={() => runGeminiEdit("cutout")}
              onRunEnhance={() => runGeminiEdit("enhance")}
              onRunSpot={() => runGeminiEdit("spot")}
              onRunDeclutter={() => runGeminiEdit("declutter")}
              onRunRelight={() => runGeminiEdit("relight")}
              onUndoAi={onUndoAi}
              onDismissAutoError={() => setAiError(null)}
              onDismissGeminiError={aiEdit.dismissError}
            />
            <div style={{ height: 18 }} />
            <AdjustPanel
              edit={edit}
              onChange={change}
              onCommit={commit}
              onRotate={rotate}
              onEnterCrop={() => setMode("crop")}
              onUndo={undo}
              onReset={reset}
              canUndo={history.length > 0}
              canReset={!isDefaultEdit(edit) || hasAiFile}
            />
            {totalOthers > 0 && (
              <>
                <div style={{ height: 18 }} />
                <button type="button" onClick={() => setApplyOpen(true)} style={applyOthersBtn}>
                  ⧉ {t.applyOthers.btn}
                </button>
              </>
            )}
          </aside>
        )}

        {/* 중앙: 스테이지 */}
        <section
          ref={stageWrapRef}
          style={{ flex: "1 1 360px", minWidth: 260, display: "flex", justifyContent: "center" }}
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
            <CompareStage
              rotatedSource={rotatedSource}
              beforeRotatedSource={beforeRotated ?? undefined}
              edit={edit}
              box={box}
            />
          ) : (
            <PreviewStage rotatedSource={rotatedSource} edit={edit} box={box} />
          )}
        </section>

        {/* 우: 다운로드 + 제작 연결 */}
        {mode !== "crop" && (
          <aside style={panelCol}>
            <DownloadPanel
              rotatedSource={rotatedSource}
              edit={edit}
              onFitSquare={fitSquare}
              aiApplied={hasAiFile}
            />
            <div style={{ height: 14 }} />
            <button type="button" onClick={sendToCreate} style={sendToCreateBtn}>
              🍊 {t.create.sendToCreate}
            </button>
          </aside>
        )}
      </div>

      <ApplyOthersDialog
        open={applyOpen}
        onClose={() => setApplyOpen(false)}
        selectedCount={selectedCount}
        totalOthers={totalOthers}
        onApply={(target) => onApplyToOthers(editRef.current, target)}
      />
    </div>
  )
}

/**
 * AI 패널 — 클로드 자동 보정 + 나노바나나 픽셀 편집(누끼·화질) + AI 되돌리기 + 코멘트·오류.
 * 어느 AI든 실행 중이면 모든 버튼을 잠가 동시 호출·비용 경합을 막는다.
 */
function AiPanel({
  autoRunning,
  geminiRunning,
  anyAiBusy,
  autoErrorCode,
  geminiErrorCode,
  comment,
  canUndoAi,
  enhanceShrinks,
  enhanceCurrentPx,
  onRunAuto,
  onRunCutout,
  onRunEnhance,
  onRunSpot,
  onRunDeclutter,
  onRunRelight,
  onUndoAi,
  onDismissAutoError,
  onDismissGeminiError,
}: {
  autoRunning: boolean
  geminiRunning: AiEditKind | null
  anyAiBusy: boolean
  autoErrorCode: AiErrorCode | null
  geminiErrorCode: AiErrorCode | null
  comment?: string
  canUndoAi: boolean
  enhanceShrinks: boolean
  enhanceCurrentPx: number
  onRunAuto: () => void
  onRunCutout: () => void
  onRunEnhance: () => void
  onRunSpot: () => void
  onRunDeclutter: () => void
  onRunRelight: () => void
  onUndoAi: () => void
  onDismissAutoError: () => void
  onDismissGeminiError: () => void
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* 클로드 자동 보정(진단) */}
      <button
        type="button"
        onClick={onRunAuto}
        disabled={anyAiBusy}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          padding: "12px 16px",
          borderRadius: "var(--radius-sm)",
          border: "none",
          background: autoRunning
            ? "var(--color-primary-soft)"
            : "linear-gradient(135deg, #F0654A 0%, #FF9A6B 100%)",
          color: autoRunning ? "var(--color-primary-dark)" : "#fff",
          fontSize: 14,
          fontWeight: 800,
          cursor: anyAiBusy ? "default" : "pointer",
          opacity: !autoRunning && anyAiBusy ? 0.55 : 1,
          boxShadow: autoRunning ? "none" : "0 2px 10px rgba(240,101,74,0.32)",
        }}
      >
        {autoRunning ? (
          t.ai.running
        ) : (
          <>
            <span aria-hidden>✨</span> {t.ai.autoBtn}
            <span style={{ fontSize: 12, fontWeight: 600, opacity: 0.85 }}>{t.ai.approxCost}</span>
          </>
        )}
      </button>

      {/* 나노바나나 픽셀 편집 */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <h3
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: "var(--color-ink-tertiary)",
            letterSpacing: 0.3,
          }}
        >
          {t.ai.editSectionTitle}
        </h3>
        <EditOpButton
          icon="🪄"
          label={t.ai.cutoutBtn}
          cost={t.ai.geminiCost}
          runningLabel={t.ai.cutoutRunning}
          running={geminiRunning === "cutout"}
          disabled={anyAiBusy}
          onClick={onRunCutout}
        />
        <EditOpButton
          icon="🔎"
          label={t.ai.enhanceBtn}
          cost={t.ai.geminiCost}
          runningLabel={t.ai.enhanceRunning}
          running={geminiRunning === "enhance"}
          disabled={anyAiBusy}
          onClick={onRunEnhance}
        />
        {/* v0.8 보정 리터치 3종 — 실물 보존 지시문(과일 불변) + photoreal 꼬리말. */}
        <EditOpButton
          icon="🧹"
          label={t.ai.spotBtn}
          cost={t.ai.geminiCost}
          runningLabel={t.ai.spotRunning}
          running={geminiRunning === "spot"}
          disabled={anyAiBusy}
          onClick={onRunSpot}
        />
        <EditOpButton
          icon="🖼️"
          label={t.ai.declutterBtn}
          cost={t.ai.geminiCost}
          runningLabel={t.ai.declutterRunning}
          running={geminiRunning === "declutter"}
          disabled={anyAiBusy}
          onClick={onRunDeclutter}
        />
        <EditOpButton
          icon="💡"
          label={t.ai.relightBtn}
          cost={t.ai.geminiCost}
          runningLabel={t.ai.relightRunning}
          running={geminiRunning === "relight"}
          disabled={anyAiBusy}
          onClick={onRunRelight}
        />
        {enhanceShrinks && (
          <p
            style={{
              margin: 0,
              padding: "8px 10px",
              borderRadius: "var(--radius-sm)",
              background: "var(--color-bg-subtle)",
              color: "var(--color-ink-secondary)",
              fontSize: 11.5,
              lineHeight: 1.5,
            }}
          >
            ℹ️ {fmt(t.ai.enhanceLargeInfo, { px: enhanceCurrentPx })}
          </p>
        )}
        {canUndoAi && (
          <button
            type="button"
            onClick={onUndoAi}
            disabled={anyAiBusy}
            style={{
              padding: "9px 14px",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--color-line-strong)",
              background: "var(--color-bg-surface)",
              color: "var(--color-ink)",
              fontSize: 13,
              fontWeight: 700,
              cursor: anyAiBusy ? "default" : "pointer",
              opacity: anyAiBusy ? 0.55 : 1,
            }}
          >
            ↩ {t.ai.undoAi}
          </button>
        )}
        <p style={{ margin: 0, fontSize: 11, color: "var(--color-ink-tertiary)", lineHeight: 1.5 }}>
          {t.ai.editHint}
        </p>
      </div>

      {comment && (
        <div
          style={{
            display: "flex",
            gap: 8,
            padding: "10px 12px",
            borderRadius: "var(--radius-sm)",
            background: "var(--color-primary-soft)",
            border: "1px solid #f5cfc4",
            fontSize: 12.5,
            color: "var(--color-primary-dark)",
            lineHeight: 1.5,
          }}
        >
          <span aria-hidden>✨</span>
          <span>{comment}</span>
        </div>
      )}

      {autoErrorCode && <AiErrorCard code={autoErrorCode} onDismiss={onDismissAutoError} />}
      {geminiErrorCode && <AiErrorCard code={geminiErrorCode} onDismiss={onDismissGeminiError} />}
    </div>
  )
}

/** 나노바나나 편집 버튼(누끼·화질 공용) — 아이콘·라벨·건당 비용·실행 중 표시. */
function EditOpButton({
  icon,
  label,
  cost,
  runningLabel,
  running,
  disabled,
  onClick,
}: {
  icon: string
  label: string
  cost: string
  runningLabel: string
  running: boolean
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        padding: "11px 14px",
        borderRadius: "var(--radius-sm)",
        border: "1px solid var(--color-line-strong)",
        background: running ? "var(--color-primary-soft)" : "var(--color-bg-surface)",
        color: running ? "var(--color-primary-dark)" : "var(--color-ink)",
        fontSize: 13.5,
        fontWeight: 700,
        cursor: disabled ? "default" : "pointer",
        opacity: !running && disabled ? 0.55 : 1,
      }}
    >
      {running ? (
        runningLabel
      ) : (
        <>
          <span aria-hidden>{icon}</span> {label}
          <span style={{ fontSize: 12, fontWeight: 600, opacity: 0.7 }}>{cost}</span>
        </>
      )}
    </button>
  )
}

/** AI 오류 카드(클로드·나노바나나 공용 — 코드별 i18n 문구). */
function AiErrorCard({ code, onDismiss }: { code: AiErrorCode; onDismiss: () => void }) {
  return (
    <div
      role="alert"
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
        padding: "10px 12px",
        borderRadius: "var(--radius-sm)",
        background: "var(--color-danger-soft, #fdecea)",
        border: "1px solid var(--color-danger, #d64545)",
        color: "var(--color-danger, #a62a2a)",
        fontSize: 12.5,
        lineHeight: 1.5,
      }}
    >
      <span aria-hidden>⚠️</span>
      <span style={{ flex: 1 }}>{t.ai.errors[code]}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={t.keySettings.close}
        style={{
          flexShrink: 0,
          border: "none",
          background: "none",
          color: "inherit",
          fontSize: 14,
          lineHeight: 1,
          cursor: "pointer",
        }}
      >
        ✕
      </button>
    </div>
  )
}

/** 안내 배너(경고 톤, 여러 줄) — 업로드 스킵 안내 등. */
function NoticeBar({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div
      role="alert"
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
        marginBottom: 16,
        padding: "12px 14px",
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
      <span style={{ flex: 1 }}>{message}</span>
      <button
        type="button"
        onClick={onClose}
        aria-label={t.keySettings.close}
        style={{
          flexShrink: 0,
          border: "none",
          background: "none",
          color: "inherit",
          fontSize: 14,
          lineHeight: 1,
          cursor: "pointer",
        }}
      >
        ✕
      </button>
    </div>
  )
}

function ErrorBar({ message, onClose }: { message: string; onClose: () => void }) {
  return (
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
      <span style={{ flex: 1 }}>{message}</span>
      <button
        type="button"
        onClick={onClose}
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

const sendToCreateBtn: React.CSSProperties = {
  width: "100%",
  padding: "11px 14px",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--color-primary)",
  background: "var(--color-primary-soft)",
  color: "var(--color-primary-dark)",
  fontSize: 13.5,
  fontWeight: 800,
  cursor: "pointer",
}

const applyOthersBtn: React.CSSProperties = {
  width: "100%",
  padding: "10px 14px",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--color-line-strong)",
  background: "var(--color-bg-subtle)",
  color: "var(--color-ink)",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
}
