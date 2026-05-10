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
  const AUTO_LOGOUT_MS=3*60*60*1000; // 3시간

  const S={
    page:'operate', mgTab:'classes',
    selCls:null, monday:_mon(new Date()),
    mgMk:DB.monthKey(new Date()),
    editClsId:null, editAccId:null, copyFromClsId:null, copyToClsId:null,
    tmpTheme:null, viewMode:'grid', operateView:'grid',
    calY:new Date().getFullYear(), calM:new Date().getMonth(),
    // 관리화면 달력
    mgCalY:new Date().getFullYear(), mgCalM:new Date().getMonth(),
    shareActive:false, showHistory:false,
  };
  const mq=window.matchMedia?.('(prefers-color-scheme: dark)');
  let _autoLogoutTimer=null;
  let _drag={item:null,bookId:null,name:'',fromZone:null,clsId:null,mk:null};
  let _lpTimer=null, _lpActive=false, _lpStartX=0, _lpStartY=0;

  function _resetAutoLogout(){
    clearTimeout(_autoLogoutTimer);
    if(!DB.isLoggedIn())return;
    _autoLogoutTimer=setTimeout(()=>{
      if(DB.isLoggedIn()){DB.clearSession();_refreshAuthUI();go('operate');_toast('⏰ 3시간 미사용으로 자동 로그아웃되었습니다');}
    },AUTO_LOGOUT_MS);
  }

  /* ══ INIT ══ */
  async function init(){
    _setLogoImages();
    setTimeout(()=>window.scrollTo(0,1),300);

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

    DB.on('classes',()=>{_renderChips();if(S.page==='operate')_renderDays();if(S.page==='manage'&&S.mgTab==='classes')_renderMgCls();});
    DB.on('progress',()=>{if(S.page==='operate')_renderDays();if(S.shareActive)_refreshShareProgress();});
    DB.on('theme',()=>{_applyTheme(DB.getTheme());if(S.page==='manage'&&S.mgTab==='theme')_renderMgTheme();});

    const t=DB.getTheme();
    S.viewMode=t.viewMode||'grid'; S.operateView=t.operateView||'grid';
    _applyTheme(t); _syncDot(FireDB.ready()?'on':'off');
    mq?.addEventListener('change',()=>{if(DB.getTheme().palette==='system')_applyTheme(DB.getTheme());});
    ['touchstart','mousedown','keydown'].forEach(ev=>document.addEventListener(ev,_resetAutoLogout,{passive:true}));
    history.pushState({pg:'operate'},'');
    window.addEventListener('popstate',_onBack);
    setTimeout(_hideSplash,400);
  }

  function _setLogoImages(){
    if(typeof LOGO==='undefined')return;
    ['spl-logo-img','op-logo'].forEach(id=>{const el=document.getElementById(id);if(el)el.src=LOGO.small;});
  }
  function _hideSplash(){const sp=document.getElementById('splash');sp.classList.add('out');setTimeout(()=>{sp.style.display='none';document.getElementById('app').classList.remove('hidden');
      if(!DB.isLoggedIn()){_showLogin();}else{go(DB.getRole()==='teacher'?'operate':S.page||'operate');}
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
  }

  /* ══ PAGE NAV ══ */
  function go(page){
    if(page==='manage'  &&!DB.isLoggedIn()){_showLogin('manage');return;}
    if(page==='manage'  &&DB.getRole()==='teacher'){go('operate');return;}
    if(page==='students'&&!DB.isAdmin())  {_showLogin();return;}
    if(page==='booklib' &&!DB.isAdmin()&&DB.getRole()!=='teacher')  {_showLogin();return;}
    if(page==='staff'   &&!DB.isAdmin())  {_showLogin();return;}
    if(page==='grade'   &&!DB.isAdmin())  {_showLogin();return;}
    S.page=page;
    document.querySelectorAll('.page').forEach(p=>p.classList.remove('on'));
    document.querySelectorAll('.bni').forEach(n=>n.classList.remove('on'));
    document.getElementById('page-'+page)?.classList.add('on');
    document.querySelector(`[data-pg="${page}"]`)?.classList.add('on');
    _refreshAuthUI();
    history.pushState({pg:page},'');
    if(page==='operate') {_renderChips();_renderWeekNav();_renderDays();}
    if(page==='manage')  _renderManage();
    if(page==='students'&&typeof StudentApp!=='undefined') StudentApp.render();
    if(page==='booklib' &&typeof BooklibApp!=='undefined') BooklibApp.render();
    if(page==='staff'   &&typeof StaffApp  !=='undefined') StaffApp.render();
    if(page==='grade'   &&typeof GradeApp  !=='undefined') GradeApp.render();
  }

  function _onBack(e){
    const state=e.state;
    if(!state){history.pushState({pg:S.page},'');return;}
    const modals=['login-gate','modal-cls','modal-acc','modal-copy','cal-ov','mg-cal-ov',
                  'st-detail-ov','bl-editor-ov','bl-share-ov','bl-report-ov',
                  'sf-edit-ov','sf-cal-ov','sf-work-ov','gr-cfg-ov','gr-rpt-ov'];
    for(const id of modals){const el=_q(id);if(el&&!el.classList.contains('hidden')){el.classList.add('hidden');history.pushState({pg:S.page},'');return;}}
    if(S.page==='manage'  ){go('operate');return;}
    if(S.page==='students'){go('operate');return;}
    if(S.page==='booklib' ){go('operate');return;}
    if(S.page==='staff'   ){go('operate');return;}
    if(S.page==='grade'   ){go('operate');return;}
    history.pushState({pg:'operate'},'');
  }

  function _refreshAuthUI(){
    const loggedIn=DB.isLoggedIn(), isAdmin=DB.isAdmin();
    _q('op-logout-btn')?.classList.toggle('hidden',!loggedIn);
    _q('op-share-btn')?.classList.toggle('hidden',!(isAdmin&&S.page==='operate'));
    _q('admin-badge')?.classList.toggle('hidden',!isAdmin);
    _q('mg-logout-btn')?.classList.toggle('hidden',!loggedIn);
    // ★ admin 전용 탭 표시/숨김
    _q('nav-students-btn')?.classList.toggle('hidden',!isAdmin);
     // ★ 관리 탭: 항상 표시 (클릭 시 로그인 팝업으로 보호)
     const _navMgBtn=document.getElementById('nav-manage-btn');
     if(_navMgBtn) _navMgBtn.style.display=DB.getRole()==='teacher'?'none':'';
    _q('nav-booklib-btn') ?.classList.toggle('hidden',!isAdmin);
    _q('nav-staff-btn')   ?.classList.toggle('hidden',!isAdmin);
    _q('nav-grade-btn')   ?.classList.toggle('hidden',!isAdmin);
    if(loggedIn)_resetAutoLogout();
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
  function cancelLogin(){_q('login-gate').classList.add('hidden');}
  function doLogin(){
    const id=_q('li-id').value.trim(), pw=_q('li-pw').value;
    // ★ Firebase 초기화 후에도 기본 admin으로 로그인 가능
    let acc=DB.login(id,pw);
    if(!acc && id==='admin' && pw==='1234'){
      // DB에 admin이 없는 경우 임시 admin 세션 생성 후 DB 재생성
      DB._forceAdminLogin();
      acc=DB.login(id,pw);
    }
    if(acc){
      if(_q('li-remember').checked){localStorage.setItem(LS_REM,id);localStorage.setItem(LS_REM_PW,pw);}
      else{localStorage.removeItem(LS_REM);localStorage.removeItem(LS_REM_PW);}
      _q('login-gate').classList.add('hidden'); _refreshAuthUI(); const _isT=DB.getRole()==='teacher';
        go(_isT?'operate':(S._loginRedirect||'manage'));
        S._loginRedirect='';
      _toast(`✅ ${acc.username} (${acc.role==='admin'?'관리자':acc.role==='teacher'?'강사':'운용자'}) 로그인`,'success');
    } else {_q('li-err').textContent='⚠️ 아이디 또는 비밀번호가 올바르지 않습니다';_q('li-pw').value='';}
  }
  function logout(){if(!confirm('로그아웃 하시겠습니까?'))return;DB.clearSession();clearTimeout(_autoLogoutTimer);_refreshAuthUI();go('operate');_toast('로그아웃 되었습니다');}

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
        _renderDays();
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
        if(mainBooks.length){const sl=document.createElement('div');sl.className='bk-section-lbl';sl.textContent='📘 주교재';rows.appendChild(sl);mainBooks.forEach(b=>rows.appendChild(_mkBookRow(b,'main',cls.id,weekKey,dayName,saved,canEdit)));}
        if(subBooks.length){const sl=document.createElement('div');sl.className='bk-section-lbl';sl.style.marginTop='4px';sl.textContent='📗 부교재';rows.appendChild(sl);subBooks.forEach(b=>rows.appendChild(_mkBookRow(b,'sub',cls.id,weekKey,dayName,saved,canEdit)));}
        card.appendChild(rows);
        const ms=document.createElement('div'); ms.className='memo-section';
        const memoKey=`${dayName}__MEMO`; const memoVal=saved[memoKey]||'';
        ms.innerHTML='<span class="memo-lbl">✏️ 메모</span>';
        const ta=document.createElement('textarea'); ta.className='memo-inp'; ta.placeholder='이 요일 메모 입력...'; ta.value=memoVal;
        if(!canEdit){ta.readOnly=true; if(memoVal)ta.classList.add('has-val');}
        if(canEdit){
          const resize=()=>{ta.style.height='auto';ta.style.height=Math.min(ta.scrollHeight,128)+'px';};
          let _lm=memoVal; resize();
          ta.addEventListener('input',()=>{resize();_syncDot('saving');clearTimeout(ta._st);ta._st=setTimeout(()=>{if(ta.value!==_lm){DB.autoSave(cls.id,weekKey,dayName,'memo',ta.value.trim());_lm=ta.value;}_syncDot(FireDB.ready()?'on':'off');},1500);});
          ta.addEventListener('blur',()=>{clearTimeout(ta._st);if(ta.value!==_lm){DB.autoSave(cls.id,weekKey,dayName,'memo',ta.value.trim());_lm=ta.value;_syncDot(FireDB.ready()?'on':'off');}});
        }
        ms.appendChild(ta); card.appendChild(ms);
      }
      container.appendChild(card);
    });
    wrap.appendChild(container);
    // ★ 오늘 요일 카드에 포커스 스크롤 (초기 렌더 시)
    _scrollToFocusDay(container);
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
      inp.addEventListener('input',()=>{inp.classList.toggle('filled',inp.value.trim()!=='');row.classList.add('saving');row.classList.remove('saved');_syncDot('saving');clearTimeout(inp._st);inp._st=setTimeout(()=>{if(inp.value!==_lv){DB.autoSave(clsId,weekKey,dayName,'progress',inp.value.trim(),b.id);_lv=inp.value;if(inp.value)dt.textContent=_fmtDateTime(new Date());}row.classList.remove('saving');row.classList.add('saved');_syncDot(FireDB.ready()?'on':'off');setTimeout(()=>row.classList.remove('saved'),1500);},1500);});
      inp.addEventListener('blur',()=>{clearTimeout(inp._st);if(inp.value!==_lv){DB.autoSave(clsId,weekKey,dayName,'progress',inp.value.trim(),b.id);_lv=inp.value;if(inp.value)dt.textContent=_fmtDateTime(new Date());row.classList.remove('saving');row.classList.add('saved');_syncDot(FireDB.ready()?'on':'off');setTimeout(()=>row.classList.remove('saved'),1500);}});
    }
    return row;
  }

  function _fmtDateTime(d){try{if(!d)return'';const dt=d instanceof Date?d:new Date(d);if(isNaN(dt.getTime()))return'';return`${dt.getMonth()+1}/${dt.getDate()} ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;}catch{return'';}}

  function prevWeek(){S.monday=_addDays(S.monday,-7);_renderWeekNav();_renderChips();_renderDays();}
  function nextWeek(){S.monday=_addDays(S.monday, 7);_renderWeekNav();_renderChips();_renderDays();}

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
      d.onclick=()=>{S.monday=_mon(date);_renderWeekNav();_renderChips();_renderDays();_renderCal();setTimeout(()=>_q('cal-ov').classList.add('hidden'),280);};
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
    _q('mg-sess').textContent=sess?`${sess.username} (${sess.role==='admin'?'관리자':'운용자'}) 로그인 중`:'로그인 필요';
    _updateToggleBtn();
    const isAdmin=DB.isAdmin();
    document.querySelectorAll('.mg-tab').forEach((t,i)=>{if(i<2)t.style.display=isAdmin?'':'none';});
    if(!isAdmin&&S.mgTab==='classes')S.mgTab='theme';
    if(!isAdmin&&S.mgTab==='accounts')S.mgTab='theme';
    mgTab(S.mgTab);
  }
  function _onRoleChange(role, savedClasses=[]){
    const wrap=document.getElementById('f-teacher-classes');
    const list=document.getElementById('f-teacher-cls-list');
    if(!wrap||!list) return;
    wrap.style.display=role==='teacher'?'block':'none';
    if(role==='teacher'){
      const classes=typeof DB!=='undefined'?DB.getActiveClasses():[];
      list.innerHTML=classes.map(c=>
        '<label style="display:flex;align-items:center;gap:4px;font-size:12px;cursor:pointer;padding:3px 8px;background:var(--card);border-radius:6px;border:1px solid var(--bdr)">'
        +'<input type="checkbox" value="'+c.id+'"'+(savedClasses.includes(c.id)?' checked':'')+' style="accent-color:var(--a)"> '+c.name+'</label>'
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
    // ★ sticky 상단 (반추가 + 월이동 + 달력)
    const top=document.createElement('div'); top.className='mg-cls-top';
    if(isAdmin){
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
      <button onclick="App.mgNext()" title="다음 달">›</button>`;
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
    // ★ 현재 mgMk 기준 반만 표시
    const classes=DB.getClassesForMonth(S.mgMk);
    if(!classes.length){
      wrap.innerHTML='<div class="empty">이 월에 편성된 반이 없습니다.<br><small style="color:var(--tx3)">다른 월로 이동하거나 반을 추가하세요.</small></div>';
      return;
    }
    const cont=document.createElement('div'); cont.className=S.viewMode==='grid'?'cls-grid':'cls-list';
    classes.forEach(cls=>cont.appendChild(_buildClsCard(cls,isAdmin)));
    wrap.appendChild(cont);
  }

  function _buildClsCard(cls,isAdmin){
    const card=document.createElement('div'); card.className='cls-card';
    const mk=S.mgMk; const books=DB.getMonthBooks(cls.id,mk);
    const dayBadges=(cls.days||[]).map(d=>{
      const ts=_fmtTime(cls.dayTimes?.[d]);
      return `<span class="dbdg ${DC[d]}">${d}</span>${ts?`<span class="dt-badge">${ts}</span>`:''}`;
    }).join('');
    const termStr=`${cls.termStart||'?'}~${cls.termEnd||'현재'}`;
    // 같은 이름 다른 편성 목록
    const otherTerms=DB.getClasses()
      .filter(c=>c.name.trim()===cls.name.trim()&&c.id!==cls.id)
      .sort((a,b)=>(a.termStart||'').localeCompare(b.termStart||''));
    card.innerHTML=`
      <div class="cls-chdr">
        <div class="cls-chdr-l">
          <div class="cls-nm">${_esc(cls.name)}</div>
          <span class="cls-term ${cls.termEnd?'ended':''}">${termStr}</span>
          <div class="dbadges">${dayBadges}</div>
        </div>
        <div class="cls-chdr-r">
          ${isAdmin?`
            <button class="ibtn" onclick="App.openClassModal('${cls.id}')" title="수정">✏️</button>
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
        const name=inp.value.trim(); if(!name){_toast('⚠️ 교재명을 입력해주세요','error');inp.focus();return;}
        await DB.addToPool(clsId,mk,name);
        inp.value='';
        // ★ 포커스 유지 (비동기 후에도)
        setTimeout(()=>inp.focus(),50);
        _toast(`📚 "${name}" 추가`,'success');
      };
      btn.onclick=doAdd;
      inp.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();doAdd();}});
      ar.appendChild(inp); ar.appendChild(btn); zone.appendChild(ar);
      // 추가 직후 포커스
      setTimeout(()=>inp.focus(),100);
    }
    _setupDropZone(list,'pool',clsId,mk);
    return zone;
  }

  function _buildPoolItem(b,clsId,mk,isAdmin,listEl){
    const item=document.createElement('div'); item.className='bm-pool-item';
    item.dataset.bookid=b.id; item.dataset.name=b.name; item.dataset.clsid=clsId;
    const nm=document.createElement('span'); nm.className='bm-pool-name'; nm.textContent=b.name; item.appendChild(nm);
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

  /* ★ PC Drag */
  function _setupPCDrag(el,bookId,name,fromZone,clsId,mk){
    el.draggable=true;
    el.addEventListener('dragstart',e=>{
      _drag={item:el,bookId,name,fromZone,clsId,mk};
      el.classList.add('dragging');
      e.dataTransfer.effectAllowed='move';
      e.dataTransfer.setData('text/plain',bookId);
      e.dataTransfer.setData('application/json',JSON.stringify({bookId,name,fromZone,clsId,mk}));
    });
    el.addEventListener('dragend',()=>{el.classList.remove('dragging');document.querySelectorAll('.drop-hover').forEach(z=>z.classList.remove('drop-hover'));});
  }

  /* ★ 모바일 Long-press */
  function _setupLongPressDrag(el,bookId,name,fromZone,clsId,mk){
    el.addEventListener('touchstart',e=>{
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
    if(S.editClsId){
      const cls=DB.getClassById(S.editClsId);
      const oldDays=(cls?.days||[]).sort().join(',');
      const newDays=[...days].sort().join(',');
      if(oldDays!==newDays){
        const ok=confirm(`요일이 변경되었습니다.\n기존 (${oldDays}) 데이터 보존 후\n${termStart}부터 새 편성 (${newDays})으로 재편성합니다.\n계속하시겠습니까?`);
        if(!ok)return;
        // 재편성: dayTimes 미입력 시 이전 편성 시간 참고
        const prevDt=dayTimes||cls?.dayTimes||null;
        await DB.terminateClass(S.editClsId);
        const r=await DB.addClassNew({name,days,termStart,dayTimes:prevDt});
        if(!r){_toast('⚠️ 재편성 실패','error');return;}
        S.selCls=r; _toast(`✅ ${name}반 재편성 완료`,'success');
      } else {
        // dayTimes가 null이면 기존값 유지, 있으면 교체
        const updateData=dayTimes?{name,dayTimes}:{name};
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
      const r=await DB.addClass({name,days,termStart,dayTimes});
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
  function _renderMgAcc(){const wrap=document.getElementById('mg-accounts');if(!wrap)return;wrap.innerHTML='';const isAdmin=DB.isAdmin(),sess=DB.getSession();if(isAdmin){const b=document.createElement('button');b.className='add-cls';b.style.marginBottom='6px';b.innerHTML='<span>＋</span> 계정 추가';b.onclick=()=>openAccModal();wrap.appendChild(b);}const note=document.createElement('div');note.style.cssText='font-size:11px;color:var(--tx2);margin-bottom:8px;line-height:1.65;padding:8px 10px;background:var(--card2);border-radius:var(--rs)';note.innerHTML='<b style="color:var(--tx)">admin</b>: 관리메뉴 전체 + 진도입력<br><b style="color:var(--tx)">operator</b>: 진도 입력만';wrap.appendChild(note);const card=document.createElement('div');card.className='acc-card';DB.getAccounts().forEach(acc=>{const isMe=sess?.id===acc.id,row=document.createElement('div');row.className='acc-row';row.innerHTML=`<div style="flex:1;min-width:0"><div class="acc-nm">${_esc(acc.username)}${isMe?'&nbsp;<span style="color:var(--green);font-size:10px">●</span>':''}<span class="role-badge ${acc.role}">${acc.role==='admin'?'관리자':acc.role==='teacher'?'강사':'운용자'}</span></div><div class="acc-role">${acc.role==='admin'?'모든 기능':acc.role==='teacher'?'지정 반 진도 입력':'진도 입력만'}</div>${acc.role==='teacher'&&acc.teacherClasses?.length?`<div style="font-size:10px;color:var(--a);margin-top:3px">담당 반: ${acc.teacherClasses.map(id=>{const c=DB.getActiveClasses().find(cl=>cl.id===id);return c?c.name:'?';}).join(', ')}</div>`:''}</div><div class="acc-acts">${isAdmin?`<button class="ibtn" onclick="App.openAccModal('${acc.id}')">✏️</button>`:''}${isAdmin&&!isMe?`<button class="ibtn red" onclick="App.delAcc('${acc.id}','${_esc(acc.username)}')">🗑</button>`:''}</div>`;card.appendChild(row);});wrap.appendChild(card);}
  function openAccModal(id=null){S.editAccId=id;const acc=id?DB.getAccounts().find(a=>a.id===id):null;_q('macc-t').textContent=id?'계정 수정':'계정 추가';_q('f-aid').value=acc?.username||'';_q('f-aid').readOnly=!!id;_q('f-apw').value='';_q('f-arole').value=acc?.role||'operator';
    App._onRoleChange(acc?.role||'operator', acc?.teacherClasses||[]);_q('modal-acc').classList.remove('hidden');}
  async function saveAccount(){const u=_q('f-aid').value.trim(),p=_q('f-apw').value,role=_q('f-arole').value;
    const teacherClasses=role==='teacher'?[...document.querySelectorAll('#f-teacher-cls-list input:checked')].map(c=>c.value):[];if(!u){_toast('⚠️ 아이디를 입력해주세요','error');return;}if(!S.editAccId&&!p){_toast('⚠️ 비밀번호를 입력해주세요','error');return;}if(S.editAccId){const d=p?{password:p,role,teacherClasses}:{role,teacherClasses};await DB.updateAccount(S.editAccId,d);_toast('✅ 계정 수정 완료','success');}else{if(!await DB.addAccount(u,p,role,teacherClasses)){_toast('⚠️ 이미 존재하는 아이디','error');return;}_toast('✅ 계정 추가 완료','success');}closeModal('acc');_renderMgAcc();}
  async function delAcc(id,u){if(DB.getSession()?.id===id){_toast('⚠️ 현재 계정은 삭제 불가','error');return;}if(!confirm(`"${u}" 계정을 삭제하시겠습니까?`))return;await DB.deleteAccount(id);_renderMgAcc();_toast('🗑 삭제 완료');}

  /* 테마 */
  function _renderMgTheme(){const wrap=document.getElementById('mg-theme');if(!wrap)return;wrap.innerHTML='';const t=DB.getTheme();S.tmpTheme={...t};const isAdmin=DB.isAdmin();const card=document.createElement('div');card.className='th-card';const prev=document.createElement('div');prev.className='th-row';prev.innerHTML='<div class="th-preview" id="th-prev"></div>';card.appendChild(prev);_upPrev(PALETTES.find(p=>p.id===(t.palette||'light1'))?.accent||'#4f46e5');const pr=document.createElement('div');pr.className='th-row';pr.innerHTML='<div class="th-lbl">🎨 테마</div>';const palRow=document.createElement('div');palRow.className='pal-row';PALETTES.forEach(pal=>{const item=document.createElement('div');item.className='pal-item'+(pal.id===(t.palette||'light1')?' on':'');const swBg=pal.id==='system'?'linear-gradient(135deg,#f8f9fc 50%,#0b0b14 50%)':pal.bg;item.innerHTML=`<div class="pal-swatch" style="background:${swBg}">${pal.emoji}</div><div class="pal-name">${pal.name}</div>`;if(!isAdmin){item.style.pointerEvents='none';item.style.opacity='.5';}item.onclick=()=>{S.tmpTheme.palette=pal.id;if(pal.id!=='system')S.tmpTheme.accent=pal.accent;_applyTheme(S.tmpTheme);_upPrev(pal.accent||'#4f46e5');palRow.querySelectorAll('.pal-item').forEach((el,i)=>el.classList.toggle('on',PALETTES[i].id===pal.id));};palRow.appendChild(item);});pr.appendChild(palRow);card.appendChild(pr);const fr=document.createElement('div');fr.className='th-row';fr.innerHTML='<div class="th-lbl">🔤 폰트</div>';const ffList=document.createElement('div');ffList.className='ff-list';FONTS.forEach(f=>{const item=document.createElement('div');item.className='ff-item'+(f.key===(t.fontFamily||'Noto Sans KR')?' on':'');item.style.fontFamily=`'${f.key}',sans-serif`;item.innerHTML=`<span class="ff-name">${f.label}</span><span class="ff-sample">${f.sample}</span>`;if(!isAdmin){item.style.pointerEvents='none';item.style.opacity='.45';}item.onclick=()=>{S.tmpTheme.fontFamily=f.key;_applyTheme(S.tmpTheme);ffList.querySelectorAll('.ff-item').forEach((el,i)=>el.classList.toggle('on',FONTS[i].key===f.key));};ffList.appendChild(item);});fr.appendChild(ffList);card.appendChild(fr);const szr=document.createElement('div');szr.className='th-row';szr.innerHTML='<div class="th-lbl">📐 전체 글자 크기</div>';const szW=document.createElement('div');szW.className='sl-row';const sl=document.createElement('input');sl.type='range';sl.className='sl';sl.min=11;sl.max=22;sl.step=1;sl.value=t.fontSize||14;sl.disabled=!isAdmin;const fzv=document.createElement('div');fzv.className='sl-val';fzv.textContent=`${t.fontSize||14}px`;sl.addEventListener('input',()=>{S.tmpTheme.fontSize=+sl.value;fzv.textContent=`${sl.value}px`;_applyTheme(S.tmpTheme);_updateBkPreview();});szW.appendChild(sl);szW.appendChild(fzv);szr.appendChild(szW);card.appendChild(szr);const mfr=document.createElement('div');mfr.className='th-row';mfr.innerHTML='<div class="th-lbl">📘 주교재명 글자 크기</div>';const mfW=document.createElement('div');mfW.className='sl-row';const msl=document.createElement('input');msl.type='range';msl.className='sl';msl.min=10;msl.max=22;msl.step=1;msl.value=t.mainFontSize||t.fontSize||14;msl.disabled=!isAdmin;const mfv=document.createElement('div');mfv.className='sl-val';mfv.style.color='var(--a)';mfv.textContent=`${t.mainFontSize||t.fontSize||14}px`;msl.addEventListener('input',()=>{S.tmpTheme.mainFontSize=+msl.value;mfv.textContent=`${msl.value}px`;_applyTheme(S.tmpTheme);_updateBkPreview();});mfW.appendChild(msl);mfW.appendChild(mfv);mfr.appendChild(mfW);card.appendChild(mfr);const sfr=document.createElement('div');sfr.className='th-row';sfr.innerHTML='<div class="th-lbl">📗 부교재명 글자 크기</div>';const sfW=document.createElement('div');sfW.className='sl-row';const ssl=document.createElement('input');ssl.type='range';ssl.className='sl';ssl.min=10;ssl.max=22;ssl.step=1;ssl.value=t.subFontSize||Math.max((t.fontSize||14)-1,10);ssl.disabled=!isAdmin;const sfv=document.createElement('div');sfv.className='sl-val';sfv.style.color='var(--green)';sfv.textContent=`${t.subFontSize||Math.max((t.fontSize||14)-1,10)}px`;ssl.addEventListener('input',()=>{S.tmpTheme.subFontSize=+ssl.value;sfv.textContent=`${ssl.value}px`;_applyTheme(S.tmpTheme);_updateBkPreview();});sfW.appendChild(ssl);sfW.appendChild(sfv);sfr.appendChild(sfW);card.appendChild(sfr);const bpRow=document.createElement('div');bpRow.className='th-row';bpRow.innerHTML='<div class="th-lbl">👁 교재 미리보기</div>';const bpBox=document.createElement('div');bpBox.className='bk-preview-box';bpBox.id='bk-preview-box';['main','sub'].forEach(type=>{const row=document.createElement('div');row.className='bk-preview-row';const tag=document.createElement('span');tag.className=`bk-tag ${type}`;tag.textContent=type==='main'?'주':'부';const nm=document.createElement('span');nm.className='bk-preview-nm';nm.id=`bk-preview-nm-${type}`;nm.textContent=type==='main'?'수학의 정석(상)':'쎈 수학';nm.style.fontSize=type==='main'?`${S.tmpTheme.mainFontSize||t.mainFontSize||t.fontSize||14}px`:`${S.tmpTheme.subFontSize||t.subFontSize||Math.max((t.fontSize||14)-1,10)}px`;const inp2=document.createElement('div');inp2.className='bk-preview-inp';inp2.textContent='p.123~130';inp2.style.fontSize=`${S.tmpTheme.fontSize||t.fontSize||14}px`;inp2.style.width=`${S.tmpTheme.inputBoxWidth||t.inputBoxWidth||140}px`;row.appendChild(tag);row.appendChild(nm);row.appendChild(inp2);bpBox.appendChild(row);});bpRow.appendChild(bpBox);card.appendChild(bpRow);const iwr=document.createElement('div');iwr.className='th-row';iwr.innerHTML='<div class="th-lbl">📏 진도 입력칸 너비</div>';const iwW=document.createElement('div');iwW.className='sl-row';const isl=document.createElement('input');isl.type='range';isl.className='sl';isl.min=80;isl.max=260;isl.step=10;isl.value=t.inputBoxWidth||140;isl.disabled=!isAdmin;const iwv=document.createElement('div');iwv.className='sl-val';iwv.textContent=`${t.inputBoxWidth||140}px`;isl.addEventListener('input',()=>{S.tmpTheme.inputBoxWidth=+isl.value;iwv.textContent=`${isl.value}px`;_applyTheme(S.tmpTheme);_updateBkPreview();});iwW.appendChild(isl);iwW.appendChild(iwv);iwr.appendChild(iwW);card.appendChild(iwr);const ovr=document.createElement('div');ovr.className='th-row';ovr.innerHTML='<div class="th-lbl">📱 운용화면 기본 보기</div>';const vrow=document.createElement('div');vrow.className='view-sel-row';[{v:'grid',l:'⊞ 그리드'},{v:'list',l:'☰ 리스트'}].forEach(({v,l})=>{const btn=document.createElement('button');btn.className='view-sel-btn'+(v===(t.operateView||'grid')?' on':'');btn.textContent=l;if(!isAdmin){btn.disabled=true;btn.style.opacity='.45';}btn.onclick=()=>{S.tmpTheme.operateView=v;S.operateView=v;vrow.querySelectorAll('.view-sel-btn').forEach((b,i)=>b.classList.toggle('on',['grid','list'][i]===v));};vrow.appendChild(btn);});ovr.appendChild(vrow);card.appendChild(ovr);if(isAdmin){const sr=document.createElement('div');sr.className='th-row';const sb=document.createElement('button');sb.className='th-save-btn';sb.textContent='💾 테마 저장 · 적용';sb.onclick=async()=>{sb.textContent='저장 중...';sb.disabled=true;await DB.saveTheme(S.tmpTheme);_applyTheme(S.tmpTheme);S.operateView=S.tmpTheme.operateView||'grid';S.viewMode=S.tmpTheme.viewMode||'grid';_updateToggleBtn();sb.textContent='💾 테마 저장 · 적용';sb.disabled=false;_toast('🎨 테마 저장 완료!','success',3500);_renderMgTheme();};sr.appendChild(sb);card.appendChild(sr);}else{const nr=document.createElement('div');nr.className='th-row';nr.innerHTML='<div style="font-size:11px;color:var(--tx3)">⚠️ 테마 변경은 관리자 로그인 후 가능합니다</div>';card.appendChild(nr);}wrap.appendChild(card);}
  function _updateBkPreview(){const t=S.tmpTheme||DB.getTheme();['main','sub'].forEach(tp=>{const nm=document.getElementById(`bk-preview-nm-${tp}`);if(nm)nm.style.fontSize=tp==='main'?`${t.mainFontSize||t.fontSize||14}px`:`${t.subFontSize||Math.max((t.fontSize||14)-1,10)}px`;});document.querySelectorAll('.bk-preview-inp').forEach(el=>{el.style.fontSize=`${t.fontSize||14}px`;el.style.width=`${t.inputBoxWidth||140}px`;});}
  function _upPrev(c){const el=_q('th-prev');if(el)el.style.background=`linear-gradient(90deg,${c},#8b5cf6,#06b6d4)`;}

  /* IO */
  function _renderMgIO(){const wrap=document.getElementById('mg-io');if(!wrap)return;wrap.innerHTML='';const isAdmin=DB.isAdmin();const card=document.createElement('div');card.className='io-card';const exRow=document.createElement('div');exRow.className='io-row';exRow.innerHTML='<div><div class="io-title">📤 엑셀 내보내기</div><div class="io-desc">반·교재·진도·메모 전체 백업</div></div>';const exBtn=document.createElement('button');exBtn.className='io-btn ex';exBtn.textContent='내보내기';exBtn.disabled=!isAdmin;exBtn.onclick=_exportExcel;exRow.appendChild(exBtn);card.appendChild(exRow);const imRow=document.createElement('div');imRow.className='io-row';imRow.innerHTML='<div><div class="io-title">📥 엑셀 불러오기</div><div class="io-desc">DB 초기화 후에도 복구 가능</div></div>';const imBtn=document.createElement('button');imBtn.className='io-btn im';imBtn.textContent='파일 선택';imBtn.disabled=!isAdmin;imBtn.onclick=()=>_q('xl-in').click();imRow.appendChild(imBtn);card.appendChild(imRow);wrap.appendChild(card);const drop=document.createElement('div');drop.className='drop-zone';drop.innerHTML='📂 엑셀 파일을 여기에 드래그하거나 탭하세요';drop.addEventListener('dragover',e=>{e.preventDefault();drop.classList.add('drag-over');});drop.addEventListener('dragleave',()=>drop.classList.remove('drag-over'));drop.addEventListener('drop',e=>{e.preventDefault();drop.classList.remove('drag-over');const f=e.dataTransfer.files[0];if(f)_processImport(f);});drop.addEventListener('click',()=>_q('xl-in').click());wrap.appendChild(drop);if(!isAdmin){const n=document.createElement('div');n.className='empty';n.textContent='⚠️ 관리자 로그인 후 사용 가능합니다';wrap.appendChild(n);}}
  function _exportExcel(){const data=DB.exportAll();const wb=XLSX.utils.book_new();const clsRows=[];data.classes.forEach(cls=>{const mk=DB.monthKey(new Date());const bks=cls.monthBooks?.[mk]||{main:[],sub:[],pool:[]};clsRows.push({반:cls.name,상태:cls.termEnd?'종료':'운용중',편성시작:cls.termStart||'',편성종료:cls.termEnd||'',요일:(cls.days||[]).join(','),교재목록:(bks.pool||[]).map(b=>b.name).join('/'),주교재:(bks.main||[]).map(b=>b.name).join('/'),부교재:(bks.sub||[]).map(b=>b.name).join('/')});});XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(clsRows),'반목록');const pRows=[];Object.entries(data.progress||{}).forEach(([k,v])=>{if(v===null||v===undefined||v==='')return;const p=k.split('__');const cls=data.classes.find(c=>c.id===p[0]);const cn=cls?.name||p[0];const isMemo=p[3]==='MEMO';const row={반:cn,주차:p[1]||'',요일:p[2]||''};if(isMemo){row.구분='메모';row.교재='';row.값=v;}else{row.구분=p[4]==='savedAt'?'입력시간':'진도';row.교재=p[3]||'';row.값=v;}pRows.push(row);});if(!pRows.length)pRows.push({반:'데이터없음',주차:'',요일:'',구분:'',교재:'',값:''});XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(pRows),'진도메모데이터');XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet([{data:JSON.stringify({version:'10d',classes:data.classes,progress:data.progress,theme:data.theme})}]),'_restore');const n=new Date();XLSX.writeFile(wb,`진도관리백업_${n.getFullYear()}${String(n.getMonth()+1).padStart(2,'0')}${String(n.getDate()).padStart(2,'0')}.xlsx`);_toast('📤 백업 완료','success');}
  function handleImport(input){const f=input.files[0];if(!f)return;input.value='';_processImport(f);}
  async function _processImport(file){const reader=new FileReader();reader.onload=async(e)=>{try{const wb=XLSX.read(e.target.result,{type:'array'});const raw=wb.Sheets['_restore'];if(!raw){_toast('⚠️ 올바른 백업 파일이 아닙니다','error');return;}const rows=XLSX.utils.sheet_to_json(raw);if(!rows[0]?.data){_toast('⚠️ 데이터 없음','error');return;}const data=JSON.parse(rows[0].data);const result=await DB.importAll(data);_renderMgCls();_renderChips();_renderDays();_toast('📥 복원 완료!','success');}catch(err){_toast('⚠️ 파일 오류: '+err.message,'error');}};reader.readAsArrayBuffer(file);}

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

  return {
    _onRoleChange, _showClassCard,
    init,go,mgTab,toggleView,
    cancelLogin,doLogin,logout,
    prevWeek,nextWeek,
    openCal,closeCal,calPrev,calNext,calToday,
    openMgCal,closeMgCal,mgCalPrev,mgCalNext,
    openClassModal,saveClass,delClass,_onDayCkChange,
    openCopyModal,doCopyBooks,
    mgPrev,mgNext,
    openAccModal,saveAccount,delAcc,
    handleImport,shareUrl,sendSms,shareCurrentClass,
    closeModal,
  };
})();
document.addEventListener('DOMContentLoaded',App.init);
