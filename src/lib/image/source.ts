/**
 * 이미지 소스 로딩·다운스케일 유틸 (다중 업로드/갤러리/AI 진단 공용).
 *
 * 메모리 원칙(v0.2, 최대 30장):
 * - File 객체는 디스크 포인터라 그 자체로는 메모리를 거의 안 쓴다 → 갤러리는 File만 보관.
 * - 갤러리 카드는 240px 축소본(objectURL)만 유지 → 30장 × 폰 사진이어도 가볍다.
 * - 작업용 풀 소스(≤4096px)와 AI 전송용(≤1024px JPEG)은 "그때그때" File을 디코드해 만들고
 *   쓰고 나면 버린다(lazy). 동시에 살아 있는 디코드 이미지 수를 최소화한다.
 * - objectURL은 만든 쪽이 revoke 책임을 진다.
 */
import type { Source } from "./render"

/** 초대형 사진 작업 소스 상한(최대 변 px). 출력이 최대 1080이라 화질 손실 없음. */
export const MAX_WORKING_SOURCE = 4096
/** 갤러리 축소본 한 변(px). */
export const THUMB_SIZE = 240
/** AI 진단 전송 이미지 최대 변(px) — 비용 절감용 축소. */
export const AI_MAX_SIDE = 1024
/** AI 진단 전송 JPEG 품질. */
export const AI_JPEG_QUALITY = 0.85

/**
 * File을 디코드해 HTMLImageElement로 만든다. 성공/실패와 무관하게 objectURL은 정리한다.
 * 호출부는 반환된 이미지를 쓰고 나면 참조를 놓아 GC되게 한다(별도 revoke 불필요 — img는 URL 아님).
 */
export function decodeImageFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("decode-failed"))
    }
    img.src = url
  })
}

function srcW(src: Source): number {
  return src instanceof HTMLImageElement ? src.naturalWidth : src.width
}
function srcH(src: Source): number {
  return src instanceof HTMLImageElement ? src.naturalHeight : src.height
}

function scaledCanvas(src: Source, maxSide: number): HTMLCanvasElement {
  const w0 = srcW(src)
  const h0 = srcH(src)
  const maxNat = Math.max(w0, h0)
  const scale = maxNat > maxSide ? maxSide / maxNat : 1
  const c = document.createElement("canvas")
  c.width = Math.max(1, Math.round(w0 * scale))
  c.height = Math.max(1, Math.round(h0 * scale))
  const cx = c.getContext("2d")
  if (cx) {
    cx.imageSmoothingEnabled = true
    cx.imageSmoothingQuality = "high"
    cx.drawImage(src, 0, 0, c.width, c.height)
  }
  return c
}

/**
 * 작업용 풀 소스 생성 — 초대형 사진은 최대 변 4096px로 다운스케일(iOS 캔버스 한도·메모리 보호).
 * 상한 이하이면 원본 이미지를 그대로 소스로 쓴다(불필요한 캔버스 복사 회피).
 */
export function makeWorkingSource(img: HTMLImageElement): Source {
  const maxNat = Math.max(img.naturalWidth, img.naturalHeight)
  if (maxNat <= MAX_WORKING_SOURCE) return img
  return scaledCanvas(img, MAX_WORKING_SOURCE)
}

export interface Thumb {
  url: string
  w: number
  h: number
}

/**
 * 갤러리 카드용 축소본(objectURL) 생성. revoke는 호출부(갤러리) 책임.
 * toBlob 미지원(구형)일 때는 dataURL로 폴백한다.
 */
export function makeThumb(img: HTMLImageElement): Promise<Thumb> {
  const c = scaledCanvas(img, THUMB_SIZE)
  return new Promise((resolve) => {
    if (c.toBlob) {
      c.toBlob(
        (blob) => {
          if (blob) resolve({ url: URL.createObjectURL(blob), w: c.width, h: c.height })
          else resolve({ url: c.toDataURL("image/jpeg", 0.8), w: c.width, h: c.height })
        },
        "image/jpeg",
        0.8,
      )
    } else {
      resolve({ url: c.toDataURL("image/jpeg", 0.8), w: c.width, h: c.height })
    }
  })
}

/**
 * AI 진단 전송용 base64 문자열(접두사 제거) 생성 — 최대 변 1024px JPEG q0.85.
 * data URL 접두사(`data:image/jpeg;base64,`)를 벗겨 순수 base64만 반환한다(줄바꿈 없음).
 * 작업대의 풀 소스(캔버스)와 갤러리에서 갓 디코드한 이미지 양쪽에서 쓴다.
 */
export function imageToAiBase64(src: Source): string {
  const c = scaledCanvas(src, AI_MAX_SIDE)
  const dataUrl = c.toDataURL("image/jpeg", AI_JPEG_QUALITY)
  const comma = dataUrl.indexOf(",")
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl
}

/** Source(이미지/캔버스)의 최대 변(px). AI 편집 결과가 원본보다 작아지는지 안내에 쓴다. */
export function sourceMaxSide(src: Source): number {
  return Math.max(srcW(src), srcH(src))
}

/**
 * base64 dataURL을 File로 변환(AI 편집 결과를 새 작업 소스로 삼기 위함).
 * ZIP/갤러리 카드/다운로드가 모두 File 경로를 타므로, AI 결과도 File로 만들어 교체하면
 * 기존 파이프라인이 그대로 최신 픽셀을 본다.
 */
export function dataUrlToFile(dataUrl: string, name: string): File {
  const comma = dataUrl.indexOf(",")
  const head = comma >= 0 ? dataUrl.slice(0, comma) : ""
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl
  const mime = /data:(.*?)(;base64)?$/.exec(head)?.[1] || "image/png"
  const bin = atob(b64)
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return new File([arr], name, { type: mime })
}
