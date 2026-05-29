/**
 * monitor-app.js — v4.0
 *
 * ■ 신규 기능
 *   1. 브라우저 알림  — 새 세션 감지 시 OS 알림 (모니터링 창에서만)
 *   2. 이상 접속 플래그 — 심야/중복/과다액션 배지 자동 표시
 *   3. 통계 대시보드 탭 — 48h 집계: 총 접속/평균 사용시간/메뉴 점유율/사용자별 활동
 *   4. 메뉴 사용 히트맵 — 요일×시간대 2D 그리드 (0~24h, 일~토)
 *
 * ■ 정상 사용자에게는 아무 영향 없음
 *   - 알림은 admin/master 모니터링 창에서만 발생
 *   - 플래그·통계는 모니터링 대시보드 전용 UI
 *   - monitor-patch.js 추적 코드는 Firebase 쓰기만 수행 (화면 변화 없음)
 */
const MonitorApp = (() => {

  /* ═══ 레이블 맵 ═══════════════════════════════════════════ */
  const MENU = {
    operate:'📅 진도', manage:'⚙️ 관리', booklib:'📖 교재',
    grade:'📝 성적', students:'👨‍🎓 학생', staff:'👩‍💼 직원',
  };
  const ROLE = { admin:'관리자', manager:'매니저', operator:'운용자', teacher:'강사' };
  const ROLE_COLOR = {
    admin:'#ef4444', manager:'#f97316', operator:'#3b82f6', teacher:'#10b981',
  };
  const TYPE_ICON = { nav:'🗂', action:'🖱', login:'🔑', logout:'🚪' };
  const DAYS_KO   = ['일','월','화','수','목','금','토'];

  /* ═══ 상태 ════════════════════════════════════════════════ */
  let _unlisten    = null;
  let _sessions    = [];
  let _selId       = null;
  let _clkTimer    = null;
  let _rightTab    = 'detail';        // 'detail' | 'stats'
  let _notifiedIds = new Set();       // 이미 알림 보낸 세션 ID
  let _toastTimer  = null;

  /* ═══════════════════════════════════════════════════════════
   * CSS
   * ═══════════════════════════════════════════════════════════ */
  function _css() {
    if (document.getElementById('mon-css')) return;
    const s = document.createElement('style');
    s.id = 'mon-css';
    s.textContent = `
#mon-ov{position:fixed;inset:0;z-index:99999;background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);display:flex;flex-direction:column;font-family:'Noto Sans KR',sans-serif;color:#e2e8f0;overflow:hidden;}
#mon-ov.hidden{display:none;}

/* 헤더 */
.mon-hdr{display:flex;align-items:center;gap:10px;padding:13px 16px 11px;background:rgba(255,255,255,.04);border-bottom:1px solid rgba(255,255,255,.07);flex-shrink:0;flex-wrap:wrap;}
.mon-logo{font-size:15px;font-weight:900;color:#38bdf8;white-space:nowrap;}
.mon-hsub{font-size:11px;color:#475569;white-space:nowrap;}
.mon-stats{display:flex;gap:5px;margin-left:auto;}
.mon-stat{display:flex;flex-direction:column;align-items:center;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.09);border-radius:9px;padding:5px 11px;min-width:50px;}
.mon-sv{font-size:18px;font-weight:900;line-height:1;}
.mon-sl{font-size:10px;color:#64748b;margin-top:2px;white-space:nowrap;}
.sv-g{color:#4ade80;}.sv-o{color:#fb923c;}.sv-b{color:#38bdf8;}
.mon-hdr-btns{display:flex;gap:6px;align-items:center;}
.mon-btn{border-radius:8px;padding:6px 12px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap;border:1px solid;transition:background .15s;}
.mon-btn.sky  {background:rgba(56,189,248,.15);border-color:rgba(56,189,248,.3);color:#38bdf8;}
.mon-btn.sky:hover{background:rgba(56,189,248,.28);}
.mon-btn.amber{background:rgba(251,146,60,.15);border-color:rgba(251,146,60,.3);color:#fb923c;}
.mon-btn.amber:hover{background:rgba(251,146,60,.28);}
.mon-btn.red  {background:rgba(239,68,68,.15);border-color:rgba(239,68,68,.3);color:#ef4444;}
.mon-btn.red:hover{background:rgba(239,68,68,.28);}
.mon-btn.close{background:rgba(100,116,139,.15);border-color:rgba(100,116,139,.3);color:#94a3b8;}
.mon-btn.close:hover{background:rgba(100,116,139,.28);}
.mon-notif-toggle{font-size:11px;color:#64748b;display:flex;align-items:center;gap:4px;cursor:pointer;white-space:nowrap;}
.mon-notif-toggle.on{color:#4ade80;}

/* 바디 */
.mon-body{display:flex;flex:1;overflow:hidden;}

/* 세션 목록 */
.mon-list{width:310px;flex-shrink:0;overflow-y:auto;padding:10px 7px;border-right:1px solid rgba(255,255,255,.06);scrollbar-width:thin;scrollbar-color:#334155 transparent;}
.mon-list::-webkit-scrollbar{width:3px;}.mon-list::-webkit-scrollbar-thumb{background:#334155;border-radius:3px;}
.mon-ltitle{font-size:10px;color:#475569;font-weight:700;letter-spacing:.5px;padding:0 5px 7px;text-transform:uppercase;}
.mon-empty{color:#475569;font-size:12px;text-align:center;padding:40px 16px;}

/* 세션 카드 */
.mon-card{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);border-radius:11px;padding:10px 12px;margin-bottom:7px;cursor:pointer;transition:background .15s,transform .1s;position:relative;}
.mon-card:hover{background:rgba(255,255,255,.08);transform:translateX(2px);}
.mon-card.sel{background:rgba(56,189,248,.08);border-color:rgba(56,189,248,.3);}
.mon-card.on-line{border-left:3px solid #4ade80;}
.mon-card.off-line{border-left:3px solid #334155;opacity:.72;}
.mon-card.flagged{border-color:rgba(239,68,68,.4);}
.mon-ctop{display:flex;justify-content:space-between;align-items:flex-start;gap:6px;}
.mon-cleft{display:flex;align-items:center;gap:8px;}
.mon-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;}
.mon-dot.on{background:#4ade80;box-shadow:0 0 5px #4ade80;animation:mon-pulse 2s infinite;}
.mon-dot.off{background:#475569;}
@keyframes mon-pulse{0%,100%{opacity:1;}50%{opacity:.3;}}
.mon-uname{font-size:13px;font-weight:700;color:#e2e8f0;display:flex;align-items:center;gap:5px;flex-wrap:wrap;}
.mon-rbdg{font-size:9px;font-weight:600;border-radius:3px;padding:1px 4px;}
.mon-ip{font-size:10px;color:#64748b;margin-top:2px;}
.mon-cright{text-align:right;flex-shrink:0;display:flex;flex-direction:column;align-items:flex-end;gap:4px;}
.mon-mbdg{font-size:10px;background:rgba(56,189,248,.15);color:#38bdf8;border-radius:5px;padding:2px 7px;font-weight:600;white-space:nowrap;}
.mon-dur{font-size:10px;color:#64748b;}
.mon-del-btn{background:transparent;border:none;color:#475569;font-size:13px;cursor:pointer;padding:2px 4px;border-radius:4px;line-height:1;transition:all .15s;}
.mon-del-btn:hover{background:rgba(239,68,68,.2);color:#ef4444;}

/* 이상 플래그 배지 */
.mon-flags{display:flex;flex-wrap:wrap;gap:3px;margin-top:5px;}
.mon-flag{font-size:9px;font-weight:700;border-radius:3px;padding:1px 5px;}
.mon-flag.night {background:rgba(99,102,241,.2);color:#818cf8;}
.mon-flag.dup   {background:rgba(239,68,68,.2);color:#ef4444;}
.mon-flag.burst {background:rgba(245,158,11,.2);color:#fbbf24;}

.mon-chips{display:flex;flex-wrap:wrap;gap:3px;margin-top:5px;}
.mon-chip{font-size:9px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1);border-radius:3px;padding:1px 5px;color:#94a3b8;}
.mon-cbot{display:flex;justify-content:space-between;align-items:center;margin-top:6px;padding-top:6px;border-top:1px solid rgba(255,255,255,.05);font-size:10px;color:#64748b;}
.mon-ltag{font-size:9px;background:rgba(239,68,68,.15);color:#ef4444;border-radius:3px;padding:1px 5px;}
.mon-last{font-size:10px;color:#475569;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}

/* 우측 패널 탭 */
.mon-rtabs{display:flex;gap:0;border-bottom:1px solid rgba(255,255,255,.06);flex-shrink:0;}
.mon-rtab{flex:1;text-align:center;padding:9px 0;font-size:11px;font-weight:700;color:#475569;cursor:pointer;border-bottom:2px solid transparent;transition:all .15s;}
.mon-rtab.on{color:#38bdf8;border-bottom-color:#38bdf8;}
.mon-rtab:hover:not(.on){color:#94a3b8;}

/* 상세 패널 */
.mon-detail{flex:1;display:flex;flex-direction:column;overflow:hidden;}
.mon-detail-body{flex:1;overflow-y:auto;padding:14px 18px;scrollbar-width:thin;scrollbar-color:#334155 transparent;}
.mon-detail-body::-webkit-scrollbar{width:3px;}.mon-detail-body::-webkit-scrollbar-thumb{background:#334155;border-radius:3px;}
.mon-dhint{color:#475569;font-size:12px;text-align:center;margin-top:60px;line-height:1.8;}
.mon-dhdr{padding-bottom:12px;border-bottom:1px solid rgba(255,255,255,.06);margin-bottom:12px;}
.mon-dtitle{font-size:15px;font-weight:800;color:#e2e8f0;display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:5px;}
.mon-dmeta{font-size:11px;color:#64748b;display:flex;flex-wrap:wrap;gap:10px;}
.mon-dmeta span{display:flex;align-items:center;gap:3px;}
.mon-ddel-btn{margin-left:auto;background:rgba(239,68,68,.15);border:1px solid rgba(239,68,68,.3);color:#ef4444;border-radius:7px;padding:5px 12px;font-size:11px;font-weight:700;cursor:pointer;transition:background .15s;}
.mon-ddel-btn:hover{background:rgba(239,68,68,.3);}

/* 타임라인 */
.mon-tl-item{display:flex;gap:7px;align-items:flex-start;padding:6px 8px;border-radius:7px;margin-bottom:3px;}
.mon-tl-item:hover{background:rgba(255,255,255,.04);}
.mon-tl-t{font-size:10px;color:#475569;white-space:nowrap;min-width:50px;padding-top:1px;font-family:monospace;}
.mon-tl-ico{font-size:12px;flex-shrink:0;}
.mon-tl-body{flex:1;min-width:0;}
.mon-tl-menu{font-size:11px;color:#38bdf8;font-weight:600;}
.mon-tl-det{font-size:11px;color:#94a3b8;margin-top:1px;word-break:break-all;}
.mon-tl-ext{font-size:10px;color:#64748b;margin-top:1px;font-style:italic;}

/* ═══ 통계 패널 ═══ */
.mon-stats-body{flex:1;overflow-y:auto;padding:14px 16px;scrollbar-width:thin;scrollbar-color:#334155 transparent;}
.mon-stats-body::-webkit-scrollbar{width:3px;}.mon-stats-body::-webkit-scrollbar-thumb{background:#334155;border-radius:3px;}
.mon-stat-section{margin-bottom:20px;}
.mon-stat-sec-title{font-size:11px;color:#475569;font-weight:700;letter-spacing:.5px;text-transform:uppercase;margin-bottom:10px;padding-bottom:4px;border-bottom:1px solid rgba(255,255,255,.06);}

/* 요약 카드 그리드 */
.mon-sum-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:4px;}
.mon-sum-card{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);border-radius:10px;padding:10px 8px;text-align:center;}
.mon-sum-val{font-size:20px;font-weight:900;color:#38bdf8;line-height:1;}
.mon-sum-lbl{font-size:10px;color:#64748b;margin-top:3px;}

/* 메뉴 사용 바 */
.mon-menu-bar-row{display:flex;align-items:center;gap:8px;margin-bottom:6px;}
.mon-menu-bar-lbl{font-size:11px;color:#94a3b8;width:60px;flex-shrink:0;text-align:right;}
.mon-menu-bar-track{flex:1;background:rgba(255,255,255,.06);border-radius:4px;height:14px;overflow:hidden;position:relative;}
.mon-menu-bar-fill{height:100%;border-radius:4px;background:linear-gradient(90deg,#38bdf8,#818cf8);transition:width .4s;}
.mon-menu-bar-pct{position:absolute;right:5px;top:0;height:100%;display:flex;align-items:center;font-size:9px;color:#e2e8f0;font-weight:700;}

/* 사용자 활동 바 */
.mon-user-bar-row{display:flex;align-items:center;gap:8px;margin-bottom:5px;}
.mon-user-bar-lbl{font-size:11px;color:#94a3b8;width:70px;flex-shrink:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:right;}
.mon-user-bar-track{flex:1;background:rgba(255,255,255,.06);border-radius:4px;height:14px;overflow:hidden;position:relative;}
.mon-user-bar-fill{height:100%;border-radius:4px;transition:width .4s;}
.mon-user-bar-cnt{position:absolute;right:5px;top:0;height:100%;display:flex;align-items:center;font-size:9px;color:#e2e8f0;font-weight:700;}

/* ═══ 히트맵 ═══ */
.mon-heatmap{overflow-x:auto;}
.mon-hm-table{border-collapse:collapse;font-size:9px;}
.mon-hm-th{color:#475569;padding:2px 4px;text-align:center;white-space:nowrap;font-weight:600;}
.mon-hm-td{width:18px;height:16px;border-radius:2px;cursor:default;position:relative;}
.mon-hm-td:hover::after{content:attr(data-tip);position:absolute;bottom:calc(100% + 4px);left:50%;transform:translateX(-50%);background:#1e293b;border:1px solid rgba(255,255,255,.15);color:#e2e8f0;font-size:10px;padding:3px 7px;border-radius:5px;white-space:nowrap;z-index:10;pointer-events:none;}

/* 확인 모달 */
.mon-confirm-ov{position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;}
.mon-confirm-ov.hidden{display:none;}
.mon-confirm-box{background:#1e293b;border:1px solid rgba(255,255,255,.12);border-radius:14px;padding:24px 28px;max-width:320px;width:90%;}
.mon-confirm-title{font-size:15px;font-weight:800;color:#e2e8f0;margin-bottom:6px;}
.mon-confirm-sub{font-size:12px;color:#64748b;line-height:1.7;margin-bottom:18px;white-space:pre-line;}
.mon-confirm-acts{display:flex;gap:8px;justify-content:flex-end;}
.mon-confirm-cancel{background:rgba(100,116,139,.15);border:1px solid rgba(100,116,139,.3);color:#94a3b8;border-radius:8px;padding:8px 16px;font-size:12px;font-weight:700;cursor:pointer;}
.mon-confirm-ok{background:rgba(239,68,68,.2);border:1px solid rgba(239,68,68,.4);color:#ef4444;border-radius:8px;padding:8px 16px;font-size:12px;font-weight:700;cursor:pointer;}
.mon-confirm-ok:hover{background:rgba(239,68,68,.35);}

/* 토스트 */
.mon-toast{position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#334155;color:#e2e8f0;font-size:12px;font-weight:600;padding:8px 18px;border-radius:20px;z-index:100001;opacity:0;transition:opacity .25s;pointer-events:none;}
.mon-toast.show{opacity:1;}

/* 푸터 */
.mon-ftr{display:flex;align-items:center;gap:10px;padding:7px 16px;background:rgba(0,0,0,.25);border-top:1px solid rgba(255,255,255,.06);font-size:10px;color:#475569;flex-shrink:0;flex-wrap:wrap;}
.mon-fdot{color:#334155;}

@media(max-width:640px){
  .mon-list{width:100%;border-right:none;}
  .mon-body{flex-direction:column;}
  .mon-detail{display:none;}
  .mon-detail.show{display:flex;}
  .mon-stats{display:none;}
  .mon-hsub{display:none;}
}
    `;
    document.head.appendChild(s);
  }

  /* ═══════════════════════════════════════════════════════════
   * 브라우저 알림 권한 요청
   * ═══════════════════════════════════════════════════════════ */
  let _notifEnabled = true;

  async function _requestNotifPermission() {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
      await Notification.requestPermission();
    }
    _notifEnabled = Notification.permission === 'granted';
    _updateNotifBtn();
  }

  function _updateNotifBtn() {
    const btn = document.getElementById('mon-notif-btn');
    if (!btn) return;
    const granted = Notification.permission === 'granted';
    btn.className = `mon-notif-toggle ${granted && _notifEnabled ? 'on' : ''}`;
    btn.textContent = granted && _notifEnabled ? '🔔 알림 ON' : '🔕 알림 OFF';
  }

  function _toggleNotif() {
    if (Notification.permission !== 'granted') {
      _requestNotifPermission();
      return;
    }
    _notifEnabled = !_notifEnabled;
    _updateNotifBtn();
    _toast(_notifEnabled ? '🔔 알림 켜짐' : '🔕 알림 꺼짐');
  }

  /* 새 세션 감지 → 알림 발송 */
  function _checkNewSessions(newList) {
    if (!_notifEnabled || Notification.permission !== 'granted') return;
    newList.forEach(s => {
      if (!_notifiedIds.has(s.id) && MonitorDB.isOnline(s)) {
        _fireNotification(s);
        _notifiedIds.add(s.id);
      }
    });
  }

  function _fireNotification(s) {
    try {
      const role = ROLE[s.role] || s.role;
      const flags = _getAnomalies(s, _sessions);
      const flagTxt = flags.length ? ' ⚠️' : '';
      const n = new Notification(`👤 ${s.username} 로그인${flagTxt}`, {
        body: `${role} · ${s.ip} · ${s.ua || '기기 불명'}`,
        tag: s.id,
        requireInteraction: false,
      });
      n.onclick = () => { window.focus(); MonitorApp.selectSession(s.id); };
      setTimeout(() => n.close(), 8000);
    } catch(e) { /* 알림 실패 무시 */ }
  }

  /* ═══════════════════════════════════════════════════════════
   * 이상 접속 감지
   * ═══════════════════════════════════════════════════════════ */
  function _getAnomalies(s, allSessions) {
    const flags = [];
    const h = new Date(s.loginAt).getHours();

    /* 심야 접속: 23시 이후 또는 6시 이전 */
    if (h >= 23 || h < 6) {
      flags.push({ type:'night', icon:'🌙', label:`심야(${h}시)` });
    }

    /* 동일 계정 중복 접속: 같은 username이 2개 이상 온라인 */
    if (MonitorDB.isOnline(s)) {
      const dups = allSessions.filter(x =>
        x.id !== s.id && x.username === s.username && MonitorDB.isOnline(x)
      );
      if (dups.length > 0) {
        flags.push({ type:'dup', icon:'👥', label:'중복접속' });
      }
    }

    /* 과다 액션: 10분 내 50건 이상 */
    const acts = _acts(s);
    const now  = Date.now();
    const recent10m = acts.filter(a => a.t && now - new Date(a.t).getTime() < 10 * 60 * 1000);
    if (recent10m.length >= 50) {
      flags.push({ type:'burst', icon:'⚡', label:`과다액션(${recent10m.length}건/10분)` });
    }

    return flags;
  }

  /* ═══════════════════════════════════════════════════════════
   * 공개: 화면 열기
   * ═══════════════════════════════════════════════════════════ */
  function show() {
    _css();
    let el = document.getElementById('mon-ov');
    if (!el) { el = document.createElement('div'); el.id = 'mon-ov'; document.body.appendChild(el); }
    el.classList.remove('hidden');
    document.getElementById('app')?.classList.add('hidden');
    document.getElementById('login-gate')?.classList.add('hidden');
    _render(el);
    _startListen();
    _startClock();
    _requestNotifPermission();
    /* ★ FCM 토큰 등록 — 페이지 닫혀도 푸시 수신 가능 */
    if (typeof MonitorFCM !== 'undefined') {
      MonitorFCM.register().then(ok => {
        const btn = document.getElementById('mon-notif-btn');
        if (btn && ok) {
          btn.className = 'mon-notif-toggle on';
          btn.textContent = '🔔 알림 ON (FCM)';
        }
      });
    }
  }

  function hide() {
    document.getElementById('mon-ov')?.classList.add('hidden');
    document.getElementById('app')?.classList.remove('hidden');
    _stopListen();
    _stopClock();
    /* FCM 토큰 유지 — 페이지 닫혀도 푸시 수신되도록 unregister 하지 않음 */
  }

  function selectSession(id) {
    _selId = id;
    _rightTab = 'detail';
    _updateList();
    _updateRightPanel();
  }

  /* ═══════════════════════════════════════════════════════════
   * 우측 탭 전환
   * ═══════════════════════════════════════════════════════════ */
  function switchRightTab(tab) {
    _rightTab = tab;
    document.querySelectorAll('.mon-rtab').forEach(t =>
      t.classList.toggle('on', t.dataset.tab === tab)
    );
    _updateRightPanel();
  }

  function _updateRightPanel() {
    if (_rightTab === 'stats') _renderStats();
    else _renderDetailPanel();
  }

  /* ═══════════════════════════════════════════════════════════
   * 초기 HTML 골격
   * ═══════════════════════════════════════════════════════════ */
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
        <div class="mon-hdr-btns">
          <span id="mon-notif-btn" class="mon-notif-toggle" onclick="MonitorApp._toggleNotif()" title="로그인 알림 켜기/끄기">🔕 알림 OFF</span>
          <button class="mon-btn amber" onclick="MonitorApp.clearFinished()">🗑 완료 삭제</button>
          <button class="mon-btn red"   onclick="MonitorApp.clearAll()">⚠️ 전체 초기화</button>
          <button class="mon-btn close" onclick="MonitorApp.hide()">✕ 닫기</button>
        </div>
      </div>

      <div class="mon-body">
        <div class="mon-list" id="mon-list">
          <div class="mon-ltitle">세션 목록</div>
          <div class="mon-empty" id="mon-empty">Firebase 연결 중...</div>
        </div>
        <div class="mon-detail" id="mon-detail">
          <div class="mon-rtabs">
            <div class="mon-rtab on" data-tab="detail" onclick="MonitorApp.switchRightTab('detail')">📋 세션 상세</div>
            <div class="mon-rtab"    data-tab="stats"  onclick="MonitorApp.switchRightTab('stats')">📊 통계 &amp; 히트맵</div>
          </div>
          <div id="mon-right-body" style="flex:1;overflow:hidden;display:flex;flex-direction:column;">
            <div class="mon-detail-body" id="mon-detail-content">
              <div class="mon-dhint">← 좌측 세션을 선택하면<br>상세 활동 로그를 표시합니다</div>
            </div>
          </div>
        </div>
      </div>

      <div class="mon-ftr">
        <span id="mon-clk"></span>
        <span class="mon-fdot">•</span>
        <span>데이터 자동 소멸: 48시간</span>
        <span class="mon-fdot">•</span>
        <span>${FireDB.ready()
          ? '<span style="color:#4ade80">● Firebase 연결됨</span>'
          : '<span style="color:#ef4444">● Firebase 오프라인</span>'}</span>
        <span class="mon-fdot">•</span>
        <span style="color:#334155">삭제 후 재접속 시 새 기록 자동 생성</span>
      </div>
    `;
  }

  /* ═══════════════════════════════════════════════════════════
   * 세션 목록 업데이트
   * ═══════════════════════════════════════════════════════════ */
  function _updateList() {
    const listEl  = document.getElementById('mon-list');
    const emptyEl = document.getElementById('mon-empty');
    if (!listEl) return;

    const dayS = new Date(); dayS.setHours(0,0,0,0);
    const cOn  = _sessions.filter(s => MonitorDB.isOnline(s)).length;
    const cTdy = _sessions.filter(s => new Date(s.loginAt) >= dayS).length;
    _v('mc-on', cOn); _v('mc-today', cTdy); _v('mc-total', _sessions.length);

    [...listEl.querySelectorAll('.mon-card')].forEach(c => c.remove());

    if (!_sessions.length) {
      if (emptyEl) { emptyEl.style.display=''; emptyEl.textContent='기록된 세션이 없습니다'; }
      return;
    }
    if (emptyEl) emptyEl.style.display = 'none';

    _sessions.forEach(s => {
      const online   = MonitorDB.isOnline(s);
      const anomalies= _getAnomalies(s, _sessions);
      const card     = document.createElement('div');
      card.className = `mon-card ${online?'on-line':'off-line'}${_selId===s.id?' sel':''}${anomalies.length?' flagged':''}`;
      card.onclick   = e => { if (!e.target.closest('.mon-del-btn')) MonitorApp.selectSession(s.id); };

      const acts    = _acts(s);
      const menuPct = _menuPct(acts);
      const lastAct = acts[acts.length-1];
      const dur     = _dur(s.loginAt, s.loggedOut || new Date().toISOString());
      const menuLbl = MENU[s.currentMenu] || s.currentMenu || '';
      const rLbl    = ROLE[s.role] || s.role;
      const rClr    = ROLE_COLOR[s.role] || '#64748b';

      card.innerHTML = `
        <div class="mon-ctop">
          <div class="mon-cleft">
            <div class="mon-dot ${online?'on':'off'}"></div>
            <div>
              <div class="mon-uname">
                ${_e(s.username)}
                <span class="mon-rbdg" style="background:${rClr}20;color:${rClr}">${rLbl}</span>
              </div>
              <div class="mon-ip">🌐 ${_e(s.ip)}</div>
              <div class="mon-ip">${_dIco(s.ua)} ${_e(s.ua)}</div>
            </div>
          </div>
          <div class="mon-cright">
            <button class="mon-del-btn" title="이 세션 삭제" onclick="MonitorApp.deleteOne('${s.id}',event)">🗑</button>
            <div class="mon-mbdg">${menuLbl}</div>
            <div class="mon-dur">⏱ ${dur}</div>
          </div>
        </div>
        ${anomalies.length ? `
          <div class="mon-flags">
            ${anomalies.map(f=>`<span class="mon-flag ${f.type}">${f.icon} ${f.label}</span>`).join('')}
          </div>` : ''}
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

  /* ═══════════════════════════════════════════════════════════
   * 상세 패널
   * ═══════════════════════════════════════════════════════════ */
  function _renderDetailPanel() {
    const wrap = document.getElementById('mon-right-body');
    if (!wrap) return;

    if (!_selId) {
      wrap.innerHTML = `<div class="mon-detail-body"><div class="mon-dhint">← 좌측 세션을 선택하면<br>상세 활동 로그를 표시합니다</div></div>`;
      return;
    }

    const s = _sessions.find(x => x.id === _selId);
    if (!s) {
      wrap.innerHTML = `<div class="mon-detail-body"><div class="mon-dhint">세션을 찾을 수 없습니다</div></div>`;
      return;
    }

    const acts     = _acts(s).slice().reverse();
    const online   = MonitorDB.isOnline(s);
    const anomalies= _getAnomalies(s, _sessions);
    const rLbl     = ROLE[s.role] || s.role;
    const rClr     = ROLE_COLOR[s.role] || '#64748b';
    const dur      = _dur(s.loginAt, s.loggedOut || new Date().toISOString());

    wrap.innerHTML = `
      <div class="mon-detail-body" id="mon-detail-content">
        <div class="mon-dhdr">
          <div class="mon-dtitle">
            ${_e(s.username)}
            <span class="mon-rbdg" style="background:${rClr}20;color:${rClr};font-size:11px">${rLbl}</span>
            ${online
              ? '<span style="color:#4ade80;font-size:11px">● 접속 중</span>'
              : '<span style="color:#475569;font-size:11px">○ 오프라인</span>'}
            <button class="mon-ddel-btn" onclick="MonitorApp.deleteOne('${s.id}')">🗑 이 세션 삭제</button>
          </div>
          <div class="mon-dmeta">
            <span>🌐 ${_e(s.ip)}</span>
            <span>${_dIco(s.ua)} ${_e(s.ua)}</span>
            <span>⏱ ${dur}</span>
            <span>🔑 ${_ts(s.loginAt)}</span>
            ${s.loggedOut?`<span>🚪 ${_ts(s.loggedOut)}</span>`:''}
            <span>💬 ${acts.length}건</span>
          </div>
          ${anomalies.length ? `
          <div class="mon-flags" style="margin-top:8px;">
            ${anomalies.map(f=>`<span class="mon-flag ${f.type}">${f.icon} ${f.label}</span>`).join('')}
          </div>` : ''}
        </div>
        <div>
          ${acts.length
            ? acts.map(a=>`
              <div class="mon-tl-item">
                <span class="mon-tl-t">${_shortT(a.t)}</span>
                <span class="mon-tl-ico">${TYPE_ICON[a.type]||'🖱'}</span>
                <div class="mon-tl-body">
                  <div class="mon-tl-menu">${MENU[a.menu]||a.menu||''}</div>
                  ${a.detail?`<div class="mon-tl-det">${_e(a.detail)}</div>`:''}
                  ${a.extra ?`<div class="mon-tl-ext">${_e(a.extra)}</div>` :''}
                </div>
              </div>`).join('')
            : '<div class="mon-dhint">기록된 활동이 없습니다</div>'}
        </div>
      </div>
    `;
  }

  /* ═══════════════════════════════════════════════════════════
   * 통계 & 히트맵 패널
   * ═══════════════════════════════════════════════════════════ */
  function _renderStats() {
    const wrap = document.getElementById('mon-right-body');
    if (!wrap) return;

    const stats  = _computeStats(_sessions);
    const hmData = _computeHeatmap(_sessions);
    const hmMax  = Math.max(1, ...hmData.flat());

    /* ── 메뉴 사용 바 ── */
    const menuEntries = Object.entries(stats.menuCounts)
      .sort((a,b) => b[1]-a[1]).slice(0, 7);
    const menuTotal = menuEntries.reduce((s,[,v])=>s+v, 0) || 1;
    const menuBars = menuEntries.map(([m, cnt]) => {
      const pct = Math.round(cnt / menuTotal * 100);
      return `
        <div class="mon-menu-bar-row">
          <span class="mon-menu-bar-lbl">${MENU[m]||m}</span>
          <div class="mon-menu-bar-track">
            <div class="mon-menu-bar-fill" style="width:${pct}%"></div>
            <span class="mon-menu-bar-pct">${pct}%</span>
          </div>
        </div>`;
    }).join('');

    /* ── 사용자 활동 바 ── */
    const userEntries = Object.entries(stats.userCounts)
      .sort((a,b) => b[1]-a[1]).slice(0, 8);
    const userMax = Math.max(1, ...userEntries.map(([,v])=>v));
    const USER_COLORS = ['#38bdf8','#4ade80','#fb923c','#f472b6','#818cf8','#34d399','#fbbf24','#a78bfa'];
    const userBars = userEntries.map(([u, cnt], i) => {
      const pct = Math.round(cnt / userMax * 100);
      return `
        <div class="mon-user-bar-row">
          <span class="mon-user-bar-lbl" title="${_e(u)}">${_e(u)}</span>
          <div class="mon-user-bar-track">
            <div class="mon-user-bar-fill" style="width:${pct}%;background:${USER_COLORS[i%USER_COLORS.length]}40;border-right:2px solid ${USER_COLORS[i%USER_COLORS.length]}"></div>
            <span class="mon-user-bar-cnt">${cnt}회</span>
          </div>
        </div>`;
    }).join('');

    /* ── 히트맵 테이블 ── */
    const HOURS = Array.from({length:24},(_,i)=>`${i}시`);
    const hmHeader = `<tr>
      <th class="mon-hm-th" style="width:22px"></th>
      ${HOURS.map((h,i)=>`<th class="mon-hm-th" style="color:${i>=23||i<6?'#818cf8':'#475569'}">${i%3===0?h:''}</th>`).join('')}
    </tr>`;

    const hmRows = DAYS_KO.map((d, di) => `
      <tr>
        <td class="mon-hm-th" style="text-align:right;padding-right:4px">${d}</td>
        ${hmData[di].map((v, hi) => {
          const intensity = v / hmMax;
          const alpha     = Math.round(intensity * 220);
          const hex       = alpha.toString(16).padStart(2,'0');
          const isNight   = hi >= 23 || hi < 6;
          const color     = isNight ? `#818cf8${hex}` : `#38bdf8${hex}`;
          const bg        = v === 0 ? 'rgba(255,255,255,.04)' : color;
          return `<td class="mon-hm-td" style="background:${bg}" data-tip="${d}요일 ${hi}시: ${v}건"></td>`;
        }).join('')}
      </tr>`).join('');

    wrap.innerHTML = `
      <div class="mon-stats-body">

        <div class="mon-stat-section">
          <div class="mon-stat-sec-title">48시간 요약</div>
          <div class="mon-sum-grid">
            <div class="mon-sum-card">
              <div class="mon-sum-val" style="color:#4ade80">${stats.total}</div>
              <div class="mon-sum-lbl">총 세션</div>
            </div>
            <div class="mon-sum-card">
              <div class="mon-sum-val" style="color:#38bdf8">${stats.avgDur}분</div>
              <div class="mon-sum-lbl">평균 사용</div>
            </div>
            <div class="mon-sum-card">
              <div class="mon-sum-val" style="color:#fb923c">${stats.anomalyCount}</div>
              <div class="mon-sum-lbl">이상 감지</div>
            </div>
          </div>
        </div>

        ${menuBars ? `
        <div class="mon-stat-section">
          <div class="mon-stat-sec-title">메뉴 사용 빈도 (상위 7)</div>
          ${menuBars}
        </div>` : ''}

        ${userBars ? `
        <div class="mon-stat-section">
          <div class="mon-stat-sec-title">사용자별 접속 횟수</div>
          ${userBars}
        </div>` : ''}

        <div class="mon-stat-section">
          <div class="mon-stat-sec-title">시간대별 활동 히트맵</div>
          <div style="font-size:10px;color:#334155;margin-bottom:6px">
            <span style="display:inline-block;width:12px;height:10px;background:rgba(56,189,248,.6);border-radius:2px;margin-right:3px;vertical-align:middle"></span>일반 시간대
            <span style="display:inline-block;width:12px;height:10px;background:rgba(129,140,248,.6);border-radius:2px;margin-left:8px;margin-right:3px;vertical-align:middle"></span>심야(23시~06시)
          </div>
          <div class="mon-heatmap">
            <table class="mon-hm-table">
              ${hmHeader}
              ${hmRows}
            </table>
          </div>
          <div style="font-size:10px;color:#334155;margin-top:6px;text-align:right">
            셀에 마우스를 올리면 건수 표시
          </div>
        </div>

      </div>
    `;
  }

  /* ═══════════════════════════════════════════════════════════
   * 통계 계산
   * ═══════════════════════════════════════════════════════════ */
  function _computeStats(sessions) {
    const menuCounts = {};
    const userCounts = {};
    let totalDur = 0, durCount = 0, anomalyCount = 0;

    sessions.forEach(s => {
      userCounts[s.username] = (userCounts[s.username] || 0) + 1;

      const end = new Date(s.loggedOut || s.lastSeen);
      const dur = (end - new Date(s.loginAt)) / 60000;
      if (dur > 0.5 && dur < 480) { totalDur += dur; durCount++; }

      if (_getAnomalies(s, sessions).length > 0) anomalyCount++;

      _acts(s).forEach(a => {
        if (a.menu) menuCounts[a.menu] = (menuCounts[a.menu] || 0) + 1;
      });
    });

    return {
      total: sessions.length,
      avgDur: durCount ? Math.round(totalDur / durCount) : 0,
      menuCounts,
      userCounts,
      anomalyCount,
    };
  }

  /* ═══════════════════════════════════════════════════════════
   * 히트맵 데이터 계산 (요일 × 시간)
   * ═══════════════════════════════════════════════════════════ */
  function _computeHeatmap(sessions) {
    const grid = Array(7).fill(null).map(() => Array(24).fill(0));
    sessions.forEach(s => {
      const ld = new Date(s.loginAt);
      grid[ld.getDay()][ld.getHours()]++;

      _acts(s).forEach(a => {
        if (!a.t) return;
        const ad = new Date(a.t);
        if (!isNaN(ad)) grid[ad.getDay()][ad.getHours()]++;
      });
    });
    return grid;
  }

  /* ═══════════════════════════════════════════════════════════
   * Firebase 리스닝
   * ═══════════════════════════════════════════════════════════ */
  function _startListen() {
    _stopListen();
    _unlisten = MonitorDB.listenSessions(list => {
      _checkNewSessions(list);   // ★ 알림 체크
      _sessions = list;
      _updateList();
      _updateRightPanel();
    });
  }
  function _stopListen() { if (_unlisten) { _unlisten(); _unlisten = null; } }

  /* ═══════════════════════════════════════════════════════════
   * 삭제 기능
   *
   * ★ 수정 (v4.1)
   *   - 커스텀 모달 → window.confirm() 사용
   *     (PWA/모바일에서 커스텀 모달이 #mon-ov 뒤에 숨는 z-index 문제 해결)
   *   - 낙관적 UI 업데이트: Firebase 응답 전에 _sessions에서 즉시 제거
   *     → 화면에서 바로 사라짐, Firebase 삭제는 백그라운드 처리
   * ═══════════════════════════════════════════════════════════ */

  /* 세션 단건 삭제 */
  async function deleteOne(id, e) {
    if (e) e.stopPropagation();
    const s      = _sessions.find(x => x.id === id);
    if (!s) return;
    const name   = `${s.username} (${_ts(s.loginAt)})`;
    const online = MonitorDB.isOnline(s);

    const msg = online
      ? `[${name}]\n\n현재 접속 중인 세션입니다.\n삭제해도 사용자는 계속 이용 가능하며 이후 기록만 사라집니다.\n\n삭제하시겠습니까?`
      : `[${name}]\n\n이 세션 기록을 삭제하시겠습니까?`;

    if (!window.confirm(msg)) return;

    /* ★ 낙관적 UI 업데이트 — Firebase 응답 기다리지 않고 즉시 제거 */
    _sessions = _sessions.filter(x => x.id !== id);
    if (_selId === id) _selId = null;
    _updateList();
    _updateRightPanel();
    _toast('🗑 세션 삭제 중...');

    /* Firebase 백그라운드 삭제 */
    try {
      if (FireDB.ready()) {
        await FireDB.remove(`hakwon10/monitor/sessions/${id}`);
      }
      _toast('🗑 세션 삭제 완료');
    } catch(err) {
      console.warn('[MonitorApp] deleteOne Firebase 오류:', err);
      _toast('⚠️ Firebase 삭제 실패 — 새로고침 후 재시도');
    }
  }

  /* 완료(오프라인) 세션 일괄 삭제 */
  async function clearFinished() {
    const offline = _sessions.filter(s => !MonitorDB.isOnline(s));
    if (!offline.length) { _toast('삭제할 오프라인 세션이 없습니다'); return; }

    if (!window.confirm(
      `오프라인 세션 ${offline.length}개를 삭제합니다.\n(현재 접속 중인 세션은 보호됩니다)\n\n진행하시겠습니까?`
    )) return;

    /* ★ 낙관적 UI 업데이트 */
    const offlineIds = new Set(offline.map(s => s.id));
    _sessions = _sessions.filter(s => !offlineIds.has(s.id));
    if (offlineIds.has(_selId)) _selId = null;
    _updateList();
    _updateRightPanel();
    _toast(`🗑 ${offline.length}개 삭제 중...`);

    /* Firebase 백그라운드 삭제 */
    try {
      if (FireDB.ready()) {
        await Promise.all([...offlineIds].map(id =>
          FireDB.remove(`hakwon10/monitor/sessions/${id}`)
        ));
      }
      _toast(`🗑 오프라인 세션 ${offline.length}개 삭제 완료`);
    } catch(err) {
      console.warn('[MonitorApp] clearFinished 오류:', err);
      _toast('⚠️ 일부 삭제 실패 — 새로고침 후 재시도');
    }
  }

  /* 전체 초기화 */
  async function clearAll() {
    if (!_sessions.length) { _toast('삭제할 세션이 없습니다'); return; }
    const online = _sessions.filter(s => MonitorDB.isOnline(s));

    const msg = online.length
      ? `전체 ${_sessions.length}개 세션을 모두 삭제합니다.\n접속 중인 ${online.length}명의 기록도 포함됩니다.\n\n⚠️ 되돌릴 수 없습니다. 진행하시겠습니까?`
      : `전체 ${_sessions.length}개 세션을 모두 삭제합니다.\n\n⚠️ 되돌릴 수 없습니다. 진행하시겠습니까?`;

    if (!window.confirm(msg)) return;

    /* ★ 낙관적 UI 업데이트 */
    const allIds = _sessions.map(s => s.id);
    _sessions = [];
    _selId    = null;
    _updateList();
    _updateRightPanel();
    _toast(`🗑 ${allIds.length}개 삭제 중...`);

    /* Firebase 백그라운드 삭제 */
    try {
      if (FireDB.ready()) {
        await Promise.all(allIds.map(id =>
          FireDB.remove(`hakwon10/monitor/sessions/${id}`)
        ));
      }
      _toast(`🗑 전체 ${allIds.length}개 삭제 완료`);
    } catch(err) {
      console.warn('[MonitorApp] clearAll 오류:', err);
      _toast('⚠️ 일부 삭제 실패 — 새로고침 후 재시도');
    }
  }

  /* 토스트 */
  function _toast(msg) {
    let el = document.getElementById('mon-toast-el');
    if (!el) {
      el = document.createElement('div');
      el.id = 'mon-toast-el';
      el.className = 'mon-toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
  }

  /* 시계 */
  function _startClock() {
    _stopClock();
    const tick = () => {
      const el = document.getElementById('mon-clk');
      if (el) el.textContent = new Date().toLocaleString('ko-KR',{
        year:'numeric',month:'2-digit',day:'2-digit',
        hour:'2-digit',minute:'2-digit',second:'2-digit',
      });
    };
    tick();
    _clkTimer = setInterval(tick, 1000);
  }
  function _stopClock() { clearInterval(_clkTimer); _clkTimer = null; }

  /* ═══════════════════════════════════════════════════════════
   * 헬퍼
   * ═══════════════════════════════════════════════════════════ */
  function _acts(s) {
    if (!s.actions) return [];
    return Array.isArray(s.actions) ? s.actions : Object.values(s.actions);
  }
  function _menuPct(acts) {
    const cnt = {};
    acts.forEach(a => { if(a.menu) cnt[a.menu]=(cnt[a.menu]||0)+1; });
    const total = Object.values(cnt).reduce((s,v)=>s+v,0)||1;
    return Object.entries(cnt).sort((a,b)=>b[1]-a[1]).map(([m,c])=>[m,Math.round(c/total*100)]);
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
  function _dIco(ua) {
    if (!ua) return '🖥️';
    if (/iPhone|iPad/i.test(ua)) return '📱';
    if (/Android/i.test(ua))     return '📱';
    return '💻';
  }
  function _e(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function _v(id, val) { const el=document.getElementById(id); if(el) el.textContent=val; }

  /* ══ 공개 API ══ */
  return {
    show, hide,
    selectSession,
    switchRightTab,
    deleteOne, clearFinished, clearAll,
    _toggleNotif,
  };
})();
