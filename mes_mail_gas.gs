/* ── 태진다이텍 MES 발주서 메일 — 구글 앱스 스크립트 웹앱 ─────────────────────────
 * MES 화면(mes_mail.js)의 [✉ 보내기] 가 이 웹앱으로 발주서를 보내면, 이 스크립트를 만든
 * 태진다이텍 구글 계정(Gmail)에서 협력업체로 메일이 나간다.
 *
 * ■ 설치 (태진다이텍 구글 계정으로 로그인한 상태에서 한 번만)
 *   1) https://script.google.com → [새 프로젝트] → 이 파일 내용을 통째로 붙여 넣고 저장 (이름 예: MES 발주서 메일)
 *   2) 위쪽 함수 선택에서 testSend 를 고르고 [실행] → 권한 허용 (내 계정으로 메일 보내기)
 *      → 내 받은편지함에 「MES 메일 테스트」가 오면 정상
 *   3) [배포] → [새 배포] → 유형: 웹 앱
 *        - 실행 사용자 : 나 (태진다이텍 계정)
 *        - 액세스 권한 : 모든 사용자
 *      → [배포] → 나오는 「웹 앱 URL」(https://script.google.com/macros/s/…/exec) 을 복사
 *   4) 그 URL 을 mes_mail.js 의 GAS_URL 에 넣는다 (넣으면 [✉ 보내기] 가 켜진다)
 *   ※ 스크립트를 고친 뒤에는 [배포] → [배포 관리] → 연필 → 버전: 새 버전 → [배포] (URL 은 그대로)
 *
 * ■ 하루 발송 한도 : 일반 Gmail 100통 / 구글 워크스페이스 1,500통 (받는 사람 수 기준)
 * ■ TOKEN 은 mes_mail.js 의 MAIL_TOKEN 과 같아야 한다 (모르는 곳에서 이 주소로 메일을 보내는 것을 막는 열쇠)
 */
const TOKEN = 'iyvdb9leFEi5DK-YXhgFsDti';
const FROM_NAME = '태진다이텍';
const MAX_ATTACH = 10;                 /* 첨부 그림 최대 장수 */

/* 주소 확인용 — 브라우저로 웹앱 URL 을 열면 {"ok":true,...} 가 보인다 */
function doGet() {
  return json({ ok: true, service: 'mes-mail', remaining: MailApp.getRemainingDailyQuota() });
}

function doPost(e) {
  try {
    const d = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (d.token !== TOKEN) return json({ ok: false, error: '인증 실패 (MAIL_TOKEN 이 스크립트 TOKEN 과 다릅니다)' });
    if (d.action !== 'sendOrderMail') return json({ ok: false, error: '알 수 없는 요청: ' + d.action });

    const to = addrs(d.to), cc = addrs(d.cc);
    if (!to.length) return json({ ok: false, error: '받는 사람 이메일이 올바르지 않습니다: ' + (d.to || '') });
    const subject = String(d.subject || '발주서').slice(0, 200);

    /* 부품 그림 첨부 — PartList 에 등록한 그림 주소(https)에서 받아 붙인다. 못 받은 그림은 건너뛴다 */
    const files = [], skipped = [];
    (d.attachments || []).slice(0, MAX_ATTACH).forEach(function (a) {
      const url = String(a && a.url || '');
      if (!/^https:\/\//.test(url)) return;
      try {
        const r = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
        if (r.getResponseCode() !== 200) { skipped.push(a.name); return; }
        const b = r.getBlob(), ext = (b.getContentType() || '').split('/')[1] || 'png';
        b.setName(String(a.name || 'image').replace(/\.[a-z0-9]+$/i, '') + '.' + ext.replace('jpeg', 'jpg'));
        files.push(b);
      } catch (err) { skipped.push(a.name); }
    });

    const opt = { name: FROM_NAME, htmlBody: String(d.html || ''), attachments: files };
    if (cc.length) opt.cc = cc.join(',');
    MailApp.sendEmail(to.join(','), subject, String(d.text || ''), opt);

    return json({ ok: true, to: to, attached: files.length, skipped: skipped, remaining: MailApp.getRemainingDailyQuota() });
  } catch (err) {
    return json({ ok: false, error: String(err && err.message || err) });
  }
}

/* 쉼표·세미콜론·공백으로 나눈 이메일 목록 (형식이 틀린 주소는 뺀다) */
function addrs(s) {
  return String(s || '').split(/[,;\s]+/).map(function (x) { return x.trim(); })
    .filter(function (x) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x); });
}

function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

/* 설치 2) 권한 허용·동작 확인용 — 내 계정으로 테스트 메일 한 통 */
function testSend() {
  const me = Session.getEffectiveUser().getEmail();
  MailApp.sendEmail(me, 'MES 메일 테스트', '태진다이텍 MES 발주서 메일 스크립트가 정상입니다.', { name: FROM_NAME });
  Logger.log('보냄: ' + me + ' · 오늘 남은 한도 ' + MailApp.getRemainingDailyQuota());
}
