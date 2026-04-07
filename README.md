# 📚 학원 진도 관리 v4

Firebase 실시간 동기화 + 엑셀 백업 + 공유 링크 + 달력 날짜 선택

---

## ✨ v4 신규 기능

| # | 기능 | 내용 |
|---|------|------|
| 1 | **실시간 동기화** | Firebase Realtime DB — PC·폰 동시 동기화 |
| 2 | **자동저장** | 입력하면 0.8초 후 자동 저장, 저장 버튼 제거 |
| 3 | **달력 팝업** | 📆 버튼 → 월간 달력 → 날짜 선택 → 해당 주 이동 |
| 4 | **엑셀 백업** | 관리 → 백업 탭에서 .xlsx 내보내기/불러오기 |
| 5 | **공유 링크** | 관리 → 공유 탭 → 반 선택 → URL 복사/문자/카카오 |
| 6 | **읽기 전용 공유** | 링크 접속 시 수정 불가, 진도 현황만 열람 |
| 7 | **테마 즉각 반영** | 색상 선택 즉시 전체 화면 배경/서피스/글자 변경 |
| 8 | **8가지 다크 팔레트** | 색상별로 배경색까지 연동된 완전한 테마 |

---

## 🔥 Firebase 설정 (필수)

### 1. Firebase 프로젝트 생성

1. [https://console.firebase.google.com](https://console.firebase.google.com) 접속
2. **프로젝트 추가** 클릭 → 이름 입력 → 생성
3. 좌측 메뉴 **빌드 → Realtime Database** 클릭
4. **데이터베이스 만들기** → 위치 선택 → **테스트 모드**로 시작

### 2. 데이터베이스 규칙 설정

Realtime Database → 규칙 탭:
```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```
> ⚠️ 운영 환경에서는 인증 기반 규칙으로 강화하세요.

### 3. 앱 등록 및 config 복사

1. 프로젝트 설정 → **웹 앱 추가** (</> 아이콘)
2. 앱 닉네임 입력 → **등록**
3. 표시된 `firebaseConfig` 값을 복사

### 4. firebase-config.js 수정

```javascript
const FIREBASE_CONFIG = {
  apiKey:            "실제-API-KEY",
  authDomain:        "프로젝트.firebaseapp.com",
  databaseURL:       "https://프로젝트-default-rtdb.firebaseio.com",
  projectId:         "프로젝트-ID",
  storageBucket:     "프로젝트.appspot.com",
  messagingSenderId: "발신자ID",
  appId:             "앱ID",
};
```

> Firebase 미설정 시 localStorage 모드로 동작 (단일 기기)

---

## 🚀 GitHub Pages 배포

### 1. 저장소 생성
GitHub → `+ New repository` → Public → 생성

### 2. 파일 업로드 (7개)
```
index.html  style.css  db.js  app.js
firebase-config.js  manifest.json  README.md
```

### 3. Pages 활성화
Settings → Pages → Branch: `main` `/` → Save

접속:
```
https://{사용자명}.github.io/{저장소명}/
```

---

## 🔑 기본 로그인

| 아이디 | 비밀번호 |
|--------|---------|
| `admin` | `1234` |

> 배포 후 관리 → 계정 탭에서 비밀번호를 변경하세요!

---

## 📱 공유 링크 사용법

1. 관리 메뉴 로그인
2. **🔗 공유** 탭 선택
3. 반 옆 **복사 / 문자 / 카카오** 버튼 클릭
4. 링크 전송
5. 수신자가 링크 접속 → 읽기 전용 진도 현황 확인

---

## 📦 엑셀 백업

- **내보내기**: 전체 데이터 → `진도관리_YYYYMMDD.xlsx`
  - Sheet1: 반목록 (사람이 읽을 수 있는 형태)
  - Sheet2: 진도데이터
  - Sheet3: `_raw` (불러오기용 JSON)
- **불러오기**: 백업 파일 선택 → 중복 덮어쓰기, 신규 항목 `NEW` 배지 표시

---

## 🎨 테마 팔레트

| 이름 | 강조색 |
|------|--------|
| 인디고 | `#6366f1` |
| 에메랄드 | `#10b981` |
| 앰버 | `#f59e0b` |
| 레드 | `#ef4444` |
| 바이올렛 | `#8b5cf6` |
| 핑크 | `#ec4899` |
| 시안 | `#06b6d4` |
| 오렌지 | `#f97316` |

> 색상 선택 시 배경/서피스/카드 색상이 모두 조화롭게 연동됩니다.

---

## 📁 파일 구조

```
hakwon-v4/
├── index.html          HTML 구조
├── style.css           스타일 (CSS 변수 동적 테마)
├── firebase-config.js  Firebase 설정 ← 반드시 수정!
├── db.js               하이브리드 저장소 (Firebase + localStorage)
├── app.js              앱 로직 전체
├── manifest.json       PWA 설정
└── README.md
```

---

## 📄 License

MIT — 자유롭게 사용·수정·배포 가능합니다.
