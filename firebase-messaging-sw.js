/**
 * firebase-messaging-sw.js
 *
 * ■ FCM 백그라운드 메시지 수신 Service Worker
 * ■ 위치: 프로젝트 루트 (index.html과 같은 디렉토리)
 * ■ 페이지가 닫혀 있어도 OS 알림을 표시함
 *
 * ★ 주의: firebase-config.js 의 설정값과 동일하게 유지할 것
 */

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey:            'AIzaSyAW7ZIEnEfvVb2QnshD-kr8ovYWL65m2IE',
  authDomain:        'happytree-e16d7.firebaseapp.com',
  databaseURL:       'https://happytree-e16d7-default-rtdb.firebaseio.com',
  projectId:         'happytree-e16d7',
  storageBucket:     'happytree-e16d7.firebasestorage.app',
  messagingSenderId: '154995256418',
  appId:             '1:154995256418:web:19e23f0405d97da1dd353b',
});

const messaging = firebase.messaging();

/* ══════════════════════════════════════════════════════
 * 백그라운드 메시지 수신 → OS 알림 표시
 * (포그라운드는 monitor-fcm.js onMessage 핸들러가 처리)
 * ══════════════════════════════════════════════════════ */
messaging.onBackgroundMessage(payload => {
  console.log('[SW] 백그라운드 메시지 수신:', payload);

  const title = payload.notification?.title || '해피트리 모니터링';
  const body  = payload.notification?.body  || '새 접속이 감지됐습니다';
  const data  = payload.data || {};

  self.registration.showNotification(title, {
    body,
    icon:  '/icon-192.png',
    badge: '/icon-192.png',
    tag:   data.sessionId || 'ht-monitor',
    data:  data,
    vibrate: [200, 100, 200],
    requireInteraction: true,    // 자동으로 사라지지 않음
    actions: [
      { action: 'open',    title: '모니터링 열기' },
      { action: 'dismiss', title: '닫기' },
    ],
  });
});

/* ══════════════════════════════════════════════════════
 * 알림 클릭 → 모니터링 페이지로 포커스 이동
 * ══════════════════════════════════════════════════════ */
self.addEventListener('notificationclick', event => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(windowClients => {
        // 이미 열린 탭이 있으면 포커스
        for (const client of windowClients) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            return client.focus();
          }
        }
        // 없으면 새 탭 열기
        return clients.openWindow('/');
      })
  );
});
