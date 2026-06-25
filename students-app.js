/**
 * students-app.js — v1.0
 *
 * ★ 학생 관리 UI 모듈 (admin 전용)
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
    const classes = StudentDB.getClasses();
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
    const s = StudentDB.getStats();

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

    const all  = StudentDB.getAll();
    const list = StudentDB.getFiltered(_state);

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
      _toast(
        `✅ 완료: 신규 ${result.added}명 · 업데이트 ${result.updated}명` +
        (result.skipped ? ` · 건너뜀 ${result.skipped}건` : ''),
        'success'
      );
      render(); // 전체 리렌더

    } catch (e) {
      console.error('[StudentApp] import error', e);
      _toast('❌ 가져오기 실패: ' + e.message);
    } finally {
      overlay.remove();
    }
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

    await StudentDB.updateStudent(id, data);

    const updated = StudentDB.getAll().find(x => x.id === id);
    const sh = document.getElementById('st-detail-sh');
    if (updated && sh) sh.innerHTML = _detailHTML(updated);

    _renderContent();
    _toast(`✅ ${name} 정보가 수정되었습니다`, 'success');
  }

  /* ──── 빠른 재원 상태 변경 ──── */
  async function quickStatus(id, status) {
    if (!confirm(`'${status}'(으)로 상태를 변경하시겠습니까?`)) return;

    await StudentDB.updateStudent(id, { status });

    // 상세 모달 내용만 갱신 (모달 닫지 않음)
    const s  = StudentDB.getAll().find(x => x.id === id);
    const sh = document.getElementById('st-detail-sh');
    if (s && sh) sh.innerHTML = _detailHTML(s);

    _renderContent();
    _toast(`✅ ${s?.name || ''} → ${status}`, 'success');
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
    const amountRounded = Math.round(amountExact / 100) * 100;
    return { year, month, day, allDays, remainDays, totalCount, remainCount, tuition, perDay, amountExact, amountRounded };
  }

  /** 반 선택 옵션 (현재 운용 중인 반 이름 목록) */
  function _tcClassOptions() {
    if (typeof DB === 'undefined') return [];
    return [...new Set(DB.getActiveClasses().map(c => c.name))].filter(Boolean).sort();
  }

  /** 계산기 모달 내부 HTML — mode: 'enroll'(입학) | 'refund'(퇴원 환불) */
  function _tcModalHTML(prefill, mode='enroll') {
    const names = _tcClassOptions();
    const today = new Date().toISOString().slice(0, 10);
    const selClass   = prefill.classCode || '';
    const enrollDate = prefill.enrollDate || today;
    const isRefund = mode === 'refund';
    return `
      <div class="sh-handle"></div>
      <div class="sh-title">💰 수업료 계산기</div>
      <div class="sh-sub">${prefill.studentName ? _e(prefill.studentName) + ' 학생 · ' : ''}반 수업일 기준으로 수업료를 계산합니다.</div>

      <div class="tc-tabs">
        <button class="tc-tab ${!isRefund?'active':''}"
          onclick="StudentApp._tcSwitchMode('enroll')">📥 입학 수업료</button>
        <button class="tc-tab ${isRefund?'active':''}"
          onclick="StudentApp._tcSwitchMode('refund')">💸 퇴원 환불금</button>
      </div>

      <div class="f-grp">
        <label class="f-lbl">반 선택</label>
        <select class="f-sel" id="tc-cls" onchange="StudentApp._tcOnChange()">
          <option value="">반을 선택하세요</option>
          ${names.map(n => `<option value="${_e(n)}" ${n === selClass ? 'selected' : ''}>${_e(n)}</option>`).join('')}
        </select>
        ${!names.length ? '<div class="tc-warn">⚠️ 운용 중인 반이 없습니다. 관리 &gt; 반 관리에서 반을 먼저 등록해주세요.</div>' : ''}
      </div>

      ${isRefund ? `
      <div class="f-grp">
        <label class="f-lbl">마지막 출석일 <span style="font-size:10px;font-weight:400;color:var(--tx3)">(이 날까지 수업함)</span></label>
        <input class="f-inp" id="tc-date" type="date" value="${_e(today)}" onchange="StudentApp._tcOnChange()">
      </div>` : `
      <div class="f-grp">
        <label class="f-lbl">입학일</label>
        <input class="f-inp" id="tc-date" type="date" value="${_e(enrollDate)}" onchange="StudentApp._tcOnChange()">
      </div>`}

      <div id="tc-result"></div>
      <div class="sh-acts">
        <button class="btn-x" onclick="StudentApp.closeTuitionCalc()">닫기</button>
        ${prefill.studentId ? `<button class="btn-ok" id="tc-apply-btn" style="display:none"
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
               <div class="tc-row tc-sub"><span>100원 단위 환불 권장액</span><b>${c.refundRounded.toLocaleString()}원</b></div>`
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
        <div class="tc-row tc-sub"><span>100원 단위 청구 권장액</span><b>${c.amountRounded.toLocaleString()}원</b></div>
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
    const refundRounded  = Math.round(refundExact / 100) * 100;
    return { year, month, lastDay, allDays, attendedDays, attendedCount,
             refundDays, refundCount, totalCount, tuition, perDay,
             paidAmount, refundExact, refundRounded };
  }

  /** 반/날짜 입력 변경 시 재계산 */
  function _tcOnChange() {
    const clsName  = document.getElementById('tc-cls')?.value || '';
    const dateVal  = document.getElementById('tc-date')?.value || '';
    if (!clsName || !dateVal) { _tcRenderResult(null, null, null); return; }
    // 현재 탭 모드 감지
    const activeTab = document.querySelector('.tc-tab.active');
    const isRefund = activeTab && activeTab.textContent.includes('퇴원');
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
    await StudentDB.updateStudent(studentId, { memo });
    _toast('✅ 학생 메모에 저장되었습니다', 'success');
    closeTuitionCalc();
    const detailOv = document.getElementById('st-detail-ov');
    if (detailOv && !detailOv.classList.contains('hidden')) {
      const updated = StudentDB.getAll().find(x => x.id === studentId);
      const sh = document.getElementById('st-detail-sh');
      if (updated && sh) sh.innerHTML = _detailHTML(updated);
    }
  }

  /* ════════════════════════════════════════════
   * 유틸
   * ════════════════════════════════════════════ */

  /** HTML 이스케이프 */
  function _e(v) {
    return String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
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
  };
})();
