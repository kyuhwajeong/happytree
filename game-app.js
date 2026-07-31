/**
 * game-app.js — 학습 게임 (콘텐츠 탭 안의 새 도구)
 * ─────────────────────────────────────────────────────────
 * 이미 만든 단어 추출 파이프라인(AI로 단어+뜻+예문 뽑기)을 그대로
 * 재활용해서, 빔프로젝터로 다 같이 하는 화면 게임 + 인쇄용 워크시트를
 * 둘 다 만들어준다. 게임 자체는 저장하지 않고 그때그때 만들어서 논다
 * (필요하면 언제든 다시 만들면 되므로 구조가 단순해짐).
 */
const GameApp = (() => {
  const _q = id => document.getElementById(id);
  const _esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

  // ★ 아이들이 좋아하는 밝고 쨍한 색 팔레트 — 카드마다 돌아가며 씀
  const PALETTE = ['#FF6B6B','#4ECDC4','#FFD93D','#6BCB77','#4D96FF','#FF922B','#C77DFF','#FF6FB3','#20C997','#FF8787'];
  const _colorFor = i => PALETTE[i % PALETTE.length];
  // ★ 카드에 입체감을 주기 위한 그라데이션 — 밝은 하이라이트 → 기본색 → 진한 그림자색
  function _shade(hex, percent) {
    const num = parseInt(hex.slice(1), 16);
    const r = Math.min(255, Math.max(0, (num >> 16) + percent));
    const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + percent));
    const b = Math.min(255, Math.max(0, (num & 0xff) + percent));
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
  }
  function _cardBg(i) {
    const c = _colorFor(i);
    return `linear-gradient(150deg, ${_shade(c, 35)} 0%, ${c} 55%, ${_shade(c, -30)} 100%)`;
  }

  let _words = [];       // 현재 게임에 쓸 {word, meaning, example, pos}[]
  let _sourceTitle = ''; // 워크시트 제목(인쇄물 헤더용)
  let _cssInjected = false;

  // ★ 효과음 — 파일 없이 Web Audio API로 직접 소리를 합성한다(추가 다운로드 없음)
  let _audioCtx = null;
  function _ctx() {
    if (!_audioCtx) { try { _audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
    if (_audioCtx.state === 'suspended') _audioCtx.resume().catch(() => {});
    return _audioCtx;
  }
  function _tone(freq, start, dur, type, vol) {
    const ctx = _ctx(); if (!ctx) return;
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = type || 'sine'; osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol ?? 0.28, ctx.currentTime + start);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(ctx.currentTime + start); osc.stop(ctx.currentTime + start + dur);
  }
  function _sndCorrect() { _tone(523.25, 0, .1, 'triangle'); _tone(659.25, .08, .1, 'triangle'); _tone(987.77, .16, .22, 'triangle'); }
  function _sndWrong() { _tone(220, 0, .16, 'sawtooth', .22); _tone(160, .1, .22, 'sawtooth', .18); }
  function _sndComplete() { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => _tone(f, i * .11, .22, 'triangle')); }
  function _sndTick() { _tone(880, 0, .05, 'square', .08); }

  // ★ 원어민 음성 — 브라우저 내장 기능(Web Speech API)이라 추가 비용·API 키 없음.
  //   기기에 설치된 영어 음성 목록 중 가장 자연스러운 걸 골라서 쓴다.
  let _enVoice = null, _voicesReady = false;
  function _pickEnVoice() {
    if (typeof speechSynthesis === 'undefined') return;
    const voices = speechSynthesis.getVoices();
    if (!voices.length) return;
    _enVoice = voices.find(v => v.lang === 'en-US' && /Google|Natural|Neural/i.test(v.name))
      || voices.find(v => v.lang === 'en-US')
      || voices.find(v => v.lang?.startsWith('en'))
      || null;
    _voicesReady = true;
  }
  if (typeof speechSynthesis !== 'undefined') {
    _pickEnVoice();
    speechSynthesis.onvoiceschanged = _pickEnVoice; // ★ 음성 목록은 비동기로 늦게 채워지는 브라우저가 많아 이벤트로 다시 시도
  }
  function _speak(text) {
    if (typeof speechSynthesis === 'undefined' || !text) return;
    if (!_voicesReady) _pickEnVoice();
    speechSynthesis.cancel(); // ★ 이전 발음이 끝나기 전에 또 눌러도 안 겹치게 먼저 정리
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US'; u.rate = 0.92; u.pitch = 1.05; // ★ 살짝 천천히 — 아이들이 듣기 편하게
    if (_enVoice) u.voice = _enVoice;
    speechSynthesis.speak(u);
  }

  function _css() {
    if (_cssInjected) return; _cssInjected = true;
    const s = document.createElement('style');
    s.textContent = `
.gm-toolbar{display:flex;justify-content:flex-end;padding:10px 14px 0}
.gm-body{flex:1;overflow-y:auto;padding:14px}
.gm-setup-card{background:var(--card);border:1px solid var(--bdr);border-radius:16px;padding:18px;max-width:480px;margin:0 auto}
.gm-setup-title{font-size:15px;font-weight:800;color:var(--tx);margin-bottom:14px;text-align:center}
.gm-field{margin-bottom:14px}
.gm-field label{display:block;font-size:11.5px;font-weight:700;color:var(--tx3);margin-bottom:6px}
.gm-field select,.gm-field textarea{width:100%;box-sizing:border-box;padding:10px 12px;border-radius:10px;border:1px solid var(--bdr);background:var(--surf);color:var(--tx);font-size:13px;font-family:inherit}
.gm-field textarea{min-height:100px;resize:vertical}
.gm-source-tabs{display:flex;gap:6px;margin-bottom:12px}
.gm-source-tab{flex:1;padding:9px;border-radius:10px;border:1px solid var(--bdr);background:var(--card2);color:var(--tx2);font-size:12px;font-weight:700;cursor:pointer;text-align:center}
.gm-source-tab.on{background:var(--a);border-color:var(--a);color:#fff}
.gm-type-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px}
.gm-type-card{border:2px solid var(--bdr);border-radius:14px;padding:16px 10px;text-align:center;cursor:pointer;background:var(--surf)}
.gm-type-card.on{border-color:var(--a);background:var(--a10)}
.gm-type-ico{font-size:30px;margin-bottom:6px}
.gm-type-lbl{font-size:12.5px;font-weight:700;color:var(--tx)}
.gm-start-btn{width:100%;padding:13px;border:none;border-radius:12px;background:linear-gradient(135deg,#4D96FF,#845EF7);color:#fff;font-size:14px;font-weight:800;cursor:pointer;box-shadow:0 4px 14px rgba(77,150,255,.35)}
.gm-start-btn:disabled{opacity:.5;cursor:default;box-shadow:none}
.gm-progress{font-size:12px;color:var(--a);text-align:center;margin-top:10px}

/* ── 게임 플레이 화면(밝고 쨍한 전용 테마 — 앱의 기본 다크/라이트와 별개) ── */
.gm-play{position:fixed;inset:0;z-index:300;display:flex;flex-direction:column;overflow:hidden;
  background:linear-gradient(160deg,#FFF7E6,#E9F3FF,#F3E9FF);background-size:200% 200%;animation:gmBgShift 18s ease infinite}
@keyframes gmBgShift{0%,100%{background-position:0% 50%}50%{background-position:100% 50%}}
.gm-play::before,.gm-play::after{content:'';position:absolute;border-radius:50%;filter:blur(40px);opacity:.35;pointer-events:none;z-index:0}
.gm-play::before{width:280px;height:280px;background:#4D96FF;top:-80px;right:-60px}
.gm-play::after{width:320px;height:320px;background:#FF922B;bottom:-100px;left:-80px}
.gm-play-hdr{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;flex-shrink:0;position:relative;z-index:1}
.gm-play-title{font-size:16px;font-weight:900;color:#2b2d42}
.gm-play-acts{display:flex;gap:8px}
.gm-play-btn{width:38px;height:38px;border-radius:50%;border:none;background:#fff;box-shadow:0 3px 10px rgba(0,0,0,.1);font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center}
.gm-play-body{flex:1;overflow-y:auto;padding:10px 18px 30px;display:flex;flex-direction:column;align-items:center;position:relative;z-index:1}

/* 매칭 게임 — 입체감 있는 글로시 카드 */
.gm-match-wrap{display:flex;gap:28px;width:100%;max-width:720px;margin-top:10px}
.gm-match-col{flex:1;display:flex;flex-direction:column;gap:12px}
.gm-match-card{padding:17px 14px;border-radius:16px;color:#fff;font-weight:800;font-size:17px;text-align:center;cursor:pointer;
  box-shadow:0 5px 0 rgba(0,0,0,.22),0 8px 16px rgba(0,0,0,.15);
  text-shadow:0 1px 3px rgba(0,0,0,.25);
  transform:translateY(0);transition:transform .1s,box-shadow .1s;user-select:none;
  border:1px solid rgba(255,255,255,.3);animation:gmCardIn .35s backwards}
.gm-match-card:active{transform:translateY(3px);box-shadow:0 2px 0 rgba(0,0,0,.22),0 3px 8px rgba(0,0,0,.12)}
.gm-match-card.selected{outline:4px solid #2b2d42;transform:translateY(1px) scale(1.03)}
.gm-match-card.matched{opacity:.3;pointer-events:none;transform:scale(.94)}
.gm-match-card.shake{animation:gmShake .4s}
.gm-match-status{font-size:17px;font-weight:900;color:#2b2d42;margin-top:20px;padding:8px 22px;background:#fff;border-radius:999px;box-shadow:0 4px 14px rgba(0,0,0,.1)}
@keyframes gmCardIn{from{opacity:0;transform:translateY(14px) scale(.9)}to{opacity:1;transform:translateY(0) scale(1)}}

/* 스펠링 채우기 */
.gm-spell-score{font-size:16px;font-weight:900;color:#2b2d42;margin-bottom:10px;padding:6px 18px;background:#fff;border-radius:999px;box-shadow:0 3px 10px rgba(0,0,0,.08)}
.gm-spell-speak-main{display:flex;align-items:center;gap:10px;border:none;border-radius:18px;padding:16px 26px;margin-bottom:14px;cursor:pointer;
  background:linear-gradient(150deg,#4D96FF,#3b7ddb);color:#fff;font-size:17px;font-weight:800;
  box-shadow:0 5px 0 rgba(0,0,0,.2),0 8px 20px rgba(77,150,255,.35);transition:transform .1s;animation:gmSpeakPulse 1.6s ease infinite}
.gm-spell-speak-main span{font-size:15px}
.gm-spell-speak-main:active{transform:translateY(3px)}
@keyframes gmSpeakPulse{0%,100%{box-shadow:0 5px 0 rgba(0,0,0,.2),0 8px 20px rgba(77,150,255,.35)}50%{box-shadow:0 5px 0 rgba(0,0,0,.2),0 8px 28px rgba(77,150,255,.6)}}
.gm-spell-meaning{font-size:16px;font-weight:700;color:#2b2d42;margin-bottom:8px;text-align:center;background:#fff;padding:9px 20px;border-radius:14px;box-shadow:0 3px 10px rgba(0,0,0,.06)}
.gm-spell-attempts{font-size:12.5px;font-weight:700;color:#e8590c;min-height:16px;margin-bottom:14px}
.gm-spell-word{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-bottom:30px;transition:transform .2s;cursor:pointer;padding:8px;border-radius:14px}
.gm-spell-word:active{transform:scale(.98)}
.gm-spell-word.done{animation:gmBounce .5s ease 2}
.gm-spell-word.timeout .gm-spell-letter.blank{border-bottom-color:#FF922B;color:#e8590c;background:#fff4e6}
.gm-spell-letter{width:44px;height:54px;display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:900;color:#2b2d42;border-radius:10px}
.gm-spell-letter.fixed{background:rgba(255,255,255,.5)}
.gm-spell-letter.blank{background:#fff;border-bottom:4px solid #ced4da;box-shadow:0 3px 8px rgba(0,0,0,.08)}
.gm-spell-letter.blank.filled{border-bottom-color:#6BCB77;color:#2f9e44}
.gm-spell-letter.blank.current{border-bottom-color:#4D96FF;animation:gmSpellPulse 1s ease infinite}
@keyframes gmSpellPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.08)}}
.gm-spell-tiles{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;max-width:480px}
.gm-spell-tile{width:52px;height:52px;border-radius:12px;border:none;font-size:20px;font-weight:900;color:#fff;cursor:pointer;
  background:linear-gradient(150deg,#4D96FF,#3b7ddb);box-shadow:0 4px 0 rgba(0,0,0,.18),0 6px 12px rgba(0,0,0,.12);transition:transform .1s}
.gm-spell-tile:active{transform:translateY(2px)}
.gm-spell-tile.used{opacity:.25;pointer-events:none}
.gm-spell-tile.wrong{animation:gmShake .35s;background:linear-gradient(150deg,#FF6B6B,#e03131)}

/* 스피드 퀴즈 */
.gm-quiz-timerbar{width:100%;max-width:500px;height:12px;background:#fff;border-radius:8px;overflow:hidden;margin-bottom:22px;box-shadow:inset 0 2px 4px rgba(0,0,0,.12)}
.gm-quiz-timerfill{height:100%;background:linear-gradient(90deg,#6BCB77,#FFD93D,#FF6B6B);transition:width .1s linear;border-radius:8px}
.gm-quiz-score{font-size:16px;font-weight:900;color:#2b2d42;margin-bottom:8px;padding:6px 18px;background:#fff;border-radius:999px;box-shadow:0 3px 10px rgba(0,0,0,.08)}
.gm-quiz-word-row{display:flex;align-items:center;gap:12px;margin-bottom:8px}
.gm-quiz-word{font-size:50px;font-weight:900;color:#2b2d42;text-align:center;text-shadow:0 2px 0 rgba(255,255,255,.6);letter-spacing:.5px}
.gm-quiz-speak-btn{width:44px;height:44px;border-radius:50%;border:none;background:#fff;font-size:19px;cursor:pointer;
  box-shadow:0 4px 0 rgba(0,0,0,.12),0 6px 12px rgba(0,0,0,.1);transition:transform .1s}
.gm-quiz-speak-btn:active{transform:translateY(2px)}
.gm-quiz-pos{font-size:16px;font-weight:700;color:#495057;margin-bottom:28px;background:#fff;padding:4px 14px;border-radius:999px}
.gm-quiz-choices{display:grid;grid-template-columns:1fr 1fr;gap:16px;width:100%;max-width:540px}
.gm-quiz-choice{padding:24px 12px;border-radius:18px;border:1px solid rgba(255,255,255,.3);color:#fff;font-size:18px;font-weight:800;cursor:pointer;
  box-shadow:0 5px 0 rgba(0,0,0,.22),0 8px 18px rgba(0,0,0,.15);text-shadow:0 1px 3px rgba(0,0,0,.25);
  transform:translateY(0);transition:transform .1s,box-shadow .1s;animation:gmCardIn .35s backwards}
.gm-quiz-choice:active{transform:translateY(3px);box-shadow:0 2px 0 rgba(0,0,0,.22),0 3px 8px rgba(0,0,0,.12)}
.gm-quiz-choice.correct{animation:gmPulseGreen .5s}
.gm-quiz-choice.wrong{animation:gmShake .4s;opacity:.5}
@keyframes gmPulseGreen{0%,100%{box-shadow:0 5px 0 rgba(0,0,0,.22),0 8px 18px rgba(0,0,0,.15)}50%{box-shadow:0 0 0 10px rgba(107,203,119,.4)}}
@keyframes gmShake{0%,100%{transform:translateX(0)}25%{transform:translateX(-7px)}75%{transform:translateX(7px)}}
.gm-quiz-end{text-align:center;margin-top:40px}
.gm-quiz-end-emoji{font-size:64px;margin-bottom:10px;animation:gmBounce .6s ease infinite alternate}
@keyframes gmBounce{from{transform:translateY(0)}to{transform:translateY(-14px)}}
.gm-quiz-end-score{font-size:24px;font-weight:900;color:#2b2d42;margin-bottom:22px}
.gm-replay-row{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}
.gm-replay-btn{padding:14px 26px;border:none;border-radius:14px;background:linear-gradient(150deg,#6badff,#845EF7);color:#fff;font-weight:800;cursor:pointer;font-size:14.5px;
  box-shadow:0 5px 0 rgba(0,0,0,.2),0 8px 18px rgba(0,0,0,.18);transition:transform .1s;white-space:nowrap}
.gm-replay-btn:active{transform:translateY(3px)}
.gm-replay-btn.wrong-only{background:linear-gradient(150deg,#FF922B,#FF6B6B)}
.gm-review{width:100%;max-width:440px;margin:30px auto 0;background:#fff;border-radius:18px;padding:16px;box-shadow:0 6px 20px rgba(0,0,0,.08)}
.gm-review-title{font-size:14px;font-weight:900;color:#2b2d42;margin-bottom:10px}
.gm-review-item{display:flex;align-items:center;gap:10px;padding:9px 4px;border-bottom:1px solid #f1f3f5}
.gm-review-item:last-child{border-bottom:none}
.gm-review-word{font-weight:800;color:#2b2d42;font-size:14.5px;min-width:90px}
.gm-review-meaning{flex:1;color:#495057;font-size:13.5px}
.gm-review-speak{width:30px;height:30px;border-radius:50%;border:none;background:#f1f3f5;font-size:13px;cursor:pointer;flex-shrink:0}

/* 색종이 효과 (정답 시) */
.gm-confetti{position:fixed;width:9px;height:9px;border-radius:2px;pointer-events:none;z-index:400;
  animation:gmConfetti .65s ease-out forwards}
@keyframes gmConfetti{
  0%{transform:translate(0,0) rotate(0deg);opacity:1}
  100%{transform:translate(var(--dx),var(--dy)) rotate(280deg);opacity:0}
}`;
    document.head.appendChild(s);
  }

  /* ═══════════════ 설정 화면 ═══════════════ */
  let _mountId = 'page-games';
  let _srcMode = 'video'; // 'video' | 'paste' | 'words'
  let _gameType = 'match';
  let _extracted = null; // paste 모드에서 추출한 결과

  function render(containerId) {
    _mountId = containerId || _mountId;
    _css();
    const pg = _q(_mountId); if (!pg) return;
    pg.innerHTML = _shellHtml();
  }
  function _shellHtml() {
    return `
      <div class="gm-body">
        <div class="gm-setup-card">
          <div class="gm-setup-title">🎮 학습 게임 만들기</div>
          <div class="gm-source-tabs">
            <button class="gm-source-tab${_srcMode==='video'?' on':''}" onclick="GameApp._selectSource('video')">🎬 영상에서</button>
            <button class="gm-source-tab${_srcMode==='paste'?' on':''}" onclick="GameApp._selectSource('paste')">📝 지문 붙여넣기</button>
            <button class="gm-source-tab${_srcMode==='words'?' on':''}" onclick="GameApp._selectSource('words')">🔤 단어만 입력</button>
          </div>
          ${_srcMode === 'video' ? _videoSourceHtml() : _srcMode === 'paste' ? _pasteSourceHtml() : _wordsSourceHtml()}
          <div class="gm-field"><label>게임 종류</label>
            <div class="gm-type-grid">
              <div class="gm-type-card${_gameType==='match'?' on':''}" onclick="GameApp._selectType('match')">
                <div class="gm-type-ico">🧩</div><div class="gm-type-lbl">짝맞추기</div>
              </div>
              <div class="gm-type-card${_gameType==='quiz'?' on':''}" onclick="GameApp._selectType('quiz')">
                <div class="gm-type-ico">⚡</div><div class="gm-type-lbl">스피드 퀴즈</div>
              </div>
              <div class="gm-type-card${_gameType==='spell'?' on':''}" onclick="GameApp._selectType('spell')" style="grid-column:1/3">
                <div class="gm-type-ico">🔤</div><div class="gm-type-lbl">스펠링 채우기</div>
              </div>
            </div>
          </div>
          <button class="gm-start-btn" id="gm-start-btn" onclick="GameApp._startGame()">🚀 게임 시작</button>
          <div id="gm-setup-progress"></div>
        </div>
      </div>`;
  }
  function _videoSourceHtml() {
    if (typeof EduVideoDB === 'undefined') return `<div class="gm-progress">영상 워크시트 데이터를 불러오지 못했습니다</div>`;
    const videos = EduVideoDB.getAll().filter(v => v.words?.length);
    if (!videos.length) {
      return `<div class="gm-field"><div class="gm-progress" style="color:var(--tx3)">🎬 영상 워크시트 탭에서 먼저 단어를 추출한 영상이 있어야 여기서 쓸 수 있어요</div></div>`;
    }
    return `<div class="gm-field"><label>어떤 영상의 단어로 만들까요?</label>
      <select id="gm-video-select">${videos.map(v => `<option value="${v.id}">${_esc(v.title)} (${v.topic} · 단어 ${v.words.length}개)</option>`).join('')}</select>
    </div>`;
  }
  function _pasteSourceHtml() {
    return `<div class="gm-field"><label>영어 지문이나 대본을 붙여넣으세요</label>
      <textarea id="gm-paste-text" placeholder="여기에 영어 텍스트를 붙여넣으면, AI가 단어를 뽑아서 게임을 만들어드려요"></textarea>
    </div>`;
  }
  function _wordsSourceHtml() {
    return `<div class="gm-field"><label>영단어를 콤마나 줄바꿈으로 구분해서 입력하세요</label>
      <textarea id="gm-words-text" placeholder="예: apple, banana, orange, grape&#10;(AI가 각 단어의 뜻·예문을 자동으로 만들어드려요)"></textarea>
    </div>`;
  }
  function _selectSource(mode) { _srcMode = mode; render(_mountId); }
  function _selectType(type) { _gameType = type; render(_mountId); }

  async function _startGame() {
    const btn = _q('gm-start-btn');
    const prog = _q('gm-setup-progress');
    btn.disabled = true;
    if (_srcMode === 'video') {
      const sel = _q('gm-video-select');
      if (!sel || !sel.value) { if (prog) prog.innerHTML = `<div class="gm-progress" style="color:#ef4444">⚠️ 사용할 영상이 없습니다</div>`; btn.disabled = false; return; }
      const v = EduVideoDB.getById(sel.value);
      _words = v.words; _sourceTitle = v.title;
      _openPlay();
      btn.disabled = false;
      return;
    }
    // paste 모드 — AI로 단어 추출(영상 워크시트와 동일 파이프라인 재사용)
    if (_srcMode === 'paste') {
      const text = _q('gm-paste-text')?.value?.trim();
      if (!text) { if (prog) prog.innerHTML = `<div class="gm-progress" style="color:#ef4444">⚠️ 텍스트를 붙여넣어 주세요</div>`; btn.disabled = false; return; }
      if (typeof GeminiAI === 'undefined' || !GeminiAI.extractVocabulary) { if (prog) prog.innerHTML = `<div class="gm-progress" style="color:#ef4444">⚠️ AI 기능을 불러오지 못했습니다</div>`; btn.disabled = false; return; }
      if (prog) prog.innerHTML = `<div class="gm-progress">🤖 AI가 단어를 뽑는 중...</div>`;
      try {
        const words = await GeminiAI.extractVocabulary(text, '일반');
        if (!words.length) { if (prog) prog.innerHTML = `<div class="gm-progress" style="color:#ef4444">⚠️ 단어를 찾지 못했습니다</div>`; btn.disabled = false; return; }
        _words = words; _sourceTitle = '학습 게임';
        if (prog) prog.innerHTML = '';
        _openPlay();
      } catch (e) {
        if (prog) prog.innerHTML = `<div class="gm-progress" style="color:#ef4444">⚠️ ${_esc(e.message || '알 수 없는 오류')}</div>`;
      }
      btn.disabled = false;
      return;
    }
    // words 모드 — 사용자가 입력한 단어 목록에 AI가 뜻·품사·예문만 붙여준다
    const raw = _q('gm-words-text')?.value?.trim();
    if (!raw) { if (prog) prog.innerHTML = `<div class="gm-progress" style="color:#ef4444">⚠️ 단어를 입력해 주세요</div>`; btn.disabled = false; return; }
    const wordList = raw.split(/[,\n]/).map(w => w.trim()).filter(Boolean);
    if (!wordList.length) { if (prog) prog.innerHTML = `<div class="gm-progress" style="color:#ef4444">⚠️ 단어를 찾지 못했습니다</div>`; btn.disabled = false; return; }
    if (typeof GeminiAI === 'undefined' || !GeminiAI.generateWordMeanings) { if (prog) prog.innerHTML = `<div class="gm-progress" style="color:#ef4444">⚠️ AI 기능을 불러오지 못했습니다</div>`; btn.disabled = false; return; }
    if (prog) prog.innerHTML = `<div class="gm-progress">🤖 AI가 단어 뜻을 만드는 중...</div>`;
    try {
      const words = await GeminiAI.generateWordMeanings(wordList);
      if (!words.length) { if (prog) prog.innerHTML = `<div class="gm-progress" style="color:#ef4444">⚠️ 뜻을 만들지 못했습니다</div>`; btn.disabled = false; return; }
      _words = words; _sourceTitle = '학습 게임';
      if (prog) prog.innerHTML = '';
      _openPlay();
    } catch (e) {
      if (prog) prog.innerHTML = `<div class="gm-progress" style="color:#ef4444">⚠️ ${_esc(e.message || '알 수 없는 오류')}</div>`;
    }
    btn.disabled = false;
  }

  /* ═══════════════ 게임 화면(전체화면 — 빔프로젝터용) ═══════════════ */
  function _pickWords(max, poolOverride) {
    const arr = (poolOverride && poolOverride.length ? poolOverride : _words).slice();
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    return arr.slice(0, Math.min(max, arr.length));
  }
  function _openPlay() {
    const wrap = document.createElement('div');
    wrap.className = 'gm-play'; wrap.id = 'gm-play';
    document.body.appendChild(wrap);
    if (_gameType === 'match') _renderMatchGame(wrap);
    else if (_gameType === 'spell') _renderSpellGame(wrap);
    else _renderQuizGame(wrap);
  }
  function _closePlay() { clearInterval(_quizTimer); clearInterval(_spellTimer); _q('gm-play')?.remove(); }
  function _playHeaderHtml(title, printFn, extraBtnHtml) {
    return `<div class="gm-play-hdr">
      <div class="gm-play-title">🌳 ${_esc(_sourceTitle)} — ${title}</div>
      <div class="gm-play-acts">
        ${extraBtnHtml || ''}
        <button class="gm-play-btn" onclick="${printFn}" title="인쇄용으로 만들기">🖨️</button>
        <button class="gm-play-btn" onclick="GameApp._toggleFs()" title="전체화면(빔프로젝터)">⛶</button>
        <button class="gm-play-btn" onclick="GameApp._closePlay()" title="닫기">✕</button>
      </div>
    </div>`;
  }
  function _toggleFs() {
    if (!document.fullscreenElement) document.getElementById('gm-play')?.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.();
  }

  /* ── 짝맞추기 게임 ── */
  let _matchWords = [], _matchLeftSel = null, _matchedCount = 0;
  function _renderMatchGame(wrap) {
    _matchWords = _pickWords(8);
    _matchLeftSel = null; _matchedCount = 0;
    const left = _matchWords.map((w, i) => ({ ...w, idx: i })).sort(() => Math.random() - 0.5);
    const right = _matchWords.map((w, i) => ({ ...w, idx: i })).sort(() => Math.random() - 0.5);
    wrap.innerHTML = `
      ${_playHeaderHtml('짝맞추기', 'GameApp._printMatch()', '<button class="gm-play-btn" onclick="GameApp._reshuffleMatch()" title="단어 순서 섞어서 다시 도전">🔀</button>')}
      <div class="gm-play-body">
        <div class="gm-match-wrap">
          <div class="gm-match-col" id="gm-match-left">${left.map((w, i) => `
            <div class="gm-match-card" style="background:${_cardBg(i)};animation-delay:${i * 60}ms" data-idx="${w.idx}" data-side="l" onclick="GameApp._matchClick(this)">${_esc(w.word)}</div>`).join('')}</div>
          <div class="gm-match-col" id="gm-match-right">${right.map((w, i) => `
            <div class="gm-match-card" style="background:${_cardBg(i + 5)};animation-delay:${i * 60 + 40}ms" data-idx="${w.idx}" data-side="r" onclick="GameApp._matchClick(this)">${_esc(w.meaning)}</div>`).join('')}</div>
        </div>
        <div class="gm-match-status" id="gm-match-status">${_matchWords.length}쌍 중 0쌍 맞춤</div>
        <button class="gm-replay-btn" id="gm-match-replay" style="margin-top:16px;display:none" onclick="GameApp._reshuffleMatch()">🔀 단어 섞어서 다시 도전</button>
      </div>`;
  }
  // ★ _pickWords가 매번 새로 무작위 추출+순서 섞기를 하므로,
  //   게임 화면을 다시 그리는 것만으로 새로운 순서의 재도전이 된다.
  function _reshuffleMatch() {
    const wrap = _q('gm-play');
    if (wrap) _renderMatchGame(wrap);
  }
  function _matchClick(el) {
    if (el.classList.contains('matched')) return;
    const side = el.dataset.side, idx = el.dataset.idx;
    if (side === 'l') {
      document.querySelectorAll('#gm-match-left .gm-match-card').forEach(c => c.classList.remove('selected'));
      el.classList.add('selected');
      _matchLeftSel = { el, idx };
      _speak(el.textContent);
      return;
    }
    if (!_matchLeftSel) return; // 오른쪽 먼저 누르면 무시(왼쪽부터 고르게 유도)
    if (_matchLeftSel.idx === idx) {
      _matchLeftSel.el.classList.remove('selected'); _matchLeftSel.el.classList.add('matched');
      el.classList.add('matched');
      _matchedCount++;
      _sndCorrect();
      _burstConfetti(el);
      const st = _q('gm-match-status');
      if (st) st.textContent = `${_matchWords.length}쌍 중 ${_matchedCount}쌍 맞춤`;
      if (_matchedCount === _matchWords.length) {
        _sndComplete();
        if (st) st.textContent = `🎉 다 맞췄어요! 잘했어요!`;
        const replayBtn = _q('gm-match-replay');
        if (replayBtn) replayBtn.style.display = '';
      }
    } else {
      _sndWrong();
      el.classList.add('shake'); _matchLeftSel.el.classList.add('shake');
      setTimeout(() => { el.classList.remove('shake'); _matchLeftSel?.el.classList.remove('shake'); }, 400);
      _matchLeftSel.el.classList.remove('selected');
    }
    _matchLeftSel = null;
  }
  // ★ 정답 맞혔을 때 카드 주변에 색종이 조각이 터지는 효과 — 순수 CSS 애니메이션, 외부 자원 없음
  function _burstConfetti(fromEl) {
    const rect = fromEl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    for (let i = 0; i < 10; i++) {
      const p = document.createElement('div');
      p.className = 'gm-confetti';
      const angle = (Math.PI * 2 * i) / 10 + Math.random() * 0.4;
      const dist = 50 + Math.random() * 40;
      p.style.left = cx + 'px'; p.style.top = cy + 'px';
      p.style.background = _colorFor(i);
      p.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
      p.style.setProperty('--dy', `${Math.sin(angle) * dist}px`);
      document.body.appendChild(p);
      setTimeout(() => p.remove(), 700);
    }
  }
  // ★ jsPDF 기본 폰트는 한글을 지원 안 해서 깨진 글자로 나온다(영상
  //   워크시트 PDF에서 이미 겪은 것과 동일한 문제) — 그때 만들어둔
  //   내장 폰트(nanum-gothic-base64.js)를 여기서도 그대로 재사용한다.
  function _applyKoreanFont(pdf) {
    if (typeof NANUM_GOTHIC_BASE64 === 'undefined') return false;
    pdf.addFileToVFS('NanumGothic.ttf', NANUM_GOTHIC_BASE64);
    pdf.addFont('NanumGothic.ttf', 'NanumGothic', 'normal');
    pdf.setFont('NanumGothic');
    return true;
  }

  function _printMatch() {
    if (typeof window.jspdf === 'undefined') { alert('PDF 라이브러리를 불러오지 못했습니다'); return; }
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' });
    _applyKoreanFont(pdf);
    const margin = 40; let y = margin;
    pdf.setFontSize(16); pdf.text(`${_sourceTitle} — 짝맞추기 워크시트`, margin, y); y += 26;
    pdf.setFontSize(10); pdf.setTextColor(120);
    pdf.text('영어 단어와 뜻을 알맞게 줄로 이어보세요.', margin, y); y += 24; pdf.setTextColor(0);
    const left = _matchWords.map((w, i) => ({ ...w, idx: i })).sort(() => Math.random() - 0.5);
    const right = _matchWords.map((w, i) => ({ ...w, idx: i })).sort(() => Math.random() - 0.5);
    const colL = margin, colR = 350, rowH = 34;
    pdf.setFontSize(13);
    left.forEach((w, i) => { pdf.text(`${i + 1}. ${w.word}`, colL, y + i * rowH); pdf.circle(colL - 12, y + i * rowH - 4, 3); });
    right.forEach((w, i) => { const lines = pdf.splitTextToSize(w.meaning, 180); pdf.text(lines, colR, y + i * rowH); pdf.circle(colR - 12, y + i * rowH - 4, 3); });
    pdf.save(`${_sourceTitle.replace(/[^\w가-힣 ]/g, '')}_짝맞추기.pdf`);
  }

  /* ── 스펠링 채우기 게임 ── */
  let _spellQ = [], _spellIdx = 0, _spellBlanks = [], _spellFilled = [], _spellTiles = [], _spellScore = 0, _spellTimer = null, _spellSkipped = [];
  const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const SPELL_SEC = 25; // ★ 스펠링은 고민할 시간이 필요해서 퀴즈(15초)보다 넉넉하게
  function _renderSpellGame(wrap) {
    _spellQ = _pickWords(8);
    _spellIdx = 0; _spellScore = 0; _spellSkipped = [];
    _renderSpellWord(wrap);
  }
  // ★ 단어 길이에 맞춰 30~45% 정도를 무작위로 빈칸 처리(너무 쉽거나 너무 어렵지 않게)
  function _makeBlanks(word) {
    const len = word.length;
    const n = Math.max(1, Math.min(len - 1, Math.round(len * 0.4)));
    const positions = Array.from({ length: len }, (_, i) => i).sort(() => Math.random() - 0.5).slice(0, n).sort((a, b) => a - b);
    return positions;
  }
  function _renderSpellWord(wrap) {
    clearInterval(_spellTimer);
    if (_spellIdx >= _spellQ.length) { _renderSpellEnd(wrap); return; }
    const q = _spellQ[_spellIdx];
    const word = q.word.toUpperCase();
    _spellBlanks = _makeBlanks(word);
    _spellFilled = _spellBlanks.map(() => null); // ★ 각 빈칸에 채워진 글자(맞았을 때만 채움)
    // ★ 타일 = 정답 글자들 + 오답 글자 2~3개(정답만 있으면 그냥 순서대로 눌러 풀 수 있어 의미가 없음)
    const correctLetters = _spellBlanks.map(i => word[i]);
    const decoyPool = ALPHA.split('').filter(c => !correctLetters.includes(c));
    const decoys = decoyPool.sort(() => Math.random() - 0.5).slice(0, Math.min(3, decoyPool.length));
    _spellTiles = [...correctLetters, ...decoys].sort(() => Math.random() - 0.5);
    _spellWrongCount = 0;
    wrap.innerHTML = `
      ${_playHeaderHtml('스펠링 채우기', 'GameApp._printSpell()')}
      <div class="gm-play-body">
        <div class="gm-spell-score">${_spellIdx + 1} / ${_spellQ.length}번째 단어 · 맞은 개수 ${_spellScore}</div>
        <div class="gm-quiz-timerbar" style="max-width:340px"><div class="gm-quiz-timerfill" id="gm-spell-timerfill" style="width:100%"></div></div>
        <button class="gm-spell-speak-main" id="gm-spell-speak-main" onclick="GameApp._speakWord('${q.word.replace(/'/g, "\\'")}')" title="다시 듣기">
          🔊 <span>소리 듣고 맞혀보세요</span>
        </button>
        <div class="gm-spell-meaning">💡 뜻: ${_esc(q.meaning)}</div>
        <div class="gm-spell-attempts" id="gm-spell-attempts"></div>
        <div class="gm-spell-word" id="gm-spell-word" onclick="GameApp._speakWord('${q.word.replace(/'/g, "\\'")}')" title="눌러서 다시 듣기">${_spellLettersHtml(word)}</div>
        <div class="gm-spell-tiles" id="gm-spell-tiles">${_spellTiles.map((c, i) => `
          <button class="gm-spell-tile" data-letter="${c}" onclick="GameApp._spellTileClick(this)">${c}</button>`).join('')}</div>
      </div>`;
    setTimeout(() => _speak(q.word), 250); // ★ 화면이 뜨자마자 자동으로 한 번 들려줌 — 소리가 핵심 단서이므로 클릭 없이 바로 시작
    let timeLeft = SPELL_SEC * 10;
    const fill = _q('gm-spell-timerfill');
    _spellTimer = setInterval(() => {
      timeLeft--;
      if (fill) fill.style.width = `${(timeLeft / (SPELL_SEC * 10)) * 100}%`;
      if (timeLeft <= 0) { clearInterval(_spellTimer); _spellTimeout(); }
    }, 100);
  }
  // ★ 시간 안에 못 맞추면 무한정 멈춰있지 않고, 정답을 보여준 뒤 다음 단어로 자동 진행
  const SPELL_MAX_WRONG = 4; // ★ 이 횟수 이상 틀리면 무작정 눌러서 맞히는 걸 막고 정답을 보여준 뒤 다음으로
  // ★ 시간 초과든 오답 초과든 "포기하고 다음으로" 처리는 동일 — 이유만 다르게 표시
  function _spellGiveUp(reason) {
    clearInterval(_spellTimer);
    _spellSkipped.push(_spellQ[_spellIdx]);
    const word = _spellQ[_spellIdx].word.toUpperCase();
    _spellFilled = _spellFilled.map((_, i) => word[_spellBlanks[i]]); // ★ 정답을 전부 채워서 보여줌
    const wordEl = _q('gm-spell-word');
    if (wordEl) { wordEl.innerHTML = _spellLettersHtml(word); wordEl.classList.add('timeout'); }
    document.querySelectorAll('#gm-spell-tiles button').forEach(b => b.disabled = true);
    const speakBtn = _q('gm-spell-speak-main');
    if (speakBtn) speakBtn.innerHTML = `${reason.icon} <span>${reason.label} 정답: ${_esc(_spellQ[_spellIdx].word)}</span>`;
    _sndWrong();
    setTimeout(() => { _spellIdx++; _renderSpellWord(_q('gm-play')); }, 2200);
  }
  function _spellTimeout() { _spellGiveUp({ icon: '⏰', label: '시간 종료!' }); }
  function _spellLettersHtml(word) {
    return word.split('').map((ch, i) => {
      const blankIdx = _spellBlanks.indexOf(i);
      if (blankIdx === -1) return `<span class="gm-spell-letter fixed">${ch}</span>`;
      const filled = _spellFilled[blankIdx];
      return `<span class="gm-spell-letter blank${filled ? ' filled' : ''}${_spellCurrentBlank() === blankIdx ? ' current' : ''}">${filled || ''}</span>`;
    }).join('');
  }
  function _spellCurrentBlank() { return _spellFilled.findIndex(f => f === null); }
  let _spellWrongCount = 0;
  function _spellTileClick(btn) {
    if (btn.disabled) return;
    const cur = _spellCurrentBlank();
    if (cur === -1) return;
    const word = _spellQ[_spellIdx].word.toUpperCase();
    const correctLetter = word[_spellBlanks[cur]];
    if (btn.dataset.letter === correctLetter) {
      _spellFilled[cur] = correctLetter;
      btn.disabled = true; btn.classList.add('used');
      _sndTick();
      const wordEl = _q('gm-spell-word');
      if (wordEl) wordEl.innerHTML = _spellLettersHtml(word);
      if (_spellCurrentBlank() === -1) _spellWordComplete(); // ★ 모든 빈칸이 채워짐 = 이 단어 완료
    } else {
      btn.classList.add('wrong'); _sndWrong();
      setTimeout(() => btn.classList.remove('wrong'), 350);
      _spellWrongCount++;
      const hint = _q('gm-spell-attempts');
      if (hint) hint.textContent = `❌ ${_spellWrongCount}/${SPELL_MAX_WRONG}번 틀림`;
      if (_spellWrongCount >= SPELL_MAX_WRONG) _spellGiveUp({ icon: '🙋', label: '아쉬워요!' });
    }
  }
  function _spellWordComplete() {
    clearInterval(_spellTimer);
    _spellScore++;
    _sndCorrect();
    const wordEl = _q('gm-spell-word');
    if (wordEl) { _burstConfetti(wordEl); wordEl.classList.add('done'); }
    _speak(_spellQ[_spellIdx].word);
    document.querySelectorAll('#gm-spell-tiles button').forEach(b => b.disabled = true);
    setTimeout(() => { _spellIdx++; _renderSpellWord(_q('gm-play')); }, 1400);
  }
  function _renderSpellEnd(wrap) {
    const emoji = _spellScore === _spellQ.length ? '🏆' : _spellScore >= _spellQ.length * 0.6 ? '🎉' : '💪';
    _sndComplete();
    const seen = new Set();
    const skippedUnique = _spellSkipped.filter(w => { if (seen.has(w.word)) return false; seen.add(w.word); return true; });
    wrap.innerHTML = `
      ${_playHeaderHtml('스펠링 채우기', 'GameApp._printSpell()')}
      <div class="gm-play-body">
        <div class="gm-quiz-end">
          <div class="gm-quiz-end-emoji">${emoji}</div>
          <div class="gm-quiz-end-score">${_spellQ.length}개 중 ${_spellScore}개 완성했어요!</div>
          <div class="gm-replay-row">
            <button class="gm-replay-btn" onclick="GameApp._reshuffleSpell()">🔁 처음부터 다시</button>
            ${skippedUnique.length ? `<button class="gm-replay-btn wrong-only" onclick="GameApp._retrySkippedOnly()">🎯 놓친 ${skippedUnique.length}개만 다시</button>` : ''}
          </div>
        </div>
        ${skippedUnique.length ? `<div class="gm-review">
          <div class="gm-review-title">📖 시간 초과로 놓친 단어</div>
          ${skippedUnique.map(w => `
            <div class="gm-review-item">
              <span class="gm-review-word">${_esc(w.word)}</span>
              <span class="gm-review-meaning">${_esc(w.meaning)}</span>
              <button class="gm-review-speak" onclick="GameApp._speakWord('${_esc(w.word).replace(/'/g, "\\'")}')">🔊</button>
            </div>`).join('')}
        </div>` : ''}
      </div>`;
  }
  function _retrySkippedOnly() {
    const wrap = _q('gm-play');
    if (!wrap) return;
    const seen = new Set();
    const pool = _spellSkipped.filter(w => { if (seen.has(w.word)) return false; seen.add(w.word); return true; });
    if (!pool.length) return;
    _spellQ = _pickWords(pool.length, pool); _spellIdx = 0; _spellScore = 0; _spellSkipped = [];
    _renderSpellWord(wrap);
  }
  function _reshuffleSpell() { const wrap = _q('gm-play'); if (wrap) _renderSpellGame(wrap); }
  function _printSpell() {
    if (typeof window.jspdf === 'undefined') { alert('PDF 라이브러리를 불러오지 못했습니다'); return; }
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' });
    _applyKoreanFont(pdf);
    const margin = 40; let y = margin;
    pdf.setFontSize(16); pdf.text(`${_sourceTitle} — 스펠링 채우기`, margin, y); y += 24;
    pdf.setFontSize(10); pdf.setTextColor(120); pdf.text('뜻을 보고 빈칸에 알맞은 철자를 써넣으세요.', margin, y); y += 26; pdf.setTextColor(0);
    pdf.setFontSize(13);
    _spellQ.forEach((q, i) => {
      if (y > 740) { pdf.addPage(); y = margin; }
      const word = q.word.toUpperCase();
      const blanks = _makeBlanks(word); // ★ 인쇄본은 화면과 별개로 새로 빈칸 위치를 뽑음(매번 다른 문제지)
      const display = word.split('').map((ch, idx) => blanks.includes(idx) ? '_' : ch).join(' ');
      pdf.text(`${i + 1}. ${display}`, margin, y); y += 16;
      pdf.setFontSize(10.5); pdf.setTextColor(120);
      pdf.text(`(뜻: ${q.meaning})`, margin + 14, y); y += 24;
      pdf.setFontSize(13); pdf.setTextColor(0);
    });
    pdf.save(`${_sourceTitle.replace(/[^\w가-힣 ]/g, '')}_스펠링.pdf`);
  }

  /* ── 스피드 퀴즈 게임 ── */
  let _quizQ = [], _quizIdx = 0, _quizScore = 0, _quizTimer = null, _quizWrong = [];
  const QUIZ_SEC = 15;
  function _renderQuizGame(wrap, poolOverride) {
    _quizQ = _pickWords(10, poolOverride);
    _quizIdx = 0; _quizScore = 0; _quizWrong = [];
    _renderQuizQuestion(wrap);
  }
  function _renderQuizQuestion(wrap) {
    clearInterval(_quizTimer);
    if (_quizIdx >= _quizQ.length) { _renderQuizEnd(wrap); return; }
    const q = _quizQ[_quizIdx];
    const wrongPool = _words.filter(w => w.word !== q.word);
    const wrongs = [];
    while (wrongs.length < 3 && wrongPool.length) {
      const pick = wrongPool.splice(Math.floor(Math.random() * wrongPool.length), 1)[0];
      if (pick) wrongs.push(pick.meaning);
    }
    while (wrongs.length < 3) wrongs.push('—'); // 단어가 너무 적을 때의 대비
    const choices = [q.meaning, ...wrongs].sort(() => Math.random() - 0.5);
    wrap.innerHTML = `
      ${_playHeaderHtml('스피드 퀴즈', 'GameApp._printQuiz()')}
      <div class="gm-play-body">
        <div class="gm-quiz-score">${_quizIdx + 1} / ${_quizQ.length}문제 · 점수 ${_quizScore}</div>
        <div class="gm-quiz-timerbar"><div class="gm-quiz-timerfill" id="gm-timerfill" style="width:100%"></div></div>
        <div class="gm-quiz-word-row">
          <span class="gm-quiz-word">${_esc(q.word)}</span>
          <button class="gm-quiz-speak-btn" onclick="GameApp._speakCurrent()" title="다시 듣기">🔊</button>
        </div>
        <div class="gm-quiz-pos">${_esc(q.pos || '')}</div>
        <div class="gm-quiz-choices" id="gm-quiz-choices">${choices.map((c, i) => `
          <button class="gm-quiz-choice" style="background:${_cardBg(i)};animation-delay:${i * 70}ms" onclick="GameApp._quizAnswer(this, ${c === q.meaning})">${_esc(c)}</button>`).join('')}</div>
      </div>`;
    _speak(q.word); // ★ 문제 뜨자마자 자동으로 한 번 읽어줌
    let timeLeft = QUIZ_SEC * 10;
    const fill = _q('gm-timerfill');
    _quizTimer = setInterval(() => {
      timeLeft--;
      if (fill) fill.style.width = `${(timeLeft / (QUIZ_SEC * 10)) * 100}%`;
      if (timeLeft <= 0) { clearInterval(_quizTimer); _quizWrong.push(q); _sndWrong(); _quizNext(wrap); }
    }, 100);
  }
  function _speakCurrent() {
    const q = _quizQ[_quizIdx];
    if (q) _speak(q.word);
  }
  function _quizAnswer(btn, isCorrect) {
    clearInterval(_quizTimer);
    document.querySelectorAll('#gm-quiz-choices button').forEach(b => b.onclick = null);
    if (isCorrect) { btn.classList.add('correct'); _quizScore++; _sndCorrect(); _burstConfetti(btn); }
    else { btn.classList.add('wrong'); _sndWrong(); _quizWrong.push(_quizQ[_quizIdx]); }
    setTimeout(() => _quizNext(_q('gm-play')), 700);
  }
  function _quizNext(wrap) { _quizIdx++; _renderQuizQuestion(wrap); }
  function _renderQuizEnd(wrap) {
    const pct = Math.round((_quizScore / _quizQ.length) * 100);
    const emoji = pct >= 80 ? '🏆' : pct >= 50 ? '🎉' : '💪';
    _sndComplete();
    // ★ 같은 단어가 우연히 중복될 수 있어(같은 라운드에 두 번 나온 경우 등) 이름 기준으로 정리
    const wrongUnique = [];
    const seen = new Set();
    _quizWrong.forEach(w => { if (!seen.has(w.word)) { seen.add(w.word); wrongUnique.push(w); } });
    wrap.innerHTML = `
      ${_playHeaderHtml('스피드 퀴즈', 'GameApp._printQuiz()')}
      <div class="gm-play-body">
        <div class="gm-quiz-end">
          <div class="gm-quiz-end-emoji">${emoji}</div>
          <div class="gm-quiz-end-score">${_quizQ.length}문제 중 ${_quizScore}개 맞혔어요!</div>
          <div class="gm-replay-row">
            <button class="gm-replay-btn" onclick="GameApp._replayQuiz()">🔁 처음부터 다시</button>
            ${wrongUnique.length ? `<button class="gm-replay-btn wrong-only" onclick="GameApp._retryWrongOnly()">🎯 틀린 ${wrongUnique.length}개만 다시</button>` : ''}
          </div>
        </div>
        ${wrongUnique.length ? `<div class="gm-review">
          <div class="gm-review-title">📖 틀린 단어 복습</div>
          ${wrongUnique.map(w => `
            <div class="gm-review-item">
              <span class="gm-review-word">${_esc(w.word)}</span>
              <span class="gm-review-meaning">${_esc(w.meaning)}</span>
              <button class="gm-review-speak" onclick="GameApp._speakWord('${_esc(w.word).replace(/'/g, "\\'")}')">🔊</button>
            </div>`).join('')}
        </div>` : ''}
      </div>`;
  }
  function _replayQuiz() { const wrap = _q('gm-play'); if (wrap) _renderQuizGame(wrap); }
  function _retryWrongOnly() {
    const wrap = _q('gm-play');
    if (!wrap) return;
    const seen = new Set();
    const pool = _quizWrong.filter(w => { if (seen.has(w.word)) return false; seen.add(w.word); return true; });
    if (!pool.length) return;
    _renderQuizGame(wrap, pool);
  }
  function _speakWord(w) { _speak(w); }
  function _printQuiz() {
    if (typeof window.jspdf === 'undefined') { alert('PDF 라이브러리를 불러오지 못했습니다'); return; }
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' });
    _applyKoreanFont(pdf);
    const margin = 40; let y = margin;
    pdf.setFontSize(16); pdf.text(`${_sourceTitle} — 퀴즈`, margin, y); y += 26;
    pdf.setFontSize(10); pdf.setTextColor(120); pdf.text('알맞은 뜻에 동그라미 하세요.', margin, y); y += 22; pdf.setTextColor(0);
    pdf.setFontSize(12);
    _quizQ.forEach((q, i) => {
      if (y > 760) { pdf.addPage(); y = margin; }
      pdf.text(`${i + 1}. ${q.word}`, margin, y); y += 18;
      const wrongPool = _words.filter(w => w.word !== q.word).map(w => w.meaning);
      const wrongs = wrongPool.sort(() => Math.random() - 0.5).slice(0, 3);
      const choices = [q.meaning, ...wrongs].sort(() => Math.random() - 0.5);
      const letters = ['①', '②', '③', '④'];
      pdf.setFontSize(10.5);
      pdf.text(choices.map((c, j) => `${letters[j]} ${c}`).join('    '), margin + 14, y);
      pdf.setFontSize(12);
      y += 26;
    });
    pdf.save(`${_sourceTitle.replace(/[^\w가-힣 ]/g, '')}_퀴즈.pdf`);
  }

  return {
    init: async () => {}, // ★ 별도 초기화 데이터 없음(그때그때 만들어 쓰는 구조)
    render, _selectSource, _selectType, _startGame,
    _matchClick, _printMatch, _reshuffleMatch,
    _spellTileClick, _reshuffleSpell, _printSpell, _retrySkippedOnly,
    _quizAnswer, _replayQuiz, _printQuiz, _speakCurrent, _retryWrongOnly, _speakWord,
    _toggleFs, _closePlay,
  };
})();
