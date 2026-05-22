/**
 * gemini-ai.js — Happy Tree English Academy  v2.1
 * Google Gemini API 연동 (Teacher's Comment 생성·교정)
 *
 * ★ API 키는 안전하게 적용 및 공백 처리 되었습니다.
 */
const GeminiAI = (() => {

  /* ── API 설정 ─────────────────────────────────────────────── */
  // 공백 누락이나 복사 오류를 방지하기 위해 .trim()을 붙였습니다.
  const API_KEY = 'AIzaSyCg4N0KDgQUbFEcGcqYbN2fI0nYxYU_gfQ'.trim(); 

  /**
   * 모델 폴백 순서
   * - gemini-1.5-flash     : 무료 티어 안정적 (15 RPM / 1500 RPD)
   * - gemini-1.5-flash-8b  : 경량, 한도 더 여유
   * - gemini-2.0-flash     : 최신, 지역·플랜에 따라 제한 있음
   * - gemini-1.0-pro       : 구형이지만 폴백 최후 수단
   */
  const MODELS = [
    'gemini-1.5-flash',
    'gemini-1.5-flash-8b',
    'gemini-2.0-flash',
    'gemini-1.0-pro',
  ];

  const _ep = m =>
    `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${API_KEY}`;

  const _delay = ms => new Promise(r => setTimeout(r, ms));

  /**
   * 핵심 호출 함수 (순차적 모델 폴백 및 연쇄 에러 방어 적용)
   */
  async function _call(prompt, systemInstruction = '') {
    const errors = [];

    for (const model of MODELS) {
      try {
        const url = _ep(model);
        const body = {
          contents: [{ parts: [{ text: prompt }] }]
        };
        if (systemInstruction) {
          body.systemInstruction = {
            parts: [{ text: systemInstruction }]
          };
        }

        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });

        // 1. 인증 오류(401) 또는 잘못된 경로(404) 대응
        // 키가 유효하지 않으면 다른 모델을 찔러도 똑같이 실패하며 구글 게이트웨이에 의해 429 차단을 유발하므로 즉시 중단합니다.
        if (res.status === 401 || res.status === 404) {
          const t = await res.text().catch(() => '');
          throw new Error(`[API 인증/경로 오류] API 키가 활성화되지 않았거나 잘못되었습니다. (Status: ${res.status})`);
        }

        // 2. 한도 초과(429) 또는 서버 내부 오류(503)는 다음 모델로 패스
        if (res.status === 429 || res.status === 503) {
          errors.push(`${model}: 한도초과 또는 서버 지연(${res.status})`);
          await _delay(500); // 연속 호출 전 안정적인 대기 시간 부여
          continue;
        }

        // 3. 기타 예외 처리
        if (!res.ok) {
          const t = await res.text().catch(() => '');
          if (res.status === 400 && t.includes('API key')) {
            throw new Error('API 키가 만료되었습니다. 새 키로 교체해 주세요.');
          }
          throw new Error(`Gemini API ${res.status}: ${t.slice(0, 100)}`);
        }

        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
        if (!text) throw new Error('응답 텍스트가 비어있습니다.');
        
        return text.trim().replace(/^[\"']|[\"']$/g, '');

      } catch (e) {
        // 인증 오류이거나 특정 명시적 에러는 상위 루프로 즉시 throw하여 차단 전면 방지
        if (e.message.includes('인증/경로 오류') || e.message.includes('키가 만료') || e.message.startsWith('Gemini API')) {
          throw e;
        }
        errors.push(`${model}: ${e.message.slice(0, 40)}`);
      }
    }

    throw new Error(`모든 모델 호출에 실패했습니다.\n${errors.join('\n')}`);
  }

  /**
   * 1. 코멘트 생성
   */
  async function generateComment(studentInfo, gradeData) {
    const system = "You are a helpful and professional English academy teacher. Write a student progress report comment based on the provided score data. Write in South Korean, polite tone (~습니다/합니다). Keep it concise, encouraging, and clear.";
    const prompt = `Student: ${studentInfo}\nGrade Data: ${JSON.stringify(gradeData)}\nPlease generate a comprehensive but warm teacher's comment.`;
    return await _call(prompt, system);
  }

  /**
   * 2. 코멘트 교정 (Proofread)
   */
  async function proofreadComment(currentComment) {
    const system = "You are an expert editor. Correct any grammatical errors, spelling mistakes, or awkward phrasing in the following text. Preserve the original meaning and tone. Return ONLY the corrected text without any introduction or explanation.";
    return await _call(currentComment, system);
  }

  return {
    generateComment,
    proofreadComment
  };

})();