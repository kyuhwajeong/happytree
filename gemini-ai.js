/**
 * gemini-ai.js — Happy Tree English Academy  v8.0
 * 최종 수정: 2025-05-26
 *
 * v8.0 변경사항
 *  - _buildContext: bookStatus 참조 순서 오류 완전 수정
 *  - 고정 멘트: 공용(getPins) + 교재별(getBookPins) 분리 관리
 *  - getMergedPins: 교재별 + 공용 합산 (AI 전달용)
 *  - 멀티 API 키 로테이션 유지
 */
const GeminiAI = (() => {

  /* ══ API 키 (서로 다른 Google 계정에서 발급) ══════════════════
   * https://aistudio.google.com/apikey
   * 각 키는 별도 Google 계정 → 별도 무료 한도
   * ══════════════════════════════════════════════════════════════ */
  const KEYS = [
    'AIzaSyB9mhHcdftl13b3BvnvLgBkrjnsmqNKcSQ',   // KEY_1 (현재 키)  jkyuhwa
    'AIzaSyDov3-1Ct7xNjqXDW4OA20koF15hzMhfVE',   // KEY_2 ← 두 번째 계정 키 입력 kuha0879
    'AIzaSyD8zje-ZVKvuRCOsmOLbYrKQXruKH_xGd0',   // KEY_3 ← 세 번째 계정 키 입력 kuha7885
  ].map(k => k.trim()).filter(Boolean);

  const MODELS = ['gemini-2.5-flash-lite', 'gemini-2.5-flash'];
  const _ep    = (m, k) =>
    `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${k}`;
  const _delay = ms => new Promise(r => setTimeout(r, ms));

  /* ══ localStorage 헬퍼 ════════════════════════════════════════ */
  const LS_STYLE = 'ht_style_samples';
  const LS_PINS  = 'ht_style_pins';
  const _lg = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
  const _ls = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

  /* ══ Style DNA API ════════════════════════════════════════════ */
  function getStyleSamples()   { return _lg(LS_STYLE) || []; }
  function addStyleSample(txt) {
    const t = (txt || '').trim(); if (t.length < 10) return false;
    const arr = getStyleSamples().filter(s => s !== t); arr.push(t);
    _ls(LS_STYLE, arr.slice(-20)); return true;
  }
  function removeStyleSample(idx) { const a = getStyleSamples(); a.splice(idx, 1); _ls(LS_STYLE, a); }
  function clearStyleSamples() { localStorage.removeItem(LS_STYLE); }

  /* ══ 고정 멘트 API ════════════════════════════════════════════
   * 공용(bookId 없음)과 교재별(bookId 있음) 두 레이어로 관리
   * AI에는 교재별 + 공용 합산본이 전달됨
   * ═════════════════════════════════════════════════════════════= */
  const _pinKeyG = () => LS_PINS;
  const _pinKeyB = bid => LS_PINS + ':' + bid;

  /* 공용 고정 멘트 */
  function getPins() { return _lg(_pinKeyG()) || []; }
  function addPin(txt) {
    const t = (txt || '').trim(); if (!t) return false;
    const arr = getPins().filter(p => p !== t); arr.push(t);
    _ls(_pinKeyG(), arr.slice(-15)); return true;
  }
  function removePin(idx) { const a = getPins(); a.splice(idx, 1); _ls(_pinKeyG(), a); }
  function clearPins() { localStorage.removeItem(_pinKeyG()); }

  /* 교재별 고정 멘트 */
  function getBookPins(bookId) { return bookId ? (_lg(_pinKeyB(bookId)) || []) : []; }
  function addBookPin(bookId, txt) {
    if (!bookId) return addPin(txt);
    const t = (txt || '').trim(); if (!t) return false;
    const arr = getBookPins(bookId).filter(p => p !== t); arr.push(t);
    _ls(_pinKeyB(bookId), arr.slice(-15)); return true;
  }
  function removeBookPin(bookId, idx) {
    const a = getBookPins(bookId); a.splice(idx, 1); _ls(_pinKeyB(bookId), a);
  }
  function clearBookPins(bookId) { if (bookId) localStorage.removeItem(_pinKeyB(bookId)); }

  /* 공용 + 교재별 합산 (AI에 실제 전달) */
  function getMergedPins(bookId) {
    const g = getPins();
    const b = getBookPins(bookId);
    return [...b, ...g.filter(p => !b.includes(p))];
  }

  /* ══ 핵심 API 호출 ════════════════════════════════════════════ */
  async function _call(prompt, system) {
    system = system || '';
    if (!KEYS.length) throw new Error('API 키 미설정 — gemini-ai.js의 KEYS 배열을 확인하세요.');
    const errors = [];
    for (const key of KEYS) {
      for (const model of MODELS) {
        try {
          const body = {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.78, maxOutputTokens: 1024 }
          };
          if (system) body.systemInstruction = { parts: [{ text: system }] };

          const res = await fetch(_ep(model, key), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
          });

          if (res.status === 401) { errors.push(key.slice(0,8)+'...: 키 무효(401)'); break; }
          if (res.status === 429) { errors.push(key.slice(0,8)+'...: 한도소진(429)'); break; }
          if (res.status === 404) { errors.push(model+': 모델없음(404)'); continue; }
          if (res.status === 503) { await _delay(500); errors.push(model+': 503'); continue; }
          if (!res.ok) {
            const t = await res.text().catch(() => '');
            if (res.status === 400 && t.toLowerCase().includes('api key')) {
              errors.push(key.slice(0,8)+'...: 키만료(400)'); break;
            }
            throw new Error('API ' + res.status + ': ' + t.slice(0, 100));
          }

          const data = await res.json();
          const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
          if (!text) {
            const reason = data?.candidates?.[0]?.finishReason || '?';
            if (reason === 'SAFETY') throw new Error('안전 필터 차단');
            errors.push(model + ': 빈응답(' + reason + ')'); continue;
          }
          console.info('[GeminiAI v8] ✓ ' + key.slice(0,8) + '.../' + model);
          return text.trim().replace(/^["']|["']$/g, '');

        } catch (e) {
          if (e.message.includes('안전 필터')) throw e;
          errors.push(model + ': ' + e.message.slice(0, 50));
        }
      }
    }
    throw new Error(
      '모든 키/모델 실패\n' + errors.map(e => '  · ' + e).join('\n') + '\n\n' +
      '해결: 자정 이후 재시도 또는 KEY_2/KEY_3에 다른 계정 키를 추가하세요.\n' +
      '(https://aistudio.google.com/apikey)'
    );
  }

  /* ══ 프롬프트 빌더 ════════════════════════════════════════════
   * ★ 수정 포인트: opts에서 순서대로 안전하게 추출
   *   (이전 버전은 bookStatus를 선언 전에 참조하는 버그 있었음)
   * ════════════════════════════════════════════════════════════ */
  function _buildContext(opts) {
    opts = opts || {};

    // ① 먼저 각 필드를 안전하게 추출
    var bookStatus   = opts.bookStatus   || {};
    var studentInfo  = opts.studentInfo  || {};
    var prevComments = opts.prevComments || [];
    var bookId       = bookStatus.bookId || '';
    // activePins: 명시적으로 전달된 경우 그대로, 없으면 교재별+공용 합산
    var activePins   = (opts.activePins != null) ? opts.activePins : getMergedPins(bookId);

    // ② 학생 정보
    var name    = typeof studentInfo === 'string' ? studentInfo : (studentInfo.name || '학생');
    var word    = studentInfo.word    || null;
    var reading = studentInfo.reading || null;
    var gender  = studentInfo.gender  || '';

    // ③ 성취율
    var wPct = (word && word.totalQ > 0)
      ? Math.round((word.pass / word.totalQ) * 100) : null;
    var rVals = reading
      ? Object.values(reading).map(function(v){ return typeof v === 'object' ? v.score : null; }).filter(function(s){ return s != null; })
      : [];
    var rPct = rVals.length
      ? Math.round(rVals.reduce(function(a,b){ return a+b; }, 0) / rVals.length) : null;

    // ④ 교재 상태
    var bookLine = '';
    if (bookStatus.currentBook) {
      bookLine = '\n현재 교재: ' + bookStatus.currentBook;
      if (bookStatus.isCompleted) {
        bookLine += ' (이번 달 이수 완료 ✓)';
        if (bookStatus.nextBook) bookLine += '\n다음 교재: ' + bookStatus.nextBook + '로 진행 예정';
      }
    }

    // ⑤ 선생님 메모
    var memoLine = bookStatus.teacherMemo ? '\n선생님 메모: ' + bookStatus.teacherMemo : '';

    // ⑥ 고정 멘트 (없으면 빈 문자열 → AI에 불필요한 지시 안 함)
    var pinLine = activePins.length
      ? '\n\n[고정 멘트 — 아래 문구를 코멘트에 반드시 자연스럽게 녹여 넣으세요]\n' +
        activePins.map(function(p, i){ return '고정멘트' + (i+1) + ': "' + p + '"'; }).join('\n')
      : '';

    // ⑦ 이전 코멘트 참조
    var prevLine = prevComments.length
      ? '\n\n[이 학생의 이전 코멘트 — 동일 어조로 이어지도록]\n' +
        prevComments.slice(0, 3).map(function(c, i){ return '이전' + (i+1) + ': "' + c + '"'; }).join('\n')
      : '';

    // ⑧ 스타일 DNA
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

  /* ══ 1. 코멘트 생성 ═══════════════════════════════════════════ */
  async function generateComment(studentInfo, bookStatus, extraOpts) {
    bookStatus = bookStatus || {};
    extraOpts  = extraOpts  || {};
    var prevComments = extraOpts.prevComments || [];
    var bookId       = bookStatus.bookId || '';
    var activePins   = (extraOpts.activePins != null)
      ? extraOpts.activePins : getMergedPins(bookId);

    var system =
      '당신은 대한민국 초등학생 전담 영어학원 선생님입니다.\n' +
      '학부모께 알림장처럼 전달하는 따뜻한 코멘트를 작성합니다.\n' +
      '규칙:\n' +
      '1. 반드시 한국어 존댓말(~습니다/합니다)만 사용\n' +
      '2. 점수 숫자 대신 노력·성장·태도·참여도 위주로 칭찬\n' +
      '3. 3~5문장: 잘한 점 → 구체적 칭찬 → 앞으로 응원\n' +
      '4. 고정 멘트가 있으면 반드시 자연스럽게 포함 (없으면 생략)\n' +
      '5. 코멘트 본문 텍스트만 반환, 그 외 일절 금지';

    var prompt = _buildContext({ studentInfo: studentInfo, bookStatus: bookStatus, prevComments: prevComments, activePins: activePins });
    return await _call(prompt, system);
  }

  /* ══ 2. 복수 버전 생성 ════════════════════════════════════════ */
  async function generateVariants(studentInfo, bookStatus, extraOpts, count) {
    bookStatus = bookStatus || {};
    extraOpts  = extraOpts  || {};
    count      = count      || 3;
    var prevComments = extraOpts.prevComments || [];
    var bookId       = bookStatus.bookId || '';
    var activePins   = (extraOpts.activePins != null)
      ? extraOpts.activePins : getMergedPins(bookId);

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

  /* ══ 3. 문법 교정 ════════════════════════════════════════════ */
  async function proofreadComment(text) {
    var system =
      '한국어 교정 전문가. 맞춤법·문법·어색한 표현 교정.\n' +
      '원래 의미와 존댓말 톤 유지. 교정된 텍스트만 반환.';
    return await _call(text, system);
  }

  /* ══ 4. 스타일 분석 ══════════════════════════════════════════ */
  async function analyzeStyle() {
    var samples = getStyleSamples();
    if (samples.length < 2) throw new Error('분석에는 샘플 2개 이상이 필요합니다.');
    var system = '글쓰기 스타일 분석가. 주어진 샘플들의 문체 특징을 5가지 이내 bullet로 한국어 요약.';
    var prompt = '아래 선생님 코멘트 샘플들을 분석하세요:\n\n' +
      samples.map(function(s, i){ return '샘플' + (i+1) + ': "' + s + '"'; }).join('\n\n');
    return await _call(prompt, system);
  }

  /* ══ 5. 연결 테스트 ══════════════════════════════════════════ */
  async function testConnection() {
    try {
      var r = await _call('"OK"라고만 답해주세요.');
      return { ok: true, message: r, keys: KEYS.length, samples: getStyleSamples().length };
    } catch(e) {
      return { ok: false, message: e.message, keys: KEYS.length };
    }
  }

  function status() {
    console.info('[GeminiAI v8] 키:' + KEYS.length + ' / 스타일샘플:' + getStyleSamples().length + ' / 공용멘트:' + getPins().length + '\n모델:' + MODELS.join(','));
    return { keys: KEYS.length, samples: getStyleSamples().length, globalPins: getPins().length };
  }

  return {
    generateComment, generateVariants,
    proofreadComment, analyzeStyle,
    getStyleSamples, addStyleSample, removeStyleSample, clearStyleSamples,
    getPins, addPin, removePin, clearPins,
    getBookPins, addBookPin, removeBookPin, clearBookPins, getMergedPins,
    testConnection, status,
  };
})();
