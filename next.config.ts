import type { NextConfig } from "next"

/**
 * 정적 export 모드 — Cloudflare Pages / GitHub Pages 배포 전제 (fdp 앱과 동일 관례).
 * 하위 경로 배포 시 NEXT_PUBLIC_BASE_PATH=/thumb 환경변수 설정.
 * 로컬 검증은 빈 값(루트) 기준.
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? ""

const nextConfig: NextConfig = {
  output: "export",
  reactStrictMode: true,
  trailingSlash: true,
  basePath: basePath || undefined,
  assetPrefix: basePath || undefined,
  images: {
    unoptimized: true,
  },
}

export default nextConfig
