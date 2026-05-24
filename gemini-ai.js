/**
 * gemini-ai.js — Happy Tree English Academy  v5.0
 *
 * ★ 무료 최대 안정성 전략 (2025년 5월 기준)
 * ─────────────────────────────────────────────────────────────
 *  핵심 구조: 3개 Google 계정(프로젝트) × 각 키 1개 = 3배 한도 확보
 *
 *  무료 한도 (프로젝트당):
 *    gemini-2.5-flash  : 10 RPM / 500 RPD
 *    gemini-2.5-flash-lite : 15 RPM / 1,000 RPD
 *
 *  키 3개 로테이션 시 실질 한도:
 *    gemini-2.5-flash-lite : 하루 최대 3,000 요청 (학원 용량 충분)
 *
 *  ★ 적용 방법:
 *    아래 KEYS 배열에 서로 다른 Google 계정에서 발급받은 키를
 *    각각 채워넣으면 됩니다. (최소 1개, 권장 3개)
 *    키가 1개뿐이어도 동작하며, 더 많을수록 안정성이 높아집니다.
 *
 *  작동 방식:
 *    1. 첫 번째 키로 시도
 *    2. 429(한도초과) → 즉시 다음 키로 교체 (폴백)
 *    3. 같은 키의 모델 간 폴백도 병행
 *    4. 모든 키·모델 소진 시 → 친절한 에러 메시지
 * ─────────────────────────────────────────────────────────────
 */
const GeminiAI = (() => {

  /* ══════════════════════════════════════════════════════════════
   * ★★★ 여기에 API 키를 입력하세요 ★★★
   *
   *  - KEY_1: 현재 사용 중인 키 (필수)
   *  - KEY_2: 두 번째 Google 계정 키 (권장)
   *  - KEY_3: 세 번째 Google 계정 키 (권장)
   *
   *  키 발급: https://aistudio.google.com/apikey
   *  (Google 계정 1개 = 1 프로젝트 = 1세트 한도)
   * ══════════════════════════════════════════════════════════════ */
  const KEYS = [
    'AIzaSyB9mhHcdftl13b3BvnvLgBkrjnsmqNKcSQ',   // KEY_1 (현재 키)  jkyuhwa
    'AIzaSyDov3-1Ct7xNjqXDW4OA20koF15hzMhfVE',   // KEY_2 ← 두 번째 계정 키 입력 kuha0879
    'AIzaSyD8zje-ZVKvuRCOsmOLbYrKQXruKH_xGd0',   // KEY_3 ← 세 번째 계정 키 입력 kuha7885
  ].map(k => k.trim()).filter(k => k.length > 0);

  /* ══════════════════════════════════════════════════════════════
   * 모델 목록 (2025년 5월 기준 안정 모델)
   *
   * gemini-2.5-flash-lite : 무료 한도 최대 (15 RPM / 1,000 RPD)
   * gemini-2.5-flash      : 성능 우수  (10 RPM / 500 RPD)
   *
   * ※ gemini-2.0-flash 계열은 2026년 3월 6일부터 신규 프로젝트 접근 불가
   * ══════════════════════════════════════════════════════════════ */
  const MODELS = [
    'gemini-2.5-flash-lite',   // 1순위: 한도 가장 넉넉
    'gemini-2.5-flash',        // 2순위: 성능 우수
  ];

  const _ep = (model, key) =>
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

  const _delay = ms => new Promise(r => setTimeout(r, ms));

  /* ══════════════════════════════════════════════════════════════
   * 핵심 호출 — 키 × 모델 조합을 순차 시도
   * 우선순위: 키1/모델1 → 키1/모델2 → 키2/모델1 → 키2/모델2 → ...
   * ══════════════════════════════════════════════════════════════ */
  async function _call(prompt, systemInstruction = '') {
    if (KEYS.length === 0) {
      throw new Error('API 키가 설정되지 않았습니다. gemini-ai.js의 KEYS 배열에 키를 입력해 주세요.');
    }

    const errors = [];

    for (const key of KEYS) {
      for (const model of MODELS) {
        try {
          const body = {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.7, maxOutputTokens: 1024 }
          };
          if (systemInstruction) {
            body.systemInstruction = { parts: [{ text: systemInstruction }] };
          }

          const res = await fetch(_ep(model, key), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
          });

          // ── 401: 키 자체 무효 → 이 키의 나머지 모델 건너뜀 ──
          if (res.status === 401) {
            const keyHint = key.slice(0, 8) + '...';
            console.warn(`[GeminiAI] 키 무효(401): ${keyHint} → 다음 키 시도`);
            errors.push(`키(${keyHint})/${model}: 키 무효(401)`);
            break; // 이 key의 모델 루프 탈출 → 다음 key로
          }

          // ── 429: 이 키 한도 소진 → 다음 키로 ──
          if (res.status === 429) {
            const keyHint = key.slice(0, 8) + '...';
            console.warn(`[GeminiAI] 한도 소진(429): 키(${keyHint})/${model} → 다음 키 시도`);
            errors.push(`키(${keyHint})/${model}: 한도 소진(429)`);
            break; // 이 key의 나머지 모델도 429일 가능성이 높으므로 바로 다음 key로
          }

          // ── 404: 모델 없음 → 다음 모델 시도 ──
          if (res.status === 404) {
            console.warn(`[GeminiAI] 모델 없음(404): ${model} → 다음 모델 시도`);
            errors.push(`${model}: 모델 없음(404)`);
            continue; // 다음 모델 시도
          }

          // ── 503: 서버 불안정 → 짧은 대기 후 다음 모델 ──
          if (res.status === 503) {
            console.warn(`[GeminiAI] 서버 불안정(503): ${model}`);
            errors.push(`${model}: 서버 불안정(503)`);
            await _delay(500);
            continue;
          }

          // ── 기타 오류 ──
          if (!res.ok) {
            const t = await res.text().catch(() => '');
            if (res.status === 400 && t.toLowerCase().includes('api key')) {
              const keyHint = key.slice(0, 8) + '...';
              errors.push(`키(${keyHint})/${model}: 키 만료(400)`);
              break;
            }
            throw new Error(`API ${res.status}: ${t.slice(0, 100)}`);
          }

          // ── 정상 응답 ──
          const data = await res.json();
          const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
          if (!text) {
            const reason = data?.candidates?.[0]?.finishReason ?? 'UNKNOWN';
            if (reason === 'SAFETY') throw new Error('안전 필터에 의해 응답이 차단되었습니다.');
            errors.push(`${model}: 빈 응답(${reason})`);
            continue;
          }

          console.info(`[GeminiAI] ✓ 성공: 키(${key.slice(0,8)}...)/${model}`);
          return text.trim().replace(/^["']|["']$/g, '');

        } catch (e) {
          if (e.message.includes('안전 필터')) throw e;
          errors.push(`${model}: ${e.message.slice(0, 60)}`);
        }
      }
    }

    // 모든 키·모델 실패
    const keyCount = KEYS.length;
    throw new Error(
      `모든 API 키(${keyCount}개)와 모델이 실패했습니다.\n\n` +
      `상세 오류:\n${errors.map(e => '  · ' + e).join('\n')}\n\n` +
      `해결 방법:\n` +
      `  1. 오늘의 한도 소진 → 자정(태평양 표준시) 이후 자동 초기화됩니다.\n` +
      `  2. 여분 키 추가 → gemini-ai.js의 KEY_2, KEY_3에 다른 계정 키를 입력하세요.\n` +
      `  3. 키 발급: https://aistudio.google.com/apikey`
    );
  }

  /* ══════════════════════════════════════════════════════════════
   * 1. 코멘트 생성
   * ══════════════════════════════════════════════════════════════ */
  async function generateComment(studentInfo, gradeData) {
    const system =
      '당신은 대한민국 영어학원의 따뜻하고 전문적인 선생님입니다. ' +
      '학생의 성적 데이터를 바탕으로 학부모께 전달할 코멘트를 작성합니다. ' +
      '반드시 한국어(존댓말, ~습니다/합니다 체)로만 작성하세요. ' +
      '3~5문장으로: 노력 인정 → 잘한 점 → 개선 방향 순으로 작성하세요. ' +
      '코멘트 텍스트만 반환하고, 부가 설명은 일절 포함하지 마세요.';

    const name        = typeof studentInfo === 'object' ? (studentInfo.name || '학생') : studentInfo;
    const wordData    = typeof studentInfo === 'object' ? studentInfo.word    : (gradeData?.word    ?? '');
    const readingData = typeof studentInfo === 'object' ? studentInfo.reading : (gradeData?.reading ?? '');

    const prompt =
      `학생 이름: ${name}\n` +
      `단어 성적: ${JSON.stringify(wordData ?? gradeData ?? '')}\n` +
      `리딩 성적: ${JSON.stringify(readingData ?? '')}\n` +
      '위 데이터를 바탕으로 학부모께 전달할 선생님 코멘트를 작성해 주세요.';

    return await _call(prompt, system);
  }

  /* ══════════════════════════════════════════════════════════════
   * 2. 코멘트 교정 (Proofread)
   * ══════════════════════════════════════════════════════════════ */
  async function proofreadComment(currentComment) {
    const system =
      '당신은 한국어 교정 전문가입니다. ' +
      '주어진 텍스트의 맞춤법·문법 오류·어색한 표현을 교정하세요. ' +
      '원래 의미와 존댓말 톤을 반드시 유지하세요. ' +
      '교정된 텍스트만 반환하고, 설명·주석은 일절 포함하지 마세요.';
    return await _call(currentComment, system);
  }

  /* ══════════════════════════════════════════════════════════════
   * 3. 연결 테스트 / 키 상태 진단
   *    브라우저 콘솔: GeminiAI.testConnection().then(r=>console.log(r))
   * ══════════════════════════════════════════════════════════════ */
  async function testConnection() {
    try {
      const result = await _call('안녕. 테스트입니다. "OK"라고만 답해주세요.');
      return { ok: true, message: result, keys: KEYS.length };
    } catch (e) {
      return { ok: false, message: e.message, keys: KEYS.length };
    }
  }

  /* ══════════════════════════════════════════════════════════════
   * 4. 현재 키 설정 현황 확인
   *    브라우저 콘솔: GeminiAI.status()
   * ══════════════════════════════════════════════════════════════ */
  function status() {
    const info = KEYS.map((k, i) => `  키${i+1}: ${k.slice(0,8)}...${k.slice(-4)}`).join('\n');
    console.info(
      `[GeminiAI] 설정된 키 ${KEYS.length}개\n${info}\n` +
      `모델: ${MODELS.join(', ')}\n` +
      `예상 일일 최대 요청: ~${KEYS.length * 1000}건 (gemini-2.5-flash-lite 기준)`
    );
    return { keyCount: KEYS.length, models: MODELS };
  }

  return { generateComment, proofreadComment, testConnection, status };

})();
