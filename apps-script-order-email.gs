/**
 * Kimchi Mart — 주문 이메일 자동 발송 (Apps Script 웹앱)
 * ─────────────────────────────────────────────────────────────
 * ★ 반드시 info@miamikimchi.com 구글 계정으로 로그인한 상태에서 만들고 배포하세요.
 *   (이메일이 이 계정에서 발송됩니다.)
 *
 * [배포 방법]
 *  1) https://script.google.com 접속 (info@miamikimchi.com 로그인 상태)
 *  2) "새 프로젝트" → 이 코드 전체를 붙여넣기 (기존 내용 지우고)
 *  3) 우측 상단 "배포" → "새 배포"
 *  4) 유형 선택(톱니바퀴) → "웹 앱"
 *  5) 설명: KimchiMart Order Email / 실행: "나(info@miamikimchi.com)" /
 *     액세스 권한: "모든 사용자"  → "배포"
 *  6) 권한 승인 (Gmail 보내기 허용 — info@ 계정으로)
 *  7) 나온 "웹 앱 URL"(https://script.google.com/macros/s/..../exec) 복사 → 매니저(클로드)에게 전달
 * ─────────────────────────────────────────────────────────────
 */

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var to      = data.to      || 'namhyun.kim@wismettacusa.com';
    var subject = data.subject || 'Kimchi Mart Order';
    var body    = data.body    || '';
    var items   = data.items   || [];
    var filename = (data.filename || 'KimchiMart_Order') + '.csv';

    // 엑셀에서 열리는 CSV 첨부. ﻿(BOM) = 한글 깨짐 방지.
    // Item# 은 ="..." 로 텍스트 고정 → 앞자리 0(06510 등) 보존, 과학적표기 방지.
    var rows = ['Unit,Item#,Qty,Name,PackSize'];
    items.forEach(function (it) {
      rows.push([
        csvCell(it.unit),
        '="' + String(it.id == null ? '' : it.id).replace(/"/g, '') + '"',
        csvCell(it.qty),
        csvCell(it.name),
        csvCell(it.pack)
      ].join(','));
    });
    var csv  = '﻿' + rows.join('\r\n');
    var blob = Utilities.newBlob(csv, 'text/csv', filename);

    GmailApp.sendEmail(to, subject, body, {
      name: 'Kimchi Mart',
      attachments: [blob]
    });
    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

function doGet() {
  return ContentService.createTextOutput('Kimchi Mart order-email endpoint is running.');
}

function csvCell(v) {
  v = (v == null) ? '' : String(v);
  if (/[",\r\n]/.test(v)) v = '"' + v.replace(/"/g, '""') + '"';
  return v;
}

function json(o) {
  return ContentService
    .createTextOutput(JSON.stringify(o))
    .setMimeType(ContentService.MimeType.JSON);
}
