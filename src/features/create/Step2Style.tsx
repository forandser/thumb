"use client"

import { t, fmt } from "@/lib/i18n"
import { type CreateMode, CUSTOM_PROMPT_MAX } from "@/lib/create/prompt-engine"
import { PRESETS } from "@/lib/create/presets"
import { estimateCreateCost } from "@/lib/ai/costs"
import type { GeminiQuality } from "@/lib/ai/gemini"
import type { MaterialAnalysis } from "@/lib/ai/analyze"
import type { StyleChoice } from "./create-types"

const CANDIDATE_OPTIONS = [3, 4, 6] as const

/**
 * STEP 2 — 연출 고르기. 클로드 분석 카드 · 제작 방식(실물 보존/새로 그리기) ·
 * 연출 프리셋 7종(+레퍼런스 따라가기) · 후보 수 · 예상 비용 · 생성 버튼.
 */
export function Step2Style({
  hasReference,
  materialCount,
  referenceCount,
  analysis,
  analyzing,
  analysisFailed,
  hasClaudeKey,
  hasGeminiKey,
  mode,
  styleChoice,
  customPrompt,
  candidateCount,
  quality,
  onReanalyze,
  onModeChange,
  onStyleChange,
  onCustomPromptChange,
  onCandidateCountChange,
  onQualityChange,
  onGenerate,
  onNeedKey,
}: {
  hasReference: boolean
  materialCount: number
  referenceCount: number
  analysis: MaterialAnalysis | null
  analyzing: boolean
  analysisFailed: boolean
  hasClaudeKey: boolean
  hasGeminiKey: boolean
  mode: CreateMode
  styleChoice: StyleChoice
  customPrompt: string
  candidateCount: number
  quality: GeminiQuality
  onReanalyze: () => void
  onModeChange: (mode: CreateMode) => void
  onStyleChange: (choice: StyleChoice) => void
  onCustomPromptChange: (v: string) => void
  onCandidateCountChange: (n: number) => void
  onQualityChange: (q: GeminiQuality) => void
  onGenerate: () => void
  onNeedKey: () => void
}) {
  const est = estimateCreateCost(candidateCount, quality)
  const recommended = analysis?.recommendedPreset

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* 분석 카드 */}
      <AnalysisCard
        analysis={analysis}
        analyzing={analyzing}
        analysisFailed={analysisFailed}
        hasClaudeKey={hasClaudeKey}
        materialCount={materialCount}
        referenceCount={referenceCount}
        onReanalyze={onReanalyze}
      />

      {/* 제작 방식 */}
      <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <h3 style={sectionTitle}>{t.create.modeTitle}</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
          <ModeCard
            active={mode === "preserve"}
            title={t.create.modePreserve}
            desc={t.create.modePreserveDesc}
            onClick={() => onModeChange("preserve")}
          />
          <ModeCard
            active={mode === "generate"}
            title={t.create.modeGenerate}
            desc={t.create.modeGenerateDesc}
            onClick={() => onModeChange("generate")}
          />
        </div>
        {mode === "generate" && <p style={warnLine}>⚠️ {t.create.modeGenerateWarn}</p>}
      </section>

      {/* 연출 프리셋 */}
      <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <h3 style={sectionTitle}>{t.create.presetTitle}</h3>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: 10,
          }}
        >
          {hasReference && (
            <PresetCard
              active={styleChoice === "reference"}
              label={t.create.referenceFollow.label}
              desc={t.create.referenceFollow.desc}
              onClick={() => onStyleChange("reference")}
            />
          )}
          {PRESETS.map((p) => (
            <PresetCard
              key={p.key}
              active={styleChoice === p.key}
              label={t.create.presets[p.key].label}
              desc={t.create.presets[p.key].desc}
              recommended={p.key === recommended}
              onClick={() => onStyleChange(p.key)}
            />
          ))}
        </div>
      </section>

      {/* 원하는 느낌 직접 쓰기 (선택) — 프리셋 위에 셀러 요청을 얹는다(v0.7). */}
      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <h3 style={sectionTitle}>{t.create.customPromptTitle}</h3>
        <textarea
          value={customPrompt}
          onChange={(e) => onCustomPromptChange(e.target.value)}
          placeholder={t.create.customPromptPlaceholder}
          rows={2}
          maxLength={CUSTOM_PROMPT_MAX}
          style={customPromptArea}
        />
        <p style={{ margin: 0, fontSize: 11.5, color: "var(--color-ink-tertiary)", lineHeight: 1.5 }}>
          {t.create.customPromptHint}
        </p>
      </section>

      {/* 후보 수 */}
      <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <h3 style={sectionTitle}>{t.create.countTitle}</h3>
        <div style={{ display: "flex", gap: 8 }}>
          {CANDIDATE_OPTIONS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onCandidateCountChange(n)}
              style={candidateCount === n ? countBtnActive : countBtn}
            >
              {fmt(t.create.variationCountLabel, { n })}
            </button>
          ))}
        </div>
      </section>

      {/* 품질(모델 2티어) — 기본 3.1 Flash / 최고 3 Pro. 예상 비용이 선택에 따라 갱신된다. */}
      <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <h3 style={sectionTitle}>{t.create.qualityTitle}</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
          <QualityCard
            active={quality === "default"}
            title={t.create.qualityDefaultLabel}
            desc={t.create.qualityDefaultDesc}
            onClick={() => onQualityChange("default")}
          />
          <QualityCard
            active={quality === "pro"}
            title={t.create.qualityProLabel}
            desc={t.create.qualityProDesc}
            onClick={() => onQualityChange("pro")}
          />
        </div>
        {quality === "pro" && <p style={warnLine}>🐢 {t.create.qualityProSlowNote}</p>}
      </section>

      {/* 예상 비용 + 생성 */}
      <section style={estBox}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 12, color: "var(--color-ink-tertiary)", fontWeight: 700 }}>
            {t.create.estimateTitle}
          </span>
          <span style={{ fontSize: 12.5, color: "var(--color-ink-secondary)" }}>
            {fmt(t.create.estimateLine, {
              analyze: est.analyze,
              per: est.perCandidate,
              n: est.candidates,
              reserve: est.retryReserve,
            })}
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
          <span style={{ fontSize: 18, fontWeight: 800, color: "var(--color-primary)" }}>
            {fmt(t.create.estimateTotal, { total: est.total })}
          </span>
          <button
            type="button"
            onClick={hasGeminiKey ? onGenerate : onNeedKey}
            style={generateBtn}
          >
            ✨ {t.create.generate}
          </button>
        </div>
      </section>
      {!hasGeminiKey && <p style={warnLine}>⚠️ {t.create.needKeysGemini}</p>}
    </div>
  )
}

function AnalysisCard({
  analysis,
  analyzing,
  analysisFailed,
  hasClaudeKey,
  materialCount,
  referenceCount,
  onReanalyze,
}: {
  analysis: MaterialAnalysis | null
  analyzing: boolean
  analysisFailed: boolean
  hasClaudeKey: boolean
  materialCount: number
  referenceCount: number
  onReanalyze: () => void
}) {
  if (!hasClaudeKey) return null

  return (
    <section
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        padding: 16,
        borderRadius: "var(--radius-lg)",
        background: "var(--color-primary-soft)",
        border: "1px solid #f5cfc4",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <h3 style={{ fontSize: 13.5, fontWeight: 800, color: "var(--color-primary-dark)" }}>
          ✨ {t.create.analysisTitle}
        </h3>
        {!analyzing && (
          <button type="button" onClick={onReanalyze} style={reanalyzeBtn}>
            ↻ {t.create.reanalyze}
          </button>
        )}
      </div>

      <p style={{ margin: 0, fontSize: 11.5, color: "var(--color-primary-dark)", opacity: 0.85 }}>
        {fmt(t.create.analysisScope, { m: materialCount, r: referenceCount })}
      </p>

      {analyzing ? (
        <p style={{ margin: 0, fontSize: 13, color: "var(--color-primary-dark)" }}>
          {t.create.analyzing}
        </p>
      ) : analysisFailed ? (
        <p style={{ margin: 0, fontSize: 12.5, color: "var(--color-ink-secondary)", lineHeight: 1.5 }}>
          {t.create.analysisFailed}
        </p>
      ) : analysis ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12.5 }}>
          {analysis.summary && (
            <p style={{ margin: 0, color: "var(--color-ink)", lineHeight: 1.5 }}>{analysis.summary}</p>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, color: "var(--color-ink-secondary)" }}>
            {analysis.variety && (
              <span>
                <b>{t.create.analysisVariety}</b> {analysis.variety}
              </span>
            )}
            {analysis.count > 0 && (
              <span>
                <b>{t.create.analysisCount}</b> {analysis.count}
                {t.create.analysisCountUnit}
              </span>
            )}
            {analysis.condition && (
              <span>
                <b>{t.create.analysisCondition}</b> {analysis.condition}
              </span>
            )}
          </div>
          {analysis.referenceStyle && (
            <p style={{ margin: 0, color: "var(--color-ink-secondary)", lineHeight: 1.5 }}>
              <b>{t.create.analysisReference}</b> {analysis.referenceStyle}
            </p>
          )}
        </div>
      ) : null}
    </section>
  )
}

function ModeCard({
  active,
  title,
  desc,
  onClick,
}: {
  active: boolean
  title: string
  desc: string
  onClick: () => void
}) {
  return (
    <button type="button" onClick={onClick} style={active ? cardActive : card}>
      <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 800 }}>
        <span
          aria-hidden
          style={{
            width: 14,
            height: 14,
            borderRadius: "50%",
            border: `4px solid ${active ? "var(--color-primary)" : "var(--color-line-strong)"}`,
          }}
        />
        {title}
      </span>
      <span style={{ fontSize: 12, color: "var(--color-ink-secondary)", lineHeight: 1.5 }}>{desc}</span>
    </button>
  )
}

/** 품질 티어 카드(라디오형) — 제작 방식 카드와 동일 UX 승계. */
function QualityCard({
  active,
  title,
  desc,
  onClick,
}: {
  active: boolean
  title: string
  desc: string
  onClick: () => void
}) {
  return (
    <button type="button" onClick={onClick} style={active ? cardActive : card}>
      <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 800 }}>
        <span
          aria-hidden
          style={{
            width: 14,
            height: 14,
            borderRadius: "50%",
            border: `4px solid ${active ? "var(--color-primary)" : "var(--color-line-strong)"}`,
          }}
        />
        {title}
      </span>
      <span style={{ fontSize: 12, color: "var(--color-ink-secondary)", lineHeight: 1.5 }}>{desc}</span>
    </button>
  )
}

function PresetCard({
  active,
  label,
  desc,
  recommended,
  onClick,
}: {
  active: boolean
  label: string
  desc: string
  recommended?: boolean
  onClick: () => void
}) {
  return (
    <button type="button" onClick={onClick} style={active ? cardActive : card}>
      <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13.5, fontWeight: 800 }}>
        {label}
        {recommended && <span style={recBadge}>{t.create.recommendedBadge}</span>}
      </span>
      <span style={{ fontSize: 11.5, color: "var(--color-ink-secondary)", lineHeight: 1.45 }}>
        {desc}
      </span>
    </button>
  )
}

const sectionTitle: React.CSSProperties = { fontSize: 14, fontWeight: 800 }

const customPromptArea: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--color-line-strong)",
  background: "var(--color-bg-surface)",
  color: "var(--color-ink)",
  fontSize: 13,
  lineHeight: 1.5,
  resize: "vertical",
  fontFamily: "inherit",
}

const card: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: 6,
  padding: 14,
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--color-line)",
  background: "var(--color-bg-surface)",
  cursor: "pointer",
  textAlign: "left",
}

const cardActive: React.CSSProperties = {
  ...card,
  border: "2px solid var(--color-primary)",
  background: "var(--color-primary-soft)",
}

const recBadge: React.CSSProperties = {
  padding: "1px 7px",
  borderRadius: "var(--radius-pill)",
  background: "var(--color-primary)",
  color: "#fff",
  fontSize: 10,
  fontWeight: 800,
}

const countBtn: React.CSSProperties = {
  padding: "10px 22px",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--color-line-strong)",
  background: "var(--color-bg-surface)",
  color: "var(--color-ink)",
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
}

const countBtnActive: React.CSSProperties = {
  ...countBtn,
  border: "2px solid var(--color-primary)",
  background: "var(--color-primary-soft)",
  color: "var(--color-primary-dark)",
}

const estBox: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 16,
  flexWrap: "wrap",
  padding: 16,
  borderRadius: "var(--radius-lg)",
  background: "var(--color-bg-subtle)",
  border: "1px solid var(--color-line)",
}

const generateBtn: React.CSSProperties = {
  padding: "12px 28px",
  borderRadius: "var(--radius-sm)",
  border: "none",
  background: "linear-gradient(135deg, #F0654A 0%, #FF9A6B 100%)",
  color: "#fff",
  fontSize: 15,
  fontWeight: 800,
  cursor: "pointer",
  boxShadow: "0 2px 10px rgba(240,101,74,0.32)",
}

const reanalyzeBtn: React.CSSProperties = {
  padding: "5px 10px",
  borderRadius: "var(--radius-sm)",
  border: "1px solid #f5cfc4",
  background: "var(--color-bg-surface)",
  color: "var(--color-primary-dark)",
  fontSize: 11,
  fontWeight: 700,
  cursor: "pointer",
}

const warnLine: React.CSSProperties = {
  margin: 0,
  padding: "10px 12px",
  borderRadius: "var(--radius-sm)",
  background: "var(--color-warning-soft)",
  border: "1px solid #f0d199",
  color: "#8a5a08",
  fontSize: 12,
  lineHeight: 1.5,
}
