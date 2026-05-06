/**
 * staff-app.js — v2.0
 * 직원 관리 UI
 *
 * v2 신규 기능
 * ────────────
 * 1. 주간 템플릿 편집 & 적용
 *    · 직원 편집 모달 내 요일별 근무 등록
 *    · 달력 우상단 "📋 템플릿 적용" 버튼 → 해당 월 자동 적용
 *    · mode: replace(기본) / append
 *
 * 2. 롱프레스 복사
 *    · 달력 근무 항목 롱프레스(700ms) → 복사 모드 진입
 *    · 달력에서 대상 날짜 탭(멀티선택) → 확인 → 복사
 *
 * 3. 소수점 시간
 *    · 시작/종료 시간 입력 시 분 단위 자동 환산 (예: 1.5h = 1시간 30분)
 *    · 수동 입력 필드도 소수점 허용
 */
const StaffApp = (() => {
  /* ══ 상태 ══ */
  let _st = {
    subTab:       'list',
    editId:       null,
    calStaffId:   null,
    calYear:      new Date().getFullYear(),
    calMonth:     new Date().getMonth() + 1,
    payStaffId:   null,
    payYear:      new Date().getFullYear(),
    payMonth:     new Date().getMonth() + 1,
    payResult:    null,
    workType:     'class',
    workDate:     '',
    /* 복사 모드 */
    copyMode:     false,
    copyFromDate: '',
    copyTargets:  new Set(),
  };

  const DOW = StaffDB.DOW_KO;
  const WORK_DAYS = ['월','화','수','목','금','토','일'];

  /* ══════════════════════════════════════════
   * CSS
   * ══════════════════════════════════════════ */
  function _css() {
    if (document.getElementById('sf-styles')) return;
    const s = document.createElement('style');
    s.id = 'sf-styles';
    s.textContent = `
#page-staff { display:none; flex-direction:column; height:100%; overflow:hidden; }
#page-staff.on { display:flex; }

.sf-stabs { display:flex; background:var(--surf); border-bottom:1.5px solid var(--bdr); flex-shrink:0; overflow-x:auto; scrollbar-width:none; }
.sf-stabs::-webkit-scrollbar { display:none; }
.sf-stab { flex:1; min-width:76px; padding:11px 6px; text-align:center; font-size:13px; font-weight:700; color:var(--tx3); cursor:pointer; border-bottom:2.5px solid transparent; background:none; border-top:none; border-left:none; border-right:none; font-family:var(--font); transition:color .18s,border-color .18s; white-space:nowrap; }
.sf-stab.on { color:var(--a); border-bottom-color:var(--a); }

.sf-scroll { flex:1; overflow-y:auto; -webkit-overflow-scrolling:touch; padding:12px 14px 120px; }
.sf-lbl { display:block; font-size:9px; font-weight:800; color:var(--tx3); letter-spacing:1.2px; text-transform:uppercase; padding:8px 2px 5px; }

/* 직원 카드 */
.sf-card { display:flex; align-items:center; gap:12px; background:var(--card); border:1px solid var(--bdr); border-radius:var(--r); padding:12px 14px; margin-bottom:9px; box-shadow:var(--sh); animation:cardIn .22s ease both; transition:border-color .15s; }
.sf-card:hover { border-color:var(--a40); }
.sf-av { width:44px; height:44px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:18px; font-weight:900; flex-shrink:0; background:linear-gradient(135deg,var(--a20),rgba(5,150,105,.2)); color:var(--a); }
.sf-av.off { background:linear-gradient(135deg,rgba(156,163,175,.2),rgba(156,163,175,.1)); color:var(--tx3); }
.sf-ci { flex:1; min-width:0; }
.sf-cn { font-size:15px; font-weight:800; color:var(--tx); }
.sf-cm { font-size:12px; color:var(--tx3); margin-top:3px; display:flex; gap:7px; flex-wrap:wrap; }
.sf-bdg { display:inline-flex; align-items:center; gap:2px; padding:2px 7px; border-radius:6px; font-size:10px; font-weight:700; background:var(--card2); border:1px solid var(--bdr); color:var(--tx2); }
.sf-bdg.ok   { background:rgba(5,150,105,.1); border-color:rgba(5,150,105,.3); color:var(--green); }
.sf-bdg.off  { background:rgba(156,163,175,.1); border-color:rgba(156,163,175,.3); color:var(--tx3); }
.sf-bdg.ctrt { background:rgba(139,92,246,.1); border-color:rgba(139,92,246,.3); color:#8b5cf6; }
.sf-cacts { display:flex; flex-direction:column; gap:5px; align-items:flex-end; flex-shrink:0; }
.sf-empty { text-align:center; padding:56px 20px; color:var(--tx3); font-size:14px; line-height:2.2; }

/* 편집 폼 */
.sf-fg { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
.sf-fg .sf-full { grid-column:1/-1; }
.sf-fl { display:block; font-size:10px; font-weight:800; color:var(--tx3); letter-spacing:.5px; margin-bottom:4px; }
.sf-fi { width:100%; padding:9px 12px; border-radius:9px; background:var(--surf2); border:1.5px solid var(--bdr); font-size:13px; color:var(--tx); outline:none; font-family:var(--font); transition:border-color .2s; box-sizing:border-box; }
.sf-fi:focus { border-color:var(--a); background:var(--a10); }
.sf-fi::placeholder { color:var(--tx3); }
.sf-rate-row { display:flex; gap:8px; align-items:flex-end; }
.sf-rate-row .sf-fi { flex:1; }
.sf-mw { font-size:10px; color:var(--tx3); white-space:nowrap; padding-bottom:10px; line-height:1.5; }

/* ── 주간 템플릿 편집 ── */
.sf-templ-sec { margin-top:4px; }
.sf-templ-dow-row { display:flex; gap:6px; align-items:center; margin-bottom:6px; flex-wrap:wrap; }
.sf-dow-lbl { min-width:22px; font-size:12px; font-weight:800; color:var(--a); flex-shrink:0; }
.sf-templ-entries { flex:1; min-width:0; display:flex; flex-direction:column; gap:4px; }
.sf-templ-entry { display:flex; align-items:center; gap:5px; background:var(--surf2); border-radius:8px; padding:5px 8px; font-size:11px; }
.sf-templ-entry-type { font-size:10px; font-weight:700; padding:2px 6px; border-radius:5px; flex-shrink:0; }
.sf-templ-entry-type.class   { background:var(--a10); color:var(--a); }
.sf-templ-entry-type.general { background:rgba(5,150,105,.1); color:var(--green); }
.sf-templ-entry-info { flex:1; color:var(--tx2); }
.sf-templ-del { background:none; border:none; color:var(--tx3); cursor:pointer; padding:2px 5px; font-size:11px; border-radius:4px; font-family:var(--font); }
.sf-templ-del:hover { color:#ef4444; }
.sf-templ-add-btn { font-size:10px; padding:4px 8px; border-radius:7px; background:var(--a10); border:1px solid var(--a40); color:var(--a); cursor:pointer; font-family:var(--font); font-weight:700; white-space:nowrap; flex-shrink:0; transition:all .12s; }
.sf-templ-add-btn:active { transform:scale(.93); }

/* ── 달력 ── */
.sf-cal-nav { display:flex; align-items:center; justify-content:space-between; padding:8px 14px; background:var(--surf2); border-bottom:1px solid var(--bdr); flex-shrink:0; }
.sf-cal-arr { width:34px; height:34px; border-radius:9px; border:1px solid var(--bdr2); background:var(--card); color:var(--tx2); font-size:17px; cursor:pointer; display:flex; align-items:center; justify-content:center; flex-shrink:0; transition:all .12s; }
.sf-cal-arr:active { background:var(--card2); transform:scale(.92); }
.sf-cal-ym   { font-size:16px; font-weight:800; color:var(--tx); }
.sf-cal-info { font-size:11px; color:var(--tx3); margin-top:2px; }

.sf-cal-grid { display:grid; grid-template-columns:repeat(7,1fr); }
.sf-wd { padding:5px 2px; text-align:center; font-size:10px; font-weight:800; color:var(--tx3); background:var(--surf2); border:1px solid var(--bdr); }
.sf-wd:first-child { color:#dc2626; }
.sf-wd:last-child  { color:#4f46e5; }

.sf-cell { border:1px solid var(--bdr); min-height:62px; padding:4px; background:var(--card); cursor:pointer; position:relative; vertical-align:top; transition:background .12s; }
.sf-cell:hover:not(.sf-ec) { background:var(--a10); }
.sf-cell.sf-today { background:var(--a10) !important; }
.sf-cell.sf-today .sf-dn { color:var(--a); font-weight:900; }
.sf-cell.sf-ec    { background:var(--surf2); cursor:default; }
.sf-cell.sf-sun .sf-dn { color:#dc2626; }
.sf-cell.sf-sat .sf-dn { color:#4f46e5; }
/* 복사 모드 타겟 선택 */
.sf-cell.copy-target { outline:2.5px solid var(--a); background:var(--a10) !important; }
.sf-dn { font-size:11px; font-weight:700; color:var(--tx2); margin-bottom:2px; }
.sf-ce { border-radius:4px; padding:2px 4px; font-size:10px; font-weight:700; margin-bottom:2px; display:flex; align-items:center; gap:2px; position:relative; }
.sf-ce.class   { background:var(--a10); color:var(--a); border:1px solid var(--a40); }
.sf-ce.general { background:rgba(5,150,105,.1); color:var(--green); border:1px solid rgba(5,150,105,.3); }
.sf-ce.copying { background:#fef3c7 !important; border-color:#f59e0b !important; }
.sf-cell-total { position:absolute; bottom:2px; right:4px; font-size:9px; font-weight:800; color:var(--tx3); }

/* 복사 모드 배너 */
.sf-copy-banner { background:#fef3c7; border-bottom:2px solid #f59e0b; padding:8px 14px; flex-shrink:0; display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.sf-copy-banner-txt { font-size:12px; font-weight:700; color:#92400e; flex:1; }
.sf-copy-confirm { padding:6px 14px; border-radius:8px; background:#f59e0b; color:#fff; border:none; font-size:12px; font-weight:700; cursor:pointer; font-family:var(--font); }
.sf-copy-cancel  { padding:6px 14px; border-radius:8px; background:var(--card); border:1px solid var(--bdr2); color:var(--tx2); font-size:12px; cursor:pointer; font-family:var(--font); }

/* 근무 입력 모달 */
.sf-wtype-row { display:flex; gap:8px; margin-bottom:10px; }
.sf-wbtn { flex:1; padding:10px 6px; border-radius:9px; font-size:12px; font-weight:700; cursor:pointer; font-family:var(--font); border:2px solid var(--bdr2); background:var(--card); color:var(--tx2); transition:all .15s; }
.sf-wbtn.on.class   { border-color:var(--a); background:var(--a10); color:var(--a); }
.sf-wbtn.on.general { border-color:var(--green); background:rgba(5,150,105,.1); color:var(--green); }
.sf-wbtn:active { transform:scale(.94); }
.sf-time-row { display:flex; gap:8px; align-items:flex-end; margin-bottom:8px; }
.sf-time-row label { flex:1; }
.sf-tl { font-size:10px; color:var(--tx3); font-weight:700; margin-bottom:3px; display:block; }
.sf-ti { width:100%; padding:9px 10px; border-radius:9px; box-sizing:border-box; background:var(--surf); border:1.5px solid var(--bdr); font-size:13px; color:var(--tx); outline:none; font-family:var(--font); }
.sf-ti:focus { border-color:var(--a); }
.sf-hrs { padding:8px 12px; border-radius:9px; border:1.5px solid var(--a40); font-size:14px; font-weight:800; color:var(--a); background:var(--a10); white-space:nowrap; flex-shrink:0; align-self:flex-end; display:flex; align-items:center; min-width:62px; justify-content:center; }
.sf-note { width:100%; padding:8px 10px; border-radius:9px; box-sizing:border-box; background:var(--surf); border:1.5px solid var(--bdr); font-size:12px; color:var(--tx); outline:none; font-family:var(--font); margin-bottom:8px; }
.sf-note:focus { border-color:var(--a); }
.sf-ei { display:flex; align-items:center; gap:8px; padding:7px 8px; border-radius:8px; transition:background .12s; }
.sf-ei:hover { background:var(--card2); }
.sf-edot { width:8px; height:8px; border-radius:50%; flex-shrink:0; }

/* 급여 */
.sf-pay-bar { padding:10px 14px; background:var(--surf); border-bottom:1px solid var(--bdr); flex-shrink:0; display:flex; gap:8px; flex-wrap:wrap; align-items:flex-end; }
.sf-pay-item { flex:1; min-width:90px; }
.sf-pay-lbl { display:block; font-size:9px; font-weight:800; color:var(--tx3); letter-spacing:1px; text-transform:uppercase; margin-bottom:4px; }
.sf-pay-item select { width:100%; padding:8px 10px; border-radius:10px; background:var(--surf2); border:1.5px solid var(--bdr); font-size:13px; color:var(--tx); outline:none; font-family:var(--font); -webkit-appearance:none; }
.sf-calc-btn { padding:9px 18px; border-radius:10px; background:var(--a); color:#fff; font-weight:700; font-size:13px; border:none; cursor:pointer; font-family:var(--font); box-shadow:0 3px 10px var(--a40); white-space:nowrap; align-self:flex-end; transition:all .15s; }
.sf-calc-btn:active { transform:scale(.95); }
.sf-pcard { background:var(--card); border:1px solid var(--bdr); border-radius:var(--r); box-shadow:var(--sh); overflow:hidden; animation:cardIn .22s ease both; margin-bottom:14px; }
.sf-phead { padding:14px 16px; background:linear-gradient(135deg,rgba(5,150,105,.08),var(--a10)); border-bottom:1px solid var(--bdr); display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px; }
.sf-pname   { font-size:15px; font-weight:900; color:var(--tx); }
.sf-pperiod { font-size:11px; color:var(--tx3); margin-top:3px; }
.sf-ptot-w  { text-align:right; }
.sf-ptot-l  { font-size:10px; color:var(--tx3); }
.sf-ptot    { font-size:26px; font-weight:900; color:var(--a); }
.sf-prows { padding:12px 16px; }
.sf-pr { display:flex; align-items:center; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--bdr); font-size:13px; }
.sf-pr:last-child { border-bottom:none; }
.sf-pr-l { color:var(--tx2); display:flex; align-items:center; gap:8px; }
.sf-pr-v { font-weight:700; color:var(--tx); }
.sf-pr.sf-tot { padding-top:12px; border-top:2px solid var(--a); margin-top:4px; }
.sf-pr.sf-tot .sf-pr-l { font-weight:800; font-size:14px; color:var(--tx); }
.sf-pr.sf-tot .sf-pr-v { font-size:17px; color:var(--a); }
.sf-drow { display:flex; gap:8px; padding:5px 8px; border-radius:8px; font-size:12px; transition:background .12s; }
.sf-drow:hover { background:var(--card2); }
.sf-ddt { font-weight:700; color:var(--tx3); min-width:58px; flex-shrink:0; }
.sf-dtgs { display:flex; gap:4px; flex-wrap:wrap; }
.sf-acts2 { display:flex; gap:8px; padding:12px 16px; border-top:1px solid var(--bdr); flex-wrap:wrap; }
.sf-ab { flex:1; min-width:72px; padding:11px 6px; border-radius:10px; font-size:12px; font-weight:700; cursor:pointer; font-family:var(--font); transition:all .15s; border:none; }
.sf-ab.copy  { background:var(--a10); color:var(--a); border:1px solid var(--a40); }
.sf-ab.pdf   { background:rgba(5,150,105,.1); color:var(--green); border:1px solid rgba(5,150,105,.3); }
.sf-ab.share { background:var(--a); color:#fff; box-shadow:0 3px 10px var(--a40); }
.sf-ab.cal   { background:var(--card2); color:var(--tx2); border:1px solid var(--bdr2); }
.sf-ab:active { transform:scale(.96); }

/* 학원명 */
.sf-acad-row { display:flex; gap:6px; align-items:center; padding:6px 14px; background:var(--surf2); border-bottom:1px solid var(--bdr); font-size:11px; color:var(--tx3); flex-shrink:0; }
.sf-acad-inp { flex:1; padding:5px 10px; border-radius:8px; background:var(--surf); border:1.5px solid var(--bdr); font-size:12px; color:var(--tx); outline:none; font-family:var(--font); }
.sf-acad-inp:focus { border-color:var(--a); }
.sf-acad-save { padding:5px 10px; border-radius:8px; background:var(--a10); border:1px solid var(--a40); color:var(--a); font-size:11px; font-weight:700; cursor:pointer; font-family:var(--font); }

/* PDF */
#sf-pf { display:none; }
@media print {
  body > *:not(#sf-pf) { display:none !important; }
  #sf-pf { display:block !important; position:fixed; inset:0; z-index:9999; background:#fff; padding:28px 36px; overflow:auto; font-family:'Noto Sans KR',sans-serif; font-size:12px; color:#111; }
  #sf-pf * { box-sizing:border-box; }
}
.sfp-hdr  { display:flex; align-items:center; gap:16px; margin-bottom:12px; }
.sfp-logo { width:48px; height:48px; object-fit:contain; }
.sfp-org-name { font-size:18px; font-weight:900; color:#111; }
.sfp-title    { font-size:13px; color:#555; margin-top:2px; }
.sfp-date     { font-size:11px; color:#888; text-align:right; flex:1; }
.sfp-div  { border:none; border-top:2px solid #111; margin:10px 0; }
.sfp-tbl  { width:100%; border-collapse:collapse; margin-bottom:12px; }
.sfp-tbl th { background:#eef2ff; padding:7px 10px; text-align:left; font-size:11px; font-weight:800; color:#333; border:1px solid #c7d2fe; }
.sfp-tbl td { padding:7px 10px; font-size:12px; color:#111; border:1px solid #ddd; }
.sfp-tbl tr:nth-child(even) td { background:#fafafa; }
.sfp-tot td  { background:#eef2ff !important; font-weight:900; font-size:13px; }
.sfp-sign { margin-top:24px; display:flex; justify-content:flex-end; gap:40px; }
.sfp-sign-box { text-align:center; font-size:12px; }
.sfp-sign-line { border-bottom:1px solid #aaa; width:80px; margin:28px auto 4px; }
.sfp-footer { font-size:10px; color:#aaa; text-align:center; margin-top:16px; }
`;
    document.head.appendChild(s);
  }

  /* ══════════════════════════════════════════
   * INIT
   * ══════════════════════════════════════════ */
  async function init() {
    _css();
    if (typeof StaffDB === 'undefined') { console.warn('[StaffApp] StaffDB not loaded'); return; }
    await StaffDB.init();
    StaffDB.on('staff', () => {
      const pg = document.getElementById('page-staff');
      if (!pg?.classList.contains('on')) return;
      if (_st.subTab === 'list') _renderList();
    });
    console.log('[StaffApp] ✅ v2');
  }

  /* ══ RENDER ══ */
  function render() {
    const pg = document.getElementById('page-staff'); if (!pg) return;
    pg.innerHTML = _shell();
    if (_st.subTab === 'list') _renderList(); else _renderSalary();
  }

  function _shell() {
    return `
      <div class="ph">
        <div class="phl">
          <div style="width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#059669,#10b981);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;box-shadow:0 3px 10px rgba(5,150,105,.4)">👩‍💼</div>
          <div style="min-width:0">
            <div class="ph-title">직원 관리 <span class="admin-badge">🔑 관리자</span></div>
            <div class="ph-sub" id="sf-sub">직원 정보 · 근무 · 급여</div>
          </div>
        </div>
        <div class="phr"><button class="ibtn" onclick="StaffApp.openAdd()" title="직원 추가">➕</button></div>
      </div>
      <div class="sf-stabs">
        <button class="sf-stab ${_st.subTab==='list'?'on':''}"   onclick="StaffApp.switchTab('list')">👥 직원 목록</button>
        <button class="sf-stab ${_st.subTab==='salary'?'on':''}" onclick="StaffApp.switchTab('salary')">💰 급여 계산</button>
      </div>
      <div id="sf-cnt" style="flex:1;display:flex;flex-direction:column;overflow:hidden;position:relative;"></div>
      <div id="sf-edit-ov" class="ov hidden" onclick="if(event.target.id==='sf-edit-ov')StaffApp.closeEdit()">
        <div class="sh" id="sf-edit-sh" onclick="event.stopPropagation()" style="max-height:92vh;display:flex;flex-direction:column;"></div>
      </div>
      <div id="sf-cal-ov" class="ov hidden" onclick="if(event.target.id==='sf-cal-ov')StaffApp.closeCal()">
        <div class="sh" id="sf-cal-sh" onclick="event.stopPropagation()" style="max-height:96vh;display:flex;flex-direction:column;"></div>
      </div>
      <div id="sf-work-ov" class="ov hidden" onclick="if(event.target.id==='sf-work-ov')StaffApp.closeWork()">
        <div class="sh" id="sf-work-sh" onclick="event.stopPropagation()" style="max-height:88vh;display:flex;flex-direction:column;"></div>
      </div>
      <div id="sf-templ-add-ov" class="ov hidden" onclick="if(event.target.id==='sf-templ-add-ov')StaffApp.closeTemplAdd()">
        <div class="sh" id="sf-templ-add-sh" onclick="event.stopPropagation()" style="max-height:80vh;display:flex;flex-direction:column;"></div>
      </div>`;
  }

  function switchTab(tab) {
    _st.subTab = tab;
    document.querySelectorAll('.sf-stab').forEach((b,i)=>b.classList.toggle('on',(i===0&&tab==='list')||(i===1&&tab==='salary')));
    if (tab==='list') _renderList(); else _renderSalary();
  }

  /* ══════════════════════════════════════════
   * 직원 목록
   * ══════════════════════════════════════════ */
  function _renderList() {
    const cnt=document.getElementById('sf-cnt'); if(!cnt) return;
    const all=StaffDB.getAll(), active=all.filter(s=>s.status!=='퇴직'), left=all.filter(s=>s.status==='퇴직');
    const sub=document.getElementById('sf-sub');
    if(sub) sub.textContent=`재직 ${active.length}명 · 퇴직 ${left.length}명`;
    cnt.innerHTML=`
      <div class="sf-scroll">
        ${all.length===0?`<div class="sf-empty"><div style="font-size:48px;margin-bottom:10px">👩‍💼</div>등록된 직원이 없습니다<br><small>우상단 + 버튼으로 추가</small></div>`:`
          ${active.length?`<span class="sf-lbl">재직 (${active.length}명)</span>${active.map(_cardHTML).join('')}`:''}
          ${left.length?`<span class="sf-lbl" style="margin-top:12px">퇴직 (${left.length}명)</span>${left.map(_cardHTML).join('')}`:''}`}
      </div>`;
  }

  function _cardHTML(s) {
    const off=s.status==='퇴직';
    const ctrt=s.contractType==='contract';
    return `<div class="sf-card">
      <div class="sf-av ${off?'off':''}">${_e((s.name||'?')[0])}</div>
      <div class="sf-ci">
        <div class="sf-cn">${_e(s.name)}</div>
        <div class="sf-cm">
          <span class="sf-bdg ${off?'off':'ok'}">${s.status}</span>
          ${ctrt?`<span class="sf-bdg ctrt">계약직</span>`:''}
          ${s.phone?`<span class="sf-bdg">📞 ${_e(s.phone)}</span>`:''}
          ${s.hireDate?`<span class="sf-bdg">📅 ${s.hireDate.slice(0,7)}</span>`:''}
          <span class="sf-bdg">수업 ${_fmt(s.classRate)}원/h</span>
          <span class="sf-bdg">일반 ${_fmt(s.generalRate)}원/h</span>
        </div>
      </div>
      <div class="sf-cacts">
        <button class="ibtn" title="근무 달력" onclick="StaffApp.openCal('${s.id}')">📅</button>
        <button class="ibtn" title="편집"      onclick="StaffApp.openEdit('${s.id}')">✏️</button>
        <button class="ibtn red" title="삭제"  onclick="StaffApp.deleteStaff('${s.id}')">🗑</button>
      </div>
    </div>`;
  }

  /* ══════════════════════════════════════════
   * 직원 편집 모달 (주간 템플릿 포함)
   * ══════════════════════════════════════════ */
  /* 편집 시 임시 템플릿 상태 */
  let _editTempl = {};

  function openAdd() { _st.editId=null; _editTempl={}; _drawEdit(null); document.getElementById('sf-edit-ov')?.classList.remove('hidden'); history.pushState({pg:'staff',modal:'edit'},''); }
  function openEdit(id) { _st.editId=id; _editTempl=JSON.parse(JSON.stringify(StaffDB.getTemplate(id)||{})); _drawEdit(StaffDB.getById(id)); document.getElementById('sf-edit-ov')?.classList.remove('hidden'); history.pushState({pg:'staff',modal:'edit'},''); }

  function _drawEdit(s) {
    const sh=document.getElementById('sf-edit-sh'); if(!sh) return;
    const mw=StaffDB.getMinWage();
    sh.innerHTML=`
      <div class="sh-handle"></div>
      <div class="sh-title">${s?'✏️ 직원 수정':'➕ 직원 추가'}</div>
      <div style="flex:1;overflow-y:auto;padding:4px 0 8px">
        <div class="sf-fg">
          <div class="sf-full"><span class="sf-fl">이름 *</span><input class="sf-fi" id="sf-f-name" placeholder="직원 이름" value="${_e(s?.name||'')}"></div>
          <div><span class="sf-fl">연락처</span><input class="sf-fi" id="sf-f-phone" type="tel" placeholder="010-0000-0000" value="${_e(s?.phone||'')}"></div>
          <div><span class="sf-fl">생년월일</span><input class="sf-fi" id="sf-f-birth" type="date" value="${_e(s?.birthDate||'')}"></div>
          <div><span class="sf-fl">입사일 *</span><input class="sf-fi" id="sf-f-hire" type="date" value="${_e(s?.hireDate||'')}"></div>
          <div><span class="sf-fl">퇴사일</span><input class="sf-fi" id="sf-f-leave" type="date" value="${_e(s?.leaveDate||'')}"></div>
          <div><span class="sf-fl">고용 유형</span>
            <select class="sf-fi" id="sf-f-ctype">
              <option value="regular"  ${(s?.contractType||'regular')==='regular' ?'selected':''}>정규직</option>
              <option value="contract" ${(s?.contractType||'regular')==='contract'?'selected':''}>계약직</option>
            </select>
          </div>
          <div class="sf-full"><span class="sf-fl">주소</span><input class="sf-fi" id="sf-f-addr" placeholder="주소" value="${_e(s?.address||'')}"></div>
          <div><span class="sf-fl">수업 시급 (원/h)</span>
            <div class="sf-rate-row"><input class="sf-fi" id="sf-f-cr" type="number" min="0" step="100" placeholder="${mw}" value="${s?.classRate||''}"><span class="sf-mw">최저<br>${_fmt(mw)}원</span></div>
          </div>
          <div><span class="sf-fl">일반 시급 (원/h)</span>
            <div class="sf-rate-row"><input class="sf-fi" id="sf-f-gr" type="number" min="0" step="100" placeholder="${mw}" value="${s?.generalRate||''}"><span class="sf-mw">최저<br>${_fmt(mw)}원</span></div>
          </div>
          <div><span class="sf-fl">급여 지급일</span><input class="sf-fi" id="sf-f-pd" type="number" min="0" max="31" placeholder="0=말일" value="${s?.payDay??0}"></div>
          <div class="sf-full"><span class="sf-fl">메모</span><input class="sf-fi" id="sf-f-memo" placeholder="메모" value="${_e(s?.memo||'')}"></div>
        </div>

        <!-- 주간 템플릿 -->
        <div class="sf-templ-sec">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
            <span class="sf-lbl" style="padding:0">📋 주간 근무 템플릿</span>
            <span style="font-size:10px;color:var(--tx3)">요일별 고정 근무를 등록하세요</span>
          </div>
          <div id="sf-templ-rows">${_templRowsHTML()}</div>
        </div>
      </div>
      <div class="sh-acts">
        <button class="btn-x"  onclick="StaffApp.closeEdit()">취소</button>
        <button class="btn-ok" onclick="StaffApp.saveStaff()">저장</button>
      </div>`;
  }

  function _templRowsHTML() {
    return WORK_DAYS.map(dow => {
      const entries = _editTempl[dow] || [];
      return `<div class="sf-templ-dow-row">
        <span class="sf-dow-lbl">${dow}</span>
        <div class="sf-templ-entries">
          ${entries.map((e,i)=>`
            <div class="sf-templ-entry">
              <span class="sf-templ-entry-type ${e.type}">${e.type==='class'?'수업':'일반'}</span>
              <span class="sf-templ-entry-info">${_e(e.start)}~${_e(e.end)} (${_fmtHrs(e.hours)}h) ${e.note?'· '+_e(e.note):''}</span>
              <button class="sf-templ-del" onclick="StaffApp._templDel('${dow}',${i})">✕</button>
            </div>`).join('')}
        </div>
        <button class="sf-templ-add-btn" onclick="StaffApp.openTemplAdd('${dow}')">+ 추가</button>
      </div>`;
    }).join('');
  }

  function _templDel(dow, idx) {
    (_editTempl[dow] = _editTempl[dow]||[]).splice(idx,1);
    const el=document.getElementById('sf-templ-rows');
    if(el) el.innerHTML=_templRowsHTML();
  }

  /* 템플릿 항목 추가 모달 */
  let _templAddDow = '';
  function openTemplAdd(dow) {
    _templAddDow = dow;
    const sh = document.getElementById('sf-templ-add-sh');
    const sid = _st.editId;
    const s   = sid ? StaffDB.getById(sid) : null;
    const mw  = StaffDB.getMinWage();
    sh.innerHTML=`
      <div class="sh-handle"></div>
      <div class="sh-title">📋 ${dow}요일 근무 추가</div>
      <div style="padding:8px 0">
        <div class="sf-wtype-row">
          <button class="sf-wbtn on class" id="sf-ta-wb-class"   onclick="StaffApp._taWtype('class')">📚 수업 (${_fmt(s?.classRate||mw)}원/h)</button>
          <button class="sf-wbtn general"  id="sf-ta-wb-general" onclick="StaffApp._taWtype('general')">🏢 일반 (${_fmt(s?.generalRate||mw)}원/h)</button>
        </div>
        <div class="sf-time-row">
          <label><span class="sf-tl">시작</span><input class="sf-ti" id="sf-ta-s" type="time" value="09:00" oninput="StaffApp._taHrs()"></label>
          <label><span class="sf-tl">종료</span><input class="sf-ti" id="sf-ta-e" type="time" value="11:00" oninput="StaffApp._taHrs()"></label>
          <div class="sf-hrs" id="sf-ta-hrs">2h</div>
        </div>
        <input class="sf-note" id="sf-ta-note" placeholder="메모 (선택사항)">
      </div>
      <div class="sh-acts">
        <button class="btn-x"  onclick="StaffApp.closeTemplAdd()">취소</button>
        <button class="btn-ok" onclick="StaffApp._addTemplEntry()">추가</button>
      </div>`;
    document.getElementById('sf-templ-add-ov')?.classList.remove('hidden');
    _taType='class'; _taHrs();
  }

  let _taType='class';
  function _taWtype(t){
    _taType=t;
    document.getElementById('sf-ta-wb-class')?.classList.toggle('on',t==='class');
    document.getElementById('sf-ta-wb-class')?.classList.toggle('class',t==='class');
    document.getElementById('sf-ta-wb-general')?.classList.toggle('on',t==='general');
    document.getElementById('sf-ta-wb-general')?.classList.toggle('general',t==='general');
  }
  function _taHrs(){
    const s=document.getElementById('sf-ta-s')?.value,e=document.getElementById('sf-ta-e')?.value,b=document.getElementById('sf-ta-hrs');
    if(!s||!e||!b)return;
    const [sh,sm]=s.split(':').map(Number),[eh,em]=e.split(':').map(Number);
    let d=(eh*60+em)-(sh*60+sm);if(d<0)d+=1440;
    b.textContent=d>0?_fmtHrs(d/60)+'h':'-';
  }
  function _addTemplEntry(){
    const start=document.getElementById('sf-ta-s')?.value,end=document.getElementById('sf-ta-e')?.value,note=document.getElementById('sf-ta-note')?.value?.trim()||'';
    if(!start||!end){_toast('⚠️ 시간을 입력해주세요');return;}
    const [sh,sm]=start.split(':').map(Number),[eh,em]=end.split(':').map(Number);
    let d=(eh*60+em)-(sh*60+sm);if(d<=0){_toast('⚠️ 종료가 시작보다 늦어야 합니다');return;}
    const hours=Math.round(d/60*100)/100;
    if(!_editTempl[_templAddDow])_editTempl[_templAddDow]=[];
    _editTempl[_templAddDow].push({type:_taType,start,end,hours,note});
    closeTemplAdd();
    const el=document.getElementById('sf-templ-rows');if(el)el.innerHTML=_templRowsHTML();
    _toast(`✅ ${_templAddDow}요일 항목 추가`,'success');
  }
  function closeTemplAdd(){document.getElementById('sf-templ-add-ov')?.classList.add('hidden');}

  async function saveStaff() {
    const name=document.getElementById('sf-f-name')?.value?.trim();
    if(!name){_toast('⚠️ 이름은 필수입니다');return;}
    const mw=StaffDB.getMinWage();
    const data={
      name,phone:document.getElementById('sf-f-phone')?.value?.trim()||'',
      birthDate:document.getElementById('sf-f-birth')?.value||'',
      hireDate:document.getElementById('sf-f-hire')?.value||'',
      leaveDate:document.getElementById('sf-f-leave')?.value||'',
      contractType:document.getElementById('sf-f-ctype')?.value||'regular',
      address:document.getElementById('sf-f-addr')?.value?.trim()||'',
      classRate:Number(document.getElementById('sf-f-cr')?.value)||mw,
      generalRate:Number(document.getElementById('sf-f-gr')?.value)||mw,
      payDay:Number(document.getElementById('sf-f-pd')?.value)||0,
      memo:document.getElementById('sf-f-memo')?.value?.trim()||'',
    };
    let id=_st.editId;
    if(id) await StaffDB.updateStaff(id,data);
    else   { const s=await StaffDB.addStaff(data); id=s.id; }
    /* 템플릿 저장 */
    await StaffDB.saveTemplate(id, _editTempl);
    closeEdit();_renderList();_toast(`✅ ${name} ${_st.editId?'수정':'등록'}`,'success');
  }

  function closeEdit(){document.getElementById('sf-edit-ov')?.classList.add('hidden');_st.editId=null;}

  async function deleteStaff(id){
    const s=StaffDB.getById(id);if(!s)return;
    if(!confirm(`${s.name} 직원을 삭제할까요?`))return;
    await StaffDB.deleteStaff(id);_renderList();_toast(`🗑 ${s.name} 삭제`);
  }

  /* ══════════════════════════════════════════
   * 달력 (근무 입력 + 롱프레스 복사 + 템플릿 적용)
   * ══════════════════════════════════════════ */
  function openCal(sid){_st.calStaffId=sid;_st.copyMode=false;_st.copyTargets=new Set();_drawCal();document.getElementById('sf-cal-ov')?.classList.remove('hidden');history.pushState({pg:'staff',modal:'cal'},'');}
  function closeCal(){document.getElementById('sf-cal-ov')?.classList.add('hidden');_st.calStaffId=null;_cancelCopy();}

  function _drawCal(){
    const sh=document.getElementById('sf-cal-sh');if(!sh||!_st.calStaffId)return;
    const s=StaffDB.getById(_st.calStaffId);
    const y=_st.calYear,m=_st.calMonth;
    const ym=`${y}-${String(m).padStart(2,'0')}`;
    const work=StaffDB.getWorkMonth(_st.calStaffId,ym);
    const today=new Date().toISOString().slice(0,10);
    const hasTempl=Object.values(StaffDB.getTemplate(_st.calStaffId)||{}).some(v=>v?.length>0);

    let mc=0,mg=0;
    Object.values(work).forEach(es=>es.forEach(e=>{if(e.type==='class')mc+=Number(e.hours||0);else mg+=Number(e.hours||0);}));
    const mPay=Math.round(mc*(s?.classRate||0)+mg*(s?.generalRate||0));
    const firstDow=new Date(y,m-1,1).getDay(),lastDay=new Date(y,m,0).getDate();

    sh.innerHTML=`
      <div class="sh-handle"></div>
      ${_st.copyMode?`<div class="sf-copy-banner">
        <span class="sf-copy-banner-txt">📋 ${_st.copyFromDate} 복사 중 · ${_st.copyTargets.size}개 날짜 선택됨<br><small>대상 날짜를 탭하여 선택하세요</small></span>
        <button class="sf-copy-confirm" onclick="StaffApp._confirmCopy()">복사 (${_st.copyTargets.size})</button>
        <button class="sf-copy-cancel"  onclick="StaffApp._cancelCopy()">취소</button>
      </div>`:''}
      <div class="sf-cal-nav">
        <button class="sf-cal-arr" onclick="StaffApp._calPrev()">‹</button>
        <div style="text-align:center">
          <div class="sf-cal-ym">${y}년 ${m}월</div>
          <div class="sf-cal-info">${_e(s?.name||'')} · 수업 ${_fmtHrs(mc)}h / 일반 ${_fmtHrs(mg)}h · <strong style="color:var(--a)">${_fmt(mPay)}원</strong></div>
        </div>
        <button class="sf-cal-arr" onclick="StaffApp._calNext()">›</button>
      </div>
      <div class="sf-cal-grid" style="flex-shrink:0;border-bottom:1px solid var(--bdr)">
        ${DOW.map(d=>`<div class="sf-wd">${d}</div>`).join('')}
      </div>
      <div style="flex:1;overflow-y:auto">
        <div class="sf-cal-grid">
          ${Array.from({length:firstDow},()=>`<div class="sf-cell sf-ec"></div>`).join('')}
          ${Array.from({length:lastDay},(_,i)=>{
            const day=i+1;
            const date=`${y}-${String(m).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
            const dow=new Date(y,m-1,day).getDay();
            const es=work[date]||[];
            let ch=0,gh=0;es.forEach(e=>{if(e.type==='class')ch+=Number(e.hours||0);else gh+=Number(e.hours||0);});
            const tot=ch+gh;
            const isCopyFrom=_st.copyFromDate===date;
            const isCopyTarget=_st.copyTargets.has(date);
            return `<div class="sf-cell ${date===today?'sf-today':''} ${dow===0?'sf-sun':dow===6?'sf-sat':''} ${isCopyTarget?'copy-target':''}"
                         data-date="${date}"
                         onclick="StaffApp._calCellClick('${date}',${dow===0||dow===6})"
                         id="sf-cell-${date}">
              <div class="sf-dn">${day}</div>
              ${es.map(e=>`<div class="sf-ce ${e.type} ${isCopyFrom?'copying':''}"
                  data-eid="${e.id}" data-date="${date}">${e.type==='class'?'수':'일'} ${_fmtHrs(Number(e.hours||0))}h</div>`).join('')}
              ${tot?`<div class="sf-cell-total">${_fmtHrs(tot)}h</div>`:''}
            </div>`;
          }).join('')}
        </div>
      </div>
      <div style="padding:10px 14px;border-top:1px solid var(--bdr);flex-shrink:0;display:flex;gap:6px;align-items:center;flex-wrap:wrap">
        ${hasTempl?`<button class="btn-ok" style="flex:1" onclick="StaffApp._applyTemplModal()">📋 템플릿 적용</button>`:''}
        <button class="btn-ok" style="flex:1" onclick="StaffApp._calToSalary()">💰 급여 계산</button>
        <button class="btn-x"  onclick="StaffApp.closeCal()">닫기</button>
      </div>`;

    /* 롱프레스 이벤트 바인딩 */
    _bindLongPress();
  }

  /* ── 롱프레스 ── */
  let _lpTimer=null;
  function _bindLongPress(){
    document.querySelectorAll('.sf-ce').forEach(el=>{
      el.addEventListener('pointerdown',e=>{
        _lpTimer=setTimeout(()=>{
          const date=el.dataset.date;
          if(!date)return;
          _st.copyMode=true;
          _st.copyFromDate=date;
          _st.copyTargets=new Set();
          _drawCal();
          _toast(`📋 ${date} 복사 모드 — 대상 날짜를 탭하세요`,'success');
        },700);
      });
      el.addEventListener('pointerup',  ()=>clearTimeout(_lpTimer));
      el.addEventListener('pointerleave',()=>clearTimeout(_lpTimer));
    });
  }

  function _calCellClick(date, isWeekend){
    if(_st.copyMode){
      if(date===_st.copyFromDate)return;
      if(_st.copyTargets.has(date)) _st.copyTargets.delete(date);
      else                           _st.copyTargets.add(date);
      _drawCal();
      return;
    }
    StaffApp.openWork(date);
  }

  async function _confirmCopy(){
    if(!_st.copyTargets.size){_toast('⚠️ 대상 날짜를 선택해주세요');return;}
    const n=await StaffDB.copyEntries(_st.calStaffId,_st.copyFromDate,[..._st.copyTargets]);
    _cancelCopy();
    _toast(`✅ ${n}일에 복사 완료`,'success');
  }
  function _cancelCopy(){_st.copyMode=false;_st.copyFromDate='';_st.copyTargets=new Set();_drawCal();}

  /* ── 템플릿 적용 모달 ── */
  function _applyTemplModal(){
    if(!confirm(`${_st.calYear}년 ${_st.calMonth}월에 주간 템플릿을 적용하시겠습니까?\n기존 데이터가 있는 날짜는 덮어씁니다.`))return;
    StaffDB.applyTemplate(_st.calStaffId,_st.calYear,_st.calMonth,'replace').then(n=>{
      _drawCal();_toast(`✅ ${n}일에 템플릿 적용`,'success');
    });
  }

  function _calPrev(){if(--_st.calMonth<1){_st.calMonth=12;_st.calYear--;}  _drawCal();}
  function _calNext(){if(++_st.calMonth>12){_st.calMonth=1;_st.calYear++;} _drawCal();}
  function _calToSalary(){_st.payStaffId=_st.calStaffId;_st.payYear=_st.calYear;_st.payMonth=_st.calMonth;closeCal();switchTab('salary');setTimeout(_calcAndRender,120);}

  /* ══════════════════════════════════════════
   * 근무 입력 모달 (소수점 시간)
   * ══════════════════════════════════════════ */
  function openWork(date){_st.workDate=date;_st.workType='class';_drawWork();document.getElementById('sf-work-ov')?.classList.remove('hidden');history.pushState({pg:'staff',modal:'work'},'');}
  function closeWork(){document.getElementById('sf-work-ov')?.classList.add('hidden');_drawCal();}

  function _drawWork(){
    const sh=document.getElementById('sf-work-sh');if(!sh)return;
    const s=StaffDB.getById(_st.calStaffId);
    const es=StaffDB.getWorkDay(_st.calStaffId,_st.workDate);
    const dow=DOW[new Date(_st.workDate).getDay()];
    sh.innerHTML=`
      <div class="sh-handle"></div>
      <div class="sh-title">📅 근무 입력</div>
      <div class="sh-sub">${_st.workDate} (${dow}) · ${_e(s?.name||'')}</div>
      <div style="flex:1;overflow-y:auto;padding:4px 0 8px">
        <div class="sf-wtype-row">
          <button class="sf-wbtn ${_st.workType==='class'?'on class':''}" id="sf-wb-class" onclick="StaffApp._wtype('class')">
            📚 수업<br><small>${_fmt(s?.classRate||0)}원/h</small>
          </button>
          <button class="sf-wbtn ${_st.workType==='general'?'on general':''}" id="sf-wb-gen" onclick="StaffApp._wtype('general')">
            🏢 일반<br><small>${_fmt(s?.generalRate||0)}원/h</small>
          </button>
        </div>
        <div class="sf-time-row">
          <label><span class="sf-tl">시작 시간</span><input class="sf-ti" id="sf-ws" type="time" value="09:00" oninput="StaffApp._chrs()"></label>
          <label><span class="sf-tl">종료 시간</span><input class="sf-ti" id="sf-we" type="time" value="11:00" oninput="StaffApp._chrs()"></label>
          <div class="sf-hrs" id="sf-whrs">2h</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
          <span style="font-size:11px;color:var(--tx3);flex-shrink:0">직접 입력 (h):</span>
          <input type="number" min="0" max="24" step="0.25" placeholder="ex) 1.5" id="sf-wh-manual"
                 style="flex:1;padding:7px 10px;border-radius:9px;border:1.5px solid var(--bdr);background:var(--surf);font-size:13px;color:var(--tx);font-family:var(--font);outline:none"
                 oninput="StaffApp._manualHrs(this.value)">
        </div>
        <input class="sf-note" id="sf-wn" placeholder="메모 (선택사항)">
        <button class="btn-ok" style="width:100%;margin-bottom:14px" onclick="StaffApp._addEntry()">✅ 근무 등록</button>
        <div style="font-size:10px;font-weight:800;color:var(--tx3);letter-spacing:1px;margin-bottom:6px">이 날 근무 (${es.length}건)</div>
        <div id="sf-el">${es.length?es.map(_entryHTML).join(''):'<div style="font-size:12px;color:var(--tx3);padding:6px 4px">등록된 근무 없음</div>'}</div>
      </div>
      <div class="sh-acts"><button class="btn-x" onclick="StaffApp.closeWork()">닫기</button></div>`;
    _chrs();
  }

  function _entryHTML(e){
    const c=e.type==='class'?{tx:'var(--a)',l:'수업'}:{tx:'var(--green)',l:'일반'};
    return `<div class="sf-ei">
      <div class="sf-edot" style="background:${c.tx}"></div>
      <span style="font-size:11px;font-weight:700;color:${c.tx};min-width:28px">${c.l}</span>
      <span style="font-size:12px;color:var(--tx2);flex:1">${_e(e.start||'')}~${_e(e.end||'')} <strong>${_fmtHrs(e.hours)}h</strong>${e.note?` · ${_e(e.note)}`:''}</span>
      <button class="ibtn red" style="width:28px;height:28px;font-size:12px" onclick="StaffApp._delEntry('${e.id}')">✕</button>
    </div>`;
  }

  function _wtype(t){
    _st.workType=t;
    document.getElementById('sf-wb-class')?.classList.toggle('on',t==='class');document.getElementById('sf-wb-class')?.classList.toggle('class',t==='class');
    document.getElementById('sf-wb-gen')?.classList.toggle('on',t==='general');document.getElementById('sf-wb-gen')?.classList.toggle('general',t==='general');
  }

  let _manualHrsVal = null;
  function _chrs(){
    _manualHrsVal=null;
    const sv=document.getElementById('sf-ws')?.value,ev=document.getElementById('sf-we')?.value,b=document.getElementById('sf-whrs');
    const m=document.getElementById('sf-wh-manual');if(m)m.value='';
    if(!sv||!ev||!b)return;
    const [sh,sm]=sv.split(':').map(Number),[eh,em]=ev.split(':').map(Number);
    let d=(eh*60+em)-(sh*60+sm);if(d<0)d+=1440;
    const h=Math.round(d/60*100)/100;
    b.textContent=d>0?_fmtHrs(h)+'h':'-';
  }
  function _manualHrs(v){_manualHrsVal=v?Math.round(Number(v)*100)/100:null;const b=document.getElementById('sf-whrs');if(b&&_manualHrsVal!=null)b.textContent=_fmtHrs(_manualHrsVal)+'h';}

  async function _addEntry(){
    const start=document.getElementById('sf-ws')?.value,end=document.getElementById('sf-we')?.value,note=document.getElementById('sf-wn')?.value?.trim()||'';
    let hours;
    if(_manualHrsVal!=null&&_manualHrsVal>0){ hours=_manualHrsVal; }
    else {
      if(!start||!end){_toast('⚠️ 시작/종료 시간을 입력해주세요');return;}
      const [sh,sm]=start.split(':').map(Number),[eh,em]=end.split(':').map(Number);
      let d=(eh*60+em)-(sh*60+sm);if(d<=0){_toast('⚠️ 종료가 시작보다 늦어야 합니다');return;}
      hours=Math.round(d/60*100)/100;
    }
    await StaffDB.addWorkEntry(_st.calStaffId,_st.workDate,{type:_st.workType,start,end,hours,note});
    _drawWork();_toast(`✅ ${_st.workType==='class'?'수업':'일반'} ${_fmtHrs(hours)}h 등록`,'success');
  }

  async function _delEntry(eid){await StaffDB.deleteWorkEntry(_st.calStaffId,_st.workDate,eid);_drawWork();_toast('삭제');}

  /* ══════════════════════════════════════════
   * 급여 계산 탭
   * ══════════════════════════════════════════ */
  function _renderSalary(){
    const cnt=document.getElementById('sf-cnt');if(!cnt)return;
    const staff=StaffDB.getActive(),now=new Date(),y=_st.payYear,m=_st.payMonth;
    const acad=StaffDB.getAcad();
    cnt.innerHTML=`
      <div class="sf-acad-row">
        <span>🏫</span>
        <input class="sf-acad-inp" id="sf-acad-inp" value="${_e(acad.name)}" placeholder="학원명 입력">
        <button class="sf-acad-save" onclick="StaffApp._saveAcad()">저장</button>
      </div>
      <div class="sf-pay-bar">
        <div class="sf-pay-item"><span class="sf-pay-lbl">👤 직원</span>
          <select id="sf-ps" onchange="StaffApp._onSel()">
            <option value="">— 직원 선택 —</option>
            ${staff.map(s=>`<option value="${s.id}" ${_st.payStaffId===s.id?'selected':''}>${_e(s.name)}</option>`).join('')}
          </select>
        </div>
        <div class="sf-pay-item"><span class="sf-pay-lbl">📅 연도</span>
          <select id="sf-py" onchange="StaffApp._onSel()">
            ${[now.getFullYear()-1,now.getFullYear(),now.getFullYear()+1].map(yr=>`<option value="${yr}" ${y===yr?'selected':''}>${yr}년</option>`).join('')}
          </select>
        </div>
        <div class="sf-pay-item"><span class="sf-pay-lbl">📅 월</span>
          <select id="sf-pm" onchange="StaffApp._onSel()">
            ${Array.from({length:12},(_,i)=>i+1).map(mo=>`<option value="${mo}" ${m===mo?'selected':''}>${mo}월</option>`).join('')}
          </select>
        </div>
        <button class="sf-calc-btn" onclick="StaffApp._calcAndRender()">계산</button>
      </div>
      <div id="sf-pb" class="sf-scroll">
        ${_st.payResult?_payHTML(_st.payResult):`<div class="sf-empty" style="padding:48px 20px"><div style="font-size:44px;margin-bottom:8px">💰</div>직원과 연월을 선택하고 계산 버튼을 누르세요<br><small style="font-size:12px">급여 기간: 1일~말일</small></div>`}
      </div>`;
  }

  function _onSel(){_st.payStaffId=document.getElementById('sf-ps')?.value||null;_st.payYear=Number(document.getElementById('sf-py')?.value)||new Date().getFullYear();_st.payMonth=Number(document.getElementById('sf-pm')?.value)||new Date().getMonth()+1;}
  function _calcAndRender(){_onSel();if(!_st.payStaffId){_toast('⚠️ 직원을 선택해주세요');return;}const r=StaffDB.calcPay(_st.payStaffId,_st.payYear,_st.payMonth);_st.payResult=r;const pb=document.getElementById('sf-pb');if(pb)pb.innerHTML=_payHTML(r);}
  function _saveAcad(){const name=document.getElementById('sf-acad-inp')?.value?.trim();if(!name)return;StaffDB.setAcad({name});_toast(`🏫 "${name}" 저장`,'success');}

  function _payHTML(r){
    if(!r)return'';
    const s=r.staff,pd=Number(s.payDay||0),pdStr=pd===0?'말일':`${pd}일`,today=new Date().toLocaleDateString('ko-KR');
    const dayRows=Object.keys(r.byDay).sort().map(date=>{
      const d=r.byDay[date],dow=DOW[new Date(date).getDay()];
      const amt=Math.round(d.classHrs*s.classRate+d.generalHrs*s.generalRate);
      return `<div class="sf-drow">
        <span class="sf-ddt">${date.slice(5)} (${dow})</span>
        <div class="sf-dtgs">
          ${d.classHrs  ?`<span class="sf-ce class"   style="font-size:11px">수업 ${_fmtHrs(d.classHrs)}h</span>`:''}
          ${d.generalHrs?`<span class="sf-ce general" style="font-size:11px">일반 ${_fmtHrs(d.generalHrs)}h</span>`:''}
        </div>
        <span style="font-size:11px;color:var(--tx3);margin-left:auto">${_fmt(amt)}원</span>
      </div>`;
    }).join('');

    return `<div class="sf-pcard">
      <div class="sf-phead">
        <div>
          <div class="sf-pname">💰 ${_e(s.name)} 급여 명세</div>
          <div class="sf-pperiod">📅 ${r.from} ~ ${r.to} · 지급일 ${r.year}년 ${r.month}월 ${pdStr}</div>
        </div>
        <div class="sf-ptot-w"><div class="sf-ptot-l">세전 합계</div><div class="sf-ptot">${_fmt(r.totalPay)}원</div></div>
      </div>
      <div class="sf-prows">
        <div class="sf-pr">
          <span class="sf-pr-l"><span style="width:10px;height:10px;border-radius:50%;background:var(--a);display:inline-block;margin-right:2px"></span>📚 수업 (${_fmtHrs(r.classHrs)}h × ${_fmt(s.classRate)}원)</span>
          <span class="sf-pr-v">${_fmt(r.classPay)}원</span>
        </div>
        <div class="sf-pr">
          <span class="sf-pr-l"><span style="width:10px;height:10px;border-radius:50%;background:var(--green);display:inline-block;margin-right:2px"></span>🏢 일반 (${_fmtHrs(r.generalHrs)}h × ${_fmt(s.generalRate)}원)</span>
          <span class="sf-pr-v">${_fmt(r.generalPay)}원</span>
        </div>
        <div class="sf-pr sf-tot">
          <span class="sf-pr-l">⏱ 총 ${_fmtHrs(r.classHrs+r.generalHrs)}h · 세전 합계</span>
          <span class="sf-pr-v">${_fmt(r.totalPay)}원</span>
        </div>
      </div>
      ${dayRows?`<div style="padding:4px 14px 12px;border-top:1px solid var(--bdr)"><span class="sf-lbl" style="padding-top:10px">근무 상세</span>${dayRows}</div>`:`<div style="padding:14px 16px;text-align:center;color:var(--tx3);font-size:13px">이 기간에 등록된 근무가 없습니다</div>`}
      <div class="sf-acts2">
        <button class="sf-ab cal"  onclick="StaffApp.openCal('${s.id}')">📅 달력</button>
        <button class="sf-ab copy" onclick="StaffApp._copy()">📋 복사</button>
        <button class="sf-ab pdf"  onclick="StaffApp._pdf()">🖨️ PDF</button>
        <button class="sf-ab share" onclick="StaffApp._share()">📤 공유</button>
      </div>
    </div>`;
  }

  /* ── 급여 공유/PDF/복사 ── */
  function _payText(){
    const r=_st.payResult;if(!r)return'';const s=r.staff;
    const pd=Number(s.payDay||0),pdStr=pd===0?`${r.year}년 ${r.month}월 말일`:`${r.year}년 ${r.month}월 ${pd}일`;
    const today=new Date().toLocaleDateString('ko-KR');const acad=StaffDB.getAcad();
    return[`══════════════════════`,`🏫 ${acad.name}`,`💰 급여 명세서`,`══════════════════════`,`👤 ${s.name}`,`📅 ${r.from} ~ ${r.to}`,`🗓 발행일: ${today} · 지급일: ${pdStr}`,`─────────────────────`,`📚 수업: ${_fmtHrs(r.classHrs)}h × ${_fmt(s.classRate)}원 = ${_fmt(r.classPay)}원`,`🏢 일반: ${_fmtHrs(r.generalHrs)}h × ${_fmt(s.generalRate)}원 = ${_fmt(r.generalPay)}원`,`─────────────────────`,`세전 합계: ${_fmt(r.totalPay)}원`].join('\n');
  }
  async function _copy(){try{await navigator.clipboard.writeText(_payText());_toast('📋 복사됐습니다','success');}catch{_toast('⚠️ 복사 실패');}}
  async function _share(){const r=_st.payResult;if(!r)return;const t=_payText();const sd={title:`${r.staff.name} 급여 명세`,text:t};if(navigator.share&&navigator.canShare?.(sd)){try{await navigator.share(sd);_toast('📤 공유 완료','success');return;}catch(e){if(e.name==='AbortError')return;}}_copy();}

  function _pdf(){
    const r=_st.payResult;if(!r)return;
    const s=r.staff,acad=StaffDB.getAcad();
    const pd=Number(s.payDay||0),pdStr=pd===0?`${r.year}년 ${r.month}월 말일`:`${r.year}년 ${r.month}월 ${pd}일`;
    const today=new Date().toLocaleDateString('ko-KR');
    const logoSrc=(typeof LOGO!=='undefined'&&LOGO.small)?LOGO.small:'';
    const dayRows=Object.keys(r.byDay).sort().map(date=>{const d=r.byDay[date],dow=DOW[new Date(date).getDay()];const amt=Math.round(d.classHrs*s.classRate+d.generalHrs*s.generalRate);return `<tr><td>${date} (${dow})</td><td style="text-align:center">${d.classHrs?_fmtHrs(d.classHrs):'-'}</td><td style="text-align:center">${d.generalHrs?_fmtHrs(d.generalHrs):'-'}</td><td style="text-align:right">${_fmt(amt)}원</td></tr>`;}).join('');
    let frame=document.getElementById('sf-pf');if(!frame){frame=document.createElement('div');frame.id='sf-pf';document.body.appendChild(frame);}
    frame.innerHTML=`
      <div class="sfp-hdr">${logoSrc?`<img class="sfp-logo" src="${logoSrc}" alt="logo">`:''}
        <div><div class="sfp-org-name">${_e(acad.name)}</div><div class="sfp-title">급 여 명 세 서</div></div>
        <div class="sfp-date">발행일: ${today}</div>
      </div>
      <hr class="sfp-div">
      <table class="sfp-tbl" style="margin-bottom:10px">
        <tr><th>성&nbsp;&nbsp;명</th><td>${_e(s.name)}</td><th>급여 기간</th><td>${r.from} ~ ${r.to}</td></tr>
        <tr><th>지 급 일</th><td>${pdStr}</td><th>연락처</th><td>${_e(s.phone||'-')}</td></tr>
        <tr><th>고용 유형</th><td>${s.contractType==='contract'?'계약직':'정규직'}</td><th>수업/일반 시급</th><td>${_fmt(s.classRate)}원 / ${_fmt(s.generalRate)}원</td></tr>
      </table>
      <table class="sfp-tbl">
        <thead><tr><th>항&nbsp;&nbsp;목</th><th style="text-align:center">근무시간</th><th style="text-align:right">시&nbsp;&nbsp;급</th><th style="text-align:right">지급금액</th></tr></thead>
        <tbody>
          <tr><td>📚 수업</td><td style="text-align:center">${_fmtHrs(r.classHrs)}h</td><td style="text-align:right">${_fmt(s.classRate)}원</td><td style="text-align:right">${_fmt(r.classPay)}원</td></tr>
          <tr><td>🏢 일반</td><td style="text-align:center">${_fmtHrs(r.generalHrs)}h</td><td style="text-align:right">${_fmt(s.generalRate)}원</td><td style="text-align:right">${_fmt(r.generalPay)}원</td></tr>
        </tbody>
        <tfoot><tr class="sfp-tot"><td colspan="3"><strong>세전 합계 (총 ${_fmtHrs(r.classHrs+r.generalHrs)}시간)</strong></td><td style="text-align:right"><strong>${_fmt(r.totalPay)}원</strong></td></tr></tfoot>
      </table>
      ${dayRows?`<table class="sfp-tbl" style="margin-top:8px"><thead><tr><th>날&nbsp;&nbsp;짜</th><th style="text-align:center">수업(h)</th><th style="text-align:center">일반(h)</th><th style="text-align:right">일 급여</th></tr></thead><tbody>${dayRows}</tbody></table>`:''}
      <div class="sfp-sign">
        <div class="sfp-sign-box"><div>확&nbsp;&nbsp;&nbsp;인</div><div class="sfp-sign-line"></div><div>${_e(s.name)} (서명)</div></div>
        <div class="sfp-sign-box"><div>원&nbsp;&nbsp;&nbsp;장</div><div class="sfp-sign-line"></div><div>${_e(acad.name)}</div></div>
      </div>
      <div class="sfp-footer">본 명세서는 ${_e(acad.name)}에서 발행되었습니다.</div>`;
    window.print();setTimeout(()=>frame.remove(),1500);
  }

  /* ══ 유틸 ══ */
  /**
   * 소수점 시간 표시
   * 1.5 → "1.5"  1.0 → "1"  1.75 → "1.75"
   */
  const _fmtHrs = h => {
    const n = Math.round(Number(h||0)*100)/100;
    return n % 1 === 0 ? String(n) : String(n);
  };
  const _fmt = n => Number(n).toLocaleString('ko-KR');
  const _e   = v => String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  function _toast(msg,type){const el=document.getElementById('toast');if(!el)return;el.textContent=msg;el.className=type==='success'?'success':'';el.classList.remove('hidden');clearTimeout(el._t);el._t=setTimeout(()=>el.classList.add('hidden'),3000);}

  return {
    init, render, switchTab,
    openAdd, openEdit, closeEdit, saveStaff, deleteStaff,
    openCal, closeCal, _calPrev, _calNext, _calToSalary,
    _calCellClick, _confirmCopy, _cancelCopy, _applyTemplModal,
    openWork, closeWork, _wtype, _chrs, _manualHrs, _addEntry, _delEntry,
    openTemplAdd, closeTemplAdd, _taWtype, _taHrs, _addTemplEntry, _templDel,
    _onSel, _calcAndRender, _saveAcad,
    _copy, _pdf, _share,
  };
})();
