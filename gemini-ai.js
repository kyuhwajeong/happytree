/**
 * gemini-ai.js — Happy Tree English Academy  v9.0
 * 최종 수정: 2025-05-26
 *
 * v9.0 주요 변경
 *  - 스타일 분석: 호칭 패턴("우리 혜온", "혜온이") 등 구체적 추출
 *  - 생성 프롬프트: 선생님 호칭/어투를 명시적으로 AI에 전달
 *  - _buildContext: bookStatus 참조 오류 완전 수정 (v8 유지)
 *  - 고정 멘트: 공용 + 교재별 분리 관리 (v8 유지)
 */
const GeminiAI = (() => {

  /* ══ API 키 ═══════════════════════════════════════════════════ */
  const KEYS = [
    'AIzaSyB9mhHcdftl13b3BvnvLgBkrjnsmqNKcSQ',   // KEY_1 (현재 키)  jkyuhwa
    'AIzaSyDov3-1Ct7xNjqXDW4OA20koF15hzMhfVE',   // KEY_2 ← 두 번째 계정 키 입력 kuha0879
    'AIzaSyD8zje-ZVKvuRCOsmOLbYrKQXruKH_xGd0',   // KEY_3 ← 세 번째 계정 키 입력 kuha7885
  ].map(k => k.trim()).filter(Boolean);

  const MODELS = ['gemini-2.5-flash-lite', 'gemini-2.5-flash'];
  const _ep    = (m, k) =>
    `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${k}`;
  const _delay = ms => new Promise(r => setTimeout(r, ms));

  /* ══ localStorage ════════════════════════════════════════════ */
  const LS_STYLE    = 'ht_style_samples';
  const LS_PINS     = 'ht_style_pins';
  const LS_ANALYSIS = 'ht_style_analysis';   // 분석 결과 캐시
  const _lg = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
  const _ls = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

  /* ══ Style DNA ════════════════════════════════════════════════ */
  function getStyleSamples()    { return _lg(LS_STYLE) || []; }
  function addStyleSample(txt)  {
    var t = (txt||'').trim(); if (t.length < 10) return false;
    var arr = getStyleSamples().filter(function(s){ return s !== t; });
    arr.push(t); _ls(LS_STYLE, arr.slice(-20));
    // 새 샘플 추가 시 캐시 무효화
    localStorage.removeItem(LS_ANALYSIS);
    return true;
  }
  function removeStyleSample(idx) {
    var a = getStyleSamples(); a.splice(idx,1); _ls(LS_STYLE, a);
    localStorage.removeItem(LS_ANALYSIS);
  }
  function clearStyleSamples()  {
    localStorage.removeItem(LS_STYLE);
    localStorage.removeItem(LS_ANALYSIS);
  }

  /* 분석 결과 캐시 */
  function getAnalysisCache()   { return _lg(LS_ANALYSIS) || null; }
  function setAnalysisCache(v)  { _ls(LS_ANALYSIS, v); }

  /* ══ 고정 멘트 ════════════════════════════════════════════════ */
  var _pinKeyG = function() { return LS_PINS; };
  var _pinKeyB = function(bid) { return LS_PINS + ':' + bid; };

  /* 공용 멘트 — Firebase + localStorage 이중 저장
   * Firebase path: hakwon10/globalPins (배열)
   * localStorage : LS_PINS (오프라인 캐시)
   */
  var _FB_PINS_PATH = 'hakwon10/globalPins';
  var _pinsLoaded   = false;

  function getPins() { return _lg(_pinKeyG()) || []; }

  /* Firebase 동기화 */
  function _syncPinsToFB(arr) {
    if (typeof FireDB !== 'undefined' && FireDB.ready()) {
      FireDB.set(_FB_PINS_PATH, arr.length ? arr : null)
        .catch(function(e){ console.warn('[GeminiAI] 공용멘트 FB저장 실패', e); });
    }
  }
  /* Firebase에서 불러오기 (앱 초기화 시 1회 호출) */
  async function loadPinsFromDB() {
    if (!_pinsLoaded && typeof FireDB !== 'undefined' && FireDB.ready()) {
      try {
        var val = await FireDB.get(_FB_PINS_PATH);
        if (Array.isArray(val) && val.length) {
          _ls(_pinKeyG(), val);   // localStorage 캐시 업데이트
          console.info('[GeminiAI] 공용 고정 멘트 DB에서 로드:', val.length + '개');
        }
      } catch(e) { console.warn('[GeminiAI] 공용멘트 로드 실패', e); }
      _pinsLoaded = true;
    }
  }
  /* Firebase 실시간 리스닝 (다른 브라우저/기기와 동기화) */
  function listenPinsFromDB() {
    if (typeof FireDB !== 'undefined' && FireDB.ready()) {
      FireDB.listen(_FB_PINS_PATH, function(val) {
        if (Array.isArray(val)) { _ls(_pinKeyG(), val); }
        else if (val === null)  { _ls(_pinKeyG(), []); }
      });
    }
  }

  function addPin(txt) {
    var t=(txt||'').trim(); if(!t) return false;
    var arr=getPins().filter(function(p){return p!==t;}); arr.push(t);
    arr = arr.slice(-15);
    _ls(_pinKeyG(), arr);
    _syncPinsToFB(arr);
    return true;
  }
  function removePin(idx) {
    var a=getPins(); a.splice(idx,1);
    _ls(_pinKeyG(), a);
    _syncPinsToFB(a);
  }
  function clearPins() {
    _ls(_pinKeyG(), []);
    _syncPinsToFB([]);
  }

  function getBookPins(bookId)  { return bookId ? (_lg(_pinKeyB(bookId))||[]) : []; }
  function addBookPin(bookId, txt) {
    if(!bookId) return addPin(txt);
    var t=(txt||'').trim(); if(!t) return false;
    var arr=getBookPins(bookId).filter(function(p){return p!==t;}); arr.push(t);
    _ls(_pinKeyB(bookId), arr.slice(-15)); return true;
  }
  function removeBookPin(bookId,idx) {
    var a=getBookPins(bookId); a.splice(idx,1); _ls(_pinKeyB(bookId),a);
  }
  function clearBookPins(bookId)  { if(bookId) localStorage.removeItem(_pinKeyB(bookId)); }
  /* 공용 멘트 사용 여부 플래그 (기본값: false — 체크 전까지 미포함) */
  var _useGlobalPins = false;
  function setUseGlobalPins(v) { _useGlobalPins = !!v; }
  function getUseGlobalPins()  { return _useGlobalPins; }

  function getMergedPins(bookId) {
    var b = getBookPins(bookId);
    if (_useGlobalPins) {
      var g = getPins();
      return b.concat(g.filter(function(p){ return b.indexOf(p)===-1; }));
    }
    return b;  // 체크 안 됐으면 교재 전용만
  }

  /* ══ API 호출 ════════════════════════════════════════════════ */
  async function _call(prompt, system) {
    system = system || '';
    if (!KEYS.length) throw new Error('API 키 미설정 — gemini-ai.js KEYS 배열을 확인하세요.');
    var errors = [];
    for (var ki=0; ki<KEYS.length; ki++) {
      var key = KEYS[ki];
      for (var mi=0; mi<MODELS.length; mi++) {
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
            if (res.status === 400 && t.toLowerCase().indexOf('api key') !== -1) {
              errors.push(key.slice(0,8)+'...: 키만료(400)'); break;
            }
            throw new Error('API ' + res.status + ': ' + t.slice(0,100));
          }
          var data = await res.json();
          var text = (data && data.candidates && data.candidates[0] &&
                      data.candidates[0].content && data.candidates[0].content.parts &&
                      data.candidates[0].content.parts[0] &&
                      data.candidates[0].content.parts[0].text) || '';
          if (!text) {
            var reason = (data && data.candidates && data.candidates[0] &&
                          data.candidates[0].finishReason) || '?';
            if (reason === 'SAFETY') throw new Error('안전 필터 차단');
            errors.push(model+': 빈응답('+reason+')'); continue;
          }
          console.info('[GeminiAI v9] ✓ ' + key.slice(0,8)+'.../' + model);
          return text.trim().replace(/^["']|["']$/g, '');
        } catch(e) {
          if (e.message && e.message.indexOf('안전 필터') !== -1) throw e;
          errors.push(model+': '+e.message.slice(0,50));
        }
      }
    }
    throw new Error('모든 키/모델 실패\n' + errors.map(function(e){ return '  · '+e; }).join('\n') +
      '\n\n해결: 자정 이후 재시도 또는 KEY_2/KEY_3에 다른 계정 키 추가\n(https://aistudio.google.com/apikey)');
  }

  /* ══ 스타일 분석 구조체 추출 ══════════════════════════════════
   * 선생님 코멘트 샘플에서 구체적 패턴을 JSON으로 추출
   * 결과 예:
   * {
   *   호칭패턴: "우리 [이름]",
   *   온도:    "매우 따뜻하고 친근함",
   *   자주쓰는표현: ["늘 기특해요", "대견합니다"],
   *   문장구조: "칭찬 → 구체적 사례 → 응원",
   *   특이사항: "이름 뒤에 '이/가' 조사 사용, 짧고 명쾌한 문장"
   * }
   * ════════════════════════════════════════════════════════════ */
  async function _extractStyleProfile(samples) {
    var system =
      '당신은 글쓰기 스타일 분석 전문가입니다.\n' +
      '주어진 선생님 코멘트 샘플들을 분석하여 정확히 아래 JSON 형식으로만 응답하세요.\n' +
      '다른 텍스트, 설명, 마크다운 코드블록 일절 금지.\n\n' +
      '응답 형식:\n' +
      '{"호칭패턴":"예: 우리 [이름], [이름]이, [이름] 학생 등","온도":"매우 따뜻함/따뜻함/보통/격식체 중 하나","자주쓰는표현":["표현1","표현2","표현3"],"문장구조":"짧게 설명","특이사항":"기타 특징"}';

    var prompt =
      '아래 선생님이 직접 작성한 코멘트 샘플들을 분석하세요:\n\n' +
      samples.slice(-10).map(function(s,i){ return '샘플'+(i+1)+': "'+s+'"'; }).join('\n\n');

    var raw = await _call(prompt, system);
    try {
      var cleaned = raw.replace(/```json|```/gi,'').trim();
      return JSON.parse(cleaned);
    } catch(e) {
      // JSON 파싱 실패 시 기본 프로파일 반환
      return { 호칭패턴:'[이름]이/가', 온도:'따뜻함', 자주쓰는표현:[], 문장구조:'칭찬 → 응원', 특이사항:raw.slice(0,100) };
    }
  }

  /* ══ 프롬프트 빌더 ════════════════════════════════════════════ */
  function _buildContext(opts) {
    opts = opts || {};
    var bookStatus   = opts.bookStatus   || {};
    var studentInfo  = opts.studentInfo  || {};
    var prevComments = opts.prevComments || [];
    var bookId       = bookStatus.bookId || '';
    var activePins   = (opts.activePins != null) ? opts.activePins : getMergedPins(bookId);
    var styleProfile = opts.styleProfile || null;   // ★ 스타일 프로파일

    var name   = typeof studentInfo === 'string' ? studentInfo : (studentInfo.name || '학생');
    var word   = studentInfo.word   || null;
    var reading= studentInfo.reading|| null;
    var gender = studentInfo.gender || '';

    var wPct = (word && word.totalQ > 0) ? Math.round((word.pass/word.totalQ)*100) : null;
    var rVals = reading
      ? Object.values(reading).map(function(v){ return typeof v==='object' ? v.score : null; }).filter(function(s){ return s!=null; })
      : [];
    var rPct = rVals.length ? Math.round(rVals.reduce(function(a,b){return a+b;},0)/rVals.length) : null;

    var bookLine = '';
    if (bookStatus.currentBook) {
      bookLine = '\n현재 교재: ' + bookStatus.currentBook;
      if (bookStatus.isCompleted) {
        bookLine += ' (이번 달 이수 완료 ✓)';
        if (bookStatus.nextBook) bookLine += '\n다음 교재: '+bookStatus.nextBook+'로 진행 예정';
      }
    }
    var memoLine  = bookStatus.teacherMemo ? '\n선생님 메모: '+bookStatus.teacherMemo : '';
    var pinLine   = activePins.length
      ? '\n\n[고정 멘트 — 아래 문구를 코멘트에 반드시 자연스럽게 녹여 넣으세요]\n' +
        activePins.map(function(p,i){ return '고정멘트'+(i+1)+': "'+p+'"'; }).join('\n')
      : '';
    var prevLine  = prevComments.length
      ? '\n\n[이 학생의 이전 코멘트 — 동일 어조로 이어지도록]\n' +
        prevComments.slice(0,3).map(function(c,i){ return '이전'+(i+1)+': "'+c+'"'; }).join('\n')
      : '';

    // ★ 스타일 DNA — 단순 샘플 나열 대신 프로파일을 구조적으로 전달
    var styleLine = '';
    if (styleProfile) {
      styleLine  = '\n\n[선생님 스타일 가이드 — 반드시 아래 패턴을 그대로 따르세요]\n';
      styleLine += '• 학생 호칭: ' + styleProfile.호칭패턴 + ' (예: "' + name + '"을 "' +
                   styleProfile.호칭패턴.replace('[이름]', name) + '"으로 부름)\n';
      styleLine += '• 어조 온도: ' + styleProfile.온도 + '\n';
      if (styleProfile.자주쓰는표현 && styleProfile.자주쓰는표현.length) {
        styleLine += '• 자주 쓰는 표현: ' + styleProfile.자주쓰는표현.join(', ') + '\n';
      }
      styleLine += '• 문장 구조: ' + styleProfile.문장구조;
      if (styleProfile.특이사항) styleLine += '\n• 특이사항: ' + styleProfile.특이사항;
    } else {
      // 프로파일 없을 때는 기존 샘플 방식
      var samples = getStyleSamples().filter(function(s){ return s.length>10; });
      if (samples.length) {
        styleLine = '\n\n[선생님 작성 스타일 — 이 문체와 어조를 최대한 흉내내세요]\n' +
          samples.slice(-5).map(function(s,i){ return '샘플'+(i+1)+': "'+s+'"'; }).join('\n');
      }
    }

    return '학생: '+name+(gender?(' ('+gender+')'):'') +'\n'+
           '단어 성취율: '+(wPct!=null ? wPct+'%' : '미입력')+'\n'+
           '리딩 성취율: '+(rPct!=null ? rPct+'%' : '미입력')+
           bookLine + memoLine + pinLine + prevLine + styleLine;
  }

  /* ══ 1. 코멘트 생성 ═══════════════════════════════════════════ */
  async function generateComment(studentInfo, bookStatus, extraOpts) {
    bookStatus = bookStatus || {};
    extraOpts  = extraOpts  || {};
    var prevComments = extraOpts.prevComments || [];
    var bookId       = bookStatus.bookId || '';
    var activePins   = (extraOpts.activePins != null) ? extraOpts.activePins : getMergedPins(bookId);
    var styleProfile = extraOpts.styleProfile || getAnalysisCache();   // ★ 캐시된 프로파일 사용

    // 호칭 패턴을 system 프롬프트에 직접 명시
    var callingStyle = styleProfile && styleProfile.호칭패턴
      ? '학생을 부를 때는 반드시 "' + styleProfile.호칭패턴 + '" 패턴을 사용하세요. '
      : '학생을 "우리 [이름]" 또는 "[이름]이/가" 등 친근하고 다정하게 부르세요. ';

    var warmth = styleProfile && styleProfile.온도
      ? ('어조: ' + styleProfile.온도 + '.')
      : '어조: 매우 따뜻하고 친근하게.';

    var system =
      '당신은 대한민국 초등학생 전담 영어학원 선생님입니다.\n' +
      '학부모께 알림장처럼 전달하는 개인적이고 따뜻한 코멘트를 작성합니다.\n\n' +
      '★ 핵심 규칙:\n' +
      '1. 반드시 한국어 존댓말(~습니다/합니다)만 사용\n' +
      '2. ' + callingStyle + '\n' +
      '3. ' + warmth + '\n' +
      '4. 점수 숫자 대신 노력·성장·태도·참여도 위주로 칭찬 (3~5문장)\n' +
      '5. 고정 멘트가 있으면 반드시 자연스럽게 포함 (없으면 생략)\n' +
      '6. "이혜온 학생", "김민준 학생" 처럼 성+이름+학생 형태 절대 금지\n' +
      '7. 코멘트 본문만 반환 — 따옴표, 제목, 설명 일절 금지';

    var prompt = _buildContext({ studentInfo:studentInfo, bookStatus:bookStatus, prevComments:prevComments, activePins:activePins, styleProfile:styleProfile });
    return await _call(prompt, system);
  }

  /* ══ 2. 복수 버전 생성 ════════════════════════════════════════ */
  async function generateVariants(studentInfo, bookStatus, extraOpts, count) {
    bookStatus = bookStatus || {};
    extraOpts  = extraOpts  || {};
    count      = count || 3;
    var prevComments = extraOpts.prevComments || [];
    var bookId       = bookStatus.bookId || '';
    var activePins   = (extraOpts.activePins != null) ? extraOpts.activePins : getMergedPins(bookId);
    var styleProfile = extraOpts.styleProfile || getAnalysisCache();

    var callingStyle = styleProfile && styleProfile.호칭패턴
      ? '"' + styleProfile.호칭패턴 + '" 패턴으로 학생을 호칭'
      : '"우리 [이름]" 또는 "[이름]이" 등 친근하게 호칭';

    var system =
      '당신은 대한민국 초등학생 전담 영어학원 선생님입니다.\n' +
      '학부모용 코멘트를 서로 다른 스타일로 정확히 '+count+'개 작성합니다.\n' +
      '규칙:\n' +
      '1. 한국어 존댓말 전용\n' +
      '2. ' + callingStyle + '\n' +
      '3. 노력·성장 위주 칭찬. 성+이름+학생 형태 절대 금지\n' +
      '4. 각 버전은 길이·강조점·표현 방식이 달라야 함\n' +
      '5. 고정 멘트가 있으면 모든 버전에 자연스럽게 포함 (없으면 생략)\n' +
      '6. 아래 JSON 형식으로만 응답:\n' +
      '["버전1 전체 텍스트","버전2 전체 텍스트","버전3 전체 텍스트"]';

    var prompt = _buildContext({ studentInfo:studentInfo, bookStatus:bookStatus, prevComments:prevComments, activePins:activePins, styleProfile:styleProfile }) +
      '\n\n위 정보로 '+count+'개의 서로 다른 코멘트 버전을 JSON 배열로 작성하세요.';

    var raw = await _call(prompt, system);
    try {
      var arr = JSON.parse(raw.replace(/```json|```/gi,'').trim());
      if (Array.isArray(arr) && arr.length > 0) return arr.map(function(s){ return String(s).trim(); });
    } catch(e) {}
    return [raw];
  }

  /* ══ 3. 문법 교정 ════════════════════════════════════════════ */
  async function proofreadComment(text) {
    return await _call(text,
      '한국어 교정 전문가. 맞춤법·문법·어색한 표현 교정. 원래 의미와 존댓말 톤 유지. 교정된 텍스트만 반환.');
  }

  /* ══ 4. 스타일 분석 ══════════════════════════════════════════
   * ★ v9 개선: 단순 bullet 대신 구조화된 프로파일 추출
   *   → 호칭 패턴, 어조 온도, 자주 쓰는 표현, 문장 구조 등 구체적 추출
   * ════════════════════════════════════════════════════════════ */
  async function analyzeStyle() {
    var samples = getStyleSamples();
    if (samples.length < 1) throw new Error('분석할 샘플이 없습니다. 먼저 코멘트를 입력해 주세요.');

    var profile = await _extractStyleProfile(samples);
    // 결과를 캐시에 저장
    setAnalysisCache(profile);

    // 사람이 읽기 좋은 텍스트로도 반환
    var lines = [];
    lines.push('• 학생 호칭 패턴: ' + profile.호칭패턴);
    lines.push('• 어조 온도: ' + profile.온도);
    if (profile.자주쓰는표현 && profile.자주쓰는표현.length)
      lines.push('• 자주 쓰는 표현: ' + profile.자주쓰는표현.join(' / '));
    lines.push('• 문장 구조: ' + profile.문장구조);
    if (profile.특이사항) lines.push('• 특이사항: ' + profile.특이사항);
    return lines.join('\n');
  }

  /* ══ 5. 연결 테스트 ══════════════════════════════════════════ */
  async function testConnection() {
    try {
      var r = await _call('"OK"라고만 답해주세요.');
      return { ok:true, message:r, keys:KEYS.length, samples:getStyleSamples().length };
    } catch(e) {
      return { ok:false, message:e.message, keys:KEYS.length };
    }
  }

  function status() {
    console.info('[GeminiAI v9] 키:'+KEYS.length+' / 샘플:'+getStyleSamples().length+' / 공용멘트:'+getPins().length+' / 분석캐시:'+(getAnalysisCache()?'있음':'없음'));
    return { keys:KEYS.length, samples:getStyleSamples().length, globalPins:getPins().length, hasAnalysis:!!getAnalysisCache() };
  }

  return {
    generateComment, generateVariants,
    proofreadComment, analyzeStyle,
    getStyleSamples, addStyleSample, removeStyleSample, clearStyleSamples,
    getPins, addPin, removePin, clearPins,
    getBookPins, addBookPin, removeBookPin, clearBookPins, getMergedPins,
    analyzeTeacherStyle, cacheStyleAnalysis, getCachedStyleAnalysis, clearStyleCache,
    loadPinsFromDB, listenPinsFromDB,
    setUseGlobalPins, getUseGlobalPins,
    getAnalysisCache, setAnalysisCache,
    testConnection, status,
  };
})();
