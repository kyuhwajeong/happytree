/**
 * monitor-app.js — v2.0
 *
 * 해피트리 영어학원 — 히든 실시간 모니터링 대시보드
 *
 * ■ 진입 조건
 *   username=admin + password=master → MonitorApp.show()
 *   (일반 admin 로그인과 완전히 분리)
 *
 * ■ 화면 구성
 *   ┌──────────────────────────────────────────────────────┐
 *   │ 헤더 : 접속중 N | 오늘 N | 48h 총 N         [닫기]  │
 *   ├─────────────────────┬────────────────────────────────┤
 *   │ 세션 카드 목록       │ 선택 세션 상세 타임라인        │
 *   │ (온라인 먼저, 클릭) │ (실시간 액션 로그, 최신순)     │
 *   ├─────────────────────┴────────────────────────────────┤
 *   │ 상태바 : 시계 · Firebase · 정책                      │
 *   └──────────────────────────────────────────────────────┘
 *
 * ■ 의존
 *   monitor-db.js (MonitorDB)  firebase-config.js (FireDB)
 */
const MonitorApp = (() => {

  /* ══ 레이블 맵 ═══════════════════════════════════════ */
  const MENU = {
    operate:'📅 진도', manage:'⚙️ 관리', booklib:'📖 교재',
    grade:'📝 성적', students:'👨‍🎓 학생', staff:'👩‍💼 직원',
  };
  const ROLE = { admin:'관리자', manager:'매니저', operator:'운용자', teacher:'강사' };
  const ROLE_COLOR = {
    admin:'#ef4444', manager:'#f97316', operator:'#3b82f6', teacher:'#10b981',
  };
  const TYPE_ICON = { nav:'🗂', action:'🖱', login:'🔑', logout:'🚪' };

  /* ══ 상태 ═════════════════════════════════════════════ */
  let _unlisten  = null;
  let _sessions  = [];
  let _selId     = null;
  let _clkTimer  = null;

  /* ══════════════════════════════════════════════════════
   * CSS 자동 주입
   * ══════════════════════════════════════════════════════ */
  function _css() {
    if (document.getElementById('mon-css')) return;
    const s = document.createElement('style');
    s.id = 'mon-css';
    s.textContent = `
/* ── Monitor Overlay ── */
#mon-ov{position:fixed;inset:0;z-index:99999;background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);display:flex;flex-direction:column;font-family:'Noto Sans KR',sans-serif;color:#e2e8f0;overflow:hidden;}
#mon-ov.hidden{display:none;}

/* ── Header ── */
.mon-hdr{display:flex;align-items:center;gap:10px;padding:13px 16px 11px;background:rgba(255,255,255,.04);border-bottom:1px solid rgba(255,255,255,.07);flex-shrink:0;}
.mon-logo{font-size:15px;font-weight:900;color:#38bdf8;white-space:nowrap;}
.mon-hsub{font-size:11px;color:#475569;white-space:nowrap;}
.mon-stats{display:flex;gap:5px;margin-left:auto;}
.mon-stat{display:flex;flex-direction:column;align-items:center;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.09);border-radius:9px;padding:5px 11px;min-width:50px;}
.mon-sv{font-size:18px;font-weight:900;line-height:1;}
.mon-sl{font-size:10px;color:#64748b;margin-top:2px;white-space:nowrap;}
.sv-g{color:#4ade80;}.sv-o{color:#fb923c;}.sv-b{color:#38bdf8;}
.mon-xbtn{background:rgba(239,68,68,.15);border:1px solid rgba(239,68,68,.3);color:#ef4444;border-radius:8px;padding:6px 13px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap;transition:background .2s;}
.mon-xbtn:hover{background:rgba(239,68,68,.3);}

/* ── Body ── */
.mon-body{display:flex;flex:1;overflow:hidden;}

/* ── 세션 목록 ── */
.mon-list{width:310px;flex-shrink:0;overflow-y:auto;padding:10px 7px;border-right:1px solid rgba(255,255,255,.06);scrollbar-width:thin;scrollbar-color:#334155 transparent;}
.mon-list::-webkit-scrollbar{width:3px;}.mon-list::-webkit-scrollbar-thumb{background:#334155;border-radius:3px;}
.mon-ltitle{font-size:10px;color:#475569;font-weight:700;letter-spacing:.5px;padding:0 5px 7px;text-transform:uppercase;}
.mon-empty{color:#475569;font-size:12px;text-align:center;padding:40px 16px;}

/* ── 세션 카드 ── */
.mon-card{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);border-radius:11px;padding:10px 12px;margin-bottom:7px;cursor:pointer;transition:background .15s,transform .1s;position:relative;}
.mon-card:hover{background:rgba(255,255,255,.08);transform:translateX(2px);}
.mon-card.sel{background:rgba(56,189,248,.08);border-color:rgba(56,189,248,.3);}
.mon-card.on-line{border-left:3px solid #4ade80;}
.mon-card.off-line{border-left:3px solid #334155;opacity:.72;}
.mon-ctop{display:flex;justify-content:space-between;align-items:flex-start;gap:6px;}
.mon-cleft{display:flex;align-items:center;gap:8px;}
.mon-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;}
.mon-dot.on{background:#4ade80;box-shadow:0 0 5px #4ade80;animation:mon-pulse 2s infinite;}
.mon-dot.off{background:#475569;}
@keyframes mon-pulse{0%,100%{opacity:1;}50%{opacity:.3;}}
.mon-uname{font-size:13px;font-weight:700;color:#e2e8f0;display:flex;align-items:center;gap:5px;flex-wrap:wrap;}
.mon-rbdg{font-size:9px;font-weight:600;border-radius:3px;padding:1px 4px;}
.mon-ip{font-size:10px;color:#64748b;margin-top:2px;}
.mon-cright{text-align:right;flex-shrink:0;}
.mon-mbdg{font-size:10px;background:rgba(56,189,248,.15);color:#38bdf8;border-radius:5px;padding:2px 7px;font-weight:600;white-space:nowrap;}
.mon-dur{font-size:10px;color:#64748b;margin-top:3px;}
.mon-chips{display:flex;flex-wrap:wrap;gap:3px;margin-top:6px;}
.mon-chip{font-size:9px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1);border-radius:3px;padding:1px 5px;color:#94a3b8;}
.mon-cbot{display:flex;justify-content:space-between;align-items:center;margin-top:6px;padding-top:6px;border-top:1px solid rgba(255,255,255,.05);font-size:10px;color:#64748b;}
.mon-ltag{font-size:9px;background:rgba(239,68,68,.15);color:#ef4444;border-radius:3px;padding:1px 5px;}
.mon-last{font-size:10px;color:#475569;max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}

/* ── 상세 패널 ── */
.mon-detail{flex:1;overflow-y:auto;padding:14px 18px;scrollbar-width:thin;scrollbar-color:#334155 transparent;}
.mon-detail::-webkit-scrollbar{width:3px;}.mon-detail::-webkit-scrollbar-thumb{background:#334155;border-radius:3px;}
.mon-dhint{color:#475569;font-size:12px;text-align:center;margin-top:60px;}
.mon-dhdr{padding-bottom:12px;border-bottom:1px solid rgba(255,255,255,.06);margin-bottom:12px;}
.mon-dtitle{font-size:15px;font-weight:800;color:#e2e8f0;display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:5px;}
.mon-dmeta{font-size:11px;color:#64748b;display:flex;flex-wrap:wrap;gap:10px;}
.mon-dmeta span{display:flex;align-items:center;gap:3px;}

/* ── 타임라인 ── */
.mon-tl-sep{font-size:10px;color:#475569;font-weight:700;text-align:center;padding:8px 0 4px;letter-spacing:.3px;}
.mon-tl-item{display:flex;gap:7px;align-items:flex-start;padding:6px 8px;border-radius:7px;margin-bottom:3px;}
.mon-tl-item:hover{background:rgba(255,255,255,.04);}
.mon-tl-t{font-size:10px;color:#475569;white-space:nowrap;min-width:50px;padding-top:1px;font-family:monospace;}
.mon-tl-ico{font-size:12px;flex-shrink:0;}
.mon-tl-body{flex:1;min-width:0;}
.mon-tl-menu{font-size:11px;color:#38bdf8;font-weight:600;}
.mon-tl-det{font-size:11px;color:#94a3b8;margin-top:1px;word-break:break-all;}
.mon-tl-ext{font-size:10px;color:#64748b;margin-top:1px;font-style:italic;}

/* ── Footer ── */
.mon-ftr{display:flex;align-items:center;gap:10px;padding:7px 16px;background:rgba(0,0,0,.25);border-top:1px solid rgba(255,255,255,.06);font-size:10px;color:#475569;flex-shrink:0;flex-wrap:wrap;}
.mon-fdot{color:#334155;}

/* ── 반응형 ── */
@media(max-width:640px){
  .mon-list{width:100%;border-right:none;}
  .mon-body{flex-direction:column;}
  .mon-detail{display:none;}
  .mon-detail.show{display:block;}
  .mon-stats{display:none;}
}
    `;
    document.head.appendChild(s);
  }

  /* ══════════════════════════════════════════════════════
   * 공개 : 모니터 화면 진입
   * ══════════════════════════════════════════════════════ */
  function show() {
    _css();

    // 오버레이 생성 또는 재사용
    let el = document.getElementById('mon-ov');
    if (!el) {
      el = document.createElement('div');
      el.id = 'mon-ov';
      document.body.appendChild(el);
    }
    el.classList.remove('hidden');

    // 기존 앱 UI 숨기기
    document.getElementById('app')?.classList.add('hidden');
    document.getElementById('login-gate')?.classList.add('hidden');

    _render(el);
    _startListen();
    _startClock();
  }

  /* ══════════════════════════════════════════════════════
   * 공개 : 모니터 화면 닫기
   * ══════════════════════════════════════════════════════ */
  function hide() {
    document.getElementById('mon-ov')?.classList.add('hidden');
    document.getElementById('app')?.classList.remove('hidden');
    _stopListen();
    _stopClock();
  }

  /* ══════════════════════════════════════════════════════
   * 공개 : 세션 선택
   * ══════════════════════════════════════════════════════ */
  function selectSession(id) {
    _selId = id;
    _updateList();
    const s = _sessions.find(x => x.id === id);
    if (s) _renderDetail(s);
  }

  /* ══════════════════════════════════════════════════════
   * 초기 HTML 골격
   * ══════════════════════════════════════════════════════ */
  function _render(el) {
    el.innerHTML = `
      <div class="mon-hdr">
        <span class="mon-logo">🔍 실시간 모니터링</span>
        <span class="mon-hsub">해피트리 영어학원 · Admin 전용</span>
        <div class="mon-stats">
          <div class="mon-stat"><span class="mon-sv sv-g" id="mc-on">0</span><span class="mon-sl">접속 중</span></div>
          <div class="mon-stat"><span class="mon-sv sv-o" id="mc-today">0</span><span class="mon-sl">오늘</span></div>
          <div class="mon-stat"><span class="mon-sv sv-b" id="mc-total">0</span><span class="mon-sl">48h</span></div>
        </div>
        <button class="mon-xbtn" onclick="MonitorApp.hide()">✕ 닫기</button>
      </div>

      <div class="mon-body">
        <div class="mon-list" id="mon-list">
          <div class="mon-ltitle">세션 목록</div>
          <div class="mon-empty" id="mon-empty">Firebase 연결 중...</div>
        </div>
        <div class="mon-detail" id="mon-detail">
          <div class="mon-dhint">← 좌측 세션을 선택하면<br>상세 활동 로그를 표시합니다</div>
        </div>
      </div>

      <div class="mon-ftr">
        <span id="mon-clk"></span>
        <span class="mon-fdot">•</span>
        <span>데이터 보존: 48시간 자동 소멸</span>
        <span class="mon-fdot">•</span>
        <span id="mon-fb-st">${FireDB.ready()
          ? '<span style="color:#4ade80">● Firebase 연결됨</span>'
          : '<span style="color:#ef4444">● Firebase 오프라인</span>'}</span>
      </div>
    `;
  }

  /* ══════════════════════════════════════════════════════
   * 세션 목록 업데이트
   * ══════════════════════════════════════════════════════ */
  function _updateList() {
    const listEl  = document.getElementById('mon-list');
    const emptyEl = document.getElementById('mon-empty');
    if (!listEl) return;

    // 통계
    const now   = Date.now();
    const dayS  = new Date(); dayS.setHours(0,0,0,0);
    const cOn   = _sessions.filter(s => MonitorDB.isOnline(s)).length;
    const cTdy  = _sessions.filter(s => new Date(s.loginAt) >= dayS).length;
    _v('mc-on', cOn);
    _v('mc-today', cTdy);
    _v('mc-total', _sessions.length);

    // 카드 제거 후 재생성
    [...listEl.querySelectorAll('.mon-card')].forEach(c => c.remove());

    if (!_sessions.length) {
      if (emptyEl) { emptyEl.style.display=''; emptyEl.textContent='기록된 세션이 없습니다'; }
      return;
    }
    if (emptyEl) emptyEl.style.display = 'none';

    _sessions.forEach(s => {
      const card = document.createElement('div');
      const online = MonitorDB.isOnline(s);
      card.className = `mon-card ${online?'on-line':'off-line'}${_selId===s.id?' sel':''}`;
      card.onclick   = () => MonitorApp.selectSession(s.id);

      const acts      = _acts(s);
      const menuPct   = _menuPct(acts);
      const lastAct   = acts[acts.length-1];
      const dur       = _dur(s.loginAt, s.loggedOut || new Date().toISOString());
      const menuLbl   = MENU[s.currentMenu] || s.currentMenu || '';
      const roleLbl   = ROLE[s.role] || s.role;
      const roleClr   = ROLE_COLOR[s.role] || '#64748b';

      card.innerHTML = `
        <div class="mon-ctop">
          <div class="mon-cleft">
            <div class="mon-dot ${online?'on':'off'}"></div>
            <div>
              <div class="mon-uname">
                ${_e(s.username)}
                <span class="mon-rbdg" style="background:${roleClr}20;color:${roleClr}">${roleLbl}</span>
              </div>
              <div class="mon-ip">🌐 ${_e(s.ip)}</div>
              <div class="mon-ip">${_devoIco(s.ua)} ${_e(s.ua)}</div>
            </div>
          </div>
          <div class="mon-cright">
            <div class="mon-mbdg">${menuLbl}</div>
            <div class="mon-dur">⏱ ${dur}</div>
          </div>
        </div>
        ${menuPct.length ? `<div class="mon-chips">${menuPct.map(([m,p])=>`<span class="mon-chip">${MENU[m]||m} ${p}%</span>`).join('')}</div>` : ''}
        <div class="mon-cbot">
          <span>${_ts(s.loginAt)}</span>
          ${s.loggedOut ? '<span class="mon-ltag">로그아웃</span>' : ''}
          ${lastAct?.detail ? `<span class="mon-last" title="${_e(lastAct.detail)}">💬 ${_e(lastAct.detail)}</span>` : ''}
        </div>
      `;
      listEl.appendChild(card);
    });
  }

  /* ══════════════════════════════════════════════════════
   * 상세 패널 렌더
   * ══════════════════════════════════════════════════════ */
  function _renderDetail(s) {
    const el = document.getElementById('mon-detail');
    if (!el) return;

    const acts    = _acts(s).slice().reverse(); // 최신순
    const online  = MonitorDB.isOnline(s);
    const roleLbl = ROLE[s.role] || s.role;
    const roleClr = ROLE_COLOR[s.role] || '#64748b';
    const dur     = _dur(s.loginAt, s.loggedOut || new Date().toISOString());

    el.innerHTML = `
      <div class="mon-dhdr">
        <div class="mon-dtitle">
          ${_e(s.username)}
          <span class="mon-rbdg" style="background:${roleClr}20;color:${roleClr};font-size:11px">${roleLbl}</span>
          ${online
            ? '<span style="color:#4ade80;font-size:11px">● 접속 중</span>'
            : '<span style="color:#475569;font-size:11px">○ 오프라인</span>'}
        </div>
        <div class="mon-dmeta">
          <span>🌐 ${_e(s.ip)}</span>
          <span>${_devoIco(s.ua)} ${_e(s.ua)}</span>
          <span>⏱ ${dur}</span>
          <span>🔑 ${_ts(s.loginAt)}</span>
          ${s.loggedOut?`<span>🚪 ${_ts(s.loggedOut)}</span>`:''}
          <span>💬 액션 ${acts.length}건</span>
        </div>
      </div>
      <div id="mon-tl">
        ${acts.length
          ? acts.map(a => _tlItem(a)).join('')
          : '<div class="mon-dhint">기록된 활동이 없습니다</div>'}
      </div>
    `;
  }

  function _tlItem(a) {
    const ico  = TYPE_ICON[a.type] || '🖱';
    const menu = MENU[a.menu] || a.menu || '';
    return `
      <div class="mon-tl-item">
        <span class="mon-tl-t">${_shortT(a.t)}</span>
        <span class="mon-tl-ico">${ico}</span>
        <div class="mon-tl-body">
          <div class="mon-tl-menu">${menu}</div>
          ${a.detail ? `<div class="mon-tl-det">${_e(a.detail)}</div>` : ''}
          ${a.extra  ? `<div class="mon-tl-ext">${_e(a.extra)}</div>` : ''}
        </div>
      </div>`;
  }

  /* ══════════════════════════════════════════════════════
   * Firebase 실시간 리스닝
   * ══════════════════════════════════════════════════════ */
  function _startListen() {
    _stopListen();
    _unlisten = MonitorDB.listenSessions(list => {
      _sessions = list;
      _updateList();
      if (_selId) {
        const s = _sessions.find(x => x.id === _selId);
        if (s) _renderDetail(s);
      }
    });
  }

  function _stopListen() {
    if (_unlisten) { _unlisten(); _unlisten = null; }
  }

  /* ══════════════════════════════════════════════════════
   * 시계
   * ══════════════════════════════════════════════════════ */
  function _startClock() {
    _stopClock();
    const tick = () => {
      const el = document.getElementById('mon-clk');
      if (el) el.textContent = new Date().toLocaleString('ko-KR', {
        year:'numeric', month:'2-digit', day:'2-digit',
        hour:'2-digit', minute:'2-digit', second:'2-digit',
      });
    };
    tick();
    _clkTimer = setInterval(tick, 1000);
  }

  function _stopClock() { clearInterval(_clkTimer); _clkTimer = null; }

  /* ══════════════════════════════════════════════════════
   * 헬퍼
   * ══════════════════════════════════════════════════════ */
  function _acts(s) {
    if (!s.actions) return [];
    return Array.isArray(s.actions) ? s.actions : Object.values(s.actions);
  }

  function _menuPct(acts) {
    const cnt = {};
    acts.forEach(a => { if(a.menu) cnt[a.menu] = (cnt[a.menu]||0)+1; });
    const total = Object.values(cnt).reduce((s,v)=>s+v,0)||1;
    return Object.entries(cnt).sort((a,b)=>b[1]-a[1])
      .map(([m,c])=>[m, Math.round(c/total*100)]);
  }

  function _dur(start, end) {
    const s = Math.max(0, Math.floor((new Date(end)-new Date(start))/1000));
    const m = Math.floor(s/60), h = Math.floor(m/60);
    if (h>0) return `${h}시간 ${m%60}분`;
    if (m>0) return `${m}분`;
    return `${s}초`;
  }

  function _ts(iso) {
    if (!iso) return '-';
    return new Date(iso).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
  }

  function _shortT(iso) {
    if (!iso) return '-';
    return new Date(iso).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  }

  function _devoIco(ua) {
    if (!ua) return '🖥️';
    if (/iPhone|iPad/i.test(ua)) return '📱';
    if (/Android/i.test(ua))     return '📱';
    return '💻';
  }

  function _e(s) {
    return String(s||'')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function _v(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  /* ══ 공개 API ══ */
  return { show, hide, selectSession };
})();
