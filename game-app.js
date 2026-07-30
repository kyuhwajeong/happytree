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

  let _words = [];       // 현재 게임에 쓸 {word, meaning, example, pos}[]
  let _sourceTitle = ''; // 워크시트 제목(인쇄물 헤더용)
  let _cssInjected = false;

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
.gm-play{position:fixed;inset:0;background:linear-gradient(160deg,#FFF7E6,#E6F7FF);z-index:300;display:flex;flex-direction:column}
.gm-play-hdr{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;flex-shrink:0}
.gm-play-title{font-size:16px;font-weight:900;color:#2b2d42}
.gm-play-acts{display:flex;gap:8px}
.gm-play-btn{width:38px;height:38px;border-radius:50%;border:none;background:#fff;box-shadow:0 3px 10px rgba(0,0,0,.1);font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center}
.gm-play-body{flex:1;overflow-y:auto;padding:10px 18px 30px;display:flex;flex-direction:column;align-items:center}

/* 매칭 게임 */
.gm-match-wrap{display:flex;gap:24px;width:100%;max-width:720px;margin-top:10px}
.gm-match-col{flex:1;display:flex;flex-direction:column;gap:10px}
.gm-match-card{padding:14px 12px;border-radius:14px;color:#fff;font-weight:800;font-size:15px;text-align:center;cursor:pointer;
  box-shadow:0 4px 0 rgba(0,0,0,.15);transition:transform .12s;user-select:none}
.gm-match-card:active{transform:scale(.96)}
.gm-match-card.selected{outline:4px solid #2b2d42;transform:scale(1.04)}
.gm-match-card.matched{opacity:.35;pointer-events:none}
.gm-match-status{font-size:13px;font-weight:800;color:#2b2d42;margin-top:16px}

/* 스피드 퀴즈 */
.gm-quiz-timerbar{width:100%;max-width:500px;height:10px;background:#fff;border-radius:6px;overflow:hidden;margin-bottom:20px;box-shadow:inset 0 1px 3px rgba(0,0,0,.1)}
.gm-quiz-timerfill{height:100%;background:linear-gradient(90deg,#6BCB77,#FFD93D,#FF6B6B);transition:width .1s linear}
.gm-quiz-score{font-size:13px;font-weight:800;color:#2b2d42;margin-bottom:6px}
.gm-quiz-word{font-size:38px;font-weight:900;color:#2b2d42;margin-bottom:6px;text-align:center}
.gm-quiz-pos{font-size:13px;color:#868e96;margin-bottom:24px}
.gm-quiz-choices{display:grid;grid-template-columns:1fr 1fr;gap:14px;width:100%;max-width:520px}
.gm-quiz-choice{padding:20px 10px;border-radius:16px;border:none;color:#fff;font-size:16px;font-weight:800;cursor:pointer;
  box-shadow:0 4px 0 rgba(0,0,0,.15);transition:transform .1s}
.gm-quiz-choice:active{transform:scale(.96)}
.gm-quiz-choice.correct{animation:gmPulseGreen .5s}
.gm-quiz-choice.wrong{animation:gmShake .4s;opacity:.5}
@keyframes gmPulseGreen{0%,100%{box-shadow:0 4px 0 rgba(0,0,0,.15)}50%{box-shadow:0 0 0 8px rgba(107,203,119,.4)}}
@keyframes gmShake{0%,100%{transform:translateX(0)}25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}
.gm-quiz-end{text-align:center;margin-top:40px}
.gm-quiz-end-emoji{font-size:56px;margin-bottom:10px}
.gm-quiz-end-score{font-size:22px;font-weight:900;color:#2b2d42;margin-bottom:20px}
.gm-replay-btn{padding:12px 28px;border:none;border-radius:12px;background:linear-gradient(135deg,#4D96FF,#845EF7);color:#fff;font-weight:800;cursor:pointer;font-size:14px}`;
    document.head.appendChild(s);
  }

  /* ═══════════════ 설정 화면 ═══════════════ */
  let _mountId = 'page-games';
  let _srcMode = 'video'; // 'video' | 'paste'
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
            <button class="gm-source-tab${_srcMode==='video'?' on':''}" onclick="GameApp._selectSource('video')">🎬 영상 워크시트에서</button>
            <button class="gm-source-tab${_srcMode==='paste'?' on':''}" onclick="GameApp._selectSource('paste')">📝 텍스트 붙여넣기</button>
          </div>
          ${_srcMode === 'video' ? _videoSourceHtml() : _pasteSourceHtml()}
          <div class="gm-field"><label>게임 종류</label>
            <div class="gm-type-grid">
              <div class="gm-type-card${_gameType==='match'?' on':''}" onclick="GameApp._selectType('match')">
                <div class="gm-type-ico">🧩</div><div class="gm-type-lbl">짝맞추기</div>
              </div>
              <div class="gm-type-card${_gameType==='quiz'?' on':''}" onclick="GameApp._selectType('quiz')">
                <div class="gm-type-ico">⚡</div><div class="gm-type-lbl">스피드 퀴즈</div>
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
  }

  /* ═══════════════ 게임 화면(전체화면 — 빔프로젝터용) ═══════════════ */
  function _pickWords(max) {
    const arr = _words.slice();
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    return arr.slice(0, Math.min(max, arr.length));
  }
  function _openPlay() {
    const wrap = document.createElement('div');
    wrap.className = 'gm-play'; wrap.id = 'gm-play';
    document.body.appendChild(wrap);
    if (_gameType === 'match') _renderMatchGame(wrap);
    else _renderQuizGame(wrap);
  }
  function _closePlay() { _q('gm-play')?.remove(); }
  function _playHeaderHtml(title, printFn) {
    return `<div class="gm-play-hdr">
      <div class="gm-play-title">🌳 ${_esc(_sourceTitle)} — ${title}</div>
      <div class="gm-play-acts">
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
      ${_playHeaderHtml('짝맞추기', 'GameApp._printMatch()')}
      <div class="gm-play-body">
        <div class="gm-match-wrap">
          <div class="gm-match-col" id="gm-match-left">${left.map(w => `
            <div class="gm-match-card" style="background:${_colorFor(w.idx)}" data-idx="${w.idx}" data-side="l" onclick="GameApp._matchClick(this)">${_esc(w.word)}</div>`).join('')}</div>
          <div class="gm-match-col" id="gm-match-right">${right.map(w => `
            <div class="gm-match-card" style="background:${_colorFor(w.idx)}" data-idx="${w.idx}" data-side="r" onclick="GameApp._matchClick(this)">${_esc(w.meaning)}</div>`).join('')}</div>
        </div>
        <div class="gm-match-status" id="gm-match-status">${_matchWords.length}쌍 중 0쌍 맞춤</div>
      </div>`;
  }
  function _matchClick(el) {
    if (el.classList.contains('matched')) return;
    const side = el.dataset.side, idx = el.dataset.idx;
    if (side === 'l') {
      document.querySelectorAll('#gm-match-left .gm-match-card').forEach(c => c.classList.remove('selected'));
      el.classList.add('selected');
      _matchLeftSel = { el, idx };
      return;
    }
    if (!_matchLeftSel) return; // 오른쪽 먼저 누르면 무시(왼쪽부터 고르게 유도)
    if (_matchLeftSel.idx === idx) {
      _matchLeftSel.el.classList.remove('selected'); _matchLeftSel.el.classList.add('matched');
      el.classList.add('matched');
      _matchedCount++;
      const st = _q('gm-match-status');
      if (st) st.textContent = `${_matchWords.length}쌍 중 ${_matchedCount}쌍 맞춤`;
      if (_matchedCount === _matchWords.length && st) st.textContent = `🎉 다 맞췄어요! 잘했어요!`;
    } else {
      el.style.transition = 'none'; el.style.transform = 'translateX(6px)';
      setTimeout(() => { el.style.transform = ''; el.style.transition = ''; }, 150);
      _matchLeftSel.el.classList.remove('selected');
    }
    _matchLeftSel = null;
  }
  function _printMatch() {
    if (typeof window.jspdf === 'undefined') { alert('PDF 라이브러리를 불러오지 못했습니다'); return; }
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' });
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

  /* ── 스피드 퀴즈 게임 ── */
  let _quizQ = [], _quizIdx = 0, _quizScore = 0, _quizTimer = null;
  const QUIZ_SEC = 15;
  function _renderQuizGame(wrap) {
    _quizQ = _pickWords(10);
    _quizIdx = 0; _quizScore = 0;
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
        <div class="gm-quiz-word">${_esc(q.word)}</div>
        <div class="gm-quiz-pos">${_esc(q.pos || '')}</div>
        <div class="gm-quiz-choices" id="gm-quiz-choices">${choices.map((c, i) => `
          <button class="gm-quiz-choice" style="background:${_colorFor(i)}" onclick="GameApp._quizAnswer(this, ${c === q.meaning})">${_esc(c)}</button>`).join('')}</div>
      </div>`;
    let timeLeft = QUIZ_SEC * 10;
    const fill = _q('gm-timerfill');
    _quizTimer = setInterval(() => {
      timeLeft--;
      if (fill) fill.style.width = `${(timeLeft / (QUIZ_SEC * 10)) * 100}%`;
      if (timeLeft <= 0) { clearInterval(_quizTimer); _quizNext(wrap); }
    }, 100);
  }
  function _quizAnswer(btn, isCorrect) {
    clearInterval(_quizTimer);
    document.querySelectorAll('#gm-quiz-choices button').forEach(b => b.onclick = null);
    if (isCorrect) { btn.classList.add('correct'); _quizScore++; }
    else { btn.classList.add('wrong'); }
    setTimeout(() => _quizNext(_q('gm-play')), 700);
  }
  function _quizNext(wrap) { _quizIdx++; _renderQuizQuestion(wrap); }
  function _renderQuizEnd(wrap) {
    const pct = Math.round((_quizScore / _quizQ.length) * 100);
    const emoji = pct >= 80 ? '🏆' : pct >= 50 ? '🎉' : '💪';
    wrap.innerHTML = `
      ${_playHeaderHtml('스피드 퀴즈', 'GameApp._printQuiz()')}
      <div class="gm-play-body">
        <div class="gm-quiz-end">
          <div class="gm-quiz-end-emoji">${emoji}</div>
          <div class="gm-quiz-end-score">${_quizQ.length}문제 중 ${_quizScore}개 맞혔어요!</div>
          <button class="gm-replay-btn" onclick="GameApp._replayQuiz()">🔁 다시 하기</button>
        </div>
      </div>`;
  }
  function _replayQuiz() { const wrap = _q('gm-play'); if (wrap) _renderQuizGame(wrap); }
  function _printQuiz() {
    if (typeof window.jspdf === 'undefined') { alert('PDF 라이브러리를 불러오지 못했습니다'); return; }
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' });
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
    _matchClick, _printMatch,
    _quizAnswer, _replayQuiz, _printQuiz,
    _toggleFs, _closePlay,
  };
})();
