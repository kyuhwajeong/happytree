/**
 * guest-mode.js — HappyTree Guest Narration System
 * ─────────────────────────────────────────────────
 * guest / guest 로그인 시:
 *  1. 모든 메뉴 탭 접근 가능 (admin 권한 부여)
 *  2. write 동작 차단 (저장/삭제/수정 버튼 비활성)
 *  3. 각 페이지 진입마다 투명 나레이션 오버레이 표시
 *  4. 타이핑 효과 + 다이어그램/흐름도 포함
 *  5. 나레이션 종료 후 자동으로 오버레이 닫힘
 *  6. 상단 읽기전용 배지 상시 표시
 */

const GuestMode = (() => {
  /* ─── 상수 ─── */
  const GUEST_ID   = 'guest';
  const GUEST_PW   = 'guest';
  const BADGE_ID   = 'guest-readonly-badge';
  const OVERLAY_ID = 'guest-narration-overlay';

  let _active   = false;  // guest 세션 여부
  let _overlayOpen = false;
  let _typeTimer  = null;
  let _autoClose  = null;
  let _currentPage = null;
  let _seenPages  = new Set(); // 한 번 본 페이지는 재표시 안 함 (세션 중)

  /* ─────────────────────────────────────────────
   * 페이지별 나레이션 정의
   * ───────────────────────────────────────────── */
  const NARRATIONS = {

    operate: {
      title: '📅 수업 진도 화면',
      color: '#4f46e5',
      segments: [
        {
          type: 'text',
          content:
            '안녕하세요! 이 화면은 <b>수업 진도 관리</b>의 핵심 화면입니다.\n' +
            '학원의 반(클래스)별로 주간 진도를 한눈에 파악하고,\n' +
            '교재별 수업 현황을 기록하는 곳입니다.',
        },
        {
          type: 'diagram',
          title: '진도 화면 구조',
          svg: `
<svg viewBox="0 0 520 260" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:520px">
  <defs>
    <marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="#6366f1"/>
    </marker>
  </defs>
  <!-- 상단 반 선택 칩 -->
  <rect x="20" y="10" width="480" height="40" rx="10" fill="#ede9fe" stroke="#6366f1" stroke-width="1.5"/>
  <text x="260" y="35" text-anchor="middle" font-size="13" fill="#4338ca" font-weight="700">🏷 반 선택 칩 (H1 · H2 · T1 …)</text>

  <!-- 주간 네비게이션 -->
  <rect x="20" y="62" width="480" height="36" rx="8" fill="#f0fdf4" stroke="#16a34a" stroke-width="1.5"/>
  <text x="260" y="85" text-anchor="middle" font-size="12" fill="#166534" font-weight="600">‹ 이전주 ·  3주차 · 다음주 ›</text>

  <!-- 요일 카드들 -->
  <rect x="20"  y="110" width="88" height="130" rx="10" fill="#fff" stroke="#e2e8f0" stroke-width="1.5"/>
  <text x="64"  y="132" text-anchor="middle" font-size="11" fill="#6366f1" font-weight="700">월 MON</text>
  <rect x="116" y="110" width="88" height="130" rx="10" fill="#fff" stroke="#e2e8f0" stroke-width="1.5"/>
  <text x="160" y="132" text-anchor="middle" font-size="11" fill="#0891b2" font-weight="700">화 TUE</text>
  <rect x="212" y="110" width="88" height="130" rx="10" fill="#ede9fe" stroke="#6366f1" stroke-width="2"/>
  <text x="256" y="132" text-anchor="middle" font-size="11" fill="#4338ca" font-weight="800">수 WED ★오늘</text>
  <rect x="308" y="110" width="88" height="130" rx="10" fill="#fff" stroke="#e2e8f0" stroke-width="1.5"/>
  <text x="352" y="132" text-anchor="middle" font-size="11" fill="#0891b2" font-weight="700">목 THU</text>
  <rect x="404" y="110" width="96" height="130" rx="10" fill="#fff" stroke="#e2e8f0" stroke-width="1.5"/>
  <text x="452" y="132" text-anchor="middle" font-size="11" fill="#0891b2" font-weight="700">금 FRI</text>

  <!-- 카드 내부 예시 -->
  <rect x="28"  y="142" width="72" height="22" rx="5" fill="#ede9fe"/>
  <text x="64"  y="157" text-anchor="middle" font-size="9" fill="#4338ca">📘 주교재 p.32</text>
  <rect x="28"  y="168" width="72" height="22" rx="5" fill="#f0fdf4"/>
  <text x="64"  y="183" text-anchor="middle" font-size="9" fill="#166534">📗 부교재 p.15</text>
  <rect x="220" y="142" width="72" height="22" rx="5" fill="#ede9fe"/>
  <text x="256" y="157" text-anchor="middle" font-size="9" fill="#4338ca">📘 주교재 p.40</text>
  <rect x="220" y="168" width="72" height="22" rx="5" fill="#fef3c7"/>
  <text x="256" y="183" text-anchor="middle" font-size="9" fill="#92400e">✏️ 입력 중...</text>

  <text x="260" y="252" text-anchor="middle" font-size="10" fill="#9ca3af">수업이 있는 요일만 카드가 생성됩니다</text>
</svg>`,
        },
        {
          type: 'text',
          content:
            '① <b>반 선택 칩</b>을 탭하면 해당 반의 주간 진도가 표시됩니다.\n' +
            '② <b>이전/다음</b> 버튼으로 주차를 이동합니다.\n' +
            '③ 각 요일 카드에서 <b>주교재·부교재</b>의 진도를 입력하고\n' +
            '   체크리스트·메모를 기록할 수 있습니다.\n' +
            '④ 오늘 수업 중인 반은 <b>자동 하이라이트</b>됩니다.',
        },
      ],
    },

    manage: {
      title: '⚙️ 반·교재 관리 화면',
      color: '#f97316',
      segments: [
        {
          type: 'text',
          content:
            '이 화면은 학원 운영의 <b>핵심 설정</b>을 담당합니다.\n' +
            '반 추가/수정, 교재 배정, 계정 관리, 테마, 백업까지\n' +
            '5개 탭으로 구성되어 있습니다.',
        },
        {
          type: 'diagram',
          title: '관리 탭 구조도',
          svg: `
<svg viewBox="0 0 520 210" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:520px">
  <!-- 탭 바 -->
  <rect x="10" y="10" width="500" height="36" rx="8" fill="#fff7ed" stroke="#f97316" stroke-width="1.5"/>
  <text x="60"  y="33" text-anchor="middle" font-size="11" fill="#ea580c" font-weight="700">📋 반</text>
  <text x="160" y="33" text-anchor="middle" font-size="11" fill="#6b7280">👤 계정</text>
  <text x="260" y="33" text-anchor="middle" font-size="11" fill="#6b7280">🎨 테마</text>
  <text x="360" y="33" text-anchor="middle" font-size="11" fill="#6b7280">📦 백업</text>
  <text x="460" y="33" text-anchor="middle" font-size="11" fill="#6b7280">🔗 공유</text>
  <rect x="10" y="46" width="100" height="3" rx="1.5" fill="#f97316"/>

  <!-- 반 탭 내용 -->
  <rect x="10" y="58" width="240" height="140" rx="10" fill="#fff" stroke="#fde68a" stroke-width="1.5"/>
  <text x="130" y="78" text-anchor="middle" font-size="11" fill="#92400e" font-weight="700">📋 반 관리</text>
  <rect x="22" y="85" width="216" height="30" rx="6" fill="#fef3c7"/>
  <text x="130" y="105" text-anchor="middle" font-size="10" fill="#92400e">반 이름 · 요일 · 수업시간 설정</text>
  <rect x="22" y="120" width="216" height="30" rx="6" fill="#f0fdf4"/>
  <text x="130" y="140" text-anchor="middle" font-size="10" fill="#166534">📚 교재 목록 · 주교재 · 부교재 배정</text>
  <rect x="22" y="155" width="216" height="30" rx="6" fill="#ede9fe"/>
  <text x="130" y="175" text-anchor="middle" font-size="10" fill="#4338ca">📋 다른 반 교재 복사 기능</text>

  <!-- 기타 탭들 -->
  <rect x="270" y="58" width="240" height="66" rx="10" fill="#f0f9ff" stroke="#0ea5e9" stroke-width="1.5"/>
  <text x="390" y="82" text-anchor="middle" font-size="11" fill="#0369a1" font-weight="700">👤 계정 관리</text>
  <text x="390" y="102" text-anchor="middle" font-size="10" fill="#0369a1">관리자 / 운용자 / 강사 계정 추가·수정</text>
  <rect x="270" y="132" width="110" height="66" rx="10" fill="#f5f3ff" stroke="#8b5cf6" stroke-width="1.5"/>
  <text x="325" y="155" text-anchor="middle" font-size="10" fill="#6d28d9" font-weight="700">🎨 테마</text>
  <text x="325" y="172" text-anchor="middle" font-size="9" fill="#6d28d9">색상·폰트·크기</text>
  <rect x="390" y="132" width="120" height="66" rx="10" fill="#fff7ed" stroke="#f59e0b" stroke-width="1.5"/>
  <text x="450" y="155" text-anchor="middle" font-size="10" fill="#b45309" font-weight="700">📦 백업·공유</text>
  <text x="450" y="172" text-anchor="middle" font-size="9" fill="#b45309">Excel 내보내기/가져오기</text>
</svg>`,
        },
        {
          type: 'text',
          content:
            '• <b>반 탭</b>: 월 이동(달력)으로 해당 월의 반을 관리합니다.\n' +
            '  교재는 풀(Pool)→ 주교재/부교재로 드래그해 배정합니다.\n' +
            '• <b>계정 탭</b>: 역할별 권한 체계 (관리자→운용자→강사).\n' +
            '• <b>테마 탭</b>: 다크/라이트 모드, 폰트, 글자 크기 조절.\n' +
            '• <b>백업 탭</b>: Excel 내보내기/가져오기로 데이터 이전.',
        },
      ],
    },

    booklib: {
      title: '📖 교재 학습 관리 화면',
      color: '#0891b2',
      segments: [
        {
          type: 'text',
          content:
            '교재별로 <b>학습 체크리스트, 단어·문법 진도, 학생별 달성률</b>을\n' +
            '체계적으로 관리하는 화면입니다.\n' +
            'AI 기반 문제 생성과 학습 리포트도 제공합니다.',
        },
        {
          type: 'diagram',
          title: '교재 관리 흐름도',
          svg: `
<svg viewBox="0 0 520 230" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:520px">
  <defs>
    <marker id="arr2" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="#0891b2"/>
    </marker>
  </defs>
  <!-- 상단: 반 선택 + 교재 선택 -->
  <rect x="10" y="10" width="230" height="44" rx="10" fill="#ecfeff" stroke="#0891b2" stroke-width="1.5"/>
  <text x="125" y="37" text-anchor="middle" font-size="12" fill="#0e7490" font-weight="700">📚 교재 선택 (반별)</text>

  <line x1="240" y1="32" x2="280" y2="32" stroke="#0891b2" stroke-width="1.5" marker-end="url(#arr2)"/>

  <rect x="280" y="10" width="230" height="44" rx="10" fill="#ecfeff" stroke="#0891b2" stroke-width="1.5"/>
  <text x="395" y="37" text-anchor="middle" font-size="12" fill="#0e7490" font-weight="700">🗂 챕터 / 유닛 설정</text>

  <!-- 중간: 기능 블록 3개 -->
  <line x1="125" y1="54" x2="125" y2="90" stroke="#0891b2" stroke-width="1.5" marker-end="url(#arr2)"/>
  <line x1="260" y1="80" x2="395" y2="80" stroke="#0891b2" stroke-width="1" stroke-dasharray="4,3"/>
  <line x1="395" y1="54" x2="395" y2="90" stroke="#0891b2" stroke-width="1.5" marker-end="url(#arr2)"/>

  <rect x="10"  y="90" width="230" height="120" rx="10" fill="#fff" stroke="#67e8f9" stroke-width="1.5"/>
  <text x="125" y="112" text-anchor="middle" font-size="11" fill="#0e7490" font-weight="700">✅ 학생별 체크리스트</text>
  <rect x="22"  y="118" width="206" height="24" rx="6" fill="#ecfeff"/>
  <text x="125" y="134" text-anchor="middle" font-size="10" fill="#0369a1">김학생 ████░░░ 70%</text>
  <rect x="22"  y="146" width="206" height="24" rx="6" fill="#ecfeff"/>
  <text x="125" y="162" text-anchor="middle" font-size="10" fill="#0369a1">이학생 ██████░ 85%</text>
  <rect x="22"  y="174" width="206" height="24" rx="6" fill="#f0fdf4"/>
  <text x="125" y="190" text-anchor="middle" font-size="10" fill="#166534">박학생 ████████ 100%</text>

  <rect x="280" y="90" width="230" height="54" rx="10" fill="#fff" stroke="#67e8f9" stroke-width="1.5"/>
  <text x="395" y="118" text-anchor="middle" font-size="11" fill="#0e7490" font-weight="700">🤖 AI 문제 생성 (Gemini)</text>
  <text x="395" y="136" text-anchor="middle" font-size="10" fill="#6b7280">단어·문법 자동 퀴즈 생성</text>

  <rect x="280" y="156" width="230" height="54" rx="10" fill="#fff" stroke="#67e8f9" stroke-width="1.5"/>
  <text x="395" y="184" text-anchor="middle" font-size="11" fill="#0e7490" font-weight="700">📊 학습 리포트 공유</text>
  <text x="395" y="202" text-anchor="middle" font-size="10" fill="#6b7280">링크로 학부모 공유 가능</text>
</svg>`,
        },
        {
          type: 'text',
          content:
            '① 반과 교재를 선택하면 챕터/유닛 단위 체크리스트가 펼쳐집니다.\n' +
            '② 학생별로 달성률 진행 바가 실시간으로 업데이트됩니다.\n' +
            '③ <b>AI(Gemini)</b> 버튼으로 교재 내용 기반 문제를 자동 생성합니다.\n' +
            '④ 학습 리포트를 링크로 생성해 학부모에게 공유할 수 있습니다.',
        },
      ],
    },

    grade: {
      title: '📝 성적 관리 화면',
      color: '#16a34a',
      segments: [
        {
          type: 'text',
          content:
            '시험 성적 입력, 통계 분석, 성적 리포트 생성까지\n' +
            '<b>성적 관리의 전체 흐름</b>을 담당하는 화면입니다.\n' +
            'Excel 내보내기와 학부모 공유 링크도 지원합니다.',
        },
        {
          type: 'diagram',
          title: '성적 관리 데이터 흐름',
          svg: `
<svg viewBox="0 0 520 200" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:520px">
  <defs>
    <marker id="arr3" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="#16a34a"/>
    </marker>
  </defs>
  <!-- Step 1 -->
  <rect x="10" y="20" width="120" height="54" rx="10" fill="#f0fdf4" stroke="#16a34a" stroke-width="1.5"/>
  <text x="70" y="45" text-anchor="middle" font-size="12" fill="#166534" font-weight="700">① 시험 구성</text>
  <text x="70" y="62" text-anchor="middle" font-size="10" fill="#166534">과목·배점·날짜</text>
  <!-- Arrow -->
  <line x1="130" y1="47" x2="155" y2="47" stroke="#16a34a" stroke-width="1.5" marker-end="url(#arr3)"/>
  <!-- Step 2 -->
  <rect x="155" y="20" width="120" height="54" rx="10" fill="#f0fdf4" stroke="#16a34a" stroke-width="1.5"/>
  <text x="215" y="45" text-anchor="middle" font-size="12" fill="#166534" font-weight="700">② 성적 입력</text>
  <text x="215" y="62" text-anchor="middle" font-size="10" fill="#166534">학생별 점수 입력</text>
  <!-- Arrow -->
  <line x1="275" y1="47" x2="300" y2="47" stroke="#16a34a" stroke-width="1.5" marker-end="url(#arr3)"/>
  <!-- Step 3 -->
  <rect x="300" y="20" width="120" height="54" rx="10" fill="#f0fdf4" stroke="#16a34a" stroke-width="1.5"/>
  <text x="360" y="45" text-anchor="middle" font-size="12" fill="#166534" font-weight="700">③ 통계 분석</text>
  <text x="360" y="62" text-anchor="middle" font-size="10" fill="#166534">평균·최고·분포</text>
  <!-- Arrow -->
  <line x1="420" y1="47" x2="445" y2="47" stroke="#16a34a" stroke-width="1.5" marker-end="url(#arr3)"/>
  <!-- Step 4 -->
  <rect x="445" y="20" width="68" height="54" rx="10" fill="#dcfce7" stroke="#16a34a" stroke-width="2"/>
  <text x="479" y="45" text-anchor="middle" font-size="10" fill="#166534" font-weight="700">④ 리포트</text>
  <text x="479" y="62" text-anchor="middle" font-size="9" fill="#166534">공유 링크</text>

  <!-- 하단 통계 카드 -->
  <rect x="10"  y="95" width="115" height="90" rx="10" fill="#fff" stroke="#86efac" stroke-width="1.5"/>
  <text x="67"  y="118" text-anchor="middle" font-size="22" fill="#16a34a" font-weight="900">94</text>
  <text x="67"  y="138" text-anchor="middle" font-size="10" fill="#166534">📈 평균점수</text>
  <text x="67"  y="154" text-anchor="middle" font-size="9" fill="#6b7280">전회 대비 +3.2점</text>
  <rect x="135" y="95" width="115" height="90" rx="10" fill="#fff" stroke="#86efac" stroke-width="1.5"/>
  <text x="192" y="118" text-anchor="middle" font-size="22" fill="#0891b2" font-weight="900">100</text>
  <text x="192" y="138" text-anchor="middle" font-size="10" fill="#0e7490">🏆 최고점</text>
  <text x="192" y="154" text-anchor="middle" font-size="9" fill="#6b7280">김**  (H1반)</text>
  <rect x="260" y="95" width="115" height="90" rx="10" fill="#fff" stroke="#86efac" stroke-width="1.5"/>
  <text x="317" y="118" text-anchor="middle" font-size="22" fill="#f97316" font-weight="900">75</text>
  <text x="317" y="138" text-anchor="middle" font-size="10" fill="#ea580c">📉 최저점</text>
  <text x="317" y="154" text-anchor="middle" font-size="9" fill="#6b7280">성취 부진 알림</text>
  <rect x="385" y="95" width="128" height="90" rx="10" fill="#fff" stroke="#86efac" stroke-width="1.5"/>
  <text x="449" y="118" text-anchor="middle" font-size="11" fill="#166534" font-weight="700">📊 점수 분포</text>
  <rect x="395" y="128" width="14" height="48" rx="3" fill="#86efac"/>
  <rect x="413" y="118" width="14" height="58" rx="3" fill="#22c55e"/>
  <rect x="431" y="130" width="14" height="46" rx="3" fill="#86efac"/>
  <rect x="449" y="142" width="14" height="34" rx="3" fill="#bbf7d0"/>
  <rect x="467" y="150" width="14" height="26" rx="3" fill="#dcfce7"/>
</svg>`,
        },
        {
          type: 'text',
          content:
            '• 시험을 생성하고 과목·배점을 설정한 뒤 학생별 점수를 입력합니다.\n' +
            '• 입력 즉시 <b>평균·최고·최저·점수분포</b> 통계가 자동 계산됩니다.\n' +
            '• <b>AI 분석 코멘트</b>로 성취 부진 학생을 자동 식별합니다.\n' +
            '• 리포트를 개별 링크로 생성해 학부모에게 전달할 수 있습니다.',
        },
      ],
    },

    students: {
      title: '👨‍🎓 학생 관리 화면',
      color: '#7c3aed',
      segments: [
        {
          type: 'text',
          content:
            '학원 학생의 <b>등록·재원·휴원·퇴원</b> 상태를 한 번에 관리하고,\n' +
            '반 배정, 학년·학교 정보, 연락처 등을 체계적으로 저장합니다.\n' +
            'Excel 드래그앤드롭으로 대량 등록도 가능합니다.',
        },
        {
          type: 'diagram',
          title: '학생 상태 흐름',
          svg: `
<svg viewBox="0 0 520 180" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:520px">
  <defs>
    <marker id="arr4" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="#7c3aed"/>
    </marker>
    <marker id="arr4r" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="#ef4444"/>
    </marker>
  </defs>
  <!-- 등록 -->
  <rect x="20" y="60" width="90" height="50" rx="10" fill="#f5f3ff" stroke="#7c3aed" stroke-width="2"/>
  <text x="65" y="82" text-anchor="middle" font-size="12" fill="#5b21b6" font-weight="700">➕ 등록</text>
  <text x="65" y="98" text-anchor="middle" font-size="10" fill="#7c3aed">신규 입원</text>
  <!-- → 재원 -->
  <line x1="110" y1="85" x2="145" y2="85" stroke="#7c3aed" stroke-width="2" marker-end="url(#arr4)"/>
  <rect x="145" y="60" width="90" height="50" rx="10" fill="#dcfce7" stroke="#16a34a" stroke-width="2"/>
  <text x="190" y="82" text-anchor="middle" font-size="12" fill="#166534" font-weight="700">✅ 재원</text>
  <text x="190" y="98" text-anchor="middle" font-size="10" fill="#16a34a">수업 중</text>
  <!-- 재원 → 휴원 -->
  <line x1="235" y1="78" x2="275" y2="62" stroke="#f59e0b" stroke-width="1.5" marker-end="url(#arr4)"/>
  <rect x="275" y="40" width="90" height="44" rx="10" fill="#fef3c7" stroke="#f59e0b" stroke-width="1.5"/>
  <text x="320" y="60" text-anchor="middle" font-size="11" fill="#92400e" font-weight="700">😴 휴원</text>
  <text x="320" y="74" text-anchor="middle" font-size="10" fill="#92400e">일시 중단</text>
  <!-- 휴원 → 재원 -->
  <line x1="275" y1="76" x2="235" y2="92" stroke="#16a34a" stroke-width="1.5" stroke-dasharray="4,3" marker-end="url(#arr4)"/>
  <!-- 재원 → 퇴원 -->
  <line x1="235" y1="92" x2="275" y2="112" stroke="#ef4444" stroke-width="1.5" marker-end="url(#arr4r)"/>
  <rect x="275" y="100" width="90" height="44" rx="10" fill="#fee2e2" stroke="#ef4444" stroke-width="1.5"/>
  <text x="320" y="120" text-anchor="middle" font-size="11" fill="#991b1b" font-weight="700">🚪 퇴원</text>
  <text x="320" y="134" text-anchor="middle" font-size="10" fill="#991b1b">종료</text>

  <!-- 통계 박스 -->
  <rect x="390" y="20" width="120" height="148" rx="12" fill="#f5f3ff" stroke="#a78bfa" stroke-width="1.5"/>
  <text x="450" y="45" text-anchor="middle" font-size="11" fill="#5b21b6" font-weight="700">📊 통계 요약</text>
  <text x="450" y="68" text-anchor="middle" font-size="10" fill="#166534">✅ 재원  28명</text>
  <text x="450" y="88" text-anchor="middle" font-size="10" fill="#92400e">😴 휴원   4명</text>
  <text x="450" y="108" text-anchor="middle" font-size="10" fill="#991b1b">🚪 퇴원  12명</text>
  <text x="450" y="128" text-anchor="middle" font-size="10" fill="#6b7280">전체    44명</text>
  <rect x="402" y="140" width="96" height="20" rx="6" fill="#7c3aed"/>
  <text x="450" y="154" text-anchor="middle" font-size="10" fill="#fff" font-weight="700">Excel 내보내기</text>
</svg>`,
        },
        {
          type: 'text',
          content:
            '• <b>반별 그룹핑</b>으로 어느 반에 몇 명이 있는지 한눈에 확인합니다.\n' +
            '• 재원상태 필터·검색으로 원하는 학생을 즉시 찾을 수 있습니다.\n' +
            '• 학생 카드를 탭하면 상세 정보 편집·메모 입력이 가능합니다.\n' +
            '• Excel(.xlsx) 파일을 드래그하면 학생 목록을 일괄 등록합니다.',
        },
      ],
    },

    staff: {
      title: '👩‍💼 직원 관리 화면',
      color: '#0f766e',
      segments: [
        {
          type: 'text',
          content:
            '강사 및 직원의 <b>인사 정보, 출퇴근, 급여, 업무 일정</b>을\n' +
            '통합 관리하는 화면입니다.\n' +
            '월별 근무 달력과 급여 계산 기능을 제공합니다.',
        },
        {
          type: 'diagram',
          title: '직원 관리 모듈 구조',
          svg: `
<svg viewBox="0 0 520 190" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:520px">
  <!-- 중앙 허브 -->
  <circle cx="260" cy="95" r="46" fill="#ccfbf1" stroke="#0f766e" stroke-width="2"/>
  <text x="260" y="90" text-anchor="middle" font-size="12" fill="#134e4a" font-weight="800">👩‍💼</text>
  <text x="260" y="108" text-anchor="middle" font-size="11" fill="#134e4a" font-weight="700">직원 관리</text>

  <!-- 4 위성 -->
  <!-- 인사정보 -->
  <rect x="10" y="20" width="110" height="50" rx="10" fill="#f0fdfa" stroke="#0f766e" stroke-width="1.5"/>
  <text x="65" y="42" text-anchor="middle" font-size="11" fill="#134e4a" font-weight="700">📋 인사 정보</text>
  <text x="65" y="58" text-anchor="middle" font-size="10" fill="#0f766e">직책·연락처·입사일</text>
  <line x1="120" y1="45" x2="214" y2="75" stroke="#0f766e" stroke-width="1.2" stroke-dasharray="4,3"/>

  <!-- 출퇴근 -->
  <rect x="10" y="120" width="110" height="50" rx="10" fill="#f0fdfa" stroke="#0f766e" stroke-width="1.5"/>
  <text x="65" y="142" text-anchor="middle" font-size="11" fill="#134e4a" font-weight="700">⏰ 출퇴근</text>
  <text x="65" y="158" text-anchor="middle" font-size="10" fill="#0f766e">월별 달력·근무시간</text>
  <line x1="120" y1="145" x2="214" y2="115" stroke="#0f766e" stroke-width="1.2" stroke-dasharray="4,3"/>

  <!-- 급여 -->
  <rect x="400" y="20" width="110" height="50" rx="10" fill="#f0fdfa" stroke="#0f766e" stroke-width="1.5"/>
  <text x="455" y="42" text-anchor="middle" font-size="11" fill="#134e4a" font-weight="700">💰 급여 계산</text>
  <text x="455" y="58" text-anchor="middle" font-size="10" fill="#0f766e">월급·시급·공제</text>
  <line x1="400" y1="45" x2="306" y2="75" stroke="#0f766e" stroke-width="1.2" stroke-dasharray="4,3"/>

  <!-- 업무 일정 -->
  <rect x="400" y="120" width="110" height="50" rx="10" fill="#f0fdfa" stroke="#0f766e" stroke-width="1.5"/>
  <text x="455" y="142" text-anchor="middle" font-size="11" fill="#134e4a" font-weight="700">📅 업무 일정</text>
  <text x="455" y="158" text-anchor="middle" font-size="10" fill="#0f766e">수업·과외·일정표</text>
  <line x1="400" y1="145" x2="306" y2="115" stroke="#0f766e" stroke-width="1.2" stroke-dasharray="4,3"/>
</svg>`,
        },
        {
          type: 'text',
          content:
            '• <b>직원 카드</b>에서 인사 정보를 등록하고 연락처를 관리합니다.\n' +
            '• 월별 근무 달력에서 출퇴근 시간을 기록합니다.\n' +
            '• 시급/월급을 설정하면 근무 데이터 기반으로 <b>급여가 자동 계산</b>됩니다.\n' +
            '• 수업 시간표와 연동해 강사별 일정을 시각적으로 관리합니다.',
        },
      ],
    },
  };

  /* ─────────────────────────────────────────────
   * CSS 주입
   * ───────────────────────────────────────────── */
  function _injectStyles() {
    if (document.getElementById('gm-styles')) return;
    const s = document.createElement('style');
    s.id = 'gm-styles';
    s.textContent = `
/* ── 읽기전용 배지 ── */
#guest-readonly-badge {
  position: fixed;
  top: 0; left: 0; right: 0;
  z-index: 9999;
  background: linear-gradient(90deg,#f97316,#ef4444);
  color: #fff;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: .5px;
  text-align: center;
  padding: 5px 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  box-shadow: 0 2px 12px rgba(249,115,22,.35);
  user-select: none;
}
#guest-readonly-badge .gm-badge-icon { font-size: 14px; }
#guest-readonly-badge .gm-badge-close {
  margin-left: auto;
  background: rgba(255,255,255,.25);
  border: none;
  color: #fff;
  border-radius: 50%;
  width: 20px; height: 20px;
  cursor: pointer;
  font-size: 13px;
  display: flex; align-items: center; justify-content: center;
  transition: background .2s;
}
#guest-readonly-badge .gm-badge-close:hover { background: rgba(255,255,255,.4); }

/* 배지가 있을 때 앱 상단 여백 */
body.gm-active #app { padding-top: 30px; }
body.gm-active .bnav { padding-bottom: calc(env(safe-area-inset-bottom) + 4px); }

/* ── 나레이션 오버레이 ── */
#guest-narration-overlay {
  position: fixed;
  inset: 0;
  z-index: 8000;
  background: rgba(10,10,30,.72);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  opacity: 0;
  transition: opacity .35s;
  pointer-events: none;
}
#guest-narration-overlay.gm-visible {
  opacity: 1;
  pointer-events: all;
}
.gm-panel {
  width: 100%;
  max-width: 600px;
  max-height: 82vh;
  background: var(--card, #fff);
  border-radius: 24px 24px 0 0;
  box-shadow: 0 -6px 40px rgba(0,0,0,.32);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transform: translateY(40px);
  transition: transform .38s cubic-bezier(.22,1,.36,1);
}
#guest-narration-overlay.gm-visible .gm-panel {
  transform: translateY(0);
}
.gm-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px 10px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--bdr, #e2e4ef);
}
.gm-panel-title {
  font-size: 17px;
  font-weight: 900;
  line-height: 1.3;
}
.gm-panel-badge {
  font-size: 10px;
  font-weight: 700;
  background: #f97316;
  color: #fff;
  border-radius: 20px;
  padding: 3px 9px;
  margin-left: 8px;
  letter-spacing: .4px;
}
.gm-panel-close {
  background: var(--card2, #f5f6fb);
  border: 1px solid var(--bdr, #e2e4ef);
  border-radius: 50%;
  width: 34px; height: 34px;
  cursor: pointer;
  font-size: 18px;
  display: flex; align-items: center; justify-content: center;
  transition: background .18s;
  color: var(--tx2, #5a5a7a);
  flex-shrink: 0;
}
.gm-panel-close:hover { background: var(--card3, #eceef6); }

.gm-panel-body {
  overflow-y: auto;
  flex: 1;
  padding: 14px 20px 20px;
  scrollbar-width: thin;
}

/* 텍스트 세그먼트 */
.gm-seg-text {
  font-size: 13.5px;
  line-height: 1.85;
  color: var(--tx, #1a1a2e);
  white-space: pre-wrap;
  margin-bottom: 16px;
}
.gm-seg-text b { color: var(--a, #4f46e5); font-weight: 800; }

/* 다이어그램 세그먼트 */
.gm-seg-diagram {
  background: var(--card2, #f5f6fb);
  border: 1px solid var(--bdr, #e2e4ef);
  border-radius: 14px;
  padding: 12px 14px 10px;
  margin-bottom: 16px;
}
.gm-diagram-title {
  font-size: 11px;
  font-weight: 700;
  color: var(--tx3, #9898b8);
  margin-bottom: 8px;
  letter-spacing: .4px;
}
.gm-diagram-svg { display: block; width: 100%; }

/* 타이핑 커서 */
.gm-cursor {
  display: inline-block;
  width: 2px;
  height: 1em;
  background: var(--a, #4f46e5);
  margin-left: 2px;
  vertical-align: text-bottom;
  animation: gm-blink .7s step-end infinite;
}
@keyframes gm-blink { 0%,100%{opacity:1} 50%{opacity:0} }

/* 진행 바 */
.gm-progress-bar {
  height: 3px;
  background: var(--bdr, #e2e4ef);
  border-radius: 2px;
  margin-bottom: 12px;
  overflow: hidden;
  flex-shrink: 0;
}
.gm-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--a,#4f46e5), #7c3aed);
  border-radius: 2px;
  transition: width .4s ease;
  width: 0%;
}

/* 버튼 행 */
.gm-panel-foot {
  padding: 10px 20px 16px;
  display: flex;
  gap: 10px;
  flex-shrink: 0;
  border-top: 1px solid var(--bdr, #e2e4ef);
}
.gm-btn-skip {
  flex: 1;
  padding: 11px;
  border-radius: 12px;
  border: 1.5px solid var(--bdr, #e2e4ef);
  background: var(--card2, #f5f6fb);
  color: var(--tx2, #5a5a7a);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: background .18s;
}
.gm-btn-skip:hover { background: var(--card3, #eceef6); }
.gm-btn-close {
  flex: 2;
  padding: 11px;
  border-radius: 12px;
  border: none;
  background: linear-gradient(135deg,#4f46e5,#7c3aed);
  color: #fff;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
  transition: opacity .18s;
}
.gm-btn-close:hover { opacity: .88; }
.gm-btn-close:disabled {
  background: var(--bdr, #e2e4ef);
  color: var(--tx3, #9898b8);
  cursor: not-allowed;
}

/* 읽기전용 잠금 오버레이 (버튼 클릭 차단) */
.gm-write-blocked {
  position: relative;
  pointer-events: none !important;
  opacity: .45 !important;
  filter: grayscale(.4);
  cursor: not-allowed !important;
}
.gm-write-blocked::after {
  content: '🔒';
  position: absolute;
  top: 50%; left: 50%;
  transform: translate(-50%,-50%);
  font-size: 12px;
  pointer-events: none;
}

/* write 차단 토스트 */
#gm-block-toast {
  position: fixed;
  bottom: 90px;
  left: 50%;
  transform: translateX(-50%) translateY(20px);
  background: rgba(239,68,68,.95);
  color: #fff;
  padding: 9px 18px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 700;
  z-index: 9990;
  opacity: 0;
  transition: opacity .25s, transform .25s;
  pointer-events: none;
  white-space: nowrap;
}
#gm-block-toast.gm-toast-show {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}
`;
    document.head.appendChild(s);
  }

  /* ─────────────────────────────────────────────
   * 배지 생성
   * ───────────────────────────────────────────── */
  function _createBadge() {
    if (document.getElementById(BADGE_ID)) return;
    const badge = document.createElement('div');
    badge.id = BADGE_ID;
    badge.innerHTML = `
      <span class="gm-badge-icon">🔒</span>
      <span>읽기 전용 모드 — GUEST 계정 (쓰기 불가)</span>
      <button class="gm-badge-close" title="배지 숨기기">✕</button>`;
    document.body.prepend(badge);
    document.body.classList.add('gm-active');
    badge.querySelector('.gm-badge-close').onclick = () => {
      badge.style.display = 'none';
      document.body.classList.remove('gm-active');
    };
  }

  /* ─────────────────────────────────────────────
   * 오버레이 생성
   * ───────────────────────────────────────────── */
  function _createOverlay() {
    if (document.getElementById(OVERLAY_ID)) return;
    const ov = document.createElement('div');
    ov.id = OVERLAY_ID;
    ov.innerHTML = `
      <div class="gm-panel">
        <div class="gm-panel-head">
          <div>
            <span class="gm-panel-title" id="gm-title">화면 안내</span>
            <span class="gm-panel-badge">GUEST 가이드</span>
          </div>
          <button class="gm-panel-close" id="gm-x-btn" title="닫기">✕</button>
        </div>
        <div class="gm-progress-bar"><div class="gm-progress-fill" id="gm-prog"></div></div>
        <div class="gm-panel-body" id="gm-body"></div>
        <div class="gm-panel-foot">
          <button class="gm-btn-skip" id="gm-skip-btn">건너뛰기</button>
          <button class="gm-btn-close" id="gm-close-btn" disabled>읽어봤어요 ✓</button>
        </div>
      </div>`;
    document.body.appendChild(ov);

    const closeAll = () => _closeOverlay();
    document.getElementById('gm-x-btn').onclick = closeAll;
    document.getElementById('gm-skip-btn').onclick = closeAll;
    document.getElementById('gm-close-btn').onclick = closeAll;
  }

  /* ─────────────────────────────────────────────
   * 나레이션 표시
   * ───────────────────────────────────────────── */
  function _showNarration(pageKey) {
    if (!_active) return;
    if (_overlayOpen) _closeOverlay(true);

    const data = NARRATIONS[pageKey];
    if (!data) return;

    _currentPage = pageKey;
    _overlayOpen = true;

    _createOverlay();
    const ov    = document.getElementById(OVERLAY_ID);
    const title = document.getElementById('gm-title');
    const body  = document.getElementById('gm-body');
    const prog  = document.getElementById('gm-prog');
    const closeBtn = document.getElementById('gm-close-btn');

    title.textContent = data.title;
    body.innerHTML    = '';
    prog.style.width  = '0%';
    closeBtn.disabled = true;
    closeBtn.textContent = '읽어봤어요 ✓';

    // 오버레이 표시
    requestAnimationFrame(() => {
      ov.classList.add('gm-visible');
    });

    // 세그먼트 순차 렌더링
    _renderSegments(data.segments, body, prog, () => {
      closeBtn.disabled = false;
      // 15초 후 자동 닫기
      _autoClose = setTimeout(() => {
        if (_overlayOpen) {
          closeBtn.textContent = '자동 닫힘...';
          setTimeout(_closeOverlay, 800);
        }
      }, 15000);
    });
  }

  function _renderSegments(segments, body, prog, onDone) {
    let si = 0;
    const total = segments.length;

    function next() {
      if (si >= total) { onDone(); return; }
      const seg = segments[si++];
      prog.style.width = ((si / total) * 100) + '%';

      if (seg.type === 'diagram') {
        _appendDiagram(body, seg);
        setTimeout(next, 500);
      } else {
        _appendTypingText(body, seg.content, next);
      }
    }
    next();
  }

  /* 타이핑 효과 텍스트 */
  function _appendTypingText(body, html, onDone) {
    const el = document.createElement('div');
    el.className = 'gm-seg-text';
    body.appendChild(el);
    body.scrollTop = body.scrollHeight;

    // HTML 태그를 보존하면서 문자별 타이핑
    const plain = html.replace(/<b>(.*?)<\/b>/g, '\x01$1\x02').replace(/<[^>]+>/g,'');
    const richParts = []; // [{text,bold}]
    let cur = '', bold = false;
    for (const ch of plain) {
      if (ch === '\x01') { if (cur) richParts.push({text:cur,bold:false}); cur=''; bold=true; }
      else if (ch === '\x02') { if (cur) richParts.push({text:cur,bold:true}); cur=''; bold=false; }
      else cur += ch;
    }
    if (cur) richParts.push({text:cur,bold});

    const cursor = document.createElement('span');
    cursor.className = 'gm-cursor';
    el.appendChild(cursor);

    let pi = 0, ci = 0;
    const SPEED = 22; // ms/char

    function tick() {
      if (!_overlayOpen) return;
      if (pi >= richParts.length) {
        cursor.remove();
        setTimeout(onDone, 400);
        return;
      }
      const part = richParts[pi];
      if (ci === 0) {
        const span = document.createElement(part.bold ? 'b' : 'span');
        span.dataset.pidx = pi;
        cursor.before(span);
      }
      const span = el.querySelector(`[data-pidx="${pi}"]`);
      if (span) span.textContent += part.text[ci];
      ci++;
      if (ci >= part.text.length) { pi++; ci = 0; }
      body.scrollTop = body.scrollHeight;
      _typeTimer = setTimeout(tick, SPEED);
    }
    tick();
  }

  /* 다이어그램 즉시 추가 */
  function _appendDiagram(body, seg) {
    const wrap = document.createElement('div');
    wrap.className = 'gm-seg-diagram';
    wrap.innerHTML = `<div class="gm-diagram-title">📐 ${seg.title}</div>
      <div class="gm-diagram-svg">${seg.svg}</div>`;
    body.appendChild(wrap);
    body.scrollTop = body.scrollHeight;
  }

  /* ─────────────────────────────────────────────
   * 오버레이 닫기
   * ───────────────────────────────────────────── */
  function _closeOverlay(immediate = false) {
    clearTimeout(_typeTimer);
    clearTimeout(_autoClose);
    _overlayOpen = false;
    const ov = document.getElementById(OVERLAY_ID);
    if (!ov) return;
    if (immediate) {
      ov.classList.remove('gm-visible');
    } else {
      ov.classList.remove('gm-visible');
      setTimeout(() => { if (ov.parentNode) ov.remove(); }, 400);
    }
  }

  /* ─────────────────────────────────────────────
   * Write 차단
   * ───────────────────────────────────────────── */
  let _blockToastTimer = null;

  function _showBlockToast(msg = '🔒 읽기 전용 모드 — 게스트는 저장할 수 없습니다') {
    let toast = document.getElementById('gm-block-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'gm-block-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add('gm-toast-show');
    clearTimeout(_blockToastTimer);
    _blockToastTimer = setTimeout(() => toast.classList.remove('gm-toast-show'), 2200);
  }

  /* write 관련 셀렉터 (저장·삭제·추가 버튼) */
  const WRITE_SELECTORS = [
    '.btn-ok',            // 모달 저장 버튼
    'button.add-cls',     // 반 추가
    '.bm-add-btn',        // 교재 추가
    '.bm-pool-btn',       // 교재 이동(主/副/삭제)
    '.bm-arrow-btn',      // 교재 배정 화살표
    '.bm-back-btn',       // 교재 되돌리기
    '.clear-btn',         // 전체삭제
    '.ibtn.red',          // 빨간 아이콘 버튼(삭제)
    '#op-share-btn',      // 진도 공유
    '.acc-sel-btn',       // 계정 선택삭제 모드
    '.sf-save-btn',       // 직원 저장
    '.gr-save-btn',       // 성적 저장
    '.st-import-btn',     // 학생 엑셀 가져오기
    'button[onclick*="save"]',
    'button[onclick*="Save"]',
    'button[onclick*="del"]',
    'button[onclick*="Del"]',
    'button[onclick*="delete"]',
    'button[onclick*="Delete"]',
    'button[onclick*="add"]',
    'button[onclick*="Add"]',
    'button[onclick*="import"]',
    'button[onclick*="Import"]',
    'button[onclick*="export"]',   // 내보내기는 허용 (읽기)
    'button[onclick*="handleImport"]',
  ];

  // 허용 셀렉터 (읽기 전용 OK)
  const ALLOW_SELECTORS = [
    '.btn-x',          // 모달 취소
    '.gm-panel-close', // 나레이션 닫기
    '.gm-btn-skip',
    '.gm-btn-close',
    '#gm-x-btn',
    '#gm-skip-btn',
    '#gm-close-btn',
    '#guest-readonly-badge .gm-badge-close',
    'button[onclick*="handleExport"]', // 엑셀 내보내기
    'button[onclick*="go("]',          // 페이지 이동
    'button[onclick*="App.go"]',
    '.bni',            // 하단 탭
    '.wk-btn',         // 주간 이동
    '.chip-bar .chip', // 반 선택
    '.cal-inline-btn', // 달력 버튼
    '.cal-nav-btn',
    '.cal-today-btn',
    '.cal-close-btn',
    '.toggle-view-btn',
    '.mg-tab',
    '.mg-nav-btn',
    '#op-logout-btn',
    '#mg-logout-btn',
    '.ibtn:not(.red)',  // 비-빨간 아이콘 버튼
  ];

  function _interceptClick(e) {
    if (!_active) return;
    const btn = e.target.closest('button, [role="button"], input[type="submit"], .bm-pool-item.drag-ok');
    if (!btn) return;

    // 허용 목록 먼저 체크
    for (const sel of ALLOW_SELECTORS) {
      try { if (btn.matches(sel)) return; } catch {}
    }
    // 차단 목록 체크
    for (const sel of WRITE_SELECTORS) {
      try {
        if (btn.matches(sel)) {
          e.preventDefault();
          e.stopPropagation();
          _showBlockToast();
          return;
        }
      } catch {}
    }
    // onclick 속성에 save/del/add 포함 여부 체크
    const oc = btn.getAttribute('onclick') || '';
    if (/save|Save|del[^a-z]|Del|delete|Delete|addClass|addAccount|addToPool|moveBook|clearZone|renameBook|copyBooks|addStudent|updateStudent|deleteStudent|addStaff|updateStaff|deleteStaff|addExam|saveGrade|updateGrade|deleteExam|handleImport|doCopyBooks|doLogin/i.test(oc)) {
      // doLogin을 막으면 로그인 자체가 안 되니 예외
      if (/doLogin/i.test(oc)) return;
      e.preventDefault();
      e.stopPropagation();
      _showBlockToast();
    }
  }

  /* 입력 필드 readonly 처리 */
  function _setInputsReadonly() {
    // 모달 내 input은 열릴 때마다 처리 → MutationObserver 사용
    const obs = new MutationObserver(() => {
      if (!_active) return;
      // 모달 내 input 중 로그인 input만 허용
      document.querySelectorAll('.sh input:not(#li-id):not(#li-pw):not(#li-remember)').forEach(inp => {
        inp.setAttribute('readonly', 'readonly');
        inp.style.cursor = 'not-allowed';
        inp.style.opacity = '.6';
      });
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  /* ─────────────────────────────────────────────
   * DB 메서드 패치 (쓰기 차단)
   * ───────────────────────────────────────────── */
  const _NO_WRITE = () => {
    _showBlockToast();
    return Promise.resolve(null);
  };
  const PATCHED_METHODS = [
    'addClass','addClassNew','updateClass','deleteClass','terminateClass',
    'addToPool','moveBook','deleteBook','clearZone','renameBook','copyBooksToClass',
    'addAccount','updateAccount','deleteAccount',
    'saveTheme',
    'saveProgress',
  ];

  function _patchDB() {
    if (typeof DB === 'undefined') return;
    PATCHED_METHODS.forEach(m => {
      if (typeof DB[m] === 'function') {
        const orig = DB[m].bind(DB);
        DB[m] = (...args) => {
          _showBlockToast();
          return Promise.resolve(null);
        };
      }
    });
  }

  /* StudentDB, StaffDB, GradeDB 패치 */
  function _patchModuleDBs() {
    ['StudentDB','StaffDB','GradeDB'].forEach(dbName => {
      const db = window[dbName];
      if (!db) return;
      Object.getOwnPropertyNames(db).forEach(m => {
        if (typeof db[m] !== 'function') return;
        if (/add|update|delete|save|remove|import|set|put/i.test(m)) {
          db[m] = () => { _showBlockToast(); return Promise.resolve(null); };
        }
      });
    });
  }

  /* ─────────────────────────────────────────────
   * 진도 입력 텍스트박스 readonly
   * ───────────────────────────────────────────── */
  function _watchProgressInputs() {
    const obs = new MutationObserver(() => {
      if (!_active) return;
      document.querySelectorAll('.prog-inp, .memo-inp, .f-inp:not(#li-id):not(#li-pw)').forEach(inp => {
        if (!inp.hasAttribute('data-gm-blocked')) {
          inp.setAttribute('data-gm-blocked', '1');
          inp.setAttribute('readonly', 'readonly');
          inp.style.cursor = 'not-allowed';
          inp.style.background = 'var(--card2,#f5f6fb)';
          inp.addEventListener('click', () => _showBlockToast());
        }
      });
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  /* ─────────────────────────────────────────────
   * 페이지 감지 & 나레이션 트리거
   * ───────────────────────────────────────────── */
  function _hookPageNav() {
    // App.go 를 래핑해서 페이지 전환을 감지
    if (typeof App === 'undefined') return;
    const origGo = App.go.bind(App);
    App.go = function(page, ...rest) {
      origGo(page, ...rest);
      if (_active) {
        // 매 페이지 진입 시 나레이션 표시 (한 세션에 1회만)
        setTimeout(() => {
          if (!_seenPages.has(page) && NARRATIONS[page]) {
            _seenPages.add(page);
            _showNarration(page);
          }
        }, 350);
      }
    };
  }

  /* ─────────────────────────────────────────────
   * guest 계정 세션 주입
   * ───────────────────────────────────────────── */
  function _injectGuestSession() {
    // DB.login을 우회해 가상 admin 세션 생성 (guest 계정)
    const guestSession = {
      id: 'guest_virtual',
      username: 'guest',
      role: 'admin',          // 모든 메뉴 접근 위해 admin 권한
      password: 'guest',
      createdAt: new Date().toISOString(),
      _isGuest: true,
    };
    if (typeof DB !== 'undefined' && typeof DB.setSession === 'function') {
      DB.setSession(guestSession);
    }
    return guestSession;
  }

  /* ─────────────────────────────────────────────
   * 로그인 훅 — doLogin 패치
   * ───────────────────────────────────────────── */
  function _hookLogin() {
    if (typeof App === 'undefined') return;

    // App.doLogin 래핑
    const origDoLogin = App.doLogin.bind(App);
    App.doLogin = function() {
      const idEl = document.getElementById('li-id');
      const pwEl = document.getElementById('li-pw');
      if (!idEl || !pwEl) { origDoLogin(); return; }
      const id = idEl.value.trim();
      const pw = pwEl.value;

      if (id === GUEST_ID && pw === GUEST_PW) {
        // guest 로그인 처리
        _injectGuestSession();
        document.getElementById('login-gate')?.classList.add('hidden');
        _activate();
        if (typeof App._refreshAuthUI === 'function') App._refreshAuthUI();
        // 현재 페이지가 operate면 operate 나레이션 표시
        setTimeout(() => {
          _seenPages.add('operate');
          _showNarration('operate');
          App.go('operate');
        }, 500);
      } else {
        origDoLogin();
      }
    };
  }

  /* ─────────────────────────────────────────────
   * 활성화
   * ───────────────────────────────────────────── */
  function _activate() {
    _active = true;
    _injectStyles();
    _createBadge();
    _patchDB();
    _patchModuleDBs();
    _watchProgressInputs();
    _setInputsReadonly();
    document.addEventListener('click', _interceptClick, true);
    // dragstart 차단 (교재 드래그 방지)
    document.addEventListener('dragstart', e => {
      if (!_active) return;
      e.preventDefault();
      e.stopPropagation();
      _showBlockToast('🔒 읽기 전용 — 드래그 배정 불가');
    }, true);
  }

  /* ─────────────────────────────────────────────
   * PUBLIC INIT
   * ───────────────────────────────────────────── */
  function init() {
    // DOM 준비 후 App 로드 완료 시점에 훅
    const tryHook = () => {
      if (typeof App !== 'undefined' && typeof DB !== 'undefined') {
        _hookLogin();
        _hookPageNav();

        // 이미 guest로 로그인된 세션 감지
        const sess = DB.getSession ? DB.getSession() : null;
        if (sess && sess._isGuest) {
          _activate();
          setTimeout(() => {
            _seenPages.add('operate');
            _showNarration('operate');
          }, 800);
        }
      } else {
        setTimeout(tryHook, 200);
      }
    };
    tryHook();
  }

  /* ─────────────────────────────────────────────
   * 서브메뉴 / 탭 전환 감지 (MutationObserver)
   * ───────────────────────────────────────────── */
  function _observeSubNav() {
    // manage 탭 전환: 각 .mg-tab 클릭 시 (페이지 내 탭이므로 별도 나레이션 불필요)
    // 필요 시 여기에 서브탭별 나레이션 추가 가능
  }

  return { init };
})();

// 자동 초기화
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', GuestMode.init);
} else {
  GuestMode.init();
}
