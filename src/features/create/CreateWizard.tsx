"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { t } from "@/lib/i18n"
import { analyzeMaterial, type MaterialAnalysis } from "@/lib/ai/analyze"
import { ANALYZE_COST_KRW } from "@/lib/ai/costs"
import type { CreateMode } from "@/lib/create/prompt-engine"
import { DEFAULT_PRESET_KEY, getPreset, type PresetKey } from "@/lib/create/presets"
import { decodeImageFile, imageToAiBase64, sourceMaxSide } from "@/lib/image/source"
import { Step1Upload } from "./Step1Upload"
import { Step2Style } from "./Step2Style"
import { Step3Results } from "./Step3Results"
import { useCreatePipeline } from "./useCreatePipeline"
import type { ImageSlot, PipelineConfig, StyleChoice } from "./create-types"

type Step = 1 | 2 | 3

/**
 * 썸네일 제작 3단계 마법사 컨테이너 (ThumbnailComingSoon 대체).
 *
 * 상태는 메모리에만 둔다(새로고침 초기화 허용). 재료 사진만 픽셀을 쓰고, 레퍼런스는
 * 클로드 분석 텍스트에만 반영한다. STEP2 진입 시 클로드 분석을 1회 돌려 프롬프트 품질을 높이되,
 * 분석 실패·키 없음이어도 마법사는 그대로 진행한다(분석은 보조).
 */
export function CreateWizard({
  claudeKey,
  geminiKey,
  hasClaudeKey,
  hasGeminiKey,
  onNeedKey,
  onSpend,
  seedFile,
  onSeedConsumed,
  onGoRetouch,
}: {
  claudeKey: string
  geminiKey: string
  hasClaudeKey: boolean
  hasGeminiKey: boolean
  onNeedKey: () => void
  onSpend: (krw: number) => void
  /** 보정 트랙에서 넘어온 재료 사진(있으면 STEP1 재료로 자동 담김). */
  seedFile: File | null
  onSeedConsumed: () => void
  onGoRetouch: () => void
}) {
  const [step, setStep] = useState<Step>(1)
  const [material, setMaterial] = useState<ImageSlot | null>(null)
  const [reference, setReference] = useState<ImageSlot | null>(null)
  const [step1Error, setStep1Error] = useState<string | null>(null)
  const [seedNotice, setSeedNotice] = useState(false)

  const [analysis, setAnalysis] = useState<MaterialAnalysis | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisFailed, setAnalysisFailed] = useState(false)
  const analyzedRef = useRef(false) // 이번 재료로 분석을 이미 시도했는지

  const [mode, setMode] = useState<CreateMode>("preserve")
  const [styleChoice, setStyleChoice] = useState<StyleChoice>(DEFAULT_PRESET_KEY)
  const userPickedStyle = useRef(false)
  const [candidateCount, setCandidateCount] = useState(3)
  const [config, setConfig] = useState<PipelineConfig | null>(null)

  const analyzeAbortRef = useRef<AbortController | null>(null)

  const pipeline = useCreatePipeline({ claudeKey, geminiKey, hasClaudeKey, hasGeminiKey, onSpend })

  // 언마운트 시 미리보기 URL 정리 + 진행 중 분석 중단.
  const materialRef = useRef<ImageSlot | null>(null)
  const referenceRef = useRef<ImageSlot | null>(null)
  materialRef.current = material
  referenceRef.current = reference
  useEffect(() => {
    return () => {
      if (materialRef.current) URL.revokeObjectURL(materialRef.current.url)
      if (referenceRef.current) URL.revokeObjectURL(referenceRef.current.url)
      analyzeAbortRef.current?.abort()
    }
  }, [])

  // 재료가 바뀌면 분석·설정을 리셋(새 재료엔 새 분석).
  const resetForNewMaterial = useCallback(() => {
    analyzeAbortRef.current?.abort()
    analyzedRef.current = false
    setAnalysis(null)
    setAnalyzing(false)
    setAnalysisFailed(false)
    userPickedStyle.current = false
    setStyleChoice(DEFAULT_PRESET_KEY)
    pipeline.reset()
    setConfig(null)
  }, [pipeline])

  // File → ImageSlot(미리보기 URL·최대 변·AI base64) 생성.
  const makeSlot = useCallback(async (file: File): Promise<ImageSlot> => {
    const img = await decodeImageFile(file)
    return {
      file,
      url: URL.createObjectURL(file),
      maxSide: sourceMaxSide(img),
      aiBase64: imageToAiBase64(img),
    }
  }, [])

  const pickMaterial = useCallback(
    async (file: File) => {
      setStep1Error(null)
      try {
        const slot = await makeSlot(file)
        setMaterial((prev) => {
          if (prev) URL.revokeObjectURL(prev.url)
          return slot
        })
        resetForNewMaterial()
      } catch {
        setStep1Error(t.retouch.loadError)
      }
    },
    [makeSlot, resetForNewMaterial],
  )

  const pickReference = useCallback(
    async (file: File) => {
      setStep1Error(null)
      try {
        const slot = await makeSlot(file)
        setReference((prev) => {
          if (prev) URL.revokeObjectURL(prev.url)
          return slot
        })
        // 레퍼런스가 새로 생기면 분석 결과(referenceStyle)가 낡으므로 재분석 유도.
        analyzedRef.current = false
        setAnalysis(null)
        setAnalysisFailed(false)
      } catch {
        setStep1Error(t.retouch.loadError)
      }
    },
    [makeSlot],
  )

  const removeMaterial = useCallback(() => {
    setMaterial((prev) => {
      if (prev) URL.revokeObjectURL(prev.url)
      return null
    })
    resetForNewMaterial()
  }, [resetForNewMaterial])

  const removeReference = useCallback(() => {
    setReference((prev) => {
      if (prev) URL.revokeObjectURL(prev.url)
      return null
    })
    analyzedRef.current = false
    setAnalysis(null)
    setAnalysisFailed(false)
    // 레퍼런스를 빼면 '레퍼런스 따라가기'는 더 이상 유효하지 않다. 그대로 두면 STEP2에서 활성
    // 프리셋 없이 조용히 중립 스타일로 폴백하므로, 기본 프리셋으로 되돌려 셀러가 선택을 인지하게 한다.
    setStyleChoice((prev) => (prev === "reference" ? DEFAULT_PRESET_KEY : prev))
  }, [])

  // 보정 트랙에서 넘어온 재료 사진 소비(1회).
  useEffect(() => {
    if (!seedFile) return
    void pickMaterial(seedFile).then(() => {
      setSeedNotice(true)
      setStep(1)
    })
    onSeedConsumed()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedFile])

  // 분석 실행(STEP2 진입 시 1회, reanalyze로 재실행).
  const runAnalysis = useCallback(async () => {
    if (!material || !hasClaudeKey) return
    analyzeAbortRef.current?.abort()
    const controller = new AbortController()
    analyzeAbortRef.current = controller
    analyzedRef.current = true
    setAnalyzing(true)
    setAnalysisFailed(false)
    try {
      const a = await analyzeMaterial(
        claudeKey,
        material.aiBase64,
        reference?.aiBase64 ?? null,
        controller.signal,
      )
      onSpend(ANALYZE_COST_KRW)
      setAnalysis(a)
      // 사용자가 아직 프리셋을 직접 고르지 않았다면 추천 프리셋을 기본 선택으로.
      if (!userPickedStyle.current) setStyleChoice(a.recommendedPreset)
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return
      // 분석 실패는 마법사 진행을 막지 않는다(기본 프리셋으로 진행 — 분석은 프롬프트 보조).
      setAnalysisFailed(true)
    } finally {
      if (analyzeAbortRef.current === controller) {
        analyzeAbortRef.current = null
        setAnalyzing(false)
      }
    }
  }, [material, reference, hasClaudeKey, claudeKey, onSpend])

  // STEP2 진입 시 아직 분석하지 않았으면 자동 실행.
  useEffect(() => {
    if (step === 2 && hasClaudeKey && !analyzedRef.current) void runAnalysis()
  }, [step, hasClaudeKey, runAnalysis])

  const goStep2 = () => {
    if (!material) {
      setStep1Error(t.create.needMaterial)
      return
    }
    setStep(2)
  }

  const handleStyleChange = (choice: StyleChoice) => {
    userPickedStyle.current = true
    setStyleChoice(choice)
  }

  const handleGenerate = () => {
    if (!material || !hasGeminiKey) return
    const presetKey: PresetKey | null = styleChoice === "reference" ? null : styleChoice
    const cfg: PipelineConfig = {
      materialBase64: material.aiBase64,
      mode,
      presetKey,
      referenceStyle: analysis?.referenceStyle,
      variety: analysis?.variety,
      count: analysis?.count,
      condition: analysis?.condition,
      candidateCount,
    }
    setConfig(cfg)
    setStep(3)
    void pipeline.start(cfg)
  }

  // 텍스트 오버레이 허용 — 대표이미지 계열(스튜디오 클린 등 allowsTextOverlay=false)에서 비활성.
  const overlayAllowed =
    styleChoice === "reference" ? true : (getPreset(styleChoice)?.allowsTextOverlay ?? true)

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: "24px 20px" }}>
      <StepHeader step={step} onPrev={setStep} pipelineRunning={pipeline.phase === "running"} />

      {seedNotice && step === 1 && (
        <div style={seedBox}>
          <span>✓ {t.create.seedNotice}</span>
          <button type="button" onClick={() => setSeedNotice(false)} aria-label={t.keySettings.close} style={xBtn}>
            ✕
          </button>
        </div>
      )}

      {step === 1 && (
        <Step1Upload
          material={material}
          reference={reference}
          error={step1Error}
          onPickMaterial={pickMaterial}
          onPickReference={pickReference}
          onRemoveMaterial={removeMaterial}
          onRemoveReference={removeReference}
          onGoRetouch={onGoRetouch}
        />
      )}

      {step === 2 && (
        <Step2Style
          reference={reference}
          analysis={analysis}
          analyzing={analyzing}
          analysisFailed={analysisFailed}
          hasClaudeKey={hasClaudeKey}
          hasGeminiKey={hasGeminiKey}
          mode={mode}
          styleChoice={styleChoice}
          candidateCount={candidateCount}
          onReanalyze={runAnalysis}
          onModeChange={setMode}
          onStyleChange={handleStyleChange}
          onCandidateCountChange={setCandidateCount}
          onGenerate={handleGenerate}
          onNeedKey={onNeedKey}
        />
      )}

      {step === 3 && (
        <Step3Results
          candidates={pipeline.candidates}
          phase={pipeline.phase}
          opError={pipeline.opError}
          overlayAllowed={overlayAllowed}
          hasGeminiKey={hasGeminiKey}
          onRegenerate={(id) => config && pipeline.regenerateOne(config, id)}
          onVariation={pipeline.runVariation}
          onRetouch={pipeline.retouchCandidate}
          onRevertRetouch={pipeline.revertRetouch}
          onCancel={pipeline.cancel}
          onDismissOpError={pipeline.dismissOpError}
          onNeedKey={onNeedKey}
        />
      )}

      {/* 단계 이동 푸터 */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24 }}>
        {step === 2 ? (
          <button type="button" onClick={() => setStep(1)} style={navBtn}>
            ← {t.create.prev}
          </button>
        ) : (
          <span />
        )}
        {step === 1 && (
          <button type="button" onClick={goStep2} style={navPrimary}>
            {t.create.next} →
          </button>
        )}
        {step === 3 && pipeline.phase !== "running" && (
          <button type="button" onClick={() => setStep(2)} style={navBtn}>
            ← {t.create.prev}
          </button>
        )}
      </div>
    </div>
  )
}

/** 상단 단계 인디케이터(1·2·3). 이전 단계로는 클릭 이동 허용(진행 중 STEP3에서만 잠금). */
function StepHeader({
  step,
  onPrev,
  pipelineRunning,
}: {
  step: Step
  onPrev: (s: Step) => void
  pipelineRunning: boolean
}) {
  const steps: { n: Step; label: string }[] = [
    { n: 1, label: t.create.stepUpload },
    { n: 2, label: t.create.stepStyle },
    { n: 3, label: t.create.stepResults },
  ]
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
      {steps.map((s, i) => {
        const active = s.n === step
        const done = s.n < step
        const canJump = s.n < step && !(pipelineRunning && step === 3)
        return (
          <div key={s.n} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              type="button"
              onClick={() => canJump && onPrev(s.n)}
              disabled={!canJump}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 14px",
                borderRadius: "var(--radius-pill)",
                border: "1px solid",
                borderColor: active ? "var(--color-primary)" : "var(--color-line)",
                background: active ? "var(--color-primary-soft)" : "var(--color-bg-surface)",
                color: active ? "var(--color-primary-dark)" : done ? "var(--color-ink)" : "var(--color-ink-tertiary)",
                fontSize: 13,
                fontWeight: active ? 800 : 600,
                cursor: canJump ? "pointer" : "default",
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  background: active || done ? "var(--color-primary)" : "var(--color-line-strong)",
                  color: "#fff",
                  fontSize: 11,
                  fontWeight: 800,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {done ? "✓" : s.n}
              </span>
              {s.label}
            </button>
            {i < steps.length - 1 && <span style={{ color: "var(--color-line-strong)" }}>—</span>}
          </div>
        )
      })}
    </div>
  )
}

const seedBox: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  marginBottom: 16,
  padding: "10px 14px",
  borderRadius: "var(--radius-sm)",
  background: "var(--color-success-soft, #e6f4ea)",
  color: "#1b7a3d",
  fontSize: 12.5,
  fontWeight: 600,
}

const xBtn: React.CSSProperties = {
  border: "none",
  background: "none",
  color: "inherit",
  fontSize: 14,
  lineHeight: 1,
  cursor: "pointer",
}

const navBtn: React.CSSProperties = {
  padding: "10px 20px",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--color-line-strong)",
  background: "var(--color-bg-surface)",
  color: "var(--color-ink)",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
}

const navPrimary: React.CSSProperties = {
  padding: "10px 24px",
  borderRadius: "var(--radius-sm)",
  border: "none",
  background: "var(--color-primary)",
  color: "#fff",
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
}
