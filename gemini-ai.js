/**
 * gemini-ai.js — Happy Tree English Academy  v9.0
 * 최종 수정: 2025-05-26
 */
const GeminiAI = (() => {

  /* ══ API 키 ════════════════════════════════════════════════ */
  const KEYS = [
    'AIzaSyB9mhHcdftl13b3BvnvLgBkrjnsmqNKcSQ',   // KEY_1 (현재 키)  jkyuhwa
    'AIzaSyDov3-1Ct7xNjqXDW4OA20koF15hzMhfVE',   // KEY_2 ← 두 번째 계정 키 입력 kuha0879
    'AIzaSyD8zje-ZVKvuRCOsmOLbYrKQXruKH_xGd0',   // KEY_3 ← 세 번째 계정 키 입력 kuha7885
  ].map(k => k.trim()).filter(Boolean);

  const MODELS = ['gemini-2.5-flash-lite', 'gemini-2.5-flash'];
  const _ep    = (m, k) =>
    `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${k}`;
  const _delay = ms => new Promise(r => setTimeout(r, ms));

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
  async function _call(prompt, system) {
    system = system || '';
    if (!KEYS.length) throw new Error('API 키 미설정 — gemini-ai.js의 KEYS 배열을 확인하세요.');
    var errors = [];
    for (var ki = 0; ki < KEYS.length; ki++) {
      var key = KEYS[ki];
      for (var mi = 0; mi < MODELS.length; mi++) {
        var model = MODELS[mi];
        try {
          var body = {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.78, maxOutputTokens: 1024 }
          };
          if (system) body.systemInstruction = { parts: [{ text: system }] };

          var res = await fetch(_ep(model, key), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
          });

          if (res.status === 401) { errors.push(key.slice(0,8)+'...: 키무효(401)'); break; }
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
    throw new Error(
      '모든 키/모델 실패\n' + errors.map(function(e){ return '  · ' + e; }).join('\n') + '\n\n' +
      '해결: 자정 이후 재시도 또는 KEY_2/KEY_3에 다른 계정 키를 추가하세요.\n' +
      '(https://aistudio.google.com/apikey)'
    );
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

  /* ══ 5. 연결 테스트 ════════════════════════════════════════ */
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
    proofreadComment, analyzeStyle,
    getStyleSamples, addStyleSample, removeStyleSample, clearStyleSamples,
    getPins, addPin, removePin, clearPins,
    setUseGlobalPins, getUseGlobalPins,
    loadPinsFromDB, listenPinsFromDB,
    getBookPins, addBookPin, removeBookPin, clearBookPins, getMergedPins,
    getAnalysisCache, setAnalysisCache, clearStyleCache,
    testConnection, status,
  };
})();
