/**
 * grade-app.js — v4.1
 *
 * 변경사항
 * ─────────────────────────────────────
 * · 저장 버그 수정 (saving Set 제거, 단순 async/await)
 * · 액션 컬럼 제거 → 우클릭 컨텍스트 메뉴 (저장/초기화)
 * · 일괄저장 → "저장" 버튼으로 통합 (모든 학생 한번에)
 * · 단어순/리딩순 버튼 제거 → 헤더 클릭 정렬 (학생/단어성취율/리딩성취율)
 * · Teacher's Comment 2.5배 확장
 * · 학생 컬럼 정렬 추가, 반/교재 변경 시 정렬 초기화
 * · 평균 행: "반 평균"→"평균", 학생~통과 셀 병합, 실시간 계산
 * · Enter키만 다음 학생 이동, 방향키↑↓ = 입력값 증가/감소
 * · 리딩 헤더: 총문제 2행 병합, 서브컬럼 교재 선택 수 기준
 * · 카드모드: 3:4:3 비율, 여백 없이 fit, 정답수→점수 실시간 동작 수정
 * · 입력/비입력 셀 시각적 구분
 */
const GradeApp = (() => {
  /* ══ 상수 ══ */
  const ANIMALS_M = ['🐯','🦊','🐻','🐼','🦁','🐮','🐸','🐺'];
  const ANIMALS_F = ['🐱','🐰','🐹','🐨','🦋','🦄','🐧','🐔'];
  const CM_W = 340; // Comment column width px

  /* ══ 상태 ══ */
  let _st = {
    classId:   null,
    bookId:    null,
    studentId: null,
    viewMode:  'excel',
    data:      {},
    dirty:     new Set(),
    sortCol:   null,   // null | 'name' | 'wordAch' | 'rdAch'
    sortDesc:  true,
    slideIdx:  0,
    reportLayout: 1,
    reportGraph:  true,
    pageSize:        'A4',
    reportTitleSize: 18,
    reportBodySize:  12,
    dividerColor:    '#e2e8f0',
    dividerWidth:    1,
    fontFamily:      'Noto Sans KR', // 리포트 글자체
    rptBg:           '#ffffff',    // 리포트 배경색
    tableRound:      false,   // 표 모서리 라운드
    hdrFontSize:     12,      // 헤더 글자 크기
    graphAlign:      'left',
    logoSize:        80,
    touchStartX: 0,
  };

  /* ══ CSS ══ */
  function _css() {
    if (document.getElementById('gr-styles')) return;
    const s = document.createElement('style');
    s.id = 'gr-styles';
    s.textContent = `
#page-grade{display:none;flex-direction:column;height:100%;overflow:hidden;}
#page-grade.on{display:flex;}

/* toolbar */
.gr-toolbar{display:flex;align-items:center;gap:7px;padding:8px 12px;background:var(--surf);border-bottom:1.5px solid var(--bdr);flex-shrink:0;flex-wrap:wrap;}
.gr-sel{padding:7px 10px;border-radius:10px;background:var(--surf2);border:1.5px solid var(--bdr);font-size:13px;color:var(--tx);outline:none;cursor:pointer;font-family:var(--font);-webkit-appearance:none;transition:border-color .2s;flex:1;min-width:100px;}
.gr-sel:focus{border-color:var(--a);}
.gr-sel:disabled{opacity:.5;cursor:default;}
.gr-view-toggle{display:flex;border-radius:10px;overflow:hidden;border:1.5px solid var(--bdr2);flex-shrink:0;}
.gr-vbtn{padding:6px 12px;font-size:12px;font-weight:700;cursor:pointer;background:var(--card2);color:var(--tx3);border:none;font-family:var(--font);transition:all .15s;white-space:nowrap;}
.gr-vbtn.on{background:var(--a);color:#fff;}
.gr-save-all-btn{padding:7px 16px;border-radius:9px;background:var(--a);color:#fff;border:none;font-size:13px;font-weight:700;cursor:pointer;font-family:var(--font);white-space:nowrap;box-shadow:0 2px 8px var(--a40);transition:all .15s;flex-shrink:0;}
.gr-save-all-btn:active{transform:scale(.95);}
.gr-dirty-count{font-size:10px;opacity:.8;margin-left:2px;}

/* layout */
.gr-main{flex:1;display:flex;overflow:hidden;}
.gr-stu-panel{width:88px;flex-shrink:0;border-right:1.5px solid var(--bdr);overflow-y:auto;-webkit-overflow-scrolling:touch;background:var(--surf);}
.gr-stu-panel::-webkit-scrollbar{width:3px;}
.gr-stu-panel::-webkit-scrollbar-thumb{background:var(--bdr2);border-radius:2px;}
.gr-content{flex:1;overflow:auto;-webkit-overflow-scrolling:touch;}
.gr-content::-webkit-scrollbar{width:4px;height:4px;}
.gr-content::-webkit-scrollbar-thumb{background:var(--bdr2);border-radius:2px;}

/* student panel */
.gr-stu-item{padding:8px 4px;border-bottom:1px solid var(--bdr);cursor:pointer;transition:background .12s;text-align:center;position:relative;user-select:none;}
.gr-stu-item:hover{background:var(--a10);}
.gr-stu-item.on{background:var(--a20);border-left:3px solid var(--a);}
.gr-stu-item.dirty-item::after{content:'●';position:absolute;top:3px;right:4px;color:#f59e0b;font-size:10px;}
.gr-stu-emoji{font-size:18px;line-height:1;margin-bottom:2px;}
.gr-stu-name{font-size:11px;font-weight:700;color:var(--tx);word-break:keep-all;}
.gr-stu-nick{font-size:9px;color:var(--tx3);}
.gr-stu-dot{width:6px;height:6px;border-radius:50%;margin:2px auto 0;}

/* empty */
.gr-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;padding:40px;text-align:center;color:var(--tx3);font-size:14px;line-height:2.4;}
.gr-empty-ico{font-size:44px;margin-bottom:10px;}

/* ══ EXCEL MODE ══ */
.gr-sheet-wrap{width:100%;overflow-x:auto;}
.gr-sheet{border-collapse:collapse;font-size:12px;width:100%;}

/* fixed student col */
.gr-sheet .gs-fix{position:sticky;left:0;z-index:3;background:var(--surf);border:1px solid var(--bdr);padding:5px 8px;min-width:130px;width:130px;cursor:pointer;}
.gr-sheet thead .gs-fix{z-index:5;background:var(--surf2);}
.gr-sheet .gs-fix.sel,.gr-sheet .gs-fix:hover{background:var(--a10);}

/* header */
.gs-th{background:var(--surf2);border:1px solid var(--bdr);padding:5px 6px;font-size:12px;font-weight:800;color:var(--tx2);text-align:center;white-space:nowrap;text-rendering:optimizeLegibility;-webkit-font-smoothing:antialiased;}
.gs-th.sec-w{background:var(--a10);color:var(--a);font-size:11px;}
.gs-th.sec-r{background:rgba(139,92,246,.1);color:#8b5cf6;font-size:11px;}
.gs-th.sec-c{background:rgba(5,150,105,.08);color:var(--green);font-size:11px;}
.gs-th.sortable{cursor:pointer;user-select:none;}
.gs-th.sortable:hover{background:var(--a20);}
.gs-th.sort-on{color:var(--a);background:var(--a10);}

/* data cells */
.gs-td{border:1px solid var(--bdr);text-align:center;padding:0;vertical-align:middle;min-width:52px;}
/* 계산값 (읽기 전용) - 연한 배경으로 구분 */
.gs-td.ro{background:var(--surf2);}
.gs-td.ro .gs-val{padding:5px 6px;font-size:13px;font-weight:700;display:block;}
.gs-td.ro.pass-c .gs-val{color:#16a34a;}
.gs-td.ro.fail-c .gs-val{color:#f97316;}
.gs-td.ro.score-c .gs-val{color:var(--a);}
.gs-td.ro.achv-c .gs-val{color:#8b5cf6;font-weight:800;}
/* 입력 가능 셀 - 밝은 흰색/강조 배경 */
.gs-td.inp-cell{background:#fff;}
.dark .gs-td.inp-cell{background:rgba(255,255,255,.04);}

/* selected row highlight */
.gr-sheet tbody tr.sel-row .gs-td:not(.ro){background:rgba(99,102,241,.06)!important;}
.gr-sheet tbody tr.sel-row .gs-fix{background:var(--a20)!important;}

/* number input */
.gs-inp{width:100%;min-width:54px;padding:6px 4px;border:none;outline:none;background:transparent;font-size:13px;font-weight:700;color:var(--a);text-align:center;font-family:var(--font);-moz-appearance:textfield;cursor:text;}
.gs-inp::-webkit-outer-spin-button,.gs-inp::-webkit-inner-spin-button{-webkit-appearance:none;}
.gs-inp:focus{background:rgba(99,102,241,.08);border-radius:4px;}

/* comment */
.gs-cm-cell{width:22%;min-width:160px;}
.gs-cm-inp{width:100%;padding:5px 8px;border:none;outline:none;background:transparent;font-size:13px;color:var(--tx);font-family:var(--font);resize:none;height:52px;line-height:1.5;cursor:text;box-sizing:border-box;}
.gs-cm-inp:focus{background:rgba(5,150,105,.05);}

/* average row */
.gr-avg-row td{background:var(--surf2)!important;}
.gr-avg-row .gs-fix{color:var(--a);font-weight:800;font-size:12px;}

/* chart */
.gr-chart-wrap{padding:10px 12px 6px;border-top:1.5px solid var(--bdr);background:var(--surf2);flex-shrink:0;}
.gr-chart-title{font-size:11px;font-weight:800;color:var(--tx3);letter-spacing:.5px;margin-bottom:6px;}
.gr-chart-canvas{width:100%;height:72px;display:block;}

/* context menu */
.gr-ctx-menu{position:fixed;z-index:999;background:var(--card);border:1.5px solid var(--bdr);border-radius:10px;box-shadow:var(--sh2);padding:4px;min-width:120px;animation:cardIn .12s ease;}
.gr-ctx-item{padding:8px 14px;font-size:13px;font-weight:700;cursor:pointer;border-radius:7px;transition:background .12s;}
.gr-ctx-item:hover{background:var(--a10);color:var(--a);}
.gr-ctx-item.red:hover{background:rgba(220,38,38,.08);color:#ef4444;}
.gr-ctx-divider{height:1px;background:var(--bdr);margin:3px 0;}

/* ══ CARD MODE ══ */
.gr-carousel-wrap{flex:1;display:flex;flex-direction:column;overflow:hidden;}
.gr-carousel{flex:1;display:flex;overflow:hidden;position:relative;}
/* 3:4:3 ratio */
.gr-slide{flex-shrink:0;overflow-y:auto;-webkit-overflow-scrolling:touch;transition:all .3s cubic-bezier(.4,0,.2,1);}
.gr-slide.prev{flex:3;opacity:.5;filter:brightness(.85);cursor:pointer;border-right:1px solid var(--bdr);}
.gr-slide.curr{flex:4;position:relative;z-index:2;}
.gr-slide.next{flex:3;opacity:.5;filter:brightness(.85);cursor:pointer;border-left:1px solid var(--bdr);}
.gr-slide.solo{flex:1;}
@media(max-width:600px){
  .gr-slide.prev{flex:0;width:36px;overflow:hidden;}
  .gr-slide.next{flex:0;width:36px;overflow:hidden;}
  .gr-slide.curr{flex:1;}
}
.gr-carousel-nav{display:flex;justify-content:center;gap:5px;padding:6px;flex-shrink:0;background:var(--surf2);border-top:1px solid var(--bdr);}
.gr-carousel-dot{width:6px;height:6px;border-radius:50%;background:var(--bdr2);cursor:pointer;transition:all .2s;}
.gr-carousel-dot.on{background:var(--a);width:18px;border-radius:3px;}

/* card body */
.gr-card-body{padding:10px;}
.gr-card-hero{display:flex;align-items:center;gap:10px;padding:10px 12px;background:linear-gradient(135deg,var(--a10),rgba(5,150,105,.06));border-radius:12px;margin-bottom:10px;border:1px solid var(--a40);}
.gr-hero-emo{font-size:24px;flex-shrink:0;}
.gr-hero-nm{font-size:14px;font-weight:900;color:var(--tx);}
.gr-hero-sub{font-size:10px;color:var(--tx3);margin-top:1px;}
.gr-hero-score{margin-left:auto;text-align:right;}
.gr-hero-pct{font-size:20px;font-weight:900;line-height:1;}
.gr-hero-lbl{font-size:9px;color:var(--tx3);}

/* card section */
.gr-csec{margin-bottom:10px;}
.gr-csec-head{display:flex;align-items:center;justify-content:space-between;padding:7px 10px;background:var(--surf2);border-radius:9px 9px 0 0;border:1px solid var(--bdr);border-bottom:none;}
.gr-csec-title{font-size:12px;font-weight:800;color:var(--tx);display:flex;align-items:center;gap:4px;}
.gr-csec-badge{padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700;background:var(--a10);color:var(--a);border:1px solid var(--a40);}
.gr-csec-badge.rd{background:rgba(139,92,246,.1);color:#8b5cf6;border-color:rgba(139,92,246,.3);}
.gr-card-grid{border:1px solid var(--bdr);border-radius:0 0 9px 9px;overflow:hidden;}
.gr-crow{display:flex;border-bottom:1px solid var(--bdr);}
.gr-crow:last-child{border-bottom:none;}
.gr-clbl{padding:8px 10px;font-size:11px;font-weight:700;color:var(--tx2);background:var(--surf2);border-right:1px solid var(--bdr);min-width:80px;flex-shrink:0;display:flex;align-items:center;}
.gr-cval{padding:5px 8px;flex:1;display:flex;align-items:center;gap:5px;}
/* 카드 입력 */
.gr-cinp{flex:1;padding:6px 8px;border-radius:7px;background:var(--surf2);border:1.5px solid var(--bdr);font-size:13px;font-weight:700;color:var(--a);text-align:center;outline:none;font-family:var(--font);-moz-appearance:textfield;transition:border-color .2s;}
.gr-cinp::-webkit-outer-spin-button,.gr-cinp::-webkit-inner-spin-button{-webkit-appearance:none;}
.gr-cinp:focus{border-color:var(--a);background:var(--a10);}
/* 카드 계산값 */
.gr-cdisp{min-width:48px;text-align:center;padding:6px 6px;font-size:13px;font-weight:800;border-radius:7px;background:var(--surf2);border:1px solid var(--bdr);color:var(--tx3);}
.gr-cdisp.pass{color:#16a34a;background:rgba(22,163,74,.08);border-color:rgba(22,163,74,.2);}
.gr-cdisp.fail{color:#f97316;background:rgba(249,115,22,.08);border-color:rgba(249,115,22,.2);}
.gr-cdisp.score{color:var(--a);background:var(--a10);border-color:var(--a40);}
.gr-cdisp.achv{color:#8b5cf6;background:rgba(139,92,246,.1);border-color:rgba(139,92,246,.25);}

/* card comment */
.gr-card-cmt{width:100%;box-sizing:border-box;padding:8px 10px;border:none;outline:none;background:transparent;font-size:12px;color:var(--tx);font-family:var(--font);resize:none;min-height:60px;line-height:1.8;}
.gr-card-cmt:focus{background:rgba(5,150,105,.04);}
.gr-card-save-row{display:flex;gap:7px;padding:8px;}
.gr-card-save-btn{flex:1;padding:10px;border:none;background:var(--a);color:#fff;font-size:12px;font-weight:800;cursor:pointer;font-family:var(--font);border-radius:9px;transition:all .15s;}
.gr-card-save-btn:active{opacity:.85;}

/* ══ REPORT ══ */
.gr-report-panel{padding:14px 14px 80px;}
.gr-rpt-cfg{background:var(--card);border:1px solid var(--bdr);border-radius:12px;padding:8px 12px;margin-bottom:4px;box-shadow:var(--sh);overflow-x:auto;}
.gr-rpt-cfg-title{font-size:11px;font-weight:800;color:var(--tx3);letter-spacing:.5px;margin-bottom:8px;}
.gr-rpt-layouts{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;}
.gr-rpt-lbtn{width:40px;height:40px;border-radius:8px;border:2px solid var(--bdr2);background:var(--surf2);font-size:10px;font-weight:800;cursor:pointer;color:var(--tx3);display:flex;align-items:center;justify-content:center;transition:all .15s;font-family:var(--font);}
.gr-rpt-lbtn.on{border-color:var(--a);background:var(--a20);color:var(--a);}
.gr-rpt-toggle{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--tx2);cursor:pointer;}
.gr-rpt-toggle input{accent-color:var(--a);}
.gr-rpt-fab{display:flex;flex-direction:column;align-items:center;gap:2px;padding:8px 6px;border-radius:10px;border:none;background:var(--card);box-shadow:0 2px 10px rgba(0,0,0,.15);cursor:pointer;font-family:var(--font);transition:all .15s;width:52px;}
.gr-rpt-fab:hover{background:var(--a10);transform:translateX(-2px);}
.gr-rpt-fab:active{transform:scale(.93);}
.gr-rpt-fab-ico{font-size:18px;line-height:1;}
.gr-rpt-fab-lbl{font-size:9px;font-weight:700;color:var(--tx2);}
.gr-rpt-preview{background:var(--card);border:1px solid var(--bdr);border-radius:12px;overflow:auto;box-shadow:var(--sh);animation:cardIn .2s ease;margin-top:0;}
.rpt-wrap{padding:20px 24px;font-family:'${_st.fontFamily||"Noto Sans KR"}',sans-serif;font-size:13px;color:#111;background:#fff;}
.rpt-header{display:flex;align-items:center;gap:14px;margin-bottom:16px;}
.rpt-title{font-size:20px;font-weight:900;color:#111;flex:1;}
.rpt-divider{border:none;border-top:2px solid #e5e7eb;margin:10px 0;}
.rpt-info p{margin:4px 0;font-size:13px;}
.rpt-sec-title{font-size:14px;font-weight:800;color:#111;margin:14px 0 6px;}
.rpt-tbl{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:12px;}
.rpt-tbl th{background:#f1f5f9;padding:7px 10px;text-align:center;font-size:11px;font-weight:800;color:#475569;border:1px solid #e2e8f0;}
.rpt-tbl td{border:1px solid #e2e8f0;padding:7px 10px;text-align:center;font-size:13px;}
.rpt-tbl .rpt-pass{color:#16a34a;font-weight:700;}
.rpt-tbl .rpt-fail{color:#ea580c;font-weight:700;}
.rpt-tbl .rpt-achv{color:#8b5cf6;font-weight:800;}
.rpt-tbl .rpt-avg td{background:#f8fafc;font-weight:700;}
.rpt-comment-box{border:1.5px solid #e2e8f0;border-radius:8px;padding:12px 14px;min-height:60px;font-size:12px;color:#374151;line-height:1.8;background:#fafafa;}
.rpt-graph-wrap{margin:8px 0 12px;}
.rpt-acts{display:flex;gap:8px;flex-wrap:wrap;padding:10px 14px 14px;}
.rpt-btn{flex:1;min-width:60px;padding:10px 6px;border-radius:10px;border:none;font-size:12px;font-weight:700;cursor:pointer;font-family:var(--font);transition:all .15s;}
.rpt-btn.copy{background:var(--a10);color:var(--a);border:1px solid var(--a40);}
.rpt-btn.share{background:var(--a);color:#fff;box-shadow:0 3px 10px var(--a40);}
.rpt-btn.pdf{background:rgba(5,150,105,.1);color:var(--green);border:1px solid rgba(5,150,105,.3);}
.rpt-btn.cap{background:rgba(245,158,11,.1);color:#d97706;border:1px solid rgba(245,158,11,.3);}
.rpt-btn:active{transform:scale(.95);}

/* report modal */
.gr-rpt-sh-scroll{flex:1;overflow-y:auto;}
.gr-share-box{background:var(--surf2);border-radius:10px;padding:12px 14px;font-size:12px;line-height:1.9;color:var(--tx);white-space:pre-wrap;word-break:break-all;border:1px solid var(--bdr);max-height:260px;overflow-y:auto;font-family:var(--font);margin:8px 0;}
.gr-sacts{display:flex;gap:8px;}
.gr-sbtn{flex:1;padding:11px 8px;border-radius:10px;border:none;font-size:13px;font-weight:700;cursor:pointer;font-family:var(--font);transition:all .15s;}
.gr-sbtn.copy{background:var(--a10);color:var(--a);border:1px solid var(--a40);}
.gr-sbtn.share{background:var(--a);color:#fff;box-shadow:0 3px 10px var(--a40);}
.gr-sbtn:active{transform:scale(.96);}

@media print{body>*:not(#gr-pf){display:none!important;}#gr-pf{display:block!important;position:fixed;inset:0;z-index:9999;background:#fff;padding:24px;overflow:auto;}}
#gr-pf{display:none;}
`;
    document.head.appendChild(s);
  }

  /* ══ INIT ══ */
  async function init() {
    _css();
    if (typeof GradeDB === 'undefined') { console.warn('[GradeApp] GradeDB not loaded'); return; }
    await GradeDB.init();
    window.addEventListener('beforeunload', e => { if (_st.dirty.size > 0) { e.preventDefault(); e.returnValue = ''; } });
    document.addEventListener('click', _closeCtxMenu);
    console.log('[GradeApp] ✅ v4.1');
  }

  /* ══ RENDER ══ */
  function render() {
    const pg = document.getElementById('page-grade'); if (!pg) return;
    pg.innerHTML = _shell();
    _fillClass();
    if (_st.classId) _fillBooks();
    _renderStudents();
    _renderContent();
  }

  function _shell() {
    const hasData = _st.classId && _st.bookId;
    return `
      <div class="ph">
        <div class="phl">
          <div style="width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#f59e0b,#d97706);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;box-shadow:0 3px 10px rgba(245,158,11,.4)">📝</div>
          <div style="min-width:0">
            <div class="ph-title" onclick="GradeApp.render()" title="새로고침" style="cursor:pointer">성적 관리 <span class="admin-badge">🔑 관리자</span></div>
            <div class="ph-sub" id="gr-sub">반 · 교재를 선택하세요</div>
          </div>
        </div>
        <div class="phr">
          <button class="ibtn" id="gr-rpt-btn" title="전체 성적표" onclick="GradeApp.openReport()" style="display:none">📋</button>
        </div>
      </div>
      <div class="gr-toolbar">
        <select class="gr-sel" id="gr-csel" onchange="GradeApp._onCls(this.value)">
          <option value="">— 반 선택 —</option>
        </select>
        <select class="gr-sel" id="gr-bsel" onchange="GradeApp._onBk(this.value)" disabled>
          <option value="">— 교재 선택 —</option>
        </select>
        <div class="gr-view-toggle">
          <button class="gr-vbtn ${_st.viewMode==='excel'?'on':''}"  onclick="GradeApp._setView('excel')">🔲 엑셀</button>
          <button class="gr-vbtn ${_st.viewMode==='card'?'on':''}"   onclick="GradeApp._setView('card')">👤 카드</button>
          <button class="gr-vbtn ${_st.viewMode==='report'?'on':''}" onclick="GradeApp._setView('report')">📄 리포트</button>
        </div>
        <!-- 헤더 글자 크기 히든 설정 (엑셀 모드 전용) -->
        ${_st.viewMode==='excel' && hasData ? `
        <div id="gr-hdr-cfg" style="display:none;position:absolute;right:0;top:36px;background:var(--card);border:1px solid var(--bdr2);border-radius:10px;padding:8px 12px;box-shadow:var(--sh);z-index:30;white-space:nowrap">
          <div style="font-size:10px;font-weight:800;color:var(--tx3);margin-bottom:6px">헤더 글자 크기</div>
          <div style="display:flex;align-items:center;gap:6px">
            <input type="range" min="8" max="16" value="${_st.hdrFontSize||12}" step="1"
              oninput="GradeApp._setHdrFontSize(this.value)"
              style="width:80px;accent-color:var(--a)">
            <span id="gr-hdr-sz-lbl" style="font-size:11px;color:var(--tx2);min-width:26px">${_st.hdrFontSize||12}px</span>
          </div>
        </div>
        <button onclick="const p=document.getElementById('gr-hdr-cfg');p&&(p.style.display=p.style.display==='none'?'block':'none')"
          title="헤더 글자 크기 설정"
          style="font-size:11px;padding:3px 8px;border-radius:7px;border:1px solid var(--bdr2);background:var(--surf2);color:var(--tx3);cursor:pointer;font-weight:700">Aa</button>
        `:``}
        ${hasData ? `<button class="gr-save-all-btn" onclick="GradeApp.saveAll()">
          💾 저장<span class="gr-dirty-count" id="gr-dirty-cnt">${_st.dirty.size?`(${_st.dirty.size})`:''}</span>
        </button>` : ''}
        <button onclick="GradeApp._exportAllGrades()" style="padding:6px 11px;border-radius:9px;background:rgba(5,150,105,.1);border:1.5px solid rgba(5,150,105,.3);color:#059669;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap">📥 전체내보내기</button>
        <label style="padding:6px 11px;border-radius:9px;background:rgba(99,102,241,.1);border:1.5px solid rgba(99,102,241,.3);color:var(--a);font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap">📤 전체불러오기<input type="file" accept=".xlsx" style="display:none" onchange="GradeApp._importAllGrades(this.files[0]);this.value=''"></label>
      </div>
      <div class="gr-main">
        <div class="gr-stu-panel" id="gr-stu-panel"></div>
        <div class="gr-content" id="gr-content"></div>
      </div>
      ${_st.viewMode==='excel' && hasData ? `
        <div class="gr-chart-wrap" id="gr-chart-wrap">
          <div class="gr-chart-title">📊 성취율 현황 <span style="font-size:10px;font-weight:400;color:var(--tx3)">· 학생 클릭 시 하이라이트</span></div>
          <canvas class="gr-chart-canvas" id="gr-chart"></canvas>
        </div>` : ''}
      <!-- 리포트 우측 고정 버튼 (리포트 탭에서만) -->
      <div id="gr-rpt-fixed-btns" style="position:fixed;right:10px;top:50%;transform:translateY(-50%);display:none;flex-direction:column;gap:6px;z-index:999">
        <button class="gr-rpt-fab" id="gr-cfg-fab" onclick="GradeApp._toggleCfgPanel()" title="설정"><span class="gr-rpt-fab-ico">⚙️</span><span class="gr-rpt-fab-lbl" id="gr-cfg-fab-lbl">설정</span></button>
        <button class="gr-rpt-fab" onclick="GradeApp._shareReport()" title="공유"><span class="gr-rpt-fab-ico">📤</span><span class="gr-rpt-fab-lbl">공유</span></button>
        <button class="gr-rpt-fab" onclick="GradeApp._printReport()" title="PDF"><span class="gr-rpt-fab-ico">🖨️</span><span class="gr-rpt-fab-lbl">PDF</span></button>
        <button class="gr-rpt-fab" onclick="GradeApp._captureReport()" title="캡처"><span class="gr-rpt-fab-ico">📸</span><span class="gr-rpt-fab-lbl">캡처</span></button>
      </div>
      <!-- 성적표 모달 -->
      <div id="gr-rpt-ov" class="ov hidden" onclick="if(event.target.id==='gr-rpt-ov')GradeApp.closeReport()">
        <div class="sh" id="gr-rpt-sh" onclick="event.stopPropagation()" style="max-height:92vh;display:flex;flex-direction:column;"></div>
      </div>
      <!-- 컨텍스트 메뉴 -->
      <div id="gr-ctx" class="gr-ctx-menu" style="display:none"></div>
    `;
  }

  /* ── 셀렉트 ── */
  function _fillClass() {
    const sel = document.getElementById('gr-csel'); if (!sel) return;
    const cls = typeof DB !== 'undefined' ? DB.getActiveClasses() : [];
    sel.innerHTML = `<option value="">— 반 선택 —</option>` +
      cls.map(c => `<option value="${c.id}" ${_st.classId===c.id?'selected':''}>${_e(c.name)}</option>`).join('');
  }
  function _fillBooks() {
    const sel = document.getElementById('gr-bsel'); if (!sel) return;
    if (!_st.classId) { sel.innerHTML = `<option value="">— 교재 선택 —</option>`; sel.disabled = true; return; }
    const books = typeof BookLibDB !== 'undefined' ? BookLibDB.getBooksForClass(_st.classId) : [];
    sel.disabled = false;
    sel.innerHTML = `<option value="">— 교재 선택 —</option>` +
      books.map(b => `<option value="${b.id}" ${_st.bookId===b.id?'selected':''}>${_e(b.name)}</option>`).join('');
    if (!books.length) { sel.innerHTML = `<option value="">배정된 교재 없음</option>`; sel.disabled = true; }
  }

  /* ── 학생 패널 ── */
  function _renderStudents() {
    const panel = document.getElementById('gr-stu-panel'); if (!panel) return;
    const students = _getSorted();
    if (!students.length) { panel.innerHTML = ''; return; }
    panel.innerHTML = students.map((s, i) => {
      const rec  = _st.classId && _st.bookId ? GradeDB.getLatest(_st.classId, s.id, _st.bookId) : null;
      const achW = rec?.word?.totalQ > 0 ? Math.round(rec.word.pass / rec.word.totalQ * 100) : null;
      const dotClr = achW != null ? (achW >= 80 ? '#16a34a' : '#f97316') : 'var(--bdr2)';
      const isSel  = _st.viewMode === 'card' ? _st.slideIdx === i : _st.studentId === s.id;
      const isDirty= _st.dirty.has(s.id);
      return `<div class="gr-stu-item ${isSel?'on':''} ${isDirty?'dirty-item':''}"
                   onclick="GradeApp._onStu('${s.id}',${i})">
        <div class="gr-stu-emoji">${_emoji(s, achW)}</div>
        <div class="gr-stu-name">${_e(s.name)}</div>
        ${s.nickname?`<div class="gr-stu-nick">(${_e(s.nickname)})</div>`:''}
        <div class="gr-stu-dot" style="background:${dotClr};opacity:${achW!=null?1:.28}"></div>
      </div>`;
    }).join('');
  }

  function _emoji(s, achW) {
    const fem = ['자','연','지','수','은','민','서','현','유','아','나','하','소','예','혜','미','린','진'].some(c=>s.name.includes(c));
    const pool = fem ? ANIMALS_F : ANIMALS_M;
    return pool[(s.name.charCodeAt(0)||0) % pool.length];
  }

  /* ── 정렬된 학생 ── */
  function _getSorted() {
    const all = _getStudents();
    if (!_st.sortCol) return all;
    return [...all].sort((a, b) => {
      let va = 0, vb = 0;
      if (_st.sortCol === 'name') {
        va = a.name; vb = b.name;
        return _st.sortDesc ? vb.localeCompare(va,'ko') : va.localeCompare(vb,'ko');
      }
      const ra = GradeDB.getLatest(_st.classId, a.id, _st.bookId);
      const rb = GradeDB.getLatest(_st.classId, b.id, _st.bookId);
      if (_st.sortCol === 'wordAch') {
        va = ra?.word?.totalQ > 0 ? ra.word.pass / ra.word.totalQ : -1;
        vb = rb?.word?.totalQ > 0 ? rb.word.pass / rb.word.totalQ : -1;
      } else {
        const cfg = GradeDB.getReportConfig(_st.bookId);
        const revs = GradeDB.getActiveReviews(_st.bookId);
        va = _calcRdN(ra?.reading||{}, revs) ?? -1;
        vb = _calcRdN(rb?.reading||{}, revs) ?? -1;
      }
      return _st.sortDesc ? vb - va : va - vb;
    });
  }

  function _toggleSort(col) {
    if (_st.sortCol === col) _st.sortDesc = !_st.sortDesc;
    else { _st.sortCol = col; _st.sortDesc = true; }
    _renderStudents();
    _renderContent();
  }

  /* ── 콘텐츠 ── */
  function _renderContent() {
    const cnt = document.getElementById('gr-content'); if (!cnt) return;
    if (!_st.classId || !_st.bookId) {
      cnt.innerHTML = `<div class="gr-empty"><div class="gr-empty-ico">📝</div>반과 교재를 선택하세요</div>`; return;
    }
    const sts = _getSorted();
    if (!sts.length) { cnt.innerHTML = `<div class="gr-empty"><div class="gr-empty-ico">👨‍🎓</div>재원 학생이 없습니다</div>`; return; }
    if (_st.viewMode === 'excel')  _renderExcel(cnt, sts);
    else if (_st.viewMode === 'card')   _renderCarousel(cnt, sts);
    else if (_st.viewMode === 'report') _renderReportView(cnt, sts);
  }

  /* ════════════════════════════════════
   * 엑셀 모드
   * ════════════════════════════════════ */
  function _renderExcel(cnt, students) {
    const config  = GradeDB.getReportConfig(_st.bookId);
    const totalWQ = config.word?.totalQ || 0;
    const actRevs = GradeDB.getActiveReviews(_st.bookId);
    const hasRd   = config.reading?.enabled && actRevs.length > 0;
    const totalRQ = config.reading?.totalQ || 0;
    const rvN     = actRevs.length;

    students.forEach(s => _ensureData(s.id));

    /* 헤더: 정렬 아이콘 */
    const wIcon  = _st.sortCol==='wordAch'?(_st.sortDesc?'↓':'↑'):'↕';
    const rdIcon = _st.sortCol==='rdAch'  ?(_st.sortDesc?'↓':'↑'):'↕';
    const nmIcon = _st.sortCol==='name'   ?(_st.sortDesc?'↓':'↑'):'↕';

    /*
     * 헤더 구조 (3행):
     * Row1: [학생(3행)] [단어평가(4col)] [리딩평가(1+rvN+rvN+1)] [Comment(3행)]
     * Row2: 단어서브4 | [총문제(2행)] [정답수(rvN)] [점수(rvN)] [성취율(2행)]
     * Row3: 단어비어있음 | rvN서브Q | rvN서브S
     */
    const rdH1span = hasRd ? 1 + rvN * 2 + 1 : 0;
    const rdSection = hasRd ? `<th class="gs-th sec-r" colspan="${rdH1span}">📖 리딩 평가</th>` : '';
    const rdRow2 = hasRd ? `
      <th class="gs-th" rowspan="2" style="background:rgba(139,92,246,.06);color:#8b5cf6;vertical-align:middle">총문제</th>
      <th class="gs-th sec-r" colspan="${rvN}">정답 수</th>
      <th class="gs-th sec-r" colspan="${rvN}">점수</th>
      <th class="gs-th sortable sec-r ${_st.sortCol==='rdAch'?'sort-on':''}" rowspan="2"
          onclick="GradeApp._toggleSort('rdAch')" style="vertical-align:middle">성취율 ${rdIcon}</th>` : '';
    const rdRow3Q = hasRd ? actRevs.map(rv=>`<th class="gs-th" style="font-size:9px;background:rgba(139,92,246,.04)">${_e(rv.name)}</th>`).join('') : '';
    const rdRow3S = hasRd ? actRevs.map(rv=>`<th class="gs-th" style="font-size:9px;background:rgba(139,92,246,.04)">${_e(rv.name)}</th>`).join('') : '';

    const html = `
      <div class="gr-sheet-wrap">
        <table class="gr-sheet" oncontextmenu="GradeApp._onCtxTable(event)">
          <thead>
            <tr>
              <th class="gs-fix gs-th sortable ${_st.sortCol==='name'?'sort-on':''}" rowspan="3"
                  onclick="GradeApp._toggleSort('name')">학생 ${nmIcon}</th>
              <th class="gs-th sec-w" colspan="4">🔤 단어 평가</th>
              ${rdSection}
              <th class="gs-th sec-c" rowspan="3" style="min-width:220px">💬 Teacher's Comment</th>
            </tr>
            <tr>
              <th class="gs-th" rowspan="2" style="background:var(--a10);color:var(--a);vertical-align:middle">총 테스트<br>(문제) 수</th>
              <th class="gs-th" rowspan="2" style="background:var(--a10);color:var(--a);vertical-align:middle">재시험</th>
              <th class="gs-th" rowspan="2" style="background:var(--a10);vertical-align:middle">통과</th>
              <th class="gs-th sortable ${_st.sortCol==='wordAch'?'sort-on':''}" rowspan="2"
                  onclick="GradeApp._toggleSort('wordAch')" style="background:var(--a10);vertical-align:middle">성취율 ${wIcon}</th>
              ${rdRow2}
            </tr>
            <tr>
              ${rdRow3Q}${rdRow3S}
            </tr>
          </thead>
          <tbody>
            ${students.map((s,ri) => _excelRow(s, ri, config, totalWQ, actRevs, totalRQ, hasRd)).join('')}
            ${_avgRow(students, config, totalWQ, actRevs, hasRd)}
          </tbody>
        </table>
      </div>`;
    cnt.innerHTML = html;
    setTimeout(() => _renderChart(students, actRevs), 30);
  }

  function _excelRow(s, ri, config, totalWQ, actRevs, totalRQ, hasRd) {
    const d   = _st.data[s.id] || {};
    const wd  = d.word || {};
    const rd  = d.reading || {};
    const isSel = _st.studentId === s.id;

    const retake = wd.retake !== undefined && wd.retake !== '' ? Number(wd.retake) : '';
    const pass   = retake !== '' ? Math.max(0, totalWQ - retake) : '';
    const achW   = pass !== '' && totalWQ > 0 ? Math.round(pass / totalWQ * 100) : '';
    const isGW   = achW !== '' && achW >= 80;

    const rdCells = hasRd ? `
      <td class="gs-td ro" style="background:rgba(139,92,246,.04)">
        <span class="gs-val" style="color:#8b5cf6">${totalRQ||'—'}</span>
      </td>
      ${actRevs.map((rv,i) => {
        const key = `R${i}`;
        const v   = rd[key]?.correct !== '' && rd[key]?.correct != null ? rd[key].correct : '';
        return `<td class="gs-td inp-cell"><input class="gs-inp" type="number" min="0" max="${totalRQ}" step="1"
          value="${v}" placeholder="—" data-sid="${s.id}" data-rkey="${key}" data-row="${ri}"
          oninput="GradeApp._excelRdInput('${s.id}','${key}',this.value,'${totalRQ}')"
          onkeydown="GradeApp._onKey(event,'${s.id}',${ri},'rd')"></td>`;
      }).join('')}
      ${actRevs.map((rv,i) => {
        const key = `R${i}`;
        const sc  = rd[key]?.score !== '' && rd[key]?.score != null ? rd[key].score : '';
        return `<td class="gs-td ro" id="gr-sc-${s.id}-${key}"><span class="gs-val score-c">${sc!==''?sc:'—'}</span></td>`;
      }).join('')}
      <td class="gs-td ro" id="gr-achvrd-${s.id}"><span class="gs-val achv-c">${_calcRdStr(rd,actRevs)||'—'}</span></td>` : '';

    return `
      <tr class="${isSel?'sel-row':''}" id="gr-row-${s.id}" data-sid="${s.id}">
        <td class="gs-fix ${isSel?'sel':''}" onclick="GradeApp._onStu('${s.id}',${ri})">
          <div style="display:flex;align-items:center;gap:5px">
            <span style="font-size:15px">${_emoji(s, achW!==''?achW:null)}</span>
            <div>
              <div style="font-weight:700;font-size:12px;color:var(--tx)">${_e(s.name)}${s.nickname?` <span style="font-size:10px;color:var(--tx3)">(${_e(s.nickname)})</span>`:''}</div>
              ${d.savedAt?`<div style="font-size:8px;color:var(--tx3)">${d.savedAt.slice(5,16)}</div>`:''}
            </div>
          </div>
        </td>
        <td class="gs-td ro"><span class="gs-val score-c">${totalWQ||'—'}</span></td>
        <td class="gs-td inp-cell">
          <input class="gs-inp" type="number" min="0" max="${totalWQ}" step="1"
            value="${retake}" placeholder="0"
            id="gr-retake-${s.id}" data-sid="${s.id}" data-row="${ri}" data-col="word"
            oninput="GradeApp._excelWordInput('${s.id}',this.value,'${totalWQ}')"
            onkeydown="GradeApp._onKey(event,'${s.id}',${ri},'word')">
        </td>
        <td class="gs-td ro ${pass!==''?(isGW?'pass-c':'fail-c'):''}" id="gr-pass-${s.id}">
          <span class="gs-val">${pass!==''?pass:'—'}</span>
        </td>
        <td class="gs-td ro ${achW!==''?(isGW?'pass-c':'fail-c'):''}" id="gr-achvw-${s.id}">
          <span class="gs-val">${achW!==''?achW+'%':'—'}</span>
        </td>
        ${rdCells}
        <td class="gs-td inp-cell gs-cm-cell">
          <textarea class="gs-cm-inp" id="gr-cmt-${s.id}"
            oninput="GradeApp._excelComment('${s.id}',this.value)">${_e(d.comment||'')}</textarea>
        </td>
      </tr>`;
  }

  /* 평균 행 */
  function _avgRow(students, config, totalWQ, actRevs, hasRd) {
    const achWs = students.map(s => {
      const d = _st.data[s.id];
      if (d?.word?.pass != null && d?.word?.totalQ > 0) return Math.round(d.word.pass / d.word.totalQ * 100);
      const rec = GradeDB.getLatest(_st.classId, s.id, _st.bookId);
      return rec?.word?.totalQ > 0 ? Math.round(rec.word.pass / rec.word.totalQ * 100) : null;
    }).filter(v => v != null);
    const avgW = achWs.length ? Math.round(achWs.reduce((a,b)=>a+b,0)/achWs.length) : null;

    let rdAvgCells = '';
    if (hasRd) {
      const achRds = students.map(s => {
        const d = _st.data[s.id];
        const rec = GradeDB.getLatest(_st.classId, s.id, _st.bookId);
        const rd = d?.reading || rec?.reading || {};
        return _calcRdN(rd, actRevs);
      }).filter(v => v != null);
      const avgRd = achRds.length ? Math.round(achRds.reduce((a,b)=>a+b,0)/achRds.length) : null;
      // ★ 리딩 평가 그룹: 총문제(1)+정답수N+점수N = 1+N+N 컬럼 병합
      const rdMergeCols = 1 + actRevs.length * 2;
      rdAvgCells = `
        <td class="gs-td ro" colspan="${rdMergeCols}"
          style="text-align:center;font-weight:800;color:#8b5cf6;font-size:12px">평균</td>
        <td class="gs-td ro"><span class="gs-val achv-c" id="gr-avg-rd">${avgRd!=null?avgRd+'%':'—'}</span></td>`;
    }

    // ★ 단어평가 그룹: gs-fix(학생)+총테스트+재시험+통과 = 4컬럼 병합
    const graphBtn = `<button id="gr-graph-toggle" onclick="GradeApp._toggleGraph()"
      title="${_st.showGraph?'그래프 숨기기':'그래프 표시'}"
      style="background:${_st.showGraph?'var(--a)':'transparent'};border:${_st.showGraph?'none':'1.5px solid var(--bdr2)'};border-radius:6px;cursor:pointer;font-size:12px;padding:2px 6px;color:${_st.showGraph?'#fff':'var(--tx3)'};transition:all .15s;margin-left:6px">📊</button>`;
    return `<tr class="gr-avg-row">
      <td class="gs-fix" colspan="4"
        style="text-align:center;font-weight:800;color:var(--a);font-size:12px">
        평균${graphBtn}
      </td>
      <td class="gs-td ro"><span class="gs-val achv-c" id="gr-avg-w">${avgW!=null?avgW+'%':'—'}</span></td>
      ${rdAvgCells}
      <td class="gs-td ro gs-cm-cell"></td>
    </tr>`;
  }

  /* 평균 실시간 갱신 */
  function _updateAvg() {
    const students = _getSorted();
    const config   = GradeDB.getReportConfig(_st.bookId);
    const actRevs  = GradeDB.getActiveReviews(_st.bookId);
    const hasRd    = config.reading?.enabled && actRevs.length > 0;

    const achWs = students.map(s => {
      const d = _st.data[s.id];
      if (!d?.word?.totalQ) return null;
      const p = d.word.pass !== '' ? d.word.pass : null;
      return p != null && d.word.totalQ > 0 ? Math.round(p / d.word.totalQ * 100) : null;
    }).filter(v => v != null);
    const avgW = achWs.length ? Math.round(achWs.reduce((a,b)=>a+b,0)/achWs.length) : null;
    const avgWEl = document.getElementById('gr-avg-w');
    if (avgWEl) avgWEl.textContent = avgW != null ? avgW + '%' : '—';

    if (hasRd) {
      const achRds = students.map(s => _calcRdN(_st.data[s.id]?.reading||{}, actRevs)).filter(v=>v!=null);
      const avgRd  = achRds.length ? Math.round(achRds.reduce((a,b)=>a+b,0)/achRds.length) : null;
      const avgRdEl = document.getElementById('gr-avg-rd');
      if (avgRdEl) avgRdEl.textContent = avgRd != null ? avgRd + '%' : '—';
    }
  }

  /* ── 엑셀 입력 핸들러 ── */
  function _excelWordInput(sid, val, totalWQ) {
    _ensureData(sid);
    const tq     = Number(totalWQ) || 0;
    const retake = val === '' ? '' : Math.max(0, Math.min(tq, Number(val)));
    const pass   = retake !== '' ? Math.max(0, tq - retake) : '';
    const achW   = pass !== '' && tq > 0 ? Math.round(pass / tq * 100) : '';
    const isGW   = achW !== '' && achW >= 80;
    _st.data[sid].word = { totalQ:tq, retake, pass };
    _st.dirty.add(sid); _refreshDirtyUI();

    const passEl = document.getElementById(`gr-pass-${sid}`);
    const achEl  = document.getElementById(`gr-achvw-${sid}`);
    if (passEl) { passEl.querySelector('.gs-val').textContent = pass!==''?pass:'—'; passEl.className=`gs-td ro ${pass!==''?(isGW?'pass-c':'fail-c'):''}`; }
    if (achEl)  { achEl.querySelector('.gs-val').textContent  = achW!==''?achW+'%':'—'; achEl.className =`gs-td ro ${achW!==''?(isGW?'pass-c':'fail-c'):''}`; }
    _updateAvg(); _updateChart();
  }

  function _excelRdInput(sid, key, val, totalRQ) {
    _ensureData(sid);
    const tq      = Number(totalRQ) || 0;
    const correct = val === '' ? '' : Math.max(0, Math.min(tq, Number(val)));
    const score   = correct !== '' ? Math.round(correct / tq * 100 * 10) / 10 : '';
    if (!_st.data[sid].reading) _st.data[sid].reading = {};
    _st.data[sid].reading[key] = { correct, score };
    _st.dirty.add(sid); _refreshDirtyUI();

    const actRevs = GradeDB.getActiveReviews(_st.bookId);
    const scEl    = document.getElementById(`gr-sc-${sid}-${key}`);
    const achvEl  = document.getElementById(`gr-achvrd-${sid}`);
    if (scEl) scEl.querySelector('.gs-val').textContent = score !== '' ? score : '—';
    if (achvEl) achvEl.querySelector('.gs-val').textContent = _calcRdStr(_st.data[sid].reading, actRevs) || '—';
    _updateAvg();
  }

  function _excelComment(sid, val) {
    _ensureData(sid); _st.data[sid].comment = val;
    _st.dirty.add(sid); _refreshDirtyUI();
  }

  /* ── 키보드 네비게이션 ── */
  function _onKey(e, sid, rowIdx, type) {
    const students = _getSorted();
    if (e.key === 'Enter') {
      /* Enter → 다음 학생 같은 컬럼 */
      e.preventDefault();
      const next = students[rowIdx + 1];
      if (next) {
        if (type === 'word') document.getElementById(`gr-retake-${next.id}`)?.focus();
        else document.querySelector(`[data-sid="${next.id}"][data-rkey="${type==='rd'?e.target.dataset.rkey:'R0'}"]`)?.focus();
        _onStu(next.id, rowIdx + 1);
      }
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      /* 방향키 ↑↓ → 값 증가/감소 (기본 동작, 이동 안 함) */
      /* 기본 number input 동작 유지 */
    }
  }

  /* ── 우클릭 컨텍스트 메뉴 ── */
  function _onCtxTable(e) {
    e.preventDefault();
    const row = e.target.closest('tr[data-sid]');
    if (!row) return;
    const sid = row.dataset.sid;
    _showCtxMenu(e.clientX, e.clientY, sid);
  }

  function _showCtxMenu(x, y, sid) {
    const menu = document.getElementById('gr-ctx'); if (!menu) return;
    const s = _getSorted().find(s=>s.id===sid);
    menu.innerHTML = `
      <div style="padding:6px 12px;font-size:10px;font-weight:800;color:var(--tx3);letter-spacing:.5px">
        ${s?_e(s.name):'학생'}
      </div>
      <div class="gr-ctx-divider"></div>
      <div class="gr-ctx-item" onclick="GradeApp.saveOne('${sid}');GradeApp._closeCtxMenu()">💾 저장</div>
      <div class="gr-ctx-item red" onclick="GradeApp.resetOne('${sid}');GradeApp._closeCtxMenu()">🗑 초기화</div>`;
    /* 화면 밖으로 나가지 않게 */
    const menuW = 150, menuH = 100;
    menu.style.left = Math.min(x, window.innerWidth - menuW) + 'px';
    menu.style.top  = Math.min(y, window.innerHeight - menuH) + 'px';
    menu.style.display = 'block';
  }

  function _closeCtxMenu(e) {
    const menu = document.getElementById('gr-ctx');
    if (menu && (!e || !menu.contains(e.target))) menu.style.display = 'none';
  }

  /* ── 차트 ── */
  function _getClassAvgW(students) {
    const vals = students.map(s => {
      const d=_st.data[s.id]||{}; const rec=GradeDB.getLatest(_st.classId,s.id,_st.bookId);
      const wd=d.word||rec?.word||{};
      return wd.totalQ>0&&wd.pass!=null ? Math.round(wd.pass/wd.totalQ*100) : null;
    }).filter(v=>v!=null);
    return vals.length ? Math.round(vals.reduce((a,b)=>a+b,0)/vals.length) : null;
  }
  function _getClassAvgR(students, actRevs) {
    const vals = students.map(s => {
      const d=_st.data[s.id]||{}; const rec=GradeDB.getLatest(_st.classId,s.id,_st.bookId);
      const rd=d.reading||rec?.reading||{};
      return _calcRdN(rd,actRevs);
    }).filter(v=>v!=null);
    return vals.length ? Math.round(vals.reduce((a,b)=>a+b,0)/vals.length) : null;
  }

  function _renderChart(students, actRevs) {
    const canvas = document.getElementById('gr-chart'); if (!canvas) return;
    const config  = GradeDB.getReportConfig(_st.bookId||'');
    const hasRd   = config.reading?.enabled && actRevs.length > 0;
    const W = canvas.offsetWidth || 300, H = 72;
    canvas.width = W * window.devicePixelRatio; canvas.height = H * window.devicePixelRatio;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    ctx.clearRect(0, 0, W, H);

    if (!students.length) return;
    const n = students.length;
    const bw = Math.max(8, Math.min(24, (W / n / (hasRd?2:1)) - 3));
    const gapX = W / n;

    students.forEach((s, i) => {
      const d    = _st.data[s.id] || {};
      const rec  = GradeDB.getLatest(_st.classId, s.id, _st.bookId);
      const wd   = d.word || rec?.word || {};
      const rdD  = d.reading || rec?.reading || {};
      const achW = wd.totalQ > 0 && wd.pass != null ? Math.round(wd.pass / wd.totalQ * 100) : 0;
      const achR = hasRd ? (_calcRdN(rdD, actRevs) ?? 0) : 0;
      const isHL = _st.studentId === s.id;
      const x    = i * gapX + gapX / 2;
      const maxH = H - 18;

      if (hasRd) {
        ctx.fillStyle = isHL ? '#6366f1' : '#a5b4fc';
        ctx.globalAlpha = isHL ? 1 : .8;
        const hw = Math.round(achW / 100 * maxH);
        ctx.fillRect(x - bw - 1, maxH - hw, bw, hw);
        const rw = Math.round(achR / 100 * maxH);
        ctx.fillStyle = isHL ? '#8b5cf6' : '#c4b5fd';
        ctx.fillRect(x + 1, maxH - rw, bw, rw);
      } else {
        const hw = Math.round(achW / 100 * maxH);
        ctx.fillStyle = isHL ? '#6366f1' : (achW >= 80 ? '#10b981' : '#f97316');
        ctx.globalAlpha = isHL ? 1 : .75;
        ctx.fillRect(x - bw/2, maxH - hw, bw, hw);
      }
      ctx.globalAlpha = 1;
      ctx.font = `${isHL?'bold ':''} 9px sans-serif`;
      ctx.fillStyle = isHL ? '#6366f1' : '#9ca3af';
      ctx.textAlign = 'center';
      ctx.fillText(_givN(s.name).slice(0,2), x, H - 3);
    });
  }

  function _updateChart() {
    const sts   = _getSorted();
    const revs  = _st.bookId ? GradeDB.getActiveReviews(_st.bookId) : [];
    _renderChart(sts, revs);
  }

  /* ════════════════════════════════════
   * 카드 캐러셀 모드
   * ════════════════════════════════════ */
  function _renderCarousel(cnt, students) {
    const idx  = Math.max(0, Math.min(_st.slideIdx, students.length - 1));
    _st.slideIdx = idx;
    const prev = students[idx - 1] || null;
    const curr = students[idx];
    const next = students[idx + 1] || null;

    cnt.innerHTML = `
      <div class="gr-carousel-wrap">
        <div class="gr-carousel" id="gr-carousel"
             ontouchstart="GradeApp._ts(event)" ontouchend="GradeApp._te(event)">
          ${prev ? `<div class="gr-slide prev" onclick="GradeApp._slideTo(${idx-1})">${_cardBody(prev, false)}</div>` : ''}
          <div class="gr-slide ${prev||next?'curr':'solo'}">${_cardBody(curr, true)}</div>
          ${next ? `<div class="gr-slide next" onclick="GradeApp._slideTo(${idx+1})">${_cardBody(next, false)}</div>` : ''}
        </div>
        <div class="gr-carousel-nav">
          ${students.map((_,i) => `<div class="gr-carousel-dot ${i===idx?'on':''}" onclick="GradeApp._slideTo(${i})"></div>`).join('')}
        </div>
      </div>`;
  }

  function _cardBody(s, active) {
    _ensureData(s.id);
    const config  = GradeDB.getReportConfig(_st.bookId);
    const totalWQ = config.word?.totalQ || 0;
    const actRevs = GradeDB.getActiveReviews(_st.bookId);
    const hasRd   = config.reading?.enabled && actRevs.length > 0;
    const totalRQ = config.reading?.totalQ || 0;
    const d  = _st.data[s.id] || {};
    const wd = d.word || {}, rd = d.reading || {};

    const retake = wd.retake !== '' && wd.retake != null ? wd.retake : '';
    const pass   = retake !== '' ? Math.max(0, totalWQ - Number(retake)) : '';
    const achW   = pass !== '' && totalWQ > 0 ? Math.round(pass / totalWQ * 100) : '';
    const isGW   = achW !== '' && achW >= 80;
    const achRd  = _calcRdStr(rd, actRevs);

    const rdRows = hasRd ? actRevs.map((rv, i) => {
      const key     = `R${i}`;
      const correct = rd[key]?.correct !== '' && rd[key]?.correct != null ? rd[key].correct : '';
      const score   = rd[key]?.score   !== '' && rd[key]?.score   != null ? rd[key].score   : '';
      return `<div class="gr-crow">
        <div class="gr-clbl" style="font-size:11px">${_e(rv.name)}</div>
        <div class="gr-cval">
          ${active
            ? `<input class="gr-cinp" type="number" min="0" max="${totalRQ}" step="1"
                     value="${correct}" placeholder="0" id="gr-cd-rd-${s.id}-${key}"
                     oninput="GradeApp._cardRdInput('${key}',this.value,'${s.id}','${totalRQ}')">`
            : `<div class="gr-cdisp score">${correct!==''?correct:'—'}</div>`}
          ${active ? `<span style="font-size:10px;color:var(--tx3);flex-shrink:0">/ ${totalRQ}</span>` : ''}
          <div class="gr-cdisp score" id="gr-cd-sc-${s.id}-${key}" style="min-width:44px">${score!==''?score:'—'}</div>
        </div>
      </div>`;
    }).join('') + `
      <div class="gr-crow">
        <div class="gr-clbl">성취율</div>
        <div class="gr-cval"><div class="gr-cdisp achv" id="gr-cd-achrd-${s.id}">${achRd||'—'}</div></div>
      </div>` : '';

    return `<div class="gr-card-body">
      <div class="gr-card-hero">
        <div class="gr-hero-emo">${_emoji(s, achW!==''?achW:null)}</div>
        <div>
          <div class="gr-hero-nm">${_e(s.name)}${s.nickname?` <span style="font-size:11px;color:var(--tx3)">(${_e(s.nickname)})</span>`:''}</div>
          <div class="gr-hero-sub">${_getCls(_st.classId)?.name||''}반</div>
        </div>
        ${achW!==''?`<div class="gr-hero-score">
          <div class="gr-hero-pct" style="color:${isGW?'#16a34a':'#f97316'}">${achW}%</div>
          <div class="gr-hero-lbl">단어 성취율</div>
        </div>`:''}
      </div>
      <!-- 단어 -->
      <div class="gr-csec">
        <div class="gr-csec-head">
          <div class="gr-csec-title">🔤 단어</div>
          <div class="gr-csec-badge">총 ${totalWQ}문제</div>
        </div>
        <div class="gr-card-grid">
          <div class="gr-crow">
            <div class="gr-clbl">재시험</div>
            <div class="gr-cval">
              ${active
                ? `<input class="gr-cinp" type="number" min="0" max="${totalWQ}" step="1"
                         value="${retake}" placeholder="0" id="gr-cd-retake-${s.id}"
                         oninput="GradeApp._cardWordInput(this.value,'${s.id}','${totalWQ}')">`
                : `<div class="gr-cdisp score">${retake!==''?retake:'—'}</div>`}
            </div>
          </div>
          <div class="gr-crow">
            <div class="gr-clbl">통과</div>
            <div class="gr-cval"><div class="gr-cdisp ${pass!==''?(isGW?'pass':'fail'):''}" id="gr-cd-pass-${s.id}">${pass!==''?pass:'—'}</div></div>
          </div>
          <div class="gr-crow">
            <div class="gr-clbl">성취율</div>
            <div class="gr-cval"><div class="gr-cdisp ${achW!==''?(isGW?'pass':'fail'):''}" id="gr-cd-achw-${s.id}">${achW!==''?achW+'%':'—'}</div></div>
          </div>
        </div>
      </div>
      <!-- 리딩 -->
      ${hasRd?`<div class="gr-csec">
        <div class="gr-csec-head">
          <div class="gr-csec-title">📖 리딩</div>
          <div class="gr-csec-badge rd">총 ${totalRQ}문제</div>
        </div>
        <div class="gr-card-grid">${rdRows}</div>
      </div>`:''}
      <!-- 코멘트 -->
      <div class="gr-csec">
        <div class="gr-csec-head"><div class="gr-csec-title">💬 Teacher's Comment</div></div>
        <div style="border:1px solid var(--bdr);border-top:none;border-radius:0 0 9px 9px">
          ${active
            ? `<textarea class="gr-card-cmt" id="gr-cd-cmt-${s.id}"
                         oninput="GradeApp._cardComment(this.value,'${s.id}')">${_e(d.comment||'')}</textarea>`
            : `<div style="padding:8px 10px;font-size:11px;color:var(--tx2);min-height:40px;line-height:1.7">${_e(d.comment||'')}</div>`}
        </div>
      </div>
      ${active?`<div class="gr-card-save-row">
        <button class="gr-card-save-btn" onclick="GradeApp.saveOne('${s.id}')">💾 저장</button>
      </div>`:''}
    </div>`;
  }

  /* 카드 입력 */
  function _cardWordInput(val, sid, totalWQ) {
    _ensureData(sid);
    const tq   = Number(totalWQ) || 0;
    const rt   = val===''?'':Math.max(0,Math.min(tq,Number(val)));
    const pass = rt!==''?Math.max(0,tq-rt):'';
    const achW = pass!==''&&tq>0?Math.round(pass/tq*100):'';
    const isGW = achW!==''&&achW>=80;
    _st.data[sid].word = {totalQ:tq,retake:rt,pass};
    _st.dirty.add(sid); _refreshDirtyUI();
    const pe=document.getElementById(`gr-cd-pass-${sid}`), ae=document.getElementById(`gr-cd-achw-${sid}`);
    if(pe){pe.textContent=pass!==''?pass:'—';pe.className=`gr-cdisp ${pass!==''?(isGW?'pass':'fail'):''}`;}
    if(ae){ae.textContent=achW!==''?achW+'%':'—';ae.className=`gr-cdisp ${achW!==''?(isGW?'pass':'fail'):''}`;}
  }

  function _cardRdInput(key, val, sid, totalRQ) {
    _ensureData(sid);
    const tq   = Number(totalRQ) || 0;
    const corr = val===''?'':Math.max(0,Math.min(tq,Number(val)));
    const sc   = corr!==''?Math.round(corr/tq*100*10)/10:'';
    if (!_st.data[sid].reading) _st.data[sid].reading = {};
    _st.data[sid].reading[key] = {correct:corr, score:sc};
    _st.dirty.add(sid); _refreshDirtyUI();
    const actRevs = GradeDB.getActiveReviews(_st.bookId);
    const scEl  = document.getElementById(`gr-cd-sc-${sid}-${key}`);
    const achEl = document.getElementById(`gr-cd-achrd-${sid}`);
    if(scEl)  scEl.textContent  = sc!==''?sc:'—';
    if(achEl) achEl.textContent = _calcRdStr(_st.data[sid].reading, actRevs)||'—';
  }

  function _cardComment(val, sid) {
    _ensureData(sid); _st.data[sid].comment=val;
    _st.dirty.add(sid); _refreshDirtyUI();
  }

  function _slideTo(i) {
    const sts=_getSorted();
    _st.slideIdx=Math.max(0,Math.min(i,sts.length-1));
    _st.studentId=sts[_st.slideIdx]?.id||null;
    _renderStudents(); _renderContent();
  }
  function _ts(e){_st.touchStartX=e.touches[0].clientX;}
  function _te(e){const dx=e.changedTouches[0].clientX-_st.touchStartX;if(Math.abs(dx)>50)_slideTo(_st.slideIdx+(dx<0?1:-1));}

  /* ════════════════════════════════════
   * 리포트 뷰
   * ════════════════════════════════════ */
  function _renderReportView(cnt, students) {
    const s = students.find(s=>s.id===_st.studentId)||students[0];
    if(!s){cnt.innerHTML=`<div class="gr-empty"><div class="gr-empty-ico">👆</div>좌측에서 학생을 선택하세요</div>`;return;}
    if(!_st.studentId){_st.studentId=s.id;_renderStudents();}
    cnt.innerHTML=`<div class="gr-report-panel" style="position:relative;display:flex;flex-direction:column;gap:2px;">

      <div class="gr-rpt-cfg" id="gr-rpt-cfg-panel" style="display:none">
        <div style="display:grid;grid-template-columns:repeat(3,max-content) 1fr 1fr;gap:8px 16px;align-items:start;overflow-x:auto">
          <div>
            <div class="gr-rpt-cfg-title">레이아웃</div>
            <div class="gr-rpt-layouts">${[1,3,4,5,6,7].map(n=>`<button class="gr-rpt-lbtn ${_st.reportLayout===n?'on':''}" onclick="GradeApp._setLayout(${n})">L${n}</button>`).join('')}</div>
          </div>
          <div>
            <div class="gr-rpt-cfg-title">📄 페이지</div>
            <div style="display:flex;gap:4px">
              ${['A4','A5','B5'].map(s=>`<button id="gr-ps-${s}" onclick="GradeApp._setPageSize('${s}')"
                style="padding:3px 9px;border-radius:7px;border:1.5px solid ${_st.pageSize===s?'var(--a)':'var(--bdr2)'};background:${_st.pageSize===s?'var(--a20)':'var(--surf2)'};color:${_st.pageSize===s?'var(--a)':'var(--tx3)'};font-size:11px;font-weight:700;cursor:pointer;font-family:var(--font);white-space:nowrap">${s}</button>`).join('')}
            </div>
          </div>
          <div>
            <div class="gr-rpt-cfg-title">🖼 로고</div>
            <div style="display:flex;align-items:center;gap:5px">
              <input type="range" min="40" max="160" value="${_st.logoSize}" oninput="GradeApp._setLogoSize(this.value)" style="width:70px;accent-color:var(--a)">
              <span id="gr-rpt-logo-sz" style="display:inline-block;min-width:34px;font-size:11px;color:var(--tx2)">${_st.logoSize}px</span>
            </div>
          </div>
          <div>
            <div class="gr-rpt-cfg-title">🔡 글자 크기</div>
            <div style="display:flex;flex-direction:column;gap:3px">
              <label style="font-size:11px;color:var(--tx2);display:flex;align-items:center;gap:4px;white-space:nowrap">제목 <input type="range" min="12" max="28" value="${_st.reportTitleSize}" oninput="GradeApp._setRptFontSize('title',this.value)" style="width:65px;accent-color:var(--a)"><span id="gr-rpt-title-sz" style="display:inline-block;min-width:28px">${_st.reportTitleSize}px</span></label>
              <label style="font-size:11px;color:var(--tx2);display:flex;align-items:center;gap:4px;white-space:nowrap">본문 <input type="range" min="8" max="16" value="${_st.reportBodySize}" oninput="GradeApp._setRptFontSize('body',this.value)" style="width:65px;accent-color:var(--a)"><span id="gr-rpt-body-sz" style="display:inline-block;min-width:28px">${_st.reportBodySize}px</span></label>
            </div>
          </div>
          <div>
            <div class="gr-rpt-cfg-title">📊 그래프 &amp; 🖊 라인</div>
            <label class="gr-rpt-toggle" style="display:flex;align-items:center;gap:4px;margin-bottom:4px"><input type="checkbox" ${_st.reportGraph?'checked':''} onchange="GradeApp._toggleGraph(this.checked)"> 그래프 포함</label>
            <div style="display:flex;gap:3px;margin-bottom:4px">
              ${['left','center','right'].map(a=>`<button id="gr-ga-${a}" onclick="GradeApp._setGraphAlign('${a}')" style="padding:2px 7px;border-radius:6px;font-size:10px;font-weight:700;cursor:pointer;font-family:var(--font);border:1.5px solid ${_st.graphAlign===a?'var(--a)':'var(--bdr2)'};background:${_st.graphAlign===a?'var(--a10)':'var(--surf2)'};color:${_st.graphAlign===a?'var(--a)':'var(--tx3)'};white-space:nowrap">${a==='left'?'좌':a==='center'?'중앙':'우'}</button>`).join('')}
            </div>
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
              <label style="font-size:11px;color:var(--tx2);display:flex;align-items:center;gap:3px;white-space:nowrap">색상 <input type="color" value="${_st.dividerColor}" oninput="GradeApp._setDivider('color',this.value)" style="width:26px;height:20px;border:none;cursor:pointer;border-radius:4px;padding:0"></label>
              <label style="font-size:11px;color:var(--tx2);display:flex;align-items:center;gap:3px;white-space:nowrap">굵기 <input type="range" min="1" max="4" value="${_st.dividerWidth}" oninput="GradeApp._setDivider('width',this.value)" style="width:55px;accent-color:var(--a)"><span id="gr-div-width-lbl" style="display:inline-block;min-width:24px">${_st.dividerWidth}px</span></label>
              <label style="font-size:11px;color:var(--tx2);display:flex;align-items:center;gap:4px;white-space:nowrap"><input type="checkbox" id="gr-tbl-round" ${_st.tableRound?'checked':''} onchange="GradeApp._setTableRound(this.checked)" style="accent-color:var(--a)"> 표 라운드</label>
            </div>
          </div>
          <!-- 배경색 -->
          <div style="grid-column:1/-1">
            <div class="gr-rpt-cfg-title">🎨 배경색</div>
            <div style="display:flex;gap:5px;flex-wrap:wrap">
              ${[['#ffffff','흰색'],['#f8f9ff','연보라'],['#f0fdf4','연초록'],['#fffbeb','크림'],['#f0f9ff','하늘'],['#fdf4ff','라벤더'],['#fff1f2','분홍'],['#1a1a2e','다크']].map(([c,l])=>`<button onclick="GradeApp._setRptBg('${c}')" title="${l}" style="width:22px;height:22px;border-radius:50%;border:2px solid ${_st.rptBg===c?'var(--a)':'#e5e7eb'};background:${c};cursor:pointer;box-shadow:${_st.rptBg===c?'0 0 0 2px var(--a)':'none'};transition:all .15s"></button>`).join('')}
            </div>
          </div>
        </div></div>
      </div>
      </div>
      <div class="gr-rpt-preview">
        <div class="rpt-wrap" id="gr-rpt-preview" style="background:${_st.rptBg||'#ffffff'};font-size:${_st.reportBodySize}px;width:${({A4:794,A5:559,B5:665}[_st.pageSize]||794)}px;max-width:${({A4:794,A5:559,B5:665}[_st.pageSize]||794)}px;margin:0 auto">${_buildReport(s)}</div>
        <!-- 하단 버튼 제거됨: 우측 고정 버튼(gr-rpt-fixed-btns)으로 대체 -->
      </div>
    </div>`;
    // ★ 초기 표/코멘트 라인 스타일 즉시 적용
    requestAnimationFrame(()=>{
      const pw=document.getElementById('gr-rpt-preview');
      if(pw){
        pw.querySelectorAll('.rpt-tbl td,.rpt-tbl th,.rpt-comment-box').forEach(el=>{
          el.style.borderColor=_st.dividerColor||'#e2e8f0';
          el.style.borderWidth=(_st.dividerWidth||1)+'px';
        });
        pw.querySelectorAll('.rpt-tbl').forEach(el=>{
          el.style.borderRadius='10px';
          el.style.overflow='hidden';
        });
      }
    });
  }

  function _buildReport(s) {
    const config=GradeDB.getReportConfig(_st.bookId),actRevs=GradeDB.getActiveReviews(_st.bookId);
    const hasRd=config.reading?.enabled&&actRevs.length>0;
    const book=typeof BookLibDB!=='undefined'?BookLibDB.getBookById(_st.bookId):null;
    const cls=_getCls(_st.classId);
    const rec=GradeDB.getLatest(_st.classId,s.id,_st.bookId);
    const students=_getStudents();
    const today=new Date().toLocaleDateString('ko-KR');

    const achWs=students.map(st=>{const r=GradeDB.getLatest(_st.classId,st.id,_st.bookId);return r?.word?.totalQ>0?Math.round(r.word.pass/r.word.totalQ*100):null;}).filter(v=>v!=null);
    const avgW=achWs.length?Math.round(achWs.reduce((a,b)=>a+b,0)/achWs.length):null;
    const achRds=hasRd?students.map(st=>{const r=GradeDB.getLatest(_st.classId,st.id,_st.bookId);return _calcRdN(r?.reading||{},actRevs);}).filter(v=>v!=null):[];
    const avgRd=achRds.length?Math.round(achRds.reduce((a,b)=>a+b,0)/achRds.length):null;
    const achW=rec?.word?.totalQ>0?Math.round(rec.word.pass/rec.word.totalQ*100):null;
    const achRd=hasRd?_calcRdN(rec?.reading||{},actRevs):null;
    const isGW=achW!=null&&achW>=80;

    const _htLogo="data:image/png;base64,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";
    const hdr=`<div class="rpt-header" style="display:flex;align-items:center;gap:16px;margin-bottom:18px;padding-bottom:14px;border-bottom:2px solid #e5e7eb"><div style="flex-shrink:0;text-align:center"><img id="gr-rpt-logo-img" src="${_htLogo}" style="width:${_st.logoSize||80}px;height:auto;display:block;margin:0 auto"></div><div style="flex:1;display:flex;align-items:center;justify-content:space-between;padding-bottom:4px"><div class="rpt-title" style="font-size:${_st.reportTitleSize||26}px;font-weight:900;color:#111">Achievement Report</div><div style="font-size:10px;color:#9ca3af">${today}</div></div></div>`;
    const info=`<div class="rpt-info"><p><strong>Student :</strong> ${_e(s.name)}${s.nickname?`(${_e(s.nickname)})`:''}</p><p><strong>Book :</strong>&nbsp;&nbsp;&nbsp;&nbsp;${_e(book?.name||'')}</p></div>`;
    const wordTbl=rec?`<div class="rpt-sec-title">단어 Test Result</div><table class="rpt-tbl"><thead><tr><th>총 테스트수</th><th style="color:#4f46e5">통과</th><th style="color:#ea580c">재시</th><th style="color:#8b5cf6">성취율</th></tr></thead><tbody><tr><td>${rec.word?.totalQ??'—'}</td><td class="rpt-pass">${rec.word?.pass??'—'}</td><td class="rpt-fail">${rec.word?.retake??'—'}</td><td class="rpt-achv">${achW!=null?achW+'%':'—'}</td></tr><tr class="rpt-avg"><td colspan="3" style="text-align:center">평균</td><td class="rpt-achv">${avgW!=null?avgW+'%':'—'}</td></tr></tbody></table>`:'';
    const rdTbl=hasRd&&rec?`<div class="rpt-sec-title">리딩 Test Result</div><table class="rpt-tbl"><thead><tr>${actRevs.map(rv=>`<th>${_e(rv.name)}</th>`).join('')}<th style="color:#8b5cf6">성취율</th></tr></thead><tbody><tr>${actRevs.map((_,i)=>{const sc=rec.reading?.[`R${i}`]?.score;return`<td class="rpt-pass">${sc!=null?sc+'점':'—'}</td>`;}).join('')}<td class="rpt-achv">${achRd!=null?Math.round(achRd)+'%':'—'}</td></tr><tr class="rpt-avg"><td colspan="${actRevs.length}" style="text-align:center">평균</td><td class="rpt-achv">${avgRd!=null?avgRd+'%':'—'}</td></tr></tbody></table>`:'';
    const graph=_st.reportGraph&&achW!=null?`<div class="rpt-graph-wrap">${_svgGraph(achW,hasRd?achRd:null)}</div>`:'';
    const comment=`<div style="margin-top:14px"><div class="rpt-sec-title">Teacher's comment</div><div class="rpt-comment-box">${_e(rec?.comment||'')}</div></div>`;
    const L=_st.reportLayout;

    // ★ L2: 카드형 - 각 섹션을 둥근 카드 박스로 (이미지 스타일)
    const cardWrap = (icon,title,badge,content) =>
      `<div style="background:#f8f9ff;border:1.5px solid #e0e7ff;border-radius:14px;padding:14px 16px;margin-bottom:12px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <span style="font-size:13px;font-weight:800;color:#3730a3">${icon} ${title}</span>
          ${badge?`<span style="font-size:11px;font-weight:700;color:#6366f1;background:#ede9fe;padding:2px 8px;border-radius:8px">${badge}</span>`:''}
        </div>
        ${content}
      </div>`;

    const wordCardContent = rec ? (() => {
      const wd=rec.word||{};
      const achW2=wd.totalQ>0?Math.round(wd.pass/wd.totalQ*100):null;
      return `<div style="display:flex;flex-direction:column;gap:6px">
        <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #e0e7ff">
          <span style="font-size:11px;color:#6b7280;width:60px">재시험</span>
          <div style="flex:1;background:#fff;border:1px solid #e0e7ff;border-radius:8px;padding:6px 12px;text-align:center;font-weight:800;font-size:13px;color:#ea580c">${wd.retry??'—'}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #e0e7ff">
          <span style="font-size:11px;color:#6b7280;width:60px">통과</span>
          <div style="flex:1;background:#fff;border:1px solid #e0e7ff;border-radius:8px;padding:6px 12px;text-align:center;font-weight:800;font-size:13px;color:#059669">${wd.pass??'—'}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;padding:6px 0">
          <span style="font-size:11px;color:#6b7280;width:60px">성취율</span>
          <span style="background:#dcfce7;color:#059669;border-radius:8px;padding:4px 14px;font-weight:800;font-size:13px">${achW2!=null?achW2+'%':'—'}</span>
        </div>
      </div>`;
    })() : '';

    const rdCardContent = hasRd && rec ? (() => {
      const rd=rec.reading||{};
      return `<div style="display:flex;flex-direction:column;gap:6px">
        ${actRevs.map(rv=>{
          const score=rd.reviews?.[rv.id]??null;
          const pct=score!=null&&config.reading?.totalQ>0?Math.round(score/config.reading.totalQ*100):null;
          return `<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid #e0e7ff">
            <span style="font-size:11px;color:#6b7280;width:60px">${_e(rv.name)}</span>
            <div style="flex:1;background:#fff;border:1px solid #e0e7ff;border-radius:8px;padding:5px 12px;display:flex;justify-content:space-between;align-items:center">
              <span style="font-weight:800;font-size:13px;color:#4f46e5">${score!=null?score:'—'}</span>
              <span style="font-size:11px;color:#9ca3af">/ ${config.reading?.totalQ??30}</span>
              <span style="font-size:12px;font-weight:700;color:#7c3aed">${pct!=null?pct+'점':'—'}</span>
            </div>
          </div>`;
        }).join('')}
        <div style="display:flex;align-items:center;gap:8px;padding:5px 0">
          <span style="font-size:11px;color:#6b7280;width:60px">성취율</span>
          <span style="background:#ede9fe;color:#7c3aed;border-radius:8px;padding:4px 14px;font-weight:800;font-size:13px">${achRd!=null?Math.round(achRd)+'%':'—'}</span>
        </div>
      </div>`;
    })() : '';

    const commentCardContent = `<div style="min-height:50px;font-size:${_st.reportBodySize||12}px;white-space:pre-wrap;color:#374151">${_e(rec?.comment||'')}</div>`;

    const wordCard = wordCardContent ? cardWrap('📝','단어',rec?.word?.totalQ?'총 '+rec.word.totalQ+'문제':'',wordCardContent) : '';
    const rdCard   = rdCardContent   ? cardWrap('📖','리딩',config.reading?.totalQ?'총 '+config.reading.totalQ+'문제':'',rdCardContent) : '';
    const cmtCard  = cardWrap('💬',"Teacher's Comment",'',commentCardContent);

    // ★ L6: 2컬럼 사이드바 레이아웃 (좌:그래프+정보 / 우:표)
    const twoColL6 = `<div style="display:grid;grid-template-columns:1fr 1.6fr;gap:16px;margin-top:10px">
      <div>${graph}${wordCard}</div>
      <div>${rdCard}${cmtCard}</div>
    </div>`;

    // ★ L7: 미니 대시보드 레이아웃 (성취율 큰 숫자 + 카드 그리드)
    const achWBig = rec?.word?.totalQ>0?Math.round((rec?.word?.pass??0)/rec.word.totalQ*100):null;
    const achRdBig = achRd!=null?Math.round(achRd):null;
    const dashBanner = `<div style="background:linear-gradient(135deg,#4f46e5,#7c3aed);border-radius:14px;padding:20px;margin-bottom:14px;color:#fff;display:flex;align-items:center;justify-content:space-between">
      <div>
        <div style="font-size:11px;opacity:.8;margin-bottom:4px">종합 성취율</div>
        <div style="font-size:36px;font-weight:900">${achWBig!=null?achWBig+'%':'—'}</div>
        <div style="font-size:11px;opacity:.8;margin-top:2px">단어 · ${achRdBig!=null?achRdBig+'%':'리딩없음'} 리딩</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:28px">🏆</div>
        <div style="font-size:11px;opacity:.8;margin-top:4px">${_e(s.name)}</div>
      </div>
    </div>`;
    const dashL7 = `${dashBanner}<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">${wordCard}${rdCard}</div>${cmtCard}`;

    // ★ infoCard 정의
    const achWInfo2=rec&&rec.word&&rec.word.totalQ>0?Math.round((rec.word.pass||0)/rec.word.totalQ*100):null;
    const _clsName=(_getCls(_st.classId)||{}).name||'';
    const _bookName=(book&&book.name)||_st.bookId||'';
    const infoCard='<div style="background:linear-gradient(135deg,#e8f5e9,#f0f7ff);border-radius:14px;padding:14px 18px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;border:1.5px solid #d1fae5">'
      +'<div style="display:flex;align-items:center;gap:10px">'
      +'<div style="font-size:28px;width:44px;height:44px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center">'+_emoji(s,achWInfo2)+'</div>'
      +'<div><div style="font-size:15px;font-weight:900;color:#1a3a2a">'+_e(s.name)+(s.nickname?' ('+_e(s.nickname)+')':'')+'</div>'
      +'<div style="font-size:11px;color:#6b7280;margin-top:1px">'+(_clsName?_clsName+'반 · ':'')+_e(_bookName)+'</div></div></div>'
      +(achWInfo2!=null?'<div style="text-align:right"><div style="font-size:26px;font-weight:900;color:#059669">'+achWInfo2+'%</div><div style="font-size:10px;color:#6b7280">단어 성취율</div></div>':'')
      +'</div>';
    const bodies={
      1:[hdr,info,wordTbl,rdTbl,graph,comment],
      3:[hdr,info,wordTbl,comment,rdTbl,graph],
      4:[hdr,infoCard,wordCard,graph,rdCard,cmtCard],
      5:[hdr,info,graph,comment,wordTbl,rdTbl],
      6:[hdr,infoCard,twoColL6],
      7:[hdr,dashL7],
    };
    return(bodies[L]||bodies[1]).filter(Boolean).join('');
  }

  function _svgGraph(achW, achRd) {
    const bars=[['단어',achW,'#6366f1']];if(achRd!=null)bars.push(['리딩',Math.round(achRd),'#8b5cf6']);
    const bW=36,gap=20,tw=bars.length*(bW+gap)+gap;
    const svgBars=bars.map(([l,p,c],i)=>{const h=Math.round(p*0.55);const x=i*(bW+gap)+gap;return`<rect x="${x}" y="${55-h}" width="${bW}" height="${h}" rx="4" fill="${c}" opacity=".85"/><text x="${x+bW/2}" y="62" text-anchor="middle" font-size="9" fill="#555">${l}</text><text x="${x+bW/2}" y="${55-h-3}" text-anchor="middle" font-size="10" font-weight="bold" fill="${c}">${p}%</text>`;}).join('');
    return`<svg width="${tw}" height="66" style="display:block;margin:0 auto">${svgBars}<line x1="0" y1="55" x2="${tw}" y2="55" stroke="#e2e8f0" stroke-width="1"/></svg>`;
  }

  function _setChartStyle(n) {
    _st.chartStyle = n;
    _renderStudents();
    _updateChart();
  }

  /* ★ 컬럼 드래그 리사이즈 */
  function _bindColResize() {
    const tbl=document.querySelector('.gr-sheet');if(!tbl)return;
    tbl.querySelectorAll('thead .gs-th.sec-w,thead .gs-th.sec-r,thead .gs-cm-cell').forEach(th=>{
      if(th.querySelector('.gs-col-resizer'))return;
      const h=document.createElement('div');
      h.className='gs-col-resizer';
      th.appendChild(h);
      let sx=0,sw=0;
      h.addEventListener('mousedown',e=>{
        e.preventDefault();e.stopPropagation();
        sx=e.clientX;sw=th.offsetWidth;h.classList.add('dragging');
        const mv=ev=>{const w=Math.max(60,sw+ev.clientX-sx);th.style.width=w+'px';th.style.minWidth=w+'px';};
        const up=()=>{h.classList.remove('dragging');document.removeEventListener('mousemove',mv);document.removeEventListener('mouseup',up);};
        document.addEventListener('mousemove',mv);
        document.addEventListener('mouseup',up);
      });
    });
  }

  function _setGraphAlign(align) {
    _st.graphAlign = align;
    const jc = align==='left'?'flex-start': align==='right'?'flex-end':'center';
    const preview = document.getElementById('gr-rpt-preview');
    if (preview) {
      preview.querySelectorAll('.rpt-graph-wrap').forEach(el => {
        el.style.display='flex'; el.style.justifyContent=jc;
      });
    }
    document.querySelectorAll('[onclick*="_setGraphAlign"]').forEach(b => {
      const map={'좌':'left','중앙':'center','우':'right'};
      const active=map[b.textContent.trim()]===align;
      b.style.borderColor=active?'var(--a)':'var(--bdr2)';
      b.style.background=active?'var(--a10)':'var(--surf2)';
      b.style.color=active?'var(--a)':'var(--tx3)';
    });
  }
  function _setTableRound(on) {
    _st.tableRound = on;
    const preview = document.getElementById('gr-rpt-preview');
    if (!preview) return;
    preview.querySelectorAll('.rpt-tbl').forEach(tbl => {
      if (on) {
        // 라운드 적용: border-collapse를 separate로 바꿔야 radius 적용됨
        tbl.style.borderCollapse = 'separate';
        tbl.style.borderSpacing  = '0';
        tbl.style.borderRadius   = '10px';
        tbl.style.overflow       = 'hidden';
        // 바깥 border 추가 (border-separate라서 필요)
        tbl.style.border = `${_st.dividerWidth||1}px solid ${_st.dividerColor||'#e2e8f0'}`;
        // 내부 셀 border 유지
        tbl.querySelectorAll('td, th').forEach(el => {
          el.style.borderColor = _st.dividerColor||'#e2e8f0';
          el.style.borderWidth = (_st.dividerWidth||1)+'px';
        });
      } else {
        tbl.style.borderCollapse = 'collapse';
        tbl.style.borderRadius   = '0';
        tbl.style.overflow       = '';
        tbl.style.border         = '';
        tbl.querySelectorAll('td, th').forEach(el => {
          el.style.borderColor = _st.dividerColor||'#e2e8f0';
          el.style.borderWidth = (_st.dividerWidth||1)+'px';
        });
      }
    });
    // ★ 라운드 ON일 때 divider 설정도 함께 적용
    if(on) _setDivider('color', _st.dividerColor||'#e2e8f0');
  }

  function _setDivider(type, val) {
    if (type==='color') {
      _st.dividerColor=val;
      document.querySelectorAll('#gr-rpt-preview .rpt-tbl td,#gr-rpt-preview .rpt-tbl th,#gr-rpt-preview .rpt-comment-box').forEach(el=>{el.style.borderColor=val;});
    } else {
      _st.dividerWidth=Number(val);
      const lbl=document.getElementById('gr-div-width-lbl');if(lbl)lbl.textContent=val+'px';
      document.querySelectorAll('#gr-rpt-preview .rpt-tbl td,#gr-rpt-preview .rpt-tbl th,#gr-rpt-preview .rpt-comment-box').forEach(el=>{el.style.borderWidth=val+'px';});
      if(_st.tableRound) document.querySelectorAll('#gr-rpt-preview .rpt-tbl').forEach(t=>{t.style.border=`${val}px solid ${_st.dividerColor||'#e2e8f0'}`;});
    }
  }
  const RPT_FONTS=[
    {label:'Noto Sans KR',value:'Noto Sans KR'},
    {label:'Malgun Gothic',value:'Malgun Gothic,맑은 고딕'},
    {label:'Apple SD Gothic',value:'Apple SD Gothic Neo'},
    {label:'Dotum',value:'Dotum,돋움'},
    {label:'Gulim',value:'Gulim,굴림'},
    {label:'Georgia',value:'Georgia,serif'},
    {label:'Arial',value:'Arial,sans-serif'},
  ];

  function _toggleCfgPanel(){
    const panel=document.getElementById('gr-rpt-cfg-panel');
    const btn=document.getElementById('gr-cfg-toggle');
    if(!panel) return;
    const isOpen = panel.style.display!=='none';
    // ★ 애니메이션으로 접기/펼치기
    if(isOpen){
      panel.style.maxHeight=panel.scrollHeight+'px';
      panel.style.overflow='hidden';
      panel.style.transition='max-height .25s ease, opacity .2s';
      panel.style.opacity='1';
      requestAnimationFrame(()=>{
        panel.style.maxHeight='0';
        panel.style.opacity='0';
        setTimeout(()=>{panel.style.display='none';panel.style.maxHeight='';panel.style.overflow='';},260);
      });
    } else {
      panel.style.display='block';
      panel.style.maxHeight='0';
      panel.style.overflow='hidden';
      panel.style.opacity='0';
      panel.style.transition='max-height .3s ease, opacity .25s';
      requestAnimationFrame(()=>{
        panel.style.maxHeight=panel.scrollHeight+200+'px';
        panel.style.opacity='1';
        setTimeout(()=>{panel.style.maxHeight='';panel.style.overflow='';},310);
      });
    }
    if(btn) btn.textContent = isOpen?'⚙️ 설정 펼치기':'⚙️ 설정 닫기';
    const fabLbl=document.getElementById('gr-cfg-fab-lbl');
    if(fabLbl) fabLbl.textContent = isOpen?'설정':'닫기';
  }

  function _setRptBg(color){
    _st.rptBg=color;
    const preview=document.getElementById('gr-rpt-preview');
    if(preview) preview.style.background=color;
    // 다크 배경이면 텍스트 색상 반전
    const isDark=color==='#1a1a2e';
    if(preview) preview.style.color=isDark?'#e2e8f0':'';
    // 버튼 상태 업데이트 (재렌더 없이)
    document.querySelectorAll('[onclick*="_setRptBg"]').forEach(b=>{
      const c=b.getAttribute('onclick').match(/'([^']+)'/)?.[1];
      b.style.borderColor=c===color?'var(--a)':'#e5e7eb';
      b.style.boxShadow=c===color?'0 0 0 2px var(--a)':'none';
    });
  }

  function _setFontFamily(val){
    _st.fontFamily=val;
    // 리포트 프리뷰에 즉시 적용
    const preview=document.getElementById('gr-rpt-preview');
    if(preview){
      preview.style.fontFamily=val+',sans-serif';
      preview.querySelectorAll('*').forEach(el=>{el.style.fontFamily='';});
      preview.style.fontFamily=val+',sans-serif';
    }
    // 버튼 active 상태
    document.querySelectorAll('[data-font]').forEach(b=>{
      b.style.background=b.dataset.font===val?'var(--a20)':'var(--surf2)';
      b.style.borderColor=b.dataset.font===val?'var(--a)':'var(--bdr2)';
      b.style.color=b.dataset.font===val?'var(--a)':'var(--tx3)';
    });
  }

  function _setLogoSize(val){
    _st.logoSize=Number(val);
    // 레이블 업데이트
    const lbl=document.getElementById('gr-rpt-logo-sz');
    if(lbl) lbl.textContent=val+'px';
    // ★ id로 먼저 찾고, 없으면 rpt-header 안의 img 전체 대상
    const img=document.getElementById('gr-rpt-logo-img');
    if(img){
      img.style.width=val+'px';
    } else {
      // id가 없는 경우 rpt-header 내 첫 번째 img
      const preview=document.getElementById('gr-rpt-preview');
      if(preview){
        const imgs=preview.querySelectorAll('.rpt-header img, .rpt-header > div img');
        imgs.forEach(i=>{ i.style.width=val+'px'; });
      }
    }
  }

  
  function _setPageSize(size){
    _st.pageSize=size;
    const pxW={A4:794,A5:559,B5:665};
    const w=(pxW[size]||794)+'px';
    // ★ rpt-wrap(흰색 카드) 너비도 함께 조정
    const wrap=document.getElementById('gr-rpt-preview');
    if(wrap){wrap.style.width=w;wrap.style.maxWidth=w;}
    // rpt-preview 컨테이너도 맞춤
    const outer=wrap?.closest?.('.gr-rpt-preview');
    if(outer){outer.style.maxWidth=w;}
    document.querySelectorAll('[onclick*="_setPageSize"]').forEach(b=>{
      const s=b.textContent.trim();
      const active=s===size;
      b.style.borderColor=active?'var(--a)':'var(--bdr2)';
      b.style.background=active?'var(--a20)':'var(--surf2)';
      b.style.color=active?'var(--a)':'var(--tx3)';
    });
  }
  function _setRptFontSize(type,val){
    val=Number(val);
    if(type==='title'){_st.reportTitleSize=val;const lbl=document.getElementById('gr-rpt-title-sz');if(lbl)lbl.textContent=val+'px';const wrap=document.getElementById('gr-rpt-preview');if(wrap)wrap.querySelectorAll('.rpt-title').forEach(el=>{el.style.fontSize=val+'px';});}
    else{_st.reportBodySize=val;const lbl=document.getElementById('gr-rpt-body-sz');if(lbl)lbl.textContent=val+'px';const wrap=document.getElementById('gr-rpt-preview');if(wrap){wrap.querySelectorAll('p,.rpt-info p,.rpt-tbl td,.rpt-tbl th,.rpt-comment-box').forEach(el=>{el.style.fontSize=val+'px';});wrap.style.fontSize=val+'px';}}
  }
  function _setHdrFontSize(val){
    _st.hdrFontSize = Number(val);
    const lbl = document.getElementById('gr-hdr-sz-lbl');
    if(lbl) lbl.textContent = val+'px';
    // 모든 헤더 th에 적용
    document.querySelectorAll('.gs-th').forEach(th => { th.style.fontSize = val+'px'; });
  }

  function _setLayout(n){_st.reportLayout=n;const s=_getStudents().find(s=>s.id===_st.studentId)||_getStudents()[0];if(s){const el=document.getElementById('gr-rpt-preview');if(el)el.innerHTML=_buildReport(s);}document.querySelectorAll('.gr-rpt-lbtn').forEach((b,i)=>b.classList.toggle('on',i+1===n));}
  function _toggleGraph(v){_st.reportGraph=v;_setLayout(_st.reportLayout);}
  async function _copyReport(){const el=document.getElementById('gr-rpt-preview');try{await navigator.clipboard.writeText(el?.innerText||'');_toast('📋 복사됐습니다','success');}catch{_toast('⚠️ 복사 실패');}}
  async function _shareReport(){
    const el=document.getElementById('gr-rpt-preview');if(!el)return;
    const s=_getStudents().find(st=>st.id===_st.studentId)||_getStudents()[0];
    const name=s?s.name:'';
    const pw={A4:'210mm',A5:'148mm',B5:'176mm'}[_st.pageSize]||'210mm';
    const styles=[...document.styleSheets].map(ss=>{try{return[...ss.cssRules].map(r=>r.cssText).join('\n');}catch{return '';}}).join('\n');
    const css=`@charset "UTF-8";
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700;800&display=swap');
body{margin:0;padding:20px;background:#f8fafc;font-family:'${_st.fontFamily||"Noto Sans KR"}',sans-serif;display:flex;justify-content:center;}
${styles}
.gr-rpt-fixed-btns,.gr-rpt-cfg,.rpt-acts{display:none!important}
.rpt-wrap{max-width:${pw};width:100%;margin:0 auto;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,.1);}
img{max-width:100%}`;
    const title=`${name} 학생 성적 리포트`;
    const html=['<!DOCTYPE html><html lang="ko"><head>',
      '<meta charset="UTF-8">',
      '<meta name="viewport" content="width=device-width,initial-scale=1">',
      `<meta property="og:title" content="${title}">`,
      `<meta property="og:description" content="해피트리 영어학원 Achievement Report">`,
      `<title>${title}</title>`,
      `<style>${css}</style>`,
      '</head><body>',
      el.outerHTML,
      '</body></html>'].join('');
    try{
      // Blob URL 생성 후 Web Share API
      const blob=new Blob([html],{type:'text/html'});
      const url=URL.createObjectURL(blob);
      if(navigator.share){
        await navigator.share({title,url});
        _toast('📤 공유 완료','success');
        setTimeout(()=>URL.revokeObjectURL(url),30000);
      } else {
        // 새 창에서 리포트 열기
        const win=window.open('','_blank','width=900,height=700');
        if(win){win.document.open();win.document.write(html);win.document.close();_toast('📤 새 창에서 리포트를 확인하세요','success');}
        else _toast('⚠️ 팝업을 허용해주세요','error');
        URL.revokeObjectURL(url);
      }
    }catch(e){if(e.name!=='AbortError')_toast('⚠️ 공유 실패: '+e.message,'error');}
  }

  
  function _printReport(){
    const el=document.getElementById('gr-rpt-preview');if(!el)return;

    // ★ 방법: html2canvas로 현재 화면 이미지 캡처 후 인쇄창에 이미지로 출력
    // html2canvas 없으면 @media print 방식으로 폴백
    if(typeof html2canvas!=='undefined'){
      _toast('🖨️ 캡처 중...','info',2000);
      html2canvas(el,{
        scale:2, backgroundColor:'#fff', useCORS:true, logging:false,
        onclone:(doc)=>{
          // 인쇄 불필요한 요소 숨김
          doc.querySelectorAll('.gr-rpt-fixed-btns,.gr-rpt-cfg').forEach(e=>e.style.display='none');
        }
      }).then(canvas=>{
        const imgUrl=canvas.toDataURL('image/png');
        const pw={A4:'210mm',A5:'148mm',B5:'176mm'}[_st.pageSize]||'210mm';
        const ph={A4:'297mm',A5:'210mm',B5:'250mm'}[_st.pageSize]||'297mm';
        const html='<!DOCTYPE html><html><head>'+
          '<style>@page{size:'+pw+' '+ph+';margin:0}body{margin:0;padding:0}'+
          'img{width:100%;height:auto;display:block}</style></head>'+
          '<body><img src="'+imgUrl+'"></body></html>';
        const w=window.open('','_blank','width=900,height=700');
        if(!w){_toast('⚠️ 팝업 허용 필요','error');return;}
        w.document.open();w.document.write(html);w.document.close();
        w.onload=function(){setTimeout(()=>{w.print();},300);};
      }).catch(e=>{_toast('⚠️ 캡처 실패: '+e.message,'error');});
      return;
    }

    // 폴백: @media print visibility 방식
    const pw={A4:'210mm',A5:'148mm',B5:'176mm'}[_st.pageSize]||'210mm';
    const ph={A4:'297mm',A5:'210mm',B5:'250mm'}[_st.pageSize]||'297mm';
    let ps=document.getElementById('gr-ps');if(ps)ps.remove();
    ps=document.createElement('style');ps.id='gr-ps';
    ps.textContent='@page{size:'+pw+' '+ph+';margin:8mm}@media print{body *{visibility:hidden}#gr-rpt-preview,#gr-rpt-preview *{visibility:visible}#gr-rpt-preview{position:fixed;top:0;left:0;width:100%!important;box-shadow:none!important;border:none!important}.gr-rpt-fixed-btns,.gr-rpt-cfg{display:none!important;visibility:hidden!important}.rpt-wrap{width:100%!important;padding:0!important;box-shadow:none!important}}';
    document.head.appendChild(ps);
    window.print();
    setTimeout(()=>ps.remove(),1000);
  }

  async function _captureReport(){const el=document.getElementById('gr-rpt-preview');if(!el)return;if(typeof html2canvas!=='undefined'){const c=await html2canvas(el,{scale:2,backgroundColor:'#fff'});const a=document.createElement('a');a.href=c.toDataURL('image/png');a.download='report.png';a.click();_toast('📸 캡처 완료','success');}else _toast('⚠️ html2canvas 라이브러리가 필요합니다');}

  /* ════════════════════════════════════
   * 저장
   * ════════════════════════════════════ */
  async function saveOne(sid) {
    if (!_st.classId || !_st.bookId) { _toast('⚠️ 반과 교재를 선택해주세요'); return; }
    _ensureData(sid);

    /* 엑셀 모드: DOM 최신값 수집 */
    if (_st.viewMode === 'excel') {
      const cfg = GradeDB.getReportConfig(_st.bookId);
      const tq  = cfg.word?.totalQ || 0;
      const retEl = document.getElementById(`gr-retake-${sid}`);
      if (retEl) {
        const rt = retEl.value === '' ? 0 : Number(retEl.value);
        _st.data[sid].word = { totalQ:tq, retake:rt, pass:Math.max(0,tq-rt) };
      }
      const cmtEl = document.getElementById(`gr-cmt-${sid}`);
      if (cmtEl) _st.data[sid].comment = cmtEl.value;
      /* 리딩 */
      const actRevs = GradeDB.getActiveReviews(_st.bookId);
      const totalRQ = cfg.reading?.totalQ || 0;
      actRevs.forEach((_, i) => {
        const key = `R${i}`;
        const inp = document.querySelector(`[data-sid="${sid}"][data-rkey="${key}"]`);
        if (inp) {
          const corr  = inp.value === '' ? '' : Math.max(0, Math.min(totalRQ, Number(inp.value)));
          const score = corr !== '' ? Math.round(corr / totalRQ * 100 * 10) / 10 : '';
          if (!_st.data[sid].reading) _st.data[sid].reading = {};
          _st.data[sid].reading[key] = { correct:corr, score };
        }
      });
    }

    const now     = new Date();
    const savedAt = `${now.toISOString().slice(0,10)} ${now.toTimeString().slice(0,5)}`;
    _st.data[sid].savedAt = savedAt;

    await GradeDB.saveRecord({
      classId:   _st.classId,
      studentId: sid,
      bookId:    _st.bookId,
      word:      _st.data[sid].word    || null,
      reading:   _st.data[sid].reading || null,
      comment:   _st.data[sid].comment || '',
      savedAt,
    });

    _st.dirty.delete(sid);
    _refreshDirtyUI();
    /* savedAt 표시 갱신 */
    const fixCell = document.querySelector(`#gr-row-${sid} .gs-fix`);
    if (fixCell) {
      const savedEl = fixCell.querySelector('[data-savedat]') || (() => {
        const d = document.createElement('div');
        d.dataset.savedat = '1';
        d.style.cssText = 'font-size:8px;color:var(--tx3)';
        fixCell.appendChild(d); return d;
      })();
      savedEl.textContent = savedAt.slice(5,16);
    }
    _toast('✅ 저장 완료', 'success');
    _renderStudents();
  }

  // ★ 전체 성적 xlsx 내보내기 (모든 반/교재)
  async function _exportAllGrades() {
    if (typeof window.XLSX === 'undefined') { _toast('⚠️ XLSX 라이브러리 필요'); return; }
    _toast('⏳ 내보내는 중...', 'info', 2000);
    const wb = window.XLSX.utils.book_new();
    const classes = typeof DB !== 'undefined' ? DB.getActiveClasses() : [];
    const books = typeof BookLibDB !== 'undefined' ? BookLibDB.getAllBooks() : [];
    let sheetCount = 0;

    for (const cls of classes) {
      const clsStudents = typeof StudentDB !== 'undefined'
        ? StudentDB.getFiltered({ classCode: cls.name, status: '재원' }) : [];
      if (!clsStudents.length) continue;

      for (const book of books.filter(b => !b.archived)) {
        const config = GradeDB.getReportConfig(book.id);
        const revs   = GradeDB.getActiveReviews(book.id);
        const hasWord = config?.word?.totalQ > 0;
        const hasRd   = config?.reading?.enabled && revs.length > 0;
        if (!hasWord && !hasRd) continue;

        // ★ 헤더: 사용자 입력 컬럼만 (연산 결과 제외)
        const hdr = ['반', '이름', '교재'];
        if (hasWord) {
          hdr.push('단어_총문제수');  // 설정값 (참고용, 변경 가능)
          hdr.push('단어_재시험수');  // ← 입력값
        }
        if (hasRd) {
          hdr.push('리딩_총문제수');  // 설정값 (참고용, 변경 가능)
          revs.forEach(rv => hdr.push(`리딩_${rv.name}`)); // ← 각 Review 정답수 입력값
        }
        hdr.push('Teacher_Comment'); // ← 입력값

        const rows = [hdr];

        for (const stu of clsStudents) {
          const rec = GradeDB.getLatest(cls.id || cls.name, stu.id, book.id) || {};
          const w   = rec.word     || {};
          const rd  = rec.reading  || {};

          const row = [cls.name, stu.name, book.name];
          if (hasWord) {
            row.push(config.word.totalQ || ''); // 단어_총문제수
            row.push(w.retry != null ? w.retry : '');  // 단어_재시험수 (입력값)
          }
          if (hasRd) {
            row.push(config.reading.totalQ || ''); // 리딩_총문제수
            revs.forEach(rv => {
              const score = rd.reviews?.[rv.id];
              row.push(score != null ? score : ''); // 각 Review 정답수 (입력값)
            });
          }
          row.push(rec.comment || '');
          rows.push(row);
        }

        // 시트명: 반_교재 (31자 제한, 특수문자 제거)
        const sheetName = (cls.name + '_' + book.name)
          .slice(0, 31).replace(/[:\/\?\*\[\]]/g, '_');
        const ws = window.XLSX.utils.aoa_to_sheet(rows);
        // 헤더 스타일: 굵게 (xlsx는 기본 스타일 미지원 → 컬럼 너비만 조정)
        ws['!cols'] = hdr.map((_,i) => ({ wch: i < 3 ? 12 : 14 }));
        window.XLSX.utils.book_append_sheet(wb, ws, sheetName);
        sheetCount++;
      }
    }

    if (!sheetCount) { _toast('⚠️ 내보낼 데이터가 없습니다', 'error'); return; }
    const today = new Date().toISOString().slice(0, 10);
    window.XLSX.writeFile(wb, `성적_입력값_${today}.xlsx`);
    _toast(`✅ ${sheetCount}개 시트 내보내기 완료`, 'success');
  }

  // ★ 전체 성적 xlsx 불러오기
  async function _importAllGrades(file) {
    if (!file || typeof window.XLSX === 'undefined') { _toast('⚠️ 파일 오류'); return; }
    _toast('⏳ 불러오는 중...', 'info', 2000);
    const buf = await file.arrayBuffer();
    const wb  = window.XLSX.read(buf, { type: 'array' });
    const classes = typeof DB !== 'undefined' ? DB.getActiveClasses() : [];
    const books   = typeof BookLibDB !== 'undefined' ? BookLibDB.getAllBooks() : [];
    let updated = 0, skipped = 0;

    for (const sheetName of wb.SheetNames) {
      const ws   = wb.Sheets[sheetName];
      const rows = window.XLSX.utils.sheet_to_json(ws, { header: 1 });
      if (rows.length < 2) continue;

      const hdr     = rows[0].map(h => String(h||'').trim());
      const clsIdx  = hdr.indexOf('반');
      const nameIdx = hdr.indexOf('이름');
      if (clsIdx < 0 || nameIdx < 0) continue;

      // 시트명에서 반/교재 매핑
      const cls  = classes.find(c => sheetName.startsWith(c.name + '_'));
      const book = books.find(b => {
        const expected = (cls?.name + '_' + b.name).slice(0, 31).replace(/[:\/\?\*\[\]]/g, '_');
        return expected === sheetName || sheetName.endsWith('_' + b.name.slice(0, 20));
      });
      if (!cls || !book) { skipped++; continue; }

      const config  = GradeDB.getReportConfig(book.id);
      const revs    = GradeDB.getActiveReviews(book.id);
      const students = typeof StudentDB !== 'undefined'
        ? StudentDB.getFiltered({ classCode: cls.name, status: '재원' }) : [];

      // ★ 컬럼 인덱스 매핑 (새 형식)
      const wTotalIdx = hdr.indexOf('단어_총문제수');
      const wRetryIdx = hdr.indexOf('단어_재시험수');
      const rdTotalIdx = hdr.indexOf('리딩_총문제수');
      const cmtIdx    = hdr.indexOf('Teacher_Comment');
      // 각 Review 컬럼 인덱스
      const revIdxMap = {};
      revs.forEach(rv => {
        const i = hdr.indexOf(`리딩_${rv.name}`);
        if (i >= 0) revIdxMap[rv.id] = i;
      });

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || !row[nameIdx]) continue;
        const stuName = String(row[nameIdx]).trim();
        if (!stuName) continue;

        const stu = students.find(s =>
          s.name === stuName ||
          s.name.endsWith(stuName) ||
          stuName.endsWith(s.name.slice(1)) // givenName 매칭
        );
        if (!stu) continue;

        // 기존 레코드 로드 (없으면 새로 생성)
        const existing = GradeDB.getLatest(cls.id || cls.name, stu.id, book.id) || {};
        const rec = {
          word:    { ...existing.word    || {} },
          reading: { ...(existing.reading || {}), reviews: { ...(existing.reading?.reviews || {}) } },
          comment: existing.comment || ''
        };

        // ★ 단어: totalQ는 설정 기준 유지, retry만 읽어서 pass 자동 계산
        if (wRetryIdx >= 0 && row[wRetryIdx] !== '' && row[wRetryIdx] != null) {
          const cfgTotalQ = config?.word?.totalQ || (wTotalIdx >= 0 ? Number(row[wTotalIdx]) : 0);
          const retry     = Number(row[wRetryIdx]) || 0;
          rec.word.totalQ = cfgTotalQ;
          rec.word.retry  = retry;
          rec.word.pass   = Math.max(0, cfgTotalQ - retry); // ★ pass 자동 계산
        }

        // ★ 리딩: 각 Review 정답수 읽어서 저장 (점수/성취율은 표시 시 자동 계산)
        let hasRdData = false;
        revs.forEach(rv => {
          const ri = revIdxMap[rv.id];
          if (ri >= 0 && row[ri] !== '' && row[ri] != null) {
            rec.reading.reviews[rv.id] = Number(row[ri]) || 0;
            hasRdData = true;
          }
        });
        if (rdTotalIdx >= 0 && row[rdTotalIdx] != null) {
          rec.reading.totalQ = Number(row[rdTotalIdx]) || config?.reading?.totalQ || 0;
        }

        // Teacher's Comment
        if (cmtIdx >= 0 && row[cmtIdx] != null && String(row[cmtIdx]).trim()) {
          rec.comment = String(row[cmtIdx]).trim();
        }

        await GradeDB.saveRecord(cls.id || cls.name, stu.id, book.id, rec);
        updated++;
      }
    }

    const msg = skipped > 0
      ? `✅ ${updated}명 불러오기 완료 (${skipped}개 시트 매핑 실패)`
      : `✅ ${updated}명 데이터 불러오기 완료`;
    _toast(msg, 'success');
    _renderContent();
    _updateChart();
  }

  async function saveAll() {
    const sids = _getSorted().map(s => s.id);
    if (!sids.length) return;
    let ok = 0;
    for (const sid of sids) {
      _ensureData(sid);
      try { await saveOne(sid); ok++; } catch(e) { console.error('[saveAll]', sid, e); }
    }
    _toast(`✅ ${ok}명 저장 완료`, 'success');
    _renderContent();
  }

  async function resetOne(sid) {
    if (!confirm('이 학생의 입력 데이터를 초기화하시겠습니까?')) return;
    const records = GradeDB.getRecords(_st.classId, sid, _st.bookId);
    for (const r of records) await GradeDB.deleteRecord(_st.classId, sid, _st.bookId, r.id);
    delete _st.data[sid]; _st.dirty.delete(sid);
    _refreshDirtyUI(); _renderContent(); _renderStudents();
    _toast('🗑 초기화 완료');
  }

  /* ══ 선택 핸들러 ══ */
  async function _onCls(clsId) {
    if (_st.dirty.size > 0) {
      const save = confirm('변경되거나 입력된 값이 있습니다.\n저장하시겠습니까?\n\n[확인] 저장  [취소] 저장 안 함');
      if (save) await saveAll();
      else { _st.data={}; _st.dirty.clear(); }
    }
    _st.classId=clsId||null; _st.bookId=null; _st.studentId=null; _st.data={}; _st.dirty.clear(); _st.sortCol=null;
    _fillBooks(); _renderStudents(); _renderContent(); _updateRptBtn(); _updateSub();
    const bsel=document.getElementById('gr-bsel'); if(bsel)bsel.disabled=!_st.classId;
  }
  async function _onBk(bkId) {
    if (_st.dirty.size > 0) {
      const save = confirm('변경되거나 입력된 값이 있습니다.\n저장하시겠습니까?\n\n[확인] 저장  [취소] 저장 안 함');
      if (save) await saveAll();
      else { _st.data={}; _st.dirty.clear(); }
    }
    _st.bookId=bkId||null; _st.studentId=null; _st.data={}; _st.dirty.clear(); _st.sortCol=null;
    _renderStudents(); _renderContent(); _updateRptBtn(); _updateSub();
    if (_st.bookId) {
      GradeDB.init(_st.classId, _st.bookId);
      // ★ 교재 선택 완료 후 즉각 그래프 표시
      requestAnimationFrame(() => _updateChart());
    }
  }
  function _onStu(sid, idx) {
    _st.studentId=sid||null; _st.slideIdx=idx??0;
    _renderStudents();
    if (_st.viewMode==='excel') {
      document.querySelectorAll('.gr-sheet tbody tr').forEach(tr=>tr.classList.toggle('sel-row',tr.id===`gr-row-${sid}`));
      document.querySelectorAll('.gs-fix').forEach(td=>{const m=td.getAttribute('onclick')?.match(/'([^']+)'/);td.classList.toggle('sel',m?.[1]===sid);});
      document.getElementById(`gr-row-${sid}`)?.scrollIntoView({behavior:'smooth',block:'nearest'});
      _updateChart();
    } else if (_st.viewMode==='card') {
      _renderContent();
      // ★ 카드모드도 선택 학생 그래프 하이라이트
      _updateChart();
    } else if (_st.viewMode==='report') {
      const el=document.getElementById('gr-rpt-preview');
      if(el&&sid){const s=_getStudents().find(s=>s.id===sid);if(s)el.innerHTML=_buildReport(s);}
    }
  }
  async function _setView(mode) {
    if (_st.dirty.size > 0 && mode !== _st.viewMode) {
      const save = confirm('변경되거나 입력된 값이 있습니다.\n저장하시겠습니까?\n\n[확인] 저장 후 전환   [취소] 저장 없이 전환');
      if (save) await saveAll();
      else { _st.data={}; _st.dirty.clear(); }
    }
    _st.viewMode = mode;
    // ★ 리포트 탭 고정 버튼 표시/숨김
    const fixedBtns = document.getElementById('gr-rpt-fixed-btns');
    if (fixedBtns) fixedBtns.style.display = mode==='report' ? 'flex' : 'none';
    document.querySelectorAll('.gr-vbtn').forEach(b=>b.classList.toggle('on',b.dataset.mode===mode));
    _renderStudents(); _renderContent();
  }
  function _updateRptBtn(){const btn=document.getElementById('gr-rpt-btn');if(btn)btn.style.display=(_st.classId&&_st.bookId)?'':'none';}
  function _updateSub(){const sub=document.getElementById('gr-sub');if(!sub)return;const cls=_st.classId?_getCls(_st.classId):null;const bk=_st.bookId&&typeof BookLibDB!=='undefined'?BookLibDB.getBookById(_st.bookId):null;sub.textContent=cls&&bk?`${cls.name}반 · ${bk.name}`:cls?`${cls.name}반`:'반 · 교재를 선택하세요';}
  function _refreshDirtyUI(){const el=document.getElementById('gr-dirty-cnt');if(el)el.textContent=_st.dirty.size?`(${_st.dirty.size})`:'';document.querySelectorAll('.gr-stu-item').forEach(item=>{const m=item.getAttribute('onclick')?.match(/'([^']+)'/);if(m)item.classList.toggle('dirty-item',_st.dirty.has(m[1]));});}

  /* ══ 전체 성적표 ══ */
  function openReport() {
    if(!_st.classId||!_st.bookId){_toast('⚠️ 반과 교재를 선택해주세요');return;}
    const ov=document.getElementById('gr-rpt-ov'),sh=document.getElementById('gr-rpt-sh');if(!ov||!sh)return;
    const cls=_getCls(_st.classId),book=typeof BookLibDB!=='undefined'?BookLibDB.getBookById(_st.bookId):null;
    const config=GradeDB.getReportConfig(_st.bookId),actRevs=GradeDB.getActiveReviews(_st.bookId);
    const hasRd=config.reading?.enabled&&actRevs.length>0;
    const sts=_getSorted(),today=new Date().toLocaleDateString('ko-KR');
    let txt=`📝 ${book?.name||''} 성적표\n🏫 ${cls?.name||''}반 · ${today}\n${'─'.repeat(26)}\n`;
    sts.forEach(s=>{const rec=GradeDB.getLatest(_st.classId,s.id,_st.bookId);if(!rec){txt+=`${s.name}: 미입력\n`;return;}const achW=rec.word?.totalQ>0?Math.round(rec.word.pass/rec.word.totalQ*100):null;const achRd=hasRd?_calcRdN(rec.reading||{},actRevs):null;txt+=`${s.name}${s.nickname?'('+s.nickname+')':''}: 단어 ${rec.word?.pass??'—'}/${rec.word?.totalQ??'—'}${achW!=null?'('+achW+'%)':''}`+(achRd!=null?` · 리딩 ${Math.round(achRd)}%`:'')+'\n';});
    const thRd=hasRd?actRevs.map(rv=>`<th style="border:1px solid var(--bdr);padding:6px">${_e(rv.name)}</th>`).join('')+'<th style="border:1px solid var(--bdr);padding:6px">성취율</th>':'';
    const tdRows=sts.map(s=>{const r=GradeDB.getLatest(_st.classId,s.id,_st.bookId);if(!r)return`<tr><td style="border:1px solid var(--bdr);padding:6px;font-weight:700">${_e(s.name)}</td><td colspan="99" style="border:1px solid var(--bdr);padding:6px;color:var(--tx3)">미입력</td></tr>`;const achW=r.word?.totalQ>0?Math.round(r.word.pass/r.word.totalQ*100):null;const isGW=achW!=null&&achW>=80;const achRd=hasRd?_calcRdN(r.reading||{},actRevs):null;const rdTds=hasRd?actRevs.map((_,i)=>{const sc=r.reading?.[`R${i}`]?.score??'—';return`<td style="border:1px solid var(--bdr);padding:6px;color:var(--a)">${sc}</td>`;}).join('')+`<td style="border:1px solid var(--bdr);padding:6px;color:#8b5cf6;font-weight:700">${achRd!=null?Math.round(achRd)+'%':'—'}</td>`:'';return`<tr><td style="border:1px solid var(--bdr);padding:6px;font-weight:700">${_e(s.name)}${s.nickname?` (${_e(s.nickname)})`:''}</td><td style="border:1px solid var(--bdr);padding:6px;color:${isGW?'#16a34a':'#f97316'};font-weight:700">${r.word?.pass??'—'}</td><td style="border:1px solid var(--bdr);padding:6px">${r.word?.retake??'—'}</td><td style="border:1px solid var(--bdr);padding:6px;color:${isGW?'#16a34a':'#f97316'};font-weight:800">${achW!=null?achW+'%':'—'}</td>${rdTds}<td style="border:1px solid var(--bdr);padding:6px;font-size:11px">${_e(r.comment||'')}</td></tr>`;}).join('');
    sh.innerHTML=`<div class="sh-handle"></div><div class="sh-title">📋 반 전체 성적표</div><div class="sh-sub">${_e(cls?.name||'')}반 · ${_e(book?.name||'')} · ${today}</div><div class="gr-rpt-sh-scroll"><div style="overflow-x:auto;padding:10px 2px"><table style="width:100%;border-collapse:collapse;font-size:12px;min-width:max-content"><thead><tr style="background:var(--surf2)"><th style="border:1px solid var(--bdr);padding:7px 10px;font-size:11px;color:var(--tx3)">학생</th><th style="border:1px solid var(--bdr);padding:7px 10px;font-size:11px;color:var(--tx3)">통과</th><th style="border:1px solid var(--bdr);padding:7px 10px;font-size:11px;color:var(--tx3)">재시험</th><th style="border:1px solid var(--bdr);padding:7px 10px;font-size:11px;color:var(--tx3)">성취율</th>${thRd}<th style="border:1px solid var(--bdr);padding:7px 10px;font-size:11px;color:var(--tx3)">코멘트</th></tr></thead><tbody>${tdRows}</tbody></table></div><div style="font-size:10px;font-weight:800;color:var(--tx3);letter-spacing:1px;margin:10px 14px 4px">공유용 텍스트</div><div class="gr-share-box" style="margin:0 14px 8px">${_e(txt)}</div></div><div class="gr-sacts" style="padding:0 0 8px"><button class="gr-sbtn copy" onclick="GradeApp._copy(${JSON.stringify(txt)})">📋 복사</button><button class="gr-sbtn share" onclick="GradeApp._shr(${JSON.stringify(txt)})">📤 공유</button></div><button class="btn-x" style="width:100%" onclick="GradeApp.closeReport()">닫기</button>`;
    ov.classList.remove('hidden');history.pushState({pg:'grade',modal:'report'},'');
  }
  async function _copy(t){try{await navigator.clipboard.writeText(t);_toast('📋 복사됐습니다','success');}catch{_toast('⚠️ 복사 실패');}}
  async function _shr(t){const sd={title:'성적표',text:t};if(navigator.share&&navigator.canShare?.(sd)){try{await navigator.share(sd);_toast('📤 공유 완료','success');return;}catch(e){if(e.name==='AbortError')return;}}_copy(t);}
  function closeReport(){document.getElementById('gr-rpt-ov')?.classList.add('hidden');}

  /* ══ 유틸 ══ */
  function _getStudents(){const cls=_st.classId?_getCls(_st.classId):null;if(!cls||typeof StudentDB==='undefined')return[];return StudentDB.getFiltered({classCode:cls.name,status:'재원'});}
  function _ensureData(sid){if(!_st.data[sid]){const cfg=GradeDB.getReportConfig(_st.bookId);const tq=cfg.word?.totalQ||0;const rec=GradeDB.getLatest(_st.classId,sid,_st.bookId);_st.data[sid]=rec?JSON.parse(JSON.stringify(rec)):{word:{totalQ:tq,retake:'',pass:''},reading:{},comment:''};_st.data[sid].comment=_st.data[sid].comment||'';}}
  function _givN(n){return n?.length>1?n.slice(1):n||'';}
  function _getCls(id){if(typeof DB==='undefined')return null;if(typeof DB.getClassById==='function')return DB.getClassById(id);return(DB.getActiveClasses?.()||[]).find(c=>c.id===id)||null;}
  function _calcRdN(rd,revs){if(!revs?.length)return null;const sc=revs.map((_,i)=>rd[`R${i}`]?.score).filter(s=>s!=null&&s!=='');if(!sc.length)return null;return Math.round(sc.reduce((a,b)=>a+b,0)/sc.length);}
  function _calcRdStr(rd,revs){const n=_calcRdN(rd,revs);return n!=null?n+'%':null;}
  const _e=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  function _toast(msg,type){const el=document.getElementById('toast');if(!el)return;el.textContent=msg;el.className=type==='success'?'success':'';el.classList.remove('hidden');clearTimeout(el._t);el._t=setTimeout(()=>el.classList.add('hidden'),3000);}

  return {
    init, render,
    _onCls, _onBk, _onStu, _setView, _toggleSort,
    _excelWordInput, _excelRdInput, _excelComment, _onKey,
    _cardWordInput, _cardRdInput, _cardComment,
    _slideTo, _ts, _te,
    _onCtxTable, _closeCtxMenu,
    saveOne, saveAll, resetOne,
    _setLayout, _setHdrFontSize, _exportAllGrades, _importAllGrades, _toggleGraph, _setChartStyle, _setPageSize, _setRptFontSize, _setGraphAlign, _setDivider, _setLogoSize, _setTableRound, _bindColResize, _setFontFamily, _toggleCfgPanel, _setRptBg,
    _copyReport, _shareReport, _printReport, _captureReport,
    openReport, closeReport, _copy, _shr,
  };
})();
