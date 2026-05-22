/**
 * gemini-ai.js — Happy Tree English Academy  v2.0
 * Google Gemini API 연동 (Teacher's Comment 생성·교정)
 *
 * ★ API 키 변경 시 아래 API_KEY 만 교체하면 됩니다.
 */
const GeminiAI = (() => {

  /* ── API 설정 ─────────────────────────────────────────────── */
  const API_KEY = 'AIzaSyD2Wb42KuIPr_juXkwPHOB0YQW2otBBZhU'; // ← 키 교체 위치

  /**
   * 모델 폴백 순서
   *  - gemini-1.5-flash     : 무료 티어 안정적 (15 RPM / 1500 RPD)
   *  - gemini-1.5-flash-8b  : 경량, 한도 더 여유
   *  - gemini-2.0-flash     : 최신, 지역·플랜에 따라 제한 있음
   *  - gemini-1.0-pro       : 구형이지만 폴백 최후 수단
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

  /* ── 프롬프트 구성 (system_instruction 미사용 — 모델 호환성 ↑) ── */
  function _buildGeneratePrompt(student) {
    const total  = student.word?.totalQ ?? 0;
    const pass   = student.word?.pass   ?? 0;
    const retake = student.word?.retake ?? 0;
    const pct    = total > 0 ? Math.round(pass / total * 100) : 0;

    const rdEntries = Object.entries(student.reading ?? {})
      .filter(([, v]) => v?.score != null && v.score !== '')
      .map(([k, v]) => `${k}: ${v.score}점`);
    const rdStr = rdEntries.length ? rdEntries.join(', ') : '미응시';
    const rdAvg = rdEntries.length
      ? Math.round(
          Object.values(student.reading ?? {})
            .filter(v => v?.score != null && v.score !== '')
            .reduce((s, v) => s + Number(v.score), 0)
          / rdEntries.length
        )
      : null;

    return `당신은 Happy Tree English Academy의 베테랑 영어 강사입니다.
학생 성적을 바탕으로 학부모님께 전달할 Teacher's Comment를 영어로 작성해 주세요.

[작성 원칙]
- 반드시 영어로 2~4문장 작성합니다.
- 항상 긍정적이고 따뜻한 격려로 시작합니다.
- 학생의 구체적인 성취를 한 가지 이상 언급합니다.
- 개선 제안은 "부드러운 권유형"으로 합니다.
- 학원 이름은 포함하지 않습니다.
- 코멘트 텍스트만 출력합니다. 따옴표·이모지·설명 없이.

[학생 성적]
이름: ${student.name}
단어: 총 ${total}문항 중 ${pass}개 통과 (${pct}%), 재시험 ${retake}회
리딩: ${rdStr}${rdAvg != null ? ` (평균 ${rdAvg}점)` : ''}`;
  }

  function _buildProofPrompt(comment) {
    return `당신은 영어 교정 전문가입니다.
아래 Teacher's Comment의 문법 오류와 어색한 표현만 교정해 주세요.

[교정 원칙]
- 교정된 텍스트만 출력합니다. 설명·비교·주석 없이.
- 원문의 의미와 따뜻한 톤을 반드시 유지합니다.
- 이미 자연스러우면 그대로 반환합니다.

[원문]
${comment.trim()}`;
  }

  /* ── 내부 fetch — 모델 폴백 + 재시도 딜레이 ──────────────── */
  async function _call(promptText) {
    const body = {
      contents       : [{ role: 'user', parts: [{ text: promptText }] }],
      generationConfig: { temperature: 0.75, maxOutputTokens: 350, topP: 0.9 },
    };

    const errors = [];

    for (let i = 0; i < MODELS.length; i++) {
      const model = MODELS[i];
      if (i > 0) await _delay(600); // 모델 전환 시 600ms 대기

      try {
        const res = await fetch(_ep(model), {
          method : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body   : JSON.stringify(body),
        });

        if (res.status === 429 || res.status === 503) {
          errors.push(`${model}: 한도초과(${res.status})`);
          continue;
        }
        if (res.status === 404) {
          errors.push(`${model}: 모델없음(404)`);
          continue;
        }
        if (!res.ok) {
          const t = await res.text().catch(() => '');
          // 400 key expired → 즉시 throw (다음 모델도 동일한 키라 무의미)
          if (res.status === 400 && t.includes('API key')) {
            throw new Error('API 키가 만료되었습니다. 새 키로 교체해 주세요.');
          }
          throw new Error(`Gemini API ${res.status}: ${t.slice(0, 100)}`);
        }

        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
        if (!text) throw new Error('응답 텍스트가 비어있습니다.');
        return text.trim().replace(/^["']|["']$/g, '');

      } catch (e) {
        if (e.message.includes('키가 만료') || e.message.startsWith('Gemini API')) throw e;
        errors.push(`${model}: ${e.message.slice(0, 40)}`);
      }
    }

    throw new Error(`모든 모델 요청 실패:\n${errors.join('\n')}`);
  }

  /* ── 공개 API ─────────────────────────────────────────────── */
  async function generateComment(student) {
    return _call(_buildGeneratePrompt(student));
  }

  async function proofreadComment(comment) {
    if (!comment?.trim()) throw new Error('교정할 텍스트를 먼저 입력하세요.');
    return _call(_buildProofPrompt(comment));
  }

  return { generateComment, proofreadComment };
})();
