/**
 * app.js — 학원 진도 관리 v7
 *
 * 수정 사항:
 * 1. 월 변경 시 반 추가 화면 표시 버그 완전 수정 (mgMk는 반 추가와 독립)
 * 2. 부교재 추가 안 되던 버그 수정 (DOM ID 충돌 제거, 고유 ID 사용)
 * 3. 교재명 입력칸 좌우 레이아웃 — 추가 버튼 절대 가려지지 않음
 * 4. 진도 입력칸 너비 미리보기 실제 박스로 표시
 * 5. 로그아웃 버튼 전역 고정 (페이지 이동해도 항상 우상단)
 * 6. 테마 저장 시 성공 알림 토스트
 * 7. 운용화면 글자 크기/패딩 em 단위로 일관 처리
 * 8. 메모 입력박스 정렬
 * 9. 공유 링크 = 선택된 반 고정 (읽기전용 뷰에서 반 선택 불가)
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
    {key:'Noto Sans KR',    label:'Noto Sans KR',  sample:'가나다 Aa'},
    {key:'Nanum Gothic',    label:'나눔고딕',        sample:'가나다 Aa'},
    {key:'Nanum Myeongjo',  label:'나눔명조',        sample:'가나다 Aa'},
    {key:'IBM Plex Sans KR',label:'IBM Plex KR',   sample:'가나다 Aa'},
  ];

  /* ── 상태 ─────────────────────────────── */
  const S = {
    page:'operate', mgTab:'classes',
    selCls:null, monday:_mon(new Date()),
    mgMk:DB.monthKey(new Date()),  // 관리화면 기준 월 (반 목록과 독립)
    editClsId:null, editAccId:null,
    tmpTheme:null, viewMode:'grid', operateView:'grid',
    calY:new Date().getFullYear(), calM:new Date().getMonth(),
  };

  const mq = window.matchMedia?.('(prefers-color-scheme: dark)');

  /* ═══════════════ INIT ═══════════════ */
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
    setTimeout(()=>{
      sp.style.display='none';
      document.getElementById('app').classList.remove('hidden');
      go('operate');
    }, 380);
  }
  function _setSt(m){ const e=document.getElementById('spl-st'); if(e)e.textContent=m; }
  function _syncDot(s){
    const d=document.getElementById('sync-dot'); if(!d)return;
    d.style.background = s==='on'?'var(--green)':s==='saving'?'var(--orange)':'var(--tx3)';
  }

  /* ── 테마 ──────────────────────────── */
  function _applyTheme(t) {
    const rs = document.documentElement.style;
    let pal = PALETTES.find(p=>p.id===(t.palette||'light1')) || PALETTES[0];
    if (pal.id==='system') pal = mq?.matches ? PALETTES[2] : PALETTES[0];
    document.body.classList.toggle('dark', !!pal.dark);
    const rgb = _hrgb(pal.accent);
    rs.setProperty('--a',    pal.accent);
    rs.setProperty('--a10',  `rgba(${rgb.r},${rgb.g},${rgb.b},.10)`);
    rs.setProperty('--a20',  `rgba(${rgb.r},${rgb.g},${rgb.b},.20)`);
    rs.setProperty('--a40',  `rgba(${rgb.r},${rgb.g},${rgb.b},.40)`);
    rs.setProperty('--a60',  `rgba(${rgb.r},${rgb.g},${rgb.b},.60)`);
    if (pal.id!=='system') {
      ['bg','surf','surf2','card','card2','card3','bdr','bdr2','tx','tx2','tx3'].forEach(k=>rs.setProperty(`--${k}`,pal[k]));
    }
    const ff=t.fontFamily||'Noto Sans KR';
    rs.setProperty('--font',`'${ff}',sans-serif`);
    document.body.style.fontFamily=`'${ff}',sans-serif`;
    const fz=t.fontSize||14;
    rs.setProperty('--fz',  `${fz}px`);
    rs.setProperty('--fzs', `${Math.round(fz*.79)}px`);
    rs.setProperty('--fzm', `${Math.round(fz*1.14)}px`);
    rs.setProperty('--fzl', `${Math.round(fz*1.36)}px`);
    rs.setProperty('--fzh', `${Math.round(fz*1.64)}px`);
    rs.setProperty('--inp-w', `${t.inputBoxWidth||160}px`);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', pal.bg||'#f8f9fc');
  }

  /* ═══════════════ PAGE NAV ═══════════════ */
  function go(page) {
    if (page==='manage' && !DB.isLoggedIn()) { _showLogin(); return; }
    S.page=page;
    document.querySelectorAll('.page').forEach(p=>p.classList.remove('on'));
    document.querySelectorAll('.bni').forEach(n=>n.classList.remove('on'));
    document.getElementById('page-'+page).classList.add('on');
    document.querySelector(`[data-pg="${page}"]`).classList.add('on');

    // 전역 로그아웃 & 관리자 배지 & 공유버튼
    _refreshAuthUI();

    if (page==='operate') { _renderChips(); _renderWeekNav(); _renderDays(); }
    if (page==='manage')  _renderManage();
  }

  function _refreshAuthUI() {
    const loggedIn = DB.isLoggedIn();
    const isAdmin  = DB.isAdmin();
    // 전역 로그아웃 버튼: 로그인 시 항상 우상단 표시
    const gl = document.getElementById('global-logout');
    if (gl) gl.style.display = loggedIn ? 'flex' : 'none';
    // 관리자 배지
    document.getElementById('admin-badge')?.classList.toggle('hidden', !isAdmin);
    // 공유 버튼: 관리자이고 운용화면일 때만
    document.getElementById('op-share-btn')?.classList.toggle('hidden', !(isAdmin && S.page==='operate'));
  }

  /* ═══════════════ LOGIN ═══════════════ */
  function _showLogin() {
    _q('li-id').value=''; _q('li-pw').value=''; _q('li-err').textContent='';
    _q('login-gate').classList.remove('hidden');
    setTimeout(()=>_q('li-id').focus(), 300);
  }
  function cancelLogin(){ _q('login-gate').classList.add('hidden'); }
  function doLogin() {
    const id=_q('li-id').value.trim(), pw=_q('li-pw').value;
    const acc=DB.login(id,pw);
    if (acc) {
      _q('login-gate').classList.add('hidden');
      _refreshAuthUI();
      go('manage');
      _toast(`✅ ${acc.username} (${acc.role==='admin'?'관리자':'운용자'}) 로그인`, 'success');
    } else {
      _q('li-err').textContent='⚠️ 아이디 또는 비밀번호가 올바르지 않습니다';
      _q('li-pw').value='';
    }
  }
  function logout() {
    if (!confirm('로그아웃 하시겠습니까?')) return;
    DB.clearSession();
    _refreshAuthUI();
    go('operate');
    _toast('로그아웃 되었습니다');
  }

  /* ═══════════════ 운용 PAGE ═══════════════ */
  function _renderChips() {
    const classes=DB.getClasses(), wrap=_q('op-chips');
    if (!wrap) return;
    wrap.innerHTML='';
    if (!classes.length) {
      wrap.innerHTML='<span style="font-size:11px;color:var(--tx3)">관리 메뉴에서 반을 추가하세요</span>';
      return;
    }
    if (S.selCls && !classes.find(c=>c.id===S.selCls.id)) S.selCls=null;
    if (!S.selCls) S.selCls=classes[0];
    classes.forEach(cls=>{
      const b=document.createElement('button');
      b.className='chip'+(S.selCls?.id===cls.id?' on':'');
      b.textContent=cls.name;
      b.onclick=()=>{ S.selCls=cls; _renderChips(); _renderDays(); };
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
    const wrap=_q('days-scroll'); if (!wrap) return;
    wrap.innerHTML='';
    const cls=S.selCls;
    if (!cls) { wrap.innerHTML='<div class="empty">반을 선택해주세요</div>'; return; }

    const weekKey=DB.toWeekKey(S.monday);
    const saved=DB.getWeekProgress(cls.id,weekKey);
    const canEdit=DB.canOperate();
    const today=new Date(); today.setHours(0,0,0,0);

    if (!(cls.days||[]).some(d=>DAYS.includes(d))) {
      wrap.innerHTML='<div class="empty">수업 요일이 설정되지 않았습니다.</div>';return;
    }

    const container=document.createElement('div');
    container.className=S.operateView==='grid'?'op-grid':'op-list';

    DAYS.forEach((dayName,i)=>{
      if (!(cls.days||[]).includes(dayName)) return;
      const date=_addDays(S.monday,i);
      const mk=DB.monthKey(date);
      const books=DB.getMonthBooks(cls.id,mk);
      const dc=DC[dayName];
      const isToday=date.toDateString()===today.toDateString();
      const activeBooks=[
        ...(books.main||[]).filter(b=>b.active).map(b=>({...b,type:'main'})),
        ...(books.sub ||[]).filter(b=>b.active).map(b=>({...b,type:'sub'})),
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

      if (!activeBooks.length) {
        card.innerHTML+='<div class="no-bk">이 월에 활성화된 교재가 없습니다</div>';
      } else {
        const rows=document.createElement('div'); rows.className='bk-rows';

        activeBooks.forEach(({id,name,type})=>{
          const progKey=`${dayName}__${id}__progress`;
          const memoKey=`${dayName}__${id}__memo`;
          const dateKey=`${dayName}__${id}__savedAt`;
          const val  = saved[progKey]||'';
          const memo = saved[memoKey]||'';
          const savedAt=saved[dateKey]||'';
          const dateStr=savedAt?new Date(savedAt).toLocaleDateString('ko-KR',{month:'2-digit',day:'2-digit'}):'';

          // ── 진도 행 ──
          const row=document.createElement('div'); row.className='bk-row';
          row.innerHTML=`
            <span class="bk-tag ${type}">${type==='main'?'주':'부'}</span>
            <span class="bk-nm" title="${_esc(name)}">${_esc(name)}</span>
            <input class="bk-inp${val?' filled':''}"
              placeholder="진도 입력"
              value="${_esc(val)}"
              data-cid="${cls.id}" data-wk="${weekKey}"
              data-day="${dayName}" data-bid="${id}" data-field="progress"
              ${canEdit?'':'readonly'}>
            <span class="bk-date">${dateStr}</span>`;
          rows.appendChild(row);

          // ── 메모 행 (bk-row와 정렬 맞춤) ──
          const memoRow=document.createElement('div'); memoRow.className='memo-row';
          memoRow.innerHTML=`
            <span class="memo-lbl">메모</span>
            <textarea class="memo-inp" rows="1"
              placeholder="메모..."
              data-cid="${cls.id}" data-wk="${weekKey}"
              data-day="${dayName}" data-bid="${id}" data-field="memo"
              ${canEdit?'':'readonly'}>${_esc(memo)}</textarea>`;
          rows.appendChild(memoRow);
        });

        card.appendChild(rows);
      }
      container.appendChild(card);
    });

    wrap.appendChild(container);

    // 자동저장
    if (canEdit) {
      wrap.querySelectorAll('.bk-inp').forEach(inp=>{
        inp.addEventListener('input',()=>{
          inp.classList.toggle('filled', inp.value.trim()!=='');
          const row=inp.closest('.bk-row');
          if (row){row.classList.add('saving');row.classList.remove('saved');}
          _syncDot('saving');
          DB.autoSave(inp.dataset.cid,inp.dataset.wk,inp.dataset.day,inp.dataset.bid,inp.dataset.field,inp.value.trim());
          clearTimeout(inp._st);
          inp._st=setTimeout(()=>{
            if(row){row.classList.remove('saving');row.classList.add('saved');}
            _syncDot(FireDB.ready()?'on':'off');
            setTimeout(()=>{if(row)row.classList.remove('saved');},1500);
          },950);
        });
      });
      wrap.querySelectorAll('.memo-inp').forEach(ta=>{
        // 높이 자동조절
        const resize=()=>{ta.style.height='auto';ta.style.height=Math.min(ta.scrollHeight,80)+'px';};
        ta.addEventListener('input',()=>{
          resize();
          _syncDot('saving');
          DB.autoSave(ta.dataset.cid,ta.dataset.wk,ta.dataset.day,ta.dataset.bid,ta.dataset.field,ta.value.trim());
          clearTimeout(ta._st);
          ta._st=setTimeout(()=>_syncDot(FireDB.ready()?'on':'off'),950);
        });
        resize();
      });
    }
  }

  function prevWeek(){ S.monday=_addDays(S.monday,-7); _renderWeekNav(); _renderDays(); }
  function nextWeek(){ S.monday=_addDays(S.monday, 7); _renderWeekNav(); _renderDays(); }

  /* ── 공유 (현재 선택된 반 고정) ─────────── */
  function shareCurrentClass() {
    const cls=S.selCls;
    if (!cls) { _toast('⚠️ 반을 선택해주세요', 'error'); return; }
    const url=`${location.origin}${location.pathname}?share=${cls.id}&wk=${DB.toWeekKey(S.monday)}&locked=1`;
    navigator.clipboard.writeText(url)
      .then(()=>_toast(`🔗 ${cls.name}반 링크 복사 완료! 카카오·문자로 공유하세요`, 'success'))
      .catch(()=>prompt(`${cls.name}반 공유 링크:`, url));
  }

  /* ═══════════════ 달력 ═══════════════ */
  function openCal(){ S.calY=S.monday.getFullYear();S.calM=S.monday.getMonth();_renderCal();_q('cal-ov').classList.remove('hidden'); }
  function closeCal(e){ if(e&&e.target!==_q('cal-ov'))return; _q('cal-ov').classList.add('hidden'); }
  function calPrev(){ if(S.calM===0){S.calY--;S.calM=11;}else S.calM--; _renderCal(); }
  function calNext(){ if(S.calM===11){S.calY++;S.calM=0;}else S.calM++; _renderCal(); }
  function calToday(){ S.calY=new Date().getFullYear();S.calM=new Date().getMonth();_renderCal(); }

  function _renderCal() {
    const yr=S.calY,mo=S.calM;
    _q('cal-title').textContent=`${yr}년 ${mo+1}월`;
    const grid=_q('cal-grid'); grid.innerHTML='';
    const today=new Date(); today.setHours(0,0,0,0);
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

  /* ═══════════════ 관리 PAGE ═══════════════ */
  function _renderManage() {
    const sess=DB.getSession();
    _q('mg-sess').textContent=sess?`${sess.username} (${sess.role==='admin'?'관리자':'운용자'}) 로그인 중`:'로그인 필요';
    _q('vt-l').classList.toggle('on',S.viewMode==='list');
    _q('vt-g').classList.toggle('on',S.viewMode==='grid');
    const isAdmin=DB.isAdmin();
    // 운용자는 반, 계정 탭 숨김
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

  /* ═══════════════ 반 관리 탭 ═══════════════
     ★ 핵심 수정: mgMk(월)는 반 목록과 완전 독립
     반 카드는 항상 전체 반 목록을 표시하고,
     각 카드 내부의 교재만 mgMk 기준으로 표시
  ══════════════════════════════════════════ */
  function _renderMgCls() {
    const wrap=_q('mg-classes'); if(!wrap)return;
    wrap.innerHTML='';
    const isAdmin=DB.isAdmin();

    // ★ 반 추가 버튼은 월과 무관하게 항상 표시
    if (isAdmin) {
      const btn=document.createElement('button'); btn.className='add-cls';
      btn.innerHTML='<span style="font-size:18px">＋</span> 반 추가 (월과 무관)';
      btn.onclick=()=>openClassModal(); wrap.appendChild(btn);
    }

    const classes=DB.getClasses();
    if (!classes.length) {
      const em=document.createElement('div');em.className='empty';em.textContent='등록된 반이 없습니다.';
      wrap.appendChild(em); return;
    }

    const cont=document.createElement('div');
    cont.className=S.viewMode==='grid'?'cls-grid':'cls-list';
    // ★ 전체 반을 항상 표시
    classes.forEach(cls=>cont.appendChild(_buildClsCard(cls,isAdmin)));
    wrap.appendChild(cont);
  }

  function _buildClsCard(cls, isAdmin) {
    const card=document.createElement('div'); card.className='cls-card';
    const mk=S.mgMk;
    // ★ getMonthBooks: 해당 월 없으면 이전 달 복사 or 빈 배열 — 반은 그대로 유지
    const books=DB.getMonthBooks(cls.id, mk);
    const [mkY,mkM]=mk.split('-').map(Number);
    const dayBadges=(cls.days||[]).map(d=>`<span class="dbdg ${DC[d]}">${d}</span>`).join('');

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

    const mgr=document.createElement('div'); mgr.className='bk-mgr';

    ['main','sub'].forEach(type=>{
      const arr=books[type]||[];
      const sectHdr=document.createElement('div'); sectHdr.className='bk-sect-hdr';
      const sl=document.createElement('div'); sl.className='bk-sl';
      sl.textContent=type==='main'?'📘 주교재':'📗 부교재';
      sectHdr.appendChild(sl);
      if (isAdmin && arr.length) {
        const cb=document.createElement('button'); cb.className='clear-btn'; cb.textContent='전체삭제';
        cb.onclick=async()=>{ if(!confirm(`${type==='main'?'주':'부'}교재 전체 삭제?`))return; await DB.clearMonthBooks(cls.id,mk,type); _toast('🗑 전체 삭제 완료'); };
        sectHdr.appendChild(cb);
      }
      mgr.appendChild(sectHdr);

      if (!arr.length) {
        const em=document.createElement('div');
        em.style.cssText='font-size:11px;color:var(--tx3);padding:2px 0 6px';
        em.textContent='교재 없음'; mgr.appendChild(em);
      }

      arr.forEach(b=>{
        const row=document.createElement('div'); row.className='bk-row-mg';
        const tag=document.createElement('span'); tag.className=`bk-tag ${type}`; tag.textContent=type==='main'?'주':'부';
        row.appendChild(tag);
        if (b._new) {const nb=document.createElement('span');nb.className='bk-new';nb.textContent='NEW';row.appendChild(nb);}
        if (b.createdAt) {
          const cd=document.createElement('span'); cd.className='bk-cdate';
          cd.textContent=new Date(b.createdAt).toLocaleDateString('ko-KR',{month:'2-digit',day:'2-digit'});
          row.appendChild(cd);
        }
        if (isAdmin) {
          const ei=document.createElement('input'); ei.className='bk-ei'+(b.active?'':' inactive');
          ei.value=b.name; ei.title='클릭하여 이름 변경';
          let orig=b.name;
          ei.addEventListener('focus',()=>{orig=ei.value;});
          ei.addEventListener('blur',async()=>{const n=ei.value.trim();if(n&&n!==orig){await DB.updateBook(cls.id,mk,type,b.id,{name:n});_toast('✏️ 교재명 변경됨');}else if(!n)ei.value=orig;});
          ei.addEventListener('keydown',e=>{if(e.key==='Enter')ei.blur();});
          row.appendChild(ei);
          const ab=document.createElement('button'); ab.className='bk-act'; ab.title=b.active?'비활성화':'활성화'; ab.textContent=b.active?'✅':'⬜';
          ab.onclick=async()=>{await DB.updateBook(cls.id,mk,type,b.id,{active:!b.active});};
          row.appendChild(ab);
          const db2=document.createElement('button'); db2.className='bk-act del'; db2.title='삭제'; db2.textContent='✕';
          db2.onclick=async()=>{if(!confirm(`"${b.name}" 삭제?`))return;await DB.deleteBook(cls.id,mk,type,b.id);_toast('🗑 삭제 완료');};
          row.appendChild(db2);
        } else {
          const nm=document.createElement('span'); nm.className='bk-ei'+(b.active?'':' inactive'); nm.textContent=b.name; row.appendChild(nm);
        }
        mgr.appendChild(row);
      });
    });
    card.appendChild(mgr);

    /* ★ 교재 추가 행 — 버그 수정 핵심 부분
       각 카드마다 고유한 ID 사용 (cls.id + type 조합)
       select + input + button이 한 행에 절대 가려지지 않도록 flex 배치
    */
    if (isAdmin) {
      const ar=document.createElement('div'); ar.className='add-bk-row';
      // ★ ID에 cls.id 포함하여 고유성 보장
      const selId = `sel_${cls.id}`;
      const inpId = `inp_${cls.id}`;
      ar.innerHTML=`
        <select class="add-bk-sel" id="${selId}">
          <option value="main">주</option>
          <option value="sub">부</option>
        </select>
        <input class="add-bk-inp" id="${inpId}"
               placeholder="교재명 입력"
               onkeydown="if(event.key==='Enter')App.addBook('${cls.id}')">
        <button class="add-bk-btn" onclick="App.addBook('${cls.id}')">추가</button>`;
      card.appendChild(ar);
    }
    return card;
  }

  /* ★ 핵심 수정: addBook — 고유 ID로 DOM 조회, type 정확히 읽기 */
  async function addBook(clsId) {
    const sel = document.getElementById(`sel_${clsId}`);
    const inp = document.getElementById(`inp_${clsId}`);
    if (!sel || !inp) { _toast('⚠️ 입력칸을 찾을 수 없습니다', 'error'); return; }
    const name = inp.value.trim();
    const type = sel.value;  // 'main' or 'sub'
    if (!name) { _toast('⚠️ 교재명을 입력해주세요', 'error'); inp.focus(); return; }
    await DB.addBook(clsId, S.mgMk, type, name);
    inp.value='';
    _toast(`📚 ${type==='main'?'주':'부'}교재 "${name}" 추가 완료`, 'success');
  }

  /* ★ 수정: mgMk 변경만 하고 반 목록은 그대로 유지 */
  function mgPrev() { S.mgMk=DB.prevMonthKey(S.mgMk); _renderMgCls(); }
  function mgNext() { S.mgMk=DB.nextMonthKey(S.mgMk); _renderMgCls(); }

  function openClassModal(id=null) {
    S.editClsId=id; const cls=id?DB.getClassById(id):null;
    _q('mcls-t').textContent=id?'반 수정':'반 추가';
    _q('f-cname').value=cls?.name||'';
    document.querySelectorAll('#modal-cls .day-ck input').forEach(cb=>{cb.checked=cls?(cls.days||[]).includes(cb.value):false;});
    _q('modal-cls').classList.remove('hidden');
  }
  async function saveClass() {
    const name=_q('f-cname').value.trim();
    if (!name) { _toast('⚠️ 반 이름을 입력해주세요','error'); return; }
    if (!S.editClsId && DB.classExists(name)) { _toast(`⚠️ "${name}" 반이 이미 존재합니다`, 'error'); return; }
    const days=[...document.querySelectorAll('#modal-cls .day-ck input:checked')].map(c=>c.value);
    if (!days.length) { _toast('⚠️ 요일을 선택해주세요','error'); return; }
    if (S.editClsId) {
      await DB.updateClass(S.editClsId,{name,days});
      if (S.selCls?.id===S.editClsId) S.selCls=DB.getClassById(S.editClsId);
      _toast('✅ 반 수정 완료','success');
    } else {
      const r=await DB.addClass({name,days});
      if (!r) { _toast('⚠️ 반 추가 실패','error'); return; }
      _toast('✅ 반 추가 완료','success');
    }
    closeModal('cls'); _renderMgCls(); _renderChips();
  }
  async function delClass(id) {
    const cls=DB.getClassById(id);
    if (!confirm(`"${cls?.name}" 반을 삭제하시겠습니까?\n모든 진도 데이터도 삭제됩니다.`)) return;
    await DB.deleteClass(id); if(S.selCls?.id===id)S.selCls=null;
    _renderMgCls(); _renderChips(); _toast('🗑 삭제 완료');
  }

  /* ═══════════════ 계정 탭 ═══════════════ */
  function _renderMgAcc() {
    const wrap=_q('mg-accounts'); if(!wrap)return; wrap.innerHTML='';
    const isAdmin=DB.isAdmin(), sess=DB.getSession();
    if (isAdmin) {
      const b=document.createElement('button'); b.className='add-cls'; b.style.marginBottom='6px';
      b.innerHTML='<span>＋</span> 계정 추가'; b.onclick=()=>openAccModal(); wrap.appendChild(b);
    }
    const note=document.createElement('div');
    note.style.cssText='font-size:11px;color:var(--tx2);margin-bottom:8px;line-height:1.65;padding:8px 10px;background:var(--card2);border-radius:var(--rs)';
    note.innerHTML='<b style="color:var(--tx)">admin</b>: 관리메뉴 전체 + 진도입력<br><b style="color:var(--tx)">operator</b>: 운용화면 진도 입력만';
    wrap.appendChild(note);
    const card=document.createElement('div'); card.className='acc-card';
    DB.getAccounts().forEach(acc=>{
      const isMe=sess?.id===acc.id, row=document.createElement('div'); row.className='acc-row';
      row.innerHTML=`<div>
        <div class="acc-nm">${_esc(acc.username)}${isMe?'&nbsp;<span style="color:var(--green);font-size:10px">●</span>':''}
          <span class="role-badge ${acc.role}">${acc.role==='admin'?'관리자':'운용자'}</span></div>
        <div class="acc-role">${acc.role==='admin'?'모든 기능':'진도 입력만'}</div></div>
        <div class="acc-acts">${isAdmin?`<button class="ibtn" onclick="App.openAccModal('${acc.id}')">✏️</button>`:''}
        ${isAdmin&&!isMe?`<button class="ibtn red" onclick="App.delAcc('${acc.id}','${_esc(acc.username)}')">🗑</button>`:''}</div>`;
      card.appendChild(row);
    }); wrap.appendChild(card);
  }
  function openAccModal(id=null) {
    S.editAccId=id; const acc=id?DB.getAccounts().find(a=>a.id===id):null;
    _q('macc-t').textContent=id?'계정 수정':'계정 추가';
    _q('f-aid').value=acc?.username||''; _q('f-aid').readOnly=!!id;
    _q('f-apw').value=''; _q('f-arole').value=acc?.role||'operator';
    _q('modal-acc').classList.remove('hidden');
  }
  async function saveAccount() {
    const u=_q('f-aid').value.trim(),p=_q('f-apw').value,role=_q('f-arole').value;
    if(!u){_toast('⚠️ 아이디를 입력해주세요','error');return;}
    if(!S.editAccId&&!p){_toast('⚠️ 비밀번호를 입력해주세요','error');return;}
    if(S.editAccId){const d=p?{password:p,role}:{role};await DB.updateAccount(S.editAccId,d);_toast('✅ 계정 수정 완료','success');}
    else{if(!await DB.addAccount(u,p,role)){_toast('⚠️ 이미 존재하는 아이디','error');return;}_toast('✅ 계정 추가 완료','success');}
    closeModal('acc'); _renderMgAcc();
  }
  async function delAcc(id,u) {
    if(DB.getSession()?.id===id){_toast('⚠️ 현재 계정은 삭제 불가','error');return;}
    if(!confirm(`"${u}" 계정을 삭제하시겠습니까?`))return;
    await DB.deleteAccount(id); _renderMgAcc(); _toast('🗑 삭제 완료');
  }

  /* ═══════════════ 테마 탭 ═══════════════ */
  function _renderMgTheme() {
    const wrap=_q('mg-theme'); if(!wrap)return; wrap.innerHTML='';
    const t=DB.getTheme(); S.tmpTheme={...t};
    const isAdmin=DB.isAdmin();
    const card=document.createElement('div'); card.className='th-card';

    // 미리보기 바
    const prev=document.createElement('div'); prev.className='th-row';
    prev.innerHTML='<div class="th-preview" id="th-prev"></div>'; card.appendChild(prev);
    _updatePrev(PALETTES.find(p=>p.id===(t.palette||'light1'))?.accent||'#4f46e5');

    // ① 팔레트
    const pr=document.createElement('div'); pr.className='th-row';
    pr.innerHTML='<div class="th-lbl">🎨 테마 (5가지)</div>';
    const palRow=document.createElement('div'); palRow.className='pal-row';
    PALETTES.forEach(pal=>{
      const item=document.createElement('div');
      item.className='pal-item'+(pal.id===(t.palette||'light1')?' on':'');
      const swBg=pal.id==='system'?'linear-gradient(135deg,#f8f9fc 50%,#0b0b14 50%)':pal.bg;
      item.innerHTML=`<div class="pal-swatch" style="background:${swBg}">${pal.emoji}</div>
        <div class="pal-name">${pal.name}</div>`;
      if(!isAdmin){item.style.pointerEvents='none';item.style.opacity='.5';}
      item.onclick=()=>{
        S.tmpTheme.palette=pal.id; if(pal.id!=='system')S.tmpTheme.accent=pal.accent;
        _applyTheme(S.tmpTheme); _updatePrev(pal.accent||'#4f46e5');
        palRow.querySelectorAll('.pal-item').forEach((el,i)=>el.classList.toggle('on',PALETTES[i].id===pal.id));
      };
      palRow.appendChild(item);
    }); pr.appendChild(palRow); card.appendChild(pr);

    // ② 폰트
    const fr=document.createElement('div'); fr.className='th-row'; fr.innerHTML='<div class="th-lbl">🔤 폰트</div>';
    const ffList=document.createElement('div'); ffList.className='ff-list';
    FONTS.forEach(f=>{
      const item=document.createElement('div');
      item.className='ff-item'+(f.key===(t.fontFamily||'Noto Sans KR')?' on':'');
      item.style.fontFamily=`'${f.key}',sans-serif`;
      item.innerHTML=`<span class="ff-name">${f.label}</span><span class="ff-sample">${f.sample}</span>`;
      if(!isAdmin){item.style.pointerEvents='none';item.style.opacity='.45';}
      item.onclick=()=>{S.tmpTheme.fontFamily=f.key;_applyTheme(S.tmpTheme);ffList.querySelectorAll('.ff-item').forEach((el,i)=>el.classList.toggle('on',FONTS[i].key===f.key));};
      ffList.appendChild(item);
    }); fr.appendChild(ffList); card.appendChild(fr);

    // ③ 글자 크기
    const szr=document.createElement('div'); szr.className='th-row'; szr.innerHTML='<div class="th-lbl">📐 글자 크기</div>';
    const szW=document.createElement('div'); szW.className='sl-row';
    const sl=document.createElement('input'); sl.type='range'; sl.className='sl'; sl.min=11; sl.max=20; sl.step=1; sl.value=t.fontSize||14; sl.disabled=!isAdmin;
    const fzv=document.createElement('div'); fzv.className='sl-val'; fzv.textContent=`${t.fontSize||14}px`;
    sl.addEventListener('input',()=>{S.tmpTheme.fontSize=+sl.value;fzv.textContent=`${sl.value}px`;_applyTheme(S.tmpTheme);});
    szW.appendChild(sl); szW.appendChild(fzv); szr.appendChild(szW); card.appendChild(szr);

    // ④ 진도 입력칸 너비 + ★ 실제 박스 미리보기
    const iwr=document.createElement('div'); iwr.className='th-row'; iwr.innerHTML='<div class="th-lbl">📏 진도 입력칸 너비</div>';
    const iwW=document.createElement('div'); iwW.className='sl-row';
    const isl=document.createElement('input'); isl.type='range'; isl.className='sl'; isl.min=80; isl.max=260; isl.step=10; isl.value=t.inputBoxWidth||160; isl.disabled=!isAdmin;
    const iwv=document.createElement('div'); iwv.className='sl-val'; iwv.textContent=`${t.inputBoxWidth||160}px`;
    // ★ 실제 박스 미리보기
    const ipWrap=document.createElement('div'); ipWrap.className='inp-preview-wrap';
    ipWrap.innerHTML=`<div class="inp-preview-box">
      <span class="bk-tag main" style="font-size:9px;padding:2px 6px;border-radius:4px">주</span>
      <span class="inp-preview-nm">수학의 정석(상)</span>
      <div class="inp-preview-inp" id="inp-prev-box" style="width:${t.inputBoxWidth||160}px">p.123~130</div>
    </div>`;
    isl.addEventListener('input',()=>{
      const w=+isl.value; S.tmpTheme.inputBoxWidth=w; iwv.textContent=`${w}px`;
      _applyTheme(S.tmpTheme);
      const pb=document.getElementById('inp-prev-box'); if(pb) pb.style.width=`${w}px`;
    });
    iwW.appendChild(isl); iwW.appendChild(iwv); iwr.appendChild(iwW); iwr.appendChild(ipWrap); card.appendChild(iwr);

    // ⑤ 운용화면 보기
    const ovr=document.createElement('div'); ovr.className='th-row'; ovr.innerHTML='<div class="th-lbl">📱 운용화면 기본 보기</div>';
    const vrow=document.createElement('div'); vrow.className='view-sel-row';
    [{v:'grid',l:'⊞ 그리드'},{v:'list',l:'☰ 리스트'}].forEach(({v,l})=>{
      const btn=document.createElement('button'); btn.className='view-sel-btn'+(v===(t.operateView||'grid')?' on':''); btn.textContent=l;
      if(!isAdmin){btn.disabled=true;btn.style.opacity='.45';}
      btn.onclick=()=>{S.tmpTheme.operateView=v;S.operateView=v;vrow.querySelectorAll('.view-sel-btn').forEach((b,i)=>b.classList.toggle('on',['grid','list'][i]===v));};
      vrow.appendChild(btn);
    }); ovr.appendChild(vrow); card.appendChild(ovr);

    // ⑥ 저장 버튼 (★ 성공 알림)
    if (isAdmin) {
      const sr=document.createElement('div'); sr.className='th-row';
      const sb=document.createElement('button'); sb.className='th-save-btn'; sb.textContent='💾 테마 저장 · 적용';
      sb.onclick=async()=>{
        sb.textContent='저장 중...'; sb.disabled=true;
        await DB.saveTheme(S.tmpTheme);
        _applyTheme(S.tmpTheme);
        S.operateView=S.tmpTheme.operateView||'grid';
        sb.textContent='💾 테마 저장 · 적용'; sb.disabled=false;
        _toast('🎨 테마가 저장되었습니다! 모든 기기에 반영됩니다.', 'success', 3500);
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
  function _updatePrev(c){ const el=_q('th-prev'); if(el) el.style.background=`linear-gradient(90deg,${c},#8b5cf6,#06b6d4)`; }

  /* ═══════════════ 백업 탭 ═══════════════ */
  function _renderMgIO() {
    const wrap=_q('mg-io'); if(!wrap)return; wrap.innerHTML='';
    const isAdmin=DB.isAdmin();
    const card=document.createElement('div'); card.className='io-card';
    const exRow=document.createElement('div'); exRow.className='io-row';
    exRow.innerHTML='<div><div class="io-title">📤 엑셀 내보내기</div><div class="io-desc">반·교재·진도 전체 백업</div></div>';
    const exBtn=document.createElement('button'); exBtn.className='io-btn ex'; exBtn.textContent='내보내기'; exBtn.disabled=!isAdmin;
    exBtn.onclick=_exportExcel; exRow.appendChild(exBtn); card.appendChild(exRow);
    const imRow=document.createElement('div'); imRow.className='io-row';
    imRow.innerHTML='<div><div class="io-title">📥 엑셀 불러오기</div><div class="io-desc">백업 파일로 전체 복원 · DB 초기화 후 복구 가능</div></div>';
    const imBtn=document.createElement('button'); imBtn.className='io-btn im'; imBtn.textContent='파일 선택'; imBtn.disabled=!isAdmin;
    imBtn.onclick=()=>_q('xl-in').click(); imRow.appendChild(imBtn); card.appendChild(imRow);
    wrap.appendChild(card);

    // 드래그&드롭
    const drop=document.createElement('div'); drop.className='drop-zone';
    drop.innerHTML='📂 엑셀 파일을 여기에 드래그하거나 탭하세요<br><span style="font-size:10px;margin-top:4px;display:block">PC 마우스 드래그 · 모바일 터치 파일 선택 지원</span>';
    drop.addEventListener('dragover',e=>{e.preventDefault();drop.classList.add('drag-over');});
    drop.addEventListener('dragleave',()=>drop.classList.remove('drag-over'));
    drop.addEventListener('drop',e=>{e.preventDefault();drop.classList.remove('drag-over');const f=e.dataTransfer.files[0];if(f)_processImport(f);});
    drop.addEventListener('click',()=>_q('xl-in').click());
    wrap.appendChild(drop);
    if(!isAdmin){const n=document.createElement('div');n.className='empty';n.textContent='⚠️ 관리자 로그인 후 사용 가능합니다';wrap.appendChild(n);}
  }

  function _exportExcel() {
    const data=DB.exportAll();
    const wb=XLSX.utils.book_new();
    const clsRows=[];
    data.classes.forEach(cls=>{
      const mk=DB.monthKey(new Date()); const bks=cls.monthBooks?.[mk]||{main:[],sub:[]};
      clsRows.push({반:cls.name,요일:(cls.days||[]).join(','),등록일:cls.createdAt||'',
        주교재:(bks.main||[]).map(b=>b.name+(b.active?'':'(비)')).join('/'),
        부교재:(bks.sub||[]).map(b=>b.name+(b.active?'':'(비)')).join('/')});
    });
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(clsRows),'반목록');
    const pRows=[];
    Object.entries(data.progress||{}).forEach(([k,v])=>{
      const p=k.split('__');if(p.length>=5){const cls=data.classes.find(c=>c.id===p[0]);
        pRows.push({반:cls?.name||p[0],주차:p[1],요일:p[2],교재ID:p[3],구분:p[4],값:v});}
    });
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(pRows),'진도데이터');
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet([{data:JSON.stringify({
      version:7,classes:data.classes,progress:data.progress,theme:data.theme
    })}]),'_restore');
    const now=new Date();
    XLSX.writeFile(wb,`진도관리백업_${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}.xlsx`);
    _toast('📤 백업 파일 저장 완료', 'success');
  }

  function handleImport(input){ const f=input.files[0]; if(!f)return; input.value=''; _processImport(f); }
  async function _processImport(file) {
    const reader=new FileReader();
    reader.onload=async(e)=>{
      try{
        const wb=XLSX.read(e.target.result,{type:'array'});
        const raw=wb.Sheets['_restore']; if(!raw){_toast('⚠️ 올바른 백업 파일이 아닙니다','error');return;}
        const rows=XLSX.utils.sheet_to_json(raw); if(!rows[0]?.data){_toast('⚠️ 데이터 없음','error');return;}
        const data=JSON.parse(rows[0].data);
        const result=await DB.importAll(data);
        _renderMgCls(); _renderChips(); _renderDays();
        const div=document.createElement('div'); div.className='import-result';
        div.innerHTML=`<div class="ir-added">✅ 새로 추가: ${result.added.join(', ')||'없음'}</div>
          <div class="ir-updated">🔄 업데이트: ${result.updated.join(', ')||'없음'}</div>`;
        _q('mg-io')?.appendChild(div);
        _toast('📥 복원 완료!', 'success');
      }catch(err){_toast('⚠️ 파일 오류: '+err.message,'error');console.error(err);}
    };
    reader.readAsArrayBuffer(file);
  }

  /* ═══════════════ 공유 탭 ═══════════════ */
  function _renderMgShare() {
    const wrap=_q('mg-share'); if(!wrap)return; wrap.innerHTML='';
    const note=document.createElement('div');
    note.style.cssText='font-size:11px;color:var(--tx2);margin-bottom:10px;line-height:1.6';
    note.textContent='공유 링크 접속 시 선택된 반만 읽기 전용으로 표시됩니다. 다른 반은 선택 불가합니다.';
    wrap.appendChild(note);
    const card=document.createElement('div'); card.className='share-card';
    const classes=DB.getClasses();
    if(!classes.length){card.innerHTML='<div class="empty">등록된 반이 없습니다</div>';wrap.appendChild(card);return;}
    classes.forEach(cls=>{
      const row=document.createElement('div'); row.className='share-cls-row';
      const url=`${location.origin}${location.pathname}?share=${cls.id}&wk=${DB.toWeekKey(S.monday)}&locked=1`;
      row.innerHTML=`<div class="share-cls-name">${_esc(cls.name)}</div>
        <div class="share-btns">
          <button class="share-btn copy" onclick="App.copyUrl('${_esc(url)}')">🔗 복사</button>
          <button class="share-btn sms"  onclick="App.sendSms('${_esc(url)}','${_esc(cls.name)}')">💬 문자</button>
        </div>`;
      card.appendChild(row);
    }); wrap.appendChild(card);
  }
  function copyUrl(url){ navigator.clipboard.writeText(url).then(()=>_toast('🔗 복사 완료','success')).catch(()=>prompt('링크:',url)); }
  function sendSms(url,name){ location.href=`sms:?body=${encodeURIComponent(`[학원 진도] ${name}반\n${url}`)}`; }

  /* ═══════════════ 공유 뷰 (읽기전용, 반 고정) ═══════════════ */
  function _renderShareView(classId, wkParam) {
    const monday=wkParam?_wkToMon(wkParam):_mon(new Date());
    const view=_q('share-view'); view.style.cssText='position:fixed;inset:0;background:var(--bg);overflow-y:auto;display:flex;flex-direction:column;';
    _applyTheme(DB.getTheme());
    const cls=DB.getClassById(classId);
    if (!cls) { view.innerHTML='<div class="empty" style="margin-top:80px">반 정보를 찾을 수 없습니다</div>'; return; }
    const wk=DB.toWeekKey(monday);
    const saved=DB.getWeekProgress(cls.id,wk);
    const fri=_addDays(monday,4);
    const fmt=d=>`${d.getMonth()+1}/${d.getDate()}`;

    view.innerHTML=`
      <div style="padding:13px 15px;background:var(--surf);border-bottom:1px solid var(--bdr);position:sticky;top:0;z-index:10;box-shadow:var(--sh)">
        <div style="font-size:18px;font-weight:800;color:var(--tx)">📚 ${_esc(cls.name)}반 진도 현황</div>
        <div style="font-size:11px;color:var(--tx2);margin-top:2px">${fmt(monday)} – ${fmt(fri)} · ${_wom(monday)}주차</div>
        <div class="sv-ro-badge">🔒 읽기 전용 · 반 선택 불가</div>
      </div>
      <div id="sv-body" style="padding:11px;display:flex;flex-direction:column;gap:9px"></div>`;

    const body=_q('sv-body');
    DAYS.forEach((dayName,i)=>{
      if (!(cls.days||[]).includes(dayName)) return;
      const date=_addDays(monday,i);
      const mk=DB.monthKey(date);
      const books=DB.getMonthBooks(cls.id,mk);
      const dc=DC[dayName];
      const ab=[
        ...(books.main||[]).filter(b=>b.active).map(b=>({...b,type:'main'})),
        ...(books.sub||[]).filter(b=>b.active).map(b=>({...b,type:'sub'})),
      ];
      const card=document.createElement('div');
      card.style.cssText='background:var(--card);border:1px solid var(--bdr);border-radius:14px;overflow:hidden;box-shadow:var(--sh)';
      card.innerHTML=`<div style="display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--bdr);background:var(--surf2)">
        <div class="bg-${dc}" style="width:4px;height:28px;border-radius:3px;flex-shrink:0"></div>
        <div>
          <div class="col-${dc}" style="font-size:15px;font-weight:700">${dayName}요일</div>
          <div style="font-size:11px;color:var(--tx2)">${date.getMonth()+1}월 ${date.getDate()}일</div>
        </div>
      </div>`;
      if (ab.length) {
        const rows=document.createElement('div'); rows.style.cssText='padding:7px 10px;display:flex;flex-direction:column;gap:5px';
        ab.forEach(({id,name,type})=>{
          const progKey=`${dayName}__${id}__progress`;
          const memoKey=`${dayName}__${id}__memo`;
          const dateKey=`${dayName}__${id}__savedAt`;
          const val=saved[progKey]||'', memo=saved[memoKey]||'', savedAt=saved[dateKey]||'';
          const dateStr=savedAt?new Date(savedAt).toLocaleDateString('ko-KR',{month:'2-digit',day:'2-digit'}):'';
          const brow=document.createElement('div');
          brow.style.cssText='display:flex;align-items:center;gap:7px;background:var(--card2);border:1px solid var(--bdr);border-radius:9px;padding:8px 10px';
          brow.innerHTML=`<span class="bk-tag ${type}">${type==='main'?'주':'부'}</span>
            <span style="flex:1;font-size:12px;font-weight:600;color:var(--tx);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_esc(name)}</span>
            <div style="text-align:right;flex-shrink:0">
              <div class="sv-bk-range ${val?'':'sv-bk-empty'}">${_esc(val)||'미입력'}</div>
              ${dateStr?`<div style="font-size:9px;color:var(--tx3);margin-top:1px">${dateStr} 입력</div>`:''}
            </div>`;
          rows.appendChild(brow);
          if (memo) { const mr=document.createElement('div'); mr.className='sv-memo'; mr.textContent=`📝 ${memo}`; rows.appendChild(mr); }
        });
        card.appendChild(rows);
      }
      body.appendChild(card);
    });
    DB.on('progress', ()=>_renderShareView(classId, wkParam));
  }

  /* ── Modal ───────────────────────────────── */
  function closeModal(w){ _q('modal-'+w).classList.add('hidden'); }

  /* ── 유틸 ───────────────────────────────── */
  function _q(id){ return document.getElementById(id); }
  function _mon(d){ const r=new Date(d);r.setHours(0,0,0,0);const day=r.getDay();r.setDate(r.getDate()+(day===0?-6:1-day));return r; }
  function _addDays(d,n){ const r=new Date(d);r.setDate(r.getDate()+n);return r; }
  function _sameM(a,b){ return a.getMonth()===b.getMonth()&&a.getFullYear()===b.getFullYear(); }
  function _wom(mon){ const f=new Date(mon.getFullYear(),mon.getMonth(),1);return Math.round((mon-_mon(f))/(7*86400000))+1; }
  function _wkToMon(wk){ const[y,w]=wk.split('-W').map(Number);const j=new Date(y,0,4);const m=new Date(j);m.setDate(j.getDate()-((j.getDay()+6)%7)+(w-1)*7);return m; }
  function _esc(s){ return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function _hrgb(h){ const m=/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(h);return m?{r:parseInt(m[1],16),g:parseInt(m[2],16),b:parseInt(m[3],16)}:{r:79,g:70,b:229}; }

  let _tt;
  function _toast(msg, type='', dur=2500) {
    const el=_q('toast'); if(!el)return;
    el.textContent=msg;
    el.className='toast'+(type?` ${type}`:'');
    el.classList.remove('hidden');
    clearTimeout(_tt); _tt=setTimeout(()=>el.classList.add('hidden'),dur);
  }

  return {
    init, go, mgTab, setView,
    cancelLogin, doLogin, logout,
    prevWeek, nextWeek,
    openCal, closeCal, calPrev, calNext, calToday,
    openClassModal, saveClass, delClass,
    addBook, mgPrev, mgNext,
    openAccModal, saveAccount, delAcc,
    handleImport, copyUrl, sendSms,
    shareCurrentClass,
    closeModal,
  };
})();

document.addEventListener('DOMContentLoaded', App.init);
