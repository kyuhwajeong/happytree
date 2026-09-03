/**
 * api/payroll-reminder.js — v1.0
 *
 * ■ 역할
 *   매일 정해진 시각에 Vercel Cron이 이 엔드포인트를 호출한다.
 *   재직 중인 전 직원의 급여 지급일(payDay, 0=말일)을 확인해서,
 *   "오늘이 지급일" 또는 "내일이 지급일"인 직원이 있으면
 *   관리자(role='admin') + 운용자(role='operator', 원장 역할) 기기로만 실제 푸시 알림을 보낸다.
 *
 * ■ 왜 서버(크론)에서 처리하나
 *   기존 일정표의 "알림"은 앱을 열어야만 뜨는 인앱 팝업이라, 관리자가
 *   그날 앱을 안 열면 급여일을 놓칠 수 있다. 휴대폰에 뜨는 진짜 푸시는
 *   앱이 꺼져 있어도 도착하므로, 이 엔드포인트를 통해 서버에서 직접 보낸다.
 *
 * ■ 필요한 Vercel 환경변수 (api/notify.js와 동일한 서비스 계정 재사용)
 *   FCM_SERVICE_ACCOUNT = Firebase 서비스 계정 JSON 전체
 *   CRON_SECRET         = Vercel이 크론 호출 시 자동으로 Authorization 헤더에 실어주는 비밀값
 *                          (vercel.json에 crons 등록 시 Vercel이 자동 관리 — 직접 값을 만들 필요 없음.
 *                           단, Vercel 프로젝트 설정에서 Cron Job Protection이 켜져 있어야
 *                           아래 검증이 정상 동작한다.)
 *
 * ■ 이 파일이 건드리는 Firebase 경로 (전부 읽기 전용 + 로그 기록 1건만 씀)
 *   hakwon10/staff                      — 직원 목록(급여 지급일 계산용)
 *   hakwon10/monitor/fcm_tokens         — 관리자 기기 푸시 토큰
 *   hakwon10/payrollReminderLog/{date}  — 오늘 이미 발송했는지 기록(중복 발송 방지)
 */
import crypto from 'crypto';

const DATABASE_URL = 'https://happytree-e16d7-default-rtdb.firebaseio.com';

/* ══════════════════════════════════════════════════════
 * 서비스 계정으로 Google OAuth2 액세스 토큰 발급 (scope로 용도 구분)
 * ══════════════════════════════════════════════════════ */
async function getAccessToken(sa, scope) {
  const now = Math.floor(Date.now() / 1000);
  const header  = _b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = _b64u(JSON.stringify({
    iss: sa.client_email, scope, aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600,
  }));
  const toSign = `${header}.${payload}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(toSign);
  const sig = signer.sign(sa.private_key, 'base64url');
  const jwt = `${toSign}.${sig}`;

  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  const d = await r.json();
  if (!d.access_token) throw new Error(`토큰 발급 실패(${scope}): ${JSON.stringify(d)}`);
  return d.access_token;
}

function _b64u(str) { return Buffer.from(str).toString('base64url'); }

/* ══════════════════════════════════════════════════════
 * Realtime Database REST 읽기/쓰기 (서비스 계정 토큰으로 보안규칙 우회)
 * ══════════════════════════════════════════════════════ */
async function dbGet(path, token) {
  const r = await fetch(`${DATABASE_URL}/${path}.json`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`DB GET 실패(${path}): HTTP ${r.status}`);
  return r.json();
}
async function dbPut(path, token, value) {
  const r = await fetch(`${DATABASE_URL}/${path}.json`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
  });
  if (!r.ok) throw new Error(`DB PUT 실패(${path}): HTTP ${r.status}`);
  return r.json();
}

/* ══════════════════════════════════════════════════════
 * FCM V1 API로 단일 토큰에 푸시 전송 (api/notify.js와 동일 로직)
 * ══════════════════════════════════════════════════════ */
async function sendOne(projectId, accessToken, token, title, body, data) {
  const r = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        token,
        notification: { title, body },
        data: Object.fromEntries(Object.entries(data || {}).map(([k, v]) => [k, String(v)])),
        android: { priority: 'high' },
        apns: { headers: { 'apns-priority': '10' } },
        webpush: { headers: { Urgency: 'high' }, notification: { title, body, requireInteraction: true, vibrate: [200, 100, 200] } },
      },
    }),
  });
  const result = await r.json();
  return { ok: !!result.name, result };
}

/* ── 'YYYY-MM-DD' 문자열에 일수를 더한 새 날짜 문자열 (한국시간 기준) ── */
function _addDaysKST(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/* ── 지금 이 순간의 한국시간(KST, UTC+9) 날짜 문자열 'YYYY-MM-DD' ── */
function _todayKST() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

/* ── 특정 직원의 이번 "월"의 실제 지급일(YYYY-MM-DD) 계산. payDay=0이면 말일 ── */
function _payDateFor(payDay, year, month) {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate(); // month는 1~12, Date(year,month,0)=그 달 마지막날
  const day = payDay > 0 ? Math.min(payDay, lastDay) : lastDay;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  // ★ Vercel Cron이 아닌 외부에서 함부로 호출하지 못하도록 보호.
  //   Vercel 프로젝트에 CRON_SECRET을 설정해두면, Vercel이 크론 호출 시
  //   자동으로 이 헤더를 실어서 보낸다. 로컬 테스트 등 CRON_SECRET 미설정 시엔 검증을 건너뛴다.
  if (process.env.CRON_SECRET) {
    const auth = req.headers.authorization || '';
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const saRaw = process.env.FCM_SERVICE_ACCOUNT;
  if (!saRaw) return res.status(500).json({ error: 'FCM_SERVICE_ACCOUNT not configured' });
  let sa;
  try { sa = JSON.parse(saRaw); } catch (e) { return res.status(500).json({ error: 'FCM_SERVICE_ACCOUNT JSON 파싱 실패' }); }

  try {
    const dbToken  = await getAccessToken(sa, 'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email');
    const todayStr = _todayKST();
    const tomorrowStr = _addDaysKST(todayStr, 1);

    // ★ 이미 오늘 발송했으면 중단 (크론 중복 실행/재시도 대비)
    const already = await dbGet(`hakwon10/payrollReminderLog/${todayStr}`, dbToken).catch(() => null);
    if (already) {
      return res.status(200).json({ ok: true, skipped: 'already sent today', date: todayStr });
    }

    const staffRaw = await dbGet('hakwon10/staff', dbToken);
    const staffList = staffRaw ? Object.values(staffRaw) : [];
    const activeStaff = staffList.filter(s => s && s.status === '재직');

    const [ty, tm] = todayStr.split('-').map(Number);
    const [my, mm] = tomorrowStr.split('-').map(Number); // 월 경계(말일→다음달 1일) 대비 별도 계산

    const todayPayees = [];
    const tomorrowPayees = [];
    activeStaff.forEach(s => {
      const payDay = Number(s.payDay || 0);
      const todayPayDate    = _payDateFor(payDay, ty, tm);
      const tomorrowPayDate = _payDateFor(payDay, my, mm);
      if (todayPayDate === todayStr) todayPayees.push(s.name || '이름없음');
      if (tomorrowPayDate === tomorrowStr) tomorrowPayees.push(s.name || '이름없음');
    });

    if (!todayPayees.length && !tomorrowPayees.length) {
      await dbPut(`hakwon10/payrollReminderLog/${todayStr}`, dbToken, { checkedAt: new Date().toISOString(), sent: false });
      return res.status(200).json({ ok: true, sent: false, reason: 'no payees today/tomorrow' });
    }

    // ★ 관리자(admin) + 운용자(operator, 이 학원에서는 운용자가 원장 역할) 기기 토큰만 조회
    //   급여 알림은 이 두 역할에만 보낸다.
    const tokensRaw = await dbGet('hakwon10/monitor/fcm_tokens', dbToken);
    const now = Date.now();
    const TARGET_ROLES = ['admin', 'operator'];
    const adminTokens = tokensRaw
      ? Object.values(tokensRaw).filter(t => t && t.token && TARGET_ROLES.includes(t.role) && t.expireAt > now).map(t => t.token)
      : [];

    if (!adminTokens.length) {
      await dbPut(`hakwon10/payrollReminderLog/${todayStr}`, dbToken, { checkedAt: new Date().toISOString(), sent: false, reason: 'no admin/operator tokens' });
      return res.status(200).json({ ok: true, sent: false, reason: 'no registered admin/operator devices' });
    }

    const fcmToken  = await getAccessToken(sa, 'https://www.googleapis.com/auth/firebase.messaging');
    const projectId = sa.project_id;
    const messages = [];
    if (todayPayees.length)    messages.push({ title: '💰 오늘은 급여 지급일입니다',   body: `${todayPayees.join(', ')} 급여를 오늘 지급해주세요.` });
    if (tomorrowPayees.length) messages.push({ title: '💰 내일은 급여 지급일입니다', body: `${tomorrowPayees.join(', ')} 급여 지급을 준비해주세요.` });

    let successTotal = 0, failureTotal = 0;
    for (const msg of messages) {
      const results = await Promise.allSettled(
        adminTokens.map(t => sendOne(projectId, fcmToken, t, msg.title, msg.body, { type: 'payroll-reminder' }))
      );
      successTotal += results.filter(r => r.status === 'fulfilled' && r.value.ok).length;
      failureTotal += results.length - results.filter(r => r.status === 'fulfilled' && r.value.ok).length;
    }

    await dbPut(`hakwon10/payrollReminderLog/${todayStr}`, dbToken, {
      checkedAt: new Date().toISOString(), sent: true,
      todayPayees, tomorrowPayees, successTotal, failureTotal,
    });

    return res.status(200).json({ ok: true, sent: true, todayPayees, tomorrowPayees, successTotal, failureTotal });
  } catch (err) {
    console.error('[payroll-reminder] 오류:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
