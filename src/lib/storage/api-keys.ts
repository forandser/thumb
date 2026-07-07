"use client"

/**
 * BYOK API 키 저장 — v0.1은 브라우저 localStorage에만 저장한다.
 *
 * v0.1은 아직 어떤 API도 호출하지 않으므로(전부 클라이언트 보정) 키는 "존재 여부"만
 * 쓰인다(연결 상태등). 실제 호출이 붙는 v0.2에서 암호화 저장 도입을 검토한다.
 * 서버 전송은 절대 없다 — 정적 사이트라 서버 자체가 없다.
 */
import { useCallback, useEffect, useState } from "react"
import { STORAGE_KEYS } from "./keys"

export interface ApiKeys {
  claude: string
  gemini: string
}

const EMPTY: ApiKeys = { claude: "", gemini: "" }

function read(): ApiKeys {
  if (typeof window === "undefined") return EMPTY
  try {
    return {
      claude: window.localStorage.getItem(STORAGE_KEYS.CLAUDE_KEY) ?? "",
      gemini: window.localStorage.getItem(STORAGE_KEYS.GEMINI_KEY) ?? "",
    }
  } catch {
    return EMPTY
  }
}

function write(keys: ApiKeys): void {
  if (typeof window === "undefined") return
  try {
    // 빈 값은 저장하지 않고 제거한다(연결 상태등이 "미연결"로 정확히 뜨도록).
    setOrRemove(STORAGE_KEYS.CLAUDE_KEY, keys.claude)
    setOrRemove(STORAGE_KEYS.GEMINI_KEY, keys.gemini)
  } catch {
    /* 저장 실패(프라이빗 모드 등)해도 앱은 계속 동작 */
  }
}

function setOrRemove(key: string, value: string): void {
  const v = value.trim()
  if (v) window.localStorage.setItem(key, v)
  else window.localStorage.removeItem(key)
}

/**
 * 키 상태를 읽고 저장하는 훅.
 * SSR(정적 export의 프리렌더)에서는 빈 값으로 시작하고, 마운트 후 localStorage에서 채운다.
 */
export function useApiKeys() {
  const [keys, setKeys] = useState<ApiKeys>(EMPTY)

  useEffect(() => {
    setKeys(read())
  }, [])

  const save = useCallback((next: ApiKeys) => {
    const cleaned: ApiKeys = { claude: next.claude.trim(), gemini: next.gemini.trim() }
    write(cleaned)
    setKeys(cleaned)
  }, [])

  return { keys, save }
}
