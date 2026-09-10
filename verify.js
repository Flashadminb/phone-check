/**
 * ตรรกะตรวจบัตร QR — ใช้ร่วมกันระหว่าง index.html (หน้าใช้งานจริง) และ test.html (ยูนิตเทส)
 * ทำงานในเครื่องล้วน ๆ ไม่มี network ไม่มี SECRET  → เร็ว < 0.5 วิ และปลอดภัยแม้อยู่บนมือถือส่วนตัว
 *
 * รูปแบบ QR:  <emp_id>|<device_id>|<sig8>
 * sig8 เซิร์ฟเวอร์คำนวณมาให้แล้วตอน sync — ฝั่งนี้แค่ "เทียบสตริง"
 */
(function (global) {
  'use strict';

  // แปลง payload จาก sync ให้เป็น index (map) เพื่อค้นหาเร็ว O(1)
  function buildDB(sync) {
    var db = { emp: {}, dev: {}, ts: (sync && sync.ts) || 0 };
    var employees = (sync && sync.employees) || [];
    var devices = (sync && sync.devices) || [];
    for (var i = 0; i < employees.length; i++) {
      db.emp[String(employees[i].emp_id).trim()] = employees[i];
    }
    for (var j = 0; j < devices.length; j++) {
      db.dev[String(devices[j].device_id).trim()] = devices[j];
    }
    return db;
  }

  // วันที่วันนี้แบบ yyyy-MM-dd (เวลาเครื่อง) ใช้เทียบวันหมดอายุแบบสตริง เลี่ยงปัญหา timezone
  function todayYMD(nowMs) {
    var d = nowMs ? new Date(nowMs) : new Date();
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day);
  }

  function fail(code, msg, extra) {
    var r = { ok: false, code: code, msg: msg, emp_id: '', device_id: '', emp: null, dev: null };
    if (extra) for (var k in extra) r[k] = extra[k];
    return r;
  }

  /**
   * verify(text, db, nowMs)
   * @param text  ข้อความที่อ่านได้จาก QR
   * @param db    ผลจาก buildDB() หรือ payload sync ดิบ ๆ ก็ได้
   * @param nowMs เวลาปัจจุบัน (ใส่เองได้ตอนเทส)
   * @return {ok, code, msg, emp_id, device_id, emp, dev}
   */
  function verify(text, db, nowMs) {
    if (db && db.employees) db = buildDB(db);           // เผื่อส่ง payload ดิบมา
    if (!db || !db.dev) return fail('NO_DB', 'ยังไม่มีข้อมูลในเครื่อง กรุณา sync');

    // กติกาข้อ 1: รูปแบบ QR ต้องเป็น 3 ส่วนคั่นด้วย |
    var s = String(text == null ? '' : text).trim();
    var p = s.split('|');
    if (p.length !== 3 || !p[0] || !p[1] || !p[2]) {
      return fail('FORMAT', 'รูปแบบ QR ไม่ถูกต้อง ไม่ใช่บัตรของระบบนี้');
    }
    var empId = p[0].trim(), devId = p[1].trim(), sig = p[2].trim();

    // กติกาข้อ 2: ต้องเจอ device_id ในฐานข้อมูลในเครื่อง
    var dev = db.dev[devId];
    if (!dev) {
      return fail('NO_DEVICE', 'ไม่พบเครื่องนี้ในระบบ (' + devId + ')', { emp_id: empId, device_id: devId });
    }

    // กติกาข้อ 3: ลายเซ็นต้องตรง และ emp_id ต้องตรงกับที่ผูกเครื่องไว้
    if (String(dev.sig8) !== sig || String(dev.emp_id).trim() !== empId) {
      return fail('BAD_SIG', 'บัตรปลอม ลายเซ็นไม่ตรงกับระบบ', { emp_id: empId, device_id: devId, dev: dev });
    }

    var emp = db.emp[String(dev.emp_id).trim()] || null;

    // กติกาข้อ 4: สถานะเครื่องต้อง ACTIVE
    var dstatus = String(dev.status || '').trim().toUpperCase();
    if (dstatus !== 'ACTIVE') {
      return fail('DEVICE_STATUS', 'เครื่องนี้ถูกระงับ (' + (dstatus || 'ไม่ระบุ') + ')',
        { emp_id: empId, device_id: devId, emp: emp, dev: dev });
    }

    // กติกาข้อ 5: ใบอนุญาตต้องยังไม่หมดอายุ (เทียบสตริง yyyy-MM-dd)
    var exp = String(dev.permit_expiry || '').trim();
    if (exp && exp < todayYMD(nowMs)) {
      return fail('EXPIRED', 'ใบอนุญาตหมดอายุแล้ว (' + exp + ')',
        { emp_id: empId, device_id: devId, emp: emp, dev: dev });
    }

    // กติกาข้อ 6: สถานะพนักงานต้อง ACTIVE
    if (!emp) {
      return fail('NO_EMP', 'ไม่พบพนักงานเจ้าของเครื่อง (' + dev.emp_id + ')',
        { emp_id: empId, device_id: devId, dev: dev });
    }
    var estatus = String(emp.status || '').trim().toUpperCase();
    if (estatus !== 'ACTIVE') {
      return fail('EMP_STATUS', 'พนักงานไม่อยู่ในสถานะทำงาน (' + (estatus || 'ไม่ระบุ') + ')',
        { emp_id: empId, device_id: devId, emp: emp, dev: dev });
    }

    return {
      ok: true, code: 'OK', msg: 'อนุญาตให้นำเข้าพื้นที่',
      emp_id: empId, device_id: devId, emp: emp, dev: dev
    };
  }

  global.verify = verify;
  global.PhoneCheck = { verify: verify, buildDB: buildDB, todayYMD: todayYMD };
})(typeof window !== 'undefined' ? window : this);
