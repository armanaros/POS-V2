import React, { useState } from 'react';
import { Box, Button, Alert, Typography, Paper } from '@mui/material';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';

export default function AdminSetup() {
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const createAdmin = async () => {
    setLoading(true);
    setError('');
    setStatus('Creating admin user in Firebase Auth...');

    try {
      // Create user in Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(
        auth, 
        'admin@ptownv2.com', 
        'admin123'
      );
      
      setStatus('Creating admin user document in Firestore...');

      // Create user document in Firestore
      await setDoc(doc(db, 'users', userCredential.user.uid), {
        uid: userCredential.user.uid,
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

      setStatus('Admin user created successfully!');
      setSuccess(true);
      
    } catch (err) {
      console.error('Error creating admin:', err);
      if (err.code === 'auth/email-already-in-use') {
        setError('Admin user already exists. You can now log in with admin@ptownv2.com / admin123');
      } else {
        setError(`Error: ${err.message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      minHeight: '100vh',
      bgcolor: '#f5f5f5',
      p: 2
    }}>
      <Paper sx={{ p: 4, maxWidth: 500, width: '100%' }}>
        <Typography variant="h4" gutterBottom align="center">
          🔥 Firebase POS Setup
        </Typography>
        
        <Typography variant="body1" gutterBottom align="center" sx={{ mb: 3 }}>
          Create your admin user to start using the POS system
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {status && !error && (
          <Alert severity="info" sx={{ mb: 2 }}>
            {status}
          </Alert>
        )}

        {success && (
          <Alert severity="success" sx={{ mb: 2 }}>
            🎉 Admin user created! You can now log in with:
            <br />
            📧 Email: admin@ptownv2.com
            <br />
            🔑 Password: admin123
          </Alert>
        )}

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Button
            variant="contained"
            onClick={createAdmin}
            disabled={loading || success}
            size="large"
            fullWidth
          >
            {loading ? (
              'Creating Admin...'
            ) : success ? (
              '✅ Admin Created'
            ) : (
              '🚀 Create Admin User'
            )}
          </Button>

          {success && (
            <Button
              variant="outlined"
              href="/login"
              size="large"
              fullWidth
            >
              Go to Login Page
            </Button>
          )}
        </Box>

        <Typography variant="caption" display="block" sx={{ mt: 3, textAlign: 'center', color: 'text.secondary' }}>
          This will create an admin user in Firebase Auth and Firestore.
          <br />
          All POS data will be stored in Firestore.
        </Typography>
      </Paper>
    </Box>
  );
}
