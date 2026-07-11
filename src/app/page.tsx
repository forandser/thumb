"use client"

import { useCallback, useState } from "react"
import { TabKey, TopBar } from "@/components/ui/TopBar"
import { KeySettingsModal } from "@/features/settings/KeySettingsModal"
import { PhotoRetouch } from "@/features/retouch/PhotoRetouch"
import { CreateWizard } from "@/features/create/CreateWizard"
import { useApiKeys } from "@/lib/storage/api-keys"

export default function Page() {
  // v0.7: 첫 화면을 '썸네일 제작'으로. 키가 없어도 STEP1 업로드는 되고, 생성 단계에서 키를 안내한다.
  const [tab, setTab] = useState<TabKey>("thumbnail")
  const [settingsOpen, setSettingsOpen] = useState(false)
  const { keys, save } = useApiKeys()

  // v0.2 비용 트래커 — 세션 동안 AI 호출 추정 비용 누적(장당 고정 추정치).
  const [aiSpend, setAiSpend] = useState(0)
  const addSpend = useCallback((krw: number) => setAiSpend((s) => s + krw), [])
  const resetSpend = useCallback(() => setAiSpend(0), [])

  // 보정 → 제작 연결: 보정 작업대의 활성 이미지를 제작 트랙 재료로 넘긴다(스펙 §STEP1).
  const [seedFile, setSeedFile] = useState<File | null>(null)
  const sendToCreate = useCallback((file: File) => {
    setSeedFile(file)
    setTab("thumbnail")
  }, [])

  const hasClaudeKey = keys.claude.trim().length > 0
  const hasGeminiKey = keys.gemini.trim().length > 0
  const anyKeyConnected = hasClaudeKey || hasGeminiKey

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <TopBar
        activeTab={tab}
        onTabChange={setTab}
        onOpenSettings={() => setSettingsOpen(true)}
        anyKeyConnected={anyKeyConnected}
        spend={aiSpend}
        onResetSpend={resetSpend}
      />

      <main style={{ flex: 1 }}>
        {tab === "retouch" ? (
          <PhotoRetouch
            apiKey={keys.claude.trim()}
            hasKey={hasClaudeKey}
            geminiKey={keys.gemini.trim()}
            hasGeminiKey={hasGeminiKey}
            onNeedKey={() => setSettingsOpen(true)}
            onSpend={addSpend}
            onSendToCreate={sendToCreate}
          />
        ) : (
          <CreateWizard
            claudeKey={keys.claude.trim()}
            geminiKey={keys.gemini.trim()}
            hasClaudeKey={hasClaudeKey}
            hasGeminiKey={hasGeminiKey}
            onNeedKey={() => setSettingsOpen(true)}
            onSpend={addSpend}
            seedFile={seedFile}
            onSeedConsumed={() => setSeedFile(null)}
            onGoRetouch={() => setTab("retouch")}
          />
        )}
      </main>

      <KeySettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        keys={keys}
        onSave={save}
      />
    </div>
  )
}
