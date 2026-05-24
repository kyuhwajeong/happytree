/**
 * gemini-ai.js — Happy Tree English Academy  v7.0
 * ─────────────────────────────────────────────────
 * ★ v7.0 Teacher's Comment AI 엔진 전면 개편
 *
 * 핵심 기능
 *  1. 선생님 스타일 DNA 학습
 *     - 과거 직접 작성한 코멘트에서 문체·어조·길이 패턴 자동 추출
 *     - localStorage에 영구 저장, 최대 20개 샘플 유지
 *
 *  2. 꼭 넣을 말 (고정 멘트) 시스템
 *     - 선생님이 "꼭 들어갔으면 하는" 문구를 고정 멘트로 등록
 *     - 등록된 고정 멘트는 AI 생성 시 반드시 코멘트에 반영
 *
 *  3. 교재 상태 연동
 *     - 현재 교재 이수 완료 여부, 다음 교재 안내 자동 포함
 *
 *  4. 이 학생 이전 코멘트 참조
 *     - 동일 학생의 과거 코멘트 흐름을 이어받아 작성
 *
 *  5. 복수 버전 생성 (variants)
 *     - 같은 조건에서 2~3개 버전 생성 → 선생님이 선택
 *
 *  6. 멀티 API 키 로테이션 (v5 유지)
 * ─────────────────────────────────────────────────
 */
const GeminiAI = (() => {

  /* ══ API 키 (서로 다른 Google 계정에서 발급) ════════════════ */
  const KEYS = [
    'AIzaSyB9mhHcdftl13b3BvnvLgBkrjnsmqNKcSQ',   // KEY_1 (현재 키)  jkyuhwa
    'AIzaSyDov3-1Ct7xNjqXDW4OA20koF15hzMhfVE',   // KEY_2 ← 두 번째 계정 키 입력 kuha0879
    'AIzaSyD8zje-ZVKvuRCOsmOLbYrKQXruKH_xGd0',   // KEY_3 ← 세 번째 계정 키 입력 kuha7885
  ].map(k => k.trim()).filter(Boolean);

  const MODELS  = ['gemini-2.5-flash-lite', 'gemini-2.5-flash'];
  const _ep     = (m, k) => `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${k}`;
  const _delay  = ms => new Promise(r => setTimeout(r, ms));

  /* ══ 스타일 DNA 저장소 ═══════════════════════════════════════ */
  const LS_STYLE = 'ht_style_samples';   // 코멘트 샘플 (최대 20개)
  const LS_PINS  = 'ht_style_pins';      // 필수 포함 문구 핀 (최대 15개)

  const _lg = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
  const _ls = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

  /* ── 스타일 샘플 API ── */
  function getStyleSamples()   { return _lg(LS_STYLE) || []; }
  function addStyleSample(txt) {
    const t = (txt || '').trim();
    if (t.length < 10) return false;
    const arr = getStyleSamples().filter(s => s !== t);
    arr.push(t);
    _ls(LS_STYLE, arr.slice(-20));
    return true;
  }
  function removeStyleSample(idx) {
    const arr = getStyleSamples();
    arr.splice(idx, 1);
    _ls(LS_STYLE, arr);
  }
  function clearStyleSamples() { localStorage.removeItem(LS_STYLE); }

  /* ── 고정 멘트 API ──────────────────────────────────────────
   * 공용(bookId 없음)과 교재별(bookId 있음) 두 레이어로 관리
   * AI에는 교재별 + 공용 합산본이 전달됨
   * ─────────────────────────────────────────────────────────── */
  const _pinKey  = bid => bid ? LS_PINS + ':' + bid : LS_PINS;   // 교재별 키
  const _pinKeyG = () => LS_PINS;                                 // 공용 키

  /* 공용 고정 멘트 */
  function getPins()          { return _lg(_pinKeyG()) || []; }
  function addPin(txt)        {
    const t = (txt||'').trim(); if(!t) return false;
    const arr = getPins().filter(p=>p!==t); arr.push(t);
    _ls(_pinKeyG(), arr.slice(-15)); return true;
  }
  function removePin(idx)     { const arr=getPins(); arr.splice(idx,1); _ls(_pinKeyG(),arr); }
  function clearPins()        { localStorage.removeItem(_pinKeyG()); }

  /* 교재별 고정 멘트 */
  function getBookPins(bookId)       { return bookId ? (_lg(_pinKey(bookId))||[]) : []; }
  function addBookPin(bookId, txt)   {
    if(!bookId) return addPin(txt);
    const t=(txt||'').trim(); if(!t) return false;
    const arr=getBookPins(bookId).filter(p=>p!==t); arr.push(t);
    _ls(_pinKey(bookId), arr.slice(-15)); return true;
  }
  function removeBookPin(bookId, idx){ const arr=getBookPins(bookId); arr.splice(idx,1); _ls(_pinKey(bookId),arr); }
  function clearBookPins(bookId)     { if(bookId) localStorage.removeItem(_pinKey(bookId)); }

  /* 공용 + 교재별 합산 (AI에 실제 전달되는 값) */
  function getMergedPins(bookId) {
    const g = getPins();
    const b = getBookPins(bookId);
    // 교재별이 앞에, 공용이 뒤에 (중복 제거)
    return [...b, ...g.filter(p => !b.includes(p))];
  }

  /* ══ 핵심 API 호출 ═══════════════════════════════════════════ */
  async function _call(prompt, system = '') {
    if (!KEYS.length) throw new Error('API 키 미설정 — gemini-ai.js KEYS 배열을 확인하세요.');
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

          if (res.status === 401) { errors.push(`키(${key.slice(0,8)})/401`); break; }
          if (res.status === 429) { errors.push(`키(${key.slice(0,8)})/429-한도소진`); break; }
          if (res.status === 404) { errors.push(`${model}/404-모델없음`); continue; }
          if (res.status === 503) { await _delay(500); errors.push(`${model}/503`); continue; }
          if (!res.ok) {
            const t = await res.text().catch(() => '');
            if (res.status === 400 && t.toLowerCase().includes('api key')) { errors.push(`키(${key.slice(0,8)})/400-만료`); break; }
            throw new Error(`API ${res.status}: ${t.slice(0, 100)}`);
          }

          const data = await res.json();
          const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
          if (!text) {
            const r = data?.candidates?.[0]?.finishReason ?? '?';
            if (r === 'SAFETY') throw new Error('안전 필터 차단');
            errors.push(`${model}/빈응답(${r})`); continue;
          }
          console.info(`[GeminiAI] ✓ ${key.slice(0,8)}/${model}`);
          return text.trim().replace(/^["']|["']$/g, '');

        } catch (e) {
          if (e.message.includes('안전 필터')) throw e;
          errors.push(`${model}: ${e.message.slice(0, 50)}`);
        }
      }
    }
    throw new Error(
      `모든 키/모델 실패\n${errors.map(e => '  · ' + e).join('\n')}\n\n` +
      '해결: 자정 이후 재시도 또는 KEY_2/KEY_3에 다른 계정 키를 추가하세요.\n(https://aistudio.google.com/apikey)'
    );
  }

  /* ══ 컨텍스트 빌더 (공통) ════════════════════════════════════ */
  function _buildContext(opts = {}) {
    const bookId = bookStatus?.bookId || '';
    const { studentInfo = {}, bookStatus: _bs = bookStatus, prevComments = [], activePins = getMergedPins(bookId) } = opts;

    const name    = typeof studentInfo === 'string' ? studentInfo : (studentInfo.name || '학생');
    const word    = studentInfo.word;
    const reading = studentInfo.reading;
    const gender  = studentInfo.gender || '';

    // 성취율
    const wPct = word?.totalQ > 0 ? Math.round((word.pass / word.totalQ) * 100) : null;
    const rVals = reading ? Object.values(reading).map(v => typeof v === 'object' ? v.score : null).filter(s => s != null) : [];
    const rPct  = rVals.length ? Math.round(rVals.reduce((a,b)=>a+b,0)/rVals.length) : null;

    // 교재 상태
    let bookLine = '';
    if (bookStatus.currentBook) {
      bookLine = `\n현재 교재: ${bookStatus.currentBook}`;
      if (bookStatus.isCompleted) {
        bookLine += ' (이번 달 이수 완료 ✓)';
        if (bookStatus.nextBook) bookLine += `\n다음 교재: ${bookStatus.nextBook}로 진행 예정`;
      }
    }

    // 선생님 추가 메모
    const memoLine = bookStatus.teacherMemo ? `\n선생님 메모: ${bookStatus.teacherMemo}` : '';

    // 고정 멘트
    const pinLine = activePins.length
      ? `\n\n[고정 멘트 — 아래 문구를 코멘트에 반드시 자연스럽게 녹여 넣으세요]\n${activePins.map((p,i) => `고정멘트${i+1}: "${p}"`).join('\n')}`
      : '';

    // 이전 코멘트 참조
    const prevLine = prevComments.length
      ? `\n\n[이 학생의 이전 코멘트 — 동일 어조로 이어지도록]\n${prevComments.slice(0,3).map((c,i)=>`이전${i+1}: "${c}"`).join('\n')}`
      : '';

    // 스타일 DNA
    const samples = getStyleSamples().filter(s => s.length > 10);
    const styleLine = samples.length
      ? `\n\n[선생님 작성 스타일 DNA — 이 문체와 어조를 최대한 흉내내세요]\n${samples.slice(-6).map((s,i)=>`샘플${i+1}: "${s}"`).join('\n')}`
      : '';

    const prompt =
      `학생: ${name}${gender ? ` (${gender})` : ''}\n` +
      `단어 성취율: ${wPct != null ? wPct + '%' : '미입력'}\n` +
      `리딩 성취율: ${rPct != null ? rPct + '%' : '미입력'}` +
      bookLine + memoLine + pinLine + prevLine + styleLine;

    return prompt;
  }

  /* ══ 1. 코멘트 생성 (단일) ═══════════════════════════════════
   * @param {object|string} studentInfo  { name, word, reading, gender? }
   * @param {object}        bookStatus   { currentBook, isCompleted, nextBook, teacherMemo? }
   * @param {object}        extraOpts    { prevComments?, activePins? }
   * ════════════════════════════════════════════════════════════ */
  async function generateComment(studentInfo, bookStatus = {}, extraOpts = {}) {
    const prevComments = extraOpts.prevComments || [];
    const bkId        = bookStatus?.bookId || '';
    const activePins   = extraOpts.activePins   || getMergedPins(bkId);

    const system =
      '당신은 대한민국 초등학생 전담 영어학원 선생님입니다.\n' +
      '학부모께 알림장처럼 전달하는 따뜻한 코멘트를 작성합니다.\n' +
      '규칙:\n' +
      '1. 반드시 한국어 존댓말(~습니다/합니다)만 사용\n' +
      '2. 점수 숫자 대신 노력·성장·태도·참여도 위주로 칭찬\n' +
      '3. 3~5문장: 잘한 점 → 구체적 칭찬 → 앞으로 응원\n' +
      '4. 고정 멘트가 있으면 반드시 자연스럽게 포함\n' +
      '5. 코멘트 본문 텍스트만 반환, 그 외 일절 금지';

    const prompt = _buildContext({ studentInfo, bookStatus, prevComments, activePins });
    return await _call(prompt, system);
  }

  /* ══ 2. 복수 버전 생성 ══════════════════════════════════════
   * count개의 서로 다른 버전을 JSON 배열로 반환
   * ════════════════════════════════════════════════════════════ */
  async function generateVariants(studentInfo, bookStatus = {}, extraOpts = {}, count = 3) {
    const prevComments = extraOpts.prevComments || [];
    const bkIdV        = bookStatus?.bookId || '';
    const activePins   = extraOpts.activePins   || getMergedPins(bkIdV);

    const system =
      '당신은 대한민국 초등학생 전담 영어학원 선생님입니다.\n' +
      '학부모용 코멘트를 서로 다른 스타일로 정확히 ' + count + '개 작성합니다.\n' +
      '규칙:\n' +
      '1. 한국어 존댓말 전용\n' +
      '2. 노력·성장 위주 칭찬 (점수 숫자 최소화)\n' +
      '3. 각 버전은 길이, 강조점, 표현 방식이 달라야 함\n' +
      '4. 고정 멘트는 모든 버전에 반드시 자연스럽게 포함\n' +
      '5. 아래 JSON 형식으로만 응답 (다른 텍스트 절대 금지):\n' +
      '["버전1 전체 텍스트","버전2 전체 텍스트","버전3 전체 텍스트"]';

    const prompt = _buildContext({ studentInfo, bookStatus, prevComments, activePins }) +
      `\n\n위 정보로 ${count}개의 서로 다른 코멘트 버전을 JSON 배열로 작성하세요.`;

    const raw = await _call(prompt, system);
    try {
      const cleaned = raw.replace(/```json|```/gi, '').trim();
      const arr = JSON.parse(cleaned);
      if (Array.isArray(arr) && arr.length > 0) return arr.map(s => String(s).trim());
    } catch {}
    // 파싱 실패 시 단일 결과 반환
    return [raw];
  }

  /* ══ 3. 문법 교정 ════════════════════════════════════════════ */
  async function proofreadComment(text) {
    const system =
      '한국어 교정 전문가. 맞춤법·문법·어색한 표현 교정.\n' +
      '원래 의미와 존댓말 톤 유지. 교정된 텍스트만 반환.';
    return await _call(text, system);
  }

  /* ══ 4. 스타일 분석 ══════════════════════════════════════════ */
  async function analyzeStyle() {
    const samples = getStyleSamples();
    if (samples.length < 2) throw new Error('분석에는 샘플 2개 이상 필요합니다.');
    const system = '글쓰기 스타일 분석가. 주어진 샘플들의 문체 특징을 5가지 이내 bullet로 한국어 요약.';
    const prompt = '아래 선생님 코멘트 샘플들을 분석하세요:\n\n' +
      samples.map((s,i) => `샘플${i+1}: "${s}"`).join('\n\n');
    return await _call(prompt, system);
  }

  /* ══ 5. 연결 테스트 ══════════════════════════════════════════ */
  async function testConnection() {
    try {
      const r = await _call('"OK"라고만 답해주세요.');
      return { ok: true, message: r, keys: KEYS.length, samples: getStyleSamples().length, pins: getPins().length };
    } catch (e) {
      return { ok: false, message: e.message, keys: KEYS.length };
    }
  }

  function status() {
    console.info(`[GeminiAI v7] 키:${KEYS.length} / 스타일샘플:${getStyleSamples().length} / 공용멘트:${getPins().length}\n모델:${MODELS.join(',')}`);
    return { keys: KEYS.length, samples: getStyleSamples().length, pins: getPins().length };
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
