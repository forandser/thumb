import type { Metadata } from "next"
import { ko } from "@/lib/i18n/ko"
import { FONT_FACE_CSS } from "@/lib/fonts/font-face-css"
import { assetUrl } from "@/lib/fonts/asset-base"
import "./globals.css"

export const metadata: Metadata = {
  title: ko.app.name,
  description: ko.app.metaDescription,
  robots: { index: false, follow: false },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko">
      <head>
        {/* 파비콘 — basePath 대응(assetUrl). metadata.icons는 basePath를 안 붙여 404. */}
        <link rel="icon" type="image/svg+xml" href={assetUrl("/favicon.svg")} />
      </head>
      <body>
        {/* @font-face 주입 — globals.css 정적 선언은 basePath를 몰라 404였음 (fdp와 동일 처리) */}
        <style dangerouslySetInnerHTML={{ __html: FONT_FACE_CSS }} />
        {children}
      </body>
    </html>
  )
}
