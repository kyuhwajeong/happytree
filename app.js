/**
 * app.js — 학원 진도 관리 v8
 *
 * 핵심 변경:
 * 1. 교재 관리: 3-존 레이아웃 (pool|주교재|부교재) + drag&drop
 * 2. 월 이동 버그: DB._syncClsQuiet 사용으로 완전 해결
 * 3. 부교재 추가 버그: DOM ID 제거, 클로저 기반 이벤트 바인딩
 * 4. 메모: 요일당 1개 (bookId 없음)
 * 5. 공유 뷰: 단일 반만 표시, 리스너 중복 방지
 * 6. 로그아웃: 헤더 내 배치 (겹침 없음)
 */

const App = (() => {

  const DAYS = ['월','화','수','목','금'];
  const DC   = {월:'mon',화:'tue',수:'wed',목:'thu',금:'fri'};

  const PALETTES = [
    {id:'light1',name:'화이트',dark:false,accent:'#4f46e5',
     bg:'#f8f9fc',surf:'#ffffff',surf2:'#f1f3f9',card:'#ffffff',card2:'#f5f6fb',card3:'#eceef6',bdr:'#e2e4ef',bdr2:'#d0d3e8',
     tx:'#1a1a2e',tx2:'#5a5a7a',tx3:'#9898b8',emoji:'☀️'},
    {id:'light2',name:'페이퍼',dark:false,accent:'#0891b2',
     bg:'#f0f7fa',surf:'#ffffff',surf2:'#e8f4f8',card:'#ffffff',card2:'#e8f4f8',card3:'#d8ecf5',bdr:'#c5dde8',bdr2:'#aacfdf',
     tx:'#0c2d3e',tx2:'#3a6378',tx3:'#7aaabb',emoji:'🌊'},
    {id:'dark1',name:'다크',dark:true,accent:'#6366f1',
     bg:'#0b0b14',surf:'#13131f',surf2:'#1a1a28',card:'#1e1e2e',card2:'#242436',card3:'#2c2c42',bdr:'#2e2e48',bdr2:'#3a3a58',
     tx:'#ebebf5',tx2:'#8585a8',tx3:'#444466',emoji:'🌙'},
    {id:'dark2',name:'슬레이트',dark:true,accent:'#10b981',
     bg:'#091210',surf:'#111a17',surf2:'#172120',card:'#1b2a26',card2:'#20332e',card3:'#273d38',bdr:'#253d38',bdr2:'#2e4d46',
     tx:'#e8f5f0',tx2:'#7ab5a4',tx3:'#3a6055',emoji:'🌿'},
    {id:'system',name:'시스템',dark:null,accent:'#4f46e5',
     bg:'',surf:'',surf2:'',card:'',card2:'',card3:'',bdr:'',bdr2:'',tx:'',tx2:'',tx3:'',emoji:'📱'},
  ];

  const FONTS = [
    {key:'Noto Sans KR',    label:'Noto Sans KR', sample:'가나다 Aa'},
    {key:'Nanum Gothic',    label:'나눔고딕',       sample:'가나다 Aa'},
    {key:'Nanum Myeongjo',  label:'나눔명조',       sample:'가나다 Aa'},
    {key:'IBM Plex Sans KR',label:'IBM Plex KR',  sample:'가나다 Aa'},
  ];

  /* ── 상태 ─────────────────────────────── */
  const S = {
    page:'operate', mgTab:'classes',
    selCls:null, monday:_mon(new Date()),
    mgMk: DB.monthKey(new Date()),
    editClsId:null, editAccId:null,
    tmpTheme:null, viewMode:'grid', operateView:'grid',
    calY:new Date().getFullYear(), calM:new Date().getMonth(),
    shareListenerAdded:false,
  };

  const mq = window.matchMedia?.('(prefers-color-scheme: dark)');

  /* ═════════ INIT ═════════ */
  async function init() {
    const params = new URLSearchParams(location.search);
    if (params.has('share')) {
      _setSt('진도 현황 로딩 중...');
      await DB.init();
      _hideSplash();
      _renderShareView(params.get('share'), params.get('wk'));
      return;
    }

    _setSt('데이터 연결 중...');
    try { await DB.init(); } catch(e) { console.error(e); }
    _setSt('준비 완료!');

    DB.on('classes',  () => { _renderChips(); if(S.page==='operate') _renderDays(); if(S.page==='manage'&&S.mgTab==='classes') _renderMgCls(); });
    DB.on('progress', () => { if(S.page==='operate') _renderDays(); });
    DB.on('theme',    () => { _applyTheme(DB.getTheme()); if(S.page==='manage'&&S.mgTab==='theme') _renderMgTheme(); });

    const t = DB.getTheme();
    S.viewMode    = t.viewMode    || 'grid';
    S.operateView = t.operateView || 'grid';
    _applyTheme(t);
    _syncDot(FireDB.ready()?'on':'off');
    mq?.addEventListener('change', () => { if(DB.getTheme().palette==='system') _applyTheme(DB.getTheme()); });

    setTimeout(_hideSplash, 300);
  }

  function _hideSplash() {
    const sp = document.getElementById('splash');
    sp.classList.add('out');
    setTimeout(()=>{ sp.style.display='none'; document.getElementById('app').classList.remove('hidden'); go('operate'); }, 380);
  }
  function _setSt(m){ const e=_q('spl-st'); if(e)e.textContent=m; }
  function _syncDot(s){ const d=_q('sync-dot'); if(!d)return; d.style.background=s==='on'?'var(--green)':s==='saving'?'var(--orange)':'var(--tx3)'; }

  /* ── 테마 ──────────────────────────────── */
  function _applyTheme(t) {
    const rs=document.documentElement.style;
    let pal=PALETTES.find(p=>p.id===(t.palette||'light1'))||PALETTES[0];
    if(pal.id==='system') pal=mq?.matches?PALETTES[2]:PALETTES[0];
    document.body.classList.toggle('dark',!!pal.dark);
    const rgb=_hrgb(pal.accent);
    rs.setProperty('--a',pal.accent);
    rs.setProperty('--a10',`rgba(${rgb.r},${rgb.g},${rgb.b},.10)`);
    rs.setProperty('--a20',`rgba(${rgb.r},${rgb.g},${rgb.b},.20)`);
    rs.setProperty('--a40',`rgba(${rgb.r},${rgb.g},${rgb.b},.40)`);
    rs.setProperty('--a60',`rgba(${rgb.r},${rgb.g},${rgb.b},.60)`);
    if(pal.id!=='system'){
      ['bg','surf','surf2','card','card2','card3','bdr','bdr2','tx','tx2','tx3'].forEach(k=>rs.setProperty(`--${k}`,pal[k]));
    }
    const ff=t.fontFamily||'Noto Sans KR';
    rs.setProperty('--font',`'${ff}',sans-serif`);
    document.body.style.fontFamily=`'${ff}',sans-serif`;
    const fz=t.fontSize||14;
    rs.setProperty('--fz', `${fz}px`);
    rs.setProperty('--fzs',`${Math.round(fz*.79)}px`);
    rs.setProperty('--fzm',`${Math.round(fz*1.14)}px`);
    rs.setProperty('--fzl',`${Math.round(fz*1.36)}px`);
    rs.setProperty('--fzh',`${Math.round(fz*1.64)}px`);
    rs.setProperty('--inp-w',`${t.inputBoxWidth||140}px`);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content',pal.bg||'#f8f9fc');
  }

  /* ═════════ PAGE NAV ═════════ */
  function go(page) {
    if(page==='manage'&&!DB.isLoggedIn()){_showLogin();return;}
    S.page=page;
    document.querySelectorAll('.page').forEach(p=>p.classList.remove('on'));
    document.querySelectorAll('.bni').forEach(n=>n.classList.remove('on'));
    document.getElementById('page-'+page).classList.add('on');
    document.querySelector(`[data-pg="${page}"]`).classList.add('on');
    _refreshAuthUI();
    if(page==='operate'){ _renderChips(); _renderWeekNav(); _renderDays(); }
    if(page==='manage')  _renderManage();
  }

  function _refreshAuthUI() {
    const loggedIn=DB.isLoggedIn(), isAdmin=DB.isAdmin();
    // ★ 운용화면 헤더 버튼
    _q('op-logout-btn')?.classList.toggle('hidden',!loggedIn);
    _q('op-share-btn')?.classList.toggle('hidden',!(isAdmin&&S.page==='operate'));
    _q('admin-badge')?.classList.toggle('hidden',!isAdmin);
    // ★ 관리화면 헤더 버튼
    _q('mg-logout-btn')?.classList.toggle('hidden',!loggedIn);
  }

  /* ═════════ LOGIN ═════════ */
  function _showLogin() {
    _q('li-id').value='';_q('li-pw').value='';_q('li-err').textContent='';
    _q('login-gate').classList.remove('hidden');
    setTimeout(()=>_q('li-id').focus(),300);
  }
  function cancelLogin(){_q('login-gate').classList.add('hidden');}
  function doLogin() {
    const id=_q('li-id').value.trim(), pw=_q('li-pw').value;
    const acc=DB.login(id,pw);
    if(acc){
      _q('login-gate').classList.add('hidden');
      _refreshAuthUI();
      go('manage');
      _toast(`✅ ${acc.username} (${acc.role==='admin'?'관리자':'운용자'}) 로그인`,'success');
    } else {
      _q('li-err').textContent='⚠️ 아이디 또는 비밀번호가 올바르지 않습니다';
      _q('li-pw').value='';
    }
  }
  function logout() {
    if(!confirm('로그아웃 하시겠습니까?'))return;
    DB.clearSession(); _refreshAuthUI(); go('operate');
    _toast('로그아웃 되었습니다');
  }

  /* ═════════ 운용 PAGE ═════════ */
  function _renderChips() {
    const classes=DB.getClasses(), wrap=_q('op-chips');
    if(!wrap)return;
    wrap.innerHTML='';
    if(!classes.length){wrap.innerHTML='<span style="font-size:11px;color:var(--tx3)">관리 메뉴에서 반을 추가하세요</span>';return;}
    if(S.selCls&&!classes.find(c=>c.id===S.selCls.id))S.selCls=null;
    if(!S.selCls)S.selCls=classes[0];
    classes.forEach(cls=>{
      const b=document.createElement('button');
      b.className='chip'+(S.selCls?.id===cls.id?' on':'');
      b.textContent=cls.name;
      b.onclick=()=>{S.selCls=cls;_renderChips();_renderDays();};
      wrap.appendChild(b);
    });
  }

  function _renderWeekNav() {
    const fri=_addDays(S.monday,4);
    _q('op-wknum').textContent=`${_wom(S.monday)}주차`;
    _q('op-wkmo').textContent=_sameM(S.monday,fri)?`${S.monday.getMonth()+1}월`:`${S.monday.getMonth()+1}~${fri.getMonth()+1}월`;
    const fmt=d=>`${d.getMonth()+1}/${d.getDate()}`;
    _q('op-range').textContent=`${fmt(S.monday)} – ${fmt(fri)}`;
  }

  function _renderDays() {
    const wrap=_q('days-scroll'); if(!wrap)return;
    wrap.innerHTML='';
    const cls=S.selCls;
    if(!cls){wrap.innerHTML='<div class="empty">반을 선택해주세요</div>';return;}

    const weekKey=DB.toWeekKey(S.monday);
    const saved=DB.getWeekProgress(cls.id,weekKey);
    const canEdit=DB.canOperate();
    const today=new Date();today.setHours(0,0,0,0);

    if(!(cls.days||[]).some(d=>DAYS.includes(d))){
      wrap.innerHTML='<div class="empty">수업 요일이 설정되지 않았습니다.</div>';return;
    }

    const container=document.createElement('div');
    container.className=S.operateView==='grid'?'op-grid':'op-list';

    DAYS.forEach((dayName,i)=>{
      if(!(cls.days||[]).includes(dayName))return;
      const date=_addDays(S.monday,i);
      const mk=DB.monthKey(date);
      const books=DB.getMonthBooks(cls.id,mk);
      const dc=DC[dayName];
      const isToday=date.toDateString()===today.toDateString();

      // 활성 주교재 → 활성 부교재 순서
      const mainBooks=(books.main||[]);
      const subBooks =(books.sub ||[]);
      const allBooks=[
        ...mainBooks.map(b=>({...b,btype:'main'})),
        ...subBooks.map(b=>({...b,btype:'sub'})),
      ];

      const card=document.createElement('div'); card.className='day-card';
      const hdr=document.createElement('div'); hdr.className='day-hdr';
      hdr.innerHTML=`
        <div class="day-stripe bg-${dc}"></div>
        <div class="day-info">
          <div class="day-name col-${dc}">${dayName}요일</div>
          <div class="day-date">${date.getMonth()+1}월 ${date.getDate()}일</div>
        </div>
        ${isToday?'<div class="today-pip">오늘</div>':''}`;
      card.appendChild(hdr);

      if(!allBooks.length){
        card.innerHTML+='<div class="no-bk">이 월에 배정된 교재가 없습니다</div>';
      } else {
        const rows=document.createElement('div'); rows.className='bk-rows';

        // 주교재 섹션 레이블
        if(mainBooks.length){
          const sl=document.createElement('div'); sl.className='bk-section-lbl'; sl.textContent='📘 주교재';
          rows.appendChild(sl);
          mainBooks.forEach(b=>{
            rows.appendChild(_mkBookRow(b,'main',cls.id,weekKey,dayName,saved,canEdit));
          });
        }

        // 부교재 섹션 레이블
        if(subBooks.length){
          const sl=document.createElement('div'); sl.className='bk-section-lbl'; sl.style.marginTop='4px'; sl.textContent='📗 부교재';
          rows.appendChild(sl);
          subBooks.forEach(b=>{
            rows.appendChild(_mkBookRow(b,'sub',cls.id,weekKey,dayName,saved,canEdit));
          });
        }

        card.appendChild(rows);

        // ★ 메모: 요일당 1개
        const memoSection=document.createElement('div'); memoSection.className='memo-section';
        const memoKey=`${dayName}__MEMO`;
        const memoVal=saved[memoKey]||'';
        memoSection.innerHTML=`<span class="memo-lbl">✏️ 메모</span>`;
        const ta=document.createElement('textarea'); ta.className='memo-inp'; ta.rows=1;
        ta.placeholder='이 요일 메모 입력...'; ta.value=memoVal;
        if(!canEdit) ta.readOnly=true;
        if(canEdit){
          const resize=()=>{ta.style.height='auto';ta.style.height=Math.min(ta.scrollHeight,80)+'px';};
          ta.addEventListener('input',()=>{
            resize(); _syncDot('saving');
            DB.autoSave(cls.id,weekKey,dayName,'memo',ta.value.trim());
            clearTimeout(ta._st); ta._st=setTimeout(()=>_syncDot(FireDB.ready()?'on':'off'),950);
          });
          resize();
        }
        memoSection.appendChild(ta);
        card.appendChild(memoSection);
      }
      container.appendChild(card);
    });

    wrap.appendChild(container);
  }

  function _mkBookRow(b, btype, clsId, weekKey, dayName, saved, canEdit) {
    const progKey=`${dayName}__${b.id}__progress`;
    const dateKey=`${dayName}__${b.id}__savedAt`;
    const val=saved[progKey]||'';
    const savedAt=saved[dateKey]||'';
    const dateStr=savedAt?new Date(savedAt).toLocaleDateString('ko-KR',{month:'2-digit',day:'2-digit'}):'';

    const row=document.createElement('div'); row.className='bk-row';
    const tag=document.createElement('span'); tag.className=`bk-tag ${btype}`; tag.textContent=btype==='main'?'주':'부';
    const nm=document.createElement('span'); nm.className='bk-nm'; nm.title=b.name; nm.textContent=b.name;
    const inp=document.createElement('input'); inp.className='bk-inp'+(val?' filled':'');
    inp.placeholder='진도 입력'; inp.value=val;
    if(!canEdit) inp.readOnly=true;
    const dt=document.createElement('span'); dt.className='bk-date'; dt.textContent=dateStr;

    row.appendChild(tag); row.appendChild(nm); row.appendChild(inp); row.appendChild(dt);

    if(canEdit){
      inp.addEventListener('input',()=>{
        inp.classList.toggle('filled',inp.value.trim()!=='');
        row.classList.add('saving'); row.classList.remove('saved');
        _syncDot('saving');
        DB.autoSave(clsId,weekKey,dayName,'progress',inp.value.trim(),b.id);
        clearTimeout(inp._st);
        inp._st=setTimeout(()=>{
          row.classList.remove('saving'); row.classList.add('saved');
          _syncDot(FireDB.ready()?'on':'off');
          setTimeout(()=>row.classList.remove('saved'),1500);
        },950);
      });
    }
    return row;
  }

  function prevWeek(){ S.monday=_addDays(S.monday,-7); _renderWeekNav(); _renderDays(); }
  function nextWeek(){ S.monday=_addDays(S.monday, 7); _renderWeekNav(); _renderDays(); }

  /* ── 공유 (운용화면 버튼) ──────────────── */
  function shareCurrentClass() {
    const cls=S.selCls;
    if(!cls){_toast('⚠️ 반을 선택해주세요','error');return;}
    const url=`${location.origin}${location.pathname}?share=${cls.id}&wk=${DB.toWeekKey(S.monday)}`;
    navigator.clipboard.writeText(url)
      .then(()=>_toast(`🔗 ${cls.name}반 링크 복사! 카카오·문자로 공유하세요`,'success'))
      .catch(()=>prompt(`${cls.name}반 공유 링크:`,url));
  }

  /* ═════════ 달력 ═════════ */
  function openCal(){ S.calY=S.monday.getFullYear();S.calM=S.monday.getMonth();_renderCal();_q('cal-ov').classList.remove('hidden'); }
  function closeCal(e){ if(e&&e.target!==_q('cal-ov'))return; _q('cal-ov').classList.add('hidden'); }
  function calPrev(){ if(S.calM===0){S.calY--;S.calM=11;}else S.calM--;_renderCal(); }
  function calNext(){ if(S.calM===11){S.calY++;S.calM=0;}else S.calM++;_renderCal(); }
  function calToday(){ S.calY=new Date().getFullYear();S.calM=new Date().getMonth();_renderCal(); }
  function _renderCal() {
    const yr=S.calY,mo=S.calM;
    _q('cal-title').textContent=`${yr}년 ${mo+1}월`;
    const grid=_q('cal-grid'); grid.innerHTML='';
    const today=new Date();today.setHours(0,0,0,0);
    const selMon=_mon(S.monday);
    const startDow=new Date(yr,mo,1).getDay();
    const lastDay=new Date(yr,mo+1,0).getDate();
    for(let i=0;i<startDow;i++){const d=document.createElement('div');d.className='cal-day empty';grid.appendChild(d);}
    for(let day=1;day<=lastDay;day++){
      const date=new Date(yr,mo,day);date.setHours(0,0,0,0);
      const dow=date.getDay();const mon=_mon(date);
      const inSel=Math.abs(mon-selMon)<1000;const isWD=dow>=1&&dow<=5;
      const d=document.createElement('div');d.className='cal-day';
      if(date.toDateString()===today.toDateString())d.classList.add('today');
      if(inSel&&isWD){if(dow===1)d.classList.add('week-start');else if(dow===5)d.classList.add('week-end');else d.classList.add('in-week');}
      d.innerHTML=`<span>${day}</span>`;
      d.onclick=()=>{S.monday=_mon(date);_renderWeekNav();_renderDays();_renderCal();setTimeout(()=>_q('cal-ov').classList.add('hidden'),280);};
      grid.appendChild(d);
    }
  }

  /* ═════════ 관리 PAGE ═════════ */
  function _renderManage() {
    const sess=DB.getSession();
    _q('mg-sess').textContent=sess?`${sess.username} (${sess.role==='admin'?'관리자':'운용자'}) 로그인 중`:'로그인 필요';
    _q('vt-l').classList.toggle('on',S.viewMode==='list');
    _q('vt-g').classList.toggle('on',S.viewMode==='grid');
    const isAdmin=DB.isAdmin();
    document.querySelectorAll('.mg-tab').forEach((t,i)=>{
      if(i<2) t.style.display=isAdmin?'':'none';
    });
    mgTab(S.mgTab);
  }

  function mgTab(tab) {
    S.mgTab=tab;
    const TABS=['classes','accounts','theme','io','share'];
    document.querySelectorAll('.mg-tab').forEach((t,i)=>t.classList.toggle('on',TABS[i]===tab));
    TABS.forEach(id=>_q('mg-'+id).classList.toggle('hidden',id!==tab));
    if(tab==='classes')  _renderMgCls();
    if(tab==='accounts') _renderMgAcc();
    if(tab==='theme')    _renderMgTheme();
    if(tab==='io')       _renderMgIO();
    if(tab==='share')    _renderMgShare();
  }

  function setView(mode) {
    S.viewMode=mode;
    _q('vt-l').classList.toggle('on',mode==='list');
    _q('vt-g').classList.toggle('on',mode==='grid');
    const t=DB.getTheme();t.viewMode=mode;DB.saveTheme(t);
    _renderMgCls();
  }

  /* ═════════ 반 관리 탭 ═════════ */
  function _renderMgCls() {
    const wrap=_q('mg-classes'); if(!wrap)return;
    wrap.innerHTML='';
    const isAdmin=DB.isAdmin();

    // ★ 반 추가 버튼 항상 맨 위 (월과 무관)
    if(isAdmin){
      const btn=document.createElement('button'); btn.className='add-cls';
      btn.innerHTML='<span style="font-size:18px">＋</span> 반 추가';
      btn.onclick=()=>openClassModal(); wrap.appendChild(btn);
    }

    const classes=DB.getClasses();
    if(!classes.length){
      const em=document.createElement('div');em.className='empty';em.textContent='등록된 반이 없습니다.';wrap.appendChild(em);return;
    }

    const cont=document.createElement('div');
    cont.className=S.viewMode==='grid'?'cls-grid':'cls-list';
    // ★ 모든 반 항상 표시 (월 이동과 무관)
    classes.forEach(cls=>cont.appendChild(_buildClsCard(cls,isAdmin)));
    wrap.appendChild(cont);
  }

  /* ★ 3-Zone 교재 관리 카드 */
  function _buildClsCard(cls, isAdmin) {
    const card=document.createElement('div'); card.className='cls-card';
    const mk=S.mgMk;
    // ★ getMonthBooks: 내부적으로 _syncClsQuiet 사용 → 재렌더링 루프 없음
    const books=DB.getMonthBooks(cls.id,mk);
    const [mkY,mkM]=mk.split('-').map(Number);
    const dayBadges=(cls.days||[]).map(d=>`<span class="dbdg ${DC[d]}">${d}</span>`).join('');

    // 헤더
    card.innerHTML=`
      <div class="cls-chdr">
        <div class="cls-chdr-l">
          <div class="cls-nm">${_esc(cls.name)}</div>
          <div class="dbadges">${dayBadges}</div>
        </div>
        <div class="cls-chdr-r">${isAdmin?`
          <button class="ibtn" onclick="App.openClassModal('${cls.id}')" title="수정">✏️</button>
          <button class="ibtn red" onclick="App.delClass('${cls.id}')" title="삭제">🗑</button>`:''}</div>
      </div>
      <div class="cls-mo-nav">
        <button onclick="App.mgPrev()" title="이전 달">‹</button>
        <span class="cls-mo-lbl">📅 ${mkY}년 ${mkM}월 교재</span>
        <button onclick="App.mgNext()" title="다음 달">›</button>
      </div>`;

    // 3-Zone 교재 관리자
    const bm=document.createElement('div'); bm.className='book-manager';
    bm.appendChild(_buildPoolZone(cls.id,mk,books,isAdmin));
    bm.appendChild(_buildAssignZones(cls.id,mk,books,isAdmin));
    card.appendChild(bm);

    return card;
  }

  /* ─── Pool Zone (교재 목록) ─────────── */
  function _buildPoolZone(clsId, mk, books, isAdmin) {
    const zone=document.createElement('div'); zone.className='bm-pool';

    // 헤더
    const hdr=document.createElement('div'); hdr.className='bm-zone-hdr';
    hdr.innerHTML=`<span class="bm-zone-title">📚 교재 목록</span>`;
    const acts=document.createElement('div'); acts.className='bm-zone-acts';
    if(isAdmin&&(books.pool||[]).length){
      const cb=document.createElement('button'); cb.className='clear-btn'; cb.textContent='전체삭제';
      cb.onclick=async()=>{if(!confirm('교재 목록 전체 삭제?'))return;await DB.clearZone(clsId,mk,'pool');_toast('🗑 목록 삭제');};
      acts.appendChild(cb);
    }
    hdr.appendChild(acts); zone.appendChild(hdr);

    // Pool 아이템 목록
    const list=document.createElement('div'); list.className='bm-pool-list';
    list.dataset.zone='pool'; list.dataset.clsid=clsId; list.dataset.mk=mk;

    (books.pool||[]).forEach(b=>{
      list.appendChild(_buildPoolItem(b,clsId,mk,isAdmin));
    });

    if(!(books.pool||[]).length){
      const em=document.createElement('div');em.style.cssText='font-size:11px;color:var(--tx3);padding:8px 4px';em.textContent='교재를 추가해주세요';list.appendChild(em);
    }
    zone.appendChild(list);

    // ★ 교재 추가 입력 (isAdmin만)
    if(isAdmin){
      const addRow=document.createElement('div'); addRow.className='bm-add-row';
      const inp=document.createElement('input'); inp.className='bm-add-inp'; inp.placeholder='교재명 입력';
      const btn=document.createElement('button'); btn.className='bm-add-btn'; btn.textContent='추가';

      // ★ 핵심: 클로저로 clsId, mk 캡처 (DOM ID 불필요)
      const doAdd=async()=>{
        const name=inp.value.trim();
        if(!name){_toast('⚠️ 교재명을 입력해주세요','error');inp.focus();return;}
        await DB.addToPool(clsId,mk,name);
        inp.value='';
        inp.focus();
        _toast(`📚 "${name}" 추가 완료`,'success');
      };

      btn.onclick=doAdd;
      inp.onkeydown=e=>{if(e.key==='Enter')doAdd();};
      addRow.appendChild(inp); addRow.appendChild(btn);
      zone.appendChild(addRow);
    }

    // 드롭 리스너 (pool로 되돌리기)
    _setupDropZone(list,'pool',clsId,mk);

    return zone;
  }

  function _buildPoolItem(b, clsId, mk, isAdmin) {
    const item=document.createElement('div'); item.className='bm-pool-item';
    item.draggable=true; item.dataset.bookid=b.id; item.dataset.name=b.name;

    const nm=document.createElement('span'); nm.className='bm-pool-name'; nm.textContent=b.name;
    item.appendChild(nm);

    if(isAdmin){
      const btns=document.createElement('div'); btns.className='bm-pool-btns';

      const toMain=document.createElement('button'); toMain.className='bm-pool-btn to-main'; toMain.title='주교재로'; toMain.textContent='主';
      toMain.onclick=async(e)=>{e.stopPropagation();await DB.moveBook(clsId,mk,b.id,'main');_toast(`📘 주교재로 이동`,'success');};

      const toSub=document.createElement('button'); toSub.className='bm-pool-btn to-sub'; toSub.title='부교재로'; toSub.textContent='副';
      toSub.onclick=async(e)=>{e.stopPropagation();await DB.moveBook(clsId,mk,b.id,'sub');_toast(`📗 부교재로 이동`,'success');};

      const del=document.createElement('button'); del.className='bm-pool-btn del'; del.title='삭제'; del.textContent='✕';
      del.onclick=async(e)=>{e.stopPropagation();if(!confirm(`"${b.name}" 삭제?`))return;await DB.deleteBook(clsId,mk,b.id);_toast('🗑 삭제 완료');};

      btns.appendChild(toMain); btns.appendChild(toSub); btns.appendChild(del);
      item.appendChild(btns);
    }

    // 드래그 이벤트
    _setupDragItem(item, b.id, b.name, 'pool', clsId, mk);
    return item;
  }

  /* ─── Assign Zones (주교재 + 부교재) ─── */
  function _buildAssignZones(clsId, mk, books, isAdmin) {
    const right=document.createElement('div'); right.className='bm-right';

    ['main','sub'].forEach(zone=>{
      const zDiv=document.createElement('div'); zDiv.className='bm-zone';

      const hdr=document.createElement('div'); hdr.className='bm-zone-hdr';
      const title=document.createElement('span'); title.className='bm-zone-title';
      title.textContent=zone==='main'?'📘 주교재':'📗 부교재';
      hdr.appendChild(title);

      const acts=document.createElement('div'); acts.className='bm-zone-acts';
      if(isAdmin){
        const arBtn=document.createElement('button');
        arBtn.className=`bm-arrow-btn ${zone}`; arBtn.textContent=`← ${zone==='main'?'주':'부'}`;
        arBtn.title=`선택한 교재를 ${zone==='main'?'주':'부'}교재로`;
        arBtn.onclick=async()=>{
          // 선택된 pool 아이템 찾기
          const sel=document.querySelector('.bm-pool-item.selected');
          if(!sel){_toast('⚠️ 교재 목록에서 교재를 먼저 선택하세요','error');return;}
          await DB.moveBook(sel.dataset.clsid||clsId, mk, sel.dataset.bookid, zone);
          _toast(`${zone==='main'?'📘 주':'📗 부'}교재로 이동`,'success');
        };
        acts.appendChild(arBtn);

        if((books[zone]||[]).length){
          const cb=document.createElement('button'); cb.className='clear-btn'; cb.textContent='전체삭제';
          cb.onclick=async()=>{if(!confirm(`${zone==='main'?'주':'부'}교재 전체 삭제?`))return;await DB.clearZone(clsId,mk,zone);_toast('🗑 전체 삭제');};
          acts.appendChild(cb);
        }
      }
      hdr.appendChild(acts); zDiv.appendChild(hdr);

      const list=document.createElement('div'); list.className='bm-zone-list';
      list.dataset.zone=zone; list.dataset.clsid=clsId; list.dataset.mk=mk;

      (books[zone]||[]).forEach(b=>{
        const item=document.createElement('div'); item.className='bm-zone-item';
        item.draggable=isAdmin; item.dataset.bookid=b.id; item.dataset.name=b.name;
        const dot=document.createElement('div'); dot.className=`bm-zone-dot ${zone}`;
        const nm=document.createElement('span'); nm.className='bm-zone-name'; nm.textContent=b.name;
        item.appendChild(dot); item.appendChild(nm);
        if(isAdmin){
          const back=document.createElement('button'); back.className='bm-back-btn'; back.title='목록으로'; back.textContent='↩';
          back.onclick=async(e)=>{e.stopPropagation();await DB.moveBook(clsId,mk,b.id,'pool');_toast('↩ 목록으로 이동');};
          item.appendChild(back);
          _setupDragItem(item,b.id,b.name,zone,clsId,mk);
        }
        list.appendChild(item);
      });

      if(!(books[zone]||[]).length){
        const em=document.createElement('div');em.style.cssText='font-size:10px;color:var(--tx3);padding:7px 4px';em.textContent=`교재를 여기로 드래그하세요`;list.appendChild(em);
      }

      _setupDropZone(list,zone,clsId,mk);
      zDiv.appendChild(list); right.appendChild(zDiv);
    });

    return right;
  }

  /* ─── Drag & Drop ────────────────────── */
  let _drag={item:null,bookId:null,name:'',fromZone:null,clsId:null,mk:null,ghost:null};

  function _setupDragItem(el,bookId,name,fromZone,clsId,mk) {
    // HTML5 drag (desktop)
    el.addEventListener('dragstart',e=>{
      _drag={item:el,bookId,name,fromZone,clsId,mk,ghost:null};
      el.classList.add('dragging');
      e.dataTransfer.effectAllowed='move';
      e.dataTransfer.setData('text/plain',bookId);
    });
    el.addEventListener('dragend',()=>{
      el.classList.remove('dragging');
      document.querySelectorAll('.drop-hover').forEach(z=>z.classList.remove('drop-hover'));
    });

    // Touch drag (mobile)
    el.addEventListener('touchstart',e=>{
      const t=e.touches[0];
      _drag={item:el,bookId,name,fromZone,clsId,mk};
      el.classList.add('dragging');
      const ghost=_q('drag-ghost');
      ghost.textContent=name; ghost.classList.remove('hidden');
      ghost.style.left=t.clientX+'px'; ghost.style.top=t.clientY+'px';
      _drag.ghost=ghost;
    },{passive:true});
    el.addEventListener('touchmove',e=>{
      const t=e.touches[0];
      if(_drag.ghost){_drag.ghost.style.left=t.clientX+'px';_drag.ghost.style.top=t.clientY+'px';}
      // 아래에 있는 요소 찾기
      const under=document.elementFromPoint(t.clientX,t.clientY);
      document.querySelectorAll('.drop-hover').forEach(z=>z.classList.remove('drop-hover'));
      const zoneEl=under?.closest('.bm-zone-list,.bm-pool-list');
      if(zoneEl) zoneEl.classList.add('drop-hover');
    },{passive:true});
    el.addEventListener('touchend',async e=>{
      const t=e.changedTouches[0];
      if(_drag.ghost){_drag.ghost.classList.add('hidden');}
      el.classList.remove('dragging');
      document.querySelectorAll('.drop-hover').forEach(z=>z.classList.remove('drop-hover'));
      const under=document.elementFromPoint(t.clientX,t.clientY);
      const zoneEl=under?.closest('.bm-zone-list,.bm-pool-list');
      if(zoneEl){
        const toZone=zoneEl.dataset.zone;
        if(toZone&&toZone!==_drag.fromZone){
          await DB.moveBook(_drag.clsId,_drag.mk,_drag.bookId,toZone);
          _toast(`${toZone==='main'?'📘 주교재':toZone==='sub'?'📗 부교재':'📚 목록'}으로 이동`,'success');
        }
      }
      // pool 아이템 선택 토글
      if(_drag.fromZone==='pool'&&Math.hypot(t.clientX-(el.getBoundingClientRect().left+el.offsetWidth/2),t.clientY-(el.getBoundingClientRect().top+el.offsetHeight/2))<30){
        document.querySelectorAll('.bm-pool-item.selected').forEach(x=>{if(x!==el)x.classList.remove('selected');});
        el.classList.toggle('selected');
      }
    });

    // Click to select (pool items)
    if(fromZone==='pool'){
      el.addEventListener('click',()=>{
        document.querySelectorAll('.bm-pool-item.selected').forEach(x=>{if(x!==el)x.classList.remove('selected');});
        el.classList.toggle('selected');
      });
    }
  }

  function _setupDropZone(el, zone, clsId, mk) {
    el.addEventListener('dragover',e=>{e.preventDefault();el.classList.add('drop-hover');});
    el.addEventListener('dragleave',()=>el.classList.remove('drop-hover'));
    el.addEventListener('drop',async e=>{
      e.preventDefault(); el.classList.remove('drop-hover');
      const bookId=e.dataTransfer.getData('text/plain');
      if(bookId&&zone!==_drag.fromZone){
        await DB.moveBook(_drag.clsId||clsId,_drag.mk||mk,bookId,zone);
        _toast(`${zone==='main'?'📘 주교재':zone==='sub'?'📗 부교재':'📚 목록'}으로 이동`,'success');
      }
    });
  }

  /* ─── 월 이동 ───────────────────────── */
  function mgPrev(){ S.mgMk=DB.prevMonthKey(S.mgMk); _renderMgCls(); }
  function mgNext(){ S.mgMk=DB.nextMonthKey(S.mgMk); _renderMgCls(); }

  /* ─── 반 Modal ──────────────────────── */
  function openClassModal(id=null) {
    S.editClsId=id; const cls=id?DB.getClassById(id):null;
    _q('mcls-t').textContent=id?'반 수정':'반 추가';
    _q('f-cname').value=cls?.name||'';
    document.querySelectorAll('#modal-cls .day-ck input').forEach(cb=>{cb.checked=cls?(cls.days||[]).includes(cb.value):false;});
    _q('modal-cls').classList.remove('hidden');
  }
  async function saveClass() {
    const name=_q('f-cname').value.trim();
    if(!name){_toast('⚠️ 반 이름을 입력해주세요','error');return;}
    if(!S.editClsId&&DB.classExists(name)){_toast(`⚠️ "${name}" 반이 이미 존재합니다`,'error');return;}
    const days=[...document.querySelectorAll('#modal-cls .day-ck input:checked')].map(c=>c.value);
    if(!days.length){_toast('⚠️ 요일을 선택해주세요','error');return;}
    if(S.editClsId){
      await DB.updateClass(S.editClsId,{name,days});
      if(S.selCls?.id===S.editClsId)S.selCls=DB.getClassById(S.editClsId);
      _toast('✅ 반 수정 완료','success');
    } else {
      const r=await DB.addClass({name,days});
      if(!r){_toast('⚠️ 반 추가 실패','error');return;}
      _toast('✅ 반 추가 완료','success');
    }
    closeModal('cls'); _renderMgCls(); _renderChips();
  }
  async function delClass(id) {
    const cls=DB.getClassById(id);
    if(!confirm(`"${cls?.name}" 반을 삭제하시겠습니까?\n모든 진도 데이터도 삭제됩니다.`))return;
    await DB.deleteClass(id); if(S.selCls?.id===id)S.selCls=null;
    _renderMgCls(); _renderChips(); _toast('🗑 삭제 완료');
  }

  /* ═════════ 계정 탭 ═════════ */
  function _renderMgAcc() {
    const wrap=_q('mg-accounts'); if(!wrap)return; wrap.innerHTML='';
    const isAdmin=DB.isAdmin(), sess=DB.getSession();
    if(isAdmin){const b=document.createElement('button');b.className='add-cls';b.style.marginBottom='6px';b.innerHTML='<span>＋</span> 계정 추가';b.onclick=()=>openAccModal();wrap.appendChild(b);}
    const note=document.createElement('div');note.style.cssText='font-size:11px;color:var(--tx2);margin-bottom:8px;line-height:1.65;padding:8px 10px;background:var(--card2);border-radius:var(--rs)';
    note.innerHTML='<b style="color:var(--tx)">admin</b>: 관리메뉴 전체 + 진도입력<br><b style="color:var(--tx)">operator</b>: 운용화면 진도 입력만';
    wrap.appendChild(note);
    const card=document.createElement('div'); card.className='acc-card';
    DB.getAccounts().forEach(acc=>{
      const isMe=sess?.id===acc.id, row=document.createElement('div'); row.className='acc-row';
      row.innerHTML=`<div><div class="acc-nm">${_esc(acc.username)}${isMe?'&nbsp;<span style="color:var(--green);font-size:10px">●</span>':''}
        <span class="role-badge ${acc.role}">${acc.role==='admin'?'관리자':'운용자'}</span></div>
        <div class="acc-role">${acc.role==='admin'?'모든 기능':'진도 입력만'}</div></div>
        <div class="acc-acts">${isAdmin?`<button class="ibtn" onclick="App.openAccModal('${acc.id}')">✏️</button>`:''}
        ${isAdmin&&!isMe?`<button class="ibtn red" onclick="App.delAcc('${acc.id}','${_esc(acc.username)}')">🗑</button>`:''}</div>`;
      card.appendChild(row);
    }); wrap.appendChild(card);
  }
  function openAccModal(id=null){
    S.editAccId=id; const acc=id?DB.getAccounts().find(a=>a.id===id):null;
    _q('macc-t').textContent=id?'계정 수정':'계정 추가';
    _q('f-aid').value=acc?.username||''; _q('f-aid').readOnly=!!id;
    _q('f-apw').value=''; _q('f-arole').value=acc?.role||'operator';
    _q('modal-acc').classList.remove('hidden');
  }
  async function saveAccount(){
    const u=_q('f-aid').value.trim(),p=_q('f-apw').value,role=_q('f-arole').value;
    if(!u){_toast('⚠️ 아이디를 입력해주세요','error');return;}
    if(!S.editAccId&&!p){_toast('⚠️ 비밀번호를 입력해주세요','error');return;}
    if(S.editAccId){const d=p?{password:p,role}:{role};await DB.updateAccount(S.editAccId,d);_toast('✅ 계정 수정 완료','success');}
    else{if(!await DB.addAccount(u,p,role)){_toast('⚠️ 이미 존재하는 아이디','error');return;}_toast('✅ 계정 추가 완료','success');}
    closeModal('acc'); _renderMgAcc();
  }
  async function delAcc(id,u){
    if(DB.getSession()?.id===id){_toast('⚠️ 현재 계정은 삭제 불가','error');return;}
    if(!confirm(`"${u}" 계정을 삭제하시겠습니까?`))return;
    await DB.deleteAccount(id); _renderMgAcc(); _toast('🗑 삭제 완료');
  }

  /* ═════════ 테마 탭 ═════════ */
  function _renderMgTheme() {
    const wrap=_q('mg-theme'); if(!wrap)return; wrap.innerHTML='';
    const t=DB.getTheme(); S.tmpTheme={...t};
    const isAdmin=DB.isAdmin();
    const card=document.createElement('div'); card.className='th-card';

    const prev=document.createElement('div'); prev.className='th-row';
    prev.innerHTML='<div class="th-preview" id="th-prev"></div>'; card.appendChild(prev);
    _upPrev(PALETTES.find(p=>p.id===(t.palette||'light1'))?.accent||'#4f46e5');

    // 팔레트
    const pr=document.createElement('div'); pr.className='th-row'; pr.innerHTML='<div class="th-lbl">🎨 테마</div>';
    const palRow=document.createElement('div'); palRow.className='pal-row';
    PALETTES.forEach(pal=>{
      const item=document.createElement('div'); item.className='pal-item'+(pal.id===(t.palette||'light1')?' on':'');
      const swBg=pal.id==='system'?'linear-gradient(135deg,#f8f9fc 50%,#0b0b14 50%)':pal.bg;
      item.innerHTML=`<div class="pal-swatch" style="background:${swBg}">${pal.emoji}</div><div class="pal-name">${pal.name}</div>`;
      if(!isAdmin){item.style.pointerEvents='none';item.style.opacity='.5';}
      item.onclick=()=>{
        S.tmpTheme.palette=pal.id; if(pal.id!=='system')S.tmpTheme.accent=pal.accent;
        _applyTheme(S.tmpTheme); _upPrev(pal.accent||'#4f46e5');
        palRow.querySelectorAll('.pal-item').forEach((el,i)=>el.classList.toggle('on',PALETTES[i].id===pal.id));
      };
      palRow.appendChild(item);
    }); pr.appendChild(palRow); card.appendChild(pr);

    // 폰트
    const fr=document.createElement('div'); fr.className='th-row'; fr.innerHTML='<div class="th-lbl">🔤 폰트</div>';
    const ffList=document.createElement('div'); ffList.className='ff-list';
    FONTS.forEach(f=>{
      const item=document.createElement('div'); item.className='ff-item'+(f.key===(t.fontFamily||'Noto Sans KR')?' on':'');
      item.style.fontFamily=`'${f.key}',sans-serif`;
      item.innerHTML=`<span class="ff-name">${f.label}</span><span class="ff-sample">${f.sample}</span>`;
      if(!isAdmin){item.style.pointerEvents='none';item.style.opacity='.45';}
      item.onclick=()=>{S.tmpTheme.fontFamily=f.key;_applyTheme(S.tmpTheme);ffList.querySelectorAll('.ff-item').forEach((el,i)=>el.classList.toggle('on',FONTS[i].key===f.key));};
      ffList.appendChild(item);
    }); fr.appendChild(ffList); card.appendChild(fr);

    // 글자 크기
    const szr=document.createElement('div'); szr.className='th-row'; szr.innerHTML='<div class="th-lbl">📐 글자 크기</div>';
    const szW=document.createElement('div'); szW.className='sl-row';
    const sl=document.createElement('input'); sl.type='range'; sl.className='sl'; sl.min=11; sl.max=20; sl.step=1; sl.value=t.fontSize||14; sl.disabled=!isAdmin;
    const fzv=document.createElement('div'); fzv.className='sl-val'; fzv.textContent=`${t.fontSize||14}px`;
    sl.addEventListener('input',()=>{S.tmpTheme.fontSize=+sl.value;fzv.textContent=`${sl.value}px`;_applyTheme(S.tmpTheme);});
    szW.appendChild(sl); szW.appendChild(fzv); szr.appendChild(szW); card.appendChild(szr);

    // 진도 입력칸 너비
    const iwr=document.createElement('div'); iwr.className='th-row'; iwr.innerHTML='<div class="th-lbl">📏 진도 입력칸 너비</div>';
    const iwW=document.createElement('div'); iwW.className='sl-row';
    const isl=document.createElement('input'); isl.type='range'; isl.className='sl'; isl.min=80; isl.max=260; isl.step=10; isl.value=t.inputBoxWidth||140; isl.disabled=!isAdmin;
    const iwv=document.createElement('div'); iwv.className='sl-val'; iwv.textContent=`${t.inputBoxWidth||140}px`;
    const ipWrap=document.createElement('div'); ipWrap.className='inp-preview-wrap';
    ipWrap.innerHTML=`<div class="inp-preview-box"><span class="bk-tag main" style="font-size:9px;padding:2px 6px;border-radius:4px">주</span><span class="inp-preview-nm">수학의 정석(상)</span><div class="inp-preview-inp" id="inp-prev-box" style="width:${t.inputBoxWidth||140}px">p.123~130</div></div>`;
    isl.addEventListener('input',()=>{const w=+isl.value;S.tmpTheme.inputBoxWidth=w;iwv.textContent=`${w}px`;_applyTheme(S.tmpTheme);const pb=_q('inp-prev-box');if(pb)pb.style.width=`${w}px`;});
    iwW.appendChild(isl); iwW.appendChild(iwv); iwr.appendChild(iwW); iwr.appendChild(ipWrap); card.appendChild(iwr);

    // 운용화면 보기
    const ovr=document.createElement('div'); ovr.className='th-row'; ovr.innerHTML='<div class="th-lbl">📱 운용화면 보기</div>';
    const vrow=document.createElement('div'); vrow.className='view-sel-row';
    [{v:'grid',l:'⊞ 그리드'},{v:'list',l:'☰ 리스트'}].forEach(({v,l})=>{
      const btn=document.createElement('button'); btn.className='view-sel-btn'+(v===(t.operateView||'grid')?' on':''); btn.textContent=l;
      if(!isAdmin){btn.disabled=true;btn.style.opacity='.45';}
      btn.onclick=()=>{S.tmpTheme.operateView=v;S.operateView=v;vrow.querySelectorAll('.view-sel-btn').forEach((b,i)=>b.classList.toggle('on',['grid','list'][i]===v));};
      vrow.appendChild(btn);
    }); ovr.appendChild(vrow); card.appendChild(ovr);

    // 저장
    if(isAdmin){
      const sr=document.createElement('div'); sr.className='th-row';
      const sb=document.createElement('button'); sb.className='th-save-btn'; sb.textContent='💾 테마 저장 · 적용';
      sb.onclick=async()=>{
        sb.textContent='저장 중...'; sb.disabled=true;
        await DB.saveTheme(S.tmpTheme);
        _applyTheme(S.tmpTheme); S.operateView=S.tmpTheme.operateView||'grid';
        sb.textContent='💾 테마 저장 · 적용'; sb.disabled=false;
        _toast('🎨 테마 저장 완료! 모든 기기에 반영됩니다.','success',3500);
        _renderMgTheme();
      };
      sr.appendChild(sb); card.appendChild(sr);
    } else {
      const nr=document.createElement('div'); nr.className='th-row';
      nr.innerHTML='<div style="font-size:11px;color:var(--tx3)">⚠️ 테마 변경은 관리자 로그인 후 가능합니다</div>';
      card.appendChild(nr);
    }
    wrap.appendChild(card);
  }
  function _upPrev(c){const el=_q('th-prev');if(el)el.style.background=`linear-gradient(90deg,${c},#8b5cf6,#06b6d4)`;}

  /* ═════════ 백업 탭 ═════════ */
  function _renderMgIO() {
    const wrap=_q('mg-io'); if(!wrap)return; wrap.innerHTML='';
    const isAdmin=DB.isAdmin();
    const card=document.createElement('div'); card.className='io-card';
    const exRow=document.createElement('div'); exRow.className='io-row';
    exRow.innerHTML='<div><div class="io-title">📤 엑셀 내보내기</div><div class="io-desc">반·교재·진도 전체 백업 (복원 가능)</div></div>';
    const exBtn=document.createElement('button'); exBtn.className='io-btn ex'; exBtn.textContent='내보내기'; exBtn.disabled=!isAdmin;
    exBtn.onclick=_exportExcel; exRow.appendChild(exBtn); card.appendChild(exRow);
    const imRow=document.createElement('div'); imRow.className='io-row';
    imRow.innerHTML='<div><div class="io-title">📥 엑셀 불러오기</div><div class="io-desc">DB 초기화 후에도 복구 가능</div></div>';
    const imBtn=document.createElement('button'); imBtn.className='io-btn im'; imBtn.textContent='파일 선택'; imBtn.disabled=!isAdmin;
    imBtn.onclick=()=>_q('xl-in').click(); imRow.appendChild(imBtn); card.appendChild(imRow);
    wrap.appendChild(card);
    const drop=document.createElement('div'); drop.className='drop-zone';
    drop.innerHTML='📂 엑셀 파일을 여기에 드래그하거나 탭하세요<br><span style="font-size:10px;margin-top:4px;display:block">PC·모바일 모두 지원</span>';
    drop.addEventListener('dragover',e=>{e.preventDefault();drop.classList.add('drag-over');});
    drop.addEventListener('dragleave',()=>drop.classList.remove('drag-over'));
    drop.addEventListener('drop',e=>{e.preventDefault();drop.classList.remove('drag-over');const f=e.dataTransfer.files[0];if(f)_processImport(f);});
    drop.addEventListener('click',()=>_q('xl-in').click());
    wrap.appendChild(drop);
    if(!isAdmin){const n=document.createElement('div');n.className='empty';n.textContent='⚠️ 관리자 로그인 후 사용 가능합니다';wrap.appendChild(n);}
  }

  function _exportExcel(){
    const data=DB.exportAll();
    const wb=XLSX.utils.book_new();
    const clsRows=[];
    data.classes.forEach(cls=>{
      const mk=DB.monthKey(new Date()); const bks=cls.monthBooks?.[mk]||{main:[],sub:[],pool:[]};
      clsRows.push({반:cls.name,요일:(cls.days||[]).join(','),등록일:cls.createdAt||'',
        교재목록:(bks.pool||[]).map(b=>b.name).join('/'),
        주교재:(bks.main||[]).map(b=>b.name).join('/'),
        부교재:(bks.sub||[]).map(b=>b.name).join('/')});
    });
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(clsRows),'반목록');
    const pRows=[];
    Object.entries(data.progress||{}).forEach(([k,v])=>{
      const p=k.split('__');const cls=data.classes.find(c=>c.id===p[0]);
      pRows.push({반:cls?.name||p[0],주차:p[1]||'',요일:p[2]||'',교재:p[3]||'',구분:p[4]||'',값:v});
    });
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(pRows),'진도데이터');
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet([{data:JSON.stringify({version:8,classes:data.classes,progress:data.progress,theme:data.theme})}]),'_restore');
    const now=new Date();
    XLSX.writeFile(wb,`진도관리백업_${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}.xlsx`);
    _toast('📤 백업 완료','success');
  }

  function handleImport(input){const f=input.files[0];if(!f)return;input.value='';_processImport(f);}
  async function _processImport(file){
    const reader=new FileReader();
    reader.onload=async(e)=>{
      try{
        const wb=XLSX.read(e.target.result,{type:'array'});
        const raw=wb.Sheets['_restore'];if(!raw){_toast('⚠️ 올바른 백업 파일이 아닙니다','error');return;}
        const rows=XLSX.utils.sheet_to_json(raw);if(!rows[0]?.data){_toast('⚠️ 데이터 없음','error');return;}
        const data=JSON.parse(rows[0].data);
        const result=await DB.importAll(data);
        _renderMgCls();_renderChips();_renderDays();
        const div=document.createElement('div');div.className='import-result';
        div.innerHTML=`<div class="ir-added">✅ 추가: ${result.added.join(', ')||'없음'}</div><div class="ir-updated">🔄 업데이트: ${result.updated.join(', ')||'없음'}</div>`;
        _q('mg-io')?.appendChild(div);
        _toast('📥 복원 완료!','success');
      }catch(err){_toast('⚠️ 파일 오류: '+err.message,'error');console.error(err);}
    };
    reader.readAsArrayBuffer(file);
  }

  /* ═════════ 공유 탭 ═════════ */
  function _renderMgShare(){
    const wrap=_q('mg-share'); if(!wrap)return; wrap.innerHTML='';
    const note=document.createElement('div');note.style.cssText='font-size:11px;color:var(--tx2);margin-bottom:10px;line-height:1.6';
    note.textContent='링크 접속 시 해당 반만 읽기 전용으로 표시됩니다.';wrap.appendChild(note);
    const card=document.createElement('div');card.className='share-card';
    const classes=DB.getClasses();
    if(!classes.length){card.innerHTML='<div class="empty">등록된 반이 없습니다</div>';wrap.appendChild(card);return;}
    classes.forEach(cls=>{
      const row=document.createElement('div');row.className='share-cls-row';
      const url=`${location.origin}${location.pathname}?share=${cls.id}&wk=${DB.toWeekKey(S.monday)}`;
      row.innerHTML=`<div class="share-cls-name">${_esc(cls.name)}</div>
        <div class="share-btns">
          <button class="share-btn copy" onclick="App.copyUrl('${_esc(url)}')">🔗 복사</button>
          <button class="share-btn sms"  onclick="App.sendSms('${_esc(url)}','${_esc(cls.name)}')">💬 문자</button>
        </div>`;
      card.appendChild(row);
    });wrap.appendChild(card);
  }
  function copyUrl(url){navigator.clipboard.writeText(url).then(()=>_toast('🔗 복사 완료','success')).catch(()=>prompt('링크:',url));}
  function sendSms(url,name){location.href=`sms:?body=${encodeURIComponent(`[학원 진도] ${name}반\n${url}`)}`;}

  /* ═════════ 공유 뷰 (읽기 전용, 단일 반) ═════════
     ★ 리스너 중복 방지 + 해당 반만 표시
  ═══════════════════════════════════════════════ */
  function _renderShareView(classId, wkParam) {
    const monday=wkParam?_wkToMon(wkParam):_mon(new Date());
    const view=_q('share-view');
    view.style.cssText='position:fixed;inset:0;background:var(--bg);overflow-y:auto;display:flex;flex-direction:column;';
    _applyTheme(DB.getTheme());

    // ★ 해당 반만 찾기
    const cls=DB.getClassById(classId);
    if(!cls){
      view.innerHTML='<div class="empty" style="margin-top:80px">반 정보를 찾을 수 없습니다.<br><small>링크가 만료되었거나 반이 삭제되었습니다.</small></div>';
      return;
    }

    const wk=DB.toWeekKey(monday);
    const saved=DB.getWeekProgress(cls.id,wk);  // ★ cls.id 기준만
    const fri=_addDays(monday,4);
    const fmt=d=>`${d.getMonth()+1}/${d.getDate()}`;

    view.innerHTML=`
      <div style="padding:13px 15px;background:var(--surf);border-bottom:1px solid var(--bdr);position:sticky;top:0;z-index:10;box-shadow:var(--sh)">
        <div style="font-size:18px;font-weight:800;color:var(--tx)">📚 ${_esc(cls.name)}반 진도 현황</div>
        <div style="font-size:11px;color:var(--tx2);margin-top:2px">${fmt(monday)} – ${fmt(fri)} · ${_wom(monday)}주차</div>
        <div class="sv-ro-badge">🔒 읽기 전용</div>
      </div>
      <div id="sv-body" style="padding:11px;display:flex;flex-direction:column;gap:9px"></div>`;

    const body=_q('sv-body');

    DAYS.forEach((dayName,i)=>{
      if(!(cls.days||[]).includes(dayName))return;
      const date=_addDays(monday,i);
      const mk=DB.monthKey(date);
      const books=DB.getMonthBooks(cls.id,mk);  // ★ cls.id만
      const dc=DC[dayName];
      const mainBooks=books.main||[];
      const subBooks =books.sub||[];
      const allBooks=[...mainBooks,...subBooks];

      const card=document.createElement('div');
      card.style.cssText='background:var(--card);border:1px solid var(--bdr);border-radius:14px;overflow:hidden;box-shadow:var(--sh)';
      card.innerHTML=`<div style="display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--bdr);background:var(--surf2)">
        <div class="bg-${dc}" style="width:4px;height:28px;border-radius:3px;flex-shrink:0"></div>
        <div><div class="col-${dc}" style="font-size:15px;font-weight:700">${dayName}요일</div>
        <div style="font-size:11px;color:var(--tx2)">${date.getMonth()+1}월 ${date.getDate()}일</div></div>
      </div>`;

      if(allBooks.length){
        const rows=document.createElement('div');rows.style.cssText='padding:8px 10px;display:flex;flex-direction:column;gap:5px';
        if(mainBooks.length){
          const sl=document.createElement('div');sl.style.cssText='font-size:10px;font-weight:800;color:var(--tx3);letter-spacing:1px;padding:3px 2px';sl.textContent='📘 주교재';rows.appendChild(sl);
        }
        mainBooks.forEach(b=>{
          const progKey=`${dayName}__${b.id}__progress`;
          const dateKey=`${dayName}__${b.id}__savedAt`;
          const val=saved[progKey]||'', savedAt=saved[dateKey]||'';
          const dateStr=savedAt?new Date(savedAt).toLocaleDateString('ko-KR',{month:'2-digit',day:'2-digit'}):'';
          const brow=_mkShareRow(b,'main',val,dateStr);rows.appendChild(brow);
        });
        if(subBooks.length){
          const sl=document.createElement('div');sl.style.cssText='font-size:10px;font-weight:800;color:var(--tx3);letter-spacing:1px;padding:5px 2px 3px';sl.textContent='📗 부교재';rows.appendChild(sl);
        }
        subBooks.forEach(b=>{
          const progKey=`${dayName}__${b.id}__progress`;
          const dateKey=`${dayName}__${b.id}__savedAt`;
          const val=saved[progKey]||'', savedAt=saved[dateKey]||'';
          const dateStr=savedAt?new Date(savedAt).toLocaleDateString('ko-KR',{month:'2-digit',day:'2-digit'}):'';
          const brow=_mkShareRow(b,'sub',val,dateStr);rows.appendChild(brow);
        });
        // ★ 메모 (요일당 1개)
        const memo=saved[`${dayName}__MEMO`]||'';
        if(memo){
          const mr=document.createElement('div');mr.className='sv-memo';mr.textContent=`✏️ ${memo}`;rows.appendChild(mr);
        }
        card.appendChild(rows);
      }
      body.appendChild(card);
    });

    // ★ 리스너 중복 방지
    if(!S.shareListenerAdded){
      S.shareListenerAdded=true;
      DB.on('progress',()=>_renderShareView(classId,wkParam));
    }
  }

  function _mkShareRow(b,type,val,dateStr){
    const brow=document.createElement('div');
    brow.style.cssText='display:flex;align-items:center;gap:7px;background:var(--card2);border:1px solid var(--bdr);border-radius:9px;padding:8px 10px';
    brow.innerHTML=`<span class="bk-tag ${type}">${type==='main'?'주':'부'}</span>
      <span style="flex:1;font-size:12px;font-weight:600;color:var(--tx);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_esc(b.name)}</span>
      <div style="text-align:right;flex-shrink:0">
        <div class="sv-bk-range ${val?'':'sv-bk-empty'}">${_esc(val)||'미입력'}</div>
        ${dateStr?`<div style="font-size:9px;color:var(--tx3);margin-top:1px">${dateStr} 입력</div>`:''}
      </div>`;
    return brow;
  }

  /* ── Modal ────────────────────────────── */
  function closeModal(w){_q('modal-'+w).classList.add('hidden');}

  /* ── 유틸 ─────────────────────────────── */
  function _q(id){return document.getElementById(id);}
  function _mon(d){const r=new Date(d);r.setHours(0,0,0,0);const day=r.getDay();r.setDate(r.getDate()+(day===0?-6:1-day));return r;}
  function _addDays(d,n){const r=new Date(d);r.setDate(r.getDate()+n);return r;}
  function _sameM(a,b){return a.getMonth()===b.getMonth()&&a.getFullYear()===b.getFullYear();}
  function _wom(mon){const f=new Date(mon.getFullYear(),mon.getMonth(),1);return Math.round((mon-_mon(f))/(7*86400000))+1;}
  function _wkToMon(wk){const[y,w]=wk.split('-W').map(Number);const j=new Date(y,0,4);const m=new Date(j);m.setDate(j.getDate()-((j.getDay()+6)%7)+(w-1)*7);return m;}
  function _esc(s){return(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
  function _hrgb(h){const m=/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(h);return m?{r:parseInt(m[1],16),g:parseInt(m[2],16),b:parseInt(m[3],16)}:{r:79,g:70,b:229};}

  let _tt;
  function _toast(msg,type='',dur=2600){
    const el=_q('toast');if(!el)return;
    el.textContent=msg; el.className='toast'+(type?` ${type}`:'');
    el.classList.remove('hidden');
    clearTimeout(_tt);_tt=setTimeout(()=>el.classList.add('hidden'),dur);
  }

  return {
    init,go,mgTab,setView,
    cancelLogin,doLogin,logout,
    prevWeek,nextWeek,
    openCal,closeCal,calPrev,calNext,calToday,
    openClassModal,saveClass,delClass,
    mgPrev,mgNext,
    openAccModal,saveAccount,delAcc,
    handleImport,copyUrl,sendSms,
    shareCurrentClass,
    closeModal,
  };
})();

document.addEventListener('DOMContentLoaded',App.init);
