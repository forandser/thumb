"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { t, fmt } from "@/lib/i18n"
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

/** 재료 사진 상한(스펙 §STEP1 — 대표 1 + 보조 다수, 최대 10장). */
const MATERIAL_MAX = 10
/** 레퍼런스 사진 상한(스펙 §STEP1 — 최대 5장). */
const REFERENCE_MAX = 5
/** 생성·분석에 실제로 실어 보내는 보조 컷 상한(스펙 §생성·분석). */
const MATERIAL_AUX_SEND = 2

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
  const [materials, setMaterials] = useState<ImageSlot[]>([])
  const [heroIndex, setHeroIndex] = useState(0)
  const [references, setReferences] = useState<ImageSlot[]>([])
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

  // 언마운트 시 미리보기 URL 정리 + 진행 중 분석 중단. 장수가 늘어 누수 영향이 커지므로
  // 남아 있는 모든 재료·레퍼런스 objectURL을 최신 참조로 훑어 revoke한다(만든 쪽이 정리).
  const materialsRef = useRef<ImageSlot[]>([])
  const referencesRef = useRef<ImageSlot[]>([])
  materialsRef.current = materials
  referencesRef.current = references
  useEffect(() => {
    return () => {
      for (const m of materialsRef.current) URL.revokeObjectURL(m.url)
      for (const r of referencesRef.current) URL.revokeObjectURL(r.url)
      analyzeAbortRef.current?.abort()
    }
  }, [])

  // 재료(대표·보조) 구성이 바뀌면 분석 결과가 낡으므로 재분석을 유도한다(스타일 선택은 보존).
  const invalidateAnalysis = useCallback(() => {
    analyzeAbortRef.current?.abort()
    analyzedRef.current = false
    setAnalysis(null)
    setAnalyzing(false)
    setAnalysisFailed(false)
  }, [])

  // 재료 픽셀이 바뀌면(추가·삭제·대표 변경) 기존 후보 결과·설정이 낡으므로 파이프라인도 리셋.
  const resetPipeline = useCallback(() => {
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

  // 여러 장을 한 번에(일괄 선택) 또는 한 장씩 추가. 상한을 넘긴 초과분은 담지 않고,
  // 초과가 생기면 i18n 안내를 노출한다(스펙 §STEP1 — 추가 무시 안내). 상한 판정은 배치 시작 시점의
  // 최신 장수(materialsRef)로 한 번에 하므로, 낱장 setState 커밋 지연으로 안내를 놓치지 않는다.
  const addMaterials = useCallback(
    async (files: File[]) => {
      setStep1Error(null)
      if (files.length === 0) return
      const room = MATERIAL_MAX - materialsRef.current.length
      if (room <= 0) {
        setStep1Error(fmt(t.create.materialMaxReached, { max: MATERIAL_MAX }))
        return
      }
      const accepted = files.slice(0, room)
      const overflow = files.length > room
      try {
        const slots = await Promise.all(accepted.map((f) => makeSlot(f)))
        setMaterials((prev) => {
          // 배치 중 다른 경로로 이미 채워졌다면 초과분 URL을 정리하고 버린다(누수 방지).
          const space = MATERIAL_MAX - prev.length
          if (space <= 0) {
            slots.forEach((s) => URL.revokeObjectURL(s.url))
            return prev
          }
          slots.slice(space).forEach((s) => URL.revokeObjectURL(s.url))
          return [...prev, ...slots.slice(0, space)]
        })
        invalidateAnalysis()
        resetPipeline()
      } catch {
        setStep1Error(t.retouch.loadError)
        return
      }
      if (overflow) setStep1Error(fmt(t.create.materialMaxReached, { max: MATERIAL_MAX }))
    },
    [makeSlot, invalidateAnalysis, resetPipeline],
  )

  const removeMaterial = useCallback(
    (index: number) => {
      setMaterials((prev) => {
        const target = prev[index]
        if (!target) return prev
        URL.revokeObjectURL(target.url)
        return prev.filter((_, i) => i !== index)
      })
      // 대표 인덱스 보정: 삭제 위치가 대표보다 앞이면 한 칸 당기고, 대표 자신이면 첫 장을 대표로.
      setHeroIndex((prev) => {
        if (index < prev) return prev - 1
        if (index === prev) return 0
        return prev
      })
      invalidateAnalysis()
      resetPipeline()
    },
    [invalidateAnalysis, resetPipeline],
  )

  const setHero = useCallback(
    (index: number) => {
      setHeroIndex(index)
      // 대표가 바뀌면 개수·검수 대조 원본이 달라지므로 분석·결과 모두 리셋.
      invalidateAnalysis()
      resetPipeline()
    },
    [invalidateAnalysis, resetPipeline],
  )

  const addReferences = useCallback(
    async (files: File[]) => {
      setStep1Error(null)
      if (files.length === 0) return
      const room = REFERENCE_MAX - referencesRef.current.length
      if (room <= 0) {
        setStep1Error(fmt(t.create.referenceMaxReached, { max: REFERENCE_MAX }))
        return
      }
      const accepted = files.slice(0, room)
      const overflow = files.length > room
      try {
        const slots = await Promise.all(accepted.map((f) => makeSlot(f)))
        setReferences((prev) => {
          const space = REFERENCE_MAX - prev.length
          if (space <= 0) {
            slots.forEach((s) => URL.revokeObjectURL(s.url))
            return prev
          }
          slots.slice(space).forEach((s) => URL.revokeObjectURL(s.url))
          return [...prev, ...slots.slice(0, space)]
        })
        // 레퍼런스가 늘면 분석 결과(referenceStyle)가 낡으므로 재분석 유도(결과는 그대로).
        invalidateAnalysis()
      } catch {
        setStep1Error(t.retouch.loadError)
        return
      }
      if (overflow) setStep1Error(fmt(t.create.referenceMaxReached, { max: REFERENCE_MAX }))
    },
    [makeSlot, invalidateAnalysis],
  )

  const removeReference = useCallback(
    (index: number) => {
      // 마지막 한 장을 빼는지 여부는 setState 밖에서 최신 참조(referencesRef)로 판정한다.
      // (updater 안에서 플래그를 세우고 곧바로 읽는 방식은 React가 updater를 언제 실행할지
      //  계약상 보장하지 않아 취약하므로 피한다.)
      const willEmpty = referencesRef.current.filter((_, i) => i !== index).length === 0
      setReferences((prev) => {
        const target = prev[index]
        if (!target) return prev
        URL.revokeObjectURL(target.url)
        return prev.filter((_, i) => i !== index)
      })
      invalidateAnalysis()
      // 레퍼런스가 모두 빠지면 '레퍼런스 따라가기'는 더 이상 유효하지 않다. 그대로 두면 STEP2에서
      // 활성 프리셋 없이 조용히 중립 스타일로 폴백하므로, 기본 프리셋으로 되돌려 선택을 인지시킨다.
      if (willEmpty) setStyleChoice((prev) => (prev === "reference" ? DEFAULT_PRESET_KEY : prev))
    },
    [invalidateAnalysis],
  )

  // 보정 트랙에서 넘어온 재료 사진 소비(1회) — 재료 1장으로 진입.
  useEffect(() => {
    if (!seedFile) return
    void addMaterials([seedFile]).then(() => {
      setSeedNotice(true)
      setStep(1)
    })
    onSeedConsumed()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedFile])

  // 대표 + 보조(최대 2장) base64 배열. 대표가 없으면 빈 배열.
  const materialSendBase64s = useCallback((): string[] => {
    const hero = materials[heroIndex]
    if (!hero) return []
    const aux = materials.filter((_, i) => i !== heroIndex).slice(0, MATERIAL_AUX_SEND)
    return [hero.aiBase64, ...aux.map((m) => m.aiBase64)]
  }, [materials, heroIndex])

  // 분석 실행(STEP2 진입 시 1회, reanalyze로 재실행). 재료 대표+보조·레퍼런스 여러 장을 함께 전달.
  const runAnalysis = useCallback(async () => {
    const materialB64s = materialSendBase64s()
    if (materialB64s.length === 0 || !hasClaudeKey) return
    analyzeAbortRef.current?.abort()
    const controller = new AbortController()
    analyzeAbortRef.current = controller
    analyzedRef.current = true
    setAnalyzing(true)
    setAnalysisFailed(false)
    try {
      const a = await analyzeMaterial(
        claudeKey,
        materialB64s,
        references.map((r) => r.aiBase64),
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
  }, [materialSendBase64s, references, hasClaudeKey, claudeKey, onSpend])

  // STEP2 진입 시 아직 분석하지 않았으면 자동 실행.
  useEffect(() => {
    if (step === 2 && hasClaudeKey && !analyzedRef.current) void runAnalysis()
  }, [step, hasClaudeKey, runAnalysis])

  const goStep2 = () => {
    if (materials.length === 0) {
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
    const materialB64s = materialSendBase64s()
    if (materialB64s.length === 0 || !hasGeminiKey) return
    const [heroB64, ...auxB64s] = materialB64s
    const presetKey: PresetKey | null = styleChoice === "reference" ? null : styleChoice
    const cfg: PipelineConfig = {
      materialBase64: heroB64,
      auxBase64s: auxB64s,
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
          materials={materials}
          heroIndex={heroIndex}
          references={references}
          materialMax={MATERIAL_MAX}
          referenceMax={REFERENCE_MAX}
          error={step1Error}
          onAddMaterial={addMaterials}
          onRemoveMaterial={removeMaterial}
          onSetHero={setHero}
          onAddReference={addReferences}
          onRemoveReference={removeReference}
          onGoRetouch={onGoRetouch}
        />
      )}

      {step === 2 && (
        <Step2Style
          hasReference={references.length > 0}
          materialCount={materials.length}
          referenceCount={references.length}
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
