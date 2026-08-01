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
  const PAY_COLOR = '#22c55e', NOTICE_COLOR = '#a855f7', WORK_COLOR = '#0891b2', ENROLL_COLOR = '#f59e0b';
  const DAYS_KO = ['일', '월', '화', '수', '목', '금', '토'];

  let _mountId = null;
  let _st = { year: 0, month: 0 }; // 캘린더에 표시 중인 연/월 (month: 1~12)
  let _selDate = null; // ★ 우측 패널에 상세를 보여주고 있는 선택된 날짜 (기본값=오늘)
  let _workAddFor = null; // ★ 근무 등록 폼이 열려있는 날짜 (해당 날짜의 상세 패널 안에 인라인으로 표시)
  let _editId = null;
  let _editScope = 'this'; // ★ 반복 일정 수정 범위: 'this'(이 건만) | 'future'(이 건부터 전체) | 'all'(전체)
  let _timer = null;

  function _esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function _q(id) { return document.getElementById(id); }
  function _pad(n) { return String(n).padStart(2, '0'); }
  function _todayStr() { const d = new Date(); return `${d.getFullYear()}-${_pad(d.getMonth() + 1)}-${_pad(d.getDate())}`; }
  // ★ 'YYYY-MM-DD' 문자열에 일수를 더/빼서 새 날짜 문자열을 반환 (미리 알림·반복 등록 계산용)
  function _addDays(dateStr, delta) {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + delta);
    return `${d.getFullYear()}-${_pad(d.getMonth() + 1)}-${_pad(d.getDate())}`;
  }
  function _isAdmin() { return typeof DB !== 'undefined' && DB.isAdmin(); }
  // ★ 일정 등록은 운용자·강사·admin 누구나 가능(로그인만 되어 있으면 됨)
  function _canRegister() { return typeof DB !== 'undefined' && DB.canOperate(); }
  // ★ 수정·삭제는 admin이거나, 본인이 등록한 일정일 때만 가능
  function _canEdit(s) {
    if (!s) return false;
    if (_isAdmin()) return true;
    const me = (typeof DB !== 'undefined' && DB.getSession) ? (DB.getSession()?.username || '') : '';
    return !!me && s.createdBy === me;
  }

  /* ═══════════════════════════════════════════════════════════
   * 스타일
   * ═══════════════════════════════════════════════════════════ */
  let _cssInjected = false;
  function _css() {
    if (_cssInjected) return; _cssInjected = true;
    const s = document.createElement('style');
    s.textContent = `
.sch-cal-hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
.sch-resizable-wrap{position:relative;display:inline-block;max-width:100%;padding:2px;border:1px solid transparent;border-radius:10px;}
.sch-resizable-wrap:hover,.sch-resizable-wrap.resizing{border-color:var(--bdr2);}
.sch-zoom-inner{transform-origin:top left;}
.sch-resize-hint{position:absolute;right:2px;bottom:0px;font-size:12px;color:var(--tx3);opacity:.4;pointer-events:none;line-height:1;z-index:1;}
.sch-widget-resize-handle{position:absolute;z-index:5;}
@media (max-width:700px){
  /* ★ 휴대폰 화면 안전장치 — 드래그 리사이즈 UI를 완전히 숨겨서 터치 오작동을 막는다.
     (예전엔 여기서 overflow-x:hidden도 걸어뒀는데, 그건 넘치는 원인을 고치는 게
     아니라 넘친 부분을 숨기기만 해서 수·목·금 칸이 화면에서 통째로 안 보이는
     문제를 만들었다. 진짜 원인은 grid-template-columns에 minmax(0,1fr)이 없어서
     긴 일정 제목이 칸 너비를 억지로 늘리던 것이었고, 그건 위에서 직접 고쳤다.) */
  .sch-resize-hint,.sch-widget-resize-handle{display:none}
  .sch-resizable-wrap{max-width:100%}
  #sch-cal-zoom{zoom:1 !important}
  /* ★ 손가락으로 누르기 편하도록 날짜 칸 터치 영역을 살짝 넉넉하게 */
  .sch-daynum-cell{padding:5px 0}
  .sch-legend{gap:5px}
}
.sch-widget-resize-handle.rh-s{left:8px;right:8px;height:9px;bottom:-5px;}
.sch-widget-resize-handle.rh-e{top:8px;bottom:8px;width:9px;right:-5px;}
.sch-widget-resize-handle.rh-se{width:16px;height:16px;bottom:-6px;right:-6px;}
.sch-widget-resize-handle:hover,.sch-resizable-wrap.resizing .sch-widget-resize-handle{background:var(--a20);border-radius:4px;}
.sch-cal-title{font-size:15px;font-weight:800;color:var(--tx)}
.sch-cal-navs{display:flex;align-items:center;gap:4px}
.sch-selday-navs{display:flex;align-items:center;gap:6px;flex-shrink:0}
.sch-nav-btn{width:30px;height:30px;border-radius:9px;background:var(--card2);border:1px solid var(--bdr);display:flex;align-items:center;justify-content:center;font-size:15px;cursor:pointer;color:var(--tx2)}
.sch-today-btn{padding:7px 12px;border-radius:9px;background:var(--card2);border:1px solid var(--bdr);font-size:12.5px;font-weight:700;color:var(--tx2);cursor:pointer}
.sch-add-btn{background:var(--a);border-color:var(--a);color:#fff}
.sch-widget-layout{display:flex;flex-wrap:wrap;gap:18px}
.sch-cal-col{flex:0 0 auto;min-width:230px}
.sch-tdc-col{flex:1 1 auto;min-width:210px;border-left:1px solid var(--bdr);padding-left:16px;display:flex;flex-direction:column}
.sch-selday-hint{text-align:center;color:var(--tx3);font-size:12.5px;line-height:1.6;padding:22px 8px;background:var(--card2);border-radius:12px}
.sch-selday-hdr{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:12px}
.sch-selday-title{font-size:15px;font-weight:800;color:var(--tx)}
.sch-selday-title-btn{cursor:pointer;border-radius:8px;padding:2px 6px;margin:-2px -6px;transition:background .15s}
.sch-selday-title-btn:hover{background:var(--card2)}
.sch-date-jump-inp{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;border:none}
.sch-detail-sec-title-row{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px}
.sch-mini-add-btn{padding:6px 11px;border-radius:8px;background:var(--card2);border:1px solid var(--bdr2);color:var(--tx2);font-size:12px;font-weight:700;cursor:pointer}
.sch-workadd-box{background:var(--surf2);border:1px dashed var(--bdr2);border-radius:11px;padding:10px;margin-top:2px}
.sch-notify-ck{display:flex;align-items:flex-start;gap:8px;cursor:pointer;padding:2px 0}
.sch-notify-ck input{width:17px;height:17px;flex-shrink:0;margin-top:1px;accent-color:var(--a);cursor:pointer}
.sch-notify-ck span{font-size:13.5px;color:var(--tx);line-height:1.5}
.sch-notify-ck span em{font-style:normal;color:var(--tx3);font-size:12px}
/* ── 커스텀 시간 피커 (네이티브 input[type=time]이 다크모드 등에서 글자가 거의 안 보이는 문제 대체) ── */
.sch-tp-wrap{display:flex;flex-direction:column;gap:4px}
.sch-tp-lbl{font-size:11px;font-weight:800;color:var(--tx3);letter-spacing:.4px}
.sch-tp-row{display:flex;align-items:center;gap:8px}
.sch-tp-ampm{display:flex;border-radius:9px;overflow:hidden;border:1.5px solid var(--bdr);flex-shrink:0}
.sch-tp-ampm button{padding:9px 12px;font-size:12px;font-weight:800;background:var(--surf2);border:none;cursor:pointer;font-family:var(--font);color:var(--tx3);transition:all .15s;line-height:1}
.sch-tp-ampm button.active{background:var(--a);color:#fff}
.sch-tp-ampm button.active.pm{background:#7c3aed;color:#fff}
.sch-tp-selects{display:flex;align-items:center;gap:4px;flex:1}
.sch-tp-sel{padding:9px 4px;border-radius:9px;border:1.5px solid var(--bdr);background:var(--surf);font-size:16px;font-weight:800;color:var(--tx);font-family:var(--font);text-align:center;flex:1;outline:none;cursor:pointer;-webkit-appearance:none;appearance:none}
.sch-tp-sel:focus{border-color:var(--a)}
.sch-tp-colon{font-size:18px;font-weight:900;color:var(--tx);flex-shrink:0}
.sch-tp-preview{font-size:12.5px;font-weight:800;padding:4px 2px}
.sch-repeat-hint{font-size:11px;color:var(--tx3);margin-top:4px;line-height:1.5}
.sch-today-divider{border-top:1px dashed var(--bdr);margin:16px 0 12px}
.sch-today-section{width:100%}
.sch-detail-sec{margin-bottom:14px}
.sch-detail-sec:last-child{margin-bottom:0}
.sch-detail-sec-title{font-size:12.5px;font-weight:800;color:var(--tx3);letter-spacing:.4px;margin-bottom:6px}
.sch-dow-row{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));margin-bottom:2px}
.sch-dow{text-align:center;font-size:10px;font-weight:800;color:var(--tx3);padding:2px 0 6px}
.sch-dow.sun{color:#ef4444}.sch-dow.sat{color:#3b82f6}
.sch-week-block{border-bottom:1px solid var(--bdr);padding:3px 0 5px;position:relative}
.sch-week-block:last-of-type{border-bottom:none}
.sch-daynum-row{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));position:relative;z-index:1}
.sch-daynum-cell{text-align:center;font-size:11px;font-weight:800;color:var(--tx2);cursor:pointer;padding:2px 0;border-radius:7px}
.sch-daynum-cell.other{opacity:.32}
.sch-daynum-cell.sun{color:#ef4444}
.sch-daynum-cell.sat{color:#3b82f6}
.sch-daynum-cell.today{background:var(--a);color:#fff;box-shadow:0 0 0 2px var(--a10)}
.sch-daynum-cell.selected{font-weight:900}
/* ★ 선택한 날짜: 숫자만 동그랗게가 아니라, 그 날짜의 이벤트 막대까지 포함해서
   세로로 길게 박스 하나로 감싸서 "그 날짜 칸 전체"를 고른 것처럼 보이게 함 */
.sch-sel-col{position:absolute;top:2px;bottom:2px;width:calc(100% / 7);border-radius:10px;background:var(--a10);pointer-events:none;z-index:0}
.sch-track-row{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:2px;margin-top:2px;position:relative;z-index:1}
.sch-bar{position:relative;grid-row:1;height:15px;line-height:15px;font-size:8.5px;font-weight:700;color:#fff;padding:0 4px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;cursor:pointer;text-shadow:0 1px 1.5px rgba(0,0,0,.35)}
/* ★ 컴팩트 스타일 전용 — 달력 자체도 더 촘촘하게(한 화면에 더 많은 주가 보이도록) */
.db-style-compact .sch-week-block{padding:1px 0 3px}
.db-style-compact .sch-daynum-cell{font-size:10px;padding:1px 0}
.db-style-compact .sch-bar{height:12px;line-height:12px;font-size:7.5px}
.db-style-compact .sch-dow{font-size:9px;padding:1px 0 4px}
.db-style-compact .sch-legend{display:none}
.sch-bar-draggable{padding:0 9px}
.sch-resize-handle{position:absolute;top:0;bottom:0;width:9px;cursor:col-resize;touch-action:none}
.sch-resize-handle.l{left:0}
.sch-resize-handle.r{right:0}
.sch-resize-handle::after{content:'';position:absolute;top:50%;left:50%;width:3px;height:9px;background:rgba(255,255,255,.85);border-radius:2px;transform:translate(-50%,-50%)}
.sch-bar-dragging{box-shadow:0 0 0 2px #fff,0 2px 6px rgba(0,0,0,.3);z-index:5}
.sch-drag-tip{position:fixed;transform:translate(-50%,0);background:var(--tx,#111);color:#fff;font-size:11px;font-weight:700;padding:4px 9px;border-radius:8px;pointer-events:none;z-index:4000;white-space:nowrap;box-shadow:0 4px 12px rgba(0,0,0,.25)}
.sch-overflow-row{margin-top:1px}
.sch-overflow-cell{text-align:center;font-size:8px;font-weight:800;color:var(--tx3);cursor:pointer}
.sch-legend{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px;padding-top:10px;border-top:1px dashed var(--bdr)}
.sch-legend-item{display:flex;align-items:center;gap:4px;font-size:10.5px;font-weight:600;color:var(--tx3);background:var(--card2);border-radius:999px;padding:3px 8px 3px 6px}
.sch-legend-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0}

/* 오늘의 수업 (캘린더 우측 패널) */
.sch-tdc-hdr{display:flex;align-items:baseline;gap:7px;margin-bottom:9px}
.sch-tdc-title{font-size:12.5px;font-weight:800;color:var(--tx3);letter-spacing:.4px}
.sch-tdc-date{font-size:11.5px;color:var(--tx3);opacity:.75}
.sch-tdc-grid{display:flex;flex-wrap:wrap;gap:8px}
.sch-tdc-card{flex:0 1 175px;display:flex;align-items:center;gap:9px;padding:10px 12px;border-radius:12px;background:var(--card2);border:1px solid var(--bdr);cursor:pointer;transition:all .15s}
.sch-tdc-card:active{transform:scale(.95);background:var(--surf2)}
.sch-tdc-card.now{border-color:var(--a);background:var(--a10)}
.sch-tdc-num{width:24px;height:24px;border-radius:50%;background:var(--a);color:#fff;font-size:11.5px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.sch-tdc-card.now .sch-tdc-num{background:#ef4444}
.sch-tdc-info{min-width:0}
.sch-tdc-time2{font-size:11px;font-weight:700;color:var(--a);margin-bottom:1px;white-space:nowrap}
.sch-tdc-card.now .sch-tdc-time2{color:#ef4444}
.sch-tdc-name2{font-size:13.5px;font-weight:800;color:var(--tx);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sch-tdc-stucnt{font-size:11.5px;font-weight:600;color:var(--tx3);margin-left:2px}
.sch-tdc-empty{text-align:center;color:var(--tx3);font-size:13px;padding:24px 10px;background:var(--card2);border-radius:12px;border:1px dashed var(--bdr2)}
.sch-tdc-suppress{background:var(--a10);border:1px solid var(--a40);border-radius:12px;padding:14px}
.sch-tdc-suppress-title{font-size:13.5px;font-weight:700;color:var(--tx);text-align:center}
.sch-tdc-suppress-note{font-size:12.5px;color:var(--tx2);text-align:center;margin-top:6px;padding-top:6px;border-top:1px dashed var(--a40)}
.sch-empty-mini{text-align:center;color:var(--tx3);font-size:12.5px;padding:20px 6px;line-height:1.5}

/* ══ 컴팩트 스타일 — 다가오는 2주 아젠다 리스트 ══ */
.sch-agenda-wrap{display:flex;flex-direction:column;gap:2px}
.sch-agenda-detail{margin-top:14px;padding-top:14px;border-top:1px solid var(--bdr)}
.sch-agenda-row{display:flex;gap:12px;padding:9px 2px;border-bottom:1px solid var(--bdr)}
.sch-agenda-row:last-child{border-bottom:none}
.sch-agenda-date{flex-shrink:0;width:42px;text-align:center}
.sch-agenda-daynum{font-size:16px;font-weight:800;color:var(--tx)}
.sch-agenda-date.today .sch-agenda-daynum{color:var(--a)}
.sch-agenda-dow{font-size:9.5px;font-weight:700;color:var(--tx3);margin-top:1px}
.sch-agenda-date.today .sch-agenda-dow{color:var(--a)}
.sch-agenda-items{flex:1;display:flex;flex-direction:column;gap:5px;min-width:0}
.sch-agenda-item{font-size:12.5px;font-weight:600;color:var(--tx);border-left:3px solid var(--a);padding:2px 0 2px 9px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sch-agenda-done{color:var(--green)}

/* ══ 히어로 스타일 — 오늘 강조 카드 ══ */
.sch-hero-today{background:linear-gradient(135deg,var(--a),#7c3aed);border-radius:16px;padding:14px 16px;margin-bottom:14px;color:#fff}
.sch-hero-today-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
.sch-hero-today-date{font-size:13px;font-weight:700;color:rgba(255,255,255,.85)}
.sch-hero-today-count{font-size:16px;font-weight:900;color:#fff}
.sch-hero-item{font-size:12.5px;font-weight:600;color:#fff;background:rgba(255,255,255,.18);border-radius:8px;padding:6px 10px;margin-top:5px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sch-hero-empty{font-size:12px;color:rgba(255,255,255,.8);margin-top:2px}

/* 일자 상세 (우측 패널 인라인) */
.sch-item-row{display:flex;align-items:flex-start;gap:9px;background:var(--card2);border:1px solid var(--bdr);border-radius:11px;padding:10px;margin-bottom:6px}
.sch-item-row.sch-item-clickable{cursor:pointer;transition:all .15s}
.sch-item-row.sch-item-clickable:active{transform:scale(.98);background:var(--surf2)}
.sch-item-row.sch-item-done{opacity:.6}
.sch-item-row.sch-item-done .sch-item-title{text-decoration:line-through}
.sch-item-row.sch-item-done .sch-item-memo{text-decoration:line-through}
.sch-item-suppress-tag{font-size:11.5px;color:var(--a);font-weight:700;margin-top:5px;padding-top:5px;border-top:1px dashed var(--bdr2)}
.sch-item-ico{font-size:18px;flex-shrink:0}
.sch-item-body{flex:1;min-width:0}
.sch-item-title{font-size:14px;font-weight:700;color:var(--tx)}
.sch-item-repeat-tag{font-size:10px;font-weight:800;color:var(--a);background:var(--a10);padding:1px 6px;border-radius:999px;vertical-align:middle}
.sch-item-meta{font-size:11.5px;color:var(--tx3);margin-top:1px}
.sch-item-memo{font-size:12.5px;color:var(--tx2);margin-top:4px;white-space:pre-line}
.sch-item-acts{display:flex;gap:5px;flex-shrink:0}
.sch-item-ibtn{width:29px;height:29px;border-radius:9px;background:var(--surf2);border:1px solid var(--bdr);display:flex;align-items:center;justify-content:center;font-size:13.5px;cursor:pointer}
.sch-badge{font-size:10.5px;font-weight:800;border-radius:999px;padding:3px 8px;flex-shrink:0}
.sch-badge.ok{background:rgba(34,197,94,.14);color:#16a34a}
.sch-badge.warn{background:rgba(239,68,68,.12);color:#ef4444}
.sch-badge.info{background:var(--a10);color:var(--a)}

/* 팝업 (알림 있는 일정) */
.sch-pop-ov{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:3000;display:flex;align-items:center;justify-content:center;padding:20px}
.sch-pop-box{background:var(--card,#fff);border-radius:18px;padding:24px;max-width:400px;width:100%;box-shadow:0 12px 40px rgba(0,0,0,.35);animation:schPop .25s cubic-bezier(.34,1.56,.64,1)}
@keyframes schPop{from{transform:scale(.9);opacity:0}to{transform:scale(1);opacity:1}}
.sch-pop-ico{font-size:34px;margin-bottom:10px}
.sch-pop-title{font-size:18px;font-weight:800;color:var(--tx);margin-bottom:6px}
.sch-pop-dday{font-size:12.5px;font-weight:800;color:var(--a);background:var(--a10);display:inline-block;padding:3px 10px;border-radius:999px;margin-bottom:8px}
.sch-pop-msg{font-size:14.5px;color:var(--tx2);line-height:1.6;white-space:pre-line;margin-bottom:18px}
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
  // 학생 입학 기념일: 매년 같은 월-일에 "N년차"로 반복 표시
  let _enrollDbgDone = false;
  // ★ 엑셀 일괄 업로드로 들어온 입학일은 '2024.3.5', '2024/03/05', '24-3-5'처럼
  //   형식이 제각각일 수 있어, 구분자·자릿수에 상관없이 최대한 인식한다.
  function _parseEnrollDate(raw) {
    const s = (raw || '').toString().trim();
    if (!s) return null;
    // ★ 구분자 없는 8자리(YYYYMMDD) 또는 6자리(YYMMDD) 형식 — 예: "20251109"
    let m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (m) {
      const y = +m[1], mo = +m[2], d = +m[3];
      if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return { y, m: mo, d };
    }
    m = s.match(/^(\d{2})(\d{2})(\d{2})$/);
    if (m) {
      const y = (Number(m[1]) < 50 ? 2000 : 1900) + Number(m[1]);
      const mo = +m[2], d = +m[3];
      if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return { y, m: mo, d };
    }
    // ★ 구분자가 있는 형식 — "2024.3.5", "2024/03/05", "24-3-5" 등
    m = s.match(/^(\d{2,4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})/);
    if (!m) return null;
    let [, y, mo, d] = m;
    y = y.length === 2 ? (Number(y) < 50 ? '20' + y : '19' + y) : y; // 2자리 연도 보정
    y = +y; mo = +mo; d = +d;
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return { y, m: mo, d };
  }
  function _buildEnrollMap(year, month) {
    const map = {};
    if (typeof StudentDB === 'undefined') { if (!_enrollDbgDone) console.warn('[ScheduleApp] 입학기념일: StudentDB를 찾을 수 없음(로드 순서 확인 필요)'); return map; }
    const dim = new Date(year, month, 0).getDate();
    const all = StudentDB.getAll ? StudentDB.getAll() : [];
    let skippedStatus = 0, skippedNoDate = 0, skippedBadFormat = 0, matched = 0;
    all.forEach(s => {
      if (s.status && s.status !== '재원') { skippedStatus++; return; } // 재원생만 표시
      if (!(s.enrollDate || '').toString().trim()) { skippedNoDate++; return; }
      const parsed = _parseEnrollDate(s.enrollDate);
      if (!parsed) { skippedBadFormat++; return; }
      const { y: ey, m: em, d: edd } = parsed;
      if (em !== month || year < ey) return; // 이 달이 아니거나 입학 전 연도면 제외(정상 스킵, 오류 아님)
      matched++;
      const day = Math.min(edd, dim);
      const dateStr = `${year}-${_pad(month)}-${_pad(day)}`;
      const years = year - ey; // 입학한 해=0(신입), 1년 지난 첫 기념일=1, 그다음=2...
      const isNew = years === 0;
      (map[dateStr] = map[dateStr] || []).push({ ...s, years, isNew });
    });
    // ★ 진단 로그 — 콘솔에 딱 한 번만 찍어서 원인을 바로 알 수 있게 함
    if (!_enrollDbgDone) {
      _enrollDbgDone = true;
      console.info(`[ScheduleApp] 입학기념일 진단 — 전체 ${all.length}명 / 재원아님 ${skippedStatus} / 입학일없음 ${skippedNoDate} / 형식인식실패 ${skippedBadFormat} / 이번달 매칭 ${matched}`);
      if (skippedBadFormat > 0) {
        console.info('[ScheduleApp] 형식 인식 실패한 enrollDate 샘플:',
          all.filter(s => (s.enrollDate || '').toString().trim() && !_parseEnrollDate(s.enrollDate)).slice(0, 5).map(s => s.enrollDate));
      }
    }
    return map;
  }
  function _mergedEnrollMap(days) {
    const map = {};
    _uniqueYM(days).forEach(({ y, m }) => { const em = _buildEnrollMap(y, m); Object.keys(em).forEach(k => { map[k] = (map[k] || []).concat(em[k]); }); });
    return map;
  }
  function _enrollLabel(s) {
    const nick = (s.nickname || '').trim();
    const nameFull = nick ? `${s.name}(${nick})` : s.name;
    return `${s.isNew ? '[입학]' : `[${s.years}Y]`} ${nameFull}`;
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
  // 공지의 "이 날짜가 속한 회차"가 완료 처리됐는지 판단 (1회성=날짜 자체, 매월반복=연-월)
  function _noticePeriodKey(n, dateStr) {
    return n.scheduleType === 'monthly' ? dateStr.slice(0, 7) : (n.onceDate || dateStr);
  }
  function _noticeIsCompleted(n, dateStr) {
    const pk = _noticePeriodKey(n, dateStr);
    return !!(n.completedPeriods && n.completedPeriods[pk]);
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
        events.push({ kind: 'sched', id: s.id, title: `${cat.ico} ${s.title}`, color: cat.color, startDate: s.startDate, endDate: end, onclick: `ScheduleApp.openDayDetail('${s.startDate}')` });
      });
    }
    const payMap = _mergedPaydayMap(days);
    Object.keys(payMap).forEach(dateStr => {
      const list = payMap[dateStr];
      const label = list.length > 1 ? `💰 급여일 ${list.length}명` : `💰 ${list[0].name} 급여일`;
      events.push({ title: label, color: PAY_COLOR, startDate: dateStr, endDate: dateStr, onclick: `ScheduleApp.openDayDetail('${dateStr}')` });
    });
    const enrollMap = _mergedEnrollMap(days);
    Object.keys(enrollMap).forEach(dateStr => {
      const list = enrollMap[dateStr];
      const label = list.length > 1 ? `🎓 입학기념일 ${list.length}명` : `🎓 ${_enrollLabel(list[0])}`;
      events.push({ title: label, color: ENROLL_COLOR, startDate: dateStr, endDate: dateStr, onclick: `ScheduleApp.openDayDetail('${dateStr}')` });
    });
    const noticeMap = _mergedNoticeMap(days);
    Object.keys(noticeMap).forEach(dateStr => {
      const list = noticeMap[dateStr];
      const allDone = list.every(n => _noticeIsCompleted(n, dateStr));
      const label = list.length > 1 ? `🔔 공지 ${list.length}건` : `🔔 ${list[0].title}`;
      events.push({ title: label, color: NOTICE_COLOR, startDate: dateStr, endDate: dateStr, onclick: `ScheduleApp.openDayDetail('${dateStr}')`, done: allDone });
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

  /* ★ 달력 확대/축소 — 오른쪽 또는 아래쪽 테두리를 드래그하면 달력 내용
   *   (요일줄+주간칸+범례) 전체가 그 자리에서 확대/축소된다(CSS zoom).
   *   박스 크기만 커지고 속은 그대로인 게 아니라 실제로 글자·칸 크기가
   *   커진다. 스크롤은 절대 생기지 않는다(overflow:visible, 고정
   *   px 크기 없음) — 늘어난 만큼 레이아웃이 자연스럽게 다시 흐른다.
   *   달력이 커지면 같은 줄에 있는 오른쪽 "이 날의 일정" 패널은 남는
   *   공간이 줄어드는데, 그 패널 쪽은 ResizeObserver로 실제 렌더링된
   *   폭 변화를 그대로 감지해서 자기 글자 크기(zoom)를 자동으로 맞춘다
   *   — 달력 쪽 드래그와 상세 패널 쪽 축소가 늘 같이 맞물려 움직인다. */
  const CAL_ZOOM_KEY = 'sch_cal_zoom';
  const ZOOM_MIN = 0.7, ZOOM_MAX = 2.2;
  let _tdcBaseW = 0; // 상세 패널의 "줌 1.0" 기준 폭(최초 측정값)
  // ★ 휴대폰처럼 좁은 화면인지 — 이 경우 드래그 확대/축소 기능 자체를 끈다.
  //   (마우스로 테두리를 끌어 크기를 조절하는 PC용 기능인데, 터치에도 반응하다 보니
  //   확대된 상태가 저장되면 달력이 화면 폭보다 커져서 좌우로 밀리는 문제가 있었다)
  function _isNarrowViewport() { return window.innerWidth <= 700; }

  function _getSavedCalZoom() {
    if (_isNarrowViewport()) return 1; // ★ 좁은 화면에서는 항상 100% 고정
    const v = parseFloat(localStorage.getItem(CAL_ZOOM_KEY));
    return (v && v >= ZOOM_MIN && v <= ZOOM_MAX) ? v : 1;
  }
  function _setCalZoom(z) {
    const narrow = _isNarrowViewport();
    if (narrow) z = 1; // ★ 좁은 화면에서는 드래그로도 100%를 벗어날 수 없게 막음
    z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
    const calZoomEl = _q('sch-cal-zoom');
    if (calZoomEl) calZoomEl.style.zoom = z;
    // ★ 좁은 화면에서 강제로 1로 고정한 값은 저장하지 않는다 — 넓은 화면(PC 등)에서
    //   설정해둔 확대 배율이 휴대폰으로 잠깐 봤다고 지워지면 안 되므로.
    if (!narrow) { try { localStorage.setItem(CAL_ZOOM_KEY, String(z)); } catch (e) {} }
    return z;
  }

  function _restoreWidgetSize() {
    _setCalZoom(_getSavedCalZoom());
  }

  /* ★ 상세 패널 자동 맞춤 — 달력이 커져서 옆 칸이 좁아지면, 그 좁아진
   *   실제 폭을 감지해서 상세 패널 글자도 같이 줄어들게(반대로 넓어지면
   *   같이 커지게) 한다. 원인(달력 드래그)과 결과(옆 칸 축소)를 직접
   *   계산하지 않고, "지금 실제로 렌더링된 폭이 얼마인가"만 관찰해서
   *   반응하므로 화면 크기 변화 등 다른 원인으로 좁아져도 항상 맞다. */
  function _bindTdcAutoZoom() {
    const tdcCol  = document.querySelector('.sch-tdc-col');
    const tdcZoom = _q('sch-tdc-zoom');
    if (!tdcCol || !tdcZoom || typeof ResizeObserver === 'undefined') return;
    // ★ 버그 수정: 예전엔 _tdcBaseW를 모듈 전역에 딱 한 번만 저장해두고 계속 재사용해서,
    //   레이아웃이 바뀐 뒤에도(예: 다른 렌더의 낡은 기준폭) 우측 상세 패널 글자가
    //   PC에서도 이유 없이 왼쪽 달력보다 작고 흐릿하게(줌 비정수 배율 → 서브픽셀 렌더링)
    //   보이는 문제가 있었다. 매 렌더마다 기준을 새로 잡고, 이전 감시자는 정리한다.
    _tdcBaseW = 0;
    if (tdcCol._ro) { try { tdcCol._ro.disconnect(); } catch (e) {} }

    let raf = null;
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect?.width;
      if (!w) return;
      // ★ 달력을 수동으로 확대해둔 상태가 아니라면(기본값) 우측 패널은 항상 정확히
      //   100%로 고정한다 — 흐려지거나 작아 보일 이유가 전혀 없는 게 정상 상태다.
      if (_getSavedCalZoom() <= 1) {
        tdcZoom.style.zoom = 1;
        _tdcBaseW = w;
        return;
      }
      if (!_tdcBaseW) {
        const curZoom = parseFloat(tdcZoom.style.zoom) || 1;
        _tdcBaseW = w / curZoom;
        return;
      }
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const ratio = Math.max(ZOOM_MIN, Math.min(1.15, w / _tdcBaseW));
        tdcZoom.style.zoom = ratio;
      });
    });
    tdcCol._ro = ro;
    ro.observe(tdcCol);
  }

  function _bindWidgetResizeSave() {
    const wrap = _q('sch-resizable-wrap');
    if (!wrap || wrap._resizeBound) return;
    wrap._resizeBound = true;
    // ★ 휴대폰 화면에서는 드래그 확대/축소 기능 자체를 끈다(터치 스크롤과 충돌 방지,
    //   화면 폭을 벗어나는 문제의 근본 원인 제거) — 넓은 화면(PC 등)에서만 제공.
    if (_isNarrowViewport()) return;

    if (!wrap.querySelector('.sch-widget-resize-handle')) {
      [
        { cls: 'e',  cursor: 'ew-resize',   axis: 'x' },
        { cls: 's',  cursor: 'ns-resize',   axis: 'y' },
        { cls: 'se', cursor: 'nwse-resize', axis: 'xy' },
      ].forEach(d => {
        const h = document.createElement('div');
        h.className = `sch-widget-resize-handle rh-${d.cls}`;
        h.style.cursor = d.cursor;
        wrap.appendChild(h);
        _bindHandleDrag(h, d.axis);
      });
    }
    _bindTdcAutoZoom();
  }

  function _bindHandleDrag(handle, axis) {
    function start(e) {
      e.preventDefault(); e.stopPropagation();
      const isTouch = e.type === 'touchstart';
      const p0 = isTouch ? e.touches[0] : e;
      const startX = p0.clientX, startY = p0.clientY;
      const startZoom = _getSavedCalZoom();
      const wrap = _q('sch-resizable-wrap');
      wrap?.classList.add('resizing');

      function move(ev) {
        const p = isTouch ? ev.touches[0] : ev;
        const dx = p.clientX - startX, dy = p.clientY - startY;
        // ★ 오른쪽/아래로 끌수록 확대, 왼쪽/위로 끌수록 축소 — 두 축을
        //   합쳐서 하나의 배율로 반영한다(200px 드래그 ≈ 배율 1.0 변화)
        let delta = 0;
        if (axis === 'x')  delta = dx / 200;
        if (axis === 'y')  delta = dy / 200;
        if (axis === 'xy') delta = (dx + dy) / 2 / 200;
        _setCalZoom(startZoom + delta);
      }
      function end() {
        wrap?.classList.remove('resizing');
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', end);
        document.removeEventListener('touchmove', move);
        document.removeEventListener('touchend', end);
      }
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', end);
      document.addEventListener('touchmove', move, { passive: false });
      document.addEventListener('touchend', end);
    }
    handle.addEventListener('mousedown', start);
    handle.addEventListener('touchstart', start, { passive: false });
  }

  /* ═══════════════════════════════════════════════════════════
   * 대시보드 스타일별 대안 프레젠테이션
   * - compact: 달력 그리드 대신 "다가오는 2주" 아젠다 리스트(Linear식 목록형)
   * - hero: 기존 달력 그리드 위에 "오늘" 히어로 카드를 하나 더 얹음(Stripe식 단일 포커스)
   * ═══════════════════════════════════════════════════════════ */
  function _agendaViewHtml() {
    const todayStr = _todayStr();
    const days = [];
    for (let i = 0; i < 14; i++) {
      const ds = _addDays(todayStr, i);
      const d = new Date(ds + 'T00:00:00');
      days.push({ dateStr: ds, cellDay: d.getDate(), dow: d.getDay() });
    }
    const events = _buildBarEvents(days);
    const byDate = {};
    days.forEach(d => { byDate[d.dateStr] = []; });
    // ★ 아젠다는 목록형이라 여러 날에 걸친 일정을 매일 반복 표시하지 않고 시작일에만 표시
    events.forEach(e => { if (byDate[e.startDate] !== undefined) byDate[e.startDate].push(e); });
    const rows = days.map(d => {
      const items = byDate[d.dateStr];
      if (!items.length) return '';
      const isToday = d.dateStr === todayStr;
      return `<div class="sch-agenda-row">
        <div class="sch-agenda-date${isToday ? ' today' : ''}" onclick="ScheduleApp.openDayDetail('${d.dateStr}')" style="cursor:pointer">
          <div class="sch-agenda-daynum">${d.cellDay}</div>
          <div class="sch-agenda-dow">${isToday ? '오늘' : DAYS_KO[d.dow]}</div>
        </div>
        <div class="sch-agenda-items">
          ${items.map(e => `<div class="sch-agenda-item" style="border-left-color:${e.color}" onclick="${e.onclick}">${_esc(e.title)}${e.done ? ' <span class="sch-agenda-done">✔</span>' : ''}</div>`).join('')}
        </div>
      </div>`;
    }).filter(Boolean).join('');
    return rows || `<div class="sch-empty-mini">앞으로 2주간 예정된 일정이 없습니다</div>`;
  }
  function _heroTodayCardHtml() {
    const todayStr = _todayStr();
    const scheds = _schedulesOn(todayStr);
    const now = new Date();
    const count = scheds.length;
    const itemsHtml = scheds.slice(0, 3).map(s => {
      const cat = CATS[s.category] || CATS.general;
      return `<div class="sch-hero-item" onclick="ScheduleApp.openDayDetail('${todayStr}')">${cat.ico} ${_esc(s.title)}</div>`;
    }).join('');
    return `<div class="sch-hero-today">
      <div class="sch-hero-today-top">
        <div class="sch-hero-today-date">${now.getMonth() + 1}월 ${now.getDate()}일 (${DAYS_KO[now.getDay()]})</div>
        <div class="sch-hero-today-count">오늘 일정 ${count}건</div>
      </div>
      ${itemsHtml || '<div class="sch-hero-empty">오늘은 등록된 일정이 없어요 🍃</div>'}
    </div>`;
  }

  function renderMiniCalendar(containerId) {
    if (typeof ScheduleDB === 'undefined') return;
    _mountId = containerId;
    const el = _q(containerId);
    if (!el) return;
    const dashStyle = (typeof DashboardApp !== 'undefined' && DashboardApp._dashStyle) ? DashboardApp._dashStyle() : 'minimal';
    const monthLabelEl = document.getElementById('sch-month-label');
    // ★ 스타일과 무관하게 달력 그리드·날짜 상세 패널(등록·근무기록·공지 등)은
    //   항상 그대로 나온다. "스타일이 다르게 보인다"는 건 톤·강조 방식이 바뀌는
    //   것이지 기능이 빠지는 게 아니다 — 특히 PC에서는 공간이 넉넉하므로 더더욱.

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
    const canDrag = _isAdmin(); // ★ 일정 막대 드래그 리사이즈는 관리자만
    const weekDatesJson = week => _esc(JSON.stringify(week.map(d => d.dateStr)));

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
          const doneStyle = seg.ev.done ? ';text-decoration:line-through;opacity:.6' : '';
          const draggable = canDrag && seg.ev.kind === 'sched';
          const lHandle = draggable && seg.isTrueStart ? '<span class="sch-resize-handle l" data-side="l" onclick="event.stopPropagation()"></span>' : '';
          const rHandle = draggable && seg.isTrueEnd ? '<span class="sch-resize-handle r" data-side="r" onclick="event.stopPropagation()"></span>' : '';
          return `<div class="sch-bar${draggable ? ' sch-bar-draggable' : ''}" data-ev-id="${seg.ev.id || ''}" style="grid-column:${seg.segStartIdx + 1} / span ${span};background:${seg.ev.color};border-radius:${rl} ${rr} ${rr} ${rl}${dim2}${doneStyle}"
            onclick="${seg.ev.onclick}" title="${_esc(seg.ev.title)}${seg.ev.done ? ' (완료)' : ''}">${lHandle}${showLabel ? _esc(seg.ev.title) : ''}${rHandle}</div>`;
        }).join('');
        return `<div class="sch-track-row" data-week-dates="${weekDatesJson(week)}">${barsHtml}</div>`;
      }).join('');
      const hasOverflow = overflowByDay.some(n => n > 0);
      const overflowHtml = hasOverflow
        ? `<div class="sch-track-row sch-overflow-row">${week.map((d, i) => overflowByDay[i] > 0
            ? `<div class="sch-overflow-cell" onclick="ScheduleApp.openDayDetail('${d.dateStr}')">+${overflowByDay[i]}</div>`
            : `<div></div>`).join('')}</div>`
        : '';
      // ★ 이 주(week)에 선택된 날짜가 있으면, 숫자뿐 아니라 그 아래 이벤트 막대까지
      //   전부 감싸는 세로 박스를 하나 깔아준다(숫자만 동그랗게 표시되던 문제 개선)
      const selIdx = week.findIndex(d => d.dateStr === _selDate);
      const selColHtml = selIdx >= 0 ? `<div class="sch-sel-col" style="left:calc(${selIdx} * (100% / 7))"></div>` : '';
      return `<div class="sch-week-block">
        ${selColHtml}
        <div class="sch-daynum-row">${daynumHtml}</div>
        ${trackRowsHtml}
        ${overflowHtml}
      </div>`;
    }).join('');
    const dowHtml = DAYS_KO.map((d, i) => `<div class="sch-dow${i === 0 ? ' sun' : ''}${i === 6 ? ' sat' : ''}">${d}</div>`).join('');

    // ★ "🗓️ 일정표" 대시보드 섹션 헤더와 별도 줄로 중복 표시되던 월 제목을 없애고,
    //   같은 행에 있는 외부 라벨(#sch-month-label)만 갱신한다.
    if (monthLabelEl) monthLabelEl.textContent = `${year}년 ${month}월`;

    // ★ 히어로 스타일 — 달력 그리드는 그대로 두되, 그 위에 "오늘"을 크게 강조하는 카드를 얹는다
    const heroCardHtml = dashStyle === 'hero' ? _heroTodayCardHtml() : '';

    el.innerHTML = `
      ${heroCardHtml}
      <div class="sch-widget-layout">
        <div class="sch-cal-col">
          <div id="sch-resizable-wrap" class="sch-resizable-wrap">
            <div class="sch-resize-hint" title="오른쪽/아래쪽 테두리를 드래그해서 달력을 확대·축소할 수 있어요 — 오른쪽 상세 패널은 자동으로 맞춰집니다">⤡</div>
            <div id="sch-cal-zoom" class="sch-zoom-inner">
              <div class="sch-dow-row">${dowHtml}</div>
              ${weeksHtml}
              <div class="sch-legend">
                ${Object.values(CATS).map(c => `<span class="sch-legend-item"><span class="sch-legend-dot" style="background:${c.color}"></span>${c.ico} ${c.label}</span>`).join('')}
                <span class="sch-legend-item"><span class="sch-legend-dot" style="background:${PAY_COLOR}"></span>💰 급여일</span>
                <span class="sch-legend-item"><span class="sch-legend-dot" style="background:${WORK_COLOR}"></span>👤 근무기록</span>
                <span class="sch-legend-item"><span class="sch-legend-dot" style="background:${NOTICE_COLOR}"></span>🔔 공지</span>
                <span class="sch-legend-item"><span class="sch-legend-dot" style="background:${ENROLL_COLOR}"></span>🎓 입학기념일</span>
              </div>
            </div>
          </div>
        </div>
        <div class="sch-tdc-col">
          <div id="sch-tdc-zoom" class="sch-zoom-inner">
            <div id="sch-selday-panel">${_selDayPanelHtml(_selDate || todayStr)}</div>
          </div>
        </div>
      </div>
      <div class="sch-today-divider"></div>
      <div class="sch-today-section">${_todayClassesHtml()}</div>`;
    _restoreWidgetSize();
    _bindWidgetResizeSave();

    // ★ 근무 빠른 등록 폼의 분류(일반/수업) 토글 버튼 바인딩 (innerHTML로 삽입되므로 렌더 후 별도 연결 필요)
    const waType = _q('sch-wa-type');
    if (waType) waType.querySelectorAll('.ntc-pill').forEach(b => b.onclick = () => {
      waType.querySelectorAll('.ntc-pill').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
    });
    // ★ 일정 막대 드래그 리사이즈 핸들 바인딩 (마우스/터치 공통, 관리자만)
    el.querySelectorAll('.sch-resize-handle').forEach(h => h.addEventListener('pointerdown', _onResizeStart));
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
  // 오늘 날짜가 "정규 수업 숨기기"로 설정된 일정(방학·임시휴강 등) 기간에 속하는지 확인
  function _todaySuppression() {
    if (typeof ScheduleDB === 'undefined') return null;
    const todayStr = _todayStr();
    return ScheduleDB.getAll().find(s => s.suppressClasses && s.startDate <= todayStr && (s.endDate || s.startDate) >= todayStr) || null;
  }
  function _todayClassesHtml() {
    const now = new Date();
    const todayDow = DAYS_KO[now.getDay()];
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const dateLabel = `${now.getMonth() + 1}월 ${now.getDate()}일 (${todayDow})`;
    const hdr = `<div class="sch-tdc-hdr"><span class="sch-tdc-title">📅 오늘의 수업</span><span class="sch-tdc-date">${dateLabel}</span></div>`;

    const suppress = _todaySuppression();
    if (suppress) {
      const cat = CATS[suppress.category] || CATS.general;
      return `${hdr}<div class="sch-tdc-suppress">
        <div class="sch-tdc-suppress-title">${cat.ico} ${_esc(suppress.title)} 기간이라 정규 수업이 없어요</div>
        ${suppress.specialNote ? `<div class="sch-tdc-suppress-note">🎤 특강 안내: ${_esc(suppress.specialNote)}</div>` : ''}
      </div>`;
    }

    const byClass = (typeof StudentDB !== 'undefined' && StudentDB.getStats) ? (StudentDB.getStats().byClass || {}) : {};
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
    let html = hdr;
    if (!list.length) { html += `<div class="sch-tdc-empty">🎈 오늘은 예정된 수업이 없어요</div>`; return html; }
    html += `<div class="sch-tdc-grid">${list.map(({ cls, dt, startMin, endMin }, idx) => {
      const inSession = startMin !== null && endMin !== null && nowMin >= startMin && nowMin <= endMin;
      const timeTxt = dt ? _fmtTime(dt) : '시간 미정';
      const stuCount = byClass[(cls.name || '').trim()] || 0;
      return `<div class="sch-tdc-card${inSession ? ' now' : ''}" onclick="App.goClass('${cls.id}')">
        <span class="sch-tdc-num">${idx + 1}</span>
        <div class="sch-tdc-info">
          <div class="sch-tdc-time2">${_esc(timeTxt)}${inSession ? ' · 진행중' : ''}</div>
          <div class="sch-tdc-name2">${_esc(cls.name)}반 <span class="sch-tdc-stucnt">👤 ${stuCount}명</span></div>
        </div>
      </div>`;
    }).join('')}</div>`;
    return html;
  }

  /* ═══════════════════════════════════════════════════════════
   * 일정 막대 드래그 리사이즈 — 마우스/터치로 시작일·종료일을 늘렸다 줄였다
   *   (관리자만 가능, 일정(schedule) 항목만 대상 — 급여일/공지/근무기록은 제외)
   * ═══════════════════════════════════════════════════════════ */
  let _dragSt = null;
  let _dragTipEl = null;

  function _onResizeStart(e) {
    e.stopPropagation();
    e.preventDefault();
    const handle = e.currentTarget;
    const bar = handle.closest('.sch-bar');
    const trackRow = bar?.closest('.sch-track-row');
    if (!bar || !trackRow) return;
    const id = bar.dataset.evId;
    const item = ScheduleDB.getById(id);
    if (!item) return;
    const weekDates = JSON.parse(trackRow.dataset.weekDates || '[]');
    _dragSt = { id, side: handle.dataset.side, weekDates, start: item.startDate, end: item.endDate };
    handle.setPointerCapture(e.pointerId);
    bar.classList.add('sch-bar-dragging');
    _dragTipEl = document.createElement('div');
    _dragTipEl.className = 'sch-drag-tip';
    document.body.appendChild(_dragTipEl);
    _positionDragTip(e, item.startDate);
    handle.addEventListener('pointermove', _onResizeMove);
    handle.addEventListener('pointerup', _onResizeEnd, { once: true });
    handle.addEventListener('pointercancel', _onResizeEnd, { once: true });
  }
  function _dateFromPointer(e) {
    if (!_dragSt) return null;
    // 현재 보이는 모든 트랙 행 중, 포인터의 y좌표가 속한 "주(week)"를 찾아 그 주의 날짜 배열을 사용
    // (같은 주 내에서 좌우로만 움직이는 일반적인 리사이즈는 트랙 자체의 폭으로 계산)
    const rows = document.querySelectorAll('.sch-track-row');
    let targetRow = null;
    for (const r of rows) {
      const rect = r.getBoundingClientRect();
      if (e.clientY >= rect.top - 14 && e.clientY <= rect.bottom + 14) { targetRow = r; break; }
    }
    const rect = (targetRow || e.target?.closest('.sch-track-row'))?.getBoundingClientRect();
    if (!rect) return null;
    const weekDates = targetRow ? JSON.parse(targetRow.dataset.weekDates || '[]') : _dragSt.weekDates;
    const colWidth = rect.width / 7;
    let col = Math.floor((e.clientX - rect.left) / colWidth);
    col = Math.max(0, Math.min(6, col));
    return weekDates[col] || null;
  }
  function _positionDragTip(e, dateStr) {
    if (!_dragTipEl || !dateStr) return;
    const d = new Date(dateStr + 'T00:00:00');
    _dragTipEl.textContent = `${d.getMonth() + 1}월 ${d.getDate()}일`;
    _dragTipEl.style.left = `${e.clientX}px`;
    _dragTipEl.style.top = `${e.clientY - 34}px`;
  }
  function _onResizeMove(e) {
    if (!_dragSt) return;
    const dateStr = _dateFromPointer(e);
    if (!dateStr) return;
    if (_dragSt.side === 'l') { if (dateStr <= _dragSt.end) _dragSt.start = dateStr; }
    else { if (dateStr >= _dragSt.start) _dragSt.end = dateStr; }
    _positionDragTip(e, dateStr);
  }
  async function _onResizeEnd(e) {
    const handle = e.currentTarget;
    handle.removeEventListener('pointermove', _onResizeMove);
    const bar = handle.closest('.sch-bar');
    bar?.classList.remove('sch-bar-dragging');
    _dragTipEl?.remove(); _dragTipEl = null;
    if (!_dragSt) return;
    const { id, start, end } = _dragSt;
    _dragSt = null;
    const item = ScheduleDB.getById(id);
    if (item && (item.startDate !== start || item.endDate !== end)) {
      await ScheduleDB.update(id, { startDate: start, endDate: end });
      refresh();
      if (typeof App !== 'undefined' && App._toast) App._toast('✅ 일정 기간이 변경되었습니다', 'success', 2000);
    }
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
    // ★ [오늘로] 버튼을 없애면서 [오늘] 버튼이 그 역할까지 겸하도록 함 —
    //   달력 월 이동뿐 아니라 우측(또는 아래) 상세 패널 선택도 함께 오늘로 되돌린다.
    _selDate = null; _workAddFor = null;
    refresh();
  }
  // ★ 일자 상세 패널의 ‹/›는 달이 아니라 "하루씩" 이동한다(달 이동은 달력 쪽 ‹/›가 담당)
  function _navDay(diff) {
    const base = _selDate || _todayStr();
    const d = new Date(base + 'T00:00:00');
    d.setDate(d.getDate() + diff);
    _selDate = `${d.getFullYear()}-${_pad(d.getMonth() + 1)}-${_pad(d.getDate())}`;
    _st.year = d.getFullYear(); _st.month = d.getMonth() + 1;
    _workAddFor = null;
    refresh();
  }
  // ★ 🗓️ 아이콘 클릭 → 네이티브 날짜 선택기를 열어 원하는 연/월/일로 바로 이동
  function _openDateJump() {
    const inp = _q('sch-date-jump-inp');
    if (!inp) return;
    if (typeof inp.showPicker === 'function') { try { inp.showPicker(); return; } catch (e) {} }
    inp.focus(); inp.click();
  }
  function _jumpToDate(val) {
    if (!val) return;
    const d = new Date(val + 'T00:00:00');
    if (isNaN(d.getTime())) return;
    _selDate = val;
    _st.year = d.getFullYear(); _st.month = d.getMonth() + 1;
    _workAddFor = null;
    refresh();
  }

  // ★ 입학 기념일 항목 클릭 → 학생 탭으로 전환 후 해당 학생 상세 화면 오픈
  function _goStudentDetail(studentId) {
    if (typeof App !== 'undefined' && App.go) App.go('students');
    if (typeof StudentApp !== 'undefined' && StudentApp.openDetail) StudentApp.openDetail(studentId);
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
    const enrollAnns = (_buildEnrollMap(y, m)[dateStr]) || [];
    const workStaff = (typeof StaffDB === 'undefined') ? [] :
      (StaffDB.getActive ? StaffDB.getActive() : []).filter(s => (StaffDB.getWorkDay ? StaffDB.getWorkDay(s.id, dateStr) : []).length > 0);
    const notices = (_buildNoticeMap(y, m)[dateStr]) || [];
    const dueIds = (typeof NoticeApp !== 'undefined' && NoticeApp.getDueList) ? NoticeApp.getDueList().map(n => n.id) : [];

    let html = `<div class="sch-selday-hdr">
      <span class="sch-selday-title sch-selday-title-btn" onclick="ScheduleApp._openDateJump()" title="날짜로 바로 이동">🗓️ ${dateLabel}</span>
      <input type="date" id="sch-date-jump-inp" value="${dateStr}" class="sch-date-jump-inp" onchange="ScheduleApp._jumpToDate(this.value)">
      <div class="sch-selday-navs">
        <button class="sch-today-btn" onclick="ScheduleApp._goToday()">오늘</button>
        <button class="sch-nav-btn" onclick="ScheduleApp._navDay(-1)" title="전날">‹</button>
        <button class="sch-nav-btn" onclick="ScheduleApp._navDay(1)" title="다음날">›</button>
        ${_canRegister() ? `<button class="sch-today-btn sch-add-btn" onclick="ScheduleApp.openEditor(null,'${dateStr}')">➕ 등록</button>` : ''}
      </div>
    </div>`;

    html += `<div class="sch-detail-sec"><div class="sch-detail-sec-title">📌 이 날의 일정</div>`;
    html += scheds.length ? scheds.map(s => {
      const cat = CATS[s.category] || CATS.general;
      const range = s.startDate !== s.endDate ? `${s.startDate} ~ ${s.endDate}` : s.startDate;
      const canEditThis = _canEdit(s);
      return `<div class="sch-item-row">
        <span class="sch-item-ico">${cat.ico}</span>
        <div class="sch-item-body">
          <div class="sch-item-title">${_esc(s.title)}${s.seriesId ? ' <span class="sch-item-repeat-tag">🔁 반복</span>' : ''}</div>
          <div class="sch-item-meta">${cat.label} · ${range}${s.notifyEnabled ? ` · 🔔 ${s.notifyDaysBefore ? `${s.notifyDaysBefore}일 전 ` : ''}${s.notifyTime}` : ''}${s.createdBy ? ` · 👤 ${_esc(s.createdBy)}` : ''}</div>
          ${s.memo ? `<div class="sch-item-memo">${_esc(s.memo)}</div>` : ''}
          ${s.suppressClasses ? `<div class="sch-item-suppress-tag">🚫 이 기간 정규 수업 없음${s.specialNote ? ` · 🎤 ${_esc(s.specialNote)}` : ''}</div>` : ''}
        </div>
        ${canEditThis ? `<div class="sch-item-acts">
          <button class="sch-item-ibtn" title="수정" onclick="ScheduleApp.openEditor('${s.id}')">✏️</button>
          <button class="sch-item-ibtn" title="삭제" onclick="ScheduleApp.deleteItem('${s.id}')">🗑</button>
        </div>` : ''}
      </div>`;
    }).join('') : '<div class="sch-empty-mini">등록된 일정이 없습니다</div>';
    html += `</div>`;

    html += `<div class="sch-detail-sec">
      <div class="sch-detail-sec-title-row">
        <div class="sch-detail-sec-title">👤 근무 기록</div>
        ${isAdmin ? `<button class="sch-mini-add-btn" onclick="ScheduleApp.${_workAddFor === dateStr ? 'closeWorkQuickAdd()' : `openWorkQuickAdd('${dateStr}')`}">${_workAddFor === dateStr ? '✕ 취소' : '➕ 등록'}</button>` : ''}
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

    if (enrollAnns.length) {
      html += `<div class="sch-detail-sec"><div class="sch-detail-sec-title">🎓 학생 입학 기념일</div>`;
      html += enrollAnns.map(s => {
        const nick = (s.nickname || '').trim();
        const nameFull = nick ? `${_esc(s.name)}(${_esc(nick)})` : _esc(s.name);
        const tag = s.isNew ? '[입학]' : `[${s.years}Y]`;
        return `<div class="sch-item-row sch-item-clickable" onclick="ScheduleApp._goStudentDetail('${s.id}')">
          <span class="sch-item-ico">🎓</span>
          <div class="sch-item-body">
            <div class="sch-item-title"><span style="color:${ENROLL_COLOR}">${tag}</span> ${nameFull}</div>
            <div class="sch-item-meta">입학일 ${_esc(s.enrollDate)}</div>
          </div>
        </div>`;
      }).join('');
      html += `</div>`;
    }

    if (notices.length) {
      html += `<div class="sch-detail-sec"><div class="sch-detail-sec-title">🔔 공지 알림</div>`;
      html += notices.map(n => {
        const cat = (typeof NoticeApp !== 'undefined' && NoticeApp.getCatMeta) ? NoticeApp.getCatMeta(n.category) : { ico: '📢' };
        const isDue = dueIds.includes(n.id);
        const isDone = _noticeIsCompleted(n, dateStr);
        return `<div class="sch-item-row${isDone ? ' sch-item-done' : ''}">
          <span class="sch-item-ico">${cat.ico}</span>
          <div class="sch-item-body">
            <div class="sch-item-title">${_esc(n.title)}</div>
            ${n.body ? `<div class="sch-item-memo">${_esc(n.body)}</div>` : ''}
          </div>
          <div class="sch-item-acts">
            ${isDone ? '<span class="sch-badge ok">✔ 완료</span>' : (isDue && isAdmin ? `<button class="sch-item-ibtn" title="완료 처리" onclick="NoticeApp.completeNow('${n.id}');ScheduleApp.refresh()">✅</button>` : (isDue ? `<span class="sch-badge info">확인 필요</span>` : ''))}
            ${isAdmin ? `<button class="sch-item-ibtn" title="수정" onclick="NoticeApp.openEditor('${n.id}')">✏️</button>
            <button class="sch-item-ibtn" title="삭제" onclick="NoticeApp.deleteNotice('${n.id}');ScheduleApp.refresh()">🗑</button>` : ''}
          </div>
        </div>`;
      }).join('');
      html += `</div>`;
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
  /* ═══════════════════════════════════════════════════════════
   * 커스텀 시간 피커 — 네이티브 <input type="time">가 다크모드 등에서
   * 글자가 잘 안 보이거나 어중간하게 렌더링되는 문제를 피하기 위해
   * staff-app.js에서 이미 검증된 방식(오전/오후 + 시·분 select)을 그대로 이식.
   * ═══════════════════════════════════════════════════════════ */
  function _timePicker(id, label, def) {
    const [dh, dm] = (def || '09:00').split(':').map(Number);
    const isAM = dh < 12;
    const h12 = dh % 12 || 12;
    const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
    const MINS = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];
    return `
      <div class="sch-tp-wrap">
        <div class="sch-tp-lbl">${label}</div>
        <div class="sch-tp-row">
          <div class="sch-tp-ampm">
            <button type="button" id="${id}-am" class="${isAM ? 'active' : ''}" onclick="ScheduleApp._tpAmPm('${id}','am')">오전</button>
            <button type="button" id="${id}-pm" class="pm ${!isAM ? 'active' : ''}" onclick="ScheduleApp._tpAmPm('${id}','pm')">오후</button>
          </div>
          <div class="sch-tp-selects">
            <select class="sch-tp-sel" id="${id}-h" onchange="ScheduleApp._tpChange('${id}')">
              ${HOURS.map(h => `<option value="${h}" ${h === h12 ? 'selected' : ''}>${h}</option>`).join('')}
            </select>
            <span class="sch-tp-colon">:</span>
            <select class="sch-tp-sel" id="${id}-m" onchange="ScheduleApp._tpChange('${id}')">
              ${MINS.map(m => `<option value="${m}" ${m === String(dm).padStart(2, '0') ? 'selected' : ''}>${m}</option>`).join('')}
            </select>
          </div>
        </div>
        <input type="hidden" id="${id}" value="${def || '09:00'}">
        <div id="${id}-preview" class="sch-tp-preview" style="color:${isAM ? 'var(--a)' : '#7c3aed'}">${isAM ? '오전' : '오후'} ${h12}:${String(dm).padStart(2, '0')}</div>
      </div>`;
  }
  function _tpAmPm(id, ampm) {
    const amBtn = _q(`${id}-am`), pmBtn = _q(`${id}-pm`);
    if (amBtn) amBtn.classList.toggle('active', ampm === 'am');
    if (pmBtn) pmBtn.classList.toggle('active', ampm === 'pm');
    _tpChange(id);
  }
  function _tpChange(id) {
    const hSel = _q(`${id}-h`), mSel = _q(`${id}-m`), amBtn = _q(`${id}-am`);
    if (!hSel || !mSel) return;
    const isAM = amBtn?.classList.contains('active');
    let h = parseInt(hSel.value, 10);
    const m = mSel.value;
    if (isAM) { if (h === 12) h = 0; } else { if (h !== 12) h += 12; }
    const inp = _q(id);
    if (inp) inp.value = `${String(h).padStart(2, '0')}:${m}`;
    const prev = _q(`${id}-preview`);
    if (prev) { prev.style.color = isAM ? 'var(--a)' : '#7c3aed'; prev.textContent = `${isAM ? '오전' : '오후'} ${hSel.value}:${m}`; }
  }

  /* ═══════════════════════════════════════════════════════════
   * 반복 일정 수정/삭제 범위 선택 — "이 건만 / 이 건부터 전체 / 전체" 같은
   * 흔히 쓰는 캘린더 앱 패턴을 반복 등록된 일정에도 그대로 적용한다.
   * ═══════════════════════════════════════════════════════════ */
  function _showScopePicker(mode, s, onPick) {
    _q('sch-scope-ov')?.remove();
    const ov = document.createElement('div');
    ov.id = 'sch-scope-ov'; ov.className = 'ov'; ov.style.zIndex = 950;
    ov.onclick = e => { if (e.target === ov) ov.remove(); };
    const opts = mode === 'delete'
      ? [{ v: 'this', l: '이 일정만 삭제' }, { v: 'all', l: '🔁 반복 일정 전체 삭제' }]
      : [{ v: 'this', l: '이 건만 수정' }, { v: 'future', l: '이 건부터 이후 전체 수정' }, { v: 'all', l: '🔁 반복 일정 전체 수정' }];
    ov.innerHTML = `
      <div class="sh" style="max-width:340px">
        <div class="sh-handle"></div>
        <div class="sh-title">🔁 "${_esc(s.title)}"은(는) 반복 등록된 일정입니다</div>
        <div style="font-size:12.5px;color:var(--tx3);margin:-6px 0 12px;line-height:1.5">${mode === 'delete' ? '삭제 범위' : '수정 범위'}를 선택해주세요.</div>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${opts.map(o => `<button type="button" class="btn-x" style="width:100%;text-align:center" data-v="${o.v}">${o.l}</button>`).join('')}
        </div>
        <div class="sh-acts"><button class="btn-x" style="width:100%" id="sch-scope-cancel">취소</button></div>
      </div>`;
    document.body.appendChild(ov);
    ov.querySelectorAll('[data-v]').forEach(b => b.onclick = () => { ov.remove(); onPick(b.dataset.v); });
    _q('sch-scope-cancel').onclick = () => ov.remove();
  }

  function openEditor(id = null, prefillDate = null) {
    const s = id ? ScheduleDB.getById(id) : null;
    if (s && !_canEdit(s)) {
      if (typeof App !== 'undefined' && App._toast) App._toast('⚠️ 다른 사람이 등록한 일정은 수정할 수 없습니다', 'error');
      return;
    }
    if (s && s.seriesId) {
      _showScopePicker('edit', s, scope => { _editScope = scope; _openEditorForm(id, prefillDate); });
      return;
    }
    _editScope = 'this';
    _openEditorForm(id, prefillDate);
  }

  function _openEditorForm(id = null, prefillDate = null) {
    _editId = id;
    ScheduleDB.pauseUpdates(true); // ★ 편집 중엔 서버 갱신이 화면을 덮어쓰지 않도록
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
        ${!s ? `
        <div class="f-grp">
          <label class="f-lbl">🔁 반복 <em style="font-style:normal;color:var(--tx3);font-weight:600">(같은 일정을 여러 번 자동으로 등록)</em></label>
          <div class="ntc-pill-row" id="sch-f-repeat">
            <button type="button" class="ntc-pill on" data-v="none">안함</button>
            <button type="button" class="ntc-pill" data-v="weekly">매주</button>
            <button type="button" class="ntc-pill" data-v="monthly">매월</button>
            <button type="button" class="ntc-pill" data-v="yearly">매년</button>
          </div>
        </div>
        <div class="f-grp" id="sch-f-repeat-end-wrap" style="display:none">
          <label class="f-lbl">반복 종료일</label>
          <input class="f-inp" id="sch-f-repeat-end" type="date" value="${_addDays(startDate, 90)}">
          <div class="sch-repeat-hint" id="sch-f-repeat-hint"></div>
        </div>` : ''}
        <div class="f-grp">
          <label class="sch-notify-ck">
            <input type="checkbox" id="sch-f-suppress" ${s?.suppressClasses ? 'checked' : ''} onchange="document.getElementById('sch-f-note-wrap').style.display=this.checked?'block':'none'">
            <span>🚫 이 기간 "오늘의 수업"에 정규 반 목록 숨기기 <em>(방학·임시휴강 등 정규 수업이 없을 때 체크)</em></span>
          </label>
        </div>
        <div class="f-grp" id="sch-f-note-wrap" style="display:${s?.suppressClasses ? 'block' : 'none'}">
          <label class="f-lbl">특강/보충 안내 (선택 — 비워두면 "정규 수업 없음"만 표시)</label>
          <input class="f-inp" id="sch-f-note" maxlength="60" placeholder="예: 오전 10시 여름 영어캠프" value="${_esc(s?.specialNote || '')}">
        </div>
        <div class="f-grp">
          <label class="sch-notify-ck">
            <input type="checkbox" id="sch-f-notify" ${notify ? 'checked' : ''} onchange="document.getElementById('sch-f-notify-wrap').style.display=this.checked?'block':'none'">
            <span>🔔 알림 사용 <em>(끄면 조용히 캘린더에만 표시됩니다)</em></span>
          </label>
        </div>
        <div class="f-grp" id="sch-f-notify-wrap" style="display:${notify ? 'block' : 'none'}">
          <div>${_timePicker('sch-f-time', '알림 시간', s?.notifyTime || '09:00')}</div>
          <div style="margin-top:14px">
            <label class="f-lbl">미리 알림 <em style="font-style:normal;color:var(--tx3);font-weight:600">(도래 며칠 전부터 알릴지)</em></label>
            <div class="ntc-pill-row" id="sch-f-remind">
              <button type="button" class="ntc-pill${(s?.notifyDaysBefore || 0) === 0 ? ' on' : ''}" data-v="0">당일</button>
              <button type="button" class="ntc-pill${(s?.notifyDaysBefore || 0) === 1 ? ' on' : ''}" data-v="1">1일 전</button>
              <button type="button" class="ntc-pill${(s?.notifyDaysBefore || 0) === 3 ? ' on' : ''}" data-v="3">3일 전</button>
              <button type="button" class="ntc-pill${(s?.notifyDaysBefore || 0) === 7 ? ' on' : ''}" data-v="7">7일 전</button>
            </div>
          </div>
          <div style="margin-top:14px">
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
    ov.querySelectorAll('#sch-f-remind .ntc-pill').forEach(b => b.onclick = () => {
      ov.querySelectorAll('#sch-f-remind .ntc-pill').forEach(x => x.classList.remove('on')); b.classList.add('on');
    });
    const repeatRow = ov.querySelector('#sch-f-repeat');
    if (repeatRow) {
      const hintEl = ov.querySelector('#sch-f-repeat-hint');
      const endWrap = ov.querySelector('#sch-f-repeat-end-wrap');
      const _updateHint = () => {
        const freq = repeatRow.querySelector('.ntc-pill.on')?.dataset.v || 'none';
        const endVal = ov.querySelector('#sch-f-repeat-end')?.value || '';
        if (freq === 'none' || !endVal) { if (hintEl) hintEl.textContent = ''; return; }
        const n = _repeatCount(freq, startDate, endVal);
        if (hintEl) hintEl.textContent = `📌 ${startDate} ~ ${endVal} 사이 총 ${n}회 등록됩니다 (최대 104회)`;
      };
      repeatRow.querySelectorAll('.ntc-pill').forEach(b => b.onclick = () => {
        repeatRow.querySelectorAll('.ntc-pill').forEach(x => x.classList.remove('on')); b.classList.add('on');
        if (endWrap) endWrap.style.display = b.dataset.v === 'none' ? 'none' : 'block';
        _updateHint();
      });
      ov.querySelector('#sch-f-repeat-end')?.addEventListener('change', _updateHint);
    }
    setTimeout(() => _q('sch-f-title')?.focus(), 150);
  }
  function closeEditor() { _q('sch-editor-ov')?.remove(); _editId = null; ScheduleDB.pauseUpdates(false); }

  // ★ 반복 등록 시 실제로 몇 건이 생성될지 미리 계산(안전장치: 최대 104회로 제한)
  function _repeatCount(freq, startDate, endStr) {
    const stepDays = freq === 'weekly' ? 7 : null;
    let cur = startDate, n = 0;
    while (cur <= endStr && n < 104) {
      n++;
      if (freq === 'weekly') cur = _addDays(cur, 7);
      else if (freq === 'monthly') { const d = new Date(cur + 'T00:00:00'); d.setMonth(d.getMonth() + 1); cur = `${d.getFullYear()}-${_pad(d.getMonth() + 1)}-${_pad(d.getDate())}`; }
      else if (freq === 'yearly') { const d = new Date(cur + 'T00:00:00'); d.setFullYear(d.getFullYear() + 1); cur = `${d.getFullYear()}-${_pad(d.getMonth() + 1)}-${_pad(d.getDate())}`; }
      else break;
    }
    return n;
  }


  async function saveEditor() {
    const title = _q('sch-f-title')?.value.trim();
    if (!title) { alert('제목을 입력해주세요'); return; }
    const cat = document.querySelector('#sch-f-cat .ntc-pill.on')?.dataset.v || 'general';
    const startDate = _q('sch-f-start')?.value || _todayStr();
    let endDate = _q('sch-f-end')?.value || startDate;
    if (endDate < startDate) endDate = startDate;
    const notifyEnabled = _q('sch-f-notify')?.checked || false;
    const notifyTime = _q('sch-f-time')?.value || '09:00';
    const notifyDaysBefore = parseInt(document.querySelector('#sch-f-remind .ntc-pill.on')?.dataset.v || '0', 10);
    const audience = document.querySelector('#sch-f-aud .ntc-pill.on')?.dataset.v || 'all';
    const memo = _q('sch-f-memo')?.value.trim() || '';
    const suppressClasses = _q('sch-f-suppress')?.checked || false;
    const specialNote = _q('sch-f-note')?.value.trim() || '';
    const data = { title, memo, category: cat, startDate, endDate, notifyEnabled, notifyTime, notifyDaysBefore, audience, suppressClasses, specialNote };

    const repeatFreq = document.querySelector('#sch-f-repeat .ntc-pill.on')?.dataset.v || 'none';
    const repeatEnd = _q('sch-f-repeat-end')?.value || '';

    if (_editId) {
      const orig = ScheduleDB.getById(_editId);
      if (orig?.seriesId && _editScope !== 'this') {
        // ★ 반복 일정 일괄 수정 — 제목/메모/알림 등 "내용"만 함께 바꾸고, 각 회차 고유의 날짜는 그대로 둔다.
        const { startDate: _s, endDate: _e, ...contentOnly } = data;
        const targets = ScheduleDB.getAll().filter(x => x.seriesId === orig.seriesId && (_editScope === 'all' || x.startDate >= orig.startDate));
        for (const t of targets) await ScheduleDB.update(t.id, contentOnly);
        closeEditor(); refresh();
        if (typeof App !== 'undefined' && App._toast) App._toast(`✅ 반복 일정 ${targets.length}건이 수정되었습니다`, 'success');
        return;
      }
      // 이 건만 수정(반복이 아니거나 'this' 선택) — 날짜도 함께 반영
      await ScheduleDB.update(_editId, data);
    } else if (repeatFreq !== 'none' && repeatEnd && repeatEnd >= startDate) {
      // ★ 반복 등록 — 시작일~종료일 사이 간격만큼 자동으로 여러 건 생성 (안전장치: 최대 104회)
      //   같은 반복 묶음임을 알 수 있도록 공통 seriesId를 부여해서, 나중에 "전체 수정/삭제"가 가능하게 한다.
      const seriesId = 'ser' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const spanDays = Math.round((new Date(endDate + 'T00:00:00') - new Date(startDate + 'T00:00:00')) / 86400000);
      let cur = startDate, n = 0;
      while (cur <= repeatEnd && n < 104) {
        await ScheduleDB.add({ ...data, startDate: cur, endDate: _addDays(cur, spanDays), seriesId });
        n++;
        if (repeatFreq === 'weekly') cur = _addDays(cur, 7);
        else if (repeatFreq === 'monthly') { const d = new Date(cur + 'T00:00:00'); d.setMonth(d.getMonth() + 1); cur = `${d.getFullYear()}-${_pad(d.getMonth() + 1)}-${_pad(d.getDate())}`; }
        else { const d = new Date(cur + 'T00:00:00'); d.setFullYear(d.getFullYear() + 1); cur = `${d.getFullYear()}-${_pad(d.getMonth() + 1)}-${_pad(d.getDate())}`; }
      }
      closeEditor(); refresh();
      if (typeof App !== 'undefined' && App._toast) App._toast(`✅ 반복 일정 ${n}건이 등록되었습니다`, 'success');
      return;
    } else {
      await ScheduleDB.add(data);
    }
    closeEditor();
    refresh();
    if (typeof App !== 'undefined' && App._toast) App._toast('✅ 일정이 저장되었습니다', 'success');
  }

  async function deleteItem(id) {
    const s = ScheduleDB.getById(id); if (!s) return;
    if (!_canEdit(s)) {
      if (typeof App !== 'undefined' && App._toast) App._toast('⚠️ 다른 사람이 등록한 일정은 삭제할 수 없습니다', 'error');
      return;
    }
    if (s.seriesId) {
      _showScopePicker('delete', s, async scope => {
        if (scope === 'all') {
          const targets = ScheduleDB.getAll().filter(x => x.seriesId === s.seriesId);
          if (!confirm(`🔁 반복 등록된 ${targets.length}건을 모두 삭제할까요? 이 작업은 되돌릴 수 없습니다.`)) return;
          for (const t of targets) await ScheduleDB.remove(t.id);
          refresh();
          if (typeof App !== 'undefined' && App._toast) App._toast(`🗑 반복 일정 ${targets.length}건이 삭제되었습니다`, 'success');
        } else {
          await ScheduleDB.remove(id);
          refresh();
        }
      });
      return;
    }
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
      // ★ 미리 알림: startDate에서 notifyDaysBefore일만큼 앞당긴 날짜부터 알림 대상이 됨
      const remindFrom = _addDays(s.startDate, -(s.notifyDaysBefore || 0));
      if (remindFrom > todayStr) return false;
      if (remindFrom === todayStr) {
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
    const todayStr = _todayStr();
    const dLeft = Math.round((new Date(s.startDate + 'T00:00:00') - new Date(todayStr + 'T00:00:00')) / 86400000);
    const dHint = dLeft > 0 ? `<div class="sch-pop-dday">📅 D-${dLeft} · ${s.startDate}</div>` : '';
    const ov = document.createElement('div');
    ov.id = 'sch-pop-ov'; ov.className = 'sch-pop-ov';
    ov.innerHTML = `
      <div class="sch-pop-box">
        <div class="sch-pop-ico">${cat.ico}</div>
        <div class="sch-pop-title">${_esc(s.title)}</div>
        ${dHint}
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
    _navMonth, _goToday, _navDay, _openDateJump, _jumpToDate, _goStudentDetail,
    _tpAmPm, _tpChange,
  };
})();
