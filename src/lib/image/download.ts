/**
 * 다운로드 프리셋 정의 + 캔버스 → 파일 저장 헬퍼.
 */

export interface DownloadPreset {
  id: string
  format: "png" | "jpeg"
  size: number
  /** jpeg 품질 0..1 */
  quality?: number
  filename: string
}

// v0.7: 출력 규격을 1000×1000으로 통일(쿠팡 최소 규격 충족·오픈마켓 대표이미지 안전). 파일명도 1000 반영.
export const DOWNLOAD_PRESETS: Record<"png" | "jpg" | "coupang", DownloadPreset> = {
  png: { id: "png", format: "png", size: 1000, filename: "thumbnail-1000.png" },
  jpg: { id: "jpg", format: "jpeg", size: 1000, quality: 0.92, filename: "thumbnail-1000.jpg" },
  coupang: {
    id: "coupang",
    format: "jpeg",
    size: 1000,
    quality: 0.92,
    filename: "thumbnail-coupang-1000.jpg",
  },
}

export function canvasToBlob(canvas: HTMLCanvasElement, preset: DownloadPreset): Promise<Blob | null> {
  const type = preset.format === "png" ? "image/png" : "image/jpeg"
  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), type, preset.quality)
  })
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // 즉시 revoke하면 일부 브라우저에서 저장이 취소될 수 있어 다음 tick에 정리.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
