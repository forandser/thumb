"use client"

import { useState } from "react"
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

  const anyKeyConnected = keys.claude.trim().length > 0 || keys.gemini.trim().length > 0

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <TopBar
        activeTab={tab}
        onTabChange={setTab}
        onOpenSettings={() => setSettingsOpen(true)}
        anyKeyConnected={anyKeyConnected}
      />

      <main style={{ flex: 1 }}>
        {tab === "retouch" ? (
          <PhotoRetouch />
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
