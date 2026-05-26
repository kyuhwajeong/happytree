/**
 * staff-app.js — v3.1  (알바·정직원 통합 + ⚡ 즉시 시급 계산기)
 * ════════════════════════════════════════════════════════════════
 *  v3 기존 기능 (유지)
 *  ─────────────────────────────────────────────────────────────
 *  [1] 고용 형태 분기 표시 (정직원/알바)
 *  [2] 일괄 등록 모달 — 범위·요일·휴게·야간·Undo
 *  [3] 주휴수당 실시간 프로그레스 바
 *  [4] 체크박스 다중 선택 삭제
 *  [5] 급여 계산 UI (기본급/야간/주휴수당 분리)
 *  [6] 전원 급여 일괄 정산 + Excel 다운로드
 *
 *  v3.1 신규 — ⚡ 즉시 시급 계산기
 *  ─────────────────────────────────────────────────────────────
 *  [7] 직원 등록 없이 당일 즉시 정산
 *      · 이름·날짜 선택 (선택사항)
 *      · 기본 시급 입력 (0=법정 최저시급 자동)
 *
 *  [8] 분(分) 단위 정밀 계산
 *      · 1분 = 시급 ÷ 60  (초 단위 버림, 원 단위 올림)
 *      · 시간 입력 → 경과 시간 실시간 표시 (X시간 Y분)
 *
 *  [9] 시간대별 차등 시급 슬롯 시스템
 *      · 슬롯 추가/삭제 (여러 시간대 조합 가능)
 *      · 슬롯별 시급 개별 지정 가능 (없으면 기본 시급 적용)
 *
 *  [10] 업무 유형별 차등 시급 (일반 / 수업)
 *       · 유형 뱃지 탭 한 번으로 일반 ↔ 수업 토글
 *       · 슬롯별 개별 시급 오버라이드 가능
 *       · 야간·야근 수당 개념 없음 (삭제됨)
 *
 *  [11] 실시간 결과 패널
 *       · 슬롯 입력 즉시 우측/하단에 금액 업데이트
 *       · 슬롯별 내역 테이블 (기본/야간 분리)
 *       · 총 합계 크게 표시
 *
 *  [12] 결과 저장·공유·인쇄
 *       · 결과 텍스트 클립보드 복사
 *       · 네이티브 공유 (Web Share API)
 *       · 브라우저 인쇄 (PDF 저장 가능)
 *       · 직원으로 연결 저장 (선택)
 * ════════════════════════════════════════════════════════════════
 */
const StaffApp = (() => {
  /* ══ 상태 ══ */
  let _st = {
    subTab:       _loadHomeTab ? _loadHomeTab() : 'list',
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
    /* 다중 삭제 */
    selectMode:   false,
    selected:     new Set(),  // "date::entryId"
    /* 마지막 배치 */
    lastBatchId:  null,
    lastBatchCount: 0,
  };

  /* ── 홈탭 설정 ── */
  const LS_HOME_TAB = 'hk10b_staff_home';
  const TAB_META = {
    list:      { icon:'👥', label:'직원 목록',  desc:'재직/퇴직 직원 카드 목록' },
    salary:    { icon:'💰', label:'급여 계산',  desc:'직원 개별 월별 급여 산출' },
    all:       { icon:'📊', label:'일괄정산',   desc:'전직원 월별·연간 급여 집계' },
    quickcalc: { icon:'⚡', label:'즉시 계산',  desc:'직원 등록 없이 바로 시급 계산' },
  };

  function _loadHomeTab() {
    try { return localStorage.getItem(LS_HOME_TAB) || 'list'; } catch { return 'list'; }
  }
  function _saveHomeTab(tab) {
    try { localStorage.setItem(LS_HOME_TAB, tab); } catch {}
  }

  /* ══ 즉시 계산기 전용 상태 ══ */
  let _qSlots  = [];   // [{id,label,start,end,type:'general'|'class',rate}]
  let _qBase   = { name:'', date: new Date().toISOString().slice(0,10), generalRate:0, classRate:0 };
  let _qResult = null;
  const _nid2  = () => Date.now().toString(36) + Math.random().toString(36).slice(2,5);

  const DOW = StaffDB.DOW_KO;
  const WORK_DAYS = ['월','화','수','목','금','토','일'];

  /* ══════════════════════════════════════════
   * CSS — v3
   * ══════════════════════════════════════════ */
  function _css() {
    if (document.getElementById('sf-styles')) return;
    const s = document.createElement('style');
    s.id = 'sf-styles';
    s.textContent = `
/* ── 레이아웃 ── */
#page-staff{display:none;flex-direction:column;height:100%;overflow:hidden}
#page-staff.on{display:flex}
.sf-stabs{display:flex;background:var(--surf);border-bottom:1.5px solid var(--bdr);flex-shrink:0;overflow-x:auto;scrollbar-width:none}
.sf-stabs::-webkit-scrollbar{display:none}
.sf-stab{flex:1;min-width:70px;padding:11px 4px;text-align:center;font-size:12px;font-weight:700;color:var(--tx3);cursor:pointer;border-bottom:2.5px solid transparent;background:none;border-top:none;border-left:none;border-right:none;font-family:var(--font);transition:color .18s,border-color .18s;white-space:nowrap}
.sf-stab.on{color:var(--a);border-bottom-color:var(--a)}
.sf-scroll{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:12px 14px 120px}
.sf-lbl{display:block;font-size:9px;font-weight:800;color:var(--tx3);letter-spacing:1.2px;text-transform:uppercase;padding:8px 2px 5px}

/* ── 직원 카드 ── */
.sf-card{display:flex;align-items:center;gap:12px;background:var(--card);border:1px solid var(--bdr);border-radius:var(--r);padding:12px 14px;margin-bottom:9px;box-shadow:var(--sh);animation:cardIn .22s ease both;transition:border-color .15s}
.sf-card:hover{border-color:var(--a40)}
.sf-av{width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:900;flex-shrink:0;background:linear-gradient(135deg,var(--a20),rgba(5,150,105,.2));color:var(--a)}
.sf-av.off{background:linear-gradient(135deg,rgba(156,163,175,.2),rgba(156,163,175,.1));color:var(--tx3)}
.sf-av.pt{background:linear-gradient(135deg,rgba(245,158,11,.2),rgba(217,119,6,.1));color:#d97706}
.sf-ci{flex:1;min-width:0}
.sf-cn{font-size:15px;font-weight:800;color:var(--tx)}
.sf-cm{font-size:12px;color:var(--tx3);margin-top:3px;display:flex;gap:5px;flex-wrap:wrap}
.sf-bdg{display:inline-flex;align-items:center;gap:2px;padding:2px 7px;border-radius:6px;font-size:10px;font-weight:700;background:var(--card2);border:1px solid var(--bdr);color:var(--tx2)}
.sf-bdg.ok{background:rgba(5,150,105,.1);border-color:rgba(5,150,105,.3);color:var(--green)}
.sf-bdg.off{background:rgba(156,163,175,.1);border-color:rgba(156,163,175,.3);color:var(--tx3)}
.sf-bdg.ctrt{background:rgba(139,92,246,.1);border-color:rgba(139,92,246,.3);color:#8b5cf6}
.sf-bdg.ft{background:rgba(37,99,235,.1);border-color:rgba(37,99,235,.3);color:#2563eb}
.sf-bdg.pt{background:rgba(245,158,11,.1);border-color:rgba(245,158,11,.3);color:#d97706}
.sf-cacts{display:flex;flex-direction:column;gap:5px;align-items:flex-end;flex-shrink:0}
.sf-empty{text-align:center;padding:56px 20px;color:var(--tx3);font-size:14px;line-height:2.2}

/* ── 편집 폼 ── */
.sf-fg{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.sf-fg .sf-full{grid-column:1/-1}
.sf-fl{display:block;font-size:10px;font-weight:800;color:var(--tx3);letter-spacing:.5px;margin-bottom:4px}
.sf-fi{width:100%;padding:9px 12px;border-radius:9px;background:var(--surf2);border:1.5px solid var(--bdr);font-size:13px;color:var(--tx);outline:none;font-family:var(--font);transition:border-color .2s;box-sizing:border-box}
.sf-fi:focus{border-color:var(--a);background:var(--a10)}
.sf-fi::placeholder{color:var(--tx3)}

/* ── 주간 템플릿 ── */
.sf-templ-sec{margin-top:4px}
.sf-templ-dow-row{display:flex;gap:6px;align-items:center;margin-bottom:6px;flex-wrap:wrap}
.sf-dow-lbl{min-width:22px;font-size:12px;font-weight:800;color:var(--a);flex-shrink:0}
.sf-templ-entries{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px}
.sf-templ-entry{display:flex;align-items:center;gap:5px;background:var(--surf2);border-radius:8px;padding:5px 8px;font-size:11px}
.sf-templ-entry-type{font-size:10px;font-weight:700;padding:2px 6px;border-radius:5px;flex-shrink:0}
.sf-templ-entry-type.class{background:var(--a10);color:var(--a)}
.sf-templ-entry-type.general{background:rgba(5,150,105,.1);color:var(--green)}
.sf-templ-entry-info{flex:1;color:var(--tx2)}
.sf-templ-del{background:none;border:none;color:var(--tx3);cursor:pointer;padding:2px 5px;font-size:11px;border-radius:4px;font-family:var(--font)}
.sf-templ-del:hover{color:#ef4444}
.sf-templ-add-btn{font-size:10px;padding:4px 8px;border-radius:7px;background:var(--a10);border:1px solid var(--a40);color:var(--a);cursor:pointer;font-family:var(--font);font-weight:700;white-space:nowrap;flex-shrink:0;transition:all .12s}
.sf-templ-add-btn:active{transform:scale(.93)}

/* ── 달력 하단 액션 버튼 ── */
.sf-cal-act-btn{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;padding:8px 4px;border-radius:10px;font-size:16px;font-weight:700;cursor:pointer;border:1.5px solid var(--bdr);background:var(--card);color:var(--tx2);font-family:var(--font);transition:all .15s;line-height:1}
.sf-cal-act-btn span{font-size:10px;font-weight:700;letter-spacing:-.2px}
.sf-cal-act-btn.primary{background:var(--a);color:#fff;border-color:var(--a);box-shadow:0 3px 10px var(--a40)}
.sf-cal-act-btn.sub{background:var(--surf2);border-color:var(--bdr2);color:var(--tx2)}
.sf-cal-act-btn.danger{background:#fee2e2;border-color:#ef4444;color:#ef4444}
.sf-cal-act-btn.close{background:var(--card2);border-color:var(--bdr2);color:var(--tx3)}
.sf-cal-act-btn:active{transform:scale(.93)}

/* ── 달력 ── */
.sf-cal-nav{display:flex;align-items:center;justify-content:space-between;padding:8px 14px;background:var(--surf2);border-bottom:1px solid var(--bdr);flex-shrink:0}
.sf-cal-arr{width:34px;height:34px;border-radius:9px;border:1px solid var(--bdr2);background:var(--card);color:var(--tx2);font-size:17px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .12s}
.sf-cal-arr:active{background:var(--card2);transform:scale(.92)}
.sf-cal-ym{font-size:16px;font-weight:800;color:var(--tx)}
.sf-cal-info{font-size:11px;color:var(--tx3);margin-top:2px}
.sf-cal-grid{display:grid;grid-template-columns:repeat(7,1fr)}
.sf-wd{padding:5px 2px;text-align:center;font-size:10px;font-weight:800;color:var(--tx3);background:var(--surf2);border:1px solid var(--bdr)}
.sf-wd:first-child{color:#dc2626}
.sf-wd:last-child{color:#4f46e5}
.sf-cell{border:1px solid var(--bdr);min-height:66px;padding:4px;background:var(--card);cursor:pointer;position:relative;vertical-align:top;transition:background .12s}
.sf-cell:hover:not(.sf-ec){background:var(--a10)}
.sf-cell.sf-today{background:var(--a10)!important}
.sf-cell.sf-today .sf-dn{color:var(--a);font-weight:900}
.sf-cell.sf-ec{background:var(--surf2);cursor:default}
.sf-cell.sf-sun .sf-dn{color:#dc2626}
.sf-cell.sf-sat .sf-dn{color:#4f46e5}
.sf-cell.copy-target{outline:2.5px solid var(--a);background:var(--a10)!important}
.sf-dn{font-size:11px;font-weight:700;color:var(--tx2);margin-bottom:2px}
.sf-ce{border-radius:4px;padding:2px 4px;font-size:10px;font-weight:700;margin-bottom:2px;display:flex;align-items:center;gap:2px;position:relative;cursor:pointer}
.sf-ce.class{background:var(--a10);color:var(--a);border:1px solid var(--a40)}
.sf-ce.general{background:rgba(5,150,105,.1);color:var(--green);border:1px solid rgba(5,150,105,.3)}
.sf-ce.copying{background:#fef3c7!important;border-color:#f59e0b!important}
.sf-ce.selected-entry{outline:2px solid #ef4444;background:#fee2e2!important}
.sf-cell-total{position:absolute;bottom:2px;right:4px;font-size:9px;font-weight:800;color:var(--tx3)}

/* ── 복사 배너 ── */
.sf-copy-banner{background:#fef3c7;border-bottom:2px solid #f59e0b;padding:8px 14px;flex-shrink:0;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.sf-copy-banner-txt{font-size:12px;font-weight:700;color:#92400e;flex:1}
.sf-copy-confirm{padding:6px 14px;border-radius:8px;background:#f59e0b;color:#fff;border:none;font-size:12px;font-weight:700;cursor:pointer;font-family:var(--font)}
.sf-copy-cancel{padding:6px 14px;border-radius:8px;background:var(--card);border:1px solid var(--bdr2);color:var(--tx2);font-size:12px;cursor:pointer;font-family:var(--font)}

/* ── 선택 삭제 배너 ── */
.sf-sel-banner{background:#fee2e2;border-bottom:2px solid #ef4444;padding:8px 14px;flex-shrink:0;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.sf-sel-banner-txt{font-size:12px;font-weight:700;color:#991b1b;flex:1}
.sf-sel-del{padding:6px 14px;border-radius:8px;background:#ef4444;color:#fff;border:none;font-size:12px;font-weight:700;cursor:pointer;font-family:var(--font)}
.sf-sel-cancel{padding:6px 14px;border-radius:8px;background:var(--card);border:1px solid var(--bdr2);color:var(--tx2);font-size:12px;cursor:pointer;font-family:var(--font)}

/* ── 주휴수당 프로그레스 ── */
.sf-holiday-bar{background:var(--surf2);border-bottom:1px solid var(--bdr);padding:8px 14px;flex-shrink:0}
.sf-hb-title{font-size:10px;font-weight:800;color:var(--tx3);letter-spacing:.8px;margin-bottom:6px}
.sf-hb-row{display:flex;align-items:center;gap:8px}
.sf-hb-track{flex:1;height:8px;border-radius:4px;background:var(--bdr);overflow:hidden}
.sf-hb-fill{height:100%;border-radius:4px;transition:width .4s cubic-bezier(.4,0,.2,1);background:linear-gradient(90deg,#f59e0b,#ef4444)}
.sf-hb-fill.done{background:linear-gradient(90deg,#059669,#10b981)}
.sf-hb-label{font-size:11px;font-weight:700;color:var(--tx2);white-space:nowrap}
.sf-hb-badge{font-size:13px;flex-shrink:0}
.sf-holiday-weeks{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px}
.sf-hw-chip{padding:3px 8px;border-radius:5px;font-size:10px;font-weight:700;border:1px solid var(--bdr);background:var(--card)}
.sf-hw-chip.q{background:rgba(5,150,105,.1);border-color:rgba(5,150,105,.3);color:var(--green)}
.sf-hw-chip.nq{background:var(--card2);color:var(--tx3)}

/* ── Undo 배너 ── */
.sf-undo-banner{background:#eff6ff;border-bottom:2px solid #3b82f6;padding:8px 14px;flex-shrink:0;display:flex;align-items:center;gap:8px}
.sf-undo-txt{font-size:12px;font-weight:700;color:#1e40af;flex:1}
.sf-undo-btn{padding:6px 14px;border-radius:8px;background:#3b82f6;color:#fff;border:none;font-size:12px;font-weight:700;cursor:pointer;font-family:var(--font)}

/* ── 근무 입력 ── */
.sf-wtype-row{display:flex;gap:8px;margin-bottom:10px}
.sf-wbtn{flex:1;padding:10px 6px;border-radius:9px;font-size:12px;font-weight:700;cursor:pointer;font-family:var(--font);border:2px solid var(--bdr2);background:var(--card);color:var(--tx2);transition:all .15s}
.sf-wbtn.on.class{border-color:var(--a);background:var(--a10);color:var(--a)}
.sf-wbtn.on.general{border-color:var(--green);background:rgba(5,150,105,.1);color:var(--green)}
.sf-wbtn:active{transform:scale(.94)}
.sf-time-row{display:flex;gap:8px;align-items:flex-end;margin-bottom:8px}
.sf-time-row label{flex:1}
.sf-tl{font-size:10px;color:var(--tx3);font-weight:700;margin-bottom:3px;display:block}
.sf-ti{width:100%;padding:9px 10px;border-radius:9px;box-sizing:border-box;background:var(--surf);border:1.5px solid var(--bdr);font-size:13px;color:var(--tx);outline:none;font-family:var(--font)}
.sf-ti:focus{border-color:var(--a)}
.sf-hrs{padding:8px 12px;border-radius:9px;border:1.5px solid var(--a40);font-size:14px;font-weight:800;color:var(--a);background:var(--a10);white-space:nowrap;flex-shrink:0;align-self:flex-end;display:flex;align-items:center;min-width:62px;justify-content:center}
.sf-note{width:100%;padding:8px 10px;border-radius:9px;box-sizing:border-box;background:var(--surf);border:1.5px solid var(--bdr);font-size:12px;color:var(--tx);outline:none;font-family:var(--font);margin-bottom:8px}
.sf-note:focus{border-color:var(--a)}
.sf-ei{display:flex;align-items:center;gap:8px;padding:7px 8px;border-radius:8px;transition:background .12s;cursor:pointer}
.sf-ei:hover{background:var(--card2)}
.sf-ei.sel{background:#fee2e2}
.sf-edot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
.sf-echk{width:16px;height:16px;border-radius:4px;border:1.5px solid var(--bdr2);flex-shrink:0;display:flex;align-items:center;justify-content:center;background:var(--card)}
.sf-echk.chk{background:#ef4444;border-color:#ef4444;color:#fff;font-size:10px}

/* ── 일괄 등록 ── */
.sf-batch-section{background:var(--surf2);border-radius:10px;padding:12px;margin-bottom:10px}
.sf-batch-title{font-size:11px;font-weight:800;color:var(--a);letter-spacing:.5px;margin-bottom:10px}
.sf-dow-checks{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}
.sf-dow-chk{display:flex;align-items:center;gap:3px;padding:4px 8px;border-radius:7px;border:1.5px solid var(--bdr);background:var(--card);cursor:pointer;font-size:11px;font-weight:700;color:var(--tx2);transition:all .14s}
.sf-dow-chk.on{border-color:var(--a);background:var(--a10);color:var(--a)}
.sf-dow-chk.sun.on{border-color:#dc2626;background:rgba(220,38,38,.08);color:#dc2626}
.sf-dow-chk.sat.on{border-color:#4f46e5;background:rgba(79,70,229,.08);color:#4f46e5}
.sf-rate-info{font-size:10px;color:var(--tx3);padding:4px 6px;background:var(--card);border-radius:6px;border:1px solid var(--bdr)}

/* ── 급여 ── */
.sf-pay-bar{padding:10px 14px;background:var(--surf);border-bottom:1px solid var(--bdr);flex-shrink:0;display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end}
.sf-pay-item{flex:1;min-width:90px}
.sf-pay-lbl{display:block;font-size:9px;font-weight:800;color:var(--tx3);letter-spacing:1px;text-transform:uppercase;margin-bottom:4px}
.sf-pay-item select{width:100%;padding:8px 10px;border-radius:10px;background:var(--surf2);border:1.5px solid var(--bdr);font-size:13px;color:var(--tx);outline:none;font-family:var(--font);-webkit-appearance:none}
.sf-calc-btn{padding:9px 18px;border-radius:10px;background:var(--a);color:#fff;font-weight:700;font-size:13px;border:none;cursor:pointer;font-family:var(--font);box-shadow:0 3px 10px var(--a40);white-space:nowrap;align-self:flex-end;transition:all .15s}
.sf-calc-btn:active{transform:scale(.95)}
.sf-pcard{background:var(--card);border:1px solid var(--bdr);border-radius:var(--r);box-shadow:var(--sh);overflow:hidden;animation:cardIn .22s ease both;margin-bottom:14px}
.sf-phead{padding:14px 16px;background:linear-gradient(135deg,rgba(5,150,105,.08),var(--a10));border-bottom:1px solid var(--bdr);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px}
.sf-pname{font-size:15px;font-weight:900;color:var(--tx)}
.sf-pperiod{font-size:11px;color:var(--tx3);margin-top:3px}
.sf-ptot-w{text-align:right}
.sf-ptot-l{font-size:10px;color:var(--tx3)}
.sf-ptot{font-size:26px;font-weight:900;color:var(--a)}
.sf-prows{padding:12px 16px}
.sf-pr{display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--bdr);font-size:13px}
.sf-pr:last-child{border-bottom:none}
.sf-pr-l{color:var(--tx2);display:flex;align-items:center;gap:8px}
.sf-pr-v{font-weight:700;color:var(--tx)}
.sf-pr.sf-tot{padding-top:12px;border-top:2px solid var(--a);margin-top:4px}
.sf-pr.sf-tot .sf-pr-l{font-weight:800;font-size:14px;color:var(--tx)}
.sf-pr.sf-tot .sf-pr-v{font-size:17px;color:var(--a)}
.sf-pr.holiday-row .sf-pr-v{color:#059669}
.sf-pr.night-row .sf-pr-v{color:#7c3aed}
.sf-drow{display:flex;gap:8px;padding:5px 8px;border-radius:8px;font-size:12px;transition:background .12s}
.sf-drow:hover{background:var(--card2)}
.sf-ddt{font-weight:700;color:var(--tx3);min-width:58px;flex-shrink:0}
.sf-dtgs{display:flex;gap:4px;flex-wrap:wrap}
.sf-acts2{display:flex;gap:8px;padding:12px 16px;border-top:1px solid var(--bdr);flex-wrap:wrap}
.sf-ab{flex:1;min-width:72px;padding:11px 6px;border-radius:10px;font-size:12px;font-weight:700;cursor:pointer;font-family:var(--font);transition:all .15s;border:none}
.sf-ab.copy{background:var(--a10);color:var(--a);border:1px solid var(--a40)}
.sf-ab.pdf{background:rgba(5,150,105,.1);color:var(--green);border:1px solid rgba(5,150,105,.3)}
.sf-ab.share{background:var(--a);color:#fff;box-shadow:0 3px 10px var(--a40)}
.sf-ab.cal{background:var(--card2);color:var(--tx2);border:1px solid var(--bdr2)}
.sf-ab.xls{background:rgba(5,150,105,.9);color:#fff;box-shadow:0 3px 10px rgba(5,150,105,.3)}
.sf-ab:active{transform:scale(.96)}

/* ── 학원명 ── */
.sf-acad-row{display:flex;gap:6px;align-items:center;padding:6px 14px;background:var(--surf2);border-bottom:1px solid var(--bdr);font-size:11px;color:var(--tx3);flex-shrink:0}
.sf-acad-inp{flex:1;padding:5px 10px;border-radius:8px;background:var(--surf);border:1.5px solid var(--bdr);font-size:12px;color:var(--tx);outline:none;font-family:var(--font)}
.sf-acad-inp:focus{border-color:var(--a)}
.sf-acad-save{padding:5px 10px;border-radius:8px;background:var(--a10);border:1px solid var(--a40);color:var(--a);font-size:11px;font-weight:700;cursor:pointer;font-family:var(--font)}

/* ── 전원 급여 테이블 ── */
.sf-all-tbl{width:100%;border-collapse:collapse;font-size:12px;margin-top:10px}
.sf-all-tbl th{background:var(--surf2);padding:7px 8px;text-align:left;font-size:10px;font-weight:800;color:var(--tx3);border:1px solid var(--bdr);white-space:nowrap}
.sf-all-tbl td{padding:7px 8px;border:1px solid var(--bdr);color:var(--tx);vertical-align:top}
.sf-all-tbl tr:nth-child(even) td{background:var(--surf2)}
.sf-all-tot td{font-weight:800;background:var(--a10)!important;color:var(--a)}
.sf-holiday-tag{display:inline-flex;align-items:center;padding:1px 5px;border-radius:4px;font-size:9px;font-weight:700;background:rgba(5,150,105,.12);color:var(--green);border:1px solid rgba(5,150,105,.3)}
.sf-night-tag{display:inline-flex;align-items:center;padding:1px 5px;border-radius:4px;font-size:9px;font-weight:700;background:rgba(124,58,237,.1);color:#7c3aed;border:1px solid rgba(124,58,237,.25)}

/* ── PDF 인쇄 ── */
/* 인쇄: _printInNewWindow() 로 새 창 처리 — @media print CSS 불필요 */
.sfp-hdr{display:flex;align-items:center;gap:16px;margin-bottom:12px}
.sfp-logo{width:48px;height:48px;object-fit:contain}
.sfp-org-name{font-size:18px;font-weight:900;color:#111}
.sfp-title{font-size:13px;color:#555;margin-top:2px}
.sfp-date{font-size:11px;color:#888;text-align:right;flex:1}
.sfp-div{border:none;border-top:2px solid #111;margin:10px 0}
.sfp-tbl{width:100%;border-collapse:collapse;margin-bottom:12px}
.sfp-tbl th{background:#eef2ff;padding:7px 10px;text-align:left;font-size:11px;font-weight:800;color:#333;border:1px solid #c7d2fe}
.sfp-tbl td{padding:7px 10px;font-size:12px;color:#111;border:1px solid #ddd}
.sfp-tbl tr:nth-child(even) td{background:#fafafa}
.sfp-tot td{background:#eef2ff!important;font-weight:900;font-size:13px}
.sfp-sign{margin-top:24px;display:flex;justify-content:flex-end;gap:40px}
.sfp-sign-box{text-align:center;font-size:12px}
.sfp-sign-line{border-bottom:1px solid #aaa;width:80px;margin:28px auto 4px}
.sfp-footer{font-size:10px;color:#aaa;text-align:center;margin-top:16px}
/* ── 시작화면 설정 ── */
.sf-home-dot{display:inline-block;width:5px;height:5px;border-radius:50%;background:var(--a);margin-left:3px;vertical-align:middle;flex-shrink:0}
.sf-ht-item{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:12px;border:2px solid var(--bdr);background:var(--card);cursor:pointer;transition:all .18s}
.sf-ht-item:active{transform:scale(.97)}
.sf-ht-item.active{border-color:var(--a);background:var(--a10)}
.sf-ht-ico{font-size:22px;width:36px;height:36px;border-radius:10px;background:var(--surf2);display:flex;align-items:center;justify-content:center;flex-shrink:0}
.sf-ht-item.active .sf-ht-ico{background:var(--a20)}
.sf-ht-info{flex:1;min-width:0}
.sf-ht-name{font-size:14px;font-weight:800;color:var(--tx)}
.sf-ht-desc{font-size:11px;color:var(--tx3);margin-top:2px}
.sf-ht-radio{width:20px;height:20px;border-radius:50%;border:2px solid var(--bdr2);background:var(--card);flex-shrink:0;display:flex;align-items:center;justify-content:center;transition:border-color .15s}
.sf-ht-item.active .sf-ht-radio{border-color:var(--a)}
.sf-ht-radio-dot{width:10px;height:10px;border-radius:50%;background:var(--a)}

/* ── 즉시 시급 계산기 ── */
.qc-wrap{display:flex;flex-direction:column;height:100%;overflow:hidden}
.qc-scroll{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:12px 14px 100px}

/* 합계 결과 바 */
.qc-result-bar{background:linear-gradient(135deg,#1d4ed8,#2563eb);padding:12px 14px;flex-shrink:0;display:flex;align-items:center;justify-content:space-between;gap:8px;position:relative;overflow:hidden}
.qc-result-bar::before{content:'';position:absolute;inset:0;background:linear-gradient(135deg,rgba(255,255,255,.07),transparent);pointer-events:none}
.qc-result-bar-l{display:flex;flex-direction:column}
.qc-result-label{font-size:10px;font-weight:700;color:rgba(255,255,255,.65);letter-spacing:.8px}
.qc-result-total{font-size:30px;font-weight:900;color:#fff;line-height:1.1;letter-spacing:-1px}
.qc-result-sub{font-size:11px;color:rgba(255,255,255,.55);margin-top:2px}
.qc-result-bar-r{display:flex;gap:6px;flex-shrink:0}
.qc-icon-btn{width:36px;height:36px;border-radius:10px;background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.2);color:#fff;font-size:16px;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all .15s}
.qc-icon-btn:active{transform:scale(.86);background:rgba(255,255,255,.28)}

/* 기본 설정 카드 */
.qc-top{background:var(--card);border:1.5px solid var(--bdr);border-radius:14px;padding:14px;margin-bottom:14px;box-shadow:var(--sh)}
.qc-top-title{font-size:10px;font-weight:800;color:var(--a);letter-spacing:1px;text-transform:uppercase;margin-bottom:10px;display:flex;align-items:center;gap:6px}
.qc-rate-cards{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px}
.qc-rate-card{border-radius:10px;padding:10px 12px;border:2px solid var(--bdr);background:var(--surf2);cursor:pointer;transition:all .16s}
.qc-rate-card.general{border-color:rgba(5,150,105,.3);background:rgba(5,150,105,.05)}
.qc-rate-card.class{border-color:var(--a40);background:var(--a10)}
.qc-rate-card-ico{font-size:18px;margin-bottom:4px}
.qc-rate-card-lbl{font-size:10px;font-weight:800;color:var(--tx3);letter-spacing:.5px;margin-bottom:4px}
.qc-rate-val{font-size:16px;font-weight:900;color:var(--tx)}
.qc-rate-val.general{color:var(--green)}
.qc-rate-val.class{color:var(--a)}
.qc-info-row{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.qc-info-row .qc-full{grid-column:1/-1}
.qc-label{display:block;font-size:10px;font-weight:800;color:var(--tx3);letter-spacing:.4px;margin-bottom:4px}
.qc-inp{width:100%;padding:9px 12px;border-radius:10px;background:var(--surf2);border:1.5px solid var(--bdr);font-size:13px;color:var(--tx);outline:none;font-family:var(--font);box-sizing:border-box;transition:border-color .18s}
.qc-inp:focus{border-color:var(--a);background:var(--a10)}
.qc-inp::placeholder{color:var(--tx3)}
.qc-mw-hint{font-size:10px;color:var(--tx3);margin-top:4px;padding:3px 8px;background:var(--surf2);border-radius:6px;display:inline-flex;align-items:center;gap:4px}

/* 슬롯 헤더 */
.qc-slots-hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
.qc-slots-title{font-size:10px;font-weight:800;color:var(--tx3);letter-spacing:1px;text-transform:uppercase}
.qc-add-slot{display:flex;align-items:center;gap:4px;padding:5px 12px;border-radius:8px;background:var(--a10);border:1.5px solid var(--a40);color:var(--a);font-size:11px;font-weight:800;cursor:pointer;font-family:var(--font);transition:all .15s;white-space:nowrap}
.qc-add-slot:active{transform:scale(.93)}

/* 슬롯 카드 */
.qc-slot{background:var(--card);border:1.5px solid var(--bdr);border-radius:14px;padding:12px;margin-bottom:10px;box-shadow:var(--sh);animation:cardIn .2s ease both;transition:border-color .18s}
.qc-slot.type-general{border-left:4px solid var(--green)}
.qc-slot.type-class{border-left:4px solid var(--a)}
.qc-slot-hdr{display:flex;align-items:center;gap:8px;margin-bottom:10px}
.qc-type-badge{padding:3px 9px;border-radius:7px;font-size:10px;font-weight:800;flex-shrink:0;cursor:pointer;transition:all .15s;border:1.5px solid transparent}
.qc-type-badge.general{background:rgba(5,150,105,.1);color:var(--green);border-color:rgba(5,150,105,.3)}
.qc-type-badge.class{background:var(--a10);color:var(--a);border-color:var(--a40)}
.qc-type-badge:active{transform:scale(.9)}
.qc-slot-name-inp{flex:1;border:none;background:transparent;font-size:12px;font-weight:700;color:var(--tx2);font-family:var(--font);outline:none;padding:0;min-width:0}
.qc-slot-del{width:26px;height:26px;border-radius:7px;background:none;border:1px solid var(--bdr);color:var(--tx3);cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center;transition:all .14s;flex-shrink:0}
.qc-slot-del:active{background:#fee2e2;color:#ef4444;border-color:#ef4444}

/* 시간 행 */
.qc-time-row{display:grid;grid-template-columns:1fr 1fr auto;gap:6px;align-items:end;margin-bottom:8px}
.qc-dur-badge{padding:7px 8px;border-radius:9px;background:var(--surf2);border:1.5px solid var(--bdr);text-align:center;white-space:nowrap;min-width:52px}
.qc-dur-time{font-size:13px;font-weight:900;color:var(--tx);line-height:1.1}
.qc-dur-min{font-size:9px;color:var(--tx3);letter-spacing:.3px;margin-top:1px}

/* 상세 행 */
.qc-detail-row{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px}

/* 슬롯 결과 */
.qc-slot-result{padding:8px 10px;background:var(--surf2);border-radius:8px;border:1px solid var(--bdr);display:flex;align-items:center;flex-wrap:wrap;gap:6px;font-size:11px}
.qc-sr-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0}
.qc-sr-lbl{color:var(--tx3)}
.qc-sr-val{font-weight:700;color:var(--tx)}
.qc-sr-total{margin-left:auto;font-size:15px;font-weight:900;color:var(--a)}
.qc-sr-total.general{color:var(--green)}
.qc-sr-sep{width:1px;height:14px;background:var(--bdr);flex-shrink:0}

/* 빈 상태 */
.qc-empty-slots{text-align:center;padding:32px 16px;color:var(--tx3);border:2px dashed var(--bdr);border-radius:14px;margin-bottom:14px}
.qc-empty-icon{font-size:40px;margin-bottom:10px}
.qc-empty-txt{font-size:13px;line-height:1.9}

/* 결과 카드 */
.qc-detail-card{background:var(--card);border:1px solid var(--bdr);border-radius:14px;overflow:hidden;box-shadow:var(--sh);margin-bottom:14px;animation:cardIn .22s ease both}
.qc-dc-hdr{padding:12px 14px;background:linear-gradient(135deg,rgba(37,99,235,.06),rgba(5,150,105,.04));border-bottom:1px solid var(--bdr);display:flex;align-items:center;justify-content:space-between;gap:8px}
.qc-dc-name{font-size:14px;font-weight:900;color:var(--tx)}
.qc-dc-date{font-size:11px;color:var(--tx3);margin-top:2px}
.qc-dc-rows{padding:4px 0}
.qc-dc-row{display:flex;align-items:center;padding:8px 14px;gap:10px;border-bottom:1px solid var(--bdr);transition:background .12s}
.qc-dc-row:last-child{border-bottom:none}
.qc-dc-row:hover{background:var(--card2)}
.qc-dc-typebadge{padding:2px 8px;border-radius:6px;font-size:10px;font-weight:800;flex-shrink:0}
.qc-dc-typebadge.general{background:rgba(5,150,105,.1);color:var(--green)}
.qc-dc-typebadge.class{background:var(--a10);color:var(--a)}
.qc-dc-info{flex:1;min-width:0}
.qc-dc-time{font-size:12px;font-weight:700;color:var(--tx)}
.qc-dc-meta{font-size:10px;color:var(--tx3);margin-top:2px;display:flex;flex-wrap:wrap;gap:5px}
.qc-dc-pay{font-size:14px;font-weight:900;color:var(--tx);white-space:nowrap}
.qc-summary-row{display:flex;gap:0;border-top:1px solid var(--bdr)}
.qc-summary-cell{flex:1;padding:10px 12px;text-align:center;border-right:1px solid var(--bdr)}
.qc-summary-cell:last-child{border-right:none}
.qc-sc-lbl{font-size:9px;font-weight:800;color:var(--tx3);letter-spacing:.6px;margin-bottom:3px}
.qc-sc-val{font-size:13px;font-weight:800;color:var(--tx)}
.qc-sc-val.general{color:var(--green)}
.qc-sc-val.class{color:var(--a)}
.qc-total-row{padding:12px 14px;background:linear-gradient(135deg,var(--a10),rgba(5,150,105,.06));display:flex;align-items:center;justify-content:space-between;border-top:2px solid var(--a)}
.qc-total-l{font-size:13px;font-weight:800;color:var(--tx)}
.qc-total-v{font-size:26px;font-weight:900;color:var(--a)}
.qc-share-row{display:flex;gap:6px;padding:10px 14px;border-top:1px solid var(--bdr);flex-wrap:wrap}
.qc-sb{flex:1;min-width:60px;padding:10px 4px;border-radius:10px;font-size:11px;font-weight:700;cursor:pointer;border:none;font-family:var(--font);transition:all .15s}
.qc-sb.copy{background:var(--a10);color:var(--a);border:1px solid var(--a40)}
.qc-sb.share{background:var(--a);color:#fff;box-shadow:0 3px 10px var(--a40)}
.qc-sb.print{background:rgba(5,150,105,.1);color:var(--green);border:1px solid rgba(5,150,105,.3)}
.qc-sb.save{background:rgba(245,158,11,.1);color:#d97706;border:1px solid rgba(245,158,11,.3)}
.qc-sb:active{transform:scale(.95)}

/* 인쇄 */

`;
    document.head.appendChild(s);
  }

  /* ══════════════════════════════════════════
   * INIT
   * ══════════════════════════════════════════ */
  async function init() {
    _css();
    if (typeof StaffDB === 'undefined') { console.warn('[StaffApp] StaffDB not loaded'); return; }
    // 저장된 홈탭 적용
    _st.subTab = _loadHomeTab();
    await StaffDB.init();
    StaffDB.on('staff', () => {
      const pg = document.getElementById('page-staff');
      if (!pg?.classList.contains('on')) return;
      if (_st.subTab === 'list') _renderList();
    });
    console.log('[StaffApp v3.2] ✅ homeTab:', _st.subTab);
  }

  /* ══ RENDER ══ */
  function render() {
    const pg = document.getElementById('page-staff'); if (!pg) return;
    pg.innerHTML = _shell();
    if      (_st.subTab === 'list')      _renderList();
    else if (_st.subTab === 'salary')    _renderSalary();
    else if (_st.subTab === 'all')       _renderAll();
    else if (_st.subTab === 'quickcalc') _renderQuickCalc();
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
        <div class="phr" style="display:flex;gap:5px;align-items:center">
          <button class="ibtn" id="sf-pin-btn" onclick="StaffApp._openHomeTabSetting()"
            title="시작 화면 설정" style="font-size:14px;position:relative">
            📌
            <span id="sf-pin-dot" style="position:absolute;top:2px;right:2px;width:6px;height:6px;border-radius:50%;background:var(--a);display:${_loadHomeTab()==='list'?'none':'block'}"></span>
          </button>
          <button class="ibtn" onclick="StaffApp.openAdd()" title="직원 추가">➕</button>
        </div>
      </div>
      <div class="sf-stabs">
        ${['list','salary','all','quickcalc'].map(t => {
          const home = _loadHomeTab() === t;
          const labels = {list:'👥 직원', salary:'💰 급여', all:'📊 일괄정산', quickcalc:'⚡ 즉시계산'};
          return `<button class="sf-stab ${_st.subTab===t?'on':''}"
            onclick="StaffApp.switchTab('${t}')"
            style="${t==='quickcalc'&&_st.subTab!==t?'color:#d97706':''}">
            ${labels[t]}${home?'<span class="sf-home-dot"></span>':''}
          </button>`;
        }).join('')}
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
      <div id="sf-batch-ov" class="ov hidden" onclick="if(event.target.id==='sf-batch-ov')StaffApp.closeBatch()">
        <div class="sh" id="sf-batch-sh" onclick="event.stopPropagation()" style="max-height:92vh;display:flex;flex-direction:column;"></div>
      </div>
      <div id="sf-overlap-ov" class="ov hidden" onclick="event.stopPropagation()">
        <div class="sh" id="sf-overlap-sh" onclick="event.stopPropagation()" style="max-height:80vh;display:flex;flex-direction:column;"></div>
      </div>
      <div id="sf-templ-add-ov" class="ov hidden" onclick="if(event.target.id==='sf-templ-add-ov')StaffApp.closeTemplAdd()">
        <div class="sh" id="sf-templ-add-sh" onclick="event.stopPropagation()" style="max-height:80vh;display:flex;flex-direction:column;"></div>
      </div>
      <div id="sf-qsave-ov" class="ov hidden" onclick="if(event.target.id==='sf-qsave-ov')StaffApp._closeQSave()">
        <div class="sh" id="sf-qsave-sh" onclick="event.stopPropagation()" style="max-height:70vh;display:flex;flex-direction:column;"></div>
      </div>
      <div id="sf-hometab-ov" class="ov hidden" onclick="if(event.target.id==='sf-hometab-ov')StaffApp._closeHomeTabSetting()">
        <div class="sh" id="sf-hometab-sh" onclick="event.stopPropagation()" style="max-height:60vh;display:flex;flex-direction:column;"></div>
      </div>`;
  }

  function switchTab(tab) {
    _st.subTab = tab;
    const TABS = ['list','salary','all','quickcalc'];
    document.querySelectorAll('.sf-stab').forEach((b, i) => {
      b.classList.toggle('on', TABS[i] === tab);
      if (TABS[i] === 'quickcalc') b.style.color = tab === 'quickcalc' ? 'var(--a)' : '#d97706';
    });
    // 핀 도트 갱신
    const dot = document.getElementById('sf-pin-dot');
    if (dot) dot.style.display = _loadHomeTab() === 'list' ? 'none' : 'block';
    if      (tab === 'list')      _renderList();
    else if (tab === 'salary')    _renderSalary();
    else if (tab === 'all')       _renderAll();
    else if (tab === 'quickcalc') _renderQuickCalc();
  }

  /* ══════════════════════════════════════════
   * 직원 목록
   * ══════════════════════════════════════════ */
  function _renderList() {
    const cnt = document.getElementById('sf-cnt'); if (!cnt) return;
    const all    = StaffDB.getAll();
    const active = all.filter(s => s.status !== '퇴직');
    const left   = all.filter(s => s.status === '퇴직');
    const sub    = document.getElementById('sf-sub');
    if (sub) {
      const ft = active.filter(s => s.employType !== 'parttime').length;
      const pt = active.filter(s => s.employType === 'parttime').length;
      sub.textContent = `재직 ${active.length}명 (정직원 ${ft} · 알바 ${pt})`;
    }
    cnt.innerHTML = `
      <div class="sf-scroll">
        ${all.length === 0
          ? `<div class="sf-empty"><div style="font-size:48px;margin-bottom:10px">👩‍💼</div>등록된 직원이 없습니다<br><small>우상단 + 버튼으로 추가</small></div>`
          : `${active.length ? `<span class="sf-lbl">재직 (${active.length}명)</span>${active.map(_cardHTML).join('')}` : ''}
             ${left.length   ? `<span class="sf-lbl" style="margin-top:12px">퇴직 (${left.length}명)</span>${left.map(_cardHTML).join('')}` : ''}`}
      </div>`;
  }

  function _cardHTML(s) {
    const off  = s.status === '퇴직';
    const isPt = s.employType === 'parttime';
    const mw   = StaffDB.getMinWage();
    const rateLabel = isPt
      ? `시급 ${_fmt(s.baseHourlyRate || mw)}원`
      : (s.monthlySalary > 0 ? `월 ${_fmt(s.monthlySalary)}원` : `수업 ${_fmt(s.classRate)}원/h`);

    return `<div class="sf-card" onclick="StaffApp.openEdit('${s.id}')" style="cursor:pointer">
      <div class="sf-av ${off ? 'off' : (isPt ? 'pt' : '')}">${_e((s.name || '?')[0])}</div>
      <div class="sf-ci">
        <div class="sf-cn">${_e(s.name)}</div>
        <div class="sf-cm">
          <span class="sf-bdg ${off ? 'off' : 'ok'}">${s.status}</span>
          <span class="sf-bdg ${isPt ? 'pt' : 'ft'}">${isPt ? '⏱ 알바' : '🏢 정직원'}</span>
          ${s.contractType === 'contract' ? `<span class="sf-bdg ctrt">계약직</span>` : ''}
          ${s.phone ? `<span class="sf-bdg">📞 ${_e(s.phone)}</span>` : ''}
          ${s.hireDate ? `<span class="sf-bdg">📅 ${s.hireDate.slice(0, 7)}</span>` : ''}
          <span class="sf-bdg">${rateLabel}</span>
        </div>
      </div>
      <div class="sf-cacts" onclick="event.stopPropagation()">
        <button class="ibtn" title="근무 달력"  onclick="StaffApp.openCal('${s.id}')">📅</button>
        <button class="ibtn red" title="삭제"   onclick="StaffApp.deleteStaff('${s.id}')">🗑</button>
      </div>
    </div>`;
  }

  /* ══════════════════════════════════════════
   * 직원 편집 모달
   * ══════════════════════════════════════════ */
  let _editTempl = {};

  function openAdd()    { _st.editId = null; _editTempl = {}; _drawEdit(null); document.getElementById('sf-edit-ov')?.classList.remove('hidden'); history.pushState({ pg:'staff', modal:'edit' }, ''); }
  function openEdit(id) { _st.editId = id;   _editTempl = JSON.parse(JSON.stringify(StaffDB.getTemplate(id)||{})); _drawEdit(StaffDB.getById(id)); document.getElementById('sf-edit-ov')?.classList.remove('hidden'); history.pushState({ pg:'staff', modal:'edit' }, ''); }

  function _drawEdit(s) {
    const sh = document.getElementById('sf-edit-sh'); if (!sh) return;
    const mw = StaffDB.getMinWage();
    const isPt = s?.employType === 'parttime';
    sh.innerHTML = `
      <div class="sh-handle"></div>
      <div class="sh-title">${s ? '✏️ 직원 수정' : '➕ 직원 추가'}</div>
      <div style="flex:1;overflow-y:auto;padding:4px 0 8px">
        <div class="sf-fg">
          <div class="sf-full"><span class="sf-fl">이름 *</span><input class="sf-fi" id="sf-f-name" placeholder="직원 이름" value="${_e(s?.name||'')}"></div>
          <div><span class="sf-fl">연락처</span><input class="sf-fi" id="sf-f-phone" type="tel" placeholder="010-0000-0000" value="${_e(s?.phone||'')}"></div>
          <div><span class="sf-fl">생년월일</span><input class="sf-fi" id="sf-f-birth" type="date" value="${_e(s?.birthDate||'')}"></div>
          <div><span class="sf-fl">입사일</span><input class="sf-fi" id="sf-f-hire" type="date" value="${_e(s?.hireDate||'')}"></div>
          <div><span class="sf-fl">퇴사일</span><input class="sf-fi" id="sf-f-leave" type="date" value="${_e(s?.leaveDate||'')}"></div>
          <div><span class="sf-fl">계약 유형</span>
            <select class="sf-fi" id="sf-f-ctype">
              <option value="regular"  ${(s?.contractType||'regular')==='regular' ?'selected':''}>정규직</option>
              <option value="contract" ${(s?.contractType||'regular')==='contract'?'selected':''}>계약직</option>
            </select>
          </div>
          <div class="sf-full"><span class="sf-fl">⭐ 고용 형태 *</span>
            <select class="sf-fi" id="sf-f-etype" onchange="StaffApp._toggleEtype()">
              <option value="fulltime" ${!isPt?'selected':''}>🏢 정직원 (고정 월급)</option>
              <option value="parttime" ${isPt?'selected':''}>⏱ 알바 (시급제)</option>
            </select>
          </div>
          <!-- 정직원 필드 -->
          <div class="sf-full" id="sf-f-monthly-wrap" ${isPt?'style="display:none"':''}>
            <span class="sf-fl">월 고정급 (0=시급합산)</span>
            <input class="sf-fi" id="sf-f-monthly" type="number" min="0" placeholder="0" value="${s?.monthlySalary||0}">
          </div>
          <!-- 알바 필드 -->
          <div class="sf-full" id="sf-f-hourly-wrap" ${!isPt?'style="display:none"':''}>
            <span class="sf-fl">기본 시급 (0=최저시급 ${_fmt(mw)}원)</span>
            <input class="sf-fi" id="sf-f-hourly" type="number" min="0" placeholder="${mw}" value="${s?.baseHourlyRate||0}">
          </div>
          <div><span class="sf-fl">수업 시급</span><input class="sf-fi" id="sf-f-cr" type="number" min="0" value="${s?.classRate||mw}"></div>
          <div><span class="sf-fl">일반 시급</span><input class="sf-fi" id="sf-f-gr" type="number" min="0" value="${s?.generalRate||mw}"></div>
          <div><span class="sf-fl">급여 지급일</span><input class="sf-fi" id="sf-f-pd" type="number" min="0" max="31" placeholder="0=말일" value="${s?.payDay??0}"></div>
          <div class="sf-full"><span class="sf-fl">주소</span><input class="sf-fi" id="sf-f-addr" placeholder="주소" value="${_e(s?.address||'')}"></div>
          <div class="sf-full"><span class="sf-fl">메모</span><input class="sf-fi" id="sf-f-memo" placeholder="메모" value="${_e(s?.memo||'')}"></div>
        </div>
        <div class="sf-templ-sec">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
            <span class="sf-lbl" style="padding:0">📋 주간 근무 템플릿</span>
            <span style="font-size:10px;color:var(--tx3)">요일별 고정 근무</span>
          </div>
          <div id="sf-templ-rows">${_templRowsHTML()}</div>
        </div>
      </div>
      <div class="sh-acts">
        <button class="btn-x"  onclick="StaffApp.closeEdit()">취소</button>
        <button class="btn-ok" onclick="StaffApp.saveStaff()">저장</button>
      </div>`;
  }

  function _toggleEtype() {
    const t = document.getElementById('sf-f-etype')?.value;
    document.getElementById('sf-f-monthly-wrap')?.style.setProperty('display', t === 'parttime' ? 'none' : '');
    document.getElementById('sf-f-hourly-wrap')?.style.setProperty('display', t === 'parttime' ? '' : 'none');
  }

  function _templRowsHTML() {
    return WORK_DAYS.map(dow => {
      const entries = _editTempl[dow] || [];
      return `<div class="sf-templ-dow-row">
        <span class="sf-dow-lbl">${dow}</span>
        <div class="sf-templ-entries">
          ${entries.map((e, i) => `
            <div class="sf-templ-entry">
              <span class="sf-templ-entry-type ${e.type}">${e.type === 'class' ? '수업' : '일반'}</span>
              <span class="sf-templ-entry-info">${_e(e.start)}~${_e(e.end)} (${_fmtHrs(e.hours)}h)${e.note ? ' · ' + _e(e.note) : ''}</span>
              <button class="sf-templ-del" onclick="StaffApp._templDel('${dow}',${i})">✕</button>
            </div>`).join('')}
        </div>
        <button class="sf-templ-add-btn" onclick="StaffApp.openTemplAdd('${dow}')">+ 추가</button>
      </div>`;
    }).join('');
  }

  function _templDel(dow, idx) {
    (_editTempl[dow] = _editTempl[dow] || []).splice(idx, 1);
    const el = document.getElementById('sf-templ-rows');
    if (el) el.innerHTML = _templRowsHTML();
  }

  /* 템플릿 항목 추가 모달 */
  let _templAddDow = '';
  function openTemplAdd(dow) {
    _templAddDow = dow;
    const sh  = document.getElementById('sf-templ-add-sh');
    const sid = _st.editId;
    const s   = sid ? StaffDB.getById(sid) : null;
    const mw  = StaffDB.getMinWage();
    sh.innerHTML = `
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
    _taType = 'class'; _taHrs();
  }

  let _taType = 'class';
  function _taWtype(t) {
    _taType = t;
    document.getElementById('sf-ta-wb-class')?.classList.toggle('on', t === 'class');
    document.getElementById('sf-ta-wb-class')?.classList.toggle('class', t === 'class');
    document.getElementById('sf-ta-wb-general')?.classList.toggle('on', t === 'general');
    document.getElementById('sf-ta-wb-general')?.classList.toggle('general', t === 'general');
  }
  function _taHrs() {
    const sv = document.getElementById('sf-ta-s')?.value, ev = document.getElementById('sf-ta-e')?.value, b = document.getElementById('sf-ta-hrs');
    if (!sv || !ev || !b) return;
    const [sh, sm] = sv.split(':').map(Number), [eh, em] = ev.split(':').map(Number);
    let d = (eh * 60 + em) - (sh * 60 + sm); if (d < 0) d += 1440;
    b.textContent = d > 0 ? _fmtHrs(d / 60) + 'h' : '-';
  }
  function _addTemplEntry() {
    const start = document.getElementById('sf-ta-s')?.value, end = document.getElementById('sf-ta-e')?.value, note = document.getElementById('sf-ta-note')?.value?.trim() || '';
    if (!start || !end) { _toast('⚠️ 시간을 입력해주세요'); return; }
    const [sh, sm] = start.split(':').map(Number), [eh, em] = end.split(':').map(Number);
    let d = (eh * 60 + em) - (sh * 60 + sm); if (d <= 0) { _toast('⚠️ 종료가 시작보다 늦어야 합니다'); return; }
    const hours = Math.round(d / 60 * 100) / 100;
    if (!_editTempl[_templAddDow]) _editTempl[_templAddDow] = [];
    _editTempl[_templAddDow].push({ type: _taType, start, end, hours, note });
    closeTemplAdd();
    const el = document.getElementById('sf-templ-rows'); if (el) el.innerHTML = _templRowsHTML();
    _toast(`✅ ${_templAddDow}요일 항목 추가`, 'success');
  }
  function closeTemplAdd() { document.getElementById('sf-templ-add-ov')?.classList.add('hidden'); }

  async function saveStaff() {
    const name = document.getElementById('sf-f-name')?.value?.trim();
    if (!name) { _toast('⚠️ 이름은 필수입니다'); return; }
    const mw   = StaffDB.getMinWage();
    const data = {
      name,
      phone:          document.getElementById('sf-f-phone')?.value?.trim() || '',
      birthDate:      document.getElementById('sf-f-birth')?.value || '',
      hireDate:       document.getElementById('sf-f-hire')?.value  || '',
      leaveDate:      document.getElementById('sf-f-leave')?.value || '',
      contractType:   document.getElementById('sf-f-ctype')?.value || 'regular',
      employType:     document.getElementById('sf-f-etype')?.value || 'fulltime',
      address:        document.getElementById('sf-f-addr')?.value?.trim() || '',
      monthlySalary:  Number(document.getElementById('sf-f-monthly')?.value) || 0,
      baseHourlyRate: Number(document.getElementById('sf-f-hourly')?.value)  || 0,
      classRate:      Number(document.getElementById('sf-f-cr')?.value)      || mw,
      generalRate:    Number(document.getElementById('sf-f-gr')?.value)      || mw,
      payDay:         Number(document.getElementById('sf-f-pd')?.value)      || 0,
      memo:           document.getElementById('sf-f-memo')?.value?.trim()    || '',
    };
    let id = _st.editId;
    if (id) await StaffDB.updateStaff(id, data);
    else    { const s = await StaffDB.addStaff(data); id = s.id; }
    await StaffDB.saveTemplate(id, _editTempl);
    closeEdit(); _renderList(); _toast(`✅ ${name} ${_st.editId ? '수정' : '등록'}`, 'success');
  }

  function closeEdit() { document.getElementById('sf-edit-ov')?.classList.add('hidden'); _st.editId = null; }

  async function deleteStaff(id) {
    const s = StaffDB.getById(id); if (!s) return;
    if (!confirm(`${s.name} 직원을 삭제할까요?`)) return;
    await StaffDB.deleteStaff(id); _renderList(); _toast(`🗑 ${s.name} 삭제`);
  }

  /* ══════════════════════════════════════════
   * 달력 (근무 + 주휴수당 프로그레스 + 배치 등록)
   * ══════════════════════════════════════════ */
  function openCal(sid) {
    _st.calStaffId  = sid;
    _st.copyMode    = false;
    _st.selectMode  = false;
    _st.selected    = new Set();
    _st.copyTargets = new Set();
    _drawCal();
    document.getElementById('sf-cal-ov')?.classList.remove('hidden');
    history.pushState({ pg: 'staff', modal: 'cal' }, '');
  }
  function closeCal() {
    document.getElementById('sf-cal-ov')?.classList.add('hidden');
    _st.calStaffId = null; _cancelCopy(); _cancelSelect();
  }

  function _drawCal() {
    const sh = document.getElementById('sf-cal-sh'); if (!sh || !_st.calStaffId) return;
    const s  = StaffDB.getById(_st.calStaffId);
    const y  = _st.calYear, m = _st.calMonth;
    const ym = `${y}-${String(m).padStart(2, '0')}`;
    const work    = StaffDB.getWorkMonth(_st.calStaffId, ym);
    const today   = new Date().toISOString().slice(0, 10);
    const isPt    = s?.employType === 'parttime';
    const hasTempl = Object.values(StaffDB.getTemplate(_st.calStaffId) || {}).some(v => v?.length > 0);

    let mc = 0, mg = 0;
    Object.values(work).forEach(es => es.forEach(e => {
      if (e.type === 'class') mc += Number(e.hours || 0); else mg += Number(e.hours || 0);
    }));
    const mPay = isPt
      ? (StaffDB.calcPay(_st.calStaffId, y, m)?.totalPay || 0)
      : Math.round(mc * (s?.classRate || 0) + mg * (s?.generalRate || 0));

    const firstDow = new Date(y, m - 1, 1).getDay();
    const lastDay  = new Date(y, m, 0).getDate();

    /* 주휴수당 주차 통계 */
    const weeklyStats = isPt ? StaffDB.getWeeklyStats(_st.calStaffId, y, m) : [];
    const weeklyBarHTML = isPt ? _weeklyBarHTML(weeklyStats, s) : '';

    sh.innerHTML = `
      <div class="sh-handle"></div>
      ${_st.copyMode ? `<div class="sf-copy-banner">
        <span class="sf-copy-banner-txt">📋 ${_st.copyFromDate} 복사 중 · ${_st.copyTargets.size}개 선택<br><small>대상 날짜를 탭하세요</small></span>
        <button class="sf-copy-confirm" onclick="StaffApp._confirmCopy()">복사 (${_st.copyTargets.size})</button>
        <button class="sf-copy-cancel"  onclick="StaffApp._cancelCopy()">취소</button>
      </div>` : ''}
      ${_st.selectMode ? `<div class="sf-sel-banner">
        <span class="sf-sel-banner-txt">☑️ ${_st.selected.size}개 선택됨 — 삭제할 항목을 탭하세요</span>
        <button class="sf-sel-del"    onclick="StaffApp._deleteSelected()">삭제 (${_st.selected.size})</button>
        <button class="sf-sel-cancel" onclick="StaffApp._cancelSelect()">취소</button>
      </div>` : ''}
      ${_st.lastBatchId && !_st.copyMode && !_st.selectMode ? `<div class="sf-undo-banner">
        <span class="sf-undo-txt">✅ ${_st.lastBatchCount}일 일괄 등록 완료</span>
        <button class="sf-undo-btn" onclick="StaffApp._undoBatch()">↩️ 전체 취소</button>
      </div>` : ''}
      ${weeklyBarHTML}
      <div class="sf-cal-nav">
        <button class="sf-cal-arr" onclick="StaffApp._calPrev()">‹</button>
        <div style="text-align:center">
          <div class="sf-cal-ym">${y}년 ${m}월</div>
          <div class="sf-cal-info">${_e(s?.name || '')} ${isPt ? '⏱알바' : '🏢정직원'} · <strong style="color:var(--a)">${_fmt(mPay)}원</strong></div>
        </div>
        <button class="sf-cal-arr" onclick="StaffApp._calNext()">›</button>
      </div>
      <div class="sf-cal-grid" style="flex-shrink:0;border-bottom:1px solid var(--bdr)">
        ${DOW.map(d => `<div class="sf-wd">${d}</div>`).join('')}
      </div>
      <div style="flex:1;overflow-y:auto">
        <div class="sf-cal-grid">
          ${Array.from({ length: firstDow }, () => `<div class="sf-cell sf-ec"></div>`).join('')}
          ${Array.from({ length: lastDay }, (_, i) => {
            const day  = i + 1;
            const date = `${y}-${String(m).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
            const dow  = new Date(y, m - 1, day).getDay();
            const es   = work[date] || [];
            let ch = 0, gh = 0;
            es.forEach(e => { if (e.type === 'class') ch += Number(e.hours||0); else gh += Number(e.hours||0); });
            const tot = ch + gh;
            const isCopyFrom   = _st.copyFromDate === date;
            const isCopyTarget = _st.copyTargets.has(date);
            return `<div class="sf-cell ${date===today?'sf-today':''} ${dow===0?'sf-sun':dow===6?'sf-sat':''} ${isCopyTarget?'copy-target':''}"
                         data-date="${date}"
                         onclick="StaffApp._calCellClick('${date}')"
                         id="sf-cell-${date}">
              <div class="sf-dn">${day}</div>
              ${es.map(e => {
                const key = `${date}::${e.id}`;
                const isSel = _st.selected.has(key);
                return `<div class="sf-ce ${e.type} ${isCopyFrom?'copying':''} ${isSel?'selected-entry':''}"
                    data-eid="${e.id}" data-date="${date}"
                    onclick="event.stopPropagation();StaffApp._entryClick('${date}','${e.id}',event)"
                    >${e.type==='class'?'수':'일'} ${_fmtHrs(Number(e.hours||0))}h${e.nightHours>0?' 🌙':''}</div>`;
              }).join('')}
              ${tot ? `<div class="sf-cell-total">${_fmtHrs(tot)}h</div>` : ''}
            </div>`;
          }).join('')}
        </div>
      </div>
      <div style="padding:10px 14px;border-top:1px solid var(--bdr);flex-shrink:0;display:grid;grid-template-columns:repeat(4,1fr);gap:6px">
        <button class="sf-cal-act-btn primary" onclick="StaffApp.openBatch()">📦<br><span>일괄등록</span></button>
        ${hasTempl
          ? `<button class="sf-cal-act-btn sub" onclick="StaffApp._applyTemplModal()">📋<br><span>템플릿</span></button>`
          : `<button class="sf-cal-act-btn sub" onclick="StaffApp._calToSalary()">💰<br><span>급여확인</span></button>`}
        <button class="sf-cal-act-btn ${_st.selectMode?'danger':'sub'}" onclick="StaffApp._toggleSelectMode()">☑️<br><span>${_st.selectMode?'선택중':'선택삭제'}</span></button>
        <button class="sf-cal-act-btn close" onclick="StaffApp.closeCal()">✕<br><span>닫기</span></button>
      </div>
      ${hasTempl ? `<div style="padding:0 14px 10px;flex-shrink:0;display:grid;grid-template-columns:1fr 1fr;gap:6px">
        <button class="sf-cal-act-btn sub" onclick="StaffApp._calToSalary()">💰<br><span>급여확인</span></button>
        <div></div>
      </div>` : ''}`;

    _bindLongPress();
  }

  /* ── 주휴수당 프로그레스 바 ── */
  function _weeklyBarHTML(weeklyStats, s) {
    if (!weeklyStats.length) return '';
    const curHours  = StaffDB.getCurrentWeekHours(_st.calStaffId);
    const pct       = Math.min(100, Math.round(curHours / 15 * 100));
    const qualified = curHours >= 15;
    const mw        = StaffDB.getMinWage();
    const rate      = s?.baseHourlyRate > 0 ? s.baseHourlyRate : mw;
    const estPay    = qualified ? Math.round((curHours / 5) * rate) : 0;

    const weekChips = weeklyStats.map(w =>
      `<span class="sf-hw-chip ${w.qualified ? 'q' : 'nq'}">${w.qualified ? '✅' : '⬜'} ${w.weekLabel.split(' ')[0]} ${_fmtHrs(w.hours)}h${w.qualified ? ` +${_fmt(w.holidayPay)}원` : ''}</span>`
    ).join('');

    return `<div class="sf-holiday-bar">
      <div class="sf-hb-title">⏱ 주휴수당 달성 현황 (알바 전용)</div>
      <div class="sf-hb-row">
        <div class="sf-hb-track"><div class="sf-hb-fill ${qualified ? 'done' : ''}" style="width:${pct}%"></div></div>
        <span class="sf-hb-label">${_fmtHrs(curHours)} / 15h</span>
        <span class="sf-hb-badge">${qualified ? '✅' : '🟡'}</span>
      </div>
      ${qualified ? `<div style="font-size:10px;color:var(--green);font-weight:700;margin-top:3px">이번 주 예상 주휴수당: +${_fmt(estPay)}원</div>` : ''}
      <div class="sf-holiday-weeks" style="margin-top:6px">${weekChips}</div>
    </div>`;
  }

  /* ── 롱프레스 (복사 진입) ── */
  let _lpTimer = null;
  function _bindLongPress() {
    document.querySelectorAll('.sf-ce').forEach(el => {
      el.addEventListener('pointerdown', () => {
        if (_st.selectMode) return;
        _lpTimer = setTimeout(() => {
          const date = el.dataset.date; if (!date) return;
          _st.copyMode     = true;
          _st.copyFromDate = date;
          _st.copyTargets  = new Set();
          _drawCal();
          _toast(`📋 ${date} 복사 모드 — 대상 날짜를 탭하세요`, 'success');
        }, 700);
      });
      el.addEventListener('pointerup',    () => clearTimeout(_lpTimer));
      el.addEventListener('pointerleave', () => clearTimeout(_lpTimer));
    });
  }

  function _calCellClick(date) {
    if (_st.copyMode) {
      if (date === _st.copyFromDate) return;
      if (_st.copyTargets.has(date)) _st.copyTargets.delete(date); else _st.copyTargets.add(date);
      _drawCal(); return;
    }
    if (_st.selectMode) return;
    StaffApp.openWork(date);
  }

  function _entryClick(date, eid, evt) {
    if (_st.selectMode) {
      const key = `${date}::${eid}`;
      if (_st.selected.has(key)) _st.selected.delete(key); else _st.selected.add(key);
      _drawCal(); return;
    }
    StaffApp.openWork(date);
  }

  /* ── 선택 삭제 ── */
  function _toggleSelectMode() {
    _st.selectMode = !_st.selectMode;
    _st.selected   = new Set();
    _drawCal();
    if (_st.selectMode) _toast('☑️ 삭제할 항목을 탭하세요', 'success');
  }

  async function _deleteSelected() {
    if (!_st.selected.size) { _toast('⚠️ 선택된 항목이 없습니다'); return; }
    const list = [..._st.selected].map(key => {
      const [date, entryId] = key.split('::');
      return { date, entryId };
    });
    const n = await StaffDB.deleteWorkEntries(_st.calStaffId, list);
    _st.selectMode  = false;
    _st.selected    = new Set();
    _st.lastBatchId = null;
    _drawCal();
    _toast(`🗑 ${n}개 항목 삭제`, 'success');
  }

  function _cancelSelect() { _st.selectMode = false; _st.selected = new Set(); _drawCal(); }

  /* ── 복사 ── */
  async function _confirmCopy() {
    if (!_st.copyTargets.size) { _toast('⚠️ 대상 날짜를 선택해주세요'); return; }
    const n = await StaffDB.copyEntries(_st.calStaffId, _st.copyFromDate, [..._st.copyTargets]);
    _cancelCopy();
    _toast(`✅ ${n}일에 복사 완료`, 'success');
  }
  function _cancelCopy() { _st.copyMode = false; _st.copyFromDate = ''; _st.copyTargets = new Set(); _drawCal(); }

  /* ── 템플릿 ── */
  function _applyTemplModal() {
    if (!confirm(`${_st.calYear}년 ${_st.calMonth}월에 주간 템플릿을 적용하시겠습니까?\n기존 데이터가 있는 날짜는 덮어씁니다.`)) return;
    StaffDB.applyTemplate(_st.calStaffId, _st.calYear, _st.calMonth, 'replace').then(n => {
      _drawCal(); _toast(`✅ ${n}일에 템플릿 적용`, 'success');
    });
  }

  /* ── Undo ── */
  async function _undoBatch() {
    if (!_st.lastBatchId) return;
    const n = await StaffDB.batchDelete(_st.calStaffId, _st.lastBatchId);
    _st.lastBatchId   = null;
    _st.lastBatchCount = 0;
    _drawCal();
    _toast(`↩️ ${n}개 항목 취소`, 'success');
  }

  function _calPrev() { if (--_st.calMonth < 1)  { _st.calMonth = 12; _st.calYear--; } _drawCal(); }
  function _calNext() { if (++_st.calMonth > 12) { _st.calMonth = 1;  _st.calYear++; } _drawCal(); }
  function _calToSalary() { _st.payStaffId = _st.calStaffId; _st.payYear = _st.calYear; _st.payMonth = _st.calMonth; closeCal(); switchTab('salary'); setTimeout(_calcAndRender, 120); }

  /* ══════════════════════════════════════════
   * 일괄 등록 모달
   * ══════════════════════════════════════════ */
  let _batchDow = new Set([1, 2, 3, 4, 5]); // 기본: 월~금

  function openBatch() {
    const s   = StaffDB.getById(_st.calStaffId);
    const mw  = StaffDB.getMinWage();
    const isPt = s?.employType === 'parttime';
    const rate  = isPt ? (s.baseHourlyRate > 0 ? s.baseHourlyRate : mw) : (s?.classRate || mw);
    const y = _st.calYear, m = _st.calMonth;
    const firstDay = `${y}-${String(m).padStart(2,'0')}-01`;
    const lastDay  = `${y}-${String(m).padStart(2,'0')}-${new Date(y,m,0).getDate()}`;

    const DOW_LABELS = ['일','월','화','수','목','금','토'];
    const DOW_CLASSES = ['sun','','','','','','sat'];

    const sh = document.getElementById('sf-batch-sh');
    sh.innerHTML = `
      <div class="sh-handle"></div>
      <div class="sh-title">📦 일괄 근무 등록</div>
      <div style="flex:1;overflow-y:auto;padding:4px 0 8px">
        <div class="sf-batch-section">
          <div class="sf-batch-title">📅 등록 기간</div>
          <div class="sf-fg">
            <div><span class="sf-fl">시작일</span><input class="sf-fi" id="sfb-sd" type="date" value="${firstDay}"></div>
            <div><span class="sf-fl">종료일</span><input class="sf-fi" id="sfb-ed" type="date" value="${lastDay}"></div>
          </div>
          <span class="sf-fl" style="margin-top:6px">적용 요일</span>
          <div class="sf-dow-checks" id="sfb-dow-row">
            ${DOW_LABELS.map((d, i) => `
              <div class="sf-dow-chk ${_batchDow.has(i)?'on':''} ${DOW_CLASSES[i]}" onclick="StaffApp._toggleDow(${i},this)" data-dow="${i}">
                ${d}
              </div>`).join('')}
          </div>
        </div>
        <div class="sf-batch-section">
          <div class="sf-batch-title">⏰ 근무 시간</div>
          <div class="sf-time-row" style="margin-bottom:10px">
            <label><span class="sf-tl">출근</span><input class="sf-ti" id="sfb-st" type="time" value="09:00" oninput="StaffApp._batchHrs()"></label>
            <label><span class="sf-tl">퇴근</span><input class="sf-ti" id="sfb-et" type="time" value="18:00" oninput="StaffApp._batchHrs()"></label>
            <div class="sf-hrs" id="sfb-hrs">—</div>
          </div>
          <div class="sf-fg">
            <div><span class="sf-fl">무급 휴게(분)</span><input class="sf-fi" id="sfb-brk" type="number" min="0" max="480" placeholder="60" value="60" oninput="StaffApp._batchHrs()"></div>
            <div><span class="sf-fl">근무 유형</span>
              <select class="sf-fi" id="sfb-type">
                <option value="general">🏢 일반 업무</option>
                <option value="class">📚 수업</option>
              </select>
            </div>
          </div>
        </div>
        ${isPt ? `<div class="sf-batch-section">
          <div class="sf-batch-title">💰 시급 설정 (알바)</div>
          <div class="sf-fg">
            <div><span class="sf-fl">기본 시급 (0=자동 ${_fmt(rate)}원)</span><input class="sf-fi" id="sfb-rate" type="number" min="0" placeholder="${rate}" value="0" oninput="StaffApp._batchRateHint()"></div>
            <div><span class="sf-fl">야간 시급 (0=자동 1.5배)</span><input class="sf-fi" id="sfb-nrate" type="number" min="0" placeholder="${Math.round(rate*1.5)}" value="0"></div>
          </div>
          <div class="sf-rate-info" id="sfb-rate-info">기본 시급 자동 적용: ${_fmt(rate)}원 / 야간 자동: ${_fmt(Math.round(rate*1.5))}원</div>
        </div>` : ''}
        <div class="sf-batch-section">
          <div class="sf-batch-title">📝 메모</div>
          <input class="sf-fi" id="sfb-note" placeholder="메모 (선택사항)">
        </div>
      </div>
      <div class="sh-acts">
        <button class="btn-x"  onclick="StaffApp.closeBatch()">취소</button>
        <button class="btn-ok" onclick="StaffApp._doBatch()">✅ 등록</button>
      </div>`;
    document.getElementById('sf-batch-ov')?.classList.remove('hidden');
    _batchHrs();
  }

  function closeBatch() { document.getElementById('sf-batch-ov')?.classList.add('hidden'); }

  function _toggleDow(i, el) {
    if (_batchDow.has(i)) _batchDow.delete(i); else _batchDow.add(i);
    el.classList.toggle('on', _batchDow.has(i));
  }

  function _batchHrs() {
    const sv = document.getElementById('sfb-st')?.value, ev = document.getElementById('sfb-et')?.value;
    const brk = Number(document.getElementById('sfb-brk')?.value) || 0;
    const b   = document.getElementById('sfb-hrs');
    if (!sv || !ev || !b) return;
    const [sh, sm] = sv.split(':').map(Number), [eh, em] = ev.split(':').map(Number);
    let d = (eh * 60 + em) - (sh * 60 + sm); if (d < 0) d += 1440;
    const net = Math.max(0, d - brk);
    const { baseHours, nightHours } = StaffDB.splitNightHours(sv, ev, brk);
    b.innerHTML = `<span style="font-size:11px;text-align:center">${_fmtHrs(net/60)}h<br><small style="font-size:9px;opacity:.7">${nightHours>0?`야간 ${_fmtHrs(nightHours)}h`:'야간없음'}</small></span>`;
  }

  function _batchRateHint() {
    const v   = Number(document.getElementById('sfb-rate')?.value) || 0;
    const s   = StaffDB.getById(_st.calStaffId);
    const mw  = StaffDB.getMinWage();
    const base = v > 0 ? v : (s?.baseHourlyRate > 0 ? s.baseHourlyRate : mw);
    const el  = document.getElementById('sfb-rate-info');
    if (el) el.textContent = `적용 시급: ${_fmt(base)}원 / 야간 자동: ${_fmt(Math.round(base * 1.5))}원`;
  }

  async function _doBatch() {
    const sd   = document.getElementById('sfb-sd')?.value;
    const ed   = document.getElementById('sfb-ed')?.value;
    const st   = document.getElementById('sfb-st')?.value;
    const et   = document.getElementById('sfb-et')?.value;
    const brk  = Number(document.getElementById('sfb-brk')?.value) || 0;
    const type = document.getElementById('sfb-type')?.value || 'general';
    const rate  = Number(document.getElementById('sfb-rate')?.value)  || 0;
    const nrate = Number(document.getElementById('sfb-nrate')?.value) || 0;
    const note  = document.getElementById('sfb-note')?.value?.trim() || '';

    if (!sd || !ed || !st || !et) { _toast('⚠️ 필수 항목을 입력해주세요'); return; }
    if (sd > ed) { _toast('⚠️ 시작일이 종료일보다 늦습니다'); return; }
    if (!_batchDow.size) { _toast('⚠️ 요일을 하나 이상 선택해주세요'); return; }

    // 날짜 목록 생성
    const dates = [];
    let cur = new Date(sd), end = new Date(ed);
    while (cur <= end) {
      if (_batchDow.has(cur.getDay())) dates.push(cur.toISOString().slice(0, 10));
      cur.setDate(cur.getDate() + 1);
    }
    if (!dates.length) { _toast('⚠️ 선택한 요일에 해당하는 날짜가 없습니다'); return; }

    // 중첩 감지
    const overlaps = StaffDB.checkOverlap(_st.calStaffId, dates);
    if (overlaps.length > 0) {
      _showOverlapModal(overlaps, dates, { startDate:sd, endDate:ed, startTime:st, endTime:et, breakMin:brk, type, hourlyRate:rate, nightRate:nrate, note });
      return;
    }

    await _executeBatch({ startDate:sd, endDate:ed, startTime:st, endTime:et, breakMin:brk, type, hourlyRate:rate, nightRate:nrate, note, overwrite:true });
  }

  function _showOverlapModal(overlaps, dates, opts) {
    const sh = document.getElementById('sf-overlap-sh');
    sh.innerHTML = `
      <div class="sh-handle"></div>
      <div class="sh-title" style="color:#ef4444">⚠️ 기존 데이터 중첩 감지</div>
      <div style="padding:12px;flex:1;overflow-y:auto">
        <p style="font-size:13px;color:var(--tx2);margin:0 0 10px">
          선택한 기간 중 <strong style="color:#ef4444">${overlaps.length}일</strong>에 이미 근무 기록이 있습니다.<br>
          최신 데이터로 덮어쓰시겠습니까?
        </p>
        <div style="background:var(--surf2);border-radius:8px;padding:8px 10px;font-size:11px;color:var(--tx3);max-height:140px;overflow-y:auto">
          ${overlaps.map(d => `<div style="padding:2px 0">📅 ${d}</div>`).join('')}
        </div>
        <p style="font-size:11px;color:var(--tx3);margin:8px 0 0">취소하면 기존 데이터를 보존합니다.</p>
      </div>
      <div class="sh-acts">
        <button class="btn-x"  onclick="StaffApp._closeOverlap()">취소 (보존)</button>
        <button class="btn-ok" style="background:#ef4444;box-shadow:0 3px 10px rgba(239,68,68,.3)" onclick="StaffApp._confirmOverlap()">덮어쓰기</button>
      </div>`;
    document.getElementById('sf-overlap-ov')?.classList.remove('hidden');
    _pendingBatchOpts = opts;
  }

  let _pendingBatchOpts = null;
  function _closeOverlap() {
    document.getElementById('sf-overlap-ov')?.classList.add('hidden');
    _pendingBatchOpts = null;
  }
  async function _confirmOverlap() {
    _closeOverlap();
    if (_pendingBatchOpts) await _executeBatch({ ..._pendingBatchOpts, overwrite: true });
  }

  async function _executeBatch(opts) {
    try {
      const { batchId, count } = await StaffDB.batchInsert(_st.calStaffId, { ...opts, daysOfWeek: [..._batchDow] });
      _st.lastBatchId    = batchId;
      _st.lastBatchCount = count;
      closeBatch();
      _drawCal();
      _toast(`✅ ${count}일 일괄 등록 완료`, 'success');
    } catch(e) {
      _toast(`⚠️ 오류: ${e.message}`);
    }
  }

  /* ══════════════════════════════════════════
   * 근무 입력 모달 (단일 날짜)
   * ══════════════════════════════════════════ */
  function openWork(date) { _st.workDate = date; _st.workType = 'class'; _drawWork(); document.getElementById('sf-work-ov')?.classList.remove('hidden'); history.pushState({ pg:'staff', modal:'work' }, ''); }
  function closeWork()    { document.getElementById('sf-work-ov')?.classList.add('hidden'); _drawCal(); }

  function _drawWork() {
    const sh = document.getElementById('sf-work-sh'); if (!sh) return;
    const s  = StaffDB.getById(_st.calStaffId);
    const es = StaffDB.getWorkDay(_st.calStaffId, _st.workDate);
    const dow = DOW[new Date(_st.workDate).getDay()];
    const isPt = s?.employType === 'parttime';
    const mw   = StaffDB.getMinWage();
    const rate  = isPt ? (s.baseHourlyRate > 0 ? s.baseHourlyRate : mw) : (s?.classRate || mw);

    sh.innerHTML = `
      <div class="sh-handle"></div>
      <div class="sh-title">📅 근무 입력</div>
      <div class="sh-sub">${_st.workDate} (${dow}) · ${_e(s?.name || '')}</div>
      <div style="flex:1;overflow-y:auto;padding:4px 0 8px">
        <div class="sf-wtype-row">
          <button class="sf-wbtn ${_st.workType==='class'?'on class':''}"   id="sf-wb-class" onclick="StaffApp._wtype('class')">📚 수업<br><small>${_fmt(s?.classRate||mw)}원/h</small></button>
          <button class="sf-wbtn ${_st.workType==='general'?'on general':''}" id="sf-wb-gen" onclick="StaffApp._wtype('general')">🏢 일반<br><small>${_fmt(s?.generalRate||mw)}원/h</small></button>
        </div>
        <div class="sf-time-row">
          <label><span class="sf-tl">시작 시간</span><input class="sf-ti" id="sf-ws" type="time" value="09:00" oninput="StaffApp._chrs()"></label>
          <label><span class="sf-tl">종료 시간</span><input class="sf-ti" id="sf-we" type="time" value="18:00" oninput="StaffApp._chrs()"></label>
          <div class="sf-hrs" id="sf-whrs">—</div>
        </div>
        ${isPt ? `<div class="sf-fg" style="margin-bottom:8px">
          <div><span class="sf-fl">무급 휴게(분)</span><input class="sf-fi" id="sf-wbrk" type="number" min="0" placeholder="0" value="0" oninput="StaffApp._chrs()"></div>
          <div><span class="sf-fl">시급 (0=자동 ${_fmt(rate)}원)</span><input class="sf-fi" id="sf-wrate" type="number" min="0" placeholder="${rate}" value="0"></div>
        </div>` : ''}
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
          <span style="font-size:11px;color:var(--tx3);flex-shrink:0">직접 입력(h):</span>
          <input type="number" min="0" max="24" step="0.25" placeholder="예) 1.5" id="sf-wh-manual"
                 style="flex:1;padding:7px 10px;border-radius:9px;border:1.5px solid var(--bdr);background:var(--surf);font-size:13px;color:var(--tx);font-family:var(--font);outline:none"
                 oninput="StaffApp._manualHrs(this.value)">
        </div>
        <input class="sf-note" id="sf-wn" placeholder="메모 (선택사항)">
        <button class="btn-ok" style="width:100%;margin-bottom:14px" onclick="StaffApp._addEntry()">✅ 근무 등록</button>
        <div style="font-size:10px;font-weight:800;color:var(--tx3);letter-spacing:1px;margin-bottom:6px">이 날 근무 (${es.length}건)</div>
        <div id="sf-el">${es.length ? es.map(e => _entryHTML(e, s)).join('') : '<div style="font-size:12px;color:var(--tx3);padding:6px 4px">등록된 근무 없음</div>'}</div>
      </div>
      <div class="sh-acts"><button class="btn-x" onclick="StaffApp.closeWork()">닫기</button></div>`;
    _chrs();
  }

  function _entryHTML(e, s) {
    const c     = e.type === 'class' ? { tx: 'var(--a)', l: '수업' } : { tx: 'var(--green)', l: '일반' };
    const night = e.nightHours > 0 ? ` 🌙야간 ${_fmtHrs(e.nightHours)}h` : '';
    const rateInfo = e.appliedRate ? ` @${_fmt(e.appliedRate)}원` : '';
    return `<div class="sf-ei">
      <div class="sf-edot" style="background:${c.tx}"></div>
      <span style="font-size:11px;font-weight:700;color:${c.tx};min-width:28px">${c.l}</span>
      <span style="font-size:12px;color:var(--tx2);flex:1">${_e(e.start||'')}~${_e(e.end||'')} <strong>${_fmtHrs(e.hours)}h</strong>${night}${rateInfo}${e.note ? ' · ' + _e(e.note) : ''}</span>
      <button class="ibtn red" style="width:28px;height:28px;font-size:12px" onclick="StaffApp._delEntry('${e.id}')">✕</button>
    </div>`;
  }

  function _wtype(t) {
    _st.workType = t;
    document.getElementById('sf-wb-class')?.classList.toggle('on', t === 'class');
    document.getElementById('sf-wb-class')?.classList.toggle('class', t === 'class');
    document.getElementById('sf-wb-gen')?.classList.toggle('on', t === 'general');
    document.getElementById('sf-wb-gen')?.classList.toggle('general', t === 'general');
  }

  let _manualHrsVal = null;
  function _chrs() {
    _manualHrsVal = null;
    const sv = document.getElementById('sf-ws')?.value, ev = document.getElementById('sf-we')?.value;
    const brk = Number(document.getElementById('sf-wbrk')?.value) || 0;
    const b   = document.getElementById('sf-whrs');
    const m   = document.getElementById('sf-wh-manual'); if (m) m.value = '';
    if (!sv || !ev || !b) return;
    const { baseHours, nightHours } = StaffDB.splitNightHours(sv, ev, brk);
    const total = baseHours + nightHours;
    b.innerHTML = `<span style="font-size:11px;text-align:center">${_fmtHrs(total)}h<br><small style="font-size:9px;opacity:.7">${nightHours > 0 ? `🌙${_fmtHrs(nightHours)}h` : '야간없음'}</small></span>`;
  }
  function _manualHrs(v) {
    _manualHrsVal = v ? Math.round(Number(v) * 100) / 100 : null;
    const b = document.getElementById('sf-whrs');
    if (b && _manualHrsVal != null) b.innerHTML = `<span>${_fmtHrs(_manualHrsVal)}h</span>`;
  }

  async function _addEntry() {
    const start = document.getElementById('sf-ws')?.value, end = document.getElementById('sf-we')?.value;
    const note  = document.getElementById('sf-wn')?.value?.trim() || '';
    const brk   = Number(document.getElementById('sf-wbrk')?.value)  || 0;
    const manualRate = Number(document.getElementById('sf-wrate')?.value) || 0;

    let hours, baseHours, nightHours;
    if (_manualHrsVal != null && _manualHrsVal > 0) {
      hours = _manualHrsVal; baseHours = hours; nightHours = 0;
    } else {
      if (!start || !end) { _toast('⚠️ 시작/종료 시간을 입력해주세요'); return; }
      const split = StaffDB.splitNightHours(start, end, brk);
      baseHours = split.baseHours; nightHours = split.nightHours;
      hours     = baseHours + nightHours;
    }
    if (hours <= 0) { _toast('⚠️ 근무 시간이 0입니다'); return; }

    const s = StaffDB.getById(_st.calStaffId);
    const mw = StaffDB.getMinWage();
    const appliedRate      = manualRate > 0 ? manualRate : (s?.baseHourlyRate > 0 ? s.baseHourlyRate : mw);
    const appliedNightRate = Math.round(appliedRate * 1.5);

    await StaffDB.addWorkEntry(_st.calStaffId, _st.workDate, {
      type: _st.workType, start, end, hours, baseHours, nightHours,
      breakMin: brk, appliedRate, appliedNightRate, note,
    });
    _drawWork();
    _toast(`✅ ${_st.workType==='class'?'수업':'일반'} ${_fmtHrs(hours)}h 등록`, 'success');
  }

  async function _delEntry(eid) {
    await StaffDB.deleteWorkEntry(_st.calStaffId, _st.workDate, eid);
    _drawWork();
    _toast('삭제');
  }

  /* ══════════════════════════════════════════
   * 급여 계산 탭 (개인)
   * ══════════════════════════════════════════ */
  function _renderSalary() {
    const cnt   = document.getElementById('sf-cnt'); if (!cnt) return;
    const staff = StaffDB.getActive(), now = new Date();
    const y = _st.payYear, m = _st.payMonth;
    const acad = StaffDB.getAcad();
    cnt.innerHTML = `
      <div class="sf-acad-row">
        <span>🏫</span>
        <input class="sf-acad-inp" id="sf-acad-inp" value="${_e(acad.name)}" placeholder="학원명 입력">
        <button class="sf-acad-save" onclick="StaffApp._saveAcad()">저장</button>
      </div>
      <div class="sf-pay-bar">
        <div class="sf-pay-item"><span class="sf-pay-lbl">👤 직원</span>
          <select id="sf-ps" onchange="StaffApp._onSel()">
            <option value="">— 직원 선택 —</option>
            ${staff.map(s => `<option value="${s.id}" ${_st.payStaffId===s.id?'selected':''}>${_e(s.name)} (${s.employType==='parttime'?'알바':'정직원'})</option>`).join('')}
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
        ${_st.payResult ? _payHTML(_st.payResult)
          : `<div class="sf-empty" style="padding:48px 20px"><div style="font-size:44px;margin-bottom:8px">💰</div>직원과 연월을 선택하고 계산 버튼을 누르세요<br><small style="font-size:12px">급여 기간: 1일~말일</small></div>`}
      </div>`;
  }

  function _onSel() {
    _st.payStaffId = document.getElementById('sf-ps')?.value || null;
    _st.payYear    = Number(document.getElementById('sf-py')?.value) || new Date().getFullYear();
    _st.payMonth   = Number(document.getElementById('sf-pm')?.value) || new Date().getMonth() + 1;
  }
  function _calcAndRender() {
    _onSel();
    if (!_st.payStaffId) { _toast('⚠️ 직원을 선택해주세요'); return; }
    const r = StaffDB.calcPay(_st.payStaffId, _st.payYear, _st.payMonth);
    _st.payResult = r;
    const pb = document.getElementById('sf-pb');
    if (pb) pb.innerHTML = _payHTML(r);
  }
  function _saveAcad() { const name = document.getElementById('sf-acad-inp')?.value?.trim(); if (!name) return; StaffDB.setAcad({ name }); _toast(`🏫 "${name}" 저장`, 'success'); }

  function _payHTML(r) {
    if (!r) return '';
    const s   = r.staff;
    const pd  = Number(s.payDay || 0);
    const pdStr = pd === 0 ? '말일' : `${pd}일`;
    const isPt = r.type === 'parttime';

    const dayRows = Object.keys(r.byDay).sort().map(date => {
      const d   = r.byDay[date], dow = DOW[new Date(date).getDay()];
      const baseAmt = isPt
        ? d.entries.reduce((sum, e) => {
            const rate = Number(e.appliedRate || s.baseHourlyRate || StaffDB.getMinWage(r.year));
            return sum + (Number(e.baseHours || e.hours || 0) * rate);
          }, 0)
        : Math.round(d.classHrs * s.classRate + d.generalHrs * s.generalRate);
      const nightAmt = d.entries.reduce((sum, e) => {
        const nr = Number(e.appliedNightRate || 0);
        return sum + (Number(e.nightHours || 0) * nr);
      }, 0);
      const amt = Math.round(baseAmt + nightAmt);
      return `<div class="sf-drow">
        <span class="sf-ddt">${date.slice(5)} (${dow})</span>
        <div class="sf-dtgs">
          ${d.classHrs  ? `<span class="sf-ce class"   style="font-size:11px">수업 ${_fmtHrs(d.classHrs)}h</span>` : ''}
          ${d.generalHrs? `<span class="sf-ce general" style="font-size:11px">일반 ${_fmtHrs(d.generalHrs)}h</span>` : ''}
          ${(d.nightHrs||0)>0? `<span class="sf-night-tag">🌙야간 ${_fmtHrs(d.nightHrs)}h</span>` : ''}
        </div>
        <span style="font-size:11px;color:var(--tx3);margin-left:auto">${_fmt(amt)}원</span>
      </div>`;
    }).join('');

    /* 주휴수당 주차 행 */
    const weekRows = isPt && r.weeklyStats?.length ? r.weeklyStats.map(w =>
      `<div class="sf-pr holiday-row">
        <span class="sf-pr-l">
          <span class="sf-holiday-tag">주휴</span>
          ${w.weekLabel} (${_fmtHrs(w.hours)}h${w.qualified ? ` ≥15h ✅` : ` <15h ❌`})
        </span>
        <span class="sf-pr-v">${w.qualified ? '+' + _fmt(w.holidayPay) + '원' : '-'}</span>
      </div>`
    ).join('') : '';

    return `<div class="sf-pcard">
      <div class="sf-phead">
        <div>
          <div class="sf-pname">${isPt ? '⏱ 알바 —' : '🏢 정직원 —'} ${_e(s.name)} 급여</div>
          <div class="sf-pperiod">📅 ${r.from} ~ ${r.to} · 지급일 ${r.year}년 ${r.month}월 ${pdStr}</div>
        </div>
        <div class="sf-ptot-w"><div class="sf-ptot-l">세전 합계</div><div class="sf-ptot">${_fmt(r.totalPay)}원</div></div>
      </div>
      <div class="sf-prows">
        ${isPt ? `
          <div class="sf-pr">
            <span class="sf-pr-l">💰 기본 시급 (${_fmtHrs(r.classHrs+r.generalHrs)}h × ${_fmt(r.hourlyRate)}원)</span>
            <span class="sf-pr-v">${_fmt(r.basePay)}원</span>
          </div>
          ${r.nightPay > 0 ? `<div class="sf-pr night-row">
            <span class="sf-pr-l">🌙 야간 수당 <small style="font-size:10px">(22:00 이후 1.5배)</small></span>
            <span class="sf-pr-v">+${_fmt(r.nightPay)}원</span>
          </div>` : ''}
          ${weekRows}
          <div class="sf-pr sf-tot">
            <span class="sf-pr-l">⏱ 알바 세전 합계</span>
            <span class="sf-pr-v">${_fmt(r.totalPay)}원</span>
          </div>
        ` : `
          <div class="sf-pr">
            <span class="sf-pr-l"><span style="width:10px;height:10px;border-radius:50%;background:var(--a);display:inline-block;margin-right:4px"></span>📚 수업 (${_fmtHrs(r.classHrs)}h × ${_fmt(s.classRate)}원)</span>
            <span class="sf-pr-v">${_fmt(r.classPay)}원</span>
          </div>
          <div class="sf-pr">
            <span class="sf-pr-l"><span style="width:10px;height:10px;border-radius:50%;background:var(--green);display:inline-block;margin-right:4px"></span>🏢 일반 (${_fmtHrs(r.generalHrs)}h × ${_fmt(s.generalRate)}원)</span>
            <span class="sf-pr-v">${_fmt(r.generalPay)}원</span>
          </div>
          ${r.monthlyFixed ? `<div class="sf-pr" style="background:var(--a10);border-radius:8px;padding:8px 10px;border:1px solid var(--a40)">
            <span class="sf-pr-l" style="font-weight:800">🏢 고정 월급 적용</span>
            <span class="sf-pr-v" style="color:var(--a)">${_fmt(s.monthlySalary)}원</span>
          </div>` : ''}
          <div class="sf-pr sf-tot">
            <span class="sf-pr-l">⏱ 총 ${_fmtHrs(r.classHrs+r.generalHrs)}h · 세전 합계</span>
            <span class="sf-pr-v">${_fmt(r.totalPay)}원</span>
          </div>
        `}
      </div>
      ${dayRows ? `<div style="padding:4px 14px 12px;border-top:1px solid var(--bdr)"><span class="sf-lbl" style="padding-top:10px">근무 상세</span>${dayRows}</div>` : `<div style="padding:14px 16px;text-align:center;color:var(--tx3);font-size:13px">이 기간에 등록된 근무가 없습니다</div>`}
      <div class="sf-acts2">
        <button class="sf-ab cal"   onclick="StaffApp.openCal('${s.id}')">📅 달력</button>
        <button class="sf-ab copy"  onclick="StaffApp._copy()">📋 복사</button>
        <button class="sf-ab pdf"   onclick="StaffApp._pdf()">🖨️ PDF</button>
        <button class="sf-ab share" onclick="StaffApp._share()">📤 공유</button>
      </div>
    </div>`;
  }

  /* ══════════════════════════════════════════
  /* ══════════════════════════════════════════
   * 일괄정산 탭
   * ══════════════════════════════════════════ */

  /* ─── 일괄정산 탭 렌더 ─────────────────────────────────────────
   *  월 선택 → 해당 월 전직원 급여
   *  월 미선택(0) → 연간 전체 집계 (세무자료용)
   * ────────────────────────────────────────────────────────────── */
  function _renderAll() {
    const cnt = document.getElementById('sf-cnt'); if (!cnt) return;
    const now = new Date();
    const y = _st.payYear, m = _st.payMonth;

    cnt.innerHTML = `
      <div class="sf-pay-bar" style="flex-wrap:wrap;gap:6px">
        <div class="sf-pay-item" style="min-width:80px"><span class="sf-pay-lbl">📅 연도</span>
          <select id="sf-all-y" onchange="StaffApp._onAllSel()">
            ${[now.getFullYear()-1,now.getFullYear(),now.getFullYear()+1]
              .map(yr=>`<option value="${yr}" ${y===yr?'selected':''}>${yr}년</option>`).join('')}
          </select>
        </div>
        <div class="sf-pay-item" style="min-width:100px"><span class="sf-pay-lbl">📅 월 (미선택=연간)</span>
          <select id="sf-all-m" onchange="StaffApp._onAllSel()">
            <option value="0" ${m===0?'selected':''}>— 연간 전체 —</option>
            ${Array.from({length:12},(_,i)=>i+1)
              .map(mo=>`<option value="${mo}" ${m===mo?'selected':''}>${mo}월</option>`).join('')}
          </select>
        </div>
        <button class="sf-calc-btn" onclick="StaffApp._calcAll()">📊 집계</button>
        <button class="sf-ab xls" style="flex:none;padding:9px 14px;font-size:12px"
          onclick="StaffApp._downloadExcel()">📥 엑셀</button>
      </div>
      <div id="sf-all-body" class="sf-scroll">
        <div class="sf-empty" style="padding:40px 20px">
          <div style="font-size:40px;margin-bottom:8px">📊</div>
          연도·월을 선택 후 [집계] 버튼을 누르세요<br>
          <small style="font-size:12px;opacity:.7">월 미선택 시 <strong>연간 전체 세무자료</strong>로 출력됩니다</small>
        </div>
      </div>`;
  }

  function _onAllSel() {
    _st.payYear  = Number(document.getElementById('sf-all-y')?.value) || new Date().getFullYear();
    _st.payMonth = Number(document.getElementById('sf-all-m')?.value) || 0;
  }

  function _calcAll() {
    _onAllSel();
    const staff = StaffDB.getActive();
    const body  = document.getElementById('sf-all-body'); if (!body) return;
    if (!staff.length) { body.innerHTML = '<div class="sf-empty">등록된 직원이 없습니다</div>'; return; }
    if (_st.payMonth === 0) _renderAnnual(staff, body);
    else                    _renderMonthly(staff, body);
  }

  /* ─── 월별 집계 ─────────────────────────────────────────────── */
  function _renderMonthly(staff, body) {
    const y = _st.payYear, m = _st.payMonth;
    const results    = staff.map(s => StaffDB.calcPay(s.id, y, m)).filter(Boolean);
    const grandTotal = results.reduce((sum, r) => sum + r.totalPay, 0);
    const acad       = StaffDB.getAcad();

    body.innerHTML = `
      <div style="padding:10px 0 4px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px">
        <div style="font-size:13px;font-weight:800;color:var(--tx)">${y}년 ${m}월 급여 내역</div>
        <div style="font-size:11px;color:var(--tx3)">${_e(acad.name)} · 재직 ${staff.length}명</div>
      </div>
      <div style="overflow-x:auto;margin-bottom:10px">
        <table class="sf-all-tbl">
          <thead><tr>
            <th>직원</th><th>형태</th><th>근무일</th><th>수업(h)</th><th>일반(h)</th>
            <th>기본급</th><th>주휴수당</th><th style="min-width:90px">세전합계</th>
          </tr></thead>
          <tbody>
            ${results.map(r => {
              const s = r.staff, isPt = r.type === 'parttime';
              const days = Object.keys(r.byDay).length;
              const holPay = isPt ? (r.totalHolidayPay||0) : 0;
              const holWks = isPt ? (r.weeklyStats?.filter(w=>w.qualified).length||0) : 0;
              return `<tr>
                <td style="font-weight:700">${_e(s.name)}</td>
                <td><span class="sf-bdg ${isPt?'pt':'ft'}">${isPt?'알바':'정직원'}</span></td>
                <td style="text-align:center">${days}</td>
                <td style="text-align:center">${_fmtHrs(r.classHrs)}h</td>
                <td style="text-align:center">${_fmtHrs(r.generalHrs)}h</td>
                <td style="text-align:right">${_fmt(isPt?(r.basePay||0):r.totalPay)}원</td>
                <td style="text-align:right">${holPay>0?`<span class="sf-holiday-tag">+${_fmt(holPay)}원 (${holWks}주)</span>`:'-'}</td>
                <td style="text-align:right;font-weight:800;color:var(--a)">${_fmt(r.totalPay)}원</td>
              </tr>`;
            }).join('')}
          </tbody>
          <tfoot><tr class="sf-all-tot">
            <td colspan="7" style="text-align:right">🏫 ${y}년 ${m}월 총 지급액</td>
            <td style="text-align:right">${_fmt(grandTotal)}원</td>
          </tr></tfoot>
        </table>
      </div>
      <div style="font-size:11px;color:var(--tx3);text-align:center;padding:4px 0 10px">
        ※ 세전 기준 · 4대보험·소득세 공제 전
      </div>`;
  }

  /* ─── 연간 집계 (세무자료용) ─────────────────────────────────── */
  function _renderAnnual(staff, body) {
    const y    = _st.payYear;
    const acad = StaffDB.getAcad();
    const MONTHS = Array.from({length:12}, (_, i) => i + 1);

    // 직원별 × 월별 급여 계산
    const matrix = staff.map(s => {
      const byMonth = MONTHS.map(m => { const r = StaffDB.calcPay(s.id, y, m); return r ? r.totalPay : 0; });
      return { s, byMonth, annual: byMonth.reduce((a, b) => a + b, 0) };
    });
    const monthTotals = MONTHS.map((_, i) => matrix.reduce((sum, row) => sum + row.byMonth[i], 0));
    const grandTotal  = matrix.reduce((sum, row) => sum + row.annual, 0);

    const ftStaff  = matrix.filter(r => r.s.employType !== 'parttime');
    const ptStaff  = matrix.filter(r => r.s.employType === 'parttime');
    const ftAnnual = ftStaff.reduce((s, r) => s + r.annual, 0);
    const ptAnnual = ptStaff.reduce((s, r) => s + r.annual, 0);

    // 세액 추정 함수
    const _estIT = a => a<=14000000?Math.round(a*.006):a<=30000000?Math.round(84000+(a-14000000)*.015):a<=45000000?Math.round(324000+(a-30000000)*.024):Math.round(684000+(a-45000000)*.035);
    const _est33 = a => Math.round(a * 0.033);

    body.innerHTML = `
      <!-- 연간 요약 카드 2개 -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">
        <div style="background:linear-gradient(135deg,var(--a10),rgba(37,99,235,.04));border:1.5px solid var(--a40);border-radius:12px;padding:12px">
          <div style="font-size:10px;font-weight:800;color:var(--a);letter-spacing:.8px;margin-bottom:6px">📊 ${y}년 연간 총 급여</div>
          <div style="font-size:20px;font-weight:900;color:var(--a);line-height:1.1">${_fmt(grandTotal)}<small style="font-size:11px">원</small></div>
          <div style="font-size:10px;color:var(--tx3);margin-top:4px">전 직원 세전 합계</div>
        </div>
        <div style="background:linear-gradient(135deg,rgba(5,150,105,.08),rgba(5,150,105,.02));border:1.5px solid rgba(5,150,105,.3);border-radius:12px;padding:12px">
          <div style="font-size:10px;font-weight:800;color:var(--green);letter-spacing:.8px;margin-bottom:6px">👥 인원 구성</div>
          <div style="font-size:12px;font-weight:800;color:var(--tx)">정직원 ${ftStaff.length}명 · 알바 ${ptStaff.length}명</div>
          <div style="font-size:10px;color:var(--tx3);margin-top:4px">🏢 ${_fmt(ftAnnual)}원</div>
          <div style="font-size:10px;color:var(--tx3)">⏱ ${_fmt(ptAnnual)}원</div>
        </div>
      </div>

      <!-- 세무 참고 카드 -->
      <div style="background:var(--card);border:1px solid var(--bdr);border-radius:12px;padding:12px;margin-bottom:12px;box-shadow:var(--sh)">
        <div style="font-size:10px;font-weight:800;color:#d97706;letter-spacing:.8px;margin-bottom:10px">
          🧾 세무 참고 추정 <small style="font-size:9px;font-weight:400;color:var(--tx3)">실제 신고는 세무사 확인 필수</small>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
          <div style="padding:8px;background:var(--surf2);border-radius:8px">
            <div style="font-size:10px;font-weight:700;color:var(--tx3);margin-bottom:6px">🏢 정직원 근로소득세 (추정)</div>
            ${ftStaff.length > 0
              ? ftStaff.map(r=>`<div style="display:flex;justify-content:space-between;font-size:11px;padding:3px 0;border-bottom:1px solid var(--bdr)">
                  <span style="font-weight:700">${_e(r.s.name)}</span>
                  <span style="color:#d97706">~${_fmt(_estIT(r.annual))}원</span>
                </div>`).join('')
              : '<div style="font-size:11px;color:var(--tx3)">해당 없음</div>'}
          </div>
          <div style="padding:8px;background:var(--surf2);border-radius:8px">
            <div style="font-size:10px;font-weight:700;color:var(--tx3);margin-bottom:6px">⏱ 알바 3.3% 원천세 (추정)</div>
            ${ptStaff.length > 0
              ? ptStaff.map(r=>`<div style="display:flex;justify-content:space-between;font-size:11px;padding:3px 0;border-bottom:1px solid var(--bdr)">
                  <span style="font-weight:700">${_e(r.s.name)}</span>
                  <span style="color:#7c3aed">~${_fmt(_est33(r.annual))}원</span>
                </div>`).join('')
              : '<div style="font-size:11px;color:var(--tx3)">해당 없음</div>'}
          </div>
        </div>
        <div style="padding:8px 10px;background:rgba(245,158,11,.07);border-radius:8px;border:1px solid rgba(245,158,11,.25);font-size:10px;color:#92400e;line-height:1.8">
          💡 <strong>세무 제출 체크리스트</strong><br>
          ✅ 정직원 — 근로소득 지급명세서 (익년 3월 10일 제출)<br>
          ✅ 알바 — 일용/사업소득 지급명세서 (지급월 다음달 말일)<br>
          ✅ 월 60만원 이하 일용직 — 비과세 해당 여부 검토<br>
          ✅ 주 15시간 이상 알바 — 4대보험 가입 의무
        </div>
      </div>

      <!-- 월별 바 차트 -->
      <div style="font-size:11px;font-weight:800;color:var(--tx3);letter-spacing:.8px;margin-bottom:6px">📈 ${y}년 월별 총 지급액 추이</div>
      <div style="background:var(--card);border:1px solid var(--bdr);border-radius:12px;padding:12px;margin-bottom:12px">
        ${_annualBarChart(monthTotals)}
      </div>

      <!-- 직원별 월별 매트릭스 -->
      <div style="font-size:11px;font-weight:800;color:var(--tx3);letter-spacing:.8px;margin-bottom:6px">${y}년 직원별 월별 급여 현황 (단위: 원)</div>
      <div style="overflow-x:auto;margin-bottom:10px">
        <table class="sf-all-tbl" style="min-width:660px">
          <thead><tr>
            <th>직원</th><th>형태</th>
            ${MONTHS.map(m=>`<th style="text-align:right">${m}월</th>`).join('')}
            <th style="text-align:right">연간합계</th>
          </tr></thead>
          <tbody>
            ${matrix.map(({s,byMonth,annual})=>`<tr>
              <td style="font-weight:700">${_e(s.name)}</td>
              <td><span class="sf-bdg ${s.employType==='parttime'?'pt':'ft'}">${s.employType==='parttime'?'알바':'정직원'}</span></td>
              ${byMonth.map(p=>`<td style="text-align:right;font-size:11px">${p>0?_fmt(p):'-'}</td>`).join('')}
              <td style="text-align:right;font-weight:800;color:var(--a)">${_fmt(annual)}</td>
            </tr>`).join('')}
          </tbody>
          <tfoot><tr class="sf-all-tot">
            <td colspan="2" style="text-align:right">월 합계</td>
            ${monthTotals.map(t=>`<td style="text-align:right">${t>0?_fmt(t):'-'}</td>`).join('')}
            <td style="text-align:right">${_fmt(grandTotal)}</td>
          </tr></tfoot>
        </table>
      </div>
      <div style="font-size:11px;color:var(--tx3);text-align:center;padding:4px 0 16px">
        ※ 세전 기준 · 추정 세액은 단순 계산이며 실제 신고는 세무사 확인 필수
      </div>`;
  }

  /* SVG 바 차트 */
  function _annualBarChart(monthTotals) {
    const max    = Math.max(...monthTotals, 1);
    const LABELS = ['1','2','3','4','5','6','7','8','9','10','11','12'];
    const COLORS = ['#3b82f6','#06b6d4','#10b981','#84cc16','#f59e0b','#ef4444','#8b5cf6','#ec4899','#14b8a6','#f97316','#6366f1','#22c55e'];
    const bW = 16, gap = 5, padL = 4, cH = 72;
    const tW = (bW + gap) * 12 - gap + padL * 2;
    const bars = monthTotals.map((v, i) => {
      const bh = v > 0 ? Math.max(4, Math.round(v / max * cH)) : 0;
      const x  = padL + i * (bW + gap), y = cH - bh;
      return `<g>
        <rect x="${x}" y="${y}" width="${bW}" height="${bh}" rx="3" fill="${COLORS[i]}" opacity=".85"/>
        ${v>0?`<text x="${x+bW/2}" y="${y-3}" text-anchor="middle" font-size="7" fill="var(--tx3)">${Math.round(v/10000)}만</text>`:''}
        <text x="${x+bW/2}" y="${cH+11}" text-anchor="middle" font-size="8" fill="var(--tx3)">${LABELS[i]}</text>
      </g>`;
    }).join('');
    return `<svg viewBox="0 0 ${tW} ${cH+16}" style="width:100%;height:auto;display:block">
      <line x1="${padL}" y1="0" x2="${padL}" y2="${cH}" stroke="var(--bdr2)" stroke-width="1"/>
      <line x1="${padL}" y1="${cH}" x2="${tW-padL}" y2="${cH}" stroke="var(--bdr2)" stroke-width="1"/>
      ${bars}
    </svg>`;
  }

  /* ── Excel 다운로드 (월별/연간 분기) ── */
  function _downloadExcel() {
    if (typeof XLSX === 'undefined') { _toast('⚠️ SheetJS 라이브러리 로드 실패'); return; }
    _onAllSel();
    const acad = StaffDB.getAcad();
    const wb   = XLSX.utils.book_new();

    if (_st.payMonth === 0) {
      /* 연간 엑셀 — 시트1: 월별 매트릭스, 시트2: 세무 참고 */
      const staff  = StaffDB.getActive();
      const MONTHS = Array.from({length:12}, (_, i) => i + 1);
      const header = ['직원명','고용형태', ...MONTHS.map(m=>m+'월'), '연간합계'];
      const rows   = [header];
      const monthSums = new Array(12).fill(0);
      let grandTotal = 0;

      staff.forEach(s => {
        const byMonth = MONTHS.map(m => { const r=StaffDB.calcPay(s.id,_st.payYear,m); return r?r.totalPay:0; });
        const annual  = byMonth.reduce((a,b)=>a+b,0);
        byMonth.forEach((v,i) => monthSums[i]+=v);
        grandTotal += annual;
        rows.push([s.name, s.employType==='parttime'?'알바':'정직원', ...byMonth, annual]);
      });
      rows.push(['합계', '', ...monthSums, grandTotal]);

      const ws1 = XLSX.utils.aoa_to_sheet(rows);
      ws1['!cols'] = [12,8,...new Array(12).fill(10),12].map(w=>({wpx:w*6}));
      XLSX.utils.book_append_sheet(wb, ws1, `${_st.payYear}년 월별현황`);

      /* 시트2: 세무 참고 */
      const taxRows = [
        ['직원명','고용형태','연간총급여(원)','추정세액(원)','비고'],
        ...staff.map((s,idx) => {
          const annual = rows[idx+1]?.[rows[idx+1].length-1] || 0;
          const isPt   = s.employType==='parttime';
          const tax    = isPt ? Math.round(annual*0.033)
            : (annual<=14000000?Math.round(annual*.006):Math.round(84000+(annual-14000000)*.015));
          return [s.name, isPt?'알바':'정직원', annual, tax, isPt?'3.3% 원천세(추정)':'근로소득간이세액(추정)'];
        }),
      ];
      const ws2 = XLSX.utils.aoa_to_sheet(taxRows);
      ws2['!cols'] = [12,8,14,12,20].map(w=>({wpx:w*6}));
      XLSX.utils.book_append_sheet(wb, ws2, `${_st.payYear}년 세무참고`);
      XLSX.writeFile(wb, `${acad.name}_${_st.payYear}년_연간급여현황.xlsx`);

    } else {
      const rows = StaffDB.buildExcelData(_st.payYear, _st.payMonth);
      const ws   = XLSX.utils.aoa_to_sheet(rows);
      ws['!cols'] = [16,8,8,8,8,8,8,12,10,10,12,24,14].map(w=>({wpx:w*6}));
      XLSX.utils.book_append_sheet(wb, ws, `${_st.payYear}년${_st.payMonth}월 급여`);
      XLSX.writeFile(wb, `${acad.name}_${_st.payYear}년${_st.payMonth}월_급여명세.xlsx`);
    }
    _toast('📥 엑셀 다운로드 완료', 'success');
  }

  /* ── 급여 공유/PDF/복사 ── */
  function _payText() {
    const r = _st.payResult; if (!r) return '';
    const s   = r.staff;
    const pd  = Number(s.payDay || 0);
    const pdStr = pd === 0 ? `${r.year}년 ${r.month}월 말일` : `${r.year}년 ${r.month}월 ${pd}일`;
    const acad  = StaffDB.getAcad();
    const isPt  = r.type === 'parttime';
    const lines = [
      `══════════════════════`, `🏫 ${acad.name}`, `💰 급여 명세서`,
      `══════════════════════`, `👤 ${s.name} (${isPt?'알바':'정직원'})`,
      `📅 ${r.from} ~ ${r.to}`, `🗓 발행: ${new Date().toLocaleDateString('ko-KR')} · 지급: ${pdStr}`,
      `─────────────────────`,
    ];
    if (isPt) {
      lines.push(`💰 기본급: ${_fmtHrs(r.classHrs+r.generalHrs)}h × ${_fmt(r.hourlyRate)}원 = ${_fmt(r.basePay)}원`);
      if (r.nightPay > 0) lines.push(`🌙 야간수당: ${_fmt(r.nightPay)}원`);
      if (r.totalHolidayPay > 0) lines.push(`✅ 주휴수당: ${_fmt(r.totalHolidayPay)}원`);
    } else {
      lines.push(`📚 수업: ${_fmtHrs(r.classHrs)}h × ${_fmt(s.classRate)}원 = ${_fmt(r.classPay)}원`);
      lines.push(`🏢 일반: ${_fmtHrs(r.generalHrs)}h × ${_fmt(s.generalRate)}원 = ${_fmt(r.generalPay)}원`);
    }
    lines.push(`─────────────────────`, `세전 합계: ${_fmt(r.totalPay)}원`);
    return lines.join('\n');
  }

  async function _copy()  { try { await navigator.clipboard.writeText(_payText()); _toast('📋 복사됐습니다', 'success'); } catch { _toast('⚠️ 복사 실패'); } }
  async function _share() { const r = _st.payResult; if (!r) return; const t = _payText(); const sd = { title: `${r.staff.name} 급여 명세`, text: t }; if (navigator.share && navigator.canShare?.(sd)) { try { await navigator.share(sd); _toast('📤 공유 완료', 'success'); return; } catch(e) { if (e.name === 'AbortError') return; } } _copy(); }

  function _pdf() {
    const r = _st.payResult; if (!r) return;
    const s = r.staff, acad = StaffDB.getAcad();
    const pd    = Number(s.payDay || 0);
    const pdStr = pd === 0 ? `${r.year}년 ${r.month}월 말일` : `${r.year}년 ${r.month}월 ${pd}일`;
    const today = new Date().toLocaleDateString('ko-KR');
    const isPt  = r.type === 'parttime';

    const dayRows = Object.keys(r.byDay).sort().map(date => {
      const d = r.byDay[date], dow = DOW[new Date(date).getDay()];
      const amt = isPt
        ? Math.round(d.entries.reduce((s, e) => s + Number(e.baseHours||e.hours||0)*Number(e.appliedRate||r.hourlyRate), 0))
        : Math.round(d.classHrs * s.classRate + d.generalHrs * s.generalRate);
      return `<tr>
        <td>${date} (${dow})</td>
        <td style="text-align:center">${d.classHrs?_fmtHrs(d.classHrs)+'h':'-'}</td>
        <td style="text-align:center">${d.generalHrs?_fmtHrs(d.generalHrs)+'h':'-'}</td>
        <td style="text-align:right">${_fmt(amt)}원</td>
      </tr>`;
    }).join('');

    const html = `
      <div class="sfp-hdr">
        <div>
          <div class="sfp-org-name">${_e(acad.name)}</div>
          <div class="sfp-title">급 여 명 세 서</div>
        </div>
        <div class="sfp-date">발행일: ${today}</div>
      </div>
      <hr class="sfp-div">
      <table style="margin-bottom:10px">
        <tr><th>성&nbsp;&nbsp;명</th><td>${_e(s.name)}</td><th>급여 기간</th><td>${r.from} ~ ${r.to}</td></tr>
        <tr><th>지 급 일</th><td>${pdStr}</td><th>연락처</th><td>${_e(s.phone||'-')}</td></tr>
        <tr><th>고용 형태</th><td>${isPt?'알바(시급제)':'정직원'} / ${s.contractType==='contract'?'계약직':'정규직'}</td>
            <th>${isPt?'기본 시급':'수업/일반 시급'}</th>
            <td>${isPt?`${_fmt(r.hourlyRate)}원`:`${_fmt(s.classRate)}원 / ${_fmt(s.generalRate)}원`}</td></tr>
      </table>
      <table>
        <thead><tr><th>항&nbsp;&nbsp;목</th><th style="text-align:center">내&nbsp;&nbsp;역</th><th style="text-align:right">지급금액</th></tr></thead>
        <tbody>
          ${isPt ? `
            <tr><td>기본 근무</td><td style="text-align:center">${_fmtHrs(r.classHrs+r.generalHrs)}h × ${_fmt(r.hourlyRate)}원</td><td style="text-align:right">${_fmt(r.basePay)}원</td></tr>
            ${(r.totalHolidayPay||0)>0?`<tr><td>주휴수당</td><td style="text-align:center">주 15h 이상 ${r.weeklyStats.filter(w=>w.qualified).length}주</td><td style="text-align:right">${_fmt(r.totalHolidayPay)}원</td></tr>`:''}
          ` : `
            <tr><td>수업</td><td style="text-align:center">${_fmtHrs(r.classHrs)}h × ${_fmt(s.classRate)}원</td><td style="text-align:right">${_fmt(r.classPay)}원</td></tr>
            <tr><td>일반</td><td style="text-align:center">${_fmtHrs(r.generalHrs)}h × ${_fmt(s.generalRate)}원</td><td style="text-align:right">${_fmt(r.generalPay)}원</td></tr>
            ${r.monthlyFixed?`<tr><td colspan="2" style="font-weight:700">고정 월급 적용</td><td style="text-align:right;font-weight:700">${_fmt(s.monthlySalary)}원</td></tr>`:''}
          `}
        </tbody>
        <tfoot><tr class="sfp-tot"><td colspan="2"><strong>세전 합계</strong></td><td style="text-align:right"><strong>${_fmt(r.totalPay)}원</strong></td></tr></tfoot>
      </table>
      ${dayRows?`<table style="margin-top:8px"><thead><tr><th>날짜</th><th>수업(h)</th><th>일반(h)</th><th>일 급여</th></tr></thead><tbody>${dayRows}</tbody></table>`:''}
      <div class="sfp-sign">
        <div class="sfp-sign-box"><div>확&nbsp;&nbsp;인</div><div class="sfp-sign-line"></div><div>${_e(s.name)} (서명)</div></div>
        <div class="sfp-sign-box"><div>원&nbsp;&nbsp;장</div><div class="sfp-sign-line"></div><div>${_e(acad.name)}</div></div>
      </div>
      <div class="sfp-footer">본 명세서는 ${_e(acad.name)}에서 발행되었습니다.</div>`;
    _printInNewWindow(html);
  }




  /* ══════════════════════════════════════════════════════════════
   * ⚡ 즉시 시급 계산기  v2 — 업무 유형별 차등 시급 (야간수당 없음)
   * ══════════════════════════════════════════════════════════════ */

  /* ── 슬롯 단일 계산 ──
   * type: 'general'(일반) | 'class'(수업)
   * rate: 0이면 기본 설정 시급, 그 외 개별 시급 우선
   * 계산: 분단위 → Math.ceil(순근무분 / 60 × 시급)
   */
  function _qCalcSlot(slot) {
    const start = slot.start, end = slot.end;
    if (!start || !end) return null;

    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    let rawMin = (eh * 60 + em) - (sh * 60 + sm);
    if (rawMin <= 0) rawMin += 1440;          // 자정 넘김 처리
    if (rawMin <= 0) return null;
    const netMin = rawMin;

    const mw = StaffDB.getMinWage();
    // 시급 결정 우선순위: 슬롯 개별시급 > 유형 기본시급 > 최저시급
    const baseByType = slot.type === 'class'
      ? (Number(_qBase.classRate)   || mw)
      : (Number(_qBase.generalRate) || mw);
    const rate = Number(slot.rate) > 0 ? Number(slot.rate) : baseByType;

    const pay = Math.ceil(netMin / 60 * rate);   // 분 단위 올림 계산
    return { rate, netMin, rawMin, pay, type: slot.type };
  }

  /* ── 전체 합산 ── */
  function _qCompute() {
    if (!_qSlots.length) { _qResult = null; return null; }
    let grandTotal = 0, totalMin = 0, generalPay = 0, classPay = 0;
    const slotResults = _qSlots.map((slot, i) => {
      const r = _qCalcSlot(slot);
      if (r) {
        grandTotal += r.pay;
        totalMin   += r.netMin;
        if (r.type === 'class') classPay   += r.pay;
        else                    generalPay += r.pay;
      }
      return { slot, result: r, index: i + 1 };
    });
    _qResult = { slotResults, grandTotal, totalMin, generalPay, classPay,
                 name: _qBase.name, date: _qBase.date };
    return _qResult;
  }


  /* ── 공통 인쇄 CSS (iframe 실제 인쇄용) ── */
  const _PRINT_CSS = `
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Noto Sans KR',Arial,sans-serif;font-size:12px;color:#111;padding:20px 28px;background:#fff}
    .sfp-hdr{display:flex;align-items:flex-start;gap:12px;margin-bottom:10px}
    .sfp-org-name{font-size:16px;font-weight:900;color:#111}
    .sfp-title{font-size:12px;color:#555;margin-top:2px}
    .sfp-date{font-size:10px;color:#888;text-align:right;flex:1;margin-top:2px}
    .sfp-div{border:none;border-top:2px solid #111;margin:8px 0}
    table{width:100%;border-collapse:collapse;margin-bottom:10px}
    th{background:#eef2ff;padding:5px 8px;text-align:left;font-size:10px;font-weight:800;color:#333;border:1px solid #c7d2fe}
    td{padding:5px 8px;font-size:11px;color:#111;border:1px solid #ddd}
    tr:nth-child(even) td{background:#fafafa}
    .sfp-tot td{background:#eef2ff!important;font-weight:900}
    .sfp-sign{margin-top:20px;display:flex;justify-content:flex-end;gap:36px}
    .sfp-sign-box{text-align:center;font-size:11px}
    .sfp-sign-line{border-bottom:1px solid #aaa;width:72px;margin:24px auto 4px}
    .sfp-footer{font-size:9px;color:#aaa;text-align:center;margin-top:12px}
    @media print{@page{size:A4;margin:12mm}}
  `;

  /* ── 앱 내 인쇄 미리보기 모달 ── */
  function _printInNewWindow(bodyHTML) {
    // 기존 모달 제거
    document.getElementById('sf-prev-ov')?.remove();

    const ov = document.createElement('div');
    ov.id = 'sf-prev-ov';
    ov.style.cssText = `
      position:fixed;inset:0;z-index:9999;
      background:rgba(0,0,0,.55);backdrop-filter:blur(3px);
      display:flex;flex-direction:column;align-items:center;justify-content:center;
      padding:16px;box-sizing:border-box;
    `;

    ov.innerHTML = `
      <div style="
        background:#f8f9fa;border-radius:14px;
        width:100%;max-width:520px;max-height:88vh;
        display:flex;flex-direction:column;
        box-shadow:0 20px 60px rgba(0,0,0,.4);overflow:hidden;
      ">
        <!-- 툴바 -->
        <div style="
          display:flex;align-items:center;justify-content:space-between;
          padding:10px 14px;background:#fff;
          border-bottom:1px solid #e5e7eb;flex-shrink:0;
        ">
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:15px">🖨️</span>
            <span style="font-size:13px;font-weight:700;color:#111">인쇄 미리보기</span>
          </div>
          <div style="display:flex;gap:6px">
            <button onclick="
              const fr=document.getElementById('sf-prev-frame');
              if(fr){fr.contentWindow.focus();fr.contentWindow.print();}
            " style="
              padding:7px 18px;border-radius:8px;
              background:#2563eb;color:#fff;border:none;
              font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;
            ">🖨️ 인쇄</button>
            <button onclick="document.getElementById('sf-prev-ov').remove()" style="
              padding:7px 12px;border-radius:8px;
              background:#f3f4f6;color:#374151;border:1px solid #d1d5db;
              font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;
            ">✕ 닫기</button>
          </div>
        </div>
        <!-- 미리보기 영역 (종이 느낌) -->
        <div style="flex:1;overflow-y:auto;padding:16px;background:#e5e7eb;">
          <div style="
            background:#fff;border-radius:4px;
            box-shadow:0 2px 12px rgba(0,0,0,.18);
            overflow:hidden;
          ">
            <iframe id="sf-prev-frame" style="
              width:100%;border:none;display:block;
              min-height:400px;
            " scrolling="no"></iframe>
          </div>
        </div>
      </div>`;

    document.body.appendChild(ov);

    // iframe에 내용 주입
    const fr  = document.getElementById('sf-prev-frame');
    const doc = fr.contentDocument || fr.contentWindow.document;
    doc.open();
    doc.write(`<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><style>${_PRINT_CSS}</style></head><body>${bodyHTML}</body></html>`);
    doc.close();

    // iframe 높이를 내용에 맞게 자동 조정
    const _resize = () => {
      try {
        const h = doc.body.scrollHeight;
        if (h > 0) fr.style.height = h + 'px';
      } catch {}
    };
    setTimeout(_resize, 150);
    setTimeout(_resize, 400);
  }

  /* ── 분 → 시간분 표시 ── */
  function _qFmtMin(min) {
    if (!min || min <= 0) return '-';
    const h = Math.floor(min / 60), m = min % 60;
    return h > 0 ? (m > 0 ? `${h}시간 ${m}분` : `${h}시간`) : `${m}분`;
  }

  /* ── 슬롯 추가 ── */
  function _qAddSlot() {
    const lastEnd  = _qSlots.length ? _qSlots[_qSlots.length - 1].end : '';
    const lastType = _qSlots.length ? _qSlots[_qSlots.length - 1].type : 'general';
    _qSlots.push({
      id:       _nid2(),
      label:    '',
      start:    lastEnd || '09:00',
      end:      '',
      type:     lastType,
      rate:     0,
    });
    _qRender();
    setTimeout(() => {
      const ends = document.querySelectorAll('.qc-slot-end');
      if (ends.length) ends[ends.length - 1].focus();
    }, 80);
  }

  /* ── 슬롯 삭제 ── */
  function _qDelSlot(id) {
    _qSlots = _qSlots.filter(s => s.id !== id);
    _qRender();
  }

  /* ── 슬롯 유형 토글 (일반 ↔ 수업) ── */
  function _qToggleType(id) {
    const slot = _qSlots.find(s => s.id === id); if (!slot) return;
    slot.type = slot.type === 'class' ? 'general' : 'class';
    // 배지만 갱신
    const badge = document.getElementById(`qctype-${id}`);
    if (badge) {
      badge.className = `qc-type-badge ${slot.type}`;
      badge.textContent = slot.type === 'class' ? '📚 수업' : '🏢 일반';
    }
    const card = document.getElementById(`qcs-${id}`);
    if (card) { card.className = `qc-slot type-${slot.type}`; }
    _qRefreshSlot(id);
  }

  /* ── 슬롯 필드 업데이트 ── */
  function _qUpdate(id, field, value) {
    const slot = _qSlots.find(s => s.id === id); if (!slot) return;
    slot[field] = field === 'rate' ? (Number(value) || 0) : value;
    _qRefreshSlot(id);
    _qUpdateResultBar();
  }

  /* ── 슬롯 결과 미니패널 + 경과시간 뱃지 새로고침 ── */
  function _qRefreshSlot(id) {
    const slot = _qSlots.find(s => s.id === id); if (!slot) return;
    const r    = _qCalcSlot(slot);

    // 경과시간 뱃지
    const durEl = document.getElementById(`qcdur-${id}`);
    if (durEl) {
      if (slot.start && slot.end) {
        const [sh, sm] = slot.start.split(':').map(Number);
        const [eh, em] = slot.end.split(':').map(Number);
        let raw = (eh*60+em)-(sh*60+sm); if(raw<=0) raw+=1440;
        const h = Math.floor(raw/60), m = raw%60;
        durEl.querySelector('.qc-dur-time').textContent = h>0?(m>0?`${h}h${m}m`:`${h}h`):(m>0?`${m}m`:'-');
        durEl.querySelector('.qc-dur-min').textContent  = '근무시간';
      } else {
        durEl.querySelector('.qc-dur-time').textContent = '-';
        durEl.querySelector('.qc-dur-min').textContent  = '';
      }
    }

    // 결과 미니패널
    const resEl = document.getElementById(`qcres-${id}`);
    if (!resEl) return;
    if (!r) {
      resEl.innerHTML = `<span style="font-size:11px;color:var(--tx3)">⏳ 시작·종료 시간을 입력하세요</span>`;
      return;
    }
    const typeColor = r.type === 'class' ? 'var(--a)' : 'var(--green)';
    const typeTxt   = r.type === 'class' ? '수업' : '일반';
    resEl.innerHTML = `
      <div class="qc-sr-dot" style="background:${typeColor}"></div>
      <span class="qc-sr-lbl">${typeTxt}</span>
      <span class="qc-sr-sep"></span>
      <span class="qc-sr-lbl">⏱</span>
      <span class="qc-sr-val">${_qFmtMin(r.netMin)}</span>
      <span class="qc-sr-sep"></span>
      <span class="qc-sr-lbl">시급</span>
      <span class="qc-sr-val">${_fmt(r.rate)}원</span>
      <span class="qc-sr-total ${r.type}">${_fmt(r.pay)}원</span>`;
  }

  /* ── 결과 바만 갱신 ── */
  function _qUpdateResultBar() {
    const r = _qCompute();
    const bar = document.getElementById('qc-result-bar'); if (!bar) return;
    const totEl = bar.querySelector('.qc-result-total');
    const subEl = bar.querySelector('.qc-result-sub');
    if (!r || r.grandTotal === 0) {
      totEl.textContent = '— 원';
      subEl.textContent = '시간대를 입력하면 자동 계산됩니다';
      return;
    }
    totEl.textContent = _fmt(r.grandTotal) + '원';
    const parts = [];
    if (r.generalPay > 0) parts.push(`일반 ${_fmt(r.generalPay)}원`);
    if (r.classPay   > 0) parts.push(`수업 ${_fmt(r.classPay)}원`);
    subEl.textContent = `총 ${_qFmtMin(r.totalMin)}  ·  ${parts.join(' + ')}`;
  }

  /* ── 기본 설정 변경 ── */
  function _qBaseUpdate() {
    _qBase.name        = document.getElementById('qc-name')?.value?.trim()    || '';
    _qBase.date        = document.getElementById('qc-date')?.value             || _qBase.date;
    _qBase.generalRate = Number(document.getElementById('qc-grate')?.value)   || 0;
    _qBase.classRate   = Number(document.getElementById('qc-crate')?.value)   || 0;

    // 시급 카드 표시 갱신
    const mw = StaffDB.getMinWage();
    const gEl = document.getElementById('qc-grate-disp');
    const cEl = document.getElementById('qc-crate-disp');
    if (gEl) gEl.textContent = _fmt(_qBase.generalRate || mw) + '원';
    if (cEl) cEl.textContent = _fmt(_qBase.classRate   || mw) + '원';

    // 모든 슬롯 결과 갱신
    _qSlots.forEach(s => _qRefreshSlot(s.id));
    _qUpdateResultBar();
  }

  /* ── 초기화 ── */
  function _qReset() {
    if (_qSlots.length > 0 && !confirm('모든 시간대를 초기화하시겠습니까?')) return;
    _qSlots  = [];
    _qResult = null;
    _qBase   = { name:'', date: new Date().toISOString().slice(0,10), generalRate:0, classRate:0 };
    _qRender();
  }

  /* ── 전체 재렌더 (슬롯 추가/삭제 시) ── */
  function _qRender() {
    if (_st.subTab === 'quickcalc') _renderQuickCalc();
  }

  /* ── 메인 렌더 ── */
  function _renderQuickCalc() {
    const cnt = document.getElementById('sf-cnt'); if (!cnt) return;
    const mw  = StaffDB.getMinWage();
    const r   = _qCompute();

    cnt.innerHTML = `
      <div class="qc-wrap">

        <!-- ① 합계 결과 바 (상단 고정) -->
        <div class="qc-result-bar" id="qc-result-bar">
          <div class="qc-result-bar-l">
            <span class="qc-result-label">⚡ 즉시 정산 · 세전 합계</span>
            <span class="qc-result-total">${r && r.grandTotal>0 ? _fmt(r.grandTotal)+'원' : '— 원'}</span>
            <span class="qc-result-sub">${r && r.grandTotal>0
              ? `총 ${_qFmtMin(r.totalMin)}  ·  ${[r.generalPay>0?`일반 ${_fmt(r.generalPay)}원`:'', r.classPay>0?`수업 ${_fmt(r.classPay)}원`:''].filter(Boolean).join(' + ')}`
              : '시간대를 입력하면 자동 계산됩니다'}</span>
          </div>
          <div class="qc-result-bar-r">
            <button class="qc-icon-btn" title="복사"   onclick="StaffApp._qCopy()"  >📋</button>
            <button class="qc-icon-btn" title="공유"   onclick="StaffApp._qShare()" >📤</button>
            <button class="qc-icon-btn" title="인쇄"   onclick="StaffApp._qPrint()" >🖨️</button>
          </div>
        </div>

        <!-- ② 스크롤 본문 -->
        <div class="qc-scroll">

          <!-- 기본 설정 -->
          <div class="qc-top">
            <div class="qc-top-title">⚙️ 기본 설정</div>

            <!-- 시급 카드 2개 -->
            <div class="qc-rate-cards">
              <div class="qc-rate-card general">
                <div class="qc-rate-card-ico">🏢</div>
                <div class="qc-rate-card-lbl">일반 업무 시급</div>
                <div class="qc-rate-val general" id="qc-grate-disp">${_fmt(_qBase.generalRate||mw)}원</div>
              </div>
              <div class="qc-rate-card class">
                <div class="qc-rate-card-ico">📚</div>
                <div class="qc-rate-card-lbl">수업 담당 시급</div>
                <div class="qc-rate-val class" id="qc-crate-disp">${_fmt(_qBase.classRate||mw)}원</div>
              </div>
            </div>

            <div class="qc-info-row">
              <div>
                <span class="qc-label">🏢 일반 시급 (원)</span>
                <input class="qc-inp" id="qc-grate" type="number" min="0"
                  placeholder="${mw} (최저시급)"
                  value="${_qBase.generalRate||''}"
                  oninput="StaffApp._qBaseUpdate()">
              </div>
              <div>
                <span class="qc-label">📚 수업 시급 (원)</span>
                <input class="qc-inp" id="qc-crate" type="number" min="0"
                  placeholder="${mw} (최저시급)"
                  value="${_qBase.classRate||''}"
                  oninput="StaffApp._qBaseUpdate()">
              </div>
              <div>
                <span class="qc-label">이름 (선택)</span>
                <input class="qc-inp" id="qc-name" placeholder="예) 홍길동"
                  value="${_e(_qBase.name)}"
                  oninput="StaffApp._qBaseUpdate()">
              </div>
              <div>
                <span class="qc-label">날짜</span>
                <input class="qc-inp" id="qc-date" type="date"
                  value="${_qBase.date}"
                  oninput="StaffApp._qBaseUpdate()">
              </div>
            </div>
            <div class="qc-mw-hint" style="margin-top:6px">
              ⚖️ ${new Date().getFullYear()}년 최저시급 <strong>${_fmt(mw)}원</strong> — 시급 빈칸 시 자동 적용
            </div>
          </div>

          <!-- 슬롯 목록 -->
          <div class="qc-slots-hdr">
            <span class="qc-slots-title">⏰ 시간대별 근무</span>
            <button class="qc-add-slot" onclick="StaffApp._qAddSlot()">＋ 시간대 추가</button>
          </div>

          <div id="qc-slots-list">
            ${_qSlots.length === 0
              ? `<div class="qc-empty-slots">
                  <div class="qc-empty-icon">⏱</div>
                  <div class="qc-empty-txt">
                    아직 시간대가 없습니다<br>
                    <strong>＋ 시간대 추가</strong>로 근무 시간을 입력하세요<br>
                    <small style="font-size:11px;opacity:.7">
                      일반·수업 업무를 자유롭게 조합하고<br>
                      시간대별 다른 시급을 적용할 수 있습니다
                    </small>
                  </div>
                </div>`
              : _qSlots.map((s, i) => _qSlotHTML(s, i)).join('')}
          </div>

          ${_qSlots.length > 0 ? `
            <button class="qc-add-slot"
              style="width:100%;justify-content:center;padding:11px;border-radius:12px;font-size:13px;margin-bottom:14px"
              onclick="StaffApp._qAddSlot()">＋ 시간대 추가</button>` : ''}

          <!-- 초기화 -->
          ${_qSlots.length > 0 ? `
            <button onclick="StaffApp._qReset()"
              style="width:100%;padding:10px;border-radius:10px;background:var(--card2);border:1px solid var(--bdr2);color:var(--tx3);font-size:12px;font-weight:700;cursor:pointer;font-family:var(--font);margin-bottom:14px">
              🗑 전체 초기화
            </button>` : ''}

          <!-- 결과 상세 카드 -->
          ${r && r.grandTotal > 0 ? _qDetailCardHTML(r) : ''}

        </div>
      </div>`;
  }

  /* ── 슬롯 카드 HTML ── */
  function _qSlotHTML(slot, idx) {
    const mw          = StaffDB.getMinWage();
    const baseByType  = slot.type === 'class'
      ? (Number(_qBase.classRate)   || mw)
      : (Number(_qBase.generalRate) || mw);
    const appliedRate = Number(slot.rate) > 0 ? Number(slot.rate) : baseByType;
    const r           = _qCalcSlot(slot);

    // 경과 시간
    let durTime = '-', durSub = '';
    if (slot.start && slot.end) {
      const [sh, sm] = slot.start.split(':').map(Number);
      const [eh, em] = slot.end.split(':').map(Number);
      let raw = (eh*60+em)-(sh*60+sm); if(raw<=0) raw+=1440;
      const h = Math.floor(raw/60), m = raw%60;
      durTime = h>0?(m>0?`${h}h${m}m`:`${h}h`):(m>0?`${m}m`:'-');
      durSub  = '근무시간';
    }

    const typeLabel = slot.type === 'class' ? '📚 수업' : '🏢 일반';
    const typeColor = slot.type === 'class' ? 'var(--a)' : 'var(--green)';

    return `<div class="qc-slot type-${slot.type}" id="qcs-${slot.id}">
      <!-- 헤더 -->
      <div class="qc-slot-hdr">
        <button class="qc-type-badge ${slot.type}" id="qctype-${slot.id}"
          onclick="StaffApp._qToggleType('${slot.id}')" title="탭하여 유형 변경">
          ${typeLabel}
        </button>
        <input class="qc-slot-name-inp" value="${_e(slot.label)}"
          placeholder="메모 (예: 오전 수업, 행정 업무...)"
          oninput="StaffApp._qUpdate('${slot.id}','label',this.value)">
        <button class="qc-slot-del" onclick="StaffApp._qDelSlot('${slot.id}')">✕</button>
      </div>

      <!-- 시간 입력 -->
      <div class="qc-time-row">
        <div>
          <span class="qc-label">출근</span>
          <input class="qc-inp qc-slot-start" type="time" value="${slot.start}"
            oninput="StaffApp._qUpdate('${slot.id}','start',this.value)">
        </div>
        <div>
          <span class="qc-label">퇴근</span>
          <input class="qc-inp qc-slot-end" type="time" value="${slot.end}"
            oninput="StaffApp._qUpdate('${slot.id}','end',this.value)">
        </div>
        <div class="qc-dur-badge" id="qcdur-${slot.id}">
          <div class="qc-dur-time">${durTime}</div>
          <div class="qc-dur-min">${durSub}</div>
        </div>
      </div>

      <!-- 개별 시급 -->
      <div style="margin-bottom:8px">
        <span class="qc-label">개별 시급 (0 = ${_fmt(baseByType)}원 자동)</span>
        <input class="qc-inp" type="number" min="0"
          placeholder="${baseByType}"
          value="${slot.rate||''}"
          oninput="StaffApp._qUpdate('${slot.id}','rate',this.value)">
      </div>

      <!-- 슬롯 결과 미니 -->
      <div class="qc-slot-result" id="qcres-${slot.id}">
        ${r
          ? `<div class="qc-sr-dot" style="background:${typeColor}"></div>
             <span class="qc-sr-lbl">${slot.type==='class'?'수업':'일반'}</span>
             <span class="qc-sr-sep"></span>
             <span class="qc-sr-lbl">⏱</span>
             <span class="qc-sr-val">${_qFmtMin(r.netMin)}</span>
             <span class="qc-sr-sep"></span>
             <span class="qc-sr-lbl">시급</span>
             <span class="qc-sr-val">${_fmt(r.rate)}원</span>
             ${r.breakMin>0?`<span class="qc-sr-sep"></span><span class="qc-sr-lbl">휴게 -${r.breakMin}분</span>`:''}
             <span class="qc-sr-total ${slot.type}">${_fmt(r.pay)}원</span>`
          : `<span style="font-size:11px;color:var(--tx3)">⏳ 시작·종료 시간을 입력하세요</span>`}
      </div>
    </div>`;
  }

  /* ── 결과 상세 카드 ── */
  function _qDetailCardHTML(r) {
    const acad   = StaffDB.getAcad();
    const name   = r.name || '(이름 없음)';
    const dateKo = r.date
      ? new Date(r.date).toLocaleDateString('ko-KR', {year:'numeric',month:'long',day:'numeric',weekday:'short'})
      : '';

    const rows = r.slotResults.map(({ slot, result: sr, index }) => {
      if (!sr) return '';
      const isClass = sr.type === 'class';
      return `<div class="qc-dc-row">
        <span class="qc-dc-typebadge ${sr.type}">${isClass?'📚 수업':'🏢 일반'}</span>
        <div class="qc-dc-info">
          <div class="qc-dc-time">${_e(slot.start)} ~ ${_e(slot.end)}${slot.label?' · '+_e(slot.label):''}</div>
          <div class="qc-dc-meta">
            <span>⏱ ${_qFmtMin(sr.netMin)}</span>
            <span>시급 ${_fmt(sr.rate)}원</span>

          </div>
        </div>
        <div class="qc-dc-pay" style="color:${isClass?'var(--a)':'var(--green)'}">${_fmt(sr.pay)}원</div>
      </div>`;
    }).join('');

    // 요약 행 (일반/수업 분리)
    const hasGeneral = r.generalPay > 0;
    const hasClass   = r.classPay   > 0;
    const summaryHTML = `
      <div class="qc-summary-row">
        ${hasGeneral ? `<div class="qc-summary-cell">
          <div class="qc-sc-lbl">🏢 일반 합계</div>
          <div class="qc-sc-val general">${_fmt(r.generalPay)}원</div>
        </div>` : ''}
        ${hasClass ? `<div class="qc-summary-cell">
          <div class="qc-sc-lbl">📚 수업 합계</div>
          <div class="qc-sc-val class">${_fmt(r.classPay)}원</div>
        </div>` : ''}
        <div class="qc-summary-cell">
          <div class="qc-sc-lbl">⏱ 총 근무</div>
          <div class="qc-sc-val">${_qFmtMin(r.totalMin)}</div>
        </div>
      </div>`;

    return `<div class="qc-detail-card">
      <div class="qc-dc-hdr">
        <div>
          <div class="qc-dc-name">📋 ${_e(name)} 정산 내역</div>
          <div class="qc-dc-date">${dateKo} · ${_e(acad.name)}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:10px;color:var(--tx3)">슬롯 ${r.slotResults.filter(x=>x.result).length}개</div>
        </div>
      </div>
      <div class="qc-dc-rows">${rows}</div>
      ${summaryHTML}
      <div class="qc-total-row">
        <span class="qc-total-l">⚡ 세전 합계</span>
        <span class="qc-total-v">${_fmt(r.grandTotal)}원</span>
      </div>
      <div class="qc-share-row">
        <button class="qc-sb copy"  onclick="StaffApp._qCopy()" >📋 복사</button>
        <button class="qc-sb share" onclick="StaffApp._qShare()">📤 공유</button>
        <button class="qc-sb print" onclick="StaffApp._qPrint()">🖨️ 인쇄</button>
        <button class="qc-sb save"  onclick="StaffApp._qOpenSave()">💾 저장</button>
      </div>
    </div>`;
  }

  /* ── 결과 텍스트 ── */
  function _qPayText() {
    const r = _qResult; if (!r || !r.grandTotal) return '';
    const acad = StaffDB.getAcad();
    const lines = [
      `══════════════════════`,
      `🏫 ${acad.name}`,
      `⚡ 즉시 시급 정산서`,
      `══════════════════════`,
      `👤 ${r.name || '(이름 없음)'}`,
      `📅 ${r.date ? new Date(r.date).toLocaleDateString('ko-KR') : ''}`,
      `─────────────────────`,
    ];
    r.slotResults.forEach(({ slot, result: sr, index }) => {
      if (!sr) return;
      const typeTxt = sr.type === 'class' ? '📚 수업' : '🏢 일반';
      lines.push(`[${index}] ${typeTxt}  ${slot.start}~${slot.end}${slot.label?' · '+slot.label:''}`);
      lines.push(`    ⏱ ${_qFmtMin(sr.netMin)} × ${_fmt(sr.rate)}원/h`);
      lines.push(`    → ${_fmt(sr.pay)}원`);
    });
    lines.push(`─────────────────────`);
    if (r.generalPay > 0) lines.push(`🏢 일반 합계: ${_fmt(r.generalPay)}원`);
    if (r.classPay   > 0) lines.push(`📚 수업 합계: ${_fmt(r.classPay)}원`);
    lines.push(`⚡ 세전 합계: ${_fmt(r.grandTotal)}원  (총 ${_qFmtMin(r.totalMin)})`);
    return lines.join('\n');
  }

  async function _qCopy() {
    const t = _qPayText();
    if (!t) { _toast('⚠️ 계산 결과가 없습니다'); return; }
    try { await navigator.clipboard.writeText(t); _toast('📋 복사됐습니다', 'success'); }
    catch { _toast('⚠️ 복사 실패'); }
  }

  async function _qShare() {
    const r = _qResult; if (!r || !r.grandTotal) { _toast('⚠️ 계산 결과가 없습니다'); return; }
    const t = _qPayText();
    const sd = { title: `${r.name||'즉시계산'} 정산서`, text: t };
    if (navigator.share && navigator.canShare?.(sd)) {
      try { await navigator.share(sd); _toast('📤 공유 완료', 'success'); return; }
      catch(e) { if (e.name === 'AbortError') return; }
    }
    _qCopy();
  }

  function _qPrint() {
    const r = _qResult; if (!r || !r.grandTotal) { _toast('⚠️ 계산 결과가 없습니다'); return; }
    const acad    = StaffDB.getAcad();
    const name    = r.name || '(이름 없음)';
    const dateStr = r.date ? new Date(r.date).toLocaleDateString('ko-KR') : '';

    const tRows = r.slotResults.map(({ slot, result: sr, index }) => {
      if (!sr) return '';
      const typeTxt = sr.type === 'class' ? '수업' : '일반';
      return `<tr>
        <td>[${index}] ${typeTxt}${slot.label?' · '+_e(slot.label):''}</td>
        <td style="text-align:center">${_e(slot.start)}~${_e(slot.end)}</td>
        <td style="text-align:center">${_qFmtMin(sr.netMin)}</td>
        <td style="text-align:right">${_fmt(sr.rate)}원</td>
        <td style="text-align:right">${_fmt(sr.pay)}원</td>
      </tr>`;
    }).join('');

    const html = `
      <div class="sfp-hdr">
        <div>
          <div class="sfp-org-name">${_e(acad.name)}</div>
          <div class="sfp-title">즉시 시급 정산서</div>
        </div>
        <div class="sfp-date">발행: ${new Date().toLocaleDateString('ko-KR')}</div>
      </div>
      <hr class="sfp-div">
      <table style="margin-bottom:10px">
        <tr><th>성&nbsp;명</th><td>${_e(name)}</td><th>날짜</th><td>${dateStr}</td></tr>
        <tr><th>총 근무</th><td>${_qFmtMin(r.totalMin)}</td>
            <th>일반 / 수업</th>
            <td>${r.generalPay>0?`일반 ${_fmt(r.generalPay)}원`:'-'} / ${r.classPay>0?`수업 ${_fmt(r.classPay)}원`:'-'}</td>
        </tr>
      </table>
      <table>
        <thead><tr><th>항목</th><th style="text-align:center">시간대</th><th style="text-align:center">근무시간</th><th style="text-align:right">시급</th><th style="text-align:right">금액</th></tr></thead>
        <tbody>${tRows}</tbody>
        <tfoot><tr class="sfp-tot">
          <td colspan="4"><strong>세전 합계 (총 ${_qFmtMin(r.totalMin)})</strong></td>
          <td style="text-align:right"><strong>${_fmt(r.grandTotal)}원</strong></td>
        </tr></tfoot>
      </table>
      <div class="sfp-sign">
        <div class="sfp-sign-box"><div>확&nbsp;&nbsp;인</div><div class="sfp-sign-line"></div><div>${_e(name)}</div></div>
        <div class="sfp-sign-box"><div>원&nbsp;&nbsp;장</div><div class="sfp-sign-line"></div><div>${_e(acad.name)}</div></div>
      </div>
      <div class="sfp-footer">본 정산서는 ${_e(acad.name)}에서 발행되었습니다.</div>`;
    _printInNewWindow(html);
  }

  /* ── 직원으로 저장 ── */
  function _qOpenSave() {
    const r = _qResult; if (!r || !r.grandTotal) { _toast('⚠️ 계산 결과가 없습니다'); return; }
    const staff = StaffDB.getActive();
    const sh    = document.getElementById('sf-qsave-sh');
    sh.innerHTML = `
      <div class="sh-handle"></div>
      <div class="sh-title">💾 직원 근무로 저장</div>
      <div style="padding:12px;flex:1;overflow-y:auto">
        <p style="font-size:13px;color:var(--tx2);margin:0 0 12px">
          정산 내역을 직원의 <strong>${r.date}</strong> 근무 기록으로 저장합니다.
        </p>
        <span class="sf-fl">저장할 직원</span>
        <select class="sf-fi" id="qsave-sid" style="margin-bottom:10px">
          <option value="">— 직원 선택 —</option>
          ${staff.map(s=>`<option value="${s.id}">${_e(s.name)} (${s.employType==='parttime'?'알바':'정직원'})</option>`).join('')}
        </select>
        <div style="background:var(--surf2);border-radius:8px;padding:8px 10px;font-size:12px;color:var(--tx3)">
          ${r.slotResults.filter(x=>x.result).map(({slot,result:sr,index})=>
            `<div>• [${index}] ${sr.type==='class'?'📚수업':'🏢일반'} ${_e(slot.start)}~${_e(slot.end)} → ${_fmt(sr.pay)}원</div>`
          ).join('')}
          <div style="margin-top:4px;font-weight:700;color:var(--a)">합계: ${_fmt(r.grandTotal)}원</div>
        </div>
      </div>
      <div class="sh-acts">
        <button class="btn-x"  onclick="StaffApp._closeQSave()">취소</button>
        <button class="btn-ok" onclick="StaffApp._doQSave()">저장</button>
      </div>`;
    document.getElementById('sf-qsave-ov')?.classList.remove('hidden');
  }

  function _closeQSave() { document.getElementById('sf-qsave-ov')?.classList.add('hidden'); }

  async function _doQSave() {
    const sid = document.getElementById('qsave-sid')?.value;
    if (!sid) { _toast('⚠️ 직원을 선택해주세요'); return; }
    const r = _qResult; if (!r) return;
    for (const { slot, result: sr } of r.slotResults) {
      if (!sr) continue;
      await StaffDB.addWorkEntry(sid, r.date, {
        type:      sr.type,
        start:     slot.start,
        end:       slot.end,
        hours:     sr.netMin / 60,
        baseHours: sr.netMin / 60,
        appliedRate: sr.rate,
        note:      slot.label || `즉시계산(${sr.type==='class'?'수업':'일반'})`,
      });
    }
    _closeQSave();
    _toast('✅ 직원 근무로 저장 완료', 'success');
  }

  /* ══ 유틸 ══ */
  const _fmtHrs = h => { const n = Math.round(Number(h || 0) * 100) / 100; return n % 1 === 0 ? String(n) : String(n); };
  const _fmt    = n => Number(n).toLocaleString('ko-KR');
  const _e      = v => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  function _toast(msg, type) {
    const el = document.getElementById('toast'); if (!el) return;
    el.textContent = msg; el.className = type === 'success' ? 'success' : '';
    el.classList.remove('hidden'); clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.add('hidden'), 3000);
  }

  /* ── 시작 화면 설정 ── */
  function _openHomeTabSetting() {
    const sh      = document.getElementById('sf-hometab-sh');
    const current = _loadHomeTab();
    sh.innerHTML = `
      <div class="sh-handle"></div>
      <div class="sh-title">📌 시작 화면 설정</div>
      <div style="padding:10px 4px 8px;flex:1;overflow-y:auto">
        <p style="font-size:12px;color:var(--tx3);margin:0 0 14px;padding:0 4px">
          직원 메뉴를 열 때 <strong>처음 표시될 화면</strong>을 선택하세요.<br>
          선택한 탭에 <span style="color:var(--a)">●</span> 표시가 붙습니다.
        </p>
        <div id="sf-ht-list" style="display:flex;flex-direction:column;gap:8px">
          ${Object.entries(TAB_META).map(([key, meta]) => `
            <div class="sf-ht-item ${current===key?'active':''}" onclick="StaffApp._selectHomeTab('${key}')">
              <div class="sf-ht-ico">${meta.icon}</div>
              <div class="sf-ht-info">
                <div class="sf-ht-name">${meta.label}</div>
                <div class="sf-ht-desc">${meta.desc}</div>
              </div>
              <div class="sf-ht-radio">${current===key?'<div class="sf-ht-radio-dot"></div>':''}</div>
            </div>`).join('')}
        </div>
      </div>
      <div class="sh-acts">
        <button class="btn-x" onclick="StaffApp._closeHomeTabSetting()">닫기</button>
      </div>`;
    document.getElementById('sf-hometab-ov')?.classList.remove('hidden');
  }

  function _selectHomeTab(tab) {
    _saveHomeTab(tab);
    // UI 즉시 갱신
    document.querySelectorAll('.sf-ht-item').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.sf-ht-radio').forEach(el => el.innerHTML = '');
    const target = document.querySelectorAll('.sf-ht-item')[Object.keys(TAB_META).indexOf(tab)];
    if (target) {
      target.classList.add('active');
      target.querySelector('.sf-ht-radio').innerHTML = '<div class="sf-ht-radio-dot"></div>';
    }
    // 핀 도트 갱신
    const dot = document.getElementById('sf-pin-dot');
    if (dot) dot.style.display = tab === 'list' ? 'none' : 'block';
    // 탭 홈 핀 갱신
    document.querySelectorAll('.sf-home-dot').forEach(d => d.remove());
    const TABS = ['list','salary','all','quickcalc'];
    document.querySelectorAll('.sf-stab').forEach((b, i) => {
      if (TABS[i] === tab) {
        const dot2 = document.createElement('span');
        dot2.className = 'sf-home-dot';
        b.appendChild(dot2);
      }
    });
    _toast(`📌 "${TAB_META[tab].label}" 을 시작 화면으로 설정했습니다`, 'success');
  }

  function _closeHomeTabSetting() {
    document.getElementById('sf-hometab-ov')?.classList.add('hidden');
  }

  /* ══ 퍼블릭 ══ */
  return {
    init, render, switchTab,
    openAdd, openEdit, closeEdit, saveStaff, deleteStaff, _toggleEtype,
    openCal, closeCal, _calPrev, _calNext, _calToSalary,
    _calCellClick, _entryClick, _confirmCopy, _cancelCopy, _applyTemplModal,
    _toggleSelectMode, _deleteSelected, _cancelSelect,
    _undoBatch,
    openBatch, closeBatch, _toggleDow, _batchHrs, _batchRateHint, _doBatch,
    _closeOverlap, _confirmOverlap,
    openWork, closeWork, _wtype, _chrs, _manualHrs, _addEntry, _delEntry,
    openTemplAdd, closeTemplAdd, _taWtype, _taHrs, _addTemplEntry, _templDel,
    _onSel, _calcAndRender, _saveAcad,
    _onAllSel, _calcAll, _renderMonthly, _renderAnnual, _annualBarChart, _downloadExcel,
    _copy, _pdf, _share,
    /* 시작화면 설정 */
    _openHomeTabSetting, _selectHomeTab, _closeHomeTabSetting,
    /* ⚡ 즉시 계산기 */
    _renderQuickCalc,
    _qAddSlot, _qDelSlot, _qUpdate, _qToggleType, _qRefreshSlot,
    _qBaseUpdate, _qReset,
    _qCopy, _qShare, _qPrint,
    _qOpenSave, _closeQSave, _doQSave,
  };
})();
