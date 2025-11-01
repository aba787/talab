
const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const QRCode = require('qrcode');
const path = require('path');

const app = express();
const PORT = 5000;

// إعدادات الـ middleware
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// إنشاء قاعدة البيانات
const db = new sqlite3.Database('./database/requests.db');

// إنشاء جدول الطلبات
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id TEXT UNIQUE,
    name TEXT,
    email TEXT,
    department TEXT,
    request_type TEXT,
    description TEXT,
    status TEXT DEFAULT 'قيد المراجعة',
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

// الصفحة الرئيسية - تقديم الطلب
app.get('/', (req, res) => {
  res.render('index');
});

// معالجة تقديم الطلب
app.post('/submit', async (req, res) => {
  const { name, email, department, request_type, description } = req.body;
  const request_id = 'REQ' + Date.now();

  try {
    // إنشاء الباركود
    const qrCodeData = await QRCode.toDataURL(request_id);
    
    // حفظ الطلب في قاعدة البيانات
    db.run(
      `INSERT INTO requests (request_id, name, email, department, request_type, description) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [request_id, name, email, department, request_type, description],
      function(err) {
        if (err) {
          console.error(err);
          res.status(500).send('خطأ في حفظ الطلب');
        } else {
          res.render('success', { 
            request_id, 
            qrCodeData,
            name,
            request_type
          });
        }
      }
    );
  } catch (error) {
    console.error(error);
    res.status(500).send('خطأ في إنشاء الباركود');
  }
});

// صفحة تتبع الطلب
app.get('/track', (req, res) => {
  res.render('track');
});

// معالجة تتبع الطلب
app.post('/track', (req, res) => {
  const { request_id } = req.body;

  db.get(
    'SELECT * FROM requests WHERE request_id = ?',
    [request_id],
    (err, row) => {
      if (err) {
        console.error(err);
        res.status(500).send('خطأ في البحث');
      } else if (row) {
        res.render('request-details', { request: row });
      } else {
        res.render('track', { error: 'لم يتم العثور على الطلب' });
      }
    }
  );
});

// لوحة الإدارة
app.get('/admin', (req, res) => {
  db.all(
    'SELECT * FROM requests ORDER BY created_at DESC',
    (err, rows) => {
      if (err) {
        console.error(err);
        res.status(500).send('خطأ في استرجاع البيانات');
      } else {
        res.render('admin', { requests: rows });
      }
    }
  );
});

// تحديث حالة الطلب
app.post('/admin/update', (req, res) => {
  const { request_id, status, notes } = req.body;

  db.run(
    'UPDATE requests SET status = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE request_id = ?',
    [status, notes, request_id],
    function(err) {
      if (err) {
        console.error(err);
        res.status(500).send('خطأ في تحديث الطلب');
      } else {
        res.redirect('/admin');
      }
    }
  );
});

// تشغيل السيرفر
app.listen(PORT, '0.0.0.0', () => {
  console.log(`السيرفر يعمل على المنفذ ${PORT}`);
});
