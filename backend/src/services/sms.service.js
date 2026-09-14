// HSPSMS sender (same provider/config as the existing eSSL punch notifier).

function normalizePhone(raw) {
  if (!raw) return null;
  const cc = process.env.DEFAULT_CC || '91';
  let digits = String(raw).replace(/[^\d]/g, '').replace(/^0+/, '');
  if (digits.startsWith(cc) && digits.length > 10) digits = digits.slice(cc.length);
  return digits.length >= 10 ? digits.slice(-10) : null;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// 'YYYY-MM-DD' -> { dmy: 'DD-MM-YYYY', day: 'Tuesday' }. Uses UTC so the weekday
// never shifts with the server timezone.
function formatDate(isoDate) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate || ''));
  if (!m) return { dmy: isoDate || '', day: '' };
  const [, y, mo, d] = m;
  const dt = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  return { dmy: `${d}-${mo}-${y}`, day: WEEKDAYS[dt.getUTCDay()] };
}

function buildAbsentMessage({ name, date }) {
  // Must match the DLT-approved template EXACTLY (character-for-character) or the
  // operator marks the SMS "undelivered". Approved template (SCHDEN):
  //   Scholars Den Absent Alert: Your ward, {#var#} is absent in the classes
  //   scheduled for today ({#var#})({#var#}). For any query please contact, {#var#}
  // Vars, in order: student name, date (DD-MM-YYYY), weekday, contact number.
  const { dmy, day } = formatDate(date);
  const contact = process.env.SMS_CONTACT || '';
  const tpl = process.env.SMS_ABSENT_TEMPLATE ||
    'Scholars Den Absent Alert: Your ward, {name} is absent in the classes scheduled for today ({date})({day}). For any query please contact, {contact}';
  return tpl
    .replace('{name}', name || '')
    .replace('{date}', dmy)
    .replace('{day}', day)
    .replace('{contact}', contact);
}

async function sendOne(phoneRaw, message) {
  const phone = normalizePhone(phoneRaw);
  if (!phone) return { status: 'skipped', response: 'no valid phone' };

  const url = new URL(process.env.HSPSMS_URL || 'http://sms.hspsms.com/sendSMS');
  url.searchParams.set('username', process.env.HSPSMS_USER || '');
  url.searchParams.set('apikey', process.env.HSPSMS_APIKEY || '');
  url.searchParams.set('sendername', process.env.HSPSMS_SENDER || '');
  url.searchParams.set('smstype', process.env.HSPSMS_SMSTYPE || 'TRANS');
  url.searchParams.set('numbers', phone);
  url.searchParams.set('message', message);
  // DLT identifiers required by the operator for delivery (only sent if configured).
  if (process.env.HSPSMS_PEID) url.searchParams.set('peid', process.env.HSPSMS_PEID);
  if (process.env.HSPSMS_TEMPLATEID) url.searchParams.set('templateid', process.env.HSPSMS_TEMPLATEID);

  try {
    const resp = await fetch(url, { method: 'GET' });
    const body = (await resp.text()).trim();
    return { status: resp.ok ? 'sent' : 'failed', response: body, phone };
  } catch (err) {
    return { status: 'failed', response: err.message, phone };
  }
}

module.exports = { normalizePhone, buildAbsentMessage, sendOne };
