/**
 * Service Worker — ทำให้แอปเปิดได้ 100% ตอนออฟไลน์
 * กติกา: ข้าม request ที่ไปหา script.google.com เสมอ (ข้อมูลสด ห้ามแคช)
 */
var CACHE = 'phonecheck-v3';   /*** ⚠️ แก้ตรงนี้ ***/ /* เปลี่ยนเลขเวอร์ชันทุกครั้งที่แก้ไฟล์ใน web/ */

var SHELL = [
  './',
  './index.html',
  './verify.js',
  './mock-api.js',
  './manifest.json',
  './print-cards.html',
  './test.html',
  'https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      // แคชทีละไฟล์ ถ้าไฟล์ใดโหลดไม่ได้ก็ไม่ให้ล้มทั้งชุด
      return Promise.all(SHELL.map(function (url) {
        return c.add(new Request(url, { mode: 'cors' }))['catch'](function () {});
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        return k === CACHE ? null : caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var url = e.request.url;

  // ข้าม API ทั้งหมด ปล่อยให้วิ่งเน็ตตรง ๆ (ฝั่งแอปมี timeout 5 วิ + คิวออฟไลน์อยู่แล้ว)
  if (url.indexOf('script.google.com') !== -1 || url.indexOf('googleusercontent.com') !== -1) return;
  if (e.request.method !== 'GET') return;

  // cache first: เปิดเร็วและใช้ได้แม้ไม่มีสัญญาณ แล้วค่อยอัปเดตแคชเบื้องหลัง
  e.respondWith(
    caches.match(e.request, { ignoreSearch: false }).then(function (hit) {
      var net = fetch(e.request).then(function (res) {
        if (res && res.status === 200 && res.type !== 'opaque') {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
        }
        return res;
      })['catch'](function () { return hit; });
      return hit || net;
    })
  );
});
