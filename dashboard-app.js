/**
 * dashboard-app.js — v1
 * ─────────────────────────────────────────────────────────────
 * 첫 화면(홈) 대시보드
 *
 * 구성:
 *  1. 오늘의 수업 — 오늘 요일 기준 반 목록을 수업 시간순으로 나열, 탭하면 진도 화면으로 이동
 *  2. 빠른 이동 — 진도/교재/성적/학생/직원 화면 바로가기 (권한에 맞는 항목만 표시)
 *  3. 공지 알림 — 도래한 알림 + 예정된(미확인) 알림 요약, 새 알림 등록 버튼
 *  4. 교재 학습 현황 — 반/교재별 미수행 학생과 미수행 챕터 개수 요약,
 *     탭하면 해당 반·교재의 학습 현황(매트릭스) 화면으로 바로 이동
 *
 * 독립 모듈: 다른 모듈(DB/BookLibDB/StudentDB/NoticeDB)이 이미 로드해둔 데이터를
 *            "조회"만 하고 직접 쓰지 않으므로, 오류가 나도 기존 기능에 영향 없음.
 */
const DashboardApp = (() => {
  const QUICK = [
    { pg: 'operate',  ico: '📅', lbl: '진도', color: '#4f46e5' },
    { pg: 'booklib',  ico: '📖', lbl: '교재', color: '#8b5cf6' },
    { pg: 'grade',    ico: '📝', lbl: '성적', color: '#0891b2' },
    { pg: 'students', ico: '👨‍🎓', lbl: '학생', color: '#22c55e' },
    { pg: 'staff',    ico: '👩‍💼', lbl: '직원', color: '#f59e0b' },
  ];
  const DAYS_KO = ['일', '월', '화', '수', '목', '금', '토'];

  function _esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function _q(id) { return document.getElementById(id); }
  function _isActive() { return !!_q('page-dashboard')?.classList.contains('on'); }

  /* ═══════════════════════════════════════════════════════════
   * 스타일 주입
   * ═══════════════════════════════════════════════════════════ */
  let _cssInjected = false;
  function _css() {
    if (_cssInjected) return; _cssInjected = true;
    const s = document.createElement('style');
    s.textContent = `
.db-body{flex:1;overflow-y:auto;padding:12px 14px 90px;display:flex;flex-direction:column;gap:14px}
.db-sec{background:var(--surf);border:1px solid var(--bdr);border-radius:16px;padding:14px}
.db-sec-hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;gap:8px}
.db-sec-title{font-size:13.5px;font-weight:800;color:var(--tx)}
.db-sec-acts{display:flex;gap:6px}
.db-mini-btn{padding:6px 11px;border-radius:10px;background:var(--a);color:#fff;border:none;font-size:11.5px;font-weight:700;cursor:pointer;white-space:nowrap}
.db-mini-btn.ghost{background:var(--card2);color:var(--tx2);border:1px solid var(--bdr2)}
.db-empty-mini{text-align:center;color:var(--tx3);font-size:12px;padding:16px 8px}

/* 오늘의 수업 */
.db-today-list{display:flex;flex-direction:column;gap:6px}
.db-today-row{display:flex;align-items:center;gap:10px;background:var(--card2);border:1px solid var(--bdr);border-radius:11px;padding:9px 11px;cursor:pointer;transition:all .15s}
.db-today-row:active{transform:scale(.98)}
.db-today-row.now{border-color:var(--a);background:var(--a10)}
.db-today-time{font-size:11.5px;font-weight:700;color:var(--a);background:var(--a10);border-radius:8px;padding:4px 8px;flex-shrink:0;white-space:nowrap}
.db-today-row.now .db-today-time{background:var(--a);color:#fff}
.db-today-name{flex:1;font-size:13px;font-weight:700;color:var(--tx);min-width:0}
.db-now-tag{font-size:9.5px;font-weight:800;color:#fff;background:#ef4444;border-radius:999px;padding:2px 7px;margin-left:5px;vertical-align:middle}
.db-today-arrow{color:var(--tx3);font-size:16px;flex-shrink:0}

/* 빠른 이동 */
.db-quick-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}
.db-quick-btn{display:flex;flex-direction:column;align-items:center;gap:5px;padding:12px 4px;border-radius:14px;border:1px solid var(--bdr);background:var(--surf);cursor:pointer;transition:all .15s}
.db-quick-btn:active{transform:scale(.94);background:var(--card2)}
.db-quick-ico{width:38px;height:38px;border-radius:12px;background:color-mix(in srgb, var(--qc) 15%, transparent);display:flex;align-items:center;justify-content:center;font-size:18px}
.db-quick-lbl{font-size:11px;font-weight:700;color:var(--tx2)}

/* 공지 알림 */
.db-notice-label{font-size:10.5px;font-weight:800;color:var(--tx3);letter-spacing:.5px;margin:8px 0 5px}
.db-notice-row{display:flex;align-items:center;gap:9px;padding:8px 4px;border-radius:10px;cursor:pointer;transition:background .15s}
.db-notice-row:hover,.db-notice-row:active{background:var(--card2)}
.db-notice-row.due{background:rgba(239,68,68,.07)}
.db-notice-ico{font-size:17px;flex-shrink:0}
.db-notice-body{flex:1;min-width:0}
.db-notice-title{font-size:12.5px;font-weight:700;color:var(--tx);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.db-notice-meta{font-size:10.5px;color:var(--tx3);margin-top:1px}
.db-notice-tag{font-size:9.5px;font-weight:800;color:#fff;background:#ef4444;border-radius:999px;padding:3px 8px;flex-shrink:0}

/* 교재 학습 현황 */
.db-book-row{background:var(--card2);border:1px solid var(--bdr);border-radius:12px;padding:10px 11px;margin-bottom:7px;cursor:pointer;transition:all .15s}
.db-book-row:last-child{margin-bottom:0}
.db-book-row:active{transform:scale(.98)}
.db-book-row-top{display:flex;align-items:center;gap:6px;margin-bottom:7px;flex-wrap:wrap}
.db-book-cls{font-size:11px;font-weight:800;color:var(--a);background:var(--a10);border-radius:7px;padding:2px 7px}
.db-book-name{font-size:12.5px;font-weight:700;color:var(--tx);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.db-book-total{font-size:11px;font-weight:800;color:#ef4444;white-space:nowrap}
.db-stu-list{display:flex;flex-wrap:wrap;gap:5px}
.db-stu-badge{display:inline-flex;align-items:center;gap:3px;background:var(--surf2);border:1px solid var(--bdr);border-radius:999px;padding:3px 8px;font-size:10.5px;font-weight:600;color:var(--tx2)}
.db-stu-badge b{color:#ef4444;font-weight:800}
.db-stu-badge.more{color:var(--tx3)}
.db-more-note{text-align:center;font-size:10.5px;color:var(--tx3);margin-top:8px}
    `;
    document.head.appendChild(s);
  }

  /* ═══════════════════════════════════════════════════════════
   * 초기화 — 관련 데이터 변경 시 대시보드가 열려있으면 자동 새로고침
   * ═══════════════════════════════════════════════════════════ */
  async function init() {
    _css();
    if (typeof DB !== 'undefined')       DB.on('classes', () => { if (_isActive()) render(); });
    if (typeof BookLibDB !== 'undefined') {
      BookLibDB.on('books',  () => { if (_isActive()) render(); });
      BookLibDB.on('checks', () => { if (_isActive()) render(); });
      BookLibDB.on('stamps', () => { if (_isActive()) render(); });
    }
    if (typeof StudentDB !== 'undefined') StudentDB.on('students', () => { if (_isActive()) render(); });
    if (typeof NoticeDB !== 'undefined')  NoticeDB.on('notices', () => { if (_isActive()) render(); });
  }

  /* ═══════════════════════════════════════════════════════════
   * 권한 헬퍼
   * ═══════════════════════════════════════════════════════════ */
  function _canSee(pg) {
    if (typeof DB === 'undefined') return false;
    const isAdmin = DB.isAdmin(), role = DB.getRole();
    if (pg === 'operate') return true;
    if (pg === 'students' || pg === 'staff') return isAdmin;
    if (pg === 'booklib' || pg === 'grade') {
      if (isAdmin) return true;
      if (role === 'teacher') return ((DB.getSession()?.allowedMenus) || []).includes(pg);
      return false;
    }
    return false;
  }
  function _visibleClasses() {
    if (typeof DB === 'undefined') return [];
    let classes = DB.getActiveClasses();
    if (DB.getRole() === 'teacher') {
      const tcIds = DB.getTeacherClasses ? DB.getTeacherClasses() : [];
      if (tcIds.length) {
        const tcNames = tcIds.map(id => classes.find(c => c.id === id)?.name || id);
        classes = classes.filter(c => tcIds.includes(c.id) || tcNames.includes(c.name));
      } else classes = [];
    }
    return classes;
  }

  /* ═══════════════════════════════════════════════════════════
   * 렌더
   * ═══════════════════════════════════════════════════════════ */
  function render() {
    const pg = _q('page-dashboard'); if (!pg) return;
    pg.innerHTML = _shell();
    if (typeof LOGO !== 'undefined') { const li = _q('db-logo'); if (li) li.src = LOGO.small; }
    if (typeof App !== 'undefined' && App._refreshAuthUI) { /* no-op: App이 자체적으로 호출함 */ }
    _refreshBadges();
  }
  function _refreshBadges() {
    if (typeof DB === 'undefined') return;
    const loggedIn = DB.isLoggedIn(), isAdmin = DB.isAdmin();
    _q('db-logout-btn')?.classList.toggle('hidden', !loggedIn);
    _q('db-admin-badge')?.classList.toggle('hidden', !isAdmin);
  }

  function _shell() {
    const today = new Date();
    const dateStr = `${today.getFullYear()}년 ${today.getMonth() + 1}월 ${today.getDate()}일 (${DAYS_KO[today.getDay()]})`;
    return `
      <div class="ph">
        <div class="phl">
          <div class="logo-badge" onclick="DashboardApp.render()" title="새로고침" style="cursor:pointer"><img id="db-logo" src="" alt=""></div>
          <div style="min-width:0">
            <div class="ph-title">${_esc(_greeting())} <span id="db-admin-badge" class="admin-badge hidden">🔑 관리자</span></div>
            <div class="ph-sub">${dateStr}</div>
          </div>
        </div>
        <div class="phr">
          <button id="db-logout-btn" class="ibtn red hidden" onclick="App.logout()" title="로그아웃">🚪</button>
        </div>
      </div>
      <div class="db-body">
        <div class="db-sec">
          <div class="db-sec-hdr"><div class="db-sec-title">📅 오늘의 수업</div></div>
          ${_todaySectionHtml()}
        </div>
        ${_quickNavHtml()}
        ${_noticeSectionHtml()}
        ${_bookStatusSectionHtml()}
      </div>`;
  }

  function _greeting() {
    const h = new Date().getHours();
    const name = (typeof DB !== 'undefined' && DB.getSession) ? (DB.getSession()?.username || '') : '';
    const time = h < 12 ? '좋은 아침이에요' : h < 18 ? '오늘도 힘내세요' : '수고 많으셨어요';
    return name ? `${time}, ${name}님` : time;
  }

  /* ═══════════════════════════════════════════════════════════
   * 1. 오늘의 수업
   * ═══════════════════════════════════════════════════════════ */
  function _timeToMin(t) { if (!t || !t.includes(':')) return null; const [h, m] = t.split(':').map(Number); return h * 60 + m; }
  function _fmtTime(dt) {
    if (!dt || (!dt.start && !dt.end)) return '';
    if (dt.start && dt.end) return `${dt.start}~${dt.end}`;
    return dt.start || dt.end || '';
  }
  function _todaySectionHtml() {
    const now = new Date();
    const todayDow = DAYS_KO[now.getDay()];
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const list = _visibleClasses()
      .filter(c => (c.days || []).includes(todayDow))
      .map(c => {
        const dt = c.dayTimes?.[todayDow] || null;
        return { cls: c, dt, startMin: dt?.start ? _timeToMin(dt.start) : null, endMin: dt?.end ? _timeToMin(dt.end) : null };
      })
      .sort((a, b) => {
        if (a.startMin === null && b.startMin === null) return a.cls.name.localeCompare(b.cls.name);
        if (a.startMin === null) return 1;
        if (b.startMin === null) return -1;
        return a.startMin - b.startMin;
      });
    if (!list.length) return '<div class="db-empty-mini">오늘은 예정된 수업이 없습니다 🎈</div>';
    return `<div class="db-today-list">${list.map(({ cls, dt, startMin, endMin }) => {
      const inSession = startMin !== null && endMin !== null && nowMin >= startMin && nowMin <= endMin;
      const timeTxt = dt ? _fmtTime(dt) : '시간 미정';
      return `<div class="db-today-row${inSession ? ' now' : ''}" onclick="App.goClass('${cls.id}')">
        <div class="db-today-time">${_esc(timeTxt)}</div>
        <div class="db-today-name">${_esc(cls.name)}반${inSession ? '<span class="db-now-tag">수업중</span>' : ''}</div>
        <div class="db-today-arrow">›</div>
      </div>`;
    }).join('')}</div>`;
  }

  /* ═══════════════════════════════════════════════════════════
   * 2. 빠른 이동
   * ═══════════════════════════════════════════════════════════ */
  function _quickNavHtml() {
    const items = QUICK.filter(q => _canSee(q.pg));
    if (!items.length) return '';
    return `<div class="db-sec">
      <div class="db-sec-hdr"><div class="db-sec-title">🚀 빠른 이동</div></div>
      <div class="db-quick-grid">${items.map(q => `
        <button class="db-quick-btn" style="--qc:${q.color}" onclick="App.go('${q.pg}')">
          <span class="db-quick-ico">${q.ico}</span><span class="db-quick-lbl">${q.lbl}</span>
        </button>`).join('')}</div>
    </div>`;
  }

  /* ═══════════════════════════════════════════════════════════
   * 3. 공지 알림
   * ═══════════════════════════════════════════════════════════ */
  function _noticeSectionHtml() {
    if (typeof NoticeApp === 'undefined' || typeof NoticeDB === 'undefined') return '';
    const isAdmin = typeof DB !== 'undefined' && DB.isAdmin();
    const due = NoticeApp.getDueList ? NoticeApp.getDueList() : [];
    const upcoming = NoticeApp.getUpcomingList ? NoticeApp.getUpcomingList(4) : [];
    return `<div class="db-sec">
      <div class="db-sec-hdr">
        <div class="db-sec-title">🔔 공지 알림</div>
        <div class="db-sec-acts">
          ${isAdmin ? '<button class="db-mini-btn" onclick="NoticeApp.openEditor()">➕ 등록</button>' : ''}
          <button class="db-mini-btn ghost" onclick="NoticeApp.openCenter()">전체보기</button>
        </div>
      </div>
      ${due.length ? `<div class="db-notice-label">🔴 확인이 필요해요</div>${due.map(n => _noticeRowHtml(n, true)).join('')}` : ''}
      <div class="db-notice-label">🕒 예정된 알림</div>
      ${upcoming.length ? upcoming.map(n => _noticeRowHtml(n, false)).join('') : '<div class="db-empty-mini">예정된 알림이 없습니다</div>'}
    </div>`;
  }
  function _noticeRowHtml(n, due) {
    const cat = NoticeApp.getCatMeta ? NoticeApp.getCatMeta(n.category) : { ico: '📢', label: '일반' };
    const schedTxt = n.scheduleType === 'monthly' ? `매월 ${n.monthDay}일 ${n.time}` : `${n.onceDate} ${n.time}`;
    return `<div class="db-notice-row${due ? ' due' : ''}" onclick="NoticeApp.openCenter()">
      <span class="db-notice-ico">${cat.ico}</span>
      <div class="db-notice-body">
        <div class="db-notice-title">${_esc(n.title)}</div>
        <div class="db-notice-meta">${cat.label} · ${_esc(schedTxt)}</div>
      </div>
      ${due ? '<span class="db-notice-tag">확인 필요</span>' : ''}
    </div>`;
  }

  /* ═══════════════════════════════════════════════════════════
   * 4. 교재 학습 현황 (반/교재별 미수행 요약)
   * ═══════════════════════════════════════════════════════════ */
  function _lastStamp(chs, stamps) {
    if (!stamps || !Object.keys(stamps).length) return null;
    let lo = -1, lchId = null;
    chs.forEach(ch => { if (stamps[ch.id] && ch.order > lo) { lo = ch.order; lchId = ch.id; } });
    return lchId ? { chId: lchId, order: lo } : null;
  }
  function _computeBookStatus() {
    if (typeof BookLibDB === 'undefined' || typeof StudentDB === 'undefined') return [];
    const out = [];
    _visibleClasses().forEach(cls => {
      const books = (BookLibDB.getBooksForClass(cls.id) || []).filter(b => !b.archived);
      books.forEach(book => {
        const chs = book.chapters || [];
        if (!chs.length) return;
        const students = StudentDB.getFiltered({ classCode: cls.name, status: '재원' });
        if (!students.length) return;
        const checks = BookLibDB.getMatrixChecks(cls.id, book.id) || {};
        const stamps = BookLibDB.getStamps(cls.id, book.id) || {};
        const lastStamp = _lastStamp(chs, stamps);
        const evalChs = lastStamp ? chs.filter(ch => ch.order <= lastStamp.order) : chs;
        let total = 0;
        const perStu = [];
        students.forEach(s => {
          let uc = 0;
          evalChs.forEach(ch => { if (checks[`${s.id}__${ch.id}`]) uc++; });
          if (uc > 0) perStu.push({ id: s.id, name: s.name, count: uc });
          total += uc;
        });
        if (total > 0) { perStu.sort((a, b) => b.count - a.count); out.push({ cls, book, total, perStu }); }
      });
    });
    out.sort((a, b) => b.total - a.total);
    return out;
  }
  function _bookStatusSectionHtml() {
    if (!_canSee('booklib')) return '';
    if (typeof BookLibDB === 'undefined' || typeof StudentDB === 'undefined') return '';
    const rows = _computeBookStatus();
    if (!rows.length) {
      return `<div class="db-sec">
        <div class="db-sec-hdr"><div class="db-sec-title">📊 교재 학습 현황</div>
          <button class="db-mini-btn ghost" onclick="App.go('booklib')">전체보기</button></div>
        <div class="db-empty-mini">🎉 미수행 항목이 없습니다</div>
      </div>`;
    }
    const top = rows.slice(0, 8);
    return `<div class="db-sec">
      <div class="db-sec-hdr"><div class="db-sec-title">📊 교재 학습 현황</div>
        <button class="db-mini-btn ghost" onclick="App.go('booklib')">전체보기</button></div>
      ${top.map(r => _bookRowHtml(r)).join('')}
      ${rows.length > top.length ? `<div class="db-more-note">외 ${rows.length - top.length}건 더 있어요 · 교재 탭에서 전체 확인</div>` : ''}
    </div>`;
  }
  function _bookRowHtml(r) {
    const stuHtml = r.perStu.slice(0, 6).map(s => `<span class="db-stu-badge">${_esc(s.name)}<b>${s.count}</b></span>`).join('');
    const moreStu = r.perStu.length > 6 ? `<span class="db-stu-badge more">+${r.perStu.length - 6}명</span>` : '';
    return `<div class="db-book-row" onclick="DashboardApp.goMatrix('${r.cls.id}','${r.book.id}')">
      <div class="db-book-row-top">
        <span class="db-book-cls">${_esc(r.cls.name)}반</span>
        <span class="db-book-name">${_esc(r.book.name)}</span>
        <span class="db-book-total">미수행 ${r.total}건</span>
      </div>
      <div class="db-stu-list">${stuHtml}${moreStu}</div>
    </div>`;
  }

  /* ═══════════════════════════════════════════════════════════
   * 이동 액션
   * ═══════════════════════════════════════════════════════════ */
  function goMatrix(clsId, bkId) {
    if (typeof BooklibApp !== 'undefined' && BooklibApp.goToMatrix) BooklibApp.goToMatrix(clsId, bkId);
  }

  return { init, render, goMatrix, _refreshBadges };
})();
