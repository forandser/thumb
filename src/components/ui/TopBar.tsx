"use client"

import { t } from "@/lib/i18n"

export type TabKey = "thumbnail" | "retouch"

/**
 * 공통 셸 상단바 — 로고 · 탭 2개 · 예상 비용 · 키 설정 버튼.
 * 비용은 v0.1에서 항상 ₩0(무료 보정만). 키 연결 여부는 ⚙ 버튼에 점으로 표시.
 */
export function TopBar({
  activeTab,
  onTabChange,
  onOpenSettings,
  anyKeyConnected,
}: {
  activeTab: TabKey
  onTabChange: (tab: TabKey) => void
  onOpenSettings: () => void
  anyKeyConnected: boolean
}) {
  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        padding: "10px 20px",
        background: "var(--color-bg-surface)",
        borderBottom: "1px solid var(--color-line)",
        flexWrap: "wrap",
      }}
    >
      {/* 로고 */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          aria-hidden
          style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            background: "linear-gradient(135deg, #F0654A 0%, #FF9A6B 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 18,
            boxShadow: "0 2px 8px rgba(240, 101, 74, 0.3)",
          }}
        >
          🍊
        </div>
        <span style={{ fontSize: 17, fontWeight: 800, letterSpacing: -0.3 }}>{t.app.name}</span>
      </div>

      {/* 탭 */}
      <nav
        role="tablist"
        aria-label={t.app.name}
        style={{
          display: "flex",
          gap: 4,
          background: "var(--color-bg-subtle)",
          borderRadius: "var(--radius-pill)",
          padding: 4,
        }}
      >
        <TabButton
          label={t.tabs.thumbnail}
          active={activeTab === "thumbnail"}
          onClick={() => onTabChange("thumbnail")}
        />
        <TabButton
          label={t.tabs.retouch}
          active={activeTab === "retouch"}
          onClick={() => onTabChange("retouch")}
        />
      </nav>

      {/* 우측: 비용 표시 + 키 설정 */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          title={t.cost.note}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            lineHeight: 1.2,
          }}
        >
          <span style={{ fontSize: 10, color: "var(--color-ink-tertiary)" }}>{t.cost.label}</span>
          <span style={{ fontSize: 15, fontWeight: 800, color: "var(--color-ink)" }}>
            {t.cost.zero}
          </span>
        </div>
        <button
          type="button"
          onClick={onOpenSettings}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 14px",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--color-line-strong)",
            background: "var(--color-bg-surface)",
            color: "var(--color-ink)",
            fontSize: "var(--font-size-sm)",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          <span aria-hidden>⚙</span>
          <span>{t.keyButton}</span>
          <span
            aria-hidden
            title={anyKeyConnected ? t.keySettings.statusConnected : t.keySettings.statusEmpty}
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: anyKeyConnected ? "var(--color-success)" : "var(--color-line-strong)",
            }}
          />
        </button>
      </div>
    </header>
  )
}

function TabButton({
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
      role="tab"
      aria-selected={active}
      onClick={onClick}
      style={{
        padding: "8px 18px",
        borderRadius: "var(--radius-pill)",
        border: "none",
        background: active ? "var(--color-bg-surface)" : "transparent",
        color: active ? "var(--color-primary)" : "var(--color-ink-secondary)",
        fontSize: "var(--font-size-md)",
        fontWeight: active ? 700 : 500,
        cursor: "pointer",
        boxShadow: active ? "0 1px 4px rgba(20, 24, 33, 0.1)" : "none",
        transition: "color 0.15s",
      }}
    >
      {label}
    </button>
  )
}
