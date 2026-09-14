const attendanceService = require('../services/attendance.service');
const smsService = require('../services/sms.service');
const { prisma } = require('../config/prisma');

function validDate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

// Send an "absent" SMS to every absentee of a batch on a date.
// Skips any student already notified for that date (same-day de-dup).
// Available to admin and member.
async function sendAbsentSms(req, res) {
  const { batchId } = req.params;
  const date = req.body?.date || req.query.date;
  if (!validDate(date)) return res.status(400).json({ message: 'date required as YYYY-MM-DD' });

  const { batch, absent } = await attendanceService.getAbsentStudents(batchId, date);

  // Who has already been notified for this date? (one row per student per day)
  const codes = absent.map((s) => String(s.employeeCode));
  const already = await prisma.sentAbsentSms.findMany({
    where: { date, employeeCode: { in: codes } },
    select: { employeeCode: true },
  });
  const alreadySet = new Set(already.map((r) => r.employeeCode));

  const recipients = [];
  let sent = 0, failed = 0, skipped = 0, alreadySent = 0;

  for (const student of absent) {
    const code = String(student.employeeCode);

    // Already sent today -> skip, report as alreadySent.
    if (alreadySet.has(code)) {
      alreadySent++;
      recipients.push({
        employeeCode: code, name: student.name, phone: student.phone || '',
        status: 'alreadySent', providerResponse: 'Already notified for this date',
      });
      continue;
    }

    const message = smsService.buildAbsentMessage({ name: student.name, date, batch: batch.name });
    const result = await smsService.sendOne(student.phone, message);

    if (result.status === 'sent') {
      sent++;
      // Record the successful send so we never double-send this student today.
      try {
        await prisma.sentAbsentSms.create({
          data: {
            employeeCode: code, date, batchId: batch.batchId, batchName: batch.name,
            name: student.name, phone: result.phone || student.phone || '',
          },
        });
      } catch (_) { /* unique race: another send beat us; safe to ignore */ }
    } else if (result.status === 'failed') {
      failed++;
    } else {
      skipped++;
    }

    recipients.push({
      employeeCode: code, name: student.name, phone: result.phone || student.phone || '',
      status: result.status, providerResponse: result.response,
    });
  }

  const logDoc = await prisma.smsLog.create({
    data: {
      sentById: req.user.id,
      sentByName: req.user.name,
      batchId: batch.batchId,
      batchName: batch.name,
      date,
      totalAbsent: absent.length,
      attempted: absent.length - alreadySent,
      sent,
      failed,
      skippedNoPhone: skipped,
      skippedAlreadySent: alreadySent,
      recipients: { create: recipients },
    },
  });

  return res.json({
    batch,
    date,
    summary: { totalAbsent: absent.length, sent, failed, skippedNoPhone: skipped, alreadySent },
    logId: logDoc.id,
    recipients,
  });
}

// Which absentees of a batch have already been notified for a date.
// Lets the UI show "already sent" before the user clicks send.
async function sentStatus(req, res) {
  const { batchId } = req.params;
  const date = req.query.date;
  if (!validDate(date)) return res.status(400).json({ message: 'date required as YYYY-MM-DD' });

  const rows = await prisma.sentAbsentSms.findMany({
    where: { date, batchId: Number(batchId) },
    select: { employeeCode: true, sentAt: true },
  });
  return res.json({
    batchId: Number(batchId),
    date,
    count: rows.length,
    sentCodes: rows.map((r) => r.employeeCode),
  });
}

// History of SMS batches sent.
async function history(req, res) {
  const logs = await prisma.smsLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { recipients: true },
  });
  const shaped = logs.map((l) => ({ ...l, _id: l.id }));
  return res.json({ logs: shaped });
}

module.exports = { sendAbsentSms, sentStatus, history };
