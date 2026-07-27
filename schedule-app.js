/**
 * schedule-app.js — v5
 * ─────────────────────────────────────────────────────────────
 * 학원 "일정표" UI 모듈
 *
 * - v3: 점(dot) 대신 구글/네이버 캘린더처럼 기간이 있는 일정(방학 등)은 그 기간만큼
 *   "글자가 보이는 색띠"로 이어서 표시. 하루에 너무 많이 겹치면 "+N"으로 요약.
 * - v4: 직원 실제 근무 기록(누가/몇시~몇시/시급 반영 금액)도 근무일에 색띠로 표시.
 *   팝업 대신 인라인 패널로 일자 상세를 보여주기 시작.
 * - ★ v5: 레이아웃 재배치
 *   1) "오늘의 수업"은 캘린더 전체 폭 아래로 이동 (더 이상 우측 컬럼을 공유하지 않음)
 *   2) 캘린더 우측은 "선택한 날짜 상세" 전용 — 기본값은 항상 "오늘"이라 클릭 없이도
 *      바로 오늘 일정이 보이고, 다른 날짜를 탭하면 그 날짜로 교체, 다시 탭하면 오늘로 복귀
 *   3) 일자 상세 안에서 "➕ 등록" 버튼으로 근무 기록을 바로 빠르게 등록 가능
 *      (직원 선택 + 구분 + 시작/종료 시간 → 시급 자동 반영해서 저장.
 *       휴게시간·수동시급·메모 등 세밀한 조정은 근무 기록을 탭해 직원 관리
 *       화면의 급여 계산 탭으로 이동해서 처리)
 *   4) 일정 등록(➕ 이 날짜에 일정 등록)은 기존과 동일하게 유지
 *
 * 독립 모듈: ScheduleDB(별도 Firebase 경로)만 직접 사용하고, StaffDB/NoticeDB/DB는
 *            조회 + (근무 등록 시에만) StaffDB.addWorkEntry 호출 정도만 사용하므로
 *            오류가 나도 기존 기능에 영향 없음.
 */
const ScheduleApp = (() => {
  const CATS = {
    'general':         { ico: '📌', label: '일반',     color: '#6366f1' },
    'vacation-summer': { ico: '☀️', label: '여름방학', color: '#f59e0b' },
    'vacation-winter': { ico: '❄️', label: '겨울방학', color: '#0ea5e9' },
    'holiday':         { ico: '🎌', label: '공휴일',   color: '#ef4444' },
  };
  const PAY_COLOR = '#22c55e', NOTICE_COLOR = '#a855f7', WORK_COLOR = '#0891b2';
  const DAYS_KO = ['일', '월', '화', '수', '목', '금', '토'];

  let _mountId = null;
  let _st = { year: 0, month: 0 }; // 캘린더에 표시 중인 연/월 (month: 1~12)
  let _selDate = null; // ★ 우측 패널에 상세를 보여주고 있는 선택된 날짜 (기본값=오늘)
  let _workAddFor = null; // ★ 근무 등록 폼이 열려있는 날짜 (해당 날짜의 상세 패널 안에 인라인으로 표시)
  let _editId = null;
  let _timer = null;

  function _esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function _q(id) { return document.getElementById(id); }
  function _pad(n) { return String(n).padStart(2, '0'); }
  function _todayStr() { const d = new Date(); return `${d.getFullYear()}-${_pad(d.getMonth() + 1)}-${_pad(d.getDate())}`; }
  function _isAdmin() { return typeof DB !== 'undefined' && DB.isAdmin(); }

  /* ═══════════════════════════════════════════════════════════
   * 스타일
   * ═══════════════════════════════════════════════════════════ */
  let _cssInjected = false;
  function _css() {
    if (_cssInjected) return; _cssInjected = true;
    const s = document.createElement('style');
    s.textContent = `
.sch-cal-hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
.sch-cal-title{font-size:13.5px;font-weight:800;color:var(--tx)}
.sch-cal-navs{display:flex;align-items:center;gap:4px}
.sch-nav-btn{width:26px;height:26px;border-radius:8px;background:var(--card2);border:1px solid var(--bdr);display:flex;align-items:center;justify-content:center;font-size:13px;cursor:pointer;color:var(--tx2)}
.sch-today-btn{padding:5px 9px;border-radius:8px;background:var(--card2);border:1px solid var(--bdr);font-size:10.5px;font-weight:700;color:var(--tx2);cursor:pointer}
.sch-widget-layout{display:flex;flex-wrap:wrap;gap:18px}
.sch-cal-col{flex:1 1 250px;min-width:230px}
.sch-tdc-col{flex:1.15 1 220px;min-width:210px;border-left:1px solid var(--bdr);padding-left:16px;display:flex;flex-direction:column}
.sch-selday-hint{text-align:center;color:var(--tx3);font-size:11.5px;line-height:1.6;padding:22px 8px;background:var(--card2);border-radius:12px}
.sch-selday-hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
.sch-selday-title{font-size:12px;font-weight:800;color:var(--tx)}
.sch-selday-close{padding:4px 9px;border-radius:7px;background:var(--a10);border:1px solid var(--a40);color:var(--a);font-size:10.5px;font-weight:700;cursor:pointer;flex-shrink:0}
.sch-detail-sec-title-row{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px}
.sch-mini-add-btn{padding:4px 9px;border-radius:7px;background:var(--card2);border:1px solid var(--bdr2);color:var(--tx2);font-size:10px;font-weight:700;cursor:pointer}
.sch-workadd-box{background:var(--surf2);border:1px dashed var(--bdr2);border-radius:11px;padding:10px;margin-top:2px}
.sch-today-divider{border-top:1px solid var(--bdr);margin:16px 0 14px}
.sch-today-section{width:100%}
.sch-detail-sec{margin-bottom:14px}
.sch-detail-sec:last-child{margin-bottom:0}
.sch-detail-sec-title{font-size:11px;font-weight:800;color:var(--tx3);letter-spacing:.4px;margin-bottom:6px}
.sch-dow-row{display:grid;grid-template-columns:repeat(7,1fr);margin-bottom:2px}
.sch-dow{text-align:center;font-size:10px;font-weight:800;color:var(--tx3);padding:2px 0 6px}
.sch-dow.sun{color:#ef4444}.sch-dow.sat{color:#3b82f6}
.sch-week-block{border-bottom:1px solid var(--bdr);padding:3px 0 5px}
.sch-week-block:last-of-type{border-bottom:none}
.sch-daynum-row{display:grid;grid-template-columns:repeat(7,1fr)}
.sch-daynum-cell{text-align:center;font-size:11px;font-weight:800;color:var(--tx2);cursor:pointer;padding:2px 0;border-radius:7px}
.sch-daynum-cell.other{opacity:.32}
.sch-daynum-cell.sun{color:#ef4444}
.sch-daynum-cell.sat{color:#3b82f6}
.sch-daynum-cell.today{background:var(--a);color:#fff;box-shadow:0 0 0 2px var(--a10)}
.sch-daynum-cell.selected{box-shadow:0 0 0 2px var(--a);font-weight:900}
.sch-track-row{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;margin-top:2px}
.sch-bar{grid-row:1;height:15px;line-height:15px;font-size:8.5px;font-weight:700;color:#fff;padding:0 4px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;cursor:pointer;text-shadow:0 1px 1.5px rgba(0,0,0,.35)}
.sch-overflow-row{margin-top:1px}
.sch-overflow-cell{text-align:center;font-size:8px;font-weight:800;color:var(--tx3);cursor:pointer}
.sch-legend{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px;padding-top:10px;border-top:1px dashed var(--bdr)}
.sch-legend-item{display:flex;align-items:center;gap:4px;font-size:9.5px;font-weight:600;color:var(--tx3);background:var(--card2);border-radius:999px;padding:3px 8px 3px 6px}
.sch-legend-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0}

/* 오늘의 수업 (캘린더 우측 패널) */
.sch-tdc-hdr{margin-bottom:9px}
.sch-tdc-title{font-size:12px;font-weight:800;color:var(--tx);display:block}
.sch-tdc-date{font-size:10px;color:var(--tx3)}
.sch-tdc-list{display:flex;flex-direction:column;gap:6px}
.sch-tdc-row{border-radius:10px;padding:8px 9px;background:var(--card2);border:1px solid var(--bdr);cursor:pointer;transition:all .15s}
.sch-tdc-row:active{transform:scale(.96)}
.sch-tdc-row.now{border-color:var(--a);background:var(--a10)}
.sch-tdc-time{font-size:10px;font-weight:800;color:var(--a);margin-bottom:2px}
.sch-tdc-name{font-size:12px;font-weight:700;color:var(--tx)}
.sch-tdc-now-tag{font-size:9px;font-weight:800;color:#fff;background:#ef4444;border-radius:999px;padding:2px 6px;margin-left:5px;vertical-align:middle}
.sch-empty-mini{text-align:center;color:var(--tx3);font-size:11.5px;padding:20px 6px;line-height:1.5}

/* 일자 상세 (우측 패널 인라인) */
.sch-item-row{display:flex;align-items:flex-start;gap:9px;background:var(--card2);border:1px solid var(--bdr);border-radius:11px;padding:10px;margin-bottom:6px}
.sch-item-row.sch-item-clickable{cursor:pointer;transition:all .15s}
.sch-item-row.sch-item-clickable:active{transform:scale(.98);background:var(--surf2)}
.sch-item-ico{font-size:16px;flex-shrink:0}
.sch-item-body{flex:1;min-width:0}
.sch-item-title{font-size:12.5px;font-weight:700;color:var(--tx)}
.sch-item-meta{font-size:10.5px;color:var(--tx3);margin-top:1px}
.sch-item-memo{font-size:11.5px;color:var(--tx2);margin-top:4px;white-space:pre-line}
.sch-item-acts{display:flex;gap:5px;flex-shrink:0}
.sch-item-ibtn{width:26px;height:26px;border-radius:8px;background:var(--surf2);border:1px solid var(--bdr);display:flex;align-items:center;justify-content:center;font-size:12px;cursor:pointer}
.sch-badge{font-size:9.5px;font-weight:800;border-radius:999px;padding:2px 7px;flex-shrink:0}
.sch-badge.ok{background:rgba(34,197,94,.14);color:#16a34a}
.sch-badge.warn{background:rgba(239,68,68,.12);color:#ef4444}
.sch-badge.info{background:var(--a10);color:var(--a)}

/* 팝업 (알림 있는 일정) */
.sch-pop-ov{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:3000;display:flex;align-items:center;justify-content:center;padding:20px}
.sch-pop-box{background:var(--card,#fff);border-radius:18px;padding:24px;max-width:400px;width:100%;box-shadow:0 12px 40px rgba(0,0,0,.35);animation:schPop .25s cubic-bezier(.34,1.56,.64,1)}
@keyframes schPop{from{transform:scale(.9);opacity:0}to{transform:scale(1);opacity:1}}
.sch-pop-ico{font-size:34px;margin-bottom:10px}
.sch-pop-title{font-size:17px;font-weight:800;color:var(--tx);margin-bottom:6px}
.sch-pop-msg{font-size:13.5px;color:var(--tx2);line-height:1.6;white-space:pre-line;margin-bottom:18px}
.sch-pop-acts{display:flex;gap:8px}
    `;
    document.head.appendChild(s);
  }

  /* ═══════════════════════════════════════════════════════════
   * 초기화
   * ═══════════════════════════════════════════════════════════ */
  async function init() {
    _css();
    if (typeof ScheduleDB === 'undefined') return;
    const now = new Date();
    _st.year = now.getFullYear(); _st.month = now.getMonth() + 1;
    await ScheduleDB.init();
    ScheduleDB.on('schedules', () => refresh());
    if (typeof StaffDB !== 'undefined') { StaffDB.on('staff', () => refresh()); StaffDB.on('pay', () => refresh()); }
    if (typeof NoticeDB !== 'undefined') NoticeDB.on('notices', () => refresh());
    _checkPopup();
    clearInterval(_timer);
    _timer = setInterval(_checkPopup, 30000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') _checkPopup(); });
  }

  function refresh() {
    if (_mountId && _q(_mountId)) renderMiniCalendar(_mountId);
  }

  /* ═══════════════════════════════════════════════════════════
   * 이 날짜의 일정/급여/공지 데이터 조합
   * ═══════════════════════════════════════════════════════════ */
  function _schedulesOn(dateStr) {
    if (typeof ScheduleDB === 'undefined') return [];
    return ScheduleDB.getAll().filter(s => s.startDate <= dateStr && (s.endDate || s.startDate) >= dateStr);
  }
  function _buildPaydayMap(year, month) {
    const map = {};
    if (typeof StaffDB === 'undefined') return map;
    const dim = new Date(year, month, 0).getDate();
    (StaffDB.getActive ? StaffDB.getActive() : []).forEach(s => {
      const pd = Number(s.payDay || 0);
      const day = pd > 0 ? Math.min(pd, dim) : dim;
      const dateStr = `${year}-${_pad(month)}-${_pad(day)}`;
      (map[dateStr] = map[dateStr] || []).push(s);
    });
    return map;
  }
  function _buildNoticeMap(year, month) {
    const map = {};
    if (typeof NoticeDB === 'undefined') return map;
    const dim = new Date(year, month, 0).getDate();
    NoticeDB.getAll().forEach(n => {
      if (!n.active) return;
      let dateStr;
      if (n.scheduleType === 'monthly') {
        const day = Math.min(+n.monthDay || 1, dim);
        dateStr = `${year}-${_pad(month)}-${_pad(day)}`;
      } else {
        if (!n.onceDate) return;
        const [y, m] = n.onceDate.split('-').map(Number);
        if (y !== year || m !== month) return;
        dateStr = n.onceDate;
      }
      (map[dateStr] = map[dateStr] || []).push(n);
    });
    return map;
  }

  /* ═══════════════════════════════════════════════════════════
   * 월간 캘린더 — 구글/네이버 캘린더처럼 기간 일정을 "글자가 보이는 막대"로 표시
   *   (점으로 뭉뚱그리지 않고, 방학처럼 여러 날짜에 걸친 일정은 그 기간만큼
   *    색띠 + 텍스트로 이어져 보이도록 렌더링. 급여일/공지도 동일하게 텍스트로 표시)
   * ═══════════════════════════════════════════════════════════ */
  const MAX_TRACKS = 2; // 하루에 동시에 보여줄 막대 줄 수(그 이상은 "+N"으로 요약, 탭하면 상세)

  function _dateDiffDays(a, b) { // b - a (일 단위), 'YYYY-MM-DD'
    return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
  }
  function _uniqueYM(days) {
    const seen = {}; const out = [];
    days.forEach(d => { const k = `${d.cellYear}-${d.cellMonth}`; if (!seen[k]) { seen[k] = 1; out.push({ y: d.cellYear, m: d.cellMonth }); } });
    return out;
  }
  function _mergedPaydayMap(days) {
    const map = {};
    _uniqueYM(days).forEach(({ y, m }) => { const pm = _buildPaydayMap(y, m); Object.keys(pm).forEach(k => { map[k] = (map[k] || []).concat(pm[k]); }); });
    return map;
  }
  function _mergedNoticeMap(days) {
    const map = {};
    _uniqueYM(days).forEach(({ y, m }) => { const nm = _buildNoticeMap(y, m); Object.keys(nm).forEach(k => { map[k] = (map[k] || []).concat(nm[k]); }); });
    return map;
  }
  // 근무 기록: 누가(직원) 언제(날짜) 몇시~몇시 근무했고, 시급을 반영하면 얼마인지
  function _dayWorkInfo(sid, dateStr) {
    if (typeof StaffDB === 'undefined') return { entries: [], amount: 0 };
    const entries = StaffDB.getWorkDay ? StaffDB.getWorkDay(sid, dateStr) : [];
    const y = +dateStr.slice(0, 4);
    let amount = 0;
    entries.forEach(e => {
      const rate = StaffDB.resolveRate ? StaffDB.resolveRate(sid, e.rate || 0, y, e.type) : 0;
      const hrs = Number(e.baseHours || e.hours || 0) + Number(e.nightHours || 0);
      amount += Math.round(hrs * rate);
    });
    return { entries, amount };
  }
  function _mergedWorkMap(days) {
    const map = {};
    if (typeof StaffDB === 'undefined') return map;
    const gridStart = days[0].dateStr, gridEnd = days[days.length - 1].dateStr;
    (StaffDB.getActive ? StaffDB.getActive() : []).forEach(s => {
      const range = StaffDB.getWorkRange ? StaffDB.getWorkRange(s.id, gridStart, gridEnd) : {};
      Object.keys(range).forEach(dateStr => {
        if (!range[dateStr] || !range[dateStr].length) return;
        (map[dateStr] = map[dateStr] || []).push(s);
      });
    });
    return map;
  }
  // 표시 중인 달력 범위(선행/후행 여백일 포함) 안의 모든 이벤트를 "막대"로 통일해서 수집
  function _buildBarEvents(days) {
    const events = [];
    if (typeof ScheduleDB !== 'undefined') {
      const gridStart = days[0].dateStr, gridEnd = days[days.length - 1].dateStr;
      ScheduleDB.getAll().forEach(s => {
        const end = s.endDate || s.startDate;
        if (!s.startDate || end < gridStart || s.startDate > gridEnd) return;
        const cat = CATS[s.category] || CATS.general;
        events.push({ title: `${cat.ico} ${s.title}`, color: cat.color, startDate: s.startDate, endDate: end, onclick: `ScheduleApp.openDayDetail('${s.startDate}')` });
      });
    }
    const payMap = _mergedPaydayMap(days);
    Object.keys(payMap).forEach(dateStr => {
      const list = payMap[dateStr];
      const label = list.length > 1 ? `💰 급여일 ${list.length}명` : `💰 ${list[0].name} 급여일`;
      events.push({ title: label, color: PAY_COLOR, startDate: dateStr, endDate: dateStr, onclick: `ScheduleApp.openDayDetail('${dateStr}')` });
    });
    const noticeMap = _mergedNoticeMap(days);
    Object.keys(noticeMap).forEach(dateStr => {
      const list = noticeMap[dateStr];
      const label = list.length > 1 ? `🔔 공지 ${list.length}건` : `🔔 ${list[0].title}`;
      events.push({ title: label, color: NOTICE_COLOR, startDate: dateStr, endDate: dateStr, onclick: `ScheduleApp.openDayDetail('${dateStr}')` });
    });
    const workMap = _mergedWorkMap(days);
    Object.keys(workMap).forEach(dateStr => {
      const staffList = workMap[dateStr];
      let label;
      if (staffList.length === 1) {
        const info = _dayWorkInfo(staffList[0].id, dateStr);
        const first = info.entries[0];
        label = info.entries.length === 1 && first?.start && first?.end
          ? `👤 ${staffList[0].name} ${first.start}~${first.end}`
          : `👤 ${staffList[0].name} (${info.entries.length}건)`;
      } else {
        label = `👤 근무 ${staffList.length}명`;
      }
      events.push({ title: label, color: WORK_COLOR, startDate: dateStr, endDate: dateStr, onclick: `ScheduleApp.openDayDetail('${dateStr}')` });
    });
    return events;
  }
  // 한 주(7일)에 걸쳐 막대를 겹치지 않게 트랙(줄)에 배치 — 넘치면 해당 날짜에 "+N"으로 요약
  function _layoutWeek(week, events) {
    const wkStart = week[0].dateStr, wkEnd = week[6].dateStr;
    const weekEvents = events
      .filter(e => e.endDate >= wkStart && e.startDate <= wkEnd)
      .map(e => {
        const segStartIdx = Math.min(6, Math.max(0, _dateDiffDays(wkStart, e.startDate)));
        const segEndIdx = Math.min(6, Math.max(0, _dateDiffDays(wkStart, e.endDate)));
        return { ev: e, segStartIdx, segEndIdx, isTrueStart: e.startDate >= wkStart, isTrueEnd: e.endDate <= wkEnd };
      })
      .sort((a, b) => a.segStartIdx - b.segStartIdx || (b.segEndIdx - b.segStartIdx) - (a.segEndIdx - a.segStartIdx));
    const trackEndIdx = [];
    const tracks = [];
    const overflowByDay = [0, 0, 0, 0, 0, 0, 0];
    weekEvents.forEach(seg => {
      let track = trackEndIdx.findIndex(endIdx => endIdx < seg.segStartIdx);
      if (track === -1) {
        if (trackEndIdx.length < MAX_TRACKS) { track = trackEndIdx.length; trackEndIdx.push(-1); tracks.push([]); }
        else { for (let d = seg.segStartIdx; d <= seg.segEndIdx; d++) overflowByDay[d]++; return; }
      }
      trackEndIdx[track] = seg.segEndIdx;
      tracks[track].push(seg);
    });
    return { tracks, overflowByDay };
  }

  function renderMiniCalendar(containerId) {
    if (typeof ScheduleDB === 'undefined') return;
    _mountId = containerId;
    const el = _q(containerId);
    if (!el) return;
    const { year, month } = _st;
    const todayStr = _todayStr();
    const first = new Date(year, month - 1, 1);
    const startOffset = first.getDay();
    const dim = new Date(year, month, 0).getDate();
    const totalCells = Math.ceil((startOffset + dim) / 7) * 7;
    const prevDim = new Date(year, month - 1, 0).getDate();

    const days = [];
    for (let i = 0; i < totalCells; i++) {
      const dayNum = i - startOffset + 1;
      let cellYear = year, cellMonth = month, cellDay, other = false;
      if (dayNum < 1) { cellMonth = month - 1; if (cellMonth < 1) { cellMonth = 12; cellYear--; } cellDay = prevDim + dayNum; other = true; }
      else if (dayNum > dim) { cellDay = dayNum - dim; cellMonth = month + 1; if (cellMonth > 12) { cellMonth = 1; cellYear++; } other = true; }
      else cellDay = dayNum;
      days.push({ dateStr: `${cellYear}-${_pad(cellMonth)}-${_pad(cellDay)}`, cellDay, cellYear, cellMonth, other, dow: i % 7 });
    }

    const events = _buildBarEvents(days);
    const weeks = [];
    for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

    const weeksHtml = weeks.map(week => {
      const { tracks, overflowByDay } = _layoutWeek(week, events);
      const daynumHtml = week.map(d => `
        <div class="sch-daynum-cell${d.other ? ' other' : ''}${d.dateStr === todayStr ? ' today' : ''}${d.dateStr === _selDate ? ' selected' : ''}${d.dow === 0 ? ' sun' : ''}${d.dow === 6 ? ' sat' : ''}"
          onclick="ScheduleApp.openDayDetail('${d.dateStr}')">${d.cellDay}</div>`).join('');
      const trackRowsHtml = tracks.map(track => {
        const barsHtml = track.map(seg => {
          const span = seg.segEndIdx - seg.segStartIdx + 1;
          const rl = seg.isTrueStart ? '6px' : '0', rr = seg.isTrueEnd ? '6px' : '0';
          const showLabel = seg.isTrueStart || seg.segStartIdx === 0;
          const dim2 = week[seg.segStartIdx].other ? ';opacity:.55' : '';
          return `<div class="sch-bar" style="grid-column:${seg.segStartIdx + 1} / span ${span};background:${seg.ev.color};border-radius:${rl} ${rr} ${rr} ${rl}${dim2}"
            onclick="${seg.ev.onclick}" title="${_esc(seg.ev.title)}">${showLabel ? _esc(seg.ev.title) : ''}</div>`;
        }).join('');
        return `<div class="sch-track-row">${barsHtml}</div>`;
      }).join('');
      const hasOverflow = overflowByDay.some(n => n > 0);
      const overflowHtml = hasOverflow
        ? `<div class="sch-track-row sch-overflow-row">${week.map((d, i) => overflowByDay[i] > 0
            ? `<div class="sch-overflow-cell" onclick="ScheduleApp.openDayDetail('${d.dateStr}')">+${overflowByDay[i]}</div>`
            : `<div></div>`).join('')}</div>`
        : '';
      return `<div class="sch-week-block">
        <div class="sch-daynum-row">${daynumHtml}</div>
        ${trackRowsHtml}
        ${overflowHtml}
      </div>`;
    }).join('');
    const dowHtml = DAYS_KO.map((d, i) => `<div class="sch-dow${i === 0 ? ' sun' : ''}${i === 6 ? ' sat' : ''}">${d}</div>`).join('');

    el.innerHTML = `
      <div class="sch-cal-hdr">
        <div class="sch-cal-title">${year}년 ${month}월</div>
        <div class="sch-cal-navs">
          <button class="sch-today-btn" onclick="ScheduleApp._goToday()">오늘</button>
          <button class="sch-nav-btn" onclick="ScheduleApp._navMonth(-1)">‹</button>
          <button class="sch-nav-btn" onclick="ScheduleApp._navMonth(1)">›</button>
        </div>
      </div>
      <div class="sch-widget-layout">
        <div class="sch-cal-col">
          <div class="sch-dow-row">${dowHtml}</div>
          ${weeksHtml}
          <div class="sch-legend">
            ${Object.values(CATS).map(c => `<span class="sch-legend-item"><span class="sch-legend-dot" style="background:${c.color}"></span>${c.ico} ${c.label}</span>`).join('')}
            <span class="sch-legend-item"><span class="sch-legend-dot" style="background:${PAY_COLOR}"></span>💰 급여일</span>
            <span class="sch-legend-item"><span class="sch-legend-dot" style="background:${WORK_COLOR}"></span>👤 근무기록</span>
            <span class="sch-legend-item"><span class="sch-legend-dot" style="background:${NOTICE_COLOR}"></span>🔔 공지</span>
          </div>
        </div>
        <div class="sch-tdc-col">
          <div id="sch-selday-panel">${_selDayPanelHtml(_selDate || todayStr)}</div>
        </div>
      </div>
      <div class="sch-today-divider"></div>
      <div class="sch-today-section">${_todayClassesHtml()}</div>`;

    // ★ 근무 빠른 등록 폼의 분류(일반/수업) 토글 버튼 바인딩 (innerHTML로 삽입되므로 렌더 후 별도 연결 필요)
    const waType = _q('sch-wa-type');
    if (waType) waType.querySelectorAll('.ntc-pill').forEach(b => b.onclick = () => {
      waType.querySelectorAll('.ntc-pill').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
    });
  }

  /* ═══════════════════════════════════════════════════════════
   * 오늘의 수업 (캘린더 우측 패널 — 항상 "오늘" 기준, 달력 이동과 무관)
   * ═══════════════════════════════════════════════════════════ */
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
  function _timeToMin(t) { if (!t || !t.includes(':')) return null; const [h, m] = t.split(':').map(Number); return h * 60 + m; }
  function _fmtTime(dt) {
    if (!dt || (!dt.start && !dt.end)) return '';
    if (dt.start && dt.end) return `${dt.start}~${dt.end}`;
    return dt.start || dt.end || '';
  }
  function _todayClassesHtml() {
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
    const dateLabel = `${now.getMonth() + 1}월 ${now.getDate()}일 (${todayDow})`;
    let html = `<div class="sch-tdc-hdr"><span class="sch-tdc-title">📅 오늘의 수업</span><span class="sch-tdc-date">${dateLabel}</span></div>`;
    if (!list.length) { html += `<div class="sch-empty-mini">오늘은 예정된 수업이 없어요 🎈</div>`; return html; }
    html += `<div class="sch-tdc-list">${list.map(({ cls, dt, startMin, endMin }) => {
      const inSession = startMin !== null && endMin !== null && nowMin >= startMin && nowMin <= endMin;
      const timeTxt = dt ? _fmtTime(dt) : '시간 미정';
      return `<div class="sch-tdc-row${inSession ? ' now' : ''}" onclick="App.goClass('${cls.id}')">
        <div class="sch-tdc-time">${_esc(timeTxt)}</div>
        <div class="sch-tdc-name">${_esc(cls.name)}반${inSession ? '<span class="sch-tdc-now-tag">수업중</span>' : ''}</div>
      </div>`;
    }).join('')}</div>`;
    return html;
  }

  function _navMonth(diff) {
    let m = _st.month + diff, y = _st.year;
    if (m < 1) { m = 12; y--; } else if (m > 12) { m = 1; y++; }
    _st.year = y; _st.month = m;
    if (_mountId) renderMiniCalendar(_mountId);
  }
  function _goToday() {
    const now = new Date();
    _st.year = now.getFullYear(); _st.month = now.getMonth() + 1;
    if (_mountId) renderMiniCalendar(_mountId);
  }

  /* ═══════════════════════════════════════════════════════════
   * 일자 상세 — 캘린더 우측에 항상 표시 (기본값: 오늘). 팝업 없음.
   * ═══════════════════════════════════════════════════════════ */
  function openDayDetail(dateStr) {
    const active = _selDate || _todayStr();
    _selDate = (active === dateStr) ? null : dateStr; // 이미 보고 있는 날짜를 다시 탭하면 "오늘"로 복귀
    _workAddFor = null; // 다른 날짜로 이동하면 열려있던 등록 폼은 닫음
    refresh();
  }
  function closeDayDetail() { _selDate = null; _workAddFor = null; refresh(); }

  function _selDayPanelHtml(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    const dateLabel = `${d.getMonth() + 1}월 ${d.getDate()}일 (${DAYS_KO[d.getDay()]})`;
    const isAdmin = _isAdmin();
    const scheds = _schedulesOn(dateStr);
    const [y, m] = dateStr.split('-').map(Number);
    const paydays = (_buildPaydayMap(y, m)[dateStr]) || [];
    const workStaff = (typeof StaffDB === 'undefined') ? [] :
      (StaffDB.getActive ? StaffDB.getActive() : []).filter(s => (StaffDB.getWorkDay ? StaffDB.getWorkDay(s.id, dateStr) : []).length > 0);
    const notices = (_buildNoticeMap(y, m)[dateStr]) || [];
    const dueIds = (typeof NoticeApp !== 'undefined' && NoticeApp.getDueList) ? NoticeApp.getDueList().map(n => n.id) : [];

    let html = `<div class="sch-selday-hdr">
      <span class="sch-selday-title">🗓️ ${dateLabel}</span>
      ${dateStr !== _todayStr() ? `<button class="sch-selday-close" onclick="ScheduleApp.closeDayDetail()" title="오늘로 돌아가기">오늘로</button>` : ''}
    </div>`;

    html += `<div class="sch-detail-sec"><div class="sch-detail-sec-title">📌 이 날의 일정</div>`;
    html += scheds.length ? scheds.map(s => {
      const cat = CATS[s.category] || CATS.general;
      const range = s.startDate !== s.endDate ? `${s.startDate} ~ ${s.endDate}` : s.startDate;
      return `<div class="sch-item-row">
        <span class="sch-item-ico">${cat.ico}</span>
        <div class="sch-item-body">
          <div class="sch-item-title">${_esc(s.title)}</div>
          <div class="sch-item-meta">${cat.label} · ${range}${s.notifyEnabled ? ` · 🔔 ${s.notifyTime}` : ''}</div>
          ${s.memo ? `<div class="sch-item-memo">${_esc(s.memo)}</div>` : ''}
        </div>
        ${isAdmin ? `<div class="sch-item-acts">
          <button class="sch-item-ibtn" title="수정" onclick="ScheduleApp.openEditor('${s.id}')">✏️</button>
          <button class="sch-item-ibtn" title="삭제" onclick="ScheduleApp.deleteItem('${s.id}')">🗑</button>
        </div>` : ''}
      </div>`;
    }).join('') : '<div class="sch-empty-mini">등록된 일정이 없습니다</div>';
    html += `</div>`;

    html += `<div class="sch-detail-sec">
      <div class="sch-detail-sec-title-row">
        <div class="sch-detail-sec-title">👤 근무 기록</div>
        ${isAdmin ? `<button class="sch-mini-add-btn" onclick="ScheduleApp.${_workAddFor === dateStr ? 'closeWorkQuickAdd' : `openWorkQuickAdd('${dateStr}')`}">${_workAddFor === dateStr ? '✕ 취소' : '➕ 등록'}</button>` : ''}
      </div>`;
    html += workStaff.length ? workStaff.map(s => {
      const info = _dayWorkInfo(s.id, dateStr);
      const won = info.amount.toLocaleString('ko-KR');
      const timeTxt = info.entries.map(e => `${e.start || '?'}~${e.end || '?'}`).join(', ');
      const canNav = typeof StaffApp !== 'undefined' && StaffApp.goToSalary;
      return `<div class="sch-item-row${canNav ? ' sch-item-clickable' : ''}"${canNav ? ` onclick="StaffApp.goToSalary('${s.id}',${y},${m})"` : ''}>
        <span class="sch-item-ico">👤</span>
        <div class="sch-item-body">
          <div class="sch-item-title">${_esc(s.name)}</div>
          <div class="sch-item-meta">${_esc(timeTxt)} · 시급 반영 ₩${won}</div>
        </div>
      </div>`;
    }).join('') : '<div class="sch-empty-mini">근무 기록이 없습니다</div>';
    if (_workAddFor === dateStr) html += _workQuickAddFormHtml();
    html += `</div>`;

    if (paydays.length) {
      html += `<div class="sch-detail-sec"><div class="sch-detail-sec-title">💰 직원 급여일</div>`;
      html += paydays.map(s => {
        const now = new Date();
        const saved = (typeof StaffDB !== 'undefined') ? StaffDB.getSavedPay(s.id, now.getFullYear(), now.getMonth() + 1) : null;
        const pay = saved ? saved.totalPay : ((typeof StaffDB !== 'undefined' && StaffDB.calcPay(s.id, y, m)?.totalPay) || 0);
        const won = (pay || 0).toLocaleString('ko-KR');
        const canNav = typeof StaffApp !== 'undefined' && StaffApp.goToSalary;
        return `<div class="sch-item-row${canNav ? ' sch-item-clickable' : ''}"${canNav ? ` onclick="StaffApp.goToSalary('${s.id}',${y},${m})"` : ''}>
          <span class="sch-item-ico">💰</span>
          <div class="sch-item-body">
            <div class="sch-item-title">${_esc(s.name)}</div>
            <div class="sch-item-meta">예상 지급액 ₩${won}</div>
          </div>
          <span class="sch-badge ${saved ? 'ok' : 'warn'}">${saved ? '확정' : '미확정'}</span>
        </div>`;
      }).join('');
      html += `</div>`;
    }

    if (notices.length) {
      html += `<div class="sch-detail-sec"><div class="sch-detail-sec-title">🔔 공지 알림</div>`;
      html += notices.map(n => {
        const cat = (typeof NoticeApp !== 'undefined' && NoticeApp.getCatMeta) ? NoticeApp.getCatMeta(n.category) : { ico: '📢' };
        const isDue = dueIds.includes(n.id);
        return `<div class="sch-item-row">
          <span class="sch-item-ico">${cat.ico}</span>
          <div class="sch-item-body">
            <div class="sch-item-title">${_esc(n.title)}</div>
            ${n.body ? `<div class="sch-item-memo">${_esc(n.body)}</div>` : ''}
          </div>
          <div class="sch-item-acts">
            ${isDue && isAdmin ? `<button class="sch-item-ibtn" title="완료 처리" onclick="NoticeApp.completeNow('${n.id}');ScheduleApp.refresh()">✅</button>` : (isDue ? `<span class="sch-badge info">확인 필요</span>` : '')}
            ${isAdmin ? `<button class="sch-item-ibtn" title="수정" onclick="NoticeApp.openEditor('${n.id}')">✏️</button>
            <button class="sch-item-ibtn" title="삭제" onclick="NoticeApp.deleteNotice('${n.id}');ScheduleApp.refresh()">🗑</button>` : ''}
          </div>
        </div>`;
      }).join('');
      html += `</div>`;
    }

    if (isAdmin) {
      html += `<button class="btn-ok" style="width:100%;margin-top:4px" onclick="ScheduleApp.openEditor(null,'${dateStr}')">➕ 이 날짜에 일정 등록</button>`;
    }
    return html;
  }

  /* ═══════════════════════════════════════════════════════════
   * 근무 빠른 등록 (일자 상세 패널 내 인라인 폼)
   *   — 세밀한 조정(휴게시간·수동시급·메모 등)이 필요하면 행을 탭해
   *     직원 관리 화면의 근무 등록 화면에서 처리하면 됨
   * ═══════════════════════════════════════════════════════════ */
  function _workQuickAddFormHtml() {
    const staffList = typeof StaffDB !== 'undefined' ? (StaffDB.getActive ? StaffDB.getActive() : []) : [];
    return `<div class="sch-workadd-box">
      <select class="f-inp" id="sch-wa-staff" style="margin-bottom:7px">
        <option value="">— 직원 선택 —</option>
        ${staffList.map(s => `<option value="${s.id}">${_esc(s.name)}</option>`).join('')}
      </select>
      <div class="ntc-pill-row" id="sch-wa-type" style="margin-bottom:7px">
        <button type="button" class="ntc-pill on" data-v="general">일반</button>
        <button type="button" class="ntc-pill" data-v="class">수업</button>
      </div>
      <div style="display:flex;gap:6px;margin-bottom:9px">
        <input class="f-inp" id="sch-wa-start" type="time" style="flex:1">
        <input class="f-inp" id="sch-wa-end" type="time" style="flex:1">
      </div>
      <button class="btn-ok" style="width:100%" onclick="ScheduleApp.saveWorkQuickAdd('${_workAddFor}')">💾 근무 기록 저장</button>
    </div>`;
  }
  function openWorkQuickAdd(dateStr) { _workAddFor = dateStr; refresh(); }
  function closeWorkQuickAdd() { _workAddFor = null; refresh(); }
  async function saveWorkQuickAdd(dateStr) {
    if (typeof StaffDB === 'undefined') return;
    const sid = _q('sch-wa-staff')?.value;
    if (!sid) { alert('직원을 선택해주세요'); return; }
    const type = document.querySelector('#sch-wa-type .ntc-pill.on')?.dataset.v || 'general';
    const start = _q('sch-wa-start')?.value, end = _q('sch-wa-end')?.value;
    if (!start || !end) { alert('시작/종료 시간을 입력해주세요'); return; }
    const y = +dateStr.slice(0, 4);
    const split = StaffDB.splitNightHours ? StaffDB.splitNightHours(start, end, 0) : { baseHours: 0, nightHours: 0 };
    const hours = split.baseHours + split.nightHours;
    if (hours <= 0) { alert('근무 시간을 확인해주세요 (종료 시간이 시작 시간보다 늦어야 합니다)'); return; }
    const rate = StaffDB.resolveRate ? StaffDB.resolveRate(sid, 0, y, type) : 0;
    await StaffDB.addWorkEntry(sid, dateStr, {
      type, start, end, hours, baseHours: split.baseHours, nightHours: split.nightHours,
      breakMin: 0, appliedRate: rate, note: '',
    });
    _workAddFor = null;
    refresh();
    if (typeof App !== 'undefined' && App._toast) App._toast('✅ 근무 기록이 등록되었습니다', 'success');
  }

  /* ═══════════════════════════════════════════════════════════
   * 등록 / 수정 폼
   * ═══════════════════════════════════════════════════════════ */
  function openEditor(id = null, prefillDate = null) {
    _editId = id;
    const s = id ? ScheduleDB.getById(id) : null;
    _q('sch-editor-ov')?.remove();
    const ov = document.createElement('div');
    ov.id = 'sch-editor-ov'; ov.className = 'ov';
    ov.style.zIndex = 900;
    ov.onclick = e => { if (e.target === ov) closeEditor(); };
    const cat = s?.category || 'general';
    const notify = s ? !!s.notifyEnabled : false;
    const startDate = s?.startDate || prefillDate || _todayStr();
    const endDate = s?.endDate || startDate;
    ov.innerHTML = `
      <div class="sh" style="max-height:92vh;overflow-y:auto">
        <div class="sh-handle"></div>
        <div class="sh-title">${s ? '✏️ 일정 수정' : '➕ 새 일정 등록'}</div>
        <div class="f-grp">
          <label class="f-lbl">제목</label>
          <input class="f-inp" id="sch-f-title" maxlength="40" placeholder="예: 여름방학 시작" value="${_esc(s?.title || '')}">
        </div>
        <div class="f-grp">
          <label class="f-lbl">메모 (선택)</label>
          <textarea class="f-inp" id="sch-f-memo" rows="2" style="resize:vertical">${_esc(s?.memo || '')}</textarea>
        </div>
        <div class="f-grp">
          <label class="f-lbl">분류</label>
          <div class="ntc-pill-row" id="sch-f-cat">
            ${Object.entries(CATS).map(([k, v]) => `<button type="button" class="ntc-pill${k === cat ? ' on' : ''}" data-v="${k}">${v.ico} ${v.label}</button>`).join('')}
          </div>
        </div>
        <div class="f-grp" style="display:flex;gap:10px">
          <div style="flex:1"><label class="f-lbl">시작일</label><input class="f-inp" id="sch-f-start" type="date" value="${startDate}"></div>
          <div style="flex:1"><label class="f-lbl">종료일</label><input class="f-inp" id="sch-f-end" type="date" value="${endDate}"></div>
        </div>
        <div class="f-grp" style="display:flex;align-items:center;gap:8px">
          <label class="day-ck" style="display:flex;align-items:center;gap:6px;cursor:pointer">
            <input type="checkbox" id="sch-f-notify" ${notify ? 'checked' : ''} onchange="document.getElementById('sch-f-notify-wrap').style.display=this.checked?'flex':'none'">
            <span>🔔 알림 사용 (끄면 조용히 캘린더에만 표시됩니다)</span>
          </label>
        </div>
        <div class="f-grp" id="sch-f-notify-wrap" style="display:${notify ? 'flex' : 'none'};gap:10px">
          <div style="width:110px"><label class="f-lbl">알림 시간</label><input class="f-inp" id="sch-f-time" type="time" value="${s?.notifyTime || '09:00'}"></div>
          <div style="flex:1">
            <label class="f-lbl">알림 대상</label>
            <div class="ntc-pill-row" id="sch-f-aud">
              <button type="button" class="ntc-pill${(s?.audience || 'all') === 'admin' ? ' on' : ''}" data-v="admin">🔑 원장만</button>
              <button type="button" class="ntc-pill${(s?.audience || 'all') === 'all' ? ' on' : ''}" data-v="all">👥 전체</button>
            </div>
          </div>
        </div>
        <div class="sh-acts">
          <button class="btn-x" onclick="ScheduleApp.closeEditor()">취소</button>
          <button class="btn-ok" onclick="ScheduleApp.saveEditor()">저장</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    ov.querySelectorAll('#sch-f-cat .ntc-pill').forEach(b => b.onclick = () => {
      ov.querySelectorAll('#sch-f-cat .ntc-pill').forEach(x => x.classList.remove('on')); b.classList.add('on');
    });
    ov.querySelectorAll('#sch-f-aud .ntc-pill').forEach(b => b.onclick = () => {
      ov.querySelectorAll('#sch-f-aud .ntc-pill').forEach(x => x.classList.remove('on')); b.classList.add('on');
    });
    setTimeout(() => _q('sch-f-title')?.focus(), 150);
  }
  function closeEditor() { _q('sch-editor-ov')?.remove(); _editId = null; }

  async function saveEditor() {
    const title = _q('sch-f-title')?.value.trim();
    if (!title) { alert('제목을 입력해주세요'); return; }
    const cat = document.querySelector('#sch-f-cat .ntc-pill.on')?.dataset.v || 'general';
    const startDate = _q('sch-f-start')?.value || _todayStr();
    let endDate = _q('sch-f-end')?.value || startDate;
    if (endDate < startDate) endDate = startDate;
    const notifyEnabled = _q('sch-f-notify')?.checked || false;
    const notifyTime = _q('sch-f-time')?.value || '09:00';
    const audience = document.querySelector('#sch-f-aud .ntc-pill.on')?.dataset.v || 'all';
    const memo = _q('sch-f-memo')?.value.trim() || '';
    const data = { title, memo, category: cat, startDate, endDate, notifyEnabled, notifyTime, audience };
    if (_editId) await ScheduleDB.update(_editId, data);
    else await ScheduleDB.add(data);
    closeEditor();
    refresh();
    if (typeof App !== 'undefined' && App._toast) App._toast('✅ 일정이 저장되었습니다', 'success');
  }

  async function deleteItem(id) {
    const s = ScheduleDB.getById(id); if (!s) return;
    if (!confirm(`"${s.title}" 일정을 삭제할까요?`)) return;
    await ScheduleDB.remove(id);
    refresh();
  }

  /* ═══════════════════════════════════════════════════════════
   * 알림 팝업 (notifyEnabled 켠 일정만)
   * ═══════════════════════════════════════════════════════════ */
  function _checkPopup() {
    if (typeof ScheduleDB === 'undefined') return;
    if (typeof DB === 'undefined' || !DB.isLoggedIn()) return;
    if (_q('ntc-pop-ov') || _q('sch-pop-ov') || _q('sch-editor-ov')) return; // 다른 팝업과 겹치지 않게 양보
    const todayStr = _todayStr();
    const isAdmin = _isAdmin();
    const now = new Date();
    const due = ScheduleDB.getAll().filter(s => {
      if (!s.notifyEnabled || s.notifiedAt) return false;
      if (s.audience === 'admin' && !isAdmin) return false;
      if (s.startDate > todayStr) return false;
      if (s.startDate === todayStr) {
        const [hh, mm] = (s.notifyTime || '09:00').split(':').map(Number);
        const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh || 9, mm || 0);
        if (now < target) return false;
      }
      return true;
    });
    const target = due.find(s => !sessionStorage.getItem(`sch_dismiss_${s.id}`));
    if (target) _showPopup(target);
  }
  function _showPopup(s) {
    _q('sch-pop-ov')?.remove();
    const cat = CATS[s.category] || CATS.general;
    const ov = document.createElement('div');
    ov.id = 'sch-pop-ov'; ov.className = 'sch-pop-ov';
    ov.innerHTML = `
      <div class="sch-pop-box">
        <div class="sch-pop-ico">${cat.ico}</div>
        <div class="sch-pop-title">${_esc(s.title)}</div>
        ${s.memo ? `<div class="sch-pop-msg">${_esc(s.memo)}</div>` : '<div style="height:12px"></div>'}
        <div class="sch-pop-acts">
          <button class="btn-x" id="sch-pop-later">⏰ 나중에</button>
          <button class="btn-ok" id="sch-pop-ok">✅ 확인</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    const _close = () => { ov.remove(); setTimeout(_checkPopup, 300); };
    _q('sch-pop-later').onclick = () => { sessionStorage.setItem(`sch_dismiss_${s.id}`, '1'); _close(); };
    _q('sch-pop-ok').onclick = async () => { await ScheduleDB.update(s.id, { notifiedAt: new Date().toISOString() }); _close(); };
  }

  return {
    init, refresh, renderMiniCalendar,
    openDayDetail, closeDayDetail,
    openEditor, closeEditor, saveEditor, deleteItem,
    openWorkQuickAdd, closeWorkQuickAdd, saveWorkQuickAdd,
    _navMonth, _goToday,
  };
})();
