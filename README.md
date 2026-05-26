# 해피트리 영어학원 진도관리 시스템

> **진도관리 운용사이트** : https://happytree.vercel.app/
> **진도관리 개발사이트** : https://happytree-jvr3zy141-kuha0879-6856s-projects.vercel.app/
> **저장소** : https://github.com/kyuhwajeong/happytree/tree/dev
> **버전** : v10 (2026.05 기준 최종)

---

## 📋 목차

1. [시스템 개요](#1-시스템-개요)
2. [기술 스택](#2-기술-스택)
3. [전체 구조 흐름도](#3-전체-구조-흐름도)
4. [파일 구성](#4-파일-구성)
5. [Firebase 데이터 경로](#5-firebase-데이터-경로)
6. [메뉴별 핵심 기능](#6-메뉴별-핵심-기능)
7. [🤖 Gemini AI 코멘트 생성](#7-gemini-ai-코멘트-생성)
8. [주요 LocalStorage 키](#8-주요-localstorage-키)
9. [권한 체계](#9-권한-체계)
10. [최근 주요 변경 이력](#10-최근-주요-변경-이력)

---

## 1. 시스템 개요

영어학원 전용 **PWA(Progressive Web App)** 기반 학원 관리 시스템.
Firebase Realtime DB를 백엔드로 사용하며, 별도 서버 없이 **Vercel**에서 정적 호스팅.

### 주요 역할

- **진도 관리** : 반별 주간 교재·진도 입력 및 공유
- **교재 학습 관리** : 챕터별 수행/미수행 매트릭스, xlsx 일괄 반영
- **성적 관리** : 단어·리딩 성취율 입력, 리포트 생성·전달, **AI 코멘트 자동 생성**
- **학생/직원 관리** : 재원생 정보, 반 배정, 계정 관리

---

## 2. 기술 스택

| 구분 | 내용 |
|---|---|
| **Frontend** | Vanilla JS (ES2020+), HTML5, CSS3 |
| **DB** | Firebase Realtime Database (compat SDK v10.12.0) |
| **호스팅** | Vercel (정적 배포) |
| **PWA** | Web App Manifest (standalone), Safe-area / dvh 대응 |
| **AI** | Google Gemini API (gemini-2.5-flash-lite / gemini-2.5-flash, 다중 키 폴백) |
| **xlsx 처리** | SheetJS (XLSX.js v0.18.5) |
| **캡처** | html2canvas v1.4.1 |
| **폰트** | Google Fonts — Noto Sans KR, IBM Plex Sans KR, Nanum Gothic, Nanum Myeongjo |

---

## 3. 전체 구조 흐름도

```
┌──────────────────────────────────────────────────────────────┐
│                    index.html (PWA Shell)                     │
│  ┌────────────────────────────────────────────────────────┐  │
│  │                    하단 네비게이션                       │  │
│  │  [📅 진도] [⚙️ 관리] [📖 교재] [📝 성적] [👨‍🎓 학생] [👩‍💼 직원]  │  │
│  │  ※ 관리자가 탭 순서 직접 변경 가능 (localStorage)      │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
         │              │             │            │
         ▼              ▼             ▼            ▼
      app.js       booklib-app.js  grade-app.js  students-app.js
   (진도·관리)     (교재관리)      (성적관리)    (학생관리)
         │              │             │   ↑
         ▼              ▼             ▼   │ AI 코멘트
      DB.js        booklib-db.js  grade-db.js  gemini-ai.js
   (반·계정·테마)  (교재·챕터)   (성적·설정)   (Gemini API)
         │              │             │
         └──────────────┴─────────────┘
                        │
                        ▼
              Firebase Realtime DB
              hakwon10/
              ├── classes/          반 목록
              ├── accounts/         계정 목록
              ├── theme/            테마·설정
              ├── bookdata/         교재 정보·챕터
              ├── bookcheck/        수행 체크 데이터
              ├── bookstamps/       진도 스탬프
              ├── memos/            학생 메모
              ├── exempts/          면제 설정
              ├── grades/           성적 데이터
              └── globalPins/       AI 고정 멘트 (공용)

[인증 흐름]
사용자 접속 → 스플래시 인트로 → 로그인 팝업 → DB.login()
→ 세션 저장(localStorage) → 역할(admin/operator/teacher) 판별
→ 메뉴 권한 적용 (강사별 추가 메뉴 권한 포함)

[데이터 흐름 - xlsx 일괄 반영]
xlsx 드래그 → XLSX.read() → _matchFileToTarget()
→ 파일명에서 반+교재 자동 매칭 (정규화+퍼지매칭)
→ _processCsv() → Firebase 저장 → 화면 갱신

[성적 리포트 흐름]
반+교재 선택 → 성적 입력(엑셀뷰) → [리포트] 탭
→ _buildReport() → html2canvas 캡처
→ 클립보드 복사(PC Ctrl+V) 또는 Web Share API(모바일)

[AI 코멘트 흐름]
성적 입력 완료 → [✨ AI 코멘트] 버튼 클릭
→ GeminiAI.generateComment(studentInfo, bookStatus)
→ Gemini API 호출 (다중 키/모델 폴백)
→ Teacher's Comment 자동 입력 (3가지 버전 선택 가능)
```

---

## 4. 파일 구성

```
htdev/
├── index.html          메인 PWA 셸 · 하단 nav · 모달 포함
├── style.css           전역 스타일 (CSS 변수 기반 테마)
├── firebase-config.js  Firebase 초기화·연결 (FireDB 모듈)
├── logo.js             SVG 로고 생성 모듈
│
├── app.js              진도관리·관리 메뉴
│                       ├── 반 목록·주간 진도 렌더링
│                       ├── 테마·폰트·탭 순서 설정
│                       └── 하단 nav 동적 렌더 (_renderNav)
│
├── booklib-app.js      교재 학습 관리 (v3.7+)
│                       ├── 교재 등록·챕터 관리
│                       ├── 수행/미수행 매트릭스
│                       ├── xlsx 일괄 반영 (진행 오버레이)
│                       └── 예외 설정·후처리 필터
├── booklib-db.js       교재 DB 모듈 (v3.1)
│
├── grade-app.js        성적 관리 (v4.1)
│                       ├── 엑셀뷰 성취율 입력 (헤더 클릭 정렬)
│                       ├── 카드뷰·리포트뷰
│                       ├── AI 코멘트 생성 패널
│                       ├── 플로팅 디자인 설정 패널
│                       ├── 반 Overview 모드
│                       └── 캡처·전달 기능
├── grade-db.js         성적 DB 모듈 (v2.0)
│
├── gemini-ai.js        Google Gemini AI 연동 모듈 (v9.0)
│                       ├── 다중 API 키 폴백 (KEY_1~3)
│                       ├── 다중 모델 폴백 (flash-lite → flash)
│                       ├── 코멘트 생성 / 복수 버전 생성
│                       ├── 문법 교정 / 스타일 분석
│                       ├── 고정 멘트 관리 (공용·교재별)
│                       └── 스타일 DNA 학습 (샘플 최대 20개)
│
├── students-app.js     학생 관리 메뉴
├── students-db.js      학생 DB 모듈
├── staff-app.js        직원 관리 메뉴
├── staff-db.js         직원 DB 모듈
│
├── manifest.json       PWA 매니페스트 (standalone)
└── icon-*.png          앱 아이콘 (192 / 512)
```

---

## 5. Firebase 데이터 경로

```
hakwon10/
├── classes/{classId}
│   ├── name              반 이름
│   ├── days[]            수업 요일
│   ├── dayTimes{}        요일별 수업 시간 (선택)
│   ├── startMonth        편성 시작 월
│   └── books[]           배정 교재 ID 목록
│
├── accounts/{accountId}
│   ├── username / password(hash) / role
│   ├── teacherClasses[]  담당 반 (teacher 역할)
│   └── teacherMenus[]    강사 추가 메뉴 권한 (booklib / grade 등)
│
├── theme/                전역 테마·폰트·글자 크기
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
├── exempts/{classId}
│   └── {bookId}/{studentName}
│       ├── items[]         면제 항목 목록
│       ├── useAlias        별칭 사용 여부
│       └── alias           별칭 텍스트
│
├── grades/{classId}/{studentId}/{bookId}/{recordId}
│   ├── word: { totalQ, pass, retake }
│   ├── reading: { R0: {score}, R1: {score}, ... }
│   ├── comment                Teacher's Comment
│   ├── date / createdAt / updatedAt
│   └── classId / studentId / bookId
│
└── globalPins/             AI 고정 멘트 (공용, 전체 계정 공유)
    └── [멘트 문자열 배열]
```

---

## 6. 메뉴별 핵심 기능

---

### 📅 진도 관리 (app.js)

**역할**: 반별 주간 교재 진도를 입력·공유하는 메인 화면

| 기능 | 설명 |
|---|---|
| 주간 진도 그리드 | 월~금 × 반별 교재 입력 (그리드/리스트 전환) |
| 반 선택 | 상단 칩으로 반 선택 → 해당 주 진도 표시 |
| 주차 이동 | 이전/다음 주 네비게이션 + 주차·월 표시 |
| 진도 공유 | 반별 진도 텍스트 생성 → 복사/카카오톡 공유 |
| 이전 진도 기록 | 과거 주차 진도 열람 |
| 진도 캘린더 | 📆 버튼 → 월간 달력 뷰로 진도 이력 확인 |
| 실시간 동기화 | Firebase 리스닝 → 다른 기기 입력 즉시 반영 |

---

### ⚙️ 관리 (app.js)

**역할**: 시스템 전반 설정 (관리자 전용 항목 포함)

| 탭 | 기능 |
|---|---|
| **📋 반** | 반 추가·수정·삭제, 요일·시간·교재 배정, 반간 교재 복사 |
| **👤 계정** | admin/operator/teacher 계정 추가·수정·삭제, 강사별 추가 메뉴 권한 |
| **🎨 테마** | 컬러 팔레트 5종, 폰트 4종, 글자 크기, 탭 순서 ↑↓ 조정 |
| **📦 백업** | 전체 데이터 내보내기(JSON)·가져오기 |
| **🔗 공유** | 진도 공유 URL·문자 전송 설정 |

#### 강사(teacher) 추가 메뉴 권한
계정 생성/수정 시 `교재`, `성적` 메뉴를 선택적으로 부여 가능.
담당 반 데이터에 한해서만 접근, 관리·학생·직원 메뉴는 부여 불가.

---

### 📖 교재 학습 관리 (booklib-app.js)

**역할**: 교재별 챕터 수행 현황 매트릭스 관리

#### 📚 교재 관리 탭

| 기능 | 설명 |
|---|---|
| 교재 등록 | 교재명 + 반 배정 + 학생 일괄 배정 통합 UI |
| 챕터 관리 | 챕터 추가·순서 변경·삭제, 챕터명 기반 자동 너비 |
| 챕터명 접기/펼치기 | `[◀]` 버튼으로 챕터 열 너비 토글 |
| 완결 처리 | 교재 아카이브(🔒) → 성적 Overview에서 완결 교재도 조회 가능 |

#### 📊 학습 현황 탭

| 기능 | 설명 |
|---|---|
| **수행 매트릭스** | 챕터(행) × 학생(열) 그리드, 셀 탭으로 수행/미수행 토글 |
| **진도 스탬프** | 챕터 셀 탭 → 스탬프 날짜 설정, 미수행 집계 기준 |
| **학생별 공유** | 학생 이름 컬럼 탭 → 미수행 목록 팝업 → 복사/공유 |
| **전체 출력** | 반 전체 미수행 현황 리포트 출력 |
| **예외 설정** | 학생별 면제 항목 설정 (별칭·항목 선택), bookId 기준 저장 |
| **후처리 필터** | xlsx 반영 후 특정 항목 시각적 제거 (DB 저장 없음) |
| **xlsx 일괄 반영** | 다수 파일 드래그앤드롭 → 파일명에서 반+교재 자동 매칭 |
| **반 미선택 일괄 반영** | 반/교재 선택 없이 파일 드롭 → 그리드 카드 매칭 결과 → 하단 고정 바 실행 |

#### xlsx 파일명 매칭 규칙

```
파일명: "04.[T2] 파닉스 몬스터 4_20260516.xlsx"
        └─번호─┘└반┘ └──교재명──┘└──날짜──┘

매칭 과정:
1. _normStr(): 공백·언더스코어·하이픈 제거 → 소문자
2. 브라켓 [T2] → 반 이름 매칭
3. 파일제목 정규화 vs 교재명 정규화 → 양방향 포함 비교
   A) 파일제목 ⊃ 교재명
   B) 교재명 ⊃ 파일제목
   C) 파일명 전체 ⊃ 교재명
4. 반 미배정: 브라켓 내 한글 → 학생명 기반 교재 검색
```

---

### 📝 성적 관리 (grade-app.js)

**역할**: 단어·리딩 성취율 입력, AI 코멘트 생성, 리포트 생성 및 전달

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
| 헤더 클릭 정렬 | 학생명·단어성취율·리딩성취율 컬럼 클릭 정렬 |
| Enter키 이동 | Enter → 다음 학생, ↑↓ 방향키 → 입력값 증감 |
| 우클릭 메뉴 | 개별 저장 / 초기화 컨텍스트 메뉴 |
| Teacher's Comment | 자유 텍스트 입력 + **AI 자동 생성** 버튼 |
| 저장 | 전체 학생 일괄 Firebase 저장 |
| 평가 설정 | 총 문항 수, 리딩 회차 활성화 |
| 반 평균 행 | 단어·리딩 실시간 평균 계산 표시 |

#### 리포트 뷰

| 기능 | 설명 |
|---|---|
| **레이아웃 5종** | L1~L5 다양한 리포트 레이아웃 |
| **플로팅 설정 패널** | 드래그 이동, 모바일 touch 닫기 |
| **폰트 5종** | Noto / IBM / 나눔고딕 / 명조 / Spoqa |
| **Bold 강조** | 전체 fontWeight:700 적용 (localStorage 유지) |
| **페이지 크기 7종** | A4 / A5 / B5 / Letter / 📇카드 / 📱좁게 / ↔전체폭 |
| **배율 슬라이더** | 60~150%, 5% 단위 |
| **배경색·표 색상** | 배경 8색, 헤더·셀 색상 커스텀 |
| **추천 테마** | 클래식 / 블루 / 골드 |
| **📲 전달** | html2canvas 캡처 → 클립보드 복사(PC Ctrl+V) + Web Share API(모바일) |
| **📸 캡처** | 현재 학생 PNG 저장 |
| **📂 전체** | 반 전체 학생 순차 캡처 PNG 일괄 저장 |
| **설정 영속성** | 모든 설정 localStorage → 재진입 시 자동 복원 |

#### 캡처 품질 보장

```
캡처 전:
① _waitFonts(): document.fonts.ready + rAF×2 + 120ms 대기
② _captureEl(): gr-rpt-outer의 transform(배율) 임시 제거
③ html2canvas: onclone에서 폰트 링크 동기화

캡처 후:
④ transform 원복 → 화면은 설정된 배율 유지
```

#### 반만 선택 시 Overview 모드

| 기능 | 설명 |
|---|---|
| **교재별 성취율 표** | 완결 교재 포함 전체, 학생×교재 그리드 |
| **학생 선택 시 그래프** | Canvas 막대(단어)+선(반평균)+리딩 혼합 차트 |
| **교재별 상세 성적표** | 진행바 + 반평균 비교 + 코멘트 |
| **교재 하이라이트** | 교재 선택 시 차트+표 동시 강조 |
| **디자인 설정** | 플로팅 패널 (배경·폰트·크기·방향) |
| **📲 전달** | 전체 화면 캡처 → 클립보드/공유 |

---

### 👨‍🎓 학생 관리 (students-app.js)

| 기능 | 설명 |
|---|---|
| 학생 목록 | 전체 재원생 리스트, 검색·필터 |
| 학생 등록·수정 | 이름, 닉네임, 반 배정, 성별 |
| 반 배정 | 여러 반 동시 배정 가능 |
| 재원 상태 | 재원/퇴원 관리 |

---

### 👩‍💼 직원 관리 (staff-app.js)

| 기능 | 설명 |
|---|---|
| 직원 목록 | 강사진 정보 관리 |
| 직원 등록·수정 | 이름, 역할, 담당 과목 |

---

## 7. 🤖 Gemini AI 코멘트 생성

> **파일** : `gemini-ai.js` v9.0  
> **연동 위치** : 성적 관리 → 엑셀뷰 Teacher's Comment 컬럼

### 아키텍처

```
[다중 키 폴백]                    [다중 모델 폴백]
  KEY_1 (기본)                gemini-2.5-flash-lite (1순위)
  KEY_2 (보조)         →      gemini-2.5-flash      (2순위)
  KEY_3 (예비)
  → 429(한도소진) 또는 401(키 무효) 시 다음 키로 자동 전환
```

### 주요 기능

| 기능 | 설명 |
|---|---|
| **코멘트 생성** | 학생 성적·교재 정보 기반 학부모용 따뜻한 코멘트 생성 |
| **3가지 버전** | `generateVariants()` — 길이·강조점·표현이 다른 3버전 동시 생성 |
| **문법 교정** | `proofreadComment()` — 작성된 코멘트 맞춤법·문법 교정 |
| **스타일 분석** | `analyzeStyle()` — 샘플 코멘트 분석 → 선생님 문체 DNA 추출 |
| **스타일 DNA 학습** | 최대 20개 샘플 저장 → 이후 생성 시 문체 자동 반영 |
| **고정 멘트 (공용)** | Firebase `globalPins` 동기화 → 전체 계정 공유 멘트 |
| **고정 멘트 (교재별)** | 교재 ID 기준 별도 저장, 공용과 선택적 병합 |
| **이전 코멘트 참조** | 동일 학생 최근 코멘트 3개 포함 → 어조 일관성 유지 |
| **연결 테스트** | `testConnection()` — API 키·모델 동작 확인 |

### 프롬프트 구조

```
[시스템 프롬프트]
초등학생 영어학원 선생님 역할
- 한국어 존댓말(~습니다/합니다)
- 노력·성장·태도 위주 칭찬 (점수 숫자 배제)
- 3~5문장: 잘한 점 → 구체 칭찬 → 응원
- 스타일 DNA 캐시 반영

[컨텍스트 (사용자 프롬프트)]
학생: [이름] ([성별])
단어 성취율: [X%]
리딩 성취율: [X%]
현재 교재: [교재명]
선생님 메모: [메모]
[고정 멘트 — 반드시 자연스럽게 녹여 넣기]
[이전 코멘트 — 동일 어조 유지]
[스타일 DNA 샘플]
```

### LocalStorage 키 (AI)

| 키 | 내용 |
|---|---|
| `ht_style_samples` | 선생님 코멘트 스타일 샘플 (최대 20개) |
| `ht_style_pins` | 공용 고정 멘트 (Firebase와 동기화) |
| `ht_style_analysis` | 스타일 분석 캐시 (analyzeStyle 결과) |
| `ht_style_pins:{bookId}` | 교재별 고정 멘트 |

---

## 8. 주요 LocalStorage 키

### 앱 전반 (app.js)

| 키 | 내용 |
|---|---|
| `hk10b_nav_order` | 하단 탭 순서 (pg 배열) |
| `hk10b_rem_id` / `hk10b_rem_pw` | 아이디·비밀번호 기억하기 |

### 교재 관리 (booklib-app.js)

| 키 | 내용 |
|---|---|
| `bl_ch_w` | 챕터명 열 너비 (px) |
| `bl_pf_{classId}_{bookId}` | 후처리 필터 데이터 |

### 성적 관리 (grade-app.js)

| 키 | 내용 |
|---|---|
| `gr_layout` | 리포트 레이아웃 번호 (1~5) |
| `gr_pageSize` | 페이지 크기 (A4/A5/B5/Letter/Card/Narrow/Wide) |
| `gr_rptScale` | 배율 (60~150) |
| `gr_fontFamily` | 본문 폰트 |
| `gr_reportBold` | Bold 강조 여부 |
| `gr_rptBg` | 배경색 |
| `gr_titleSz` / `gr_bodySz` | 제목·본문 글자 크기 |
| `gr_hdrFontSz` / `gr_excelFontSz` / `gr_cardFontSz` | 헤더·엑셀·카드 폰트 크기 |
| `gr_graph` | 그래프 포함 여부 |
| `gr_graphStyle` | 그래프 스타일 (1=수직, 2=수평) |
| `gr_graphAlign` | 그래프 정렬 |
| `gr_logoSz` | 로고 크기 |
| `gr_titleAlign` | 제목 정렬 |
| `gr_tblHdrBg` / `gr_tblHdrClr` / `gr_tblCellBg` | 표 색상 |
| `gr_tblRound` | 표 라운드 여부 |
| `gr_divClr` / `gr_divW` | 구분선 색상·굵기 |
| `gr_ov_horiz` | Overview 그래프 방향 |
| `gr_ov_bg` / `gr_ov_font` / `gr_ov_bold` | Overview 디자인 |

### Gemini AI (gemini-ai.js)

| 키 | 내용 |
|---|---|
| `ht_style_samples` | 코멘트 스타일 샘플 (최대 20개) |
| `ht_style_pins` | 공용 고정 멘트 (Firebase globalPins 동기화) |
| `ht_style_analysis` | 스타일 분석 캐시 |
| `ht_style_pins:{bookId}` | 교재별 고정 멘트 |

---

## 9. 권한 체계

```
┌──────────────────────────────────────────────────────────────┐
│  역할        접근 가능 메뉴                                   │
├──────────────────────────────────────────────────────────────┤
│  admin       진도·관리·교재·성적·학생·직원 (전체)            │
│  operator    진도·관리 (반 관리 제외)                         │
│  teacher     진도 (담당 반만)                                 │
│              + teacherMenus 에 등록된 메뉴 (교재/성적 등)    │
│              ※ 담당 반 데이터에 한해서만 접근                 │
│  비로그인    진도 (읽기 전용)                                 │
└──────────────────────────────────────────────────────────────┘

자동 로그아웃  : 3시간 미사용 시
세션 저장      : localStorage (remember me 체크 시 ID·PW 포함)
```

---

## 10. 최근 주요 변경 이력

### 🆕 Gemini AI 통합 (gemini-ai.js v9.0) — 신규 추가

- **다중 키 폴백**: API 키 3개 순환, 429(한도)/401(만료) 자동 전환
- **다중 모델 폴백**: `gemini-2.5-flash-lite` → `gemini-2.5-flash` 순서
- **스타일 DNA**: 선생님 샘플 코멘트 최대 20개 학습 → 문체 자동 반영
- **스타일 분석 캐시**: `analyzeStyle()` 결과 localStorage 저장, 이후 생성 시 자동 주입
- **고정 멘트 이중화**: 공용(Firebase `globalPins` 실시간 동기화) + 교재별(localStorage)
- **3버전 동시 생성**: `generateVariants()` → JSON 배열 파싱 후 선택 UI 제공
- **이전 코멘트 참조**: 동일 학생 최근 3개 코멘트 → 어조·스타일 일관성
- **문법 교정**: `proofreadComment()` → 원문 존댓말 유지 교정

### 교재 학습 관리 (booklib-app.js)

- **예외 설정 구조 개선**: `{bookId:{학생명:{items,alias}}}` 중첩 구조로 동일 반 다교재 충돌 방지
- **xlsx 매칭 개선**: 공백·언더스코어·하이픈 제거 후 양방향 포함 비교
- **일괄 반영 진행 오버레이**: 실시간 진행바 + 로그 + 완료 결과 모달
- **반 미선택 일괄 반영**: 드롭존 + 그리드 카드 + 하단 고정 실행 바
- **챕터 열 너비 토글**: 인라인 스타일 직접 적용으로 CSS override 문제 해결
- **_runBatchImport 상태 복원**: 파일 처리 후 `_checks`/`_stamps` 현재 화면으로 복원

### 성적 관리 (grade-app.js v4.1)

- **반 Overview 모드**: 반만 선택 시 전체 교재 성취율 표 + 개인 차트 자동 표시
- **완결 교재 포함**: `getAllBooks()`로 archived 교재도 Overview에 포함
- **엑셀뷰 정렬**: 헤더 클릭 → 학생명·단어·리딩 성취율 정렬
- **Enter/방향키 UX**: Enter → 다음 학생 이동, ↑↓ → 값 증감
- **반 평균 행**: "반 평균" → "평균", 학생~통과 셀 병합, 실시간 계산
- **플로팅 설정 패널**: 드래그 이동, 모바일 touch 닫기 분리 처리
- **폰트 5종 / 페이지 크기 7종 / 배율 슬라이더**: 추가
- **캡처 품질**: `_waitFonts()` + `_captureEl()` transform 임시 해제
- **📲 전달**: 클립보드 PNG 복사 → PC 카카오톡 Ctrl+V 지원
- **설정 영속성**: `reportLayout`, `graphAlign`, `logoSize` 재진입 시 전 설정 복원

### 앱 전반 (app.js / index.html)

- **호스팅 Vercel 이전**: GitHub Pages → Vercel 배포
- **요일별 수업 시간**: 반 등록 시 요일별 시간 선택 필드 추가
- **강사 추가 메뉴 권한**: teacher 계정에 `booklib`·`grade` 메뉴 선택 부여
- **하단 탭 순서 설정**: NAV_DEF 기반 동적 렌더, 관리 > 테마 탭에서 ↑↓ 조정
- **스플래시 인트로**: 로고 glow 애니메이션 + 연결 상태 표시
- **sync dot**: 헤더 우상단 실시간 Firebase 연결 상태 인디케이터

---

## 개발 참고사항

### 새 채팅에서 빠른 파악 포인트

```
1. Firebase 경로  : hakwon10/ 하위 구조 참고
                   globalPins/ — AI 공용 고정 멘트 실시간 동기화
2. 예외 설정      : exempts/{classId}/{bookId}/{학생명} 중첩 구조
3. 성적 데이터    : grades/{classId}/{studentId}/{bookId}/{recordId}
4. xlsx 매칭      : _normStr() → 공백·_·- 제거 후 소문자 비교
5. 캡처 순서      : _waitFonts() → _captureEl() 순으로 호출
6. 설정 영속      : _st 초기화 시 localStorage에서 모두 읽음
7. 탭 순서        : localStorage('hk10b_nav_order') → _renderNav()
8. 반 Overview   : classId 있고 bookId 없을 때 _renderOverview() 호출
9. Gemini AI     : GeminiAI.generateComment(studentInfo, bookStatus, opts)
                   opts.activePins — 고정 멘트 배열
                   opts.prevComments — 이전 코멘트 배열
10. AI 키 추가   : gemini-ai.js의 KEYS 배열에 추가 (자동 폴백)
```

### 스크립트 로딩 순서

```html
firebase-config.js   → FireDB 모듈
logo.js              → SVG 로고
db.js                → 반·계정·테마 DB
students-db.js / students-app.js
booklib-db.js / booklib-app.js
staff-db.js / staff-app.js
gemini-ai.js         → AI 코멘트 모듈 (GradeApp보다 먼저 로드 필수)
grade-db.js / grade-app.js
app.js               → 메인 앱 (마지막)
```

---

*최종 업데이트: 2026년 5월*
