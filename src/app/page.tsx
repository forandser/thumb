"use client"

import { useCallback, useState } from "react"
import { TabKey, TopBar } from "@/components/ui/TopBar"
import { KeySettingsModal } from "@/features/settings/KeySettingsModal"
import { PhotoRetouch } from "@/features/retouch/PhotoRetouch"
import { ThumbnailComingSoon } from "@/features/thumbnail/ThumbnailComingSoon"
import { useApiKeys } from "@/lib/storage/api-keys"

export default function Page() {
  // v0.1 핵심은 사진 보정 → 작동하는 탭으로 바로 진입.
  const [tab, setTab] = useState<TabKey>("retouch")
  const [settingsOpen, setSettingsOpen] = useState(false)
  const { keys, save } = useApiKeys()

  // v0.2 비용 트래커 — 세션 동안 AI 호출 추정 비용 누적(장당 고정 추정치).
  const [aiSpend, setAiSpend] = useState(0)
  const addSpend = useCallback((krw: number) => setAiSpend((s) => s + krw), [])
  const resetSpend = useCallback(() => setAiSpend(0), [])

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
          />
        ) : (
          <ThumbnailComingSoon onGoRetouch={() => setTab("retouch")} />
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
