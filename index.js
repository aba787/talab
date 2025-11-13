const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const QRCode = require('qrcode');
const path = require('path');

// Firebase imports باستخدام require للتوافق مع Node.js
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, addDoc, doc, getDoc, updateDoc, getDocs, query, orderBy, setDoc, serverTimestamp } = require('firebase/firestore');
const { randomUUID } = require('crypto');

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
const db = getFirestore(firebaseApp);

const app = express();
const PORT = 5000;

// إعدادات الـ middleware
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// إنشاء قاعدة البيانات المحلية كـ backup
const localDb = new sqlite3.Database('./database/requests.db');

// إنشاء جدول الطلبات في SQLite كـ backup
localDb.serialize(() => {
  localDb.run(`CREATE TABLE IF NOT EXISTS requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id TEXT UNIQUE,
    name TEXT,
    email TEXT,
    phone TEXT,
    department TEXT,
    request_type TEXT,
    description TEXT,
    priority TEXT DEFAULT 'عادية',
    status TEXT DEFAULT 'قيد المراجعة',
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  
  // إضافة عمود الهاتف للجدول الموجود
  localDb.run(`ALTER TABLE requests ADD COLUMN phone TEXT`, function(err) {
    if (err && !err.message.includes('duplicate column name')) {
      console.log('خطأ في إضافة عمود الهاتف:', err.message);
    }
  });
});

// دالة إنشاء طلب جديد في Firebase
async function createRequest(data) {
  const id = randomUUID();
  const request_id = 'REQ' + Date.now();

  try {
    await setDoc(doc(db, "requests", id), {
      id: id,
      request_id: request_id,
      barcode: request_id,
      requester_name: data.name,
      name: data.name, // إضافة الحقل name أيضاً للتوافق
      email: data.email,
      phone: data.phone,
      department: data.department,
      request_type: data.request_type,
      type: data.request_type,
      description: data.description,
      priority: data.priority || 'عادية',
      status: "قيد المراجعة",
      last_update: serverTimestamp(),
      notes: "",
      created_at: serverTimestamp()
    });

    console.log('تم إنشاء الطلب في Firebase بنجاح، ID:', id);
    return { id, request_id };
  } catch (error) {
    console.error('خطأ في إنشاء الطلب في Firebase:', error);
    throw error;
  }
}

// الصفحة الرئيسية - تقديم الطلب
app.get('/', (req, res) => {
  res.render('index');
});

// معالجة تقديم الطلب
app.post('/submit', async (req, res) => {
  const { name, email, phone, department, request_type, description, priority } = req.body;

  // التحقق من البيانات المطلوبة
  if (!name || !email || !department || !request_type || !description) {
    return res.status(400).render('index', { 
      error: 'يرجى ملء جميع الحقول المطلوبة' 
    });
  }

  try {
    console.log('بدء إنشاء طلب جديد للمستخدم:', name);
    
    // إنشاء الطلب في Firebase أولاً
    const { id, request_id } = await createRequest({
      name,
      email,
      phone,
      department,
      request_type,
      description,
      priority
    });

    console.log('تم إنشاء الطلب بنجاح، رقم الطلب:', request_id);

    // إنشاء الباركود
    const qrCodeData = await QRCode.toDataURL(request_id);

    // حفظ في SQLite كـ backup
    localDb.run(
      `INSERT INTO requests (request_id, name, email, phone, department, request_type, description, priority) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [request_id, name, email, phone, department, request_type, description, priority || 'عادية'],
      function(err) {
        if (err) {
          console.error('SQLite Backup Error:', err);
        } else {
          console.log('تم حفظ الطلب في SQLite backup بنجاح');
        }
      }
    );

    res.render('success', { 
      request_id, 
      qrCodeData,
      name,
      request_type
    });

  } catch (error) {
    console.error('خطأ في إنشاء الطلب:', error);
    res.status(500).render('index', { 
      error: 'حدث خطأ في إرسال الطلب. يرجى المحاولة مرة أخرى.' 
    });
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
    // البحث في Firebase
    const requestsRef = collection(db, 'requests');
    const querySnapshot = await getDocs(requestsRef);

    let firebaseResult = null;
    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if (data.request_id === request_id || data.barcode === request_id) {
        firebaseResult = { 
          id: docSnap.id, 
          ...data,
          // تحويل Firebase Timestamp إلى تاريخ مقروء
          created_at: data.created_at?.toDate?.() || data.created_at,
          last_update: data.last_update?.toDate?.() || data.last_update
        };
      }
    });

    if (firebaseResult) {
      res.render('request-details', { request: firebaseResult });
      return;
    }

    // إذا لم يوجد في Firebase، ابحث في SQLite backup
    localDb.get(
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
    res.render('track', { error: 'خطأ في البحث عن الطلب' });
  }
});

// لوحة الإدارة
app.get('/admin', async (req, res) => {
  try {
    // جلب البيانات من Firebase
    const requestsRef = collection(db, 'requests');
    const q = query(requestsRef, orderBy('created_at', 'desc'));
    const querySnapshot = await getDocs(q);

    const firebaseRequests = [];
    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      firebaseRequests.push({
        id: docSnap.id,
        ...data,
        // تحويل Firebase Timestamp إلى تاريخ مقروء
        created_at: data.created_at?.toDate?.() || data.created_at,
        last_update: data.last_update?.toDate?.() || data.last_update
      });
    });

    res.render('admin', { requests: firebaseRequests });

  } catch (error) {
    console.error('Firebase admin error:', error);
    // في حالة فشل Firebase، اجلب من SQLite backup
    localDb.all(
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
    // البحث عن الوثيقة في Firebase
    const requestsRef = collection(db, 'requests');
    const querySnapshot = await getDocs(requestsRef);

    let documentId = null;
    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if (data.request_id === request_id || data.barcode === request_id) {
        documentId = docSnap.id;
      }
    });

    if (documentId) {
      // تحديث في Firebase
      const requestRef = doc(db, 'requests', documentId);
      await updateDoc(requestRef, {
        status: status,
        notes: notes,
        last_update: serverTimestamp()
      });
      console.log('تم تحديث الطلب في Firebase بنجاح');
    }

    // تحديث في SQLite backup أيضاً
    localDb.run(
      'UPDATE requests SET status = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE request_id = ?',
      [status, notes, request_id],
      function(err) {
        if (err) {
          console.error('SQLite Update Error:', err);
        } else {
          console.log('تم تحديث الطلب في SQLite backup');
        }
      }
    );

    res.redirect('/admin');

  } catch (error) {
    console.error('Firebase update error:', error);
    res.status(500).send('خطأ في تحديث الطلب');
  }
});

// صفحة التقارير
app.get('/reports', async (req, res) => {
  try {
    // جلب الإحصائيات من Firebase
    const requestsRef = collection(db, 'requests');
    const querySnapshot = await getDocs(requestsRef);

    let requests = [];
    let stats = {
      total: 0,
      pending: 0,
      inProgress: 0,
      completed: 0,
      rejected: 0,
      byDepartment: {}
    };

    querySnapshot.forEach((docSnap) => {
      const data = { 
        id: docSnap.id, 
        ...docSnap.data(),
        created_at: docSnap.data().created_at?.toDate?.() || docSnap.data().created_at,
        last_update: docSnap.data().last_update?.toDate?.() || docSnap.data().last_update
      };
      requests.push(data);

      // حساب الإحصائيات
      stats.total++;
      switch(data.status) {
        case 'قيد المراجعة': stats.pending++; break;
        case 'تحت المعالجة': stats.inProgress++; break;
        case 'منجز': stats.completed++; break;
        case 'مرفوض': stats.rejected++; break;
      }

      // إحصائيات الأقسام
      if (stats.byDepartment[data.department]) {
        stats.byDepartment[data.department]++;
      } else {
        stats.byDepartment[data.department] = 1;
      }
    });

    res.render('reports', { requests, stats });

  } catch (error) {
    console.error('Firebase reports error:', error);
    res.status(500).send('خطأ في جلب التقارير');
  }
});

// تشغيل السيرفر
app.listen(PORT, '0.0.0.0', () => {
  console.log(`السيرفر يعمل على المنفذ ${PORT}`);
  console.log('Firebase متصل بنجاح');
});