/**
 * Password Reset Utility for Employee
 * Run this script to reset the employee's Firebase Auth password to match the Firestore document
 */

const admin = require('firebase-admin');
const { initializeApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');

// You'll need to download your Firebase Admin SDK private key from:
// Firebase Console > Project Settings > Service Accounts > Generate new private key
// Save it as 'firebase-admin-key.json' in this directory
const serviceAccount = require('./firebase-admin-key.json');

// Initialize Firebase Admin
const app = initializeApp({
  credential: cert(serviceAccount)
});

const auth = getAuth(app);
const db = getFirestore(app);

async function resetEmployeePassword() {
  try {
    console.log('Starting password reset for employee...');
    
    // Get the employee user from Firestore
    const usersSnapshot = await db.collection('users').get();
    const users = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    const employee = users.find(user => user.username === 'employee');
    if (!employee) {
      console.error('Employee user not found in Firestore');
      return;
    }
    
    console.log('Found employee:', employee.username, 'with email:', employee.email);
    console.log('Firestore password field shows:', employee.password);
    
    // Reset the Firebase Auth password to match the Firestore document
    const newPassword = employee.password || 'test123';
    
    try {
      await auth.updateUser(employee.id, {
        password: newPassword
      });
      console.log('✅ Successfully updated Firebase Auth password for employee to:', newPassword);
    } catch (authError) {
      if (authError.code === 'auth/user-not-found') {
        console.log('Employee not found in Firebase Auth, creating new user...');
        
        const userRecord = await auth.createUser({
          uid: employee.id,
          email: employee.email || `${employee.username}@ptownv2.local`,
          password: newPassword,
          displayName: `${employee.firstName} ${employee.lastName}`.trim()
        });
        
        console.log('✅ Created new Firebase Auth user for employee:', userRecord.uid);
      } else {
        throw authError;
      }
    }
    
    console.log('\n🎉 Password reset complete!');
    console.log('Employee can now login with:');
    console.log('Username:', employee.username);
    console.log('Password:', newPassword);
    
  } catch (error) {
    console.error('❌ Error resetting password:', error);
  }
}

// Run the script
resetEmployeePassword().then(() => {
  console.log('\nScript completed. You can now try logging in as the employee.');
  process.exit(0);
}).catch(error => {
  console.error('Script failed:', error);
  process.exit(1);
});
