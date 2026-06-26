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
| **🔒 모니터링** | 히든 실시간 접속 추적, FCM 푸시 알림, 통계 대시보드 |
| **🎭 게스트 데모** | 나레이션 스포트라이트 투어 (비로그인 체험용) |

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
| **xlsx** | SheetJS (XLSX.js v0.18.5) |
| **캡처** | html2canvas v1.4.1 |
| **지오코딩** | api.ipify.org + ip-api.com (Vercel `/api/geoip` 프록시) |
| **폰트** | Google Fonts — Noto Sans KR, IBM Plex Sans KR, Nanum Gothic, Nanum Myeongjo |

---

## 3. 전체 구조 흐름도

```
┌──────────────────────────────────────────────────────────────────┐
│                      index.html (PWA Shell)                       │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │ 하단 네비게이션 (권한+순서 동적 렌더 / localStorage 저장) │    │
│  │ [📅진도] [⚙️관리] [📖교재] [📝성적] [👨‍🎓학생] [👩‍💼직원]   │    │
│  └──────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
         │         │          │          │          │
         ▼         ▼          ▼          ▼          ▼
      app.js  booklib-app  grade-app  students-app  staff-app
   (진도·관리)  (교재관리)  (성적관리)  (학생관리)   (직원·급여)
         │         │          │    ↑AI
         ▼         ▼          ▼   │
       db.js  booklib-db  grade-db  gemini-ai.js
   (반·계정·테마) (교재·챕터) (성적·설정) (Gemini API)
         │         │          │
         └─────────┴──────────┘
                   │
                   ▼
         Firebase Realtime DB
           hakwon10/
           ├── classes/        반 목록 (termStart/termEnd 기간 관리)
           ├── accounts/       계정 목록
           ├── theme/          테마·설정
           ├── progress/       주간 진도 + 메모
           ├── bookdata/       교재 정보·챕터
           ├── bookcheck/      수행 체크 데이터
           ├── bookstamps/     진도 스탬프
           ├── memos/          학생 메모
           ├── exempts/        면제 설정
           ├── grades/         성적 데이터
           ├── globalPins/     AI 공용 고정 멘트
           ├── sharedReports/  성적 리포트 공유 HTML 임시 저장
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
├── guest-mode.js       v3.0  게스트 나레이션 데모 시스템
│                           · SVG 마스크 스포트라이트 + 말풍선
│                           · 이전/다음/다시보기 스텝 내비게이션
│                           · 탭·서브메뉴 자동 전환 (action 콜백)
│
├── vercel.json               CSP 헤더 + SW 헤더 설정
├── package.json              Vercel 서버리스 함수용
├── notify.js           v2.0  /api/notify — FCM V1 푸시 전송
│                           · 서비스 계정 JWT → Google OAuth2 토큰
│                           · Node.js 내장 crypto만 사용 (npm 불필요)
└── geoip.js                  /api/geoip — IP → 위치 조회 프록시
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
└── monitor/
    ├── sessions/{sessionId}
    │   ├── uid / username / role
    │   ├── ip / city / region / isp
    │   ├── device / browser / os
    │   ├── startedAt / lastSeen / loggedOut
    │   └── actions[]     메뉴·액션 로그 (최대 200건)
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
| `monitor-db.js` v5.0 | 세션 생성·갱신·액션 로그·IP 지오코딩 |
| `monitor-app.js` v4.0 | 히든 대시보드 UI (전체 화면 오버레이) |
| `monitor-patch.js` v4.0 | 전 메뉴 함수 monkey-patch → 액션 자동 기록 |
| `monitor-fcm.js` v1.0 | FCM 토큰 발급/관리 + 신규 접속 시 푸시 전송 |
| `firebase-messaging-sw.js` | FCM 백그라운드 수신 → OS 알림 표시 |
| `notify.js` v2.0 (서버리스) | FCM V1 API 호출 (서비스 계정 JWT) |

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
| 세션 강제 종료 | 개별 세션 로그아웃 처리 |

### 추적 액션 범위 (monitor-patch.js v4.0)

| 메뉴 | 추적 항목 |
|---|---|
| 진도 | 진도 입력(반·교재·요일·값), SMS 전송, 그리드/리스트 전환, 달력 |
| 교재 | 탭 전환, 반·교재 선택, 공유, 리포트, 교재 추가·삭제·편집, xlsx 일괄 반영, 메모, 완결·복사, 예외 설정 |
| 성적 | 성적 저장, 리포트 생성, AI 코멘트, 캡처·공유 |
| 학생 | 학생 상세 보기, 재원 상태 변경 |
| 직원 | 근태 입력, 급여 정산 |

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

> **파일** : `guest-mode.js` v3.0  
> 비로그인 게스트 계정으로 앱 체험 시 자동 실행되는 나레이션 투어.

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

---

## 11. 권한 체계

```
┌──────────────────────────────────────────────────────────────────┐
│  역할        접근 가능 메뉴                                       │
├──────────────────────────────────────────────────────────────────┤
│  admin       진도·관리·교재·성적·학생·직원 (전체)                │
│  operator    진도·관리 (반 관리 제외)                             │
│  teacher     진도 (담당 반만)                                     │
│              + allowedMenus에 등록된 메뉴 (교재/성적)            │
│              ※ 담당 반 데이터에 한해서만 접근                     │
│  master      (비밀번호) 히든 모니터링 대시보드 전용               │
│  guest       진도 읽기 전용 + 게스트 데모 나레이션               │
└──────────────────────────────────────────────────────────────────┘

자동 로그아웃: 3시간 미사용 시
세션 저장:     localStorage (ID·PW remember me 체크 시)
```

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

```
connect-src:
  api.ipify.org          클라이언트 실IP 조회
  ip-api.com             geoip 프록시 대상
  *.firebaseio.com       Firebase RTDB
  fcm.googleapis.com     FCM 푸시
  generativelanguage.googleapis.com  Gemini AI
  identitytoolkit.googleapis.com     Firebase Auth
```

---

## 13. 최근 주요 변경 이력

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

*최종 업데이트: 2026년 6월*
