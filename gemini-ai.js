/**
 * gemini-ai.js — Happy Tree English Academy  v9.0
 * 최종 수정: 2025-05-26
 */
const GeminiAI = (() => {

  /* ══ API 키 ════════════════════════════════════════════════ */
  const KEYS = [
    'AQ.Ab8RN6KHM0EEZWuR-0lnSGELLNZXXI9vjuDMU9llxQ3wMkkr8w',   // KEY_1 (현재 키)  jkyuhwa
    'AQ.Ab8RN6JYj_2rbhDovFEHKv_QSsehZUcRndYw-l6ap_HVpfdsug',   // KEY_2 ← 두 번째 계정 키 입력 kuha0879
    'AQ.Ab8RN6I9_N24VfuEIA1OIonEljV6xpkzJ7viIURrIgF9P-xIOQ',   // KEY_3 ← 세 번째 계정 키 입력 kuha7885
  ].map(k => k.trim()).filter(Boolean);

  const MODELS = ['gemini-2.5-flash-lite', 'gemini-2.5-flash'];
  const _ep    = (m, k) =>
    `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${k}`;
  const _delay = ms => new Promise(r => setTimeout(r, ms));

  /* ══════════════════════════════════════════════════════════════
   * 자체 사용량 관리 — Google이 "잔여 할당량"을 클라이언트에 공개하지
   * 않기 때문에, 우리가 직접 호출 횟수를 세어서 하루 한도를 자체적으로
   * 정해둔다. 특히 영상 분석(extractVocabularyFromYoutubeVideo)은
   * 한 번에 토큰을 훨씬 많이 쓰므로 별도로 훨씬 낮은 한도를 둔다 —
   * 그래야 번역·코멘트 생성처럼 자주 쓰는 가벼운 기능이 영상 분석
   * 한 번에 그날 할당량을 다 뺏기는 일을 막을 수 있다.
   *
   * 참고: Google 공식 문서 — "요청 한도는 API 키가 아니라 프로젝트
   * 단위로 적용되고, 일일 한도(RPD)는 태평양시(UTC-8) 자정에 초기화"
   * (https://ai.google.dev/gemini-api/docs/rate-limits) — 그래서
   * 날짜 구분도 로컬 날짜가 아니라 태평양시 기준으로 맞춘다.
   * ══════════════════════════════════════════════════════════════ */
  const DAILY_BUDGET = { video: 5, text: 120 }; // ★ 정확한 구글 한도를 모르니 보수적인 자체 안전장치일 뿐
  const COOLDOWN_MIN = 15; // ★ 모든 키/모델이 다 실패했을 때, 이 시간 동안은 재시도 없이 바로 안내만
  const _usagePath = day => `hakwon10/aiUsage/${day}`;
  function _ptDateKey(d) {
    // ★ UTC-8 고정(서머타임 미반영) — 대략적인 날짜 구분용이라 정밀한 리셋 시각까지는 보장 못 함
    const t = (d || new Date()).getTime() - 8 * 3600 * 1000;
    return new Date(t).toISOString().slice(0, 10);
  }
  async function _loadUsage(day) {
    try {
      if (typeof FireDB !== 'undefined' && FireDB.ready && FireDB.ready()) {
        const v = await FireDB.get(_usagePath(day));
        if (v && typeof v === 'object') return v;
      }
    } catch (e) { console.warn('[GeminiAI] 사용량 조회 실패(허용 처리)', e); }
    // ★ Firebase를 못 쓰면 이 기기에서만이라도 세어서 최소한의 보호는 하도록 폴백
    try { return JSON.parse(localStorage.getItem('ht_ai_usage_' + day) || 'null') || {}; } catch (e) { return {}; }
  }
  async function _saveUsage(day, usage) {
    try {
      if (typeof FireDB !== 'undefined' && FireDB.ready && FireDB.ready()) { await FireDB.set(_usagePath(day), usage); return; }
    } catch (e) { console.warn('[GeminiAI] 사용량 저장 실패(허용 처리)', e); }
    try { localStorage.setItem('ht_ai_usage_' + day, JSON.stringify(usage)); } catch (e) {}
  }
  /* 호출 전 체크 + 선반영(비관적으로 먼저 카운트) — 초과 시 네트워크 요청 자체를 안 보내서 할당량을 아낀다 */
  async function _checkAndReserveBudget(feature) {
    const day = _ptDateKey();
    const usage = await _loadUsage(day);
    if (usage.cooldownUntil && Date.now() < usage.cooldownUntil) {
      const mins = Math.ceil((usage.cooldownUntil - Date.now()) / 60000);
      throw new Error(`AI 사용량이 많아 잠시 제한 중입니다. 약 ${mins}분 후 다시 시도해주세요.`);
    }
    const cap = DAILY_BUDGET[feature] != null ? DAILY_BUDGET[feature] : DAILY_BUDGET.text;
    const used = usage[feature] || 0;
    if (used >= cap) {
      throw new Error(`오늘 이 기능(${feature === 'video' ? '영상 분석' : 'AI 텍스트 생성'})의 자체 사용 한도(${cap}회)에 도달했습니다.\n태평양시 자정(한국시간 오후 4~5시경) 이후 다시 시도해주세요.`);
    }
    usage[feature] = used + 1;
    await _saveUsage(day, usage);
    return { day, usage };
  }
  async function _recordFullExhaustion() {
    try {
      const day = _ptDateKey();
      const usage = await _loadUsage(day);
      usage.cooldownUntil = Date.now() + COOLDOWN_MIN * 60000;
      await _saveUsage(day, usage);
    } catch (e) {}
  }
  /* 관리자 화면 등에서 오늘 사용량을 보여주고 싶을 때 쓸 수 있도록 공개 */
  async function getUsageToday() {
    const day = _ptDateKey();
    const usage = await _loadUsage(day);
    return {
      day,
      video: { used: usage.video || 0, cap: DAILY_BUDGET.video },
      text: { used: usage.text || 0, cap: DAILY_BUDGET.text },
      cooldownUntil: usage.cooldownUntil || null,
    };
  }

  /* ══ localStorage ════════════════════════════════════════== */
  const LS_STYLE    = 'ht_style_samples';
  const LS_PINS     = 'ht_style_pins';
  const LS_ANALYSIS = 'ht_style_analysis';
  const _lg = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
  const _ls = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

  /* ══ Style DNA ════════════════════════════════════════════ */
  function getStyleSamples()   { return _lg(LS_STYLE) || []; }
  function addStyleSample(txt) {
    var t = (txt || '').trim(); if (t.length < 10) return false;
    var arr = getStyleSamples().filter(function(s){ return s !== t; }); arr.push(t);
    _ls(LS_STYLE, arr.slice(-20)); return true;
  }
  function removeStyleSample(idx) { var a = getStyleSamples(); a.splice(idx, 1); _ls(LS_STYLE, a); }
  function clearStyleSamples() { localStorage.removeItem(LS_STYLE); }

  /* ══ 스타일 분석 캐시 ══════════════════════════════════════ */
  function getAnalysisCache()  { return _lg(LS_ANALYSIS); }
  function setAnalysisCache(v) { _ls(LS_ANALYSIS, v); }
  function clearStyleCache()   { localStorage.removeItem(LS_ANALYSIS); }

  /* ══ 고정 멘트 — 공용 ══════════════════════════════════════ */
  var _FB_PINS_PATH = 'hakwon10/globalPins';
  var _pinsLoaded   = false;
  var _useGlobalPins = false;

  function getPins() { return _lg(LS_PINS) || []; }

  function _syncPinsToFB(arr) {
    if (typeof FireDB !== 'undefined' && FireDB.ready()) {
      FireDB.set(_FB_PINS_PATH, arr.length ? arr : null)
        .catch(function(e){ console.warn('[GeminiAI] 공용멘트 FB저장 실패', e); });
    }
  }
  async function loadPinsFromDB() {
    if (!_pinsLoaded && typeof FireDB !== 'undefined' && FireDB.ready()) {
      try {
        var val = await FireDB.get(_FB_PINS_PATH);
        if (Array.isArray(val) && val.length) { _ls(LS_PINS, val); }
      } catch(e) { console.warn('[GeminiAI] 공용멘트 로드 실패', e); }
      _pinsLoaded = true;
    }
  }
  function listenPinsFromDB() {
    if (typeof FireDB !== 'undefined' && FireDB.ready()) {
      FireDB.listen(_FB_PINS_PATH, function(val) {
        if (Array.isArray(val)) _ls(LS_PINS, val);
        else if (val === null)  _ls(LS_PINS, []);
      });
    }
  }
  function addPin(txt) {
    var t = (txt || '').trim(); if (!t) return false;
    var arr = getPins().filter(function(p){ return p !== t; }); arr.push(t);
    arr = arr.slice(-15); _ls(LS_PINS, arr); _syncPinsToFB(arr); return true;
  }
  function removePin(idx) {
    var a = getPins(); a.splice(idx, 1); _ls(LS_PINS, a); _syncPinsToFB(a);
  }
  function clearPins() { _ls(LS_PINS, []); _syncPinsToFB([]); }
  function setUseGlobalPins(v) { _useGlobalPins = !!v; }
  function getUseGlobalPins()  { return _useGlobalPins; }

  /* ══ 고정 멘트 — 교재별 ════════════════════════════════════ */
  var _pinKeyB = function(bid) { return LS_PINS + ':' + bid; };

  function getBookPins(bookId) { return bookId ? (_lg(_pinKeyB(bookId)) || []) : []; }
  function addBookPin(bookId, txt) {
    if (!bookId) return addPin(txt);
    var t = (txt || '').trim(); if (!t) return false;
    var arr = getBookPins(bookId).filter(function(p){ return p !== t; }); arr.push(t);
    _ls(_pinKeyB(bookId), arr.slice(-15)); return true;
  }
  function removeBookPin(bookId, idx) {
    var a = getBookPins(bookId); a.splice(idx, 1); _ls(_pinKeyB(bookId), a);
  }
  function clearBookPins(bookId) { if (bookId) localStorage.removeItem(_pinKeyB(bookId)); }

  /* 공용 + 교재별 합산 (useGlobalPins 플래그 반영) */
  function getMergedPins(bookId) {
    var b = getBookPins(bookId);
    if (_useGlobalPins) {
      var g = getPins();
      return b.concat(g.filter(function(p){ return b.indexOf(p) === -1; }));
    }
    return b;
  }

  /* ══ 핵심 API 호출 ════════════════════════════════════════ */
  async function _call(prompt, system, maxTokens, feature) {
    system = system || '';
    maxTokens = maxTokens || 1024;
    feature = feature || 'text';
    if (!KEYS.length) throw new Error('API 키 미설정 — gemini-ai.js의 KEYS 배열을 확인하세요.');
    await _checkAndReserveBudget(feature); // ★ 한도 초과/쿨다운 중이면 네트워크 호출 없이 바로 중단
    var errors = [];
    for (var ki = 0; ki < KEYS.length; ki++) {
      var key = KEYS[ki];
      for (var mi = 0; mi < MODELS.length; mi++) {
        var model = MODELS[mi];
        try {
          var body = {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.78, maxOutputTokens: maxTokens }
          };
          if (system) body.systemInstruction = { parts: [{ text: system }] };

          var res = await fetch(_ep(model, key), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
          });

          if (res.status === 401) { errors.push(key.slice(0,8)+'...: 키무효(401)'); break; }
          if (res.status === 403) { errors.push(key.slice(0,8)+'...: 권한/할당량 문제로 추정(403)'); break; }
          if (res.status === 429) { errors.push(key.slice(0,8)+'...: 한도소진(429)'); break; }
          if (res.status === 404) { errors.push(model+': 모델없음(404)'); continue; }
          if (res.status === 503) { await _delay(500); errors.push(model+': 503'); continue; }
          if (!res.ok) {
            var t = await res.text().catch(function(){ return ''; });
            if (res.status === 400 && t.toLowerCase().includes('api key')) {
              errors.push(key.slice(0,8)+'...: 키만료(400)'); break;
            }
            throw new Error('API ' + res.status + ': ' + t.slice(0, 100));
          }

          var data = await res.json();
          var text = (data && data.candidates && data.candidates[0] &&
                      data.candidates[0].content && data.candidates[0].content.parts &&
                      data.candidates[0].content.parts[0] &&
                      data.candidates[0].content.parts[0].text) || '';
          if (!text) {
            var reason = (data && data.candidates && data.candidates[0] && data.candidates[0].finishReason) || '?';
            if (reason === 'SAFETY') throw new Error('안전 필터 차단');
            errors.push(model + ': 빈응답(' + reason + ')'); continue;
          }
          console.info('[GeminiAI v9] ✓ ' + key.slice(0,8) + '/' + model);
          return text.trim().replace(/^["']|["']$/g, '');

        } catch (e) {
          if (e.message && e.message.includes('안전 필터')) throw e;
          errors.push(model + ': ' + (e.message || e).toString().slice(0, 50));
        }
      }
    }
    await _recordFullExhaustion(); // ★ 키/모델 전부 실패 — 잠시 동안은 재시도해도 어차피 안 되니 쿨다운으로 막아둠
    throw new Error(
      '모든 키/모델 실패\n' + errors.map(function(e){ return '  · ' + e; }).join('\n') + '\n\n' +
      '해결: 자정 이후 재시도 또는 KEY_2/KEY_3에 다른 계정 키를 추가하세요.\n' +
      '(https://aistudio.google.com/apikey)'
    );
  }

  // ★ 유튜브 영상 링크를 Gemini API에 직접 넘겨서 분석시키는 함수 —
  //   구글이 공식 문서로 지원을 명시한 기능(현재 프리뷰 단계, 무료).
  //   우리가 영상을 직접 내려받는 게 아니라, 구글 자체 인프라가 유튜브
  //   영상을 처리하는 방식이라 지난번 "다운로드 금지" 원칙과는 무관하다.
  async function _callWithYoutube(youtubeUrl, prompt, maxTokens) {
    maxTokens = maxTokens || 2048;
    if (!KEYS.length) throw new Error('API 키 미설정');
    await _checkAndReserveBudget('video'); // ★ 영상 분석 전용의 낮은 자체 한도부터 확인
    var errors = [];
    for (var ki = 0; ki < KEYS.length; ki++) {
      var key = KEYS[ki];
      for (var mi = 0; mi < MODELS.length; mi++) {
        var model = MODELS[mi];
        try {
          var body = {
            contents: [{ parts: [
              { file_data: { file_uri: youtubeUrl } },
              { text: prompt }
            ] }],
            generationConfig: { temperature: 0.4, maxOutputTokens: maxTokens }
          };
          var res = await fetch(_ep(model, key), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
          });
          if (res.status === 401) { errors.push(key.slice(0,8)+'...: 키무효(401)'); break; }
          if (res.status === 403) { errors.push(key.slice(0,8)+'...: 권한/할당량 문제로 추정(403)'); break; }
          if (res.status === 429) { errors.push(key.slice(0,8)+'...: 한도소진(429)'); break; }
          if (res.status === 404) { errors.push(model+': 모델없음(404, 영상 지원 안 되는 모델일 수 있음)'); continue; }
          if (res.status === 503) { await _delay(500); errors.push(model+': 503'); continue; }
          if (!res.ok) {
            var t = await res.text().catch(function(){ return ''; });
            throw new Error('API ' + res.status + ': ' + t.slice(0, 150));
          }
          var data = await res.json();
          var text = (data && data.candidates && data.candidates[0] &&
                      data.candidates[0].content && data.candidates[0].content.parts &&
                      data.candidates[0].content.parts[0] &&
                      data.candidates[0].content.parts[0].text) || '';
          if (!text) {
            var reason = (data && data.candidates && data.candidates[0] && data.candidates[0].finishReason) || '?';
            if (reason === 'SAFETY') throw new Error('안전 필터 차단');
            errors.push(model + ': 빈응답(' + reason + ')'); continue;
          }
          return text.trim();
        } catch (e) {
          if (e.message && e.message.includes('안전 필터')) throw e;
          errors.push(model + ': ' + (e.message || e).toString().slice(0, 80));
        }
      }
    }
    await _recordFullExhaustion();
    throw new Error('영상 분석 실패\n' + errors.map(function(e){ return '  · ' + e; }).join('\n'));
  }

  // ★ 영상 워크시트용 — 유튜브 링크만으로 바로 단어를 추출한다(대본 필요 없음)
  async function extractVocabularyFromYoutubeVideo(youtubeUrl, topic) {
    const prompt = `이 유튜브 영상은 초등학생 대상 영어 교육 영상이다(주제: ${topic || '일반'}).
영상 속 음성과 화면 내용을 바탕으로 아래 두 가지를 뽑아서, 설명 없이 JSON 하나만 출력해줘.

1. words: 초등학생이 배우기 좋은 핵심 영단어 8~15개
2. sentences: 영상에서 실제로 말한 핵심 문장 중 학습에 도움되는 것 15~20개(전체 대사가 아니라 통문장 통째로 익히기 좋은 것 위주로 선별)와 그 한글 뜻

형식: {"words":[{"word":"영단어","meaning":"한글 뜻","example":"영상에 나온 문장 또는 쉬운 예문","pos":"품사(명사/동사/형용사 등 한글로)"}],"sentences":[{"en":"영상에 나온 영어 문장 그대로","ko":"한글 뜻"}]}`;
    const out = await _callWithYoutube(youtubeUrl, prompt, 3072);
    const cleaned = out.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    const words = Array.isArray(parsed?.words) ? parsed.words.filter(w => w && w.word && w.meaning) : [];
    const sentences = Array.isArray(parsed?.sentences) ? parsed.sentences.filter(s => s && s.en && s.ko) : [];
    if (!words.length && !sentences.length) throw new Error('예상치 못한 응답 형식');
    return { words, sentences };
  }

  /* ══ 프롬프트 빌더 ════════════════════════════════════════ */
  function _buildContext(opts) {
    opts = opts || {};
    var bookStatus   = opts.bookStatus   || {};
    var studentInfo  = opts.studentInfo  || {};
    var prevComments = opts.prevComments || [];
    var bookId       = bookStatus.bookId || '';
    var activePins   = (opts.activePins != null) ? opts.activePins : getMergedPins(bookId);

    var name    = typeof studentInfo === 'string' ? studentInfo : (studentInfo.name || '학생');
    var word    = studentInfo.word    || null;
    var reading = studentInfo.reading || null;
    var gender  = studentInfo.gender  || '';

    var wPct = (word && word.totalQ > 0) ? Math.round((word.pass / word.totalQ) * 100) : null;
    var rVals = reading
      ? Object.values(reading).map(function(v){ return typeof v === 'object' ? v.score : null; }).filter(function(s){ return s != null; })
      : [];
    var rPct = rVals.length ? Math.round(rVals.reduce(function(a,b){ return a+b; }, 0) / rVals.length) : null;

    var bookLine = '';
    if (bookStatus.currentBook) {
      bookLine = '\n현재 교재: ' + bookStatus.currentBook;
      if (bookStatus.isCompleted) {
        bookLine += ' (이번 달 이수 완료 ✓)';
        if (bookStatus.nextBook) bookLine += '\n다음 교재: ' + bookStatus.nextBook + '로 진행 예정';
      }
    }
    var memoLine = bookStatus.teacherMemo ? '\n선생님 메모: ' + bookStatus.teacherMemo : '';

    var pinLine = activePins.length
      ? '\n\n[고정 멘트 — 아래 문구를 코멘트에 반드시 자연스럽게 녹여 넣으세요]\n' +
        activePins.map(function(p, i){ return '고정멘트' + (i+1) + ': "' + p + '"'; }).join('\n')
      : '';

    var prevLine = prevComments.length
      ? '\n\n[이 학생의 이전 코멘트 — 동일 어조로 이어지도록]\n' +
        prevComments.slice(0, 3).map(function(c, i){ return '이전' + (i+1) + ': "' + c + '"'; }).join('\n')
      : '';

    var samples = getStyleSamples().filter(function(s){ return s.length > 10; });
    var styleLine = samples.length
      ? '\n\n[선생님 작성 스타일 DNA — 이 문체와 어조를 최대한 흉내내세요]\n' +
        samples.slice(-6).map(function(s, i){ return '샘플' + (i+1) + ': "' + s + '"'; }).join('\n')
      : '';

    return '학생: ' + name + (gender ? ' (' + gender + ')' : '') + '\n' +
           '단어 성취율: ' + (wPct != null ? wPct + '%' : '미입력') + '\n' +
           '리딩 성취율: ' + (rPct != null ? rPct + '%' : '미입력') +
           bookLine + memoLine + pinLine + prevLine + styleLine;
  }

  /* ══ 1. 코멘트 생성 ════════════════════════════════════════ */
  async function generateComment(studentInfo, bookStatus, extraOpts) {
    bookStatus = bookStatus || {};
    extraOpts  = extraOpts  || {};
    var prevComments = extraOpts.prevComments || [];
    var bookId       = bookStatus.bookId || '';
    var activePins   = (extraOpts.activePins != null) ? extraOpts.activePins : getMergedPins(bookId);

    // 스타일 캐시 주입
    var cached = getAnalysisCache();
    var styleSection = cached
      ? '\n\n[선생님 글쓰기 스타일 — 아래 분석 결과를 반드시 반영하세요]\n' + cached
      : '\n\n[호칭]: 이름 뒤에 "이/가" 또는 "우리 [이름]" 형태로 다정하게 호칭하세요.';

    var system =
      '당신은 대한민국 초등학생 전담 영어학원 선생님입니다.\n' +
      '학부모께 알림장처럼 전달하는 따뜻한 코멘트를 작성합니다.\n' +
      '규칙:\n' +
      '1. 반드시 한국어 존댓말(~습니다/합니다)만 사용\n' +
      '2. 점수 숫자 대신 노력·성장·태도·참여도 위주로 칭찬\n' +
      '3. 3~5문장: 잘한 점 → 구체적 칭찬 → 앞으로 응원\n' +
      '4. 고정 멘트가 있으면 반드시 자연스럽게 포함 (없으면 생략)\n' +
      '5. "이혜온 학생" 같은 성+이름+학생 형태 절대 금지\n' +
      '6. 코멘트 본문 텍스트만 반환, 그 외 일절 금지' +
      styleSection;

    var prompt = _buildContext({ studentInfo: studentInfo, bookStatus: bookStatus, prevComments: prevComments, activePins: activePins });
    return await _call(prompt, system);
  }

  /* ══ 2. 복수 버전 생성 ════════════════════════════════════ */
  async function generateVariants(studentInfo, bookStatus, extraOpts, count) {
    bookStatus = bookStatus || {};
    extraOpts  = extraOpts  || {};
    count      = count      || 3;
    var prevComments = extraOpts.prevComments || [];
    var bookId       = bookStatus.bookId || '';
    var activePins   = (extraOpts.activePins != null) ? extraOpts.activePins : getMergedPins(bookId);

    var system =
      '당신은 대한민국 초등학생 전담 영어학원 선생님입니다.\n' +
      '학부모용 코멘트를 서로 다른 스타일로 정확히 ' + count + '개 작성합니다.\n' +
      '규칙:\n' +
      '1. 한국어 존댓말 전용\n' +
      '2. 노력·성장 위주 칭찬\n' +
      '3. 각 버전은 길이·강조점·표현 방식이 달라야 함\n' +
      '4. 고정 멘트가 있으면 모든 버전에 자연스럽게 포함 (없으면 생략)\n' +
      '5. 아래 JSON 형식으로만 응답 (다른 텍스트 절대 금지):\n' +
      '["버전1 전체 텍스트","버전2 전체 텍스트","버전3 전체 텍스트"]';

    var prompt = _buildContext({ studentInfo: studentInfo, bookStatus: bookStatus, prevComments: prevComments, activePins: activePins }) +
      '\n\n위 정보로 ' + count + '개의 서로 다른 코멘트 버전을 JSON 배열로 작성하세요.';

    var raw = await _call(prompt, system);
    try {
      var cleaned = raw.replace(/```json|```/gi, '').trim();
      var arr = JSON.parse(cleaned);
      if (Array.isArray(arr) && arr.length > 0) return arr.map(function(s){ return String(s).trim(); });
    } catch(e) {}
    return [raw];
  }

  /* ══ 3. 문법 교정 ══════════════════════════════════════════ */
  async function proofreadComment(text) {
    var system = '한국어 교정 전문가. 맞춤법·문법·어색한 표현 교정.\n원래 의미와 존댓말 톤 유지. 교정된 텍스트만 반환.';
    return await _call(text, system);
  }

  /* ══ 4. 스타일 분석 ════════════════════════════════════════ */
  async function analyzeStyle() {
    var samples = getStyleSamples();
    if (samples.length < 2) throw new Error('분석에는 샘플 2개 이상이 필요합니다.');

    var system =
      '당신은 한국어 글쓰기 패턴 분석 전문가입니다.\n' +
      '아래 선생님이 작성한 코멘트 샘플들을 분석하여 다음 항목을 한국어로 답하세요.\n' +
      '형식: 각 항목을 "[항목명]: 내용" 형태로 줄바꿈해서 작성.\n\n' +
      '[분석 항목]\n' +
      '1. 호칭 방식: 학생을 어떻게 부르는가? (예: "우리 혜온이", "민준이" 등 실제 패턴)\n' +
      '2. 문장 어조: 전반적인 말투와 감정 온도\n' +
      '3. 문장 구조: 주로 몇 문장? 어떤 순서?\n' +
      '4. 자주 쓰는 표현: 반복적으로 등장하는 단어나 문구\n' +
      '5. 특이 사항: 그 외 눈에 띄는 특징\n\n' +
      '분석 결과만 반환하고, 서론/결론 같은 부가 설명은 금지.';

    var prompt = '[선생님 작성 코멘트 샘플]\n\n' +
      samples.slice(0, 10).map(function(s, i){ return (i+1) + '. ' + s; }).join('\n\n');

    var result = await _call(prompt, system);
    // 분석 결과 캐시 저장
    setAnalysisCache(result);
    return result;
  }

  /* ══ 5. 학생 성장 트렌드 분석 ════════════════════════════════ */
  async function analyzeStudentTrend(trendData) {
    var system =
      '당신은 영어학원 학습 분석 전문가입니다.\n' +
      '학생의 교재별 평가 데이터를 분석하여 성장 리포트를 작성합니다.\n' +
      '아래 JSON 형식으로만 응답하세요 (Markdown 코드블럭 없이 순수 JSON):\n' +
      '{"summary":"2~3문장 성장 요약(한국어)","strengths":["강점1","강점2"],"improvements":["개선포인트1","개선포인트2"],"direction":"다음 단계 방향 1문장","trend":"improving|stable|declining"}\n\n' +
      '규칙:\n' +
      '1. 단어/리딩 성취율 변화 추이를 구체적으로 언급\n' +
      '2. 반 평균 대비 분석 포함 (avgWord/avgRd 데이터 있을 때)\n' +
      '3. 따뜻하고 격려하는 어조 (학부모/학생이 볼 수 있음)\n' +
      '4. trend는 전체 흐름을 improving/stable/declining 중 하나로 판단';

    var prompt =
      '[학생 정보]\n' +
      '이름: ' + (trendData.studentName || '학생') + '\n' +
      '반: '   + (trendData.classCode   || '미지정') + '\n\n' +
      '[교재별 평가 데이터 (날짜순)]\n' +
      trendData.books.map(function(b, i) {
        var line = (i+1) + '. ' + b.book + ' (' + b.date + ')';
        if (b.wordAch != null) line += ' | 단어 ' + b.wordAch + '%' + (b.avgWord != null ? ' (반평균 ' + b.avgWord + '%)' : '');
        if (b.rdAch   != null) line += ' | 리딩 ' + b.rdAch   + '%' + (b.avgRd   != null ? ' (반평균 ' + b.avgRd   + '%)' : '');
        return line;
      }).join('\n') +
      '\n\n위 데이터를 분석하여 JSON 형식으로 성장 리포트를 작성하세요.';

    var raw = await _call(prompt, system);
    try {
      var cleaned = raw.replace(/```json|```/gi, '').trim();
      return JSON.parse(cleaned);
    } catch(e) {
      return { summary: raw, strengths: [], improvements: [], direction: '', trend: 'stable' };
    }
  }

  /* ══ 6. 연결 테스트 ════════════════════════════════════════ */
  // ★ 오늘의 명언(대시보드) 영어 번역용 — 짧고 품격있는 한 문장 번역만 반환
  async function translateToEnglish(koreanText) {
    const prompt = '다음 한국어 명언을 자연스럽고 품격있는 영어 한 문장으로 번역해줘. '
      + '설명이나 따옴표 없이 번역문 한 줄만 출력해:\n\n' + koreanText;
    const out = await _call(prompt);
    return out.replace(/\n+/g, ' ').trim();
  }

  // ★ 영문 교육영상 스크립트에서 초등 수준 어휘 추출(자료실 - 영문 교육자료용)
  async function extractVocabulary(script, topic) {
    const prompt = `다음은 초등학생 대상 영어 교육 영상의 대본이다(주제: ${topic || '일반'}).
이 대본에서 초등학생이 배우기 좋은 핵심 단어를 8~15개 골라서, 아래 JSON 배열 형식으로만 출력해줘.
설명이나 다른 텍스트 없이 JSON만 출력할 것.

형식: [{"word":"영단어","meaning":"한글 뜻","example":"대본에 나온 그대로의 예문 또는 쉬운 새 예문","pos":"품사(명사/동사/형용사 등 한글로)"}]

대본:
${script.slice(0, 4000)}`;
    const out = await _call(prompt, '', 2048);
    const cleaned = out.replace(/```json|```/g, '').trim();
    const arr = JSON.parse(cleaned);
    if (!Array.isArray(arr)) throw new Error('예상치 못한 응답 형식');
    return arr.filter(w => w && w.word && w.meaning);
  }

  // ★ 학습 게임용 - 사용자가 직접 입력한 영단어 목록에 뜻/품사/예문을 붙여준다
  async function generateWordMeanings(words) {
    const list = words.slice(0, 30).join(', ');
    const prompt = `다음은 초등학생에게 가르칠 영단어 목록이다: ${list}
각 단어에 대해 한글 뜻, 품사, 쉬운 초등 수준 예문을 만들어서 아래 JSON 배열 형식으로만 출력해줘.
설명이나 다른 텍스트 없이 JSON만 출력할 것. 목록에 없는 단어는 만들지 말고, 목록의 단어 개수와 정확히 같은 개수로 출력해줘.

형식: [{"word":"영단어","meaning":"한글 뜻","example":"쉬운 예문","pos":"품사(명사/동사/형용사 등 한글로)"}]`;
    const out = await _call(prompt, '', 2048);
    const cleaned = out.replace(/```json|```/g, '').trim();
    const arr = JSON.parse(cleaned);
    if (!Array.isArray(arr)) throw new Error('예상치 못한 응답 형식');
    return arr.filter(w => w && w.word && w.meaning);
  }

  // ★ 영문 교육자료 - 유튜브 추천용: 주제에 맞는 좋은 영어 검색어를 만들어준다
  async function generateSearchQueries(topic) {
    const prompt = `초등학생 영어 교육용 유튜브 영상을 찾고 싶다. 주제: "${topic}".
이 주제로 원어민이 만든 초등학생용 영어 학습 영상을 찾기 좋은 영어 검색어를 2~3개 만들어줘.
설명 없이 검색어만 한 줄에 하나씩 출력해(따옴표 없이).`;
    const out = await _call(prompt);
    return out.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 3);
  }
  // ★ 실제 유튜브 검색 결과(제목/설명/채널) 중 초등 영어교육에 적합한 것을 골라 순위 매김
  async function curateVideos(topic, candidates) {
    const list = candidates.map((c, i) => `${i}. 제목: ${c.title}\n   채널: ${c.channelTitle}\n   설명: ${(c.description || '').slice(0, 150)}`).join('\n');
    const prompt = `아래는 유튜브 검색 결과 목록이다(주제: "${topic}", 초등학생 영어 교육용 영상을 찾는 중).
이 중에서 초등학생 영어 학습에 적합한 것을 최대 5개 골라서, 아래 JSON 배열 형식으로만 출력해줘.
설명 없이 JSON만 출력. 부적절하거나 관련 없는 건 제외해.

형식: [{"index":번호,"reason":"이 영상을 추천하는 이유(한 문장, 한글)"}]

목록:
${list}`;
    const out = await _call(prompt, '', 1024);
    const cleaned = out.replace(/```json|```/g, '').trim();
    const arr = JSON.parse(cleaned);
    if (!Array.isArray(arr)) throw new Error('예상치 못한 응답 형식');
    return arr.filter(r => typeof r.index === 'number' && candidates[r.index]).map(r => ({ ...candidates[r.index], reason: r.reason || '' }));
  }

  async function testConnection() {
    try {
      var r = await _call('"OK"라고만 답해주세요.');
      return { ok: true, message: r, keys: KEYS.length, samples: getStyleSamples().length };
    } catch(e) {
      return { ok: false, message: e.message, keys: KEYS.length };
    }
  }

  function status() {
    console.info('[GeminiAI v9] 키:' + KEYS.length + ' / 스타일샘플:' + getStyleSamples().length + ' / 공용멘트:' + getPins().length + '\n모델:' + MODELS.join(','));
    return { keys: KEYS.length, samples: getStyleSamples().length, globalPins: getPins().length };
  }

  return {
    generateComment, generateVariants,
    proofreadComment, analyzeStyle, analyzeStudentTrend,
    getStyleSamples, addStyleSample, removeStyleSample, clearStyleSamples,
    getPins, addPin, removePin, clearPins,
    setUseGlobalPins, getUseGlobalPins,
    loadPinsFromDB, listenPinsFromDB,
    getBookPins, addBookPin, removeBookPin, clearBookPins, getMergedPins,
    getAnalysisCache, setAnalysisCache, clearStyleCache,
    testConnection, status, translateToEnglish, extractVocabulary, generateWordMeanings, extractVocabularyFromYoutubeVideo,
    generateSearchQueries, curateVideos, getUsageToday,
  };
})();
