const admin = require('firebase-admin');
const { doc, setDoc, serverTimestamp } = require('firebase/firestore');

// Initialize Firebase Admin (for creating auth users)
const serviceAccount = {
  type: "service_account",
  project_id: "ptownv2",
  private_key_id: "your_private_key_id",
  private_key: "your_private_key",
  client_email: "your_client_email",
  client_id: "your_client_id",
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs"
};

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

// Initialize client SDK for Firestore
const { initializeApp } = require('firebase/app');
const { getFirestore } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: "AIzaSyAYjqWRCm9hYR5faIfqQagQm8aEnbC10x4",
  authDomain: "ptownv2.firebaseapp.com",
  projectId: "ptownv2",
  storageBucket: "ptownv2.appspot.com",
  messagingSenderId: "884750923953",
  appId: "1:884750923953:web:6d9d0108495156fcdf4a90",
  measurementId: "G-M98V9QFED6"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function createAdminUser() {
  try {
    console.log('🔥 Creating admin user...');
    
    // Create user in Firebase Auth
    const userRecord = await admin.auth().createUser({
      email: 'admin@ptownv2.com',
      password: 'admin123',
      displayName: 'System Administrator'
    });
    
    console.log('✅ Created Firebase Auth user:', userRecord.uid);
    
    // Create user document in Firestore
    await setDoc(doc(db, 'users', userRecord.uid), {
      uid: userRecord.uid,
      email: 'admin@ptownv2.com',
      username: 'admin',
      role: 'admin',
      firstName: 'System',
      lastName: 'Administrator',
      phone: '',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    
    console.log('✅ Created Firestore user document');
    console.log('🎉 Admin user created successfully!');
    console.log('📧 Email: admin@ptownv2.com');
    console.log('🔑 Password: admin123');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating admin user:', error);
    process.exit(1);
  }
}

createAdminUser();
