/**
 * i18n 진입점. v0.1은 한국어만.
 */
import { ko } from "./ko"

export const t = ko

/** "{n}장" 같은 자리표시자 치환. 없는 키는 그대로 둔다. */
export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m))
}

export type Locale = "ko"

export function getLocale(): Locale {
  return "ko"
}
