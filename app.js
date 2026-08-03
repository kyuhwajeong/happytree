/**
 * app.js — v10d
 * 수정:
 * 1. _renderMgClsContent: mgMk 기준 반만 표시/삭제
 * 2. _renderChips: 현재 주 년월 반만, 삭제된 반 미표시, 풍선글 tooltip
 * 3. 관리화면 월이동 달력 아이콘 추가
 * 4. 교재 복사 수정 (copyBooksToClass 정상 동작)
 * 5. PC drag&drop 재연결 (교재 추가 후에도 drag 유지)
 * 6. 교재 추가 후 포커스 유지 (PC+모바일)
 * 7. 교재명 더블클릭 인라인 수정
 * 8. 이전 편성 목록 교재 카드 하단에 표시
 */
const App = (() => {
  const DAYS=['월','화','수','목','금'];
  const DC={월:'mon',화:'tue',수:'wed',목:'thu',금:'fri'};

  // ★ 하단 탭 정의 (기본 순서)
  const NAV_DEF = [
    { pg:'dashboard',ico:'🏠', lbl:'홈',    adminOnly:true  },
    { pg:'operate',  ico:'📅', lbl:'진도',  adminOnly:false },
    { pg:'manage',   ico:'⚙️', lbl:'관리',  adminOnly:false },
    { pg:'booklib',  ico:'📖', lbl:'교재',  adminOnly:true  },
    { pg:'grade',    ico:'📝', lbl:'성적',  adminOnly:true  },
    { pg:'students', ico:'👨‍🎓', lbl:'학생', adminOnly:true  },
    { pg:'staff',    ico:'👩‍💼', lbl:'직원', adminOnly:true  },
    { pg:'archive',  ico:'📁', lbl:'콘텐츠', adminOnly:true  },
  ];
  const LS_NAV_ORDER = 'hk10b_nav_order';

  function _getNavOrder() {
    try {
      const saved = JSON.parse(localStorage.getItem(LS_NAV_ORDER));
      if (Array.isArray(saved) && saved.length === NAV_DEF.length
          && saved.every(pg => NAV_DEF.some(d => d.pg === pg))) {
        return saved;
      }
    } catch(e) {}
    return NAV_DEF.map(d => d.pg);
  }
  function _saveNavOrder(order) {
    localStorage.setItem(LS_NAV_ORDER, JSON.stringify(order));
  }
  function _getOrderedNav() {
    return _getNavOrder().map(pg => NAV_DEF.find(d => d.pg === pg)).filter(Boolean);
  }
  const PALETTES=[
    {id:'light1',name:'화이트',dark:false,accent:'#4f46e5',bg:'#f8f9fc',surf:'#fff',surf2:'#f1f3f9',card:'#fff',card2:'#f5f6fb',card3:'#eceef6',bdr:'#e2e4ef',bdr2:'#d0d3e8',tx:'#1a1a2e',tx2:'#5a5a7a',tx3:'#9898b8',emoji:'☀️'},
    {id:'light2',name:'페이퍼',dark:false,accent:'#0891b2',bg:'#f0f7fa',surf:'#fff',surf2:'#e8f4f8',card:'#fff',card2:'#e8f4f8',card3:'#d8ecf5',bdr:'#c5dde8',bdr2:'#aacfdf',tx:'#0c2d3e',tx2:'#3a6378',tx3:'#7aaabb',emoji:'🌊'},
    {id:'dark1',name:'다크',dark:true,accent:'#6366f1',bg:'#0b0b14',surf:'#13131f',surf2:'#1a1a28',card:'#1e1e2e',card2:'#242436',card3:'#2c2c42',bdr:'#2e2e48',bdr2:'#3a3a58',tx:'#ebebf5',tx2:'#8585a8',tx3:'#444466',emoji:'🌙'},
    {id:'dark2',name:'슬레이트',dark:true,accent:'#10b981',bg:'#091210',surf:'#111a17',surf2:'#172120',card:'#1b2a26',card2:'#20332e',card3:'#273d38',bdr:'#253d38',bdr2:'#2e4d46',tx:'#e8f5f0',tx2:'#7ab5a4',tx3:'#3a6055',emoji:'🌿'},
    {id:'system',name:'시스템',dark:null,accent:'#4f46e5',bg:'',surf:'',surf2:'',card:'',card2:'',card3:'',bdr:'',bdr2:'',tx:'',tx2:'',tx3:'',emoji:'📱'},
  ];
  const FONTS=[
    {key:'Noto Sans KR',label:'Noto Sans KR',sample:'가나다 Aa'},
    {key:'Nanum Gothic',label:'나눔고딕',sample:'가나다 Aa'},
    {key:'Nanum Myeongjo',label:'나눔명조',sample:'가나다 Aa'},
    {key:'IBM Plex Sans KR',label:'IBM Plex KR',sample:'가나다 Aa'},
  ];
  const LS_REM='hk10b_rem_id', LS_REM_PW='hk10b_rem_pw';
  const AUTO_LOGOUT_MS=12*60*60*1000; // 12시간

  // ★★★ 데이터 유실 방지: 입력 후 최대 1500ms 동안은 DB.autoSave()조차 아직 호출 안 된 상태.
  //   이 사이 반 전환·화면 이탈·앱 종료가 일어나면 값이 통째로 증발할 수 있어,
  //   "저장 대기 중"인 입력요소를 추적해뒀다가 화면이 숨겨지는 순간 강제로 즉시 저장시킨다.
  const _dirtyFields = new Set();
  function _flushAllDirtyFields(){
    _dirtyFields.forEach(el=>{
      try{ clearTimeout(el._st); el.dispatchEvent(new Event('blur')); }catch(e){}
    });
    _dirtyFields.clear();
    if(typeof DB!=='undefined' && DB.flushPendingWrites) DB.flushPendingWrites(); // db.js 쪽 800ms 대기분도 함께 즉시 반영
  }
  if(typeof document!=='undefined'){
    document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='hidden') _flushAllDirtyFields(); });
    window.addEventListener('pagehide', _flushAllDirtyFields);
    // ★ firebase-config.js가 좀비 연결 복구 최후수단(자동 새로고침) 전에 보내는 신호
    window.addEventListener('fb:force-flush-before-reload', _flushAllDirtyFields);
  }

  // ★★★ 신규: 수동 저장 버튼 + 미저장 뱃지 + 닫기 전 경고 ★★★
  function _pendingTotal(){ return _dirtyFields.size + (typeof DB!=='undefined' && DB.getPendingCount ? DB.getPendingCount() : 0); }
  function _updateSaveBadge(){
    const b=_q('save-badge'); if(!b) return;
    const n=_pendingTotal();
    if(n>0){ b.textContent=n; b.classList.remove('hidden'); } else b.classList.add('hidden');
  }
  if(typeof window!=='undefined'){
    setInterval(_updateSaveBadge, 1000);
    window.addEventListener('beforeunload', e=>{
      if(_pendingTotal()>0){ e.preventDefault(); e.returnValue=''; }
    });
  }
  async function forceSaveNow(){
    const before=_pendingTotal();
    if(before===0){ _toast('저장할 변경사항이 없습니다 ✅','success',2000); return; }
    _flushAllDirtyFields();
    await new Promise(r=>setTimeout(r,400));
    const after=_pendingTotal();
    _updateSaveBadge();
    if(after===0) _toast('✅ 모든 진도가 서버에 저장되었습니다','success',2500);
    else _toast(`⏳ ${after}건 저장 중입니다. 네트워크 상태를 확인해주세요`,'warn',3500);
  }

  const S={
    page:'dashboard', mgTab:'classes',
    selCls:null, monday:_mon(new Date()),
    mgMk:DB.monthKey(new Date()),
    editClsId:null, editAccId:null, copyFromClsId:null, copyToClsId:null,
    tmpTheme:null, viewMode:'grid', operateView:'grid',
    progressViewMode:'timeline', // ★ 신규: 'timeline' | 'weekly'
    tlLayout: (localStorage.getItem('bl_tl_layout')||'grid'), // ★ 신규: 타임라인 카드 좌우(grid)/세로(list) 배치, 기기별 개인 설정
    tlAnchor: null, // ★ 신규: 타임라인 이전/다음 탐색 기준일. null이면 "실제 오늘" 기준(항상 최신 상태로 계산)
    calY:new Date().getFullYear(), calM:new Date().getMonth(),
    // 관리화면 달력
    mgCalY:new Date().getFullYear(), mgCalM:new Date().getMonth(),
    shareActive:false, showHistory:false,
  };
  const mq=window.matchMedia?.('(prefers-color-scheme: dark)');
  let _autoLogoutTimer=null;
  let _drag={item:null,bookId:null,name:'',fromZone:null,clsId:null,mk:null};
  let _lpTimer=null, _lpActive=false, _lpStartX=0, _lpStartY=0;
  let _lastPoolFocusCls=null; // ★ 교재 목록 입력창 중 "마지막으로 실제 사용한 반"만 재포커스하기 위한 추적 (자동 스크롤 이동 버그 수정용)

  function _resetAutoLogout(){
    clearTimeout(_autoLogoutTimer);
    if(!DB.isLoggedIn())return;
    _autoLogoutTimer=setTimeout(async()=>{
      if(DB.isLoggedIn()){
        // ★ 로그아웃 직전, 디바운스 대기 중이던 진도/메모 입력을 즉시 강제 전송
        //   (그냥 로그아웃하면 800ms~1.5s 디바운스 타이머가 취소되어 마지막 입력이
        //    서버에 반영되지 않은 채로 남을 수 있음 — 반드시 먼저 확실히 밀어넣는다)
        try {
          if (typeof DB.flushPendingWrites === 'function') DB.flushPendingWrites();
          if (typeof FireDB !== 'undefined' && typeof FireDB.syncNow === 'function') await FireDB.syncNow();
        } catch(e) { console.warn('[AutoLogout] flush 실패', e); }

        const _prevPage = S.page;
        DB.clearSession();_refreshAuthUI();go('operate');
        _toast('⏰ 12시간 미사용으로 자동 로그아웃되었습니다 — 다시 로그인해주세요');
        // 토스트만으로는 눈에 띄지 않고 지나칠 수 있으므로, 로그인 게이트를
        // 강제로 다시 띄워 "재로그인이 필요한 상태"임을 명확히 인지시킨다.
        _showLogin(_prevPage && _prevPage!=='operate' ? _prevPage : '');
      }
    },AUTO_LOGOUT_MS);
  }

  /* ══ INIT ══ */
  async function init(){
    _setLogoImages();
    setTimeout(()=>window.scrollTo(0,1),300);
    // ★ 저장된 탭 순서로 nav 초기 렌더
    _renderNav();

    // LS 마이그레이션
    ['cls','prog','acc','theme'].forEach(k=>{
      const ok='hk10_'+k, nk='hk10b_'+k;
      if(!localStorage.getItem(nk)&&localStorage.getItem(ok))localStorage.setItem(nk,localStorage.getItem(ok));
    });

    const p=new URLSearchParams(location.search);
    if(p.has('share')){
      _setSt('로딩 중...');
      await DB.init();
      document.getElementById('app').style.display='none';
      document.getElementById('share-view').classList.add('on');
      document.getElementById('splash').classList.add('out');
      setTimeout(()=>document.getElementById('splash').style.display='none',400);
      _applyTheme(DB.getTheme());
      DB.on('progress',_refreshShareProgress);
      DB.on('classes',()=>{if(_shareRenderData)_refreshShareProgress();});
      _renderShareView(p.get('share'),p.get('mon')); // mon=YYYY-MM-DD 파라미터
      return;
    }

    /* ★ 성적 리포트 공유 링크 처리 */
    if(p.has('rpt')){
      _setSt('리포트 로딩 중...');
      await DB.init();
      document.getElementById('splash').classList.add('out');
      setTimeout(()=>document.getElementById('splash').style.display='none',400);
      try{
        const snap = await FireDB.get(`hakwon10/sharedReports/${p.get('rpt')}`);
        if(snap?.html){
          document.open();
          document.write(snap.html);
          document.close();
        } else {
          document.body.innerHTML='<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;color:#6b7280"><div style="font-size:48px;margin-bottom:12px">🔍</div><div style="font-size:16px;font-weight:700">리포트를 찾을 수 없습니다</div><div style="font-size:13px;margin-top:6px">링크가 만료되었거나 잘못된 주소입니다</div></div>';
        }
      } catch(e){
        console.error('[rpt viewer]',e);
        document.body.innerHTML='<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;color:#ef4444">로드 오류: '+e.message+'</div>';
      }
      return;
    }

    _setSt('연결 중...');
    try{await DB.init();}catch(e){console.error(e);}
    _setSt('준비 완료!');

    // ★ 학생 관리 모듈 초기화 (독립 모듈 — 오류 시 기존 기능 영향 없음)
    if (typeof StudentApp  !== 'undefined') StudentApp.init().catch(e=>console.warn('[StudentApp]',e));
    // ★ 교재 학습 관리 모듈 초기화 (독립 모듈 — 오류 시 기존 기능 영향 없음)
    if (typeof BooklibApp  !== 'undefined') BooklibApp.init().catch(e=>console.warn('[BooklibApp]',e));
    if (typeof StaffApp    !== 'undefined') StaffApp.init().catch(e=>console.warn('[StaffApp]',e));
    if (typeof GradeApp    !== 'undefined') GradeApp.init().catch(e=>console.warn('[GradeApp]',e));
    // ★ 공지 알림 팝업 모듈 초기화 (독립 모듈 — 오류 시 기존 기능 영향 없음)
    if (typeof NoticeApp   !== 'undefined') NoticeApp.init().catch(e=>console.warn('[NoticeApp]',e));
    // ★ 대시보드(홈) 모듈 초기화 (독립 모듈 — 오류 시 기존 기능 영향 없음)
    if (typeof DashboardApp!== 'undefined') DashboardApp.init().catch(e=>console.warn('[DashboardApp]',e));
    // ★ 일정표 모듈 초기화 (독립 모듈 — 오류 시 기존 기능 영향 없음)
    if (typeof ScheduleApp !== 'undefined') ScheduleApp.init().catch(e=>console.warn('[ScheduleApp]',e));
    // ★ 자료실 모듈 초기화 (독립 모듈 — 오류 시 기존 기능 영향 없음)
    if (typeof ArchiveApp  !== 'undefined') ArchiveApp.init().catch(e=>console.warn('[ArchiveApp]',e));
    // ★ 영문 교육자료 모듈 초기화 (독립 모듈 — 오류 시 기존 기능 영향 없음)
    if (typeof EduVideoApp !== 'undefined') EduVideoApp.init().catch(e=>console.warn('[EduVideoApp]',e));
    // ★ 학습 게임 모듈 초기화 (독립 모듈 — 오류 시 기존 기능 영향 없음)
    if (typeof GameApp !== 'undefined') GameApp.init().catch(e=>console.warn('[GameApp]',e));
    // ★ 배경 이미지 모듈 초기화 (독립 모듈 — 오류 시 기존 기능 영향 없음, 미설정 시 기존 단색 배경 그대로)
    if (typeof BgTheme !== 'undefined') BgTheme.init().catch(e=>console.warn('[BgTheme]',e));

    DB.on('classes',()=>{_renderChips();if(S.page==='operate')_renderOperateBody();if(S.page==='manage'&&S.mgTab==='classes'){_renderMgCls();if(_q('mg-fee-ov')&&!_q('mg-fee-ov').classList.contains('hidden'))_renderFeePanel();}});
    DB.on('progress',()=>{if(S.page==='operate')_renderOperateBody();if(S.shareActive)_refreshShareProgress();});
    DB.on('theme',()=>{_applyTheme(DB.getTheme());S.progressViewMode=DB.getTheme().progressViewMode||'timeline';if(S.page==='operate')_renderOperateBody();if(S.page==='manage'&&S.mgTab==='theme')_renderMgTheme();if(S.page==='dashboard'&&typeof DashboardApp!=='undefined')DashboardApp.render();});
    // ★ admin이 다른 기기에서 이 계정의 역할·담당 반·메뉴 접근 권한을 바꾸면,
    //   재로그인 없이 지금 이 세션에도 즉시 반영(하단 nav 갱신 + 현재 화면 권한 재검사)
    DB.on('session',()=>{
      if(!DB.isLoggedIn()){_toast('⚠️ 계정이 삭제되어 로그아웃되었습니다','error',4000);location.reload();return;}
      _refreshAuthUI();
      go(S.page); // ★ go() 내부에서 현재 페이지 권한을 다시 검사 — 더 이상 허용되지 않으면 자동으로 안전한 화면으로 이동
    });
    // ★ 반(교재배정 등) 동기화 충돌 감지 → 사용자에게 선택 요청
    if(typeof DB.onConflict==='function') DB.onConflict(_showSyncConflict);

    const t=DB.getTheme();
    S.viewMode=t.viewMode||'grid'; S.operateView=t.operateView||'grid';
    S.progressViewMode=t.progressViewMode||'timeline'; // ★ 신규
    _applyTheme(t); _syncDot(FireDB.ready()?'on':'off');
    mq?.addEventListener('change',()=>{if(DB.getTheme().palette==='system')_applyTheme(DB.getTheme());});
    ['touchstart','mousedown','keydown'].forEach(ev=>document.addEventListener(ev,_resetAutoLogout,{passive:true}));
    history.pushState({pg:'dashboard'},'');
    window.addEventListener('popstate',_onBack);
    setTimeout(_hideSplash,400);
  }

  function _setLogoImages(){
    if(typeof LOGO==='undefined')return;
    ['spl-logo-img','op-logo'].forEach(id=>{const el=document.getElementById(id);if(el)el.src=LOGO.small;});
  }
  function _hideSplash(){const sp=document.getElementById('splash');sp.classList.add('out');setTimeout(()=>{sp.style.display='none';document.getElementById('app').classList.remove('hidden');
      if(!DB.isLoggedIn()){_showLogin();}else{
        // ★ 새로고침 전에 보고 있던 화면을 그대로 복원 — 연결 문제로
        //   조용히 새로고침되더라도 사용자가 엉뚱한(기본) 화면에 던져지지 않게 함
        let lastPage=null;
        try{lastPage=sessionStorage.getItem('hk10b_lastPage');}catch(e){}
        go(lastPage||S.page||'dashboard');
        let wasAutoReload=false;
        try{wasAutoReload=sessionStorage.getItem('hk10b_wasAutoReload')==='1';sessionStorage.removeItem('hk10b_wasAutoReload');}catch(e){}
        if(wasAutoReload) setTimeout(()=>_toast('🔄 연결이 복구되어 화면이 새로 불러와졌어요','',3200),600);
      }
    },480);}
  function _setSt(m){const e=_q('spl-st');if(e)e.textContent=m;}
  function _syncDot(s){const d=_q('sync-dot');if(!d)return;d.style.background=s==='on'?'var(--green)':s==='saving'?'var(--orange)':'var(--tx3)';}

  function _applyTheme(t){
    const rs=document.documentElement.style;
    let pal=PALETTES.find(p=>p.id===(t.palette||'light1'))||PALETTES[0];
    if(pal.id==='system')pal=mq?.matches?PALETTES[2]:PALETTES[0];
    document.body.classList.toggle('dark',!!pal.dark);
    const rgb=_hrgb(pal.accent);
    rs.setProperty('--a',pal.accent);
    ['10','20','40','60'].forEach(x=>rs.setProperty(`--a${x}`,`rgba(${rgb.r},${rgb.g},${rgb.b},0.${x=='10'?'10':x=='20'?'20':x=='40'?'40':'60'})`));
    if(pal.id!=='system')['bg','surf','surf2','card','card2','card3','bdr','bdr2','tx','tx2','tx3'].forEach(k=>rs.setProperty(`--${k}`,pal[k]));
    const ff=t.fontFamily||'Noto Sans KR';
    rs.setProperty('--font',`'${ff}',sans-serif`); document.body.style.fontFamily=`'${ff}',sans-serif`;
    const fz=t.fontSize||14;
    rs.setProperty('--fz',`${fz}px`); rs.setProperty('--fzs',`${Math.round(fz*.79)}px`);
    rs.setProperty('--fzm',`${Math.round(fz*1.14)}px`); rs.setProperty('--fzl',`${Math.round(fz*1.36)}px`); rs.setProperty('--fzh',`${Math.round(fz*1.64)}px`);
    rs.setProperty('--fz-main',`${t.mainFontSize||fz}px`);
    rs.setProperty('--fz-sub',`${t.subFontSize||Math.max(fz-1,10)}px`);
    rs.setProperty('--inp-w',`${t.inputBoxWidth||140}px`);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content',pal.bg||'#f8f9fc');
    if (typeof BgTheme !== 'undefined' && BgTheme.render) BgTheme.render(t); // ★ 배경 이미지 반영(꺼져 있으면 아무 변화 없음)
  }

  /* ══ PAGE NAV ══ */
  function go(page){
    if(page==='manage'  &&!DB.isLoggedIn()){_showLogin('manage');return;}
    if(page==='manage'  &&DB.getRole()==='teacher'){go('operate');return;}
    // ★ 홈·콘텐츠도 admin이 계정별로 할당한 메뉴에 포함된 경우에만 접근 가능(그 외엔 항상 열려있는 '진도'로 이동)
    if(page==='dashboard'&&!DB.isAdmin()){
      const _am=(DB.getSession()?.allowedMenus)||[];
      if(!_am.includes('dashboard')){ if(DB.canOperate()){go('operate');return;} _showLogin();return; }
    }
    if(page==='archive'&&!DB.isAdmin()){
      if(!DB.canOperate()){_showLogin();return;}
      const _am=(DB.getSession()?.allowedMenus)||[];
      if(!_am.includes('archive')){go('operate');return;}
    }
    if(page==='students'&&!DB.isAdmin()){
      const _am=(DB.getSession()?.allowedMenus)||[];
      if(!_am.includes('students')){_showLogin();return;}
    }
    if(page==='staff'   &&!DB.isAdmin()){
      const _am=(DB.getSession()?.allowedMenus)||[];
      if(!_am.includes('staff')){_showLogin();return;}
    }
    // ★ 교재·성적: admin은 항상 허용, 비관리자는 allowedMenus 포함 여부로 판단(강사·운용자 공통)
    if(page==='booklib'&&!DB.isAdmin()){
      const _am=(DB.getSession()?.allowedMenus)||[];
      if(!_am.includes('booklib')){_showLogin();return;}
    }
    if(page==='grade'&&!DB.isAdmin()){
      const _am=(DB.getSession()?.allowedMenus)||[];
      if(!_am.includes('grade')){_showLogin();return;}
    }
    S.page=page;
    if (typeof BgTheme !== 'undefined' && BgTheme.setPage) BgTheme.setPage(page); // ★ 화면 밀도에 맞춰 배경 스크림 재계산
    try{sessionStorage.setItem('hk10b_lastPage',page);}catch(e){}
    document.querySelectorAll('.page').forEach(p=>p.classList.remove('on'));
    document.querySelectorAll('.bni').forEach(n=>n.classList.remove('on'));
    document.getElementById('page-'+page)?.classList.add('on');
    document.querySelector(`[data-pg="${page}"]`)?.classList.add('on');
    history.pushState({pg:page},'');
    if(page==='dashboard'&&typeof DashboardApp!=='undefined') DashboardApp.render();
    if(page==='operate') {_renderChips();_renderWeekNav();_renderOperateBody();}
    if(page==='manage')  _renderManage();
    if(page==='students'&&typeof StudentApp!=='undefined') StudentApp.render();
    if(page==='booklib' &&typeof BooklibApp!=='undefined') BooklibApp.render();
    if(page==='staff'   &&typeof StaffApp  !=='undefined') StaffApp.render();
    if(page==='archive' &&typeof ArchiveApp!=='undefined') ArchiveApp.render();
    if(page==='grade'   &&typeof GradeApp  !=='undefined') GradeApp.render();
    // ★ render() 이후 호출해야 동적으로 생성된 로그아웃 버튼이 DOM에 존재함
    _refreshAuthUI();
  }

  // ★ 특정 반을 선택한 상태로 진도(운용) 화면으로 이동 (대시보드 '오늘의 수업' 등에서 사용)
  function goClass(clsId){
    const cls=(DB.getActiveClasses()||[]).find(c=>c.id===clsId)||(DB.getClassById?DB.getClassById(clsId):null);
    if(cls) S.selCls=cls;
    S.tlAnchor=null; // ★ 이전에 다른 날짜를 탐색 중이었더라도 항상 "오늘" 기준으로 열리도록 초기화
    go('operate');
  }

  function _onBack(e){
    const state=e.state;
    if(!state){history.pushState({pg:S.page},'');return;}
    const modals=['login-gate','modal-cls','modal-acc','modal-copy','cal-ov','mg-cal-ov','mg-fee-ov',
                  'st-detail-ov','st-tc-ov','bl-editor-ov','bl-share-ov','bl-report-ov',
                  'sf-edit-ov','sf-cal-ov','sf-work-ov','sf-batch-ov',
                  'sf-overlap-ov','sf-templ-add-ov','sf-qsave-ov',
                  'sf-hometab-ov','sf-payhist-ov',
                  'sf-prev-ov',
                  'gr-cfg-ov','gr-rpt-ov'];
    // sf-prev-ov(PDF미리보기)는 classList 없이 remove()로 동작하므로 별도 처리
    const prevOv = document.getElementById('sf-prev-ov');
    if (prevOv) { prevOv.remove(); history.pushState({pg:S.page},''); return; }
    for(const id of modals){const el=_q(id);if(el&&!el.classList.contains('hidden')){el.classList.add('hidden');history.pushState({pg:S.page},'');return;}}
    if(S.page==='manage'  ){go('operate');return;}
    if(S.page==='students'){go('operate');return;}
    if(S.page==='booklib' ){go('operate');return;}
    if(S.page==='staff'   ){go('operate');return;}
    if(S.page==='archive' ){go('operate');return;}
    if(S.page==='grade'   ){go('operate');return;}
    if(S.page==='operate' ){go('dashboard');return;}
    history.pushState({pg:'dashboard'},'');
  }

  function _refreshAuthUI(){
    const loggedIn=DB.isLoggedIn(), isAdmin=DB.isAdmin();
    _q('op-logout-btn')?.classList.toggle('hidden',!loggedIn);
    _q('op-share-btn')?.classList.toggle('hidden',!(isAdmin&&S.page==='operate'));
    _q('admin-badge')?.classList.toggle('hidden',!isAdmin);
    _q('mg-logout-btn')?.classList.toggle('hidden',!loggedIn);
    // ★ 교재·성적·학생·직원 페이지 로그아웃 버튼 — render() 이후 호출되므로 DOM에 항상 존재
    _q('bl-logout-btn')?.classList.toggle('hidden',!loggedIn);
    _q('gr-logout-btn')?.classList.toggle('hidden',!loggedIn);
    _q('st-logout-btn')?.classList.toggle('hidden',!loggedIn);
    _q('sf-logout-btn')?.classList.toggle('hidden',!loggedIn);
    // ★ admin 전용 탭 표시/숨김 → 동적 nav 렌더로 교체
    _renderNav();
    // ★ 공지 알림 🔔 버튼 표시 상태 갱신 (독립 모듈)
    if (typeof NoticeApp !== 'undefined') NoticeApp.refreshUI();
    // ★ 대시보드 로그아웃/관리자 배지 갱신 (독립 모듈)
    if (typeof DashboardApp !== 'undefined' && DashboardApp._refreshBadges) DashboardApp._refreshBadges();
    if(loggedIn)_resetAutoLogout();
  }

  // ★ 하단 nav 동적 렌더 (순서 + 권한 반영)
  function _renderNav() {
    const nav = document.querySelector('.bnav');
    if (!nav) return;
    const isAdmin = DB.isAdmin();
    const role    = DB.getRole();
    const ordered = _getOrderedNav();

    // 기존 bni 버튼 모두 제거 (ver-lbl은 유지)
    [...nav.querySelectorAll('.bni')].forEach(b => b.remove());
    const verLbl = nav.querySelector('.ver-lbl');

    ordered.forEach(def => {
      // 권한 체크: admin은 모두 표시
      if (def.adminOnly && !isAdmin) {
        // ★ 강사·운용자 공통: allowedMenus에 포함된 메뉴만 탭 표시 허용
        const _am = (DB.getSession()?.allowedMenus) || [];
        if (!_am.includes(def.pg)) return;
      }
      if (def.pg === 'manage' && role === 'teacher') return;

      const btn = document.createElement('button');
      btn.className = 'bni' + (S.page === def.pg ? ' on' : '');
      btn.setAttribute('data-pg', def.pg);
      btn.id = `nav-${def.pg}-btn`;
      btn.innerHTML = `<span class="ico">${def.ico}</span>${def.lbl}`;
      btn.onclick = () => App.go(def.pg);
      nav.insertBefore(btn, verLbl);
    });
    // ★ 작은 폰 화면(≤400px)에서 탭이 5개를 넘으면 라벨을 숨기고 아이콘만 크게 보여
    //   공간을 확보한다(style.css의 @media(max-width:400px) .bnav-dense 규칙과 짝).
    nav.classList.toggle('bnav-dense', nav.querySelectorAll('.bni').length > 5);
  }

  /* ══ LOGIN ══ */
  function _showLogin(redirect=''){
    S._loginRedirect=redirect||'';
    const si=localStorage.getItem(LS_REM)||'', sp=localStorage.getItem(LS_REM_PW)||'';
    _q('li-id').value=si; _q('li-pw').value=sp; _q('li-err').textContent='';
    _q('li-remember').checked=!!si;
    _q('login-gate').classList.remove('hidden');
    history.pushState({pg:'login'},'');
    setTimeout(()=>(sp?_q('li-pw'):si?_q('li-pw'):_q('li-id')).focus(),300);
  }
  function cancelLogin(){
    // 로그인 창만 닫고 현재 페이지 유지 (페이지 이동 없음)
    _q('login-gate').classList.add('hidden');
    history.pushState({pg:S.page},'');
  }
  function doLogin(){
    const id=_q('li-id').value.trim(), pw=_q('li-pw').value;
    const acc=DB.login(id,pw);
    if(acc){
      if(_q('li-remember').checked){localStorage.setItem(LS_REM,id);localStorage.setItem(LS_REM_PW,pw);}
      else{localStorage.removeItem(LS_REM);localStorage.removeItem(LS_REM_PW);}
      _q('login-gate').classList.add('hidden'); _refreshAuthUI();
      const role=DB.getRole();
      let dest=S._loginRedirect;
      if(!dest){
        if(role==='teacher') dest='operate';
        else if(DB.isAdmin()) dest='manage';
        else{
          // ★ 운용자: 예전엔 무조건 admin 전용 색이 짙은 '관리' 화면으로 보내서
          //   admin이 메뉴 권한을 줘도 뭘 쓸 수 있는지 못 찾는 것처럼 보였던 문제 수정.
          //   홈(대시보드)이 허용됐으면 홈으로, 아니면 항상 열려있는 '진도'로 보낸다.
          const _am=(DB.getSession()?.allowedMenus)||[];
          dest=_am.includes('dashboard')?'dashboard':'operate';
        }
      }
      go(dest);
      S._loginRedirect='';
      _toast(`✅ ${acc.username} (${acc.role==='admin'?'관리자':acc.role==='teacher'?'강사':'운용자'}) 로그인`,'success');
    } else {_q('li-err').textContent='⚠️ 아이디 또는 비밀번호가 올바르지 않습니다';_q('li-pw').value='';}
  }
  async function logout(){
    // ★ 로그아웃 직전, 대기 중인 진도/메모 입력을 즉시 강제 전송해 유실 방지
    try {
      if (typeof DB.flushPendingWrites === 'function') DB.flushPendingWrites();
      if (typeof FireDB !== 'undefined' && typeof FireDB.syncNow === 'function') await FireDB.syncNow();
    } catch(e) { console.warn('[logout] flush 실패', e); }

    DB.clearSession();
    clearTimeout(_autoLogoutTimer);
    go('operate');
    _refreshAuthUI();
    _toast('로그아웃 되었습니다');
    // ★ 로그아웃 즉시 로그인 창 표시
    _showLogin('');
  }

  /* ══ 운용 - 칩 ══ */
  // ════════════════════════════════════════
  // 수업 시간 기준 반/요일 자동 포커스
  // ════════════════════════════════════════

  // HH:MM 문자열 → 분(int) 변환
  function _timeToMin(t){
    if(!t||!t.includes(':'))return null;
    const [h,m]=t.split(':').map(Number);
    return h*60+m;
  }

  // 현재 시각(분)과 반의 오늘 수업 시간 거리 계산
  // 수업 중이면 -1(최우선), 없으면 Infinity
  function _clsTimeDist(cls,todayDow,nowMin){
    const dt=cls.dayTimes?.[todayDow];
    if(!dt)return Infinity;
    const s=_timeToMin(dt.start), e=_timeToMin(dt.end);
    if(s!==null&&e!==null){
      if(nowMin>=s&&nowMin<=e)return -1; // 수업 중
      if(nowMin<s)return s-nowMin;       // 수업 전
      return nowMin-e;                   // 수업 후
    }
    if(s!==null)return Math.abs(nowMin-s);
    if(e!==null)return Math.abs(nowMin-e);
    return Infinity;
  }

  // unique 반 목록 중 오늘 기준 가장 근접한 반 반환
  function _pickClassByTime(unique){
    const DAYS_KO=['일','월','화','수','목','금','토'];
    const now=new Date();
    const todayDow=DAYS_KO[now.getDay()];
    const nowMin=now.getHours()*60+now.getMinutes();
    let best=null, bestDist=Infinity;
    unique.forEach(cls=>{
      if(!(cls.days||[]).includes(todayDow))return; // 오늘 수업 없는 반 제외
      const d=_clsTimeDist(cls,todayDow,nowMin);
      if(d<bestDist){bestDist=d;best=cls;}
    });
    return best; // null이면 오늘 수업 없는 날
  }

  // 오늘 요일 카드로 스크롤 + 수업 중/근접 카드 하이라이트
  function _scrollToFocusDay(container){
    const DAYS_KO=['일','월','화','수','목','금','토'];
    const now=new Date();
    const todayDow=DAYS_KO[now.getDay()];
    const nowMin=now.getHours()*60+now.getMinutes();
    const cls=S.selCls; if(!cls)return;
    const dt=cls.dayTimes?.[todayDow];
    // 오늘 카드 찾기 (is-today 클래스)
    const todayCard=container.querySelector('.day-card.is-today');
    if(!todayCard)return;
    // 수업 중이거나 가까운 경우 하이라이트 링 추가
    if(dt){
      const s=_timeToMin(dt.start), e=_timeToMin(dt.end);
      const inSession=s!==null&&e!==null&&nowMin>=s&&nowMin<=e;
      const nearSession=s!==null&&nowMin<s&&(s-nowMin)<=60; // 1시간 이내
      if(inSession){
        todayCard.classList.add('cls-in-session');
      } else if(nearSession){
        todayCard.classList.add('cls-near-session');
      }
    }
    // 오늘 카드로 부드럽게 스크롤
    setTimeout(()=>{
      todayCard.scrollIntoView({behavior:'smooth',block:'nearest',inline:'start'});
    },120);
  }

  function _renderChips(){
    const wrap=_q('op-chips'); if(!wrap)return; wrap.innerHTML='';
    // ★ 현재 주의 년월 기준 반만 표시 (삭제/종료된 반 포함 안 함)
    const curMk=DB.monthKey(S.monday);
    let classes=DB.getClassesForMonth(curMk);
    // 해당 월에 없으면 현재 활성 반
    if(!classes.length) classes=DB.getActiveClasses();
    // ★ 강사: 담당 반만 표시 (id 또는 name으로 매칭)
    if(DB.getRole()==='teacher'){
      const tcIds=DB.getTeacherClasses();
      if(tcIds.length){
        // 저장된 teacherClasses는 id 배열 또는 name 배열일 수 있음
        const allCls=DB.getActiveClasses();
        const tcNames=tcIds.map(id=>{
          const cls=allCls.find(c=>c.id===id);
          return cls?cls.name:id; // id로 못 찾으면 name으로 간주
        });
        classes=classes.filter(c=>tcIds.includes(c.id)||tcNames.includes(c.name));
      } else {
        // 담당 반이 없으면 아무것도 표시 안 함 (빈 화면 = 미설정)
        classes=[];
      }
    }
    if(!classes.length){
      wrap.innerHTML='<span style="font-size:11px;color:var(--tx3);white-space:nowrap">관리 메뉴에서 반을 추가하세요</span>';
      return;
    }
    // 같은 이름 중복 제거 (현재 월 기준 하나만)
    const seen=new Set();
    const unique=classes.filter(c=>{if(seen.has(c.name))return false;seen.add(c.name);return true;});
    if(S.selCls&&!unique.find(c=>c.id===S.selCls.id))S.selCls=null;
    // ★ 처음 진입(selCls 없음)이면 시간 기준 가장 근접 반 자동 선택
    if(!S.selCls) S.selCls=_pickClassByTime(unique)||unique[0];

    unique.forEach(cls=>{
      const b=document.createElement('button');
      // ★ 오늘 수업 있는 반은 chip에 'has-today' 클래스 추가 (선택된 반 제외)
      const _hasTodayCls=(()=>{
        const DAYS_KO2=['일','월','화','수','목','금','토'];
        const todayDow2=DAYS_KO2[new Date().getDay()];
        return (cls.days||[]).includes(todayDow2);
      })();
      const isSelected=S.selCls?.id===cls.id;
      b.className='chip'+(isSelected?' on':_hasTodayCls?' has-today':'');
      b.textContent=cls.name; // ★ 이름만 표시
      b.onclick=()=>{
        S.selCls=cls;
        _renderChips();
        _renderOperateBody();
        // ★ 풍선글 tooltip 표시
        _showChipTooltip(b, `${cls.termStart||'?'} ~ ${cls.termEnd||'현재'}`);
      };
      wrap.appendChild(b);
    });
  }

  // ★ 풍선글 tooltip
  function _showChipTooltip(el, text){
    const old=document.querySelector('.chip-tooltip');if(old)old.remove();
    const tt=document.createElement('div');tt.className='chip-tooltip';tt.textContent=text;
    el.style.position='relative';
    el.appendChild(tt);
    setTimeout(()=>tt.classList.add('show'),10);
    setTimeout(()=>{tt.classList.remove('show');setTimeout(()=>tt.remove(),300);},2500);
  }

  function _renderWeekNav(){
    const fri=_addDays(S.monday,4);
    _q('op-wknum').textContent=`${_wom(S.monday)}주차`;
    _q('op-wkmo').textContent=_sameM(S.monday,fri)?`${S.monday.getMonth()+1}월`:`${S.monday.getMonth()+1}~${fri.getMonth()+1}월`;
    const fmt=d=>`${d.getMonth()+1}월 ${d.getDate()}일`;
    _q('op-range').textContent=`${fmt(S.monday)} – ${fmt(fri)}`;
  }

  function _renderDays(){
    const wrap=_q('days-scroll'); if(!wrap)return; wrap.innerHTML='';
    const cls=S.selCls; if(!cls){wrap.innerHTML='<div class="empty">반을 선택해주세요</div>';return;}
    const weekKey=DB.toWeekKey(S.monday);
    const saved=DB.getWeekProgress(cls.id,weekKey);
    const canEdit=DB.canOperate();
    const today=new Date(); today.setHours(0,0,0,0);
    if(!(cls.days||[]).some(d=>DAYS.includes(d))){wrap.innerHTML='<div class="empty">수업 요일이 설정되지 않았습니다.</div>';return;}
    const container=document.createElement('div');
    container.className=S.operateView==='grid'?'op-grid':'op-list';
    DAYS.forEach((dayName,i)=>{
      if(!(cls.days||[]).includes(dayName))return;
      const date=_addDays(S.monday,i);
      const mk=DB.monthKey(date);
      const books=DB.getMonthBooks(cls.id,mk);
      const mLocked=!!(DB.isMonthPending && DB.isMonthPending(cls.id,mk)); // ★ 신규: 새 달 확정 전 잠금
      const dc=DC[dayName];
      const isToday=date.toDateString()===today.toDateString();
      const mainBooks=books.main||[], subBooks=books.sub||[];
      const card=document.createElement('div'); card.className='day-card'+(isToday?' is-today':'');
      const hdr=document.createElement('div'); hdr.className='day-hdr';
      // 수업 시간 표시
      const _dtStr=_fmtTime(cls.dayTimes?.[dayName]);
      hdr.innerHTML=`<div class="day-stripe bg-${dc}"></div><div class="day-info"><div class="day-name col-${dc}">${dayName}요일</div><div class="day-date-row"><span class="day-date">${date.getMonth()+1}월 ${date.getDate()}일</span>${_dtStr?`<span class="day-time-chip">${_dtStr}</span>`:''}</div></div>${isToday?'<div class="today-pip">오늘</div>':''}`;
      card.appendChild(hdr);
      if(!mainBooks.length&&!subBooks.length){card.innerHTML+='<div class="no-bk">이 월에 배정된 교재가 없습니다</div>';}
      else{
        const rows=document.createElement('div'); rows.className='bk-rows';
        if(mLocked){const lk=document.createElement('div');lk.className='tl-future-note';lk.innerHTML='⏳ 이번 달 교재 정보를 서버와 동기화하는 중입니다 (잠시 후 자동으로 풀립니다)';rows.appendChild(lk);}
        if(mainBooks.length){const sl=document.createElement('div');sl.className='bk-section-lbl';sl.textContent='📘 주교재';rows.appendChild(sl);mainBooks.forEach(b=>rows.appendChild(_mkBookRow(b,'main',cls.id,weekKey,dayName,saved,canEdit&&!mLocked)));}
        if(subBooks.length){const sl=document.createElement('div');sl.className='bk-section-lbl';sl.style.marginTop='4px';sl.textContent='📗 부교재';rows.appendChild(sl);subBooks.forEach(b=>rows.appendChild(_mkBookRow(b,'sub',cls.id,weekKey,dayName,saved,canEdit&&!mLocked)));}
        card.appendChild(rows);
        const ms=document.createElement('div'); ms.className='memo-section';
        const memoKey=`${dayName}__MEMO`; const memoVal=saved[memoKey]||'';
        ms.innerHTML='<span class="memo-lbl">✏️ 메모</span>';
        const ta=document.createElement('textarea'); ta.className='memo-inp'; ta.placeholder='이 요일 메모 입력...'; ta.value=memoVal;
        if(!canEdit){ta.readOnly=true; if(memoVal)ta.classList.add('has-val');}
        if(canEdit){
          const resize=()=>{ta.style.height='auto';ta.style.height=Math.min(ta.scrollHeight,128)+'px';};
          let _lm=memoVal; resize();
          const _doMemoSave = async () => {
            if (ta.value===_lm) return;
            const v = ta.value.trim();
            _lm = ta.value;
            const confirmed = await DB.autoSave(cls.id,weekKey,dayName,'memo',v);
            _syncDot(confirmed ? (FireDB.ready()?'on':'off') : 'off'); // ★ 실제 확인 안 되면 'off'로 — ready()만 보고 낙관적으로 표시하지 않음
          };
          ta.addEventListener('input',()=>{resize();_syncDot('saving');_dirtyFields.add(ta);clearTimeout(ta._st);ta._st=setTimeout(()=>{ _doMemoSave().finally(()=>_dirtyFields.delete(ta)); },1500);});
          ta.addEventListener('blur',()=>{clearTimeout(ta._st);_doMemoSave().finally(()=>_dirtyFields.delete(ta));});
        }
        ms.appendChild(ta); card.appendChild(ms);
      }
      container.appendChild(card);
    });
    wrap.appendChild(container);
    // ★ 오늘 요일 카드에 포커스 스크롤 (초기 렌더 시)
    _scrollToFocusDay(container);
  }

  /* ══════════════════════════════════════════════════════════════
     타임라인 뷰 (신규, 2026-07 추가)
     - _renderDays()/_mkBookRow() 등 기존 함수는 단 한 글자도 수정하지 않음
     - 새 Firebase 경로 없음: DB.autoSave/getWeekProgress/getMonthBooks 그대로 재사용
     - 월경계 조기확정 방지: 아직 오지 않은 달은 절대 커밋하지 않고 미리보기만 표시
     ══════════════════════════════════════════════════════════════ */

  const DOW_KO_ALL = ['일','월','화','수','목','금','토'];
  const TL_MAX_DAYS = 5;        // ★ 요청사항: 최대 5일, 과거·현재·미래 공존
  const TL_SEARCH_RANGE = 25;   // 후보 탐색 범위(달력일 기준 ±) — 주 1회 수업 반도 커버
  let _tlClip = null;           // 복사 클립보드 (탭 세션 메모리, 별도 저장소 없음)

  // ★ 뷰 모드 디스패처 — 기존 _renderDays()는 그대로 두고, 모드에 따라 분기만 함
  function _renderOperateBody(){
    const mode = S.progressViewMode || 'timeline';
    const wknav = _q('op-wknav');
    const calBtn = document.querySelector('.cal-inline-btn');
    // 타임라인 모드에선 "특정 주로 이동" 개념이 없으므로 관련 UI를 숨김(데이터 로직엔 영향 없음)
    if(wknav)  wknav.style.display  = (mode==='timeline') ? 'none' : '';
    if(calBtn) calBtn.style.display = (mode==='timeline') ? 'none' : '';
    const tlnav = _q('op-tlnav');
    if(tlnav) tlnav.style.display = (mode==='timeline') ? '' : 'none';
    _updateTlLayoutBtn(); // ★ 반 선택 우측 Grid/List 버튼 표시 여부·라벨 갱신(스크롤과 무관한 고정 위치)
    if(mode==='timeline') _renderDaysTimeline();
    else _renderDays();
  }

  // ★ 반 선택 영역 우측에 고정된 Grid/List 토글 버튼 갱신 (스크롤 영역 밖에 있어 항상 보임)
  function _updateTlLayoutBtn(){
    const btn=_q('op-tl-layout-btn'); if(!btn) return;
    const mode=S.progressViewMode||'timeline';
    btn.style.display = (mode==='timeline') ? '' : 'none';
    btn.innerHTML = S.tlLayout==='grid' ? '⊞ 좌우 · ☰ 목록' : '☰ 목록 · ⊞ 좌우';
    btn.title='좌우(Grid) / 세로(List) 배치 전환';
  }

  // ★ Grid ↔ List 전환 (기기별 개인 설정, localStorage 저장, Firebase 없음)
  function toggleTlLayout(){
    S.tlLayout = (S.tlLayout==='grid') ? 'list' : 'grid';
    try{ localStorage.setItem('bl_tl_layout', S.tlLayout); }catch(e){}
    _updateTlLayoutBtn();
    if(S.page==='operate') _renderOperateBody();
  }

  // ★ 타임라인 이전/다음/오늘 — 화면에 표시되는 "창(윈도우)"만 이동. 실제 오늘 날짜 기준
  //   월경계 조기확정 방지 로직은 이 앵커와 무관하게 항상 "진짜 오늘"을 기준으로 동작(안전)
  function tlPrev(){
    const cls=S.selCls; if(!cls) return;
    const anchor = S.tlAnchor || (()=>{const d=new Date();d.setHours(0,0,0,0);return d;})();
    const cur = _getTimelineDates(cls, anchor);
    if(!cur.length) return;
    S.tlAnchor = _addDays(cur[0], -1); // 현재 창의 첫 날 바로 전날을 새 기준으로 → 겹침·공백 없이 이전 구간 표시
    _renderDaysTimeline();
  }
  function tlNext(){
    const cls=S.selCls; if(!cls) return;
    const anchor = S.tlAnchor || (()=>{const d=new Date();d.setHours(0,0,0,0);return d;})();
    const cur = _getTimelineDates(cls, anchor);
    if(!cur.length) return;
    S.tlAnchor = _addDays(cur[cur.length-1], 1); // 현재 창의 마지막 날 바로 다음날을 새 기준으로
    _renderDaysTimeline();
  }
  function tlToday(){
    S.tlAnchor = null; // ★ "실제 오늘" 기준으로 즉시 복귀
    _renderDaysTimeline();
  }

  // ★ 오늘 기준으로 반의 수업요일 중 가장 가까운 5개를, 과거/현재/미래가 섞이도록 균형 있게 추출
  function _getTimelineDates(cls, today){
    const candidates=[];
    for(let i=-TL_SEARCH_RANGE;i<=TL_SEARCH_RANGE;i++){
      const d=_addDays(today,i);
      const dow=DOW_KO_ALL[d.getDay()];
      if((cls.days||[]).includes(dow)) candidates.push(d);
    }
    candidates.sort((a,b)=>a-b);
    if(!candidates.length) return [];

    let idx = candidates.findIndex(d=>d.getTime()>=today.getTime());
    if(idx===-1) idx = candidates.length-1;

    const half = Math.floor((TL_MAX_DAYS-1)/2); // 2
    let start = idx-half;
    let end   = start+TL_MAX_DAYS-1;
    if(start<0){ end += -start; start=0; }
    if(end>candidates.length-1){ start -= (end-(candidates.length-1)); end=candidates.length-1; }
    start=Math.max(0,start);

    return candidates.slice(start,end+1);
  }

  function _renderDaysTimeline(){
    const wrap=_q('days-scroll'); if(!wrap)return; wrap.innerHTML='';
    const cls=S.selCls;
    if(!cls){ wrap.innerHTML='<div class="empty">반을 선택해주세요</div>'; return; }
    if(!(cls.days||[]).some(d=>DAYS.includes(d))){
      wrap.innerHTML='<div class="empty">수업 요일이 설정되지 않았습니다.</div>'; return;
    }

    const canEdit = DB.canOperate(); // ★ 과거·현재·미래 구분 없이 동일 권한
    const realToday = new Date(); realToday.setHours(0,0,0,0); // ★ 상태배지/월경계안전판단은 항상 "진짜 오늘" 기준
    const todayMk = DB.monthKey(realToday);
    const anchor = S.tlAnchor ? new Date(S.tlAnchor) : new Date(realToday); // ★ 이전/다음으로 이동한 "탐색 기준일"

    const targetDates = _getTimelineDates(cls, anchor);
    if(!targetDates.length){ wrap.innerHTML='<div class="empty">표시할 수업일이 없습니다.</div>'; return; }

    // ★ Grid/List 토글 버튼은 반 선택 영역 우측(#op-tl-layout-btn, index.html)으로 이동했으므로 여기서 재생성하지 않음
    _updateTlLayoutBtn();

    // ★ 이전/오늘/다음 네비게이션 바(#op-tlnav)의 날짜 범위 라벨 갱신
    const rangeEl=_q('op-tlrange');
    if(rangeEl){
      const f=targetDates[0], l=targetDates[targetDates.length-1];
      rangeEl.textContent = (f.getMonth()===l.getMonth() && f.getDate()===l.getDate())
        ? `${f.getMonth()+1}/${f.getDate()}`
        : `${f.getMonth()+1}/${f.getDate()} ~ ${l.getMonth()+1}/${l.getDate()}`;
    }

    const container=document.createElement('div');
    container.className = 'tl-mode ' + (S.tlLayout==='grid' ? 'tl-layout-grid' : 'tl-layout-list');

    targetDates.forEach(date=>{
      const dayName = DOW_KO_ALL[date.getDay()];
      const weekKey = DB.toWeekKey(date);
      const dateMk  = DB.monthKey(date);
      const saved   = DB.getWeekProgress(cls.id,weekKey);
      const dc = DC[dayName];
      const isToday = date.toDateString()===realToday.toDateString();
      const status = date < realToday ? 'past' : isToday ? 'today' : 'future';

      // ★★★ 핵심 안전장치: 아직 오지 않은 달은 절대 getMonthBooks()로 새로 커밋하지 않음.
      //     이번 달(todayMk)의 "현재" 구성을 커밋 없이 미리보기로만 읽는다.
      const crossesFutureMonth = dateMk > todayMk;
      const books = crossesFutureMonth
        ? DB.getMonthBooks(cls.id, todayMk)  // 이미 존재 보장된 이번 달 데이터 재사용 (신규 커밋 없음)
        : DB.getMonthBooks(cls.id, dateMk);  // 과거·현재 달은 기존과 완전히 동일하게 동작
      const mLocked = !!(DB.isMonthPending && DB.isMonthPending(cls.id, crossesFutureMonth?todayMk:dateMk)); // ★ 신규: 새 달 확정 전 잠금

      const mainBooks=books.main||[], subBooks=books.sub||[];

      const card=document.createElement('div');
      card.className = `day-card tl-card tl-${status}` + (isToday?' is-today':'');
      card.dataset.date = _localDate(date);

      const badge = status==='past' ? '지난 수업' : status==='today' ? '오늘' : '예정';
      const dtStr = _fmtTime(cls.dayTimes?.[dayName]); // ★ 주간 뷰와 동일하게 요일별 수업시간 재사용
      const hdr=document.createElement('div'); hdr.className='day-hdr';
      hdr.innerHTML = `<div class="day-stripe bg-${dc}"></div>
        <div class="day-info">
          <div class="day-name col-${dc}">${dayName}요일</div>
          <div class="day-date-row">
            <span class="day-date">${date.getMonth()+1}월 ${date.getDate()}일</span>
            ${dtStr?`<span class="day-time-chip">${dtStr}</span>`:''}
            <span class="tl-badge tl-badge-${status}">${badge}</span>
          </div>
        </div>`;
      card.appendChild(hdr);

      if(!mainBooks.length && !subBooks.length){
        card.innerHTML += '<div class="no-bk">이 월에 배정된 교재가 없습니다</div>';
      } else {
        const rows=document.createElement('div'); rows.className='bk-rows';

        if(crossesFutureMonth){
          // ★ 다음 달로 넘어가는 날짜: 진도 입력칸 없이 "예정 교재" 이름만 읽기전용 표시
          const note=document.createElement('div'); note.className='tl-future-note';
          note.innerHTML='🔜 예정 교재 · 이번 달이 끝나면 자동으로 확정됩니다 (그 전까지 진도 입력 불가)';
          rows.appendChild(note);
          if(mainBooks.length){
            const sl=document.createElement('div'); sl.className='bk-section-lbl'; sl.textContent='📘 주교재(예정)';
            rows.appendChild(sl);
            mainBooks.forEach(b=>{
              const r=document.createElement('div'); r.className='bk-row tl-preview-row';
              r.innerHTML=`<span class="bk-tag main">주</span><span class="bk-nm main-nm">${_esc(b.name)}</span>`;
              rows.appendChild(r);
            });
          }
          if(subBooks.length){
            const sl=document.createElement('div'); sl.className='bk-section-lbl'; sl.style.marginTop='4px'; sl.textContent='📗 부교재(예정)';
            rows.appendChild(sl);
            subBooks.forEach(b=>{
              const r=document.createElement('div'); r.className='bk-row tl-preview-row';
              r.innerHTML=`<span class="bk-tag sub">부</span><span class="bk-nm sub-nm">${_esc(b.name)}</span>`;
              rows.appendChild(r);
            });
          }
        } else {
          // ★ 과거·이번 달: 기존 _mkBookRow를 100% 그대로 재사용 (동일 함수, 동일 저장 경로)
          if(mLocked){
            const lk=document.createElement('div'); lk.className='tl-future-note';
            lk.innerHTML='⏳ 이번 달 교재 정보를 서버와 동기화하는 중입니다 (잠시 후 자동으로 풀립니다)';
            rows.appendChild(lk);
          }
          if(mainBooks.length){
            const sl=document.createElement('div'); sl.className='bk-section-lbl'; sl.textContent='📘 주교재';
            rows.appendChild(sl);
            mainBooks.forEach(b=>rows.appendChild(_mkBookRow(b,'main',cls.id,weekKey,dayName,saved,canEdit&&!mLocked)));
          }
          if(subBooks.length){
            const sl=document.createElement('div'); sl.className='bk-section-lbl'; sl.style.marginTop='4px'; sl.textContent='📗 부교재';
            rows.appendChild(sl);
            subBooks.forEach(b=>rows.appendChild(_mkBookRow(b,'sub',cls.id,weekKey,dayName,saved,canEdit&&!mLocked)));
          }
        }
        card.appendChild(rows);

        // ★ 메모: 월/교재 구성과 무관한 독립 키(dayName__MEMO) → 미래여도 항상 안전하게 편집 가능
        const ms=document.createElement('div'); ms.className='memo-section';
        const memoKey=`${dayName}__MEMO`; const memoVal=saved[memoKey]||'';
        ms.innerHTML='<span class="memo-lbl">✏️ 메모</span>';
        const ta=document.createElement('textarea'); ta.className='memo-inp';
        ta.placeholder='이 날 메모 입력...'; ta.value=memoVal;
        if(!canEdit){ ta.readOnly=true; if(memoVal) ta.classList.add('has-val'); }
        if(canEdit){
          const resize=()=>{ta.style.height='auto';ta.style.height=Math.min(ta.scrollHeight,128)+'px';};
          let _lm=memoVal; resize();
          const _doSave=async ()=>{
            if (ta.value!==_lm) {
              const v = ta.value.trim();
              _lm = ta.value;
              _syncDot('saving');
              const confirmed = await DB.autoSave(cls.id,weekKey,dayName,'memo',v);
              _syncDot(confirmed ? (FireDB.ready()?'on':'off') : 'off'); // ★ 실제 확인 안 되면 'off'
            }
            _dirtyFields.delete(ta);
          };
          ta.addEventListener('input',()=>{resize();_dirtyFields.add(ta);clearTimeout(ta._st);ta._st=setTimeout(_doSave,1500);});
          ta.addEventListener('blur',()=>{clearTimeout(ta._st);_doSave();});
        }
        ms.appendChild(ta); card.appendChild(ms);

        // ★ Copy & Paste 툴바 — 진도값+메모만 대상(교재명 매칭, id 아님). 교재 배정 로직엔 관여 안 함.
        if(canEdit && !crossesFutureMonth){
          card.appendChild(_mkTlCopyBar(cls.id, weekKey, dayName, mainBooks, subBooks, saved, memoVal));
        } else if(canEdit && crossesFutureMonth && (mainBooks.length||subBooks.length)){
          card.appendChild(_mkTlMemoOnlyPasteBar(cls.id, weekKey, dayName));
        }
      }
      container.appendChild(card);
    });

    wrap.appendChild(container);

    setTimeout(()=>{
      const todayCard = container.querySelector('.tl-today');
      if(todayCard) todayCard.scrollIntoView({behavior:'smooth', block:'center'});
    }, 80);
  }

  // ★ 복사&붙여넣기 — "진도 입력값 + 메모"만 대상. 교재명은 절대 옮기지 않음.
  //   교재 id 대신 "이름(name)"으로 매칭 → 월 경계를 넘어도(id가 바뀌어도) 안전.
  function _mkTlCopyBar(clsId, weekKey, dayName, mainBooks, subBooks, saved, memoVal){
    const bar=document.createElement('div'); bar.className='tl-copybar';

    const copyBtn=document.createElement('button');
    copyBtn.className='tl-cp-btn tl-cp-copy'; copyBtn.textContent='📋 이 날 진도·메모 복사';
    copyBtn.onclick=()=>{
      _tlClip = {
        main: mainBooks.map(b=>({name:b.name, val:saved[`${dayName}__${b.id}__progress`]||''})).filter(x=>x.val),
        sub:  subBooks.map(b=>({name:b.name, val:saved[`${dayName}__${b.id}__progress`]||''})).filter(x=>x.val),
        memo: memoVal||'',
      };
      if(!_tlClip.main.length && !_tlClip.sub.length && !_tlClip.memo){
        _toast('⚠️ 복사할 진도/메모 내용이 없습니다','error'); _tlClip=null; return;
      }
      _refreshTlPasteButtons(); // ★ 이미 그려진 다른 날짜 카드들의 [붙여넣기] 버튼을 즉시 활성화
      _toast('📋 복사되었습니다 · 붙여넣을 날짜에서 [붙여넣기]를 누르세요','success');
    };

    const pasteBtn=document.createElement('button');
    pasteBtn.className='tl-cp-btn tl-cp-paste tl-cp-paste-full'; pasteBtn.textContent='📌 붙여넣기';
    pasteBtn.disabled = !_tlClip;
    pasteBtn.onclick=()=>{
      if(!_tlClip) return;
      const matched=[]; const unmatched=[];
      for(const item of [..._tlClip.main, ..._tlClip.sub]){
        const targetBook=[...mainBooks,...subBooks].find(b=>b.name===item.name);
        if(targetBook) matched.push({book:targetBook, val:item.val});
        else unmatched.push(item.name);
      }
      if(!matched.length && !_tlClip.memo){
        _toast('⚠️ 이 날짜에 같은 이름의 주/부교재가 없어 붙여넣을 항목이 없습니다','error');
        return;
      }
      let msg='다음 항목을 이 날짜에 붙여넣습니다(기존 입력값은 덮어써짐):\n';
      msg += matched.map(m=>`· ${m.book.name}: "${m.val}"`).join('\n');
      if(_tlClip.memo) msg += `\n· 메모: "${_tlClip.memo}"`;
      if(unmatched.length) msg += `\n\n⚠️ 이 날짜에 없는 교재라 건너뜀: ${unmatched.join(', ')}`;
      if(!confirm(msg)) return;

      for(const m of matched){
        DB.autoSave(clsId, weekKey, dayName, 'progress', m.val, m.book.id);
      }
      if(_tlClip.memo) DB.autoSave(clsId, weekKey, dayName, 'memo', _tlClip.memo);

      _toast(`✅ 붙여넣기 완료 (${matched.length}건)`,'success');
      _renderOperateBody(); // 즉시 반영(다른 기기에도 기존 실시간 리스너를 타고 전파됨)
    };

    bar.appendChild(copyBtn); bar.appendChild(pasteBtn);
    return bar;
  }

  // 미래달(진도입력 비활성) 카드용 — 메모만 붙여넣기 가능
  function _mkTlMemoOnlyPasteBar(clsId, weekKey, dayName){
    const bar=document.createElement('div'); bar.className='tl-copybar';
    const pasteBtn=document.createElement('button');
    pasteBtn.className='tl-cp-btn tl-cp-paste tl-cp-paste-memo'; pasteBtn.textContent='📌 메모만 붙여넣기';
    pasteBtn.disabled = !_tlClip || !_tlClip.memo;
    pasteBtn.onclick=()=>{
      if(!_tlClip?.memo) return;
      if(!confirm(`메모를 이 날짜에 붙여넣으시겠습니까?\n"${_tlClip.memo}"`)) return;
      DB.autoSave(clsId, weekKey, dayName, 'memo', _tlClip.memo);
      _toast('✅ 메모 붙여넣기 완료','success');
      _renderOperateBody();
    };
    bar.appendChild(pasteBtn);
    return bar;
  }

  // "오늘로 이동" 플로팅 버튼
  // ★ 복사 직후, 현재 화면에 이미 그려진 모든 [붙여넣기] 버튼의 활성/비활성 상태를 즉시 갱신
  //   (전체 재렌더링 없이, 클립보드 상태만 반영 — 다른 카드의 입력 중인 내용을 건드리지 않기 위함)
  function _refreshTlPasteButtons(){
    document.querySelectorAll('.tl-cp-paste-full').forEach(btn=>{ btn.disabled = !_tlClip; });
    document.querySelectorAll('.tl-cp-paste-memo').forEach(btn=>{ btn.disabled = !_tlClip || !_tlClip.memo; });
  }

  function _mkBookRow(b,btype,clsId,weekKey,dayName,saved,canEdit){
    const progKey=`${dayName}__${b.id}__progress`;
    const dateKey=`${dayName}__${b.id}__savedAt`;
    const val=saved[progKey]||'';
    const savedAt=saved[dateKey]||'';
    const dateStr=savedAt?_fmtDateTime(savedAt):'';
    const fzMain=getComputedStyle(document.documentElement).getPropertyValue('--fz-main').trim()||'14px';
    const fzSub=getComputedStyle(document.documentElement).getPropertyValue('--fz-sub').trim()||'13px';
    const fzBase=getComputedStyle(document.documentElement).getPropertyValue('--fz').trim()||'14px';
    const row=document.createElement('div'); row.className='bk-row'; row.style.fontSize=fzBase;
    const tag=document.createElement('span'); tag.className=`bk-tag ${btype}`; tag.textContent=btype==='main'?'주':'부';
    const nm=document.createElement('span'); nm.className=`bk-nm ${btype}-nm`; nm.title=b.name; nm.textContent=b.name;
    nm.style.fontSize=btype==='main'?fzMain:fzSub;
    const right=document.createElement('div'); right.className='bk-right';
    const inp=document.createElement('input'); inp.className='bk-inp'+(val?' filled':''); inp.placeholder='진도 입력'; inp.value=val;
    inp.style.fontSize=fzBase;
    if(!canEdit)inp.readOnly=true;
    const dt=document.createElement('span'); dt.className='bk-date'; dt.textContent=dateStr;
    right.appendChild(inp); right.appendChild(dt);
    row.appendChild(tag); row.appendChild(nm);
    // ★ 클래스카드 버튼 (booklib 데이터 존재 시 표시)
    try{
      const _allBooks=typeof BookLibDB!=='undefined'?BookLibDB.getBooks():[];
      const _normName=s=>s.replace(/[\s　]+/g,'').toLowerCase();
      const _matchBk=_allBooks.find(bk=>!bk.archived&&(
        _normName(bk.name)===_normName(b.name)||           // 완전 일치
        _normName(bk.name).includes(_normName(b.name))||  // 포함
        _normName(b.name).includes(_normName(bk.name))   // 역포함
      ));
      if(_matchBk){
        // ★ 매칭되면 항상 표시
        {
          const ccBtn=document.createElement('button');
          ccBtn.textContent='📊'; ccBtn.title='학습 현황 보기';
          ccBtn.style.cssText='font-size:11px;padding:4px 10px;border-radius:7px;background:var(--a);color:#fff;cursor:pointer;white-space:nowrap;flex-shrink:0;font-weight:700;box-shadow:0 2px 6px var(--a40)';
          ccBtn.onclick=()=>App._showClassCard(clsId,_matchBk.id,b.name);
          row.insertBefore(ccBtn,right);
        }
      }
    }catch(e){}
    row.appendChild(right);
    if(canEdit){
      let _lv=val;
      const _doProgressSave = async (afterSave) => {
        if (inp.value===_lv) { afterSave?.(); return; }
        const valToSave = inp.value.trim();
        _lv = inp.value;
        row.classList.remove('saving'); // 낙관적 표시는 유지하되, 확정 여부는 아래서 갱신
        // ★ 실제 서버 반영 여부를 확인하고 나서 표시를 결정한다 —
        //   예전엔 DB.autoSave()를 fire-and-forget으로 호출하고 결과를
        //   확인도 안 한 채 무조건 '저장됨'을 표시해서, 실제로는 로컬
        //   큐에만 들어간 경우에도 선생님은 "저장됐다"고 믿게 되는
        //   문제가 있었다(과거 데이터 유실 신고의 원인 중 하나로 추정).
        const confirmed = await DB.autoSave(clsId,weekKey,dayName,'progress',valToSave,b.id);
        if (valToSave) dt.textContent = _fmtDateTime(new Date()) + (confirmed ? '' : ' (전송 대기중)');
        if (confirmed) {
          row.classList.add('saved');
          _syncDot(FireDB.ready()?'on':'off');
          setTimeout(()=>row.classList.remove('saved'),1500);
        } else {
          row.classList.add('queued');
          dt.style.color = '#d97706';
          _syncDot('off');
        }
        if (confirmed && dt.style.color) dt.style.color = '';
        afterSave?.();
      };
      inp.addEventListener('input',()=>{inp.classList.toggle('filled',inp.value.trim()!=='');row.classList.add('saving');row.classList.remove('saved','queued');_syncDot('saving');_dirtyFields.add(inp);clearTimeout(inp._st);inp._st=setTimeout(()=>{ _doProgressSave(()=>{ _dirtyFields.delete(inp); }); },1500);});
      inp.addEventListener('blur',()=>{clearTimeout(inp._st);_doProgressSave(()=>{ _dirtyFields.delete(inp); });});
    }
    return row;
  }

  function _fmtDateTime(d){try{if(!d)return'';const dt=d instanceof Date?d:new Date(d);if(isNaN(dt.getTime()))return'';return`${dt.getMonth()+1}/${dt.getDate()} ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;}catch{return'';}}

  function prevWeek(){S.monday=_addDays(S.monday,-7);_renderWeekNav();_renderChips();_renderOperateBody();}
  function nextWeek(){S.monday=_addDays(S.monday, 7);_renderWeekNav();_renderChips();_renderOperateBody();}

  async function shareCurrentClass(){
    const cls=S.selCls; if(!cls){_toast('⚠️ 반을 선택해주세요','error');return;}
    // ★ 관리자가 현재 보는 주차를 URL에 포함
    const monStr=_localDate(S.monday);
    const url=`${location.origin}${location.pathname}?share=${cls.id}&mon=${monStr}`;
    const sd={title:`${cls.name}반 진도 현황`,text:`${cls.name}반 ${_wom(S.monday)}주차(${S.monday.getMonth()+1}/${S.monday.getDate()}~) 진도를 확인하세요.`,url};
    if(navigator.share&&navigator.canShare?.(sd)){try{await navigator.share(sd);_toast('📤 공유 완료','success');}catch(e){if(e.name!=='AbortError')_copyUrl(url);}}
    else _copyUrl(url);
  }
  async function _copyUrl(url){try{await navigator.clipboard.writeText(url);_toast('🔗 링크 복사 완료!','success',3000);}catch{prompt('링크:',url);}}

  /* ══ 달력 (운용화면) ══ */
  function _showClassCard(clsId, bookId, bookName){
    document.getElementById('bl-classcard-popup')?.remove();
    const modal=document.createElement('div');
    modal.id='bl-classcard-popup';
    modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:500;display:flex;align-items:flex-end;justify-content:center';
    modal.onclick=e=>{if(e.target===modal)modal.remove();};
    // 데이터 수집
    const checks=typeof BookLibDB!=='undefined'?BookLibDB.getMatrixChecks(clsId,bookId):{};
    const book=typeof BookLibDB!=='undefined'?BookLibDB.getBookById(bookId):null;
    const chs=book?.chapters||[];
    const totalCh=chs.length;
    const allCls=typeof DB!=='undefined'?DB.getActiveClasses():[];
    const cls=allCls.find(c=>c.id===clsId);
    const stus=typeof StudentDB!=='undefined'?StudentDB.getFiltered({classCode:cls?.name,status:'재원'}):[];
    // 학생별 미수행 계산
    const rows=stus.map(s=>{
      const undone=chs.filter(ch=>checks[s.id+'__'+ch.id]).length;
      const done=totalCh-undone;
      const pct=totalCh>0?Math.round(done/totalCh*100):0;
      const barW=pct;
      return'<div style="margin-bottom:8px">'
        +'<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">'
        +'<span style="font-size:12px;font-weight:700;min-width:60px">'+s.name+'</span>'
        +'<div style="flex:1;background:var(--surf2);border-radius:20px;height:14px;overflow:hidden;border:1px solid var(--bdr)">'
        +'<div style="width:'+barW+'%;height:100%;background:var(--a);border-radius:20px;transition:width .3s"></div>'
        +'</div>'
        +'<span style="font-size:11px;color:var(--a);font-weight:700;min-width:34px">'+pct+'%</span>'
        +'<span style="font-size:11px;color:#ea580c;min-width:60px">'+undone+'개 미수행</span>'
        +'</div></div>';
    }).join('');
    modal.innerHTML='<div style="background:var(--card);border-radius:20px 20px 0 0;padding:20px;width:100%;max-width:500px;max-height:75vh;display:flex;flex-direction:column;box-shadow:0 -4px 24px rgba(0,0,0,.18)">'
      +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">'
      +'<div><div style="font-size:15px;font-weight:800">📊 클래스카드</div>'
      +'<div style="font-size:12px;color:var(--tx3)">'+cls?.name+'반 · '+bookName+'</div></div>'
      +'<button onclick="document.getElementById(&quot;bl-classcard-popup&quot;).remove()" style="background:none;border:none;font-size:22px;cursor:pointer;color:var(--tx3)">✕</button>'
      +'</div>'
      +'<div style="overflow-y:auto;flex:1">'+(rows||'<p style="text-align:center;color:var(--tx3)">데이터가 없습니다</p>')+'</div>'
      +'</div>';
    document.body.appendChild(modal);
  }

  function openCal(){S.calY=S.monday.getFullYear();S.calM=S.monday.getMonth();_renderCal();_q('cal-ov').classList.remove('hidden');history.pushState({pg:'cal'},'');}
  function closeCal(e){if(e&&e.target!==_q('cal-ov'))return;_q('cal-ov').classList.add('hidden');}
  function calPrev(){if(S.calM===0){S.calY--;S.calM=11;}else S.calM--;_renderCal();}
  function calNext(){if(S.calM===11){S.calY++;S.calM=0;}else S.calM++;_renderCal();}
  function calToday(){S.calY=new Date().getFullYear();S.calM=new Date().getMonth();_renderCal();}
  function _renderCal(){
    const yr=S.calY, mo=S.calM;
    _q('cal-title').textContent=`${yr}년 ${mo+1}월`;
    const grid=_q('cal-grid'); grid.innerHTML='';
    const today=new Date(); today.setHours(0,0,0,0);
    const selMon=_mon(S.monday);
    const firstDow=new Date(yr,mo,1).getDay();
    const lastDay=new Date(yr,mo+1,0).getDate();
    for(let i=0;i<firstDow;i++){const e=document.createElement('div');e.className='cal-day empty';grid.appendChild(e);}
    for(let day=1;day<=lastDay;day++){
      const date=new Date(yr,mo,day); date.setHours(0,0,0,0);
      const dow=date.getDay();
      const weekMon=_mon(date);
      const d=document.createElement('div'); d.className='cal-day'; d.textContent=String(day);
      if(date.toDateString()===today.toDateString())d.classList.add('today');
      if(weekMon.getTime()===selMon.getTime()){
        if(dow===1)d.classList.add('week-start');
        else if(dow===5)d.classList.add('week-end');
        else if(dow>=2&&dow<=4)d.classList.add('in-week');
      }
      d.onclick=()=>{S.monday=_mon(date);_renderWeekNav();_renderChips();_renderOperateBody();_renderCal();setTimeout(()=>_q('cal-ov').classList.add('hidden'),280);};
      grid.appendChild(d);
    }
    const rem=(firstDow+lastDay)%7;
    if(rem!==0){for(let i=0;i<(7-rem);i++){const e=document.createElement('div');e.className='cal-day empty';grid.appendChild(e);}}
  }

  /* ══ 관리화면 달력 (월 이동) ══ */
  function openMgCal(){
    S.mgCalY=parseInt(S.mgMk.split('-')[0]); S.mgCalM=parseInt(S.mgMk.split('-')[1])-1;
    _renderMgCal(); _q('mg-cal-ov').classList.remove('hidden');
    history.pushState({pg:'mgcal'},'');
  }
  function closeMgCal(e){if(e&&e.target!==_q('mg-cal-ov'))return;_q('mg-cal-ov').classList.add('hidden');}
  function mgCalPrev(){if(S.mgCalM===0){S.mgCalY--;S.mgCalM=11;}else S.mgCalM--;_renderMgCal();}
  function mgCalNext(){if(S.mgCalM===11){S.mgCalY++;S.mgCalM=0;}else S.mgCalM++;_renderMgCal();}
  function _renderMgCal(){
    const yr=S.mgCalY, mo=S.mgCalM;
    _q('mgcal-title').textContent=`${yr}년 ${mo+1}월`;
    const grid=_q('mgcal-grid'); grid.innerHTML='';
    // 월 단위 선택 (날짜 아닌 년-월 선택)
    for(let m=0;m<12;m++){
      const d=document.createElement('div'); d.className='mgcal-month';
      const mk=`${yr}-${String(m+1).padStart(2,'0')}`;
      if(mk===S.mgMk)d.classList.add('sel');
      d.textContent=`${m+1}월`;
      d.onclick=()=>{S.mgMk=mk;_renderMgCls();_q('mg-cal-ov').classList.add('hidden');};
      grid.appendChild(d);
    }
  }

  /* ══ 관리 PAGE ══ */
  function _renderManage(){
    const sess=DB.getSession();
    const _roleLbl={admin:'관리자',manager:'매니저',operator:'운용자',teacher:'강사'}[sess?.role]||'운용자';
    _q('mg-sess').textContent=sess?`${sess.username} (${_roleLbl}) 로그인 중`:'로그인 필요';
    _updateToggleBtn();
    const isAdmin=DB.isAdmin();
    // ★ 버그 수정: '반' 탭(index 0)까지 계정 탭(index 1)과 함께 묶여서
    //   admin 아니면 통째로 숨겨지고 있었음 — 그래서 operator는 카드 내부
    //   버튼 권한을 열어줘도 '반' 탭 자체를 못 봐서 반/교재 추가가 불가능했음.
    //   '반' 탭은 operator에게도 열어주고(canManageCls), '계정' 탭만 admin 전용 유지.
    const canManageCls=isAdmin||DB.getRole()==='operator';
    document.querySelectorAll('.mg-tab').forEach((t,i)=>{
      if(i===0) t.style.display=canManageCls?'':'none';
      else if(i===1) t.style.display=isAdmin?'':'none';
    });
    if(!canManageCls&&S.mgTab==='classes')S.mgTab='theme';
    if(!isAdmin&&S.mgTab==='accounts')S.mgTab='theme';
    mgTab(S.mgTab);
  }
  function _onRoleChange(role, savedClasses=[], savedMenus=[]){
    const wrap=document.getElementById('f-teacher-classes');
    const list=document.getElementById('f-teacher-cls-list');
    const menuWrap=document.getElementById('f-teacher-menus');
    const menuList=document.getElementById('f-teacher-menu-list');
    if(!wrap||!list) return;
    const isTeacher=role==='teacher';
    // ★ 메뉴 접근 권한은 강사·운용자 공통(admin 제외 모든 계정에서 설정 가능)
    const canConfigMenus=role==='teacher'||role==='operator';
    wrap.style.display=isTeacher?'block':'none';
    if(menuWrap) menuWrap.style.display=canConfigMenus?'block':'none';
    if(isTeacher){
      const classes=typeof DB!=='undefined'?DB.getActiveClasses():[];
      list.innerHTML=classes.map(c=>
        '<label style="display:flex;align-items:center;gap:4px;font-size:12px;cursor:pointer;padding:3px 8px;background:var(--card);border-radius:6px;border:1px solid var(--bdr)">'
        +'<input type="checkbox" value="'+c.id+'"'+(savedClasses.includes(c.id)?' checked':'')+' style="accent-color:var(--a)"> '+c.name+'</label>'
      ).join('');
    }
    // ★ 메뉴 접근 권한 체크박스 — 기존엔 교재·성적 2개뿐이었으나 학생·직원까지 admin이 자유롭게 지정 가능하도록 확장
    if(menuList&&canConfigMenus){
      const EXTRA_MENUS=[
        {pg:'dashboard',lbl:'🏠 홈'},
        {pg:'archive',  lbl:'📁 콘텐츠'},
        {pg:'booklib',  lbl:'📖 교재'},
        {pg:'grade',    lbl:'📝 성적'},
        {pg:'students', lbl:'👨‍🎓 학생'},
        {pg:'staff',    lbl:'👩‍💼 직원'},
      ];
      menuList.innerHTML=EXTRA_MENUS.map(m=>
        '<label style="display:flex;align-items:center;gap:4px;font-size:12px;cursor:pointer;padding:3px 8px;background:var(--card);border-radius:6px;border:1px solid var(--a40)">'
        +'<input type="checkbox" value="'+m.pg+'"'+(savedMenus.includes(m.pg)?' checked':'')+' style="accent-color:var(--a)"> '+m.lbl+'</label>'
      ).join('');
    }
  }

  function _updateToggleBtn(){const btn=_q('toggle-view-btn');if(!btn)return;btn.textContent=S.viewMode==='grid'?'⊞':'☰';btn.title=S.viewMode==='grid'?'그리드 보기':'리스트 보기';}
  function toggleView(){S.viewMode=S.viewMode==='grid'?'list':'grid';_updateToggleBtn();const t=DB.getTheme();t.viewMode=S.viewMode;DB.saveTheme(t);_renderMgCls();}

  function mgTab(tab){
    S.mgTab=tab;
    const TABS=['classes','accounts','theme','io','share'];
    document.querySelectorAll('.mg-tab').forEach((t,i)=>t.classList.toggle('on',TABS[i]===tab));
    TABS.forEach(id=>{const el=_q('mg-'+id);if(el)el.classList.toggle('hidden',id!==tab);});
    if(tab==='classes')       _renderMgCls();
    else if(tab==='accounts') _renderMgAcc();
    else if(tab==='theme')    _renderMgTheme();
    else if(tab==='io')       _renderMgIO();
    else if(tab==='share')    _renderMgShare();
  }

  /* ══ 반 관리 탭 ══ */
  function _renderMgCls(){
    if(S.mgTab!=='classes')return;
    const wrap=_q('mg-classes'); if(!wrap)return;
    wrap.innerHTML='';
    const isAdmin=DB.isAdmin();
    // ★ 운용자(operator)에게도 반 추가·수정 + 교재풀 관리 권한 개방 (수업료/엑셀/교재복사/반삭제는 admin·manager 전용 유지)
    const canManageCls=isAdmin||DB.getRole()==='operator';
    // ★ sticky 상단 (반추가 + 월이동 + 달력)
    const top=document.createElement('div'); top.className='mg-cls-top';
    if(canManageCls){
      const btn=document.createElement('button'); btn.className='add-cls';
      btn.innerHTML='<span style="font-size:18px">＋</span> 반 추가';
      btn.onclick=()=>openClassModal(); top.appendChild(btn);
    }
    const bar=document.createElement('div'); bar.className='mg-month-bar';
    const [mkY,mkM]=S.mgMk.split('-').map(Number);
    bar.innerHTML=`
      <button class="mg-cal-btn" onclick="App.openMgCal()" title="달력으로 이동">📆</button>
      <button onclick="App.mgPrev()" title="이전 달">‹</button>
      <span class="mg-month-lbl">${mkY}년 ${mkM}월</span>
      <button onclick="App.mgNext()" title="다음 달">›</button>
      ${isAdmin?`<button class="mg-cal-btn" onclick="App.openFeePanel()" title="수업료·교재비 일괄 편집">💸</button>`:''}
      ${isAdmin?`<button class="mg-cal-btn" onclick="App.exportTuitionExcel()" title="교재 수납 엑셀 추출">📤</button>`:''}`;
    top.appendChild(bar);
    wrap.appendChild(top);
    // 스크롤 영역
    const scroll=document.createElement('div'); scroll.className='mg-cls-scroll';
    wrap.appendChild(scroll);
    _renderMgClsContent(scroll);
  }

  function _renderMgClsContent(wrap){
    wrap.innerHTML='';
    const isAdmin=DB.isAdmin();
    const canManageCls=isAdmin||DB.getRole()==='operator';
    // ★ 현재 mgMk 기준 반만 표시
    const classes=DB.getClassesForMonth(S.mgMk);
    if(!classes.length){
      wrap.innerHTML='<div class="empty">이 월에 편성된 반이 없습니다.<br><small style="color:var(--tx3)">다른 월로 이동하거나 반을 추가하세요.</small></div>';
      return;
    }
    const cont=document.createElement('div'); cont.className=S.viewMode==='grid'?'cls-grid':'cls-list';
    classes.forEach(cls=>cont.appendChild(_buildClsCard(cls,canManageCls)));
    wrap.appendChild(cont);
  }

  function _buildClsCard(cls,isAdmin){
    // ★ isAdmin 파라미터는 이제 "canManageCls"(admin/manager 또는 operator) 의미로 넘어옴.
    //   교재복사·반삭제처럼 더 민감한 동작은 아래 isAdminStrict(진짜 admin/manager)로 별도 체크.
    const isAdminStrict=DB.isAdmin();
    const card=document.createElement('div'); card.className='cls-card';
    const mk=S.mgMk; const books=DB.getMonthBooks(cls.id,mk);
    const dayBadges=(cls.days||[]).map(d=>{
      const ts=_fmtTime(cls.dayTimes?.[d]);
      return `<span class="dbdg ${DC[d]}">${d}</span>${ts?`<span class="dt-badge">${ts}</span>`:''}`;
    }).join('');
    const termStr=`${cls.termStart||'?'}~${cls.termEnd||'현재'}`;
    const tuitionBadge=cls.tuition?`<span class="cls-term" style="background:rgba(34,197,94,.12);color:#16a34a">💰 ${Number(cls.tuition).toLocaleString()}원</span>`:'';
    const bookFeeBadge=cls.bookFee?`<span class="cls-term" style="background:rgba(251,191,36,.15);color:#b45309">📚 ${Number(cls.bookFee).toLocaleString()}원</span>`:'';
    // 같은 이름 다른 편성 목록
    const otherTerms=DB.getClasses()
      .filter(c=>c.name.trim()===cls.name.trim()&&c.id!==cls.id)
      .sort((a,b)=>(a.termStart||'').localeCompare(b.termStart||''));
    card.innerHTML=`
      <div class="cls-chdr">
        <div class="cls-chdr-l">
          <div class="cls-nm">${_esc(cls.name)}</div>
          <span class="cls-term ${cls.termEnd?'ended':''}">${termStr}</span>
          ${tuitionBadge}
          ${bookFeeBadge}
          <div class="dbadges">${dayBadges}</div>
        </div>
        <div class="cls-chdr-r">
          ${isAdmin?`
            <button class="ibtn" onclick="App.openClassModal('${cls.id}')" title="수정">✏️</button>
          `:''}
          ${isAdminStrict?`
            <button class="ibtn" onclick="App.openCopyModal('${cls.id}')" title="교재복사" style="background:rgba(5,150,105,.1);border-color:rgba(5,150,105,.3);color:var(--green)">📋</button>
            <button class="ibtn red" onclick="App.delClass('${cls.id}')" title="이 편성 삭제">🗑</button>
          `:''}
        </div>
      </div>
      ${otherTerms.length?`<div class="cls-other-terms">
        <span class="cls-other-lbl">📌 다른 편성:</span>
        ${otherTerms.map(c=>`<span class="cls-other-item">${c.termStart||'?'}~${c.termEnd||'현재'} (${(c.days||[]).join(',')})</span>`).join('')}
      </div>`:''}`;
    const bm=document.createElement('div'); bm.className='book-manager';
    bm.appendChild(_buildPoolZone(cls.id,mk,books,isAdmin));
    bm.appendChild(_buildAssignZones(cls.id,mk,books,isAdmin));
    card.appendChild(bm);
    return card;
  }

  /* ★ _buildPoolZone: 교재 추가 후 포커스 유지, 더블클릭 인라인 수정, drag 재연결 */
  function _buildPoolZone(clsId,mk,books,isAdmin){
    const zone=document.createElement('div'); zone.className='bm-pool';
    const hdr=document.createElement('div'); hdr.className='bm-zone-hdr'; hdr.innerHTML='<span class="bm-zone-title">📚 교재 목록</span>';
    const acts=document.createElement('div'); acts.className='bm-zone-acts';
    if(isAdmin&&(books.pool||[]).length){
      const cb=document.createElement('button'); cb.className='clear-btn'; cb.textContent='전체삭제';
      cb.onclick=async()=>{if(!confirm('교재 목록 전체 삭제?'))return;await DB.clearZone(clsId,mk,'pool');_toast('🗑 삭제');};
      acts.appendChild(cb);
    }
    hdr.appendChild(acts); zone.appendChild(hdr);
    const list=document.createElement('div'); list.className='bm-pool-list';
    list.dataset.zone='pool'; list.dataset.clsid=clsId; list.dataset.mk=mk;
    (books.pool||[]).forEach(b=>list.appendChild(_buildPoolItem(b,clsId,mk,isAdmin,list)));
    if(!(books.pool||[]).length){const em=document.createElement('div');em.style.cssText='font-size:11px;color:var(--tx3);padding:8px 4px';em.textContent='교재를 추가해주세요';list.appendChild(em);}
    zone.appendChild(list);
    if(isAdmin){
      const ar=document.createElement('div'); ar.className='bm-add-row';
      const inp=document.createElement('input'); inp.className='bm-add-inp'; inp.placeholder='교재명 입력';
      const btn=document.createElement('button'); btn.className='bm-add-btn'; btn.textContent='추가';
      const doAdd=async()=>{
        if(btn.disabled) return; // ★ 이미 처리 중이면 무시 (연타 방어 2중 안전장치)
        const name=inp.value.trim(); if(!name){_toast('⚠️ 교재명을 입력해주세요','error');inp.focus({preventScroll:true});return;}
        _lastPoolFocusCls=clsId; // ★ 지금 이 반에서 교재를 추가 중이었다는 걸 기록 (재렌더링 후 재포커스 대상 판단용)
        // ★ 네트워크 왕복(충돌검사 포함) 도중에도 "눌렸다"는 걸 즉시 알 수 있게
        //   버튼을 먼저 잠그고 입력칸도 먼저 비운다 → 응답이 늦어도 재클릭으로 중복 추가되지 않음
        btn.disabled=true; const _origTxt=btn.textContent; btn.textContent='추가 중...';
        inp.value=''; inp.disabled=true;
        try{
          await DB.addToPool(clsId,mk,name);
          _toast(`📚 "${name}" 추가`,'success');
        }catch(e){
          _toast('⚠️ 추가 실패 — 다시 시도해주세요','error');
          console.warn('[교재추가]',e);
        }finally{
          btn.disabled=false; btn.textContent=_origTxt; inp.disabled=false;
          setTimeout(()=>inp.focus({preventScroll:true}),50);
        }
      };
      btn.onclick=doAdd;
      inp.addEventListener('focus',()=>{_lastPoolFocusCls=clsId;}); // ★ 사용자가 직접 클릭해 포커스한 경우도 추적
      inp.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();doAdd();}});
      ar.appendChild(inp); ar.appendChild(btn); zone.appendChild(ar);
      /* ★ 버그 수정: 반 목록이 여러 개일 때, 어느 반에서 교재를 추가·삭제·이동해도
       *   Firebase 'classes' 리스너가 전체 카드를 다시 그리면서 이 setTimeout(focus)이
       *   "모든" 카드에 대해 실행돼, 마지막 카드의 입력창이 포커스를 가져가며
       *   화면이 그쪽으로 자동 스크롤되던 문제(전체삭제·X삭제·추가 모두 동일 증상).
       *   → 방금 실제로 사용하던 반의 입력창일 때만, 그리고 preventScroll로
       *   스크롤 이동 없이 포커스한다. */
      if(_lastPoolFocusCls===clsId) setTimeout(()=>inp.focus({preventScroll:true}),100);
    }
    _setupDropZone(list,'pool',clsId,mk);
    return zone;
  }

  // ★ 교재 "최초 등록일" 포맷 — createdAt(매달 리셋)과 달리 firstRegisteredAt은 이월돼도 유지됨
  function _fmtRegDate(ts){
    if(!ts) return '';
    const d=new Date(ts); if(isNaN(d)) return '';
    const y=d.getFullYear(), m=d.getMonth()+1, day=d.getDate();
    const now=new Date();
    let months=(now.getFullYear()-y)*12+(now.getMonth()+1-m);
    if(months<0) months=0;
    const monthTxt = months<1 ? '이번 달' : `${months}개월째`;
    return `최초 등록: ${y}-${String(m).padStart(2,'0')}-${String(day).padStart(2,'0')} (${monthTxt})`;
  }

  function _buildPoolItem(b,clsId,mk,isAdmin,listEl){
    const item=document.createElement('div'); item.className='bm-pool-item';
    item.dataset.bookid=b.id; item.dataset.name=b.name; item.dataset.clsid=clsId;
    const nm=document.createElement('span'); nm.className='bm-pool-name'; nm.textContent=b.name; item.appendChild(nm);
    item.title=_fmtRegDate(b.firstRegisteredAt||b.createdAt); // ★ 최초 등록일(호버 시 툴팁, 레이아웃 영향 없음)
    if(isAdmin){
      // ★ 더블클릭 인라인 수정
      nm.addEventListener('dblclick',()=>_inlineEditBook(nm,b,clsId,mk));
      const btns=document.createElement('div'); btns.className='bm-pool-btns';
      const toMain=document.createElement('button'); toMain.className='bm-pool-btn to-main'; toMain.title='주교재로'; toMain.textContent='主';
      toMain.onclick=async(e)=>{e.stopPropagation();await DB.moveBook(clsId,mk,b.id,'main');_toast('📘 주교재로 이동','success');};
      const toSub=document.createElement('button'); toSub.className='bm-pool-btn to-sub'; toSub.title='부교재로'; toSub.textContent='副';
      toSub.onclick=async(e)=>{e.stopPropagation();await DB.moveBook(clsId,mk,b.id,'sub');_toast('📗 부교재로 이동','success');};
      const del=document.createElement('button'); del.className='bm-pool-btn del'; del.title='삭제'; del.textContent='✕';
      del.onclick=async(e)=>{e.stopPropagation();if(!confirm(`"${b.name}" 삭제?`))return;await DB.deleteBook(clsId,mk,b.id);_toast('🗑 삭제 완료');};
      btns.appendChild(toMain); btns.appendChild(toSub); btns.appendChild(del); item.appendChild(btns);
      const isPC=!('ontouchstart' in window);
      if(isPC)_setupPCDrag(item,b.id,b.name,'pool',clsId,mk);
      else _setupLongPressDrag(item,b.id,b.name,'pool',clsId,mk);
    }
    item.addEventListener('click',()=>{document.querySelectorAll('.bm-pool-item.selected').forEach(x=>{if(x!==item)x.classList.remove('selected');});item.classList.toggle('selected');});
    return item;
  }

  // ★ 인라인 교재명 수정
  function _inlineEditBook(nm,b,clsId,mk){
    if(nm.querySelector('input'))return;
    const old=nm.textContent;
    const inp=document.createElement('input');
    inp.value=old; inp.style.cssText='width:100%;font-size:inherit;font-family:inherit;border:1px solid var(--a);border-radius:4px;padding:2px 5px;background:var(--card);color:var(--tx);outline:none';
    nm.textContent=''; nm.appendChild(inp); inp.focus(); inp.select();
    const save=async()=>{
      const newName=inp.value.trim();
      nm.textContent=newName||old;
      if(newName&&newName!==old){await DB.renameBook(clsId,mk,b.id,newName);_toast(`✏️ "${newName}" 수정 완료`,'success');}
    };
    inp.addEventListener('blur',save);
    inp.addEventListener('keydown',e=>{if(e.key==='Enter'){inp.blur();}if(e.key==='Escape'){nm.textContent=old;}});
  }

  function _buildAssignZones(clsId,mk,books,isAdmin){
    const right=document.createElement('div'); right.className='bm-right';
    const isPC=!('ontouchstart' in window);
    ['main','sub'].forEach(zone=>{
      const zDiv=document.createElement('div'); zDiv.className='bm-zone';
      const hdr=document.createElement('div'); hdr.className='bm-zone-hdr';
      const title=document.createElement('span'); title.className='bm-zone-title'; title.textContent=zone==='main'?'📘 주교재':'📗 부교재'; hdr.appendChild(title);
      const acts=document.createElement('div'); acts.className='bm-zone-acts';
      if(isAdmin){
        const arBtn=document.createElement('button'); arBtn.className=`bm-arrow-btn ${zone}`; arBtn.textContent=`← ${zone==='main'?'주':'부'}`;
        arBtn.onclick=async()=>{const sel=document.querySelector('.bm-pool-item.selected');if(!sel){_toast('⚠️ 교재 목록에서 먼저 선택하세요','error');return;}await DB.moveBook(sel.dataset.clsid||clsId,mk,sel.dataset.bookid,zone);_toast(`${zone==='main'?'📘 주':'📗 부'}교재로 이동`,'success');};
        acts.appendChild(arBtn);
        if((books[zone]||[]).length){const cb=document.createElement('button');cb.className='clear-btn';cb.textContent='전체삭제';cb.onclick=async()=>{if(!confirm(`${zone==='main'?'주':'부'}교재 전체 삭제?`))return;await DB.clearZone(clsId,mk,zone);_toast('🗑 삭제');};acts.appendChild(cb);}
      }
      hdr.appendChild(acts); zDiv.appendChild(hdr);
      const list=document.createElement('div'); list.className='bm-zone-list';
      list.dataset.zone=zone; list.dataset.clsid=clsId; list.dataset.mk=mk;
      (books[zone]||[]).forEach(b=>{
        const item=document.createElement('div'); item.className='bm-zone-item';
        item.dataset.bookid=b.id; item.dataset.name=b.name;
        item.title=_fmtRegDate(b.firstRegisteredAt||b.createdAt); // ★ 최초 등록일(호버 시 툴팁, 레이아웃 영향 없음)
        const dot=document.createElement('div'); dot.className=`bm-zone-dot ${zone}`;
        const nm=document.createElement('span'); nm.className='bm-zone-name'; nm.textContent=b.name;
        item.appendChild(dot); item.appendChild(nm);
        if(isAdmin){
          item.classList.add('drag-ok');
          // ★ 더블클릭 인라인 수정
          nm.addEventListener('dblclick',()=>_inlineEditBook(nm,b,clsId,mk));
          const back=document.createElement('button'); back.className='bm-back-btn'; back.title='목록으로'; back.textContent='↩';
          back.onclick=async(e)=>{e.stopPropagation();await DB.moveBook(clsId,mk,b.id,'pool');_toast('↩ 목록으로');};
          item.appendChild(back);
          if(isPC)_setupPCDrag(item,b.id,b.name,zone,clsId,mk);
          else _setupLongPressDrag(item,b.id,b.name,zone,clsId,mk);
        }
        list.appendChild(item);
      });
      if(!(books[zone]||[]).length){const em=document.createElement('div');em.style.cssText='font-size:10px;color:var(--tx3);padding:7px 4px';em.textContent='교재를 드래그하세요';list.appendChild(em);}
      _setupDropZone(list,zone,clsId,mk);
      zDiv.appendChild(list); right.appendChild(zDiv);
    });
    return right;
  }

  /* ★ PC Drag
   * ★ 버그 수정: el(.bm-pool-item 등)이 draggable=true라서, 안에 중첩된
   *   삭제(✕)/주교재(主)/부교재(副) 버튼을 클릭해도 브라우저가 클릭 대신
   *   드래그로 인식해버려 버튼이 반응 없는 것처럼 보이던 문제.
   *   → 드래그가 버튼 위에서 시작되면 즉시 취소해서 평범한 클릭으로 넘긴다.
   */
  function _setupPCDrag(el,bookId,name,fromZone,clsId,mk){
    el.draggable=true;
    el.addEventListener('dragstart',e=>{
      if(e.target.closest?.('.bm-pool-btn,.bm-back-btn')){ e.preventDefault(); return; }
      _drag={item:el,bookId,name,fromZone,clsId,mk};
      el.classList.add('dragging');
      e.dataTransfer.effectAllowed='move';
      e.dataTransfer.setData('text/plain',bookId);
      e.dataTransfer.setData('application/json',JSON.stringify({bookId,name,fromZone,clsId,mk}));
    });
    el.addEventListener('dragend',()=>{el.classList.remove('dragging');document.querySelectorAll('.drop-hover').forEach(z=>z.classList.remove('drop-hover'));});
  }

  /* ★ 모바일 Long-press
   * ★ 동일한 이유로 버튼 위에서 시작된 터치는 롱프레스 드래그 감지 자체를
   *   하지 않도록 방어 (PC 드래그 수정과 짝) */
  function _setupLongPressDrag(el,bookId,name,fromZone,clsId,mk){
    el.addEventListener('touchstart',e=>{
      if(e.target.closest?.('.bm-pool-btn,.bm-back-btn')) return;
      const t=e.touches[0]; _lpStartX=t.clientX; _lpStartY=t.clientY;
      _lpTimer=setTimeout(()=>{
        _lpActive=true; _drag={item:el,bookId,name,fromZone,clsId,mk};
        el.classList.add('dragging');
        const ghost=_q('drag-ghost'); ghost.textContent=name; ghost.classList.remove('hidden');
        ghost.style.left=_lpStartX+'px'; ghost.style.top=_lpStartY+'px';
        navigator.vibrate?.(30);
      },500);
    },{passive:true});
    el.addEventListener('touchmove',e=>{
      if(!_lpActive){
        const dx=Math.abs(e.touches[0].clientX-_lpStartX), dy=Math.abs(e.touches[0].clientY-_lpStartY);
        if(dx>8||dy>8)clearTimeout(_lpTimer);
        return;
      }
      const t=e.touches[0];
      const ghost=_q('drag-ghost'); if(ghost){ghost.style.left=t.clientX+'px';ghost.style.top=t.clientY+'px';}
      document.querySelectorAll('.drop-hover').forEach(z=>z.classList.remove('drop-hover'));
      const under=document.elementFromPoint(t.clientX,t.clientY);
      const zoneEl=under?.closest('.bm-zone-list,.bm-pool-list'); if(zoneEl)zoneEl.classList.add('drop-hover');
      e.preventDefault();
    },{passive:false});
    el.addEventListener('touchend',async e=>{
      clearTimeout(_lpTimer); if(!_lpActive){_lpActive=false;return;}
      const t=e.changedTouches[0];
      const ghost=_q('drag-ghost'); if(ghost)ghost.classList.add('hidden');
      el.classList.remove('dragging'); _lpActive=false;
      document.querySelectorAll('.drop-hover').forEach(z=>z.classList.remove('drop-hover'));
      const under=document.elementFromPoint(t.clientX,t.clientY);
      const zoneEl=under?.closest('.bm-zone-list,.bm-pool-list');
      if(zoneEl){const tz=zoneEl.dataset.zone;if(tz&&tz!==fromZone){await DB.moveBook(clsId,mk,bookId,tz);_toast(`${tz==='main'?'📘 주교재':tz==='sub'?'📗 부교재':'📚 목록'}으로 이동`,'success');}}
    });
    el.addEventListener('touchcancel',()=>{clearTimeout(_lpTimer);_lpActive=false;const g=_q('drag-ghost');if(g)g.classList.add('hidden');el.classList.remove('dragging');});
  }

  function _setupDropZone(el,zone,clsId,mk){
    el.addEventListener('dragover',e=>{e.preventDefault();el.classList.add('drop-hover');});
    el.addEventListener('dragleave',()=>el.classList.remove('drop-hover'));
    el.addEventListener('drop',async e=>{
      e.preventDefault(); el.classList.remove('drop-hover');
      let bookId=e.dataTransfer.getData('text/plain');
      let fromCls=_drag.clsId||clsId, fromMk=_drag.mk||mk, fromZone=_drag.fromZone;
      try{const j=JSON.parse(e.dataTransfer.getData('application/json'));bookId=j.bookId;fromCls=j.clsId;fromMk=j.mk;fromZone=j.fromZone;}catch{}
      if(!bookId)return;
      if(fromCls!==clsId){
        // 다른 반 → 복사
        const fb=DB.getMonthBooks(fromCls,fromMk);
        const all=[...(fb.pool||[]),...(fb.main||[]),...(fb.sub||[])];
        const src=all.find(b=>b.id===bookId);
        if(src){await DB.addToPool(clsId,mk,src.name);_toast(`📋 "${src.name}" 복사 완료`,'success');}
        return;
      }
      if(bookId&&zone!==fromZone){await DB.moveBook(fromCls,fromMk,bookId,zone);_toast(`${zone==='main'?'📘 주교재':zone==='sub'?'📗 부교재':'📚 목록'}으로 이동`,'success');}
    });
  }

  function mgPrev(){S.mgMk=DB.prevMonthKey(S.mgMk);_renderMgCls();}
  function mgNext(){S.mgMk=DB.nextMonthKey(S.mgMk);_renderMgCls();}

  /* 반 추가/수정 */
  // ── 요일 체크박스 변경 → 시간 입력 행 갱신 ──
  function _onDayCkChange(){
    const DAYS_ORD=['월','화','수','목','금'];
    const DC2={월:'mon',화:'tue',수:'wed',목:'thu',금:'fri'};
    const checked=[...document.querySelectorAll('#modal-day-cks input:checked')].map(c=>c.value);
    const grp=_q('f-daytimes-grp'), list=_q('f-daytimes-list');
    if(!grp||!list)return;
    // 기존 입력값 보존
    const prev={};
    list.querySelectorAll('.dt-row').forEach(r=>{
      prev[r.dataset.day]={s:r.querySelector('.dt-s').value,e:r.querySelector('.dt-e').value};
    });
    if(!checked.length){grp.style.display='none';list.innerHTML='';return;}
    grp.style.display='';
    list.innerHTML='';
    DAYS_ORD.filter(d=>checked.includes(d)).forEach(d=>{
      const s=prev[d]?.s||'', e=prev[d]?.e||'';
      const row=document.createElement('div');
      row.className='dt-row'; row.dataset.day=d;
      row.innerHTML=
        `<span class="dt-label col-${DC2[d]}">${d}</span>`+
        `<input class="dt-inp dt-s" type="time" value="${s}" placeholder="시작">`+
        `<span class="dt-sep">~</span>`+
        `<input class="dt-inp dt-e" type="time" value="${e}" placeholder="종료">`;
      list.appendChild(row);
    });
  }

  // ── dayTimes 객체 읽기 (모달 → 저장용) ──
  function _readDayTimes(){
    const dt={};
    document.querySelectorAll('#f-daytimes-list .dt-row').forEach(r=>{
      const d=r.dataset.day, s=r.querySelector('.dt-s').value, e=r.querySelector('.dt-e').value;
      if(s||e) dt[d]={start:s,end:e};
    });
    return Object.keys(dt).length?dt:null;
  }

  // ── dayTimes 모달에 채우기 ──
  function _fillDayTimes(dayTimes){
    if(!dayTimes)return;
    Object.entries(dayTimes).forEach(([d,t])=>{
      const row=document.querySelector(`#f-daytimes-list [data-day="${d}"]`);
      if(row){
        if(t.start)row.querySelector('.dt-s').value=t.start;
        if(t.end)  row.querySelector('.dt-e').value=t.end;
      }
    });
  }

  // ── 시간 문자열 포맷: "15:00"~"16:30" → "15:00~16:30" ──
  function _fmtTime(dt){
    if(!dt)return '';
    const s=dt.start||'', e=dt.end||'';
    if(!s&&!e)return '';
    if(s&&e)return `${s}~${e}`;
    return s||e;
  }

  function openClassModal(id=null){
    S.editClsId=id; const cls=id?DB.getClassById(id):null;
    _q('mcls-t').textContent=id?'반 수정':'반 추가 / 재편성';
    _q('f-cname').value=cls?.name||'';
    _q('f-ctuition').value=cls?.tuition??'';
    _q('f-cbookfee').value=cls?.bookFee??'';
    _q('f-cterm').value=id?DB.monthKey(new Date()):(cls?.termStart||DB.monthKey(new Date()));
    const sub=_q('mcls-sub');
    if(id){sub.style.display='';sub.style.color='var(--a)';sub.textContent=`현재: ${(cls?.days||[]).join(',')} (${cls?.termStart||'?'}~)\n요일 변경 시 재편성됩니다.`;}
    else{sub.style.display='';sub.style.color='var(--orange)';sub.textContent='같은 이름+같은 시작월이면 중복 반 추가가 안됩니다.';}
    document.querySelectorAll('#modal-cls .day-ck input').forEach(cb=>{cb.checked=cls?(cls.days||[]).includes(cb.value):false;});
    // 시간 입력 행 갱신 + 기존 시간 채우기
    _onDayCkChange();
    if(cls?.dayTimes) _fillDayTimes(cls.dayTimes);
    _q('modal-cls').classList.remove('hidden'); history.pushState({pg:'modal'},'');
  }
  async function saveClass(){
    const name=_q('f-cname').value.trim(); if(!name){_toast('⚠️ 반 이름을 입력해주세요','error');return;}
    const days=[...document.querySelectorAll('#modal-cls .day-ck input:checked')].map(c=>c.value);
    if(!days.length){_toast('⚠️ 요일을 선택해주세요','error');return;}
    const termStart=_q('f-cterm').value||DB.monthKey(new Date());
    // ★ 요일별 수업 시간 수집
    const dayTimes=_readDayTimes();
    // ★ 월 수업료 수집 (입력 안 하면 null → 기존값 유지)
    const tuitionRaw=_q('f-ctuition').value;
    const tuition=tuitionRaw!==''?Math.max(0,parseInt(tuitionRaw,10)||0):null;
    const bookFeeRaw=_q('f-cbookfee').value;
    const bookFee=bookFeeRaw!==''?Math.max(0,parseInt(bookFeeRaw,10)||0):null;
    if(S.editClsId){
      const cls=DB.getClassById(S.editClsId);
      const oldDays=(cls?.days||[]).sort().join(',');
      const newDays=[...days].sort().join(',');
      if(oldDays!==newDays){
        const ok=confirm(`요일이 변경되었습니다.\n기존 (${oldDays}) 데이터 보존 후\n${termStart}부터 새 편성 (${newDays})으로 재편성합니다.\n계속하시겠습니까?`);
        if(!ok)return;
        // 재편성: dayTimes/수업료 미입력 시 이전 편성 값 참고
        const prevDt=dayTimes||cls?.dayTimes||null;
        const prevTuition=tuition!=null?tuition:(cls?.tuition??null);
        const prevBookFee=bookFee!=null?bookFee:(cls?.bookFee??null);
        await DB.terminateClass(S.editClsId);
        const r=await DB.addClassNew({name,days,termStart,dayTimes:prevDt,tuition:prevTuition,bookFee:prevBookFee});
        if(!r){_toast('⚠️ 재편성 실패','error');return;}
        S.selCls=r; _toast(`✅ ${name}반 재편성 완료`,'success');
      } else {
        // dayTimes/수업료가 null이면 기존값 유지, 있으면 교체
        const updateData={name};
        if(dayTimes)updateData.dayTimes=dayTimes;
        if(tuition!=null)updateData.tuition=tuition;
        if(bookFee!=null)updateData.bookFee=bookFee;
        await DB.updateClass(S.editClsId,updateData);
        if(S.selCls?.id===S.editClsId)S.selCls=DB.getClassById(S.editClsId);
        _toast('✅ 반 수정 완료','success');
      }
    } else {
      const existing=DB.getActiveClasses().find(c=>c.name.trim()===name.trim());
      if(existing){
        const ok=confirm(`"${name}" 반이 이미 운용 중입니다.\n기존 (${(existing.days||[]).join(',')}) 데이터 보존 후\n${termStart}부터 새 편성 (${days.join(',')})으로 재편성합니다.\n계속하시겠습니까?`);
        if(!ok)return;
      }
      const r=await DB.addClass({name,days,termStart,dayTimes,tuition,bookFee});
      if(!r){_toast('⚠️ 반 추가 실패','error');return;}
      if(r.duplicate){_toast(`⚠️ "${name}" 반 ${termStart}월 편성이 이미 존재합니다.`,'error',4000);return;}
      _toast('✅ 반 추가 완료','success');
    }
    closeModal('cls'); _renderMgCls(); _renderChips();
  }
  async function delClass(id){
    const cls=DB.getClassById(id); if(!cls)return;
    if(!confirm(`"${cls.name}" 반 (${cls.termStart||'?'}~${cls.termEnd||'현재'}) 편성을 삭제하시겠습니까?\n이 편성의 진도·교재 데이터만 삭제됩니다.`))return;
    await DB.deleteClass(id);
    if(S.selCls?.id===id)S.selCls=null;
    _renderMgCls(); _renderChips(); _toast('🗑 삭제 완료');
  }

  /* ★ 교재 복사 수정 */
  function openCopyModal(toClsId){
    S.copyToClsId=toClsId;
    const sel=_q('f-copy-from'); sel.innerHTML='';
    // ★ 현재 mgMk 기준 다른 반 표시
    const allCls=DB.getClasses().filter(c=>c.id!==toClsId);
    allCls.forEach(c=>{
      const opt=document.createElement('option'); opt.value=c.id;
      opt.textContent=`${c.name} (${c.termStart||'?'}~${c.termEnd||'현재'}) ${(c.days||[]).join(',')}`;
      sel.appendChild(opt);
    });
    if(!sel.options.length){_toast('⚠️ 복사할 다른 반이 없습니다','error');return;}
    _q('modal-copy').classList.remove('hidden');
  }
  async function doCopyBooks(){
    const fromId=_q('f-copy-from').value;
    if(!fromId||!S.copyToClsId){_toast('⚠️ 반을 선택하세요','error');return;}
    const fromCls=DB.getClassById(fromId);
    if(!fromCls){_toast('⚠️ 원본 반을 찾을 수 없습니다','error');return;}
    // ★ DB가 알아서 교재 있는 월 자동 탐색 (fromMk=S.mgMk 전달, 없으면 자동 검색)
    const result=await DB.copyBooksToClass(fromId,S.copyToClsId,S.mgMk,S.mgMk);
    if(result===false){
      _toast('⚠️ 복사할 교재가 없습니다. 원본 반에 교재를 먼저 등록해주세요.','error',4000);
      return;
    }
    closeModal('copy'); _renderMgCls();
    _toast(`📋 교재 ${result}개 복사 완료`,'success');
  }

  /* 계정 */
  // ★ 일괄 삭제 선택 모드 상태
  let _accBulkMode = false;

  function _renderMgAcc(){
    const wrap=document.getElementById('mg-accounts'); if(!wrap) return;
    wrap.innerHTML='';
    const isAdmin=DB.isAdmin(), sess=DB.getSession();
    const accs=DB.getAccounts();

    /* ── 상단 버튼 행 ── */
    if(isAdmin){
      const topRow=document.createElement('div');
      topRow.style.cssText='display:flex;gap:7px;margin-bottom:6px;align-items:center';

      // 계정 추가
      const addBtn=document.createElement('button');
      addBtn.className='add-cls';
      addBtn.style.cssText='flex:1;padding:11px';
      addBtn.innerHTML='<span style="font-size:16px">＋</span> 계정 추가';
      addBtn.onclick=()=>openAccModal();
      topRow.appendChild(addBtn);

      // 선택 삭제 토글 (삭제 가능한 계정 있을 때만)
      const deletable=accs.filter(a=>a.id!==sess?.id);
      if(deletable.length>0){
        const selBtn=document.createElement('button');
        selBtn.className='acc-sel-btn'+(_accBulkMode?' on':'');
        selBtn.id='acc-sel-mode-btn';
        selBtn.textContent=_accBulkMode?'✕ 선택 취소':'☑ 선택 삭제';
        selBtn.onclick=()=>{ _accBulkMode=!_accBulkMode; _renderMgAcc(); };
        topRow.appendChild(selBtn);
      }
      wrap.appendChild(topRow);
    }

    /* ── 일괄 삭제 액션 바 ── */
    const bulkBar=document.createElement('div');
    bulkBar.className='acc-bulk-bar'+(_accBulkMode?' on':'');
    bulkBar.id='acc-bulk-bar';
    bulkBar.innerHTML=`
      <div class="acc-bulk-cnt" id="acc-bulk-cnt">0개 선택</div>
      <button class="acc-bulk-del" id="acc-bulk-del-btn" disabled onclick="App.delAccBulk()">🗑 선택 삭제</button>
      <button class="acc-bulk-cancel" onclick="App._cancelAccBulk()">취소</button>`;
    wrap.appendChild(bulkBar);

    /* ── 역할 안내 ── */
    const note=document.createElement('div');
    note.style.cssText='font-size:11px;color:var(--tx2);margin-bottom:8px;line-height:1.65;padding:8px 10px;background:var(--card2);border-radius:var(--rs)';
    note.innerHTML='<b style="color:var(--tx)">admin</b>: 관리메뉴 전체 + 진도입력<br><b style="color:var(--tx)">operator</b>: 진도 입력만<br><b style="color:var(--tx)">teacher(강사)</b>: 지정 반 진도입력 + 관리자가 허용한 추가 메뉴(교재·성적) — <span style="color:var(--a)">담당 반 데이터만 접근</span>';
    wrap.appendChild(note);

    /* ── 계정 카드 ── */
    const card=document.createElement('div');
    card.className='acc-card';

    accs.forEach(acc=>{
      const isMe=sess?.id===acc.id;
      const canDelete=isAdmin&&!isMe;
      const row=document.createElement('div');
      row.className='acc-row';
      row.dataset.accId=acc.id;

      // ★ 선택 체크박스 (일괄 삭제 모드 & 삭제 가능 계정만)
      const ck=document.createElement('input');
      ck.type='checkbox';
      ck.className='acc-row-ck'+(_accBulkMode&&canDelete?' on':'');
      ck.dataset.accId=acc.id;
      ck.disabled=!canDelete;
      ck.addEventListener('change',_syncBulkBar);
      row.appendChild(ck);

      // ★ 메뉴 접근 권한 배지 (강사·운용자 공통)
      const menuBadge=((acc.role==='teacher'||acc.role==='operator')&&acc.allowedMenus?.length)
        ?`<div style="font-size:10px;color:var(--a);margin-top:3px">추가 메뉴: ${acc.allowedMenus.map(m=>m==='dashboard'?'🏠 홈':m==='archive'?'📁 콘텐츠':m==='booklib'?'📖 교재':m==='grade'?'📝 성적':m==='students'?'👨‍🎓 학생':m==='staff'?'👩‍💼 직원':m).join(' · ')}</div>`:''
      ;

      // 정보 영역
      const info=document.createElement('div');
      info.style.cssText='flex:1;min-width:0';
      info.innerHTML=`
        <div class="acc-nm">${_esc(acc.username)}${isMe?'&nbsp;<span style="color:var(--green);font-size:10px">●</span>':''}
          <span class="role-badge ${acc.role}">${acc.role==='admin'?'관리자':acc.role==='teacher'?'강사':'운용자'}</span>
        </div>
        <div class="acc-role">${acc.role==='admin'?'모든 기능':acc.role==='teacher'?'지정 반 진도 입력':'진도 입력만'}</div>
        ${acc.role==='teacher'&&acc.teacherClasses?.length
          ?`<div style="font-size:10px;color:var(--a);margin-top:3px">담당 반: ${acc.teacherClasses.map(id=>{const c=DB.getActiveClasses().find(cl=>cl.id===id);return c?c.name:'?';}).join(', ')}</div>`:''
        }${menuBadge}`;
      row.appendChild(info);

      // 개별 액션 버튼 (일괄 모드 아닐 때만)
      if(!_accBulkMode){
        const acts=document.createElement('div');
        acts.className='acc-acts';
        if(isAdmin) acts.innerHTML+=`<button class="ibtn" onclick="App.openAccModal('${acc.id}')">✏️</button>`;
        if(canDelete) acts.innerHTML+=`<button class="ibtn red" onclick="App.delAcc('${acc.id}','${_esc(acc.username)}')">🗑</button>`;
        row.appendChild(acts);
      }

      // 선택 모드: 행 전체 클릭으로 체크 토글
      if(_accBulkMode&&canDelete){
        row.style.cursor='pointer';
        row.addEventListener('click', e=>{
          if(e.target===ck) return;
          ck.checked=!ck.checked;
          row.classList.toggle('selected', ck.checked);
          _syncBulkBar();
        });
      }

      card.appendChild(row);
    });

    wrap.appendChild(card);
  }

  // ★ 체크박스 상태 → 액션 바 동기화
  function _syncBulkBar(){
    const checked=[...document.querySelectorAll('.acc-row-ck:checked')];
    const cnt=document.getElementById('acc-bulk-cnt');
    const delBtn=document.getElementById('acc-bulk-del-btn');
    if(cnt) cnt.textContent=`${checked.length}개 선택`;
    if(delBtn) delBtn.disabled=checked.length===0;
    document.querySelectorAll('.acc-row-ck').forEach(ck=>{
      ck.closest('.acc-row')?.classList.toggle('selected', ck.checked);
    });
  }

  // ★ 일괄 삭제 모드 취소
  function _cancelAccBulk(){ _accBulkMode=false; _renderMgAcc(); }

  // ★ 선택 계정 일괄 삭제
  async function delAccBulk(){
    const checked=[...document.querySelectorAll('.acc-row-ck:checked')];
    if(!checked.length){_toast('⚠️ 삭제할 계정을 선택하세요','error');return;}
    const ids=checked.map(ck=>ck.dataset.accId);
    const names=ids.map(id=>DB.getAccounts().find(a=>a.id===id)?.username||id);
    if(!confirm(`다음 계정 ${ids.length}개를 삭제하시겠습니까?\n\n${names.map(n=>'  · '+n).join('\n')}\n\n이 작업은 되돌릴 수 없습니다.`)) return;
    const delBtn=document.getElementById('acc-bulk-del-btn');
    if(delBtn){delBtn.disabled=true;delBtn.textContent='⏳ 삭제 중...';}
    for(const id of ids) await DB.deleteAccount(id);
    _accBulkMode=false;
    _renderMgAcc();
    _toast(`🗑 ${ids.length}개 계정 삭제 완료`,'success',3000);
  }

  function openAccModal(id=null){S.editAccId=id;const acc=id?DB.getAccounts().find(a=>a.id===id):null;_q('macc-t').textContent=id?'계정 수정':'계정 추가';_q('f-aid').value=acc?.username||'';_q('f-aid').readOnly=!!id;_q('f-apw').value='';_q('f-arole').value=acc?.role||'operator';
    // ★ allowedMenus 3번째 인자로 전달
    App._onRoleChange(acc?.role||'operator', acc?.teacherClasses||[], acc?.allowedMenus||[]);_q('modal-acc').classList.remove('hidden');}

  async function saveAccount(){const u=_q('f-aid').value.trim(),p=_q('f-apw').value,role=_q('f-arole').value;
    const teacherClasses=role==='teacher'?[...document.querySelectorAll('#f-teacher-cls-list input:checked')].map(c=>c.value):[];
    // ★ 메뉴 접근 권한 수집 — 강사·운용자 공통(admin은 항상 전체 접근이라 별도 저장 불필요)
    const allowedMenus=(role==='teacher'||role==='operator')?[...document.querySelectorAll('#f-teacher-menu-list input:checked')].map(c=>c.value):[];
    if(!u){_toast('⚠️ 아이디를 입력해주세요','error');return;}if(!S.editAccId&&!p){_toast('⚠️ 비밀번호를 입력해주세요','error');return;}if(S.editAccId){const d=p?{password:p,role,teacherClasses,allowedMenus}:{role,teacherClasses,allowedMenus};await DB.updateAccount(S.editAccId,d);_toast('✅ 계정 수정 완료','success');}else{if(!await DB.addAccount(u,p,role,teacherClasses,allowedMenus)){_toast('⚠️ 이미 존재하는 아이디','error');return;}_toast('✅ 계정 추가 완료','success');}closeModal('acc');_renderMgAcc();}

  async function delAcc(id,u){if(DB.getSession()?.id===id){_toast('⚠️ 현재 계정은 삭제 불가','error');return;}if(!confirm(`"${u}" 계정을 삭제하시겠습니까?`))return;await DB.deleteAccount(id);_renderMgAcc();_toast('🗑 삭제 완료');}

  /* 테마 */
  function _renderMgTheme(){const wrap=document.getElementById('mg-theme');if(!wrap)return;wrap.innerHTML='';const t=DB.getTheme();S.tmpTheme={...t};const isAdmin=DB.isAdmin();const card=document.createElement('div');card.className='th-card';const prev=document.createElement('div');prev.className='th-row';prev.innerHTML='<div class="th-preview" id="th-prev"></div>';card.appendChild(prev);_upPrev(PALETTES.find(p=>p.id===(t.palette||'light1'))?.accent||'#4f46e5');const pr=document.createElement('div');pr.className='th-row';pr.innerHTML='<div class="th-lbl">🎨 테마</div>';const palRow=document.createElement('div');palRow.className='pal-row';PALETTES.forEach(pal=>{const item=document.createElement('div');item.className='pal-item'+(pal.id===(t.palette||'light1')?' on':'');const swBg=pal.id==='system'?'linear-gradient(135deg,#f8f9fc 50%,#0b0b14 50%)':pal.bg;item.innerHTML=`<div class="pal-swatch" style="background:${swBg}">${pal.emoji}</div><div class="pal-name">${pal.name}</div>`;if(!isAdmin){item.style.pointerEvents='none';item.style.opacity='.5';}item.onclick=()=>{S.tmpTheme.palette=pal.id;if(pal.id!=='system')S.tmpTheme.accent=pal.accent;_applyTheme(S.tmpTheme);_upPrev(pal.accent||'#4f46e5');palRow.querySelectorAll('.pal-item').forEach((el,i)=>el.classList.toggle('on',PALETTES[i].id===pal.id));};palRow.appendChild(item);});pr.appendChild(palRow);card.appendChild(pr);const fr=document.createElement('div');fr.className='th-row';fr.innerHTML='<div class="th-lbl">🔤 폰트</div>';const ffList=document.createElement('div');ffList.className='ff-list';FONTS.forEach(f=>{const item=document.createElement('div');item.className='ff-item'+(f.key===(t.fontFamily||'Noto Sans KR')?' on':'');item.style.fontFamily=`'${f.key}',sans-serif`;item.innerHTML=`<span class="ff-name">${f.label}</span><span class="ff-sample">${f.sample}</span>`;if(!isAdmin){item.style.pointerEvents='none';item.style.opacity='.45';}item.onclick=()=>{S.tmpTheme.fontFamily=f.key;_applyTheme(S.tmpTheme);ffList.querySelectorAll('.ff-item').forEach((el,i)=>el.classList.toggle('on',FONTS[i].key===f.key));};ffList.appendChild(item);});fr.appendChild(ffList);card.appendChild(fr);const szr=document.createElement('div');szr.className='th-row';szr.innerHTML='<div class="th-lbl">📐 전체 글자 크기</div>';const szW=document.createElement('div');szW.className='sl-row';const sl=document.createElement('input');sl.type='range';sl.className='sl';sl.min=11;sl.max=22;sl.step=1;sl.value=t.fontSize||14;sl.disabled=!isAdmin;const fzv=document.createElement('div');fzv.className='sl-val';fzv.textContent=`${t.fontSize||14}px`;sl.addEventListener('input',()=>{S.tmpTheme.fontSize=+sl.value;fzv.textContent=`${sl.value}px`;_applyTheme(S.tmpTheme);_updateBkPreview();});szW.appendChild(sl);szW.appendChild(fzv);szr.appendChild(szW);card.appendChild(szr);const mfr=document.createElement('div');mfr.className='th-row';mfr.innerHTML='<div class="th-lbl">📘 주교재명 글자 크기</div>';const mfW=document.createElement('div');mfW.className='sl-row';const msl=document.createElement('input');msl.type='range';msl.className='sl';msl.min=10;msl.max=22;msl.step=1;msl.value=t.mainFontSize||t.fontSize||14;msl.disabled=!isAdmin;const mfv=document.createElement('div');mfv.className='sl-val';mfv.style.color='var(--a)';mfv.textContent=`${t.mainFontSize||t.fontSize||14}px`;msl.addEventListener('input',()=>{S.tmpTheme.mainFontSize=+msl.value;mfv.textContent=`${msl.value}px`;_applyTheme(S.tmpTheme);_updateBkPreview();});mfW.appendChild(msl);mfW.appendChild(mfv);mfr.appendChild(mfW);card.appendChild(mfr);const sfr=document.createElement('div');sfr.className='th-row';sfr.innerHTML='<div class="th-lbl">📗 부교재명 글자 크기</div>';const sfW=document.createElement('div');sfW.className='sl-row';const ssl=document.createElement('input');ssl.type='range';ssl.className='sl';ssl.min=10;ssl.max=22;ssl.step=1;ssl.value=t.subFontSize||Math.max((t.fontSize||14)-1,10);ssl.disabled=!isAdmin;const sfv=document.createElement('div');sfv.className='sl-val';sfv.style.color='var(--green)';sfv.textContent=`${t.subFontSize||Math.max((t.fontSize||14)-1,10)}px`;ssl.addEventListener('input',()=>{S.tmpTheme.subFontSize=+ssl.value;sfv.textContent=`${ssl.value}px`;_applyTheme(S.tmpTheme);_updateBkPreview();});sfW.appendChild(ssl);sfW.appendChild(sfv);sfr.appendChild(sfW);card.appendChild(sfr);const bpRow=document.createElement('div');bpRow.className='th-row';bpRow.innerHTML='<div class="th-lbl">👁 교재 미리보기</div>';const bpBox=document.createElement('div');bpBox.className='bk-preview-box';bpBox.id='bk-preview-box';['main','sub'].forEach(type=>{const row=document.createElement('div');row.className='bk-preview-row';const tag=document.createElement('span');tag.className=`bk-tag ${type}`;tag.textContent=type==='main'?'주':'부';const nm=document.createElement('span');nm.className='bk-preview-nm';nm.id=`bk-preview-nm-${type}`;nm.textContent=type==='main'?'수학의 정석(상)':'쎈 수학';nm.style.fontSize=type==='main'?`${S.tmpTheme.mainFontSize||t.mainFontSize||t.fontSize||14}px`:`${S.tmpTheme.subFontSize||t.subFontSize||Math.max((t.fontSize||14)-1,10)}px`;const inp2=document.createElement('div');inp2.className='bk-preview-inp';inp2.textContent='p.123~130';inp2.style.fontSize=`${S.tmpTheme.fontSize||t.fontSize||14}px`;inp2.style.width=`${S.tmpTheme.inputBoxWidth||t.inputBoxWidth||140}px`;row.appendChild(tag);row.appendChild(nm);row.appendChild(inp2);bpBox.appendChild(row);});bpRow.appendChild(bpBox);card.appendChild(bpRow);const iwr=document.createElement('div');iwr.className='th-row';iwr.innerHTML='<div class="th-lbl">📏 진도 입력칸 너비</div>';const iwW=document.createElement('div');iwW.className='sl-row';const isl=document.createElement('input');isl.type='range';isl.className='sl';isl.min=80;isl.max=260;isl.step=10;isl.value=t.inputBoxWidth||140;isl.disabled=!isAdmin;const iwv=document.createElement('div');iwv.className='sl-val';iwv.textContent=`${t.inputBoxWidth||140}px`;isl.addEventListener('input',()=>{S.tmpTheme.inputBoxWidth=+isl.value;iwv.textContent=`${isl.value}px`;_applyTheme(S.tmpTheme);_updateBkPreview();});iwW.appendChild(isl);iwW.appendChild(iwv);iwr.appendChild(iwW);card.appendChild(iwr);const ovr=document.createElement('div');ovr.className='th-row';ovr.innerHTML='<div class="th-lbl">📱 운용화면 기본 보기</div>';const vrow=document.createElement('div');vrow.className='view-sel-row';[{v:'grid',l:'⊞ 그리드'},{v:'list',l:'☰ 리스트'}].forEach(({v,l})=>{const btn=document.createElement('button');btn.className='view-sel-btn'+(v===(t.operateView||'grid')?' on':'');btn.textContent=l;if(!isAdmin){btn.disabled=true;btn.style.opacity='.45';}btn.onclick=()=>{S.tmpTheme.operateView=v;S.operateView=v;vrow.querySelectorAll('.view-sel-btn').forEach((b,i)=>b.classList.toggle('on',['grid','list'][i]===v));};vrow.appendChild(btn);});ovr.appendChild(vrow);card.appendChild(ovr);const pvr=document.createElement('div');pvr.className='th-row';pvr.innerHTML='<div class="th-lbl">📅 진도 탭 표시 방식</div>';const pvRow=document.createElement('div');pvRow.className='view-sel-row';[{v:'timeline',l:'📅 타임라인(권장)'},{v:'weekly',l:'🗓️ 주간(기존)'}].forEach(({v,l})=>{const btn=document.createElement('button');btn.className='view-sel-btn'+(v===(t.progressViewMode||'timeline')?' on':'');btn.textContent=l;if(!isAdmin){btn.disabled=true;btn.style.opacity='.45';}btn.onclick=()=>{S.tmpTheme.progressViewMode=v;pvRow.querySelectorAll('.view-sel-btn').forEach((b,i)=>b.classList.toggle('on',['timeline','weekly'][i]===v));};pvRow.appendChild(btn);});pvr.appendChild(pvRow);card.appendChild(pvr);
/* ══ 대시보드 스타일 3종 — 색상과 별개로 구도·톤을 바꾼다 ══ */
{
  const dsr = document.createElement('div'); dsr.className = 'th-row';
  dsr.innerHTML = '<div class="th-lbl">🖥️ 대시보드 스타일</div>';
  const dsRow = document.createElement('div'); dsRow.className = 'pal-row';
  const DASH_STYLES = [
    { v:'minimal', emoji:'📄', name:'미니멀', desc:'여백 중심의 카드형 (Notion·Linear풍)' },
    { v:'compact', emoji:'📊', name:'컴팩트', desc:'촘촘한 정보 밀집형 (Linear·Vercel풍)' },
    { v:'hero',    emoji:'✨', name:'히어로', desc:'상단 강조 배너형 (Stripe·Attio풍)' },
  ];
  DASH_STYLES.forEach(ds => {
    const item = document.createElement('div');
    item.className = 'pal-item' + ((S.tmpTheme.dashboardStyle||'minimal') === ds.v ? ' on' : '');
    item.title = ds.desc;
    item.innerHTML = `<div class="pal-swatch" style="background:var(--card2);font-size:20px">${ds.emoji}</div><div class="pal-name">${ds.name}</div>`;
    if (!isAdmin) { item.style.pointerEvents='none'; item.style.opacity='.5'; }
    item.onclick = () => {
      S.tmpTheme.dashboardStyle = ds.v;
      dsRow.querySelectorAll('.pal-item').forEach((el,i)=>el.classList.toggle('on', DASH_STYLES[i].v===ds.v));
    };
    dsRow.appendChild(item);
  });
  dsr.appendChild(dsRow);
  const dsHint = document.createElement('div');
  dsHint.style.cssText = 'font-size:10px;color:var(--tx3);margin-top:6px;line-height:1.5';
  dsHint.textContent = '저장하면 홈(대시보드) 화면에 바로 적용됩니다. 색상 팔레트는 그대로 유지된 채 배치·여백·강조 방식만 바뀝니다.';
  dsr.appendChild(dsHint);
  card.appendChild(dsr);
}

/* ══ 배경 이미지(BgTheme) — 무료 이미지 연동, 무드/강도/교체주기 설정 ══ */
if (typeof BgTheme !== 'undefined') {
  // ★ t.bg는 DB.getTheme()가 반환하는 라이브 참조이므로, 얕은 복사라도 반드시
  //   새 객체로 떼어내야 한다. 그렇지 않으면 저장 버튼을 누르기 전 미리보기
  //   조작만으로 DB.getTheme()의 실제 값(C.theme.bg)이 그대로 변조되어 버린다.
  S.tmpTheme.bg = { ...(t.bg || {}) };
  // ★ 옵션 체크 전에는 반드시 기존 상태(=배경 없음) 그대로 유지되도록 명시적으로 false 판정
  const bgWasOn = t.bg?.enabled === true;
  const bgCard = document.createElement('div'); bgCard.className = 'th-row';
  bgCard.innerHTML = '<div class="th-lbl">🖼️ 배경 이미지 (무료 이미지 연동)</div>';
  const bgCkLabel = document.createElement('label');
  bgCkLabel.style.cssText = 'display:flex;align-items:center;gap:8px;cursor:pointer;user-select:none';
  const bgCk = document.createElement('input');
  bgCk.type = 'checkbox'; bgCk.id = 'th-bg-enable';
  bgCk.checked = bgWasOn;
  bgCk.style.cssText = 'width:18px;height:18px;accent-color:var(--a);cursor:pointer;flex-shrink:0';
  if (!isAdmin) { bgCk.disabled = true; bgCk.style.opacity = '.45'; }
  const bgCkText = document.createElement('span');
  bgCkText.style.cssText = 'font-size:var(--fzs);font-weight:700;color:var(--tx2)';
  bgCkText.textContent = '배경 이미지 사용 (체크할 때만 동작 · 기본값: 사용 안 함)';
  bgCkLabel.appendChild(bgCk); bgCkLabel.appendChild(bgCkText);
  const bgSub = document.createElement('div');
  bgSub.className = 'bg-sub' + (bgWasOn ? '' : ' bg-sub-disabled');
  bgCk.onchange = async () => {
    S.tmpTheme.bg.enabled = bgCk.checked;
    bgSub.classList.toggle('bg-sub-disabled', !bgCk.checked);
    // ★ 버그 수정: 체크만 하고 저장하면 사진을 받아온 적이 없어(bg.url 비어있음)
    //   render()가 그릴 게 없어 아무 변화도 안 보였던 부분 — 처음 켤 때 자동으로 한 장 받아온다.
    if (bgCk.checked && !S.tmpTheme.bg.url) {
      bgCkText.textContent = '배경 이미지 사용 — 첫 배경을 불러오는 중...';
      bgCk.disabled = true;
      try {
        const fresh = await BgTheme.fetchOne(S.tmpTheme.bg.mood || 'season');
        if (fresh) {
          S.tmpTheme.bg = { ...S.tmpTheme.bg, url:fresh.url, credit:fresh.credit, query:fresh.query, updatedAt:new Date().toISOString() };
          BgTheme.render(S.tmpTheme);
          _toast('🖼️ 배경 이미지를 적용했습니다 — 아래 저장 버튼을 눌러야 기기 전체에 반영됩니다','success',3500);
        } else {
          _toast('⚠️ 이미지를 불러오지 못했습니다. "지금 새 배경 미리보기" 버튼으로 다시 시도해주세요','error',4000);
        }
      } catch(e) {
        console.warn('[BgTheme] 최초 배경 불러오기 실패', e);
        _toast('⚠️ 이미지를 불러오지 못했습니다. "지금 새 배경 미리보기" 버튼으로 다시 시도해주세요','error',4000);
      }
      bgCkText.textContent = '배경 이미지 사용 (체크할 때만 동작 · 기본값: 사용 안 함)';
      bgCk.disabled = !isAdmin;
    } else {
      BgTheme.render(S.tmpTheme);
    }
  };
  bgCard.appendChild(bgCkLabel); card.appendChild(bgCard);

  const mdr = document.createElement('div'); mdr.className = 'th-row';
  mdr.innerHTML = '<div class="th-lbl">🎨 무드</div>';
  const mdRow = document.createElement('div'); mdRow.className = 'view-sel-row';
  [{v:'season',l:'🍁 계절감'},{v:'minimal',l:'🤍 미니멀'},{v:'wood',l:'🪵 우드톤'},{v:'pastel',l:'🌸 파스텔'}].forEach(({v,l})=>{
    const btn = document.createElement('button');
    btn.className = 'view-sel-btn' + ((S.tmpTheme.bg.mood||'season') === v ? ' on' : '');
    btn.textContent = l;
    if (!isAdmin) { btn.disabled = true; btn.style.opacity = '.45'; }
    btn.onclick = () => {
      S.tmpTheme.bg.mood = v;
      mdRow.querySelectorAll('.view-sel-btn').forEach((b,i)=>b.classList.toggle('on',['season','minimal','wood','pastel'][i]===v));
    };
    mdRow.appendChild(btn);
  });
  mdr.appendChild(mdRow); bgSub.appendChild(mdr);

  const stR = document.createElement('div'); stR.className = 'th-row';
  stR.innerHTML = '<div class="th-lbl">🌗 배경 강도</div>';
  const stRow = document.createElement('div'); stRow.className = 'view-sel-row';
  [{v:'soft',l:'은은하게'},{v:'normal',l:'보통'},{v:'vivid',l:'선명하게'}].forEach(({v,l})=>{
    const btn = document.createElement('button');
    btn.className = 'view-sel-btn' + ((S.tmpTheme.bg.strength||'soft') === v ? ' on' : '');
    btn.textContent = l;
    if (!isAdmin) { btn.disabled = true; btn.style.opacity = '.45'; }
    btn.onclick = () => {
      S.tmpTheme.bg.strength = v;
      BgTheme.render(S.tmpTheme);
      stRow.querySelectorAll('.view-sel-btn').forEach((b,i)=>b.classList.toggle('on',['soft','normal','vivid'][i]===v));
    };
    stRow.appendChild(btn);
  });
  stR.appendChild(stRow); bgSub.appendChild(stR);

  const rfR = document.createElement('div'); rfR.className = 'th-row';
  rfR.innerHTML = '<div class="th-lbl">🔄 자동 교체 주기 · 즉시 미리보기</div>';
  const rfRow = document.createElement('div'); rfRow.className = 'view-sel-row';
  [{v:7,l:'매주'},{v:1,l:'매일'},{v:30,l:'매월'}].forEach(({v,l})=>{
    const btn = document.createElement('button');
    btn.className = 'view-sel-btn' + ((S.tmpTheme.bg.rotateDays||7) === v ? ' on' : '');
    btn.textContent = l;
    if (!isAdmin) { btn.disabled = true; btn.style.opacity = '.45'; }
    btn.onclick = () => {
      S.tmpTheme.bg.rotateDays = v;
      rfRow.querySelectorAll('.view-sel-btn').forEach((b,i)=>b.classList.toggle('on',[7,1,30][i]===v));
    };
    rfRow.appendChild(btn);
  });
  rfR.appendChild(rfRow);
  if (isAdmin) {
    const rfBtn = document.createElement('button');
    rfBtn.className = 'view-sel-btn'; rfBtn.style.cssText = 'margin-top:8px;width:100%';
    rfBtn.textContent = '🎲 지금 새 배경 미리보기';
    rfBtn.onclick = async () => {
      rfBtn.disabled = true; rfBtn.textContent = '불러오는 중...';
      try {
        const fresh = await BgTheme.fetchOne(S.tmpTheme.bg.mood || 'season');
        if (fresh) {
          S.tmpTheme.bg = { ...S.tmpTheme.bg, url:fresh.url, credit:fresh.credit, query:fresh.query, updatedAt:new Date().toISOString() };
          BgTheme.render(S.tmpTheme);
          _toast('🖼️ 새 배경 미리보기 — 마음에 들면 아래 저장 버튼을 눌러주세요','success',3200);
        } else {
          _toast('⚠️ 이미지를 불러오지 못했습니다(잠시 후 다시 시도)','error');
        }
      } catch(e) { console.warn('[BgTheme] 미리보기 실패', e); _toast('⚠️ 이미지를 불러오지 못했습니다','error'); }
      rfBtn.disabled = false; rfBtn.textContent = '🎲 지금 새 배경 미리보기';
    };
    rfR.appendChild(rfBtn);
  }
  bgSub.appendChild(rfR);
  // ★ 화면을 가리던 우하단 고정 출처 표기를 없애는 대신, 여기 설정 화면 안에만 조용히 표기
  const crR = document.createElement('div'); crR.className = 'th-row';
  const credit = (typeof BgTheme !== 'undefined' && BgTheme.getCredit) ? BgTheme.getCredit() : null;
  crR.innerHTML = credit?.name
    ? `<div style="font-size:10px;color:var(--tx3)">📷 현재 배경 출처: <a href="${_esc(credit.link||'#')}" target="_blank" rel="noopener" style="color:var(--tx3);text-decoration:underline">${_esc(credit.name)} · Unsplash</a></div>`
    : '';
  if (credit?.name) bgSub.appendChild(crR);
  card.appendChild(bgSub);
}
if(isAdmin){const sr=document.createElement('div');sr.className='th-row';const sb=document.createElement('button');sb.className='th-save-btn';sb.textContent='💾 테마 저장 · 적용';sb.onclick=async()=>{sb.textContent='저장 중...';sb.disabled=true;await DB.saveTheme(S.tmpTheme);_applyTheme(S.tmpTheme);S.operateView=S.tmpTheme.operateView||'grid';S.viewMode=S.tmpTheme.viewMode||'grid';S.progressViewMode=S.tmpTheme.progressViewMode||'timeline';_updateToggleBtn();sb.textContent='💾 테마 저장 · 적용';sb.disabled=false;_toast('🎨 테마 저장 완료!','success',3500);_renderMgTheme();};sr.appendChild(sb);card.appendChild(sr);}else{const nr=document.createElement('div');nr.className='th-row';nr.innerHTML='<div style="font-size:11px;color:var(--tx3)">⚠️ 테마 변경은 관리자 로그인 후 가능합니다</div>';card.appendChild(nr);}wrap.appendChild(card);

  // ★ 탭 순서 설정 카드 (관리자 전용)
  if(isAdmin){
    const navCard=document.createElement('div');
    navCard.className='th-card';
    navCard.style.marginTop='14px';

    const navHdr=document.createElement('div');
    navHdr.className='th-row';
    navHdr.innerHTML='<div class="th-lbl">📋 하단 탭 순서 설정</div><div style="font-size:10px;color:var(--tx3)">↑↓ 버튼으로 순서 조정 · 관리자에게만 보이는 탭 포함</div>';
    navCard.appendChild(navHdr);

    const navList=document.createElement('div');
    navList.id='nav-order-list';
    navList.style.cssText='display:flex;flex-direction:column;gap:6px;padding:4px 2px';

    let _tmpOrder=_getNavOrder().slice();

    function _renderNavList(){
      navList.innerHTML='';
      _tmpOrder.forEach((pg,idx)=>{
        const def=NAV_DEF.find(d=>d.pg===pg);if(!def)return;
        const row=document.createElement('div');
        row.style.cssText='display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--card);border:1px solid var(--bdr);border-radius:10px;transition:background .12s';
        row.setAttribute('data-pg', pg);
        row.innerHTML=`
          <span style="font-size:18px;flex-shrink:0">${def.ico}</span>
          <div style="flex:1">
            <div style="font-size:13px;font-weight:800;color:var(--tx)">${def.lbl}</div>
            <div style="font-size:10px;color:var(--tx3);margin-top:1px">${def.adminOnly?'관리자 전용':'공통'} · /${def.pg}</div>
          </div>
          <div style="display:flex;gap:4px">
            <button data-idx="${idx}" data-dir="up"
              style="width:28px;height:28px;border-radius:7px;border:1px solid var(--bdr2);background:var(--surf2);color:var(--tx2);cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;font-family:var(--font)"
              ${idx===0?'disabled style="opacity:.35;pointer-events:none"':''}>↑</button>
            <button data-idx="${idx}" data-dir="dn"
              style="width:28px;height:28px;border-radius:7px;border:1px solid var(--bdr2);background:var(--surf2);color:var(--tx2);cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;font-family:var(--font)"
              ${idx===_tmpOrder.length-1?'disabled style="opacity:.35;pointer-events:none"':''}>↓</button>
          </div>`;
        row.querySelectorAll('button[data-dir]').forEach(btn=>{
          btn.onclick=()=>{
            const i=+btn.dataset.idx, dir=btn.dataset.dir;
            const j=dir==='up'?i-1:i+1;
            if(j<0||j>=_tmpOrder.length)return;
            [_tmpOrder[i],_tmpOrder[j]]=[_tmpOrder[j],_tmpOrder[i]];
            _renderNavList();
          };
        });
        navList.appendChild(row);
      });
    }
    _renderNavList();
    navCard.appendChild(navList);

    // 미리보기 + 저장/초기화 버튼
    const navActs=document.createElement('div');
    navActs.className='th-row';
    navActs.style.cssText='display:flex;gap:8px;margin-top:10px';
    navActs.innerHTML=`
      <button style="flex:1;padding:10px;border-radius:9px;background:var(--surf2);border:1px solid var(--bdr2);color:var(--tx2);font-size:12px;font-weight:700;cursor:pointer;font-family:var(--font)"
        onclick="App._resetNavOrder()">초기화</button>
      <button style="flex:2;padding:10px;border-radius:9px;background:var(--a);color:#fff;border:none;font-size:12px;font-weight:800;cursor:pointer;font-family:var(--font);box-shadow:0 3px 10px var(--a40)"
        onclick="(()=>{const rows=[...document.getElementById('nav-order-list').children];const order=rows.map(r=>r.dataset.pg).filter(Boolean);if(order.length){App._saveNavOrder(order);App._renderNav();App._toast('✅ 탭 순서 저장됨','success',2500);}})()">💾 탭 순서 저장</button>`;
    navCard.appendChild(navActs);
    wrap.appendChild(navCard);
  }
}
  function _updateBkPreview(){const t=S.tmpTheme||DB.getTheme();['main','sub'].forEach(tp=>{const nm=document.getElementById(`bk-preview-nm-${tp}`);if(nm)nm.style.fontSize=tp==='main'?`${t.mainFontSize||t.fontSize||14}px`:`${t.subFontSize||Math.max((t.fontSize||14)-1,10)}px`;});document.querySelectorAll('.bk-preview-inp').forEach(el=>{el.style.fontSize=`${t.fontSize||14}px`;el.style.width=`${t.inputBoxWidth||140}px`;});}
  function _upPrev(c){const el=_q('th-prev');if(el)el.style.background=`linear-gradient(90deg,${c},#8b5cf6,#06b6d4)`;}

  /* ════════════════════════════════════════════
   * 💸 수업료 · 교재비 일괄 편집 패널
   * ════════════════════════════════════════════ */
  function openFeePanel(){
    const ov=_q('mg-fee-ov'); if(!ov)return;
    _renderFeePanel();
    ov.classList.remove('hidden');
    history.pushState({pg:'feepanel'},'');
  }

  function closeFeePanel(e){
    if(e&&e.target&&e.target.id!=='mg-fee-ov')return;
    _q('mg-fee-ov')?.classList.add('hidden');
  }

  async function _feeRefresh(){
    if(!FireDB.ready()){_toast('⚠️ Firebase에 연결되어 있지 않습니다','error',3000);return;}
    _toast('🔄 Firebase에서 최신 데이터를 불러오는 중...','',2000);
    try{
      const snap=await FireDB.get(FireDB.P.root);
      if(snap&&snap.classes){
        // C.classes를 Firebase 데이터로 완전히 교체 (localStorage도 갱신)
        const fbClasses=Object.values(snap.classes);
        // monthBooks는 로컬이 더 최신일 수 있으므로 병합
        const local=DB.getClasses();
        fbClasses.forEach(fbCls=>{
          const loc=local.find(c=>c.id===fbCls.id);
          if(loc?.monthBooks){
            Object.keys(loc.monthBooks).forEach(mk=>{
              if(!fbCls.monthBooks) fbCls.monthBooks={};
              if(!fbCls.monthBooks[mk]) fbCls.monthBooks[mk]=loc.monthBooks[mk];
            });
          }
          // C.classes 내부 객체를 Firebase 데이터로 덮어쓰기
          const idx=local.findIndex(c=>c.id===fbCls.id);
          if(idx!==-1) Object.keys(fbCls).forEach(k=>{ local[idx][k]=fbCls[k]; });
        });
        _renderFeePanel();
        _toast('✅ Firebase 최신 데이터 반영 완료','success',2000);
      } else {
        _toast('⚠️ Firebase에 데이터가 없습니다','error',3000);
      }
    }catch(e){
      console.error('feeRefresh',e);
      _toast('❌ 데이터 불러오기 실패: '+e.message,'error',4000);
    }
  }

  function _renderFeePanel(){
    const sh=_q('mg-fee-sh'); if(!sh)return;
    const mk=S.mgMk;
    const [y,mo]=mk.split('-').map(Number);
    const classes=DB.getClassesForMonth(mk).slice().sort((a,b)=>a.name.localeCompare(b.name,'ko'));

    const cards=classes.length ? classes.map(cls=>`
      <div class="fee-card" data-id="${cls.id}">
        <div class="fee-card-hdr">
          <div class="fee-card-nm">${_esc(cls.name)}</div>
          <span class="fee-card-days">${(cls.days||[]).join(' · ')}</span>
          <button class="fee-save-btn" id="fs-${cls.id}" style="display:none"
            onclick="App._feeSaveRow('${cls.id}')">저장</button>
        </div>
        <div class="fee-card-body">
          <div class="fee-field">
            <label class="fee-field-lbl">💰 수업료</label>
            <div class="fee-inp-wrap">
              <input class="fee-inp" id="fi-tu-${cls.id}" type="number" inputmode="numeric"
                min="0" step="1000" placeholder="미입력"
                value="${cls.tuition??''}"
                onchange="App._feeMarkDirty('${cls.id}')">
              <span class="fee-unit">원</span>
            </div>
          </div>
          <div class="fee-field">
            <label class="fee-field-lbl">📚 교재비</label>
            <div class="fee-inp-wrap">
              <input class="fee-inp" id="fi-bf-${cls.id}" type="number" inputmode="numeric"
                min="0" step="1000" placeholder="미입력"
                value="${cls.bookFee??''}"
                onchange="App._feeMarkDirty('${cls.id}')">
              <span class="fee-unit">원</span>
            </div>
          </div>
        </div>
        <div class="fee-memo-area">
          <label class="fee-field-lbl">📝 엑셀 메모 <span style="font-weight:400;color:var(--tx3)">(추출 시 반영)</span></label>
          <textarea class="fee-memo-inp" id="fi-memo-${cls.id}" rows="2"
            placeholder="엑셀 수납 등록 파일의 메모란에 들어갈 내용"
            oninput="App._feeMarkDirty('${cls.id}')">${_esc(cls.exportMemo||'')}</textarea>
        </div>
      </div>`).join('')
    : `<div style="text-align:center;padding:32px;color:var(--tx3)">이 월에 편성된 반이 없습니다</div>`;

    sh.innerHTML=`
      <div class="sh-handle"></div>
      <div class="fee-panel-hdr">
        <div>
          <div class="sh-title" style="margin-bottom:0">💸 수업료 · 교재비 편집</div>
          <div class="sh-sub" style="margin-bottom:0">${y}년 ${mo}월 · ${classes.length}개 반</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <button class="fee-close-btn" title="Firebase에서 최신 데이터 불러오기" onclick="App._feeRefresh()" style="font-size:13px">🔄</button>
          <button class="fee-close-btn" onclick="App.closeFeePanel()">✕</button>
        </div>
      </div>

      <div class="fee-hint">
        ✏️ 수정하면 반별 <b>저장</b> 버튼이 나타납니다. 메모는 📤 엑셀 추출 시에만 반영됩니다.
      </div>

      <div class="fee-cards">${cards}</div>

      ${classes.length?`
      <div class="fee-bulk-bar">
        <div class="fee-bulk-info" id="fee-bulk-info">모두 저장하려면 아래 버튼을 누르세요</div>
        <button class="btn-ok" onclick="App._feeSaveAll()">📋 전체 저장</button>
      </div>`:''}
    `;
  }

  function _feeMarkDirty(id){
    const btn=_q(`fs-${id}`); if(btn) btn.style.display='';
    const row=document.querySelector(`.fee-card[data-id="${id}"]`);
    if(row) row.classList.add('fee-dirty');
  }

  async function _feeSaveRow(id){
    const cls=DB.getClassById(id); if(!cls)return;
    const tuitionEl=_q(`fi-tu-${id}`);
    const bookFeeEl=_q(`fi-bf-${id}`);
    const memoEl=_q(`fi-memo-${id}`);
    const tuition=tuitionEl?.value!==''?Math.max(0,parseInt(tuitionEl.value,10)||0):null;
    const bookFee=bookFeeEl?.value!==''?Math.max(0,parseInt(bookFeeEl.value,10)||0):null;
    const exportMemo=(memoEl?.value||'').trim();
    const upd={};
    if(tuition!=null)upd.tuition=tuition; else upd.tuition=null;
    if(bookFee!=null)upd.bookFee=bookFee; else upd.bookFee=null;
    upd.exportMemo=exportMemo||null;
    // ★ Firebase 저장 결과를 직접 확인
    const result=await DB.updateClass(id,upd);
    const fbOk=FireDB.isConnected();
    const btn=_q(`fs-${id}`); if(btn) btn.style.display='none';
    const row=document.querySelector(`.fee-card[data-id="${id}"]`);
    if(row){row.classList.remove('fee-dirty');row.classList.add('fee-saved');setTimeout(()=>row.classList.remove('fee-saved'),1200);}
    _renderMgClsContent(_q('mg-classes')?.querySelector('.mg-cls-scroll'));
    if(!fbOk) _toast(`⚠️ ${cls.name}반: 로컬 저장됨 (Firebase 오프라인 — 연결 후 자동 동기화)`,'',3500);
    else _toast(`✅ ${cls.name}반 저장 완료 (Firebase 동기화됨)`,'success',2000);
  }

  async function _feeSaveAll(){
    const rows=document.querySelectorAll('.fee-card');
    if(!rows.length)return;
    let count=0; let fbFail=0;
    for(const row of rows){
      const id=row.dataset.id; if(!id)continue;
      const tuitionEl=_q(`fi-tu-${id}`);
      const bookFeeEl=_q(`fi-bf-${id}`);
      const memoEl=_q(`fi-memo-${id}`);
      const tuition=tuitionEl?.value!==''?Math.max(0,parseInt(tuitionEl.value,10)||0):null;
      const bookFee=bookFeeEl?.value!==''?Math.max(0,parseInt(bookFeeEl.value,10)||0):null;
      const exportMemo=(memoEl?.value||'').trim();
      const upd={};
      if(tuition!=null)upd.tuition=tuition; else upd.tuition=null;
      if(bookFee!=null)upd.bookFee=bookFee; else upd.bookFee=null;
      upd.exportMemo=exportMemo||null;
      await DB.updateClass(id,upd);
      // Firebase에 전체 set으로 강제 기록
      const freshCls=DB.getClassById(id);
      if(FireDB.ready()&&freshCls){
        const ok=await FireDB.set(`${FireDB.P.classes}/${id}`,freshCls);
        if(!ok) fbFail++;
      } else { fbFail++; }
      row.classList.remove('fee-dirty'); row.classList.add('fee-saved');
      setTimeout(()=>row.classList.remove('fee-saved'),1200);
      document.querySelectorAll('.fee-save-btn').forEach(b=>b.style.display='none');
      count++;
    }
    const info=_q('fee-bulk-info');
    if(info) info.textContent=`✅ ${count}개 반 저장 완료`;
    setTimeout(()=>{if(info)info.textContent='모두 저장하려면 아래 버튼을 누르세요';},2500);
    _renderMgClsContent(_q('mg-classes')?.querySelector('.mg-cls-scroll'));
    if(!FireDB.ready()) _toast(`⚠️ 로컬 저장됨 (Firebase 미연결 — 재저장 필요)`,'',4000);
    else if(fbFail>0) _toast(`❌ ${fbFail}개 반 Firebase 저장 실패 — 콘솔 확인 필요`,'error',4000);
    else _toast(`✅ 전체 ${count}개 반 저장 완료`,'success');
  }

  function _renderMgIO(){const wrap=document.getElementById('mg-io');if(!wrap)return;wrap.innerHTML='';const isAdmin=DB.isAdmin();const card=document.createElement('div');card.className='io-card';const exRow=document.createElement('div');exRow.className='io-row';exRow.innerHTML='<div><div class="io-title">📤 엑셀 내보내기</div><div class="io-desc">반·교재·진도·메모 전체 백업</div></div>';const exBtn=document.createElement('button');exBtn.className='io-btn ex';exBtn.textContent='내보내기';exBtn.disabled=!isAdmin;exBtn.onclick=_exportExcel;exRow.appendChild(exBtn);card.appendChild(exRow);const imRow=document.createElement('div');imRow.className='io-row';imRow.innerHTML='<div><div class="io-title">📥 엑셀 불러오기</div><div class="io-desc">DB 초기화 후에도 복구 가능</div></div>';const imBtn=document.createElement('button');imBtn.className='io-btn im';imBtn.textContent='파일 선택';imBtn.disabled=!isAdmin;imBtn.onclick=()=>_q('xl-in').click();imRow.appendChild(imBtn);card.appendChild(imRow);wrap.appendChild(card);const drop=document.createElement('div');drop.className='drop-zone';drop.innerHTML='📂 엑셀 파일을 여기에 드래그하거나 탭하세요';drop.addEventListener('dragover',e=>{e.preventDefault();drop.classList.add('drag-over');});drop.addEventListener('dragleave',()=>drop.classList.remove('drag-over'));drop.addEventListener('drop',e=>{e.preventDefault();drop.classList.remove('drag-over');const f=e.dataTransfer.files[0];if(f)_processImport(f);});drop.addEventListener('click',()=>_q('xl-in').click());wrap.appendChild(drop);if(!isAdmin){const n=document.createElement('div');n.className='empty';n.textContent='⚠️ 관리자 로그인 후 사용 가능합니다';wrap.appendChild(n);}}
  function _exportExcel(){const data=DB.exportAll();const wb=XLSX.utils.book_new();const clsRows=[];data.classes.forEach(cls=>{const mk=DB.monthKey(new Date());const bks=cls.monthBooks?.[mk]||{main:[],sub:[],pool:[]};clsRows.push({반:cls.name,상태:cls.termEnd?'종료':'운용중',편성시작:cls.termStart||'',편성종료:cls.termEnd||'',요일:(cls.days||[]).join(','),교재목록:(bks.pool||[]).map(b=>b.name).join('/'),주교재:(bks.main||[]).map(b=>b.name).join('/'),부교재:(bks.sub||[]).map(b=>b.name).join('/')});});XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(clsRows),'반목록');const pRows=[];Object.entries(data.progress||{}).forEach(([k,v])=>{if(v===null||v===undefined||v==='')return;const p=k.split('__');const cls=data.classes.find(c=>c.id===p[0]);const cn=cls?.name||p[0];const isMemo=p[3]==='MEMO';const row={반:cn,주차:p[1]||'',요일:p[2]||''};if(isMemo){row.구분='메모';row.교재='';row.값=v;}else{row.구분=p[4]==='savedAt'?'입력시간':'진도';row.교재=p[3]||'';row.값=v;}pRows.push(row);});if(!pRows.length)pRows.push({반:'데이터없음',주차:'',요일:'',구분:'',교재:'',값:''});XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(pRows),'진도메모데이터');XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet([{data:JSON.stringify({version:'10d',classes:data.classes,progress:data.progress,theme:data.theme})}]),'_restore');const n=new Date();XLSX.writeFile(wb,`진도관리백업_${n.getFullYear()}${String(n.getMonth()+1).padStart(2,'0')}${String(n.getDate()).padStart(2,'0')}.xlsx`);_toast('📤 백업 완료','success');}
  function handleImport(input){const f=input.files[0];if(!f)return;input.value='';_processImport(f);}

  /** 📤 반 관리에서 보고 있는 월(S.mgMk) 기준 수업료 수납 등록 엑셀 추출
   *  반에 등록된 수업료(tuition)를 "[N월] 반이름 교재" 수납명으로 변환
   *  업로드 양식 컬럼: 수납명/수납구분/판매금액/매입단가/학년/제조사/거래처/메모/재고수량/과세면세/수납생성여부
   */
  function exportTuitionExcel(){
    if(typeof XLSX==='undefined'){_toast('❌ XLSX 라이브러리가 로드되지 않았습니다','error');return;}
    const mk=S.mgMk;
    const [y,mo]=mk.split('-').map(Number);
    const classes=DB.getClassesForMonth(mk).slice().sort((a,b)=>a.name.localeCompare(b.name,'ko'));
    if(!classes.length){_toast(`⚠️ ${y}년 ${mo}월에 편성된 반이 없습니다`,'error');return;}
    const withFee=classes.filter(c=>Number(c.bookFee)>0);
    const missing=classes.filter(c=>!(Number(c.bookFee)>0)).map(c=>c.name);
    if(!withFee.length){_toast(`⚠️ ${y}년 ${mo}월 반 중 교재비가 등록된 반이 없습니다.\n관리>반 관리에서 월 교재비를 먼저 입력해주세요.`,'error',4500);return;}

    const header=['수납명\n(필수)',
      "수납구분\n'교재,유니폼,차량비,원복,식비,학용품,교구,신발,기타' 중 택일\n(필수)",
      "판매금액\n'숫자만입력(콤마허용)'\n(필수)",
      '매입단가\n\'숫자만입력\'','학년','제조사','거래처','메모',
      "재고수량\n'숫자만입력'",'과세/면세','수납생성여부\n(Y/N)'];
    const rows=withFee.map(c=>[
      `[${mo}월] ${c.name} 교재`, '교재', String(Math.round(Number(c.bookFee))),
      '', '', '', '', c.exportMemo||'', '', '면세', 'Y',
    ]);
    const ws=XLSX.utils.aoa_to_sheet([header,...rows]);
    ws['!cols']=[{wch:24},{wch:57},{wch:23},{wch:17},{wch:17},{wch:17},{wch:19},{wch:21},{wch:15},{wch:10},{wch:15}];
    ws['!rows']=[{hpt:49.5}];
    for(let r=1;r<=rows.length+1;r++){
      ['A','B','C','J','K'].forEach(col=>{const addr=`${col}${r}`;if(ws[addr])ws[addr].z='@';});
    }
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,ws,'Sheet1');
    XLSX.writeFile(wb,`교재수납등록_${y}년${String(mo).padStart(2,'0')}월.xlsx`);

    if(missing.length) _toast(`📤 ${withFee.length}개 반 추출 완료 · ⚠️ 교재비 미등록 반: ${missing.join(', ')}`,'success',5000);
    else _toast(`📤 ${y}년 ${mo}월 교재 수납 등록 엑셀 추출 완료 (${withFee.length}개 반)`,'success');
  }

  async function _processImport(file){const reader=new FileReader();reader.onload=async(e)=>{try{const wb=XLSX.read(e.target.result,{type:'array'});const raw=wb.Sheets['_restore'];if(!raw){_toast('⚠️ 올바른 백업 파일이 아닙니다','error');return;}const rows=XLSX.utils.sheet_to_json(raw);if(!rows[0]?.data){_toast('⚠️ 데이터 없음','error');return;}const data=JSON.parse(rows[0].data);const result=await DB.importAll(data);_renderMgCls();_renderChips();_renderOperateBody();_toast('📥 복원 완료!','success');}catch(err){_toast('⚠️ 파일 오류: '+err.message,'error');}};reader.readAsArrayBuffer(file);}

  function _renderMgShare(){
    const wrap=document.getElementById('mg-share');if(!wrap)return;wrap.innerHTML='';
    const note=document.createElement('div');note.style.cssText='font-size:11px;color:var(--tx2);margin-bottom:10px;line-height:1.6';
    note.textContent='공유 링크 접속 시 해당 반만 읽기 전용으로 표시됩니다.';wrap.appendChild(note);
    const card=document.createElement('div');card.className='share-card';

    // ★ 현재 월 기준 반 + 이름 중복 제거 (getActiveClasses 대신)
    const curMk=DB.monthKey(S.monday);
    let classes=DB.getClassesForMonth(curMk);
    // 해당 월에 없으면 활성 반 전체 사용
    if(!classes.length) classes=DB.getActiveClasses();
    // 이름 중복 제거 (같은 이름 편성이 여러 개면 현재 월 기준 하나만)
    const seen=new Set();
    const unique=classes.filter(c=>{if(seen.has(c.name))return false;seen.add(c.name);return true;});

    if(!unique.length){card.innerHTML='<div class="empty">등록된 반이 없습니다</div>';wrap.appendChild(card);return;}
    unique.forEach(cls=>{
      const row=document.createElement('div');row.className='share-cls-row';
      const nameDiv=document.createElement('div');nameDiv.className='share-cls-name';nameDiv.textContent=cls.name;
      const btns=document.createElement('div');btns.className='share-btns';
      const copyBtn=document.createElement('button');copyBtn.className='share-btn copy';copyBtn.textContent='📤 공유';
      const smsBtn=document.createElement('button');smsBtn.className='share-btn sms';smsBtn.textContent='💬 문자';
      // ★ 클릭 시점에 S.monday 읽어 URL 생성 (탭 렌더 시점의 주차 고정 방지)
      copyBtn.addEventListener('click',()=>{
        const liveUrl=`${location.origin}${location.pathname}?share=${cls.id}&mon=${_localDate(S.monday)}`;
        App.shareUrl(liveUrl,cls.name);
      });
      smsBtn.addEventListener('click',()=>{
        const liveUrl=`${location.origin}${location.pathname}?share=${cls.id}&mon=${_localDate(S.monday)}`;
        App.sendSms(liveUrl,cls.name);
      });
      btns.appendChild(copyBtn);btns.appendChild(smsBtn);
      row.appendChild(nameDiv);row.appendChild(btns);
      card.appendChild(row);
    });
    wrap.appendChild(card);
  }
  async function shareUrl(url,name){const sd={title:`${name}반 진도 현황`,text:`${name}반 이번 주 수업 진도를 확인하세요.`,url};if(navigator.share&&navigator.canShare?.(sd)){try{await navigator.share(sd);_toast('📤 공유 완료','success');}catch(e){if(e.name!=='AbortError')_copyUrl(url);}}else _copyUrl(url);}
  function sendSms(url,name){location.href=`sms:?body=${encodeURIComponent(`[학원 진도] ${name}반\n${url}`)}`;}

  /* 공유 뷰 */
  let _shareRenderData=null;
  let _svMonday=null; // ★ 공유뷰에서 현재 보는 주의 월요일 (이전/다음 주 이동용)

  function _svPrevWeek(classId){_svMonday=_addDays(_svMonday,-7);_renderShareView(classId,null);}
  function _svNextWeek(classId){_svMonday=_addDays(_svMonday, 7);_renderShareView(classId,null);}
  function _svGoToday(classId){_svMonday=_mon(new Date());_renderShareView(classId,null);}

  function _renderShareView(classId,wkParam){
    _shareRenderData={classId,wkParam};
    // ★ mon=YYYY-MM-DD 파라미터가 있으면 항상 그 날짜의 주로 초기화
    if(wkParam){
      const parsed=new Date(wkParam+'T00:00:00');
      if(!isNaN(parsed.getTime())) _svMonday=_mon(parsed);
    }
    if(!_svMonday) _svMonday=_mon(new Date());
    const monday=_svMonday;
    const view=_q('share-view'); view.style.cssText='';
    const cls=DB.getClassById(classId);
    if(!cls){view.innerHTML='<div class="empty" style="margin-top:80px">반 정보를 찾을 수 없습니다.</div>';return;}
    const wk=DB.toWeekKey(monday);
    const fri=_addDays(monday,4);
    const fmt=d=>`${d.getMonth()+1}/${d.getDate()}`;
    const t=DB.getTheme();
    const isCurrentWeek=(DB.toWeekKey(_mon(new Date()))===wk);
    view.innerHTML=`
      <div class="sv-header">
        <div class="sv-header-top">
          <div class="sv-logo"><img src="" id="sv-logo-img" alt=""></div>
          <div class="sv-title-block">
            <div class="sv-cls-name">📚 ${_esc(cls.name)}반 진도 현황</div>
            <div class="sv-wk-info">${fmt(monday)} – ${fmt(fri)} · ${_wom(monday)}주차</div>
          </div>
        </div>
        <div class="sv-badges">
          <span class="sv-ro-badge">🔒 읽기 전용</span>
          ${!isCurrentWeek?`<span class="sv-cur-btn" onclick="_svGoToday('${classId}')">📅 현재 주</span>`:''}
        </div>
      </div>
      <!-- 공유뷰: 주차 이동 버튼 없음 -->
      <div id="sv-body" style="padding:11px;background:var(--bg)"></div>`;
    if(typeof LOGO!=='undefined'){const li=document.getElementById('sv-logo-img');if(li)li.src=LOGO.small;}
    const body=_q('sv-body');
    body.className=(t.operateView||'list')==='grid'?'op-grid':'op-list';
    body.style.padding='10px';
    const today=new Date(); today.setHours(0,0,0,0);
    // ★ 해당 주차 진도만 정확히 표시 (혼합 없음)
    const saved=DB.getWeekProgress(cls.id,wk);
    (cls.days||[]).filter(d=>DAYS.includes(d)).forEach(dayName=>{
      const i=DAYS.indexOf(dayName); if(i<0)return;
      const date=_addDays(monday,i); const mk=DB.monthKey(date);
      const books=DB.getMonthBooks(cls.id,mk);
      const dc=DC[dayName]; const isToday=date.toDateString()===today.toDateString();
      const mainBooks=books.main||[], subBooks=books.sub||[];
      const card=document.createElement('div');
      // ★ 운용화면과 동일한 CSS 클래스 사용 (그리드 대응)
      card.className='day-card'+(isToday?' is-today':'');
      const _svDtStr=_fmtTime(cls.dayTimes?.[dayName]);
      card.innerHTML=`<div class="day-hdr"><div class="day-stripe bg-${dc}"></div><div class="day-info"><div class="day-name col-${dc}">${dayName}요일</div><div class="day-date-row"><span class="day-date">${date.getMonth()+1}월 ${date.getDate()}일</span>${_svDtStr?`<span class="day-time-chip">${_svDtStr}</span>`:''}</div></div>${isToday?'<div class="today-pip">오늘</div>':''}</div>`;
      if(mainBooks.length||subBooks.length){
        const rows=document.createElement('div'); rows.className='bk-rows';
        if(mainBooks.length){const sl=document.createElement('div');sl.style.cssText='font-size:10px;font-weight:800;color:var(--tx3);letter-spacing:1px;padding:3px 2px';sl.textContent='📘 주교재';rows.appendChild(sl);mainBooks.forEach(b=>rows.appendChild(_mkSvRow(b,'main',saved,dayName,t)));}
        if(subBooks.length){const sl=document.createElement('div');sl.style.cssText='font-size:10px;font-weight:800;color:var(--tx3);letter-spacing:1px;padding:5px 2px 3px';sl.textContent='📗 부교재';rows.appendChild(sl);subBooks.forEach(b=>rows.appendChild(_mkSvRow(b,'sub',saved,dayName,t)));}
        // ★ 공유(읽기전용) 뷰에서는 메모 표시 안 함
        card.appendChild(rows);
      }
      body.appendChild(card);
    });
  }
  function _refreshShareProgress(){if(!_shareRenderData)return;_renderShareView(_shareRenderData.classId,null);} // ★ wkParam 무시, _svMonday 유지
  function _mkSvRow(b,type,saved,dayName,t){const val=saved[`${dayName}__${b.id}__progress`]||'';const savedAt=saved[`${dayName}__${b.id}__savedAt`]||'';const dateStr=savedAt?_fmtDateTime(savedAt):'';const nmFs=type==='main'?`${t.mainFontSize||t.fontSize||14}px`:`${t.subFontSize||Math.max((t.fontSize||14)-1,10)}px`;const brow=document.createElement('div');brow.style.cssText='display:flex;align-items:center;gap:7px;background:var(--card2);border:1px solid var(--bdr);border-radius:9px;padding:8px 10px';brow.innerHTML=`<span class="bk-tag ${type}">${type==='main'?'주':'부'}</span><span style="flex:1;font-size:${nmFs};font-weight:600;color:var(--tx);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_esc(b.name)}</span><div style="text-align:right;flex-shrink:0"><div class="sv-bk-range ${val?'':'sv-bk-empty'}">${_esc(val)||'미입력'}</div>${dateStr?`<div style="font-size:9px;color:var(--tx3);margin-top:1px">${dateStr}</div>`:''}</div>`;return brow;}

  function closeModal(w){_q('modal-'+w)?.classList.add('hidden');}

  function _q(id){return document.getElementById(id);}
  function _mon(d){const r=new Date(d);r.setHours(0,0,0,0);const day=r.getDay();r.setDate(r.getDate()+(day===0?-6:1-day));return r;}
  function _addDays(d,n){const r=new Date(d);r.setDate(r.getDate()+n);return r;}
  function _sameM(a,b){return a.getMonth()===b.getMonth()&&a.getFullYear()===b.getFullYear();}
  function _wom(mon){const f=new Date(mon.getFullYear(),mon.getMonth(),1);return Math.round((mon-_mon(f))/(7*86400000))+1;}
  function _wkToMon(wk){const[y,w]=wk.split('-W').map(Number);const j=new Date(y,0,4);const m=new Date(j);m.setDate(j.getDate()-((j.getDay()+6)%7)+(w-1)*7);return m;}
  function _localDate(d){
    // toISOString()은 UTC 변환으로 한국 자정이 전날이 됨 → 로컬 날짜 직접 생성
    const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0');
    return y+'-'+m+'-'+day;
  }
  function _esc(s){return(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
  function _hrgb(h){const m=/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(h);return m?{r:parseInt(m[1],16),g:parseInt(m[2],16),b:parseInt(m[3],16)}:{r:79,g:70,b:229};}
  let _tt;function _toast(msg,type='',dur=2600){const el=_q('toast');if(!el)return;el.textContent=msg;el.className='toast'+(type?` ${type}`:'');el.classList.remove('hidden');clearTimeout(_tt);_tt=setTimeout(()=>el.classList.add('hidden'),dur);}

  // ★ 공용 공유 창 — 자료실 게시물, 영상 워크시트 등 여러 화면에서 재사용.
  //   opts: { title, links:[{label,url}], warning }
  function openShareModal(opts){
    const {title, links, warning} = opts;
    const ov=document.createElement('div');
    ov.className='ar-ov'; ov.id='app-share-ov';
    const bodyText = `${title}\n\n` + links.map(l=>`${l.label}: ${l.url}`).join('\n');
    ov.innerHTML = `<div class="ar-sheet" style="max-width:380px">
      <div class="ar-sheet-title">🔗 공유하기</div>
      ${warning ? `<div class="app-share-warn">⚠️ ${_esc(warning)}</div>` : ''}
      <div class="app-share-title">${_esc(title)}</div>
      <div class="app-share-links">${links.map((l,i)=>`
        <div class="app-share-link-row">
          <span class="app-share-link-label">${_esc(l.label)}</span>
          <button class="db-mini-btn ghost" onclick="App._copyShareLink(${i})">복사</button>
        </div>`).join('')}</div>
      <div class="ar-btn-row" style="margin-top:6px">
        <button class="ar-btn ghost" onclick="App._mailtoShare()">📧 이메일로 보내기</button>
        <button class="ar-btn primary" id="app-share-native-btn" onclick="App._nativeShare()">📤 공유</button>
      </div>
      <button class="db-mini-btn ghost" style="width:100%;margin-top:8px" onclick="document.getElementById('app-share-ov').remove()">닫기</button>
    </div>`;
    document.body.appendChild(ov);
    ov.onclick = e=>{ if(e.target===ov) ov.remove(); };
    ov.dataset.title = title;
    ov.dataset.links = JSON.stringify(links);
    ov.dataset.body = bodyText;
    if (!navigator.share) { const nb=_q('app-share-native-btn'); if(nb) nb.style.display='none'; }
  }
  function _copyShareLink(i){
    const ov = _q('app-share-ov'); if(!ov) return;
    const links = JSON.parse(ov.dataset.links||'[]');
    const url = links[i]?.url; if(!url) return;
    navigator.clipboard?.writeText(url).then(()=>_toast('✅ 링크가 복사되었습니다'))
      .catch(()=>_toast('⚠️ 복사에 실패했습니다 — 직접 선택해서 복사해주세요'));
  }
  function _mailtoShare(){
    const ov = _q('app-share-ov'); if(!ov) return;
    const title = ov.dataset.title||'';
    const body = ov.dataset.body||'';
    window.location.href = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
  }
  function _nativeShare(){
    const ov = _q('app-share-ov'); if(!ov) return;
    const title = ov.dataset.title||'';
    const body = ov.dataset.body||'';
    if (navigator.share) navigator.share({ title, text: body }).catch(()=>{});
  }

  /* ══ 동기화 충돌 알림 (다른 기기가 같은 반을 그 사이 먼저 저장한 경우) ══ */
  function _classBookSummary(cls){
    try{
      const mk=DB.monthKey(new Date());
      const mb=(cls&&cls.monthBooks&&cls.monthBooks[mk])||{pool:[],main:[],sub:[]};
      const nm=arr=>(arr&&arr.length)?arr.map(b=>_esc(b.name)).join(', '):'(없음)';
      return `반 이름: ${_esc(cls?.name||'-')}\n주교재: ${nm(mb.main)}\n부교재: ${nm(mb.sub)}`;
    }catch(e){ return '(요약 불가)'; }
  }
  function _showSyncConflict(info){
    const {classId,mine,server}=info||{};
    if(!classId) return;
    document.getElementById('sync-conflict-modal')?.remove();
    const modal=document.createElement('div');
    modal.id='sync-conflict-modal';
    modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:2000;display:flex;align-items:center;justify-content:center;padding:16px';
    modal.innerHTML=`
      <div style="background:var(--card,#fff);border-radius:16px;padding:22px;max-width:420px;width:100%;box-shadow:0 8px 32px rgba(0,0,0,.28)">
        <div style="font-size:16px;font-weight:800;margin-bottom:6px">⚠️ 동기화 충돌 감지</div>
        <div style="font-size:12.5px;color:var(--tx3,#6b7280);margin-bottom:14px;line-height:1.55">
          다른 기기(폰·PC 등)에서 같은 반 데이터를 방금 먼저 저장했습니다.<br>
          어느 값을 최종으로 반영할지 선택해주세요.
        </div>
        <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:16px">
          <div style="border:1.5px solid var(--bdr,#e5e7eb);border-radius:10px;padding:10px 12px">
            <div style="font-size:12px;font-weight:700;color:var(--a,#4f46e5);margin-bottom:4px">📱 이 화면(나)의 값</div>
            <div style="font-size:12.5px;color:var(--tx2,#374151);white-space:pre-line">${_classBookSummary(mine)}</div>
          </div>
          <div style="border:1.5px solid var(--bdr,#e5e7eb);border-radius:10px;padding:10px 12px">
            <div style="font-size:12px;font-weight:700;color:#059669;margin-bottom:4px">☁️ 서버(먼저 저장된) 값</div>
            <div style="font-size:12.5px;color:var(--tx2,#374151);white-space:pre-line">${_classBookSummary(server)}</div>
          </div>
        </div>
        <div style="display:flex;gap:8px">
          <button id="sc-use-server" style="flex:1;padding:11px;border-radius:10px;border:1px solid var(--bdr,#e5e7eb);background:var(--surf2,#f3f4f6);font-weight:700;font-size:13px;cursor:pointer">☁️ 서버 값 사용</button>
          <button id="sc-use-mine" style="flex:1;padding:11px;border-radius:10px;border:none;background:var(--a,#4f46e5);color:#fff;font-weight:700;font-size:13px;cursor:pointer">📱 내 값 유지</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    document.getElementById('sc-use-server').onclick=()=>{DB.resolveConflict(classId,'server');modal.remove();_toast('☁️ 서버 값으로 동기화됨','success');};
    document.getElementById('sc-use-mine').onclick=()=>{DB.resolveConflict(classId,'mine');modal.remove();_toast('📱 내 값으로 동기화됨','success');};
  }

  function _applyNavOrder(listEl){const rows=listEl?[...listEl.children]:[];const order=rows.map(r=>r.dataset.pg).filter(Boolean);if(order.length){_saveNavOrder(order);_renderNav();_toast('✅ 탭 순서 저장됨','success',2500);}}
  function _resetNavOrder(){const def=NAV_DEF.map(d=>d.pg);_saveNavOrder(def);_renderNav();_renderMgTheme();_toast('🔄 탭 순서 초기화됨','success',2500);}

  return {
    _onRoleChange, _showClassCard,
    init,go,goClass,mgTab,toggleView,
    cancelLogin,doLogin,logout,
    prevWeek,nextWeek,
    toggleTlLayout,tlPrev,tlNext,tlToday, // ★ 신규: 타임라인 Grid/List 토글 + 이전/오늘/다음 탐색
    openCal,closeCal,calPrev,calNext,calToday,
    openMgCal,closeMgCal,mgCalPrev,mgCalNext,
    openClassModal,saveClass,delClass,_onDayCkChange,
    openCopyModal,doCopyBooks,
    mgPrev,mgNext,exportTuitionExcel,
    openFeePanel,closeFeePanel,_feeMarkDirty,_feeSaveRow,_feeSaveAll,_feeRefresh,
    openAccModal,saveAccount,delAcc,delAccBulk,_cancelAccBulk,
    handleImport,shareUrl,sendSms,shareCurrentClass,
    closeModal,
    _saveNavOrder, _renderNav, _applyNavOrder, _resetNavOrder, _toast, openShareModal, _copyShareLink, _mailtoShare, _nativeShare,
    forceSaveNow,
  };
})();
document.addEventListener('DOMContentLoaded',App.init);
