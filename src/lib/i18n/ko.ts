/**
 * 한국어 UI 문자열 (비개발자 셀러 대상 — 쉬운 말, 짧게).
 * v0.1은 한국어만. 코드에 한글 리터럴을 흩뿌리지 않고 여기 모은다.
 */
export const ko = {
  app: {
    name: "썸네일 제작",
    metaTitle: "썸네일 제작 — 과일 사진 보정·썸네일",
    metaDescription:
      "과일 사진을 올려 크롭·색감을 다듬고 1080×1080 썸네일로 저장하세요. 키는 내 브라우저에만 저장됩니다.",
  },
  tabs: {
    thumbnail: "썸네일 제작",
    retouch: "사진 보정",
  },
  cost: {
    label: "이번 작업 예상 비용",
    zero: "₩0",
    note: "지금은 무료 보정만 있어요. AI 기능은 다음 버전에 열려요.",
  },
  keyButton: "키 설정",
  keySettings: {
    title: "API 키 설정",
    subtitle: "AI 기능을 쓰려면 내 API 키가 필요해요. (지금 버전은 없어도 보정은 됩니다)",
    claudeLabel: "클로드 API 키",
    claudePlaceholder: "sk-ant-... 로 시작하는 키",
    geminiLabel: "구글(Gemini) API 키",
    geminiPlaceholder: "AIza... 로 시작하는 키",
    howTo: "연결 방법 보기",
    statusConnected: "연결됨",
    statusEmpty: "미연결",
    save: "저장",
    saved: "저장했어요",
    close: "닫기",
    privacy: "키는 내 브라우저에만 저장되고 서버로 전송되지 않아요.",
    show: "보기",
    hide: "숨기기",
  },
  help: {
    title: "API 키 발급 방법",
    tabClaude: "클로드",
    tabGemini: "구글(Gemini)",
    claudeSteps: [
      {
        title: "콘솔 접속",
        body: "console.anthropic.com 에 접속해 로그인해요. (계정이 없으면 회원가입)",
      },
      {
        title: "API Keys 메뉴에서 발급",
        body: "왼쪽 메뉴 'API Keys'에서 'Create Key'를 눌러 새 키를 만들어요.",
      },
      {
        title: "복사해서 붙여넣기",
        body: "만들어진 키를 복사해, 이 화면 '클로드 API 키' 칸에 붙여넣어요.",
      },
    ],
    claudeLink: "https://console.anthropic.com",
    claudeLinkLabel: "console.anthropic.com 열기",
    geminiSteps: [
      {
        title: "AI Studio 접속",
        body: "aistudio.google.com 에 접속해 구글 계정으로 로그인해요.",
      },
      {
        title: "Get API Key",
        body: "'Get API Key' 버튼을 눌러 'Create API Key'로 키를 만들어요.",
      },
      {
        title: "복사해서 붙여넣기",
        body: "만들어진 키를 복사해, 이 화면 '구글(Gemini) API 키' 칸에 붙여넣어요.",
      },
    ],
    geminiLink: "https://aistudio.google.com/app/apikey",
    geminiLinkLabel: "aistudio.google.com 열기",
    privacy: "키는 내 브라우저에만 저장되고 서버로 전송되지 않아요.",
    close: "닫기",
    stepWord: "단계",
  },
  retouch: {
    uploadTitle: "과일 사진을 올려주세요",
    uploadHint: "여기로 사진을 끌어다 놓거나 클릭해서 선택하세요",
    uploadFormats: "JPG · PNG · WebP",
    uploadButton: "사진 선택",
    invalidFile: "JPG, PNG, WebP 이미지만 올릴 수 있어요.",
    heicError:
      "아이폰 HEIC 사진은 브라우저가 지원하지 않아요. 아이폰 카메라 설정을 '호환성 우선(JPG)'으로 바꾸거나 JPG로 변환해서 올려주세요.",
    loadError:
      "사진을 불러오지 못했어요. 파일이 손상됐거나 지원하지 않는 형식일 수 있어요. 다른 사진으로 다시 시도해 주세요.",
    replace: "다른 사진 올리기",
    // 도구 그룹
    cropGroup: "크롭 (자르기)",
    cropFree: "자유",
    cropSquare: "1:1 정사각",
    cropEnter: "크롭 시작",
    cropApply: "적용",
    cropCancel: "취소",
    cropHint: "모서리를 끌어 자를 범위를 정하세요.",
    rotateGroup: "회전 · 수평",
    rotateLeft: "왼쪽 90°",
    rotateRight: "오른쪽 90°",
    fineAngle: "미세 각도 (수평 보정)",
    colorGroup: "색·밝기",
    brightness: "밝기",
    contrast: "대비",
    saturation: "채도",
    temperature: "색온도",
    tempCool: "차갑게",
    tempWarm: "따뜻하게",
    reset: "원본으로 복원",
    undo: "실행 취소",
    compare: "원본과 비교",
    compareOn: "비교 중",
    compareHint: "가운데 손잡이를 좌우로 끌어 원본과 비교하세요.",
    before: "보정 전",
    after: "보정 후",
    squareGuide: "1:1 저장 범위",
    overWarn: "실물과 달라 보이면 클레임 위험이 있어요.",
  },
  download: {
    title: "저장하기",
    notSquareWarn: "정사각형이 아니라 가운데를 잘라 저장돼요. 원하는 부분은 크롭으로 지정하세요.",
    fitSquare: "1:1 맞추기",
    png: "PNG 고화질 (1080×1080)",
    jpg: "JPG 변환 (1080×1080)",
    coupang: "쿠팡용 (1000×1000)",
    pngNote: "가장 선명해요. 대표이미지 추천.",
    jpgNote: "용량이 작아요. 품질 92%.",
    coupangNote: "쿠팡 대표이미지 권장 규격.",
    saving: "저장 중...",
    needImage: "먼저 사진을 올려주세요.",
  },
  thumbnail: {
    badge: "곧 열려요",
    title: "AI 썸네일 제작은 다음 버전에 열려요",
    lead: "내 과일 사진과 참고 사진을 올리면, 실물 그대로 배경·연출만 바꾼 A컷 썸네일을 뽑아줘요.",
    pipelineTitle: "이렇게 만들어져요",
    steps: [
      { title: "업로드", body: "내 과일 사진(재료) + 참고 사진(분위기)을 올려요." },
      { title: "연출 선택", body: "모닝 마켓·프리미엄 다크 같은 연출 프리셋을 골라요." },
      { title: "생성", body: "후보 3~4장을 실사 느낌으로 만들어요." },
      { title: "A컷 검수", body: "원본과 대조해 13가지 항목을 통과한 컷만 보여줘요." },
      { title: "다듬기", body: "\"그림자 연하게\" 처럼 말로 부분 수정하고 저장해요." },
    ],
    ctaHint: "지금은 '사진 보정' 탭에서 크롭·색감 정리를 먼저 해보세요.",
    goRetouch: "사진 보정 하러 가기",
  },
} as const

export type Ko = typeof ko
