
const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const QRCode = require('qrcode');
const path = require('path');

// Firebase imports
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, addDoc, doc, getDoc, updateDoc, getDocs, query, orderBy } = require('firebase/firestore');

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyC_TY1CvpYlBq146IjDkkPvjpYc-s2B6eY",
  authDomain: "eali-81b8b.firebaseapp.com",
  projectId: "eali-81b8b",
  storageBucket: "eali-81b8b.firebasestorage.app",
  messagingSenderId: "705842164237",
  appId: "1:705842164237:web:aefdec82ef182d46309b44",
  measurementId: "G-7T2TXKLVRM"
};

// Initialize Firebase
const firebaseApp = initializeApp(firebaseConfig);
const firestore = getFirestore(firebaseApp);

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
    
    const requestData = {
      request_id,
      name,
      email,
      department,
      request_type,
      description,
      status: 'قيد المراجعة',
      notes: '',
      created_at: new Date(),
      updated_at: new Date()
    };

    // حفظ في SQLite
    db.run(
      `INSERT INTO requests (request_id, name, email, department, request_type, description) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [request_id, name, email, department, request_type, description],
      async function(err) {
        if (err) {
          console.error('SQLite Error:', err);
        } else {
          console.log('تم حفظ الطلب في SQLite بنجاح');
        }
      }
    );

    // حفظ في Firebase Firestore
    try {
      const docRef = await addDoc(collection(firestore, 'requests'), requestData);
      console.log('تم حفظ الطلب في Firebase بنجاح، Document ID:', docRef.id);
    } catch (firebaseError) {
      console.error('Firebase Error:', firebaseError);
    }

    res.render('success', { 
      request_id, 
      qrCodeData,
      name,
      request_type
    });

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
app.post('/track', async (req, res) => {
  const { request_id } = req.body;

  try {
    // البحث في Firebase أولاً
    const requestsRef = collection(firestore, 'requests');
    const q = query(requestsRef);
    const querySnapshot = await getDocs(q);
    
    let firebaseResult = null;
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      if (data.request_id === request_id) {
        firebaseResult = { id: doc.id, ...data };
      }
    });

    if (firebaseResult) {
      res.render('request-details', { request: firebaseResult });
      return;
    }

    // إذا لم يوجد في Firebase، ابحث في SQLite
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

  } catch (error) {
    console.error('Firebase search error:', error);
    // في حالة فشل Firebase، ابحث في SQLite
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
  }
});

// لوحة الإدارة
app.get('/admin', async (req, res) => {
  try {
    // جلب البيانات من Firebase
    const requestsRef = collection(firestore, 'requests');
    const q = query(requestsRef, orderBy('created_at', 'desc'));
    const querySnapshot = await getDocs(q);
    
    const firebaseRequests = [];
    querySnapshot.forEach((doc) => {
      firebaseRequests.push({
        id: doc.id,
        ...doc.data()
      });
    });

    if (firebaseRequests.length > 0) {
      res.render('admin', { requests: firebaseRequests });
      return;
    }

    // إذا لم توجد بيانات في Firebase، اجلب من SQLite
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

  } catch (error) {
    console.error('Firebase admin error:', error);
    // في حالة فشل Firebase، اجلب من SQLite
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
  }
});

// تحديث حالة الطلب
app.post('/admin/update', async (req, res) => {
  const { request_id, status, notes } = req.body;

  try {
    // تحديث في Firebase
    const requestsRef = collection(firestore, 'requests');
    const querySnapshot = await getDocs(requestsRef);
    
    let documentId = null;
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      if (data.request_id === request_id) {
        documentId = doc.id;
      }
    });

    if (documentId) {
      const requestRef = doc(firestore, 'requests', documentId);
      await updateDoc(requestRef, {
        status: status,
        notes: notes,
        updated_at: new Date()
      });
      console.log('تم تحديث الطلب في Firebase بنجاح');
    }

    // تحديث في SQLite أيضاً
    db.run(
      'UPDATE requests SET status = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE request_id = ?',
      [status, notes, request_id],
      function(err) {
        if (err) {
          console.error('SQLite Update Error:', err);
        } else {
          console.log('تم تحديث الطلب في SQLite بنجاح');
        }
      }
    );

    res.redirect('/admin');

  } catch (error) {
    console.error('Firebase update error:', error);
    // في حالة فشل Firebase، حديث في SQLite فقط
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
  }
});

// تشغيل السيرفر
app.listen(PORT, '0.0.0.0', () => {
  console.log(`السيرفر يعمل على المنفذ ${PORT}`);
});
