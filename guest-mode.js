/**
 * guest-mode.js — HappyTree Guest Narration System v3.2
 * ══════════════════════════════════════════════════════
 * 변경사항 v3.2 (공유 폴더 소스 재점검):
 *  ⑪ archive-app.js TOOL_TABS에 4번째 도구로 이미 추가돼 있던 'pdf-editor'
 *     (PdfEditorApp, PDF 워크시트 제작)가 v3.1 나레이션에서 통째로 빠져
 *     있었음(3개 도구로만 소개) — 콘텐츠 나레이션에 스텝 추가, 제목도
 *     "자료실·영상·게임"→"자료실·영상·PDF·게임"으로 정정
 *
 * 변경사항 v3.0:
 *  ① 이전 버튼 추가 (첫 스텝 제외)
 *  ② 완료 후 "다시 보기" 버튼 → 나레이션 재시작
 *  ③ 스텝 action 으로 탭/서브메뉴 자동 전환 (싱크)
 *  ④ SVG 마스크 구멍 뚫기 → 하이라이트 영역 선명하게
 *  ⑤ 말풍선 라벨 + 펄스 링
 *  ⑥ 모든 입력 완전 차단 + 토스트
 *
 * 변경사항 v3.1 (dev 브랜치 신규 모듈 반영):
 *  ⑦ NARRATIONS.dashboard 추가 — 🏠 홈 대시보드(일정위젯·교재현황·섹션순서·명언)
 *  ⑧ NARRATIONS.archive 추가 — 🗂 콘텐츠(자료실·영상워크시트·학습게임 3탭 통합)
 *  ⑨ 🔒 보안 수정: _patchModules() 화이트리스트에 ScheduleDB/NoticeDB/
 *     ArchiveDB/EduVideoDB가 빠져 있어 게스트 세션에서도 이 4개 모듈은
 *     실제 Firebase에 쓰기가 가능한 상태였음(다른 4개 모듈만 보호되고
 *     있었음) — 배열에 추가해서 동일하게 no-op 처리되도록 수정
 *  ⑩ (참고) students/staff 나레이션은 이미 존재했으나 README에는 누락되어
 *     있던 것으로 확인 — 문서만 별도로 정정함(코드 변경 없음)
 */
const GuestMode = (() => {
  'use strict';

  const GUEST_ID   = 'guest';
  const GUEST_PW   = 'guest';
  const BADGE_ID   = 'gm-badge';
  const OVERLAY_ID = 'gm-overlay';
  const TOAST_ID   = 'gm-toast';
  const SPOT_ID    = 'gm-spotlight';

  let _active    = false;
  let _open      = false;
  let _typeTimer = null;
  let _stepIdx   = 0;
  let _steps     = [];
  let _pageKey   = null;
  const _seen    = new Set();

  /* ══════════════════════════════════════════════════════
   * NARRATIONS
   * step 필드:
   *   text          : 나레이션 문자열 (<b> 가능)
   *   highlight     : CSS 셀렉터 → 스포트라이트
   *   highlightLabel: 말풍선 텍스트
   *   diagram       : { title, svg }
   *   action        : () => void  → 스텝 진입 시 실행 (탭 전환 등)
   * ══════════════════════════════════════════════════════ */
  const NARRATIONS = {

    /* ── 진도 화면 ── */
    operate: {
      title: '📅 수업 진도 화면',
      accent: '#4f46e5',
      steps: [
        {
          text: '안녕하세요! 👋\n해피트리 영어학원 <b>진도 관리 시스템</b>에 오신 걸 환영합니다.\n\n이 화면은 학원 운영의 핵심인 <b>수업 진도 기록</b>을 담당합니다.\n먼저 상단의 <b>반 선택 칩</b>부터 살펴볼게요.',
          highlight: '.chip-bar',
          highlightLabel: '반 선택 영역',
        },
        {
          text: '👆 <b>반 선택 칩</b>입니다.\n\nH1, H2, T1 같은 반 이름이 칩 형태로 나열되어 있어요.\n탭 한 번으로 해당 반의 주간 진도로 즉시 이동합니다.\n\n수업 시간이 등록된 반은 <b>오늘 수업에 가장 가까운 반이 자동 선택</b>됩니다.',
          highlight: '.chip-row',
          highlightLabel: '반 칩 목록',
        },
        {
          text: '📆 <b>주간 네비게이터</b>입니다.\n\n‹ / › 버튼으로 원하는 주차로 이동하고,\n📆 버튼으로 달력에서 날짜를 직접 선택할 수 있습니다.\n\n현재 주가 기본으로 표시되며, 주차 · 월 정보가 중앙에 표시됩니다.',
          highlight: '.wk-nav',
          highlightLabel: '주간 이동 바',
        },
        {
          diagram: {
            title: '요일 카드 구조 — 주·부교재 진도 입력',
            svg: `<svg viewBox="0 0 500 210" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:500px">
<rect x="8" y="8" width="90" height="194" rx="12" fill="#ede9fe" stroke="#6366f1" stroke-width="2"/>
<text x="53" y="30" text-anchor="middle" font-size="12" fill="#4338ca" font-weight="800">수 WED</text>
<text x="53" y="45" text-anchor="middle" font-size="9" fill="#6b7280">6월 4일</text>
<rect x="16" y="52" width="74" height="16" rx="4" fill="#4338ca"/>
<text x="53" y="64" text-anchor="middle" font-size="8" fill="#fff" font-weight="700">★ 오늘 수업 중</text>
<rect x="16" y="74" width="74" height="28" rx="6" fill="#ede9fe" stroke="#a5b4fc"/>
<text x="53" y="85" text-anchor="middle" font-size="7" fill="#4338ca" font-weight="700">📘 주교재</text>
<text x="53" y="97" text-anchor="middle" font-size="9" fill="#1e1b4b">p.32~38</text>
<rect x="16" y="108" width="74" height="28" rx="6" fill="#f0fdf4" stroke="#86efac"/>
<text x="53" y="119" text-anchor="middle" font-size="7" fill="#166534" font-weight="700">📗 부교재</text>
<text x="53" y="131" text-anchor="middle" font-size="9" fill="#14532d">p.15</text>
<rect x="16" y="142" width="74" height="40" rx="6" fill="#fef3c7" stroke="#fde68a"/>
<text x="53" y="155" text-anchor="middle" font-size="7" fill="#92400e" font-weight="700">✏️ 메모</text>
<text x="53" y="168" text-anchor="middle" font-size="8" fill="#78350f">숙제 p.40</text>
<text x="53" y="179" text-anchor="middle" font-size="8" fill="#78350f">단어 20개</text>
<rect x="108" y="8" width="90" height="194" rx="12" fill="#fff" stroke="#e2e8f0" stroke-width="1.5"/>
<text x="153" y="30" text-anchor="middle" font-size="11" fill="#0891b2" font-weight="700">목 THU</text>
<text x="153" y="45" text-anchor="middle" font-size="9" fill="#6b7280">6월 5일</text>
<rect x="116" y="56" width="74" height="28" rx="6" fill="#ecfeff" stroke="#67e8f9"/>
<text x="153" y="68" text-anchor="middle" font-size="7" fill="#0e7490" font-weight="700">📘 주교재</text>
<text x="153" y="80" text-anchor="middle" font-size="9" fill="#164e63">p.40~46</text>
<rect x="116" y="90" width="74" height="28" rx="6" fill="#f0fdf4" stroke="#86efac"/>
<text x="153" y="102" text-anchor="middle" font-size="7" fill="#166534" font-weight="700">📗 부교재</text>
<text x="153" y="114" text-anchor="middle" font-size="9" fill="#14532d">p.18</text>
<text x="210" y="35" font-size="10" fill="#4f46e5" font-weight="700">① 오늘 자동 포커스</text>
<line x1="204" y1="32" x2="98" y2="58" stroke="#4f46e5" stroke-width="1" stroke-dasharray="3,2"/>
<text x="210" y="75" font-size="10" fill="#166534" font-weight="700">② 진도 입력 → 자동저장</text>
<text x="210" y="110" font-size="10" fill="#f97316" font-weight="700">③ 메모 1.5초 후 저장</text>
<text x="210" y="145" font-size="10" fill="#0891b2" font-weight="700">④ 저장일시 표시</text>
<rect x="8" y="204" width="490" height="1" fill="none"/>
</svg>`,
          },
          text: '⬆️ <b>요일 카드</b> 구조입니다.\n\n수업이 있는 요일만 카드가 생성되고,\n각 카드 안에 <b>주교재·부교재 진도 입력칸</b>과 <b>메모란</b>이 있습니다.\n\n진도를 입력하면 <b>1.5초 후 Firebase에 자동 저장</b>되고\n저장 시각이 입력칸 아래에 기록됩니다.',
          highlight: '.days-scroll',
          highlightLabel: '요일별 진도 카드 영역',
        },
        {
          text: '🟢 화면 우측 상단의 <b>동기화 점(●)</b>을 눈여겨 보세요.\n\n🟢 초록 = Firebase 정상 연결\n🟠 주황 = 저장 중\n⚫ 회색 = 오프라인 (로컬 저장 후 복구 시 동기화)\n\n📊 교재 행 오른쪽 <b>📊 버튼</b>을 탭하면\n해당 교재의 학생별 학습 달성률 팝업이 표시됩니다.',
          highlight: '#sync-dot',
          highlightLabel: '실시간 동기화 상태',
        },
      ],
    },

    /* ── 관리 화면 ── */
    manage: {
      title: '⚙️ 반·교재 관리 화면',
      accent: '#f97316',
      steps: [
        {
          text: '⚙️ <b>관리 화면</b>입니다.\n\n학원 운영의 모든 설정을 이 화면 하나에서 처리합니다.\n상단의 5개 탭 — <b>반 / 계정 / 테마 / 백업 / 공유</b>를 순서대로 살펴볼게요.',
          highlight: '.mg-tabs',
          highlightLabel: '관리 탭 메뉴',
          action: () => { if (typeof App !== 'undefined') App.mgTab('classes'); },
        },
        {
          text: '📋 <b>반(클래스) 관리</b> 탭입니다.\n\n① 상단 📆 달력 버튼으로 월을 이동합니다\n② ＋ 반 추가 → 이름·요일·수업시간·편성 시작월 설정\n③ 반 카드에서 ✏️ 수정 / 🗑 삭제 / 📋 교재복사 실행\n\n교재 목록(Pool)에서 주교재·부교재로 배정하는\n드래그&드롭 방식도 지원합니다.',
          highlight: '#mg-classes',
          highlightLabel: '반 관리 & 교재 배정 영역',
          action: () => { if (typeof App !== 'undefined') App.mgTab('classes'); },
        },
        {
          diagram: {
            title: '교재 배정 흐름 — Pool → 주교재 / 부교재',
            svg: `<svg viewBox="0 0 470 185" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:470px">
<defs><marker id="a1" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="#f97316"/></marker></defs>
<rect x="8" y="8" width="138" height="170" rx="12" fill="#fff7ed" stroke="#f97316" stroke-width="1.8"/>
<text x="77" y="28" text-anchor="middle" font-size="11" fill="#c2410c" font-weight="800">📚 교재 목록(Pool)</text>
<rect x="16" y="34" width="122" height="24" rx="6" fill="#fed7aa"/>
<text x="77" y="50" text-anchor="middle" font-size="9" fill="#7c2d12">수학의 정석(상)</text>
<rect x="16" y="62" width="122" height="24" rx="6" fill="#fed7aa"/>
<text x="77" y="78" text-anchor="middle" font-size="9" fill="#7c2d12">쎈 수학</text>
<rect x="16" y="90" width="122" height="24" rx="6" fill="#fed7aa"/>
<text x="77" y="106" text-anchor="middle" font-size="9" fill="#7c2d12">Grammar in Use</text>
<rect x="16" y="124" width="122" height="20" rx="5" fill="#f3f4f6" stroke="#d1d5db"/>
<text x="77" y="138" text-anchor="middle" font-size="8" fill="#6b7280">+ 교재명 입력 후 추가</text>
<text x="16" y="170" font-size="8" fill="#9ca3af">길게 누르거나 드래그 → 배정</text>
<line x1="148" y1="46" x2="186" y2="46" stroke="#4338ca" stroke-width="1.8" marker-end="url(#a1)"/>
<line x1="148" y1="74" x2="186" y2="126" stroke="#166534" stroke-width="1.8" marker-end="url(#a1)"/>
<rect x="190" y="8" width="130" height="74" rx="12" fill="#ede9fe" stroke="#6366f1" stroke-width="1.8"/>
<text x="255" y="28" text-anchor="middle" font-size="11" fill="#4338ca" font-weight="800">📘 주교재</text>
<rect x="198" y="34" width="114" height="22" rx="6" fill="#c7d2fe"/>
<text x="255" y="49" text-anchor="middle" font-size="9" fill="#1e1b4b">수학의 정석(상)</text>
<rect x="198" y="58" width="114" height="16" rx="4" fill="#e0e7ff" stroke="#a5b4fc"/>
<text x="255" y="70" text-anchor="middle" font-size="8" fill="#3730a3">← 主 버튼 또는 드래그</text>
<rect x="190" y="104" width="130" height="74" rx="12" fill="#f0fdf4" stroke="#16a34a" stroke-width="1.8"/>
<text x="255" y="124" text-anchor="middle" font-size="11" fill="#166534" font-weight="800">📗 부교재</text>
<rect x="198" y="130" width="114" height="22" rx="6" fill="#bbf7d0"/>
<text x="255" y="145" text-anchor="middle" font-size="9" fill="#14532d">쎈 수학</text>
<rect x="198" y="154" width="114" height="16" rx="4" fill="#dcfce7" stroke="#86efac"/>
<text x="255" y="166" text-anchor="middle" font-size="8" fill="#14532d">← 副 버튼 또는 드래그</text>
<rect x="336" y="8" width="126" height="170" rx="10" fill="#f8fafc" stroke="#e2e8f0"/>
<text x="399" y="26" text-anchor="middle" font-size="9" fill="#374151" font-weight="700">배정 방법 3가지</text>
<text x="344" y="46" font-size="8" fill="#6b7280">① 목록 선택 후 主/副 버튼</text>
<text x="344" y="64" font-size="8" fill="#6b7280">② PC: 드래그&amp;드롭</text>
<text x="344" y="82" font-size="8" fill="#6b7280">③ 모바일: 길게 누르기</text>
<text x="344" y="108" font-size="8" fill="#f97316">📋 다른 반 교재 복사</text>
<text x="344" y="124" font-size="8" fill="#6b7280">   한 번에 전체 복사</text>
<text x="344" y="148" font-size="8" fill="#4338ca">진도 화면에서 즉시</text>
<text x="344" y="164" font-size="8" fill="#4338ca">반영됩니다</text>
</svg>`,
          },
          text: '⬆️ 교재 배정 흐름입니다.\n\n<b>Pool에 교재를 추가</b>한 뒤, 主/副 버튼이나 드래그로\n주교재·부교재 영역에 배정합니다.\n\n배정된 교재는 <b>진도 화면 요일 카드에 즉시 반영</b>됩니다.',
          action: () => { if (typeof App !== 'undefined') App.mgTab('classes'); },
        },
        {
          text: '👤 이제 <b>계정 탭</b>을 보겠습니다.\n\n세 가지 역할(권한)로 계정을 관리합니다:\n\n• <b>admin (관리자)</b> — 모든 기능 사용\n• <b>operator (운용자)</b> — 진도 입력만 가능\n• <b>teacher (강사)</b> — 지정 반 진도 입력\n  + 관리자가 허용한 교재·성적 메뉴 접근',
          highlight: '#mg-accounts',
          highlightLabel: '계정 관리 영역',
          action: () => { if (typeof App !== 'undefined') App.mgTab('accounts'); },
        },
        {
          diagram: {
            title: '계정 권한 체계',
            svg: `<svg viewBox="0 0 460 148" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:460px">
<rect x="8" y="8" width="132" height="132" rx="12" fill="#fee2e2" stroke="#ef4444" stroke-width="2"/>
<text x="74" y="32" text-anchor="middle" font-size="13" fill="#b91c1c" font-weight="900">admin</text>
<text x="74" y="48" text-anchor="middle" font-size="9" fill="#7f1d1d">관리자</text>
<text x="18" y="68" font-size="8" fill="#b91c1c">✅ 반 추가/수정/삭제</text>
<text x="18" y="84" font-size="8" fill="#b91c1c">✅ 계정 관리</text>
<text x="18" y="100" font-size="8" fill="#b91c1c">✅ 테마/백업</text>
<text x="18" y="116" font-size="8" fill="#b91c1c">✅ 진도/교재/성적</text>
<text x="18" y="132" font-size="8" fill="#b91c1c">✅ 학생/직원 관리</text>
<rect x="152" y="8" width="132" height="132" rx="12" fill="#fff7ed" stroke="#f97316" stroke-width="2"/>
<text x="218" y="32" text-anchor="middle" font-size="13" fill="#c2410c" font-weight="900">operator</text>
<text x="218" y="48" text-anchor="middle" font-size="9" fill="#7c2d12">운용자</text>
<text x="162" y="68" font-size="8" fill="#c2410c">✅ 진도 입력</text>
<text x="162" y="84" font-size="8" fill="#6b7280">❌ 반 관리</text>
<text x="162" y="100" font-size="8" fill="#6b7280">❌ 계정 관리</text>
<text x="162" y="116" font-size="8" fill="#6b7280">❌ 학생/직원</text>
<rect x="296" y="8" width="156" height="132" rx="12" fill="#f5f3ff" stroke="#8b5cf6" stroke-width="2"/>
<text x="374" y="32" text-anchor="middle" font-size="13" fill="#6d28d9" font-weight="900">teacher</text>
<text x="374" y="48" text-anchor="middle" font-size="9" fill="#4c1d95">강사</text>
<text x="306" y="68" font-size="8" fill="#6d28d9">✅ 담당 반 진도 입력</text>
<text x="306" y="84" font-size="8" fill="#6d28d9">✅ 허용된 교재 메뉴</text>
<text x="306" y="100" font-size="8" fill="#6d28d9">✅ 허용된 성적 메뉴</text>
<text x="306" y="116" font-size="8" fill="#6b7280">❌ 다른 반 데이터</text>
<text x="306" y="132" font-size="8" fill="#6b7280">❌ 관리/학생/직원</text>
</svg>`,
          },
          text: '⬆️ 권한 체계 도식입니다.\n\n<b>강사 계정</b>은 담당 반과 추가 메뉴를\n관리자가 개별 지정합니다.\n강사는 <b>자신의 담당 반 데이터에만 접근</b>할 수 있습니다.',
          highlight: '#mg-accounts',
          highlightLabel: '계정 목록',
          action: () => { if (typeof App !== 'undefined') App.mgTab('accounts'); },
        },
        {
          text: '🎨 <b>테마 탭</b>에서 앱 전체 비주얼을 조절합니다.\n\n• 화이트 / 페이퍼 / <b>다크</b> / 슬레이트 4가지 색상 테마\n• 나눔고딕 / 나눔명조 / IBM Plex 등 4종 폰트\n• 글자 크기 / 주교재·부교재 개별 크기 슬라이더\n• 진도 입력칸 너비 조절\n• 운용화면 그리드 / 리스트 전환\n• 하단 탭 순서 드래그 정렬',
          highlight: '#mg-theme',
          highlightLabel: '테마 설정 영역',
          action: () => { if (typeof App !== 'undefined') App.mgTab('theme'); },
        },
        {
          diagram: {
            title: '홈 대시보드 3가지 스타일',
            svg: `<svg viewBox="0 0 480 176" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:480px">
<rect x="8" y="10" width="144" height="144" rx="12" fill="#f8fafc" stroke="#94a3b8" stroke-width="1.6"/>
<text x="80" y="28" text-anchor="middle" font-size="10" fill="#334155" font-weight="800">미니멀</text>
<rect x="18" y="36" width="124" height="12" rx="3" fill="#e2e8f0"/>
<rect x="18" y="54" width="124" height="26" rx="6" fill="#fff" stroke="#e2e8f0"/>
<rect x="18" y="86" width="124" height="26" rx="6" fill="#fff" stroke="#e2e8f0"/>
<rect x="18" y="118" width="124" height="26" rx="6" fill="#fff" stroke="#e2e8f0"/>
<text x="80" y="164" text-anchor="middle" font-size="7" fill="#64748b">여백 넓은 세로 리스트</text>
<rect x="168" y="10" width="144" height="144" rx="12" fill="#f8fafc" stroke="#94a3b8" stroke-width="1.6"/>
<text x="240" y="28" text-anchor="middle" font-size="10" fill="#334155" font-weight="800">컴팩트</text>
<rect x="178" y="36" width="124" height="10" rx="3" fill="#e2e8f0"/>
<rect x="178" y="50" width="59" height="42" rx="5" fill="#fff" stroke="#e2e8f0"/>
<rect x="243" y="50" width="59" height="42" rx="5" fill="#fff" stroke="#e2e8f0"/>
<rect x="178" y="96" width="59" height="42" rx="5" fill="#fff" stroke="#e2e8f0"/>
<rect x="243" y="96" width="59" height="42" rx="5" fill="#fff" stroke="#e2e8f0"/>
<text x="240" y="164" text-anchor="middle" font-size="7" fill="#64748b">2단 그리드, 밀도 높음</text>
<rect x="328" y="10" width="144" height="144" rx="12" fill="#f8fafc" stroke="#94a3b8" stroke-width="1.6"/>
<text x="400" y="28" text-anchor="middle" font-size="10" fill="#334155" font-weight="800">히어로</text>
<rect x="328" y="34" width="144" height="34" rx="0" fill="url(#hg)"/>
<defs><linearGradient id="hg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#4f46e5"/><stop offset="1" stop-color="#7c3aed"/></linearGradient></defs>
<rect x="338" y="76" width="124" height="26" rx="8" fill="#fff" stroke="#e2e8f0"/>
<rect x="338" y="108" width="124" height="26" rx="8" fill="#fff" stroke="#e2e8f0"/>
<text x="400" y="164" text-anchor="middle" font-size="7" fill="#64748b">그라데이션 헤더, 카드 강조</text>
</svg>`,
          },
          text: '🖼️ 테마 탭 안에는 <b>홈 대시보드 스타일</b> 선택도 있습니다.\n\n미니멀 / 컴팩트 / 히어로 3가지 레이아웃 중 골라 적용하면, <b>전체 사용자 화면에 즉시 반영</b>됩니다.\n\n배경 이미지 무드(도시·자연·미니멀 등)와 회전 주기·강도도 여기서 함께 조절할 수 있어요.',
          highlight: '#mg-theme',
          highlightLabel: '대시보드 스타일 선택',
          action: () => { if (typeof App !== 'undefined') App.mgTab('theme'); },
        },
        {
          text: '📦 <b>백업 탭</b>에서 데이터를 안전하게 보관합니다.\n\n• <b>Excel 내보내기</b> — 반·교재·진도 전체를 .xlsx로 저장\n• <b>Excel 가져오기</b> — 이전 백업에서 데이터 복원\n\n🔗 <b>공유 탭</b>에서는 현재 주 진도를 링크로 생성합니다.\n학부모·원장님께 공유하면 실시간으로 확인 가능합니다.',
          highlight: '#mg-io',
          highlightLabel: '백업 & 가져오기',
          action: () => { if (typeof App !== 'undefined') App.mgTab('io'); },
        },
      ],
    },

    /* ── 교재 학습 관리 ── */
    booklib: {
      title: '📖 교재 학습 관리',
      accent: '#0891b2',
      steps: [
        {
          text: '📖 <b>교재 학습 관리</b> 화면입니다.\n\n교재별 챕터·유닛 단위로 <b>학생별 학습 체크리스트</b>를 관리하고,\n단어 스탬프, AI 문제 생성, 학습 리포트까지 제공하는\n핵심 학습 관리 모듈입니다.',
          highlight: '.bl-stabs',
          highlightLabel: '교재 관리 탭',
          action: () => { if (typeof BooklibApp !== 'undefined') BooklibApp.switchTab('library'); },
        },
        {
          text: '📚 <b>교재 관리 탭</b>입니다.\n\n교재를 등록하고 챕터(단원)를 설정합니다.\n\n• 교재명 입력 후 추가 → 카드로 표시\n• 카드 탭 → 챕터 편집 모달 오픈\n• 챕터는 직접 입력하거나 <b>AI가 자동 생성</b>\n• 교재별 성적 설정(단어 문항수·리딩)도 여기서 구성',
          highlight: '#page-booklib',
          highlightLabel: '📚 교재 관리 탭',
          action: () => { if (typeof BooklibApp !== 'undefined') BooklibApp.switchTab('library'); },
        },
        {
          diagram: {
            title: '학습 체크 매트릭스 — 학생 × 챕터',
            svg: `<svg viewBox="0 0 480 182" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:480px">
<rect x="8" y="8" width="76" height="28" rx="5" fill="#0891b2"/>
<text x="46" y="26" text-anchor="middle" font-size="9" fill="#fff" font-weight="700">학생 / 챕터</text>
<rect x="88" y="8" width="52" height="28" rx="5" fill="#0e7490"/>
<text x="114" y="26" text-anchor="middle" font-size="9" fill="#fff">Ch.1</text>
<rect x="144" y="8" width="52" height="28" rx="5" fill="#0e7490"/>
<text x="170" y="26" text-anchor="middle" font-size="9" fill="#fff">Ch.2</text>
<rect x="200" y="8" width="52" height="28" rx="5" fill="#0e7490"/>
<text x="226" y="26" text-anchor="middle" font-size="9" fill="#fff">Ch.3</text>
<rect x="256" y="8" width="52" height="28" rx="5" fill="#0e7490"/>
<text x="282" y="26" text-anchor="middle" font-size="9" fill="#fff">Ch.4</text>
<rect x="312" y="8" width="80" height="28" rx="5" fill="#164e63"/>
<text x="352" y="26" text-anchor="middle" font-size="9" fill="#a5f3fc">달성률</text>
<rect x="8" y="40" width="76" height="28" rx="5" fill="#f0fdfa" stroke="#67e8f9"/>
<text x="46" y="58" text-anchor="middle" font-size="9" fill="#0e7490" font-weight="700">김민준</text>
<rect x="88" y="40" width="52" height="28" rx="5" fill="#dcfce7"/><text x="114" y="58" text-anchor="middle" font-size="13">✅</text>
<rect x="144" y="40" width="52" height="28" rx="5" fill="#dcfce7"/><text x="170" y="58" text-anchor="middle" font-size="13">✅</text>
<rect x="200" y="40" width="52" height="28" rx="5" fill="#dcfce7"/><text x="226" y="58" text-anchor="middle" font-size="13">✅</text>
<rect x="256" y="40" width="52" height="28" rx="5" fill="#fef9c3"/><text x="282" y="58" text-anchor="middle" font-size="13">🔵</text>
<rect x="312" y="40" width="80" height="28" rx="5" fill="#d1fae5"/>
<text x="352" y="53" text-anchor="middle" font-size="10" fill="#065f46" font-weight="800">75%</text>
<rect x="316" y="62" width="48" height="5" rx="2" fill="#86efac"/><rect x="316" y="62" width="36" height="5" rx="2" fill="#22c55e"/>
<rect x="8" y="72" width="76" height="28" rx="5" fill="#f0fdfa" stroke="#67e8f9"/>
<text x="46" y="90" text-anchor="middle" font-size="9" fill="#0e7490" font-weight="700">이서연</text>
<rect x="88" y="72" width="52" height="28" rx="5" fill="#dcfce7"/><text x="114" y="90" text-anchor="middle" font-size="13">✅</text>
<rect x="144" y="72" width="52" height="28" rx="5" fill="#dcfce7"/><text x="170" y="90" text-anchor="middle" font-size="13">✅</text>
<rect x="200" y="72" width="52" height="28" rx="5" fill="#dcfce7"/><text x="226" y="90" text-anchor="middle" font-size="13">✅</text>
<rect x="256" y="72" width="52" height="28" rx="5" fill="#dcfce7"/><text x="282" y="90" text-anchor="middle" font-size="13">✅</text>
<rect x="312" y="72" width="80" height="28" rx="5" fill="#d1fae5"/>
<text x="352" y="85" text-anchor="middle" font-size="10" fill="#065f46" font-weight="800">100%</text>
<rect x="316" y="94" width="48" height="5" rx="2" fill="#22c55e"/>
<rect x="8" y="104" width="76" height="28" rx="5" fill="#f0fdfa" stroke="#67e8f9"/>
<text x="46" y="122" text-anchor="middle" font-size="9" fill="#0e7490" font-weight="700">박지호</text>
<rect x="88" y="104" width="52" height="28" rx="5" fill="#dcfce7"/><text x="114" y="122" text-anchor="middle" font-size="13">✅</text>
<rect x="144" y="104" width="52" height="28" rx="5" fill="#f9fafb" stroke="#e5e7eb"/><text x="170" y="122" text-anchor="middle" font-size="11" fill="#9ca3af">—</text>
<rect x="200" y="104" width="52" height="28" rx="5" fill="#f9fafb" stroke="#e5e7eb"/><text x="226" y="122" text-anchor="middle" font-size="11" fill="#9ca3af">—</text>
<rect x="256" y="104" width="52" height="28" rx="5" fill="#f9fafb" stroke="#e5e7eb"/><text x="282" y="122" text-anchor="middle" font-size="11" fill="#9ca3af">—</text>
<rect x="312" y="104" width="80" height="28" rx="5" fill="#fee2e2"/>
<text x="352" y="117" text-anchor="middle" font-size="10" fill="#b91c1c" font-weight="800">25%</text>
<rect x="316" y="126" width="48" height="5" rx="2" fill="#fecaca"/><rect x="316" y="126" width="12" height="5" rx="2" fill="#ef4444"/>
<text x="16" y="152" font-size="8" fill="#22c55e" font-weight="700">✅ 완료</text>
<text x="56" y="152" font-size="8" fill="#0891b2" font-weight="700">🔵 진행중</text>
<text x="100" y="152" font-size="8" fill="#9ca3af">— 미완</text>
<text x="148" y="152" font-size="8" fill="#6b7280">탭 한 번으로 상태 순환</text>
<text x="16" y="168" font-size="8" fill="#6b7280">반 × 교재 × 학생 조합으로 독립 관리</text>
</svg>`,
          },
          text: '⬆️ <b>학습 체크 매트릭스</b>입니다.\n\n가로 = 챕터, 세로 = 학생.\n셀을 탭할 때마다 <b>미완 → 진행중🔵 → 완료✅</b> 로 순환합니다.\n오른쪽 <b>달성률 바</b>가 실시간 업데이트됩니다.',
          highlight: '#page-booklib',
          highlightLabel: '📊 학습 현황 탭',
          action: () => { if (typeof BooklibApp !== 'undefined') BooklibApp.switchTab('matrix'); },
        },
        {
          text: '🤖 <b>AI 기능 (Gemini)</b>\n\n• 교재명 기반 <b>챕터 목록 자동 생성</b>\n• 학습 내용으로 <b>단어·문법 퀴즈 자동 생성</b>\n• 학생별 학습 현황 분석 코멘트 생성\n\n📊 <b>스탬프 보드</b>\n챕터 완료 시 스탬프가 찍히는 시각적 동기부여 도구\n\n📋 <b>학습 리포트</b>\nPDF/링크로 생성해 학부모에게 공유 가능',
          highlight: '#page-booklib',
          highlightLabel: 'AI · 스탬프 · 리포트',
          action: () => { if (typeof BooklibApp !== 'undefined') BooklibApp.switchTab('library'); },
        },
      ],
    },

    /* ── 성적 관리 ── */
    grade: {
      title: '📝 성적 관리',
      accent: '#16a34a',
      steps: [
        /* STEP 1 — 툴바 개요 */
        {
          text: '📝 <b>성적 관리</b> 화면입니다.\n\n단어 시험과 리딩 시험 점수를 반·교재별로 관리하고,\n통계 분석과 성적 리포트까지 생성하는 종합 모듈입니다.\n\n상단 툴바를 먼저 살펴볼게요.',
          highlight: '.gr-toolbar',
          highlightLabel: '성적 관리 툴바',
          action: () => {
            if (typeof GradeApp !== 'undefined' && GradeApp._setView) GradeApp._setView('excel');
          },
        },
        /* STEP 2 — 반·교재 선택 */
        {
          text: '🎯 <b>반 선택 → 교재 선택</b> 드롭다운으로 시험 데이터를 불러옵니다.\n\n• 반을 먼저 선택하면 해당 반 학생 목록이 자동으로 로드됩니다\n• 교재를 선택하면 그 교재에 설정된 단어·리딩 구성이 적용됩니다\n\n툴바 우측의 <b>🔲 엑셀 / 🐱 카드 / 📄 리포트</b> 버튼으로\n세 가지 보기 모드를 전환할 수 있습니다.',
          highlight: '.gr-toolbar',
          highlightLabel: '반·교재 선택 드롭다운',
          action: () => {
            if (typeof GradeApp !== 'undefined' && GradeApp._setView) GradeApp._setView('excel');
          },
        },
        /* STEP 3 — 엑셀 모드 */
        {
          diagram: {
            title: '🔲 엑셀 모드 — 스프레드시트 형태 일괄 입력',
            svg: `<svg viewBox="0 0 480 178" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:480px">
<rect x="8" y="8" width="480" height="28" rx="0" fill="none"/>
<!-- 뷰 전환 버튼 강조 -->
<rect x="8" y="4" width="58" height="22" rx="6" fill="#166534"/>
<text x="37" y="19" text-anchor="middle" font-size="9" fill="#fff" font-weight="800">🔲 엑셀 ◀ 현재</text>
<rect x="70" y="4" width="52" height="22" rx="6" fill="#e5e7eb"/>
<text x="96" y="19" text-anchor="middle" font-size="9" fill="#6b7280">🐱 카드</text>
<rect x="126" y="4" width="58" height="22" rx="6" fill="#e5e7eb"/>
<text x="155" y="19" text-anchor="middle" font-size="9" fill="#6b7280">📄 리포트</text>
<!-- 헤더 -->
<rect x="8" y="30" width="56" height="24" rx="3" fill="#166534"/>
<text x="36" y="46" text-anchor="middle" font-size="8" fill="#fff" font-weight="700">학생</text>
<rect x="68" y="30" width="86" height="24" rx="3" fill="#1e40af"/>
<text x="111" y="42" text-anchor="middle" font-size="8" fill="#fff">단어시험</text>
<rect x="68" y="42" width="42" height="12" fill="#1d4ed8"/>
<text x="89" y="52" text-anchor="middle" font-size="6" fill="#bfdbfe">오답수</text>
<rect x="112" y="42" width="42" height="12" fill="#1d4ed8"/>
<text x="133" y="52" text-anchor="middle" font-size="6" fill="#bfdbfe">달성률</text>
<rect x="158" y="30" width="130" height="24" rx="3" fill="#7c3aed"/>
<text x="223" y="42" text-anchor="middle" font-size="8" fill="#fff">리딩 Review</text>
<rect x="158" y="42" width="40" height="12" fill="#6d28d9"/>
<text x="178" y="52" text-anchor="middle" font-size="6" fill="#ddd6fe">R1</text>
<rect x="200" y="42" width="40" height="12" fill="#6d28d9"/>
<text x="220" y="52" text-anchor="middle" font-size="6" fill="#ddd6fe">R2</text>
<rect x="242" y="42" width="46" height="12" fill="#6d28d9"/>
<text x="265" y="52" text-anchor="middle" font-size="6" fill="#ddd6fe">달성률</text>
<rect x="292" y="30" width="180" height="24" rx="3" fill="#0e7490"/>
<text x="382" y="46" text-anchor="middle" font-size="8" fill="#fff">Teacher Comment</text>
<!-- 데이터 행 1 -->
<rect x="8" y="56" width="56" height="24" rx="3" fill="#f0fdf4" stroke="#86efac"/>
<text x="36" y="72" text-anchor="middle" font-size="8" fill="#166534" font-weight="700">김민준</text>
<rect x="68" y="56" width="42" height="24" rx="3" fill="#fff" stroke="#d1d5db"/>
<text x="89" y="72" text-anchor="middle" font-size="10" fill="#dc2626" font-weight="700">3</text>
<rect x="112" y="56" width="42" height="24" rx="3" fill="#dcfce7"/>
<text x="133" y="72" text-anchor="middle" font-size="9" fill="#166534" font-weight="700">85%</text>
<rect x="158" y="56" width="40" height="24" rx="3" fill="#fff" stroke="#d1d5db"/>
<text x="178" y="72" text-anchor="middle" font-size="9">18</text>
<rect x="200" y="56" width="40" height="24" rx="3" fill="#fff" stroke="#d1d5db"/>
<text x="220" y="72" text-anchor="middle" font-size="9">22</text>
<rect x="242" y="56" width="46" height="24" rx="3" fill="#dcfce7"/>
<text x="265" y="72" text-anchor="middle" font-size="9" fill="#166534" font-weight="700">90%</text>
<rect x="292" y="56" width="180" height="24" rx="3" fill="#ecfeff" stroke="#67e8f9"/>
<text x="382" y="68" text-anchor="middle" font-size="7" fill="#0e7490">단어 향상 중. 리딩 집중 권장</text>
<!-- 데이터 행 2 -->
<rect x="8" y="84" width="56" height="24" rx="3" fill="#f0fdf4" stroke="#86efac"/>
<text x="36" y="100" text-anchor="middle" font-size="8" fill="#166534" font-weight="700">이서연</text>
<rect x="68" y="84" width="42" height="24" rx="3" fill="#fff" stroke="#d1d5db"/>
<text x="89" y="100" text-anchor="middle" font-size="10" fill="#dc2626" font-weight="700">1</text>
<rect x="112" y="84" width="42" height="24" rx="3" fill="#dcfce7"/>
<text x="133" y="100" text-anchor="middle" font-size="9" fill="#166534" font-weight="700">97%</text>
<rect x="292" y="84" width="180" height="24" rx="3" fill="#ecfeff" stroke="#67e8f9"/>
<text x="382" y="100" text-anchor="middle" font-size="7" fill="#0e7490">최우수. 심화학습 권장</text>
<!-- 평균 행 -->
<rect x="8" y="112" width="464" height="22" rx="3" fill="#fef3c7" stroke="#fde68a"/>
<text x="36" y="127" text-anchor="middle" font-size="8" fill="#92400e" font-weight="800">반 평균</text>
<text x="133" y="127" text-anchor="middle" font-size="9" fill="#92400e" font-weight="700">88%</text>
<text x="265" y="127" text-anchor="middle" font-size="9" fill="#92400e" font-weight="700">91%</text>
<!-- 차트 -->
<rect x="8" y="138" width="464" height="34" rx="6" fill="#f8fafc" stroke="#e2e8f0"/>
<text x="16" y="150" font-size="7" fill="#6b7280" font-weight="700">📊 점수 분포 차트 (실시간)</text>
<rect x="60" y="144" width="10" height="20" rx="2" fill="#6366f1"/>
<rect x="74" y="140" width="10" height="24" rx="2" fill="#6366f1" opacity=".8"/>
<rect x="88" y="143" width="10" height="21" rx="2" fill="#6366f1" opacity=".6"/>
<rect x="170" y="144" width="10" height="20" rx="2" fill="#8b5cf6"/>
<rect x="184" y="138" width="10" height="26" rx="2" fill="#8b5cf6" opacity=".7"/>
<text x="260" y="156" font-size="7" fill="#6b7280">단어(남색) / 리딩(보라) 비교</text>
</svg>`,
          },
          text: '⬆️ 배경 화면이 <b>🔲 엑셀 모드</b>로 전환되었습니다.\n\n• <b>단어 시험</b>: 오답 수 입력 → 달성률 자동 계산\n• <b>리딩</b>: Review별 정답 수 → 점수·달성률 자동\n• <b>Teacher Comment</b>: 학생별 텍스트 코멘트\n• <b>반 평균</b>: 모든 셀 실시간 집계\n• <b>Enter 키</b>로 다음 학생 이동 / ↑↓ 방향키로 값 증감\n• <b>우클릭</b> → 저장·초기화 컨텍스트 메뉴',
          highlight: '.gr-view-toggle',
          highlightLabel: '🔲 엑셀 모드 현재 선택',
          action: () => {
            if (typeof GradeApp !== 'undefined' && GradeApp._setView) GradeApp._setView('excel');
          },
        },
        /* STEP 4 — 카드 모드 */
        {
          diagram: {
            title: '🐱 카드 모드 — 학생별 슬라이드 카드',
            svg: `<svg viewBox="0 0 480 175" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:480px">
<!-- 뷰 전환 버튼 -->
<rect x="8" y="4" width="52" height="20" rx="5" fill="#e5e7eb"/>
<text x="34" y="18" text-anchor="middle" font-size="8" fill="#6b7280">🔲 엑셀</text>
<rect x="64" y="4" width="52" height="20" rx="5" fill="#166534"/>
<text x="90" y="18" text-anchor="middle" font-size="8" fill="#fff" font-weight="800">🐱 카드 ◀</text>
<rect x="120" y="4" width="58" height="20" rx="5" fill="#e5e7eb"/>
<text x="149" y="18" text-anchor="middle" font-size="8" fill="#6b7280">📄 리포트</text>
<!-- 이전 카드 (희미) -->
<rect x="8" y="28" width="110" height="140" rx="12" fill="#f9fafb" stroke="#e5e7eb" opacity=".6"/>
<text x="63" y="56" text-anchor="middle" font-size="10" fill="#9ca3af">← 이전 학생</text>
<text x="63" y="75" text-anchor="middle" font-size="18">🐱</text>
<text x="63" y="96" text-anchor="middle" font-size="10" fill="#9ca3af">박지호</text>
<!-- 현재 카드 (강조) -->
<rect x="124" y="20" width="232" height="150" rx="16" fill="#fff" stroke="#16a34a" stroke-width="2.5" filter="drop-shadow(0 4px 16px rgba(22,163,74,.2))"/>
<rect x="132" y="28" width="216" height="40" rx="10" fill="linear-gradient(135deg,#f0fdf4,#ecfeff)" stroke="#86efac"/>
<rect x="132" y="28" width="216" height="40" rx="10" fill="#f0fdf4" stroke="#86efac"/>
<text x="155" y="45" font-size="14">🐯</text>
<text x="175" y="44" font-size="12" fill="#166534" font-weight="900">김민준</text>
<text x="175" y="58" font-size="9" fill="#6b7280">H1반 · 3학년</text>
<text x="310" y="40" text-anchor="middle" font-size="14" fill="#166534" font-weight="900">88%</text>
<text x="310" y="55" text-anchor="middle" font-size="8" fill="#9ca3af">종합 달성률</text>
<!-- 단어 섹션 -->
<rect x="132" y="74" width="216" height="40" rx="8" fill="#f0fdf4" stroke="#86efac"/>
<text x="142" y="89" font-size="9" fill="#166534" font-weight="700">📘 단어시험</text>
<text x="142" y="104" font-size="8" fill="#6b7280">오답: 3개  달성: 85%</text>
<rect x="290" y="78" width="52" height="16" rx="4" fill="#dcfce7"/>
<text x="316" y="90" text-anchor="middle" font-size="9" fill="#166534" font-weight="700">85%</text>
<!-- 리딩 섹션 -->
<rect x="132" y="120" width="216" height="30" rx="8" fill="#f5f3ff" stroke="#c4b5fd"/>
<text x="142" y="134" font-size="9" fill="#6d28d9" font-weight="700">📗 리딩</text>
<text x="142" y="146" font-size="8" fill="#6b7280">R1:18  R2:22  R3:20  달성: 90%</text>
<!-- 다음 카드 (희미) -->
<rect x="362" y="28" width="110" height="140" rx="12" fill="#f9fafb" stroke="#e5e7eb" opacity=".6"/>
<text x="417" y="56" text-anchor="middle" font-size="10" fill="#9ca3af">다음 학생 →</text>
<text x="417" y="75" text-anchor="middle" font-size="18">🐰</text>
<text x="417" y="96" text-anchor="middle" font-size="10" fill="#9ca3af">이서연</text>
<!-- 도트 네비게이터 -->
<circle cx="224" cy="172" r="3" fill="#16a34a"/>
<rect x="231" y="169" width="16" height="6" rx="3" fill="#16a34a"/>
<circle cx="252" cy="172" r="3" fill="#d1d5db"/>
<circle cx="260" cy="172" r="3" fill="#d1d5db"/>
</svg>`,
          },
          text: '⬆️ 배경 화면이 <b>🐱 카드 모드</b>로 전환되었습니다.\n\n• 학생별 카드가 <b>3:4:3 비율</b>로 슬라이드 형태로 표시됩니다\n• 이전/다음 카드를 탭하거나 스와이프로 이동합니다\n• 현재 카드에서 단어·리딩 점수를 개별 입력합니다\n• <b>Teacher Comment</b>도 카드에서 바로 입력합니다\n• ✨ AI 자동생성 버튼으로 코멘트를 자동으로 작성합니다\n• 하단 <b>도트 네비게이터</b>로 학생 위치를 파악합니다',
          highlight: '.gr-view-toggle',
          highlightLabel: '🐱 카드 모드 전환됨',
          action: () => {
            if (typeof GradeApp !== 'undefined' && GradeApp._setView) GradeApp._setView('card');
          },
        },
        /* STEP 5 — 리포트 모드 */
        {
          diagram: {
            title: '📄 리포트 모드 — 학생별 성적 리포트 생성·공유',
            svg: `<svg viewBox="0 0 480 180" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:480px">
<!-- 뷰 전환 버튼 -->
<rect x="8" y="4" width="52" height="20" rx="5" fill="#e5e7eb"/>
<text x="34" y="18" text-anchor="middle" font-size="8" fill="#6b7280">🔲 엑셀</text>
<rect x="64" y="4" width="52" height="20" rx="5" fill="#e5e7eb"/>
<text x="90" y="18" text-anchor="middle" font-size="8" fill="#6b7280">🐱 카드</text>
<rect x="120" y="4" width="58" height="20" rx="5" fill="#166534"/>
<text x="149" y="18" text-anchor="middle" font-size="8" fill="#fff" font-weight="800">📄 리포트 ◀</text>
<!-- 리포트 미리보기 카드 -->
<rect x="8" y="28" width="200" height="146" rx="14" fill="#fff" stroke="#16a34a" stroke-width="1.5" filter="drop-shadow(0 3px 12px rgba(0,0,0,.12))"/>
<!-- 리포트 헤더 -->
<rect x="8" y="28" width="200" height="32" rx="14" fill="#166534"/>
<rect x="8" y="44" width="200" height="16" fill="#166534"/>
<text x="108" y="43" text-anchor="middle" font-size="9" fill="#fff" font-weight="800">해피트리 영어학원</text>
<text x="108" y="56" text-anchor="middle" font-size="7" fill="#86efac">성적 리포트 · H1반 · 2025년 6월</text>
<!-- 학생 정보 -->
<text x="18" y="76" font-size="9" fill="#166534" font-weight="900">🐯 김민준</text>
<text x="18" y="90" font-size="7" fill="#6b7280">단어 달성률</text>
<rect x="18" y="94" width="90" height="6" rx="3" fill="#e5e7eb"/>
<rect x="18" y="94" width="77" height="6" rx="3" fill="#16a34a"/>
<text x="115" y="100" font-size="8" fill="#166534" font-weight="700">85%</text>
<text x="18" y="112" font-size="7" fill="#6b7280">리딩 달성률</text>
<rect x="18" y="116" width="90" height="6" rx="3" fill="#e5e7eb"/>
<rect x="18" y="116" width="81" height="6" rx="3" fill="#8b5cf6"/>
<text x="115" y="122" font-size="8" fill="#8b5cf6" font-weight="700">90%</text>
<!-- Teacher Comment -->
<rect x="14" y="130" width="188" height="30" rx="6" fill="#f0fdf4" stroke="#86efac"/>
<text x="20" y="143" font-size="7" fill="#166534" font-weight="700">💬 Teacher Comment</text>
<text x="20" y="155" font-size="7" fill="#374151">단어 실력이 꾸준히 향상되고 있습니다.</text>
<!-- 공유 버튼들 -->
<rect x="216" y="28" width="256" height="146" rx="14" fill="#f8fafc" stroke="#e2e8f0"/>
<text x="344" y="50" text-anchor="middle" font-size="10" fill="#374151" font-weight="700">공유 & 전달 옵션</text>
<rect x="230" y="58" width="228" height="26" rx="8" fill="#166534"/>
<text x="344" y="75" text-anchor="middle" font-size="9" fill="#fff" font-weight="700">📲 전달 (Web Share API)</text>
<rect x="230" y="90" width="228" height="26" rx="8" fill="#4f46e5"/>
<text x="344" y="107" text-anchor="middle" font-size="9" fill="#fff" font-weight="700">🖨️ PDF 저장</text>
<rect x="230" y="122" width="228" height="26" rx="8" fill="#0891b2"/>
<text x="344" y="139" text-anchor="middle" font-size="9" fill="#fff" font-weight="700">📸 이미지 캡처</text>
<rect x="230" y="150" width="109" height="20" rx="6" fill="#7c3aed"/>
<text x="284" y="163" text-anchor="middle" font-size="8" fill="#fff" font-weight="700">🔍 미리보기</text>
<rect x="349" y="150" width="109" height="20" rx="6" fill="#f97316"/>
<text x="403" y="163" text-anchor="middle" font-size="8" fill="#fff" font-weight="700">📂 전체 캡처</text>
</svg>`,
          },
          text: '⬆️ 배경 화면이 <b>📄 리포트 모드</b>로 전환되었습니다.\n\n• 학생별 성적 리포트를 미리보기 형태로 표시합니다\n• 학원명·반·날짜 헤더가 자동으로 삽입됩니다\n• 단어·리딩 달성률이 그래프로 시각화됩니다\n• Teacher Comment가 리포트에 포함됩니다\n\n전달 방법:\n  📲 <b>전달</b> — 카카오·문자 등 네이티브 공유\n  🖨️ <b>PDF</b> — 브라우저 PDF 저장\n  📸 <b>캡처</b> — 이미지로 저장\n  📂 <b>전체 캡처</b> — 전 학생 일괄 저장',
          highlight: '.gr-view-toggle',
          highlightLabel: '📄 리포트 모드 전환됨',
          action: () => {
            if (typeof GradeApp !== 'undefined' && GradeApp._setView) GradeApp._setView('report');
          },
        },
        /* STEP 6 — AI 코멘트 */
        {
          text: '✨ <b>AI 코멘트 자동생성</b> 기능입니다.\n\n• 카드 모드에서 <b>✨ AI 자동생성</b> 버튼 탭\n• 학생의 단어·리딩 점수 데이터를 분석\n• Gemini AI가 맞춤형 Teacher Comment를 생성\n• 톤·스타일을 직접 설정하거나 고정 멘트를 활용\n• 생성된 코멘트를 수정 후 저장하면 리포트에 반영\n\n마지막으로 <b>💾 저장</b> 버튼을 눌러 일괄 저장합니다.',
          highlight: '#page-grade',
          highlightLabel: 'AI 코멘트 & 최종 저장',
          action: () => {
            if (typeof GradeApp !== 'undefined' && GradeApp._setView) GradeApp._setView('excel');
          },
        },
      ],
    },

    /* ── 학생 관리 ── */
    students: {
      title: '👨‍🎓 학생 관리',
      accent: '#7c3aed',
      steps: [
        {
          text: '👨‍🎓 <b>학생 관리</b> 화면입니다.\n\n학원 학생의 등록·재원·휴원·퇴원 상태를 관리하고\n반 배정, 학년·학교 정보, 연락처를 체계적으로 저장합니다.\n\n상단 통계 카드부터 확인해볼게요.',
          highlight: '#page-students',
          highlightLabel: '학생 관리 화면',
        },
        {
          text: '📊 <b>통계 카드</b> — 탭 한 번으로 필터링됩니다.\n\n✅ 재원 / 😴 휴원 / 🚪 퇴원 / 전체\n\n검색창에 이름·닉네임·전화번호를 입력하면 실시간 필터링됩니다.\n\n학년·학교·반 드롭다운으로 <b>복합 필터</b>도 가능합니다.',
          highlight: '#page-students',
          highlightLabel: '통계 & 검색 영역',
        },
        {
          diagram: {
            title: '학생 등록 & 상태 관리 흐름',
            svg: `<svg viewBox="0 0 460 162" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:460px">
<defs>
<marker id="a2" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="#7c3aed"/></marker>
<marker id="a3" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="#ef4444"/></marker>
<marker id="a4" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="#16a34a"/></marker>
</defs>
<rect x="8" y="52" width="88" height="52" rx="10" fill="#f5f3ff" stroke="#7c3aed" stroke-width="2"/>
<text x="52" y="74" text-anchor="middle" font-size="11" fill="#5b21b6" font-weight="800">➕ 등록</text>
<text x="52" y="90" text-anchor="middle" font-size="8" fill="#7c3aed">이름·학년·반</text>
<text x="52" y="102" text-anchor="middle" font-size="8" fill="#7c3aed">연락처 입력</text>
<line x1="96" y1="78" x2="130" y2="78" stroke="#7c3aed" stroke-width="1.8" marker-end="url(#a2)"/>
<rect x="132" y="52" width="88" height="52" rx="10" fill="#dcfce7" stroke="#16a34a" stroke-width="2"/>
<text x="176" y="74" text-anchor="middle" font-size="11" fill="#166534" font-weight="800">✅ 재원</text>
<text x="176" y="90" text-anchor="middle" font-size="8" fill="#166534">수업 진행 중</text>
<line x1="220" y1="65" x2="262" y2="36" stroke="#f59e0b" stroke-width="1.5" stroke-dasharray="4,3" marker-end="url(#a2)"/>
<rect x="264" y="12" width="88" height="44" rx="10" fill="#fef3c7" stroke="#f59e0b" stroke-width="1.5"/>
<text x="308" y="32" text-anchor="middle" font-size="10" fill="#92400e" font-weight="800">😴 휴원</text>
<text x="308" y="46" text-anchor="middle" font-size="8" fill="#92400e">일시 중단</text>
<line x1="264" y1="46" x2="222" y2="74" stroke="#16a34a" stroke-width="1.5" stroke-dasharray="3,2" marker-end="url(#a4)"/>
<line x1="220" y1="92" x2="262" y2="112" stroke="#ef4444" stroke-width="1.5" marker-end="url(#a3)"/>
<rect x="264" y="100" width="88" height="44" rx="10" fill="#fee2e2" stroke="#ef4444" stroke-width="1.5"/>
<text x="308" y="120" text-anchor="middle" font-size="10" fill="#b91c1c" font-weight="800">🚪 퇴원</text>
<text x="308" y="134" text-anchor="middle" font-size="8" fill="#b91c1c">종료 처리</text>
<rect x="368" y="8" width="84" height="146" rx="10" fill="#faf5ff" stroke="#c4b5fd"/>
<text x="410" y="26" text-anchor="middle" font-size="9" fill="#5b21b6" font-weight="700">추가 기능</text>
<text x="376" y="44" font-size="7" fill="#6d28d9">📥 Excel 대량 등록</text>
<text x="376" y="60" font-size="7" fill="#6d28d9">🔍 이름/전화 검색</text>
<text x="376" y="76" font-size="7" fill="#6d28d9">🏷 반별 그룹 표시</text>
<text x="376" y="92" font-size="7" fill="#6d28d9">📊 재원 통계 카드</text>
<text x="376" y="108" font-size="7" fill="#6d28d9">✏️ 상세 정보 편집</text>
<text x="376" y="124" font-size="7" fill="#6d28d9">📤 Excel 내보내기</text>
<text x="376" y="140" font-size="7" fill="#6d28d9">💬 학생 메모</text>
</svg>`,
          },
          text: '⬆️ 학생 상태 전환 흐름입니다.\n\n• 학생 카드를 탭 → <b>상세 정보 편집 모달</b>\n• 재원 상태는 드롭다운으로 즉시 변경\n• <b>Excel 드래그앤드롭</b>으로 학생 목록 일괄 등록',
          highlight: '#page-students',
          highlightLabel: '학생 목록 & 상태 관리',
        },
        {
          text: '🏷️ 학생 목록은 <b>반별 그룹핑</b>으로 표시됩니다.\n\n그룹 헤더에 재원 학생 수가 표시되고,\n반 이름을 탭하면 펼침/접힘 됩니다.\n\n⊞ 그리드 / ☰ 리스트 전환 버튼으로\n학생 카드의 표시 방식을 바꿀 수 있습니다.',
          highlight: '#page-students',
          highlightLabel: '반별 그룹 목록',
        },
      ],
    },

    /* ── 직원 관리 ── */
    staff: {
      title: '👩‍💼 직원 관리',
      accent: '#0f766e',
      steps: [
        /* STEP 1 — 탭 개요 */
        {
          text: '👩‍💼 <b>직원 관리</b> 화면입니다.\n\n강사와 직원의 인사 정보, 출퇴근 기록, 급여 계산을\n한 화면에서 통합 관리합니다.\n\n4개 탭 — <b>👥 직원 / 💰 급여 / 📊 일괄정산 / ⚡ 즉시계산</b>을\n순서대로 살펴볼게요.',
          highlight: '.sf-stabs',
          highlightLabel: '직원 관리 탭 메뉴',
          action: () => { if (typeof StaffApp !== 'undefined') StaffApp.switchTab('list'); },
        },
        /* STEP 2 — 👥 직원 목록 탭 */
        {
          text: '👥 <b>직원 목록 탭</b>입니다.\n\n재직·퇴직 직원 카드가 구분되어 표시됩니다.\n\n카드에 등록하는 정보:\n• 이름, 고용형태 (정직원 / 알바)\n• 전화번호, 이메일, 입사일\n• 기본 시급 / 월 급여\n• 업무 유형별 시급 (일반 / 수업)\n\n카드를 탭하면 <b>상세 편집 모달</b>과 <b>근무 달력</b>을 열 수 있습니다.',
          highlight: '#sf-cnt',
          highlightLabel: '👥 직원 목록 (현재 탭)',
          action: () => { if (typeof StaffApp !== 'undefined') StaffApp.switchTab('list'); },
        },
        /* STEP 3 — 직원 카드 구조 다이어그램 */
        {
          diagram: {
            title: '직원 카드 구조 — 등록 정보 & 액션',
            svg: `<svg viewBox="0 0 460 185" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:460px">
<!-- 탭 바 강조 -->
<rect x="8" y="4" width="80" height="20" rx="5" fill="#0f766e"/>
<text x="48" y="18" text-anchor="middle" font-size="8" fill="#fff" font-weight="800">👥 직원 ◀</text>
<rect x="92" y="4" width="72" height="20" rx="5" fill="#e5e7eb"/>
<text x="128" y="18" text-anchor="middle" font-size="8" fill="#6b7280">💰 급여</text>
<rect x="168" y="4" width="72" height="20" rx="5" fill="#e5e7eb"/>
<text x="204" y="18" text-anchor="middle" font-size="8" fill="#6b7280">📊 일괄정산</text>
<rect x="244" y="4" width="72" height="20" rx="5" fill="#fef3c7"/>
<text x="280" y="18" text-anchor="middle" font-size="8" fill="#92400e">⚡ 즉시계산</text>
<!-- 직원 카드 1 (정직원) -->
<rect x="8" y="30" width="214" height="148" rx="14" fill="#fff" stroke="#0f766e" stroke-width="1.8"/>
<rect x="8" y="30" width="214" height="36" rx="14" fill="#f0fdfa" stroke="#0f766e" stroke-width="1.8"/>
<rect x="8" y="50" width="214" height="16" fill="#f0fdfa"/>
<text x="24" y="48" font-size="11" fill="#0f766e" font-weight="900">🏢 김강사</text>
<text x="155" y="44" font-size="8" fill="#0f766e">정직원</text>
<rect x="150" y="36" width="62" height="16" rx="8" fill="#ccfbf1"/>
<text x="181" y="48" text-anchor="middle" font-size="8" fill="#0f766e" font-weight="700">정직원 · 재직</text>
<text x="20" y="78" font-size="8" fill="#6b7280">📅 입사일: 2024-03-01</text>
<text x="20" y="94" font-size="8" fill="#6b7280">📞 010-1234-5678</text>
<text x="20" y="110" font-size="8" fill="#0f766e" font-weight="700">📚 수업 30,000원/h</text>
<text x="20" y="126" font-size="8" fill="#0f766e" font-weight="700">🏢 일반 15,000원/h</text>
<!-- 액션 버튼 -->
<rect x="14" y="138" width="96" height="30" rx="8" fill="#0f766e"/>
<text x="62" y="157" text-anchor="middle" font-size="9" fill="#fff" font-weight="700">📅 근무 달력 열기</text>
<rect x="116" y="138" width="96" height="30" rx="8" fill="#f0fdfa" stroke="#0f766e"/>
<text x="164" y="157" text-anchor="middle" font-size="9" fill="#0f766e" font-weight="700">💰 급여 계산으로</text>
<!-- 직원 카드 2 (알바) -->
<rect x="238" y="30" width="214" height="148" rx="14" fill="#fff" stroke="#f59e0b" stroke-width="1.8"/>
<rect x="238" y="30" width="214" height="36" rx="14" fill="#fef9c3" stroke="#f59e0b" stroke-width="1.8"/>
<rect x="238" y="50" width="214" height="16" fill="#fef9c3"/>
<text x="254" y="48" font-size="11" fill="#92400e" font-weight="900">⏱ 이알바</text>
<rect x="370" y="36" width="70" height="16" rx="8" fill="#fde68a"/>
<text x="405" y="48" text-anchor="middle" font-size="8" fill="#92400e" font-weight="700">알바 · 재직</text>
<text x="250" y="78" font-size="8" fill="#6b7280">📅 입사일: 2025-01-15</text>
<text x="250" y="94" font-size="8" fill="#6b7280">📞 010-9876-5432</text>
<text x="250" y="110" font-size="8" fill="#f59e0b" font-weight="700">💰 시급: 12,000원</text>
<text x="250" y="126" font-size="8" fill="#6b7280">주휴수당 자동 계산</text>
<rect x="244" y="138" width="96" height="30" rx="8" fill="#f59e0b"/>
<text x="292" y="157" text-anchor="middle" font-size="9" fill="#fff" font-weight="700">📅 근무 달력 열기</text>
<rect x="346" y="138" width="96" height="30" rx="8" fill="#fef9c3" stroke="#f59e0b"/>
<text x="394" y="157" text-anchor="middle" font-size="9" fill="#92400e" font-weight="700">💰 급여 계산으로</text>
</svg>`,
          },
          text: '⬆️ <b>직원 카드</b> 구조입니다.\n\n정직원과 알바 카드가 색상으로 구분됩니다.\n• <b>📅 근무 달력 열기</b> → 해당 직원의 월별 달력이 열려\n  날짜별 출퇴근 시간을 입력합니다\n• <b>💰 급여 계산으로</b> → 급여 탭으로 즉시 이동해\n  해당 직원의 이번 달 급여를 자동 계산합니다',
          highlight: '#sf-cnt',
          highlightLabel: '정직원 / 알바 카드',
          action: () => { if (typeof StaffApp !== 'undefined') StaffApp.switchTab('list'); },
        },
        /* STEP 4 — 근무 달력 안내 (직원 목록에서 설명) */
        {
          diagram: {
            title: '근무 달력 — 출퇴근 기록 & 주휴수당 진행 바',
            svg: `<svg viewBox="0 0 460 190" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:460px">
<!-- 달력 헤더 -->
<rect x="8" y="8" width="444" height="36" rx="10" fill="#0f766e"/>
<text x="230" y="24" text-anchor="middle" font-size="11" fill="#fff" font-weight="800">📅 김강사 — 2025년 6월 근무 달력</text>
<text x="230" y="38" text-anchor="middle" font-size="9" fill="#a7f3d0">총 근무 22일 · 수업 86h · 일반 44h</text>
<!-- 주휴수당 바 -->
<rect x="8" y="48" width="444" height="28" rx="8" fill="#ecfdf5" stroke="#86efac"/>
<text x="18" y="62" font-size="8" fill="#0f766e" font-weight="700">🏖 주휴수당 달성률</text>
<rect x="18" y="66" width="360" height="6" rx="3" fill="#d1fae5"/>
<rect x="18" y="66" width="288" height="6" rx="3" fill="#10b981"/>
<text x="395" y="72" font-size="8" fill="#0f766e" font-weight="700">80% (15h 충족)</text>
<!-- 달력 그리드 -->
<rect x="8" y="80" width="444" height="104" rx="10" fill="#f8fafc" stroke="#e2e8f0"/>
<!-- 요일 헤더 -->
<text x="40" y="96" text-anchor="middle" font-size="8" fill="#ef4444">일</text>
<text x="100" y="96" text-anchor="middle" font-size="8" fill="#374151">월</text>
<text x="160" y="96" text-anchor="middle" font-size="8" fill="#374151">화</text>
<text x="220" y="96" text-anchor="middle" font-size="8" fill="#374151">수</text>
<text x="280" y="96" text-anchor="middle" font-size="8" fill="#374151">목</text>
<text x="340" y="96" text-anchor="middle" font-size="8" fill="#374151">금</text>
<text x="400" y="96" text-anchor="middle" font-size="8" fill="#3b82f6">토</text>
<!-- 날짜 셀들 -->
<rect x="72" y="100" width="52" height="38" rx="6" fill="#ccfbf1" stroke="#6ee7b7"/>
<text x="98" y="114" text-anchor="middle" font-size="8" fill="#374151">2</text>
<text x="98" y="127" text-anchor="middle" font-size="7" fill="#0f766e">수업 4h</text>
<text x="98" y="137" text-anchor="middle" font-size="7" fill="#6b7280">일반 2h</text>
<rect x="132" y="100" width="52" height="38" rx="6" fill="#ccfbf1" stroke="#6ee7b7"/>
<text x="158" y="114" text-anchor="middle" font-size="8" fill="#374151">3</text>
<text x="158" y="127" text-anchor="middle" font-size="7" fill="#0f766e">수업 6h</text>
<rect x="192" y="100" width="52" height="38" rx="6" fill="#fff" stroke="#e5e7eb"/>
<text x="218" y="114" text-anchor="middle" font-size="8" fill="#374151">4</text>
<text x="218" y="130" text-anchor="middle" font-size="8" fill="#9ca3af">—</text>
<rect x="252" y="100" width="52" height="38" rx="6" fill="#ccfbf1" stroke="#6ee7b7"/>
<text x="278" y="114" text-anchor="middle" font-size="8" fill="#374151">5</text>
<text x="278" y="127" text-anchor="middle" font-size="7" fill="#0f766e">수업 4h</text>
<text x="278" y="137" text-anchor="middle" font-size="7" fill="#6b7280">일반 2h</text>
<rect x="312" y="100" width="52" height="38" rx="6" fill="#dbeafe" stroke="#93c5fd"/>
<text x="338" y="114" text-anchor="middle" font-size="8" fill="#1d4ed8">6 토</text>
<text x="338" y="130" text-anchor="middle" font-size="7" fill="#1d4ed8">일반 4h</text>
<!-- 오늘 강조 -->
<rect x="192" y="100" width="52" height="38" rx="6" fill="#fef3c7" stroke="#f59e0b" stroke-width="2"/>
<text x="218" y="112" text-anchor="middle" font-size="7" fill="#92400e" font-weight="700">오늘</text>
<text x="218" y="124" text-anchor="middle" font-size="8" fill="#374151">4</text>
<text x="218" y="136" text-anchor="middle" font-size="7" fill="#f59e0b">탭해서 입력</text>
<!-- 일괄 등록 버튼 -->
<rect x="8" y="188" width="444" height="1" fill="none"/>
<rect x="8" y="168" width="214" height="24" rx="8" fill="#0f766e"/>
<text x="115" y="183" text-anchor="middle" font-size="9" fill="#fff" font-weight="700">📋 일괄 등록 (날짜 범위 + 요일)</text>
<rect x="230" y="168" width="222" height="24" rx="8" fill="#f0fdfa" stroke="#0f766e"/>
<text x="341" y="183" text-anchor="middle" font-size="9" fill="#0f766e" font-weight="700">↩ Undo 일괄 취소</text>
</svg>`,
          },
          text: '⬆️ <b>근무 달력</b> 화면입니다.\n직원 카드의 "📅 근무 달력 열기" 버튼으로 열립니다.\n\n• <b>날짜 탭</b> → 해당 날 출퇴근 시간 + 업무유형 입력\n• <b>📋 일괄 등록</b> → 날짜 범위와 요일을 선택해 한번에 등록\n• <b>주휴수당 진행 바</b> → 주 15시간 충족 여부 실시간 표시\n• 상단 합계: 월별 수업/일반 근무시간 자동 집계\n• 달력 화면 하단 <b>💰 급여 계산</b> 버튼으로 즉시 이동',
          highlight: '.sf-stabs',
          highlightLabel: '근무 달력은 카드에서 열림',
          action: () => { if (typeof StaffApp !== 'undefined') StaffApp.switchTab('list'); },
        },
        /* STEP 5 — 💰 급여 탭 */
        {
          text: '💰 배경이 <b>급여 탭</b>으로 전환됩니다.\n\n① 직원 선택 드롭다운\n② 연도 · 월 선택\n③ <b>계산 버튼</b> 클릭\n\n→ 해당 월의 근무 데이터를 자동 집계해서\n  기본급·주휴수당·수업/일반 분리 내역이\n  아래에 상세하게 표시됩니다.\n\n📂 <b>이력 버튼</b>으로 이전 달 급여 기록을 확인할 수 있습니다.',
          highlight: '#sf-cnt',
          highlightLabel: '💰 급여 계산 탭 (현재)',
          action: () => { if (typeof StaffApp !== 'undefined') StaffApp.switchTab('salary'); },
        },
        /* STEP 6 — 급여 계산 결과 다이어그램 */
        {
          diagram: {
            title: '💰 급여 계산 결과 — 기본급 · 주휴수당 · 일별 내역',
            svg: `<svg viewBox="0 0 460 190" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:460px">
<!-- 탭 강조 -->
<rect x="8" y="4" width="60" height="20" rx="5" fill="#e5e7eb"/>
<text x="38" y="17" text-anchor="middle" font-size="8" fill="#6b7280">👥 직원</text>
<rect x="72" y="4" width="60" height="20" rx="5" fill="#0f766e"/>
<text x="102" y="17" text-anchor="middle" font-size="8" fill="#fff" font-weight="800">💰 급여 ◀</text>
<rect x="136" y="4" width="72" height="20" rx="5" fill="#e5e7eb"/>
<text x="172" y="17" text-anchor="middle" font-size="8" fill="#6b7280">📊 일괄정산</text>
<rect x="212" y="4" width="72" height="20" rx="5" fill="#fef3c7"/>
<text x="248" y="17" text-anchor="middle" font-size="8" fill="#92400e">⚡ 즉시계산</text>
<!-- 급여 헤더 카드 -->
<rect x="8" y="28" width="444" height="56" rx="12" fill="#0f766e"/>
<text x="22" y="47" font-size="11" fill="#fff" font-weight="900">⏱ 알바 — 이알바 급여</text>
<text x="22" y="63" font-size="8" fill="#a7f3d0">📅 2025-06-01 ~ 06-30 · 지급일 6월 25일</text>
<text x="380" y="44" text-anchor="middle" font-size="10" fill="#a7f3d0">세전 합계</text>
<text x="380" y="62" text-anchor="middle" font-size="18" fill="#fff" font-weight="900">486,000원</text>
<!-- 급여 항목 -->
<rect x="8" y="88" width="444" height="28" rx="6" fill="#f0fdfa" stroke="#86efac"/>
<text x="20" y="105" font-size="9" fill="#0f766e" font-weight="700">● 수업 근무 (12h × 30,000원)</text>
<text x="380" y="105" text-anchor="middle" font-size="9" fill="#0f766e" font-weight="700">360,000원</text>
<rect x="8" y="120" width="444" height="28" rx="6" fill="#f0fdfa" stroke="#86efac"/>
<text x="20" y="137" font-size="9" fill="#0f766e" font-weight="700">● 일반 근무 (4h × 12,000원)</text>
<text x="380" y="137" text-anchor="middle" font-size="9" fill="#0f766e" font-weight="700">48,000원</text>
<rect x="8" y="152" width="444" height="28" rx="6" fill="#fef9c3" stroke="#fde68a"/>
<text x="20" y="169" font-size="9" fill="#92400e" font-weight="700">🏖 주휴수당 (주 15h 충족 2주)</text>
<text x="380" y="169" text-anchor="middle" font-size="9" fill="#92400e" font-weight="700">+78,000원</text>
</svg>`,
          },
          text: '⬆️ <b>급여 계산 결과</b> 화면입니다.\n\n• 수업 근무 / 일반 근무 항목이 분리되어 표시됩니다\n• 알바는 <b>주휴수당</b>(주 15h 충족 시)이 자동 추가됩니다\n• 일별 상세 내역이 하단에 펼쳐집니다\n• <b>📂 이력</b> 버튼으로 과거 급여 계산 기록을 조회합니다\n• 계산 완료 후 데이터가 <b>자동 저장</b>됩니다',
          highlight: '#sf-cnt',
          highlightLabel: '급여 계산 결과 영역',
          action: () => { if (typeof StaffApp !== 'undefined') StaffApp.switchTab('salary'); },
        },
        /* STEP 7 — 📊 일괄정산 탭 */
        {
          diagram: {
            title: '📊 일괄정산 — 전 직원 급여 한번에 집계',
            svg: `<svg viewBox="0 0 460 172" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:460px">
<!-- 탭 강조 -->
<rect x="8" y="4" width="60" height="20" rx="5" fill="#e5e7eb"/>
<text x="38" y="17" text-anchor="middle" font-size="8" fill="#6b7280">👥 직원</text>
<rect x="72" y="4" width="60" height="20" rx="5" fill="#e5e7eb"/>
<text x="102" y="17" text-anchor="middle" font-size="8" fill="#6b7280">💰 급여</text>
<rect x="136" y="4" width="72" height="20" rx="5" fill="#0f766e"/>
<text x="172" y="17" text-anchor="middle" font-size="8" fill="#fff" font-weight="800">📊 일괄정산 ◀</text>
<rect x="212" y="4" width="72" height="20" rx="5" fill="#fef3c7"/>
<text x="248" y="17" text-anchor="middle" font-size="8" fill="#92400e">⚡ 즉시계산</text>
<!-- 선택 바 -->
<rect x="8" y="28" width="444" height="36" rx="8" fill="#f0fdfa" stroke="#86efac"/>
<text x="20" y="43" font-size="8" fill="#0f766e" font-weight="700">📅 연도</text>
<rect x="60" y="33" width="60" height="22" rx="5" fill="#fff" stroke="#86efac"/>
<text x="90" y="48" text-anchor="middle" font-size="9" fill="#374151">2025년</text>
<text x="135" y="43" font-size="8" fill="#0f766e" font-weight="700">📅 월</text>
<rect x="158" y="33" width="60" height="22" rx="5" fill="#fff" stroke="#86efac"/>
<text x="188" y="48" text-anchor="middle" font-size="9" fill="#374151">6월</text>
<rect x="232" y="33" width="72" height="22" rx="5" fill="#0f766e"/>
<text x="268" y="48" text-anchor="middle" font-size="9" fill="#fff" font-weight="700">📊 집계</text>
<rect x="310" y="33" width="72" height="22" rx="5" fill="#f0fdfa" stroke="#86efac"/>
<text x="346" y="48" text-anchor="middle" font-size="9" fill="#0f766e" font-weight="700">📥 엑셀</text>
<!-- 집계 테이블 -->
<rect x="8" y="68" width="444" height="24" rx="5" fill="#0f766e"/>
<text x="62" y="83" text-anchor="middle" font-size="8" fill="#fff" font-weight="700">직원</text>
<text x="130" y="83" text-anchor="middle" font-size="8" fill="#fff">형태</text>
<text x="190" y="83" text-anchor="middle" font-size="8" fill="#fff">근무일</text>
<text x="250" y="83" text-anchor="middle" font-size="8" fill="#fff">수업(h)</text>
<text x="310" y="83" text-anchor="middle" font-size="8" fill="#fff">일반(h)</text>
<text x="385" y="83" text-anchor="middle" font-size="8" fill="#a7f3d0">세전합계</text>
<rect x="8" y="94" width="444" height="22" rx="3" fill="#f0fdfa"/>
<text x="62" y="109" text-anchor="middle" font-size="8" fill="#374151">김강사</text>
<text x="130" y="109" text-anchor="middle" font-size="8" fill="#374151">정직원</text>
<text x="190" y="109" text-anchor="middle" font-size="8" fill="#374151">22일</text>
<text x="250" y="109" text-anchor="middle" font-size="8" fill="#374151">86h</text>
<text x="310" y="109" text-anchor="middle" font-size="8" fill="#374151">44h</text>
<text x="385" y="109" text-anchor="middle" font-size="8" fill="#0f766e" font-weight="700">3,900,000원</text>
<rect x="8" y="118" width="444" height="22" rx="3" fill="#fffbeb"/>
<text x="62" y="133" text-anchor="middle" font-size="8" fill="#374151">이알바</text>
<text x="130" y="133" text-anchor="middle" font-size="8" fill="#374151">알바</text>
<text x="190" y="133" text-anchor="middle" font-size="8" fill="#374151">18일</text>
<text x="250" y="133" text-anchor="middle" font-size="8" fill="#374151">12h</text>
<text x="310" y="133" text-anchor="middle" font-size="8" fill="#374151">4h</text>
<text x="385" y="133" text-anchor="middle" font-size="8" fill="#f59e0b" font-weight="700">486,000원</text>
<!-- 합계 행 -->
<rect x="8" y="142" width="444" height="24" rx="5" fill="#0f766e"/>
<text x="62" y="157" text-anchor="middle" font-size="8" fill="#fff" font-weight="700">전체 합계</text>
<text x="385" y="157" text-anchor="middle" font-size="10" fill="#fff" font-weight="900">4,386,000원</text>
</svg>`,
          },
          text: '⬆️ 배경이 <b>📊 일괄정산 탭</b>으로 전환됩니다.\n\n연도·월을 선택하고 <b>📊 집계</b> 버튼을 누르면\n재직 중인 <b>전 직원의 급여가 한번에 계산</b>됩니다.\n\n• 직원별 근무일·수업/일반 시간·합계가 표 형태로 표시\n• 맨 아래 전체 합계 금액을 확인\n• <b>📥 엑셀 버튼</b>으로 급여 대장을 .xlsx로 다운로드\n• 월 미선택 시 <b>연간 세무 자료</b>로 집계됩니다',
          highlight: '#sf-cnt',
          highlightLabel: '📊 일괄정산 탭 (현재)',
          action: () => { if (typeof StaffApp !== 'undefined') StaffApp.switchTab('all'); },
        },
        /* STEP 8 — ⚡ 즉시 계산기 탭 */
        {
          text: '⚡ 배경이 <b>즉시 계산기 탭</b>으로 전환됩니다.\n\n직원 등록 없이 <b>바로 시급 계산</b>이 가능한 독립 도구입니다.\n\n사용 방법:\n① 일반 시급 / 수업 시급을 입력 (비우면 최저시급 자동)\n② 이름과 날짜 입력 (선택사항)\n③ <b>시간대 슬롯을 추가</b>해 시작·종료 시간 입력\n④ 업무 유형 (일반 / 수업) 탭으로 전환\n\n슬롯 입력 즉시 <b>상단 합계가 실시간 업데이트</b>됩니다.\n결과는 📋 복사 / 📤 공유 / 🖨️ 인쇄로 전달할 수 있습니다.',
          highlight: '#sf-cnt',
          highlightLabel: '⚡ 즉시 계산기 탭 (현재)',
          action: () => { if (typeof StaffApp !== 'undefined') StaffApp.switchTab('quickcalc'); },
        },
        /* STEP 9 — 즉시 계산기 다이어그램 */
        {
          diagram: {
            title: '⚡ 즉시 시급 계산기 — 슬롯 방식 실시간 계산',
            svg: `<svg viewBox="0 0 460 185" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:460px">
<!-- 탭 강조 -->
<rect x="8" y="4" width="60" height="20" rx="5" fill="#e5e7eb"/>
<text x="38" y="17" text-anchor="middle" font-size="8" fill="#6b7280">👥 직원</text>
<rect x="72" y="4" width="60" height="20" rx="5" fill="#e5e7eb"/>
<text x="102" y="17" text-anchor="middle" font-size="8" fill="#6b7280">💰 급여</text>
<rect x="136" y="4" width="72" height="20" rx="5" fill="#e5e7eb"/>
<text x="172" y="17" text-anchor="middle" font-size="8" fill="#6b7280">📊 일괄정산</text>
<rect x="212" y="4" width="72" height="20" rx="5" fill="#f59e0b"/>
<text x="248" y="17" text-anchor="middle" font-size="8" fill="#fff" font-weight="800">⚡ 즉시계산 ◀</text>
<!-- 합계 바 -->
<rect x="8" y="28" width="444" height="40" rx="10" fill="#0f766e"/>
<text x="20" y="44" font-size="9" fill="#a7f3d0">⚡ 즉시 정산 · 세전 합계</text>
<text x="20" y="62" font-size="18" fill="#fff" font-weight="900">108,000원</text>
<text x="340" y="48" text-anchor="middle" font-size="8" fill="#a7f3d0">총 4시간 30분</text>
<text x="340" y="64" text-anchor="middle" font-size="8" fill="#a7f3d0">일반 54,000 + 수업 54,000</text>
<!-- 공유 버튼 -->
<rect x="408" y="34" width="36" height="26" rx="6" fill="rgba(255,255,255,.15)"/>
<text x="426" y="51" text-anchor="middle" font-size="11">📋</text>
<!-- 시급 설정 -->
<rect x="8" y="72" width="214" height="50" rx="8" fill="#f0fdfa" stroke="#86efac"/>
<text x="20" y="87" font-size="8" fill="#0f766e" font-weight="700">🏢 일반 시급</text>
<rect x="20" y="91" width="90" height="22" rx="5" fill="#fff" stroke="#86efac"/>
<text x="65" y="106" text-anchor="middle" font-size="9" fill="#374151">12,000원</text>
<text x="130" y="87" font-size="8" fill="#0f766e" font-weight="700">📚 수업 시급</text>
<rect x="130" y="91" width="90" height="22" rx="5" fill="#fff" stroke="#86efac"/>
<text x="175" y="106" text-anchor="middle" font-size="9" fill="#374151">24,000원</text>
<rect x="230" y="72" width="222" height="50" rx="8" fill="#fffbeb" stroke="#fde68a"/>
<text x="242" y="87" font-size="8" fill="#92400e" font-weight="700">이름 (선택)</text>
<rect x="242" y="91" width="90" height="22" rx="5" fill="#fff" stroke="#fde68a"/>
<text x="287" y="106" text-anchor="middle" font-size="9" fill="#374151">홍길동</text>
<text x="348" y="87" font-size="8" fill="#92400e" font-weight="700">날짜</text>
<rect x="348" y="91" width="96" height="22" rx="5" fill="#fff" stroke="#fde68a"/>
<text x="396" y="106" text-anchor="middle" font-size="9" fill="#374151">2025-06-04</text>
<!-- 슬롯 목록 -->
<rect x="8" y="126" width="444" height="30" rx="6" fill="#fff" stroke="#86efac"/>
<text x="20" y="141" font-size="8" fill="#374151" font-weight="700">슬롯 1</text>
<rect x="60" y="131" width="60" height="20" rx="4" fill="#f0fdfa" stroke="#86efac"/>
<text x="90" y="145" text-anchor="middle" font-size="8" fill="#374151">09:00</text>
<text x="130" y="145" text-anchor="middle" font-size="8" fill="#9ca3af">~</text>
<rect x="140" y="131" width="60" height="20" rx="4" fill="#f0fdfa" stroke="#86efac"/>
<text x="170" y="145" text-anchor="middle" font-size="8" fill="#374151">11:30</text>
<rect x="210" y="131" width="60" height="20" rx="8" fill="#0f766e"/>
<text x="240" y="145" text-anchor="middle" font-size="8" fill="#fff" font-weight="700">🏢 일반</text>
<rect x="278" y="131" width="60" height="20" rx="8" fill="#e5e7eb"/>
<text x="308" y="145" text-anchor="middle" font-size="8" fill="#6b7280">📚 수업</text>
<text x="380" y="145" text-anchor="middle" font-size="9" fill="#0f766e" font-weight="700">30,000원</text>
<rect x="8" y="160" width="444" height="20" rx="6" fill="#fef9c3" stroke="#fde68a" stroke-dasharray="4,2"/>
<text x="230" y="174" text-anchor="middle" font-size="8" fill="#92400e">＋ 슬롯 추가 (여러 시간대 조합 가능)</text>
</svg>`,
          },
          text: '⬆️ <b>즉시 계산기</b> 구조입니다.\n\n• 상단 <b>합계 바</b>에 총 금액이 항상 표시됩니다\n• <b>슬롯 방식</b>으로 여러 시간대를 조합할 수 있습니다\n• 슬롯마다 <b>🏢 일반 / 📚 수업</b> 유형을 탭으로 전환합니다\n• 시급 입력란을 비우면 <b>최저시급이 자동 적용</b>됩니다\n• 계산 결과를 직원 계정에 연결해 저장도 가능합니다\n\n가장 빠른 임시 급여 정산 도구입니다!',
          highlight: '#sf-cnt',
          highlightLabel: '⚡ 즉시 계산기 슬롯 입력',
          action: () => { if (typeof StaffApp !== 'undefined') StaffApp.switchTab('quickcalc'); },
        },
        /* STEP 10 — 마무리 (목록 복귀) */
        {
          text: '📌 직원 관리 화면 정리입니다.\n\n| 탭 | 역할 |\n─────────────────────────────\n👥 <b>직원</b> — 인사카드 등록, 근무달력 접근\n💰 <b>급여</b> — 개인별 월 급여 계산·저장\n📊 <b>일괄정산</b> — 전 직원 집계 & Excel 다운로드\n⚡ <b>즉시계산</b> — 직원 등록 없는 즉시 정산\n\n각 탭은 독립적으로 동작하며,\n급여 계산 결과는 <b>Firebase에 자동 저장</b>됩니다.\n직접 탭을 눌러 탐색해보세요! 🎉',
          highlight: '.sf-stabs',
          highlightLabel: '4개 탭 전체 요약',
          action: () => { if (typeof StaffApp !== 'undefined') StaffApp.switchTab('list'); },
        },
      ],
    },

    /* ── 홈 대시보드 (v3.1 신규) ── */
    dashboard: {
      title: '🏠 홈 대시보드',
      accent: '#f59e0b',
      steps: [
        {
          diagram: {
            title: '홈 대시보드 구성 — 위젯 조합 & 순서 변경',
            svg: `<svg viewBox="0 0 460 196" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:460px">
<text x="20" y="30" font-size="14" fill="#9ca3af">≡</text>
<rect x="40" y="10" width="410" height="34" rx="9" fill="#fef3c7" stroke="#f59e0b" stroke-width="1.6"/>
<text x="52" y="31" font-size="9.5" fill="#92400e" font-weight="800">🗓️ 일정표 위젯 — 휴일·근무·급여·공지 통합</text>
<text x="20" y="68" font-size="14" fill="#9ca3af">≡</text>
<rect x="40" y="48" width="410" height="34" rx="9" fill="#eff6ff" stroke="#2563eb" stroke-width="1.6"/>
<text x="52" y="69" font-size="9.5" fill="#1e40af" font-weight="800">📊 교재 학습 현황 — 반·교재별 미완료 카드</text>
<text x="20" y="106" font-size="14" fill="#9ca3af">≡</text>
<rect x="40" y="86" width="410" height="34" rx="9" fill="#f0fdf4" stroke="#16a34a" stroke-width="1.6"/>
<text x="52" y="107" font-size="9.5" fill="#166534" font-weight="800">⭐ 즐겨찾기 콘텐츠 — 자주 쓰는 자료 바로가기</text>
<text x="20" y="144" font-size="14" fill="#9ca3af">≡</text>
<rect x="40" y="124" width="410" height="34" rx="9" fill="#f5f3ff" stroke="#7c3aed" stroke-width="1.6"/>
<text x="52" y="145" font-size="9.5" fill="#5b21b6" font-weight="800">💬 오늘의 명언 — 매일 자동 교체</text>
<text x="230" y="180" text-anchor="middle" font-size="8.5" fill="#6b7280">≡ 버튼으로 순서를 자유롭게 바꾸고, 기기별로 저장됩니다</text>
</svg>`,
          },
          text: '🏠 <b>홈 대시보드</b> 화면입니다.\n\n로그인 후 가장 먼저 볼 수 있는 요약 화면으로, 오늘 챙겨야 할 일정과 교재 진도 현황을 한눈에 모아 보여줍니다.\n\n(운용자 계정은 관리자가 "홈" 메뉴 권한을 별도로 열어줘야 접근할 수 있어요.)',
          highlight: '#page-dashboard',
          highlightLabel: '홈 대시보드 화면',
        },
        {
          diagram: {
            title: '통합 일정 캘린더 — 5가지 정보를 한 화면에',
            svg: `<svg viewBox="0 0 460 118" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:460px">
<circle cx="26" cy="18" r="6" fill="#e11d48"/>
<text x="40" y="22" font-size="9" fill="#374151">방학 · 공휴일 · 일반 일정</text>
<circle cx="26" cy="42" r="6" fill="#2563eb"/>
<text x="40" y="46" font-size="9" fill="#374151">직원 근무 기록</text>
<circle cx="26" cy="66" r="6" fill="#16a34a"/>
<text x="40" y="70" font-size="9" fill="#374151">급여일</text>
<circle cx="256" cy="18" r="6" fill="#7c3aed"/>
<text x="270" y="22" font-size="9" fill="#374151">예약된 공지 알림</text>
<circle cx="256" cy="42" r="6" fill="#f59e0b"/>
<text x="270" y="46" font-size="9" fill="#374151">🌤 그날의 날씨(배경)</text>
<text x="230" y="98" text-anchor="middle" font-size="8.5" fill="#6b7280">날짜 탭 → 해당일 상세 내용으로 즉시 전환</text>
</svg>`,
          },
          text: '🗓️ <b>일정표 위젯</b>입니다.\n\n방학·공휴일·일반 일정은 물론, 직원 근무 기록과 급여일, 예약된 공지 알림까지 이 캘린더 하나에 통합되어 표시됩니다.\n\n오늘 날짜가 기본으로 선택되어 있고, 다른 날짜를 탭하면 그날의 상세 내용으로 바로 바뀝니다. 배경에는 그날의 <b>날씨</b>도 은은하게 표시돼요.',
          highlight: '#sch-mini-cal',
          highlightLabel: '통합 일정 캘린더',
        },
        {
          text: '📊 <b>교재 학습 현황 요약</b>입니다.\n\n반·교재별로 아직 수행하지 못한 학생과 챕터 수를 카드로 보여줍니다.\n\n카드를 탭하면 바로 해당 반·교재의 학습 현황(매트릭스) 화면으로 이동해서 세부 체크까지 이어서 할 수 있어요.',
          highlight: '#db-book-sec',
          highlightLabel: '교재 학습 현황 카드',
        },
        {
          text: '≡ <b>화면 구성 순서 변경</b> 버튼입니다.\n\n일정표·교재현황·즐겨찾기 콘텐츠 등 섹션의 표시 순서를 원하는 대로 바꿀 수 있어요. 설정은 기기별로 저장되어, 내 화면에서만 원하는 순서로 보입니다.',
          highlight: '.db-reorder-btn',
          highlightLabel: '섹션 순서 변경',
        },
        {
          text: '💬 화면 상단의 <b>오늘의 명언</b>도 매일 자동으로 바뀌면서 짧게 하루를 시작하는 기분을 더해줍니다.\n\n홈 화면은 이렇게 "오늘 뭘 해야 하지?"를 가장 빠르게 파악하는 용도로 만들어졌어요. 🎉',
          highlight: '#db-quote-banner',
          highlightLabel: '오늘의 명언',
        },
      ],
    },

    /* ── 콘텐츠: 자료실 · 영상 워크시트 · 학습 게임 (v신규) ── */
    archive: {
      title: '🗂 콘텐츠 (자료실 · 영상 · PDF · 게임)',
      accent: '#e11d48',
      steps: [
        {
          diagram: {
            title: '콘텐츠 화면 — 4개 도구 한눈에 보기',
            svg: `<svg viewBox="0 0 500 172" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:500px">
<rect x="17" y="10" width="112" height="140" rx="12" fill="#fdf2f8" stroke="#e11d48" stroke-width="1.8"/>
<text x="73" y="34" text-anchor="middle" font-size="20">📁</text>
<text x="73" y="54" text-anchor="middle" font-size="11" fill="#9f1239" font-weight="800">자료실</text>
<text x="73" y="72" text-anchor="middle" font-size="7.5" fill="#831843">파일 업로드·검색</text>
<text x="73" y="85" text-anchor="middle" font-size="7.5" fill="#831843">미리보기·zip 다운</text>
<text x="73" y="98" text-anchor="middle" font-size="7.5" fill="#831843">비밀번호 보호</text>
<rect x="73" y="126" width="0" height="0"/>
<text x="73" y="136" text-anchor="middle" font-size="7" fill="#be123c" font-weight="700">기본 탭</text>
<rect x="135" y="10" width="112" height="140" rx="12" fill="#eff6ff" stroke="#2563eb" stroke-width="1.8"/>
<text x="191" y="34" text-anchor="middle" font-size="20">🎬</text>
<text x="191" y="54" text-anchor="middle" font-size="11" fill="#1e40af" font-weight="800">영상 워크시트</text>
<text x="191" y="72" text-anchor="middle" font-size="7.5" fill="#1e3a8a">유튜브 대본 추출</text>
<text x="191" y="85" text-anchor="middle" font-size="7.5" fill="#1e3a8a">AI 단어·뜻·예문</text>
<text x="191" y="98" text-anchor="middle" font-size="7.5" fill="#1e3a8a">학습지 PDF 생성</text>
<rect x="253" y="10" width="112" height="140" rx="12" fill="#f0fdf4" stroke="#16a34a" stroke-width="1.8"/>
<text x="309" y="34" text-anchor="middle" font-size="20">📝</text>
<text x="309" y="54" text-anchor="middle" font-size="11" fill="#166534" font-weight="800">PDF 워크시트</text>
<text x="309" y="72" text-anchor="middle" font-size="7.5" fill="#14532d">PDF·이미지 병합</text>
<text x="309" y="85" text-anchor="middle" font-size="7.5" fill="#14532d">자르기·합치기</text>
<text x="309" y="98" text-anchor="middle" font-size="7.5" fill="#14532d">텍스트·이미지 편집</text>
<rect x="371" y="10" width="112" height="140" rx="12" fill="#f5f3ff" stroke="#7c3aed" stroke-width="1.8"/>
<text x="427" y="34" text-anchor="middle" font-size="20">🎮</text>
<text x="427" y="54" text-anchor="middle" font-size="11" fill="#5b21b6" font-weight="800">학습 게임</text>
<text x="427" y="72" text-anchor="middle" font-size="7.5" fill="#4c1d95">짝맞추기·스펠링</text>
<text x="427" y="85" text-anchor="middle" font-size="7.5" fill="#4c1d95">퀴즈 3종</text>
<text x="427" y="98" text-anchor="middle" font-size="7.5" fill="#4c1d95">대본·단어 재활용</text>
<text x="250" y="164" text-anchor="middle" font-size="8.5" fill="#6b7280">▲ 화면 상단 탭 전환만으로 4가지 도구를 자유롭게 오갈 수 있어요</text>
</svg>`,
          },
          text: '🗂 <b>콘텐츠</b> 화면입니다.\n\n파일 <b>자료실</b>, 🎬 <b>영상 워크시트</b>, 📝 <b>PDF 워크시트 제작</b>, 🎮 <b>학습 게임</b> 4가지 도구가 탭 하나로 묶여 있습니다.\n\n먼저 기본 탭인 자료실부터 살펴볼게요.',
          highlight: '#page-archive .ar-tool-tabs',
          highlightLabel: '4개 도구 탭',
          action: () => { if (typeof ArchiveApp !== 'undefined') ArchiveApp._selectTool('files'); },
        },
        {
          text: '🔍 <b>검색 · 분류</b> 영역입니다.\n\n파일명·설명은 물론 문서 내용(엑셀 등)까지 검색되고, 분류 탭으로 원하는 카테고리만 골라 볼 수 있어요.\n\n"＋ 분류" 버튼으로 새 분류도 바로 추가할 수 있습니다.',
          highlight: '#page-archive .ar-cats',
          highlightLabel: '검색 & 분류',
          action: () => { if (typeof ArchiveApp !== 'undefined') ArchiveApp._selectTool('files'); },
        },
        {
          text: '📁 자료 카드를 탭하면 이미지는 바로, PDF·엑셀은 미리보기 화면에서 바로 확인할 수 있어요.\n\n오른쪽 아래 <b>＋ 버튼</b>으로 파일을 올리고, 여러 개를 선택해서 zip으로 한 번에 내려받을 수도 있습니다.\n\n비밀번호를 걸어 특정 자료만 보호하는 것도 가능해요.',
          highlight: '#page-archive .ar-fab',
          highlightLabel: '자료 올리기',
          action: () => { if (typeof ArchiveApp !== 'undefined') ArchiveApp._selectTool('files'); },
        },
        {
          diagram: {
            title: '영상 워크시트 흐름 — URL 등록부터 학습지 완성까지',
            svg: `<svg viewBox="0 0 500 140" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:500px">
<defs><marker id="v1" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="#2563eb"/></marker></defs>
<rect x="6" y="14" width="104" height="86" rx="10" fill="#eff6ff" stroke="#2563eb" stroke-width="1.6"/>
<text x="58" y="38" text-anchor="middle" font-size="16">🔗</text>
<text x="58" y="58" text-anchor="middle" font-size="8.5" fill="#1e40af" font-weight="800">유튜브 URL 등록</text>
<text x="58" y="74" text-anchor="middle" font-size="7" fill="#1e3a8a">링크만 붙여넣기</text>
<line x1="110" y1="57" x2="128" y2="57" stroke="#2563eb" stroke-width="1.6" marker-end="url(#v1)"/>
<rect x="132" y="14" width="104" height="86" rx="10" fill="#ecfeff" stroke="#0891b2" stroke-width="1.6"/>
<text x="184" y="38" text-anchor="middle" font-size="16">📜</text>
<text x="184" y="58" text-anchor="middle" font-size="8.5" fill="#0e7490" font-weight="800">대본 자동 추출</text>
<text x="184" y="74" text-anchor="middle" font-size="7" fill="#164e63">자막 텍스트화</text>
<line x1="236" y1="57" x2="254" y2="57" stroke="#2563eb" stroke-width="1.6" marker-end="url(#v1)"/>
<rect x="258" y="14" width="112" height="86" rx="10" fill="#f5f3ff" stroke="#7c3aed" stroke-width="1.6"/>
<text x="314" y="38" text-anchor="middle" font-size="16">🤖</text>
<text x="314" y="58" text-anchor="middle" font-size="8.5" fill="#5b21b6" font-weight="800">AI 자동 분석</text>
<text x="314" y="74" text-anchor="middle" font-size="7" fill="#4c1d95">단어·뜻·예문 생성</text>
<line x1="370" y1="57" x2="388" y2="57" stroke="#2563eb" stroke-width="1.6" marker-end="url(#v1)"/>
<rect x="392" y="14" width="102" height="86" rx="10" fill="#f0fdf4" stroke="#16a34a" stroke-width="1.6"/>
<text x="443" y="38" text-anchor="middle" font-size="16">📄</text>
<text x="443" y="58" text-anchor="middle" font-size="8.5" fill="#166534" font-weight="800">학습지 PDF</text>
<text x="443" y="74" text-anchor="middle" font-size="7" fill="#14532d">이미지 포함 완성</text>
<text x="250" y="122" text-anchor="middle" font-size="8.5" fill="#6b7280">🏷 주제별 분류: 여행 · 동물 · 음식 · 일상 등으로 영상을 정리해 관리</text>
</svg>`,
          },
          text: '🎬 <b>영상 워크시트</b> 탭입니다.\n\n유튜브 영상을 등록하면 대본에서 AI가 자동으로 단어·뜻·예문을 뽑아주고, 이미지가 포함된 학습지 PDF까지 바로 만들어줍니다.\n\n주제별(여행·동물·음식 등)로 영상을 분류해서 관리할 수 있어요.',
          highlight: '#page-archive .ev-cats-row',
          highlightLabel: '영상 워크시트',
          action: () => { if (typeof ArchiveApp !== 'undefined') ArchiveApp._selectTool('video-worksheet'); },
        },
        {
          diagram: {
            title: 'PDF 워크시트 제작 흐름 — 소스 모으기부터 자동 등록까지',
            svg: `<svg viewBox="0 0 500 140" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:500px">
<defs><marker id="p1" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="#16a34a"/></marker></defs>
<rect x="6" y="14" width="110" height="86" rx="10" fill="#f0fdf4" stroke="#16a34a" stroke-width="1.6"/>
<text x="61" y="38" text-anchor="middle" font-size="16">📄🖼</text>
<text x="61" y="58" text-anchor="middle" font-size="8.5" fill="#166534" font-weight="800">소스 모으기</text>
<text x="61" y="74" text-anchor="middle" font-size="7" fill="#14532d">PDF·이미지 여러 개</text>
<line x1="116" y1="57" x2="134" y2="57" stroke="#16a34a" stroke-width="1.6" marker-end="url(#p1)"/>
<rect x="138" y="14" width="110" height="86" rx="10" fill="#fefce8" stroke="#ca8a04" stroke-width="1.6"/>
<text x="193" y="38" text-anchor="middle" font-size="16">✂️</text>
<text x="193" y="58" text-anchor="middle" font-size="8.5" fill="#854d0e" font-weight="800">페이지 편집</text>
<text x="193" y="74" text-anchor="middle" font-size="7" fill="#713f12">자르기·합치기</text>
<line x1="248" y1="57" x2="266" y2="57" stroke="#16a34a" stroke-width="1.6" marker-end="url(#p1)"/>
<rect x="270" y="14" width="110" height="86" rx="10" fill="#eff6ff" stroke="#2563eb" stroke-width="1.6"/>
<text x="325" y="38" text-anchor="middle" font-size="16">✍️</text>
<text x="325" y="58" text-anchor="middle" font-size="8.5" fill="#1e40af" font-weight="800">요소 추가</text>
<text x="325" y="74" text-anchor="middle" font-size="7" fill="#1e3a8a">텍스트·이미지 배치</text>
<line x1="380" y1="57" x2="398" y2="57" stroke="#16a34a" stroke-width="1.6" marker-end="url(#p1)"/>
<rect x="402" y="14" width="92" height="86" rx="10" fill="#fdf2f8" stroke="#e11d48" stroke-width="1.6"/>
<text x="448" y="38" text-anchor="middle" font-size="16">💾</text>
<text x="448" y="58" text-anchor="middle" font-size="8.5" fill="#9f1239" font-weight="800">완성</text>
<text x="448" y="74" text-anchor="middle" font-size="7" fill="#831843">다운로드+자동등록</text>
<text x="250" y="122" text-anchor="middle" font-size="8.5" fill="#6b7280">🗂 완성 즉시 자료실 파일 목록에도 자동으로 추가됩니다</text>
</svg>`,
          },
          text: '📝 <b>PDF 워크시트 제작</b> 탭입니다.\n\n여러 개의 PDF·이미지를 페이지 단위로 모아서 자르고 합친 뒤, 텍스트와 이미지를 자유롭게 얹어 나만의 학습지 PDF를 새로 만들 수 있어요.\n\n완성한 워크시트는 다운로드와 동시에 <b>자료실에도 자동 등록</b>됩니다.',
          highlight: '#page-archive .pe-toolbar',
          highlightLabel: 'PDF 워크시트 제작',
          action: () => { if (typeof ArchiveApp !== 'undefined') ArchiveApp._selectTool('pdf-editor'); },
        },
        {
          diagram: {
            title: '학습 게임 흐름 — 소스 선택부터 출력까지',
            svg: `<svg viewBox="0 0 460 148" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:460px">
<defs><marker id="g1" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="#7c3aed"/></marker></defs>
<rect x="6" y="16" width="118" height="94" rx="10" fill="#ecfeff" stroke="#0891b2" stroke-width="1.6"/>
<text x="65" y="40" text-anchor="middle" font-size="16">🎬📝</text>
<text x="65" y="60" text-anchor="middle" font-size="8.5" fill="#0e7490" font-weight="800">소스 선택</text>
<text x="65" y="76" text-anchor="middle" font-size="7" fill="#164e63">영상 대본 또는</text>
<text x="65" y="88" text-anchor="middle" font-size="7" fill="#164e63">직접 입력 단어</text>
<line x1="124" y1="63" x2="142" y2="63" stroke="#7c3aed" stroke-width="1.6" marker-end="url(#g1)"/>
<rect x="146" y="16" width="130" height="94" rx="10" fill="#f5f3ff" stroke="#7c3aed" stroke-width="1.6"/>
<text x="211" y="40" text-anchor="middle" font-size="16">🎮</text>
<text x="211" y="60" text-anchor="middle" font-size="8.5" fill="#5b21b6" font-weight="800">게임 타입 선택</text>
<text x="211" y="76" text-anchor="middle" font-size="7" fill="#4c1d95">짝맞추기·스펠링</text>
<text x="211" y="88" text-anchor="middle" font-size="7" fill="#4c1d95">퀴즈 (3종 중 선택)</text>
<line x1="276" y1="63" x2="294" y2="63" stroke="#7c3aed" stroke-width="1.6" marker-end="url(#g1)"/>
<rect x="298" y="16" width="156" height="94" rx="10" fill="#fdf2f8" stroke="#e11d48" stroke-width="1.6"/>
<text x="376" y="38" text-anchor="middle" font-size="8.5" fill="#9f1239" font-weight="800">출력 방식 2가지</text>
<text x="376" y="58" text-anchor="middle" font-size="7.5" fill="#831843">🖥️ 빔프로젝터 화면용</text>
<text x="376" y="72" text-anchor="middle" font-size="7" fill="#9f1239">다 같이 하는 게임</text>
<text x="376" y="90" text-anchor="middle" font-size="7.5" fill="#831843">🖨️ 인쇄용 워크시트</text>
<text x="376" y="104" text-anchor="middle" font-size="7" fill="#9f1239">개별 학습·과제용</text>
<text x="230" y="132" text-anchor="middle" font-size="8.5" fill="#6b7280">♻️ 이미 만든 대본·단어를 그대로 재활용하니 새로 준비할 필요가 없어요</text>
</svg>`,
          },
          text: '🎮 <b>학습 게임</b> 탭입니다.\n\n짝맞추기 · 스펠링 · 퀴즈 3종 게임을 만들 수 있어요. 영상 대본이나 직접 입력한 단어를 그대로 재활용하기 때문에 새로 준비할 필요가 없습니다.\n\n빔프로젝터로 다 같이 하는 화면 게임과, 인쇄용 워크시트를 둘 다 만들 수 있어요.',
          highlight: '#page-archive .gm-source-tabs',
          highlightLabel: '학습 게임 만들기',
          action: () => { if (typeof ArchiveApp !== 'undefined') ArchiveApp._selectTool('games'); },
        },
      ],
    },
  };

  /* ══════════════════════════════════════════════
   * CSS
   * ══════════════════════════════════════════════ */
  function _css() {
    if (document.getElementById('gm-css')) return;
    const s = document.createElement('style');
    s.id = 'gm-css';
    s.textContent = `
/* ── 읽기전용 배지 ── */
#gm-badge {
  position:fixed; top:0; left:0; right:0; z-index:9998;
  background:linear-gradient(90deg,#f97316,#ef4444);
  color:#fff; font-size:12px; font-weight:800; padding:5px 14px;
  display:flex; align-items:center; justify-content:center; gap:8px;
  box-shadow:0 2px 16px rgba(249,115,22,.4); letter-spacing:.3px; user-select:none;
}
#gm-badge .gm-b-icon { font-size:13px; }
#gm-badge .gm-b-x {
  margin-left:auto; background:rgba(255,255,255,.25); border:none;
  color:#fff; border-radius:50%; width:20px; height:20px;
  cursor:pointer; font-size:13px; display:flex; align-items:center; justify-content:center;
}
body.gm-on { padding-top:30px !important; }

/* ── SVG 마스크 배경 ── */
#gm-mask-svg {
  position:fixed; inset:0; width:100%; height:100%;
  z-index:8750; pointer-events:none; opacity:0;
  transition:opacity .35s ease;
}
#gm-mask-svg.gm-mask-on { opacity:1; }

/* ── 스포트라이트 테두리 ── */
#gm-spotlight {
  position:fixed; z-index:8790; pointer-events:none;
  border-radius:14px; opacity:0;
  transition:left .42s cubic-bezier(.22,1,.36,1),
             top  .42s cubic-bezier(.22,1,.36,1),
             width .42s cubic-bezier(.22,1,.36,1),
             height .42s cubic-bezier(.22,1,.36,1),
             opacity .28s ease;
}
#gm-spotlight.gm-spot-on { opacity:1; }
#gm-spotlight::before {
  content:''; position:absolute; inset:-3px; border-radius:16px;
  border:2.5px solid rgba(255,255,255,.92);
  box-shadow:0 0 0 1px rgba(99,102,241,.8), 0 0 22px 5px rgba(99,102,241,.45),
             inset 0 0 14px rgba(255,255,255,.06);
}
#gm-spotlight::after {
  content:''; position:absolute; inset:-10px; border-radius:22px;
  border:2px solid rgba(99,102,241,.55);
  animation:gm-pulse 1.9s ease-out infinite;
}
@keyframes gm-pulse {
  0%   { opacity:.85; transform:scale(1); }
  70%  { opacity:0;   transform:scale(1.07); }
  100% { opacity:0;   transform:scale(1.07); }
}

/* ── 말풍선 라벨 ── */
#gm-spot-label {
  position:fixed; z-index:8795; pointer-events:none;
  background:linear-gradient(135deg,#4f46e5,#7c3aed);
  color:#fff; font-size:11px; font-weight:800;
  padding:5px 12px 5px 9px; border-radius:20px;
  box-shadow:0 4px 16px rgba(79,70,229,.5);
  display:flex; align-items:center; gap:5px;
  white-space:nowrap; letter-spacing:.2px;
  opacity:0; transform:translateY(6px);
  transition:opacity .28s ease, transform .28s ease;
}
#gm-spot-label.gm-label-on { opacity:1; transform:translateY(0); }

/* ── 오버레이 (배경 투명, SVG 마스크가 담당) ── */
#gm-overlay {
  position:fixed; inset:0; z-index:8800;
  background:transparent;
  display:flex; align-items:flex-end; justify-content:center;
  opacity:0; pointer-events:none;
  transition:opacity .32s ease;
}
#gm-overlay.gm-show { opacity:1; pointer-events:all; }

/* ── 패널 ── */
.gm-panel {
  width:100%; max-width:580px; max-height:85vh;
  background:var(--card,#fff);
  border-radius:22px 22px 0 0;
  box-shadow:0 -8px 48px rgba(0,0,0,.36);
  display:flex; flex-direction:column; overflow:hidden;
  transform:translateY(50px);
  transition:transform .36s cubic-bezier(.22,1,.36,1);
  position:relative; z-index:8900;
}
#gm-overlay.gm-show .gm-panel { transform:translateY(0); }

/* 헤더 */
.gm-ph {
  display:flex; align-items:center; justify-content:space-between;
  padding:15px 18px 10px; flex-shrink:0;
  border-bottom:1px solid var(--bdr,#e2e4ef);
}
.gm-ph-left { display:flex; align-items:center; gap:10px; }
.gm-accent-bar { width:4px; height:28px; border-radius:2px; flex-shrink:0; }
.gm-ph-title { font-size:16px; font-weight:900; color:var(--tx,#1a1a2e); }
.gm-ph-badge {
  font-size:10px; font-weight:700; background:#f97316; color:#fff;
  border-radius:20px; padding:2px 8px;
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

/* 스텝 카운터 */
.gm-step-cnt {
  font-size:10px; color:var(--tx3,#9898b8); font-weight:700;
  padding:5px 18px 3px; flex-shrink:0; text-align:right;
}

/* 바디 */
.gm-body {
  flex:1; overflow-y:auto; padding:10px 18px 14px;
  scroll-behavior:smooth; scrollbar-width:thin;
}

/* 텍스트 */
.gm-text {
  font-size:13.5px; line-height:1.9;
  color:var(--tx,#1a1a2e); white-space:pre-wrap; margin-bottom:12px;
}
.gm-text b { color:var(--a,#4f46e5); font-weight:800; }

/* 다이어그램 */
.gm-diag {
  background:var(--surf2,#f1f3f9); border:1px solid var(--bdr,#e2e4ef);
  border-radius:14px; padding:10px 12px; margin-bottom:12px;
}
.gm-diag-lbl { font-size:10px; font-weight:700; color:var(--tx3,#9898b8); letter-spacing:.5px; margin-bottom:8px; }

/* 타이핑 커서 */
.gm-cur {
  display:inline-block; width:2px; height:.9em;
  background:var(--a,#4f46e5); margin-left:1px; vertical-align:middle;
  animation:gm-blink .65s step-end infinite;
}
@keyframes gm-blink { 0%,100%{opacity:1} 50%{opacity:0} }

/* ── 하단 버튼 3개 ── */
.gm-foot {
  padding:8px 18px 14px; display:flex; gap:8px; flex-shrink:0;
  border-top:1px solid var(--bdr,#e2e4ef); align-items:center;
}
.gm-btn-close {
  padding:10px 14px; border-radius:11px;
  border:1.5px solid var(--bdr,#e2e4ef);
  background:var(--card2,#f5f6fb); color:var(--tx3,#9898b8);
  font-size:12px; font-weight:700; cursor:pointer; flex-shrink:0;
}
.gm-btn-prev {
  padding:10px 14px; border-radius:11px;
  border:1.5px solid var(--bdr,#e2e4ef);
  background:var(--card2,#f5f6fb); color:var(--tx2,#5a5a7a);
  font-size:12px; font-weight:700; cursor:pointer; flex-shrink:0;
  transition:background .15s;
}
.gm-btn-prev:hover { background:var(--card3,#eceef6); }
.gm-btn-prev:disabled { opacity:.35; cursor:not-allowed; }
.gm-btn-next {
  flex:1; padding:11px; border-radius:11px; border:none;
  color:#fff; font-size:13px; font-weight:800; cursor:pointer;
  transition:opacity .15s;
}
.gm-btn-next:hover { opacity:.88; }
.gm-btn-next:disabled {
  background:var(--bdr,#e2e4ef) !important; color:var(--tx3,#9898b8); cursor:not-allowed;
}

/* ── 완료 화면 ── */
.gm-done-box {
  display:flex; flex-direction:column; align-items:center;
  padding:24px 20px 8px; gap:10px;
}
.gm-done-icon { font-size:44px; line-height:1; }
.gm-done-title { font-size:17px; font-weight:900; color:var(--tx,#1a1a2e); text-align:center; }
.gm-done-sub { font-size:12px; color:var(--tx3,#9898b8); text-align:center; line-height:1.7; }
.gm-replay-btn {
  margin-top:8px; padding:11px 24px; border-radius:22px; border:none;
  font-size:13px; font-weight:800; color:#fff; cursor:pointer;
  box-shadow:0 4px 16px rgba(79,70,229,.4);
}
.gm-replay-btn:hover { opacity:.88; }

/* ── 차단 토스트 ── */
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
#gm-toast.gm-toast-on { opacity:1; transform:translateX(-50%) translateY(0); }

/* 입력 필드 차단 */
input[data-gm-ro], textarea[data-gm-ro] {
  cursor:not-allowed !important;
  background:var(--surf2,#f1f3f9) !important;
  opacity:.75 !important;
}
`;
    document.head.appendChild(s);
  }

  /* ══════════════════════════════════════════════
   * SVG 마스크 레이어
   * ══════════════════════════════════════════════ */
  function _makeMask() {
    if (document.getElementById('gm-mask-svg')) return;
    const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.id = 'gm-mask-svg';
    svg.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:8750;pointer-events:none;opacity:0;transition:opacity .35s ease;';
    svg.innerHTML = `
      <defs>
        <mask id="gm-hole-mask">
          <rect id="gm-mask-bg" x="0" y="0" width="100%" height="100%" fill="white"/>
          <rect id="gm-mask-hole" x="-999" y="-999" width="0" height="0" rx="14" ry="14" fill="black"/>
        </mask>
      </defs>
      <rect x="0" y="0" width="100%" height="100%" fill="rgba(5,5,18,0.80)" mask="url(#gm-hole-mask)"/>`;
    document.body.appendChild(svg);

    if (!document.getElementById('gm-spotlight')) {
      const sp = document.createElement('div'); sp.id='gm-spotlight'; document.body.appendChild(sp);
    }
    if (!document.getElementById('gm-spot-label')) {
      const lb = document.createElement('div'); lb.id='gm-spot-label'; document.body.appendChild(lb);
    }
  }

  /* ══════════════════════════════════════════════
   * 배지
   * ══════════════════════════════════════════════ */
  function _makeBadge() {
    if (document.getElementById(BADGE_ID)) return;
    const el = document.createElement('div');
    el.id = BADGE_ID;
    el.innerHTML = '<span class="gm-b-icon">🔒</span><span>읽기 전용 모드 &mdash; GUEST 계정 &nbsp;|&nbsp; 저장·입력 불가</span><button class="gm-b-x" title="숨기기">✕</button>';
    document.body.prepend(el);
    document.body.classList.add('gm-on');
    el.querySelector('.gm-b-x').onclick = () => { el.style.display='none'; document.body.classList.remove('gm-on'); };
  }

  /* ══════════════════════════════════════════════
   * 오버레이
   * ══════════════════════════════════════════════ */
  function _makeOverlay() {
    const existing = document.getElementById(OVERLAY_ID);
    if (existing) existing.remove();
    const el = document.createElement('div');
    el.id = OVERLAY_ID;
    el.innerHTML = `
<div class="gm-panel">
  <div class="gm-ph">
    <div class="gm-ph-left">
      <div class="gm-accent-bar" id="gm-accent"></div>
      <div class="gm-ph-title" id="gm-title">화면 안내</div>
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
    <button class="gm-btn-close" id="gm-close">닫기</button>
    <button class="gm-btn-prev" id="gm-prev" disabled>← 이전</button>
    <button class="gm-btn-next" id="gm-next" disabled>다음 →</button>
  </div>
</div>`;
    document.body.appendChild(el);
    document.getElementById('gm-x').onclick     = () => _close();
    document.getElementById('gm-close').onclick = () => _close();
    document.getElementById('gm-prev').onclick  = () => _prevStep();
    document.getElementById('gm-next').onclick  = () => _nextStep();
  }

  /* ══════════════════════════════════════════════
   * 나레이션 열기 / 재시작
   * ══════════════════════════════════════════════ */
  function _show(pageKey) {
    if (!_active) return;
    const data = NARRATIONS[pageKey];
    if (!data) return;
    _pageKey = pageKey;
    _steps   = data.steps;
    _stepIdx = 0;
    _openPanel(data);
  }

  function _replay() {
    if (!_pageKey) return;
    _stepIdx = 0;
    _open    = true;
    _makeOverlay();
    const data = NARRATIONS[_pageKey];
    const title  = document.getElementById('gm-title');
    const accent = document.getElementById('gm-accent');
    const nextBtn = document.getElementById('gm-next');
    if (title)  title.textContent = data.title;
    if (accent) accent.style.background = data.accent||'#4f46e5';
    if (nextBtn) nextBtn.style.background = `linear-gradient(135deg,${data.accent||'#4f46e5'},#7c3aed)`;
    const ov = document.getElementById(OVERLAY_ID);
    requestAnimationFrame(() => ov?.classList.add('gm-show'));
    _renderStep();
  }

  function _openPanel(data) {
    if (_open) _closeImmediate();
    _open = true;
    _makeMask();
    _makeOverlay();
    const title  = document.getElementById('gm-title');
    const accent = document.getElementById('gm-accent');
    const nextBtn = document.getElementById('gm-next');
    if (title)  title.textContent = data.title;
    if (accent) accent.style.background = data.accent||'#4f46e5';
    if (nextBtn) nextBtn.style.background = `linear-gradient(135deg,${data.accent||'#4f46e5'},#7c3aed)`;
    const ov = document.getElementById(OVERLAY_ID);
    requestAnimationFrame(() => ov?.classList.add('gm-show'));
    _renderStep();
  }

  /* ══════════════════════════════════════════════
   * 스텝 렌더
   * ══════════════════════════════════════════════ */
  function _renderStep() {
    const step = _steps[_stepIdx];
    if (!step) { _showDone(); return; }

    const body    = document.getElementById('gm-body');
    const cnt     = document.getElementById('gm-cnt');
    const pf      = document.getElementById('gm-pf');
    const prevBtn = document.getElementById('gm-prev');
    const nextBtn = document.getElementById('gm-next');
    if (!body) return;

    // action 실행 (탭 전환 등)
    if (typeof step.action === 'function') {
      try { step.action(); } catch(e) { console.warn('[GuestMode] action error', e); }
    }

    body.innerHTML = '';
    if (prevBtn) prevBtn.disabled = (_stepIdx === 0);
    if (nextBtn) { nextBtn.disabled = true; nextBtn.textContent = _stepIdx < _steps.length - 1 ? '다음 →' : '✓ 완료'; }

    const pct = Math.round(((_stepIdx + 1) / _steps.length) * 100);
    if (pf)  pf.style.width = pct + '%';
    if (cnt) cnt.textContent = `${_stepIdx + 1} / ${_steps.length}`;

    // 스포트라이트 (action 후 DOM 반영 대기)
    setTimeout(() => _spotlight(step.highlight || null, step.highlightLabel || null), 180);

    // 다이어그램
    if (step.diagram) _appendDiagram(body, step.diagram);

    // 텍스트 타이핑
    const onDone = () => {
      if (nextBtn) nextBtn.disabled = false;
      body.scrollTop = body.scrollHeight;
    };
    if (step.text) {
      _typeText(body, step.text, onDone);
    } else {
      setTimeout(onDone, 250);
    }
  }

  /* ══════════════════════════════════════════════
   * 완료 화면 (다시 보기 버튼 포함)
   * ══════════════════════════════════════════════ */
  function _showDone() {
    const data    = NARRATIONS[_pageKey] || {};
    const body    = document.getElementById('gm-body');
    const prevBtn = document.getElementById('gm-prev');
    const nextBtn = document.getElementById('gm-next');
    const cnt     = document.getElementById('gm-cnt');
    const pf      = document.getElementById('gm-pf');
    if (!body) return;

    _clearSpotlight();
    if (pf)  pf.style.width = '100%';
    if (cnt) cnt.textContent = `${_steps.length} / ${_steps.length}`;
    if (prevBtn) prevBtn.disabled = false;
    if (nextBtn) { nextBtn.disabled = true; nextBtn.textContent = '✓ 완료'; }

    body.innerHTML = `
<div class="gm-done-box">
  <div class="gm-done-icon">🎉</div>
  <div class="gm-done-title">${data.title || '안내 완료'}</div>
  <div class="gm-done-sub">모든 기능 설명을 마쳤습니다.<br>읽기 전용으로 직접 탐색해보세요!</div>
  <button class="gm-replay-btn" id="gm-replay-btn"
    style="background:linear-gradient(135deg,${data.accent||'#4f46e5'},#7c3aed)">
    🔁 나레이션 다시 보기
  </button>
</div>`;
    document.getElementById('gm-replay-btn').onclick = () => _replay();

    // 이전 버튼으로 돌아가기 위해 stepIdx를 마지막으로 유지
    // (prevBtn 클릭 시 _prevStep → _stepIdx-- → 마지막 실제 스텝)
    _stepIdx = _steps.length; // 완료 상태
  }

  /* ══════════════════════════════════════════════
   * 이전 / 다음
   * ══════════════════════════════════════════════ */
  function _prevStep() {
    clearTimeout(_typeTimer);
    if (_stepIdx > 0) _stepIdx--;
    else return;
    _renderStep();
  }

  function _nextStep() {
    clearTimeout(_typeTimer);
    _stepIdx++;
    if (_stepIdx >= _steps.length) { _showDone(); return; }
    _renderStep();
  }

  /* ══════════════════════════════════════════════
   * 타이핑
   * ══════════════════════════════════════════════ */
  function _typeText(container, html, done) {
    clearTimeout(_typeTimer);
    const parts = _parseHtml(html);
    const wrapper = document.createElement('div');
    wrapper.className = 'gm-text';
    container.appendChild(wrapper);
    const cur = document.createElement('span'); cur.className='gm-cur'; wrapper.appendChild(cur);
    let pi=0, ci=0;
    const SPEED=16;
    function tick() {
      if (!_open) return;
      if (pi >= parts.length) { cur.remove(); setTimeout(done, 200); return; }
      const part = parts[pi];
      if (ci === 0) { const n = part.bold?document.createElement('b'):document.createElement('span'); n.dataset.pi=pi; cur.before(n); }
      const node = wrapper.querySelector(`[data-pi="${pi}"]`);
      if (node) node.textContent += part.text[ci];
      ci++;
      if (ci >= part.text.length) { pi++; ci=0; }
      container.scrollTop = container.scrollHeight;
      _typeTimer = setTimeout(tick, SPEED);
    }
    tick();
  }

  function _parseHtml(html) {
    const parts=[]; const re=/<b[^>]*>([\s\S]*?)<\/b>/g; let last=0,m;
    while((m=re.exec(html))!==null){
      if(m.index>last) parts.push({text:html.slice(last,m.index),bold:false});
      parts.push({text:m[1],bold:true}); last=re.lastIndex;
    }
    if(last<html.length) parts.push({text:html.slice(last),bold:false});
    return parts.map(p=>({...p,text:p.text.replace(/<br\s*\/?>/gi,'\n')}));
  }

  function _appendDiagram(container, diag) {
    const wrap = document.createElement('div'); wrap.className='gm-diag';
    wrap.innerHTML=`<div class="gm-diag-lbl">📐 ${diag.title}</div>${diag.svg}`;
    container.appendChild(wrap);
  }

  /* ══════════════════════════════════════════════
   * 스포트라이트 (SVG 마스크 구멍 뚫기)
   * ══════════════════════════════════════════════ */
  function _spotlight(selector, labelText) {
    const svg  = document.getElementById('gm-mask-svg');
    const hole = document.getElementById('gm-mask-hole');
    const spot = document.getElementById('gm-spotlight');
    const lbl  = document.getElementById('gm-spot-label');

    if (!selector) {
      if (svg) svg.classList.add('gm-mask-on');
      if (hole) { hole.setAttribute('x','-999'); hole.setAttribute('y','-999'); hole.setAttribute('width','0'); hole.setAttribute('height','0'); }
      if (spot) spot.classList.remove('gm-spot-on');
      if (lbl)  lbl.classList.remove('gm-label-on');
      return;
    }

    const el = document.querySelector(selector);
    if (!el) { if (svg) svg.classList.add('gm-mask-on'); return; }

    const r = el.getBoundingClientRect();
    const pad = 10;
    const x = r.left - pad, y = r.top - pad, w = r.width + pad*2, h = r.height + pad*2;

    if (svg && hole) {
      svg.setAttribute('viewBox',`0 0 ${window.innerWidth} ${window.innerHeight}`);
      svg.querySelectorAll('rect').forEach(r2=>{ if(r2.id==='gm-mask-bg'){r2.setAttribute('width',window.innerWidth);r2.setAttribute('height',window.innerHeight);} });
      hole.setAttribute('x',x); hole.setAttribute('y',y); hole.setAttribute('width',w); hole.setAttribute('height',h);
      svg.classList.add('gm-mask-on');
    }
    if (spot) {
      spot.style.left=x+'px'; spot.style.top=(y+window.scrollY)+'px';
      spot.style.width=w+'px'; spot.style.height=h+'px';
      requestAnimationFrame(()=>spot.classList.add('gm-spot-on'));
    }
    if (lbl && labelText) {
      lbl.innerHTML=`<span style="font-size:13px">👆</span>${labelText}`;
      const topPos = y - 40;
      lbl.style.top = (topPos > 44 ? topPos+window.scrollY : y+h+10+window.scrollY) + 'px';
      lbl.style.left = Math.max(8,x)+'px';
      requestAnimationFrame(()=>lbl.classList.add('gm-label-on'));
    } else if (lbl) { lbl.classList.remove('gm-label-on'); }
  }

  function _clearSpotlight() {
    const svg=document.getElementById('gm-mask-svg'), hole=document.getElementById('gm-mask-hole');
    const spot=document.getElementById('gm-spotlight'), lbl=document.getElementById('gm-spot-label');
    if(svg) svg.classList.remove('gm-mask-on');
    if(hole){hole.setAttribute('x','-999');hole.setAttribute('y','-999');hole.setAttribute('width','0');hole.setAttribute('height','0');}
    if(spot) spot.classList.remove('gm-spot-on');
    if(lbl)  lbl.classList.remove('gm-label-on');
  }

  /* ══════════════════════════════════════════════
   * 닫기
   * ══════════════════════════════════════════════ */
  function _close() { _clearSpotlight(); _closeImmediate(); }
  function _closeImmediate() {
    clearTimeout(_typeTimer); _open=false;
    const ov=document.getElementById(OVERLAY_ID);
    if(ov){ov.classList.remove('gm-show');setTimeout(()=>{if(ov.parentNode)ov.remove();},380);}
    const svg=document.getElementById('gm-mask-svg'); if(svg) svg.classList.remove('gm-mask-on');
  }

  /* ══════════════════════════════════════════════
   * 차단 토스트
   * ══════════════════════════════════════════════ */
  let _toastTimer=null;
  function _toast(msg) {
    let el=document.getElementById(TOAST_ID);
    if(!el){el=document.createElement('div');el.id=TOAST_ID;document.body.appendChild(el);}
    el.textContent=msg||'🔒 읽기 전용 모드 — 게스트는 입력할 수 없습니다';
    el.classList.add('gm-toast-on');
    clearTimeout(_toastTimer);
    _toastTimer=setTimeout(()=>el.classList.remove('gm-toast-on'),2500);
  }

  /* ══════════════════════════════════════════════
   * Write 차단
   * ══════════════════════════════════════════════ */
  const WRITE_M=['addClass','addClassNew','updateClass','deleteClass','terminateClass',
    'addToPool','moveBook','deleteBook','clearZone','renameBook','copyBooksToClass',
    'addAccount','updateAccount','deleteAccount','saveTheme','autoSave','saveProgress'];

  function _patchDB() {
    if(typeof DB==='undefined')return;
    WRITE_M.forEach(m=>{ if(typeof DB[m]==='function') DB[m]=()=>{_toast();return Promise.resolve(null);}; });
  }
  function _patchModules() {
    /* v3.1: ScheduleDB/NoticeDB/ArchiveDB/EduVideoDB 4개 신규 모듈이 이 배열에
       빠져 있어서, 게스트 세션에서도 실제 Firebase에 일정·공지·자료·영상을
       쓸 수 있는 상태였음(다른 4개 모듈만 보호되고 있었음) — 추가해서 동일하게 차단 */
    ['StudentDB','StaffDB','GradeDB','BookLibDB',
     'ScheduleDB','NoticeDB','ArchiveDB','EduVideoDB'].forEach(name=>{
      const db=window[name]; if(!db)return;
      Object.keys(db).forEach(m=>{
        if(typeof db[m]!=='function')return;
        if(/^(add|update|delete|save|remove|set|put|import|write|create)/i.test(m))
          db[m]=()=>{_toast();return Promise.resolve(null);};
      });
    });
  }

  const _ALLOW=['gm-','btn-x','gm-ph-x','gm-b-x','gm-btn','bni','wk-btn','cal-','toggle-view-btn','mg-tab','bl-stab','gr-vbtn','chip'];
  const _BLOCK_OC=/save|Save|addClass|add[A-Z]|del[^a-z]|Del|delete|Delete|update[A-Z]|import|Import|handleImport|doCopy|clearZone|moveBook|renameBook|terminate|addToPool|addAccount|saveAccount|delAcc|delClass/;

  function _interceptClick(e) {
    if(!_active)return;
    const btn=e.target.closest('button,[role="button"],input[type="submit"]');
    if(!btn)return;
    const cls=btn.className||'', id=btn.id||'';
    for(const p of _ALLOW){if(cls.includes(p)||id.includes(p))return;}
    if(cls.includes('ibtn')&&!cls.includes('red'))return;
    const oc=btn.getAttribute('onclick')||'';
    if(/doLogin/i.test(oc))return;
    if(_BLOCK_OC.test(oc)){e.preventDefault();e.stopPropagation();_toast();return;}
    const txt=(btn.textContent||'').trim();
    if(/^(저장|추가|삭제|수정|복사|가져오기|등록|초기화|일괄등록)/.test(txt)){e.preventDefault();e.stopPropagation();_toast();}
  }

  function _watchInputs() {
    const obs=new MutationObserver(()=>{
      if(!_active)return;
      document.querySelectorAll('input:not(#li-id):not(#li-pw):not(#li-remember):not([data-gm-ro]),textarea:not([data-gm-ro])').forEach(el=>{
        if(el.closest('#login-gate')||el.closest('#gm-overlay'))return;
        el.setAttribute('data-gm-ro','1'); el.setAttribute('readonly','readonly');
        el.addEventListener('focus',()=>{ if(!_active)return; _toast('🔒 읽기 전용 모드 — 게스트는 입력이 불가합니다'); el.blur(); });
        el.addEventListener('keydown',ev=>{ if(!_active)return; if(ev.key==='Tab'||ev.ctrlKey||ev.altKey)return; ev.preventDefault();ev.stopPropagation(); _toast('🔒 읽기 전용 모드 — 게스트는 입력이 불가합니다'); },{capture:true});
      });
      document.querySelectorAll('select:not([data-gm-ro])').forEach(el=>{
        if(el.closest('#login-gate')||el.closest('#gm-overlay'))return;
        el.setAttribute('data-gm-ro','1');
        el.addEventListener('change',ev=>{ev.preventDefault();ev.stopPropagation();_toast('🔒 읽기 전용 — 변경이 불가합니다');},{capture:true});
      });
    });
    obs.observe(document.body,{childList:true,subtree:true});
  }

  /* ══════════════════════════════════════════════
   * 페이지 전환 훅
   * ══════════════════════════════════════════════ */
  function _hookNav() {
    if(typeof App==='undefined')return;
    const orig=App.go.bind(App);
    App.go=function(page,...rest){
      orig(page,...rest);
      if(_active) setTimeout(()=>{
        if(!_seen.has(page)&&NARRATIONS[page]){_seen.add(page);_show(page);}
      },420);
    };
  }

  /* ══════════════════════════════════════════════
   * 활성화
   * ══════════════════════════════════════════════ */
  function _activate() {
    _active=true; _css(); _makeBadge(); _patchDB(); _patchModules(); _watchInputs();
    document.addEventListener('click',_interceptClick,true);
    document.addEventListener('dragstart',e=>{if(!_active)return; e.preventDefault();e.stopPropagation();_toast('🔒 드래그 불가 — 읽기 전용 모드');},true);
  }

  /* ══════════════════════════════════════════════
   * 비활성화 — 로그아웃하거나 게스트가 아닌 실제 계정으로 로그인하면 호출됨.
   * ★ 버그 수정: 기존엔 이 함수가 아예 없어서, 게스트로 접속했다가 로그아웃 후
   *   실제 admin 계정으로 로그인해도 _active 플래그가 계속 true로 남아 있었다.
   *   그 결과 다른 탭으로 이동할 때마다 게스트 나레이션 화면이 계속 떴고,
   *   입력칸도 계속 읽기전용으로 잠긴 상태였다.
   * ══════════════════════════════════════════════ */
  function _deactivate() {
    if (!_active) return;
    _active = false;
    document.getElementById(BADGE_ID)?.remove();
    document.getElementById(OVERLAY_ID)?.remove();
    document.body.classList.remove('gm-on');
    _clearSpotlight();
    // ★ 게스트 모드 동안 읽기전용으로 잠갔던 입력칸/셀렉트를 원상 복구
    document.querySelectorAll('[data-gm-ro]').forEach(el => {
      el.removeAttribute('data-gm-ro');
      el.removeAttribute('readonly');
    });
    // ★ 다음에 다시 게스트로 접속하면 나레이션을 처음부터 새로 볼 수 있도록 초기화
    _seen.clear();
  }

  /* ══════════════════════════════════════════════
   * doLogin 훅
   * ══════════════════════════════════════════════ */
  function _hookLogin() {
    if(typeof App==='undefined')return;
    const orig=App.doLogin.bind(App);
    App.doLogin=function(){
      const idEl=document.getElementById('li-id'), pwEl=document.getElementById('li-pw');
      if(!idEl||!pwEl){orig();return;}
      if(idEl.value.trim()===GUEST_ID&&pwEl.value===GUEST_PW){
        // 가상 admin 세션
        const sess={id:'__guest__',username:'guest',role:'admin',password:'guest',createdAt:new Date().toISOString(),_isGuest:true};
        if(typeof DB!=='undefined'&&DB.setSession)DB.setSession(sess);
        document.getElementById('login-gate')?.classList.add('hidden');
        _activate();
        if(typeof App._refreshAuthUI==='function')App._refreshAuthUI();
        _seen.add('operate');
        setTimeout(()=>{App.go('operate');_show('operate');},500);
      } else {
        orig();
        // ★ 실제 계정으로 로그인에 성공한 경우, 이전에 남아있을 수 있는 게스트 모드를 완전히 해제한다.
        const realSess=(typeof DB!=='undefined'&&DB.getSession)?DB.getSession():null;
        if(realSess&&!realSess._isGuest)_deactivate();
      }
    };
  }

  /* ══════════════════════════════════════════════
   * logout 훅 — 로그아웃 시 게스트 모드 완전 해제
   * ══════════════════════════════════════════════ */
  function _hookLogout() {
    if(typeof App==='undefined'||typeof App.logout!=='function')return;
    const orig=App.logout.bind(App);
    App.logout=function(...args){
      const ret=orig(...args);
      _deactivate();
      // logout()은 비동기 함수라 flush 완료 후 한 번 더 안전하게 정리(이미 꺼져 있으면 아무 동작 안 함)
      if(ret&&typeof ret.then==='function')ret.then(()=>_deactivate());
      return ret;
    };
  }

  /* ══════════════════════════════════════════════
   * init
   * ══════════════════════════════════════════════ */
  function init() {
    const tryHook=()=>{
      if(typeof App!=='undefined'&&typeof DB!=='undefined'){
        _hookLogin(); _hookNav(); _hookLogout();
        const sess=DB.getSession?DB.getSession():null;
        if(sess&&sess._isGuest){
          _activate();
          setTimeout(()=>{_seen.add('operate');_show('operate');},900);
        }
      } else setTimeout(tryHook,150);
    };
    if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',tryHook);
    else tryHook();
  }

  return { init };
})();

GuestMode.init();
