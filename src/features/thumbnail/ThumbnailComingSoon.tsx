"use client"

import { t } from "@/lib/i18n"

/**
 * 썸네일 제작 탭 — v0.2 예정. 파이프라인 소개 + "곧 열려요" 안내.
 */
export function ThumbnailComingSoon({ onGoRetouch }: { onGoRetouch: () => void }) {
  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "40px 20px" }}>
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "5px 14px",
          borderRadius: "var(--radius-pill)",
          background: "var(--color-primary-soft)",
          color: "var(--color-primary-dark)",
          fontSize: 12,
          fontWeight: 700,
          marginBottom: 16,
        }}
      >
        <span aria-hidden>✨</span> {t.thumbnail.badge}
      </div>

      <h2 style={{ fontSize: 24, fontWeight: 800, letterSpacing: -0.5, marginBottom: 10 }}>
        {t.thumbnail.title}
      </h2>
      <p
        style={{
          fontSize: 15,
          color: "var(--color-ink-secondary)",
          lineHeight: 1.6,
          marginBottom: 32,
        }}
      >
        {t.thumbnail.lead}
      </p>

      <h3 style={{ fontSize: 14, fontWeight: 800, marginBottom: 14 }}>
        {t.thumbnail.pipelineTitle}
      </h3>
      <ol
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          margin: 0,
          padding: 0,
          marginBottom: 32,
        }}
      >
        {t.thumbnail.steps.map((step, i) => (
          <li
            key={i}
            style={{
              display: "flex",
              gap: 14,
              alignItems: "flex-start",
              padding: 16,
              borderRadius: "var(--radius-md)",
              background: "var(--color-bg-surface)",
              border: "1px solid var(--color-line)",
              listStyle: "none",
            }}
          >
            <span
              aria-hidden
              style={{
                flexShrink: 0,
                width: 30,
                height: 30,
                borderRadius: "50%",
                background: "var(--color-bg-subtle)",
                color: "var(--color-ink-secondary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 800,
                fontSize: 14,
              }}
            >
              {i + 1}
            </span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>{step.title}</div>
              <div style={{ fontSize: 13, color: "var(--color-ink-secondary)", lineHeight: 1.5 }}>
                {step.body}
              </div>
            </div>
          </li>
        ))}
      </ol>

      <div
        style={{
          padding: 20,
          borderRadius: "var(--radius-lg)",
          background: "var(--color-bg-subtle)",
          textAlign: "center",
        }}
      >
        <p style={{ fontSize: 14, color: "var(--color-ink-secondary)", marginBottom: 14 }}>
          {t.thumbnail.ctaHint}
        </p>
        <button
          type="button"
          onClick={onGoRetouch}
          style={{
            padding: "12px 28px",
            borderRadius: "var(--radius-sm)",
            border: "none",
            background: "var(--color-primary)",
            color: "#fff",
            fontSize: 15,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          {t.thumbnail.goRetouch} →
        </button>
      </div>
    </div>
  )
}
