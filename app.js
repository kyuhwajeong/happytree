/**
 * app.js — 학원 진도 관리 v4
 * 전체 기능:
 * 1. Firebase 실시간 동기화 + 자동저장 (저장 버튼 제거)
 * 2. 테마 즉각 반영 + 저장
 * 3. 달력 팝업으로 날짜 선택 → 해당 주 이동
 * 4. 엑셀 내보내기/불러오기
 * 5. 반별 공유 URL (읽기 전용)
 */

const App = (() => {

  /* ── 상수 ───────────────────────────────── */
  const DAYS    = ['월','화','수','목','금'];
  const DC      = { 월:'mon',화:'tue',수:'wed',목:'thu',금:'fri' };
  const PALETTES = [
    { accent:'#6366f1', bg:'#0b0b12', surf:'#13131f', surf2:'#1a1a2a', card:'#1e1e30', card2:'#252538', bdr:'#2e2e48', bdr2:'#3a3a58', name:'인디고' },
    { accent:'#10b981', bg:'#091210', surf:'#111a17', surf2:'#172120', card:'#1b2a26', card2:'#20332e', bdr:'#253d38', bdr2:'#2e4d46', name:'에메랄드' },
    { accent:'#f59e0b', bg:'#120f07', surf:'#1c1508', surf2:'#23190a', card:'#291e0d', card2:'#332612', bdr:'#3d2e16', bdr2:'#4d3a1c', name:'앰버' },
    { accent:'#ef4444', bg:'#120909', surf:'#1c0f0f', surf2:'#231414', card:'#291818', card2:'#331e1e', bdr:'#3d2424', bdr2:'#4d2c2c', name:'레드' },
    { accent:'#8b5cf6', bg:'#0d0b14', surf:'#141120', surf2:'#1a1628', card:'#1f1b30', card2:'#26213a', bdr:'#2e2844', bdr2:'#3a3258', name:'바이올렛' },
    { accent:'#ec4899', bg:'#13090f', surf:'#1c1018', surf2:'#231520', card:'#291928', card2:'#331e32', bdr:'#3d243d', bdr2:'#4d2c4d', name:'핑크' },
    { accent:'#06b6d4', bg:'#080f12', surf:'#0e191f', surf2:'#122028', card:'#152630', card2:'#192e3a', bdr:'#1e3844', bdr2:'#254558', name:'시안' },
    { accent:'#f97316', bg:'#120d08', surf:'#1c1410', surf2:'#231a13', card:'#291e16', card2:'#33261b', bdr:'#3d2e22', bdr2:'#4d3a2a', name:'오렌지' },
  ];
  const FONTS = [
    { key:'Noto Sans KR',     label:'Noto Sans KR',  sample:'가나다 Aa 123' },
    { key:'Nanum Gothic',     label:'나눔고딕',        sample:'가나다 Aa 123' },
    { key:'Nanum Myeongjo',   label:'나눔명조',        sample:'가나다 Aa 123' },
    { key:'IBM Plex Sans KR', label:'IBM Plex KR',   sample:'가나다 Aa 123' },
  ];

  /* ── 상태 ───────────────────────────────── */
  const S = {
    page:      'operate',
    mgTab:     'classes',
    selCls:    null,
    monday:    getMonday(new Date()),
    mgMk:      DB.monthKey(new Date()),
    editClsId: null,
    editAccId: null,
    tmpTheme:  null,
    viewMode:  'grid',
    calYear:   new Date().getFullYear(),
    calMonth:  new Date().getMonth(),
    shareMode: false,
  };

  /* ── Init ───────────────────────────────── */
  async function init() {
    // 공유 URL 체크
    const params = new URLSearchParams(location.search);
    if (params.has('share')) {
      await initShareView(params.get('share'));
      return;
    }

    await DB.init();

    // Firebase 변경 → UI 자동 갱신
    DB.onChange('classes',  () => { renderChips(); if(S.page==='operate') renderDays(); if(S.page==='manage'&&S.mgTab==='classes') renderMgClasses(); });
    DB.onChange('progress', () => { if(S.page==='operate') renderDays(); });
    DB.onChange('theme',    () => { applyTheme(DB.getTheme()); if(S.page==='manage'&&S.mgTab==='theme') renderMgTheme(); });

    const t = DB.getTheme();
    S.viewMode = t.viewMode || 'grid';
    applyTheme(t);

    setTimeout(() => {
      document.getElementById('splash').classList.add('out');
      setTimeout(() => {
        document.getElementById('splash').style.display = 'none';
        document.getElementById('app').classList.remove('hidden');
        go('operate');
      }, 380);
    }, 1100);
  }

  /* ── 테마 적용 ──────────────────────────── */
  function applyTheme(t, preview=false) {
    const rs  = document.documentElement.style;
    const pal = PALETTES.find(p=>p.accent===t.accentColor) || PALETTES[0];
    const rgb = hexRgb(t.accentColor);

    // Accent
    rs.setProperty('--a',   t.accentColor);
    rs.setProperty('--a-r', rgb.r); rs.setProperty('--a-g', rgb.g); rs.setProperty('--a-b', rgb.b);
    rs.setProperty('--a10', `rgba(${rgb.r},${rgb.g},${rgb.b},.10)`);
    rs.setProperty('--a20', `rgba(${rgb.r},${rgb.g},${rgb.b},.20)`);
    rs.setProperty('--a40', `rgba(${rgb.r},${rgb.g},${rgb.b},.40)`);
    rs.setProperty('--a60', `rgba(${rgb.r},${rgb.g},${rgb.b},.60)`);
    // Surfaces from palette
    rs.setProperty('--bg',    pal.bg);
    rs.setProperty('--surf',  pal.surf);
    rs.setProperty('--surf2', pal.surf2);
    rs.setProperty('--card',  pal.card);
    rs.setProperty('--card2', pal.card2);
    rs.setProperty('--bdr',   pal.bdr);
    rs.setProperty('--bdr2',  pal.bdr2);
    // Font
    rs.setProperty('--font', `'${t.fontFamily}',sans-serif`);
    document.body.style.fontFamily = `'${t.fontFamily}',sans-serif`;
    // Font size
    const fz = t.fontSize;
    rs.setProperty('--fz',  `${fz}px`);
    rs.setProperty('--fzs', `${Math.round(fz*.79)}px`);
    rs.setProperty('--fzm', `${Math.round(fz*1.14)}px`);
    rs.setProperty('--fzl', `${Math.round(fz*1.36)}px`);
    rs.setProperty('--fzh', `${Math.round(fz*1.64)}px`);
  }

  /* ── 페이지 ─────────────────────────────── */
  function go(page) {
    if (page==='manage' && !DB.isLoggedIn()) { showLogin(); return; }
    S.page = page;
    document.querySelectorAll('.page').forEach(p=>p.classList.remove('on'));
    document.querySelectorAll('.bni').forEach(n=>n.classList.remove('on'));
    document.getElementById('page-'+page).classList.add('on');
    document.querySelector(`[data-pg="${page}"]`).classList.add('on');
    if (page==='operate') renderOperate();
    if (page==='manage')  renderManage();
  }

  /* ════════════════════════════════
     LOGIN
  ════════════════════════════════ */
  function showLogin() {
    document.getElementById('li-id').value='';
    document.getElementById('li-pw').value='';
    document.getElementById('li-err').textContent='';
    document.getElementById('login-gate').classList.remove('hidden');
    setTimeout(()=>document.getElementById('li-id').focus(),300);
  }
  function cancelLogin() { document.getElementById('login-gate').classList.add('hidden'); }
  function doLogin() {
    const id=document.getElementById('li-id').value.trim();
    const pw=document.getElementById('li-pw').value;
    const acc=DB.login(id,pw);
    if (acc) {
      document.getElementById('login-gate').classList.add('hidden');
      go('manage'); toast(`✅ ${acc.username} 로그인 완료`);
    } else {
      document.getElementById('li-err').textContent='⚠️ 아이디 또는 비밀번호가 올바르지 않습니다';
      document.getElementById('li-pw').value='';
    }
  }
  function logout() {
    if (!confirm('로그아웃 하시겠습니까?')) return;
    DB.clearSession(); go('operate'); toast('로그아웃 되었습니다');
  }

  /* ════════════════════════════════
     운용 PAGE
  ════════════════════════════════ */
  function renderOperate() {
    renderChips(); renderWeekNav(); renderDays();
  }

  function renderChips() {
    const classes=DB.getClasses(), wrap=document.getElementById('op-chips');
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
      b.onclick=()=>{ S.selCls=cls; renderOperate(); };
      wrap.appendChild(b);
    });
  }

  function renderWeekNav() {
    const fri=addDays(S.monday,4);
    document.getElementById('op-wknum').textContent=`${getWeekOfMonth(S.monday)}주차`;
    document.getElementById('op-wkmo').textContent=sameMonth(S.monday,fri)
      ?`${S.monday.getMonth()+1}월`
      :`${S.monday.getMonth()+1}~${fri.getMonth()+1}월`;
    const fmt=d=>`${d.getMonth()+1}/${d.getDate()}`;
    document.getElementById('op-range').textContent=`${fmt(S.monday)} – ${fmt(fri)}`;
  }

  function renderDays() {
    const wrap=document.getElementById('days-scroll');
    wrap.innerHTML='';
    const cls=S.selCls;
    if (!cls) { wrap.innerHTML='<div class="empty">반을 선택해주세요</div>'; return; }

    const weekKey =DB.toWeekKey(S.monday);
    const saved   =DB.getWeekProgress(cls.id, weekKey);
    const loggedIn=DB.isLoggedIn();
    const today   =new Date(); today.setHours(0,0,0,0);

    if (!(cls.days||[]).some(d=>DAYS.includes(d))) {
      wrap.innerHTML='<div class="empty">수업 요일이 설정되지 않았습니다.</div>'; return;
    }

    DAYS.forEach((dayName,i)=>{
      if (!(cls.days||[]).includes(dayName)) return;
      const date   =addDays(S.monday,i);
      const mk     =DB.monthKey(date);
      const books  =DB.getMonthBooks(cls.id,mk);
      const dc     =DC[dayName];
      const isToday=date.toDateString()===today.toDateString();
      const activeBooks=[
        ...(books.main||[]).filter(b=>b.active).map(b=>({...b,type:'main'})),
        ...(books.sub ||[]).filter(b=>b.active).map(b=>({...b,type:'sub'})),
      ];

      const card=document.createElement('div');
      card.className='day-card';

      const hdr=document.createElement('div');
      hdr.className='day-hdr';
      hdr.innerHTML=`
        <div class="day-stripe bg-${dc}"></div>
        <div class="day-info">
          <div class="day-name col-${dc}">${dayName}요일</div>
          <div class="day-date">${date.getMonth()+1}월 ${date.getDate()}일</div>
        </div>
        ${isToday?'<div class="today-pip">오늘</div>':''}
        <div class="garr">▾</div>`;
      hdr.addEventListener('click',()=>card.classList.toggle('coll'));
      card.appendChild(hdr);

      const body=document.createElement('div');
      body.className='day-body';

      if (!activeBooks.length) {
        body.innerHTML='<div class="no-bk">이 월에 활성화된 교재가 없습니다</div>';
      } else {
        const grid=document.createElement('div');
        grid.className='bk-grid'+(activeBooks.length===1?' one':'');
        activeBooks.forEach(({id,name,type})=>{
          const savedKey=`${dayName}__${id}`;
          const val=saved[savedKey]||'';
          const box=document.createElement('div');
          box.className='bk-box';
          box.innerHTML=`
            <div class="bk-top">
              <span class="bk-tag ${type}">${type==='main'?'주':'부'}</span>
              <span class="bk-nm" title="${esc(name)}">${esc(name)}</span>
            </div>
            <input class="bk-inp${val?' filled':''}"
              placeholder="진도 범위"
              value="${esc(val)}"
              data-cid="${cls.id}"
              data-wk="${weekKey}"
              data-day="${dayName}"
              data-bid="${id}"
              ${loggedIn?'':'readonly'}>`;
          grid.appendChild(box);
        });
        body.appendChild(grid);
      }
      card.appendChild(body);
      wrap.appendChild(card);
    });

    // 자동저장 (debounce)
    if (loggedIn) {
      wrap.querySelectorAll('.bk-inp').forEach(inp=>{
        inp.addEventListener('input',()=>{
          inp.classList.toggle('filled',inp.value.trim()!=='');
          // 저장 중 시각 피드백
          const box=inp.closest('.bk-box');
          box.classList.add('saving'); box.classList.remove('saved');
          // debounce 자동저장
          DB.autoSaveProgress(inp.dataset.cid,inp.dataset.wk,inp.dataset.day,inp.dataset.bid,inp.value.trim());
          clearTimeout(inp._saveTim);
          inp._saveTim=setTimeout(()=>{ box.classList.remove('saving'); box.classList.add('saved'); setTimeout(()=>box.classList.remove('saved'),1500); },900);
        });
      });
    }
  }

  function prevWeek() { S.monday=addDays(S.monday,-7); renderWeekNav(); renderDays(); }
  function nextWeek() { S.monday=addDays(S.monday, 7); renderWeekNav(); renderDays(); }

  /* ════════════════════════════════
     CALENDAR POPUP
  ════════════════════════════════ */
  function openCalendar() {
    S.calYear=S.monday.getFullYear(); S.calMonth=S.monday.getMonth();
    renderCal();
    document.getElementById('cal-ov').classList.remove('hidden');
  }
  function closeCal(e) {
    if (e && e.target!==document.getElementById('cal-ov')) return;
    document.getElementById('cal-ov').classList.add('hidden');
  }
  function calPrev() { if(S.calMonth===0){S.calYear--;S.calMonth=11;}else S.calMonth--; renderCal(); }
  function calNext() { if(S.calMonth===11){S.calYear++;S.calMonth=0;}else S.calMonth++; renderCal(); }
  function calToday(){ S.calYear=new Date().getFullYear();S.calMonth=new Date().getMonth(); renderCal(); }

  function renderCal() {
    const yr=S.calYear, mo=S.calMonth;
    document.getElementById('cal-title').textContent=`${yr}년 ${mo+1}월`;
    const grid=document.getElementById('cal-grid');
    grid.innerHTML='';

    const first=new Date(yr,mo,1);
    const last =new Date(yr,mo+1,0);
    const startDow=first.getDay(); // 0=Sun
    const today=new Date(); today.setHours(0,0,0,0);
    const selMon=getMonday(S.monday);

    // fill blanks
    for(let i=0;i<startDow;i++){
      const d=document.createElement('div');d.className='cal-day empty';grid.appendChild(d);
    }
    for(let day=1;day<=last.getDate();day++){
      const date=new Date(yr,mo,day); date.setHours(0,0,0,0);
      const dow=date.getDay();
      const mon=getMonday(date); // 이 날짜의 주 월요일
      const isInSelWeek=Math.abs(mon-selMon)<1000;
      const isMonOfWeek=dow===1;
      const isFriOfWeek=dow===5;
      const isWeekDay  =dow>=1&&dow<=5;

      const d=document.createElement('div');
      d.className='cal-day';
      if (date.getMonth()!==mo) d.classList.add('other-mo');
      if (date.toDateString()===today.toDateString()) d.classList.add('today');
      if (isInSelWeek&&isWeekDay) {
        if (isMonOfWeek) d.classList.add('week-start');
        else if (isFriOfWeek) d.classList.add('week-end');
        else d.classList.add('in-week');
      }
      d.innerHTML=`<span class="cal-day-n">${day}</span>`;
      d.onclick=()=>{
        S.monday=getMonday(date);
        renderWeekNav(); renderDays(); renderCal();
        // 선택 후 닫기
        setTimeout(()=>document.getElementById('cal-ov').classList.add('hidden'),300);
      };
      grid.appendChild(d);
    }
  }

  /* ════════════════════════════════
     관리 PAGE
  ════════════════════════════════ */
  function renderManage() {
    const sess=DB.getSession();
    document.getElementById('mg-sess').textContent=sess?`${sess.username} 로그인 중`:'로그인 필요';
    document.getElementById('mg-logout').style.display=sess?'':'none';
    document.getElementById('vt-l').classList.toggle('on',S.viewMode==='list');
    document.getElementById('vt-g').classList.toggle('on',S.viewMode==='grid');
    mgTab(S.mgTab);
  }

  function mgTab(tab) {
    S.mgTab=tab;
    const tabs=['classes','accounts','theme','io','share'];
    document.querySelectorAll('.mg-tab').forEach((t,i)=>t.classList.toggle('on',tabs[i]===tab));
    tabs.forEach(id=>document.getElementById('mg-'+id).classList.toggle('hidden',id!==tab));
    if(tab==='classes')  renderMgClasses();
    if(tab==='accounts') renderMgAccounts();
    if(tab==='theme')    renderMgTheme();
    if(tab==='io')       renderMgIO();
    if(tab==='share')    renderMgShare();
  }

  function setView(mode) {
    S.viewMode=mode;
    document.getElementById('vt-l').classList.toggle('on',mode==='list');
    document.getElementById('vt-g').classList.toggle('on',mode==='grid');
    const t=DB.getTheme(); t.viewMode=mode; DB.saveTheme(t);
    renderMgClasses();
  }

  /* ─── 반 관리 탭 ─────────────────────────── */
  function renderMgClasses() {
    const wrap=document.getElementById('mg-classes');
    wrap.innerHTML='';
    const loggedIn=DB.isLoggedIn();
    if (loggedIn) {
      const btn=document.createElement('button');
      btn.className='add-cls'; btn.innerHTML='<span style="font-size:20px">＋</span> 반 추가';
      btn.onclick=()=>openClassModal(); wrap.appendChild(btn);
    }
    const classes=DB.getClasses();
    if (!classes.length) { wrap.innerHTML+='<div class="empty">등록된 반이 없습니다.</div>'; return; }
    const cont=document.createElement('div');
    cont.className=S.viewMode==='grid'?'cls-grid':'cls-list';
    classes.forEach(cls=>cont.appendChild(buildClsCard(cls,loggedIn)));
    wrap.appendChild(cont);
  }

  function buildClsCard(cls, loggedIn) {
    const card=document.createElement('div'); card.className='cls-card';
    const mk=S.mgMk;
    const books=DB.getMonthBooks(cls.id,mk);
    const [mkY,mkM]=mk.split('-').map(Number);
    const dayBadges=(cls.days||[]).map(d=>`<span class="dbdg ${DC[d]}">${d}</span>`).join('');
    card.innerHTML=`
      <div class="cls-chdr">
        <div class="cls-chdr-l"><div class="cls-nm">${esc(cls.name)}</div><div class="dbadges">${dayBadges}</div></div>
        <div class="cls-chdr-r">
          ${loggedIn?`<button class="ibtn" onclick="App.openClassModal('${cls.id}')" title="수정">✏️</button>
          <button class="ibtn red" onclick="App.delClass('${cls.id}')" title="삭제">🗑</button>`:''}
        </div>
      </div>
      <div class="cls-mo-nav">
        <button onclick="App.mgPrev()">‹</button>
        <span class="cls-mo-lbl">📅 ${mkY}년 ${mkM}월</span>
        <button onclick="App.mgNext()">›</button>
      </div>`;

    // book sections
    const mgr=document.createElement('div'); mgr.className='bk-mgr';
    ['main','sub'].forEach(type=>{
      const lbl=document.createElement('div');
      lbl.className='bk-sl'; lbl.textContent=type==='main'?'📘 주교재':'📗 부교재';
      mgr.appendChild(lbl);
      const arr=books[type]||[];
      if (!arr.length) {
        const em=document.createElement('div');
        em.style.cssText='font-size:11px;color:var(--tx3);padding:2px 0 6px';
        em.textContent='교재 없음'; mgr.appendChild(em);
      }
      arr.forEach(b=>{
        const row=document.createElement('div'); row.className='bk-row';
        const tag=document.createElement('span'); tag.className=`bk-tag ${type}`; tag.textContent=type==='main'?'주':'부';
        row.appendChild(tag);
        if (b._new) { const nb=document.createElement('span'); nb.className='bk-new'; nb.textContent='NEW'; row.appendChild(nb); }
        if (loggedIn) {
          const ei=document.createElement('input');
          ei.className='bk-ei'+(b.active?'':' inactive');
          ei.value=b.name; ei.title='클릭하여 이름 변경';
          let orig=b.name;
          ei.addEventListener('focus',()=>{orig=ei.value;});
          ei.addEventListener('blur',async()=>{
            const n=ei.value.trim();
            if(n&&n!==orig){ await DB.updateBook(cls.id,mk,type,b.id,{name:n}); renderMgClasses(); renderDays(); toast('✏️ 교재명 변경됨'); }
            else if(!n) ei.value=orig;
          });
          ei.addEventListener('keydown',e=>{if(e.key==='Enter')ei.blur();});
          row.appendChild(ei);
          const actBtn=document.createElement('button'); actBtn.className='bk-act'; actBtn.title=b.active?'비활성화':'활성화';
          actBtn.textContent=b.active?'✅':'⬜';
          actBtn.onclick=async()=>{ await DB.updateBook(cls.id,mk,type,b.id,{active:!b.active}); renderMgClasses(); renderDays(); };
          row.appendChild(actBtn);
          const del=document.createElement('button'); del.className='bk-act del'; del.title='삭제'; del.textContent='✕';
          del.onclick=async()=>{
            if(!confirm(`"${b.name}" 삭제?`))return;
            await DB.deleteBook(cls.id,mk,type,b.id); renderMgClasses(); renderDays(); toast('🗑 삭제 완료');
          };
          row.appendChild(del);
        } else {
          const nm=document.createElement('span'); nm.className='bk-ei'+(b.active?'':' inactive'); nm.textContent=b.name; row.appendChild(nm);
        }
        mgr.appendChild(row);
      });
    });
    card.appendChild(mgr);

    if (loggedIn) {
      const addRow=document.createElement('div'); addRow.className='add-bk-row';
      addRow.innerHTML=`
        <select class="add-bk-sel" id="bksel-${cls.id}">
          <option value="main">주교재</option><option value="sub">부교재</option>
        </select>
        <input class="add-bk-inp" id="bkinp-${cls.id}" placeholder="교재명"
               onkeydown="if(event.key==='Enter')App.addBook('${cls.id}')">
        <button class="add-bk-btn" onclick="App.addBook('${cls.id}')">추가</button>`;
      card.appendChild(addRow);
    }
    return card;
  }

  async function addBook(clsId) {
    const inp=document.getElementById(`bkinp-${clsId}`);
    const sel=document.getElementById(`bksel-${clsId}`);
    const name=inp?.value.trim();
    if (!name){toast('⚠️ 교재명을 입력해주세요');inp?.focus();return;}
    await DB.addBook(clsId,S.mgMk,sel.value,name);
    inp.value=''; renderMgClasses(); renderDays(); toast('📚 교재 추가 완료');
  }

  function mgPrev(){ S.mgMk=DB.prevMonthKey(S.mgMk); renderMgClasses(); }
  function mgNext(){ S.mgMk=DB.nextMonthKey(S.mgMk); renderMgClasses(); }

  function openClassModal(id=null){
    S.editClsId=id; const cls=id?DB.getClassById(id):null;
    document.getElementById('mcls-title').textContent=id?'반 수정':'반 추가';
    document.getElementById('f-cname').value=cls?.name||'';
    document.querySelectorAll('#modal-cls .day-ck input').forEach(cb=>{cb.checked=cls?(cls.days||[]).includes(cb.value):false;});
    document.getElementById('modal-cls').classList.remove('hidden');
  }
  async function saveClass(){
    const name=document.getElementById('f-cname').value.trim();
    if(!name){toast('⚠️ 반 이름을 입력해주세요');return;}
    const days=[...document.querySelectorAll('#modal-cls .day-ck input:checked')].map(c=>c.value);
    if(!days.length){toast('⚠️ 요일을 선택해주세요');return;}
    if(S.editClsId){ await DB.updateClass(S.editClsId,{name,days}); if(S.selCls?.id===S.editClsId)S.selCls=DB.getClassById(S.editClsId); toast('✅ 반 수정 완료'); }
    else { S.selCls=await DB.addClass({name,days}); toast('✅ 반 추가 완료'); }
    closeModal('cls'); renderMgClasses(); renderChips();
  }
  async function delClass(id){
    const cls=DB.getClassById(id);
    if(!confirm(`"${cls?.name}" 반을 삭제하시겠습니까?\n모든 진도 데이터도 삭제됩니다.`))return;
    await DB.deleteClass(id); if(S.selCls?.id===id)S.selCls=null;
    renderMgClasses(); renderChips(); toast('🗑 삭제 완료');
  }

  /* ─── 계정 탭 ────────────────────────────── */
  function renderMgAccounts(){
    const wrap=document.getElementById('mg-accounts'); wrap.innerHTML='';
    const loggedIn=DB.isLoggedIn(), sess=DB.getSession();
    if(loggedIn){const b=document.createElement('button');b.className='add-cls';b.style.marginBottom='6px';b.innerHTML='<span>＋</span> 계정 추가';b.onclick=()=>openAccModal();wrap.appendChild(b);}
    const card=document.createElement('div');card.className='acc-card';
    DB.getAccounts().forEach(acc=>{
      const isMe=sess?.id===acc.id, row=document.createElement('div');row.className='acc-row';
      row.innerHTML=`<div><div class="acc-nm">${esc(acc.username)}${isMe?'&nbsp;<span style="color:var(--green);font-size:10px">●</span>':''}</div><div class="acc-role">${acc.role||'admin'}</div></div>
        <div class="acc-acts">${loggedIn?`<button class="ibtn" onclick="App.openAccModal('${acc.id}')">✏️</button>`:''}${loggedIn&&!isMe?`<button class="ibtn red" onclick="App.delAcc('${acc.id}','${esc(acc.username)}')">🗑</button>`:''}</div>`;
      card.appendChild(row);
    }); wrap.appendChild(card);
  }
  function openAccModal(id=null){S.editAccId=id;const acc=id?DB.getAccounts().find(a=>a.id===id):null;document.getElementById('macc-title').textContent=id?'계정 수정':'계정 추가';document.getElementById('f-aid').value=acc?.username||'';document.getElementById('f-aid').readOnly=!!id;document.getElementById('f-apw').value='';document.getElementById('modal-acc').classList.remove('hidden');}
  async function saveAccount(){const u=document.getElementById('f-aid').value.trim(),p=document.getElementById('f-apw').value;if(!u){toast('⚠️ 아이디를 입력해주세요');return;}if(!S.editAccId&&!p){toast('⚠️ 비밀번호를 입력해주세요');return;}if(S.editAccId){if(p)await DB.updateAccount(S.editAccId,{password:p});toast('✅ 계정 수정 완료');}else{if(!await DB.addAccount(u,p)){toast('⚠️ 이미 존재하는 아이디');return;}toast('✅ 계정 추가 완료');}closeModal('acc');renderMgAccounts();}
  async function delAcc(id,u){if(DB.getSession()?.id===id){toast('⚠️ 현재 계정은 삭제 불가');return;}if(!confirm(`"${u}" 계정을 삭제하시겠습니까?`))return;await DB.deleteAccount(id);renderMgAccounts();toast('🗑 계정 삭제 완료');}

  /* ─── 테마 탭 ────────────────────────────── */
  function renderMgTheme(){
    const wrap=document.getElementById('mg-theme');wrap.innerHTML='';
    const t=DB.getTheme(); S.tmpTheme={...t};
    const loggedIn=DB.isLoggedIn();
    const card=document.createElement('div');card.className='th-card';

    // preview bar
    const prev=document.createElement('div');prev.className='theme-row';
    prev.innerHTML='<div class="th-preview" id="th-prev"></div>';
    card.appendChild(prev);
    updatePreviewBar(t.accentColor);

    // ① 팔레트
    const pr=document.createElement('div');pr.className='th-row';
    pr.innerHTML='<div class="th-lbl">🎨 컬러 팔레트</div>';
    const swWrap=document.createElement('div');swWrap.className='sw-row';
    PALETTES.forEach(pal=>{
      const sw=document.createElement('button');
      sw.className='sw'+(pal.accent===t.accentColor?' on':'');
      sw.style.background=pal.accent; sw.title=pal.name;
      sw.innerHTML=pal.accent===t.accentColor?'✓':'';
      sw.disabled=!loggedIn;
      sw.onclick=()=>{
        S.tmpTheme.accentColor=pal.accent;
        applyTheme(S.tmpTheme,true); // 즉각 반영
        updatePreviewBar(pal.accent);
        swWrap.querySelectorAll('.sw').forEach((s,i)=>{s.classList.toggle('on',PALETTES[i].accent===pal.accent);s.innerHTML=PALETTES[i].accent===pal.accent?'✓':'';});
      };
      swWrap.appendChild(sw);
    });
    pr.appendChild(swWrap); card.appendChild(pr);

    // ② 폰트
    const fr=document.createElement('div');fr.className='th-row';
    fr.innerHTML='<div class="th-lbl">🔤 폰트</div>';
    const ffList=document.createElement('div');ffList.className='ff-list';
    FONTS.forEach(f=>{
      const item=document.createElement('div');item.className='ff-item'+(f.key===t.fontFamily?' on':'');
      item.style.fontFamily=`'${f.key}',sans-serif`;
      item.innerHTML=`<span class="ff-name">${f.label}</span><span class="ff-sample">${f.sample}</span>`;
      if(!loggedIn){item.style.pointerEvents='none';item.style.opacity='.45';}
      item.onclick=()=>{
        S.tmpTheme.fontFamily=f.key; applyTheme(S.tmpTheme,true);
        ffList.querySelectorAll('.ff-item').forEach((el,i)=>el.classList.toggle('on',FONTS[i].key===f.key));
      };
      ffList.appendChild(item);
    });
    fr.appendChild(ffList); card.appendChild(fr);

    // ③ 글자 크기
    const szr=document.createElement('div');szr.className='th-row';
    szr.innerHTML='<div class="th-lbl">📐 글자 크기</div>';
    const szWrap=document.createElement('div');szWrap.className='fz-wrap';
    const sl=document.createElement('input');sl.type='range';sl.className='fz-sl';sl.min=11;sl.max=20;sl.step=1;sl.value=t.fontSize;sl.disabled=!loggedIn;
    const fzv=document.createElement('div');fzv.className='fz-val';fzv.textContent=`${t.fontSize}px`;
    sl.addEventListener('input',()=>{S.tmpTheme.fontSize=+sl.value;fzv.textContent=`${sl.value}px`;applyTheme(S.tmpTheme,true);});
    szWrap.appendChild(sl);szWrap.appendChild(fzv);szr.appendChild(szWrap);card.appendChild(szr);

    // ④ 저장 버튼
    if(loggedIn){
      const sr=document.createElement('div');sr.className='th-row';
      const sb=document.createElement('button');sb.className='th-save-btn';sb.textContent='💾 테마 저장';
      sb.onclick=async()=>{await DB.saveTheme(S.tmpTheme);applyTheme(S.tmpTheme);toast('🎨 테마 저장 완료!');renderMgTheme();};
      sr.appendChild(sb);card.appendChild(sr);
    } else {
      const nr=document.createElement('div');nr.className='th-row';nr.innerHTML='<div style="font-size:11px;color:var(--tx3)">⚠️ 테마 변경은 로그인 후 가능합니다</div>';card.appendChild(nr);
    }
    wrap.appendChild(card);
  }

  function updatePreviewBar(color) {
    const el=document.getElementById('th-prev');
    if(el) el.style.background=`linear-gradient(90deg,${color},#8b5cf6,#06b6d4)`;
  }

  /* ─── 내보내기/불러오기 탭 ───────────────── */
  function renderMgIO(){
    const wrap=document.getElementById('mg-io');wrap.innerHTML='';
    const loggedIn=DB.isLoggedIn();
    const card=document.createElement('div');card.className='io-card';

    // Export
    const exRow=document.createElement('div');exRow.className='io-row';
    exRow.innerHTML=`<div class="io-info"><div class="io-title">📤 엑셀로 내보내기</div><div class="io-desc">전체 데이터를 .xlsx 파일로 저장</div></div>`;
    const exBtn=document.createElement('button');exBtn.className='io-btn ex';exBtn.textContent='내보내기';
    exBtn.disabled=!loggedIn;if(!loggedIn)exBtn.style.opacity='.4';
    exBtn.onclick=exportToExcel;exRow.appendChild(exBtn);card.appendChild(exRow);

    // Import
    const imRow=document.createElement('div');imRow.className='io-row';
    imRow.innerHTML=`<div class="io-info"><div class="io-title">📥 엑셀에서 불러오기</div><div class="io-desc">백업 파일에서 데이터 복원 (중복 덮어쓰기)</div></div>`;
    const imBtn=document.createElement('button');imBtn.className='io-btn im';imBtn.textContent='불러오기';
    imBtn.disabled=!loggedIn;if(!loggedIn)imBtn.style.opacity='.4';
    imBtn.onclick=()=>document.getElementById('excel-import-input').click();imRow.appendChild(imBtn);card.appendChild(imRow);

    wrap.appendChild(card);
    if(!loggedIn){const note=document.createElement('div');note.className='empty';note.textContent='⚠️ 내보내기/불러오기는 로그인 후 사용 가능합니다';wrap.appendChild(note);}
  }

  function exportToExcel(){
    const data=DB.exportAll();
    const wb=XLSX.utils.book_new();

    // Sheet1: 반 목록
    const clsRows=[];
    data.classes.forEach(cls=>{
      const mk=DB.monthKey(new Date());
      const bks=cls.monthBooks?.[mk]||{main:[],sub:[]};
      clsRows.push({ 반:cls.name, 요일:(cls.days||[]).join(','), 주교재:(bks.main||[]).map(b=>b.name+(b.active?'':'(비활성)')).join('/'), 부교재:(bks.sub||[]).map(b=>b.name+(b.active?'':'(비활성)')).join('/') });
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(clsRows), '반목록');

    // Sheet2: 진도 데이터
    const progRows=[];
    Object.entries(data.progress||{}).forEach(([k,v])=>{
      const parts=k.split('__');
      if(parts.length>=4){
        const [clsId,wk,day,bkId]=parts;
        const cls=data.classes.find(c=>c.id===clsId);
        progRows.push({반:cls?.name||clsId,주차:wk,요일:day,교재ID:bkId,진도:v});
      }
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(progRows), '진도데이터');

    // Sheet3: 전체 JSON (불러오기용)
    const jsonSheet=XLSX.utils.json_to_sheet([{data:JSON.stringify({classes:data.classes,progress:data.progress,theme:data.theme})}]);
    XLSX.utils.book_append_sheet(wb, jsonSheet, '_raw');

    const now=new Date();
    const fname=`진도관리_${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}.xlsx`;
    XLSX.writeFile(wb,fname);
    toast('📤 엑셀 저장 완료: '+fname);
  }

  async function handleImport(input){
    const file=input.files[0]; if(!file)return;
    input.value='';
    const reader=new FileReader();
    reader.onload=async(e)=>{
      try{
        const wb=XLSX.read(e.target.result,{type:'array'});
        const rawSheet=wb.Sheets['_raw'];
        if(!rawSheet){toast('⚠️ 올바른 백업 파일이 아닙니다');return;}
        const rows=XLSX.utils.sheet_to_json(rawSheet);
        if(!rows[0]?.data){toast('⚠️ 데이터를 찾을 수 없습니다');return;}
        const data=JSON.parse(rows[0].data);
        // NEW 표시
        const existingIds=DB.getClasses().map(c=>c.id);
        (data.classes||[]).forEach(c=>{ if(!existingIds.includes(c.id)) c._new=true; });
        const result=await DB.importData(data);
        renderMgClasses(); renderChips(); renderDays();
        const msg=`📥 불러오기 완료\n✅ 추가: ${result.added.join(', ')||'없음'}\n🔄 업데이트: ${result.updated.join(', ')||'없음'}`;
        const div=document.createElement('div');div.className='import-result';
        div.innerHTML=`<div class="ir-added">✅ 추가: ${result.added.join(', ')||'없음'}</div><div class="ir-updated">🔄 업데이트: ${result.updated.join(', ')||'없음'}</div>`;
        document.getElementById('mg-io').appendChild(div);
        toast('📥 불러오기 완료');
      }catch(err){console.error(err);toast('⚠️ 파일 처리 오류: '+err.message);}
    };
    reader.readAsArrayBuffer(file);
  }

  /* ─── 공유 탭 ────────────────────────────── */
  function renderMgShare(){
    const wrap=document.getElementById('mg-share');wrap.innerHTML='';
    const loggedIn=DB.isLoggedIn();
    const note=document.createElement('div');
    note.style.cssText='font-size:11px;color:var(--tx2);margin-bottom:10px;line-height:1.6';
    note.textContent='반을 선택하면 해당 반의 이번 주 진도 현황 링크가 생성됩니다. 링크로 접속하면 읽기 전용으로 확인 가능합니다.';
    wrap.appendChild(note);

    const card=document.createElement('div');card.className='share-card';
    DB.getClasses().forEach(cls=>{
      const row=document.createElement('div');row.className='share-cls-row';
      const shareUrl=makeShareUrl(cls.id, DB.toWeekKey(S.monday));
      row.innerHTML=`<div class="share-cls-name">${esc(cls.name)}</div>
        <div class="share-btns">
          <button class="share-btn copy" onclick="App.copyShare('${esc(shareUrl)}')">🔗 복사</button>
          <button class="share-btn sms"  onclick="App.sendSms('${esc(shareUrl)}','${esc(cls.name)}')">💬 문자</button>
          <button class="share-btn kakao" onclick="App.shareKakao('${esc(shareUrl)}','${esc(cls.name)}')">💬카카오</button>
        </div>`;
      card.appendChild(row);
    });
    if(!DB.getClasses().length) card.innerHTML='<div class="empty">등록된 반이 없습니다</div>';
    wrap.appendChild(card);
  }

  function makeShareUrl(classId, weekKey) {
    const base=location.origin+location.pathname;
    return `${base}?share=${classId}&wk=${weekKey}`;
  }
  function copyShare(url){ navigator.clipboard.writeText(url).then(()=>toast('🔗 링크 복사 완료')).catch(()=>{ prompt('아래 링크를 복사하세요:',url); }); }
  function sendSms(url,name){ location.href=`sms:?body=${encodeURIComponent(`[학원 진도 현황] ${name}반\n${url}`)}`; }
  function shareKakao(url,name){
    if(window.Kakao?.isInitialized?.()){ window.Kakao.Share.sendDefault({objectType:'feed',content:{title:`${name}반 진도 현황`,description:'이번 주 수업 진도를 확인하세요',imageUrl:'',link:{mobileWebUrl:url,webUrl:url}},buttons:[{title:'진도 확인',link:{mobileWebUrl:url,webUrl:url}}]}); }
    else { copyShare(url); toast('카카오 SDK 미설정 — 링크를 복사하여 공유하세요'); }
  }

  /* ─── 공유 뷰 (읽기 전용) ────────────────── */
  async function initShareView(classId) {
    await DB.init();
    const wkParam=new URLSearchParams(location.search).get('wk');
    const monday=wkParam?weekKeyToMonday(wkParam):getMonday(new Date());
    const view=document.getElementById('share-view');
    view.classList.add('on');
    document.title='진도 현황 (읽기 전용)';
    applyTheme(DB.getTheme());

    // 데이터 로드 후 렌더
    setTimeout(()=>renderShareView(classId,monday),800);
    DB.onChange('progress',()=>renderShareView(classId,monday));
  }

  function renderShareView(classId,monday){
    const view=document.getElementById('share-view'); view.innerHTML='';
    const cls=DB.getClassById(classId);
    if(!cls){view.innerHTML='<div class="empty">반 정보를 찾을 수 없습니다</div>';return;}
    const weekKey=DB.toWeekKey(monday);
    const saved=DB.getWeekProgress(cls.id,weekKey);
    const fri=addDays(monday,4);
    const fmt=d=>`${d.getMonth()+1}월 ${d.getDate()}일`;

    const hdr=document.createElement('div');hdr.className='sv-header';
    hdr.innerHTML=`<div class="sv-title">📚 ${esc(cls.name)}반 진도 현황</div>
      <div class="sv-sub">${fmt(monday)} – ${fmt(fri)}</div>
      <div class="sv-badge">🔒 읽기 전용</div>`;
    view.appendChild(hdr);

    const body=document.createElement('div');body.className='sv-body';
    DAYS.forEach((dayName,i)=>{
      if(!(cls.days||[]).includes(dayName))return;
      const date=addDays(monday,i);
      const mk=DB.monthKey(date);
      const books=DB.getMonthBooks(cls.id,mk);
      const dc=DC[dayName];
      const activeBooks=[...(books.main||[]).filter(b=>b.active).map(b=>({...b,type:'main'})),...(books.sub||[]).filter(b=>b.active).map(b=>({...b,type:'sub'}))];
      const card=document.createElement('div');card.className='sv-day-card';
      card.innerHTML=`<div class="sv-day-hdr">
        <div class="day-stripe bg-${dc}" style="width:4px;height:30px;border-radius:3px;flex-shrink:0"></div>
        <div><div class="day-name col-${dc}">${dayName}요일</div><div style="font-size:11px;color:var(--tx2)">${date.getMonth()+1}월 ${date.getDate()}일</div></div>
      </div>`;
      if(activeBooks.length){
        const grid=document.createElement('div');grid.className='sv-bk-grid';
        activeBooks.forEach(({id,name,type})=>{
          const k=`${dayName}__${id}`;const val=saved[k]||'';
          const box=document.createElement('div');box.className='sv-bk-box';
          box.innerHTML=`<div class="bk-top"><span class="bk-tag ${type}">${type==='main'?'주':'부'}</span><span class="bk-nm">${esc(name)}</span></div>
            <div class="sv-bk-range ${val?'':'sv-bk-empty'}">${val||'미입력'}</div>`;
          grid.appendChild(box);
        });
        card.appendChild(grid);
      }
      body.appendChild(card);
    });
    view.appendChild(body);
  }

  function weekKeyToMonday(wk){
    const [y,w]=wk.split('-W').map(Number);
    const jan4=new Date(y,0,4);
    const mon=new Date(jan4);
    mon.setDate(jan4.getDate()-((jan4.getDay()+6)%7)+(w-1)*7);
    return mon;
  }

  /* ── Modal ───────────────────────────────── */
  function closeModal(w){document.getElementById('modal-'+w).classList.add('hidden');}

  /* ── 유틸 ───────────────────────────────── */
  function getMonday(d){const r=new Date(d);r.setHours(0,0,0,0);const day=r.getDay();r.setDate(r.getDate()+(day===0?-6:1-day));return r;}
  function addDays(d,n){const r=new Date(d);r.setDate(r.getDate()+n);return r;}
  function sameMonth(a,b){return a.getMonth()===b.getMonth()&&a.getFullYear()===b.getFullYear();}
  function getWeekOfMonth(mon){const first=new Date(mon.getFullYear(),mon.getMonth(),1);return Math.round((mon-getMonday(first))/(7*86400000))+1;}
  function esc(s){return(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
  function hexRgb(h){const m=/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(h);return m?{r:parseInt(m[1],16),g:parseInt(m[2],16),b:parseInt(m[3],16)}:{r:99,g:102,b:241};}

  // CSS day color helpers (set dynamically)
  document.head.insertAdjacentHTML('beforeend',`<style>
    .bg-mon{background:var(--d-mon)}.bg-tue{background:var(--d-tue)}.bg-wed{background:var(--d-wed)}.bg-thu{background:var(--d-thu)}.bg-fri{background:var(--d-fri)}
    .col-mon{color:var(--d-mon)}.col-tue{color:var(--d-tue)}.col-wed{color:var(--d-wed)}.col-thu{color:var(--d-thu)}.col-fri{color:var(--d-fri)}
  </style>`);

  let _tt;
  function toast(msg,dur=2400){const el=document.getElementById('toast');el.textContent=msg;el.classList.remove('hidden');clearTimeout(_tt);_tt=setTimeout(()=>el.classList.add('hidden'),dur);}

  return {
    init,go,mgTab,setView,
    showLogin,cancelLogin,doLogin,logout,
    prevWeek,nextWeek,
    openCalendar,closeCal,calPrev,calNext,calToday,
    openClassModal,saveClass,delClass,
    addBook,mgPrev,mgNext,
    openAccModal,saveAccount,delAcc,
    exportToExcel,handleImport,
    copyShare,sendSms,shareKakao,
    closeModal,
  };
})();

document.addEventListener('DOMContentLoaded',App.init);
