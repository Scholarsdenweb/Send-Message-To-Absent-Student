const express = require('express');
const multer = require('multer');

const { requireAuth, requireRole } = require('../middleware/auth');
const auth = require('../controllers/auth.controller');
const batch = require('../controllers/batch.controller');
const attendance = require('../controllers/attendance.controller');
const sms = require('../controllers/sms.controller');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// wrap async handlers so thrown errors hit the error middleware
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ---- Auth ----
router.post('/auth/login', h(auth.login));
router.get('/auth/me', requireAuth, h(auth.me));
router.get('/auth/users', requireAuth, requireRole('admin'), h(auth.listUsers));
router.post('/auth/users', requireAuth, requireRole('admin'), h(auth.createUser));

// ---- Batches (departments) ----
router.get('/batches', requireAuth, h(batch.list));
router.post('/batches', requireAuth, requireRole('admin'), h(batch.create));
router.delete('/batches/:batchId', requireAuth, requireRole('admin'), h(batch.remove));
router.post('/batches/assign', requireAuth, requireRole('admin'), upload.single('file'), h(batch.assignUpload));

// ---- Attendance (read-only) ----
router.get('/attendance/:batchId', requireAuth, h(attendance.batchAttendance));
router.get('/attendance/:batchId/absentees', requireAuth, h(attendance.batchAbsentees));

// ---- SMS (admin + member) ----
router.get('/sms/:batchId/sent', requireAuth, h(sms.sentStatus));
router.post('/sms/:batchId/absent', requireAuth, requireRole('admin', 'member'), h(sms.sendAbsentSms));
router.get('/sms/history', requireAuth, h(sms.history));

module.exports = router;
