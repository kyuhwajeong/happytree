# 해피트리 영어학원 진도관리 시스템
> **진도관리 운용사이트** : https://happytree.vercel.app/
> **저장소**: https://github.com/kyuhwajeong/happytree/tree/dev  
> **버전**: v10d (2026.05 기준 최종)

---

## 📋 목차

1. [시스템 개요](#1-시스템-개요)
2. [기술 스택](#2-기술-스택)
3. [전체 구조 흐름도](#3-전체-구조-흐름도)
4. [파일 구성](#4-파일-구성)
5. [Firebase 데이터 경로](#5-firebase-데이터-경로)
6. [메뉴별 핵심 기능](#6-메뉴별-핵심-기능)
7. [주요 LocalStorage 키](#7-주요-localstorage-키)
8. [권한 체계](#8-권한-체계)
9. [최근 주요 변경 이력](#9-최근-주요-변경-이력)

---

## 1. 시스템 개요

영어학원 전용 **PWA(Progressive Web App)** 기반 학원 관리 시스템.  
Firebase Realtime DB를 백엔드로 사용하며, 별도 서버 없이 GitHub Pages에서 정적 호스팅.

### 주요 역할
- **진도 관리**: 반별 주간 교재·진도 입력 및 공유
- **교재 학습 관리**: 챕터별 수행/미수행 매트릭스, xlsx 일괄 반영
- **성적 관리**: 단어·리딩 성취율 입력, 리포트 생성·전달
- **학생/직원 관리**: 재원생 정보, 반 배정, 계정 관리

---

## 2. 기술 스택

| 구분 | 내용 |
|---|---|
| **Frontend** | Vanilla JS (ES2020+), HTML5, CSS3 |
| **DB** | Firebase Realtime Database |
| **호스팅** | GitHub Pages (정적) |
| **PWA** | Service Worker, Web App Manifest |
| **xlsx 처리** | SheetJS (XLSX.js) |
| **캡처** | html2canvas |
| **폰트** | Google Fonts (Noto Sans KR, IBM Plex Sans KR, Nanum Gothic 등) |

---

## 3. 전체 구조 흐름도

```
┌─────────────────────────────────────────────────────────────┐
│                     index.html (PWA Shell)                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                    하단 네비게이션                     │   │
│  │  [📅 진도] [⚙️ 관리] [📖 교재] [📝 성적] [👨‍🎓 학생] [👩‍💼 직원] │   │
│  │  ※ 관리자가 탭 순서 직접 변경 가능 (localStorage)    │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
         │              │             │            │
         ▼              ▼             ▼            ▼
   app.js           booklib-app.js  grade-app.js  students-app.js
   (진도·관리)      (교재관리)       (성적관리)    (학생관리)
         │              │             │
         ▼              ▼             ▼
   DB.js           booklib-db.js   grade-db.js
   (반·계정·테마)  (교재·챕터)     (성적·리포트설정)
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
              └── grades/           성적 데이터

[인증 흐름]
사용자 접속 → 로그인 팝업 → DB.login() → 세션 저장(LS)
→ 역할(admin/operator/teacher) 판별 → 메뉴 권한 적용

[데이터 흐름 - xlsx 일괄 반영]
xlsx 드래그 → XLSX.read() → _matchFileToTarget()
→ 파일명에서 반+교재 자동 매칭 (정규화+퍼지매칭)
→ _processCsv() → Firebase 저장 → 화면 갱신

[성적 리포트 흐름]
반+교재 선택 → 성적 입력(엑셀뷰) → [리포트] 탭
→ _buildReport() → html2canvas 캡처
→ 클립보드 복사(PC Ctrl+V) 또는 Web Share API(모바일)
```

---

## 4. 파일 구성

```

dev/
├── index.html          메인 PWA 셸 · 하단 nav 포함
├── style.css           전역 스타일 (테마 CSS 변수 기반)
├── app.js              진도관리·관리 메뉴 (v10d)
│                       ├── 반 목록·주간 진도 렌더링
│                       ├── 테마·폰트·탭 순서 설정
│                       └── 하단 nav 동적 렌더 (_renderNav)
├── booklib-app.js      교재 학습 관리 (v3.7+)
│                       ├── 교재 등록·챕터 관리
│                       ├── 수행/미수행 매트릭스
│                       ├── xlsx 일괄 반영 (진행 오버레이)
│                       └── 예외 설정·후처리 필터
├── booklib-db.js       교재 DB 모듈 (v3.1)
├── grade-app.js        성적 관리 (v4.1+)
│                       ├── 엑셀뷰 성취율 입력
│                       ├── 카드뷰·리포트뷰
│                       ├── 플로팅 디자인 설정 패널
│                       ├── 반 Overview 모드
│                       └── 캡처·전달 기능
├── grade-db.js         성적 DB 모듈 (v2.0)
├── students-app.js     학생 관리 메뉴
├── students-db.js      학생 DB 모듈
├── staff-app.js        직원 관리 메뉴
├── staff-db.js         직원 DB 모듈
├── firebase-config.js  Firebase 초기화·연결
├── manifest.json       PWA 매니페스트
├── sw.js               Service Worker (오프라인 캐시)
└── icon-*.png          앱 아이콘
```

---

## 5. Firebase 데이터 경로

```
hakwon10/
├── classes/{classId}
│   ├── name              반 이름
│   ├── books[]           배정 교재 ID 목록
│   └── ...
│
├── accounts/{accountId}
│   ├── username / password(hash) / role
│   └── teacherClasses[]  담당 반 (teacher 역할)
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
└── grades/{classId}/{studentId}/{bookId}/{recordId}
    ├── word: { totalQ, pass, retake }
    ├── reading: { R0: {score}, R1: {score}, ... }
    ├── comment                Teacher's Comment
    ├── date / createdAt / updatedAt
    └── classId / studentId / bookId
```

---

## 6. 메뉴별 핵심 기능

---

### 📅 진도 관리 (app.js)

**역할**: 반별 주간 교재 진도를 입력·공유하는 메인 화면

| 기능 | 설명 |
|---|---|
| 주간 진도 그리드 | 월~금 × 반별 교재 입력 (그리드/리스트 전환) |
| 반 선택 | 상단 드롭다운으로 반 선택 → 해당 주 진도 표시 |
| 진도 공유 | 반별 진도 텍스트 생성 → 복사/카카오톡 공유 |
| 이전 진도 기록 | 과거 주차 진도 열람 (달력 이동) |
| 진도 캘린더 | 월간 달력 뷰로 진도 이력 확인 |

---

### ⚙️ 관리 (app.js)

**역할**: 시스템 전반 설정 (관리자 전용 항목 포함)

| 탭 | 기능 |
|---|---|
| **반 관리** | 반 추가·수정·삭제, 요일·교재 배정, 반간 교재 복사 |
| **계정 관리** | admin/operator/teacher 계정 추가·수정·삭제 |
| **테마·디자인** | 컬러 팔레트 5종, 폰트 4종, 글자 크기, 입력칸 너비 |
| **탭 순서 설정** | ↑↓ 버튼으로 하단 탭 순서 조정 → localStorage 저장, 재진입 유지 |
| **데이터 I/O** | 전체 데이터 내보내기·가져오기 |
| **공유 설정** | 진도 공유 URL·문자 전송 설정 |

---

### 📖 교재 학습 관리 (booklib-app.js)

**역할**: 교재별 챕터 수행 현황 매트릭스 관리

#### 📚 교재 관리 탭

| 기능 | 설명 |
|---|---|
| 교재 등록 | 교재명 + 반 배정 + 학생 일괄 배정 통합 UI |
| 챕터 관리 | 챕터 추가·순서 변경·삭제, 챕터명 기반 자동 너비 |
| 챕터명 접기/펼치기 | `[◀]` 버튼으로 챕터 열 너비 토글 (인라인 스타일 직접 적용) |
| 완결 처리 | 교재 아카이브(🔒) → 성적 overview에서 완결 교재도 조회 가능 |

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
| **반 미선택 일괄 반영** | 반/교재 선택 없이 파일 드롭 → 그리드 카드 매칭 결과 표시 → 하단 고정 바로 실행 |

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

**역할**: 단어·리딩 성취율 입력, 리포트 생성 및 전달

#### 뷰 전환

| 뷰 | 설명 |
|---|---|
| **🔲 엑셀** | 학생별 단어(통과/재시험) + 리딩 성취율 입력 표 |
| **🐱 카드** | 학생 카드 슬라이드 뷰 |
| **📄 리포트** | 개인별 Achievement Report 생성 |

#### 엑셀 뷰

| 기능 | 설명 |
|---|---|
| 성취율 입력 | 통과 수, 재시험 수, 리딩 각 회차 점수 |
| Teacher's Comment | 자유 텍스트 입력란 |
| 저장 | 개별/전체 Firebase 저장 |
| 평가 설정 | 총 문항 수, 리딩 회차 활성화 설정 |

#### 리포트 뷰

| 기능 | 설명 |
|---|---|
| **레이아웃 5종** | L1~L5 다양한 리포트 레이아웃 |
| **플로팅 설정 패널** | 드래그 이동 가능, 모바일 touch 닫기 지원 |
| **폰트 5종** | Noto / IBM / 나눔고딕 / 명조 / Spoqa |
| **Bold 강조** | 체크 시 전체 fontWeight:700 적용 (localStorage 유지) |
| **페이지 크기 7종** | A4 / A5 / B5 / Letter / 📇카드 / 📱좁게 / ↔전체폭 |
| **배율 슬라이더** | 60~150%, 5% 단위, localStorage 유지 |
| **배경색·표 색상** | 배경 8색, 헤더·셀 색상 커스텀 |
| **추천 테마** | 클래식 / 블루 / 골드 |
| **📲 전달** | html2canvas 캡처 → 클립보드 복사(PC Ctrl+V) + Web Share API(모바일) |
| **📸 캡처** | 현재 학생 PNG 저장 |
| **📂 전체** | 반 전체 학생 순차 캡처 저장 |
| **설정 영속성** | 모든 설정 localStorage 저장 → 재진입 시 자동 복원 |

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
| **디자인 설정** | 플로팅 패널 (배경·폰트·크기) |
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

## 7. 주요 LocalStorage 키

### 앱 전반 (app.js)
| 키 | 내용 |
|---|---|
| `hk10b_nav_order` | 하단 탭 순서 (pg 배열) |
| `hk10b_rem_id` / `hk10b_rem_pw` | 아이디 저장 |

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

---

## 8. 권한 체계

```
┌─────────────────────────────────────────────────────┐
│  역할       접근 가능 메뉴                           │
├─────────────────────────────────────────────────────┤
│  admin      진도·관리·교재·성적·학생·직원 (전체)    │
│  operator   진도·관리 (반 관리 제외)                 │
│  teacher    진도 (담당 반만), 교재 (조회)            │
│  비로그인   진도 (읽기 전용)                         │
└─────────────────────────────────────────────────────┘

자동 로그아웃: 3시간 미사용 시
세션 저장: localStorage (remember me 체크 시)
```

---

## 9. 최근 주요 변경 이력

### 교재 학습 관리 (booklib-app.js)

- **예외 설정 구조 개선**: `{bookId:{학생명:{items,alias}}}` 중첩 구조로 동일 반 다교재 충돌 방지
- **xlsx 매칭 개선**: 공백·언더스코어·하이픈 제거 후 양방향 포함 비교, 파일명 제목 추출 로직
- **일괄 반영 진행 오버레이**: 실시간 진행바 + 로그 + 완료 결과 모달
- **반 미선택 일괄 반영**: 드롭존 + 그리드 카드 + 하단 고정 실행 바
- **챕터 열 너비 토글**: 인라인 스타일 직접 적용으로 CSS override 문제 해결
- **반 미배정 교재 팝업**: cls=null일 때도 openShare, openClassReport 정상 동작
- **_runBatchImport 상태 복원**: 파일 처리 후 _checks/_stamps 현재 화면으로 복원

### 성적 관리 (grade-app.js)

- **반 Overview 모드**: 반만 선택 시 전체 교재 성취율 표 + 개인 차트 자동 표시
- **완결 교재 포함**: getAllBooks()로 archived 교재도 Overview에 포함
- **플로팅 설정 패널**: 드래그 이동, 모바일 touch 닫기 분리 처리
- **폰트 5종**: Noto·IBM·나눔고딕·명조·Spoqa
- **페이지 크기 7종**: A4~Wide, 배율 슬라이더 추가
- **캡처 품질**: 폰트 대기(_waitFonts) + transform 임시 해제(_captureEl)로 텍스트 겹침 방지
- **📲 전달**: 클립보드 PNG 복사 → PC 카카오톡 Ctrl+V 지원
- **전체 캡처**: 반 전체 학생 순차 오프스크린 렌더 후 PNG 일괄 저장
- **설정 영속성**: reportLayout, graphAlign, logoSize 덮어쓰기 버그 수정 + 재진입 시 전 설정 복원
- **리포트 뷰 하단 공간**: report-active 클래스로 차트 영역 완전 제거

### 앱 전반 (app.js)

- **하단 탭 순서 설정**: NAV_DEF 기반 동적 렌더, 관리>테마 탭에서 ↑↓ 조정 및 저장

---

## 개발 참고사항

### 새 채팅에서 빠른 파악 포인트

```
1. Firebase 경로: hakwon10/ 하위 구조 참고
2. 교재 예외 설정: exempts/{classId}/{bookId}/{학생명} 중첩 구조
3. 성적 데이터: grades/{classId}/{studentId}/{bookId}/{recordId}
4. xlsx 매칭: _normStr() → 공백·_·- 제거 후 소문자 비교
5. 캡처: _waitFonts() → _captureEl() 순서로 호출
6. 설정 영속: _st 초기화 시 localStorage에서 모두 읽음
7. 탭 순서: localStorage('hk10b_nav_order') → _renderNav()
8. 반 Overview: classId 있고 bookId 없을 때 _renderOverview() 호출
```

---

*최종 업데이트: 2026년 5월*
