/**
 * gemini-ai.js — Happy Tree English Academy
 * Google Gemini API 연동 모듈 (Teacher's Comment AI 생성 · 교정)
 * grade-app.js 에서 window.GeminiAI 로 접근
 */
const GeminiAI = (() => {
  /* ── API 설정 ──────────────────────────────────────────────── */
  const API_KEY = 'AIzaSyBR_AMVKpuajVmS3XvLVFn3nLdK2BBQ8t8';
  /* 429(한도) 시 순서대로 폴백 — 확인된 유효 모델만 */
  const MODELS = [
    'gemini-2.0-flash',
    'gemini-1.5-flash',
    'gemini-1.5-flash-latest',
  ];
  const _ep = m =>
    `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${API_KEY}`;

  /* ── system_instruction ① — Teacher's Comment 생성 ─────────
   *  - 영어 2~4문장, 긍정·격려 톤 유지
   *  - 성적 수준(우수/보통/부진)에 따라 자동으로 뉘앙스 조정
   *  - 학원 원장·강사가 직접 쓴 듯 자연스럽고 진솔한 문체
   *  - 응답 = 코멘트 텍스트만 (따옴표·이모지·인사말 없이)
   * ──────────────────────────────────────────────────────────── */
  const SI_GENERATE = `
당신은 Happy Tree English Academy의 베테랑 영어 강사입니다.
학생의 이번 달 성적 데이터를 바탕으로, 학부모님께 전달할 Teacher's Comment를 작성합니다.

[작성 원칙]
1. 반드시 영어로 작성하며, 2~4문장 분량을 유지합니다.
2. 항상 긍정적이고 따뜻한 격려로 시작합니다.
3. 학생의 구체적인 성취(단어 통과율, 리딩 점수 등)를 한 가지 이상 언급합니다.
4. 개선이 필요한 부분은 "명령형" 대신 "부드러운 권유형"으로 제안합니다.
   (예: "You should practice more." X → "A little extra practice at home will make a big difference." O)
5. 성적 수준에 따라 톤을 자연스럽게 조절합니다.
   - 단어 통과율 90% 이상 + 리딩 평균 90점 이상: 칭찬 위주, 지속 동기부여
   - 단어 통과율 70~89% 또는 리딩 평균 70~89점: 긍정 평가 + 소폭 성장 제안
   - 단어 통과율 70% 미만 또는 리딩 평균 70점 미만: 노력 인정 + 따뜻한 응원 위주
6. 학원 이름(Happy Tree English Academy)은 코멘트에 포함하지 않습니다.
7. 응답은 코멘트 텍스트만 출력합니다. 따옴표, 이모지, 인삿말, 설명은 절대 포함하지 않습니다.
`.trim();

  /* ── system_instruction ② — 교정(Proofread) ────────────────
   *  - 교사가 직접 쓴 코멘트의 문법·표현·자연스러움만 수정
   *  - 내용·의미·톤은 원문 최대한 유지
   * ──────────────────────────────────────────────────────────── */
  const SI_PROOFREAD = `
당신은 영어 교정 전문가입니다.
입력된 Teacher's Comment의 문법 오류, 어색한 표현, 비자연스러운 어휘를 교정합니다.

[교정 원칙]
1. 교정된 텍스트만 출력합니다. 설명, 비교, 주석은 일절 포함하지 않습니다.
2. 원문의 의미, 어조(따뜻함·격려)를 반드시 유지합니다.
3. 명확한 문법 오류와 어색한 표현만 수정하며, 과도한 재작성은 하지 않습니다.
4. 원문이 이미 자연스러운 경우 그대로 반환합니다.
`.trim();

  /* ── 내부 fetch — 429/404 시 다음 모델로 자동 폴백 ─────────── */
  async function _call(si, userText) {
    let lastErr;
    for (const model of MODELS) {
      try {
        const res = await fetch(_ep(model), {
          method : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body   : JSON.stringify({
            system_instruction: { parts: [{ text: si }] },
            contents          : [{ parts: [{ text: userText }] }],
            generationConfig  : { temperature: 0.75, maxOutputTokens: 350, topP: 0.9 },
          }),
        });
        /* 429=한도초과, 404=모델없음 → 다음 모델 시도 */
        if (res.status === 429 || res.status === 404 || res.status === 503) {
          lastErr = new Error(`${model}_skip_${res.status}`);
          continue;
        }
        if (!res.ok) {
          const t = await res.text().catch(() => '');
          throw new Error(`Gemini API ${res.status}: ${t.slice(0, 120)}`);
        }
        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
        return text.trim().replace(/^["']|["']$/g, '');
      } catch (e) {
        if (/_skip_/.test(e.message)) { lastErr = e; continue; }
        throw e;
      }
    }
    throw new Error('API 요청 한도 초과 — 잠시 후 재시도해 주세요.');
  }

  /* ── 공개 API ─────────────────────────────────────────────── */

  /**
   * 성적 데이터 → Teacher's Comment 자동 생성
   * @param {{ name:string, word:{totalQ,pass,retake}, reading:{[k]:{score}} }} student
   */
  async function generateComment(student) {
    const total   = student.word?.totalQ ?? 0;
    const pass    = student.word?.pass   ?? 0;
    const retake  = student.word?.retake ?? 0;
    const pct     = total > 0 ? Math.round(pass / total * 100) : 0;

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

    const prompt = `학생 성적 정보:
이름: ${student.name}
단어 시험: 총 ${total}문항 중 ${pass}개 통과 (통과율 ${pct}%), 재시험 ${retake}회
리딩 점수: ${rdStr}${rdAvg != null ? ` (평균 ${rdAvg}점)` : ''}

위 정보를 바탕으로 학부모님께 전달할 Teacher's Comment를 작성해 주세요.`;

    return _call(SI_GENERATE, prompt);
  }

  /**
   * 기존 코멘트 교정
   * @param {string} comment  원문
   */
  async function proofreadComment(comment) {
    if (!comment?.trim()) throw new Error('교정할 텍스트가 없습니다.');
    return _call(SI_PROOFREAD, `다음 Teacher's Comment를 교정해 주세요:\n\n${comment.trim()}`);
  }

  return { generateComment, proofreadComment };
})();
