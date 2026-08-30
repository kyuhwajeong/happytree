/**
 * students-app.js — v1.0
 *
 * ★ 학생 관리 UI 모듈 (기본은 admin 전용이며, admin이 계정별로 접근 권한을 부여하면
 *    강사·운용자 계정도 사용 가능 — 강사는 담당 반 데이터로 자동 범위 제한됨)
 * ★ StudentDB 에 완전히 의존 (students-db.js 보다 뒤에 로드)
 * ★ 기존 App 모듈 함수를 최소한으로만 호출
 *
 * 주요 기능
 *   - 학생 목록 (반별 그룹핑, 통계 요약)
 *   - 복합 필터 (재원상태 / 반 / 학년 / 학교)
 *   - 이름·닉네임·전화번호 검색
 *   - 엑셀 드래그앤드롭 / 파일선택 가져오기
 *   - 학생 상세 보기 / 재원상태 빠른 변경 / 삭제
 */
const StudentApp = (() => {
  /* ══ 상태 ══ */
  let _state = {
    q:         '',
    status:    '',
    grade:     '',
    school:    '',
    classCode: '',
    detailId:  null,
  };

  let _initialized = false;

  /* ════════════════════════════════════════════
   * CSS 자동 주입 (별도 파일 없이 자립)
   * ════════════════════════════════════════════ */
  function _injectStyles() {
    if (document.getElementById('st-styles')) return;
    const style = document.createElement('style');
    style.id = 'st-styles';
    style.textContent = `
/* ══ Students Layout ══ */
#page-students { display:none; flex-direction:column; height:100%; overflow:hidden; }
#page-students.on { display:flex; }

.st-stats {
  display:flex; gap:8px; padding:10px 16px 6px;
  overflow-x:auto; -webkit-overflow-scrolling:touch;
  scrollbar-width:none; flex-shrink:0;
}
.st-stats::-webkit-scrollbar { display:none; }
.st-stat-card {
  flex:1; min-width:64px;
  background:var(--card); border:1px solid var(--bdr);
  border-radius:12px; padding:10px 6px;
  text-align:center; cursor:pointer;
  transition:background .15s;
}
.st-stat-card:active { background:var(--card2); }
.st-stat-num { font-size:20px; font-weight:900; line-height:1; }
.st-stat-lbl { font-size:11px; color:var(--tx3); margin-top:3px; }

.st-filter-bar { padding:4px 16px 8px; flex-shrink:0; }
.st-search-wrap { position:relative; margin-bottom:8px; }
.st-search {
  width:100%; padding:9px 36px 9px 12px;
  background:var(--surf2); border:1.5px solid var(--bdr);
  border-radius:10px; font-size:14px; color:var(--tx);
  box-sizing:border-box; outline:none;
  transition:border-color .2s;
}
.st-search:focus { border-color:var(--a); }
.st-search-clear {
  position:absolute; right:8px; top:50%; transform:translateY(-50%);
  background:none; border:none; color:var(--tx3); font-size:16px;
  cursor:pointer; padding:4px; line-height:1;
}
.st-chips-row {
  display:flex; gap:6px;
  overflow-x:auto; padding-bottom:2px;
  scrollbar-width:none;
}
.st-chips-row::-webkit-scrollbar { display:none; }
.st-filter-sel {
  flex-shrink:0; padding:5px 10px; border-radius:20px;
  background:var(--surf2); border:1.5px solid var(--bdr);
  font-size:12px; color:var(--tx2); cursor:pointer;
  -webkit-appearance:none; appearance:none;
}
.st-filter-sel.active { border-color:var(--a); color:var(--a); background:var(--a10); }

/* 드롭 안내 */
.st-drop-hint {
  text-align:center; padding:52px 24px; color:var(--tx3);
  flex:1; display:flex; flex-direction:column;
  align-items:center; justify-content:center;
}
.st-drop-icon { font-size:52px; margin-bottom:14px; }
.st-drop-title { font-size:16px; font-weight:700; color:var(--tx2); margin-bottom:8px; }
.st-drop-desc { font-size:13px; line-height:1.9; color:var(--tx3); }

/* 학생 목록 */
.st-scroll { flex:1; overflow-y:auto; -webkit-overflow-scrolling:touch; }
.st-list { padding:4px 16px 120px; }
.st-group { margin-bottom:16px; }
.st-group-hdr {
  display:flex; align-items:center; gap:8px;
  padding:6px 2px 8px; border-bottom:1px solid var(--bdr); margin-bottom:6px;
}
.st-group-tag {
  background:var(--a); color:#fff;
  padding:2px 10px; border-radius:20px;
  font-size:12px; font-weight:700; flex-shrink:0;
}
.st-group-cnt { font-size:12px; color:var(--tx3); }
.st-group-school { font-size:11px; color:var(--tx3); margin-left:auto; }

.st-card {
  display:flex; align-items:center; gap:10px;
  padding:10px 12px; background:var(--card);
  border-radius:10px; margin-bottom:6px;
  border:1px solid var(--bdr); cursor:pointer;
  transition:background .1s, transform .1s;
}
.st-card:active { background:var(--card2); transform:scale(.99); }
.st-card-avatar {
  width:36px; height:36px; border-radius:50%;
  background:var(--a20); display:flex; align-items:center;
  justify-content:center; font-size:15px; font-weight:900;
  color:var(--a); flex-shrink:0;
}
.st-card-body { flex:1; min-width:0; }
.st-card-name { font-size:14px; font-weight:700; color:var(--tx); }
.st-nick { font-weight:400; font-size:12px; color:var(--tx3); }
.st-card-meta { font-size:12px; color:var(--tx3); margin-top:2px;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.st-card-right { text-align:right; flex-shrink:0; }
.st-status-badge { font-size:11px; font-weight:700; }
.st-card-phone { font-size:11px; color:var(--tx3); margin-top:3px; }

.st-empty { text-align:center; padding:48px 16px; color:var(--tx3); font-size:14px; }
.st-cnt-bar { text-align:right; padding:2px 0 6px; font-size:12px; color:var(--tx3); }

/* 드래그 오버 강조 */
#page-students.st-drag-over {
  outline:3px dashed var(--a); outline-offset:-6px; background:var(--a10);
}

/* 상세 모달 */
.st-detail-sh { max-height:90vh; overflow-y:auto; display:flex; flex-direction:column; }
.st-detail-grid {
  display:grid; grid-template-columns:1fr 1fr;
  gap:6px; padding:10px 0 4px; flex:1;
}
.st-detail-row {
  background:var(--surf2); border-radius:8px;
  padding:8px 10px; min-width:0;
}
.st-detail-row.full { grid-column:1/-1; }
.st-detail-lbl { font-size:10px; color:var(--tx3); margin-bottom:2px; }
.st-detail-val { font-size:13px; font-weight:600; color:var(--tx);
  word-break:break-all; }
.st-phone-link { color:var(--a); text-decoration:none; }

/* 빠른 상태변경 */
.st-quick-status { display:flex; gap:6px; padding:10px 0 0; flex-shrink:0; }
.st-qs-btn {
  flex:1; padding:9px 4px; border-radius:8px; border:1.5px solid var(--bdr);
  font-size:13px; font-weight:700; cursor:pointer; background:var(--surf2);
  color:var(--tx2); transition:all .15s;
}
.st-qs-btn.active-재원 { border-color:#22c55e; background:#dcfce7; color:#16a34a; }
.st-qs-btn.active-휴원 { border-color:#f97316; background:#ffedd5; color:#ea580c; }
.st-qs-btn.active-퇴원 { border-color:var(--tx3); background:var(--card2); color:var(--tx3); }
.dark .st-qs-btn.active-재원 { background:#14532d55; }
.dark .st-qs-btn.active-휴원 { background:#7c2d1255; }
.dark .st-qs-btn.active-퇴원 { background:var(--card3); }

.btn-del-ghost {
  padding:10px 14px; border-radius:10px; cursor:pointer;
  background:transparent; border:1.5px solid #fca5a5;
  color:#ef4444; font-weight:700; font-size:13px;
}
.btn-del-ghost:active { background:#fee2e2; }

/* 가져오기 진행 표시 */
.st-importing-overlay {
  position:absolute; inset:0; background:rgba(0,0,0,.35);
  display:flex; align-items:center; justify-content:center;
  z-index:200; border-radius:inherit;
}
.st-importing-box {
  background:var(--card); border-radius:14px;
  padding:24px 32px; text-align:center;
  font-size:14px; font-weight:700; color:var(--tx);
}

/* ══ 수업료 계산기 ══ */
.tc-detail-btn{
  width:100%; margin-top:10px; padding:11px; border-radius:10px;
  border:1.5px solid var(--a40); background:var(--a10); color:var(--a);
  font-weight:700; font-size:13px; cursor:pointer; font-family:var(--font);
}
.tc-detail-btn:active{ transform:scale(.98); }
.tc-warn{
  background:#fff7ed; border:1px solid #fed7aa; color:#c2410c;
  border-radius:10px; padding:10px 12px; font-size:12px; line-height:1.6; margin-top:6px;
}
.dark .tc-warn{ background:#7c2d1233; border-color:#c2410c55; color:#fb923c; }
.tc-card{
  background:var(--surf2); border-radius:12px; padding:4px 14px; margin-top:8px;
}
.tc-row{
  display:flex; justify-content:space-between; align-items:center;
  padding:9px 0; font-size:13px; color:var(--tx2); border-bottom:1px solid var(--bdr);
  gap:10px;
}
.tc-row:last-child{ border-bottom:none; }
.tc-row b{ color:var(--tx); font-weight:700; text-align:right; }
.tc-row.tc-dates{ flex-direction:column; align-items:flex-start; gap:4px; }
.tc-row.tc-dates .tc-dates-val{ font-size:11px; color:var(--tx3); line-height:1.7; text-align:left; }
.tc-row.tc-total{ padding-top:12px; }
.tc-row.tc-total b{ font-size:19px; color:var(--a); }
.tc-row.tc-sub b{ font-size:13px; color:var(--tx3); font-weight:600; }

/* 수업료/환불 탭 */
.tc-tabs{ display:flex; background:var(--surf2); border-radius:10px; padding:3px; margin-bottom:16px; gap:3px; }
.tc-tab{ flex:1; padding:9px; border-radius:8px; font-size:13px; font-weight:700;
  color:var(--tx3); background:transparent; cursor:pointer; font-family:var(--font);
  transition:all .18s; border:none; }
.tc-tab.active{ background:var(--card); color:var(--a); box-shadow:0 1px 4px rgba(0,0,0,.08); }
.tc-row.tc-refund b{ font-size:19px; color:#e85d04; }
.tc-row.tc-attended{ color:var(--tx3); }
.tc-row.tc-attended b{ font-size:13px; color:var(--tx2); font-weight:600; }
`;
    document.head.appendChild(style);
  }

  /* ════════════════════════════════════════════
   * INIT  (앱 시작 시 1회)
   * ════════════════════════════════════════════ */
  async function init() {
    _injectStyles();
    if (typeof StudentDB === 'undefined') {
      console.warn('[StudentApp] StudentDB not loaded');
      return;
    }
    await StudentDB.init();
    StudentDB.on('students', () => {
      if (document.getElementById('page-students')?.classList.contains('on')) {
        _renderContent();
      }
    });
    _initialized = true;
    console.log('[StudentApp] ✅ initialized');
  }

  /* ════════════════════════════════════════════
   * RENDER  (탭 전환 시 호출)
   * ════════════════════════════════════════════ */
  function render() {
    const pg = document.getElementById('page-students');
    if (!pg) return;
    pg.innerHTML = _buildShell();
    _bindDrop();
    _renderContent();
  }

  /* ──── 껍데기 HTML ──── */
  function _buildShell() {
    return `
      <!-- 페이지 헤더 -->
      <div class="ph">
        <div class="phl">
          <div style="width:36px;height:36px;border-radius:10px;background:#22c55e;
                      display:flex;align-items:center;justify-content:center;
                      font-size:17px;flex-shrink:0">👨‍🎓</div>
          <div style="min-width:0">
            <div class="ph-title">학생 관리
              <span id="st-admin-badge" class="admin-badge" style="font-size:10px">🔑 관리자</span>
            </div>
            <div class="ph-sub" id="st-sub">불러오는 중…</div>
          </div>
        </div>
        <div class="phr">
          <button class="ibtn" onclick="StudentApp.openTuitionCalc()" title="수업료 계산기">💰</button>
          <button class="ibtn" onclick="StudentApp.openTuitionOverview()" title="수업료 현황 (결석 차감·납부)">💳</button>
          <button class="ibtn" onclick="StudentApp.openReceiptImport()" title="수납내역 엑셀 가져오기">🧾</button>
          <button class="ibtn" onclick="StudentApp.openImport()" title="엑셀 가져오기">📥</button>
          <button id="st-logout-btn" class="ibtn red hidden" onclick="App.logout()" title="로그아웃">🚪</button>
        </div>
      </div>

      <!-- 통계 카드 -->
      <div id="st-stats" class="st-stats"></div>

      <!-- 필터 바 -->
      <div class="st-filter-bar">
        <div class="st-search-wrap">
          <input class="st-search" id="st-q"
                 placeholder="🔍 이름 · 닉네임 · 전화번호 검색"
                 value="${_e(_state.q)}"
                 oninput="StudentApp._onSearch(this.value)">
          ${_state.q
            ? `<button class="st-search-clear" onclick="StudentApp._onSearch('')" aria-label="검색 초기화">✕</button>`
            : ''}
        </div>
        <div class="st-chips-row" id="st-chips">
          ${_buildChips()}
        </div>
      </div>

      <!-- 스크롤 영역 -->
      <div class="st-scroll" id="st-scroll">
        <!-- 데이터 없음 안내 -->
        <div id="st-drop-hint" class="st-drop-hint hidden">
          <div class="st-drop-icon">📊</div>
          <div class="st-drop-title">학생 데이터가 없습니다</div>
          <div class="st-drop-desc">
            엑셀 파일(.xlsx)을 이 화면에 끌어다 놓거나<br>
            <button class="btn-ok" style="margin-top:10px" onclick="StudentApp.openImport()">📥 파일 선택하여 가져오기</button>
          </div>
        </div>

        <!-- 학생 목록 -->
        <div id="st-list" class="st-list"></div>
      </div>

      <!-- 상세 모달 -->
      <div id="st-detail-ov" class="ov hidden" onclick="StudentApp._onDetailOvClick(event)">
        <div class="sh st-detail-sh" id="st-detail-sh" onclick="event.stopPropagation()"></div>
      </div>

      <!-- 수업료 계산기 모달 -->
      <div id="st-tc-ov" class="ov hidden" onclick="StudentApp._onTcOvClick(event)">
        <div class="sh" id="st-tc-sh" onclick="event.stopPropagation()"></div>
      </div>
    `;
  }

  /* ──── 필터 칩 빌더 ──── */
  function _buildChips() {
    const allClasses = StudentDB.getClasses();
    const tcNames = _teacherClassNames();
    const classes  = tcNames ? allClasses.filter(c => tcNames.includes(c)) : allClasses;
    const grades  = StudentDB.getGrades();
    const schools = StudentDB.getSchools();

    return [
      _chip('status',    ['','재원','휴원','퇴원'],   ['● 전체','🟢 재원','🟠 휴원','⚫ 퇴원']),
      _chip('classCode', ['', ...classes], ['반 전체', ...classes]),
      _chip('grade',     ['', ...grades],  ['학년 전체', ...grades]),
      _chip('school',    ['', ...schools], ['학교 전체', ...schools]),
    ].join('');
  }

  function _chip(key, vals, labels) {
    const cur = _state[key];
    return `<select class="st-filter-sel ${cur ? 'active' : ''}"
      onchange="StudentApp._onFilter('${key}', this.value)">
      ${vals.map((v, i) =>
        `<option value="${_e(v)}" ${cur === v ? 'selected' : ''}>${labels[i]}</option>`
      ).join('')}
    </select>`;
  }

  /* ════════════════════════════════════════════
   * 콘텐츠 렌더 (통계 + 목록)
   * ════════════════════════════════════════════ */
  function _renderContent() {
    _renderStats();
    _renderList();
    _renderChips();
  }

  /* ──── 통계 카드 ──── */
  function _renderStats() {
    const el = document.getElementById('st-stats');
    if (!el) return;
    const tcNames = _teacherClassNames();
    let s;
    if (tcNames) {
      // ★ 담당 반이 지정된 강사 계정 — 전체 통계 대신 담당 반 범위로 다시 집계
      const scoped = StudentDB.getAll().filter(x => tcNames.includes(x.classCode));
      s = {
        enrolled: scoped.filter(x => x.status === '재원').length,
        paused:   scoped.filter(x => x.status === '휴원').length,
        left:     scoped.filter(x => x.status === '퇴원').length,
        total:    scoped.length,
      };
    } else {
      s = StudentDB.getStats();
    }

    el.innerHTML = [
      { val: s.enrolled, lbl: '재원', color: '#22c55e', filter: '재원'  },
      { val: s.paused,   lbl: '휴원', color: '#f97316', filter: '휴원'  },
      { val: s.left,     lbl: '퇴원', color: 'var(--tx3)', filter: '퇴원' },
      { val: s.total,    lbl: '전체', color: 'var(--tx)', filter: ''    },
    ].map(c => `
      <div class="st-stat-card" onclick="StudentApp._onFilter('status','${c.filter}')">
        <div class="st-stat-num" style="color:${c.color}">${c.val}</div>
        <div class="st-stat-lbl">${c.lbl}</div>
      </div>
    `).join('');

    const sub = document.getElementById('st-sub');
    if (sub) sub.textContent = `재원 ${s.enrolled}명 · 전체 ${s.total}명`;
  }

  /* ──── 칩 리렌더 (선택값만 갱신) ──── */
  function _renderChips() {
    const el = document.getElementById('st-chips');
    if (!el) return;
    el.innerHTML = _buildChips();
  }

  /* ──── 학생 목록 ──── */
  function _renderList() {
    const listEl = document.getElementById('st-list');
    const hintEl = document.getElementById('st-drop-hint');
    if (!listEl) return;

    let all  = StudentDB.getAll();
    let list = StudentDB.getFiltered(_state);
    const tcNames = _teacherClassNames();
    if (tcNames) {
      all  = all.filter(s => tcNames.includes(s.classCode));
      list = list.filter(s => tcNames.includes(s.classCode));
    }

    if (all.length === 0) {
      listEl.innerHTML = '';
      hintEl?.classList.remove('hidden');
      return;
    }
    hintEl?.classList.add('hidden');

    if (list.length === 0) {
      listEl.innerHTML = `<div class="st-empty">🔍 검색 결과가 없습니다</div>`;
      return;
    }

    // 반별 그룹핑 여부 결정
    const grouped = !_state.classCode && !_state.q;

    if (grouped) {
      // 반별 그룹
      const groups = {};
      list.forEach(s => {
        const k = s.classCode || '미지정';
        if (!groups[k]) groups[k] = [];
        groups[k].push(s);
      });

      listEl.innerHTML = `
        <div class="st-cnt-bar">${list.length}명</div>
        ${Object.keys(groups).sort().map(cls => `
          <div class="st-group">
            <div class="st-group-hdr">
              <span class="st-group-tag">${_e(cls)}</span>
              <span class="st-group-cnt">${groups[cls].length}명</span>
            </div>
            ${groups[cls].map(_cardHTML).join('')}
          </div>
        `).join('')}
      `;
    } else {
      listEl.innerHTML = `
        <div class="st-cnt-bar">${list.length}명</div>
        <div class="st-group">${list.map(_cardHTML).join('')}</div>
      `;
    }
  }

  /* ──── 학생 카드 HTML ──── */
  function _cardHTML(s) {
    const statusColor =
      s.status === '재원' ? '#22c55e' :
      s.status === '휴원' ? '#f97316' : 'var(--tx3)';
    const phone       = s.parentPhone || s.phone || '—';
    const initial     = (s.name || '?')[0];
    const meta        = [s.grade, s.school].filter(Boolean).join(' · ');

    return `
      <div class="st-card" onclick="StudentApp.openDetail('${s.id}')">
        <div class="st-card-avatar">${_e(initial)}</div>
        <div class="st-card-body">
          <div class="st-card-name">
            ${_e(s.name)}
            ${s.nickname ? `<span class="st-nick">(${_e(s.nickname)})</span>` : ''}
          </div>
          ${meta ? `<div class="st-card-meta">${_e(meta)}</div>` : ''}
        </div>
        <div class="st-card-right">
          <span class="st-status-badge" style="color:${statusColor}">${s.status}</span>
          <div class="st-card-phone">${_e(phone)}</div>
        </div>
      </div>
    `;
  }

  /* ════════════════════════════════════════════
   * 이벤트 핸들러
   * ════════════════════════════════════════════ */

  /** 검색어 입력 (디바운스) */
  let _searchTimer = null;
  function _onSearch(v) {
    _state.q = v;
    // 검색창 포커스 유지 위해 목록만 갱신
    clearTimeout(_searchTimer);
    _searchTimer = setTimeout(() => {
      _renderList();
      // 검색 초기화 버튼
      const wrap = document.querySelector('.st-search-wrap');
      if (!wrap) return;
      const existing = wrap.querySelector('.st-search-clear');
      if (v && !existing) {
        const btn = document.createElement('button');
        btn.className = 'st-search-clear';
        btn.textContent = '✕';
        btn.setAttribute('aria-label', '검색 초기화');
        btn.onclick = () => _onSearch('');
        wrap.appendChild(btn);
      } else if (!v && existing) {
        existing.remove();
      }
    }, 200);
  }

  /** 필터 변경 */
  function _onFilter(key, val) {
    _state[key] = val;
    _renderList();
    _renderChips();
    _renderStats();
  }

  /** 상세 모달 배경 클릭 닫기 */
  function _onDetailOvClick(e) {
    if (e.target.id === 'st-detail-ov') closeDetail();
  }

  /* ════════════════════════════════════════════
   * 엑셀 가져오기
   * ════════════════════════════════════════════ */

  /** 파일 선택 대화상자 열기 */
  function openImport() {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.xlsx,.xls';
    inp.onchange = e => handleFile(e.target.files[0]);
    inp.click();
  }

  /** 파일 처리 (선택 또는 드롭) */
  async function handleFile(file) {
    if (!file) return;
    if (typeof XLSX === 'undefined') {
      _toast('❌ XLSX 라이브러리가 로드되지 않았습니다'); return;
    }

    // 로딩 오버레이
    const pg = document.getElementById('page-students');
    const overlay = document.createElement('div');
    overlay.className = 'st-importing-overlay';
    overlay.innerHTML = '<div class="st-importing-box">📊 가져오는 중…</div>';
    if (pg) { pg.style.position = 'relative'; pg.appendChild(overlay); }

    try {
      const buf  = await file.arrayBuffer();
      const wb   = XLSX.read(buf, { type: 'array' });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

      if (!rows.length) { _toast('⚠️ 데이터가 없습니다'); return; }

      // 필수 컬럼 체크
      const cols    = Object.keys(rows[0]);
      const missing = ['이름', '수업'].filter(c => !cols.includes(c));
      if (missing.length) {
        _toast(`⚠️ 필수 컬럼 없음: ${missing.join(', ')}`); return;
      }

      const result = await StudentDB.importFromRows(rows);

      // ★ 엑셀 재원 인원 vs 실제 DB 재원 인원 대조 — 숫자가 다르면 바로 알 수 있게
      const mismatch = result.enrolledInExcel !== result.enrolledInDb;
      const reconLine = `📊 재원 인원 확인: 엑셀 ${result.enrolledInExcel}명 · DB ${result.enrolledInDb}명` +
        (mismatch ? ' ⚠️ 불일치' : ' ✅ 일치');

      if (mismatch || (result.possibleDuplicates && result.possibleDuplicates.length)) {
        _showImportReconcileModal(result);
      } else {
        _toast(
          `✅ 완료: 신규 ${result.added}명 · 업데이트 ${result.updated}명` +
          (result.skipped ? ` · 건너뜀 ${result.skipped}건` : '') +
          ` · ${reconLine}`,
          'success'
        );
      }
      render(); // 전체 리렌더

    } catch (e) {
      console.error('[StudentApp] import error', e);
      _toast('❌ 가져오기 실패: ' + e.message);
    } finally {
      overlay.remove();
    }
  }

  /** 가져오기 후 인원수 불일치·중복 의심 학생을 보여주는 확인 모달 */
  function _showImportReconcileModal(result) {
    document.getElementById('st-recon-modal')?.remove();

    const mismatch = result.enrolledInExcel !== result.enrolledInDb;
    const dupList = result.possibleDuplicates || [];

    const modal = document.createElement('div');
    modal.id = 'st-recon-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:600;display:flex;align-items:flex-end;justify-content:center';
    modal.onclick = e => { if (e.target === modal) modal.remove(); };

    const sheet = document.createElement('div');
    sheet.style.cssText = 'background:var(--card);border-radius:20px 20px 0 0;padding:20px;width:100%;max-width:520px;max-height:82vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 -4px 24px rgba(0,0,0,.18)';

    const dupHtml = dupList.length
      ? dupList.map(d => `<div style="border:1px solid var(--bdr2);border-radius:9px;padding:8px 10px;margin-bottom:6px;background:var(--surf2)">
          <div style="font-weight:800;font-size:12.5px;margin-bottom:4px">${_e(d.name)} — ${d.students.length}건</div>
          ${d.students.map(s=>`<div style="font-size:11px;color:var(--tx3)">· 반 ${_e(s.classCode||'—')} · 상태 ${_e(s.status||'—')} · 생일 ${_e(s.birthday||'—')} · 연락처 ${_e(s.phone||'—')}</div>`).join('')}
        </div>`).join('')
      : '<div style="font-size:12px;color:var(--tx3)">없음</div>';

    sheet.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-shrink:0">
        <div style="font-size:15px;font-weight:800">📥 가져오기 결과 확인</div>
        <button onclick="document.getElementById('st-recon-modal').remove()" style="background:none;border:none;font-size:22px;cursor:pointer;color:var(--tx3)">✕</button>
      </div>
      <div style="overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:10px">
        <div style="background:${mismatch?'rgba(220,38,38,.08)':'rgba(5,150,105,.08)'};border:1px solid ${mismatch?'rgba(220,38,38,.3)':'rgba(5,150,105,.3)'};border-radius:10px;padding:12px">
          <div style="font-size:12.5px;font-weight:800;margin-bottom:4px">${mismatch?'⚠️ 재원 인원 불일치':'✅ 재원 인원 일치'}</div>
          <div style="font-size:12px;color:var(--tx2)">엑셀 재원: <b>${result.enrolledInExcel}명</b> · DB 재원: <b>${result.enrolledInDb}명</b></div>
          <div style="font-size:11px;color:var(--tx3);margin-top:4px">신규 ${result.added}명 · 업데이트 ${result.updated}명${result.skipped?` · 건너뜀 ${result.skipped}건`:''}</div>
        </div>
        <div>
          <div style="font-size:12px;font-weight:800;color:var(--tx2);margin-bottom:6px">🔍 이름은 같지만 생일/연락처로 구분이 안 되는 학생 (${dupList.length}건)</div>
          ${dupHtml}
          ${dupList.length? '<div style="font-size:10.5px;color:var(--tx3);margin-top:2px">※ 실제 동일인이면 문제 없음. 동명이인인데 정보가 비어 있어 구분이 안 되는 경우일 수 있으니, 학생탭에서 생일/연락처를 채워두면 다음부터 정확히 구분됩니다.</div>':''}
        </div>
      </div>
      <button onclick="document.getElementById('st-recon-modal').remove()" style="margin-top:12px;padding:11px;border-radius:10px;background:var(--a);color:#fff;border:none;font-size:13px;font-weight:700;cursor:pointer;flex-shrink:0">확인</button>`;

    modal.appendChild(sheet);
    document.body.appendChild(modal);
  }

  /** 💳 수업료 현황 전체보기 (결석 차감 + 납부 기록을 월별로 합쳐서 표시) — 관리자/운영자용
   *  mode: 'month'(기본, 월 단위 상세) | 'year'(연간 12개월 한눈에) */
  function openTuitionOverview(monthKey, mode) {
    monthKey = monthKey || new Date().toISOString().slice(0, 7);
    mode = mode || 'month';
    document.getElementById('st-abs-ov-modal')?.remove();

    const modal = document.createElement('div');
    modal.id = 'st-abs-ov-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:600;display:flex;align-items:flex-end;justify-content:center';
    modal.onclick = e => { if (e.target === modal) modal.remove(); };

    const sheet = document.createElement('div');
    sheet.id = 'st-abs-ov-sheet';
    sheet.style.cssText = 'background:var(--card);border-radius:20px 20px 0 0;padding:20px;width:100%;max-width:520px;max-height:82vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 -4px 24px rgba(0,0,0,.18)';
    sheet.innerHTML = mode === 'year' ? _tuitionYearHTML(monthKey.slice(0, 4)) : _renderTuitionOvSheet(monthKey);

    modal.appendChild(sheet);
    document.body.appendChild(modal);
  }

  /** 탭 전환용 상단 공통 헤더(월별⇄연간) */
  function _tuitionOvTabsHTML(activeMode, monthKey, year) {
    return `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-shrink:0">
        <div style="font-size:15px;font-weight:800">💳 수업료 현황</div>
        <button onclick="document.getElementById('st-abs-ov-modal').remove()" style="background:none;border:none;font-size:22px;cursor:pointer;color:var(--tx3)">✕</button>
      </div>
      <div style="display:flex;gap:6px;margin-bottom:10px;flex-shrink:0">
        <button onclick="StudentApp.openTuitionOverview('${_e(monthKey)}','month')"
          style="flex:1;padding:8px;border-radius:9px;font-size:12.5px;font-weight:700;cursor:pointer;
          background:${activeMode==='month'?'var(--a)':'var(--surf2)'};color:${activeMode==='month'?'#fff':'var(--tx2)'};border:1px solid ${activeMode==='month'?'var(--a)':'var(--bdr2)'}">📅 월별</button>
        <button onclick="StudentApp.openTuitionOverview('${_e(year)}-01','year')"
          style="flex:1;padding:8px;border-radius:9px;font-size:12.5px;font-weight:700;cursor:pointer;
          background:${activeMode==='year'?'var(--a)':'var(--surf2)'};color:${activeMode==='year'?'#fff':'var(--tx2)'};border:1px solid ${activeMode==='year'?'var(--a)':'var(--bdr2)'}">📆 연간</button>
      </div>`;
  }

  /** 학생의 이 달 정상 청구 수업료(반 기준) 조회 — 결석 차감 기록 없을 때 참고용 */
  function _tuitionNormalAmount(student) {
    const cls = (typeof DB !== 'undefined' && student?.classCode)
      ? DB.getActiveClasses().find(c => (c.name || '').trim() === (student.classCode || '').trim())
      : null;
    return Number(cls?.tuition || 0);
  }

  /** 이 학생이 해당 월(monthKey)에 정상 고정 수업료 청구 대상인지 판단.
   *  ※ 입학한 달은 프로레이트 "입학 수업료 계산기"로 별도 처리하므로, 정상 청구는
   *     입학한 달의 다음 달부터 시작한다(입학일 정보가 없으면 그냥 대상에 포함). */
  function _tuitionIsBillable(student, monthKey) {
    if (student.status !== '재원') return false;
    if (!student.enrollDate) return true;
    const em = /^(\d{4})-(\d{2})/.exec(student.enrollDate);
    if (!em) return true;
    const [y, m] = monthKey.split('-').map(Number);
    const enrollY = +em[1], enrollM = +em[2];
    if (y < enrollY || (y === enrollY && m <= enrollM)) return false; // 입학 당월까지는 제외
    return true;
  }

  /** 특정 월의 재원생 전체 청구 현황(정상 고정 수업료 + 결석 차감 예외 + 납부 기록)을 집계.
   *  실제 수납내역(🧾 가져오기)에 '수업' 항목이 있으면 그 실제 데이터가 최우선이고,
   *  없는 달은 기존처럼 반 정상 수업료(결석 있으면 차감) + 수동 납부기록으로 보완한다.
   *  classFilter를 주면 그 반만 걸러서 반환(반별 총액 확인용). (월별/연간 뷰 공용) */
  function _tuitionMonthData(monthKey, classFilter) {
    const allStudents = (typeof StudentDB !== 'undefined') ? StudentDB.getAll() : [];
    const absMap = {}, payMap = {}, receiptsAllMap = {}; // receiptsAllMap: studentId -> {수업:[...], 교재:[...], 기타:[...]}
    ((typeof StudentDB !== 'undefined' && StudentDB.getTuitionAbsencesByMonth) ? StudentDB.getTuitionAbsencesByMonth(monthKey) : [])
      .forEach(r => { absMap[r.studentId] = r; });
    ((typeof StudentDB !== 'undefined' && StudentDB.getTuitionPaymentsByMonth) ? StudentDB.getTuitionPaymentsByMonth(monthKey) : [])
      .forEach(r => { payMap[r.studentId] = r; });
    // 카테고리 구분 없이 그 달의 수납내역 전부를 가져와서 학생별·카테고리별로 묶는다
    ((typeof StudentDB !== 'undefined' && StudentDB.getReceiptsByMonth) ? StudentDB.getReceiptsByMonth(monthKey) : [])
      .forEach(r => {
        const bucket = (receiptsAllMap[r.studentId] = receiptsAllMap[r.studentId] || { 수업: [], 교재: [], 기타: [] });
        const cat = bucket[r.category] ? r.category : '기타'; // 알 수 없는 구분값은 기타로 편입
        bucket[cat].push(r);
      });

    const billable = allStudents.filter(s => _tuitionIsBillable(s, monthKey)
      && (!classFilter || (s.classCode || '').trim() === classFilter.trim()));

    const merged = billable.map(s => {
      const absence = absMap[s.id] || null;
      const payment = payMap[s.id] || null;
      const receiptBucket = receiptsAllMap[s.id] || null;
      // 수업료 청구/납부 판단은 "수업" 카테고리 수납내역을 최우선으로 사용 (같은 달 여러 건이면 마지막 것)
      const tuitionReceipts = receiptBucket?.수업 || [];
      const receipt = tuitionReceipts.length ? tuitionReceipts[tuitionReceipts.length - 1] : null;
      const billed = receipt ? Number(receipt.billedAmount || 0)
                    : absence ? Number(absence.payAmount || 0)
                    : _tuitionNormalAmount(s);
      const paid = receipt ? Number(receipt.paidAmount || 0)
                  : payment ? Number(payment.amount || 0)
                  : null;
      let status, statusColor;
      if (paid === null)        { status = '미확인';   statusColor = '#6b7280'; } // 외부 결제사이트로 납부할 수 있어 "미납"이 아니라 중립적으로 표기
      else if (paid >= billed)  { status = paid > billed ? '초과납부' : '완납'; statusColor = paid > billed ? '#0284c7' : '#059669'; }
      else                      { status = '부족납부'; statusColor = '#d97706'; }

      return { studentId: s.id, studentName: s.name, classCode: s.classCode, nickname: s.nickname,
               absence, payment, receipt, hasAnyReceipt: !!receiptBucket,
               billed, paid, status, statusColor };
    }).sort((a, b) => (a.classCode || '').localeCompare(b.classCode || '') || (a.studentName || '').localeCompare(b.studentName || ''));

    const totalBilled = merged.reduce((sum, m) => sum + m.billed, 0);
    const totalPaid    = merged.reduce((sum, m) => sum + (m.paid || 0), 0);

    const byClass = {};
    merged.forEach(m => {
      const key = m.classCode || '(반 미지정)';
      byClass[key] = byClass[key] || { classCode: key, count: 0, billed: 0, paid: 0 };
      byClass[key].count  += 1;
      byClass[key].billed += m.billed;
      byClass[key].paid   += (m.paid || 0);
    });
    const classRows = Object.values(byClass).sort((a, b) => a.classCode.localeCompare(b.classCode));

    return { monthKey, merged, totalBilled, totalPaid, classRows };
  }

  let _TUITION_OV_FILTER = { classCode: '', unpaidOnly: false, category: '수업' };

  /** 현재 필터 상태에 맞춰 시트 내용을 다시 그리는 공용 디스패처 */
  function _renderTuitionOvSheet(monthKey) {
    return _TUITION_OV_FILTER.category === '수업'
      ? _tuitionOverviewHTML(monthKey)
      : _receiptsCategoryHTML(monthKey, _TUITION_OV_FILTER.category);
  }

  function _tuitionOvSetCategory(cat) {
    _TUITION_OV_FILTER.category = cat;
    const sheet = document.getElementById('st-abs-ov-sheet');
    const monthKey = document.querySelector('#st-abs-ov-sheet input[type="month"]')?.value || new Date().toISOString().slice(0,7);
    if (sheet) sheet.innerHTML = _renderTuitionOvSheet(monthKey);
  }

  /** 기간(월별/연간) + 구분(수업/교재/기타) 탭 공통 헤더 */
  function _tuitionOvCategoryTabsHTML() {
    const cats = ['수업', '교재', '기타'];
    return `<div style="display:flex;gap:6px;margin-bottom:10px;flex-shrink:0">
      ${cats.map(c => `<button onclick="StudentApp._tuitionOvSetCategory('${c}')"
        style="flex:1;padding:7px;border-radius:9px;font-size:12px;font-weight:700;cursor:pointer;
        background:${_TUITION_OV_FILTER.category===c?'var(--a)':'var(--surf2)'};color:${_TUITION_OV_FILTER.category===c?'#fff':'var(--tx2)'};border:1px solid ${_TUITION_OV_FILTER.category===c?'var(--a)':'var(--bdr2)'}">${c}</button>`).join('')}
    </div>`;
  }

  function _tuitionOverviewHTML(monthKey) {
    const classFilter = _TUITION_OV_FILTER.classCode || null;
    const { merged: allMerged, classRows } = _tuitionMonthData(monthKey, classFilter);
    const merged = _TUITION_OV_FILTER.unpaidOnly ? allMerged.filter(m => m.paid === null || m.paid < m.billed) : allMerged;
    const totalBilled = allMerged.reduce((s, m) => s + m.billed, 0);
    const totalPaid    = allMerged.reduce((s, m) => s + (m.paid || 0), 0);
    const year = monthKey.slice(0, 4);
    const classNames = _tcClassOptions();

    const classSummaryHTML = classRows.length ? `
      <div style="border:1px solid var(--bdr2);border-radius:10px;padding:8px 10px;margin-bottom:10px;flex-shrink:0">
        <div style="font-size:11px;font-weight:800;color:var(--tx2);margin-bottom:4px">📊 반별 합계${classFilter ? ' (' + _e(classFilter) + ')' : ''}</div>
        ${classRows.map(c => `<div style="display:flex;justify-content:space-between;font-size:11.5px;padding:2px 0">
            <span style="color:var(--tx2)">${_e(c.classCode)} <span style="color:var(--tx3)">(${c.count}명)</span></span>
            <span>청구 <b>${c.billed.toLocaleString()}</b> · 납부 <b>${c.paid.toLocaleString()}</b></span>
          </div>`).join('')}
        <div style="display:flex;justify-content:space-between;font-size:11.5px;padding-top:5px;margin-top:4px;border-top:1px solid var(--bdr2);font-weight:800">
          <span>전체 합계 (${allMerged.length}명)</span>
          <span>청구 ${totalBilled.toLocaleString()}원 · 납부 ${totalPaid.toLocaleString()}원</span>
        </div>
      </div>` : '';

    const rows = merged.length
      ? merged.map(m => `<div style="border:1px solid var(--bdr2);border-radius:9px;padding:9px 11px;margin-bottom:6px;background:var(--surf2)">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <b style="font-size:12.5px">${_e(m.studentName)}${m.nickname?' ('+_e(m.nickname)+')':''} <span style="font-weight:400;color:var(--tx3);font-size:11px">${_e(m.classCode||'')}</span></b>
            <span style="font-size:11px;color:${m.statusColor};font-weight:700">${m.status}</span>
          </div>
          ${m.absence && !m.receipt ? `<div style="font-size:11px;color:#e85d04;margin-top:3px">🏖 결석 ${m.absence.absentCount}일 (${_e(m.absence.absenceStart||'')}~${_e(m.absence.absenceEnd||'')})</div>` : ''}
          ${m.receipt ? `<div style="font-size:11px;color:#0284c7;margin-top:3px">🧾 실제 수납내역 반영됨 (${_e(m.receipt.itemName||'')})</div>` : ''}
          ${!m.receipt && !m.hasAnyReceipt ? `<div style="font-size:10.5px;color:var(--tx3);margin-top:3px">※ 이 학생은 수납내역 가져오기에서 매칭된 기록이 전혀 없습니다 (원생고유번호·이름 확인 필요)</div>` : ''}
          <div style="font-size:11px;color:var(--tx3);margin-top:3px">청구액 <b style="color:var(--tx1)">${m.billed.toLocaleString()}원</b> · 납부액 <b style="color:${m.paid===null?'var(--tx3)':'var(--tx1)'}">${m.paid===null?'미확인':m.paid.toLocaleString()+'원'}</b>${m.payment?.paidDate ? ' · '+_e(m.payment.paidDate) : ''}${m.receipt?.paidDate ? ' · '+_e(m.receipt.paidDate) : ''}</div>
          <div style="display:flex;gap:6px;margin-top:6px">
            ${(!m.receipt && m.paid < m.billed) ? `<button onclick="StudentApp._tuitionQuickMarkPaid('${m.studentId}','${monthKey}',${m.billed})" style="font-size:11px;padding:5px 10px;border-radius:7px;background:rgba(5,150,105,.1);border:1px solid rgba(5,150,105,.3);color:#059669;cursor:pointer">✅ 납부 처리</button>` : ''}
            ${!m.receipt ? `<button onclick="StudentApp.openPaymentEntry('${m.studentId}','${monthKey}')" style="font-size:11px;padding:5px 10px;border-radius:7px;background:rgba(22,163,74,.1);border:1px solid rgba(22,163,74,.3);color:#15803d;cursor:pointer">💳 직접 입력</button>` : ''}
          </div>
        </div>`).join('')
      : `<div style="font-size:12px;color:var(--tx3);padding:12px 2px">${_TUITION_OV_FILTER.unpaidOnly ? '미확인/부족납부 학생이 없습니다.' : '해당 조건의 재원생이 없습니다.'}</div>`;

    return `
      ${_tuitionOvTabsHTML('month', monthKey, year)}
      ${_tuitionOvCategoryTabsHTML()}
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;flex-shrink:0">
        <input type="month" value="${_e(monthKey)}" onchange="StudentApp._tuitionOvChangeMonth(this.value)"
          style="flex:1;padding:8px 10px;border:1.5px solid var(--bdr2);border-radius:9px;font-size:13px;background:var(--card);color:var(--tx1)">
        <select onchange="StudentApp._tuitionOvSetClass(this.value)"
          style="flex:1;padding:8px 10px;border:1.5px solid var(--bdr2);border-radius:9px;font-size:13px;background:var(--card);color:var(--tx1)">
          <option value="">전체 반</option>
          ${classNames.map(n => `<option value="${_e(n)}" ${classFilter===n?'selected':''}>${_e(n)}</option>`).join('')}
        </select>
      </div>
      <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--tx2);margin-bottom:10px;flex-shrink:0;cursor:pointer">
        <input type="checkbox" ${_TUITION_OV_FILTER.unpaidOnly?'checked':''} onchange="StudentApp._tuitionOvToggleUnpaid(this.checked)"> 미확인/부족납부만 보기
      </label>
      <div style="background:rgba(14,165,233,.08);border:1px solid rgba(14,165,233,.25);border-radius:10px;padding:10px 12px;margin-bottom:10px;flex-shrink:0">
        <div style="font-size:12px;color:var(--tx2)">${_e(monthKey)} 기준${classFilter?' · '+_e(classFilter):''} · 대상 <b>${allMerged.length}명</b> · 청구 합계 <b>${totalBilled.toLocaleString()}원</b> · 납부 합계 <b>${totalPaid.toLocaleString()}원</b></div>
        <div style="font-size:10.5px;color:var(--tx3);margin-top:3px">※ 🧾 수납내역을 가져온 항목은 실제 데이터 우선 · 없으면 반 정상 수업료(결석 차감 반영)로 자동 계산 · 입학 당월 제외</div>
      </div>
      ${classSummaryHTML}
      <div style="overflow-y:auto;flex:1">${rows}</div>
      <button onclick="document.getElementById('st-abs-ov-modal').remove()" style="margin-top:12px;padding:11px;border-radius:10px;background:var(--a);color:#fff;border:none;font-size:13px;font-weight:700;cursor:pointer;flex-shrink:0">닫기</button>`;
  }

  function _tuitionOvSetClass(classCode) {
    _TUITION_OV_FILTER.classCode = classCode || '';
    const sheet = document.getElementById('st-abs-ov-sheet');
    if (sheet) sheet.innerHTML = _renderTuitionOvSheet(document.querySelector('#st-abs-ov-sheet input[type="month"]')?.value || new Date().toISOString().slice(0,7));
  }

  /** 📚 교재 / 📦 기타 탭 — 실제 수납내역을 카테고리별로 그대로 나열 (계산/추정 없음, 원본 데이터만) */
  function _receiptsCategoryHTML(monthKey, category) {
    const year = monthKey.slice(0, 4);
    const list = (typeof StudentDB !== 'undefined' && StudentDB.getReceiptsByMonth)
      ? StudentDB.getReceiptsByMonth(monthKey, category) : [];

    const totalBilled = list.reduce((s, r) => s + Number(r.billedAmount || 0), 0);
    const totalPaid    = list.reduce((s, r) => s + Number(r.paidAmount || 0), 0);
    const unpaidCount  = list.filter(r => r.status !== '납부완료').length;

    const rows = list.length
      ? list.slice().sort((a, b) => (a.studentName || '').localeCompare(b.studentName || '')).map(r => {
          const paid = r.status === '납부완료';
          return `<div style="border:1px solid var(--bdr2);border-radius:9px;padding:9px 11px;margin-bottom:6px;background:var(--surf2)">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <b style="font-size:12.5px">${_e(r.studentName)}${r.nickname?' ('+_e(r.nickname)+')':''} <span style="font-weight:400;color:var(--tx3);font-size:11px">${_e(r.classCode||'')}</span></b>
              <span style="font-size:11px;color:${paid?'#059669':'#d97706'};font-weight:700">${_e(r.status||'-')}</span>
            </div>
            <div style="font-size:11.5px;color:var(--tx2);margin-top:3px">${_e(r.itemName||'')}</div>
            <div style="font-size:11px;color:var(--tx3);margin-top:2px">청구 <b style="color:var(--tx1)">${Number(r.billedAmount||0).toLocaleString()}원</b> · 납부 <b style="color:${paid?'var(--tx1)':'#d97706'}">${Number(r.paidAmount||0).toLocaleString()}원</b>${r.paidDate?' · '+_e(r.paidDate):''}</div>
          </div>`;
        }).join('')
      : `<div style="font-size:12px;color:var(--tx3);padding:12px 2px">이 달에 "${_e(category)}" 수납내역이 없습니다.</div>`;

    return `
      ${_tuitionOvTabsHTML('month', monthKey, year)}
      ${_tuitionOvCategoryTabsHTML()}
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;flex-shrink:0">
        <input type="month" value="${_e(monthKey)}" onchange="StudentApp._tuitionOvChangeMonth(this.value)"
          style="flex:1;padding:8px 10px;border:1.5px solid var(--bdr2);border-radius:9px;font-size:13px;background:var(--card);color:var(--tx1)">
      </div>
      <div style="background:rgba(14,165,233,.08);border:1px solid rgba(14,165,233,.25);border-radius:10px;padding:10px 12px;margin-bottom:10px;flex-shrink:0">
        <div style="font-size:12px;color:var(--tx2)">${_e(monthKey)} · ${_e(category)} <b>${list.length}건</b>${unpaidCount?` · 미납 <b style="color:#d97706">${unpaidCount}건</b>`:''} · 청구 합계 <b>${totalBilled.toLocaleString()}원</b> · 납부 합계 <b>${totalPaid.toLocaleString()}원</b></div>
        <div style="font-size:10.5px;color:var(--tx3);margin-top:3px">※ 🧾 수납내역 가져오기로 등록된 실제 데이터만 표시됩니다 (계산·추정 없음)</div>
      </div>
      <div style="overflow-y:auto;flex:1">${rows}</div>
      <button onclick="document.getElementById('st-abs-ov-modal').remove()" style="margin-top:12px;padding:11px;border-radius:10px;background:var(--a);color:#fff;border:none;font-size:13px;font-weight:700;cursor:pointer;flex-shrink:0">닫기</button>`;
  }

  function _tuitionOvToggleUnpaid(checked) {
    _TUITION_OV_FILTER.unpaidOnly = !!checked;
    const sheet = document.getElementById('st-abs-ov-sheet');
    if (sheet) sheet.innerHTML = _renderTuitionOvSheet(document.querySelector('#st-abs-ov-sheet input[type="month"]')?.value || new Date().toISOString().slice(0,7));
  }

  /** ✅ 원클릭 납부 처리 — 외부 결제사이트 등에서 실제로 입금된 걸 관리자가 확인했을 때,
   *  청구액 그대로 "납부 완료"로 빠르게 전환. 금액을 직접 다르게 입력하고 싶으면
   *  "💳 직접 입력" 버튼으로 기존 폼을 쓰면 된다. */
  async function _tuitionQuickMarkPaid(studentId, monthKey, billedAmount) {
    const today = new Date().toISOString().slice(0, 10);
    await StudentDB.saveTuitionPayment(studentId, monthKey, {
      amount: Number(billedAmount) || 0,
      paidDate: today,
      method: '확인 처리',
      note: '관리자가 직접 확인 후 납부 처리',
    });
    _toast('✅ 납부 처리되었습니다');
    const sheet = document.getElementById('st-abs-ov-sheet');
    if (sheet) sheet.innerHTML = _renderTuitionOvSheet(monthKey);
  }

  function _tuitionOvChangeMonth(monthKey) {
    const sheet = document.getElementById('st-abs-ov-sheet');
    if (sheet) sheet.innerHTML = _renderTuitionOvSheet(monthKey);
  }

  /** 📆 연간 현황 — 12개월을 한 화면에서 한눈에, 클릭하면 해당 월 상세로 이동 */
  function _tuitionYearHTML(year) {
    year = String(year || new Date().getFullYear());
    const months = [];
    const uniqueStudentIds = new Set(); // 같은 학생이 여러 달에 걸쳐 나와도 1명으로만 집계
    for (let m = 1; m <= 12; m++) {
      const mk = `${year}-${String(m).padStart(2, '0')}`;
      const { merged, totalBilled, totalPaid } = _tuitionMonthData(mk);
      merged.forEach(x => uniqueStudentIds.add(x.studentId));
      months.push({ monthKey: mk, month: m, count: merged.length, billed: totalBilled, paid: totalPaid });
    }
    const yearBilled = months.reduce((s, m) => s + m.billed, 0);
    const yearPaid    = months.reduce((s, m) => s + m.paid, 0);
    const yearCount   = uniqueStudentIds.size; // 중복 제거된 실제 학생 수
    const yearPersonMonths = months.reduce((s, m) => s + m.count, 0); // 참고용: 연인원(달마다 중복 합산)

    const rows = months.map(m => {
      const empty = m.count === 0;
      const unpaidGap = m.billed - m.paid;
      const badge = empty ? '' :
        unpaidGap <= 0 ? '<span style="font-size:10px;color:#059669;font-weight:700">✓ 완납</span>'
                        : `<span style="font-size:10px;color:#dc2626;font-weight:700">미수금 ${unpaidGap.toLocaleString()}</span>`;
      return `<div onclick="StudentApp.openTuitionOverview('${m.monthKey}','month')"
          style="display:flex;align-items:center;justify-content:space-between;padding:9px 11px;margin-bottom:5px;border:1px solid var(--bdr2);border-radius:9px;cursor:pointer;background:${empty?'var(--card)':'var(--surf2)'}">
        <div>
          <b style="font-size:12.5px">${m.month}월</b>
          <span style="font-size:10.5px;color:var(--tx3);margin-left:6px">${empty ? '기록 없음' : m.count+'명'}</span>
        </div>
        <div style="text-align:right">
          ${empty ? '<span style="font-size:11px;color:var(--tx3)">-</span>' :
            `<div style="font-size:11.5px">청구 ${m.billed.toLocaleString()} · 납부 ${m.paid.toLocaleString()}</div>${badge}`}
        </div>
      </div>`;
    }).join('');

    return `
      ${_tuitionOvTabsHTML('year', `${year}-01`, year)}
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;flex-shrink:0">
        <button onclick="StudentApp._tuitionOvChangeYear(${Number(year)-1})" style="padding:8px 12px;border-radius:9px;border:1px solid var(--bdr2);background:var(--surf2);cursor:pointer;font-size:13px">◀</button>
        <div style="flex:1;text-align:center;font-size:14px;font-weight:800">${year}년</div>
        <button onclick="StudentApp._tuitionOvChangeYear(${Number(year)+1})" style="padding:8px 12px;border-radius:9px;border:1px solid var(--bdr2);background:var(--surf2);cursor:pointer;font-size:13px">▶</button>
      </div>
      <div style="background:rgba(14,165,233,.08);border:1px solid rgba(14,165,233,.25);border-radius:10px;padding:10px 12px;margin-bottom:10px;flex-shrink:0">
        <div style="font-size:12px;color:var(--tx2)">${year}년 연간 · 대상 학생 <b>${yearCount}명</b> <span style="color:var(--tx3);font-weight:400">(연인원 ${yearPersonMonths}명)</span> · 청구 합계 <b>${yearBilled.toLocaleString()}원</b> · 납부 합계 <b>${yearPaid.toLocaleString()}원</b></div>
        <div style="font-size:10.5px;color:var(--tx3);margin-top:3px">※ 월을 탭하면 그 달 상세 내역으로 이동합니다</div>
      </div>
      <div style="overflow-y:auto;flex:1">${rows}</div>
      <button onclick="document.getElementById('st-abs-ov-modal').remove()" style="margin-top:12px;padding:11px;border-radius:10px;background:var(--a);color:#fff;border:none;font-size:13px;font-weight:700;cursor:pointer;flex-shrink:0">닫기</button>`;
  }

  function _tuitionOvChangeYear(year) {
    const sheet = document.getElementById('st-abs-ov-sheet');
    if (sheet) sheet.innerHTML = _tuitionYearHTML(year);
  }

  /* ════════════════════════════════════════════
   * 📥 수납내역 가져오기 (외부 결제사이트 엑셀)
   * 컬럼 예: 원생고유번호, 이름, 학년, 학교, 학부모연락처, 원생연락처, 구분(수업/교재/기타),
   *   청구월(YYYYMM), 청구일, 수납명, 수납여부(납부완료/미납), 청구액, 할인액, 적립금사용,
   *   실제낸금액, 미납금액, 결제수단, 결제수단(상세), 카드사, 수납일(YYYYMMDD), 현금영수증, 메모
   * ════════════════════════════════════════════ */

  function openReceiptImport() {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.xlsx,.xls';
    inp.onchange = e => _handleReceiptFile(e.target.files[0]);
    inp.click();
  }

  /** 'YYYYMM' → 'YYYY-MM', 'YYYYMMDD' → 'YYYY-MM-DD'. 형식이 안 맞으면 원본 그대로 반환 */
  function _ymToKey(v) {
    const s = String(v ?? '').trim();
    return /^\d{6}$/.test(s) ? `${s.slice(0,4)}-${s.slice(4,6)}` : s;
  }
  function _ymdToKey(v) {
    const s = String(v ?? '').trim();
    return /^\d{8}$/.test(s) ? `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}` : s;
  }

  /** 수납내역 엑셀 한 행을 정규화 */
  function _parseReceiptRow(row) {
    return {
      originalId:   String(row['원생고유번호'] ?? '').trim(),
      name:         String(row['이름'] ?? '').trim(),
      phone:        String(row['원생연락처'] ?? '').trim(),
      parentPhone:  String(row['학부모연락처'] ?? '').trim(),
      category:     String(row['구분'] ?? '기타').trim(), // 수업 / 교재 / 기타
      billMonth:    _ymToKey(row['청구월']),
      billDay:      String(row['청구일'] ?? '').trim(),
      itemName:     String(row['수납명'] ?? '').trim(),
      status:       String(row['수납여부'] ?? '').trim(), // 납부완료 / 미납
      billedAmount: Number(row['청구액'] || 0),
      discount:     Number(row['할인액'] || 0),
      pointsUsed:   Number(row['적립금사용'] || 0),
      paidAmount:   Number(row['실제낸금액'] || 0),
      unpaidAmount: Number(row['미납금액'] || 0),
      method:       String(row['결제수단'] ?? '').trim(),
      methodDetail: String(row['결제수단(상세)'] ?? '').trim(),
      cardCompany:  String(row['카드사'] ?? '').trim(),
      paidDate:     _ymdToKey(row['수납일']),
      cashReceipt:  String(row['현금영수증'] ?? '').trim(),
      note:         String(row['메모'] ?? '').trim(),
    };
  }

  async function _handleReceiptFile(file) {
    if (!file) return;
    if (typeof XLSX === 'undefined') { _toast('❌ XLSX 라이브러리가 로드되지 않았습니다'); return; }

    const pg = document.getElementById('page-students');
    const overlay = document.createElement('div');
    overlay.className = 'st-importing-overlay';
    overlay.innerHTML = '<div class="st-importing-box">🧾 수납내역 가져오는 중…</div>';
    if (pg) { pg.style.position = 'relative'; pg.appendChild(overlay); }

    try {
      const buf  = await file.arrayBuffer();
      const wb   = XLSX.read(buf, { type: 'array' });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

      if (!rows.length) { _toast('⚠️ 데이터가 없습니다'); return; }

      const cols    = Object.keys(rows[0]);
      const missing = ['이름', '구분', '청구월', '청구액'].filter(c => !cols.includes(c));
      if (missing.length) { _toast(`⚠️ 필수 컬럼 없음: ${missing.join(', ')}`); return; }

      const normalized = rows.map(_parseReceiptRow).filter(r => r.name && r.billMonth);
      const result = await StudentDB.importReceipts(normalized);
      _showReceiptImportResultModal(result);
      // 현재 열려있는 수업료 현황 모달이 있으면 최신 데이터로 갱신
      const sheet = document.getElementById('st-abs-ov-sheet');
      if (sheet) sheet.innerHTML = _renderTuitionOvSheet(document.querySelector('#st-abs-ov-sheet input[type="month"]')?.value || new Date().toISOString().slice(0,7));

    } catch (e) {
      console.error('[StudentApp] receipt import error', e);
      _toast('❌ 수납내역 가져오기 실패: ' + e.message);
    } finally {
      overlay.remove();
    }
  }

  function _showReceiptImportResultModal(result) {
    document.getElementById('st-recpt-modal')?.remove();

    const modal = document.createElement('div');
    modal.id = 'st-recpt-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:650;display:flex;align-items:flex-end;justify-content:center';
    modal.onclick = e => { if (e.target === modal) modal.remove(); };

    const sheet = document.createElement('div');
    sheet.style.cssText = 'background:var(--card);border-radius:20px 20px 0 0;padding:20px;width:100%;max-width:520px;max-height:82vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 -4px 24px rgba(0,0,0,.18)';

    const catRows = Object.entries(result.byCategory || {}).map(([cat, v]) =>
      `<div style="display:flex;justify-content:space-between;font-size:12.5px;padding:4px 0">
        <span>${_e(cat)} (${v.count}건)</span>
        <span>청구 <b>${v.billed.toLocaleString()}</b> · 납부 <b>${v.paid.toLocaleString()}</b></span>
      </div>`).join('');

    const unmatchedHTML = result.unmatchedList.length ? `
      <div style="margin-top:10px">
        <div style="font-size:12px;font-weight:800;color:var(--tx2);margin-bottom:6px">⚠️ 매칭 안 된 항목 (${result.unmatched}건)</div>
        <div style="max-height:160px;overflow-y:auto">
          ${result.unmatchedList.slice(0, 50).map(u => `<div style="font-size:11px;color:var(--tx3);padding:2px 0">${_e(u.name||'(이름없음)')} · ${_e(u.originalId||'-')} · ${_e(u.itemName||'')} (${_e(u.billMonth||'')})</div>`).join('')}
          ${result.unmatchedList.length > 50 ? `<div style="font-size:11px;color:var(--tx3);padding:2px 0">... 외 ${result.unmatchedList.length-50}건</div>` : ''}
        </div>
        <div style="font-size:10.5px;color:var(--tx3);margin-top:4px">※ 원생고유번호나 이름이 학생탭 명단과 다르면 매칭이 안 됩니다. 학생탭에서 이름·원생번호를 확인해보세요.</div>
      </div>` : '';

    sheet.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-shrink:0">
        <div style="font-size:15px;font-weight:800">🧾 수납내역 가져오기 결과</div>
        <button onclick="document.getElementById('st-recpt-modal').remove()" style="background:none;border:none;font-size:22px;cursor:pointer;color:var(--tx3)">✕</button>
      </div>
      <div style="overflow-y:auto;flex:1">
        <div style="background:rgba(14,165,233,.08);border:1px solid rgba(14,165,233,.25);border-radius:10px;padding:10px 12px;margin-bottom:10px">
          <div style="font-size:12.5px;color:var(--tx2)">총 ${result.total}건 중 <b style="color:#059669">매칭 ${result.matched}건</b>${result.unmatched?` · <b style="color:#dc2626">매칭 안됨 ${result.unmatched}건</b>`:''}</div>
        </div>
        <div style="border:1px solid var(--bdr2);border-radius:10px;padding:8px 10px">
          <div style="font-size:11px;font-weight:800;color:var(--tx2);margin-bottom:4px">📊 구분별 합계</div>
          ${catRows}
        </div>
        ${unmatchedHTML}
      </div>
      <button onclick="document.getElementById('st-recpt-modal').remove()" style="margin-top:12px;padding:11px;border-radius:10px;background:var(--a);color:#fff;border:none;font-size:13px;font-weight:700;cursor:pointer;flex-shrink:0">확인</button>`;

    modal.appendChild(sheet);
    document.body.appendChild(modal);
  }

  /** 드래그 앤 드롭 바인딩 */
  function _bindDrop() {
    const pg = document.getElementById('page-students');
    if (!pg) return;

    pg.addEventListener('dragenter', e => {
      if (_hasExcelFile(e)) {
        e.preventDefault();
        pg.classList.add('st-drag-over');
      }
    });
    pg.addEventListener('dragover', e => {
      if (_hasExcelFile(e)) {
        e.preventDefault(); // 필수: 드롭 허용
      }
    });
    pg.addEventListener('dragleave', e => {
      if (!pg.contains(e.relatedTarget)) pg.classList.remove('st-drag-over');
    });
    pg.addEventListener('drop', async e => {
      pg.classList.remove('st-drag-over');
      e.preventDefault();
      const file = e.dataTransfer?.files?.[0];
      if (file && _isExcel(file.name)) {
        await handleFile(file);
      } else if (file) {
        _toast('⚠️ .xlsx 또는 .xls 파일을 드롭해주세요');
      }
    });
  }

  function _hasExcelFile(e) {
    return Array.from(e.dataTransfer?.types || []).includes('Files');
  }
  function _isExcel(name) {
    return /\.(xlsx|xls)$/i.test(name);
  }

  /* ════════════════════════════════════════════
   * 학생 상세 모달
   * ════════════════════════════════════════════ */

  function openDetail(id) {
    const s = StudentDB.getAll().find(x => x.id === id);
    if (!s) return;
    _state.detailId = id;

    const ov = document.getElementById('st-detail-ov');
    const sh = document.getElementById('st-detail-sh');
    if (!ov || !sh) return;

    sh.innerHTML = _detailHTML(s);
    ov.classList.remove('hidden');
    history.pushState({ pg: 'students', modal: 'detail' }, '');
  }

  function closeDetail() {
    document.getElementById('st-detail-ov')?.classList.add('hidden');
    _state.detailId = null;
  }

  /* ──── 상세 HTML ──── */
  function _detailHTML(s) {
    const statusColor =
      s.status === '재원' ? '#22c55e' :
      s.status === '휴원' ? '#f97316' : '#9ca3af';

    const rows = [
      ['반',         s.classCode],
      ['수업명',     s.courseName],
      ['학년',       s.grade],
      ['학교',       s.school],
      ['성별',       s.gender],
      ['출결번호',   s.attendanceNo],
      ['입학일',     s.enrollDate],
      ['담임강사',   s.teacher],
      ['원생 연락처', s.phone,        true],
      ['보호자',     [s.parentType, s.parentName].filter(Boolean).join(' ')],
      ['보호자 연락처', s.parentPhone, true],
      ['닉네임',     s.nickname],
      s.status === '휴원' && ['휴원사유', s.pauseReason],
      s.status === '퇴원' && ['퇴원일',   s.leaveDate],
      s.status === '퇴원' && ['퇴원사유', s.leaveReason],
      s.memo        && ['메모',       s.memo,         false, true],
    ].filter(Boolean);

    return `
      <div class="sh-handle"></div>
      <div class="sh-title">
        ${_e(s.name)}
        ${s.nickname
          ? `<span style="font-weight:400;font-size:13px;color:var(--tx3)"> (${_e(s.nickname)})</span>`
          : ''}
        <span class="st-status-badge" style="color:${statusColor};margin-left:8px">
          ${s.status}
        </span>
      </div>
      <div class="sh-sub">${_e(s.classCode)} · ${_e(s.grade)} · ${_e(s.school)}</div>

      <div class="st-detail-grid">
        ${rows.map(([lbl, val, isPhone, isFull]) => {
          if (!val) return '';
          const display = isPhone
            ? `<a href="tel:${String(val).replace(/[^0-9+]/g, '')}" class="st-phone-link">${_e(val)}</a>`
            : _e(val);
          return `
            <div class="st-detail-row${isFull ? ' full' : ''}">
              <div class="st-detail-lbl">${lbl}</div>
              <div class="st-detail-val">${display}</div>
            </div>
          `;
        }).join('')}
      </div>

      <!-- 빠른 재원상태 변경 -->
      <div class="st-quick-status">
        ${['재원', '휴원', '퇴원'].map(st => `
          <button class="st-qs-btn ${s.status === st ? 'active-' + st : ''}"
            onclick="StudentApp.quickStatus('${s.id}','${st}')">
            ${st}
          </button>
        `).join('')}
      </div>

      <button class="tc-detail-btn" onclick="StudentApp.openTuitionCalc('${s.id}','enroll')">💰 입학 수업료 계산</button>
      <button class="tc-detail-btn" style="margin-top:6px;border-color:#e85d04;background:rgba(232,93,4,.07);color:#e85d04" onclick="StudentApp.openTuitionCalc('${s.id}','refund')">💸 퇴원 환불금 계산</button>
      <button class="tc-detail-btn" style="margin-top:6px;border-color:#0ea5e9;background:rgba(14,165,233,.07);color:#0284c7" onclick="StudentApp.openTuitionCalc('${s.id}','absence')">🏖 결석 차감 계산</button>
      <button class="tc-detail-btn" style="margin-top:6px;border-color:#16a34a;background:rgba(22,163,74,.07);color:#15803d" onclick="StudentApp.openPaymentEntry('${s.id}')">💳 납부 기록</button>

      <div class="sh-acts" style="margin-top:10px;flex-wrap:wrap">
        <button class="btn-x" onclick="StudentApp.closeDetail()">닫기</button>
        <button class="btn-ok" style="flex:1.4" onclick="StudentApp.openEditForm('${s.id}')">✏️ 수정</button>
        <button class="btn-del-ghost" onclick="StudentApp.confirmDelete('${s.id}')">🗑 삭제</button>
      </div>
    `;
  }

  /* ════════════════════════════════════════════
   * ✏️ 학생 정보 수정
   * 상세 모달(st-detail-sh) 안에서 보기 ↔ 수정 폼을 토글한다
   * ════════════════════════════════════════════ */

  /** 수정 폼 열기 */
  function openEditForm(id) {
    const s = StudentDB.getAll().find(x => x.id === id);
    if (!s) return;
    const sh = document.getElementById('st-detail-sh');
    if (!sh) return;
    sh.innerHTML = _editFormHTML(s);
  }

  /** 수정 취소 → 상세 보기로 복귀 (저장하지 않음) */
  function _cancelEdit(id) {
    const s = StudentDB.getAll().find(x => x.id === id);
    const sh = document.getElementById('st-detail-sh');
    if (s && sh) sh.innerHTML = _detailHTML(s);
  }

  /** 재원상태 선택 변경 → 휴원사유/퇴원일·사유 입력란 표시 토글 */
  function _onEditStatusChange() {
    const st = document.getElementById('ed-status')?.value;
    const pauseGrp = document.getElementById('ed-pause-grp');
    const leaveGrp = document.getElementById('ed-leave-grp');
    if (pauseGrp) pauseGrp.style.display = st === '휴원' ? '' : 'none';
    if (leaveGrp) leaveGrp.style.display = st === '퇴원' ? '' : 'none';
  }

  /** 수정 폼 HTML */
  function _editFormHTML(s) {
    const classNames = (typeof DB !== 'undefined')
      ? [...new Set(DB.getActiveClasses().map(c => c.name))].filter(Boolean).sort() : [];
    const grades  = StudentDB.getGrades();
    const schools = StudentDB.getSchools();
    const v = x => _e(x ?? '');

    return `
      <div class="sh-handle"></div>
      <div class="sh-title">✏️ 학생 정보 수정</div>
      <div class="sh-sub">${v(s.name)} 학생의 정보를 수정합니다</div>

      <div class="f-grp">
        <label class="f-lbl">이름 *</label>
        <input class="f-inp" id="ed-name" value="${v(s.name)}" maxlength="20">
      </div>
      <div class="f-grp">
        <label class="f-lbl">닉네임</label>
        <input class="f-inp" id="ed-nickname" value="${v(s.nickname)}" maxlength="20">
      </div>
      <div class="f-grp" style="display:flex;gap:10px">
        <div style="flex:1">
          <label class="f-lbl">반</label>
          <input class="f-inp" id="ed-classCode" list="ed-cls-list" value="${v(s.classCode)}" maxlength="10">
          <datalist id="ed-cls-list">${classNames.map(n => `<option value="${v(n)}">`).join('')}</datalist>
        </div>
        <div style="flex:1.4">
          <label class="f-lbl">수업명</label>
          <input class="f-inp" id="ed-courseName" value="${v(s.courseName)}">
        </div>
      </div>
      <div class="f-grp" style="display:flex;gap:10px">
        <div style="flex:1">
          <label class="f-lbl">학년</label>
          <input class="f-inp" id="ed-grade" list="ed-grade-list" value="${v(s.grade)}">
          <datalist id="ed-grade-list">${grades.map(g => `<option value="${v(g)}">`).join('')}</datalist>
        </div>
        <div style="flex:1">
          <label class="f-lbl">성별</label>
          <select class="f-sel" id="ed-gender">
            <option value="" ${!s.gender ? 'selected' : ''}>—</option>
            <option value="남" ${s.gender === '남' ? 'selected' : ''}>남</option>
            <option value="여" ${s.gender === '여' ? 'selected' : ''}>여</option>
          </select>
        </div>
      </div>
      <div class="f-grp">
        <label class="f-lbl">학교</label>
        <input class="f-inp" id="ed-school" list="ed-school-list" value="${v(s.school)}">
        <datalist id="ed-school-list">${schools.map(sc => `<option value="${v(sc)}">`).join('')}</datalist>
      </div>
      <div class="f-grp" style="display:flex;gap:10px">
        <div style="flex:1">
          <label class="f-lbl">출결번호</label>
          <input class="f-inp" id="ed-attendanceNo" value="${v(s.attendanceNo)}">
        </div>
        <div style="flex:1.3">
          <label class="f-lbl">입학일</label>
          <input class="f-inp" id="ed-enrollDate" placeholder="YYYY-MM-DD" value="${v(s.enrollDate)}">
        </div>
      </div>
      <div class="f-grp">
        <label class="f-lbl">생일</label>
        <input class="f-inp" id="ed-birthday" placeholder="YYYY-MM-DD" value="${v(s.birthday)}">
      </div>
      <div class="f-grp">
        <label class="f-lbl">담임강사</label>
        <input class="f-inp" id="ed-teacher" value="${v(s.teacher)}">
      </div>
      <div class="f-grp" style="display:flex;gap:10px">
        <div style="flex:1">
          <label class="f-lbl">원생 연락처</label>
          <input class="f-inp" id="ed-phone" type="tel" value="${v(s.phone)}">
        </div>
        <div style="flex:1">
          <label class="f-lbl">집전화</label>
          <input class="f-inp" id="ed-homePhone" type="tel" value="${v(s.homePhone)}">
        </div>
      </div>
      <div class="f-grp" style="display:flex;gap:10px">
        <div style="flex:1">
          <label class="f-lbl">보호자구분</label>
          <input class="f-inp" id="ed-parentType" value="${v(s.parentType)}" placeholder="모/부">
        </div>
        <div style="flex:2">
          <label class="f-lbl">보호자 이름</label>
          <input class="f-inp" id="ed-parentName" value="${v(s.parentName)}">
        </div>
      </div>
      <div class="f-grp">
        <label class="f-lbl">보호자 연락처</label>
        <input class="f-inp" id="ed-parentPhone" type="tel" value="${v(s.parentPhone)}">
      </div>

      <div class="f-grp">
        <label class="f-lbl">재원상태</label>
        <select class="f-sel" id="ed-status" onchange="StudentApp._onEditStatusChange()">
          ${['재원', '휴원', '퇴원'].map(st => `<option value="${st}" ${s.status === st ? 'selected' : ''}>${st}</option>`).join('')}
        </select>
      </div>
      <div class="f-grp" id="ed-pause-grp" style="${s.status === '휴원' ? '' : 'display:none'}">
        <label class="f-lbl">휴원사유</label>
        <input class="f-inp" id="ed-pauseReason" value="${v(s.pauseReason)}">
      </div>
      <div id="ed-leave-grp" style="${s.status === '퇴원' ? '' : 'display:none'}">
        <div class="f-grp">
          <label class="f-lbl">퇴원일</label>
          <input class="f-inp" id="ed-leaveDate" placeholder="YYYY-MM-DD" value="${v(s.leaveDate)}">
        </div>
        <div class="f-grp">
          <label class="f-lbl">퇴원사유</label>
          <input class="f-inp" id="ed-leaveReason" value="${v(s.leaveReason)}">
        </div>
      </div>

      <div class="f-grp">
        <label class="f-lbl">메모</label>
        <textarea class="f-inp" id="ed-memo" rows="3" style="resize:vertical;font-family:var(--font);line-height:1.5">${v(s.memo)}</textarea>
      </div>

      <div class="sh-acts">
        <button class="btn-x" onclick="StudentApp._cancelEdit('${s.id}')">취소</button>
        <button class="btn-ok" onclick="StudentApp.saveEdit('${s.id}')">저장</button>
      </div>
    `;
  }

  /** 수정 폼 저장 */
  async function saveEdit(id) {
    const g = key => document.getElementById(key)?.value.trim() ?? '';
    const name = g('ed-name');
    if (!name) { _toast('⚠️ 이름을 입력해주세요', 'error'); return; }

    const data = {
      name,
      nickname:     g('ed-nickname'),
      classCode:    g('ed-classCode'),
      courseName:   g('ed-courseName'),
      grade:        g('ed-grade'),
      gender:       g('ed-gender'),
      school:       g('ed-school'),
      attendanceNo: g('ed-attendanceNo'),
      enrollDate:   g('ed-enrollDate'),
      birthday:     g('ed-birthday'),
      teacher:      g('ed-teacher'),
      phone:        g('ed-phone'),
      homePhone:    g('ed-homePhone'),
      parentType:   g('ed-parentType'),
      parentName:   g('ed-parentName'),
      parentPhone:  g('ed-parentPhone'),
      status:       g('ed-status') || '재원',
      pauseReason:  g('ed-pauseReason'),
      leaveDate:    g('ed-leaveDate'),
      leaveReason:  g('ed-leaveReason'),
      memo:         g('ed-memo'),
    };

    const result = await StudentDB.updateStudent(id, data);

    const updated = StudentDB.getAll().find(x => x.id === id);
    const sh = document.getElementById('st-detail-sh');
    if (updated && sh) sh.innerHTML = _detailHTML(updated);

    _renderContent();
    _toast(result?.savedToServer ? `✅ ${name} 정보가 수정되었습니다` : `⏳ ${name} 정보 로컬 저장됨 · 서버 전송 대기 중`, result?.savedToServer ? 'success' : undefined);
  }

  /* ──── 빠른 재원 상태 변경 ──── */
  async function quickStatus(id, status) {
    if (!confirm(`'${status}'(으)로 상태를 변경하시겠습니까?`)) return;

    const result = await StudentDB.updateStudent(id, { status });

    // 상세 모달 내용만 갱신 (모달 닫지 않음)
    const s  = StudentDB.getAll().find(x => x.id === id);
    const sh = document.getElementById('st-detail-sh');
    if (s && sh) sh.innerHTML = _detailHTML(s);

    _renderContent();
    _toast(result?.savedToServer ? `✅ ${s?.name || ''} → ${status}` : `⏳ ${s?.name || ''} → ${status} (서버 전송 대기 중)`, result?.savedToServer ? 'success' : undefined);
  }

  /* ──── 삭제 확인 ──── */
  async function confirmDelete(id) {
    const s = StudentDB.getAll().find(x => x.id === id);
    if (!s) return;
    if (!confirm(`${s.name} 학생 데이터를 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return;

    await StudentDB.deleteStudent(id);
    closeDetail();
    _renderContent();
    _toast(`${s.name} 삭제 완료`);
  }

  /* ════════════════════════════════════════════
   * 💰 수업료 계산기
   *
   * 반의 수업 요일(DB.classes[].days) × 월 수업료(DB.classes[].tuition)를
   * 기준으로, 입학일부터 그 달 말일까지 남은 실제 수업일수를 계산해
   * 입학 첫 달 수업료를 산정한다.
   * ════════════════════════════════════════════ */
  const _TC_DOW = { 일:0, 월:1, 화:2, 수:3, 목:4, 금:5, 토:6 };

  /** 해당 연/월에 반 수업요일과 일치하는 날짜(일) 목록 */
  function _tcMeetDays(days, year, month) {
    const wanted = (days || []).map(d => _TC_DOW[d]).filter(n => n !== undefined);
    if (!wanted.length) return [];
    const lastDay = new Date(year, month, 0).getDate();
    const res = [];
    for (let day = 1; day <= lastDay; day++) {
      if (wanted.includes(new Date(year, month - 1, day).getDay())) res.push(day);
    }
    return res;
  }

  /** classCode(반 이름)로 해당 월에 운용 중이던 반(DB.classes) 정보 조회 */
  function _tcFindClass(className, enrollDateStr) {
    if (typeof DB === 'undefined' || !className) return null;
    const mk = (enrollDateStr && /^\d{4}-\d{2}/.test(enrollDateStr))
      ? enrollDateStr.slice(0, 7) : DB.monthKey(new Date());
    const inMonth = DB.getClassesForMonth(mk).find(c => (c.name || '').trim() === className.trim());
    if (inMonth) return inMonth;
    return DB.getActiveClasses().find(c => (c.name || '').trim() === className.trim()) || null;
  }

  /** 반/입학일 기준 프로레이트 수업료 계산 */
  function _tcCalc(cls, enrollDateStr) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(enrollDateStr || '');
    if (!cls || !m) return null;
    const year = +m[1], month = +m[2], day = +m[3];
    const allDays    = _tcMeetDays(cls.days, year, month);
    const totalCount = allDays.length;
    const remainDays = allDays.filter(d => d >= day);
    const remainCount = remainDays.length;
    const tuition = Number(cls.tuition) || 0;
    const perDay  = totalCount ? tuition / totalCount : 0;
    const amountExact   = Math.round(perDay * remainCount);
    const amountRounded = _money100(amountExact); // ★ 1,000원 단위 절삭(내림)
    return { year, month, day, allDays, remainDays, totalCount, remainCount, tuition, perDay, amountExact, amountRounded };
  }

  /** 반 선택 옵션 (현재 운용 중인 반 이름 목록) */
  function _tcClassOptions() {
    if (typeof DB === 'undefined') return [];
    return [...new Set(DB.getActiveClasses().map(c => c.name))].filter(Boolean).sort();
  }

  /** 계산기 모달 내부 HTML — mode: 'enroll'(입학) | 'refund'(퇴원 환불) | 'absence'(결석 차감) */
  function _tcModalHTML(prefill, mode='enroll') {
    const names = _tcClassOptions();
    const today = new Date().toISOString().slice(0, 10);
    const selClass   = prefill.classCode || '';
    const enrollDate = prefill.enrollDate || today;
    const isRefund  = mode === 'refund';
    const isAbsence = mode === 'absence';
    // 🏖 결석 차감 탭은 특정 학생 컨텍스트(prefill.studentId)에서만 의미가 있음
    const showAbsenceTab = !!prefill.studentId;
    return `
      <div class="sh-handle"></div>
      <div class="sh-title">💰 수업료 계산기</div>
      <div class="sh-sub">${prefill.studentName ? _e(prefill.studentName) + ' 학생 · ' : ''}반 수업일 기준으로 수업료를 계산합니다.</div>

      <div class="tc-tabs">
        <button class="tc-tab ${!isRefund && !isAbsence?'active':''}"
          onclick="StudentApp._tcSwitchMode('enroll')">📥 입학 수업료</button>
        <button class="tc-tab ${isRefund?'active':''}"
          onclick="StudentApp._tcSwitchMode('refund')">💸 퇴원 환불금</button>
        ${showAbsenceTab ? `<button class="tc-tab ${isAbsence?'active':''}"
          onclick="StudentApp._tcSwitchMode('absence')">🏖 결석 차감</button>` : ''}
      </div>

      <div class="f-grp">
        <label class="f-lbl">반 선택</label>
        <select class="f-sel" id="tc-cls" onchange="StudentApp._tcOnChange()">
          <option value="">반을 선택하세요</option>
          ${names.map(n => `<option value="${_e(n)}" ${n === selClass ? 'selected' : ''}>${_e(n)}</option>`).join('')}
        </select>
        ${!names.length ? '<div class="tc-warn">⚠️ 운용 중인 반이 없습니다. 관리 &gt; 반 관리에서 반을 먼저 등록해주세요.</div>' : ''}
      </div>

      ${isAbsence ? `
      <div class="tc-warn" style="background:rgba(14,165,233,.08);border-color:rgba(14,165,233,.25);color:#0284c7;margin-bottom:8px">
        ℹ️ 여기서 저장하는 건 <b>이 학생의 이 기간에 한정된 예외 차감</b>입니다. 다른 달·다른 학생에는 전혀 영향이 없고, 저장하지 않은 달은 자동으로 원래 고정 수업료가 그대로 적용됩니다.
      </div>
      <div class="f-grp" style="display:flex;gap:8px">
        <div style="flex:1">
          <label class="f-lbl">결석 시작일</label>
          <input class="f-inp" id="tc-abs-start" type="date" value="${_e(today)}" onchange="StudentApp._tcOnChange()">
        </div>
        <div style="flex:1">
          <label class="f-lbl">결석 종료일 <span style="font-size:10px;font-weight:400;color:var(--tx3)">(포함)</span></label>
          <input class="f-inp" id="tc-abs-end" type="date" value="${_e(today)}" onchange="StudentApp._tcOnChange()">
        </div>
      </div>` : isRefund ? `
      <div class="f-grp">
        <label class="f-lbl">마지막 출석일 <span style="font-size:10px;font-weight:400;color:var(--tx3)">(이 날까지 수업함)</span></label>
        <input class="f-inp" id="tc-date" type="date" value="${_e(today)}" onchange="StudentApp._tcOnChange()">
      </div>` : `
      <div class="f-grp">
        <label class="f-lbl">입학일</label>
        <input class="f-inp" id="tc-date" type="date" value="${_e(enrollDate)}" onchange="StudentApp._tcOnChange()">
      </div>`}

      <div id="tc-result"></div>
      ${isAbsence && prefill.studentId ? `<div id="tc-abs-history">${_tcAbsenceHistoryHTML(prefill.studentId)}</div>` : ''}
      <div class="sh-acts">
        <button class="btn-x" onclick="StudentApp.closeTuitionCalc()">닫기</button>
        ${prefill.studentId && !isAbsence ? `<button class="btn-ok" id="tc-apply-btn" style="display:none"
          onclick="StudentApp._tcApplyMemo('${prefill.studentId}')">📝 메모에 저장</button>` : ''}
      </div>
    `;
  }

  /** 탭 전환 (모드 재렌더) */
  function _tcSwitchMode(mode) {
    const prefill = _TC_PREFILL || {};
    const sh = document.getElementById('st-tc-sh');
    if (!sh) return;
    sh.innerHTML = _tcModalHTML(prefill, mode);
    _tcOnChange();
  }
  let _TC_PREFILL = null; // 현재 열린 계산기의 prefill 저장

  /** 🏖 결석 차감 결과 렌더 (월별 카드, 각 카드에 저장 버튼) */
  function _tcRenderAbsenceResult(cls, absCalc, studentId) {
    const el = document.getElementById('tc-result');
    if (!el) return;
    if (!cls) { el.innerHTML = ''; return; }
    if (!cls.tuition) {
      el.innerHTML = `<div class="tc-warn">⚠️ "${_e(cls.name)}" 반에 수업료가 설정되어 있지 않습니다.<br>관리 &gt; 반 관리 💸 버튼에서 월 수업료를 먼저 입력해주세요.</div>`;
      return;
    }
    if (!absCalc || !absCalc.months.length) { el.innerHTML = '<div class="tc-warn">⚠️ 결석 시작일이 종료일보다 늦습니다.</div>'; return; }

    _TC_ABS_CALC = absCalc; // 저장 버튼에서 참조

    el.innerHTML = absCalc.months.map((c, i) => {
      const dateList = c.absentDays.map(d => `${c.month}/${d}`).join(', ') || '없음';
      const noAbsence = c.absentCount === 0;
      return `<div class="tc-card" style="margin-bottom:8px">
        <div class="tc-row"><span>${c.year}년 ${c.month}월</span><b>${_e((cls.days||[]).join(', '))}요일 수업</b></div>
        <div class="tc-row"><span>월 수업료</span><b>${c.tuition.toLocaleString()}원</b></div>
        <div class="tc-row"><span>${c.month}월 전체 수업일</span><b>${c.totalCount}일</b></div>
        <div class="tc-row"><span>결석 수업일</span><b style="color:#e85d04">${c.absentCount}일</b></div>
        ${c.absentCount ? `<div class="tc-row tc-dates"><span>결석 일자</span><span class="tc-dates-val">${_e(dateList)}</span></div>` : ''}
        <div class="tc-row"><span>1회당 수업료</span><b>${Math.round(c.perDay).toLocaleString()}원</b></div>
        ${noAbsence
          ? `<div class="tc-warn" style="margin-top:8px">이 달에는 결석 기간과 겹치는 수업일이 없습니다.</div>`
          : `<div class="tc-row tc-refund"><span>정확한 차감액</span><b>${c.deductRaw.toLocaleString()}원</b></div>
             <div class="tc-row tc-sub"><span>1,000원 단위 차감 권장액</span><b>${c.deductExact.toLocaleString()}원</b></div>
             <div class="tc-row"><span>정확한 실 납부액</span><b style="color:var(--tx2)">${c.payAmountRaw.toLocaleString()}원</b></div>
             <div class="tc-row tc-total"><span>실 청구금액</span><b>${c.payAmount.toLocaleString()}원</b></div>`
        }
        ${studentId && !noAbsence ? `<button class="btn-ok" style="width:100%;margin-top:8px"
            onclick="StudentApp._tcSaveAbsence('${studentId}', ${i})">💾 ${c.year}-${String(c.month).padStart(2,'0')} 내역 DB 저장</button>` : ''}
      </div>`;
    }).join('');
  }
  let _TC_ABS_CALC = null; // 마지막 결석 계산 결과 (저장 버튼용)

  /** 계산 결과 렌더 — enrollCalc(입학) 또는 refundCalc(퇴원 환불) 중 하나만 전달 */
  function _tcRenderResult(cls, enrollCalc, refundCalc) {
    const el = document.getElementById('tc-result');
    if (!el) return;
    const applyBtn = document.getElementById('tc-apply-btn');
    if (!cls) { el.innerHTML = ''; if (applyBtn) applyBtn.style.display = 'none'; return; }

    if (!cls.tuition) {
      el.innerHTML = `<div class="tc-warn">⚠️ "${_e(cls.name)}" 반에 수업료가 설정되어 있지 않습니다.<br>관리 &gt; 반 관리 💸 버튼에서 월 수업료를 먼저 입력해주세요.</div>`;
      if (applyBtn) applyBtn.style.display = 'none';
      return;
    }

    // ── 환불 모드 ─────────────────────────────────────
    if (refundCalc) {
      const c = refundCalc;
      if (!c.totalCount) {
        el.innerHTML = `<div class="tc-warn">⚠️ ${c.year}년 ${c.month}월에 "${_e(cls.name)}" 반 수업일이 없습니다.</div>`;
        if (applyBtn) applyBtn.style.display = 'none';
        return;
      }
      const attendedList = c.attendedDays.map(d => `${c.month}/${d}`).join(', ') || '없음';
      const refundList   = c.refundDays.map(d => `${c.month}/${d}`).join(', ') || '없음';
      const noRefund = c.refundCount === 0;
      el.innerHTML = `
        <div class="tc-card">
          <div class="tc-row"><span>수업 요일</span><b>${_e((cls.days||[]).join(', '))}</b></div>
          <div class="tc-row"><span>월 수업료</span><b>${c.tuition.toLocaleString()}원</b></div>
          <div class="tc-row"><span>${c.year}년 ${c.month}월 전체 수업일</span><b>${c.totalCount}일</b></div>
          <div class="tc-row tc-attended"><span>마지막 출석일(${c.month}/${c.lastDay})까지 수업</span><b>${c.attendedCount}일</b></div>
          <div class="tc-row tc-dates tc-attended"><span>수업 완료 일자</span><span class="tc-dates-val">${_e(attendedList)}</span></div>
          <div class="tc-row"><span>환불 대상 수업일</span><b style="color:#e85d04">${c.refundCount}일</b></div>
          ${c.refundCount ? `<div class="tc-row tc-dates"><span>환불 일자</span><span class="tc-dates-val">${_e(refundList)}</span></div>` : ''}
          <div class="tc-row"><span>1회당 수업료</span><b>${Math.round(c.perDay).toLocaleString()}원</b></div>
          <div class="tc-row"><span>수업 완료분 금액</span><b style="color:var(--tx2)">${c.paidAmount.toLocaleString()}원</b></div>
          ${noRefund
            ? `<div class="tc-warn" style="margin-top:8px">이미 모든 수업을 완료하여 환불 대상 수업일이 없습니다.</div>`
            : `<div class="tc-row tc-refund"><span>환불금</span><b>${c.refundExact.toLocaleString()}원</b></div>
               <div class="tc-row tc-sub"><span>1,000원 단위 환불 권장액</span><b>${c.refundRounded.toLocaleString()}원</b></div>`
          }
        </div>`;
      if (applyBtn) applyBtn.style.display = noRefund ? 'none' : '';
      return;
    }

    // ── 입학 수업료 모드 ───────────────────────────────
    const c = enrollCalc;
    if (!c) { el.innerHTML = ''; if (applyBtn) applyBtn.style.display = 'none'; return; }
    if (!c.totalCount) {
      el.innerHTML = `<div class="tc-warn">⚠️ ${c.year}년 ${c.month}월에 "${_e(cls.name)}" 반 수업일이 없습니다.</div>`;
      if (applyBtn) applyBtn.style.display = 'none';
      return;
    }
    const dateList = c.remainDays.map(d => `${c.month}/${d}`).join(', ') || '없음';
    el.innerHTML = `
      <div class="tc-card">
        <div class="tc-row"><span>수업 요일</span><b>${_e((cls.days||[]).join(', '))}</b></div>
        <div class="tc-row"><span>월 수업료</span><b>${c.tuition.toLocaleString()}원</b></div>
        <div class="tc-row"><span>${c.year}년 ${c.month}월 전체 수업일</span><b>${c.totalCount}일</b></div>
        <div class="tc-row"><span>입학일 이후 남은 수업일</span><b style="color:var(--a)">${c.remainCount}일</b></div>
        <div class="tc-row tc-dates"><span>수업 예정일자</span><span class="tc-dates-val">${_e(dateList)}</span></div>
        <div class="tc-row"><span>1회당 수업료</span><b>${Math.round(c.perDay).toLocaleString()}원</b></div>
        <div class="tc-row tc-total"><span>계산된 수업료</span><b>${c.amountExact.toLocaleString()}원</b></div>
        <div class="tc-row tc-sub"><span>1,000원 단위 청구 권장액</span><b>${c.amountRounded.toLocaleString()}원</b></div>
      </div>`;
    if (applyBtn) applyBtn.style.display = '';
  }

  /** 마지막 출석일 기준 환불금 계산 */
  function _tcCalcRefund(cls, lastAttendDateStr) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(lastAttendDateStr || '');
    if (!cls || !m) return null;
    const year = +m[1], month = +m[2], lastDay = +m[3];
    const allDays      = _tcMeetDays(cls.days, year, month);
    const totalCount   = allDays.length;
    // 마지막 출석일까지 수업일 (이미 수업한 날)
    const attendedDays = allDays.filter(d => d <= lastDay);
    const attendedCount = attendedDays.length;
    // 환불 대상: 마지막 출석일 이후 수업일
    const refundDays   = allDays.filter(d => d > lastDay);
    const refundCount  = refundDays.length;
    const tuition   = Number(cls.tuition) || 0;
    const perDay    = totalCount ? tuition / totalCount : 0;
    const paidAmount     = Math.round(perDay * attendedCount); // 이미 수업한 금액
    const refundExact    = Math.round(perDay * refundCount);   // 환불액
    const refundRounded  = _money100(refundExact); // ★ 1,000원 단위 절삭(내림)
    return { year, month, lastDay, allDays, attendedDays, attendedCount,
             refundDays, refundCount, totalCount, tuition, perDay,
             paidAmount, refundExact, refundRounded };
  }

  /**
   * 🏖 결석 기간 수업료 차감 계산
   * 결석 시작일~종료일(포함) 사이에 반 수업요일과 겹치는 날짜 수만큼
   * 그 달 수업료에서 차감한다. 기간이 월 경계를 넘으면 달마다 나눠 계산한다.
   * @returns {{start, end, months:Array}} months[i] = 한 달치 계산 결과
   */
  function _tcCalcAbsence(cls, startStr, endStr) {
    const ms = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startStr || '');
    const me = /^(\d{4})-(\d{2})-(\d{2})$/.exec(endStr || '');
    if (!cls || !ms || !me) return null;
    const start = new Date(+ms[1], +ms[2] - 1, +ms[3]);
    const end   = new Date(+me[1], +me[2] - 1, +me[3]);
    if (end < start) return null;

    const tuition = Number(cls.tuition) || 0;
    const months = [];
    let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);
    let guard = 0;
    while (cursor <= endMonth && guard++ < 24) { // 안전장치: 최대 24개월
      const year = cursor.getFullYear(), month = cursor.getMonth() + 1;
      const allDays    = _tcMeetDays(cls.days, year, month);
      const totalCount = allDays.length;
      const perDay     = totalCount ? tuition / totalCount : 0;

      const lastDayOfMonth = new Date(year, month, 0).getDate();
      const rangeStartDay = (year === start.getFullYear() && month === start.getMonth() + 1) ? start.getDate() : 1;
      const rangeEndDay   = (year === end.getFullYear()   && month === end.getMonth() + 1)   ? end.getDate()   : lastDayOfMonth;

      const absentDays  = allDays.filter(d => d >= rangeStartDay && d <= rangeEndDay);
      const absentCount = absentDays.length;
      const deductRaw     = Math.round(perDay * absentCount);           // 정확한 계산 차감액
      const deductExact   = _money100(deductRaw);                       // ★ 1,000원 단위 절삭(내림) — 실 청구용
      const payAmountRaw  = Math.max(0, tuition - deductRaw);           // 정확한 계산 실 납부액
      const payAmount     = _money100(Math.max(0, tuition - deductExact)); // ★ 실 청구금액(절삭)

      months.push({
        year, month, monthKey: `${year}-${String(month).padStart(2,'0')}`,
        totalCount, allDays, absentDays, absentCount,
        tuition, perDay, deductRaw, deductExact, payAmountRaw, payAmount,
      });
      cursor = new Date(year, month, 1); // 다음 달 1일
    }
    return { start: startStr, end: endStr, months };
  }

  /** 학생의 저장된 결석 차감 내역(월별)을 카드 목록 HTML로 렌더 */
  function _tcAbsenceHistoryHTML(studentId) {
    const map = (typeof StudentDB !== 'undefined' && StudentDB.getTuitionAbsences)
      ? StudentDB.getTuitionAbsences(studentId) : {};
    const keys = Object.keys(map).sort().reverse();
    if (!keys.length) return '';
    const rows = keys.map(mk => {
      const r = map[mk];
      return `<div class="tc-hist-row">
        <div class="tc-hist-main">
          <b>${_e(mk)}</b> · 결석 ${r.absentCount ?? 0}일
          (${_e(r.absenceStart||'')} ~ ${_e(r.absenceEnd||'')})
        </div>
        <div class="tc-hist-sub">차감 ${Number(r.deductAmount||0).toLocaleString()}원 · 납부액 ${Number(r.payAmount||0).toLocaleString()}원</div>
        <button class="tc-hist-del" onclick="StudentApp._tcDeleteAbsence('${studentId}','${mk}')" title="삭제">🗑</button>
      </div>`;
    }).join('');
    return `<div class="tc-hist-wrap">
      <div class="tc-hist-title">📋 저장된 결석 차감 내역</div>
      ${rows}
    </div>`;
  }

  /** 반/날짜 입력 변경 시 재계산 */
  function _tcOnChange() {
    const clsName  = document.getElementById('tc-cls')?.value || '';
    // 현재 탭 모드 감지
    const activeTab = document.querySelector('.tc-tab.active');
    const isRefund  = activeTab && activeTab.textContent.includes('퇴원');
    const isAbsence = activeTab && activeTab.textContent.includes('결석');

    if (isAbsence) {
      const startVal = document.getElementById('tc-abs-start')?.value || '';
      const endVal   = document.getElementById('tc-abs-end')?.value || '';
      if (!clsName || !startVal || !endVal) { _tcRenderAbsenceResult(null, null, null); return; }
      const cls = _tcFindClass(clsName, startVal);
      const calc = cls ? _tcCalcAbsence(cls, startVal, endVal) : null;
      _tcRenderAbsenceResult(cls, calc, _TC_PREFILL?.studentId || null);
      return;
    }

    const dateVal  = document.getElementById('tc-date')?.value || '';
    if (!clsName || !dateVal) { _tcRenderResult(null, null, null); return; }
    const cls  = _tcFindClass(clsName, dateVal);
    if (isRefund) {
      const calc = cls ? _tcCalcRefund(cls, dateVal) : null;
      _tcRenderResult(cls, null, calc);
    } else {
      const calc = cls ? _tcCalc(cls, dateVal) : null;
      _tcRenderResult(cls, calc, null);
    }
  }

  /** 계산기 열기 (studentId 전달 시 해당 학생 정보로 미리 채움) */
  function openTuitionCalc(studentId = null, mode = 'enroll') {
    const s = studentId ? StudentDB.getAll().find(x => x.id === studentId) : null;
    _TC_PREFILL = {
      studentId:   s?.id   || null,
      studentName: s?.name || '',
      classCode:   s?.classCode || '',
      enrollDate:  (s?.enrollDate && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(s.enrollDate))
        ? s.enrollDate : new Date().toISOString().slice(0, 10),
    };
    const ov = document.getElementById('st-tc-ov');
    const sh = document.getElementById('st-tc-sh');
    if (!ov || !sh) return;
    sh.innerHTML = _tcModalHTML(_TC_PREFILL, mode);
    ov.classList.remove('hidden');
    history.pushState({ pg: 'students', modal: 'tuitioncalc' }, '');
    _tcOnChange();
  }

  function closeTuitionCalc() {
    document.getElementById('st-tc-ov')?.classList.add('hidden');
  }

  function _onTcOvClick(e) {
    if (e.target.id === 'st-tc-ov') closeTuitionCalc();
  }

  /** 계산 결과를 학생 메모에 추가 저장 (입학/환불 모드 모두 처리) */
  async function _tcApplyMemo(studentId) {
    const s = StudentDB.getAll().find(x => x.id === studentId);
    if (!s) return;
    const clsName = document.getElementById('tc-cls')?.value || '';
    const dateVal = document.getElementById('tc-date')?.value || '';
    const activeTab = document.querySelector('.tc-tab.active');
    const isRefund = activeTab && activeTab.textContent.includes('퇴원');
    const cls = clsName ? _tcFindClass(clsName, dateVal) : null;
    if (!cls || !cls.tuition) { _toast('⚠️ 저장할 계산 결과가 없습니다'); return; }

    let note;
    if (isRefund) {
      const calc = _tcCalcRefund(cls, dateVal);
      if (!calc || !calc.totalCount || !calc.refundCount) { _toast('⚠️ 환불 대상 수업일이 없습니다'); return; }
      note = `[환불] ${calc.year}-${String(calc.month).padStart(2,'0')} 마지막출석(${dateVal}) · ${cls.name}반 · 환불 ${calc.refundCount}일 · ${calc.refundExact.toLocaleString()}원(권장 ${calc.refundRounded.toLocaleString()}원)`;
    } else {
      const calc = _tcCalc(cls, dateVal);
      if (!calc || !calc.totalCount) { _toast('⚠️ 저장할 계산 결과가 없습니다'); return; }
      note = `[수업료] ${calc.year}-${String(calc.month).padStart(2,'0')} 입학(${dateVal}) · ${cls.name}반 · ${calc.remainCount}/${calc.totalCount}일 · ${calc.amountExact.toLocaleString()}원`;
    }
    const memo = s.memo ? `${s.memo}\n${note}` : note;
    const result = await StudentDB.updateStudent(studentId, { memo });
    _toast(result?.savedToServer ? '✅ 학생 메모에 저장되었습니다' : '⏳ 로컬에 저장됨 · 서버 전송 대기 중', result?.savedToServer ? 'success' : undefined);
    closeTuitionCalc();
    const detailOv = document.getElementById('st-detail-ov');
    if (detailOv && !detailOv.classList.contains('hidden')) {
      const updated = StudentDB.getAll().find(x => x.id === studentId);
      const sh = document.getElementById('st-detail-sh');
      if (updated && sh) sh.innerHTML = _detailHTML(updated);
    }
  }

  /** 🏖 결석 차감 계산 결과를 DB에 저장 (월별 카드의 저장 버튼에서 호출) */
  async function _tcSaveAbsence(studentId, monthIdx) {
    const c = _TC_ABS_CALC?.months?.[monthIdx];
    const clsName = document.getElementById('tc-cls')?.value || '';
    if (!c || !clsName) { _toast('⚠️ 저장할 계산 결과가 없습니다'); return; }

    const data = {
      classCode:    clsName,
      tuition:      c.tuition,
      totalCount:   c.totalCount,
      absentDays:   c.absentDays,
      absentCount:  c.absentCount,
      perDay:       Math.round(c.perDay),
      deductAmountExact: c.deductRaw,   // 정확한 계산 차감액(참고용)
      deductAmount: c.deductExact,      // 1,000원 단위 절삭 — 실제 청구 기준
      payAmountExact: c.payAmountRaw,   // 정확한 계산 실 납부액(참고용)
      payAmount:    c.payAmount,        // 1,000원 단위 절삭 — 실제 청구금액
      absenceStart: _TC_ABS_CALC.start,
      absenceEnd:   _TC_ABS_CALC.end,
    };
    const result = await StudentDB.saveTuitionAbsence(studentId, c.monthKey, data);
    _toast(result ? `✅ ${c.monthKey} 결석 차감 내역 저장됨` : '❌ 저장 실패', result ? 'success' : undefined);

    // 히스토리 영역 갱신
    const histEl = document.getElementById('tc-abs-history');
    if (histEl) histEl.innerHTML = _tcAbsenceHistoryHTML(studentId);
  }

  /** 🏖 저장된 결석 차감 내역 삭제 */
  async function _tcDeleteAbsence(studentId, monthKey) {
    if (!confirm(`${monthKey} 결석 차감 내역을 삭제할까요?`)) return;
    await StudentDB.deleteTuitionAbsence(studentId, monthKey);
    const histEl = document.getElementById('tc-abs-history');
    if (histEl) histEl.innerHTML = _tcAbsenceHistoryHTML(studentId);
    _toast('🗑 삭제되었습니다');
  }

  /* ════════════════════════════════════════════
   * 💳 기 납부 내역 (미리 입금·납부 완료된 기록)
   * ════════════════════════════════════════════ */

  /** 특정 학생·월의 "청구 참고금액" — 결석 차감 기록이 있으면 그 실 납부액,
   *  없으면 반의 정상 월 수업료. 납부액 입력 시 참고용으로만 프리필한다. */
  function _tpExpectedAmount(student, monthKey) {
    const abs = student.tuitionAbsences && student.tuitionAbsences[monthKey];
    if (abs) return Number(abs.payAmount || 0);
    return _tuitionNormalAmount(student);
  }

  /** 납부 기록 입력 모달 HTML */
  function _tpModalHTML(student, monthKey) {
    const expected = _tpExpectedAmount(student, monthKey);
    const existing = (student.tuitionPayments && student.tuitionPayments[monthKey]) || null;
    const today = new Date().toISOString().slice(0, 10);
    return `
      <div class="sh-handle"></div>
      <div class="sh-title">💳 납부 기록</div>
      <div class="sh-sub">${_e(student.name)} 학생 · 미리 입금·납부된 내역을 기록합니다.</div>

      <div class="f-grp">
        <label class="f-lbl">대상 월</label>
        <input class="f-inp" id="tp-month" type="month" value="${_e(monthKey)}" onchange="StudentApp._tpOnMonthChange('${student.id}')">
      </div>
      <div class="tc-warn" style="background:rgba(22,163,74,.08);border-color:rgba(22,163,74,.25);color:#15803d">
        📌 이 달 청구 참고금액: <b>${expected.toLocaleString()}원</b>
        ${student.tuitionAbsences && student.tuitionAbsences[monthKey] ? ' (결석 차감 반영됨)' : ' (정상 수업료)'}
      </div>
      <div class="f-grp">
        <label class="f-lbl">납부액</label>
        <input class="f-inp" id="tp-amount" type="number" step="100" value="${existing ? existing.amount : expected}">
      </div>
      <div class="f-grp">
        <label class="f-lbl">납부일</label>
        <input class="f-inp" id="tp-date" type="date" value="${existing ? existing.paidDate : today}">
      </div>
      <div class="f-grp">
        <label class="f-lbl">납부 방법</label>
        <select class="f-sel" id="tp-method">
          ${['계좌이체','현금','카드','기타'].map(m =>
            `<option value="${m}" ${existing?.method===m?'selected':''}>${m}</option>`).join('')}
        </select>
      </div>
      <div class="f-grp">
        <label class="f-lbl">메모 <span style="font-size:10px;font-weight:400;color:var(--tx3)">(선택)</span></label>
        <input class="f-inp" id="tp-note" type="text" value="${_e(existing?.note || '')}" placeholder="예: 3개월치 선입금 중 1회분">
      </div>

      <div id="tp-history">${_tpHistoryHTML(student.id)}</div>

      <div class="sh-acts">
        <button class="btn-x" onclick="StudentApp.closePaymentEntry()">닫기</button>
        <button class="btn-ok" onclick="StudentApp._tpSave('${student.id}')">💾 저장</button>
      </div>
    `;
  }

  /** 학생의 저장된 납부 내역(월별)을 카드 목록 HTML로 렌더 */
  function _tpHistoryHTML(studentId) {
    const map = (typeof StudentDB !== 'undefined' && StudentDB.getTuitionPayments)
      ? StudentDB.getTuitionPayments(studentId) : {};
    const keys = Object.keys(map).sort().reverse();
    if (!keys.length) return '';
    const rows = keys.map(mk => {
      const r = map[mk];
      return `<div class="tc-hist-row">
        <div class="tc-hist-main"><b>${_e(mk)}</b> · ${Number(r.amount||0).toLocaleString()}원 · ${_e(r.method||'')}</div>
        <div class="tc-hist-sub">${_e(r.paidDate||'')}${r.note ? ' · ' + _e(r.note) : ''}</div>
        <button class="tc-hist-del" onclick="StudentApp._tpDelete('${studentId}','${mk}')" title="삭제">🗑</button>
      </div>`;
    }).join('');
    return `<div class="tc-hist-wrap">
      <div class="tc-hist-title">📋 저장된 납부 내역</div>
      ${rows}
    </div>`;
  }

  /** 납부 기록 모달 열기 (studentId, 기본은 이번 달) */
  function openPaymentEntry(studentId, monthKey) {
    const s = StudentDB.getAll().find(x => x.id === studentId);
    if (!s) return;
    monthKey = monthKey || new Date().toISOString().slice(0, 7);
    document.getElementById('st-tp-modal')?.remove();

    const modal = document.createElement('div');
    modal.id = 'st-tp-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:600;display:flex;align-items:flex-end;justify-content:center';
    modal.onclick = e => { if (e.target === modal) modal.remove(); };

    const sheet = document.createElement('div');
    sheet.id = 'st-tp-sheet';
    sheet.style.cssText = 'background:var(--card);border-radius:20px 20px 0 0;padding:20px;width:100%;max-width:520px;max-height:88vh;overflow-y:auto;box-shadow:0 -4px 24px rgba(0,0,0,.18)';
    sheet.innerHTML = _tpModalHTML(s, monthKey);

    modal.appendChild(sheet);
    document.body.appendChild(modal);
  }

  function closePaymentEntry() {
    document.getElementById('st-tp-modal')?.remove();
  }

  /** 대상 월 변경 시 참고금액/기존기록 다시 반영 */
  function _tpOnMonthChange(studentId) {
    const s = StudentDB.getAll().find(x => x.id === studentId);
    const monthKey = document.getElementById('tp-month')?.value;
    if (!s || !monthKey) return;
    const sheet = document.getElementById('st-tp-sheet');
    if (sheet) sheet.innerHTML = _tpModalHTML(s, monthKey);
  }

  /** 납부 기록 저장 */
  async function _tpSave(studentId) {
    const monthKey = document.getElementById('tp-month')?.value;
    const amount   = Number(document.getElementById('tp-amount')?.value || 0);
    const paidDate = document.getElementById('tp-date')?.value || '';
    const method   = document.getElementById('tp-method')?.value || '';
    const note     = document.getElementById('tp-note')?.value || '';
    if (!monthKey || !paidDate) { _toast('⚠️ 대상 월과 납부일을 입력하세요'); return; }

    const result = await StudentDB.saveTuitionPayment(studentId, monthKey, { amount, paidDate, method, note });
    _toast(result ? `✅ ${monthKey} 납부 기록 저장됨` : '❌ 저장 실패', result ? 'success' : undefined);

    const histEl = document.getElementById('tp-history');
    if (histEl) histEl.innerHTML = _tpHistoryHTML(studentId);
  }

  /** 저장된 납부 기록 삭제 */
  async function _tpDelete(studentId, monthKey) {
    if (!confirm(`${monthKey} 납부 기록을 삭제할까요?`)) return;
    await StudentDB.deleteTuitionPayment(studentId, monthKey);
    const histEl = document.getElementById('tp-history');
    if (histEl) histEl.innerHTML = _tpHistoryHTML(studentId);
    _toast('🗑 삭제되었습니다');
  }

  /* ════════════════════════════════════════════
   * 유틸
   * ════════════════════════════════════════════ */

  /** 금액을 1,000원 단위로 절삭(내림) — 청구/차감 금액이 어중간한 숫자로 나오지 않도록.
   *  ※ 반올림이 아니라 절삭이라 학원 쪽이 손해 보는 방향으로만 떨어진다(안전한 기본값).
   *     반올림으로 바꾸려면 Math.floor를 Math.round로만 교체하면 된다. */
  function _money100(n) {
    return Math.floor(Number(n || 0) / 1000) * 1000;
  }

  /** HTML 이스케이프 */
  function _e(v) {
    return String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /** ★ 담당 반이 지정된 강사 계정이면 그 반 이름 배열을, 아니면 null(제한 없음)을 반환.
   *  운용자 계정은 담당 반 개념이 없으므로(교재·성적과 동일 정책) 메뉴가 허용됐다면 전체를 본다. */
  function _teacherClassNames() {
    if (typeof DB === 'undefined' || DB.getRole() !== 'teacher') return null;
    const tcIds = DB.getTeacherClasses ? DB.getTeacherClasses() : [];
    if (!tcIds.length) return []; // 담당 반 미지정 → 아무 것도 안 보임
    const allActive = DB.getActiveClasses ? DB.getActiveClasses() : [];
    return tcIds.map(id => (allActive.find(c => c.id === id) || {}).name).filter(Boolean);
  }

  /** 토스트 메시지 (기존 App 토스트 재사용) */
  function _toast(msg, type) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.className   = type === 'success' ? 'success' : '';
    el.classList.remove('hidden');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.add('hidden'), 3000);
  }

  /* ════════════════════════════════════════════
   * PUBLIC API
   * ════════════════════════════════════════════ */
  return {
    init, render,
    openImport, handleFile,
    openDetail, closeDetail,
    quickStatus, confirmDelete,
    openEditForm, saveEdit, _cancelEdit, _onEditStatusChange,
    _onSearch, _onFilter, _onDetailOvClick,
    openTuitionCalc, closeTuitionCalc, _onTcOvClick, _tcOnChange, _tcApplyMemo, _tcSwitchMode,
    _tcSaveAbsence, _tcDeleteAbsence, openTuitionOverview, _tuitionOvChangeMonth, _tuitionOvChangeYear,
    _tuitionOvSetClass, _tuitionOvSetCategory, _tuitionOvToggleUnpaid, _tuitionQuickMarkPaid,
    openPaymentEntry, closePaymentEntry, _tpOnMonthChange, _tpSave, _tpDelete,
    openReceiptImport,
  };
})();
