/**
 * 선택 사진 일괄 ZIP 다운로드.
 *
 * 각 장을 그때그때 File에서 디코드 → renderEdit로 구워(색 보정+크롭+정사각) → 프리셋 규격의
 * Blob으로 만든 뒤 JSZip으로 묶어 한 번에 저장한다. 동시에 살아 있는 디코드 이미지를
 * 최소화하려고 순차 처리한다(30장 폰 사진 메모리 보호). 진행률은 콜백으로 보고한다.
 */
import JSZip from "jszip"
import type { EditState } from "./types"
import { makeRotatedSource, renderEdit } from "./render"
import { canvasToBlob, downloadBlob, type DownloadPreset } from "./download"
import { decodeImageFile, makeWorkingSource } from "./source"
import { embedAiMetadata } from "./ai-mark"

export interface ZipEntry {
  /** 원본 파일명(확장자 포함 가능). */
  name: string
  file: File
  edit: EditState
  /**
   * AI 픽셀 편집(누끼·화질) 결과인지. true면 구운 Blob에 AI 표시 메타데이터를 삽입한다
   * (단건 다운로드와 동일 — AI기본법 표시 요건. 배치 경로 누락 방지).
   */
  aiApplied?: boolean
}

/** 파일명 → 안전한 basename(확장자·경로·금지문자 제거). */
function safeBase(name: string): string {
  const noPath = name.replace(/^.*[\\/]/, "")
  const dot = noPath.lastIndexOf(".")
  const stem = dot > 0 ? noPath.slice(0, dot) : noPath
  const cleaned = stem.replace(/[\\/:*?"<>|]+/g, "_").trim()
  return cleaned || "photo"
}

function today(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`
}

/**
 * entries를 프리셋 규격으로 구워 ZIP으로 저장.
 * @param onProgress (done, total) — done은 "구운 장 수". 마지막 압축 단계는 done===total 이후.
 * @returns 실제로 담긴 장 수(디코드 실패한 장은 건너뜀).
 */
export async function exportZip(
  entries: ZipEntry[],
  preset: DownloadPreset,
  onProgress: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<number> {
  const zip = new JSZip()
  const used = new Set<string>()
  let done = 0
  let added = 0

  for (const entry of entries) {
    if (signal?.aborted) throw new DOMException("aborted", "AbortError")
    try {
      const img = await decodeImageFile(entry.file)
      const source = makeWorkingSource(img)
      const rotated = makeRotatedSource(source, entry.edit.rotate90)
      const canvas = renderEdit(rotated, entry.edit, {
        withAdjustments: true,
        forceSquare: true,
        targetSize: preset.size,
      })
      let blob = await canvasToBlob(canvas, preset)
      // AI 편집 결과는 인코딩 직후 AI 표시 메타데이터 삽입(단건 다운로드와 동일). 실패해도 원본 유지.
      if (blob && entry.aiApplied) blob = await embedAiMetadata(blob)
      if (blob) {
        // 파일명 충돌 방지: 같은 basename이면 _2, _3...
        let base = `${safeBase(entry.name)}_보정`
        let candidate = base
        let n = 2
        const ext = preset.format === "png" ? "png" : "jpg"
        while (used.has(`${candidate}.${ext}`)) candidate = `${base}_${n++}`
        used.add(`${candidate}.${ext}`)
        zip.file(`${candidate}.${ext}`, blob)
        added++
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err
      // 개별 장 디코드/렌더 실패는 건너뛰고 계속(전체 다운로드를 죽이지 않음).
    }
    done++
    onProgress(done, entries.length)
  }

  if (added === 0) return 0
  if (signal?.aborted) throw new DOMException("aborted", "AbortError")

  const zipBlob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" })
  downloadBlob(zipBlob, `썸네일제작_${today()}.zip`)
  return added
}
