/**
 * 정적 배포 basePath 보정 (fdp 앱과 동일 관례).
 *
 * 하위 경로(/thumb) 서빙 시 CSS/FontFace의 "/fonts/..." 절대경로는 basePath를
 * 무시하고 도메인 루트를 가리켜 404가 난다. public/ 자산을 코드에서 참조할 때는
 * 반드시 이 헬퍼를 거친다.
 */
export const ASSET_BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? ""

export function assetUrl(path: string): string {
  return `${ASSET_BASE}${path}`
}
