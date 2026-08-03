# 해피트리 영어학원 진도관리 시스템

> **운용(배포) 사이트** : https://happytree.vercel.app/
> **개발(시험) 사이트** : https://happytree-jvr3zy141-kuha0879-6856s-projects.vercel.app/
> **저장소** : https://github.com/kyuhwajeong/happytree/tree/dev
> **버전** : v10d (2026.06 기준 최종)

---

## 📋 목차

1. [시스템 개요](#1-시스템-개요)
2. [기술 스택](#2-기술-스택)
3. [전체 구조 흐름도](#3-전체-구조-흐름도)
4. [파일 구성](#4-파일-구성)
5. [Firebase 데이터 경로](#5-firebase-데이터-경로)
6. [메뉴별 핵심 기능](#6-메뉴별-핵심-기능)
7. [🤖 Gemini AI 코멘트 생성](#7-gemini-ai-코멘트-생성)
8. [🔒 히든 모니터링 시스템](#8-히든-모니터링-시스템)
9. [🎭 게스트 데모 모드](#9-게스트-데모-모드)
10. [주요 LocalStorage 키](#10-주요-localstorage-키)
11. [권한 체계](#11-권한-체계)
12. [Vercel 서버리스 API](#12-vercel-서버리스-api)
13. [최근 주요 변경 이력](#13-최근-주요-변경-이력)
14. [개발 참고사항](#14-개발-참고사항)

---

## 1. 시스템 개요

영어학원 전용 **PWA(Progressive Web App)** 기반 학원 통합 관리 시스템.  
Firebase Realtime DB를 백엔드로 사용하며, 별도 서버 없이 **Vercel** 정적 호스팅.

### 핵심 역할

| 모듈 | 설명 |
|---|---|
| **📅 진도 관리** | 반별 주간 교재 진도 입력·공유·이력 조회 |
| **⚙️ 관리** | 반·계정·테마·백업·공유 설정 + 수업료/교재비 편집 |
| **📖 교재 학습 관리** | 챕터별 수행/미수행 매트릭스, xlsx 일괄 반영 |
| **📝 성적 관리** | 단어·리딩 성취율 입력, AI 코멘트 생성, 리포트 전달 |
| **👨‍🎓 학생 관리** | 재원생 정보, 반 배정, MakEdu 엑셀 가져오기 |
| **👩‍💼 직원 관리** | 강사 정보, 근태 기록, 급여 정산, 즉시 시급 계산기 |
| **🏠 홈 대시보드** | 일정·교재 학습 현황 요약, 바로가기, 섹션 순서 커스터마이즈 |
| **📅 일정관리** | 방학·공휴일·일반 일정, 직원 근무기록 캘린더, 날씨 배경 |
| **🔔 공지사항** | 교재비·수업료 등 예약 공지 자동 팝업 (1회성/매월 반복) |
| **🗂 콘텐츠(자료실)** | 파일 자료실 + 🎬 영상 워크시트 + 🎮 학습 게임 3종 통합 탭 |
| **🔒 모니터링** | 히든 실시간 접속 추적, FCM 푸시 알림, 통계 대시보드 |
| **🎭 게스트 데모** | 나레이션 스포트라이트 투어 (비로그인 체험용) |

> ⚠️ 위 표는 dev 브랜치 실제 소스(2026-08 기준)를 직접 대조해 8개 항목에서
> 12개 항목으로 보강한 것입니다. 아래 각 섹션도 동일 기준으로 갱신했습니다.

---

## 2. 기술 스택

| 구분 | 내용 |
|---|---|
| **Frontend** | Vanilla JS (ES2020+, IIFE 모듈 패턴), HTML5, CSS3 |
| **DB** | Firebase Realtime Database (compat SDK v10.12.0) |
| **호스팅** | Vercel (정적 배포, CSP 헤더, 서버리스 API) |
| **PWA** | Web App Manifest (standalone), Service Worker (FCM 백그라운드) |
| **AI** | Google Gemini API (gemini-2.5-flash-lite / gemini-2.5-flash) |
| **Push** | FCM V1 API (서비스 계정 JWT 방식, Vercel `/api/notify`) |
| **xlsx** | SheetJS (XLSX.js v0.18.5), ExcelJS v4.4.0 |
| **캡처/PDF** | html2canvas v1.4.1, jsPDF v2.5.1, pdf.js v3.11.174 |
| **압축** | JSZip v3.10.1 (자료실 zip 다운로드) |
| **지오코딩** | api.ipify.org + ip-api.com (Vercel `/api/geoip` 프록시, 모니터링용) |
| **파일 스토리지** | Cloudflare Worker(`*.workers.dev`) → R2 / Backblaze B2 (자료실 파일 업로드·다운로드) |
| **영상** | YouTube Data API v3 (교육영상 검색/등록) |
| **이미지** | Unsplash API (배경 이미지, 영상 워크시트 삽화) |
| **날씨/위치** | Open-Meteo(무료, 키 불필요) + Nominatim 역지오코딩 (일정표 날씨 배경) |
| **명언 API** | korean-advice-open-api (홈 대시보드 오늘의 명언, 24h 캐시) |
| **HWP 변환** | `@rhwp/core` (esm.sh 동적 import, 자료실 한글 문서 미리보기/변환) |
| **폰트** | Google Fonts — Noto Sans KR, IBM Plex Sans KR, Nanum Gothic, Nanum Myeongjo |
| **한글 PDF 폰트** | nanum-gothic-base64.js — jsPDF용 나눔고딕 base64 임베드 (약 2.7MB) |

---

### ⚠️ 보안 참고사항 (2026-08 소스 점검 시 발견 — 사용자 확인 필요)

클라이언트 JS 소스(공개 GitHub 저장소 + 배포 사이트 view-source로 누구나 열람 가능)에
아래 6개 키/토큰이 하드코딩되어 있습니다. 서버 프록시 없이 브라우저에서 직접
호출하는 구조라 코드 안에 있을 수밖에 없는 것들도 있지만, 위험도가 서로 다르므로
구분해서 인지하고 계시는 게 좋습니다.

| 키/토큰 | 위치 | 위험도 | 비고 |
|---|---|---|---|
| Gemini API 키 3개 | `gemini-ai.js` | 🔴 높음 | 유출 시 과금·쿼터를 제3자가 소모 가능 |
| Cloudflare Worker 업로드 토큰 | `archive-db.js` (`UPLOAD_TOKEN`) | 🔴 높음 | presign(업로드) + **삭제(DELETE)** 권한까지 있는 Bearer 토큰. 유출 시 자료실 파일을 임의로 올리거나 지울 수 있음 |
| YouTube Data API 키 | `edu-video-app.js` | 🟡 중간 | 일일 쿼터 소모형, 유출 시 쿼터 고갈 가능 |
| Unsplash Access Key | `edu-video-app.js`, `bg-theme.js` | 🟢 낮음 | 검색 전용 무료 키, 시간당 호출 제한만 존재 |

이미 배포된 상태이므로 즉시 장애가 나는 것은 아니지만, 특히 Gemini 키와 Worker 업로드
토큰은 **키 로테이션 + 서버리스 프록시(이미 있는 `/api/notify`, `/api/geoip`와 같은 방식)로
이전**하는 걸 권장합니다. 학원 내부용 소규모 서비스라 실제 악용 가능성은 낮을 수 있지만,
결정은 운영자 판단이 필요한 부분이라 별도로 표시해 둡니다.

---

## 3. 전체 구조 흐름도

```
┌──────────────────────────────────────────────────────────────────┐
│                      index.html (PWA Shell)                       │
│  🏠 홈(대시보드) — 로그인 후 첫 화면, 하단 네비 없이 로고 탭으로 복귀│
│  ┌──────────────────────────────────────────────────────────┐    │
│  │ 하단 네비게이션 (권한+순서 동적 렌더 / localStorage 저장) │    │
│  │ [📅진도][⚙️관리][📖교재][📝성적][👨‍🎓학생][👩‍💼직원][🗂콘텐츠]│    │
│  └──────────────────────────────────────────────────────────┘    │
│  🔔 공지 팝업(헤더 아이콘, 전 페이지 공통) — 예약 공지 자동 표시   │
└──────────────────────────────────────────────────────────────────┘
      │        │         │          │           │          │
      ▼        ▼         ▼          ▼           ▼          ▼
  app.js  booklib-app grade-app students-app staff-app  archive-app
(진도·관리) (교재관리) (성적관리)  (학생관리)  (직원·급여) (자료실)
      │        │         │    ↑AI      │           │      ├─ EduVideoApp (🎬영상)
      ▼        ▼         ▼   │         │           │      └─ GameApp (🎮게임)
   db.js  booklib-db  grade-db  gemini-ai.js   staff-db  archive-db
(반·계정·테마)(교재·챕터)(성적·설정)(Gemini API) (직원DB)  (자료+영상+게임 데이터)
      │        │         │                        │           │
      └────────┴─────────┴───────────┬────────────┴───────────┘
                                      │
   dashboard-app.js(🏠홈, ScheduleApp 캘린더 위임 렌더)
   schedule-app.js/-db.js(📅일정 — 홈에 내장, 근무기록 빠른등록)
   notice-app.js/-db.js(🔔공지 — 헤더 팝업, 전 페이지 공통)
   bg-theme.js(배경 이미지, theme.bg 경로 공유)
                                      │
                                      ▼
                         Firebase Realtime DB
           hakwon10/
           ├── classes/        반 목록 (termStart/termEnd 기간 관리)
           ├── accounts/       계정 목록
           ├── theme/          테마·설정 (theme.bg = 배경 이미지 설정)
           ├── progress/       주간 진도 + 메모
           ├── bookdata/       교재 정보·챕터
           ├── bookcheck/      수행 체크 데이터
           ├── bookstamps/     진도 스탬프
           ├── memos/          학생 메모
           ├── exempts/        면제 설정
           ├── grades/         성적 데이터
           ├── globalPins/     AI 공용 고정 멘트
           ├── sharedReports/  성적 리포트 공유 HTML 임시 저장
           ├── schedules/      일정(방학·공휴일·일반) + schedulesMeta/
           ├── notices/        예약 공지
           ├── archive/        자료실 게시물(메타데이터, 파일 본체는 R2/B2)
           ├── archiveCategories/ 자료실 분류 목록
           ├── eduVideos/      교육 영상(유튜브 링크+대본+AI추출단어)
           ├── eduVideoTopics/ 교육 영상 주제 목록
           └── monitor/        히든 모니터링
               ├── sessions/   접속 세션 (48시간 TTL)
               ├── fcm_tokens/ FCM 디바이스 토큰
               └── ip_labels/  IP 대역 장소명 라벨

[인증 흐름]
스플래시 인트로 → DB.init() → 로그인 팝업
→ 역할(admin/operator/teacher) 판별 → 메뉴 권한 적용
→ 3시간 미사용 자동 로그아웃

[성적 리포트 공유 링크 흐름]
리포트 HTML 생성 → Firebase sharedReports/{id} 저장
→ ?rpt={id} URL 공유 → 수신자 브라우저 직접 렌더

[자료실 파일 업로드 흐름]
파일 선택 → archive-db.js가 Cloudflare Worker(*.workers.dev)에 presign 요청
→ Bearer 토큰 인증 → R2/B2에 실제 파일 저장
→ 게시물 메타데이터(제목·분류·첨부목록)만 Firebase hakwon10/archive/ 에 저장

[FCM 푸시 흐름]
사용자 로그인 → monitor-db.js 세션 기록
→ monitor-patch.js 액션 추적 → Firebase sessions 저장
→ monitor-fcm.js 새 세션 감지 → /api/notify 호출
→ FCM V1 API → 관리자 기기에 OS 알림
```

---

## 4. 파일 구성

```
htdev/
├── index.html              메인 PWA 셸 · 하단 nav · 모달 전체 포함
│                           · FCM SDK (firebase-messaging-compat.js) 추가
│                           · 수업료/교재비 패널 스타일 인라인 포함
├── style.css               전역 스타일 (CSS 변수 기반 5종 테마)
├── manifest.json           PWA 매니페스트 (standalone, icon-192/512)
│
│── firebase-config.js  v10 Firebase 초기화 + FireDB 모듈
│                           · 8초 디바운스 오프라인 배너
│                           · keepSynced(true) 주요 경로
│                           · set()/update() 성공/실패 boolean 반환
├── firebase-messaging-sw.js FCM 백그라운드 Service Worker
│                           · 앱 닫혀 있어도 OS 알림 표시
│                           · 알림 클릭 → 앱 포커스/새 탭
│
├── logo.js                 SVG 로고 생성 모듈
├── db.js               v10b 반·계정·진도·테마 DB 모듈
│                           · 반 편성 기간(termStart/termEnd) 지원
│                           · getActiveClasses() / getClassesForMonth()
│                           · terminateClass() — 반 편성 종료
│                           · progress 쓰기 보호 (_pendingKeys)
│                           · Firebase 재연결 후 자동 데이터 재로드
│
├── app.js              v10d 진도관리 · 관리 메뉴 + 공유 뷰
│                           · 수업료/교재비 일괄 편집 패널 (openFeePanel)
│                           · 성적 리포트 공유 링크 (?rpt=) 렌더러
│                           · 반 편성 기간 기반 목록 관리
│                           · 교재명 더블클릭 인라인 수정
│                           · 하단 탭 동적 렌더 (_renderNav)
│
├── booklib-app.js      v3.7+ 교재 학습 관리
├── booklib-db.js       v3.1  교재 DB 모듈
│
├── grade-app.js        v4.1  성적 관리 (AI 코멘트 통합)
├── grade-db.js         v2.0  성적 DB 모듈
│
├── gemini-ai.js        v9.0  Google Gemini AI 연동 모듈
│                           · 3개 API 키 폴백 / 2개 모델 폴백
│                           · 코멘트 생성·3버전·교정·스타일분석
│                           · 공용/교재별 고정 멘트 (Firebase 동기화)
│
├── students-app.js     v1.0  학생 관리 (admin 전용)
├── students-db.js            학생 DB 모듈
│
├── staff-app.js        v3.1  직원 관리 + 급여 정산
│                           · 즉시 시급 계산기 (슬롯 시스템)
│                           · 업무 유형별 차등 시급 (일반/수업)
│                           · 결과 저장·공유·인쇄
├── staff-db.js               직원 DB 모듈
│
├── dashboard-app.js    v3    홈(첫 화면) 대시보드
│                           · ScheduleApp 캘린더 위임 렌더 + 교재 학습 현황 요약
│                           · 섹션 순서 커스터마이즈(헤더 ≡ 버튼, hk10b_dashboardOrder)
│                           · 오늘의 명언(korean-advice-open-api, 24h 캐시)
│
├── schedule-app.js     v5    일정관리 UI (홈 대시보드 내장, 별도 하단 탭 없음)
│                           · 방학/공휴일/일반 일정 + 직원 근무기록 캘린더 통합 표시
│                           · Open-Meteo 날씨 배경 + Nominatim 역지오코딩(위치명)
│                           · 근무기록 빠른등록(➕등록) — 직원선택+시간→시급 자동반영
├── schedule-db.js      v1    일정 DB 모듈 (독립 Firebase 경로, 공휴일 자동 시딩 1회)
│
├── notice-app.js       v1    공지 알림 팝업 (헤더 🔔 버튼, 전 페이지 공통)
│                           · 예약 시점 도래 시 30초 주기 감지 자동 팝업
│                           · 1회성(onceDate)/매월반복(monthDay) 스케줄
├── notice-db.js        v1    공지 DB 모듈 (독립 Firebase 경로)
│
├── archive-app.js            자료실 화면 (하단 탭 "🗂 콘텐츠")
│                           · 이미지/PDF/엑셀 직접 미리보기, HWP 변환(@rhwp/core)
│                           · 게시물당 다중 파일 첨부, zip 일괄 다운로드
│                           · 하위 탭으로 EduVideoApp(영상)·GameApp(게임) 포함
├── archive-db.js             자료실 DB 모듈
│                           · 파일 본체는 Cloudflare Worker → R2/B2 저장
│                           · 게시물 메타데이터만 Firebase 저장
│
├── edu-video-app.js          교육 영상 화면 (콘텐츠 탭 하위 도구)
│                           · 유튜브 영상 등록/재생, YouTube Data API 검색
│                           · 대본에서 AI 단어 추출 → 이미지 포함 워크시트 PDF
├── edu-video-db.js           교육 영상 DB 모듈
│
├── game-app.js                학습 게임 (콘텐츠 탭 하위 도구, 별도 DB 없음)
│                           · 짝맞추기/스펠링/퀴즈 3종, 빔프로젝터용 화면+인쇄 워크시트
│                           · EduVideoDB 단어 추출 파이프라인 재사용
│
├── bg-theme.js          v1.0 배경 이미지 시스템
│                           · Unsplash API로 무드별 배경사진 자동 교체
│                           · hakwon10/theme.bg 경로 공유 (전 기기 동기화)
│
│── monitor-fcm.js      v1.0  FCM 토큰 관리 + 푸시 전송
├── monitor-db.js       v5.0  세션 추적 + IP 지오코딩
│                           · ip-api.com 한국어 위치 조회
│                           · IP 대역 장소명 라벨 관리
├── monitor-app.js      v4.0  히든 모니터링 대시보드 UI
│                           · 브라우저 OS 알림 (새 세션 감지)
│                           · 이상 접속 플래그 (심야/중복/과다)
│                           · 통계 대시보드 탭 (48h 집계)
│                           · 메뉴 사용 히트맵 (요일×시간대)
├── monitor-patch.js    v4.0  전 메뉴 액션 추적 (monkey-patch)
│
├── guest-mode.js       v3.1  게스트 나레이션 데모 시스템
│                           · SVG 마스크 스포트라이트 + 말풍선
│                           · 이전/다음/다시보기 스텝 내비게이션
│                           · 탭·서브메뉴 자동 전환 (action 콜백)
│                           · 홈(dashboard)·콘텐츠(archive) 나레이션 신규 추가
│                           · Write 차단 화이트리스트에 4개 신규 DB 모듈 추가(보안 수정)
│
├── nanum-gothic-base64.js     jsPDF용 나눔고딕 base64 폰트 (약 2.7MB)
│                           · game/edu-video/archive의 한글 PDF 생성에서 공용 사용
│
├── vercel.json               CSP 헤더 + SW 헤더 설정
├── package.json              Vercel 서버리스 함수용
└── api/                       Vercel 서버리스 함수 (실제로는 이 폴더 하위에 위치 — 기존 문서엔 루트로 잘못 표기돼 있었음)
    ├── notify.js        v2.0  /api/notify — FCM V1 푸시 전송
    │                           · 서비스 계정 JWT → Google OAuth2 토큰
    │                           · Node.js 내장 crypto만 사용 (npm 불필요)
    └── geoip.js               /api/geoip — IP → 위치 조회 프록시
                               · ip-api.com HTTP 혼합 콘텐츠 우회
```

---

## 5. Firebase 데이터 경로

```
hakwon10/
├── classes/{classId}
│   ├── name              반 이름
│   ├── days[]            수업 요일
│   ├── dayTimes{}        요일별 수업 시간 (선택)
│   ├── termStart         편성 시작 월 (YYYY-MM)
│   ├── termEnd           편성 종료 월 (null = 현재 운용 중)
│   ├── tuition           수업료 (원)
│   ├── bookFee           교재비 (원)
│   ├── feeMemo           수납 메모
│   └── monthBooks/{YYYY-MM}
│       ├── pool[]        편성 대기 교재
│       ├── main[]        주교재 목록
│       └── sub[]         부교재 목록
│
├── accounts/{accountId}
│   ├── username / password(hash) / role
│   ├── teacherClasses[]  담당 반 (teacher 역할)
│   └── allowedMenus[]    강사 추가 메뉴 권한 (booklib / grade)
│
├── theme/                전역 테마·폰트·글자 크기·입력칸 너비
│   └── bg/               배경 이미지 설정 (bg-theme.js) — enabled/mood/strength/rotateDays/url/credit
│
├── progress/{classId__{weekKey}__{dayName}__{bookId}__progress}
│   └── 진도 텍스트         "p.32~38" 형태
│
├── bookdata/{bookId}
│   ├── name / chapters[] / classIds[] / studentIds[]
│   ├── sortOrder / archived / reportConfig
│   └── createdAt / archivedAt
│
├── bookcheck/{classId}/{bookId}/{studentId}/{chapterId}
│   └── "단어:O|문장:O|..."   수행 데이터 문자열
│
├── bookstamps/{classId}/{bookId}/{chapterId}
│   └── ISO 날짜시간         진도 스탬프
│
├── memos/{classId}/{bookId}/{studentId}
│   └── 메모 텍스트
│
├── exempts/{classId}/{bookId}/{studentName}
│   ├── items[]           면제 항목 목록
│   ├── useAlias          별칭 사용 여부
│   └── alias             별칭 텍스트
│
├── grades/{classId}/{studentId}/{bookId}/{recordId}
│   ├── word: { totalQ, pass, retake }
│   ├── reading: { R0: {score}, R1: {score}, ... }
│   ├── comment           Teacher's Comment (AI 생성 포함)
│   ├── date / createdAt / updatedAt
│   └── classId / studentId / bookId
│
├── globalPins/           AI 공용 고정 멘트 (전체 계정 공유)
│
├── sharedReports/{id}    성적 리포트 공유 HTML (임시)
│   └── html / createdAt
│
├── schedules/{id}        일정 (schedule-db.js v1)
│   ├── title / memo
│   ├── category          'general' | 'vacation-summer' | 'vacation-winter' | 'holiday'
│   ├── startDate / endDate   YYYY-MM-DD (하루짜리는 start=end)
│   ├── notifyEnabled / notifyTime / notifiedAt
│   ├── audience           'admin' | 'all'
│   └── createdAt / createdBy / seedKey (공휴일 자동시딩 항목만)
├── schedulesMeta/holidaySeedVersion   공휴일 자동 시딩 버전 플래그 (최초 1회만 실행)
│
├── notices/{id}          예약 공지 (notice-db.js v1)
│   ├── title / body
│   ├── category           'textbook' | 'tuition' | 'general'
│   ├── scheduleType        'once' | 'monthly'
│   ├── onceDate / monthDay / time
│   ├── audience            'admin' | 'all'
│   ├── active
│   ├── completedPeriods/{'YYYY-MM'|'YYYY-MM-DD'}  회차별 완료 처리 기록 {at, by}
│   └── createdAt / createdBy
│
├── archive/{id}           자료실 게시물 (archive-db.js) — 파일 본체는 R2/B2, 메타데이터만 여기
│   ├── name / category / description
│   ├── uploadedBy / password(선택) / visibility('public'|'private')
│   ├── files[]             { r2Key, originalName, ext, size, mimeType, thumbnail, contentText }
│   │                        (링크 게시물은 r2Key 대신 linkUrl/linkType)
│   └── uploadedAt / updatedAt
├── archiveCategories/      자료실 분류 목록 (기본: 공지/양식·학사자료·교재자료·행정서류·기타)
│
├── eduVideos/{id}          교육 영상 (edu-video-db.js)
│   ├── youtubeId / youtubeUrl / title / topic
│   ├── script / words[]     AI로 추출한 단어(뜻+예문)
│   ├── visibility('public'|'private')
│   └── createdAt / updatedAt / createdBy
├── eduVideoTopics/         교육 영상 주제 목록 (기본: 여행·가구·학교·과일·동물·음식·날씨·가족)
│
└── monitor/
    ├── sessions/{sessionId}
    │   ├── uid / username / role
    │   ├── ip / city / region / isp
    │   ├── device / browser / os
    │   ├── startedAt / lastSeen / loggedOut
    │   ├── actions[]     메뉴·액션 로그 (최대 200건)
    │   └── remoteCmd     {type,at,cmdId} — 원격 명령 (v5.2, 예: clearAll)
    ├── fcm_tokens/{deviceId}
    │   ├── token / createdAt / lastUpdated
    │   └── username / role
    └── ip_labels/{id}
        ├── prefix        IP 대역 (예: "211.234.12")
        └── label         장소명 (예: "해피트리영어학원")
```

---

## 6. 메뉴별 핵심 기능

---

### 📅 진도 관리 (app.js)

| 기능 | 설명 |
|---|---|
| 주간 진도 그리드 | 월~금 × 반별 주·부교재 진도 입력 (그리드/리스트 전환) |
| 반 선택 칩 | 오늘 수업 반 자동 선택, 칩 탭 → 해당 주 진도 즉시 표시 |
| 주차 이동 | 이전/다음 주 네비게이션 + 📆 달력 직접 선택 |
| 진도 저장 | 타이핑 즉시 debounce 저장 (pendingKeys 보호) |
| savedAt 표시 | 입력 시각 자동 기록·표시 |
| 진도 공유 | 반별 진도 텍스트 생성 → 복사/카카오톡 공유 |
| 공유 URL | ?share=classId&mon=YYYY-MM-DD → 읽기 전용 공유 뷰 |
| 리포트 공유 링크 | ?rpt=id → Firebase HTML 직접 렌더 (별도 페이지 없이) |

---

### ⚙️ 관리 (app.js)

| 탭 | 기능 |
|---|---|
| **📋 반** | 반 추가(편성기간)·수정·삭제, 요일·시간·교재 배정, 반간 교재 복사, 이전 편성 목록 조회 |
| **💰 수업료** | 수업료/교재비 일괄 편집 패널 — 카드 UI, 반별 개별 저장, 엑셀 내보내기 |
| **👤 계정** | admin/operator/teacher 계정 CRUD, 비밀번호 보기 토글, 강사 추가 메뉴 권한 |
| **🎨 테마** | 팔레트 5종(화이트/페이퍼/다크/슬레이트/시스템), 폰트 4종, 글자 크기, 탭 순서 ↑↓ |
| **📦 백업** | 전체 데이터 JSON 내보내기/가져오기 (classes+progress+theme) |
| **🔗 공유** | 진도 공유 URL·문자 전송 설정 |

#### 수업료/교재비 패널 (`openFeePanel`)
- 카드 형태로 반별 수업료·교재비·메모 표시
- 수정 시 카드 테두리 강조(dirty 상태), 개별 저장 버튼
- 전체 일괄 저장 + 엑셀 다운로드 (SheetJS)
- `hakwon10/classes/{id}.tuition / bookFee / feeMemo` 저장

#### 반 편성 기간 관리
```
같은 반 이름도 termStart가 다르면 독립 데이터
getActiveClasses()  → termEnd=null인 현재 운용 중 반
getClassesForMonth(mk) → 특정 월에 활성이었던 반
terminateClass(id)  → termEnd를 이전달로 설정
관리화면 mgMk(월) 이동으로 과거 편성 반 조회 가능
```

---

### 📖 교재 학습 관리 (booklib-app.js)

#### 📚 교재 관리 탭

| 기능 | 설명 |
|---|---|
| 교재 등록 | 교재명 + 반 배정 + 학생 배정 통합 UI, 중복·공백 인라인 오류 표시 |
| 챕터 관리 | 챕터 추가·순서 변경·삭제, 드래그로 열 너비 조정 (localStorage 유지) |
| 챕터명 접기 | `[◀]` 버튼 → 챕터 열 너비 토글 |
| 완결(아카이브) | 🔒 → 성적 Overview에서 완결 교재도 조회 가능 |

#### 📊 학습 현황 탭

| 기능 | 설명 |
|---|---|
| **수행 매트릭스** | 챕터(행) × 학생(열) 그리드, 셀 탭 → 수행/미수행 토글 |
| **진도 스탬프** | 챕터 셀 탭 → 날짜 설정, 미수행 집계 기준 |
| **학생별 공유** | 학생 이름 컬럼 탭 → 미수행 목록 팝업 → 복사/공유 |
| **전체 리포트** | 반 전체 미수행 현황 출력 (폰트 크기 조정 포함) |
| **예외 설정** | 학생별 면제 항목 + 별칭, `{bookId:{학생명:{items,alias}}}` 구조 |
| **후처리 필터** | xlsx 반영 후 특정 항목 시각적 제거 (DB 저장 없음) |
| **xlsx 일괄 반영** | 다수 파일 드래그앤드롭 → 파일명에서 반+교재 자동 매칭 → 진행 오버레이 |
| **반 미선택 일괄** | 반 선택 없이 드롭 → 그리드 카드 매칭 결과 → 하단 고정 바 실행 |

#### xlsx 파일명 매칭 규칙

```
파일명: "04.[T2] 파닉스 몬스터 4_20260516.xlsx"
         └번호┘└반┘ └────교재명────┘└──날짜──┘

1. _normStr(): 공백·_·- 제거 → 소문자
2. 브라켓 [T2] → 반 이름 매칭
3. 파일제목 정규화 vs 교재명 정규화 → 양방향 포함 비교
   A) 파일제목 ⊃ 교재명   B) 교재명 ⊃ 파일제목   C) 파일명 전체 ⊃ 교재명
4. 브라켓 내 한글 → 학생명 기반 교재 검색 (반 미배정 교재)
```

---

### 📝 성적 관리 (grade-app.js)

#### 뷰 전환

| 뷰 | 설명 |
|---|---|
| **🔲 엑셀** | 학생별 단어(통과/재시험) + 리딩 성취율 입력 표 |
| **🐱 카드** | 학생 카드 슬라이드 뷰 (스와이프 이동) |
| **📄 리포트** | 개인별 Achievement Report 생성 |

#### 엑셀 뷰

| 기능 | 설명 |
|---|---|
| 성취율 입력 | 통과 수, 재시험 수, 리딩 각 회차 점수 |
| 헤더 클릭 정렬 | 학생명·단어성취율·리딩성취율 컬럼 |
| Enter/방향키 | Enter → 다음 학생 이동, ↑↓ → 값 증감 |
| 우클릭 메뉴 | 개별 저장 / 초기화 컨텍스트 메뉴 |
| **✨ AI 코멘트** | GeminiAI 자동 생성 → Teacher's Comment 자동 입력 |
| 반 평균 행 | 단어·리딩 실시간 평균 계산 |

#### 리포트 뷰

| 기능 | 설명 |
|---|---|
| 레이아웃 5종 | L1~L5 다양한 레이아웃 |
| 플로팅 설정 패널 | 드래그 이동, 모바일 touch 닫기 |
| 폰트 5종 | Noto / IBM / 나눔고딕 / 명조 / Spoqa |
| 페이지 크기 7종 | A4 / A5 / B5 / Letter / 📇카드 / 📱좁게 / ↔전체폭 |
| 배율 슬라이더 | 60~150%, 5% 단위 |
| 배경·표 색상 | 배경 8색, 헤더·셀 색상 커스텀, 추천 테마 3종 |
| **📤 공유 링크** | 리포트 HTML → Firebase 임시 저장 → ?rpt= URL 공유 |
| **📲 전달** | html2canvas → 클립보드 PNG (PC Ctrl+V) + Web Share API |
| **📂 전체 캡처** | 반 전체 학생 순차 오프스크린 렌더 → PNG 일괄 저장 |
| 설정 영속성 | 모든 설정 localStorage → 재진입 시 자동 복원 |

#### 반만 선택 시 Overview 모드

| 기능 | 설명 |
|---|---|
| 교재별 성취율 표 | 완결 교재 포함 전체, 학생×교재 그리드 |
| 학생 선택 시 그래프 | Canvas 막대(단어)+선(반평균)+리딩 혼합 차트 |
| 교재별 상세 성적표 | 진행바 + 반평균 비교 + 코멘트 |
| 교재 하이라이트 | 교재 선택 시 차트+표 동시 강조 |

---

### 👨‍🎓 학생 관리 (students-app.js v1.0)

| 기능 | 설명 |
|---|---|
| 재원생 목록 | 반별 그룹핑, 통계 요약 카드 |
| 복합 필터 | 재원상태 / 반 / 학년 / 학교 |
| 검색 | 이름·닉네임·전화번호 |
| 학생 상세 | 정보 보기, 재원 상태 빠른 변경, 삭제 |
| MakEdu 가져오기 | 엑셀 드래그앤드롭/파일선택 일괄 가져오기 |

---

### 👩‍💼 직원 관리 (staff-app.js v3.1)

| 기능 | 설명 |
|---|---|
| 근태 기록 | 일별 근무 시간 입력, 달력 뷰 |
| 급여 정산 | 기본급/야간/주휴수당 분리 계산, Firebase 이력 저장 |
| 일괄 정산 | 전원 일괄 정산 + Excel 다운로드 |
| **⚡ 즉시 시급 계산기** | 직원 등록 없이 당일 즉시 정산 |

#### 즉시 시급 계산기 (v3.1 신규)

```
슬롯 시스템:
  · 여러 시간대 슬롯 추가/삭제
  · 슬롯별 시급 개별 지정 (없으면 기본 시급)
  · 1분 = 시급 ÷ 60 (원 단위 올림)

업무 유형별 차등 시급:
  · 일반 / 수업 뱃지 탭 한 번으로 토글
  · 슬롯별 개별 오버라이드 가능

결과:
  · 실시간 금액 패널 (슬롯별 내역 테이블)
  · 복사 / Web Share / 인쇄(PDF) / 직원 연결 저장
```

---

### 🏠 홈 대시보드 (dashboard-app.js v3)

> 로그인 후 첫 화면. 하단 네비게이션에는 없고, 헤더 로고 탭으로 복귀.

| 기능 | 설명 |
|---|---|
| 일정표 위젯 | ScheduleApp 미니 캘린더를 그대로 위임 렌더 — 방학/공휴일/일반일정 + 직원 급여일 + 공지 알림 + 오늘의 수업(우측 패널) 한 화면에 |
| 교재 학습 현황 요약 | 반/교재별 미수행 학생·챕터 수 요약, 탭하면 해당 학습현황(매트릭스) 화면으로 이동 |
| 즐겨찾기 필터 | 관심 반/교재만 골라보기 |
| 섹션 순서 변경 | 헤더 ≡ 버튼으로 드래그 재배치, 기기별 `hk10b_dashboardOrder`에 저장 |
| 오늘의 명언 | korean-advice-open-api에서 24시간 주기로 새 명언 수신, 오프라인 시 로컬 폴백 목록 사용 |
| 바로가기 | 학습현황(goMatrix) / 자료실 미리보기(goArchivePreview) / 영상 상세(goEduVideo) |
| 일괄 업데이트 요청 | 오늘 갱신이 필요한 교재를 모아 CustomEvent로 알림 요청 |

---

### 📅 일정관리 (schedule-app.js v5)

> 별도 하단 탭 없이 홈 대시보드 캘린더 위젯으로 통합 제공.

| 기능 | 설명 |
|---|---|
| 캘린더 표시 | 기간이 있는 일정(방학 등)은 색띠로 이어서 표시, 하루에 많으면 "+N" 요약 |
| 공휴일 자동 시딩 | 최초 1회만 대한민국 공휴일 자동 등록 (이후 자유롭게 수정/삭제 가능) |
| 날짜 상세 패널 | 캘린더 우측에 선택 날짜 상세 표시 (기본값 항상 "오늘") |
| 직원 근무기록 | 근무일에 색띠로 표시, "➕등록"으로 직원선택+시간 입력만으로 시급 자동 반영 빠른등록 |
| 반복 일정 | 반복 등록 + 특정 회차만 시리즈에서 해제 가능 |
| 알림 팝업 | 예약 시점 도래 시 자동 팝업, "나중에"(세션 한정 닫기)/"확인"(서버 기록) |
| 날씨 배경 | Open-Meteo 16일 예보 + Nominatim 역지오코딩으로 날짜 셀에 날씨 분위기 표시 (API 키 불필요) |

---

### 🔔 공지사항 (notice-app.js v1)

> 헤더 🔔 아이콘 — 전 페이지 공통으로 접근 가능한 독립 팝업 시스템.

| 기능 | 설명 |
|---|---|
| 예약 공지 등록 | 1회성(특정 날짜) 또는 매월 반복(특정 일자) 스케줄 |
| 자동 팝업 | 예약 시점 도래를 30초 주기로 감지해 자동 표시 |
| 완료 처리 | "✅ 완료 처리" → 서버 기록, 모든 기기에서 해당 회차 종료 |
| 나중에 보기 | "⏰ 나중에" → 이번 세션만 임시로 닫음, 다음 접속 시 재표시 |
| 대상 지정 | admin 전용 또는 전체(all) 공개 범위 지정 |
| 분류 | 교재비 / 수업료 / 일반 |

---

### 🗂 콘텐츠 (archive-app.js + edu-video-app.js + game-app.js)

> 하단 탭 "🗂 콘텐츠" 하나에 자료실·영상·게임 3개 도구가 탭으로 통합.

#### 🗂 자료실 (기본 탭)

| 기능 | 설명 |
|---|---|
| 파일 미리보기 | 이미지는 `<img>`, PDF는 `<iframe>`, 엑셀은 SheetJS로 표 변환해 직접 표시 |
| 다중 파일 첨부 | 게시물 하나에 여러 파일 첨부 가능 |
| 온라인 문서 링크 | OneDrive/구글시트 등 링크만 등록해 해당 서비스 뷰어로 열람 |
| 비밀번호/공개범위 | 게시물별 비밀번호 보호, 공개(public)/비공개(private) 설정 |
| HWP 변환 | `@rhwp/core`(esm.sh 동적 import)로 한글 문서 변환 |
| 엑셀 인라인 편집 | 미리보기 화면에서 셀 직접 수정 후 저장 |
| 일괄 다운로드 | 선택 자료/게시물 전체를 zip으로 다운로드 (JSZip) |
| 파일 스토리지 | Cloudflare Worker → R2/B2 (Firebase에는 메타데이터만 저장) |

#### 🎬 영상 워크시트 (edu-video-app.js)

| 기능 | 설명 |
|---|---|
| 유튜브 영상 등록 | 링크 붙여넣기 또는 YouTube Data API 검색/추천으로 등록 |
| 대본 기반 AI 단어 추출 | GeminiAI로 대본에서 단어+뜻+예문 추출 |
| 영상 기반 AI 단어 추출 | 대본 없이 영상 자체에서 바로 추출 |
| 워크시트 PDF | 추출 단어 + Unsplash 이미지 포함 학습지 PDF 생성 |
| 주제별 분류 | 여행/가구/학교 등 주제 태그, 즐겨찾기 핀 고정 |

#### 🎮 학습 게임 (game-app.js)

| 기능 | 설명 |
|---|---|
| 짝맞추기 | 단어-뜻 카드 매칭 게임 |
| 스펠링 | 철자 맞추기 게임 |
| 퀴즈 | 객관식 퀴즈 게임 |
| 소스 재사용 | EduVideo/자료실에서 이미 추출한 단어 파이프라인을 그대로 재활용 |
| 빔프로젝터 모드 | 전체화면 토글, 틀린 문제만 다시 풀기 |
| 인쇄용 워크시트 | 화면 게임과 별도로 인쇄용 PDF도 생성 가능 |
| 데이터 저장 없음 | 게임 자체는 저장하지 않고 그때그때 생성 (구조 단순화) |

---

## 7. 🤖 Gemini AI 코멘트 생성

> **파일** : `gemini-ai.js` v9.0 | **사용 위치** : 성적 관리 → 엑셀뷰

### API 키 폴백 구조

```
KEY_1 ──┐                     gemini-2.5-flash-lite (1순위)
KEY_2 ──┼─ 429/401 자동 전환 → gemini-2.5-flash      (2순위)
KEY_3 ──┘
```

### 기능 목록

| 함수 | 설명 |
|---|---|
| `generateComment()` | 학부모용 따뜻한 코멘트 1개 생성 |
| `generateVariants()` | 길이·강조점·표현이 다른 3버전 동시 생성 (JSON 배열 파싱) |
| `proofreadComment()` | 맞춤법·문법 교정 (원문 어조·존댓말 유지) |
| `analyzeStyle()` | 샘플 분석 → 선생님 문체 DNA 추출 후 캐시 저장 |
| `addPin()` / `addBookPin()` | 공용/교재별 고정 멘트 추가 (Firebase 동기화) |
| `loadPinsFromDB()` | 앱 시작 시 globalPins 로드 |

### 컨텍스트 구조

```
학생: [이름] ([성별])
단어 성취율: X%  /  리딩 성취율: X%
현재 교재: [교재명] (완결 시 ✓ + 다음 교재 안내)
선생님 메모: [메모]

[고정 멘트] — 반드시 자연스럽게 녹여 넣기
[이전 코멘트 최대 3개] — 어조 일관성 유지
[스타일 DNA 캐시] — analyzeStyle() 분석 결과
```

---

## 8. 🔒 히든 모니터링 시스템

> 정상 사용자에게 **완전히 숨겨진** 실시간 접속 추적·알림 시스템.  
> 비밀번호 `master` 입력 시 대시보드 활성화.

### 구성 파일

| 파일 | 역할 |
|---|---|
| `monitor-db.js` v5.2 | 세션 생성·갱신·액션 로그·IP 지오코딩, 🧹 원격 명령 채널(신규) |
| `monitor-app.js` v4.2 | 히든 대시보드 UI (전체 화면 오버레이) + 신규 모듈 MENU 라벨, 🧹 원격 캐시 삭제 버튼(신규) |
| `monitor-patch.js` v5.1 | 전 메뉴(신규 6종 포함) 함수 monkey-patch → 액션 자동 기록, 전수 재점검 보강 |
| `monitor-fcm.js` v1.0 | FCM 토큰 발급/관리 + 신규 접속 시 푸시 전송 |
| `firebase-messaging-sw.js` | FCM 백그라운드 수신 → OS 알림 표시 |
| `notify.js` v2.0 (서버리스) | FCM V1 API 호출 (서비스 계정 JWT) |

> ⚠️ **커버리지 주의**: 위 표의 "전 메뉴"는 monitor-patch.js v5.0 기준입니다.
> v4.0까지는 진도/관리/교재/성적만 실제로 추적되었고, 학생·직원은 페이지
> 이동만 기록될 뿐 상세 액션은 기록되지 않았습니다(문서와 구현 불일치).
> 일정관리·공지사항·학습게임·교육영상·자료실·홈 대시보드 6개 모듈은
> v5.0 이전까지 MENU 라벨·액션 추적 어디에도 없어 완전히 사각지대였습니다.

### 세션 추적 정보

```
uid / username / role
IP (api.ipify.org 직접 조회)
city / region / isp (ip-api.com 한국어 위치)
IP 라벨 (hakwon10/monitor/ip_labels)
device / browser / OS
startedAt / lastSeen / loggedOut
actions[] — 메뉴 이동, 진도 입력, xlsx 반영 등 최대 200건
```

### 대시보드 기능 (monitor-app.js)

| 기능 | 설명 |
|---|---|
| 세션 목록 | 온라인/최근/종료 세션 실시간 표시 |
| 이상 접속 플래그 | 심야(23~06시) / 중복 로그인 / 과다 액션 배지 자동 표시 |
| 브라우저 OS 알림 | 새 세션 감지 시 알림 (모니터링 탭에서만 발생) |
| 통계 대시보드 | 48h 집계: 총 접속·평균 사용시간·메뉴 점유율·사용자별 활동 |
| 메뉴 히트맵 | 요일×시간대 2D 그리드 (0~24h, 일~토) |
| IP 라벨 관리 | IP 대역에 장소명 지정 (예: "211.234.12" → "해피트리영어학원") |
| 세션 삭제 | `deleteOne()` — Firebase 기록만 삭제, 실제 사용자는 계속 이용 가능 (기존 README가 "강제 종료/로그아웃 처리"로 잘못 설명하고 있었음 — 실제로는 원격으로 로그아웃시키지 않음, 정정) |
| **🧹 원격 캐시 삭제 (v5.2 신규)** | 특정 세션에 원격 명령 전송 → 대상 브라우저의 Cache Storage·IndexedDB·쿠키·localStorage/sessionStorage 전부 삭제 + 새로고침. 아래 상세 설명 참고 |

### 추적 액션 범위 (monitor-patch.js v5.1)

> v5.1은 사용자 요청으로 v5.0에서 다룬 6개 신규 모듈의 전체 함수 목록을
> 다시 한번 전수 대조해 놓친 액션을 보강한 버전입니다. 아래 표는 v5.1 기준
> 최신 상태이며, 진행 중 발견한 버그 2건도 함께 수정했습니다(하단 참고).

| 메뉴 | 추적 항목 |
|---|---|
| 진도 | 진도 입력(반·교재·요일·값), SMS 전송, 그리드/리스트 전환, 달력 |
| 교재 | 탭 전환, 반·교재 선택, 공유, 리포트, 교재 추가·삭제·편집, xlsx 일괄 반영, 메모, 완결·복사, 예외 설정 |
| 성적 | 성적 저장, 리포트 생성, AI 코멘트, 캡처·공유 |
| 학생 | 상세 보기, 재원 상태 변경, 삭제, 정보 수정, 엑셀 가져오기, 학원비 계산기, **필터 변경**(v5.1) |
| 직원 | 상세/편집 열기, 저장·삭제, 근태 일괄 등록, 근무 기록 등록·삭제·**수정 시작**(v5.1), 급여 일괄 정산, 급여 엑셀 다운로드, 즉시 시급계산기 저장·공유, **등록폼 열기·급여탭 이동·근무 템플릿 추가·급여이력 열기·급여기록 삭제**(v5.1) |
| 일정 | 일정 저장·삭제, 근무기록 빠른등록, 반복 일정 해제, **"오늘의 수업"→학생상세 이동**(v5.1) |
| 공지 | 공지함 열기, 공지 저장·삭제·완료 처리 |
| 콘텐츠·자료실 | 하위 탭 전환, 업로드, 열람, 삭제, 수정, 공유, zip 다운로드, 엑셀 편집, 파일 변환, **업로드 폼 열기·분류 추가/삭제·즐겨찾기·인쇄·비밀번호 보호 자료 열람 시도**(v5.1) |
| 영상 | 영상 등록·삭제·상세보기, AI 단어 추출, 워크시트 PDF 생성, 공유, **주제 추가·AI 추천 검색·추천에서 등록·대본 수정·즐겨찾기**(v5.1) |
| 게임 | 게임 유형 선택, 시작, 워크시트 인쇄, **콘텐츠 소스 선택**(v5.1) |
| 홈 | 바로가기 이동(학습현황/자료실/영상), 섹션 순서 변경, 일괄 업데이트 요청, **즐겨찾기 필터·교재현황 날짜탭 이동**(v5.1) |

#### v5.1에서 발견·수정한 버그 2건

- `ArchiveApp._selectTool` 라벨 매핑에서 파일 탭 키를 `'library'`로 잘못
  가정했는데 실제 코드는 `'files'`를 씀 — 라벨이 안 붙고 원문 키로만
  표시되던 문제 수정
- `GameApp._selectSource` 라벨 매핑에 없는 값(`'manual'`)을 썼는데 실제
  값은 `'video'|'paste'|'words'` — 마찬가지로 라벨 누락 수정

### 🧹 원격 캐시 전체 삭제 흐름 (v5.2 신규)

> "상대방 PC의 사이트가 이상해져서 캐시를 지워 정상화해야 하는데, 원격 데스크톱
> 없이 직접 해주고 싶다"는 요청으로 추가된 기능. 별도 원격조종 프로그램 없이
> 진도사이트 자체에서 특정 세션의 브라우저 저장소를 초기화할 수 있다.

```
관리자: 모니터링 대시보드 → 세션 상세 → "🧹 원격 캐시 삭제" 클릭
→ MonitorDB.sendRemoteCommand(sessionId, 'clearAll')
→ Firebase hakwon10/monitor/sessions/{sessionId}/remoteCmd 기록

대상 PC (브라우저 탭이 열려 Firebase에 연결된 상태):
→ 자신의 세션 경로를 실시간으로 듣고 있던 리스너가 명령 감지
→ Service Worker 해제 → Cache Storage 전체 삭제 → IndexedDB 전체 삭제
→ 쿠키 삭제 → localStorage/sessionStorage 전체 삭제
→ 새로고침(캐시 무효화 쿼리 파라미터 포함)
```

**제약 사항**

- FCM 푸시가 아니라 Firebase 실시간 리스너 기반이라, **대상 탭이 지금 열려서
  Firebase에 연결돼 있어야 즉시 반영**됩니다. 탭이 완전히 닫혀 있으면 다음에
  그 탭을 다시 열 때 반영됩니다 (닫힌 브라우저를 강제로 깨우는 방식은 아님).
- 일반 사용자 기기는 FCM 토큰을 등록하지 않으므로(토큰은 모니터링 창을 연
  관리자 기기에만 등록됨) 지금 구조로는 푸시로 깨우는 방식 자체가 불가능함 —
  향후 필요하면 일반 로그인 시에도 FCM 토큰을 등록하도록 확장해야 함(알림
  권한 요청 UX가 추가로 필요).
- 초기화 대상에 **로그인 세션도 포함**되므로, 실행되면 그 기기는 재로그인이
  필요해집니다. "완전 초기화"가 목적이라 의도된 동작입니다.

### FCM 푸시 흐름

```
모니터링 탭 열기
→ MonitorFCM.register()
→ Firebase Messaging 토큰 발급 (VAPID 키)
→ hakwon10/monitor/fcm_tokens/{deviceId} 저장

신규 사용자 로그인
→ MonitorDB.startSession() → Firebase 세션 저장
→ MonitorApp 새 세션 감지
→ /api/notify 호출 (저장된 토큰 목록 전체)
→ notify.js: 서비스 계정 JWT → OAuth2 토큰 → FCM V1 API
→ 관리자 기기 OS 알림 (앱 닫혀 있어도 Service Worker 수신)
```

---

## 9. 🎭 게스트 데모 모드

> **파일** : `guest-mode.js` v3.1  
> 비로그인 게스트 계정으로 앱 체험 시 자동 실행되는 나레이션 투어.
> 게스트 로그인 시 가상 **admin 세션**이 부여되어(role:'admin'), 메뉴 권한과
> 무관하게 전 화면에 접근할 수 있습니다 — 그만큼 Write 차단이 중요합니다.

### 기능

| 항목 | 설명 |
|---|---|
| SVG 마스크 스포트라이트 | 특정 UI 요소 구멍 뚫기 → 해당 영역만 선명하게 강조 |
| 말풍선 라벨 | 하이라이트 영역 옆에 설명 말풍선 + 펄스 링 애니메이션 |
| 나레이션 텍스트 | `<b>` 태그 지원, 타이핑 효과 |
| SVG 다이어그램 | 스텝 내 구조 설명 인라인 다이어그램 |
| 스텝 내비게이션 | 이전 / 다음 / 다시 보기 버튼 |
| 탭 자동 전환 | 스텝 진입 시 `action` 콜백으로 메뉴 탭 자동 이동 |
| 입력 완전 차단 | 게스트 모드 중 모든 입력 블록 + 안내 토스트 |

### 나레이션 페이지

- 📅 수업 진도 화면 (operate)
- ⚙️ 관리 화면 (manage) — 반·계정·테마 탭 포함
- 📖 교재 학습 관리 (booklib)
- 📝 성적 관리 (grade)
- 👨‍🎓 학생 관리 (students)
- 👩‍💼 직원 관리 (staff)
- 🏠 홈 대시보드 (dashboard) — **v3.1 신규**: 일정 위젯·교재현황 요약·섹션순서·오늘의 명언 소개
- 🗂 콘텐츠 (archive) — **v3.1 신규**: 자료실·🎬영상 워크시트·🎮학습 게임 3탭을 순서대로 소개 (`_selectTool` action으로 탭 자동 전환)

> ℹ️ 일정관리·공지사항은 별도 페이지가 아니라 홈/헤더에 내장된 기능이라
> 독립된 나레이션 페이지를 두지 않았습니다(홈 나레이션에서 함께 소개).

### 🔒 v3.1 보안 수정: Write 차단 범위 누락

기존 `_patchModules()`는 `StudentDB/StaffDB/GradeDB/BookLibDB` 4개 모듈만
화이트리스트에 넣어 쓰기 함수를 no-op으로 막고 있었습니다. **일정·공지·
자료실·교육영상 4개 신규 DB 모듈(ScheduleDB/NoticeDB/ArchiveDB/EduVideoDB)이
이 목록에서 빠져 있어서, 게스트 세션에서도 이 영역들은 실제 Firebase에 쓰기가
가능한 상태**였습니다(다른 4개 모듈만 안전하게 보호되고 있었음). 목록에 추가해서
동일한 수준으로 차단되도록 수정했습니다.

---

## 10. 주요 LocalStorage 키

### 앱 전반

| 키 | 내용 |
|---|---|
| `hk10b_nav_order` | 하단 탭 순서 (pg 배열) |
| `hk10b_rem_id` / `hk10b_rem_pw` | 아이디·비밀번호 기억하기 |
| `hk10b_cls` | 반 목록 캐시 |
| `hk10b_prog` | 진도 캐시 |
| `hk10b_acc` | 계정 캐시 |
| `hk10b_theme` | 테마 캐시 |
| `hk10b_sess` | 로그인 세션 |
| `hk_fcm_did` | FCM 디바이스 고유 ID |

### 교재 관리

| 키 | 내용 |
|---|---|
| `bl_ch_w` | 챕터명 열 너비 (px) |
| `bl_pf_{classId}_{bookId}` | 후처리 필터 데이터 |

### 성적 관리

| 키 | 내용 |
|---|---|
| `gr_layout` | 리포트 레이아웃 (1~5) |
| `gr_pageSize` | 페이지 크기 |
| `gr_rptScale` | 배율 (60~150) |
| `gr_fontFamily` | 본문 폰트 |
| `gr_reportBold` | Bold 강조 |
| `gr_rptBg` | 배경색 |
| `gr_titleSz` / `gr_bodySz` | 제목·본문 크기 |
| `gr_hdrFontSz` / `gr_excelFontSz` / `gr_cardFontSz` | 뷰별 폰트 크기 |
| `gr_graph` / `gr_graphStyle` / `gr_graphAlign` | 그래프 설정 |
| `gr_logoSz` / `gr_titleAlign` | 로고·제목 정렬 |
| `gr_tblHdrBg` / `gr_tblHdrClr` / `gr_tblCellBg` / `gr_tblRound` | 표 색상 |
| `gr_divClr` / `gr_divW` | 구분선 |
| `gr_ov_horiz` / `gr_ov_bg` / `gr_ov_font` / `gr_ov_bold` | Overview 설정 |

### Gemini AI

| 키 | 내용 |
|---|---|
| `ht_style_samples` | 코멘트 스타일 샘플 (최대 20개) |
| `ht_style_pins` | 공용 고정 멘트 (Firebase globalPins 동기화) |
| `ht_style_analysis` | 스타일 분석 캐시 |
| `ht_style_pins:{bookId}` | 교재별 고정 멘트 |

### 홈 대시보드 / 일정 / 공지 / 콘텐츠 (신규)

| 키 | 내용 |
|---|---|
| `hk10b_dashboardOrder` | 홈 대시보드 섹션 순서 (기기별) |
| `db_live_quote` | 오늘의 명언 캐시 (24h) |
| `hk10b_schedules` | 일정 로컬 캐시 |
| `sch_weather_cache_v4` | 날씨 예보 캐시 (위치명 포함) |
| `sch_dismiss_{scheduleId}` (sessionStorage) | 일정 알림 팝업 "나중에" 임시 닫기 |
| `hk10b_notices` | 공지 로컬 캐시 |
| 공지 알림 dismiss 키 (sessionStorage) | 공지 팝업 "나중에" 임시 닫기 |
| `hk10b_archive` | 자료실 게시물 로컬 캐시 |
| `hk10b_archiveCategories` | 자료실 분류 목록 캐시 |
| `hk10b_archiveViewMode` | 자료실 보기 모드(그리드/리스트 등) |
| `hk10b_eduvideo` | 교육 영상 로컬 캐시 |
| `hk10b_eduvideo_topics` | 교육 영상 주제 목록 캐시 |
| `hk10b_staff_home` | 직원 관리 화면 시작 탭 설정 |

---

## 11. 권한 체계

```
┌──────────────────────────────────────────────────────────────────┐
│  역할        접근 가능 메뉴                                       │
├──────────────────────────────────────────────────────────────────┤
│  admin       진도·관리·교재·성적·학생·직원·홈·콘텐츠 (전체)      │
│  operator    진도·관리(반 관리 제외) + allowedMenus 등록 메뉴     │
│  teacher     진도 (담당 반만) + allowedMenus 등록 메뉴            │
│              ※ 담당 반 데이터에 한해서만 접근                     │
│  master      (비밀번호) 히든 모니터링 대시보드 전용               │
│  guest       진도 읽기 전용 + 게스트 데모 나레이션               │
└──────────────────────────────────────────────────────────────────┘

자동 로그아웃: 3시간 미사용 시
세션 저장:     localStorage (ID·PW remember me 체크 시)
```

> ⚠️ **정정**: 기존 문서는 "allowedMenus로 교재/성적만 추가 권한 부여 가능"이라고
> 설명했지만, 실제 `app.js`의 `go()` 함수를 확인한 결과 admin이 아닌 계정
> (operator/teacher)은 **booklib·grade·students·staff·dashboard·archive 6개
> 메뉴 전부**가 `accounts/{id}.allowedMenus[]` 등록 여부로 게이트되고 있습니다.
> 즉 "학생/직원/홈/콘텐츠 메뉴도 강사·운용자 계정에 개별적으로 열어줄 수 있다"는
> 뜻이라 기존 설명보다 실제 권한 체계가 더 유연합니다. manage(관리) 메뉴만
> teacher에게는 항상 차단되고(자동으로 operate로 리다이렉트), operate 자체는
> 로그인만 하면 누구나 접근 가능합니다.

#### 메뉴별 게이트 로직 요약 (app.js `go()` 기준)

| 메뉴 | admin | 비admin(operator/teacher) |
|---|---|---|
| operate(진도) | 항상 허용 | 항상 허용 |
| manage(관리) | 항상 허용 | teacher는 강제로 operate로 리다이렉트, operator는 허용 |
| manage 내 반 추가·수정·교재풀 관리 | 항상 허용 | **operator도 허용 (2026-08 변경)**, teacher는 manage 자체가 막혀 있어 접근 불가 |
| manage 내 반 삭제·교재복사·수업료 일괄편집·엑셀추출 | 항상 허용 | admin/manager 전용 유지 (operator도 불가) |
| dashboard(홈) | 항상 허용 | `allowedMenus`에 `dashboard` 있어야 함 (없으면 canOperate 시 operate로, 아니면 로그인 요구) |
| archive(콘텐츠) | 항상 허용 | canOperate 필요 + `allowedMenus`에 `archive` 있어야 함 |
| students(학생) | 항상 허용 | `allowedMenus`에 `students` 있어야 함 |
| staff(직원) | 항상 허용 | `allowedMenus`에 `staff` 있어야 함 |
| booklib(교재) | 항상 허용 | `allowedMenus`에 `booklib` 있어야 함 |
| grade(성적) | 항상 허용 | `allowedMenus`에 `grade` 있어야 함 |

> 일정(schedule)·공지(notice)는 별도 페이지가 아니라 홈/헤더에 내장되어 있어
> 이 게이트 목록에 없습니다 — 홈 대시보드 접근 권한을 따라갑니다.

---

## 12. Vercel 서버리스 API

### `/api/notify` (notify.js v2.0)

FCM V1 API 푸시 전송. 서비스 계정 JSON → JWT → OAuth2 → FCM.

```
환경변수: FCM_SERVICE_ACCOUNT = Firebase 서비스 계정 JSON 전체
요청: POST { token, title, body, data }
응답: { success: true } | { error: "..." }
```

### `/api/geoip` (geoip.js)

ip-api.com HTTP 혼합 콘텐츠 우회 프록시.

```
요청: GET /api/geoip?ip=xxx.xxx.xxx.xxx
응답: { ip, city, region, country, isp }
```

### CSP 화이트리스트 (vercel.json)

> ⚠️ 기존 문서는 6개 도메인만 기재되어 있었지만, 실제 `vercel.json`의
> `connect-src`에는 최근 추가된 기능들의 API 도메인이 다수 더 등록돼 있습니다.
> 아래는 실제 파일 내용 기준 전체 목록입니다.

```
script-src:
  www.gstatic.com, cdnjs.cloudflare.com, apis.google.com, esm.sh
  (+ 'unsafe-inline' 'unsafe-eval' — 기존 코드 구조상 필요)

connect-src:
  api.ipify.org                       클라이언트 실IP 조회 (모니터링)
  ip-api.com (https/http)             geoip 프록시 대상 (모니터링)
  *.firebaseio.com, wss://*.firebaseio.com   Firebase RTDB
  firebaseinstallations.googleapis.com / firebase.googleapis.com
  www.googleapis.com                  YouTube Data API
  firestore.googleapis.com
  fcm.googleapis.com                  FCM 푸시
  generativelanguage.googleapis.com   Gemini AI
  identitytoolkit.googleapis.com      Firebase Auth
  esm.sh                              동적 import (@rhwp/core, HWP 변환)
  cdnjs.cloudflare.com                라이브러리 CDN
  api.unsplash.com / images.unsplash.com   배경·워크시트 이미지
  api.open-meteo.com                  일정표 날씨 예보
  nominatim.openstreetmap.org         일정표 역지오코딩(위치명)
  *.workers.dev                       자료실 업로드용 Cloudflare Worker
  *.backblazeb2.com                   자료실 파일 저장소(B2)
  korean-advice-open-api.vercel.app   홈 대시보드 오늘의 명언

frame-src:
  view.officeapps.live.com, docs.google.com, onedrive.live.com,
  *.sharepoint.com, www.youtube.com, *.workers.dev
```

---

## 13. 최근 주요 변경 이력

### 🛠 app.js — 교재 추가·삭제 시 자동 스크롤 이동 버그 수정

"반 목록 위쪽 반에서 교재를 추가·삭제하면 화면이 아래로 자동 스크롤돼서
다시 그 반으로 스크롤해 와야 한다"는 제보로 원인 확인. 반 하나의 교재를
추가/삭제/이동해도 Firebase `classes` 리스너가 **화면의 모든 반 카드를
통째로 다시 그리는** 구조라, `_buildPoolZone`의 "추가 직후 포커스"용
`setTimeout(()=>inp.focus(),100)`이 다시 그려지는 **모든 카드마다** 실행되고
있었음. 여러 개의 `focus()` 호출 중 마지막에 실행된 것(주로 목록 마지막
반)이 브라우저에서 실제 포커스를 가져가면서, 포커스된 입력창을 화면에
보이게 하려는 브라우저 기본 동작 때문에 그 반 위치로 스크롤이 이동한 것.

- 방금 실제로 교재를 추가하려던 반(class)만 추적해서, 그 반의 입력창일
  때만 재포커스하도록 수정 (`_lastPoolFocusCls` 추적 변수 추가)
- 모든 프로그래밍적 `focus()` 호출에 `{preventScroll:true}` 옵션을 추가해,
  설령 다른 반의 입력창이 포커스되더라도 화면이 그쪽으로 스크롤되지
  않도록 이중 안전장치 적용

### 🛠 app.js — 운용자 권한 확장 + 교재풀 삭제버튼 버그 수정

- **운용자(operator) 권한 확장**: 관리 화면의 반 관리에서 그동안 admin/manager만
  할 수 있던 "반 추가·수정"과 교재풀(주교재/부교재/목록) 추가·이동·삭제를
  operator 역할에도 개방함. 사용자 요청 시 "반 삭제·교재복사·수업료 일괄편집·
  엑셀추출은 admin/manager 전용으로 유지"를 명시적으로 선택해, 이 4개
  기능만 그대로 admin/manager 전용으로 남겨둠. `_renderMgCls`/
  `_buildClsCard`에 `canManageCls`(admin 또는 operator) 판정을 추가하고,
  `isAdminStrict`(진짜 admin/manager)로 민감한 동작만 별도 체크하도록 분리.
- **후속 수정 — '반' 탭 자체가 숨겨져 있던 문제**: 위 권한을 열어준 뒤에도
  실제 운용자 화면 스크린샷을 확인해보니 "반" 탭 자체가 안 보였음. 원인은
  `_renderManage()`가 탭 배열의 **0번(반)과 1번(계정) 인덱스를 함께 묶어서**
  admin이 아니면 통째로 `display:none` 처리하고 있었기 때문 — 카드 내부
  버튼 권한을 열어준 것과 별개로, 탭 자체가 렌더링 단계에서 막혀 있었음.
  '반' 탭(index 0)은 `canManageCls` 기준으로, '계정' 탭(index 1)만
  `isAdmin` 기준으로 분리해서 이제 operator도 '반' 탭이 정상적으로 보임.
  (부수 수정: 관리 화면 상단의 로그인 표시가 admin 아니면 무조건 "운용자"로
  뭉뚱그려 표시되던 것도 역할별 라벨로 정확히 표시되게 수정)
- **교재풀 삭제(✕) 버튼 무반응 버그 수정**: "교재를 추가한 뒤 ✕ 버튼을
  눌러도 반응이 없고 전체삭제만 동작한다"는 제보로 원인 확인. 교재풀
  아이템(`.bm-pool-item`)이 PC 드래그 기능 때문에 `draggable=true`로
  설정돼 있는데, 그 안에 중첩된 ✕/主/副 버튼을 클릭하면 브라우저가 이를
  클릭이 아니라 드래그 시작으로 인식해버려 클릭 이벤트가 씹히는 문제였음
  (전체삭제 버튼은 draggable 영역 밖에 있어 정상 동작했던 것).
  `_setupPCDrag`/`_setupLongPressDrag`의 드래그 시작 지점이 버튼
  (`.bm-pool-btn`, `.bm-back-btn`) 위일 때는 드래그를 취소하도록 수정.

### 🧹 원격 캐시 전체 삭제 기능 (monitor-db.js v5.2 / monitor-app.js v4.2)

원격 데스크톱 프로그램 없이도, 모니터링 대시보드에서 특정 세션에 "브라우저
캐시·저장소를 전부 지우고 새로고침"하도록 원격 명령을 보낼 수 있는 기능을
신규 추가함. Firebase 실시간 리스너 기반이라 대상 탭이 열려 연결된 상태여야
즉시 반영되며(FCM 푸시 아님), Cache Storage·IndexedDB·쿠키·localStorage/
sessionStorage를 전부 삭제하므로 로그인 세션도 함께 초기화됨(재로그인 필요).
세션 상세 패널(PC/모바일)에 "🧹 원격 캐시 삭제" 버튼으로 노출.

부수적으로, 기존 README가 "세션 강제 종료 = 개별 세션 로그아웃 처리"라고
설명하던 부분이 실제로는 Firebase 기록만 지우는 `deleteOne()`이라 실사용자를
강제로 로그아웃시키지 않는다는 점을 확인해 문서를 정정함.

### 🔁 재점검: 모니터링 v5.1 + 게스트모드 v3.1 (2026-08, 2차)

사용자가 GitHub 재동기화 후 "콘텐츠 부분이 빠져 있다"고 재확인을 요청하여
1차 패치(v5.0)에서 다룬 6개 신규 모듈의 **전체 public 함수 목록을 처음부터
다시 전수 대조**함. dev/main 브랜치 커밋은 1차 점검 때와 동일했음(별도 신규
커밋 없음) — 즉 코드가 바뀐 게 아니라 1차 점검 자체가 완전하지 않았던 것.

- **monitor-patch.js v5.0 → v5.1**: 자료실(분류관리·즐겨찾기·인쇄·비밀번호
  검증)·영상(주제추가·AI추천검색·대본수정·즐겨찾기)·게임(소스선택)·일정
  (학생상세 이동)·홈(즐겨찾기필터·날짜탭)·직원(등록폼·급여탭이동·근무수정·
  템플릿·급여이력)·학생(필터변경) 총 23개 액션 추가 (110개 → 133개 wrap)
- **버그 2건 수정**: `ArchiveApp._selectTool` 라벨이 실제 키(`'files'`)가
  아닌 잘못된 키(`'library'`)를 참조해 라벨이 안 붙던 문제, `GameApp.
  _selectSource` 라벨에 존재하지 않는 값(`'manual'`)을 매핑해두던 문제
- **guest-mode.js v3.0 → v3.1**: 🏠 홈 대시보드, 🗂 콘텐츠(자료실/영상/게임)
  나레이션 신규 작성 — 실제 렌더링된 DOM 클래스명을 코드에서 직접 확인 후
  하이라이트 셀렉터 작성(추측 금지 원칙 적용)
- **🔒 보안 수정(guest-mode.js)**: Write 차단 화이트리스트
  (`_patchModules`)에 ScheduleDB/NoticeDB/ArchiveDB/EduVideoDB가 빠져있어
  게스트 데모 세션에서도 이 4개 모듈은 실제 Firebase에 쓰기가 가능한
  상태였음 — 목록에 추가해 차단

### 📝 README 전체 소스 대조 감사 (2026-08)

- dev 브랜치 전체 파일을 직접 열어 문서-코드 불일치를 점검하고 반영함.
- **누락된 파일/모듈 문서화**: schedule-app/db.js, notice-app/db.js,
  archive-app/db.js, edu-video-app/db.js, game-app.js, dashboard-app.js,
  bg-theme.js, nanum-gothic-base64.js — 8개 파일이 섹션 3·4·6에서
  통째로 빠져 있었음
- **Firebase 경로 보강**: schedules/, notices/, archive/, archiveCategories/,
  eduVideos/, eduVideoTopics/, theme/bg 추가
- **권한 체계 정정**: "allowedMenus는 교재/성적에만 적용"이라던 기존 설명이
  틀렸음 — 실제로는 students/staff/dashboard/archive까지 6개 메뉴 모두
  allowedMenus로 게이트됨을 `app.js go()` 확인 후 반영
- **게스트 데모 나레이션 목록 정정**: students·staff 화면도 이미 나레이션이
  있었는데 문서에서 누락돼 있었음
- **CSP 화이트리스트 보강**: vercel.json 기준 실제로는 6개가 아니라
  YouTube/Unsplash/Open-Meteo/Nominatim/Workers/B2/명언API 등 다수 도메인이
  더 등록되어 있었음
- **api/ 폴더 구조 정정**: notify.js·geoip.js가 루트가 아니라 `api/` 하위에
  있음을 반영
- **보안 참고사항 신규 추가**: Gemini API 키 3개, YouTube API 키, Unsplash
  키, Cloudflare Worker 업로드(+삭제) 토큰이 클라이언트 소스에 하드코딩되어
  공개 저장소로 노출되고 있는 상태를 확인 — 섹션 2 하단에 위험도별로 정리.
  즉시 장애 요인은 아니지만 운영자 판단이 필요해 별도 표시함

### 🔍 모니터링 커버리지 확대 (monitor-app.js v4.1 / monitor-patch.js v5.0)

- **배경**: dev 브랜치에 일정관리(schedule-app.js)·공지사항(notice-app.js)·
  학습게임(game-app.js)·교육영상(edu-video-app.js)·자료실(archive-app.js)·
  홈 대시보드(dashboard-app.js) 6개 모듈이 추가되었지만, 히든 모니터링
  시스템에는 전혀 반영되어 있지 않았음(MENU 라벨 없음, 액션 추적 없음).
  또한 README가 설명하던 "학생/직원 상세 액션 추적"도 실제 코드에는
  구현되어 있지 않았음.
- **monitor-app.js v4.1** — MENU 라벨에 dashboard/archive/schedule/notice/
  game/video 6개 추가
- **monitor-patch.js v5.0**
  - ScheduleApp / NoticeApp / GameApp / EduVideoApp / ArchiveApp /
    DashboardApp 신규 액션 추적 추가
  - StudentApp / StaffApp 상세 액션 추적을 실제로 구현 (기존엔 페이지
    이동만 기록)
  - 버그 수정: `_stuName()` 헬퍼가 존재하지 않는 `StudentDB.getStudents()`를
    호출해 항상 raw ID만 표시되던 문제 수정 (→ `StudentDB.getAll()`).
    booklib/grade 로그의 학생 이름 표시에도 영향을 주던 버그.
  - 구 `_watchStudentEvents`/`_watchStaffEvents`의 DOM 셀렉터 기반 추적
    (`.st-name`, `[data-status]`, `.sf-name` 등)이 실제 마크업과 달라
    항상 무동작이었던 부분을 함수 직접 후킹(`_wrap`) 방식으로 교체

### 🆕 히든 모니터링 시스템 (신규)

- **monitor-db.js v5.0** — IP 지오코딩 (ipify + ip-api.com), IP 라벨 관리
- **monitor-app.js v4.0** — OS 알림, 이상 접속 플래그, 통계 대시보드, 히트맵
- **monitor-patch.js v4.0** — 전 메뉴 완전 추적 (진도/교재/성적/학생/직원)
- **monitor-fcm.js v1.0** — FCM 토큰 발급·저장·30일 TTL, 신규 접속 푸시
- **firebase-messaging-sw.js** — FCM 백그라운드 Service Worker
- **notify.js v2.0** — Legacy API → FCM V1 API (서비스 계정 JWT)

### 🆕 게스트 데모 모드 (신규)

- **guest-mode.js v3.0** — SVG 마스크 스포트라이트, 이전 버튼, 다시 보기, 탭 자동 전환

### 🆕 Gemini AI 통합 (신규)

- 다중 키(3개) + 다중 모델(flash-lite → flash) 폴백
- 스타일 DNA 학습 (샘플 20개), 공용 고정 멘트 Firebase 동기화
- 3버전 동시 생성, 문법 교정, 스타일 분석 캐시

### firebase-config.js v10

- `_scheduleRetry()` 구조적 버그 수정 (절대 호출 안 되던 dead code)
- 오프라인 배너 8초 디바운스 (일시적 끊김 오탐 방지)
- `keepSynced(true)` classes/accounts 경로
- `set()` / `update()` 성공/실패 boolean 반환으로 통일

### db.js v10b

- **반 편성 기간** (termStart/termEnd) 지원 — 동명 반 기간별 독립 데이터
- `getActiveClasses()` / `getClassesForMonth(mk)` / `terminateClass()`
- progress 쓰기 보호: `_pendingKeys` Set — Firebase 리스너 덮어쓰기 방지
- Firebase 재연결 후 자동 데이터 재로드 (`_scheduleRetryLoad`)
- 타임아웃 5초 → 15초 (초기 재연결 대기 충분히 확보)

### app.js v10d

- **수업료/교재비 일괄 편집 패널** (`openFeePanel`) — 카드 UI, 개별·전체 저장, 엑셀
- **성적 리포트 공유 링크** — `?rpt=id` → Firebase HTML 직접 렌더
- **반 편성 기간** 기반 mgMk 달력 이동으로 과거 편성 조회
- 교재명 더블클릭 인라인 수정
- 공유 뷰 주차 이동 제거 (공유 전용 읽기 뷰 명확화)

### staff-app.js v3.1

- **⚡ 즉시 시급 계산기** — 슬롯 시스템, 업무 유형별 차등 시급, 결과 공유

### vercel.json

- `api.ipify.org` / `ip-api.com` CSP connect-src 추가
- `/firebase-messaging-sw.js` Service-Worker-Allowed 헤더 추가

---

## 14. 개발 참고사항

### 새 채팅에서 빠른 파악 포인트

```
01. Firebase 경로  : hakwon10/ 하위 구조 (monitor/, sharedReports/ 신규)
02. 반 편성 기간   : termEnd=null → 현재 운용, getActiveClasses() 사용
03. 예외 설정      : exempts/{classId}/{bookId}/{학생명} 중첩 구조
04. 성적 데이터    : grades/{classId}/{studentId}/{bookId}/{recordId}
05. xlsx 매칭      : _normStr() → 공백·_·- 제거 후 소문자 비교
06. 캡처 순서      : _waitFonts() → _captureEl() (transform 임시 해제)
07. 설정 영속      : _st 초기화 시 localStorage에서 모두 읽음
08. 탭 순서        : localStorage('hk10b_nav_order') → _renderNav()
09. 반 Overview   : classId 있고 bookId 없을 때 _renderOverview() 호출
10. Gemini AI     : GeminiAI.generateComment(studentInfo, bookStatus, opts)
                   opts.activePins[] / opts.prevComments[]
11. AI 키 추가    : gemini-ai.js KEYS 배열에 추가 (자동 폴백)
12. 모니터링 진입  : 비밀번호 'master' 입력 (일반 로그인과 별개)
13. FCM 디버그    : MonitorFCM.register() → 콘솔 [MonitorFCM] 로그 확인
14. 공유 링크     : ?share=classId (진도 공유), ?rpt=id (성적 리포트)
15. progress 보호 : _pendingKeys Set — Firebase 리스너보다 로컬 입력 우선
```

### 스크립트 로딩 순서 (index.html)

```
firebase-config.js   FireDB 모듈 (가장 먼저)
logo.js              SVG 로고
db.js                반·계정·진도·테마 DB
students-db.js / students-app.js
booklib-db.js / booklib-app.js
staff-db.js / staff-app.js
gemini-ai.js         AI 모듈 (grade-app 전에 필수)
grade-db.js / grade-app.js
app.js               메인 앱 (DOMContentLoaded 후 init)
monitor-fcm.js       FCM (app.js 이후)
monitor-db.js
monitor-app.js
monitor-patch.js     monkey-patch (모든 모듈 로드 후 마지막)
guest-mode.js        게스트 데모
```

### Firebase 주요 주의사항

```
· .info/connected 초기값은 false — 4초 억제 + 8초 디바운스로 오탐 방지
· progress 날짜 키: Firebase 저장 시 언더스코어(_), JS는 하이픈(-) — 정규화 필수
· set()/update() 반환값: v10부터 성공=true, 실패=false (이전엔 undefined)
· 대용량 JS 파일(300KB+): GitHub 웹 에디터 붙여넣기 시 절삭됨 → 파일 업로드 사용
· keepSynced(true): classes/accounts 경로만 적용 (과도한 캐시 방지)
· pending 보호: autoSave() → _pendingKeys.add(key) → 쓰기 완료 후 delete
```

---

*최종 업데이트: 2026년 8월 (모니터링 v5.1 재점검 + 게스트모드 v3.1 업그레이드 + 전체 소스 대조 문서 감사)*
