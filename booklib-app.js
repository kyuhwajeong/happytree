/**
 * booklib-app.js — v3.2
 *
 * v3.2 변경사항
 * ─────────────
 * · 교재 편집 모달에 성적 리포트 설정 통합
 *   - 단어 총 테스트(문제) 수 입력
 *   - 리딩 체크 → 활성화 시 총 문제 수 + Review 컬럼 설정
 *   - Review: 기본 4개, 컬럼명 편집 가능, 개별 체크(성적표 표시 여부)
 *   - + 버튼으로 Review 추가 가능
 * · 나머지 기능 동일 (스탬프·체크·드래그·공유·출력)
 */
const BooklibApp = (() => {
  const LS_COL_PFX = 'hk10b_col_';
  const LS_CH_W    = 'hk10b_chw';
  const DEF_CH_W   = 220;
  const MIN_CH_W   = 70;
  const MAX_CH_W   = 420;
  const STU_W      = 72;
  const DOW_KO = ['일','월','화','수','목','금','토'];

  let _st = {
    subTab:'library', editBookId:null,
    matrixClassId:null, matrixBookId:null,
    stopMatrix:null, stopStamps:null,
    colOrder:[], chColWidth:parseInt(localStorage.getItem(LS_CH_W)||DEF_CH_W),
    chCollapsed:false, shareText:'', reportText:'',
    /* 편집 중 임시 리포트 설정 */
    editConfig: null,
  };
  let _checks={}, _stamps={};

  /* ══ CSS ══ */
  function _css() {
    if (document.getElementById('bl-styles')) return;
    const s = document.createElement('style');
    s.id = 'bl-styles';
    s.textContent = `
#page-booklib{display:none;flex-direction:column;height:100%;overflow:hidden;}
#page-booklib.on{display:flex;}
.bl-stabs{display:flex;background:var(--surf);border-bottom:1.5px solid var(--bdr);flex-shrink:0;overflow-x:auto;scrollbar-width:none;}
.bl-stabs::-webkit-scrollbar{display:none;}
.bl-stab{flex:1;min-width:80px;padding:11px 8px;text-align:center;font-size:13px;font-weight:700;color:var(--tx3);cursor:pointer;border-bottom:2.5px solid transparent;background:none;border-top:none;border-left:none;border-right:none;font-family:var(--font);transition:color .18s,border-color .18s;white-space:nowrap;}
.bl-stab.on{color:var(--a);border-bottom-color:var(--a);}
.bl-lib-scroll{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:0 14px 120px;position:relative;}
.bl-lbl{display:block;font-size:9px;font-weight:800;color:var(--tx3);letter-spacing:1.2px;text-transform:uppercase;padding:8px 2px 5px;}
.bl-add-row{display:flex;gap:8px;margin-bottom:8px;}
.bl-add-inp{flex:1;padding:10px 13px;border-radius:10px;background:var(--surf2);border:1.5px solid var(--bdr);font-size:14px;color:var(--tx);outline:none;font-family:var(--font);transition:border-color .2s;}
.bl-add-inp:focus{border-color:var(--a);background:var(--a10);}
.bl-add-inp::placeholder{color:var(--tx3);}
.bl-add-btn{padding:10px 18px;border-radius:10px;background:var(--a);color:#fff;font-weight:700;font-size:14px;border:none;cursor:pointer;flex-shrink:0;font-family:var(--font);box-shadow:0 3px 10px var(--a40);transition:all .15s;}
.bl-add-btn:active{transform:scale(.95);}
.bl-drop-zone{border:2px dashed var(--bdr2);border-radius:12px;padding:13px 16px;text-align:center;color:var(--tx3);font-size:12px;cursor:pointer;margin-bottom:12px;transition:all .18s;line-height:1.9;background:var(--surf2);}
.bl-drop-zone:hover,.bl-drop-zone.drag-over{border-color:var(--a);background:var(--a10);color:var(--a);}
.bl-empty{text-align:center;padding:56px 20px;color:var(--tx3);font-size:14px;line-height:2.2;}
.bl-book-card{background:var(--card);border:1px solid var(--bdr);border-radius:var(--r);overflow:hidden;box-shadow:var(--sh);margin-bottom:10px;cursor:pointer;transition:border-color .2s;animation:cardIn .22s ease both;}
.bl-book-card.has-ch{background:linear-gradient(135deg,var(--card) 80%,rgba(5,150,105,.06));}
.bl-book-card:not(.has-ch):not(.archived){background:linear-gradient(135deg,var(--card) 80%,rgba(59,130,246,.05));}
.bl-book-card.archived{background:var(--surf2);opacity:.75;}
.bl-book-card.multi-selecting{cursor:default;}
.bl-multi-ck{margin-right:2px;}
.bl-book-card:hover{border-color:var(--a40);}
.bl-move-btn{background:var(--surf2);border:1px solid var(--bdr2);border-radius:5px;width:22px;height:18px;font-size:9px;cursor:pointer;color:var(--tx3);line-height:1;padding:0;display:flex;align-items:center;justify-content:center;transition:all .12s;}
.bl-move-btn:hover{background:var(--a);color:#fff;border-color:var(--a);}
.bl-book-chdr{display:flex;align-items:center;gap:10px;padding:11px 13px;border-bottom:1px solid var(--bdr);background:var(--surf2);position:relative;}
.bl-book-ico{width:36px;height:36px;border-radius:9px;background:var(--a20);display:flex;align-items:center;justify-content:center;font-size:17px;flex-shrink:0;}
.bl-book-info{flex:1;min-width:0;}
.bl-book-title{font-size:15px;font-weight:800;color:var(--tx);}
.bl-book-meta{display:flex;gap:6px;flex-wrap:wrap;margin-top:4px;}
.bl-badge{display:inline-flex;align-items:center;gap:2px;background:var(--card2);border:1px solid var(--bdr);border-radius:6px;padding:2px 7px;font-size:10px;font-weight:700;color:var(--tx2);}
.bl-badge.hi{background:var(--a10);border-color:var(--a40);color:var(--a);}
.bl-book-acts{display:flex;gap:5px;align-items:center;flex-shrink:0;}
.bl-ch-preview{padding:8px 13px;display:flex;gap:6px;flex-wrap:wrap;}
.bl-ch-tag{background:var(--card2);border:1px solid var(--bdr);border-radius:5px;padding:2px 7px;color:var(--tx3);font-size:11px;}

/* ── 편집 모달 ── */
.bl-editor-body{flex:1;overflow-y:auto;padding-bottom:8px;}
.bl-sec-divider{height:1px;background:var(--bdr);margin:12px 0 4px;}
.bl-ch-ta{width:100%;box-sizing:border-box;padding:10px 12px;background:var(--surf2);border:1.5px solid var(--bdr);border-radius:10px;font-size:13px;color:var(--tx);font-family:var(--font);outline:none;min-height:88px;resize:vertical;line-height:1.8;margin-bottom:4px;transition:border-color .2s;}
.bl-ch-ta:focus{border-color:var(--a);}
.bl-ch-hint{font-size:11px;color:var(--tx3);margin-bottom:10px;line-height:1.8;}
.bl-paste-row{display:flex;gap:8px;margin-bottom:14px;}
.bl-paste-btn{flex:1;padding:9px 8px;border-radius:9px;font-size:12px;font-weight:700;cursor:pointer;font-family:var(--font);transition:all .15s;}
.bl-paste-btn.replace{background:var(--a10);border:1.5px solid var(--a40);color:var(--a);}
.bl-paste-btn.append{background:rgba(5,150,105,.1);border:1.5px solid rgba(5,150,105,.3);color:var(--green);}
.bl-paste-btn:active{transform:scale(.96);}
.bl-cls-chips{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 10px;}
.bl-cls-chip{padding:5px 13px;border-radius:20px;font-size:12px;font-weight:700;border:1.5px solid var(--bdr2);background:var(--card2);color:var(--tx2);cursor:pointer;transition:all .15s;font-family:var(--font);}
.bl-cls-chip.on{border-color:var(--a);background:var(--a20);color:var(--a);box-shadow:0 2px 8px var(--a20);}
.bl-ch-list-wrap{max-height:200px;overflow-y:auto;margin-bottom:8px;}
.bl-ch-item{display:flex;align-items:center;gap:8px;padding:7px 6px;border-radius:8px;transition:background .12s;}
.bl-ch-item:hover{background:var(--card2);}
.bl-ch-ns{font-size:10px;font-weight:800;color:var(--tx3);min-width:26px;text-align:right;flex-shrink:0;}
.bl-ch-ts-label{flex:1;font-size:13px;color:var(--tx);}
.bl-ch-del-btn{background:none;border:none;color:var(--tx3);cursor:pointer;padding:3px 7px;font-size:12px;border-radius:5px;flex-shrink:0;font-family:var(--font);transition:all .12s;}
.bl-ch-del-btn:hover{color:#ef4444;background:rgba(239,68,68,.15);}

/* ── 성적 설정 섹션 ── */
.bl-grade-sec{background:var(--surf2);border-radius:10px;padding:10px 12px;margin-bottom:8px;}
.bl-grade-row{display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--bdr);}
.bl-grade-row:last-child{border-bottom:none;}
.bl-grade-lbl{font-size:13px;font-weight:700;color:var(--tx2);flex:1;}
.bl-grade-inp{width:72px;padding:6px 10px;border-radius:9px;background:var(--surf);border:1.5px solid var(--bdr);font-size:14px;font-weight:700;color:var(--a);text-align:center;outline:none;font-family:var(--font);transition:border-color .2s;}
.bl-grade-inp:focus{border-color:var(--a);}
/* Review 행 */
.bl-rv-row{display:flex;align-items:center;gap:8px;padding:6px 4px;border-radius:8px;transition:background .1s;}
.bl-rv-row:hover{background:var(--card2);}
.bl-rv-check{width:16px;height:16px;cursor:pointer;flex-shrink:0;accent-color:var(--a);}
.bl-rv-name-inp{flex:1;padding:5px 8px;border-radius:7px;background:var(--surf);border:1.5px solid var(--bdr);font-size:12px;color:var(--tx);outline:none;font-family:var(--font);}
.bl-rv-name-inp:focus{border-color:var(--a);}
.bl-rv-del{background:none;border:none;color:var(--tx3);cursor:pointer;padding:4px 6px;font-size:12px;border-radius:5px;font-family:var(--font);}
.bl-rv-del:hover{color:#ef4444;}
.bl-rv-add-btn{display:flex;align-items:center;gap:5px;padding:6px 12px;border-radius:9px;background:var(--a10);border:1.5px dashed var(--a40);color:var(--a);font-size:12px;font-weight:700;cursor:pointer;font-family:var(--font);margin-top:6px;transition:all .15s;width:100%;justify-content:center;}
.bl-rv-add-btn:active{transform:scale(.97);}

/* 매트릭스 탭 */
.bl-msel-bar{padding:10px 14px 8px;flex-shrink:0;display:flex;gap:8px;background:var(--surf);border-bottom:1px solid var(--bdr);flex-wrap:wrap;}
.bl-msel-item{flex:1;min-width:130px;}
.bl-msel-lbl{display:block;font-size:9px;font-weight:800;color:var(--tx3);letter-spacing:1px;text-transform:uppercase;margin-bottom:4px;}
.bl-msel-item select{width:100%;padding:8px 10px;border-radius:10px;background:var(--surf2);border:1.5px solid var(--bdr);font-size:13px;color:var(--tx);outline:none;cursor:pointer;font-family:var(--font);-webkit-appearance:none;transition:border-color .2s;}
.bl-msel-item select:focus{border-color:var(--a);}
.bl-mstats{display:flex;gap:10px;padding:6px 12px;flex-shrink:0;border-bottom:1px solid var(--bdr);flex-wrap:wrap;align-items:center;background:var(--surf2);}
.bl-mstat{font-size:11px;color:var(--tx3);display:flex;align-items:center;gap:3px;}
.bl-mstat-v{font-weight:800;color:var(--tx2);}
.bl-pct-bar{flex:1;min-width:50px;height:5px;border-radius:3px;background:var(--bdr);overflow:hidden;}
.bl-pct-fill{height:100%;border-radius:3px;background:linear-gradient(90deg,var(--a),#10b981);transition:width .4s ease;}
.bl-wbtn{padding:3px 8px;border-radius:6px;font-size:11px;font-weight:700;background:var(--card);border:1px solid var(--bdr2);color:var(--tx2);cursor:pointer;font-family:var(--font);transition:all .12s;}
.bl-wbtn:active{background:var(--card2);}
.bl-report-btn{padding:5px 10px;border-radius:8px;font-size:11px;font-weight:700;background:var(--a10);border:1px solid var(--a40);color:var(--a);cursor:pointer;font-family:var(--font);white-space:nowrap;transition:all .15s;}
.bl-report-btn:active{transform:scale(.95);}
.bl-mwrap{flex:1;overflow:auto;-webkit-overflow-scrolling:touch;padding:0 0 120px;}
.bl-mwrap::-webkit-scrollbar{width:4px;height:4px;}
.bl-mwrap::-webkit-scrollbar-thumb{background:var(--bdr2);border-radius:2px;}
.bl-mtbl{border-collapse:collapse;font-size:12px;width:100%;--ch-w:30%;--stu-w:auto;}
.bl-ch-hdr{position:sticky;top:0;left:0;z-index:5;width:30%;min-width:140px;background:var(--surf);border:1px solid var(--bdr);padding:7px 8px;font-size:10px;font-weight:800;color:var(--tx3);min-width:var(--ch-w);width:var(--ch-w);max-width:var(--ch-w);white-space:nowrap;display:flex;align-items:center;justify-content:space-between;gap:6px;}
.bl-collapse-btn{width:22px;height:22px;border-radius:5px;background:var(--card2);border:1px solid var(--bdr2);color:var(--tx3);font-size:10px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-family:var(--font);transition:all .12s;}
.bl-shdr{position:sticky;top:0;z-index:7;background:var(--surf);border:1px solid var(--bdr);padding:7px 4px;text-align:center;min-width:var(--stu-w);width:var(--stu-w);cursor:pointer;transition:background .12s;user-select:none;-webkit-user-select:none;}
.bl-shdr:hover{background:var(--a10)!important;}
.bl-shdr.dragging{opacity:.4;background:var(--a10)!important;}
.bl-shdr.drag-over-left{border-left:2.5px solid var(--a)!important;}
.bl-shdr.drag-over-right{border-right:2.5px solid var(--a)!important;}
.bl-shdr-name{font-size:11px;font-weight:800;color:var(--tx);white-space:nowrap;}
.bl-shdr-cnt{font-size:10px;margin-top:2px;}
.bl-shdr-act{font-size:9px;margin-top:2px;color:var(--a);}
.bl-batch-row{background:var(--surf2);position:sticky;z-index:5;}
.bl-batch-hdr{position:sticky;left:0;background:var(--surf2);position:sticky;left:0;z-index:2;background:var(--surf2);border:1px solid var(--bdr);padding:5px 8px;font-size:9px;font-weight:800;color:var(--tx3);min-width:var(--ch-w);width:var(--ch-w);max-width:var(--ch-w);}
.bl-batch-ck{border:1px solid var(--bdr);text-align:center;cursor:pointer;transition:background .12s;width:var(--stu-w);}
.bl-batch-ck:hover{background:var(--a10);}
.bl-ch-cell{position:sticky;left:0;z-index:2;background:var(--surf);border:1px solid var(--bdr);min-width:var(--ch-w);width:var(--ch-w);max-width:var(--ch-w);padding:6px 8px;cursor:pointer;transition:background .15s;vertical-align:top;user-select:none;-webkit-user-select:none;}
.bl-ch-cell:hover{background:var(--card2);}
.bl-ch-cell.stamped{background:#fef3c7!important;border-left:3px solid #f59e0b!important;}
.dark .bl-ch-cell.stamped{background:#78350f28!important;border-left-color:#d97706!important;}
.bl-ch-inner{display:flex;flex-direction:column;gap:3px;}
.bl-ch-top{display:flex;align-items:flex-start;gap:4px;}
.bl-ch-n{font-size:10px;font-weight:800;color:var(--tx3);flex-shrink:0;padding-top:1px;min-width:18px;text-align:right;}
.bl-ch-t{font-size:11px;color:var(--tx2);line-height:1.55;word-break:break-all;overflow-wrap:anywhere;white-space:normal;}
.bl-ch-ts-row{display:flex;justify-content:flex-end;margin-top:4px;}
.bl-ch-ts{display:inline-flex;align-items:center;gap:3px;padding:2px 5px 2px 7px;border-radius:5px;background:rgba(245,158,11,.15);border:1px solid rgba(245,158,11,.3);font-size:9px;font-weight:700;color:#d97706;text-align:right;}
.dark .bl-ch-ts{background:rgba(245,158,11,.1);color:#fbbf24;}
.bl-ch-ts-t{font-variant-numeric:tabular-nums;letter-spacing:.2px;}
.bl-mtbl.ch-collapsed .bl-ch-cell,.bl-mtbl.ch-collapsed .bl-batch-hdr,.bl-mtbl.ch-collapsed .bl-ch-hdr{min-width:32px;width:32px;max-width:32px;padding:4px 2px;}
.bl-mtbl.ch-collapsed .bl-ch-t,.bl-mtbl.ch-collapsed .bl-ch-ts-row{display:none;}
.bl-cc{border:1px solid var(--bdr);vertical-align:top;cursor:pointer;transition:background .1s;-webkit-user-select:none;user-select:none;width:var(--stu-w);min-width:var(--stu-w);padding:0;}
.bl-cc:active{opacity:.6;}
.bl-chrow.in-eval .bl-cc:not(.undone){background:rgba(5,150,105,.07);}
.dark .bl-chrow.in-eval .bl-cc:not(.undone){background:rgba(5,150,105,.1);}
.bl-cc.undone{background:rgba(234,88,12,.07);}
.dark .bl-cc.undone{background:rgba(234,88,12,.1);}
.bl-cc-inner{display:flex;flex-direction:column;align-items:center;padding:5px 3px;min-height:32px;}
.bl-cm{font-size:14px;line-height:1;}
.bl-cc .bl-cm{color:transparent;}
.bl-cc.undone .bl-cm{color:#ea580c;font-weight:900;font-size:13px;}
.bl-chrow.from-xlsx-row .bl-ch-title{background:rgba(99,102,241,.07)!important;border-left:3px solid rgba(99,102,241,.4)!important;}
.bl-chrow.in-eval .bl-cc:not(.undone):hover .bl-cm{color:rgba(234,88,12,.25);}
.bl-sub-badges{display:flex;flex-wrap:wrap;gap:2px;justify-content:center;padding:2px 2px 3px;}
.bl-sub-badge{font-size:8px;font-weight:800;padding:1px 4px;border-radius:4px;background:rgba(234,88,12,.15);color:#ea580c;border:1px solid rgba(234,88,12,.25);}
.bl-chrow.after-stamp{opacity:.35;}
.bl-chrow.after-stamp .bl-cc{cursor:default;}
.bl-chrow.last-stamp .bl-ch-cell,.bl-chrow.last-stamp .bl-cc,.bl-chrow.last-stamp .bl-batch-ck{border-bottom:2.5px solid #f59e0b!important;}
.bl-mempty{padding:60px 24px;text-align:center;color:var(--tx3);font-size:14px;line-height:2.4;flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;}
.bl-mempty-ico{font-size:44px;margin-bottom:8px;}
.bl-sub-popup{position:fixed;z-index:200;background:var(--card);border:1.5px solid var(--bdr);border-radius:12px;box-shadow:var(--sh2);padding:10px 12px;min-width:150px;animation:cardIn .14s ease;}
.bl-sub-popup-title{font-size:10px;font-weight:800;color:var(--tx3);letter-spacing:.5px;margin-bottom:8px;}
.bl-sub-opts{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:10px;}
.bl-sub-opt{padding:4px 10px;border-radius:20px;font-size:11px;font-weight:700;border:1.5px solid var(--bdr2);background:var(--card2);color:var(--tx2);cursor:pointer;transition:all .12s;font-family:var(--font);}
.bl-sub-opt.on{border-color:#ea580c;background:rgba(234,88,12,.12);color:#ea580c;}
.bl-sub-opt:active{transform:scale(.93);}
.bl-sub-popup-acts{display:flex;gap:6px;}
.bl-sub-save{flex:1;padding:7px 8px;border-radius:8px;background:var(--a);color:#fff;border:none;font-size:12px;font-weight:700;cursor:pointer;font-family:var(--font);}
.bl-sub-close{padding:7px 10px;border-radius:8px;background:var(--surf2);border:1px solid var(--bdr2);color:var(--tx3);font-size:12px;cursor:pointer;font-family:var(--font);}
.bl-share-stats{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;}
.bl-share-stat{flex:1;min-width:70px;border-radius:10px;padding:10px 6px;text-align:center;border:1px solid var(--bdr);}
.bl-share-stat-n{font-size:22px;font-weight:900;line-height:1;}
.bl-share-stat-l{font-size:11px;color:var(--tx3);margin-top:3px;}
.bl-share-box{background:var(--surf2);border-radius:10px;padding:13px 14px;font-size:12px;line-height:2;color:var(--tx);white-space:pre-wrap;word-break:break-all;border:1px solid var(--bdr);max-height:340px;overflow-y:auto;font-family:var(--font);margin:8px 0;}
.bl-share-scroll{flex:1;overflow-y:auto;}
.bl-share-acts{display:flex;gap:8px;flex-wrap:wrap;}
.bl-sbtn{flex:1;min-width:80px;padding:12px 8px;border-radius:10px;border:none;font-size:13px;font-weight:700;cursor:pointer;font-family:var(--font);transition:all .15s;}
.bl-sbtn.copy{background:var(--a10);color:var(--a);border:1px solid var(--a40);}
.bl-sbtn.share{background:var(--a);color:#fff;box-shadow:0 3px 10px var(--a40);}
.bl-sbtn.print{background:rgba(5,150,105,.1);color:var(--green);border:1px solid rgba(5,150,105,.3);}
.bl-sbtn:active{transform:scale(.96);}
.bl-ov-load{position:absolute;inset:0;background:rgba(0,0,0,.28);display:flex;align-items:center;justify-content:center;z-index:80;}
.bl-ov-load-box{background:var(--card);border-radius:14px;padding:22px 30px;text-align:center;font-size:14px;font-weight:700;color:var(--tx);box-shadow:var(--sh2);}
@media print{body>*:not(#bl-pf){display:none!important;}#bl-pf{display:block!important;position:fixed;inset:0;z-index:9999;background:#fff;padding:20px;font-family:var(--font);font-size:13px;color:#000;overflow:auto;}#bl-pf pre{white-space:pre-wrap;font-size:12px;line-height:1.9;}}
`;
    document.head.appendChild(s);
  }

  /* ══ INIT ══ */
  async function init() {
    _css();
    if (typeof BookLibDB==='undefined'){console.warn('[BooklibApp] BookLibDB not loaded');return;}
    await BookLibDB.init();
    BookLibDB.on('books',()=>{
      const pg=document.getElementById('page-booklib');
      if(!pg?.classList.contains('on'))return;
      if(_st.subTab==='library')_renderLibrary();
      else{const bsel=document.getElementById('bl-bsel');if(bsel)_fillBookSel(bsel);}
    });
    console.log('[BooklibApp] ✅ v3.2');
  }

  /* ══ RENDER ══ */
  function render(){
    const pg=document.getElementById('page-booklib');if(!pg)return;
    _stopListeners();pg.innerHTML=_shell();
    if(_st.subTab==='library')_renderLibrary();else _renderMatrixTab();
    // ★ FAB 표시 상태 초기화
    const fab=document.getElementById('bl-reg-fab');
    if(fab) fab.style.display=(_st.subTab==='library'?'flex':'none');
  }
  function _stopListeners(){
    if(_st.stopMatrix){_st.stopMatrix();_st.stopMatrix=null;}
    if(_st.stopStamps){_st.stopStamps();_st.stopStamps=null;}
  }
  function _shell(){return`
    <div class="ph">
      <div class="phl">
        <div style="width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#8b5cf6,#6366f1);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;box-shadow:0 3px 10px rgba(139,92,246,.4)">📖</div>
        <div style="min-width:0">
          <div class="ph-title" onclick="BooklibApp.render()" title="새로고침" style="cursor:pointer">교재 학습 관리 <span class="admin-badge">🔑 관리자</span></div>
          <div class="ph-sub" id="bl-ph-sub">교재 등록 · 챕터 체크</div>
        </div>
      </div>
    </div>
    <div class="bl-stabs">
      <button class="bl-stab ${_st.subTab==='library'?'on':''}" onclick="BooklibApp.switchTab('library')">📚 교재 관리</button>
      <button class="bl-stab ${_st.subTab==='matrix'?'on':''}"  onclick="BooklibApp.switchTab('matrix')">📊 학습 현황</button>
    </div>
    <!-- ★ 교재 등록 FAB 버튼 (교재관리 탭에서만 표시) -->
    <div id="bl-reg-fab" style="position:fixed;right:12px;bottom:90px;z-index:999;display:none;flex-direction:column;align-items:center;gap:4px">
      <button onclick="BooklibApp._openRegModal()" title="교재 등록"
        style="width:54px;height:54px;border-radius:50%;background:var(--a);color:#fff;border:none;font-size:26px;cursor:pointer;box-shadow:0 4px 18px var(--a40);display:flex;align-items:center;justify-content:center;transition:all .15s">＋</button>
      <span style="font-size:9px;font-weight:800;color:var(--a);background:var(--card);padding:1px 6px;border-radius:8px;box-shadow:0 1px 4px rgba(0,0,0,.1)">교재 등록</span>
    </div>
    <div id="bl-cnt" style="flex:1;display:flex;flex-direction:column;overflow:hidden;position:relative;"></div>
    <div id="bl-editor-ov" class="ov hidden" onclick="if(event.target.id==='bl-editor-ov')BooklibApp.closeEditor()">
      <div class="sh" id="bl-editor-sh" onclick="event.stopPropagation()" style="max-height:94vh;display:flex;flex-direction:column;"></div>
    </div>
    <div id="bl-share-ov" class="ov hidden" onclick="if(event.target.id==='bl-share-ov')BooklibApp.closeShare()">
      <div class="sh" id="bl-share-sh" onclick="event.stopPropagation()" style="max-height:88vh;display:flex;flex-direction:column;"></div>
    </div>
    <div id="bl-report-ov" class="ov hidden" onclick="if(event.target.id==='bl-report-ov')BooklibApp.closeReport()">
      <div class="sh" id="bl-report-sh" onclick="event.stopPropagation()" style="max-height:92vh;display:flex;flex-direction:column;"></div>
    </div>`;}

  function switchTab(tab){
    // ★ 교재관리 탭에서만 FAB 표시
    const fab=document.getElementById('bl-reg-fab');
    if(fab) fab.style.display=(tab==='library'?'flex':'none');
    _st.subTab=tab;
    if(tab!=='matrix')_stopListeners();
    document.querySelectorAll('.bl-stab').forEach((b,i)=>b.classList.toggle('on',(i===0&&tab==='library')||(i===1&&tab==='matrix')));
    if(tab==='library')_renderLibrary();else _renderMatrixTab();
  }

  /* ══ LIBRARY ══ */
  function _renderLibrary(){
    const cnt=document.getElementById('bl-cnt');if(!cnt)return;
    const books=BookLibDB.getBooks(),isAdmin=typeof DB!=='undefined'&&DB.isAdmin();
    const sub=document.getElementById('bl-ph-sub');if(sub)sub.textContent=`교재 ${books.length}개`;
    cnt.innerHTML=`<div style="display:flex;flex-direction:column;height:100%;overflow:hidden">
      <!-- ★ 고정 헤더 (스크롤해도 고정) -->
      <div style="flex-shrink:0;background:var(--card);border-bottom:1.5px solid var(--bdr2);padding:8px 14px 0;z-index:5">
        ${isAdmin?`
        <!-- 교재 등록 영역 (기본 숨김, FAB 버튼으로 토글) -->
        <div id="bl-reg-area" style="display:none;margin-bottom:10px;padding:12px;background:var(--surf2);border-radius:12px;border:1.5px solid var(--bdr2)">
          <div style="font-size:10px;font-weight:800;color:var(--tx3);letter-spacing:1px;margin-bottom:8px">교재 등록</div>
          <div class="bl-add-row">
            <input class="bl-add-inp" id="bl-book-inp" placeholder="📖 교재명 입력 후 Enter" onkeydown="if(event.key==='Enter'){BooklibApp.addBook();event.preventDefault()}">
            <button class="bl-add-btn" onclick="BooklibApp.addBook()">추가</button>
          </div>
          <div class="bl-drop-zone" id="bl-book-csv">📂 교재 목록 파일 드롭 · 또는 탭하여 선택<div style="font-size:10px;margin-top:2px;opacity:.7">.csv/.txt/.xlsx</div></div>
        </div>`:``}
        <!-- 교재 목록 타이틀 + 다중선택 버튼 -->
        <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0 8px">
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:12px;font-weight:800;color:var(--tx2)">교재 목록</span>
            <span style="font-size:11px;color:var(--tx3);background:var(--surf2);padding:1px 7px;border-radius:10px">${books.filter(b=>!b.archived).length}개</span>
          </div>
          <div style="display:flex;align-items:center;gap:5px">
            ${isAdmin&&books.filter(b=>!b.archived).length>0?`<button id="bl-multi-arc-btn" style="font-size:11px;padding:3px 10px;border-radius:7px;background:var(--card2);border:1px solid var(--bdr2);color:var(--tx3);cursor:pointer;font-family:var(--font)" onclick="BooklibApp._toggleMultiSelect()">☑ 다중선택</button>`:''}
          </div>
        </div>
        <!-- 다중선택 액션바 -->
        <div id="bl-multi-bar" style="display:none;padding:0 0 8px;gap:6px;align-items:center;flex-wrap:wrap">
          <span id="bl-multi-cnt" style="font-size:12px;font-weight:700;color:var(--tx2)">0개 선택</span>
          <button id="bl-multi-copy-btn" style="font-size:12px;padding:4px 12px;border-radius:8px;background:rgba(99,102,241,.1);border:1px solid rgba(99,102,241,.3);color:var(--a);cursor:pointer;font-family:var(--font);font-weight:700;display:none" onclick="BooklibApp._multiCopy()">📋 복사</button>
          <button id="bl-multi-arch-btn" style="font-size:12px;padding:4px 12px;border-radius:8px;background:rgba(245,158,11,.12);border:1px solid rgba(245,158,11,.4);color:#d97706;cursor:pointer;font-family:var(--font);font-weight:700;display:none" onclick="BooklibApp._multiArchive()">📦 완결 처리</button>
          <button id="bl-multi-del-btn" style="font-size:12px;padding:4px 12px;border-radius:8px;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);color:#dc2626;cursor:pointer;font-family:var(--font);font-weight:700;display:none" onclick="BooklibApp._multiDelete()">🗑 삭제</button>
          <button style="font-size:12px;padding:4px 10px;border-radius:8px;background:var(--surf2);border:1px solid var(--bdr2);color:var(--tx3);cursor:pointer;font-family:var(--font)" onclick="BooklibApp._cancelMultiSelect()">✕ 해제</button>
        </div>
      </div>
      <!-- ★ 스크롤 영역 (교재 카드만 스크롤) -->
      <div id="bl-active-books" style="flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:10px 14px 120px">
        ${books.length===0?`<div class="bl-empty"><div style="font-size:48px;margin-bottom:10px">📚</div>등록된 교재가 없습니다</div>`:`
        ${books.filter(b=>!b.archived).sort((a,b2)=>(a.sortOrder??999)-(b2.sortOrder??999)).map(b=>_bookCardHTML(b,isAdmin)).join('')}
        ${books.some(b=>b.archived)?`
        <div style="margin-top:20px">
          <div style="display:flex;align-items:center;gap:8px;padding:10px 4px;border-top:2px solid var(--bdr);cursor:pointer"
               onclick="BooklibApp._toggleArchivedSection(this)">
            <span style="font-size:13px;font-weight:800;color:var(--tx2)">📦 완결된 교재</span>
            <span style="font-size:11px;color:var(--tx3);background:var(--surf2);padding:1px 7px;border-radius:10px">${books.filter(b=>b.archived).length}개</span>
            <span id="bl-arc-arrow" style="margin-left:auto;font-size:12px;color:var(--tx3)">▼</span>
          </div>
          <div id="bl-arc-list" style="display:flex;flex-direction:column;gap:6px;opacity:.8">
            ${books.filter(b=>b.archived).map(b=>_bookCardHTML(b,isAdmin)).join('')}
          </div>
        </div>`:``}
        `}
      </div>
    </div>`;
    if(isAdmin){
      _bindDrop('bl-book-csv',null,_importBookFile);
      setTimeout(()=>document.getElementById('bl-book-inp')?.focus(),80);
      // ★ 교재 드래그앤드롭 순서 변경 이벤트 바인딩
      setTimeout(()=>_bindBookListDrag(), 50);
    }
  }

  function _bookCardHTML(b,isAdmin){
    const chN=(b.chapters||[]).length;
    const allCls=typeof DB!=='undefined'?DB.getActiveClasses():[];
    const clsNames=(b.classIds||[]).map(id=>allCls.find(c=>c.id===id)?.name||id).join(', ');
    const cfg=b.reportConfig;
    const hasGrade=cfg?.word?.totalQ>0||cfg?.reading?.enabled;
    const isArchived=!!b.archived;
    // ★ 챕터 없으면 [일반], 있으면 [N챕터]
    const chLabel=chN>0?`📑 ${chN}챕터`:`[일반]`;
    const chLabelStyle=chN>0?'':'color:#9333ea;background:rgba(147,51,234,.1);border-color:rgba(147,51,234,.3)';
    // ★ 학생 직접 배정 이름들
    const allStus=typeof DB!=='undefined'?DB.getClasses().flatMap(c=>
      (typeof DB.getStudents==='function'?DB.getStudents().filter(s=>s.cls===c.name):[])):[];
    const stuNames=(b.studentIds||[]).map(id=>allStus.find(s=>s.id===id)?.name||'').filter(Boolean).join(', ');
    return`<div class="bl-book-card ${isArchived?'archived':chN>0?'has-ch':''}" data-bid="${b.id}" draggable="${isAdmin&&!isArchived}">
      <div class="bl-book-chdr">
        ${isAdmin&&!isArchived?`<div class="bl-drag-handle" title="드래그하여 순서 변경">⠿</div>`:''}
        ${isAdmin&&!isArchived?`<div class="bl-move-btns" style="display:none;flex-direction:column;gap:1px;flex-shrink:0;margin-right:2px"><button class="bl-move-btn" onclick="event.stopPropagation();BooklibApp._moveBook('${b.id}',-1)" title="위로">▲</button><button class="bl-move-btn" onclick="event.stopPropagation();BooklibApp._moveBook('${b.id}',1)" title="아래로">▼</button></div>`:''}
        ${isAdmin&&!isArchived?`<input type="checkbox" class="bl-multi-ck" data-bid="${b.id}" style="display:none;width:17px;height:17px;accent-color:var(--a);cursor:pointer;flex-shrink:0" onclick="event.stopPropagation();BooklibApp._onMultiCkChange()">`:''}
        <div class="bl-book-ico">${isArchived?'📦':'📖'}</div>
        <div class="bl-book-info">
          <div class="bl-book-title">${_e(b.name)}</div>
          <div class="bl-book-meta">
            <span class="bl-badge" style="${chLabelStyle}">${chLabel}</span>
            ${clsNames?`<span class="bl-badge hi">🏫 ${_e(clsNames)}</span>`:`<span class="bl-badge" style="color:var(--tx3)">반 미배정</span>`}
            ${stuNames?`<span class="bl-badge" style="background:rgba(59,130,246,.1);border-color:rgba(59,130,246,.3);color:#3b82f6">👤 ${_e(stuNames)}</span>`:''}
            ${hasGrade?`<span class="bl-badge" style="background:rgba(245,158,11,.1);border-color:rgba(245,158,11,.3);color:#d97706;cursor:pointer" onclick="event.stopPropagation();BooklibApp._openEvalTab('${b.id}')" title="평가 설정">📝 성적설정</span>`:''}
            ${isArchived?`<span class="bl-badge" style="color:var(--tx3)">📦 완결 ${b.archivedAt?b.archivedAt.slice(0,10):''}</span>`:''}
          </div>
        </div>
        ${isAdmin?`<div class="bl-book-acts" onclick="event.stopPropagation()">
          ${!isArchived?`<button class="ibtn" onclick="BooklibApp.openEditor('${b.id}','chapters')" title="수정">✏️</button>`:''}
          ${!isArchived?`<button class="ibtn" onclick="BooklibApp._copyBook('${b.id}')" title="복사">📋</button>`:''}
          ${isArchived?`<button class="ibtn" onclick="BooklibApp._unarchiveBook('${b.id}')" title="복원">↩️</button>`:''}
          <button class="ibtn red" onclick="BooklibApp.deleteBook('${b.id}')" title="삭제">🗑</button>
        </div>`:''}
      </div>
      ${chN>0&&!isArchived?`<div class="bl-ch-preview">${(b.chapters||[]).slice(0,5).map(c=>`<span class="bl-ch-tag">${_e(c.title)}</span>`).join('')}${chN>5?`<span style="color:var(--a);font-weight:700;font-size:11px">+${chN-5}</span>`:''}</div>`:''}
    </div>`;}


  // ★ 교재 목록 드래그 순서 변경
  function _bindBookListDrag(){
    const container=document.getElementById('bl-active-books'); if(!container) return;
    let dragId=null;
    container.querySelectorAll('[data-bid][draggable="true"]').forEach(card=>{
      card.addEventListener('dragstart',e=>{
        dragId=card.dataset.bid; card.style.opacity='.4';
        e.dataTransfer.effectAllowed='move';
      });
      card.addEventListener('dragend',()=>{card.style.opacity='';dragId=null;
        container.querySelectorAll('.drag-over-book').forEach(c=>c.classList.remove('drag-over-book'));
      });
      card.addEventListener('dragover',e=>{
        e.preventDefault(); if(!dragId||dragId===card.dataset.bid)return;
        container.querySelectorAll('.drag-over-book').forEach(c=>c.classList.remove('drag-over-book'));
        card.classList.add('drag-over-book');
      });
      card.addEventListener('dragleave',()=>card.classList.remove('drag-over-book'));
      card.addEventListener('drop',async e=>{
        e.preventDefault(); card.classList.remove('drag-over-book');
        if(!dragId||dragId===card.dataset.bid)return;
        // 순서 재배열
        const cards=[...container.querySelectorAll('[data-bid]')];
        const fromIdx=cards.findIndex(c=>c.dataset.bid===dragId);
        const toIdx=cards.findIndex(c=>c.dataset.bid===card.dataset.bid);
        if(fromIdx<0||toIdx<0)return;
        const ids=cards.map(c=>c.dataset.bid);
        const [moved]=ids.splice(fromIdx,1); ids.splice(toIdx,0,moved);
        await BookLibDB.reorderBooks(ids);
        _renderLibrary();
      });
    });
  }

  function _bindDrop(elId,bookId,handler){
    const el=document.getElementById(elId);if(!el)return;
    el.addEventListener('dragover',e=>{e.preventDefault();el.classList.add('drag-over');});
    el.addEventListener('dragleave',()=>el.classList.remove('drag-over'));
    el.addEventListener('drop',async e=>{e.preventDefault();el.classList.remove('drag-over');if(e.dataTransfer?.files?.[0])await handler(e.dataTransfer.files[0],bookId);});
    el.addEventListener('click',()=>{const inp=document.createElement('input');inp.type='file';inp.accept='.xlsx,.xls,.csv,.txt';inp.onchange=e=>{if(e.target.files[0])handler(e.target.files[0],bookId);};inp.click();});
  }
  async function _importBookFile(file){
    const ov=_showLoading(document.getElementById('bl-cnt'));
    try{const lines=await _fileToLines(file);let added=0;for(const name of lines)if(name&&!BookLibDB.getBooks().some(b=>b.name===name)){await BookLibDB.addBook(name);added++;}_toast(`📚 ${added}개 추가`,'success');_renderLibrary();}
    catch(e){_toast('❌ '+e.message);}finally{ov.remove();}
  }
  // ★ 교재 등록 팝업 모달 (bl-reg-area DOM 없을 때 폴백)
  function _openRegModal() {
    let modal = document.getElementById('bl-reg-modal');
    if (modal) { modal.remove(); return; }
    modal = document.createElement('div');
    modal.id = 'bl-reg-modal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:500;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,0,0,.4)';
    modal.innerHTML = `
      <div style="background:var(--card);border-radius:20px 20px 0 0;padding:20px 20px 36px;width:100%;max-width:480px;box-shadow:0 -4px 20px rgba(0,0,0,.15)">
        <div style="text-align:center;width:40px;height:4px;background:var(--bdr);border-radius:2px;margin:0 auto 16px"></div>
        <div style="font-size:14px;font-weight:800;color:var(--tx);margin-bottom:14px">📖 교재 등록</div>
        <div style="display:flex;gap:8px;margin-bottom:12px">
          <input id="bl-modal-inp" class="bl-add-inp" placeholder="교재명 입력 후 추가" style="flex:1" onkeydown="if(event.key==='Enter')BooklibApp._modalAddBook()">
          <button class="bl-add-btn" onclick="BooklibApp._modalAddBook()">추가</button>
        </div>
        <div class="bl-drop-zone" id="bl-modal-csv">📂 교재 목록 파일 드롭 · 또는 탭하여 선택<div style="font-size:10px;margin-top:2px;opacity:.7">.csv/.txt/.xlsx</div></div>
        <button onclick="document.getElementById('bl-reg-modal')?.remove()" style="margin-top:12px;width:100%;padding:10px;border:none;border-radius:10px;background:var(--surf2);color:var(--tx3);font-size:13px;font-family:var(--font);cursor:pointer">닫기</button>
      </div>`;
    modal.addEventListener('click', e => { if(e.target===modal) modal.remove(); });
    document.body.appendChild(modal);
    setTimeout(()=>document.getElementById('bl-modal-inp')?.focus(), 80);
    // CSV 드롭존 바인딩
    _bindDrop('bl-modal-csv', null, async(file)=>{
      modal.remove();
      await _importBookFile(file);
    });
  }

  async function _modalAddBook() {
    const inp = document.getElementById('bl-modal-inp');
    if (!inp || !inp.value.trim()) return;
    await addBook(inp.value.trim());
    document.getElementById('bl-reg-modal')?.remove();
  }

  async function addBook(nameArg){
    // ★ nameArg 우선, 없으면 bl-book-inp 값
    const inp=document.getElementById('bl-book-inp');
    const name=(typeof nameArg==='string'&&nameArg.trim() ? nameArg.trim() : (inp?.value||'').trim());
    if(!name){_toast('⚠️ 교재명을 입력해주세요');return;}
    if(BookLibDB.getBooks().some(b=>b.name===name)){_toast('⚠️ 이미 존재하는 교재명입니다');return;}
    await BookLibDB.addBook(name);
    if(inp)inp.value='';
    _renderLibrary();
    _toast(`📖 "${name}" 등록 완료`,'success');
    setTimeout(()=>document.getElementById('bl-book-inp')?.focus(),60);
  }
  // ★ 다중 선택 완결 처리
  let _multiSelectMode = false;

  // ★ 교재 등록 영역 토글
  function _toggleRegArea() {
    const area = document.getElementById('bl-reg-area');
    if (!area) {
      // bl-reg-area가 없으면 팝업 모달로 교재 등록
      _openRegModal(); return;
    }
    const isVisible = area.style.display !== 'none';
    area.style.display = isVisible ? 'none' : 'block';
    if (!isVisible) {
      // 열릴 때 입력창에 포커스
      setTimeout(() => document.getElementById('bl-book-inp')?.focus(), 80);
    }
  }
  function _toggleMultiSelect(){
    _multiSelectMode = !_multiSelectMode;
    _applyMultiSelectUI();
  }
  function _toggleArchivedSection(header) {
    const list = document.getElementById('bl-arc-list');
    const arrow = document.getElementById('bl-arc-arrow');
    if (!list) return;
    const isOpen = list.style.display !== 'none';
    list.style.display = isOpen ? 'none' : 'flex';
    if (arrow) arrow.style.transform = isOpen ? 'rotate(-90deg)' : 'rotate(0deg)';
  }

  function _cancelMultiSelect(){
    _multiSelectMode = false;
    _applyMultiSelectUI();
  }
  function _applyMultiSelectUI(){
    const bar = document.getElementById('bl-multi-bar');
    const btn = document.getElementById('bl-multi-arc-btn');
    const cks = document.querySelectorAll('.bl-multi-ck');
    const moveBtns = document.querySelectorAll('.bl-move-btns');
    if(_multiSelectMode){
      if(bar){bar.style.display='flex';}
      if(btn){btn.style.background='var(--a10)';btn.style.color='var(--a)';btn.style.borderColor='var(--a40)';}
      cks.forEach(ck=>{ck.style.display='block';ck.checked=false;});
      moveBtns.forEach(mb=>{mb.style.display='flex';});
    } else {
      if(bar){bar.style.display='none';}
      if(btn){btn.style.background='var(--card2)';btn.style.color='var(--tx3)';btn.style.borderColor='var(--bdr2)';}
      cks.forEach(ck=>{ck.style.display='none';ck.checked=false;});
      moveBtns.forEach(mb=>{mb.style.display='none';});
    }
    _onMultiCkChange();
  }
  function _onMultiCkChange(){
    const checked = [...document.querySelectorAll('.bl-multi-ck:checked')];
    const cnt = document.getElementById('bl-multi-cnt');
    if(cnt) cnt.textContent = checked.length + '개 선택';
    // 체크된 항목 있을 때만 복사/완결 버튼 표시
    const hasChecked = checked.length > 0;
    const copyBtn = document.getElementById('bl-multi-copy-btn');
    const archBtn = document.getElementById('bl-multi-arch-btn');
    if(copyBtn) copyBtn.style.display = hasChecked ? '' : 'none';
    if(archBtn) archBtn.style.display = hasChecked ? '' : 'none';
    const delBtn = document.getElementById('bl-multi-del-btn');
    if(delBtn) delBtn.style.display = hasChecked ? '' : 'none';
  }
  // ★ 개별 교재 위/아래 이동 (DOM 직접 조작 + 비동기 DB 저장)
  function _moveBook(id, dir) {
    const container = document.getElementById('bl-active-books');
    if (!container) return;
    const cards = [...container.querySelectorAll('[data-bid]')];
    const idx = cards.findIndex(c => c.dataset.bid === id);
    if (idx < 0) return;
    const target = idx + dir;
    if (target < 0 || target >= cards.length) return;
    // DOM 즉시 이동 (빠른 피드백)
    if (dir === -1) {
      container.insertBefore(cards[idx], cards[target]);
    } else {
      container.insertBefore(cards[target], cards[idx]);
    }
    // DB 비동기 저장 (UI 블로킹 없음)
    const newOrder = [...container.querySelectorAll('[data-bid]')].map(c => c.dataset.bid);
    BookLibDB.reorderBooks(newOrder).catch(console.warn);
  }

  // ★ 선택된 교재 위로 이동
  async function _multiMoveUp() {
    const ids = [...document.querySelectorAll('.bl-multi-ck:checked')].map(c=>c.dataset.bid);
    if (!ids.length) { _toast('⚠️ 이동할 교재를 선택해주세요'); return; }
    const books = BookLibDB.getBooks(); // sortOrder 순 정렬된 목록
    const ordered = books.map(b=>b.id);
    // 선택된 항목들을 위로 1칸씩 이동
    for (const id of ids) {
      const idx = ordered.indexOf(id);
      if (idx > 0 && !ids.includes(ordered[idx-1])) {
        // 바로 위 항목과 교환
        [ordered[idx-1], ordered[idx]] = [ordered[idx], ordered[idx-1]];
      }
    }
    await BookLibDB.reorderBooks(ordered);
    _renderLibrary();
    _toast('▲ 위로 이동', 'success');
  }

  // ★ 선택된 교재 아래로 이동
  async function _multiMoveDown() {
    const ids = [...document.querySelectorAll('.bl-multi-ck:checked')].map(c=>c.dataset.bid);
    if (!ids.length) { _toast('⚠️ 이동할 교재를 선택해주세요'); return; }
    const books = BookLibDB.getBooks();
    const ordered = books.map(b=>b.id);
    // 뒤에서부터 처리 (아래 이동)
    for (const id of [...ids].reverse()) {
      const idx = ordered.indexOf(id);
      if (idx < ordered.length - 1 && !ids.includes(ordered[idx+1])) {
        [ordered[idx], ordered[idx+1]] = [ordered[idx+1], ordered[idx]];
      }
    }
    await BookLibDB.reorderBooks(ordered);
    _renderLibrary();
    _toast('▼ 아래로 이동', 'success');
  }

  // ★ 선택된 교재 복사 (교재명_복사본)
  async function _multiDelete() {
    const ids = [...document.querySelectorAll('.bl-multi-ck:checked')].map(c=>c.dataset.bid);
    if (!ids.length) return;
    const names = ids.map(id=>BookLibDB.getBookById(id)?.name||'').filter(Boolean).join(', ');
    if (!confirm(`선택한 ${ids.length}개 교재를 삭제하시겠습니까?\n\n${names}\n\n⚠️ 삭제된 교재와 관련 데이터는 복구할 수 없습니다.`)) return;
    for (const id of ids) { await BookLibDB.deleteBook(id); }
    _multiSelectMode = false;
    _renderLibrary();
    _toast(`🗑 ${ids.length}개 교재 삭제 완료`,'success');
  }

  async function _multiCopy() {
    const ids = [...document.querySelectorAll('.bl-multi-ck:checked')].map(c=>c.dataset.bid);
    if (!ids.length) { _toast('⚠️ 복사할 교재를 선택해주세요'); return; }
    let count = 0;
    for (const id of ids) {
      const src = BookLibDB.getBookById(id); if (!src) continue;
      const copy = await BookLibDB.copyBook(id);
      if (copy) {
        // 복사본 이름에 "_복사본" 추가
        await BookLibDB.updateBook(copy.id, { name: src.name + '_복사본' });
        count++;
      }
    }
    _renderLibrary();
    _toast(`📋 ${count}개 교재 복사 완료`, 'success');
  }

  async function _multiArchive(){
    const ids = [...document.querySelectorAll('.bl-multi-ck:checked')].map(ck=>ck.dataset.bid);
    if(!ids.length){_toast('⚠️ 완결 처리할 교재를 선택해주세요');return;}
    const names = ids.map(id=>BookLibDB.getBookById(id)?.name||'').filter(Boolean);
    if(!confirm(`선택한 ${ids.length}개 교재를 완결 처리하시겠습니까?\n${names.join(', ')}`))return;
    for(const id of ids){ await BookLibDB.archiveBook(id); }
    _multiSelectMode = false;
    _renderLibrary();
    _toast(`📦 ${ids.length}개 교재 완결 처리 완료`,'success');
  }

  async function _archiveBook(id){
    const b=BookLibDB.getBookById(id); if(!b)return;
    if(!confirm(`"${b.name}"을 완결 처리하시겠습니까?\n완결된 교재는 하단 목록으로 이동됩니다.`))return;
    await BookLibDB.archiveBook(id); _renderLibrary(); _toast(`📦 "${b.name}" 완결 처리`,'success');
  }
  async function _unarchiveBook(id){
    const b=BookLibDB.getBookById(id); if(!b)return;
    await BookLibDB.unarchiveBook(id); _renderLibrary(); _toast(`↩️ "${b.name}" 복원`,'success');
  }
  async function _copyBook(id){
    const src = BookLibDB.getBookById(id); if(!src) return;
    const copy = await BookLibDB.copyBook(id);
    if(copy){
      // ★ 복사본을 맨 위(sortOrder=0)로 이동
      const books = BookLibDB.getBooks();
      const minOrder = Math.min(...books.map(b=>b.sortOrder??0));
      await BookLibDB.updateBook(copy.id, {
        name: src.name + '_복사본',
        sortOrder: minOrder - 1
      });
      _renderLibrary();
      _toast(`📋 "${copy.name}_복사본" 목록 상단에 추가됨`,'success');
    } else {
      _toast('⚠️ 복사 실패','error');
    }
  }

  function _renameBook(id, currentName) {
    const newName = window.prompt('교재명을 변경하세요:', currentName);
    if (!newName || newName.trim() === currentName) return;
    BookLibDB.updateBook(id, { name: newName.trim() }).then(()=>{
      _renderLibrary();
      _toast(`✅ 교재명 변경: ${newName.trim()}`, 'success');
    }).catch(()=>_toast('⚠️ 변경 실패','error'));
  }

  async function deleteBook(id){
    const book=BookLibDB.getBookById(id);if(!book)return;
    if(!confirm(`"${book.name}" 교재를 삭제할까요?`))return;
    await BookLibDB.deleteBook(id);_renderLibrary();_toast(`🗑 "${book.name}" 삭제`);
  }

  /* ══ EDITOR MODAL (챕터 + 성적 설정 통합) ══ */
  function _openEvalTab(bookId){
    _editorTab='eval';
    openEditor(bookId);
  }

  function openEditor(bookId, tab){
    _st.editBookId=bookId;
    // ★ tab 인자로 탭 명시적 지정, 없으면 현재 _editorTab 유지
    if (tab) _editorTab = tab;
    /* 편집 시작 시 현재 config 로드 */
    if(typeof GradeDB!=='undefined'){
      _st.editConfig=JSON.parse(JSON.stringify(GradeDB.getReportConfig(bookId)));
    } else {
      _st.editConfig={ word:{totalQ:0}, reading:{enabled:false,totalQ:0,reviews:[
        {name:'Review 1',enabled:true},{name:'Review 2',enabled:true},
        {name:'Review 3',enabled:false},{name:'Review 4',enabled:false}
      ]}};
    }
    const sh=document.getElementById('bl-editor-sh');if(sh)_drawEditor(sh);
    document.getElementById('bl-editor-ov')?.classList.remove('hidden');
    history.pushState({pg:'booklib',modal:'editor'},'');
  }

  // ★ 에디터 현재 탭 상태
  let _editorTab = 'chapters'; // 'chapters' | 'eval'

  function _drawEditor(sh){
    const book=BookLibDB.getBookById(_st.editBookId);
    if(!book){sh.innerHTML='<div style="padding:24px;text-align:center;color:var(--tx3)">교재를 찾을 수 없습니다</div>';return;}
    const isAdmin=typeof DB!=='undefined'&&DB.isAdmin();
    const chs=book.chapters||[];
    const allCls=typeof DB!=='undefined'?DB.getActiveClasses():[];
    const cfg=_st.editConfig;
    // 학생 목록 (DB.getStudents 지원 시)
    const allStus=typeof DB!=='undefined'&&typeof DB.getStudents==='function'?DB.getStudents():[];

    sh.innerHTML=`
      <div class="sh-handle"></div>
      <div class="sh-title" style="display:flex;align-items:center;gap:8px">
        📖 ${_e(book.name)}
        <span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:6px;background:var(--a10);color:var(--a);border:1px solid var(--a30)">${_editorTab==='eval'?'평가 설정':'챕터 관리'}</span>
      </div>

      <div class="bl-editor-body" id="bl-editor-body">
        ${_editorTab==='chapters'?_edChaptersHTML(book,chs,allCls,allStus,isAdmin):_edEvalHTML(cfg,isAdmin)}
      </div>
      <div class="sh-acts">
        <button class="btn-x" onclick="BooklibApp.closeEditor()">취소</button>
        ${isAdmin?`<button class="btn-ok" onclick="BooklibApp.saveEditor()">저장</button>`:''}
      </div>`;
    if(isAdmin&&_editorTab==='chapters')_bindDrop('bl-ch-drop',book.id,_importChFile);
    // 학생 검색 이벤트
    if(isAdmin&&_editorTab==='chapters'){
      const sinp=document.getElementById('bl-stu-search');
      if(sinp)sinp.addEventListener('input',()=>_renderStuSearchResults(book.id,sinp.value,allStus));
    }
  }

  function _switchEdTab(tab){_editorTab=tab;const sh=document.getElementById('bl-editor-sh');if(sh)_drawEditor(sh);}

  // ─── 탭1: 챕터 관리 HTML ───
  function _edChaptersHTML(book,chs,allCls,allStus,isAdmin){
    const assignedStus=(book.studentIds||[]).map(id=>allStus.find(s=>s.id===id)).filter(Boolean);
    return `
      ${isAdmin?`
        <span class="bl-lbl">챕터 추가</span>
        <div class="bl-drop-zone" id="bl-ch-drop">📂 파일 드롭 또는 탭 (.xlsx/.csv/.txt)</div>
        <textarea class="bl-ch-ta" id="bl-ch-ta" placeholder="챕터를 한 줄에 하나씩&#10;[단어] Unit 1&#10;[문장] Unit 1"></textarea>
        <div class="bl-ch-hint">💡 [단어]/[문장] 포함 시 세부미수행 옵션 자동 활성화</div>
        <div class="bl-paste-row">
          <button class="bl-paste-btn replace" onclick="BooklibApp._pasteChapters('replace')">🔄 교체</button>
          <button class="bl-paste-btn append"  onclick="BooklibApp._pasteChapters('append')">➕ 추가</button>
        </div>

        <span class="bl-lbl">반 배정</span>
        <div class="bl-cls-chips">${allCls.length?allCls.map(cls=>`<div class="bl-cls-chip ${BookLibDB.isBookInClass(book.id,cls.id)?'on':''}" onclick="BooklibApp._toggleAssign('${book.id}','${cls.id}',this)">${_e(cls.name)}</div>`).join(''):'<span style="font-size:12px;color:var(--tx3)">운용 중인 반 없음</span>'}</div>

        <!-- ★ 학생 직접 배정 -->
        <span class="bl-lbl">학생 직접 배정 <span style="font-size:10px;font-weight:400;color:var(--tx3)">(이름 검색 후 추가)</span></span>
        <div style="position:relative">
          <input class="f-inp" id="bl-stu-search" placeholder="학생 이름 검색..." style="width:100%;padding:7px 10px;font-size:13px">
          <div id="bl-stu-results" class="bl-stu-dropdown"></div>
        </div>
        ${assignedStus.length?`<div class="bl-stu-chips">${assignedStus.map(s=>`<div class="bl-stu-chip"><span>${_e(s.name)}</span><button onclick="BooklibApp._removeStudent('${book.id}','${s.id}')">✕</button></div>`).join('')}</div>`:''}
      `:''}

      <!-- 챕터 목록 -->
      <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0 6px">
        <span class="bl-lbl" style="padding:0">챕터 (${chs.length}개)</span>
        ${isAdmin&&chs.length?`<button style="font-size:11px;color:var(--tx3);background:none;border:none;cursor:pointer;font-family:var(--font)" onclick="BooklibApp._clearChs()">전체 삭제</button>`:''}
      </div>
      <div class="bl-ch-list-wrap">${chs.length?chs.map((ch,i)=>{
        const type=BookLibDB.detectChapterType(ch.title);const icon=type==='word'?'🔤':type==='sentence'?'📝':'';
        return`<div class="bl-ch-item"><span class="bl-ch-ns">${i+1}</span><span class="bl-ch-ts-label">${icon} ${_e(ch.title)}</span>${isAdmin?`<button class="bl-ch-del-btn" onclick="BooklibApp._delCh('${book.id}','${ch.id}')">✕</button>`:''}</div>`;
      }).join(''):'<div style="font-size:12px;color:var(--tx3);padding:10px 6px">챕터 없음</div>'}</div>
    `;
  }

  // ─── 탭2: 평가 설정 HTML ───
  function _edEvalHTML(cfg,isAdmin){
    if(!isAdmin)return '<div style="padding:24px;text-align:center;color:var(--tx3)">관리자만 설정 가능합니다</div>';
    return `
      <span class="bl-lbl">📝 성적 리포트 설정</span>
      <div class="bl-grade-sec">
        <div style="font-size:12px;font-weight:800;color:var(--tx2);margin-bottom:6px">🔤 단어 테스트</div>
        <div class="bl-grade-row">
          <span class="bl-grade-lbl">총 테스트(문제) 수</span>
          <input class="bl-grade-inp" type="number" min="0" step="1" id="bl-cfg-wq" placeholder="0" value="${cfg.word?.totalQ||''}">
        </div>
      </div>
      <div class="bl-grade-sec">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
          <span style="font-size:12px;font-weight:800;color:var(--tx2)">📖 리딩 테스트</span>
          <label style="display:flex;align-items:center;gap:5px;cursor:pointer;margin-left:auto">
            <input type="checkbox" id="bl-cfg-rd-on" ${cfg.reading?.enabled?'checked':''}
                   style="width:16px;height:16px;accent-color:var(--a);cursor:pointer"
                   onchange="BooklibApp._onRdToggle(this.checked)">
            <span style="font-size:12px;font-weight:700;color:var(--tx2)">리딩 포함</span>
          </label>
        </div>
        <div id="bl-cfg-rd-body" style="${cfg.reading?.enabled?'':'display:none'}">
          <div class="bl-grade-row">
            <span class="bl-grade-lbl">총 문제 수</span>
            <input class="bl-grade-inp" type="number" min="0" step="1" id="bl-cfg-rdq" placeholder="0" value="${cfg.reading?.totalQ||''}">
          </div>
          <div style="margin-top:10px">
            <div style="font-size:11px;font-weight:800;color:var(--tx3);letter-spacing:.5px;margin-bottom:6px">Review 컬럼 (☑ 체크된 항목만 성적관리에 표시)</div>
            <div id="bl-rv-list">${_rvListHTML(cfg.reading?.reviews||[])}</div>
            <button class="bl-rv-add-btn" onclick="BooklibApp._addReview()">＋ Review 컬럼 추가</button>
          </div>
        </div>
      </div>
    `;
  }

  // ─── 학생 검색 드롭다운 ───
    function _renderStuSearchResults(bookId,query,allStus){
    const res=document.getElementById('bl-stu-results'); if(!res)return;
    const q=query.trim();
    if(!q){res.innerHTML='';res.style.display='none';return;}
    const CHOSUNGS='ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
    function matchChosung(name,q){
      if(name.toLowerCase().includes(q.toLowerCase())) return true;
      let ci=0;
      for(const ch of name){
        const code=ch.charCodeAt(0);
        if(code>=0xAC00&&code<=0xD7A3){
          const cho=CHOSUNGS[Math.floor((code-0xAC00)/588)];
          if(ci<q.length&&q[ci]===cho)ci++;
        }
      }
      return ci===q.length&&q.split('').every(c=>CHOSUNGS.includes(c));
    }
    const book=BookLibDB.getBookById(bookId);
    const assigned=new Set(book?.studentIds||[]);
    const allCls=typeof DB!=='undefined'?DB.getActiveClasses():[];
    const found=allStus.filter(s=>!assigned.has(s.id)&&matchChosung(s.name||'',q)).slice(0,12);
    if(!found.length){res.innerHTML='<div style="padding:8px 12px;font-size:12px;color:var(--tx3)">결과 없음</div>';res.style.display='block';return;}
    res.innerHTML=found.map(s=>{
      const cls=allCls.find(c=>c.name===s.classCode);
      const clsLabel=cls?` <span style="font-size:10px;color:var(--tx3);background:var(--surf2);padding:1px 5px;border-radius:5px">${cls.name}반</span>`:'';
      return `<div onclick="BooklibApp._toggleAssign('${bookId}','${s.id}')"
        style="padding:8px 12px;display:flex;align-items:center;gap:8px;cursor:pointer;border-bottom:1px solid var(--bdr)"
        onmouseover="this.style.background='var(--a10)'" onmouseout="this.style.background=''">
        <span style="font-size:13px;font-weight:700;color:var(--tx)">${_e(s.name)}</span>
        ${clsLabel}
        <span style="margin-left:auto;font-size:11px;color:var(--a);font-weight:700">+ 배정</span>
      </div>`;
    }).join('');
    res.style.display='block';
  }
  function _rvListHTML(reviews){
    return reviews.map((rv,i)=>`
      <div class="bl-rv-row" id="bl-rv-${i}">
        <input type="checkbox" class="bl-rv-check" ${rv.enabled?'checked':''}
               onchange="BooklibApp._onRvCheck(${i},this.checked)">
        <input class="bl-rv-name-inp" type="text" value="${_e(rv.name)}"
               placeholder="Review ${i+1}"
               oninput="BooklibApp._onRvName(${i},this.value)">
        <button class="bl-rv-del" onclick="BooklibApp._delReview(${i})" title="삭제">✕</button>
      </div>`).join('');
  }

  function _onRdToggle(checked){
    const body=document.getElementById('bl-cfg-rd-body');
    if(body)body.style.display=checked?'':'none';
    _st.editConfig.reading.enabled=checked;
  }
  function _onRvCheck(idx,checked){
    if(_st.editConfig.reading.reviews[idx])_st.editConfig.reading.reviews[idx].enabled=checked;
  }
  function _onRvName(idx,val){
    if(_st.editConfig.reading.reviews[idx])_st.editConfig.reading.reviews[idx].name=val||`Review ${idx+1}`;
  }
  function _addReview(){
    const n=_st.editConfig.reading.reviews.length+1;
    _st.editConfig.reading.reviews.push({name:`Review ${n}`,enabled:true});
    const el=document.getElementById('bl-rv-list');
    if(el)el.innerHTML=_rvListHTML(_st.editConfig.reading.reviews);
  }
  function _delReview(idx){
    if(_st.editConfig.reading.reviews.length<=1){_toast('⚠️ 최소 1개 이상이어야 합니다');return;}
    _st.editConfig.reading.reviews.splice(idx,1);
    // idx 재정렬
    const el=document.getElementById('bl-rv-list');
    if(el)el.innerHTML=_rvListHTML(_st.editConfig.reading.reviews);
  }

  /* 저장 (챕터 + 성적 설정 동시 저장) */
  async function saveEditor(){
    const bookId=_st.editBookId;
    // 성적 설정 수집
    const wq  = Number(document.getElementById('bl-cfg-wq')?.value||0);
    const rdOn= document.getElementById('bl-cfg-rd-on')?.checked||false;
    const rdQ = Number(document.getElementById('bl-cfg-rdq')?.value||0);
    // review 최신값 반영
    _st.editConfig.word.totalQ=wq;
    _st.editConfig.reading.enabled=rdOn;
    _st.editConfig.reading.totalQ=rdQ;
    // 저장
    if(typeof GradeDB!=='undefined') await GradeDB.saveReportConfig(bookId,_st.editConfig);
    closeEditor();
    _toast('✅ 저장 완료','success');
  }

  async function _importChFile(file,bookId){try{const lines=await _fileToLines(file);if(!lines.length){_toast('⚠️ 유효한 챕터가 없습니다');return;}await BookLibDB.setChapters(bookId,lines,'replace');_toast(`✅ ${lines.length}개 챕터 등록`,'success');_drawEditor(document.getElementById('bl-editor-sh'));}catch(e){_toast('❌ '+e.message);}}
  function _pasteChapters(mode){const ta=document.getElementById('bl-ch-ta');const text=(ta?.value||'').trim();if(!text){_toast('⚠️ 챕터 목록을 입력해주세요');return;}const titles=text.split(/[\r\n]+/).map(l=>l.trim()).filter(Boolean);if(!titles.length){_toast('⚠️ 유효한 챕터가 없습니다');return;}BookLibDB.setChapters(_st.editBookId,titles,mode).then(()=>{if(ta)ta.value='';_toast(`✅ ${titles.length}개 ${mode==='append'?'추가':'교체'}`,'success');_drawEditor(document.getElementById('bl-editor-sh'));});}
  function _delCh(bid,chId){BookLibDB.deleteChapter(bid,chId).then(()=>_drawEditor(document.getElementById('bl-editor-sh')));}
  function _clearChs(){if(!confirm('챕터를 전체 삭제하시겠습니까?'))return;BookLibDB.updateBook(_st.editBookId,{chapters:[]}).then(()=>_drawEditor(document.getElementById('bl-editor-sh')));}
  async function _toggleAssign(bookId,classId,el){const isOn=el.classList.contains('on');if(isOn)await BookLibDB.unassignBook(bookId,classId);else await BookLibDB.assignBook(bookId,classId);el.classList.toggle('on',!isOn);_toast(isOn?'반 배정 해제':'✅ 반 배정','success');}
  function closeEditor(){document.getElementById('bl-editor-ov')?.classList.add('hidden');_st.editBookId=null;_st.editConfig=null;if(_st.subTab==='library')_renderLibrary();}

  /* ══ MATRIX TAB ══ */
  function _renderMatrixTab(){
    const cnt=document.getElementById('bl-cnt');if(!cnt)return;
    const allCls=typeof DB!=='undefined'?DB.getActiveClasses():[];
    const clsBks=_st.matrixClassId?BookLibDB.getBooksForClass(_st.matrixClassId):BookLibDB.getBooks();
    cnt.innerHTML=`<div class="bl-msel-bar">
      <div class="bl-msel-item"><span class="bl-msel-lbl">📋 반</span>
        <select id="bl-csel" onchange="BooklibApp._onClsChange(this.value)">
          <option value="">— 반 선택 —</option>
          ${allCls.map(c=>`<option value="${c.id}" ${_st.matrixClassId===c.id?'selected':''}>${_e(c.name)}</option>`).join('')}
        </select>
      </div>
      <div class="bl-msel-item"><span class="bl-msel-lbl">📖 교재</span>
        <select id="bl-bsel" onchange="BooklibApp._onBkChange(this.value)">
          <option value="">— 교재 선택 —</option>
          ${clsBks.map(b=>`<option value="${b.id}" ${_st.matrixBookId===b.id?'selected':''}>${_e(b.name)}</option>`).join('')}
        </select>
      </div>
    </div>
    <div id="bl-mbody" style="flex:1;overflow:hidden;display:flex;flex-direction:column;">${_matrixHTML()}</div>`;
  }

  function _fillBookSel(sel){
    const allBks=_st.matrixClassId?BookLibDB.getBooksForClass(_st.matrixClassId):BookLibDB.getBooks();
    const bks=allBks.filter(b=>!b.archived); // ★ 완결 교재 제외
    sel.innerHTML=`<option value="">— 교재 선택 —</option>`+bks.map(b=>`<option value="${b.id}" ${_st.matrixBookId===b.id?'selected':''}>${_e(b.name)}</option>`).join('');
  }

  function _fmtStamp(raw){if(!raw)return'';const[dp='',tp='']=String(raw).split(' ');const[,mo='',d='']=dp.split('-');if(!mo||!d)return raw;const dow=DOW_KO[new Date(dp).getDay()]||'';return`${Number(mo)}/${Number(d)} (${dow}) ${tp.slice(0,5)}`;}

  function _matrixHTML(){
    if(!_st.matrixClassId||!_st.matrixBookId)return`<div class="bl-mempty"><div class="bl-mempty-ico">📊</div>반과 교재를 선택하면 학습 현황이 표시됩니다<br><small style="font-size:11px">챕터 셀 탭 → 진도 스탬프 · 학생 이름 탭 → 공유</small></div>`;
    const book=BookLibDB.getBookById(_st.matrixBookId);
    if(!book)return`<div class="bl-mempty"><div class="bl-mempty-ico">❌</div>교재를 찾을 수 없습니다</div>`;
    const chs=book.chapters||[];if(!chs.length)return`<div class="bl-mempty"><div class="bl-mempty-ico">📑</div>챕터가 없습니다<br><small>교재 관리 탭 → 챕터 추가</small></div>`;
    const cls=_getCls(_st.matrixClassId);if(!cls)return`<div class="bl-mempty"><div class="bl-mempty-ico">❌</div>반 정보를 찾을 수 없습니다</div>`;
    const allStu=typeof StudentDB!=='undefined'?StudentDB.getFiltered({classCode:cls.name,status:'재원'}):[];
    if(!allStu.length)return`<div class="bl-mempty"><div class="bl-mempty-ico">👨‍🎓</div>${_e(cls.name)}반 재원 학생 없음<br><small>학생 탭에서 엑셀을 가져오세요</small></div>`;
    const savedOrder=_loadColOrder(_st.matrixClassId,_st.matrixBookId);_st.colOrder=_buildColOrder(allStu,savedOrder);const students=_getOrderedStu(allStu);
    const lastStamp=_getLastStamp(chs,_stamps);const evalChs=lastStamp?chs.filter(ch=>ch.order<=lastStamp.order):chs;
    // ★ 미수행 = evalChs(타임스탬프 이내) 챕터 × 학생 조합 중 체크된 것만
    const evalChIds = new Set(evalChs.map(ch=>ch.id));
    const undone = Object.keys(_checks).filter(k=>{
      const chId = k.split('__')[1];
      return evalChIds.has(chId);
    }).length;
    const total = students.length * evalChs.length;
    const pct = total ? Math.max(0, Math.round((total-undone)/total*100)) : 100;
    const doneByS={};students.forEach(s=>{doneByS[s.id]=evalChs.filter(ch=>_checks[`${s.id}__${ch.id}`]).length;});
    const lastCh=lastStamp?chs.find(c=>c.id===lastStamp.chId):null;
    const stampNote=lastStamp?`📍 기준: ${_e(lastCh?.title||'')} (${_fmtStamp(_stamps[lastStamp.chId])})`:'📍 챕터 셀 탭 → 진도 스탬프 설정';
    const w=_st.chCollapsed?32:_st.chColWidth;
    return`<div class="bl-mstats" id="bl-mstats">
      <div class="bl-mstat">⬜ 미수행 <span class="bl-mstat-v">${undone}</span></div>
      <div class="bl-mstat">✅ 수행률 <span class="bl-mstat-v">${pct}%</span></div>
      <div class="bl-pct-bar"><div class="bl-pct-fill" id="bl-pct-fill" style="width:${pct}%"></div></div>
      <div style="display:flex;gap:6px;align-items:center;flex-shrink:0">
        <button class="bl-wbtn" onclick="BooklibApp._chNarrow()">◀</button>
        <span style="font-size:10px;color:var(--tx3)">${_st.chCollapsed?'접힘':_st.chColWidth+'px'}</span>
        <button class="bl-wbtn" onclick="BooklibApp._chWider()">▶</button>
        <button class="bl-report-btn" onclick="BooklibApp.openClassReport()">📋 전체 출력</button>
        <button class="bl-report-btn" style="background:rgba(5,150,105,.1);border-color:rgba(5,150,105,.3);color:var(--green)"
                onclick="document.getElementById('bl-csv-inp').click()" title="XLSX/CSV 파일로 학습현황 자동 반영">📊 XLSX</button>
        <input type="file" id="bl-csv-inp" accept=".xlsx,.xls,.csv" style="display:none"
               onchange="if(this.files[0]){BooklibApp.openCsvImportModal(this.files[0]);this.value=''}">
      </div>
    </div>
    <div style="font-size:10px;color:var(--tx3);padding:4px 12px;flex-shrink:0;background:var(--surf2);border-bottom:1px solid var(--bdr)">${stampNote}</div>
    <div class="bl-mwrap">
      <table class="bl-mtbl ${_st.chCollapsed?'ch-collapsed':''}" id="bl-mtbl" style="--ch-w:${w}px;--stu-w:${STU_W}px">
        <colgroup><col style="width:${w}px">${students.map(()=>`<col style="width:${STU_W}px">`).join('')}</colgroup>
        <thead>
          <tr style="position:sticky;top:0;z-index:6;background:var(--surf)">
            <th class="bl-ch-hdr">
              ${!_st.chCollapsed?`<span style="font-size:9px;font-weight:800;color:var(--tx3)">챕터 / 학생</span>`:''}
              <button class="bl-collapse-btn" id="bl-collapse-btn" onclick="BooklibApp._toggleCollapse()">${_st.chCollapsed?'▶':'◀'}</button>
            </th>
            ${students.map((s,i)=>{const uc=doneByS[s.id];return`<th class="bl-shdr" draggable="true" data-idx="${i}" data-sid="${s.id}" onclick="BooklibApp.openShare('${s.id}','${_st.matrixClassId}','${_st.matrixBookId}')">
              <div class="bl-shdr-name">${_e(s.name)}${s.nickname?`<span style="font-size:9px;font-weight:600;color:var(--tx3);display:block">(${_e(s.nickname)})</span>`:''}</div>
              <div class="bl-shdr-cnt" style="color:${uc?'#ea580c':'var(--green)'}" id="shdr-cnt-${s.id}">${uc?uc+'미':'완료✅'}</div>
              <div class="bl-shdr-act">${uc?'📤':''}</div>
            </th>`;}).join('')}
          </tr>
          <tr class="bl-batch-row" id="bl-batch-row">
            <td class="bl-batch-hdr">전체 토글 ↓</td>
            ${students.map(s=>`<td class="bl-batch-ck" onclick="BooklibApp._batchToggle('${_st.matrixClassId}','${_st.matrixBookId}','${s.id}')"><span style="font-size:12px;color:var(--tx3)">⇅</span></td>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${chs.map(ch=>{
            const isStamped=!!_stamps[ch.id],isLastStamp=lastStamp&&ch.id===lastStamp.chId;
            const isAfter=lastStamp&&ch.order>lastStamp.order,isInEval=!lastStamp||ch.order<=lastStamp.order;
            const rowCls=[isInEval?'in-eval':'',isAfter?'after-stamp':'',isLastStamp?'last-stamp':''].filter(Boolean).join(' ');
            const chType=BookLibDB.detectChapterType(ch.title);const typeIcon=chType==='word'?'🔤':chType==='sentence'?'📝':'';
            return`<tr class="bl-chrow ${rowCls}">
              <td class="bl-ch-cell ${isStamped?'stamped':''}" onclick="BooklibApp._toggleStamp('${ch.id}')">
                <div class="bl-ch-inner">
                  <div class="bl-ch-top"><span class="bl-ch-n">${ch.order+1}.</span>${!_st.chCollapsed?`<span class="bl-ch-t">${typeIcon} ${_e(ch.title)}</span>`:''}</div>
                  ${isStamped&&!_st.chCollapsed?`<div class="bl-ch-ts-row"><div class="bl-ch-ts"><span>📍</span><span class="bl-ch-ts-t">${_fmtStamp(_stamps[ch.id])}</span></div></div>`:''}
                </div>
              </td>
              ${students.map(s=>{
                const key=`${s.id}__${ch.id}`,raw=_checks[key],isUndone=!!raw;
                const parsed=isUndone?BookLibDB._parseCheck(raw):{date:'',tasks:[]};
                const noClick=isAfter?'style="pointer-events:none"':'';
                const hasSubOpts=chType!=='none';
                return`<td class="bl-cc${isUndone?' undone':''}" ${noClick}
                  onclick="BooklibApp._toggleCheck('${_st.matrixClassId}','${_st.matrixBookId}','${s.id}','${ch.id}','${chType}',this)">
                  <div class="bl-cc-inner">
                    <span class="bl-cm">${isUndone?'✕':''}</span>
                    ${isUndone&&parsed.tasks.length?`<div class="bl-sub-badges">${parsed.tasks.map(t=>`<span class="bl-sub-badge">${_e(t)}</span>`).join('')}</div>`:''}
                  </div>
                </td>`;
              }).join('')}
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
  }

  function _onClsChange(clsId){_stopListeners();_st.matrixClassId=clsId||null;_st.matrixBookId=null;_checks={};_stamps={};_renderMatrixTab();}
  function _onBkChange(bkId){
    _stopListeners();_st.matrixBookId=bkId||null;_checks={};_stamps={};
    if(_st.matrixClassId&&_st.matrixBookId){
      _checks=BookLibDB.getMatrixChecks(_st.matrixClassId,_st.matrixBookId);
      _stamps=BookLibDB.getStamps(_st.matrixClassId,_st.matrixBookId);
      _st.stopMatrix=BookLibDB.listenMatrix(_st.matrixClassId,_st.matrixBookId,v=>{_checks=v;_refreshBody();});
      _st.stopStamps=BookLibDB.listenStamps(_st.matrixClassId,_st.matrixBookId,v=>{_stamps=v;_refreshBody();});
    }
    _refreshBody();
  }
  function _refreshBody(){
    const mb=document.getElementById('bl-mbody'); if(!mb)return;
    // ★ 스크롤 위치 보존: innerHTML 교체 전 현재 스크롤 저장
    const tbl=mb.querySelector('.bl-mtbl-wrap');
    const scrollTop=tbl?tbl.scrollTop:0;
    const scrollLeft=tbl?tbl.scrollLeft:0;
    mb.innerHTML=_matrixHTML();
    _setupDrag();_bindCsvDrop();
    // ★ 교체 후 동일 위치 복원 (rAF 2회로 렌더링 완료 후 복원)
    const newTbl=mb.querySelector('.bl-mtbl-wrap');
    if(newTbl){
      requestAnimationFrame(()=>{
        requestAnimationFrame(()=>{
          newTbl.scrollTop=scrollTop;
          newTbl.scrollLeft=scrollLeft;
        });
      });
    }
  }

  async function _toggleStamp(chId){
    const cid=_st.matrixClassId,bid=_st.matrixBookId;if(!cid||!bid)return;
    if(_stamps[chId]){delete _stamps[chId];await BookLibDB.removeStamp(cid,bid,chId);_toast('📍 스탬프 해제');}
    else{const now=new Date();const ts=`${now.toISOString().slice(0,10)} ${now.toTimeString().slice(0,5)}`;_stamps[chId]=ts;await BookLibDB.setStamp(cid,bid,chId,ts);_toast(`📍 ${_fmtStamp(ts)}`,'success');}
    _refreshBody();
  }

  async function _toggleCheck(classId,bookId,studentId,chapterId,chType,cell){
    const wasUndone=cell.classList.contains('undone'),nowUndone=!wasUndone;
    cell.classList.toggle('undone',nowUndone);
    const mark=cell.querySelector('.bl-cm');if(mark)mark.textContent=nowUndone?'✕':'';
    await BookLibDB.setCheck(classId,bookId,studentId,chapterId,nowUndone,[]);
    if(!nowUndone){const bads=cell.querySelector('.bl-sub-badges');if(bads)bads.remove();}
    _refreshStatsBar();_refreshStuHdr(studentId,classId,bookId);
    if(nowUndone&&chType!=='none')_showSubPopup(cell,classId,bookId,studentId,chapterId,chType);
  }

  let _activePopup=null;
  function _showSubPopup(cell,classId,bookId,studentId,chapterId,chType){
    _closeSubPopup();
    const opts=BookLibDB.SUBTASKS[chType]||[];const existing=BookLibDB.getSubTasks(classId,bookId,studentId,chapterId);
    const popup=document.createElement('div');popup.className='bl-sub-popup';
    popup.innerHTML=`<div class="bl-sub-popup-title">미수행 항목 선택 (선택사항)</div>
      <div class="bl-sub-opts">${opts.map(o=>`<div class="bl-sub-opt ${existing.includes(o)?'on':''}" data-opt="${_e(o)}">${_e(o)}</div>`).join('')}</div>
      <div class="bl-sub-popup-acts">
        <button class="bl-sub-save" onclick="BooklibApp._saveSubTasks('${classId}','${bookId}','${studentId}','${chapterId}')">저장</button>
        <button class="bl-sub-close" onclick="BooklibApp._closeSubPopup()">닫기</button>
      </div>`;
    const rect=cell.getBoundingClientRect();
    popup.style.left=Math.min(rect.left+4,window.innerWidth-160)+'px';
    popup.style.top=(rect.bottom+4+180>window.innerHeight?rect.top-190:rect.bottom+4)+'px';
    document.body.appendChild(popup);_activePopup=popup;
    popup.querySelectorAll('.bl-sub-opt').forEach(el=>el.addEventListener('click',()=>el.classList.toggle('on')));
    setTimeout(()=>document.addEventListener('click',_outsidePopup,{once:true,capture:true}),50);
  }
  function _outsidePopup(e){if(_activePopup&&!_activePopup.contains(e.target))_closeSubPopup();}
  function _closeSubPopup(){if(_activePopup){_activePopup.remove();_activePopup=null;}document.removeEventListener('click',_outsidePopup,true);}
  async function _saveSubTasks(classId,bookId,studentId,chapterId){
    const tasks=[];_activePopup?.querySelectorAll('.bl-sub-opt.on').forEach(el=>tasks.push(el.dataset.opt));
    await BookLibDB.setSubTasks(classId,bookId,studentId,chapterId,tasks);_closeSubPopup();
    const cell=document.querySelector(`.bl-cc[onclick*="${studentId}"][onclick*="${chapterId}"]`);
    if(cell&&tasks.length){let bads=cell.querySelector('.bl-sub-badges');if(!bads){bads=document.createElement('div');bads.className='bl-sub-badges';cell.querySelector('.bl-cc-inner')?.appendChild(bads);}bads.innerHTML=tasks.map(t=>`<span class="bl-sub-badge">${_e(t)}</span>`).join('');}
    else if(cell)cell.querySelector('.bl-sub-badges')?.remove();
    _toast(tasks.length?`✅ 미수행: ${tasks.join(', ')}`:'저장 완료','success');
  }

  async function _batchToggle(classId,bookId,studentId){
    const book=BookLibDB.getBookById(bookId);if(!book)return;const chs=book.chapters||[];
    const lastStamp=_getLastStamp(chs,_stamps);const evalChs=lastStamp?chs.filter(ch=>ch.order<=lastStamp.order):chs;
    if(!evalChs.length){_toast('⚠️ 평가 범위 내 챕터가 없습니다');return;}
    const allUndone=evalChs.every(ch=>_checks[`${studentId}__${ch.id}`]);
    for(const ch of evalChs)await BookLibDB.setCheck(classId,bookId,studentId,ch.id,!allUndone,[]);
    _checks=BookLibDB.getMatrixChecks(classId,bookId);_refreshBody();
    _toast(allUndone?'✅ 전체 수행으로':'⬜ 전체 미수행으로','success');
  }

  function _refreshStatsBar(){
    const bar=document.getElementById('bl-mstats');if(!bar||!_st.matrixClassId||!_st.matrixBookId)return;
    const book=BookLibDB.getBookById(_st.matrixBookId);if(!book)return;const chs=book.chapters||[];const cls=_getCls(_st.matrixClassId);if(!cls)return;
    const sts=typeof StudentDB!=='undefined'?StudentDB.getFiltered({classCode:cls.name,status:'재원'}):[];
    const lastStamp=_getLastStamp(chs,_stamps);const evalChs=lastStamp?chs.filter(ch=>ch.order<=lastStamp.order):chs;
    const evalChIdsR=new Set(evalChs.map(ch=>ch.id));
    const undone=Object.keys(_checks).filter(k=>evalChIdsR.has(k.split('__')[1])).length;
    const total=sts.length*evalChs.length;const pct=total?Math.max(0,Math.round((total-undone)/total*100)):100;
    const nodes=bar.querySelectorAll('.bl-mstat-v');if(nodes[0])nodes[0].textContent=undone;if(nodes[1])nodes[1].textContent=pct+'%';
    const fill=document.getElementById('bl-pct-fill');if(fill)fill.style.width=pct+'%';
  }
  function _refreshStuHdr(sid,cid,bid){
    const th=document.querySelector(`.bl-shdr[data-sid="${sid}"]`);if(!th)return;
    const book=BookLibDB.getBookById(bid);if(!book)return;const chs=book.chapters||[];const cls=_getCls(cid);if(!cls)return;
    const lastStamp=_getLastStamp(chs,_stamps);const evalChs=lastStamp?chs.filter(ch=>ch.order<=lastStamp.order):chs;
    const uc=evalChs.filter(ch=>_checks[`${sid}__${ch.id}`]).length;
    const cntEl=document.getElementById(`shdr-cnt-${sid}`),actEl=th.querySelector('.bl-shdr-act');
    if(cntEl){cntEl.textContent=uc?uc+'미':'완료✅';cntEl.style.color=uc?'#ea580c':'var(--green)';}
    if(actEl)actEl.textContent=uc?'📤':'';
  }

  function _chWider(){if(_st.chCollapsed){_toggleCollapse();return;}_st.chColWidth=Math.min(MAX_CH_W,_st.chColWidth+20);localStorage.setItem(LS_CH_W,_st.chColWidth);const tbl=document.getElementById('bl-mtbl');if(tbl&&!_st.chCollapsed)tbl.style.setProperty('--ch-w',_st.chColWidth+'px');_updWLbl();}
  function _chNarrow(){if(_st.chColWidth<=MIN_CH_W+10){_toggleCollapse();return;}_st.chColWidth=Math.max(MIN_CH_W,_st.chColWidth-20);localStorage.setItem(LS_CH_W,_st.chColWidth);const tbl=document.getElementById('bl-mtbl');if(tbl&&!_st.chCollapsed)tbl.style.setProperty('--ch-w',_st.chColWidth+'px');_updWLbl();}
  function _toggleCollapse(){_st.chCollapsed=!_st.chCollapsed;const tbl=document.getElementById('bl-mtbl'),btn=document.getElementById('bl-collapse-btn'),w=_st.chCollapsed?32:_st.chColWidth;if(tbl){tbl.classList.toggle('ch-collapsed',_st.chCollapsed);tbl.style.setProperty('--ch-w',w+'px');}if(btn)btn.textContent=_st.chCollapsed?'▶':'◀';_updWLbl();}
  function _updWLbl(){const lbl=document.querySelector('.bl-mstats span[style*="font-size:10px"]');if(lbl)lbl.textContent=_st.chCollapsed?'접힘':_st.chColWidth+'px';}

  function _setupDrag(){
    const ths=document.querySelectorAll('.bl-shdr');let srcIdx=null;
    ths.forEach((th,i)=>{
      th.addEventListener('dragstart',e=>{srcIdx=i;th.classList.add('dragging');e.dataTransfer.effectAllowed='move';th._dragging=true;});
      th.addEventListener('dragend',()=>{th.classList.remove('dragging');ths.forEach(t=>t.classList.remove('drag-over-left','drag-over-right'));setTimeout(()=>{th._dragging=false;},100);});
      th.addEventListener('dragover',e=>{e.preventDefault();e.dataTransfer.dropEffect='move';ths.forEach(t=>t.classList.remove('drag-over-left','drag-over-right'));if(srcIdx!==null&&srcIdx!==i)th.classList.add(i>srcIdx?'drag-over-right':'drag-over-left');});
      th.addEventListener('drop',e=>{e.preventDefault();ths.forEach(t=>t.classList.remove('drag-over-left','drag-over-right'));if(srcIdx===null||srcIdx===i)return;const newOrder=[..._st.colOrder];const[moved]=newOrder.splice(srcIdx,1);newOrder.splice(i,0,moved);_st.colOrder=newOrder;_saveColOrder(_st.matrixClassId,_st.matrixBookId,newOrder);srcIdx=null;_refreshBody();});
      th.addEventListener('click',()=>{if(th._dragging)return;});
    });
  }
  const _colKey=(c,b)=>LS_COL_PFX+c+'__'+b;
  function _loadColOrder(cid,bid){try{return JSON.parse(localStorage.getItem(_colKey(cid,bid))||'null')||[];}catch{return[];}}
  function _saveColOrder(cid,bid,order){localStorage.setItem(_colKey(cid,bid),JSON.stringify(order));}
  function _buildColOrder(students,saved){if(!saved.length)return students.map(s=>s.id);const existing=saved.filter(id=>students.some(s=>s.id===id));const newOnes=students.filter(s=>!saved.includes(s.id)).map(s=>s.id);return[...existing,...newOnes];}
  function _getOrderedStu(students){return _st.colOrder.map(id=>students.find(s=>s.id===id)).filter(Boolean);}
  function _getLastStamp(chs,stamps){if(!stamps||!Object.keys(stamps).length)return null;let lo=-1,lchId=null;chs.forEach(ch=>{if(stamps[ch.id]&&ch.order>lo){lo=ch.order;lchId=ch.id;}});return lchId?{chId:lchId,order:lo}:null;}

  function openShare(sid,classId,bookId){
    if(document.querySelector(`.bl-shdr[data-sid="${sid}"]`)?._dragging)return;
    const ov=document.getElementById('bl-share-ov'),sh=document.getElementById('bl-share-sh');if(!ov||!sh)return;
    const student=typeof StudentDB!=='undefined'?StudentDB.getAll().find(s=>s.id===sid):null;
    const book=BookLibDB.getBookById(bookId),cls=_getCls(classId);if(!book||!cls)return;
    const{text,undone,done,total}=_buildShareData(sid,book,cls);
    _st.shareText=text;const pct=total?Math.round(done.length/total*100):100;
    sh.innerHTML=`<div class="sh-handle"></div>
      <div class="sh-title">📤 학습 현황 공유</div>
      <div class="sh-sub">${_e(student?.name||'학생')} · ${_e(book.name)} · ${pct}%</div>
      <div class="bl-share-scroll">
        <div class="bl-share-stats">
          ${[{n:undone.length,l:'미수행',bg:'rgba(234,88,12,.08)',nc:undone.length?'#ea580c':'var(--green)'},{n:done.length,l:'수행',bg:'rgba(5,150,105,.07)',nc:'var(--green)'},{n:total,l:'평가범위',bg:'var(--card2)',nc:'var(--tx)'}].map(it=>`<div class="bl-share-stat" style="background:${it.bg}"><div class="bl-share-stat-n" style="color:${it.nc}">${it.n}</div><div class="bl-share-stat-l">${it.l}</div></div>`).join('')}
        </div>
        <div class="bl-share-box">${_e(text)}</div>
      </div>
      <div class="bl-share-acts">
        <button class="bl-sbtn copy"  onclick="BooklibApp._copyText(BooklibApp._getShareText())">📋 복사</button>
        <button class="bl-sbtn share" onclick="BooklibApp._webShare('share')">📤 공유</button>
      </div>
      <div style="margin-top:8px"><button class="btn-x" style="width:100%" onclick="BooklibApp.closeShare()">닫기</button></div>`;
    ov.classList.remove('hidden');history.pushState({pg:'booklib',modal:'share'},'');
  }
  function _buildShareData(sid,book,cls){
    const chs=book.chapters||[];const lastStamp=_getLastStamp(chs,_stamps);const evalChs=lastStamp?chs.filter(ch=>ch.order<=lastStamp.order):chs;
    const undone=evalChs.filter(ch=>_checks[`${sid}__${ch.id}`]),done=evalChs.filter(ch=>!_checks[`${sid}__${ch.id}`]);
    const today=new Date().toLocaleDateString('ko-KR');const lastCh=lastStamp?chs.find(c=>c.id===lastStamp.chId):null;
    const undoneLines=undone.map(ch=>{const parsed=BookLibDB._parseCheck(_checks[`${sid}__${ch.id}`]);const ts=parsed.tasks.length?` [${parsed.tasks.join('/')}]`:'';return`  ${ch.order+1}. ${ch.title}${ts}`;});
    const text=[`📚 ${book.name} 학습 현황`,`👤 ${cls.name}반`,lastCh?`📍 진도 기준: ${lastCh.title} (${_fmtStamp(_stamps[lastStamp.chId])})`:'',`📅 ${today}`,'',undone.length?`⬜ 미수행 (${undone.length}개)\n${undoneLines.join('\n')}`:'🎉 완료!',done.length&&undone.length?`\n✅ 수행 (${done.length}개)`:''].filter(l=>l!==undefined).join('\n').trim();
    return{text,undone,done,total:evalChs.length};
  }

  function openClassReport(){
    const ov=document.getElementById('bl-report-ov'),sh=document.getElementById('bl-report-sh');
    if(!ov||!sh||!_st.matrixClassId||!_st.matrixBookId){_toast('⚠️ 반과 교재를 먼저 선택해주세요');return;}
    const book=BookLibDB.getBookById(_st.matrixBookId),cls=_getCls(_st.matrixClassId);if(!book||!cls)return;
    const chs=book.chapters||[];const lastStamp=_getLastStamp(chs,_stamps);const evalChs=lastStamp?chs.filter(ch=>ch.order<=lastStamp.order):chs;
    const today=new Date().toLocaleDateString('ko-KR');const lastCh=lastStamp?chs.find(c=>c.id===lastStamp.chId):null;
    const allStu=typeof StudentDB!=='undefined'?StudentDB.getFiltered({classCode:cls.name,status:'재원'}):[];const students=_getOrderedStu(allStu);
    const lines=[`════════════════════════`,`📚 ${book.name}`,`🏫 ${cls.name}반 미수행 현황`,lastCh?`📍 기준: ${lastCh.title} (${_fmtStamp(_stamps[lastStamp.chId])})`:`📍 기준: 미설정`,`📅 ${today}`,`════════════════════════`,''];
    let hasAny=false;
    students.forEach(s=>{const undone=evalChs.filter(ch=>_checks[`${s.id}__${ch.id}`]);if(undone.length){hasAny=true;lines.push(`👤 ${s.name}  (${undone.length}/${evalChs.length})`);undone.forEach(ch=>{const parsed=BookLibDB._parseCheck(_checks[`${s.id}__${ch.id}`]);const ts=parsed.tasks.length?` [${parsed.tasks.join('/')}]`:'';lines.push(`  ${ch.order+1}. ${ch.title}${ts}`);});lines.push('');}});
    if(!hasAny)lines.push('🎉 모든 학생이 완료했습니다!');
    _st.reportText=lines.join('\n');
    const summaryRows=students.map(s=>{const uc=evalChs.filter(ch=>_checks[`${s.id}__${ch.id}`]).length;const pct=evalChs.length?Math.round((evalChs.length-uc)/evalChs.length*100):100;return`<tr><td style="padding:6px 10px;border-bottom:1px solid var(--bdr);font-weight:700">${_e(s.name)}</td><td style="padding:6px 10px;border-bottom:1px solid var(--bdr);color:${uc?'#ea580c':'var(--green)'}">${uc?`⬜ ${uc}개`:'✅'}</td><td style="padding:6px 10px;border-bottom:1px solid var(--bdr)"><div style="display:flex;align-items:center;gap:6px"><div style="flex:1;height:6px;background:var(--bdr);border-radius:3px;overflow:hidden;min-width:60px"><div style="height:100%;width:${pct}%;background:${uc?'#f97316':'#10b981'};border-radius:3px"></div></div><span style="font-size:11px;color:var(--tx3)">${pct}%</span></div></td></tr>`;}).join('');
    sh.innerHTML=`<div class="sh-handle"></div>
      <div class="sh-title">📋 전체 미수행 현황</div>
      <div class="sh-sub">${_e(cls.name)}반 · ${_e(book.name)}</div>
      <div class="bl-share-scroll">
        <div style="margin:10px 0 6px;font-size:10px;font-weight:800;color:var(--tx3);letter-spacing:1px">학생별 요약</div>
        <table style="width:100%;border-collapse:collapse;border:1px solid var(--bdr);border-radius:8px;overflow:hidden;margin-bottom:10px;font-size:13px">
          <thead><tr style="background:var(--surf2)"><th style="padding:7px 10px;text-align:left;font-size:11px;color:var(--tx3)">학생</th><th style="padding:7px 10px;text-align:left;font-size:11px;color:var(--tx3)">미수행</th><th style="padding:7px 10px;text-align:left;font-size:11px;color:var(--tx3)">수행률</th></tr></thead>
          <tbody>${summaryRows}</tbody>
        </table>
        <div style="font-size:10px;font-weight:800;color:var(--tx3);letter-spacing:1px;margin-bottom:4px">상세 (복사·출력용)</div>
        <div class="bl-share-box">${_e(_st.reportText)}</div>
      </div>
      <div class="bl-share-acts">
        <button class="bl-sbtn copy"  onclick="BooklibApp._copyText(BooklibApp._getReportText())">📋 복사</button>
        <button class="bl-sbtn print" onclick="BooklibApp._printReport()">🖨️ 인쇄</button>
        <button class="bl-sbtn share" onclick="BooklibApp._webShare('report')">📤 공유</button>
      </div>
      <div style="margin-top:8px"><button class="btn-x" style="width:100%" onclick="BooklibApp.closeReport()">닫기</button></div>`;
    ov.classList.remove('hidden');history.pushState({pg:'booklib',modal:'report'},'');
  }
  function _printReport(){const book=BookLibDB.getBookById(_st.matrixBookId),cls=_getCls(_st.matrixClassId);let frame=document.getElementById('bl-pf');if(!frame){frame=document.createElement('div');frame.id='bl-pf';document.body.appendChild(frame);}frame.innerHTML=`<h2>📋 ${_e(book?.name||'')} — ${_e(cls?.name||'')}반 미수행 현황</h2><pre>${_e(_st.reportText)}</pre>`;window.print();setTimeout(()=>frame.remove(),1000);}

  const _getShareText=()=>_st.shareText;
  const _getReportText=()=>_st.reportText;
  async function _copyText(text){try{await navigator.clipboard.writeText(text);_toast('📋 복사됐습니다','success');}catch{_toast('⚠️ 복사 실패');}}
  async function _webShare(type){const text=type==='report'?_st.reportText:_st.shareText;const sd={title:'학습 현황',text};if(navigator.share&&navigator.canShare?.(sd)){try{await navigator.share(sd);_toast('📤 공유 완료','success');return;}catch(e){if(e.name==='AbortError')return;}}_copyText(text);}
  function closeShare(){document.getElementById('bl-share-ov')?.classList.add('hidden');}
  function closeReport(){document.getElementById('bl-report-ov')?.classList.add('hidden');}

  function _getCls(id){if(typeof DB==='undefined')return null;if(typeof DB.getClassById==='function')return DB.getClassById(id);return(DB.getActiveClasses?.()||[]).find(c=>c.id===id)||null;}
  async function _fileToLines(file){if(/\.(xlsx|xls)$/i.test(file.name)&&typeof XLSX!=='undefined'){const buf=await file.arrayBuffer();const wb=XLSX.read(buf,{type:'array'});const ws=wb.Sheets[wb.SheetNames[0]];const rows=XLSX.utils.sheet_to_json(ws,{header:1});return rows.map(r=>String(r[0]||'').trim()).filter(Boolean);}const text=await file.text();return text.split(/[\r\n,]+/).map(l=>l.trim()).filter(Boolean);}
  function _showLoading(container){const ov=document.createElement('div');ov.className='bl-ov-load';ov.innerHTML='<div class="bl-ov-load-box">⏳ 처리 중…</div>';if(container){container.style.position='relative';container.appendChild(ov);}return ov;}
  const _e=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  function _toast(msg,type){const el=document.getElementById('toast');if(!el)return;el.textContent=msg;el.className=type==='success'?'success':'';el.classList.remove('hidden');clearTimeout(el._t);el._t=setTimeout(()=>el.classList.add('hidden'),3000);}

  /* ══════════════════════════════════════════════════════════════
   * CSV 임포트 — 학습 현황 자동 반영
   * ══════════════════════════════════════════════════════════════
   *
   * CSV 포맷: 제목, 타입, 학생명(예:001.도현/수진), 아이디, 암기, 리콜, 스펠, 스피킹, 게임, 테스트, 완료
   *
   * 매칭 규칙
   *   1. 챕터 매칭: 학습현황 챕터명에 CSV '제목' 포함 여부 (or 역방향)
   *                 + CSV '타입'(단어/문장) 이 챕터명에 포함
   *   2. 학생 매칭: CSV '학생명' → 이름 추출 (번호.이름1/이름2)
   *                 → 학습현황 학생의 성 제외 이름(1글자 성 제거)과 매칭
   *                 → 닉네임은 StudentDB에서 매칭된 학생의 닉네임 사용
   *   3. 미수행 판별: 완료='미완료' && !(예외조건)
   *   4. 예외조건: 미완료 + 게임만 공란 + 나머지(암기·리콜·스펠·스피킹·테스트) 전부 공란
   *               → 사용자가 "신규학생 예외 적용" 설정 ON 시 수행으로 처리
   *   5. 세부항목: 미완료 + 암기~테스트 각 공란인 컬럼 = 미수행 항목
   *               게임 값에 '매칭'/'스크램블' 포함 시 해당 항목 활성화
   *   6. 타임스탬프: CSV 역순으로 챕터 순회 → 첫 번째 완료율 ≥50% 챕터
   *                  시간 = CSV 파일 드롭 시각
   * ═══════════════════════════════════════════════════════════════ */

  /* CSV 임포트 UI 진입점 — 학습 현황 탭 드롭존에서 호출 */
  // ★ XLSX/CSV 모두 지원 (XLSX 우선)
  async function importCsv(file) {
    if (!_st.matrixClassId || !_st.matrixBookId) {
      _toast('⚠️ 반과 교재를 먼저 선택해주세요'); return;
    }
    if (!window.XLSX) { _toast('⚠️ XLSX 라이브러리 로딩 중...', 'error'); return; }
    const ov = _showLoading(document.getElementById('bl-cnt'));
    try {
      const buf    = await file.arrayBuffer();
      const wb     = XLSX.read(buf, { type: 'array' });
      const ws     = wb.Sheets[wb.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json(ws, { defval: '' });
      // ★ 컬럼 정규화: xlsx('세트 제목','완료여부') ↔ csv('제목','완료') 통일
      const rows = rawRows.map(r => {
        const norm = {};
        Object.keys(r).forEach(k => { norm[k] = r[k]; });
        if (!norm['제목']   && norm['세트 제목']) norm['제목']  = norm['세트 제목'];
        if (!norm['완료']   && norm['완료여부'])  norm['완료']  = norm['완료여부'];
        return norm;
      });
      // ★ xlsx 기준 챕터 목록 최신화 (덮어쓰기)
      await _syncChaptersFromXlsx(rows, _st.matrixBookId);

      const result = await _processCsv(rows);  // rows 배열 직접 전달
      const stampMsg = result.stampTitle ? ` | 📍 ${result.stampTitle}까지 처리` : '';
      _toast(`✅ 반영 완료 — 챕터 동기화 + 미수행 ${result.undone}건, 수행 ${result.done}건${stampMsg}`, 'success');
      _refreshBody();
    } catch(e) {
      console.error('[XLSX Import]', e);
      _toast('❌ 파일 처리 오류: ' + e.message);
    } finally { ov.remove(); }
  }

  /**
   * ★ xlsx 기준 챕터 목록 최신화
   * - 중복 제거 → "[타입] 세트 제목" 형식으로 챕터 목록 구성
   * - 기존 챕터와 동일한 것은 id 유지(overwrite), 신규는 새 id 부여
   * - 기존에 없던 xlsx 신규 챕터: fromXlsx:true 플래그 부여 (배경색 구분용)
   * - 최종적으로 xlsx 목록 수량 = DB 챕터 수량 (완전 동기화)
   */
  async function _syncChaptersFromXlsx(rows, bookId) {
    const book = BookLibDB.getBookById(bookId); if (!book) return;

    // 1. xlsx에서 중복 제거 챕터 목록 추출 (순서 유지)
    const seen = new Set(), xlsxChs = [];
    rows.forEach(r => {
      const title = String(r['세트 제목'] || r['제목'] || '').trim();
      const typ   = String(r['타입'] || '').trim();
      if (!title || !typ) return;
      const key = `[${typ}] ${title}`;
      if (!seen.has(key)) { seen.add(key); xlsxChs.push({ key, title, typ }); }
    });
    if (!xlsxChs.length) return;

    // 2. 기존 챕터와 매칭: 동일하면 기존 id 유지, 없으면 신규
    const existingChs = book.chapters || [];
    const existingMap = {};
    existingChs.forEach(ch => { existingMap[ch.title] = ch; });

    const newChs = xlsxChs.map((x, i) => {
      const fullTitle = x.key;  // "[타입] 세트 제목"
      const existing  = existingMap[fullTitle];
      return {
        id:       existing ? existing.id : '',
        title:    fullTitle,
        order:    i,
        fromXlsx: !existing,  // ★ 신규 챕터 표시용 플래그
      };
    });

    await BookLibDB.setChapters(bookId, newChs, 'replace');
  }

  /* 핵심 처리 로직 - rows 배열(정규화 완료) 직접 받음 */
  async function _processCsv(rows) {
    if (!Array.isArray(rows) || !rows.length) throw new Error('유효한 데이터가 없습니다');

    const classId = _st.matrixClassId;
    const bookId  = _st.matrixBookId;
    const book    = BookLibDB.getBookById(bookId);
    const chs     = book?.chapters || [];
    const cls     = _getCls(classId);

    /* 2. 이 반의 재원 학생 목록 */
    const students = typeof StudentDB !== 'undefined'
      ? StudentDB.getFiltered({ classCode: cls?.name, status: '재원' })
      : [];

    /* 3. 타임스탬프 기준 챕터 결정 (CSV 역순, 완료율 ≥80%) */
    const stampTs   = _nowStampStr();
    const stampChId = _findStampChapter(rows, chs);

    /* ★ 타임스탬프 이후 챕터는 처리 대상에서 제외
     *   - 타임스탬프 챕터 order 이하만 처리
     *   - 이후 챕터는 완료/미수행 여부 불문 완전 무시 */
    const stampCh    = stampChId ? chs.find(ch => ch.id === stampChId) : null;
    const chsInScope = stampCh
      ? chs.filter(ch => ch.order <= stampCh.order)
      : chs; // 타임스탬프 없으면 전체 처리

    /* 4. 예외 설정 가져오기 (모달에서 설정한 값) */
    const exceptionOn = _csvImportState.exceptionOn;

    /* ★ 중복 이름 집합: 같은 반 학생 중 givenName이 겹치는 경우 full 이름으로 매칭 */
    const dupGivens = _buildDupGivens(students);

    let undone=0, done=0, exception=0, skipped=0;

    /* 5. 챕터 × 학생 매트릭스 순회 (★ 타임스탬프 이후 챕터 제외) */
    for (const ch of chsInScope) {
      /* 챕터에 해당하는 CSV 행들 */
      const chRows = rows.filter(r => _matchChapter(ch.title, r['제목'], r['타입']));
      if (!chRows.length) continue;

      for (const stu of students) {
        /* 학생 매칭: 성 제외 이름으로 CSV 학생명 검색 */
        const matchRow  = _findMatchRow(chRows, stu.name, dupGivens);
        const givenName = _givenName(stu.name); // 예외 조회용
        if (!matchRow) continue;

        const isDone      = (matchRow['완료'] || '').trim() === '완료';
        // ★ '완료'가 아닌 모든 값 = 미완료 처리 ('미완료', 공란, 기타)
        const isUndone    = (matchRow['완료'] || '').trim() !== '완료';
        // ★ 학생별 면제 항목 조회
        const exemptItems = _getExemptItems(givenName);
        const isException = isUndone && _checkException(matchRow, exemptItems);

        if (isDone || isException) {
          /* 수행 → 체크 해제 */
          const wasChecked = BookLibDB.isChecked(classId, bookId, stu.id, ch.id);
          if (wasChecked) await BookLibDB.setCheck(classId, bookId, stu.id, ch.id, false, []);
          if (isException) exception++; else done++;
        } else if (isUndone) {
          /* 미수행 → 체크 + 면제 항목 제외한 세부항목 */
          const tasks = _extractTasks(matchRow, exemptItems);
          await BookLibDB.setCheck(classId, bookId, stu.id, ch.id, true, tasks);
          undone++;
        }
      }
    }

    /* 6. 타임스탬프 설정 */
    if (stampChId) {
      await BookLibDB.setStamp(classId, bookId, stampChId, stampTs);
    }

    /* 7. 로컬 캐시 갱신 */
    _checks = BookLibDB.getMatrixChecks(classId, bookId);
    _stamps = BookLibDB.getStamps(classId, bookId);

    return { undone, done, exception, skipped,
      stampTitle: stampCh?.title || null };
  }

  /* ── CSV 파싱 ── */
  function _parseCsv(text) {
    /* BOM 제거 */
    const clean = text.replace(/^\uFEFF/, '');
    const lines  = clean.split(/\r?\n/);
    if (lines.length < 2) return [];
    const headers = _splitCsvLine(lines[0]);
    const rows    = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const vals = _splitCsvLine(line);
      const row  = {};
      headers.forEach((h, hi) => { row[h] = (vals[hi] || '').trim(); });
      rows.push(row);
    }
    return rows;
  }

  function _splitCsvLine(line) {
    /* 따옴표 안의 쉼표·줄바꿈 처리 */
    const result = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { result.push(cur); cur = ''; }
      else { cur += ch; }
    }
    result.push(cur);
    return result.map(s => s.replace(/^"|"$/g, '').replace(/\n/g, ' ').trim());
  }

  /* ── 챕터 매칭 ──
   * 학습현황 챕터명에 CSV 제목이 포함되거나, CSV 제목에 챕터명이 포함
   * + CSV 타입(단어/문장)이 챕터명에 포함
   */
  function _matchChapter(chTitle, csvTitle, csvType) {
    const stripType = s => s.replace(/\[단어\]|\[문장\]/g,'').trim();
    // ★ normalize: 괄호 안 번호를 _N으로 변환하여 "Unit.10(1)"→"unit.10_1" 구분 보장
    // 이렇게 하면 "Unit.10"≠"Unit.10(1)"이면서 L01≠L01-02 구분도 유지됨
    const norm = s => {
      let r = stripType(s).toLowerCase();
      r = r.replace(/\s*\((\d+)\)/g, '_$1');   // "(1)"→"_1", "(2)"→"_2"
      r = r.replace(/[\s.\-~\[\]]+/g, '');      // 나머지 특수문자 제거
      return r;
    };
    const ct = norm(chTitle);
    const cv = norm(csvTitle);
    // ★ 정확 일치만 허용 (이전 포함 관계 제거로 흡수 버그 방지)
    if (ct !== cv) return false;
    if (!csvType) return true;
    const chTypeMatch =
      (csvType === '단어' && /\[단어\]/.test(chTitle)) ||
      (csvType === '문장' && /\[문장\]/.test(chTitle));
    return chTypeMatch;
  }

  /* ── 학생 매칭 ──
   * CSV 학생명 예: "001.도현/수진" → 이름 추출: ["도현","수진"]
   * 학생 이름에서 성(첫 1글자) 제외한 이름과 비교
   */
  function _givenName(fullName) {
    /* 한국 이름: 성은 일반적으로 1자 → 나머지가 이름 */
    if (!fullName) return '';
    return fullName.length > 1 ? fullName.slice(1) : fullName;
  }

  function _extractNamesFromCsv(csvStudentName) {
    /* "030.김채원/유림" → ["김채원","유림"] (성 포함 원본 이름 전체 추출) */
    const stripped = (csvStudentName || '').replace(/^\d+\.\s*/, '');
    return stripped.split('/').map(n => n.trim()).filter(Boolean);
  }

  /**
   * ★ 중복 이름(givenName 동일) 처리
   * - 같은 반에 "김채원"/"이채원" 처럼 성만 다르고 이름이 같은 경우
   *   → 2자 이름(givenName)으로 매칭 시 두 학생 모두 매칭되는 문제 발생
   * 해결:
   *   dupGivens 에 포함된 이름 → DB fullName(성포함) 전체로 CSV 이름과 비교
   *   그 외 → givenName(성 제외)으로 CSV 이름(포함 관계) 비교
   */
  function _buildDupGivens(students) {
    /* students: [{name:'김채원'}, ...] 또는 ['김채원',...] */
    const cnt = {};
    students.forEach(s => {
      const n = typeof s === 'string' ? s : (s.name || '');
      const gn = _givenName(n);
      cnt[gn] = (cnt[gn] || 0) + 1;
    });
    return new Set(Object.keys(cnt).filter(gn => cnt[gn] > 1));
  }

  /**
   * _matchStudent: 앞 위치('/') 우선 매칭 → 뒤 위치 폴백
   * - 중복 givenName(dupGivens): fullName 정확 일치로 비교
   * - 일반: givenName 포함 관계로 비교
   * - 위치 우선순위: 앞('/') > 뒤('/')
   *   예) "승호/하진","하진/유진" 에서 "하진" → 앞 위치의 "하진/유진" 선택
   */
  function _matchStudent(csvStudentName, dbFullName, dupGivens) {
    if (!dbFullName) return false;
    const gn      = _givenName(dbFullName);
    const useFullName = dupGivens && dupGivens.has(gn);
    const cmpName = useFullName ? dbFullName : gn;
    const csvNames = _extractNamesFromCsv(csvStudentName);

    function nameHit(n) {
      if (useFullName) return n === cmpName;           // fullName: 정확 일치
      return n === cmpName || n.includes(cmpName) || cmpName.includes(n); // givenName: 포함
    }

    // ★ 1차: 앞 위치('/') 매칭
    if (csvNames.length > 0 && nameHit(csvNames[0])) return true;
    // ★ 2차: 뒤 위치 폴백
    if (csvNames.length > 1 && nameHit(csvNames[1])) return true;
    return false;
  }

  /**
   * _findMatchRow: 학생별 가장 적합한 xlsx 행 반환
   * 앞 위치 우선 탐색 → 뒤 위치 폴백 (행 단위 탐색)
   */
  function _findMatchRow(chRows, dbFullName, dupGivens) {
    const gn      = _givenName(dbFullName);
    const useFullName = dupGivens && dupGivens.has(gn);
    const cmpName = useFullName ? dbFullName : gn;

    function nameHit(n) {
      if (useFullName) return n === cmpName;
      return n === cmpName || n.includes(cmpName) || cmpName.includes(n);
    }

    // 1차: 학생명 앞 위치('/')에서 매칭되는 행
    const frontMatch = chRows.find(r => {
      const names = _extractNamesFromCsv(r['학생명'] || '');
      return names.length > 0 && nameHit(names[0]);
    });
    if (frontMatch) return frontMatch;

    // 2차: 학생명 뒤 위치에서 매칭되는 행 (폴백)
    return chRows.find(r => {
      const names = _extractNamesFromCsv(r['학생명'] || '');
      return names.length > 1 && nameHit(names[1]);
    }) || null;
  }

  /* ── 신규학생 예외 조건 ──
   * 미완료 + 게임만 공란 + 암기·리콜·스펠·스피킹·테스트 모두 공란
   */
  function _isNewStudentException(row) {
    const gameEmpty   = !row['게임'];
    const othersEmpty = ['암기','리콜','스펠','스피킹','테스트'].every(k => !row[k]);
    return gameEmpty && othersEmpty;
  }

  // ★ 면제 항목 저장 키: classId + bookId 조합
  function _exemptKey() {
    return 'bl_exempt_' + _st.matrixClassId + '_' + _st.matrixBookId;
  }
  // ★ 면제 항목 LocalStorage 영구 저장
  function _saveExempts(excs) {
    try { localStorage.setItem(_exemptKey(), JSON.stringify(excs)); } catch(e) {}
    _csvImportState.exceptions = excs;
  }
  // ★ 면제 항목 로드 (반/교재 전환 시 자동 복원)
  function _loadExempts() {
    try {
      const saved = localStorage.getItem(_exemptKey());
      _csvImportState.exceptions = saved ? JSON.parse(saved) : {};
    } catch(e) { _csvImportState.exceptions = {}; }
  }

  // ★ 해당 학생(이름)의 면제 항목 목록 반환
  function _getExemptItems(givenName) {
    if (!givenName) return [];
    const excs = _csvImportState.exceptions || {};
    // 성 제외 이름으로 매칭 (이름이 포함되면 적용)
    for (const [name, items] of Object.entries(excs)) {
      if (givenName.includes(name) || name.includes(givenName)) return items || [];
    }
    return [];
  }

  // ★ 면제 항목을 고려한 예외 체크
  // 미완료이고, 모든 공란 항목이 면제 항목이면 → 완료로 처리
  function _checkException(row, exemptItems) {
    if (!exemptItems || !exemptItems.length) return false;
    const ALL_COLS = ['암기','리콜','스펠','스피킹','게임','테스트'];
    // 공란인 항목들 중 면제되지 않은 것이 있으면 → 예외 아님
    const nonExemptEmpty = ALL_COLS.filter(c => !row[c] && !exemptItems.includes(c));
    return nonExemptEmpty.length === 0;
  }

  /* ── 세부항목 추출 ──
   * 미완료 + 해당 컬럼 공란 → 미수행 항목
   * 게임: '매칭' or '스크램블' 포함 시 해당 값으로 세부항목 추가
   */
  // ★ 수행 여부 판단: 공란('') 또는 0%(=0점, 미수행) 모두 미수행
  function _isColEmpty(val) {
    if (!val) return true;                      // 공란
    const s = String(val).trim();
    if (s === '' || s === '0%' || s === '0') return true; // 0%·0 = 미수행
    return false;
  }

  function _extractTasks(row, exemptItems=[]) {
    const tasks = [];
    const cols = ['암기','리콜','스펠','스피킹'];
    // ★ 공란 또는 0% → 미수행 (면제 항목 제외)
    cols.forEach(c => {
      if (_isColEmpty(row[c]) && !exemptItems.includes(c)) tasks.push(c);
    });
    /* 게임: 공란이면 미수행, '매칭…'/'스크램블…' 있으면 수행 */
    const game = (row['게임'] || '').trim();
    if (!game && !exemptItems.includes('게임')) {
      tasks.push('게임');
    }
    /* 테스트: 공란 또는 0 이면 미수행 */
    if (_isColEmpty(row['테스트']) && !exemptItems.includes('테스트')) {
      tasks.push('테스트');
    }
    return tasks;
  }

  /* ── 타임스탬프 기준 챕터 찾기 ──
   * CSV를 챕터 역순으로 순회, 첫 번째 완료율 ≥50% 챕터
   */
  function _findStampChapter(rows, chs) {
    /* ★ CSV 챕터 고유 목록: 제목+타입 조합으로 dedup (역순) */
    const csvChapters = []; // [{title, type}]
    const seen = new Set();
    for (let i = rows.length-1; i >= 0; i--) {
      const t   = rows[i]['제목']?.trim();
      const typ = rows[i]['타입']?.trim();
      const key = t + '||' + typ;
      if (t && !seen.has(key)) { csvChapters.push({title:t, type:typ}); seen.add(key); }
    }

    /* 각 제목+타입 조합별 완료율 계산 → 역순 첫 ≥50% 챕터 반환 */
    for (const {title:csvTitle, type:csvType} of csvChapters) {
      const titleRows = rows.filter(r =>
        r['제목']?.trim() === csvTitle && r['타입']?.trim() === csvType
      );
      if (!titleRows.length) continue;
      const done = titleRows.filter(r => r['완료']?.trim() === '완료').length;
      // ★ 50% 이상(포함): done/total >= 0.5 → done*2 >= total
      const pct  = done / titleRows.length * 100;
      if (pct >= 50) {
        /* ★ 학습현황 챕터에서 제목+타입 매칭 (_syncChaptersFromXlsx로 이미 동기화됨) */
        const fullTitle = `[${csvType}] ${csvTitle}`;
        // 1차: _matchChapter 정확 매칭
        let matched = chs.find(ch => _matchChapter(ch.title, csvTitle, csvType));
        // 2차: fullTitle 직접 매칭 (타입 접두사 포함)
        if (!matched) matched = chs.find(ch => ch.title === fullTitle);
        // 3차: 정규화 없이 title만 비교
        if (!matched) matched = chs.find(ch => ch.title.includes(csvTitle));
        if (matched) return matched.id;
        /* 매칭 실패 시: 계속 탐색 */
      }
    }
    return null;
  }

  function _nowStampStr() {
    const now = new Date();
    const ymd = now.toISOString().slice(0,10);
    const hm  = now.toTimeString().slice(0,5);
    return `${ymd} ${hm}`;
  }

  /* ── CSV 임포트 상태 (예외 설정) ── */
  const _csvImportState = {
    exceptionOn: false,
    // ★ 학생별 예외 항목: { givenName: ['암기','게임',...] }
    exceptions: {},
  };

  /* ── CSV 임포트 확인 모달 ── */
  function openCsvImportModal(file) {
    if (!_st.matrixClassId || !_st.matrixBookId) {
      _toast('⚠️ 반과 교재를 먼저 선택해주세요'); return;
    }
    /* 기존 모달 있으면 제거 */
    document.getElementById('bl-csv-modal')?.remove();

    const modal = document.createElement('div');
    modal.id = 'bl-csv-modal';
    modal.className = 'ov';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:150;display:flex;align-items:flex-end;justify-content:center';
    // ★ 기존 면제 설정 로드 (반 기준 영구 저장된 값)
    _loadExempts();
    // DB에서 더 상세한 정보(enabled 포함) 로드
    let _dbExcs = {};
    if (_st.matrixClassId && typeof BookLibDB!=='undefined' && BookLibDB.loadClassExempts) {
      _dbExcs = BookLibDB.loadClassExempts(_st.matrixClassId) || {};
      if (Object.keys(_dbExcs).length) {
        const simpleExcs = Object.fromEntries(Object.entries(_dbExcs).map(([n,v])=>[n, Array.isArray(v)?v:(v.items||[])]));
        _csvImportState.exceptions = simpleExcs;
      }
    }
    // CSV에서 학생명 목록 추출 (모달 표시용)
    const csvStudents = _extractCsvStudentNames(file);

    modal.innerHTML = `
      <div style="background:var(--card);border-radius:20px 20px 0 0;width:100%;max-width:540px;padding:20px 20px 32px;box-shadow:var(--sh2);animation:slideUp .22s ease;max-height:90vh;overflow-y:auto" onclick="event.stopPropagation()">
        <div style="width:40px;height:4px;border-radius:2px;background:var(--bdr2);margin:0 auto 16px"></div>
        <div style="font-size:16px;font-weight:800;color:var(--tx);margin-bottom:4px">📊 CSV 임포트</div>
        <div style="font-size:12px;color:var(--tx3);margin-bottom:16px">${_e(file.name)}</div>

        <!-- 규칙 안내 (접기 가능) -->
        <details style="margin-bottom:12px">
          <summary style="font-size:11px;font-weight:700;color:var(--tx3);cursor:pointer;padding:6px 0">▸ 매칭 규칙 안내</summary>
          <div style="font-size:11px;color:var(--tx3);line-height:1.9;padding:8px 0 0 8px">
            • CSV '제목'+'타입' → 챕터 매칭<br>
            • CSV '학생명'(예: 001.도현/수진) → 성 제외 이름 매칭<br>
            • 완료='완료' → 수행 처리 / '미완료' → 미수행+공란 항목 체크<br>
            • 타임스탬프: 역순 첫 완료율 ≥80% 챕터 → 이후 챕터 제외
          </div>
        </details>

        <!-- ★ 학생별 예외 설정 -->
        <div style="background:rgba(245,158,11,.06);border:1px solid rgba(245,158,11,.3);border-radius:12px;padding:14px;margin-bottom:14px">
          <div style="font-size:13px;font-weight:800;color:#92400e;margin-bottom:4px">🆕 학생별 미수행 항목 면제</div>
          <div style="font-size:11px;color:#b45309;margin-bottom:12px">특정 학생의 선택 항목이 비어있어도 수행 완료로 처리합니다</div>
          <div id="bl-exc-list" style="display:flex;flex-direction:column;gap:8px"></div>
          <button onclick="BooklibApp._addExcRow()"
            style="margin-top:10px;width:100%;padding:8px;border-radius:8px;background:rgba(245,158,11,.1);border:1.5px dashed rgba(245,158,11,.5);color:#92400e;font-size:12px;font-weight:700;cursor:pointer;font-family:var(--font)">
            ＋ 예외 학생 추가
          </button>
        </div>

        <div style="display:flex;gap:8px">
          <button style="flex:1;padding:12px;border-radius:10px;background:var(--surf2);border:1px solid var(--bdr2);color:var(--tx2);font-size:13px;font-weight:700;cursor:pointer;font-family:var(--font)"
                  onclick="document.getElementById('bl-csv-modal')?.remove()">취소</button>
          <button style="flex:2;padding:12px;border-radius:10px;background:var(--a);color:#fff;border:none;font-size:13px;font-weight:700;cursor:pointer;font-family:var(--font);box-shadow:0 3px 10px var(--a40)"
                  onclick="BooklibApp._confirmCsvImport()">📊 CSV 반영 시작</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    // ★ 기존 면제 항목 UI 복원 (DB에서 enabled 정보 포함)
    if (Object.keys(_dbExcs).length) {
      // DB에 상세 정보(enabled 포함) 있으면 우선 사용
      Object.entries(_dbExcs).forEach(([name, v]) => {
        const items = Array.isArray(v) ? v : (v.items || []);
        const enabled = typeof v === 'object' ? (v.enabled !== false) : true;
        _addExcRow(name, items, enabled);
      });
    } else {
      const savedExcs = _csvImportState.exceptions || {};
      Object.entries(savedExcs).forEach(([name, items]) => {
        _addExcRow(name, items);
      });
    }

    /* 임시로 file 참조 보관 */
    _csvImportState._pendingFile = file;
    modal.addEventListener('click', () => modal.remove());
  }

  // CSV에서 학생 이름 목록 (미리 추출해서 datalist에 활용)
  function _extractCsvStudentNames(file) {
    // file.text()는 비동기이므로 모달 렌더 후 채움
    // 빈 배열 반환 후 실제 파싱은 읽기 후 수행
    return [];
  }

  // ★ 예외 학생 행 추가
    function _addExcRow(name='', items=[], enabled=true) {
    const list = document.getElementById('bl-exc-list'); if (!list) return;
    const ALL_ITEMS = ['암기','리콜','스펠','스피킹','게임','테스트'];
    const rowId = 'exc-row-' + Date.now();
    const clsStudents = typeof StudentDB!=='undefined'
      ? StudentDB.getFiltered({classCode: (_getCls(_st.matrixClassId)||{}).name}).map(s=>s.name)
      : [];
    const div = document.createElement('div');
    div.id = rowId;
    div.style.cssText = `background:${enabled?'var(--card)':'var(--surf2)'};border:1.5px solid ${enabled?'var(--a40)':'var(--bdr2)'};border-radius:10px;padding:10px 12px;transition:all .15s`;
    div.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <input type="checkbox" id="${rowId}-ck" ${enabled?'checked':''}
          style="width:16px;height:16px;accent-color:var(--a);cursor:pointer;flex-shrink:0"
          onchange="const d=document.getElementById('${rowId}');d.style.opacity=this.checked?'1':'0.55';d._enabled=this.checked;d.style.borderColor=this.checked?'var(--a40)':'var(--bdr2)'">
        <div style="position:relative;flex:1">
          <input id="${rowId}-inp" class="f-inp" placeholder="이름(성 제외, 예: 도현)" value="${_e(name)}"
            style="width:100%;padding:6px 10px;font-size:12px" autocomplete="off"
            oninput="document.getElementById('${rowId}')._name=this.value;BooklibApp._excAutoComplete('${rowId}',this.value)">
          <div id="${rowId}-ac" style="display:none;position:absolute;left:0;right:0;top:100%;background:var(--card);border:1px solid var(--a40);border-radius:8px;z-index:200;max-height:140px;overflow-y:auto;box-shadow:0 4px 12px rgba(0,0,0,.15)"></div>
        </div>
        <button onclick="BooklibApp._deleteExcRow('${rowId}')"
          style="background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);color:#dc2626;border-radius:7px;padding:4px 8px;cursor:pointer;font-size:13px;flex-shrink:0">🗑</button>
      </div>
      <div style="font-size:10px;font-weight:800;color:var(--tx3);letter-spacing:.5px;margin-bottom:6px">면제 항목 선택 (체크된 항목은 비어있어도 완료 처리)</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${ALL_ITEMS.map(it=>`
          <label style="display:inline-flex;align-items:center;gap:4px;padding:4px 8px;background:var(--card2);border:1.5px solid ${items.includes(it)?'var(--a)':'var(--bdr2)'};border-radius:6px;cursor:pointer;font-size:11px;font-weight:700;color:var(--tx2)">
            <input type="checkbox" value="${it}" ${items.includes(it)?'checked':''}
              style="width:13px;height:13px;accent-color:var(--a);cursor:pointer"
              onchange="this.closest('label').style.borderColor=this.checked?'var(--a)':'var(--bdr2)'">
            ${it}
          </label>`).join('')}
      </div>`;
    div._name = name;
    div._enabled = enabled;
    div._clsStudents = clsStudents;
    list.appendChild(div);
    if(!enabled) div.style.opacity='0.6';
  }

  // ★ 면제 학생 행 삭제 (UI + DB)
  function _deleteExcRow(rowId) {
    const row = document.getElementById(rowId); if(!row) return;
    const nameInput = row.querySelector('input[type="text"]');
    const name = (nameInput?.value || row._name || '').trim();
    // DB에서 삭제
    if (name && _st.matrixClassId && typeof BookLibDB!=='undefined' && BookLibDB.loadClassExempts && BookLibDB.saveClassExempts) {
      const dbExcs = BookLibDB.loadClassExempts(_st.matrixClassId) || {};
      delete dbExcs[name];
      BookLibDB.saveClassExempts(_st.matrixClassId, dbExcs);
      // _csvImportState.exceptions에서도 제거
      if (_csvImportState.exceptions) delete _csvImportState.exceptions[name];
    }
    row.remove();
    _toast(`🗑 "${name}" 면제 학생 삭제`, 'success');
  }

  // ★ AutoComplete for 면제 학생 이름
  function _excAutoComplete(rowId, val) {
    const ac = document.getElementById(rowId+'-ac'); if(!ac) return;
    const row = document.getElementById(rowId); if(!row) return;
    const students = row._clsStudents || [];
    if(!val.trim()){ ac.style.display='none'; return; }
    const matches = students.filter(n => n.includes(val) || n.replace(/^./, '').includes(val));
    if(!matches.length){ ac.style.display='none'; return; }
    ac.innerHTML = matches.slice(0,8).map(n =>
      `<div onclick="document.getElementById('${rowId}-inp').value='${n}';document.getElementById('${rowId}')._name='${n}';document.getElementById('${rowId}-ac').style.display='none'"
        style="padding:7px 12px;font-size:12px;cursor:pointer;border-bottom:1px solid var(--bdr)"
        onmouseover="this.style.background='var(--a10)'" onmouseout="this.style.background=''">${n}</div>`
    ).join('');
    ac.style.display = 'block';
  }

  
  // ★ 예외 설정 수집 (모달 → _csvImportState.exceptions)
    function _collectExceptions() {
    const result = {};
    const list = document.getElementById('bl-exc-list'); if (!list) return result;
    list.querySelectorAll('[id^="exc-row-"]').forEach(row => {
      const enableCk = row.querySelector('[id$="-ck"]');
      const isEnabled = enableCk ? enableCk.checked : (row._enabled !== false);
      if (!isEnabled) return;
      const nameInput = row.querySelector('input[type="text"]');
      const name = (nameInput?.value || row._name || '').trim();
      if (!name) return;
      const checked = [...row.querySelectorAll('input[type="checkbox"]:checked')]
        .filter(c => c.type==='checkbox' && !c.id?.endsWith('-ck'))
        .map(c => c.value).filter(Boolean);
      if (checked.length) result[name] = checked;
    });
    return result;
  }

  function _collectExceptionsForSave() {
    const result = {};
    const list = document.getElementById('bl-exc-list'); if (!list) return result;
    list.querySelectorAll('[id^="exc-row-"]').forEach(row => {
      const enableCk = row.querySelector('[id$="-ck"]');
      const isEnabled = enableCk ? enableCk.checked : (row._enabled !== false);
      const nameInput = row.querySelector('input[type="text"]');
      const name = (nameInput?.value || row._name || '').trim();
      if (!name) return;
      const checked = [...row.querySelectorAll('input[type="checkbox"]:checked')]
        .filter(c => c.type==='checkbox' && !c.id?.endsWith('-ck'))
        .map(c => c.value).filter(Boolean);
      result[name] = { items: checked, enabled: isEnabled };
    });
    return result;
  }

  
  async function _confirmCsvImport() {
    // ★ 학생별 예외 항목 수집 + DB 저장 (반 기준)
    _csvImportState.exceptions = _collectExceptions();
    _csvImportState.exceptionOn = Object.keys(_csvImportState.exceptions).length > 0;
    const fullExcs = _collectExceptionsForSave();
    if (_st.matrixClassId && typeof BookLibDB!=='undefined' && BookLibDB.saveClassExempts) {
      BookLibDB.saveClassExempts(_st.matrixClassId, fullExcs);
    }
    document.getElementById('bl-csv-modal')?.remove();
    const file = _csvImportState._pendingFile;
    if (file) await importCsv(file);
  }

  /* ── 학습 현황 통계 바에 CSV 드롭존 바인딩 추가 ──
   * _renderMatrixTab / _refreshBody 호출 후 이 함수를 호출하면
   * 매트릭스 래퍼 영역에 드래그앤드롭 이벤트 등록
   */
  function _bindCsvDrop() {
    const wrap = document.getElementById('bl-mbody');
    if (!wrap || wrap._csvDropBound) return;
    wrap._csvDropBound = true;

    wrap.addEventListener('dragover', e => {
      if (!_hasCsvFile(e)) return;
      e.preventDefault();
      wrap.style.outline = '3px dashed var(--a)';
      wrap.style.outlineOffset = '-6px';
    });
    wrap.addEventListener('dragleave', e => {
      if (!wrap.contains(e.relatedTarget)) {
        wrap.style.outline = '';
        wrap.style.outlineOffset = '';
      }
    });
    wrap.addEventListener('drop', e => {
      wrap.style.outline = '';
      wrap.style.outlineOffset = '';
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;
      if (!/\.(xlsx|xls|csv)$/i.test(file.name)) { _toast('⚠️ .xlsx 또는 .csv 파일을 드롭해주세요'); return; }
      e.preventDefault();
      openCsvImportModal(file);
    });
  }

  function _hasCsvFile(e) {
    return Array.from(e.dataTransfer?.types || []).includes('Files');
  }

  /* ══ PUBLIC ══ */
  return{
    init,render,switchTab,
    _addExcRow,
    addBook,deleteBook,_renameBook,_excAutoComplete,
    openEditor,closeEditor,saveEditor,
    _pasteChapters,_delCh,_clearChs,_toggleAssign,
    _onRdToggle,_onRvCheck,_onRvName,_addReview,_delReview,
    _onClsChange,_onBkChange,
    _toggleStamp,_toggleCheck,_batchToggle,
    _saveSubTasks,_closeSubPopup,
    _chWider,_chNarrow,_toggleCollapse,
    openShare,closeShare,_copyText,_getShareText,
    openClassReport,closeReport,_getReportText,_webShare,_printReport,
    importCsv, openCsvImportModal, _confirmCsvImport, _syncChaptersFromXlsx,
    _saveExempts, _loadExempts,
    _archiveBook,_unarchiveBook,_copyBook, _openEvalTab,
    _toggleMultiSelect,_cancelMultiSelect,_multiArchive,_onMultiCkChange,
    _openRegModal, _modalAddBook, _toggleRegArea, _toggleArchivedSection, _deleteExcRow,
    _multiCopy, _multiDelete, _multiMoveUp, _multiMoveDown, _moveBook,
    _renameBook, _excAutoComplete,
  };
})();
