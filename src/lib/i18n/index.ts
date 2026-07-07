/**
 * i18n 진입점. v0.1은 한국어만.
 */
import { ko } from "./ko"

export const t = ko

export type Locale = "ko"

export function getLocale(): Locale {
  return "ko"
}
