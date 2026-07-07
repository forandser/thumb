@echo off
REM ============================================
REM 썸네일 제작 — 개발 서버 실행
REM
REM 폴더명에 # 문자가 있으면 Tailwind 4 빌드가 깨지므로
REM subst로 Y: 가상 드라이브를 만들어 우회합니다.
REM (fdp 앱은 Z: 사용 — 동시 실행 시 충돌 피하려 여기선 Y:)
REM ============================================

set TEMP=D:\temp-claude
set TMP=D:\temp-claude
if not exist D:\temp-claude mkdir D:\temp-claude

REM 기존 Y: 매핑 정리 후 재설정
subst Y: /D >nul 2>&1
subst Y: "%~dp0"

if not exist Y:\package.json (
  echo [ERROR] Y: 가상 드라이브 매핑 실패. 관리자 권한으로 다시 실행해 주세요.
  pause
  exit /b 1
)

echo [OK] Y: 드라이브 매핑 완료. 개발 서버 시작...
echo.
cd /d Y:\
node "./node_modules/next/dist/bin/next" dev --webpack
