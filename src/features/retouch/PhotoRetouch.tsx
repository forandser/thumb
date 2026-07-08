"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { t } from "@/lib/i18n"
import { DEFAULT_EDIT, EditState, isDefaultEdit } from "@/lib/image/types"
import { validateImageFile } from "@/lib/image/validate"
import { decodeImageFile, makeThumb, imageToAiBase64, dataUrlToFile } from "@/lib/image/source"
import type { AiEditKind } from "./useAiImageEdit"
import {
  AiError,
  AI_COST_KRW,
  applyDiagnosis,
  diagnosePhoto,
  type AiErrorCode,
} from "@/lib/ai/anthropic"
import { UploadDropzone } from "./UploadDropzone"
import { GalleryView } from "./GalleryView"
import { Workbench } from "./Workbench"
import type { BatchState, GalleryItem } from "./gallery-types"

/** 한 번에 담을 수 있는 최대 사진 수. */
const MAX_PHOTOS = 30
/** 일괄 AI 동시 처리 큐 개수. */
const CONCURRENCY = 3
/** 429/529 자동 재시도 최대 횟수와 대기(ms). Retry-After가 있으면 그 값이 우선. */
const MAX_AUTO_RETRY = 2
const BACKOFF_MS = [3000, 8000]
/** 배치 도중 429가 이 횟수 이상이면 동시 수를 1로 낮춘다. */
const SLOW_MODE_THRESHOLD = 2

const EMPTY_BATCH: BatchState = { running: false, done: 0, total: 0, failed: 0, cancelling: false }

/** AI 진단 1건의 결과. */
type DiagnoseResult = "ok" | "failed" | "canceled"

/** signal로 중단 가능한 sleep. abort 시 AbortError로 reject. */
function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"))
      return
    }
    const cleanup = () => {
      clearTimeout(timer)
      signal?.removeEventListener("abort", onAbort)
    }
    const onAbort = () => {
      cleanup()
      reject(new DOMException("Aborted", "AbortError"))
    }
    const timer = setTimeout(() => {
      cleanup()
      resolve()
    }, ms)
    signal?.addEventListener("abort", onAbort)
  })
}

/**
 * 사진 보정 컨테이너 — 업로드/갤러리/작업대 라우팅과 다중 사진 상태를 관리한다.
 *
 * v0.1 회귀 방지: 사진을 딱 1장 올리면 갤러리를 건너뛰고 곧바로 작업대로 들어간다.
 * 메모리: 아이템은 File 참조 + 240px 썸네일만 보관하고, 풀 소스는 Workbench가 lazy로 만든다.
 */
export function PhotoRetouch({
  apiKey,
  hasKey,
  geminiKey,
  hasGeminiKey,
  onNeedKey,
  onSpend,
}: {
  apiKey: string
  hasKey: boolean
  geminiKey: string
  hasGeminiKey: boolean
  onNeedKey: () => void
  onSpend: (krw: number) => void
}) {
  const [items, setItems] = useState<GalleryItem[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [openId, setOpenId] = useState<string | null>(null)
  const [addNotice, setAddNotice] = useState<string | null>(null)
  const [batch, setBatch] = useState<BatchState>(EMPTY_BATCH)

  const idRef = useRef(0)
  const nextId = () => `p${++idRef.current}-${Date.now()}`

  // runDiagnoseOne이 항상 최신 file을 읽도록 items 미러 ref 유지.
  const itemsRef = useRef(items)
  useEffect(() => {
    itemsRef.current = items
  }, [items])

  const cancelBatchRef = useRef(false)
  // 배치 실행마다 만드는 AbortController(중단 시 in-flight 즉시 취소).
  const batchControllerRef = useRef<AbortController | null>(null)
  // 진행 중 모든 AI 호출의 컨트롤러(배치·단건 재시도) — 언마운트 시 일괄 abort.
  const liveControllersRef = useRef<Set<AbortController>>(new Set())

  // 언마운트 시 모든 썸네일 objectURL 정리 + 진행 중 AI 호출 중단.
  useEffect(() => {
    const controllers = liveControllersRef.current
    return () => {
      itemsRef.current.forEach((i) => URL.revokeObjectURL(i.thumbUrl))
      controllers.forEach((c) => c.abort())
    }
  }, [])

  const patchItem = useCallback((id: string, patch: Partial<GalleryItem>) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)))
  }, [])

  // ── 사진 추가 ────────────────────────────────────────────────────────────
  const addPhotos = useCallback(
    async (fileList: FileList) => {
      const wasEmpty = itemsRef.current.length === 0
      const remaining = MAX_PHOTOS - itemsRef.current.length
      if (remaining <= 0) {
        setAddNotice(t.retouch.maxReached)
        return
      }

      const files = Array.from(fileList)
      const valids: File[] = []
      const skipped: string[] = []
      for (const f of files) {
        const check = validateImageFile(f)
        if (check.ok) valids.push(f)
        else skipped.push(`· ${f.name || "이미지"}`)
      }
      const capped = valids.slice(0, remaining)
      const overCapacity = valids.length > remaining

      // 디코드 + 썸네일 생성(순차 — 동시 디코드 최소화).
      const built: GalleryItem[] = []
      for (const f of capped) {
        try {
          const img = await decodeImageFile(f)
          const thumb = await makeThumb(img)
          built.push({
            id: nextId(),
            file: f,
            name: f.name || "photo",
            thumbUrl: thumb.url,
            thumbW: thumb.w,
            thumbH: thumb.h,
            edit: DEFAULT_EDIT,
            editVersion: 0,
            aiStatus: "idle",
          })
        } catch {
          skipped.push(`· ${f.name || "이미지"}`)
        }
      }

      // 안내(초과·건너뜀) 조립.
      const parts: string[] = []
      if (overCapacity) parts.push(t.retouch.tooMany)
      if (skipped.length) parts.push(`${t.retouch.skippedTitle}\n${skipped.join("\n")}`)
      setAddNotice(parts.length ? parts.join("\n\n") : null)

      if (built.length) {
        setItems((prev) => [...prev, ...built])
        // v0.1 회귀 방지: 빈 상태에서 정확히 1장 → 곧바로 작업대.
        if (wasEmpty && built.length === 1) setOpenId(built[0].id)
      }
    },
    [],
  )

  // ── 아이템 조작 ──────────────────────────────────────────────────────────
  const removeItem = useCallback((id: string) => {
    setItems((prev) => {
      const target = prev.find((i) => i.id === id)
      if (target) URL.revokeObjectURL(target.thumbUrl)
      return prev.filter((i) => i.id !== id)
    })
    setSelected((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
    setOpenId((cur) => (cur === id ? null : cur))
  }, [])

  const replaceOpen = useCallback(
    async (file: File) => {
      const id = openId
      if (!id) return
      try {
        const img = await decodeImageFile(file)
        const thumb = await makeThumb(img)
        const newId = nextId()
        setItems((prev) =>
          prev.map((i) => {
            if (i.id !== id) return i
            URL.revokeObjectURL(i.thumbUrl)
            return {
              id: newId,
              file,
              name: file.name || "photo",
              thumbUrl: thumb.url,
              thumbW: thumb.w,
              thumbH: thumb.h,
              edit: DEFAULT_EDIT,
              editVersion: 0,
              aiStatus: "idle",
            }
          }),
        )
        setSelected((prev) => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })
        setOpenId(newId)
      } catch {
        setAddNotice(t.retouch.loadError)
      }
    },
    [openId],
  )

  // ── 선택 ─────────────────────────────────────────────────────────────────
  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])
  const selectAll = useCallback(() => {
    setSelected(new Set(itemsRef.current.map((i) => i.id)))
  }, [])
  const clearSelection = useCallback(() => setSelected(new Set()), [])

  // ── AI 진단(개별) — 배치/재시도 공용 ─────────────────────────────────────
  // signal: 중단용. onRateLimit: 429 발생 시 호출(배치 동시 수 조절용).
  const runDiagnoseOne = useCallback(
    async (
      id: string,
      signal?: AbortSignal,
      onRateLimit?: () => void,
    ): Promise<DiagnoseResult> => {
      const item = itemsRef.current.find((i) => i.id === id)
      if (!item) return "failed"
      patchItem(id, { aiStatus: "running", aiErrorCode: undefined })

      const markCanceled = (): DiagnoseResult => {
        patchItem(id, { aiStatus: "canceled", aiErrorCode: undefined })
        return "canceled"
      }

      let base64: string
      try {
        // 단건 작업대 진단(활성 소스)과 일치시킨다 — 누끼/화질로 aiFile이 생겼으면 그 소스를 진단.
        const img = await decodeImageFile(item.aiFile ?? item.file)
        base64 = imageToAiBase64(img)
      } catch {
        patchItem(id, { aiStatus: "failed", aiErrorCode: "unknown" })
        return "failed"
      }

      let attempt = 0
      for (;;) {
        if (signal?.aborted) return markCanceled()
        try {
          const d = await diagnosePhoto(apiKey, base64, signal)
          const current = itemsRef.current.find((i) => i.id === id)
          const baseEdit = current ? current.edit : item.edit
          patchItem(id, {
            edit: applyDiagnosis(baseEdit, d),
            editVersion: ((current ?? item).editVersion ?? 0) + 1,
            aiComment: d.comment,
            aiStatus: "idle",
            aiErrorCode: undefined,
          })
          onSpend(AI_COST_KRW)
          return "ok"
        } catch (e) {
          if (e instanceof DOMException && e.name === "AbortError") return markCanceled()
          const code: AiErrorCode = e instanceof AiError ? e.code : "unknown"
          // 429/529는 자동 백오프 재시도(최대 MAX_AUTO_RETRY회).
          if ((code === "rate_limited" || code === "overloaded") && attempt < MAX_AUTO_RETRY) {
            if (code === "rate_limited") onRateLimit?.()
            let wait = BACKOFF_MS[attempt] ?? 8000
            if (code === "rate_limited" && e instanceof AiError && typeof e.retryAfterMs === "number") {
              wait = e.retryAfterMs
            }
            attempt += 1
            try {
              await abortableSleep(wait, signal)
            } catch {
              return markCanceled()
            }
            continue
          }
          patchItem(id, { aiStatus: "failed", aiErrorCode: code })
          return "failed"
        }
      }
    },
    [apiKey, onSpend, patchItem],
  )

  const startBatchAi = useCallback(
    async (ids: string[]) => {
      if (!ids.length) return
      cancelBatchRef.current = false
      const controller = new AbortController()
      batchControllerRef.current = controller
      liveControllersRef.current.add(controller)

      // 429 누적 → 동시 수 축소(3→1). slow일 때는 lock으로 직렬화.
      let rateLimitHits = 0
      let slow = false
      const onRateLimit = () => {
        rateLimitHits += 1
        if (rateLimitHits >= SLOW_MODE_THRESHOLD) slow = true
      }
      let lock: Promise<unknown> = Promise.resolve()
      const runExclusive = (fn: () => Promise<DiagnoseResult>): Promise<DiagnoseResult> => {
        const result = lock.then(fn)
        lock = result.then(
          () => {},
          () => {},
        )
        return result
      }

      setItems((prev) =>
        prev.map((i) =>
          ids.includes(i.id) ? { ...i, aiStatus: "queued", aiErrorCode: undefined } : i,
        ),
      )
      setBatch({ running: true, done: 0, total: ids.length, failed: 0, cancelling: false })

      const queue = [...ids]
      const worker = async () => {
        while (queue.length) {
          if (cancelBatchRef.current) return
          const id = queue.shift()
          if (!id) return
          const run = () => runDiagnoseOne(id, controller.signal, onRateLimit)
          const result = slow ? await runExclusive(run) : await run()
          if (result !== "canceled") {
            setBatch((b) => ({ ...b, done: b.done + 1, failed: b.failed + (result === "failed" ? 1 : 0) }))
          }
        }
      }
      await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()))

      liveControllersRef.current.delete(controller)
      if (batchControllerRef.current === controller) batchControllerRef.current = null
      // 취소로 시작도 못 한 대기 카드는 idle로 복귀.
      setItems((prev) => prev.map((i) => (i.aiStatus === "queued" ? { ...i, aiStatus: "idle" } : i)))
      setBatch((b) => ({ ...b, running: false, cancelling: false }))
    },
    [runDiagnoseOne],
  )

  const cancelBatchAi = useCallback(() => {
    cancelBatchRef.current = true
    batchControllerRef.current?.abort()
    setBatch((b) => ({ ...b, cancelling: true }))
  }, [])

  const retryAi = useCallback(
    (id: string) => {
      if (!hasKey) {
        onNeedKey()
        return
      }
      const controller = new AbortController()
      liveControllersRef.current.add(controller)
      void runDiagnoseOne(id, controller.signal).finally(() => {
        liveControllersRef.current.delete(controller)
      })
    },
    [hasKey, onNeedKey, runDiagnoseOne],
  )

  // ── 보정값 일괄 적용(색 보정만, 크롭·회전 제외) ──────────────────────────
  const applyEditToOthers = useCallback(
    (source: EditState, target: "selected" | "all"): number => {
      const excludeId = openId
      const ids = (
        target === "selected" ? [...selected] : itemsRef.current.map((i) => i.id)
      ).filter((id) => id !== excludeId)
      if (!ids.length) return 0
      setItems((prev) =>
        prev.map((i) =>
          ids.includes(i.id)
            ? {
                ...i,
                edit: {
                  ...i.edit,
                  brightness: source.brightness,
                  contrast: source.contrast,
                  saturation: source.saturation,
                  temperature: source.temperature,
                },
              }
            : i,
        ),
      )
      return ids.length
    },
    [openId, selected],
  )

  // ── AI 픽셀 편집(누끼·화질) 소스 교체 ────────────────────────────────────
  // 결과 dataURL을 새 File로 만들어 활성 소스로 삼는다 → 다운로드·ZIP·썸네일이 최신 픽셀을 본다.
  // 직전 (소스·편집) 스냅샷을 aiUndo에 보관해 "AI 적용 전으로"를 지원한다.
  const applyAiSource = useCallback(
    async (dataUrl: string, kind: AiEditKind) => {
      const id = openId
      if (!id) return
      const cur = itemsRef.current.find((i) => i.id === id)
      if (!cur) return
      const suffix = kind === "cutout" ? "누끼" : "화질"
      const file = dataUrlToFile(dataUrl, `${cur.name}-${suffix}.png`)
      const img = await decodeImageFile(file)
      const thumb = await makeThumb(img)
      const comment = kind === "cutout" ? t.ai.cutoutDone : t.ai.enhanceDone
      setItems((prev) =>
        prev.map((i) => {
          if (i.id !== id) return i
          URL.revokeObjectURL(i.thumbUrl)
          return {
            ...i,
            aiFile: file,
            aiUndo: { file: i.aiFile, edit: i.edit, comment: i.aiComment },
            edit: DEFAULT_EDIT, // 보정을 구워 보냈으므로 편집은 리셋.
            editVersion: (i.editVersion ?? 0) + 1,
            aiComment: comment,
            thumbUrl: thumb.url,
            thumbW: thumb.w,
            thumbH: thumb.h,
            aiStatus: "idle",
            aiErrorCode: undefined,
          }
        }),
      )
    },
    [openId],
  )

  // "AI 적용 전으로" — 직전 스냅샷(소스·편집·코멘트) 복원(1단계).
  const undoAiSource = useCallback(async () => {
    const id = openId
    if (!id) return
    const cur = itemsRef.current.find((i) => i.id === id)
    if (!cur?.aiUndo) return
    const snap = cur.aiUndo
    const decodeSrc = snap.file ?? cur.file
    const img = await decodeImageFile(decodeSrc)
    const thumb = await makeThumb(img)
    setItems((prev) =>
      prev.map((i) => {
        if (i.id !== id) return i
        URL.revokeObjectURL(i.thumbUrl)
        return {
          ...i,
          aiFile: snap.file,
          aiUndo: undefined,
          edit: snap.edit,
          editVersion: (i.editVersion ?? 0) + 1,
          aiComment: snap.comment,
          thumbUrl: thumb.url,
          thumbW: thumb.w,
          thumbH: thumb.h,
          aiStatus: "idle",
          aiErrorCode: undefined,
        }
      }),
    )
  }, [openId])

  // "원본으로" — AI 소스까지 폐기하고 원본 파일·기본 편집으로 되돌린다.
  const restoreOriginal = useCallback(async () => {
    const id = openId
    if (!id) return
    const cur = itemsRef.current.find((i) => i.id === id)
    if (!cur) return
    if (!cur.aiFile && isDefaultEdit(cur.edit)) return
    let thumbPatch: Partial<GalleryItem> = {}
    if (cur.aiFile) {
      const img = await decodeImageFile(cur.file)
      const thumb = await makeThumb(img)
      thumbPatch = { thumbUrl: thumb.url, thumbW: thumb.w, thumbH: thumb.h }
    }
    setItems((prev) =>
      prev.map((i) => {
        if (i.id !== id) return i
        if (i.aiFile) URL.revokeObjectURL(i.thumbUrl)
        return {
          ...i,
          ...thumbPatch,
          aiFile: undefined,
          aiUndo: undefined,
          edit: DEFAULT_EDIT,
          editVersion: (i.editVersion ?? 0) + 1,
          aiComment: undefined,
        }
      }),
    )
  }, [openId])

  // ── 렌더 ─────────────────────────────────────────────────────────────────
  if (items.length === 0) {
    return (
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 20px" }}>
        <UploadDropzone onFiles={addPhotos} error={addNotice} />
      </div>
    )
  }

  const openItem = openId ? items.find((i) => i.id === openId) : undefined

  if (openItem) {
    const selectedOthers = [...selected].filter((id) => id !== openItem.id).length
    return (
      <Workbench
        key={openItem.id}
        item={openItem}
        editVersion={openItem.editVersion}
        showBackToGallery={items.length > 1}
        onBack={() => setOpenId(null)}
        onReplace={replaceOpen}
        onEditCommit={(edit) => patchItem(openItem.id, { edit })}
        onAiApplied={(edit, comment) =>
          patchItem(openItem.id, {
            edit,
            aiComment: comment,
            aiStatus: "idle",
            aiErrorCode: undefined,
          })
        }
        onReset={() => patchItem(openItem.id, { edit: DEFAULT_EDIT, aiComment: undefined })}
        onRestoreOriginal={restoreOriginal}
        onAiReplace={applyAiSource}
        onUndoAi={undoAiSource}
        apiKey={apiKey}
        hasKey={hasKey}
        geminiKey={geminiKey}
        hasGeminiKey={hasGeminiKey}
        onNeedKey={onNeedKey}
        onSpend={onSpend}
        selectedCount={selectedOthers}
        totalOthers={items.length - 1}
        onApplyToOthers={applyEditToOthers}
        notice={addNotice}
        onDismissNotice={() => setAddNotice(null)}
      />
    )
  }

  return (
    <GalleryView
      items={items}
      selected={selected}
      onToggleSelect={toggleSelect}
      onSelectAll={selectAll}
      onClearSelection={clearSelection}
      onOpen={(id) => setOpenId(id)}
      onRemove={removeItem}
      onAddPhotos={addPhotos}
      addNotice={addNotice}
      onDismissNotice={() => setAddNotice(null)}
      batch={batch}
      onStartBatch={startBatchAi}
      onCancelBatch={cancelBatchAi}
      onRetry={retryAi}
      hasKey={hasKey}
      onNeedKey={onNeedKey}
    />
  )
}
