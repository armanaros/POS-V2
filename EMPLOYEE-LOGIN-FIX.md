# Employee Password Reset Instructions

The employee cannot log in because there's a mismatch between the password stored in Firestore (`test123`) and the password in Firebase Auth.

## Quick Fix (Recommended)

Try logging in with these credentials:
- **Username:** `employee`  
- **Password:** `test123`

If that doesn't work, follow the steps below.

## Manual Password Reset Steps

1. **Download Firebase Admin Key:**
   - Go to [Firebase Console](https://console.firebase.google.com)
   - Select your project
   - Go to Project Settings > Service Accounts
   - Click "Generate new private key"
   - Save the file as `firebase-admin-key.json` in this directory

2. **Install Firebase Admin SDK:**
   ```bash
   npm install firebase-admin
   ```

3. **Run the password reset script:**
   ```bash
   node reset-employee-password.js
   ```

4. **Try logging in again** with username `employee` and password `test123`

## Alternative: Reset through Firebase Console

1. Go to Firebase Console > Authentication > Users
2. Find the employee user
3. Click the three dots menu > Reset password
4. Set the password to `test123`
5. Try logging in again

## Root Cause

The issue occurs because:
- Firestore `users` document shows `password: "test123"`  
- But Firebase Auth has a different password for this user
- Our sign-in code uses Firebase Auth, not the Firestore password field

The password field in Firestore should only be used during user creation, not for authentication.
