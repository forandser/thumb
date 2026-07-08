"use client"

import { useEffect, useRef, useState } from "react"
import { t } from "@/lib/i18n"
import type { EditState } from "@/lib/image/types"
import { renderEdit } from "@/lib/image/render"
import { fitBox } from "@/lib/image/fit"

/** 크롭 적용 후 콘텐츠 픽셀 크기(회전 소스 기준). */
function contentDims(rs: HTMLCanvasElement, edit: EditState): { w: number; h: number } {
  const w = edit.crop ? edit.crop.w * rs.width : rs.width
  const h = edit.crop ? edit.crop.h * rs.height : rs.height
  return { w, h }
}

const CANVAS_STYLE: React.CSSProperties = {
  display: "block",
  borderRadius: "var(--radius-md)",
  boxShadow: "var(--shadow-card)",
  background: "#fff",
}

/**
 * 단일 미리보기(보정 적용).
 * 크롭이 정사각이 아니면 저장 시 가운데 1:1을 잘라내므로, 저장될 정사각 범위를
 * 점선 + 바깥 어둡게로 오버레이해 미리보기와 저장 프레이밍 차이를 눈으로 알린다.
 */
export function PreviewStage({
  rotatedSource,
  edit,
  box,
}: {
  rotatedSource: HTMLCanvasElement
  edit: EditState
  box: number
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [disp, setDisp] = useState({ w: 0, h: 0 })

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const { w: cw, h: ch } = contentDims(rotatedSource, edit)
    const d = fitBox(cw, ch, box, box)
    setDisp(d)
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1
    const rendered = renderEdit(rotatedSource, edit, {
      withAdjustments: true,
      maxPreview: Math.round(Math.max(d.w, d.h) * dpr),
    })
    canvas.width = rendered.width
    canvas.height = rendered.height
    canvas.style.width = `${d.w}px`
    canvas.style.height = `${d.h}px`
    canvas.getContext("2d")?.drawImage(rendered, 0, 0)
  }, [rotatedSource, edit, box])

  const { w: cw, h: ch } = contentDims(rotatedSource, edit)
  const isSquare = Math.abs(cw - ch) / Math.max(cw, ch) < 0.01
  const side = Math.min(disp.w, disp.h)
  const showGuide = !isSquare && disp.w > 0 && disp.h > 0

  return (
    <div
      style={{
        position: "relative",
        display: "inline-block",
        borderRadius: "var(--radius-md)",
        boxShadow: "var(--shadow-card)",
        overflow: "hidden",
        background: "#fff",
      }}
    >
      <canvas ref={ref} style={{ display: "block" }} />
      {showGuide && (
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          {/* 저장될 1:1 정사각 범위 (점선 + 바깥 어둡게) */}
          <div
            style={{
              position: "absolute",
              left: (disp.w - side) / 2,
              top: (disp.h - side) / 2,
              width: side,
              height: side,
              boxShadow: "0 0 0 9999px rgba(20,24,33,0.42)",
              border: "1.5px dashed rgba(255,255,255,0.95)",
              borderRadius: 2,
            }}
          />
          <span
            style={{
              position: "absolute",
              left: "50%",
              top: (disp.h - side) / 2 + 6,
              transform: "translateX(-50%)",
              padding: "2px 8px",
              borderRadius: "var(--radius-pill)",
              background: "rgba(20,24,33,0.62)",
              color: "#fff",
              fontSize: 10,
              fontWeight: 700,
              whiteSpace: "nowrap",
            }}
          >
            {t.retouch.squareGuide}
          </span>
        </div>
      )}
    </div>
  )
}

/**
 * Before/After 비교 슬라이더 — 가운데 손잡이를 끌어 원본과 보정을 비교.
 * beforeRotatedSource가 있으면(AI 소스 교체 시) Before는 원본 파일 기준으로 그린다(실물 대조).
 */
export function CompareStage({
  rotatedSource,
  beforeRotatedSource,
  edit,
  box,
}: {
  rotatedSource: HTMLCanvasElement
  beforeRotatedSource?: HTMLCanvasElement
  edit: EditState
  box: number
}) {
  const beforeRef = useRef<HTMLCanvasElement>(null)
  const afterRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState(0.5) // 0..1 (원본이 보이는 왼쪽 비율)
  const [disp, setDisp] = useState({ w: 0, h: 0 })

  useEffect(() => {
    const { w: cw, h: ch } = contentDims(rotatedSource, edit)
    const d = fitBox(cw, ch, box, box)
    setDisp(d)
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1
    const maxPreview = Math.round(Math.max(d.w, d.h) * dpr)
    const draw = (
      ref: React.RefObject<HTMLCanvasElement | null>,
      source: HTMLCanvasElement,
      withAdjustments: boolean,
    ) => {
      const canvas = ref.current
      if (!canvas) return
      const rendered = renderEdit(source, edit, { withAdjustments, maxPreview })
      canvas.width = rendered.width
      canvas.height = rendered.height
      canvas.style.width = `${d.w}px`
      canvas.style.height = `${d.h}px`
      canvas.getContext("2d")?.drawImage(rendered, 0, 0)
    }
    // Before = 원본 파일 소스(있으면), 보정 없이. After = 활성 소스 + 보정.
    draw(beforeRef, beforeRotatedSource ?? rotatedSource, false)
    draw(afterRef, rotatedSource, true)
  }, [rotatedSource, beforeRotatedSource, edit, box])

  const updateFromClient = (clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return
    const p = (clientX - rect.left) / rect.width
    setPos(Math.min(1, Math.max(0, p)))
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      <div
        ref={containerRef}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          updateFromClient(e.clientX)
        }}
        onPointerMove={(e) => {
          if (e.buttons === 1) updateFromClient(e.clientX)
        }}
        style={{
          position: "relative",
          width: disp.w,
          height: disp.h,
          touchAction: "none",
          cursor: "ew-resize",
          userSelect: "none",
          borderRadius: "var(--radius-md)",
          overflow: "hidden",
          boxShadow: "var(--shadow-card)",
        }}
      >
        {/* After (아래) */}
        <canvas ref={afterRef} style={{ ...CANVAS_STYLE, boxShadow: "none", borderRadius: 0 }} />
        {/* Before (위, 왼쪽 pos만큼만 노출) */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            clipPath: `inset(0 ${(1 - pos) * 100}% 0 0)`,
          }}
        >
          <canvas ref={beforeRef} style={{ ...CANVAS_STYLE, boxShadow: "none", borderRadius: 0 }} />
        </div>
        {/* 라벨 */}
        <Tag text={t.retouch.before} side="left" />
        <Tag text={t.retouch.after} side="right" />
        {/* 디바이더 + 손잡이 */}
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: `${pos * 100}%`,
            width: 2,
            background: "#fff",
            boxShadow: "0 0 0 1px rgba(0,0,0,0.25)",
            transform: "translateX(-1px)",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: 30,
              height: 30,
              borderRadius: "50%",
              background: "#fff",
              boxShadow: "0 2px 8px rgba(20,24,33,0.35)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 13,
              color: "var(--color-ink-secondary)",
            }}
          >
            ↔
          </div>
        </div>
      </div>
      <p style={{ fontSize: 12, color: "var(--color-ink-tertiary)" }}>{t.retouch.compareHint}</p>
    </div>
  )
}

function Tag({ text, side }: { text: string; side: "left" | "right" }) {
  return (
    <span
      style={{
        position: "absolute",
        top: 10,
        [side]: 10,
        padding: "3px 10px",
        borderRadius: "var(--radius-pill)",
        background: "rgba(20,24,33,0.6)",
        color: "#fff",
        fontSize: 11,
        fontWeight: 700,
      }}
    >
      {text}
    </span>
  )
}
