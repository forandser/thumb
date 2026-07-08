/**
 * AI 생성물 표시 자동화 (AI기본법 대응 — 의존성 없이 바이너리 조작).
 *
 * 원리: 다운로드 직전 결과 이미지에 "AI 생성" 사실을 두 방식으로 남긴다.
 *   1) 메타데이터(항상): PNG는 IEND 앞에 tEXt 청크, JPEG는 SOI 뒤에 COM(0xFFFE) 세그먼트를
 *      직접 끼워 넣는다. 라이브러리를 쓰지 않고 ArrayBuffer를 손으로 편집한다(새 의존성 금지).
 *   2) 워터마크(토글, 기본 off): 캔버스 우하단에 반투명 "AI 생성" 텍스트를 렌더한다.
 *
 * tEXt 청크는 CRC32(type+data)를 정확히 계산해 붙여야 뷰어가 파일을 거부하지 않는다.
 * JPEG COM 길이 필드는 자기 자신(2바이트)을 포함한다. 두 규칙을 그대로 구현했다.
 *
 * E2E가 삽입 성공을 확인할 수 있도록 round-trip 셀프 테스트(verifyAiMetadata / pngHasTextChunk /
 * jpegHasComment)도 export한다 — 삽입 후 다시 파싱해 청크 존재를 검증한다.
 *
 * 주의: tEXt는 원래 Latin-1 인코딩이라 한글은 규격상 비권장이지만, 우리 검증기와 대다수 뷰어는
 * 바이트를 그대로 읽으므로 UTF-8 바이트로 넣는다(ASCII 접두부 "AI-generated image (Gemini)."는
 * 어떤 뷰어에서도 읽힌다). 표시 목적(기계 판독 가능한 AI 고지)에는 충분하다.
 */
import { t } from "@/lib/i18n"

/** tEXt 청크 키워드(관례적으로 "Comment"). */
export const AI_MARK_KEYWORD = "Comment"
/** 삽입할 고지 문구(스펙 §AI 생성물 표시). PNG tEXt·JPEG COM 공통 payload. */
export const AI_MARK_COMMENT = "AI-generated image (Gemini). 썸네일 제작"

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

const utf8 = new TextEncoder()

function asciiBytes(s: string): Uint8Array {
  const a = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i) & 0xff
  return a
}

function concat(...chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((n, c) => n + c.length, 0)
  const out = new Uint8Array(total)
  let off = 0
  for (const c of chunks) {
    out.set(c, off)
    off += c.length
  }
  return out
}

function readUint32BE(b: Uint8Array, off: number): number {
  return ((b[off] << 24) | (b[off + 1] << 16) | (b[off + 2] << 8) | b[off + 3]) >>> 0
}

function writeUint32BE(b: Uint8Array, off: number, v: number): void {
  b[off] = (v >>> 24) & 0xff
  b[off + 1] = (v >>> 16) & 0xff
  b[off + 2] = (v >>> 8) & 0xff
  b[off + 3] = v & 0xff
}

// ---- CRC32 (PNG 청크용) ----
let crcTable: Uint32Array | null = null
function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    const table = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) >>> 0 : c >>> 1
      table[n] = c >>> 0
    }
    crcTable = table
  }
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i++) crc = (crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)) >>> 0
  return (crc ^ 0xffffffff) >>> 0
}

// ---- 시그니처 판별 ----
export function isPng(b: Uint8Array): boolean {
  if (b.length < 8) return false
  for (let i = 0; i < 8; i++) if (b[i] !== PNG_SIG[i]) return false
  return true
}
export function isJpeg(b: Uint8Array): boolean {
  return b.length >= 2 && b[0] === 0xff && b[1] === 0xd8
}

// ---- PNG tEXt 삽입 ----
/**
 * PNG에 tEXt 청크(keyword\0text)를 IEND 청크 앞에 삽입한 새 바이트열을 반환한다.
 * PNG가 아니면 원본을 그대로 반환한다(방어).
 */
export function insertPngTextChunk(png: Uint8Array, keyword: string, text: string): Uint8Array {
  if (!isPng(png)) return png

  // IEND 청크 시작 오프셋 탐색(각 청크: len(4)+type(4)+data(len)+crc(4)).
  let off = 8
  let iendStart = png.length
  while (off + 8 <= png.length) {
    const len = readUint32BE(png, off)
    const type = String.fromCharCode(png[off + 4], png[off + 5], png[off + 6], png[off + 7])
    if (type === "IEND") {
      iendStart = off
      break
    }
    off += 12 + len
  }

  const keyBytes = asciiBytes(keyword)
  const textBytes = utf8.encode(text)
  const data = concat(keyBytes, new Uint8Array([0]), textBytes)
  const typeBytes = asciiBytes("tEXt")

  const chunk = new Uint8Array(4 + 4 + data.length + 4)
  writeUint32BE(chunk, 0, data.length)
  chunk.set(typeBytes, 4)
  chunk.set(data, 8)
  writeUint32BE(chunk, 8 + data.length, crc32(concat(typeBytes, data)))

  return concat(png.slice(0, iendStart), chunk, png.slice(iendStart))
}

/** PNG에 keyword의 tEXt 청크가 있고 그 text가 expected를 포함하는지(round-trip 검증). */
export function pngHasTextChunk(png: Uint8Array, keyword = AI_MARK_KEYWORD, expected = AI_MARK_COMMENT): boolean {
  if (!isPng(png)) return false
  const keyBytes = asciiBytes(keyword)
  const expectedBytes = utf8.encode(expected)
  let off = 8
  while (off + 8 <= png.length) {
    const len = readUint32BE(png, off)
    const type = String.fromCharCode(png[off + 4], png[off + 5], png[off + 6], png[off + 7])
    if (type === "tEXt") {
      const data = png.subarray(off + 8, off + 8 + len)
      // keyword\0text 형태인지 확인.
      if (startsWith(data, keyBytes) && data[keyBytes.length] === 0) {
        const textPart = data.subarray(keyBytes.length + 1)
        if (contains(textPart, expectedBytes)) return true
      }
    }
    if (type === "IEND") break
    off += 12 + len
  }
  return false
}

// ---- JPEG COM 삽입 ----
/**
 * SOI(2바이트) + 이어지는 APPn(0xFFE0..0xFFEF) 세그먼트를 건너뛴 오프셋을 반환한다.
 * JFIF 규약상 APP0(JFIF)는 SOI 바로 뒤에 와야 하므로, COM은 APPn 뒤 첫 non-APPn 마커 앞에 넣는다.
 * (SOI 직후에 넣으면 APP0보다 앞서 비표준 JFIF가 되어 일부 엄격한 업로드 검사기가 거부할 수 있다.)
 */
function jfifInsertOffset(jpeg: Uint8Array): number {
  let off = 2 // SOI 뒤
  while (off + 4 <= jpeg.length) {
    if (jpeg[off] !== 0xff) break
    const marker = jpeg[off + 1]
    // APPn만 건너뛴다(각 APPn은 길이 필드를 가진다). 그 외 마커 앞에서 멈춘다.
    if (marker >= 0xe0 && marker <= 0xef) {
      const len = (jpeg[off + 2] << 8) | jpeg[off + 3]
      off += 2 + len
      continue
    }
    break
  }
  return off
}

/**
 * JPEG에 COM(0xFFFE) 세그먼트를 APP0/APPn 세그먼트 뒤(첫 non-APPn 마커 앞)에 삽입한 새 바이트열을
 * 반환한다. 길이 필드는 자기 자신 2바이트를 포함한다(최대 65535 → 코멘트 65533바이트 제한, 초과 시
 * 잘라 넣음). JPEG가 아니면 원본 그대로 반환.
 */
export function insertJpegComment(jpeg: Uint8Array, comment: string): Uint8Array {
  if (!isJpeg(jpeg)) return jpeg
  let commentBytes = utf8.encode(comment)
  if (commentBytes.length > 65533) commentBytes = commentBytes.subarray(0, 65533)
  const segLen = commentBytes.length + 2 // 길이 필드 자신 포함

  const seg = new Uint8Array(4 + commentBytes.length)
  seg[0] = 0xff
  seg[1] = 0xfe
  seg[2] = (segLen >> 8) & 0xff
  seg[3] = segLen & 0xff
  seg.set(commentBytes, 4)

  const insertAt = jfifInsertOffset(jpeg)
  return concat(jpeg.slice(0, insertAt), seg, jpeg.slice(insertAt))
}

/** JPEG에 expected를 포함하는 COM 세그먼트가 있는지(round-trip 검증). 마커를 순회한다. */
export function jpegHasComment(jpeg: Uint8Array, expected = AI_MARK_COMMENT): boolean {
  if (!isJpeg(jpeg)) return false
  const expectedBytes = utf8.encode(expected)
  let off = 2
  while (off + 4 <= jpeg.length) {
    if (jpeg[off] !== 0xff) break
    const marker = jpeg[off + 1]
    // SOS(0xDA)·EOI(0xD9) 이후는 엔트로피 데이터 → 세그먼트 순회 종료.
    if (marker === 0xd9 || marker === 0xda) break
    const len = (jpeg[off + 2] << 8) | jpeg[off + 3]
    if (marker === 0xfe) {
      const content = jpeg.subarray(off + 4, off + 2 + len)
      if (contains(content, expectedBytes)) return true
    }
    off += 2 + len
  }
  return false
}

function startsWith(hay: Uint8Array, needle: Uint8Array): boolean {
  if (needle.length > hay.length) return false
  for (let i = 0; i < needle.length; i++) if (hay[i] !== needle[i]) return false
  return true
}

function contains(hay: Uint8Array, needle: Uint8Array): boolean {
  if (needle.length === 0) return true
  if (needle.length > hay.length) return false
  outer: for (let i = 0; i <= hay.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer
    return true
  }
  return false
}

/**
 * Blob → Blob: 타입(PNG/JPEG)에 맞춰 AI 표시 메타데이터를 삽입한 새 Blob을 반환한다.
 * 지원하지 않는 타입이면 원본을 그대로 돌려준다(삽입 실패로 다운로드를 막지 않는다).
 *
 * @example
 *   const marked = await embedAiMetadata(await canvasToBlob(canvas, preset))
 *   downloadBlob(marked, preset.filename)
 */
export async function embedAiMetadata(blob: Blob): Promise<Blob> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  if (isPng(bytes)) {
    const out = insertPngTextChunk(bytes, AI_MARK_KEYWORD, AI_MARK_COMMENT)
    return new Blob([out as BlobPart], { type: "image/png" })
  }
  if (isJpeg(bytes)) {
    const out = insertJpegComment(bytes, AI_MARK_COMMENT)
    return new Blob([out as BlobPart], { type: "image/jpeg" })
  }
  return blob
}

/**
 * round-trip 셀프 테스트: Blob을 다시 파싱해 AI 표시 메타데이터가 실제로 들어갔는지 검증한다.
 * E2E가 embedAiMetadata 결과를 여기에 통과시켜 삽입 성공을 확인한다.
 */
export async function verifyAiMetadata(blob: Blob): Promise<boolean> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  if (isPng(bytes)) return pngHasTextChunk(bytes)
  if (isJpeg(bytes)) return jpegHasComment(bytes)
  return false
}

/** 워터마크 렌더 옵션. */
export interface WatermarkOptions {
  /** 표시 문구(기본 ko.create.watermarkLabel = "AI 생성"). */
  text?: string
  /** 캔버스 너비 대비 폰트 크기 비율(기본 0.035). */
  fontScale?: number
  /** 텍스트 불투명도 0..1(기본 0.85). */
  opacity?: number
}

/**
 * 캔버스 우하단에 반투명 "AI 생성" 워터마크를 렌더한다(캔버스 in-place).
 * 가독성을 위해 어두운 외곽선 + 밝은 채움으로 그린다. 배경 밝기에 관계없이 보이게.
 * 워터마크 토글이 켜졌을 때만 다운로드 파이프라인에서 호출한다.
 *
 * @example
 *   if (watermarkOn) drawAiWatermark(canvas)
 *   const blob = await canvasToBlob(canvas, preset)
 */
export function drawAiWatermark(canvas: HTMLCanvasElement, opts: WatermarkOptions = {}): void {
  const ctx = canvas.getContext("2d")
  if (!ctx) return
  const text = opts.text ?? t.create.watermarkLabel
  const fontScale = opts.fontScale ?? 0.035
  const opacity = opts.opacity ?? 0.85

  const fontSize = Math.max(12, Math.round(canvas.width * fontScale))
  const pad = Math.round(canvas.width * 0.03)

  ctx.save()
  ctx.font = `600 ${fontSize}px sans-serif`
  ctx.textAlign = "right"
  ctx.textBaseline = "bottom"
  ctx.lineJoin = "round"
  ctx.lineWidth = Math.max(2, fontSize / 8)
  ctx.strokeStyle = `rgba(0,0,0,${0.4 * opacity})`
  ctx.fillStyle = `rgba(255,255,255,${opacity})`
  const x = canvas.width - pad
  const y = canvas.height - pad
  ctx.strokeText(text, x, y)
  ctx.fillText(text, x, y)
  ctx.restore()
}
