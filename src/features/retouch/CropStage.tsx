"use client"

import { useEffect, useRef, useState } from "react"
import { t } from "@/lib/i18n"
import type { Crop, EditState } from "@/lib/image/types"
import { renderEdit } from "@/lib/image/render"
import { fitBox } from "@/lib/image/fit"

/** 픽셀 크롭(회전 소스 기준). */
interface PxCrop {
  sx: number
  sy: number
  sw: number
  sh: number
}

type Handle = "move" | "nw" | "ne" | "sw" | "se" | "n" | "e" | "s" | "w"
type Aspect = "free" | "square"

/**
 * 크롭 작업대 — 전체 이미지(보정 적용)를 배경으로 깔고 크롭 박스를 드래그.
 * 표시 배율이 균일하므로(전체 이미지 fit) 픽셀 공간에서 다루면 정사각 잠금이 단순해진다.
 */
export function CropStage({
  rotatedSource,
  edit,
  box,
  onApply,
  onCancel,
}: {
  rotatedSource: HTMLCanvasElement
  edit: EditState
  box: number
  onApply: (crop: Crop) => void
  onCancel: () => void
}) {
  const rw = rotatedSource.width
  const rh = rotatedSource.height
  const minSrc = Math.max(20, Math.min(rw, rh) * 0.05)

  const bgRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const disp = fitBox(rw, rh, box, box)

  const [aspect, setAspect] = useState<Aspect>("free")
  const [crop, setCrop] = useState<PxCrop>(() => initialCrop(edit.crop, rw, rh))
  const drag = useRef<{ handle: Handle; startX: number; startY: number; start: PxCrop } | null>(null)

  // 배경(전체 이미지, 보정 적용) 렌더
  useEffect(() => {
    const canvas = bgRef.current
    if (!canvas) return
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1
    const rendered = renderEdit(
      rotatedSource,
      { ...edit, crop: null },
      { withAdjustments: true, maxPreview: Math.round(Math.max(disp.w, disp.h) * dpr) },
    )
    canvas.width = rendered.width
    canvas.height = rendered.height
    canvas.style.width = `${disp.w}px`
    canvas.style.height = `${disp.h}px`
    canvas.getContext("2d")?.drawImage(rendered, 0, 0)
  }, [rotatedSource, edit, disp.w, disp.h])

  const toSrc = (clientX: number, clientY: number): { x: number; y: number } => {
    const rect = wrapRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0 || rect.height === 0) return { x: 0, y: 0 }
    return {
      x: ((clientX - rect.left) / rect.width) * rw,
      y: ((clientY - rect.top) / rect.height) * rh,
    }
  }

  const startDrag = (handle: Handle) => (e: React.PointerEvent) => {
    e.stopPropagation()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    const p = toSrc(e.clientX, e.clientY)
    drag.current = { handle, startX: p.x, startY: p.y, start: crop }
  }

  const onMove = (e: React.PointerEvent) => {
    const session = drag.current
    if (!session) return
    const p = toSrc(e.clientX, e.clientY)
    setCrop(computeCrop(session.handle, session.start, p, session.startX, session.startY, {
      rw,
      rh,
      minSrc,
      square: aspect === "square",
    }))
  }

  const endDrag = () => {
    drag.current = null
  }

  const applyAspect = (next: Aspect) => {
    setAspect(next)
    if (next === "square") setCrop((c) => toSquare(c, rw, rh))
  }

  const scaleX = disp.w / rw
  const scaleY = disp.h / rh
  const boxStyle: React.CSSProperties = {
    position: "absolute",
    left: crop.sx * scaleX,
    top: crop.sy * scaleY,
    width: crop.sw * scaleX,
    height: crop.sh * scaleY,
  }

  const cornerHandles: Handle[] = ["nw", "ne", "sw", "se"]
  const edgeHandles: Handle[] = ["n", "e", "s", "w"]
  const handles = aspect === "square" ? cornerHandles : [...cornerHandles, ...edgeHandles]

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
      <div
        ref={wrapRef}
        onPointerMove={onMove}
        onPointerUp={endDrag}
        style={{
          position: "relative",
          width: disp.w,
          height: disp.h,
          touchAction: "none",
          userSelect: "none",
          borderRadius: "var(--radius-md)",
          overflow: "hidden",
          boxShadow: "var(--shadow-card)",
        }}
      >
        <canvas ref={bgRef} style={{ display: "block" }} />
        {/* 어두운 마스크 (크롭 밖) */}
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          <div
            style={{
              position: "absolute",
              ...boxStyle,
              boxShadow: "0 0 0 9999px rgba(20,24,33,0.5)",
              border: "1px solid rgba(255,255,255,0.9)",
            }}
          />
        </div>
        {/* 크롭 박스 (이동) */}
        <div
          onPointerDown={startDrag("move")}
          style={{ ...boxStyle, cursor: "move" }}
        >
          {/* 3분할 격자 */}
          <Grid />
          {/* 핸들 */}
          {handles.map((h) => (
            <HandleDot key={h} handle={h} onPointerDown={startDrag(h)} />
          ))}
        </div>
      </div>

      <p style={{ fontSize: 12, color: "var(--color-ink-tertiary)" }}>{t.retouch.cropHint}</p>

      {/* 컨트롤 */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
        <div
          style={{
            display: "flex",
            gap: 4,
            background: "var(--color-bg-subtle)",
            borderRadius: "var(--radius-pill)",
            padding: 4,
          }}
        >
          <AspectBtn label={t.retouch.cropFree} active={aspect === "free"} onClick={() => applyAspect("free")} />
          <AspectBtn label={t.retouch.cropSquare} active={aspect === "square"} onClick={() => applyAspect("square")} />
        </div>
        <button type="button" onClick={onCancel} style={ghostBtn}>
          {t.retouch.cropCancel}
        </button>
        <button
          type="button"
          onClick={() => onApply(toNormalized(crop, rw, rh))}
          style={primaryBtn}
        >
          {t.retouch.cropApply}
        </button>
      </div>
    </div>
  )
}

// ── 크롭 계산 ─────────────────────────────────────────────────────────────

function initialCrop(existing: Crop | null, rw: number, rh: number): PxCrop {
  if (existing) {
    return { sx: existing.x * rw, sy: existing.y * rh, sw: existing.w * rw, sh: existing.h * rh }
  }
  // 기본: 중앙 80%
  const sw = rw * 0.8
  const sh = rh * 0.8
  return { sx: (rw - sw) / 2, sy: (rh - sh) / 2, sw, sh }
}

function toNormalized(c: PxCrop, rw: number, rh: number): Crop {
  return { x: c.sx / rw, y: c.sy / rh, w: c.sw / rw, h: c.sh / rh }
}

function toSquare(c: PxCrop, rw: number, rh: number): PxCrop {
  const side = Math.min(c.sw, c.sh)
  const cx = c.sx + c.sw / 2
  const cy = c.sy + c.sh / 2
  let sx = cx - side / 2
  let sy = cy - side / 2
  sx = Math.min(Math.max(0, sx), rw - side)
  sy = Math.min(Math.max(0, sy), rh - side)
  return { sx, sy, sw: side, sh: side }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

interface Bounds {
  rw: number
  rh: number
  minSrc: number
  square: boolean
}

function computeCrop(
  handle: Handle,
  start: PxCrop,
  pointer: { x: number; y: number },
  startX: number,
  startY: number,
  b: Bounds,
): PxCrop {
  if (handle === "move") {
    const dx = pointer.x - startX
    const dy = pointer.y - startY
    return {
      sx: clamp(start.sx + dx, 0, b.rw - start.sw),
      sy: clamp(start.sy + dy, 0, b.rh - start.sh),
      sw: start.sw,
      sh: start.sh,
    }
  }

  const px = clamp(pointer.x, 0, b.rw)
  const py = clamp(pointer.y, 0, b.rh)

  // 정사각 잠금 (코너만) — 반대 코너 기준.
  if (b.square && handle.length === 2) {
    return squareCorner(handle, start, px, py, b)
  }

  // 자유 리사이즈
  let x0 = start.sx
  let y0 = start.sy
  let x1 = start.sx + start.sw
  let y1 = start.sy + start.sh
  const movedLeft = handle === "w" || handle === "nw" || handle === "sw"
  const movedRight = handle === "e" || handle === "ne" || handle === "se"
  const movedTop = handle === "n" || handle === "nw" || handle === "ne"
  const movedBottom = handle === "s" || handle === "sw" || handle === "se"
  if (movedLeft) x0 = px
  if (movedRight) x1 = px
  if (movedTop) y0 = py
  if (movedBottom) y1 = py

  // 최소 크기 보장
  if (x1 - x0 < b.minSrc) {
    if (movedLeft) x0 = x1 - b.minSrc
    else x1 = x0 + b.minSrc
  }
  if (y1 - y0 < b.minSrc) {
    if (movedTop) y0 = y1 - b.minSrc
    else y1 = y0 + b.minSrc
  }
  x0 = clamp(x0, 0, b.rw - b.minSrc)
  y0 = clamp(y0, 0, b.rh - b.minSrc)
  x1 = clamp(x1, x0 + b.minSrc, b.rw)
  y1 = clamp(y1, y0 + b.minSrc, b.rh)
  return { sx: x0, sy: y0, sw: x1 - x0, sh: y1 - y0 }
}

function squareCorner(
  handle: Handle,
  start: PxCrop,
  px: number,
  py: number,
  b: Bounds,
): PxCrop {
  // 반대 코너(anchor) 고정
  let ax: number
  let ay: number
  switch (handle) {
    case "se":
      ax = start.sx
      ay = start.sy
      break
    case "sw":
      ax = start.sx + start.sw
      ay = start.sy
      break
    case "ne":
      ax = start.sx
      ay = start.sy + start.sh
      break
    default: // nw
      ax = start.sx + start.sw
      ay = start.sy + start.sh
      break
  }
  const dirX = px >= ax ? 1 : -1
  const dirY = py >= ay ? 1 : -1
  const maxX = dirX > 0 ? b.rw - ax : ax
  const maxY = dirY > 0 ? b.rh - ay : ay
  let side = Math.max(Math.abs(px - ax), Math.abs(py - ay))
  side = Math.min(side, maxX, maxY)
  side = Math.max(side, b.minSrc)
  const xEnd = ax + dirX * side
  const yEnd = ay + dirY * side
  return {
    sx: Math.min(ax, xEnd),
    sy: Math.min(ay, yEnd),
    sw: side,
    sh: side,
  }
}

// ── 표시 요소 ─────────────────────────────────────────────────────────────

function Grid() {
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {[33.33, 66.66].map((p) => (
        <div
          key={`v${p}`}
          style={{ position: "absolute", top: 0, bottom: 0, left: `${p}%`, width: 1, background: "rgba(255,255,255,0.4)" }}
        />
      ))}
      {[33.33, 66.66].map((p) => (
        <div
          key={`h${p}`}
          style={{ position: "absolute", left: 0, right: 0, top: `${p}%`, height: 1, background: "rgba(255,255,255,0.4)" }}
        />
      ))}
    </div>
  )
}

const HANDLE_POS: Record<Exclude<Handle, "move">, { left: string; top: string; cursor: string }> = {
  nw: { left: "0%", top: "0%", cursor: "nwse-resize" },
  ne: { left: "100%", top: "0%", cursor: "nesw-resize" },
  sw: { left: "0%", top: "100%", cursor: "nesw-resize" },
  se: { left: "100%", top: "100%", cursor: "nwse-resize" },
  n: { left: "50%", top: "0%", cursor: "ns-resize" },
  s: { left: "50%", top: "100%", cursor: "ns-resize" },
  e: { left: "100%", top: "50%", cursor: "ew-resize" },
  w: { left: "0%", top: "50%", cursor: "ew-resize" },
}

function HandleDot({
  handle,
  onPointerDown,
}: {
  handle: Handle
  onPointerDown: (e: React.PointerEvent) => void
}) {
  if (handle === "move") return null
  const pos = HANDLE_POS[handle]
  return (
    <div
      onPointerDown={onPointerDown}
      style={{
        position: "absolute",
        left: pos.left,
        top: pos.top,
        width: 16,
        height: 16,
        transform: "translate(-50%, -50%)",
        borderRadius: 4,
        background: "#fff",
        border: "2px solid var(--color-primary)",
        cursor: pos.cursor,
        touchAction: "none",
      }}
    />
  )
}

function AspectBtn({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "7px 14px",
        borderRadius: "var(--radius-pill)",
        border: "none",
        background: active ? "var(--color-bg-surface)" : "transparent",
        color: active ? "var(--color-primary)" : "var(--color-ink-secondary)",
        fontSize: 13,
        fontWeight: active ? 700 : 500,
        cursor: "pointer",
        boxShadow: active ? "0 1px 4px rgba(20,24,33,0.1)" : "none",
      }}
    >
      {label}
    </button>
  )
}

const ghostBtn: React.CSSProperties = {
  padding: "9px 16px",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--color-line-strong)",
  background: "var(--color-bg-surface)",
  color: "var(--color-ink)",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
}

const primaryBtn: React.CSSProperties = {
  padding: "9px 20px",
  borderRadius: "var(--radius-sm)",
  border: "none",
  background: "var(--color-primary)",
  color: "#fff",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
}
