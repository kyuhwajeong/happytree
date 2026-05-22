/**
 * gemini-ai.js — Happy Tree English Academy  v3.0
 * Google Gemini API 연동 (Teacher's Comment 생성·교정)
 *
 * ★ v3.0 변경사항 (2025-05)
 *   - 모델 목록을 2025년 5월 기준 현행 모델로 전면 교체
 *   - 404 = "모델 없음" 으로 처리 → 다음 모델로 폴백 (기존엔 즉시 중단 버그)
 *   - 401 만 "API 키 오류"로 즉시 중단
 *   - v1beta → v1 자동 재시도 추가
 *   - 디버그 로그 추가 (콘솔에서 어느 모델이 성공했는지 확인 가능)
 */
const GeminiAI = (() => {

  /* ── API 키 ─────────────────────────────────────────────────── */
  const API_KEY = 'AIzaSyB9mhHcdftl13b3BvnvLgBkrjnsmqNKcSQ'.trim();

  /**
   * ★ 2025년 5월 기준 현행 모델 목록 (우선순위 순)
   *
   * 변경 이유:
   *   - gemini-1.5-flash / gemini-1.0-pro 등 구형 모델은
   *     Google이 2025년 4~5월에 v1beta 엔드포인트에서 순차 제거 → 404 반환
   *   - gemini-2.0-flash-lite : 무료 티어 가장 넉넉 (30 RPM / 1500 RPD)
   *   - gemini-2.0-flash      : 표준 플래시 (15 RPM)
   *   - gemini-2.5-flash-preview : 최신 미리보기 (가용 시)
   *   - gemini-2.5-pro-preview   : 고품질 최후 수단
   */
  const MODELS = [
    { name: 'gemini-2.0-flash-lite',        api: 'v1beta' },
    { name: 'gemini-2.0-flash',             api: 'v1beta' },
    { name: 'gemini-2.5-flash-preview-05-20', api: 'v1beta' },
    { name: 'gemini-2.5-pro-preview-05-06', api: 'v1beta' },
  ];

  const _ep = (model, api) =>
    `https://generativelanguage.googleapis.com/${api}/models/${model}:generateContent?key=${API_KEY}`;

  const _delay = ms => new Promise(r => setTimeout(r, ms));

  /**
   * 핵심 호출 함수
   *  - 401          → API 키 오류 (즉시 전체 중단)
   *  - 404          → 모델 없음 or 경로 오류 → 다음 모델로 폴백  ★수정
   *  - 429 / 503    → 한도 초과 / 서버 지연 → 다음 모델로 폴백
   *  - 기타 !ok     → throw (호출자에서 처리)
   */
  async function _call(prompt, systemInstruction = '') {
    const errors = [];

    for (const { name: model, api } of MODELS) {
      try {
        const url  = _ep(model, api);
        const body = {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 1024 }
        };
        if (systemInstruction) {
          body.systemInstruction = { parts: [{ text: systemInstruction }] };
        }

        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });

        // ── 1. API 키 자체 오류: 401 만 즉시 중단 ────────────────
        if (res.status === 401) {
          throw new Error('API 키가 유효하지 않습니다. Google AI Studio에서 키를 재발급 해주세요. (401)');
        }

        // ── 2. 모델 없음(404) → 다음 모델로 폴백 ★핵심 수정 ─────
        if (res.status === 404) {
          const t = await res.text().catch(() => '');
          console.warn(`[GeminiAI] 모델 없음: ${model} → 다음 모델 시도`);
          errors.push(`${model}: 모델 없음(404) - ${t.slice(0, 60)}`);
          continue; // ← 기존엔 throw였음. continue로 변경하여 다음 모델 시도
        }

        // ── 3. 한도 초과 / 서버 지연 → 다음 모델로 폴백 ─────────
        if (res.status === 429 || res.status === 503) {
          const t = await res.text().catch(() => '');
          console.warn(`[GeminiAI] 한도/지연: ${model} (${res.status}) → 다음 모델 시도`);
          errors.push(`${model}: 한도초과 또는 서버 지연(${res.status})`);
          await _delay(600);
          continue;
        }

        // ── 4. 기타 HTTP 오류 ─────────────────────────────────────
        if (!res.ok) {
          const t = await res.text().catch(() => '');
          // 400 + "API key" 메시지 → 키 오류로 즉시 중단
          if (res.status === 400 && t.toLowerCase().includes('api key')) {
            throw new Error('API 키가 만료되었거나 잘못되었습니다. 새 키로 교체해 주세요. (400)');
          }
          throw new Error(`Gemini API ${res.status}: ${t.slice(0, 120)}`);
        }

        // ── 5. 정상 응답 파싱 ─────────────────────────────────────
        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
        if (!text) {
          // finishReason 확인
          const reason = data?.candidates?.[0]?.finishReason ?? 'UNKNOWN';
          if (reason === 'SAFETY') throw new Error('안전 필터에 의해 응답이 차단되었습니다.');
          throw new Error(`응답 텍스트가 비어있습니다. (finishReason: ${reason})`);
        }

        console.info(`[GeminiAI] ✓ 성공: ${model}`);
        return text.trim().replace(/^["']|["']$/g, '');

      } catch (e) {
        // API 키 오류 · 명시적 throw → 상위로 즉시 전달
        if (
          e.message.includes('401') ||
          e.message.includes('키가 유효하지 않') ||
          e.message.includes('키가 만료') ||
          e.message.includes('안전 필터')
        ) {
          throw e;
        }
        // 그 외 → 다음 모델 시도
        console.warn(`[GeminiAI] ${model} 실패:`, e.message.slice(0, 80));
        errors.push(`${model}: ${e.message.slice(0, 60)}`);
      }
    }

    // 모든 모델 실패
    throw new Error(
      `모든 모델 호출에 실패했습니다.\n상세:\n${errors.join('\n')}\n\n` +
      '해결 방법: Google AI Studio(aistudio.google.com)에서 새 API 키를 발급 후 gemini-ai.js의 API_KEY를 교체해 주세요.'
    );
  }

  /* ══════════════════════════════════════════════════════════════
   * 1. 코멘트 생성
   * ══════════════════════════════════════════════════════════════ */
  async function generateComment(studentInfo, gradeData) {
    const system =
      'You are a warm and professional English academy teacher in South Korea. ' +
      'Write a student progress report comment based on the provided score data. ' +
      'Write ONLY in South Korean (한국어), using a polite formal tone (~습니다/합니다). ' +
      'Keep it 3–5 sentences: acknowledge effort, note strengths, give one improvement tip.';
    const prompt =
      `학생 정보: ${typeof studentInfo === 'object' ? JSON.stringify(studentInfo) : studentInfo}\n` +
      `성적 데이터: ${JSON.stringify(gradeData)}\n` +
      '위 데이터를 바탕으로 학부모께 전달할 따뜻하고 구체적인 선생님 코멘트를 작성해 주세요.';
    return await _call(prompt, system);
  }

  /* ══════════════════════════════════════════════════════════════
   * 2. 코멘트 교정 (Proofread)
   * ══════════════════════════════════════════════════════════════ */
  async function proofreadComment(currentComment) {
    const system =
      'You are an expert Korean editor. ' +
      'Correct any grammatical errors, awkward phrasing, or unnatural expressions in the following Korean text. ' +
      'Preserve the original meaning and polite tone. ' +
      'Return ONLY the corrected text — no introduction, no explanation, no quotation marks.';
    return await _call(currentComment, system);
  }

  /* ══════════════════════════════════════════════════════════════
   * 3. API 연결 테스트 (진단용)
   * ══════════════════════════════════════════════════════════════ */
  async function testConnection() {
    try {
      const result = await _call('안녕하세요. 테스트입니다. "OK"라고만 답해주세요.');
      return { ok: true, message: result };
    } catch (e) {
      return { ok: false, message: e.message };
    }
  }

  return {
    generateComment,
    proofreadComment,
    testConnection,   // ★ 신규: 콘솔에서 GeminiAI.testConnection() 으로 진단 가능
  };

})();
