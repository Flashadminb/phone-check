/**
 * MockAPI — จำลอง API ทั้งหมดด้วยข้อมูลปลอม ใช้เมื่อ USE_MOCK = true ใน index.html
 * ทดสอบหน้าจอได้ทันทีโดยยังไม่ต้อง deploy Apps Script
 *
 * sig8 ในนี้เป็นค่าสมมติที่ "ตรงกันเอง" ระหว่างฐานข้อมูลปลอมกับข้อความ QR ปลอม
 * (ของจริงเซิร์ฟเวอร์คำนวณด้วย HMAC-SHA256 ให้)
 */
(function (global) {
  'use strict';

  var EMPLOYEES = [
    { emp_id: 'E00123', name: 'สมชาย ใจดี', supplier: 'ซัพพลายเออร์ A', photo_url: '', status: 'ACTIVE' },
    { emp_id: 'E00124', name: 'สมหญิง รักงาน', supplier: 'ซัพพลายเออร์ B', photo_url: '', status: 'ACTIVE' },
    { emp_id: 'E00125', name: 'มานะ อดทน', supplier: 'ซัพพลายเออร์ A', photo_url: '', status: 'RESIGNED' }
  ];

  /* ชุดเดียวกับข้อมูลตัวอย่างที่ setupSheets สร้างในชีต */
  var DEVICES = [
    /* บัตรปกติ ผ่านทุกข้อ */
    { device_id: 'D0001', emp_id: 'E00123', imei: '356789012345671', brand_model: 'Samsung Galaxy A54',
      color: 'ดำ', permit_expiry: '2027-12-31', status: 'ACTIVE', sig8: '9fA3kZ0x' },
    /* ใบอนุญาตหมดอายุ */
    { device_id: 'D0002', emp_id: 'E00124', imei: '356789012345672', brand_model: 'iPhone 12',
      color: 'ขาว', permit_expiry: '2024-01-31', status: 'ACTIVE', sig8: 'Qq7Lm2Bv' },
    /* เครื่องปกติ แต่พนักงานลาออกแล้ว */
    { device_id: 'D0003', emp_id: 'E00125', imei: '356789012345673', brand_model: 'Oppo A78',
      color: 'น้ำเงิน', permit_expiry: '2027-12-31', status: 'ACTIVE', sig8: 'Tz4Xn8Ra' }
  ];

  var GUARDS = [
    { guard_id: 'G01', name: 'ยามสมพงษ์', gate: 'ประตู 1', pin: '1234', status: 'ACTIVE' },
    { guard_id: 'G02', name: 'ยามวิชัย', gate: 'ประตู 2', pin: '1234', status: 'ACTIVE' }
  ];

  var SAVED_LOGS = [];   // เก็บ log ที่ "ส่งขึ้นชีต" แล้ว (อยู่ในหน่วยความจำ)
  var SEEN = {};         // log_id ที่เคยรับแล้ว ใช้กันซ้ำเหมือนของจริง

  function delay(ms, value) {
    return new Promise(function (res) { setTimeout(function () { res(value); }, ms); });
  }

  function tokenFor(guardId) {
    return guardId + '.' + (Date.now() + 12 * 3600 * 1000) + '.MOCKSIG0';
  }

  function checkToken(token) {
    var p = String(token || '').split('.');
    if (p.length !== 3 || p[2] !== 'MOCKSIG0') return null;
    if (Number(p[1]) <= Date.now()) return null;
    return p[0];
  }

  function guardInfo(guardId) {
    for (var i = 0; i < GUARDS.length; i++) {
      if (GUARDS[i].guard_id === guardId) {
        return { guard_id: GUARDS[i].guard_id, name: GUARDS[i].name, gate: GUARDS[i].gate };
      }
    }
    return { guard_id: guardId, name: guardId, gate: '-' };
  }

  function syncPayload(guardId) {
    return {
      ok: true, ts: Date.now(), guard: guardInfo(guardId),
      employees: JSON.parse(JSON.stringify(EMPLOYEES)),
      devices: JSON.parse(JSON.stringify(DEVICES))
    };
  }

  var MockAPI = {
    get: function (params) {
      if (params.action === 'ping') return delay(150, { ok: true, ts: Date.now() });
      if (params.action === 'sync') {
        var g = checkToken(params.token);
        if (!g) return delay(150, { ok: false, err: 'TOKEN', msg: 'token หมดอายุหรือไม่ถูกต้อง' });
        return delay(250, syncPayload(g));
      }
      return delay(100, { ok: false, err: 'ACTION', msg: 'ไม่รู้จัก action' });
    },

    post: function (body) {
      if (body.action === 'login') {
        var gid = String(body.guard_id || '').toUpperCase();
        for (var i = 0; i < GUARDS.length; i++) {
          if (GUARDS[i].guard_id !== gid) continue;
          if (GUARDS[i].status !== 'ACTIVE') {
            return delay(200, { ok: false, err: 'GUARD_STATUS', msg: 'บัญชียามถูกระงับ' });
          }
          if (String(body.pin) !== GUARDS[i].pin) {
            return delay(300, { ok: false, err: 'PIN', msg: 'PIN ไม่ถูกต้อง' });
          }
          var out = syncPayload(gid);
          out.token = tokenFor(gid);
          return delay(300, out);
        }
        return delay(300, { ok: false, err: 'NOT_FOUND', msg: 'ไม่พบรหัสยามนี้ (ลอง G01 / PIN 1234)' });
      }

      if (body.action === 'logs') {
        if (!checkToken(body.token)) {
          return delay(150, { ok: false, err: 'TOKEN', msg: 'token หมดอายุหรือไม่ถูกต้อง' });
        }
        var logs = (body.logs || []).slice(0, 50);
        var saved = [], skipped = [];
        for (var j = 0; j < logs.length; j++) {
          var id = logs[j].log_id;
          if (SEEN[id]) { skipped.push(id); continue; }
          SEEN[id] = true;
          SAVED_LOGS.push(logs[j]);
          saved.push(id);
        }
        return delay(400, { ok: true, saved: saved, skipped: skipped });
      }

      return delay(100, { ok: false, err: 'ACTION', msg: 'ไม่รู้จัก action' });
    },

    /* ข้อความ QR ตัวอย่างไว้ทดสอบ (พิมพ์ผ่านปุ่ม "พิมพ์รหัสเอง" ได้เลย) */
    demoQR: {
      ok: 'E00123|D0001|9fA3kZ0x',
      expired: 'E00124|D0002|Qq7Lm2Bv',
      resigned: 'E00125|D0003|Tz4Xn8Ra',
      fake: 'E00123|D0001|AAAAAAAA',
      unknown: 'E00999|D9999|ZZZZZZZZ',
      badFormat: 'HELLO WORLD'
    },

    _data: { employees: EMPLOYEES, devices: DEVICES, guards: GUARDS, logs: SAVED_LOGS }
  };

  global.MockAPI = MockAPI;
})(typeof window !== 'undefined' ? window : this);
