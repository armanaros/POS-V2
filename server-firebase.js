const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 5001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'client/build')));
// Try to load firebase-admin if available; this enables server-side user creation
let admin = null;
try {
  admin = require('firebase-admin');
} catch (e) {
  console.warn('firebase-admin not installed. Admin endpoints will be disabled until firebase-admin is installed.');
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'Firebase server is running', timestamp: new Date().toISOString() });
});

// Initialize firebase-admin if possible
if (admin) {
  try {
    // Service account path can be provided via env var or default file
    const saPath = process.env.FIREBASE_ADMIN_SDK_PATH || path.join(__dirname, 'serviceAccountKey.json');
    if (fs.existsSync(saPath)) {
      const serviceAccount = require(saPath);
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
      console.log('firebase-admin initialized using', saPath);
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      admin.initializeApp();
      console.log('firebase-admin initialized using GOOGLE_APPLICATION_CREDENTIALS');
    } else {
      console.warn('No service account found for firebase-admin. Admin endpoints will be unavailable.');
      admin = null;
    }
  } catch (e) {
    console.error('Failed to initialize firebase-admin:', e);
    admin = null;
  }
}

// Admin API: create user without affecting current client session
// POST /api/admin/create-user
app.post('/api/admin/create-user', async (req, res) => {
  if (!admin) return res.status(501).json({ error: 'Admin functionality not configured on server' });

  try {
    const idToken = (req.headers.authorization || '').replace('Bearer ', '');
    if (!idToken) return res.status(401).json({ error: 'Missing ID token in Authorization header' });

    // Verify token and ensure requester is an admin (check Firestore user role)
    const decoded = await admin.auth().verifyIdToken(idToken);
    const requesterUid = decoded.uid;

    // Read user document to confirm role
    const requesterDoc = await admin.firestore().collection('users').doc(requesterUid).get();
    const requesterData = requesterDoc.exists ? requesterDoc.data() : null;
    if (!requesterData || requesterData.role !== 'admin') {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const userData = req.body || {};
    if (!userData.username) return res.status(400).json({ error: 'username is required' });
    const email = userData.email || `${userData.username}@ptownv2.local`;
    const password = userData.password || Math.random().toString(36).slice(-10);

    // Create user via Admin SDK
    const created = await admin.auth().createUser({
      email: email,
      password: password,
      displayName: `${userData.firstName || ''} ${userData.lastName || ''}`.trim() || undefined
    });

    // Save user document in Firestore
    const userDoc = {
      id: created.uid,
      username: userData.username,
      email,
      role: userData.role || 'employee',
      firstName: userData.firstName || '',
      lastName: userData.lastName || '',
      phone: userData.phone || '',
      address: userData.address || '',
      dailyRate: userData.dailyRate || userData.hourlyRate || '',
      department: userData.department || '',
      hireDate: userData.hireDate || '',
      isActive: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    await admin.firestore().collection('users').doc(created.uid).set(userDoc);

    return res.json({ success: true, uid: created.uid, email, password, message: 'User created by admin' });
  } catch (error) {
    console.error('Admin create-user error:', error);
    return res.status(500).json({ error: error.message || String(error) });
  }
});

// API status endpoint
app.get('/api/status', (req, res) => {
  res.json({ 
    message: 'Firebase POS Server is running',
    firebase: 'All data operations are handled by Firebase on the client side',
    version: '1.0.0'
  });
});

// Serve React app for all other routes (catch-all handler)
app.get('*', (req, res) => {
  const indexPath = path.join(__dirname, 'client/build/index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    // In development the client build may not exist; return a friendly JSON instead
    res.status(404).json({ error: 'Client build not found. Run client in dev mode or build the client.' });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Firebase POS Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
  console.log('All database operations are handled by Firebase Firestore');
});

module.exports = app;
