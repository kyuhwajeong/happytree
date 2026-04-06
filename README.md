# 📚 학원 진도 관리 — Academy Progress Manager

학원 수업의 주차별 진도를 반별로 입력·저장할 수 있는 **모바일 웹앱**입니다.

GitHub Pages를 통해 무료로 호스팅하며, 스마트폰 홈 화면에 추가해 앱처럼 사용할 수 있습니다.

---

## 🚀 빠른 시작 — GitHub Pages 배포

### 1단계 — 저장소 생성

1. GitHub.com 접속 → 로그인
2. 우측 상단 **[+ New repository]** 클릭
3. 저장소 이름 입력 (예: `hakwon-progress`)
4. **Public** 선택
5. **[Create repository]** 클릭

### 2단계 — 파일 업로드

저장소 메인 화면에서 **[uploading an existing file]** 클릭 후,  
아래 파일 4개를 모두 업로드:

```
index.html
style.css
db.js
app.js
manifest.json
README.md
```

업로드 후 **[Commit changes]** 클릭.

### 3단계 — GitHub Pages 활성화

1. 저장소 상단 탭 **[Settings]** 클릭
2. 좌측 메뉴 **[Pages]** 클릭
3. **Source** → `Deploy from a branch` 선택
4. **Branch** → `main` 선택, 폴더 `/` (root) 선택
5. **[Save]** 클릭

약 1~2분 후 아래 주소로 앱 접속 가능:

```
https://{GitHub 사용자명}.github.io/{저장소명}/
```

예시:
```
https://myacademy.github.io/hakwon-progress/
```

### 4단계 — 홈 화면에 추가 (선택)

**iPhone (Safari)**
> 공유 버튼 → "홈 화면에 추가"

**Android (Chrome)**
> 주소창 우측 메뉴 → "홈 화면에 추가"

---

## 📱 기능 안내

### ⚙️ 관리 메뉴

| 기능 | 설명 |
|------|------|
| 반 추가 | 반 이름, 수업 요일, 주교재·부교재 등록 |
| 반 수정 | 등록된 반 정보 변경 |
| 반 삭제 | 반 및 모든 진도 데이터 삭제 |

- 수업 요일은 **월·화·수·목·금** 중 자유롭게 선택
- 주교재·부교재는 개수 제한 없이 추가 가능

### 📅 운용 메뉴

| 기능 | 설명 |
|------|------|
| 반 선택 | 상단 칩으로 조회할 반 선택 |
| 이전/다음 주 | 버튼으로 주 단위 이동 |
| 진도 입력 | 각 요일·교재별 진도 범위 텍스트 입력 |
| 💾 저장 | 현재 주의 진도 내용 저장 |

- 저장하지 않고 주를 이동하면 확인 메시지 표시
- 이전에 저장한 주로 돌아오면 입력 내용이 자동으로 복원됨

---

## 💾 데이터 저장 방식

**브라우저 LocalStorage** 사용 (별도 서버 불필요)

| 항목 | 키 | 내용 |
|------|-----|------|
| 반 목록 | `hakwon_classes` | 반 이름·요일·교재 정보 |
| 진도 데이터 | `hakwon_progress` | 반ID·주차·요일·교재별 진도 텍스트 |

> ⚠️ 데이터는 **해당 기기·브라우저**에만 저장됩니다.  
> 여러 기기 공유가 필요하다면 Firebase 등 클라우드 DB 연동을 추천합니다.

---

## 📁 파일 구조

```
hakwon-app/
├── index.html      # 앱 HTML 구조
├── style.css       # 모바일 최적화 스타일
├── db.js           # 데이터 저장소 (localStorage)
├── app.js          # 앱 메인 로직
├── manifest.json   # PWA 메니페스트
└── README.md       # 이 문서
```

---

## 🛠 커스터마이즈

### 기본 샘플 데이터 변경

`app.js` 의 `init()` 함수 내 샘플 데이터를 수정하거나,  
앱 실행 후 **관리 메뉴**에서 직접 추가·수정하면 됩니다.

### 색상 테마 변경

`style.css` 상단의 `:root { }` 블록에서 CSS 변수를 수정하세요:

```css
--accent:  #5b8dee;  /* 주 강조색 */
--green:   #3ecf8e;  /* 저장된 진도 색 */
--orange:  #f5a623;  /* 저장 필요 알림색 */
```

---

## 📄 라이선스

MIT License — 자유롭게 사용·수정·배포 가능합니다.
