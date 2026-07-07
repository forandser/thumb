/**
 * 업로드 파일 검증 — 업로드·교체 두 경로가 공통으로 쓴다.
 *
 * - JPG/PNG/WebP만 허용.
 * - file.type이 비어 있으면(일부 브라우저/드래그앤드롭) 확장자로 폴백 판정.
 * - HEIC/HEIF는 브라우저가 못 여니 별도의 명확한 안내 문구로 돌려준다.
 */
import { t } from "@/lib/i18n"

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"]
const ALLOWED_EXT = /\.(jpe?g|png|webp)$/i
const HEIC_EXT = /\.(heic|heif)$/i

export type FileCheck = { ok: true } | { ok: false; message: string }

export function validateImageFile(file: File): FileCheck {
  const name = file.name ?? ""
  const type = file.type

  // HEIC/HEIF 먼저 — 명확한 안내.
  if (type === "image/heic" || type === "image/heif" || HEIC_EXT.test(name)) {
    return { ok: false, message: t.retouch.heicError }
  }

  // type이 있으면 그걸로, 없으면 확장자로 폴백.
  if (type) {
    if (ALLOWED_TYPES.includes(type)) return { ok: true }
    return { ok: false, message: t.retouch.invalidFile }
  }
  if (ALLOWED_EXT.test(name)) return { ok: true }
  return { ok: false, message: t.retouch.invalidFile }
}
