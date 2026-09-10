/**
 * Service Worker — ทำให้แอปเปิดได้ 100% ตอนออฟไลน์
 * กติกา: ข้าม request ที่ไปหา script.google.com เสมอ (ข้อมูลสด ห้ามแคช)
 */
var CACHE = 'phonecheck-v5';   /*** ⚠️ แก้ตรงนี้ ***/ /* เปลี่ยนเลขเวอร์ชันทุกครั้งที่แก้ไฟล์ใน web/ */

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

  // หน้าเว็บและสคริปต์ของแอป: เอาของใหม่จากเน็ตก่อนเสมอ (จะได้ไม่ต้องปิด-เปิดแอปหลายรอบ)
  // ถ้าเน็ตล่ม/ช้าเกิน 3 วินาที ค่อยใช้ของที่แคชไว้ → ออฟไลน์ยังใช้ได้เหมือนเดิม
  var isApp = e.request.mode === 'navigate' ||
              /\.(html|js|json)$/.test(new URL(url).pathname);

  if (isApp) {
    e.respondWith(
      new Promise(function (resolve) {
        var done = false;
        var fallback = setTimeout(function () {
          if (done) return;
          caches.match(e.request).then(function (hit) {
            if (hit && !done) { done = true; resolve(hit); }
          });
        }, 3000);

        fetch(e.request).then(function (res) {
          if (done) return;
          done = true; clearTimeout(fallback);
          if (res && res.status === 200) {
            var copy = res.clone();
            caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
          }
          resolve(res);
        })['catch'](function () {
          if (done) return;
          done = true; clearTimeout(fallback);
          caches.match(e.request).then(function (hit) {
            resolve(hit || new Response('offline', { status: 503 }));
          });
        });
      })
    );
    return;
  }

  // ไฟล์อื่น (รูป ฟอนต์ ไลบรารี): cache first เพื่อความเร็ว แล้วอัปเดตเบื้องหลัง
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
