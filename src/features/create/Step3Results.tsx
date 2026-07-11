"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { t, fmt } from "@/lib/i18n"
import { DEFAULT_EDIT } from "@/lib/image/types"
import { makeRotatedSource, renderEdit } from "@/lib/image/render"
import { makeWorkingSource } from "@/lib/image/source"
import { applyFilmTexture, type FilmStrength } from "@/lib/image/film-grain"
import { DOWNLOAD_PRESETS, canvasToBlob, downloadBlob } from "@/lib/image/download"
import { embedAiMetadata } from "@/lib/image/ai-mark"
import {
  INSPECT_ITEM_COUNT,
  passCount,
  failedItems,
} from "@/lib/ai/inspect"
import type { AiErrorCode } from "@/lib/ai/anthropic"
import {
  DEFAULT_OVERLAY,
  drawTextOverlay,
  type OverlayColor,
  type OverlayPosition,
  type OverlaySize,
  type TextOverlay,
} from "@/lib/create/text-overlay"
import { DownloadPanel } from "@/features/retouch/DownloadPanel"
import type { Candidate, PipelinePhase } from "./create-types"

const VARIATION_COUNTS = [1, 2, 3] as const

/** 작업대 필름 질감 강도 칩(약·중·끔). 기본 약(light). */
const FILM_OPTIONS: { key: FilmStrength; label: string }[] = [
  { key: "light", label: t.create.filmLight },
  { key: "medium", label: t.create.filmMedium },
  { key: "off", label: t.create.filmOff },
]

/** 이미지 dataURL을 디코드한 HTMLImageElement로 반환(빠른 저장용). */
function decodeImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error("image decode failed"))
    img.src = src
  })
}

/**
 * 후보 카드 빠른 저장(v0.6) — 작업대를 거치지 않고 그 자리에서 기본 규격(1080 PNG)으로 저장.
 * dataUrl → 정사각 캔버스 → 필름 그레인(약) → AI 표시 메타데이터 → 저장. 파일명은 후보 index로.
 * 작업대 DownloadPanel과 동일한 렌더/후처리 파이프라인을 타되 오버레이·워터마크·규격 선택은 생략한다.
 */
async function quickSaveCandidate(
  candidate: Candidate,
  { vignette }: { vignette: boolean },
): Promise<void> {
  if (!candidate.dataUrl) throw new Error("no image to save")
  const img = await decodeImage(candidate.dataUrl)
  const rotated = makeRotatedSource(makeWorkingSource(img), 0)
  const preset = DOWNLOAD_PRESETS.png
  const canvas = renderEdit(rotated, DEFAULT_EDIT, {
    withAdjustments: false,
    forceSquare: true,
    targetSize: preset.size,
  })
  // 흰 배경 대표이미지(heroWhiteBg)면 비네팅을 꺼 모서리를 순백으로 유지(그레인만).
  applyFilmTexture(canvas, { strength: "light", vignette })
  let blob = await canvasToBlob(canvas, preset)
  if (!blob) throw new Error("failed to encode image")
  blob = await embedAiMetadata(blob)
  if (!blob) throw new Error("failed to encode image")
  downloadBlob(blob, `thumbnail-1080-${candidate.index}.png`)
}

/**
 * STEP 3 — 뽑고 다듬기. 진행 표시 · 후보 카드(뱃지·사유 툴팁) · 선택 후 작업대
 * (대화형 리터치 · 구도 베리에이션 · 한글 텍스트 오버레이 · 다운로드).
 */
export function Step3Results({
  candidates,
  phase,
  opError,
  overlayAllowed,
  heroWhiteBg,
  hasGeminiKey,
  onRegenerate,
  onVariation,
  onRetouch,
  onRevertRetouch,
  onCancel,
  onDismissOpError,
  onNeedKey,
}: {
  candidates: Candidate[]
  phase: PipelinePhase
  opError: AiErrorCode | null
  /** 텍스트 오버레이 허용(대표이미지 계열이면 false). */
  overlayAllowed: boolean
  /** 흰 배경 대표이미지 프리셋(studioClean 등) — 필름 비네팅을 꺼 순백 모서리를 유지한다. */
  heroWhiteBg: boolean
  hasGeminiKey: boolean
  onRegenerate: (id: string) => void
  onVariation: (sourceDataUrl: string, n: number) => void
  onRetouch: (id: string, instruction: string) => Promise<boolean>
  onRevertRetouch: (id: string) => void
  onCancel: () => void
  onDismissOpError: () => void
  onNeedKey: () => void
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = selectedId ? candidates.find((c) => c.id === selectedId) : undefined

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <ProgressBar phase={phase} candidates={candidates} onCancel={onCancel} />

      {opError && (
        <div style={errorCard} role="alert">
          <span aria-hidden>⚠️</span>
          <span style={{ flex: 1 }}>{t.ai.errors[opError]}</span>
          <button type="button" onClick={onDismissOpError} aria-label={t.keySettings.close} style={xBtn}>
            ✕
          </button>
        </div>
      )}

      {selected && selected.dataUrl ? (
        <SelectedWorkbench
          candidate={selected}
          overlayAllowed={overlayAllowed}
          heroWhiteBg={heroWhiteBg}
          hasGeminiKey={hasGeminiKey}
          onBack={() => setSelectedId(null)}
          onVariation={onVariation}
          onRetouch={onRetouch}
          onRevertRetouch={onRevertRetouch}
          onNeedKey={onNeedKey}
        />
      ) : (
        <CandidateGrid
          candidates={candidates}
          heroWhiteBg={heroWhiteBg}
          onSelect={setSelectedId}
          onRegenerate={onRegenerate}
        />
      )}
    </div>
  )
}

// ── 진행 표시 ────────────────────────────────────────────────────────────────
function ProgressBar({
  phase,
  candidates,
  onCancel,
}: {
  phase: PipelinePhase
  candidates: Candidate[]
  onCancel: () => void
}) {
  const total = candidates.length
  const anyGenerating = candidates.some((c) => c.status === "generating")
  const settled = candidates.filter((c) => c.status === "done" || c.status === "failed").length

  let label = ""
  if (phase === "running") {
    label = anyGenerating
      ? t.create.progressGenerating
      : fmt(t.create.progressInspecting, { done: settled, total })
  } else if (phase === "canceled") {
    label = t.create.progressCanceled
  } else if (phase === "done") {
    label = t.create.progressDone
  }

  if (!label) return null

  return (
    <div style={progressBox}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {phase === "running" && <Spinner />}
        <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--color-ink)" }}>{label}</span>
      </div>
      {phase === "running" && (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 11, color: "var(--color-ink-tertiary)" }}>{t.create.cancelHint}</span>
          <button type="button" onClick={onCancel} style={cancelBtn}>
            {t.create.cancel}
          </button>
        </div>
      )}
    </div>
  )
}

function Spinner() {
  return (
    <span
      aria-hidden
      style={{
        width: 14,
        height: 14,
        borderRadius: "50%",
        border: "2px solid var(--color-line-strong)",
        borderTopColor: "var(--color-primary)",
        animation: "thumb-spin 0.8s linear infinite",
        display: "inline-block",
      }}
    />
  )
}

// ── 후보 그리드 ──────────────────────────────────────────────────────────────
function CandidateGrid({
  candidates,
  heroWhiteBg,
  onSelect,
  onRegenerate,
}: {
  candidates: Candidate[]
  heroWhiteBg: boolean
  onSelect: (id: string) => void
  onRegenerate: (id: string) => void
}) {
  if (candidates.length === 0) return null
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
        gap: 14,
      }}
    >
      {candidates.map((c) => (
        <CandidateCard
          key={c.id}
          candidate={c}
          heroWhiteBg={heroWhiteBg}
          onSelect={onSelect}
          onRegenerate={onRegenerate}
        />
      ))}
    </div>
  )
}

function CandidateCard({
  candidate,
  heroWhiteBg,
  onSelect,
  onRegenerate,
}: {
  candidate: Candidate
  heroWhiteBg: boolean
  onSelect: (id: string) => void
  onRegenerate: (id: string) => void
}) {
  const badge = candidateBadge(candidate)
  const busy =
    candidate.status === "generating" ||
    candidate.status === "inspecting" ||
    candidate.status === "regenerating"
  const selectable = candidate.status === "done" && !!candidate.dataUrl
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(false)

  const handleQuickSave = async () => {
    setSaving(true)
    setSaveError(false)
    try {
      // 흰 배경 대표이미지면 비네팅 제외(순백 모서리 유지) — 미리보기·작업대 저장과 동일 규칙.
      await quickSaveCandidate(candidate, { vignette: !heroWhiteBg })
    } catch {
      // 디코드·인코딩 실패 시 조용히 삼키지 않고 셀러에게 재시도 안내를 띄운다(스펙 §① 저장 우선).
      setSaveError(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={cardBox}>
      <div style={imgWrap}>
        {candidate.dataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={candidate.dataUrl} alt={fmt(t.create.candidateLabel, { n: candidate.index })} style={imgFill} />
        ) : (
          <div style={imgPlaceholder}>
            {candidate.status === "failed" ? (
              <span style={{ fontSize: 12, color: "var(--color-danger)" }}>
                {t.create.candidateFailed}
              </span>
            ) : (
              <Spinner />
            )}
          </div>
        )}
        {busy && (
          <div style={busyOverlay}>
            <Spinner />
            <span style={{ fontSize: 11.5, color: "#fff", fontWeight: 700 }}>
              {candidate.status === "regenerating"
                ? t.create.regenerating
                : candidate.status === "inspecting"
                  ? t.create.candidateInspecting
                  : t.create.candidateGenerating}
            </span>
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "10px 12px" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--color-ink-secondary)" }}>
          {fmt(t.create.candidateLabel, { n: candidate.index })}
        </span>
        {badge && (
          <span style={{ ...badgeChip, background: badge.bg, color: badge.color }} title={badge.tooltip}>
            {badge.text}
          </span>
        )}
        {candidate.status === "failed" && candidate.errorCode && (
          <span style={{ fontSize: 11, color: "var(--color-danger)", lineHeight: 1.4 }}>
            {t.ai.errors[candidate.errorCode]}
          </span>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {selectable && (
            <button type="button" onClick={() => onSelect(candidate.id)} style={selectBtn}>
              {t.create.pickRefine}
            </button>
          )}
          <div style={{ display: "flex", gap: 6 }}>
            {selectable && (
              <button
                type="button"
                onClick={handleQuickSave}
                disabled={saving}
                style={{ ...miniBtn, flex: 1, opacity: saving ? 0.6 : 1 }}
              >
                {saving ? t.create.quickSaving : `↓ ${t.create.quickSave}`}
              </button>
            )}
            {(candidate.status === "done" || candidate.status === "failed") && candidate.kind === "generated" && (
              <button type="button" onClick={() => onRegenerate(candidate.id)} style={miniBtn}>
                ↻ {t.create.retry}
              </button>
            )}
          </div>
          {saveError && (
            <span style={{ fontSize: 11, color: "var(--color-danger)", lineHeight: 1.4 }} role="alert">
              {t.create.quickSaveError}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

/** 후보 상태 → 뱃지(문구·색·툴팁). done 상태에서만 검수 결과 뱃지를 만든다. */
function candidateBadge(
  c: Candidate,
): { text: string; bg: string; color: string; tooltip?: string } | null {
  if (c.status !== "done") return null
  // 자동 재생성분임을 알리는 접미(투명성 — 첫 시도 통과 후보와 구분).
  const regenSuffix = c.regenerated ? ` · ${t.create.regeneratedSuffix}` : ""
  if (c.kind === "variation") {
    return { text: t.create.variationBadge, bg: "var(--color-bg-subtle)", color: "var(--color-ink-secondary)" }
  }
  // 검수 호출 자체가 실패한 후보 — 이미지·선택은 살아 있고 뱃지로만 알린다(선택 가능).
  if (c.inspectError) {
    return {
      text: `${t.create.inspectError}${regenSuffix}`,
      bg: "var(--color-warning-soft)",
      color: "#8a5a08",
    }
  }
  if (c.inspectSkipped || !c.inspection) {
    return { text: t.create.inspectSkipped, bg: "var(--color-bg-subtle)", color: "var(--color-ink-secondary)" }
  }
  const pass = passCount(c.inspection.items)
  const badgeText = fmt(t.create.inspectBadge, { pass, total: INSPECT_ITEM_COUNT })
  if (c.inspection.verdict === "fail") {
    const fails = failedItems(c.inspection.items)
      .map((it) => `· ${t.create.inspectItems[it.id - 1]}${it.reason ? ` — ${it.reason}` : ""}`)
      .join("\n")
    return {
      text: `${t.create.inspectFailedBadge} · ${badgeText}${regenSuffix}`,
      bg: "var(--color-warning-soft)",
      color: "#8a5a08",
      tooltip: `${t.create.failedItemsTitle}\n${fails}`,
    }
  }
  return {
    text: `${badgeText}${regenSuffix}`,
    bg: "var(--color-success-soft, #e6f4ea)",
    color: "#1b7a3d",
  }
}

// ── 선택 후 작업대 ──────────────────────────────────────────────────────────
function SelectedWorkbench({
  candidate,
  overlayAllowed,
  heroWhiteBg,
  hasGeminiKey,
  onBack,
  onVariation,
  onRetouch,
  onRevertRetouch,
  onNeedKey,
}: {
  candidate: Candidate
  overlayAllowed: boolean
  heroWhiteBg: boolean
  hasGeminiKey: boolean
  onBack: () => void
  onVariation: (sourceDataUrl: string, n: number) => void
  onRetouch: (id: string, instruction: string) => Promise<boolean>
  onRevertRetouch: (id: string) => void
  onNeedKey: () => void
}) {
  const [rotated, setRotated] = useState<HTMLCanvasElement | null>(null)
  const [overlay, setOverlay] = useState<TextOverlay>(DEFAULT_OVERLAY)
  const [retouchText, setRetouchText] = useState("")
  const [varCount, setVarCount] = useState(1)
  const [filmStrength, setFilmStrength] = useState<FilmStrength>("light")

  // 선택 후보 이미지를 정사각 작업 소스로 디코드(리터치로 dataUrl이 바뀌면 재디코드).
  useEffect(() => {
    if (!candidate.dataUrl) {
      setRotated(null)
      return
    }
    let cancelled = false
    const img = new Image()
    img.onload = () => {
      if (!cancelled) setRotated(makeRotatedSource(makeWorkingSource(img), 0))
    }
    img.src = candidate.dataUrl
    return () => {
      cancelled = true
    }
  }, [candidate.dataUrl])

  const effectiveOverlay = overlayAllowed ? overlay : DEFAULT_OVERLAY
  // 오버레이 → 필름 그레인 순서로 최종 캔버스에 굽는다(ai-mark 전 픽셀 단계). 미리보기와 동일.
  // 흰 배경 대표이미지(heroWhiteBg)는 비네팅을 꺼 순백 모서리를 유지한다(그레인만).
  const onBeforeBlob = useCallback(
    (canvas: HTMLCanvasElement) => {
      if (overlayAllowed) drawTextOverlay(canvas, effectiveOverlay)
      applyFilmTexture(canvas, { strength: filmStrength, vignette: !heroWhiteBg })
    },
    [overlayAllowed, effectiveOverlay, filmStrength, heroWhiteBg],
  )

  const submitRetouch = async () => {
    const text = retouchText.trim()
    if (!text) return
    if (!hasGeminiKey) {
      onNeedKey()
      return
    }
    const ok = await onRetouch(candidate.id, text)
    if (ok) setRetouchText("")
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <button type="button" onClick={onBack} style={backBtn}>
        ← {fmt(t.create.candidateLabel, { n: candidate.index })}
      </button>

      <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
        {/* 좌: 미리보기 */}
        <section style={{ flex: "1 1 320px", minWidth: 260, display: "flex", justifyContent: "center" }}>
          <OverlayPreview
            rotated={rotated}
            overlay={effectiveOverlay}
            filmStrength={filmStrength}
            heroWhiteBg={heroWhiteBg}
          />
        </section>

        {/* 우: 도구 */}
        <aside style={toolCol}>
          {/* 대화형 리터치 */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <h3 style={toolTitle}>💬 {t.create.retouchTitle}</h3>
            <textarea
              value={retouchText}
              onChange={(e) => setRetouchText(e.target.value)}
              placeholder={t.create.retouchPlaceholder}
              rows={2}
              disabled={candidate.retouching}
              style={textArea}
            />
            <button
              type="button"
              onClick={submitRetouch}
              disabled={candidate.retouching || !retouchText.trim()}
              style={{ ...primaryBtn, opacity: candidate.retouching || !retouchText.trim() ? 0.55 : 1 }}
            >
              {candidate.retouching ? t.create.retouchRunning : `${t.create.retouchApply} · ${t.create.retouchCost}`}
            </button>
            {!!candidate.retouchHistory?.length && (
              <button type="button" onClick={() => onRevertRetouch(candidate.id)} style={outlineMiniBtn}>
                ↩ {t.create.retouchRevert}
              </button>
            )}
          </div>

          {/* 구도 베리에이션 */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <h3 style={toolTitle}>📐 {t.create.variationTitle}</h3>
            <div style={{ display: "flex", gap: 6 }}>
              {VARIATION_COUNTS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setVarCount(n)}
                  style={varCount === n ? countMiniActive : countMini}
                >
                  {fmt(t.create.variationCountLabel, { n })}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() =>
                hasGeminiKey && candidate.dataUrl ? onVariation(candidate.dataUrl, varCount) : onNeedKey()
              }
              style={outlineBtnFull}
            >
              {t.create.variationBtn} · {t.create.retouchCost}
            </button>
            <p style={hintText}>{t.create.variationHint}</p>
          </div>

          {/* 텍스트 오버레이 */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <h3 style={toolTitle}>🏷 {t.create.overlayTitle}</h3>
            {overlayAllowed ? (
              <OverlayControls overlay={overlay} onChange={setOverlay} />
            ) : (
              <p style={disabledNote}>{t.create.overlayDisabled}</p>
            )}
          </div>
        </aside>

        {/* 다운로드 */}
        <aside style={toolCol}>
          {/* 필름 질감 강도 — 미리보기·저장에 동일 적용(화면=저장). 기본 약. */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <h3 style={toolTitle}>🎞 {t.create.filmTextureTitle}</h3>
            <div style={{ display: "flex", gap: 6 }}>
              {FILM_OPTIONS.map((o) => (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => setFilmStrength(o.key)}
                  style={filmStrength === o.key ? chipActive : chip}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <p style={hintText}>{t.create.filmTextureHint}</p>
          </div>

          <DownloadPanel
            rotatedSource={rotated}
            edit={DEFAULT_EDIT}
            onFitSquare={() => {}}
            aiApplied
            onBeforeBlob={onBeforeBlob}
          />
        </aside>
      </div>
    </div>
  )
}

/** 선택 후보 미리보기 — 정사각 캔버스에 이미지+오버레이를 굽는다(화면=저장 픽셀). */
function OverlayPreview({
  rotated,
  overlay,
  filmStrength,
  heroWhiteBg,
}: {
  rotated: HTMLCanvasElement | null
  overlay: TextOverlay
  filmStrength: FilmStrength
  heroWhiteBg: boolean
}) {
  const canvas = useMemo(() => {
    if (!rotated) return null
    const c = renderEdit(rotated, DEFAULT_EDIT, {
      withAdjustments: false,
      forceSquare: true,
      targetSize: 520,
    })
    drawTextOverlay(c, overlay)
    // 미리보기에도 저장과 동일한 필름 질감을 적용(화면=저장, v0.4 워터마크 누락 교훈).
    // 흰 배경 대표이미지는 비네팅을 꺼 저장본과 동일하게 순백 모서리를 유지한다.
    applyFilmTexture(c, { strength: filmStrength, vignette: !heroWhiteBg })
    return c.toDataURL("image/png")
  }, [rotated, overlay, filmStrength, heroWhiteBg])

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 520,
        aspectRatio: "1 / 1",
        borderRadius: "var(--radius-md)",
        border: "1px solid var(--color-line)",
        background: "var(--color-bg-subtle)",
        overflow: "hidden",
      }}
    >
      {canvas ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={canvas} alt="preview" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
      ) : (
        <div style={{ ...imgPlaceholder, height: "100%" }}>
          <Spinner />
        </div>
      )}
    </div>
  )
}

function OverlayControls({
  overlay,
  onChange,
}: {
  overlay: TextOverlay
  onChange: (o: TextOverlay) => void
}) {
  const set = (patch: Partial<TextOverlay>) => onChange({ ...overlay, ...patch })
  const positions: { key: OverlayPosition; label: string }[] = [
    { key: "topLeft", label: t.create.overlayPosTopLeft },
    { key: "topRight", label: t.create.overlayPosTopRight },
    { key: "bottomLeft", label: t.create.overlayPosBottomLeft },
    { key: "bottomRight", label: t.create.overlayPosBottomRight },
  ]
  const sizes: { key: OverlaySize; label: string }[] = [
    { key: "s", label: t.create.overlaySizeS },
    { key: "m", label: t.create.overlaySizeM },
    { key: "l", label: t.create.overlaySizeL },
  ]
  const colors: { key: OverlayColor; label: string }[] = [
    { key: "white", label: t.create.overlayColorWhite },
    { key: "black", label: t.create.overlayColorBlack },
    { key: "point", label: t.create.overlayColorPoint },
  ]

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <input
        value={overlay.line1}
        onChange={(e) => set({ line1: e.target.value })}
        placeholder={t.create.overlayLine1Placeholder}
        style={textInput}
        aria-label={t.create.overlayLine1}
      />
      <input
        value={overlay.line2}
        onChange={(e) => set({ line2: e.target.value })}
        placeholder={t.create.overlayLine2Placeholder}
        style={textInput}
        aria-label={t.create.overlayLine2}
      />
      <ChipRow label={t.create.overlayPosition} options={positions} value={overlay.position} onPick={(v) => set({ position: v })} />
      <ChipRow label={t.create.overlaySize} options={sizes} value={overlay.size} onPick={(v) => set({ size: v })} />
      <ChipRow label={t.create.overlayColor} options={colors} value={overlay.color} onPick={(v) => set({ color: v })} />
      {(overlay.line1 || overlay.line2) && (
        <button type="button" onClick={() => set({ line1: "", line2: "" })} style={outlineMiniBtn}>
          {t.create.overlayClear}
        </button>
      )}
    </div>
  )
}

function ChipRow<T extends string>({
  label,
  options,
  value,
  onPick,
}: {
  label: string
  options: { key: T; label: string }[]
  value: T
  onPick: (v: T) => void
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 11, color: "var(--color-ink-tertiary)", fontWeight: 700 }}>{label}</span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {options.map((o) => (
          <button
            key={o.key}
            type="button"
            onClick={() => onPick(o.key)}
            style={value === o.key ? chipActive : chip}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── 스타일 ───────────────────────────────────────────────────────────────────
const progressBox: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
  padding: "12px 16px",
  borderRadius: "var(--radius-md)",
  background: "var(--color-bg-subtle)",
  border: "1px solid var(--color-line)",
}

const cancelBtn: React.CSSProperties = {
  padding: "6px 14px",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--color-line-strong)",
  background: "var(--color-bg-surface)",
  color: "var(--color-ink)",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
}

const cardBox: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--color-line)",
  background: "var(--color-bg-surface)",
  overflow: "hidden",
}

const imgWrap: React.CSSProperties = {
  position: "relative",
  aspectRatio: "1 / 1",
  background: "var(--color-bg-subtle)",
}

const imgFill: React.CSSProperties = { width: "100%", height: "100%", objectFit: "cover" }

const imgPlaceholder: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "100%",
  aspectRatio: "1 / 1",
}

const busyOverlay: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  background: "rgba(20,24,33,0.45)",
}

const badgeChip: React.CSSProperties = {
  padding: "3px 8px",
  borderRadius: "var(--radius-pill)",
  fontSize: 10.5,
  fontWeight: 800,
  lineHeight: 1.3,
  cursor: "default",
}

const selectBtn: React.CSSProperties = {
  flex: 1,
  padding: "8px 10px",
  borderRadius: "var(--radius-sm)",
  border: "none",
  background: "var(--color-primary)",
  color: "#fff",
  fontSize: 12.5,
  fontWeight: 700,
  cursor: "pointer",
}

const miniBtn: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--color-line-strong)",
  background: "var(--color-bg-surface)",
  color: "var(--color-ink)",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
}

const backBtn: React.CSSProperties = {
  alignSelf: "flex-start",
  padding: "8px 16px",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--color-line-strong)",
  background: "var(--color-bg-surface)",
  color: "var(--color-ink)",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
}

const toolCol: React.CSSProperties = {
  flex: "0 0 280px",
  maxWidth: 320,
  minWidth: 240,
  display: "flex",
  flexDirection: "column",
  gap: 18,
  padding: 18,
  borderRadius: "var(--radius-lg)",
  background: "var(--color-bg-surface)",
  border: "1px solid var(--color-line)",
  boxShadow: "var(--shadow-card)",
}

const toolTitle: React.CSSProperties = { fontSize: 13.5, fontWeight: 800 }

const textArea: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--color-line-strong)",
  background: "var(--color-bg-surface)",
  color: "var(--color-ink)",
  fontSize: 13,
  resize: "vertical",
  fontFamily: "inherit",
}

const textInput: React.CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--color-line-strong)",
  background: "var(--color-bg-surface)",
  color: "var(--color-ink)",
  fontSize: 13,
}

const primaryBtn: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: "var(--radius-sm)",
  border: "none",
  background: "var(--color-primary)",
  color: "#fff",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
}

const outlineBtnFull: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--color-line-strong)",
  background: "var(--color-bg-surface)",
  color: "var(--color-ink)",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
}

const outlineMiniBtn: React.CSSProperties = {
  alignSelf: "flex-start",
  padding: "7px 12px",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--color-line-strong)",
  background: "var(--color-bg-surface)",
  color: "var(--color-ink)",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
}

const countMini: React.CSSProperties = {
  padding: "7px 14px",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--color-line-strong)",
  background: "var(--color-bg-surface)",
  color: "var(--color-ink)",
  fontSize: 12.5,
  fontWeight: 700,
  cursor: "pointer",
}

const countMiniActive: React.CSSProperties = {
  ...countMini,
  border: "2px solid var(--color-primary)",
  background: "var(--color-primary-soft)",
  color: "var(--color-primary-dark)",
}

const chip: React.CSSProperties = {
  padding: "5px 10px",
  borderRadius: "var(--radius-pill)",
  border: "1px solid var(--color-line-strong)",
  background: "var(--color-bg-surface)",
  color: "var(--color-ink-secondary)",
  fontSize: 11.5,
  fontWeight: 600,
  cursor: "pointer",
}

const chipActive: React.CSSProperties = {
  ...chip,
  border: "1px solid var(--color-primary)",
  background: "var(--color-primary-soft)",
  color: "var(--color-primary-dark)",
  fontWeight: 800,
}

const hintText: React.CSSProperties = {
  margin: 0,
  fontSize: 11,
  color: "var(--color-ink-tertiary)",
  lineHeight: 1.5,
}

const disabledNote: React.CSSProperties = {
  margin: 0,
  padding: "10px 12px",
  borderRadius: "var(--radius-sm)",
  background: "var(--color-bg-subtle)",
  color: "var(--color-ink-secondary)",
  fontSize: 11.5,
  lineHeight: 1.5,
}

const errorCard: React.CSSProperties = {
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
}

const xBtn: React.CSSProperties = {
  flexShrink: 0,
  border: "none",
  background: "none",
  color: "inherit",
  fontSize: 14,
  lineHeight: 1,
  cursor: "pointer",
}
