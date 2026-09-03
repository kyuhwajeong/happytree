/**
 * monitor-fcm.js — v1.0
 *
 * ■ 역할
 *   1. 모니터링 화면 진입 시 FCM 토큰 발급 & Firebase에 저장
 *   2. 다른 사용자가 로그인할 때 저장된 토큰으로 푸시 전송
 *   3. 만료된 토큰 자동 정리
 *
 * ■ 의존
 *   firebase-config.js (FireDB)
 *   firebase-messaging SDK (index.html에서 로드)
 *
 * ★ VAPID_KEY 설정 방법
 *   Firebase Console → 프로젝트 설정 → 클라우드 메시징
 *   → 웹 푸시 인증서 → 키 쌍 생성 → 공개 키 복사
 *   아래 VAPID_KEY 값으로 붙여넣기
 */
const MonitorFCM = (() => {

  /* ══════════════════════════════════════════════════════
   * ★ VAPID 공개 키 — Firebase Console에서 발급 후 교체
   *   Firebase Console → Project Settings →
   *   Cloud Messaging → Web Push certificates → Generate key pair
   * ══════════════════════════════════════════════════════ */
  const VAPID_KEY = 'BKfXqq2yPv7UHXoXRRZEPitBrFe1-3DuLE2DYpvgBDqqe0Ils1ireJQhN3Tv2ieRgiHQ7aItEfOtolW4hMovwJQ';

  /* ══════════════════════════════════════════════════════
   * 내부 상수
   * ══════════════════════════════════════════════════════ */
  const TOKENS_PATH  = 'hakwon10/monitor/fcm_tokens';
  const NOTIFY_API   = '/api/notify';
  const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30일

  let _messaging = null;
  let _myToken   = null;
  let _deviceId  = _getDeviceId();

  /* 기기 고유 ID (localStorage 기반) */
  function _getDeviceId() {
    let id = localStorage.getItem('hk_fcm_did');
    if (!id) {
      id = 'did_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      localStorage.setItem('hk_fcm_did', id);
    }
    return id;
  }

  /* ══════════════════════════════════════════════════════
   * 모니터링 화면 진입 시 FCM 등록
   * (MonitorApp.show() 에서 호출)
   * ══════════════════════════════════════════════════════ */
  async function register() {
    try {
      /* Firebase Messaging SDK 확인 */
      if (!firebase?.messaging) {
        console.warn('[MonitorFCM] firebase-messaging SDK가 로드되지 않았습니다');
        return false;
      }

      /* Service Worker 등록 확인 */
      if (!('serviceWorker' in navigator)) {
        console.warn('[MonitorFCM] Service Worker를 지원하지 않는 브라우저입니다');
        return false;
      }

      /* Service Worker 등록 */
      const swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
      console.log('[MonitorFCM] Service Worker 등록됨');

      /* FCM Messaging 초기화 */
      _messaging = firebase.messaging();

      /* 알림 권한 요청 */
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        console.warn('[MonitorFCM] 알림 권한 거부됨');
        return false;
      }

      /* FCM 토큰 발급 */
      _myToken = await _messaging.getToken({
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration: swReg,
      });

      if (!_myToken) {
        console.warn('[MonitorFCM] 토큰 발급 실패');
        return false;
      }

      /* Firebase에 토큰 저장 (★ role도 함께 저장 — 급여일 알림처럼 관리자에게만 보내야 하는
       * 푸시를 서버(크론) 쪽에서 필터링할 수 있어야 하기 때문) */
      const _role = (typeof DB !== 'undefined' && DB.getRole) ? DB.getRole() : '';
      await FireDB.set(`${TOKENS_PATH}/${_deviceId}`, {
        token:     _myToken,
        deviceId:  _deviceId,
        role:      _role,
        savedAt:   new Date().toISOString(),
        expireAt:  Date.now() + TOKEN_TTL_MS,
        ua:        navigator.userAgent.slice(0, 80),
      });

      console.log('[MonitorFCM] ✅ FCM 등록 완료:', _myToken.slice(0, 20) + '...');

      /* 포그라운드 메시지 핸들러 — 앱이 열려 있을 때 */
      _messaging.onMessage(payload => {
        console.log('[MonitorFCM] 포그라운드 메시지:', payload);
        /* 포그라운드에서는 MonitorApp이 자체 알림을 처리하므로
           여기서는 중복 방지를 위해 OS 알림을 표시하지 않음 */
      });

      /* 만료 토큰 정리 */
      _cleanupExpiredTokens();

      return true;
    } catch (err) {
      console.error('[MonitorFCM] 등록 오류:', err);
      return false;
    }
  }

  /* ══════════════════════════════════════════════════════
   * 새 세션 발생 시 모든 등록된 기기로 푸시 전송
   * (MonitorDB.startSession() 에서 호출)
   * ══════════════════════════════════════════════════════ */
  async function notifyNewSession(session) {
    try {
      if (!FireDB.ready()) return;

      /* 등록된 FCM 토큰 모두 조회 */
      const raw = await FireDB.get(TOKENS_PATH);
      if (!raw) return;

      const now    = Date.now();
      const tokens = Object.values(raw)
        .filter(t => t && t.token && t.expireAt > now)
        .map(t => t.token);

      if (!tokens.length) {
        console.log('[MonitorFCM] 등록된 FCM 토큰 없음 — 푸시 생략');
        return;
      }

      /* 알림 내용 구성 */
      const roleLabels = { admin:'관리자', manager:'매니저', operator:'운용자', teacher:'강사' };
      const role  = roleLabels[session.role] || session.role;
      const title = `👤 ${session.username} 로그인`;
      const body  = `${role} · ${session.ip} · ${session.ua || '기기불명'}`;

      /* Vercel API Route 호출 */
      const res = await fetch(NOTIFY_API, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          tokens,
          title,
          body,
          data: {
            sessionId: session.id,
            username:  session.username,
            role:      session.role,
            ip:        session.ip,
          },
        }),
      });

      if (!res.ok) {
        console.warn('[MonitorFCM] 푸시 전송 실패:', res.status, await res.text());
        return;
      }

      const result = await res.json();
      console.log(`[MonitorFCM] ✅ 푸시 전송: ${tokens.length}개 기기`);

      /* 만료된 토큰 자동 삭제 */
      if (result.invalidTokens?.length) {
        await _removeInvalidTokens(result.invalidTokens);
      }

    } catch (err) {
      console.warn('[MonitorFCM] notifyNewSession 오류:', err);
    }
  }

  /* ══════════════════════════════════════════════════════
   * 만료 토큰 정리
   * ══════════════════════════════════════════════════════ */
  async function _cleanupExpiredTokens() {
    try {
      const raw = await FireDB.get(TOKENS_PATH);
      if (!raw) return;
      const now = Date.now();
      await Promise.all(
        Object.entries(raw)
          .filter(([, t]) => t && t.expireAt < now)
          .map(([id]) => FireDB.remove(`${TOKENS_PATH}/${id}`))
      );
    } catch(e) { /* 무시 */ }
  }

  async function _removeInvalidTokens(invalidTokens) {
    try {
      const raw = await FireDB.get(TOKENS_PATH);
      if (!raw) return;
      const invalids = new Set(invalidTokens);
      await Promise.all(
        Object.entries(raw)
          .filter(([, t]) => t && invalids.has(t.token))
          .map(([id]) => FireDB.remove(`${TOKENS_PATH}/${id}`))
      );
      console.log(`[MonitorFCM] 만료 토큰 ${invalidTokens.length}개 삭제`);
    } catch(e) { /* 무시 */ }
  }

  /* ══════════════════════════════════════════════════════
   * 내 토큰 등록 해제 (모니터링 종료 시)
   * ══════════════════════════════════════════════════════ */
  async function unregister() {
    try {
      await FireDB.remove(`${TOKENS_PATH}/${_deviceId}`);
      if (_messaging && _myToken) {
        await _messaging.deleteToken();
      }
      _myToken = null;
      console.log('[MonitorFCM] FCM 등록 해제');
    } catch(e) { /* 무시 */ }
  }

  /* ══ 공개 API ══ */
  return { register, unregister, notifyNewSession };
})();
