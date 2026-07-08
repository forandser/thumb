"use client"

import { t } from "@/lib/i18n"
import { isDefaultEdit } from "@/lib/image/types"
import type { Badge, GalleryItem } from "./gallery-types"

function badgeOf(item: GalleryItem): Badge {
  // AI 소스 교체(누끼·화질)는 edit가 DEFAULT여도 원본이 아니다.
  if (isDefaultEdit(item.edit) && !item.aiFile) return "original"
  if (item.aiComment || item.aiFile) return "ai"
  return "manual"
}

const BADGE_STYLE: Record<Badge, { label: string; bg: string; color: string }> = {
  original: { label: t.gallery.badgeOriginal, bg: "rgba(20,24,33,0.55)", color: "#fff" },
  ai: { label: t.gallery.badgeAi, bg: "var(--color-primary)", color: "#fff" },
  manual: { label: t.gallery.badgeManual, bg: "#4b5563", color: "#fff" },
}

/** 갤러리 그리드 한 장의 카드 — 축소본·상태 뱃지·선택 체크박스·AI 진행 상태·삭제. */
export function GalleryCard({
  item,
  selected,
  onToggleSelect,
  onOpen,
  onRemove,
  onRetry,
}: {
  item: GalleryItem
  selected: boolean
  onToggleSelect: () => void
  onOpen: () => void
  onRemove: () => void
  onRetry: () => void
}) {
  const badge = BADGE_STYLE[badgeOf(item)]
  // AI 진행 중(대기/진행)인 카드는 열 수 없다 — 결과 유실 방지 방어선.
  const busy = item.aiStatus === "queued" || item.aiStatus === "running"
  const isCanceled = item.aiStatus === "canceled"
  // 거절(refusal)은 재시도를 유도하지 않는다.
  const isRefusal = item.aiStatus === "failed" && item.aiErrorCode === "refusal"
  const showFailBar = item.aiStatus === "failed" || isCanceled
  const failLabel = isCanceled
    ? t.gallery.aiCanceled
    : isRefusal
      ? t.gallery.aiRefused
      : t.gallery.aiFailed
  const failBg = isCanceled || isRefusal ? "rgba(75,85,99,0.92)" : "rgba(214,69,69,0.92)"

  return (
    <div
      onClick={busy ? undefined : onOpen}
      role="button"
      aria-disabled={busy}
      tabIndex={busy ? -1 : 0}
      title={busy ? t.gallery.aiBusyTooltip : undefined}
      onKeyDown={(e) => {
        if (busy) return
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onOpen()
        }
      }}
      style={{
        position: "relative",
        borderRadius: "var(--radius-md)",
        overflow: "hidden",
        border: selected ? "2px solid var(--color-primary)" : "1px solid var(--color-line)",
        background: "var(--color-bg-subtle)",
        cursor: busy ? "default" : "pointer",
        boxShadow: "var(--shadow-card)",
      }}
    >
      {/* 정사각 썸네일 영역 */}
      <div style={{ position: "relative", width: "100%", paddingBottom: "100%" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.thumbUrl}
          alt={item.name}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "contain",
            background: "#fff",
          }}
        />

        {/* 상태 뱃지 */}
        <span
          style={{
            position: "absolute",
            top: 8,
            left: 8,
            padding: "3px 9px",
            borderRadius: "var(--radius-pill)",
            background: badge.bg,
            color: badge.color,
            fontSize: 10.5,
            fontWeight: 700,
          }}
        >
          {badge.label}
        </span>

        {/* 선택 체크박스 */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onToggleSelect()
          }}
          aria-pressed={selected}
          aria-label={item.name}
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            width: 24,
            height: 24,
            borderRadius: 6,
            border: selected ? "none" : "1.5px solid rgba(255,255,255,0.95)",
            background: selected ? "var(--color-primary)" : "rgba(20,24,33,0.35)",
            color: "#fff",
            fontSize: 14,
            lineHeight: 1,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {selected ? "✓" : ""}
        </button>

        {/* 삭제 */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          aria-label={t.gallery.remove}
          style={{
            position: "absolute",
            bottom: 8,
            right: 8,
            width: 24,
            height: 24,
            borderRadius: "50%",
            border: "none",
            background: "rgba(20,24,33,0.5)",
            color: "#fff",
            fontSize: 12,
            lineHeight: 1,
            cursor: "pointer",
          }}
        >
          ✕
        </button>

        {/* AI 진행 상태 오버레이 */}
        {busy && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(20,24,33,0.42)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span
              style={{
                padding: "5px 12px",
                borderRadius: "var(--radius-pill)",
                background: "rgba(255,255,255,0.95)",
                color: "var(--color-ink)",
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              {item.aiStatus === "running" ? `✨ ${t.gallery.aiRunning}` : `⏳ ${t.gallery.aiQueued}`}
            </span>
          </div>
        )}

        {/* 실패·취소 안내(+ 재시도, 단 거절은 재시도 숨김) */}
        {showFailBar && (
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              padding: "6px 8px",
              background: failBg,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 6,
            }}
          >
            <span style={{ color: "#fff", fontSize: 11, fontWeight: 700 }}>
              ⚠️ {failLabel}
            </span>
            {!isRefusal && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onRetry()
                }}
                style={{
                  padding: "3px 10px",
                  borderRadius: "var(--radius-xs)",
                  border: "none",
                  background: "#fff",
                  color: "#a62a2a",
                  fontSize: 11,
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                {t.gallery.retry}
              </button>
            )}
          </div>
        )}
      </div>

      {/* 파일명 */}
      <div
        style={{
          padding: "7px 10px",
          fontSize: 11.5,
          color: "var(--color-ink-secondary)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          background: "var(--color-bg-surface)",
        }}
      >
        {item.name}
      </div>
    </div>
  )
}
