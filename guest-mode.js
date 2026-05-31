/**
 * guest-mode.js — HappyTree Guest Narration System v2.0
 * ══════════════════════════════════════════════════════
 * guest / guest 로그인 시:
 *  1. 가상 admin 세션 주입 → 모든 메뉴 탭 접근 가능
 *  2. 모든 입력·저장·삭제 동작 완전 차단 + 토스트 안내
 *  3. 각 페이지/탭 진입마다 풍부한 단계별 나레이션 표시
 *  4. 나레이션 중 "스포트라이트" 로 실제 UI 요소 하이라이트
 *  5. 상단 읽기전용 배지 + 하단 progress dot 상시 표시
 */
const GuestMode = (() => {
  'use strict';

  /* ═══ 상수 ═══ */
  const GUEST_ID   = 'guest';
  const GUEST_PW   = 'guest';
  const BADGE_ID   = 'gm-badge';
  const OVERLAY_ID = 'gm-overlay';
  const TOAST_ID   = 'gm-toast';
  const SPOT_ID    = 'gm-spotlight';

  /* ═══ 상태 ═══ */
  let _active      = false;
  let _open        = false;
  let _typeTimer   = null;
  let _autoTimer   = null;
  let _stepIdx     = 0;
  let _steps       = [];
  let _spotEl      = null;
  let _pageKey     = null;
  const _seen      = new Set();   // 세션 중 본 페이지

  /* ══════════════════════════════════════════════════════════════
   * 페이지별 나레이션 정의
   * steps: 배열. 각 step:
   *   { text, highlight, diagram, wait }
   *   text      : 나레이션 문자열 (<b> 태그 사용 가능)
   *   highlight : CSS 셀렉터 → 해당 요소에 스포트라이트
   *   diagram   : { title, svg } → 인라인 SVG 삽입
   *   wait      : 다음 스텝으로 넘어가는 대기 ms (기본 200)
   * ══════════════════════════════════════════════════════════════ */
  const NARRATIONS = {

    /* ─── 수업 진도 화면 ─── */
    operate: {
      title: '📅 수업 진도 화면',
      accentColor: '#4f46e5',
      steps: [
        {
          text: '안녕하세요! 👋\n해피트리 영어학원 <b>진도 관리 시스템</b>에 오신 걸 환영합니다.\n\n이 화면은 학원 운영의 <b>핵심 — 수업 진도 기록</b>을 담당합니다.\n우선 화면 상단의 <b>반 선택 칩</b>부터 살펴보겠습니다.',
          highlight: '.chip-bar',
          highlightLabel: '반 선택 영역',
        },
        {
          text: '👆 여기가 <b>반 선택 칩</b>입니다.\n\nH1, H2, T1 같은 반 이름이 칩 형태로 나열되어 있고,\n탭 한 번으로 원하는 반의 주간 진도로 즉시 이동합니다.\n\n수업 시간이 설정된 반은 <b>오늘 수업과 가장 가까운 반이 자동으로 선택</b>됩니다.',
          highlight: '.chip-row',
          highlightLabel: '반 칩 목록',
        },
        {
          text: '📆 이 영역은 <b>주간 네비게이터</b>입니다.\n\n"이전 / 다음" 버튼으로 원하는 주차로 이동하고,\n중앙의 📆 버튼으로 <b>달력에서 날짜를 직접 선택</b>할 수 있습니다.\n\n오늘이 포함된 주가 기본으로 표시됩니다.',
          highlight: '.wk-nav',
          highlightLabel: '주간 이동 바',
        },
        {
          diagram: {
            title: '요일 카드 — 주간 진도 구조',
            svg: `<svg viewBox="0 0 500 220" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:500px">
  <rect x="8" y="8" width="92" height="200" rx="12" fill="#ede9fe" stroke="#6366f1" stroke-width="2"/>
  <text x="54" y="32" text-anchor="middle" font-size="12" fill="#4338ca" font-weight="800">수 WED</text>
  <text x="54" y="48" text-anchor="middle" font-size="10" fill="#6b7280">6월 4일</text>
  <rect x="16" y="56" width="76" height="18" rx="5" fill="#4338ca"/>
  <text x="54" y="69" text-anchor="middle" font-size="9" fill="#fff" font-weight="700">★ 오늘 수업</text>
  <rect x="16" y="80" width="76" height="28" rx="6" fill="#ede9fe" stroke="#a5b4fc"/>
  <text x="54" y="92" text-anchor="middle" font-size="8" fill="#4338ca" font-weight="700">📘 주교재</text>
  <text x="54" y="104" text-anchor="middle" font-size="9" fill="#1e1b4b">p.32~38</text>
  <rect x="16" y="114" width="76" height="28" rx="6" fill="#f0fdf4" stroke="#86efac"/>
  <text x="54" y="126" text-anchor="middle" font-size="8" fill="#166534" font-weight="700">📗 부교재</text>
  <text x="54" y="138" text-anchor="middle" font-size="9" fill="#14532d">p.15</text>
  <rect x="16" y="148" width="76" height="44" rx="6" fill="#fef3c7" stroke="#fde68a"/>
  <text x="54" y="161" text-anchor="middle" font-size="8" fill="#92400e" font-weight="700">✏️ 메모</text>
  <text x="54" y="175" text-anchor="middle" font-size="8" fill="#78350f">숙제 p.40</text>
  <text x="54" y="188" text-anchor="middle" font-size="8" fill="#78350f">단어 20개</text>

  <rect x="108" y="8" width="92" height="200" rx="12" fill="#fff" stroke="#e2e8f0" stroke-width="1.5"/>
  <text x="154" y="32" text-anchor="middle" font-size="12" fill="#0891b2" font-weight="700">목 THU</text>
  <text x="154" y="48" text-anchor="middle" font-size="10" fill="#6b7280">6월 5일</text>
  <rect x="116" y="56" width="76" height="30" rx="6" fill="#ecfeff" stroke="#67e8f9"/>
  <text x="154" y="69" text-anchor="middle" font-size="8" fill="#0e7490" font-weight="700">📘 주교재</text>
  <text x="154" y="81" text-anchor="middle" font-size="9" fill="#164e63">p.40~46</text>
  <rect x="116" y="92" width="76" height="30" rx="6" fill="#f0fdf4" stroke="#86efac"/>
  <text x="154" y="105" text-anchor="middle" font-size="8" fill="#166534" font-weight="700">📗 부교재</text>
  <text x="154" y="117" text-anchor="middle" font-size="9" fill="#14532d">p.18</text>

  <rect x="208" y="8" width="92" height="200" rx="12" fill="#fff" stroke="#e2e8f0" stroke-width="1.5"/>
  <text x="254" y="32" text-anchor="middle" font-size="12" fill="#0891b2" font-weight="700">금 FRI</text>
  <text x="254" y="48" text-anchor="middle" font-size="10" fill="#6b7280">6월 6일</text>
  <rect x="216" y="56" width="76" height="120" rx="6" fill="#f9fafb" stroke="#e5e7eb"/>
  <text x="254" y="120" text-anchor="middle" font-size="10" fill="#9ca3af">미입력</text>

  <text x="310" y="40" font-size="11" fill="#6366f1" font-weight="700">① 진도 입력칸</text>
  <line x1="302" y1="36" x2="184" y2="90" stroke="#6366f1" stroke-width="1" stroke-dasharray="3,2"/>
  <text x="310" y="70" font-size="11" fill="#16a34a" font-weight="700">② 저장 일시 표시</text>
  <text x="310" y="100" font-size="11" fill="#f97316" font-weight="700">③ 메모 자동저장</text>
  <text x="310" y="130" font-size="11" fill="#0891b2" font-weight="700">④ 오늘 자동 포커스</text>
  <line x1="302" y1="126" x2="100" y2="60" stroke="#0891b2" stroke-width="1" stroke-dasharray="3,2"/>
</svg>`,
          },
          text: '⬆️ 이것이 <b>요일 카드</b>입니다.\n\n각 카드는 수업이 있는 요일만 생성됩니다.\n카드 안에는 <b>주교재·부교재 진도 입력칸</b>과\n<b>메모 텍스트박스</b>가 들어있습니다.\n\n진도를 입력하면 <b>1.5초 후 자동으로 Firebase에 저장</b>되고,\n저장 시각이 입력칸 아래에 기록됩니다.',
        },
        {
          text: '🔴 <b>실시간 동기화 점</b>(우측 상단 ●)을 눈여겨 보세요.\n\n● 초록 = Firebase 정상 연결\n● 주황 = 저장 중\n● 회색 = 오프라인\n\n오프라인 상태에서 입력해도 <b>로컬에 임시 저장</b>되고,\n네트워크 복구 시 자동으로 동기화됩니다.',
          highlight: '#sync-dot',
        },
        {
          text: '📊 교재 옆 <b>📊 버튼</b>을 탭하면\n해당 교재의 <b>학생별 학습 달성률 클래스카드</b>가 팝업으로 열립니다.\n\n교재 관리 화면의 체크리스트 데이터와 연동되어\n어느 학생이 몇 % 진도를 달성했는지 한눈에 확인할 수 있습니다.\n\n다음은 ⚙️ <b>관리 화면</b>으로 이동해보겠습니다.',
          highlight: '.days-scroll',
        },
      ],
    },

    /* ─── 반·교재 관리 화면 ─── */
    manage: {
      title: '⚙️ 반·교재 관리 화면',
      accentColor: '#f97316',
      steps: [
        {
          text: '⚙️ <b>관리 화면</b>입니다.\n\n학원 운영의 모든 설정을 이 한 화면에서 처리합니다.\n상단 탭 5개 — <b>반 / 계정 / 테마 / 백업 / 공유</b>로 구성됩니다.\n\n먼저 <b>📋 반 탭</b>부터 살펴보겠습니다.',
          highlight: '.mg-tabs',
          highlightLabel: '관리 탭 메뉴',
        },
        {
          text: '📋 <b>반(클래스) 관리</b> 탭입니다.\n\n① 상단 <b>📆 달력 버튼</b>으로 원하는 월로 이동합니다.\n② "＋ 반 추가" 버튼으로 새 반을 등록합니다.\n   → 반 이름, 수업 요일, 요일별 수업 시간, 편성 시작 월을 설정합니다.\n③ 반 카드에서 ✏️ 수정 / 🗑 삭제 / 📋 교재복사를 실행합니다.',
          highlight: '#mg-classes',
          highlightLabel: '반 관리 영역',
        },
        {
          diagram: {
            title: '반 카드 구조 — 교재 배정 흐름',
            svg: `<svg viewBox="0 0 490 200" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:490px">
  <defs><marker id="a1" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="#f97316"/></marker></defs>
  <!-- 교재 목록 (Pool) -->
  <rect x="8" y="8" width="148" height="182" rx="12" fill="#fff7ed" stroke="#f97316" stroke-width="1.8"/>
  <text x="82" y="30" text-anchor="middle" font-size="12" fill="#c2410c" font-weight="800">📚 교재 목록(Pool)</text>
  <rect x="16" y="38" width="132" height="26" rx="6" fill="#fed7aa"/>
  <text x="82" y="55" text-anchor="middle" font-size="10" fill="#7c2d12">수학의 정석(상)</text>
  <rect x="16" y="70" width="132" height="26" rx="6" fill="#fed7aa"/>
  <text x="82" y="87" text-anchor="middle" font-size="10" fill="#7c2d12">쎈 수학</text>
  <rect x="16" y="102" width="132" height="26" rx="6" fill="#fed7aa"/>
  <text x="82" y="119" text-anchor="middle" font-size="10" fill="#7c2d12">Grammar in Use</text>
  <rect x="16" y="138" width="132" height="22" rx="5" fill="#f3f4f6" stroke="#d1d5db"/>
  <text x="82" y="153" text-anchor="middle" font-size="9" fill="#6b7280">+ 교재명 입력 후 추가</text>
  <text x="16" y="185" font-size="9" fill="#9ca3af">長押し/드래그 → 배정</text>

  <!-- 화살표들 -->
  <line x1="156" y1="51" x2="196" y2="51" stroke="#4338ca" stroke-width="1.8" marker-end="url(#a1)"/>
  <line x1="156" y1="83" x2="196" y2="130" stroke="#166534" stroke-width="1.8" marker-end="url(#a1)"/>

  <!-- 주교재 Zone -->
  <rect x="200" y="8" width="138" height="80" rx="12" fill="#ede9fe" stroke="#6366f1" stroke-width="1.8"/>
  <text x="269" y="30" text-anchor="middle" font-size="11" fill="#4338ca" font-weight="800">📘 주교재</text>
  <rect x="208" y="36" width="122" height="22" rx="6" fill="#c7d2fe"/>
  <text x="269" y="51" text-anchor="middle" font-size="10" fill="#1e1b4b">수학의 정석(상)</text>
  <rect x="208" y="62" width="122" height="18" rx="4" fill="#e0e7ff" stroke="#a5b4fc"/>
  <text x="269" y="75" text-anchor="middle" font-size="9" fill="#3730a3">← 드래그 또는 主 버튼</text>

  <!-- 부교재 Zone -->
  <rect x="200" y="100" width="138" height="80" rx="12" fill="#f0fdf4" stroke="#16a34a" stroke-width="1.8"/>
  <text x="269" y="122" text-anchor="middle" font-size="11" fill="#166534" font-weight="800">📗 부교재</text>
  <rect x="208" y="128" width="122" height="22" rx="6" fill="#bbf7d0"/>
  <text x="269" y="143" text-anchor="middle" font-size="10" fill="#14532d">쎈 수학</text>
  <rect x="208" y="154" width="122" height="18" rx="4" fill="#dcfce7" stroke="#86efac"/>
  <text x="269" y="167" text-anchor="middle" font-size="9" fill="#14532d">← 드래그 또는 副 버튼</text>

  <!-- 우측 설명 -->
  <rect x="354" y="8" width="130" height="182" rx="10" fill="#f8fafc" stroke="#e2e8f0"/>
  <text x="419" y="28" text-anchor="middle" font-size="10" fill="#374151" font-weight="700">배정 방법</text>
  <text x="362" y="48" font-size="9" fill="#6b7280">① 교재명 입력 → 추가</text>
  <text x="362" y="66" font-size="9" fill="#6b7280">② 목록 아이템 선택</text>
  <text x="362" y="84" font-size="9" fill="#4338ca">   主 버튼 → 주교재</text>
  <text x="362" y="100" font-size="9" fill="#166534">   副 버튼 → 부교재</text>
  <text x="362" y="118" font-size="9" fill="#6b7280">③ PC: 드래그&amp;드롭</text>
  <text x="362" y="136" font-size="9" fill="#6b7280">   모바일: 길게 누르기</text>
  <text x="362" y="158" font-size="9" fill="#f97316">④ 📋 다른 반 교재</text>
  <text x="362" y="174" font-size="9" fill="#f97316">   복사 기능 지원</text>
</svg>`,
          },
          text: '⬆️ 교재 배정 흐름입니다.\n\n<b>교재 목록(Pool)</b>에 교재를 추가한 뒤,\n드래그 또는 主/副 버튼으로 <b>주교재·부교재 영역에 배정</b>합니다.\n\n배정된 교재는 진도 화면의 요일 카드에 즉시 반영됩니다.',
        },
        {
          text: '👤 이제 <b>계정 탭</b>입니다.\n\n세 가지 역할(권한)로 계정을 관리합니다:\n\n• <b style="color:#ef4444">admin (관리자)</b> — 모든 기능 사용\n• <b style="color:#f97316">operator (운용자)</b> — 진도 입력만\n• <b style="color:#8b5cf6">teacher (강사)</b> — 지정 반 진도 입력\n  + 관리자가 허용한 교재·성적 메뉴 접근',
          highlight: null,
        },
        {
          diagram: {
            title: '계정 권한 체계',
            svg: `<svg viewBox="0 0 480 160" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:480px">
  <rect x="8" y="8" width="140" height="140" rx="12" fill="#fee2e2" stroke="#ef4444" stroke-width="2"/>
  <text x="78" y="35" text-anchor="middle" font-size="13" fill="#b91c1c" font-weight="900">admin</text>
  <text x="78" y="52" text-anchor="middle" font-size="10" fill="#7f1d1d">관리자</text>
  <text x="20" y="72" font-size="9" fill="#b91c1c">✅ 반 추가/수정/삭제</text>
  <text x="20" y="88" font-size="9" fill="#b91c1c">✅ 계정 관리</text>
  <text x="20" y="104" font-size="9" fill="#b91c1c">✅ 테마/백업</text>
  <text x="20" y="120" font-size="9" fill="#b91c1c">✅ 진도/교재/성적</text>
  <text x="20" y="136" font-size="9" fill="#b91c1c">✅ 학생/직원 관리</text>

  <rect x="168" y="8" width="140" height="140" rx="12" fill="#fff7ed" stroke="#f97316" stroke-width="2"/>
  <text x="238" y="35" text-anchor="middle" font-size="13" fill="#c2410c" font-weight="900">operator</text>
  <text x="238" y="52" text-anchor="middle" font-size="10" fill="#7c2d12">운용자</text>
  <text x="178" y="72" font-size="9" fill="#c2410c">✅ 진도 입력</text>
  <text x="178" y="88" font-size="9" fill="#6b7280">❌ 반 관리</text>
  <text x="178" y="104" font-size="9" fill="#6b7280">❌ 계정 관리</text>
  <text x="178" y="120" font-size="9" fill="#6b7280">❌ 학생/직원</text>

  <rect x="328" y="8" width="144" height="140" rx="12" fill="#f5f3ff" stroke="#8b5cf6" stroke-width="2"/>
  <text x="400" y="35" text-anchor="middle" font-size="13" fill="#6d28d9" font-weight="900">teacher</text>
  <text x="400" y="52" text-anchor="middle" font-size="10" fill="#4c1d95">강사</text>
  <text x="338" y="72" font-size="9" fill="#6d28d9">✅ 담당 반 진도 입력</text>
  <text x="338" y="88" font-size="9" fill="#6d28d9">✅ 허용된 교재메뉴</text>
  <text x="338" y="104" font-size="9" fill="#6d28d9">✅ 허용된 성적메뉴</text>
  <text x="338" y="120" font-size="9" fill="#6b7280">❌ 다른 반 데이터</text>
  <text x="338" y="136" font-size="9" fill="#6b7280">❌ 관리/학생/직원</text>
</svg>`,
          },
          text: '권한 체계를 도식화한 것입니다.\n\n<b>강사 계정</b>의 경우, 관리자가\n① 담당 반과 ② 추가 메뉴(교재·성적)를 개별 지정할 수 있습니다.\n\n강사는 자신의 <b>담당 반 데이터에만 접근</b>이 가능합니다.',
        },
        {
          text: '🎨 <b>테마 탭</b>에서는 앱 전체의 비주얼을 조절합니다.\n\n• 화이트 / 페이퍼 / <b>다크</b> / 슬레이트 4가지 색상 테마\n• 나눔고딕 / 나눔명조 / IBM Plex 등 <b>4종 폰트</b>\n• 글자 크기 / 주교재·부교재 개별 크기 / 진도 입력칸 너비\n• 운용화면 그리드/리스트 보기 전환\n• 탭 순서 드래그 정렬',
          highlight: null,
        },
        {
          text: '📦 <b>백업 탭</b>에서는 데이터를 안전하게 보관합니다.\n\n• <b>Excel 내보내기</b> — 반·교재·진도 전체를 .xlsx로 다운로드\n• <b>Excel 가져오기</b> — 이전 백업 파일에서 데이터 복원\n\n🔗 <b>공유 탭</b>에서는 현재 주 진도를 링크로 생성합니다.\n학부모나 원장님께 링크를 공유하면 실시간으로 확인 가능합니다.',
          highlight: null,
        },
      ],
    },

    /* ─── 교재 학습 관리 ─── */
    booklib: {
      title: '📖 교재 학습 관리 화면',
      accentColor: '#0891b2',
      steps: [
        {
          text: '📖 <b>교재 학습 관리</b> 화면입니다.\n\n교재별 챕터·유닛 단위로 <b>학생별 학습 체크리스트</b>를 관리하고,\n단어 스탬프, AI 문제 생성, 학습 리포트까지 제공하는\n이 시스템의 핵심 학습 관리 모듈입니다.\n\n화면 상단 탭부터 살펴보겠습니다.',
          highlight: '.bl-stabs',
          highlightLabel: '교재 관리 탭',
        },
        {
          text: '📚 첫 번째는 <b>교재 라이브러리 탭</b>입니다.\n\n여기에 교재를 등록하고 챕터(단원)를 설정합니다.\n\n• 교재명 입력 후 추가 → 카드로 표시\n• 카드를 탭하면 <b>챕터 편집 모달</b>이 열립니다\n• 챕터는 직접 입력하거나, AI가 교재명 기반으로 <b>자동 생성</b>합니다\n• 교재별 성적 설정(단어 문항수·리딩 체크)도 여기서 구성',
          highlight: '#page-booklib',
          highlightLabel: '교재 학습 관리 전체',
        },
        {
          diagram: {
            title: '교재 학습 매트릭스 — 학생 × 챕터 체크리스트',
            svg: `<svg viewBox="0 0 490 200" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:490px">
  <!-- 헤더 행 -->
  <rect x="8" y="8" width="80" height="32" rx="6" fill="#0891b2"/>
  <text x="48" y="28" text-anchor="middle" font-size="10" fill="#fff" font-weight="700">학생 / 챕터</text>
  <rect x="92" y="8" width="56" height="32" rx="6" fill="#0e7490"/>
  <text x="120" y="28" text-anchor="middle" font-size="10" fill="#fff">Ch.1</text>
  <rect x="152" y="8" width="56" height="32" rx="6" fill="#0e7490"/>
  <text x="180" y="28" text-anchor="middle" font-size="10" fill="#fff">Ch.2</text>
  <rect x="212" y="8" width="56" height="32" rx="6" fill="#0e7490"/>
  <text x="240" y="28" text-anchor="middle" font-size="10" fill="#fff">Ch.3</text>
  <rect x="272" y="8" width="56" height="32" rx="6" fill="#0e7490"/>
  <text x="300" y="28" text-anchor="middle" font-size="10" fill="#fff">Ch.4</text>
  <rect x="332" y="8" width="56" height="32" rx="6" fill="#0e7490"/>
  <text x="360" y="28" text-anchor="middle" font-size="10" fill="#fff">Ch.5</text>
  <rect x="392" y="8" width="90" height="32" rx="6" fill="#164e63"/>
  <text x="437" y="28" text-anchor="middle" font-size="10" fill="#a5f3fc">달성률</text>

  <!-- 학생 행 1 -->
  <rect x="8" y="44" width="80" height="32" rx="6" fill="#f0fdfa" stroke="#67e8f9"/>
  <text x="48" y="64" text-anchor="middle" font-size="10" fill="#0e7490" font-weight="700">김민준</text>
  <rect x="92" y="44" width="56" height="32" rx="6" fill="#dcfce7"/>
  <text x="120" y="64" text-anchor="middle" font-size="14">✅</text>
  <rect x="152" y="44" width="56" height="32" rx="6" fill="#dcfce7"/>
  <text x="180" y="64" text-anchor="middle" font-size="14">✅</text>
  <rect x="212" y="44" width="56" height="32" rx="6" fill="#dcfce7"/>
  <text x="240" y="64" text-anchor="middle" font-size="14">✅</text>
  <rect x="272" y="44" width="56" height="32" rx="6" fill="#fef9c3"/>
  <text x="300" y="64" text-anchor="middle" font-size="14">🔵</text>
  <rect x="332" y="44" width="56" height="32" rx="6" fill="#f9fafb" stroke="#e5e7eb"/>
  <text x="360" y="64" text-anchor="middle" font-size="12" fill="#9ca3af">—</text>
  <rect x="392" y="44" width="90" height="32" rx="6" fill="#d1fae5"/>
  <text x="437" y="60" text-anchor="middle" font-size="11" fill="#065f46" font-weight="800">75%</text>
  <rect x="396" y="68" width="52" height="6" rx="3" fill="#86efac"/>
  <rect x="396" y="68" width="39" height="6" rx="3" fill="#22c55e"/>

  <!-- 학생 행 2 -->
  <rect x="8" y="80" width="80" height="32" rx="6" fill="#f0fdfa" stroke="#67e8f9"/>
  <text x="48" y="100" text-anchor="middle" font-size="10" fill="#0e7490" font-weight="700">이서연</text>
  <rect x="92" y="80" width="56" height="32" rx="6" fill="#dcfce7"/>
  <text x="120" y="100" text-anchor="middle" font-size="14">✅</text>
  <rect x="152" y="80" width="56" height="32" rx="6" fill="#dcfce7"/>
  <text x="180" y="100" text-anchor="middle" font-size="14">✅</text>
  <rect x="212" y="80" width="56" height="32" rx="6" fill="#dcfce7"/>
  <text x="240" y="100" text-anchor="middle" font-size="14">✅</text>
  <rect x="272" y="80" width="56" height="32" rx="6" fill="#dcfce7"/>
  <text x="300" y="100" text-anchor="middle" font-size="14">✅</text>
  <rect x="332" y="80" width="56" height="32" rx="6" fill="#dcfce7"/>
  <text x="360" y="100" text-anchor="middle" font-size="14">✅</text>
  <rect x="392" y="80" width="90" height="32" rx="6" fill="#d1fae5"/>
  <text x="437" y="96" text-anchor="middle" font-size="11" fill="#065f46" font-weight="800">100%</text>
  <rect x="396" y="104" width="52" height="6" rx="3" fill="#22c55e"/>

  <!-- 학생 행 3 -->
  <rect x="8" y="116" width="80" height="32" rx="6" fill="#f0fdfa" stroke="#67e8f9"/>
  <text x="48" y="136" text-anchor="middle" font-size="10" fill="#0e7490" font-weight="700">박지호</text>
  <rect x="92" y="116" width="56" height="32" rx="6" fill="#dcfce7"/>
  <text x="120" y="136" text-anchor="middle" font-size="14">✅</text>
  <rect x="152" y="116" width="56" height="32" rx="6" fill="#f9fafb" stroke="#e5e7eb"/>
  <text x="180" y="136" text-anchor="middle" font-size="12" fill="#9ca3af">—</text>
  <rect x="212" y="116" width="56" height="32" rx="6" fill="#f9fafb" stroke="#e5e7eb"/>
  <text x="240" y="136" text-anchor="middle" font-size="12" fill="#9ca3af">—</text>
  <rect x="272" y="116" width="56" height="32" rx="6" fill="#f9fafb" stroke="#e5e7eb"/>
  <text x="300" y="136" text-anchor="middle" font-size="12" fill="#9ca3af">—</text>
  <rect x="332" y="116" width="56" height="32" rx="6" fill="#f9fafb" stroke="#e5e7eb"/>
  <text x="360" y="136" text-anchor="middle" font-size="12" fill="#9ca3af">—</text>
  <rect x="392" y="116" width="90" height="32" rx="6" fill="#fee2e2"/>
  <text x="437" y="132" text-anchor="middle" font-size="11" fill="#b91c1c" font-weight="800">20%</text>
  <rect x="396" y="140" width="52" height="6" rx="3" fill="#fecaca"/>
  <rect x="396" y="140" width="10" height="6" rx="3" fill="#ef4444"/>

  <!-- 범례 -->
  <text x="16" y="168" font-size="9" fill="#22c55e" font-weight="700">✅ 완료</text>
  <text x="60" y="168" font-size="9" fill="#0891b2" font-weight="700">🔵 진행중</text>
  <text x="110" y="168" font-size="9" fill="#9ca3af">— 미완</text>
  <text x="180" y="168" font-size="9" fill="#6b7280">탭 한 번으로 상태 토글</text>
  <text x="320" y="168" font-size="9" fill="#6b7280">반 × 교재 × 학생 조합</text>
</svg>`,
          },
          text: '⬆️ <b>학습 체크 매트릭스</b>입니다.\n\n가로 = 챕터, 세로 = 학생.\n각 셀을 탭하면 <b>미완료 → 진행중(🔵) → 완료(✅)</b>로 순환합니다.\n\n오른쪽 끝 <b>달성률 컬럼</b>에 진행 바가 실시간으로 업데이트됩니다.',
        },
        {
          text: '🤖 <b>AI 기능 (Gemini)</b>을 활용하면:\n\n• 교재명을 기반으로 <b>챕터 목록을 자동 생성</b>합니다\n• 학습한 챕터 내용으로 <b>단어·문법 퀴즈를 자동 생성</b>합니다\n• 학생별 학습 현황 분석 코멘트도 생성합니다\n\n⚠️ AI 기능 사용 시 Gemini API 키가 설정되어 있어야 합니다.',
          highlight: '#page-booklib',
        },
        {
          text: '📊 <b>스탬프 보드</b> 탭은\n학생이 챕터를 완료할 때마다 스탬프가 찍히는 시각적 동기부여 도구입니다.\n\n📋 <b>리포트 탭</b>에서는\n학생별 학습 달성 현황을 PDF/링크로 생성해\n학부모에게 공유할 수 있습니다.',
          highlight: '#page-booklib',
        },
      ],
    },

    /* ─── 성적 관리 ─── */
    grade: {
      title: '📝 성적 관리 화면',
      accentColor: '#16a34a',
      steps: [
        {
          text: '📝 <b>성적 관리</b> 화면입니다.\n\n단어 시험과 리딩 시험 점수를 반·교재별로 입력하고,\n통계 분석과 성적 리포트까지 생성하는 종합 성적 관리 모듈입니다.\n\n먼저 상단 툴바를 살펴보겠습니다.',
          highlight: '.gr-toolbar',
          highlightLabel: '성적 관리 툴바',
        },
        {
          text: '🎯 <b>반 선택 → 교재 선택</b> 드롭다운으로 원하는 시험 데이터를 불러옵니다.\n\n우측에는 보기 전환 버튼이 있습니다:\n• <b>Excel 모드</b> — 스프레드시트 형태로 여러 학생 동시 입력\n• <b>카드 모드</b> — 학생별 카드 형태, 슬라이드로 이동\n\n마지막에 <b>💾 저장</b> 버튼으로 일괄 저장합니다.',
          highlight: '.gr-toolbar',
          highlightLabel: '반·교재 선택 & 보기 전환',
        },
        {
          diagram: {
            title: '성적 입력 — Excel 모드 구조',
            svg: `<svg viewBox="0 0 490 195" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:490px">
  <!-- 헤더 -->
  <rect x="8" y="8" width="60" height="28" rx="5" fill="#166534"/>
  <text x="38" y="26" text-anchor="middle" font-size="10" fill="#fff" font-weight="700">학생</text>
  <rect x="72" y="8" width="90" height="28" rx="5" fill="#1e40af"/>
  <text x="117" y="26" text-anchor="middle" font-size="10" fill="#fff">단어 시험</text>
  <rect x="72" y="8" width="90" height="14" rx="5" fill="#1e40af"/>
  <rect x="72" y="22" width="44" height="14" fill="#1d4ed8"/>
  <text x="94" y="33" text-anchor="middle" font-size="8" fill="#bfdbfe">오답수</text>
  <rect x="118" y="22" width="44" height="14" fill="#1d4ed8"/>
  <text x="140" y="33" text-anchor="middle" font-size="8" fill="#bfdbfe">달성률</text>
  <rect x="166" y="8" width="200" height="28" rx="5" fill="#7c3aed"/>
  <text x="266" y="19" text-anchor="middle" font-size="10" fill="#fff">리딩 (Review 1~4)</text>
  <rect x="166" y="22" width="46" height="14" fill="#6d28d9"/>
  <text x="189" y="33" text-anchor="middle" font-size="8" fill="#ddd6fe">R1</text>
  <rect x="214" y="22" width="46" height="14" fill="#6d28d9"/>
  <text x="237" y="33" text-anchor="middle" font-size="8" fill="#ddd6fe">R2</text>
  <rect x="262" y="22" width="46" height="14" fill="#6d28d9"/>
  <text x="285" y="33" text-anchor="middle" font-size="8" fill="#ddd6fe">R3</text>
  <rect x="310" y="22" width="56" height="14" fill="#6d28d9"/>
  <text x="338" y="33" text-anchor="middle" font-size="8" fill="#ddd6fe">달성률</text>
  <rect x="370" y="8" width="112" height="28" rx="5" fill="#0e7490"/>
  <text x="426" y="26" text-anchor="middle" font-size="10" fill="#fff">Teacher Comment</text>

  <!-- 데이터 행 1 -->
  <rect x="8" y="40" width="60" height="28" rx="5" fill="#f0fdf4" stroke="#86efac"/>
  <text x="38" y="58" text-anchor="middle" font-size="10" fill="#166534" font-weight="700">김민준</text>
  <rect x="72" y="40" width="44" height="28" rx="5" fill="#fff" stroke="#d1d5db"/>
  <text x="94" y="58" text-anchor="middle" font-size="11" fill="#dc2626" font-weight="700">3</text>
  <rect x="118" y="40" width="44" height="28" rx="5" fill="#dcfce7"/>
  <text x="140" y="58" text-anchor="middle" font-size="11" fill="#166534" font-weight="700">85%</text>
  <rect x="166" y="40" width="46" height="28" rx="5" fill="#fff" stroke="#d1d5db"/>
  <text x="189" y="58" text-anchor="middle" font-size="11" fill="#1e1b4b">18</text>
  <rect x="214" y="40" width="46" height="28" rx="5" fill="#fff" stroke="#d1d5db"/>
  <text x="237" y="58" text-anchor="middle" font-size="11" fill="#1e1b4b">22</text>
  <rect x="262" y="40" width="46" height="28" rx="5" fill="#fff" stroke="#d1d5db"/>
  <text x="285" y="58" text-anchor="middle" font-size="11" fill="#1e1b4b">20</text>
  <rect x="310" y="40" width="56" height="28" rx="5" fill="#dcfce7"/>
  <text x="338" y="58" text-anchor="middle" font-size="11" fill="#166534" font-weight="700">90%</text>
  <rect x="370" y="40" width="112" height="28" rx="5" fill="#ecfeff" stroke="#67e8f9"/>
  <text x="426" y="55" text-anchor="middle" font-size="9" fill="#0e7490">단어 실력 향상 중.</text>
  <text x="426" y="67" text-anchor="middle" font-size="9" fill="#0e7490">리딩 집중 권장</text>

  <!-- 데이터 행 2 -->
  <rect x="8" y="72" width="60" height="28" rx="5" fill="#f0fdf4" stroke="#86efac"/>
  <text x="38" y="90" text-anchor="middle" font-size="10" fill="#166534" font-weight="700">이서연</text>
  <rect x="72" y="72" width="44" height="28" rx="5" fill="#fff" stroke="#d1d5db"/>
  <text x="94" y="90" text-anchor="middle" font-size="11" fill="#dc2626" font-weight="700">1</text>
  <rect x="118" y="72" width="44" height="28" rx="5" fill="#dcfce7"/>
  <text x="140" y="90" text-anchor="middle" font-size="11" fill="#166534" font-weight="700">97%</text>
  <rect x="166" y="72" width="46" height="28" rx="5" fill="#fff" stroke="#d1d5db"/>
  <text x="189" y="90" text-anchor="middle" font-size="11" fill="#1e1b4b">25</text>
  <rect x="214" y="72" width="46" height="28" rx="5" fill="#fff" stroke="#d1d5db"/>
  <text x="237" y="90" text-anchor="middle" font-size="11" fill="#1e1b4b">25</text>
  <rect x="262" y="72" width="46" height="28" rx="5" fill="#fff" stroke="#d1d5db"/>
  <text x="285" y="90" text-anchor="middle" font-size="11" fill="#1e1b4b">24</text>
  <rect x="310" y="72" width="56" height="28" rx="5" fill="#dcfce7"/>
  <text x="338" y="90" text-anchor="middle" font-size="11" fill="#166534" font-weight="700">98%</text>
  <rect x="370" y="72" width="112" height="28" rx="5" fill="#ecfeff" stroke="#67e8f9"/>
  <text x="426" y="90" text-anchor="middle" font-size="9" fill="#0e7490">최우수. 심화학습</text>

  <!-- 평균 행 -->
  <rect x="8" y="104" width="474" height="28" rx="5" fill="#fef3c7" stroke="#fde68a"/>
  <text x="38" y="122" text-anchor="middle" font-size="10" fill="#92400e" font-weight="800">반 평균</text>
  <text x="140" y="122" text-anchor="middle" font-size="11" fill="#92400e" font-weight="700">88%</text>
  <text x="338" y="122" text-anchor="middle" font-size="11" fill="#92400e" font-weight="700">91%</text>

  <!-- 차트 영역 -->
  <rect x="8" y="136" width="474" height="52" rx="8" fill="#f8fafc" stroke="#e2e8f0"/>
  <text x="16" y="153" font-size="9" fill="#6b7280" font-weight="700">점수 분포 차트</text>
  <rect x="60" y="148" width="14" height="32" rx="3" fill="#6366f1"/>
  <rect x="78" y="140" width="14" height="40" rx="3" fill="#6366f1" opacity=".8"/>
  <rect x="96" y="144" width="14" height="36" rx="3" fill="#6366f1" opacity=".6"/>
  <rect x="114" y="152" width="14" height="28" rx="3" fill="#6366f1" opacity=".4"/>
  <rect x="132" y="158" width="14" height="22" rx="3" fill="#6366f1" opacity=".3"/>
  <text x="60" y="190" font-size="8" fill="#9ca3af">김민준</text>
  <text x="78" y="190" font-size="8" fill="#9ca3af">이서연</text>
  <rect x="200" y="148" width="14" height="32" rx="3" fill="#8b5cf6"/>
  <rect x="218" y="135" width="14" height="45" rx="3" fill="#8b5cf6" opacity=".7"/>
  <rect x="236" y="143" width="14" height="37" rx="3" fill="#8b5cf6" opacity=".5"/>
  <text x="300" y="165" font-size="9" fill="#6b7280">단어(보라) / 리딩(남색) 비교</text>
</svg>`,
          },
          text: '⬆️ <b>Excel 모드 성적 입력표</b>입니다.\n\n• <b>단어 시험</b>: 오답 수 입력 → 달성률 자동 계산\n• <b>리딩</b>: Review별 정답 수 입력 → 점수·달성률 자동 계산\n• <b>Teacher Comment</b>: 학생별 코멘트 작성\n• Enter 키로 다음 학생으로 이동\n• 우클릭 → 저장/초기화 컨텍스트 메뉴',
        },
        {
          text: '📈 <b>통계 및 리포트</b> 기능입니다.\n\n• 반 평균·최고점·최저점 자동 계산\n• 점수 분포 막대 차트 실시간 업데이트\n• <b>성적 리포트 생성</b> — PDF/링크로 학부모 공유\n• 리포트 디자인 커스터마이즈 (폰트·배경색·레이아웃 등)\n• AI 코멘트 자동 생성 기능',
          highlight: '#page-grade',
        },
      ],
    },

    /* ─── 학생 관리 ─── */
    students: {
      title: '👨‍🎓 학생 관리 화면',
      accentColor: '#7c3aed',
      steps: [
        {
          text: '👨‍🎓 <b>학생 관리</b> 화면입니다.\n\n학원에 재원 중인 모든 학생의 정보를 등록하고\n재원 상태·반 배정·연락처를 체계적으로 관리합니다.\n\n상단 통계 카드부터 확인해보겠습니다.',
          highlight: '#page-students',
          highlightLabel: '학생 관리 화면',
        },
        {
          text: '📊 <b>상단 통계 카드</b>에서 현황을 한눈에 파악합니다.\n\n탭 한 번으로 해당 상태의 학생만 필터링됩니다:\n• <b>전체</b> / <b style="color:#16a34a">재원</b> / <b style="color:#f59e0b">휴원</b> / <b style="color:#ef4444">퇴원</b>\n\n검색창에 이름·닉네임·전화번호를 입력하면\n실시간으로 필터링됩니다.',
          highlight: '#page-students',
          highlightLabel: '통계 카드 & 검색 영역',
        },
        {
          diagram: {
            title: '학생 등록 & 상태 관리 흐름',
            svg: `<svg viewBox="0 0 490 175" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:490px">
  <defs>
    <marker id="a2" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="#7c3aed"/></marker>
    <marker id="a3" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="#ef4444"/></marker>
    <marker id="a4" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="#16a34a"/></marker>
  </defs>

  <!-- 등록 -->
  <rect x="8" y="55" width="96" height="56" rx="10" fill="#f5f3ff" stroke="#7c3aed" stroke-width="2"/>
  <text x="56" y="79" text-anchor="middle" font-size="12" fill="#5b21b6" font-weight="800">➕ 등록</text>
  <text x="56" y="95" text-anchor="middle" font-size="9" fill="#7c3aed">이름·학년·학교</text>
  <text x="56" y="107" text-anchor="middle" font-size="9" fill="#7c3aed">반·연락처 입력</text>

  <line x1="104" y1="83" x2="138" y2="83" stroke="#7c3aed" stroke-width="1.8" marker-end="url(#a2)"/>

  <!-- 재원 -->
  <rect x="140" y="55" width="96" height="56" rx="10" fill="#dcfce7" stroke="#16a34a" stroke-width="2"/>
  <text x="188" y="79" text-anchor="middle" font-size="12" fill="#166534" font-weight="800">✅ 재원</text>
  <text x="188" y="95" text-anchor="middle" font-size="9" fill="#166534">수업 진행 중</text>
  <text x="188" y="107" text-anchor="middle" font-size="9" fill="#166534">기본 상태</text>

  <!-- 재원 → 휴원 -->
  <line x1="238" y1="71" x2="280" y2="40" stroke="#f59e0b" stroke-width="1.5" marker-end="url(#a2)" stroke-dasharray="4,3"/>
  <!-- 휴원 -->
  <rect x="280" y="14" width="96" height="48" rx="10" fill="#fef3c7" stroke="#f59e0b" stroke-width="1.5"/>
  <text x="328" y="36" text-anchor="middle" font-size="11" fill="#92400e" font-weight="800">😴 휴원</text>
  <text x="328" y="52" text-anchor="middle" font-size="9" fill="#92400e">일시 중단</text>
  <!-- 휴원 → 재원 복귀 -->
  <line x1="280" y1="52" x2="238" y2="83" stroke="#16a34a" stroke-width="1.5" stroke-dasharray="3,2" marker-end="url(#a4)"/>

  <!-- 재원 → 퇴원 -->
  <line x1="238" y1="95" x2="280" y2="118" stroke="#ef4444" stroke-width="1.5" marker-end="url(#a3)"/>
  <!-- 퇴원 -->
  <rect x="280" y="112" width="96" height="48" rx="10" fill="#fee2e2" stroke="#ef4444" stroke-width="1.5"/>
  <text x="328" y="134" text-anchor="middle" font-size="11" fill="#b91c1c" font-weight="800">🚪 퇴원</text>
  <text x="328" y="150" text-anchor="middle" font-size="9" fill="#b91c1c">종료 처리</text>

  <!-- 우측 기능 설명 -->
  <rect x="390" y="8" width="96" height="160" rx="10" fill="#faf5ff" stroke="#c4b5fd"/>
  <text x="438" y="28" text-anchor="middle" font-size="10" fill="#5b21b6" font-weight="700">추가 기능</text>
  <text x="398" y="46" font-size="8" fill="#6d28d9">📥 Excel 대량 등록</text>
  <text x="398" y="62" font-size="8" fill="#6d28d9">🔍 이름/전화 검색</text>
  <text x="398" y="78" font-size="8" fill="#6d28d9">🏷 반별 그룹 표시</text>
  <text x="398" y="94" font-size="8" fill="#6d28d9">📊 재원 통계 카드</text>
  <text x="398" y="110" font-size="8" fill="#6d28d9">📋 학년·학교 필터</text>
  <text x="398" y="126" font-size="8" fill="#6d28d9">✏️ 상세 정보 편집</text>
  <text x="398" y="142" font-size="8" fill="#6d28d9">📤 Excel 내보내기</text>
  <text x="398" y="158" font-size="8" fill="#6d28d9">💬 학생 메모</text>
</svg>`,
          },
          text: '⬆️ 학생 등록부터 상태 관리까지의 흐름입니다.\n\n• 학생 카드를 탭하면 <b>상세 정보 편집 모달</b>이 열립니다\n• 재원 상태는 드롭다운으로 즉시 변경 가능합니다\n• <b>Excel 드래그앤드롭</b>으로 학생 목록 일괄 등록이 가능합니다',
        },
        {
          text: '🏷️ 학생 목록은 <b>반별로 그룹핑</b>되어 표시됩니다.\n\n그룹 헤더에 해당 반의 재원 학생 수가 표시되고,\n반 이름을 탭하면 해당 반만 펼침/접힘 됩니다.\n\n오른쪽 상단의 <b>⊞ 그리드 / ☰ 리스트</b> 전환 버튼으로\n학생 카드의 표시 방식을 바꿀 수 있습니다.',
          highlight: '#page-students',
        },
      ],
    },

    /* ─── 직원 관리 ─── */
    staff: {
      title: '👩‍💼 직원 관리 화면',
      accentColor: '#0f766e',
      steps: [
        {
          text: '👩‍💼 <b>직원 관리</b> 화면입니다.\n\n강사·직원의 인사 정보, 출퇴근 기록, 급여 계산, 업무 일정을\n통합 관리하는 화면입니다.\n\n세 개의 서브탭 — <b>직원 목록 / 근무 달력 / ⚡ 즉시 시급계산기</b>로 구성됩니다.',
          highlight: '#page-staff',
          highlightLabel: '직원 관리 화면',
        },
        {
          text: '📋 <b>직원 목록 탭</b>에서 직원 카드를 관리합니다.\n\n각 카드에 입력 가능한 정보:\n• 이름, 직책 (정직원/알바), 입사일\n• 전화번호, 이메일\n• 기본 시급 / 월급\n• 업무 유형별 시급 (일반 / 수업)\n\n직원 카드를 탭하면 상세 편집 모달이 열립니다.',
          highlight: '#page-staff',
          highlightLabel: '직원 목록 영역',
        },
        {
          diagram: {
            title: '직원 관리 시스템 구조',
            svg: `<svg viewBox="0 0 490 180" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:490px">
  <!-- 중앙 허브 -->
  <circle cx="245" cy="90" r="52" fill="#ccfbf1" stroke="#0f766e" stroke-width="2.5"/>
  <text x="245" y="85" text-anchor="middle" font-size="14" fill="#134e4a" font-weight="900">👩‍💼</text>
  <text x="245" y="102" text-anchor="middle" font-size="11" fill="#134e4a" font-weight="700">직원 관리</text>

  <!-- 좌상 -->
  <rect x="8" y="8" width="110" height="62" rx="10" fill="#f0fdfa" stroke="#0f766e" stroke-width="1.5"/>
  <text x="63" y="28" text-anchor="middle" font-size="10" fill="#134e4a" font-weight="700">📋 인사 정보</text>
  <text x="63" y="44" text-anchor="middle" font-size="9" fill="#0f766e">직책·연락처</text>
  <text x="63" y="58" text-anchor="middle" font-size="9" fill="#0f766e">입사일·고용형태</text>
  <line x1="118" y1="48" x2="192" y2="72" stroke="#0f766e" stroke-width="1.2" stroke-dasharray="4,3"/>

  <!-- 좌하 -->
  <rect x="8" y="110" width="110" height="62" rx="10" fill="#f0fdfa" stroke="#0f766e" stroke-width="1.5"/>
  <text x="63" y="130" text-anchor="middle" font-size="10" fill="#134e4a" font-weight="700">⏰ 근무 달력</text>
  <text x="63" y="146" text-anchor="middle" font-size="9" fill="#0f766e">출퇴근 시간 기록</text>
  <text x="63" y="160" text-anchor="middle" font-size="9" fill="#0f766e">월별 달력 뷰</text>
  <line x1="118" y1="140" x2="192" y2="108" stroke="#0f766e" stroke-width="1.2" stroke-dasharray="4,3"/>

  <!-- 우상 -->
  <rect x="372" y="8" width="110" height="62" rx="10" fill="#f0fdfa" stroke="#0f766e" stroke-width="1.5"/>
  <text x="427" y="28" text-anchor="middle" font-size="10" fill="#134e4a" font-weight="700">💰 급여 계산</text>
  <text x="427" y="44" text-anchor="middle" font-size="9" fill="#0f766e">근무시간 자동합산</text>
  <text x="427" y="58" text-anchor="middle" font-size="9" fill="#0f766e">주휴수당 계산</text>
  <line x1="372" y1="48" x2="298" y2="72" stroke="#0f766e" stroke-width="1.2" stroke-dasharray="4,3"/>

  <!-- 우하 -->
  <rect x="372" y="110" width="110" height="62" rx="10" fill="#fef3c7" stroke="#f59e0b" stroke-width="1.5"/>
  <text x="427" y="128" text-anchor="middle" font-size="10" fill="#92400e" font-weight="700">⚡ 즉시 계산기</text>
  <text x="427" y="144" text-anchor="middle" font-size="9" fill="#92400e">직원 없이 즉시</text>
  <text x="427" y="160" text-anchor="middle" font-size="9" fill="#92400e">시급 정산</text>
  <line x1="372" y1="140" x2="298" y2="108" stroke="#f59e0b" stroke-width="1.2" stroke-dasharray="4,3"/>
</svg>`,
          },
          text: '직원 관리 시스템의 4개 핵심 기능입니다.\n\n특히 <b>⚡ 즉시 시급 계산기</b>는\n직원 등록 없이도 날짜와 시간대만 입력하면\n<b>분(分) 단위 정밀 급여 계산</b>이 즉시 가능합니다.',
        },
        {
          text: '⏰ <b>근무 달력 탭</b>에서 출퇴근 기록을 관리합니다.\n\n• 날짜를 탭해 근무 시작·종료 시간 입력\n• 일괄 등록: 날짜 범위 + 요일 선택으로 한번에 등록\n• 주휴수당 달성 현황 진행 바 표시\n\n💰 <b>급여 계산</b>에서는\n해당 월의 근무 데이터를 집계해 급여를 자동 계산하고\nExcel로 다운로드할 수 있습니다.',
          highlight: '#page-staff',
        },
      ],
    },

  }; // END NARRATIONS

  /* ═══════════════════════════════════════════════
   * CSS 주입
   * ══════════════════════════════════════════════ */
  function _injectCSS() {
    if (document.getElementById('gm-css')) return;
    const s = document.createElement('style');
    s.id = 'gm-css';
    s.textContent = `
/* ── 읽기전용 배지 ── */
#gm-badge {
  position:fixed; top:0; left:0; right:0; z-index:9998;
  background:linear-gradient(90deg,#f97316 0%,#ef4444 100%);
  color:#fff; font-size:12px; font-weight:800;
  padding:5px 14px;
  display:flex; align-items:center; justify-content:center; gap:8px;
  box-shadow:0 2px 16px rgba(249,115,22,.4);
  letter-spacing:.3px; user-select:none;
}
#gm-badge .gm-b-icon { font-size:13px; }
#gm-badge .gm-b-x {
  margin-left:auto; background:rgba(255,255,255,.25); border:none;
  color:#fff; border-radius:50%; width:20px; height:20px;
  cursor:pointer; font-size:13px; display:flex;
  align-items:center; justify-content:center;
  transition:background .15s; flex-shrink:0;
}
#gm-badge .gm-b-x:hover { background:rgba(255,255,255,.45); }
body.gm-on { padding-top:30px !important; }

/* ── 오버레이 (배경은 SVG 마스크가 담당 — 여기선 투명) ── */
#gm-overlay {
  position:fixed; inset:0; z-index:8800;
  background:transparent;
  display:flex; align-items:flex-end; justify-content:center;
  opacity:0; pointer-events:none;
  transition:opacity .32s ease;
}
#gm-overlay.gm-show { opacity:1; pointer-events:all; }
.gm-panel {
  width:100%; max-width:580px; max-height:85vh;
  background:var(--card,#fff);
  border-radius:22px 22px 0 0;
  box-shadow:0 -8px 48px rgba(0,0,0,.38);
  display:flex; flex-direction:column; overflow:hidden;
  transform:translateY(50px);
  transition:transform .36s cubic-bezier(.22,1,.36,1);
  position:relative; z-index:8900;
}
#gm-overlay.gm-show .gm-panel { transform:translateY(0); }

/* 패널 헤더 */
.gm-ph {
  display:flex; align-items:center; justify-content:space-between;
  padding:15px 18px 10px; flex-shrink:0;
  border-bottom:1px solid var(--bdr,#e2e4ef);
}
.gm-ph-left { display:flex; align-items:center; gap:10px; }
.gm-accent-bar {
  width:4px; height:28px; border-radius:2px; flex-shrink:0;
}
.gm-ph-title { font-size:16px; font-weight:900; color:var(--tx,#1a1a2e); line-height:1.3; }
.gm-ph-badge {
  font-size:10px; font-weight:700; background:#f97316; color:#fff;
  border-radius:20px; padding:2px 8px; letter-spacing:.4px;
}
.gm-ph-x {
  background:var(--card2,#f5f6fb); border:1px solid var(--bdr,#e2e4ef);
  border-radius:50%; width:32px; height:32px; cursor:pointer;
  font-size:17px; display:flex; align-items:center; justify-content:center;
  color:var(--tx2,#5a5a7a); transition:background .15s; flex-shrink:0;
}
.gm-ph-x:hover { background:var(--card3,#eceef6); }

/* 진행 바 */
.gm-pbar { height:3px; background:var(--bdr,#e2e4ef); flex-shrink:0; }
.gm-pbar-fill { height:100%; border-radius:2px; transition:width .5s ease; width:0%; }

/* step 카운터 */
.gm-step-cnt {
  font-size:10px; color:var(--tx3,#9898b8); font-weight:700;
  padding:6px 18px 4px; flex-shrink:0; text-align:right;
}

/* 바디 */
.gm-body {
  flex:1; overflow-y:auto; padding:10px 18px 14px;
  scroll-behavior:smooth; scrollbar-width:thin;
}

/* 텍스트 세그먼트 */
.gm-text {
  font-size:13.5px; line-height:1.9;
  color:var(--tx,#1a1a2e); white-space:pre-wrap;
  margin-bottom:12px;
}
.gm-text b { color:var(--a,#4f46e5); font-weight:800; }

/* 다이어그램 */
.gm-diag {
  background:var(--surf2,#f1f3f9); border:1px solid var(--bdr,#e2e4ef);
  border-radius:14px; padding:10px 12px; margin-bottom:12px;
}
.gm-diag-lbl {
  font-size:10px; font-weight:700; color:var(--tx3,#9898b8);
  letter-spacing:.5px; margin-bottom:8px;
}

/* 타이핑 커서 */
.gm-cur {
  display:inline-block; width:2px; height:.9em;
  background:var(--a,#4f46e5); margin-left:1px;
  vertical-align:middle;
  animation:gm-blink .65s step-end infinite;
}
@keyframes gm-blink { 0%,100%{opacity:1} 50%{opacity:0} }

/* 하단 버튼 */
.gm-foot {
  padding:8px 18px 14px; display:flex; gap:8px; flex-shrink:0;
  border-top:1px solid var(--bdr,#e2e4ef);
  align-items:center;
}
.gm-btn-skip {
  padding:10px 14px; border-radius:11px;
  border:1.5px solid var(--bdr,#e2e4ef);
  background:var(--card2,#f5f6fb); color:var(--tx3,#9898b8);
  font-size:12px; font-weight:700; cursor:pointer; flex-shrink:0;
  transition:background .15s;
}
.gm-btn-skip:hover { background:var(--card3,#eceef6); }
.gm-btn-next {
  flex:1; padding:11px; border-radius:11px; border:none;
  background:linear-gradient(135deg,#4f46e5,#7c3aed);
  color:#fff; font-size:13px; font-weight:800; cursor:pointer;
  transition:opacity .15s;
}
.gm-btn-next:hover { opacity:.88; }
.gm-btn-next:disabled {
  background:var(--bdr,#e2e4ef); color:var(--tx3,#9898b8);
  cursor:not-allowed;
}

/* ── SVG 마스크 배경 (구멍 뚫기 방식) ── */
#gm-mask-svg {
  position:fixed; inset:0; z-index:8750;
  pointer-events:none;
  opacity:0;
  transition:opacity .38s ease;
}
#gm-mask-svg.gm-mask-on { opacity:1; }

/* 스포트라이트 테두리 + 펄스 링 */
#gm-spotlight {
  position:fixed; z-index:8790; pointer-events:none;
  border-radius:14px;
  opacity:0;
  transition:left .42s cubic-bezier(.22,1,.36,1),
             top  .42s cubic-bezier(.22,1,.36,1),
             width .42s cubic-bezier(.22,1,.36,1),
             height .42s cubic-bezier(.22,1,.36,1),
             opacity .3s ease;
}
#gm-spotlight.gm-spot-on { opacity:1; }

/* 스포트라이트 내부 테두리 (밝은 선) */
#gm-spotlight::before {
  content:'';
  position:absolute; inset:-3px;
  border-radius:16px;
  border:2.5px solid rgba(255,255,255,.9);
  box-shadow:
    0 0 0 1px rgba(99,102,241,.8),
    0 0 20px 4px rgba(99,102,241,.5),
    inset 0 0 12px rgba(255,255,255,.08);
}

/* 펄스 애니메이션 링 */
#gm-spotlight::after {
  content:'';
  position:absolute; inset:-10px;
  border-radius:22px;
  border:2px solid rgba(99,102,241,.6);
  animation:gm-pulse 1.8s ease-out infinite;
}
@keyframes gm-pulse {
  0%   { opacity:.9; transform:scale(1); }
  70%  { opacity:0;  transform:scale(1.06); }
  100% { opacity:0;  transform:scale(1.06); }
}

/* 스포트라이트 라벨 말풍선 */
#gm-spot-label {
  position:fixed; z-index:8795; pointer-events:none;
  background:linear-gradient(135deg,#4f46e5,#7c3aed);
  color:#fff; font-size:11px; font-weight:800;
  padding:5px 12px 5px 9px; border-radius:20px;
  box-shadow:0 4px 16px rgba(79,70,229,.5);
  display:flex; align-items:center; gap:5px;
  white-space:nowrap;
  opacity:0;
  transform:translateY(6px);
  transition:opacity .3s ease, transform .3s ease;
  letter-spacing:.2px;
}
#gm-spot-label::before {
  content:'👆';
  font-size:13px;
}
#gm-spot-label.gm-label-on {
  opacity:1; transform:translateY(0);
}

/* 차단 토스트 */
#gm-toast {
  position:fixed; bottom:90px; left:50%;
  transform:translateX(-50%) translateY(12px);
  background:rgba(220,38,38,.95); color:#fff;
  padding:9px 18px; border-radius:22px;
  font-size:12px; font-weight:700; z-index:9990;
  opacity:0; pointer-events:none;
  transition:opacity .22s, transform .22s;
  white-space:nowrap; max-width:90vw; text-align:center;
}
#gm-toast.gm-toast-on {
  opacity:1; transform:translateX(-50%) translateY(0);
}

/* 입력 필드 차단 표시 */
input[data-gm-ro], textarea[data-gm-ro] {
  cursor:not-allowed !important;
  background:var(--surf2,#f1f3f9) !important;
  opacity:.75 !important;
}
`;
    document.head.appendChild(s);
  }

  /* ═══════════════════════════════════════════════
   * SVG 마스크 레이어 생성 (구멍 뚫기 dim 효과)
   * ══════════════════════════════════════════════ */
  function _makeMaskLayer() {
    if (document.getElementById('gm-mask-svg')) return;

    // SVG 마스크: 화면 전체 어둡게 + 하이라이트 영역만 투명(구멍)
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'gm-mask-svg';
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    svg.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:8750;pointer-events:none;opacity:0;transition:opacity .38s ease;';

    svg.innerHTML = `
      <defs>
        <mask id="gm-hole-mask">
          <!-- 전체 흰색 = 어두운 레이어 표시 영역 -->
          <rect id="gm-mask-bg" x="0" y="0" width="100%" height="100%" fill="white"/>
          <!-- 구멍: 검정 = 투명(밝게) / 라운드 rect -->
          <rect id="gm-mask-hole" x="-999" y="-999" width="0" height="0" rx="14" ry="14" fill="black"/>
        </mask>
      </defs>
      <!-- 어두운 반투명 레이어 (mask 적용) -->
      <rect x="0" y="0" width="100%" height="100%"
            fill="rgba(6,6,20,0.78)"
            mask="url(#gm-hole-mask)"/>
    `;
    document.body.appendChild(svg);

    // 스포트라이트 테두리 div
    if (!document.getElementById('gm-spotlight')) {
      const sp = document.createElement('div');
      sp.id = 'gm-spotlight';
      document.body.appendChild(sp);
    }
    // 라벨 말풍선
    if (!document.getElementById('gm-spot-label')) {
      const lbl = document.createElement('div');
      lbl.id = 'gm-spot-label';
      document.body.appendChild(lbl);
    }
  }

  /* ═══════════════════════════════════════════════
   * 배지 생성
   * ══════════════════════════════════════════════ */
  function _makeBadge() {
    if (document.getElementById(BADGE_ID)) return;
    const el = document.createElement('div');
    el.id = BADGE_ID;
    el.innerHTML =
      '<span class="gm-b-icon">🔒</span>' +
      '<span>읽기 전용 모드 &mdash; GUEST 계정 &nbsp;|&nbsp; 저장·입력 불가</span>' +
      '<button class="gm-b-x" title="숨기기">✕</button>';
    document.body.prepend(el);
    document.body.classList.add('gm-on');
    el.querySelector('.gm-b-x').onclick = () => {
      el.style.display = 'none';
      document.body.classList.remove('gm-on');
    };
  }

  /* ═══════════════════════════════════════════════
   * 오버레이 생성
   * ══════════════════════════════════════════════ */
  function _makeOverlay() {
    if (document.getElementById(OVERLAY_ID)) return;
    const el = document.createElement('div');
    el.id = OVERLAY_ID;
    el.innerHTML = `
<div class="gm-panel">
  <div class="gm-ph">
    <div class="gm-ph-left">
      <div class="gm-accent-bar" id="gm-accent"></div>
      <div>
        <div class="gm-ph-title" id="gm-title">화면 안내</div>
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:8px">
      <span class="gm-ph-badge">GUEST 가이드</span>
      <button class="gm-ph-x" id="gm-x">✕</button>
    </div>
  </div>
  <div class="gm-pbar"><div class="gm-pbar-fill" id="gm-pf"></div></div>
  <div class="gm-step-cnt" id="gm-cnt"></div>
  <div class="gm-body" id="gm-body"></div>
  <div class="gm-foot">
    <button class="gm-btn-skip" id="gm-skip">닫기</button>
    <button class="gm-btn-next" id="gm-next" disabled>다음 →</button>
  </div>
</div>`;
    document.body.appendChild(el);

    document.getElementById('gm-x').onclick    = () => _close();
    document.getElementById('gm-skip').onclick = () => _close();
    document.getElementById('gm-next').onclick = () => _nextStep();
  }

  /* ═══════════════════════════════════════════════
   * 나레이션 열기
   * ══════════════════════════════════════════════ */
  function _show(pageKey) {
    if (!_active) return;
    const data = NARRATIONS[pageKey];
    if (!data) return;

    _pageKey = pageKey;
    _steps   = data.steps;
    _stepIdx = 0;

    if (_open) _closeImmediate();
    _open = true;

    _makeMaskLayer();
    _makeOverlay();

    const title  = document.getElementById('gm-title');
    const accent = document.getElementById('gm-accent');
    if (title)  title.textContent  = data.title;
    if (accent) accent.style.background = data.accentColor || '#4f46e5';

    // 버튼 스타일을 accent 색으로
    const nextBtn = document.getElementById('gm-next');
    if (nextBtn) nextBtn.style.background = `linear-gradient(135deg,${data.accentColor||'#4f46e5'},#7c3aed)`;

    // 오버레이 표시
    const ov = document.getElementById(OVERLAY_ID);
    requestAnimationFrame(() => ov?.classList.add('gm-show'));

    _renderStep();
  }

  /* ─── 현재 스텝 렌더 ─── */
  function _renderStep() {
    const step = _steps[_stepIdx];
    if (!step) { _close(); return; }

    const body    = document.getElementById('gm-body');
    const cnt     = document.getElementById('gm-cnt');
    const pf      = document.getElementById('gm-pf');
    const nextBtn = document.getElementById('gm-next');

    if (!body) return;

    body.innerHTML = '';
    nextBtn.disabled  = true;
    nextBtn.textContent = _stepIdx < _steps.length - 1 ? '다음 →' : '✓ 완료';

    // 진행 바
    const pct = Math.round(((_stepIdx + 1) / _steps.length) * 100);
    if (pf) pf.style.width = pct + '%';
    if (cnt) cnt.textContent = `${_stepIdx + 1} / ${_steps.length}`;

    // 스포트라이트 (라벨은 step에 highlightLabel 있으면 사용, 없으면 기본)
    _spotlight(step.highlight || null, step.highlightLabel || null);

    let onDone = () => { nextBtn.disabled = false; body.scrollTop = body.scrollHeight; };

    // 다이어그램 먼저
    if (step.diagram) {
      _appendDiagram(body, step.diagram);
    }

    // 텍스트 타이핑
    if (step.text) {
      _typeText(body, step.text, onDone);
    } else {
      // 다이어그램만 있을 때
      setTimeout(onDone, 300);
    }
  }

  /* ─── 타이핑 ─── */
  function _typeText(container, html, done) {
    clearTimeout(_typeTimer);

    // HTML → 파트 배열로 파싱 (<b> 보존)
    const parts = _parseHtml(html);

    const wrapper = document.createElement('div');
    wrapper.className = 'gm-text';
    container.appendChild(wrapper);

    const cur = document.createElement('span');
    cur.className = 'gm-cur';
    wrapper.appendChild(cur);

    let pi = 0, ci = 0;
    const SPEED = 18;

    function tick() {
      if (!_open) return;
      if (pi >= parts.length) {
        cur.remove();
        setTimeout(done, 250);
        return;
      }
      const part = parts[pi];
      if (ci === 0) {
        const node = part.bold ? document.createElement('b') : document.createElement('span');
        node.dataset.pi = pi;
        cur.before(node);
      }
      const node = wrapper.querySelector(`[data-pi="${pi}"]`);
      if (node) node.textContent += part.text[ci];
      ci++;
      if (ci >= part.text.length) { pi++; ci = 0; }
      container.scrollTop = container.scrollHeight;
      _typeTimer = setTimeout(tick, SPEED);
    }
    tick();
  }

  /* HTML → [{text, bold}] */
  function _parseHtml(html) {
    const parts = [];
    const re = /<b[^>]*>([\s\S]*?)<\/b>/g;
    let last = 0, m;
    while ((m = re.exec(html)) !== null) {
      if (m.index > last) parts.push({ text: html.slice(last, m.index), bold: false });
      parts.push({ text: m[1], bold: true });
      last = re.lastIndex;
    }
    if (last < html.length) parts.push({ text: html.slice(last), bold: false });
    // <br> 처리
    return parts.map(p => ({ ...p, text: p.text.replace(/<br\s*\/?>/gi, '\n') }));
  }

  /* ─── 다이어그램 ─── */
  function _appendDiagram(container, diag) {
    const wrap = document.createElement('div');
    wrap.className = 'gm-diag';
    wrap.innerHTML = `<div class="gm-diag-lbl">📐 ${diag.title}</div>${diag.svg}`;
    container.appendChild(wrap);
  }

  /* ─── 다음 스텝 ─── */
  function _nextStep() {
    clearTimeout(_typeTimer);
    _stepIdx++;
    if (_stepIdx >= _steps.length) { _close(); return; }
    _renderStep();
  }

  /* ─── 스포트라이트 (SVG 마스크 구멍 뚫기) ─── */
  function _spotlight(selector, labelText) {
    const svg     = document.getElementById('gm-mask-svg');
    const hole    = document.getElementById('gm-mask-hole');
    const spot    = document.getElementById('gm-spotlight');
    const lbl     = document.getElementById('gm-spot-label');

    // highlight 없는 스텝: 마스크만 어둡게, 구멍 없음
    if (!selector) {
      if (svg)  { svg.classList.add('gm-mask-on'); }
      if (hole) { hole.setAttribute('x', '-999'); hole.setAttribute('y', '-999'); hole.setAttribute('width', '0'); hole.setAttribute('height', '0'); }
      if (spot) { spot.classList.remove('gm-spot-on'); }
      if (lbl)  { lbl.classList.remove('gm-label-on'); }
      return;
    }

    const el = document.querySelector(selector);
    if (!el) {
      if (svg) svg.classList.add('gm-mask-on');
      return;
    }

    const r   = el.getBoundingClientRect();
    const pad = 10; // 하이라이트 여백

    const x = r.left   - pad;
    const y = r.top    - pad;
    const w = r.width  + pad * 2;
    const h = r.height + pad * 2;

    // SVG 마스크 구멍 업데이트
    if (svg && hole) {
      // SVG viewBox를 화면 크기에 맞춤
      svg.setAttribute('viewBox', `0 0 ${window.innerWidth} ${window.innerHeight}`);
      // 배경 rect도 화면 크기로
      const bgRect = svg.getElementById ? null : null;
      const rects = svg.querySelectorAll('rect');
      rects.forEach(r2 => {
        if (r2.id === 'gm-mask-bg') {
          r2.setAttribute('width', window.innerWidth);
          r2.setAttribute('height', window.innerHeight);
        }
      });

      hole.setAttribute('x',      x);
      hole.setAttribute('y',      y);
      hole.setAttribute('width',  w);
      hole.setAttribute('height', h);
      svg.classList.add('gm-mask-on');
    }

    // 테두리 div 위치
    if (spot) {
      spot.style.left   = x + 'px';
      spot.style.top    = y + window.scrollY + 'px';
      spot.style.width  = w + 'px';
      spot.style.height = h + 'px';
      requestAnimationFrame(() => spot.classList.add('gm-spot-on'));
    }

    // 라벨 말풍선 위치 (요소 위 또는 아래)
    if (lbl && labelText) {
      lbl.textContent = '';
      lbl.innerHTML = `<span style="font-size:13px">👆</span>${labelText}`;
      // 위쪽에 공간이 있으면 위, 없으면 아래
      const lblH = 32;
      const topPos = y - lblH - 10;
      if (topPos > 40) {
        lbl.style.top  = (topPos + window.scrollY) + 'px';
      } else {
        lbl.style.top  = (y + h + 10 + window.scrollY) + 'px';
      }
      lbl.style.left = Math.max(8, x) + 'px';
      requestAnimationFrame(() => lbl.classList.add('gm-label-on'));
    } else if (lbl) {
      lbl.classList.remove('gm-label-on');
    }
  }

  /* 스포트라이트 해제 */
  function _clearSpotlight() {
    const svg  = document.getElementById('gm-mask-svg');
    const hole = document.getElementById('gm-mask-hole');
    const spot = document.getElementById('gm-spotlight');
    const lbl  = document.getElementById('gm-spot-label');
    if (svg)  svg.classList.remove('gm-mask-on');
    if (hole) { hole.setAttribute('x','-999'); hole.setAttribute('y','-999'); hole.setAttribute('width','0'); hole.setAttribute('height','0'); }
    if (spot) spot.classList.remove('gm-spot-on');
    if (lbl)  lbl.classList.remove('gm-label-on');
  }

  /* ─── 닫기 ─── */
  function _close() {
    _clearSpotlight();
    _closeImmediate();
  }
  function _closeImmediate() {
    clearTimeout(_typeTimer);
    clearTimeout(_autoTimer);
    _open = false;
    const ov = document.getElementById(OVERLAY_ID);
    if (ov) {
      ov.classList.remove('gm-show');
      setTimeout(() => { if (ov.parentNode) ov.remove(); }, 380);
    }
    // 마스크도 숨김
    const svg = document.getElementById('gm-mask-svg');
    if (svg) svg.classList.remove('gm-mask-on');
  }

  /* ═══════════════════════════════════════════════
   * 차단 토스트
   * ══════════════════════════════════════════════ */
  let _toastTimer = null;
  function _toast(msg) {
    let el = document.getElementById(TOAST_ID);
    if (!el) {
      el = document.createElement('div');
      el.id = TOAST_ID;
      document.body.appendChild(el);
    }
    el.textContent = msg || '🔒 읽기 전용 모드 — 게스트는 입력할 수 없습니다';
    el.classList.add('gm-toast-on');
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => el.classList.remove('gm-toast-on'), 2500);
  }

  /* ═══════════════════════════════════════════════
   * Write 차단 시스템
   * ══════════════════════════════════════════════ */

  /* --- DB 메서드 패치 (가장 확실한 차단) --- */
  const WRITE_METHODS = [
    'addClass','addClassNew','updateClass','deleteClass','terminateClass',
    'addToPool','moveBook','deleteBook','clearZone','renameBook','copyBooksToClass',
    'addAccount','updateAccount','deleteAccount',
    'saveTheme',
    'autoSave','saveProgress','setProgress',
  ];
  function _patchDB() {
    if (typeof DB === 'undefined') return;
    WRITE_METHODS.forEach(m => {
      if (typeof DB[m] === 'function') {
        DB[m] = (..._) => { _toast(); return Promise.resolve(null); };
      }
    });
  }
  function _patchModules() {
    ['StudentDB','StaffDB','GradeDB','BookLibDB'].forEach(name => {
      const db = window[name];
      if (!db) return;
      Object.keys(db).forEach(m => {
        if (typeof db[m] !== 'function') return;
        if (/^(add|update|delete|save|remove|set|put|import|write|create)/i.test(m)) {
          db[m] = (..._) => { _toast(); return Promise.resolve(null); };
        }
      });
    });
  }

  /* --- 클릭 인터셉터 --- */
  // 허용 패턴
  const _ALLOW = [
    /^gm-/, /^gm_/,           // 나레이션 자체 UI
    'btn-x', 'gm-ph-x', 'gm-b-x', 'gm-btn-skip', 'gm-btn-next',
    'bni',                     // 하단 탭
    'wk-btn',                  // 주간 이동
    'cal-',                    // 달력 버튼류
    'toggle-view-btn',
    'mg-tab',
    'mg-nav-btn',
    'bl-stab',                 // 교재 서브탭
    'gr-vbtn',                 // 성적 보기 전환
    'chip',                    // 반 선택 칩
  ];
  // 차단 키워드 (onclick 속성)
  const _BLOCK_ONCLICK = /save|Save|addClass|add[A-Z]|del|Del|delete|Delete|update[A-Z]|import|Import|handleImport|doCopy|clearZone|moveBook|renameBook|terminate|addToPool|addAccount|saveAccount|delAcc|delClass|doLogin/;

  function _isBtnAllowed(btn) {
    const cls = btn.className || '';
    for (const pat of _ALLOW) {
      if (pat instanceof RegExp) { if (pat.test(btn.id)) return true; }
      else if (cls.includes(pat) || (btn.id || '').includes(pat)) return true;
    }
    // 비-빨간 ibtn은 허용 (수정 모달 열기 등 읽기)
    if (cls.includes('ibtn') && !cls.includes('red')) return true;
    return false;
  }

  function _interceptClick(e) {
    if (!_active) return;
    const btn = e.target.closest('button,[role="button"],input[type="submit"],input[type="button"]');
    if (!btn) return;
    if (_isBtnAllowed(btn)) return;

    // doLogin은 허용 (로그인 동작 자체)
    const oc = (btn.getAttribute('onclick') || '') + (btn.id || '');
    if (/doLogin/i.test(oc)) return;

    if (_BLOCK_ONCLICK.test(oc)) {
      e.preventDefault(); e.stopPropagation();
      _toast(); return;
    }
    // 텍스트로 판단
    const txt = (btn.textContent || '').trim();
    if (/^(저장|추가|삭제|수정|복사|가져오기|등록|초기화|일괄등록|내보내기 아닌 가져오기)/.test(txt)) {
      e.preventDefault(); e.stopPropagation();
      _toast(); return;
    }
  }

  /* --- 입력 필드 차단 MutationObserver --- */
  function _watchInputs() {
    const obs = new MutationObserver(() => {
      if (!_active) return;
      document.querySelectorAll(
        'input:not(#li-id):not(#li-pw):not(#li-remember):not([data-gm-ro]),' +
        'textarea:not([data-gm-ro])'
      ).forEach(el => {
        // 로그인 관련, 나레이션 내부는 제외
        if (el.closest('#login-gate') || el.closest('#gm-overlay')) return;
        el.setAttribute('data-gm-ro', '1');
        el.setAttribute('readonly', 'readonly');
        el.addEventListener('focus', _onInputFocus);
        el.addEventListener('click', _onInputFocus);
        el.addEventListener('keydown', _onInputKey, true);
      });
      // select도 차단
      document.querySelectorAll('select:not([data-gm-ro])').forEach(el => {
        if (el.closest('#login-gate') || el.closest('#gm-overlay')) return;
        el.setAttribute('data-gm-ro', '1');
        el.addEventListener('change', _onSelectChange, true);
      });
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  function _onInputFocus(e) {
    if (!_active) return;
    const el = e.currentTarget;
    if (el.closest('#login-gate') || el.closest('#gm-overlay')) return;
    _toast('🔒 읽기 전용 모드 — 게스트는 입력이 불가합니다');
    el.blur();
  }
  function _onInputKey(e) {
    if (!_active) return;
    const el = e.currentTarget;
    if (el.closest('#login-gate') || el.closest('#gm-overlay')) return;
    // Tab/Shift/Ctrl/Alt 계열은 허용, 나머지 차단
    if (e.key === 'Tab' || e.ctrlKey || e.altKey || e.metaKey) return;
    e.preventDefault(); e.stopPropagation();
    _toast('🔒 읽기 전용 모드 — 게스트는 입력이 불가합니다');
  }
  function _onSelectChange(e) {
    if (!_active) return;
    e.preventDefault(); e.stopPropagation();
    _toast('🔒 읽기 전용 모드 — 변경이 불가합니다');
  }

  /* 드래그 차단 */
  function _blockDrag() {
    document.addEventListener('dragstart', e => {
      if (!_active) return;
      e.preventDefault(); e.stopPropagation();
      _toast('🔒 드래그 배정 불가 — 읽기 전용 모드');
    }, true);
    document.addEventListener('touchstart', e => {
      // long-press drag 차단은 click interceptor로 충분
    }, { passive: true });
  }

  /* ═══════════════════════════════════════════════
   * 페이지 전환 훅
   * ══════════════════════════════════════════════ */
  function _hookNav() {
    if (typeof App === 'undefined') return;
    const orig = App.go.bind(App);
    App.go = function(page, ...rest) {
      orig(page, ...rest);
      if (_active) {
        setTimeout(() => {
          if (!_seen.has(page) && NARRATIONS[page]) {
            _seen.add(page);
            _show(page);
          }
        }, 400);
      }
    };
  }

  /* manage 내 탭 전환도 감지 (mgTab) */
  function _hookMgTab() {
    if (typeof App === 'undefined' || !App.mgTab) return;
    // mgTab은 내부 함수라 직접 래핑이 안 됨 → MutationObserver로 탭 변화 감지
    const obs = new MutationObserver(() => {
      if (!_active) return;
      const activeTab = document.querySelector('.mg-tab.on');
      if (!activeTab) return;
      // 탭 변경 시 특별한 나레이션은 없음 (manage 페이지 나레이션으로 통합)
    });
    const tabBar = document.querySelector('.mg-tabs');
    if (tabBar) obs.observe(tabBar, { attributes: true, subtree: true, attributeFilter: ['class'] });
  }

  /* ═══════════════════════════════════════════════
   * Guest 세션 주입
   * ══════════════════════════════════════════════ */
  function _injectSession() {
    const sess = {
      id: '__guest__', username: 'guest', role: 'admin',
      password: 'guest', createdAt: new Date().toISOString(),
      _isGuest: true,
    };
    if (typeof DB !== 'undefined' && DB.setSession) DB.setSession(sess);
    return sess;
  }

  /* ═══════════════════════════════════════════════
   * 활성화
   * ══════════════════════════════════════════════ */
  function _activate() {
    _active = true;
    _injectCSS();
    _makeBadge();
    _patchDB();
    _patchModules();
    _watchInputs();
    _blockDrag();
    document.addEventListener('click', _interceptClick, true);
  }

  /* ═══════════════════════════════════════════════
   * doLogin 훅
   * ══════════════════════════════════════════════ */
  function _hookLogin() {
    if (typeof App === 'undefined') return;
    const origLogin = App.doLogin.bind(App);
    App.doLogin = function() {
      const idEl = document.getElementById('li-id');
      const pwEl = document.getElementById('li-pw');
      if (!idEl || !pwEl) { origLogin(); return; }
      const id = idEl.value.trim(), pw = pwEl.value;

      if (id === GUEST_ID && pw === GUEST_PW) {
        _injectSession();
        document.getElementById('login-gate')?.classList.add('hidden');
        _activate();
        if (typeof App._refreshAuthUI === 'function') App._refreshAuthUI();
        _seen.add('operate');
        setTimeout(() => { App.go('operate'); _show('operate'); }, 500);
      } else {
        origLogin();
      }
    };
  }

  /* ═══════════════════════════════════════════════
   * 공개 init
   * ══════════════════════════════════════════════ */
  function init() {
    const tryHook = () => {
      if (typeof App !== 'undefined' && typeof DB !== 'undefined') {
        _hookLogin();
        _hookNav();

        // 이미 guest 세션이면 즉시 활성화
        const sess = DB.getSession ? DB.getSession() : null;
        if (sess && sess._isGuest) {
          _activate();
          _hookMgTab();
          setTimeout(() => { _seen.add('operate'); _show('operate'); }, 900);
        }
      } else {
        setTimeout(tryHook, 150);
      }
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', tryHook);
    } else {
      tryHook();
    }
  }

  return { init };
})();

GuestMode.init();
