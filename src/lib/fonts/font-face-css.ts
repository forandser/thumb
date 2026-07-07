/**
 * 코어 @font-face CSS를 basePath 보정된 URL로 생성한다 (fdp 앱과 동일 관례).
 *
 * globals.css의 정적 @font-face는 url('/fonts/...')이 basePath를 몰라 배포에서
 * 404가 났다. 빌드 시점에 NEXT_PUBLIC_BASE_PATH가 인라인되는 TS 모듈에서 CSS
 * 문자열을 만들어 layout.tsx가 <style>로 주입한다.
 *
 * 썸네일 제작 앱은 Pretendard 단일 패밀리만 사용한다(장식 폰트 불필요).
 */
import { assetUrl } from "./asset-base"

interface CoreFace {
  family: string
  file: string
  weight: number
}

const CORE_FACES: CoreFace[] = [
  { family: "Pretendard", file: "/fonts/Pretendard-Regular.woff2", weight: 400 },
  { family: "Pretendard", file: "/fonts/Pretendard-Medium.woff2", weight: 500 },
  { family: "Pretendard", file: "/fonts/Pretendard-SemiBold.woff2", weight: 600 },
  { family: "Pretendard", file: "/fonts/Pretendard-Bold.woff2", weight: 700 },
  { family: "Pretendard", file: "/fonts/Pretendard-ExtraBold.woff2", weight: 800 },
  { family: "Pretendard", file: "/fonts/Pretendard-Black.woff2", weight: 900 },
]

export const FONT_FACE_CSS = CORE_FACES.map((f) => {
  return `@font-face{font-family:'${f.family}';src:url('${assetUrl(f.file)}') format('woff2');font-weight:${f.weight};font-style:normal;font-display:swap;}`
}).join("\n")
