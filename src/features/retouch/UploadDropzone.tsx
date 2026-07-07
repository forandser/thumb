"use client"

import { useRef, useState } from "react"
import { t } from "@/lib/i18n"

const ACCEPT = ["image/jpeg", "image/png", "image/webp"]

/**
 * 사진 업로드 — 드래그&드롭 + 클릭. JPG/PNG/WebP만 허용, 여러 장(최대 30장) 동시 수용.
 * 검증·개수 제한은 부모(addPhotos → validateImageFile)로 위임하고, 안내 문구는 error prop으로 받는다.
 */
export function UploadDropzone({
  onFiles,
  error,
}: {
  onFiles: (files: FileList) => void
  error?: string | null
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return
    onFiles(files)
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        handleFiles(e.dataTransfer.files)
      }}
      onClick={() => inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") inputRef.current?.click()
      }}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        minHeight: 320,
        padding: 40,
        borderRadius: "var(--radius-lg)",
        border: `2px dashed ${dragging ? "var(--color-primary)" : "var(--color-line-strong)"}`,
        background: dragging ? "var(--color-primary-soft)" : "var(--color-bg-subtle)",
        cursor: "pointer",
        textAlign: "center",
        transition: "background 0.15s, border-color 0.15s",
      }}
    >
      <div style={{ fontSize: 44 }} aria-hidden>
        📷
      </div>
      <div style={{ fontSize: 17, fontWeight: 800 }}>{t.retouch.uploadTitle}</div>
      <div style={{ fontSize: 13, color: "var(--color-ink-secondary)" }}>
        {t.retouch.uploadHintMulti}
      </div>
      <div
        style={{
          marginTop: 4,
          fontSize: 11,
          color: "var(--color-ink-tertiary)",
          letterSpacing: 0.3,
        }}
      >
        {t.retouch.uploadFormats}
      </div>
      <div
        style={{
          marginTop: 10,
          padding: "10px 22px",
          borderRadius: "var(--radius-sm)",
          background: "var(--color-primary)",
          color: "#fff",
          fontSize: 14,
          fontWeight: 700,
        }}
      >
        {t.retouch.uploadButton}
      </div>
      {error && (
        <div style={{ marginTop: 8, fontSize: 12, color: "var(--color-danger)", fontWeight: 600 }}>
          {error}
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT.join(",")}
        multiple
        onChange={(e) => {
          handleFiles(e.target.files)
          e.target.value = ""
        }}
        style={{ display: "none" }}
      />
    </div>
  )
}
