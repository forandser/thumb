"use client"

/**
 * 내 보정 프리셋 저장 — 색 보정 4필드(밝기·대비·채도·색온도)만 localStorage에 담는다.
 *
 * 크롭·회전·미세각도는 사진마다 달라 제외한다(스펙 §④). 프리셋은 전역(사진 무관)이라
 * 갤러리 아이템이 아니라 브라우저에 저장한다. SSR 가드는 api-keys.ts 패턴을 따른다.
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { t, fmt } from "@/lib/i18n"
import { STORAGE_KEYS } from "./keys"

/** 프리셋에 담는 색 보정 4필드. */
export interface PresetColor {
  brightness: number
  contrast: number
  saturation: number
  temperature: number
}

export interface Preset {
  id: string
  name: string
  createdAt: number
  edit: PresetColor
}

/** 최대 저장 개수. 초과 시 저장 버튼에서 안내한다. */
export const MAX_PRESETS = 20

function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v)
}

function isPreset(o: unknown): o is Preset {
  if (!o || typeof o !== "object") return false
  const p = o as Record<string, unknown>
  const e = p.edit as Record<string, unknown> | undefined
  return (
    typeof p.id === "string" &&
    typeof p.name === "string" &&
    isNum(p.createdAt) &&
    !!e &&
    isNum(e.brightness) &&
    isNum(e.contrast) &&
    isNum(e.saturation) &&
    isNum(e.temperature)
  )
}

function read(): Preset[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.PRESETS)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isPreset).slice(0, MAX_PRESETS)
  } catch {
    return []
  }
}

function write(list: Preset[]): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(STORAGE_KEYS.PRESETS, JSON.stringify(list))
  } catch {
    /* 저장 실패(프라이빗 모드·용량 초과)해도 앱은 계속 동작 */
  }
}

let seq = 0
function newId(): string {
  return `preset-${Date.now()}-${++seq}`
}

/**
 * 프리셋 상태 훅. SSR에서는 빈 배열로 시작하고 마운트 후 localStorage에서 채운다.
 * add는 한도 초과 시 false를 반환한다(호출부가 안내).
 */
export function usePresets() {
  const [presets, setPresets] = useState<Preset[]>([])
  const ref = useRef<Preset[]>([])

  useEffect(() => {
    const loaded = read()
    ref.current = loaded
    setPresets(loaded)
  }, [])

  const add = useCallback((name: string, edit: PresetColor): boolean => {
    if (ref.current.length >= MAX_PRESETS) return false
    const next: Preset[] = [
      ...ref.current,
      {
        id: newId(),
        // 빈 이름 폴백도 하드코딩하지 않고 i18n 기본 이름(프리셋 N)을 쓴다.
        name: name.trim() || fmt(t.presets.defaultName, { n: ref.current.length + 1 }),
        createdAt: Date.now(),
        edit: {
          brightness: edit.brightness,
          contrast: edit.contrast,
          saturation: edit.saturation,
          temperature: edit.temperature,
        },
      },
    ]
    ref.current = next
    write(next)
    setPresets(next)
    return true
  }, [])

  const remove = useCallback((id: string) => {
    const next = ref.current.filter((p) => p.id !== id)
    ref.current = next
    write(next)
    setPresets(next)
  }, [])

  return { presets, add, remove, atLimit: presets.length >= MAX_PRESETS }
}
