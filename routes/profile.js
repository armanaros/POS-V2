const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { auth } = require('../middleware/auth');
const database = require('../config/database');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/profiles');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `profile-${req.user.id}-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed (jpeg, jpg, png, gif)'));
    }
  }
});

// Get current user profile
router.get('/', auth(), (req, res) => {
  const db = database.getConnection();
  
  db.get(
    'SELECT id, username, email, firstName, lastName, phone, role, profilePicture, createdAt FROM users WHERE id = ?',
    [req.user.id],
    (err, user) => {
      if (err) {
        console.error('Error fetching profile:', err);
        return res.status(500).json({ message: 'Error fetching profile' });
      }
      
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
      
      res.json(user);
    }
  );
});

// Update profile information
router.put('/', auth(), (req, res) => {
  const { firstName, lastName, email, phone, currentPassword, newPassword } = req.body;
  const db = database.getConnection();
  
  // First, get current user data to validate password if changing
  db.get(
    'SELECT password FROM users WHERE id = ?',
    [req.user.id],
    async (err, user) => {
      if (err) {
        console.error('Error fetching user:', err);
        return res.status(500).json({ message: 'Error updating profile' });
      }
      
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
      
      // If changing password, validate current password
      if (newPassword) {
        if (!currentPassword) {
          return res.status(400).json({ message: 'Current password is required to change password' });
        }
        
        const isValidPassword = await bcrypt.compare(currentPassword, user.password);
        if (!isValidPassword) {
          return res.status(400).json({ message: 'Current password is incorrect' });
        }
      }
      
      // Prepare update query
      let updateQuery = 'UPDATE users SET firstName = ?, lastName = ?, email = ?, phone = ?, updatedAt = CURRENT_TIMESTAMP';
      let params = [firstName, lastName, email, phone];
      
      // Add password to update if provided
      if (newPassword) {
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        updateQuery += ', password = ?';
        params.push(hashedPassword);
      }
      
      updateQuery += ' WHERE id = ?';
      params.push(req.user.id);
      
      db.run(updateQuery, params, function(err) {
        if (err) {
          console.error('Error updating profile:', err);
          if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return res.status(400).json({ message: 'Email already exists' });
          }
          return res.status(500).json({ message: 'Error updating profile' });
        }
        
        res.json({ message: 'Profile updated successfully' });
      });
    }
  );
});

// Upload profile picture
router.post('/upload-picture', auth(), upload.single('profilePicture'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded' });
  }
  
  const db = database.getConnection();
  const profilePicturePath = `/uploads/profiles/${req.file.filename}`;
  
  // Get current profile picture to delete old one
  db.get(
    'SELECT profilePicture FROM users WHERE id = ?',
    [req.user.id],
    (err, user) => {
      if (err) {
        console.error('Error fetching current profile picture:', err);
      } else if (user && user.profilePicture) {
        // Delete old profile picture
        const oldPicturePath = path.join(__dirname, '..', user.profilePicture);
        if (fs.existsSync(oldPicturePath)) {
          fs.unlinkSync(oldPicturePath);
        }
      }
      
      // Update user with new profile picture
      db.run(
        'UPDATE users SET profilePicture = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
        [profilePicturePath, req.user.id],
        function(err) {
          if (err) {
            console.error('Error updating profile picture:', err);
            return res.status(500).json({ message: 'Error updating profile picture' });
          }
          
          res.json({ 
            message: 'Profile picture updated successfully',
            profilePicture: profilePicturePath
          });
        }
      );
    }
  );
});

// Delete profile picture
router.delete('/picture', auth(), (req, res) => {
  const db = database.getConnection();
  
  // Get current profile picture to delete file
  db.get(
    'SELECT profilePicture FROM users WHERE id = ?',
    [req.user.id],
    (err, user) => {
      if (err) {
        console.error('Error fetching current profile picture:', err);
        return res.status(500).json({ message: 'Error deleting profile picture' });
      }
      
      if (user && user.profilePicture) {
        // Delete profile picture file
        const picturePath = path.join(__dirname, '..', user.profilePicture);
        if (fs.existsSync(picturePath)) {
          fs.unlinkSync(picturePath);
        }
      }
      
      // Remove profile picture from database
      db.run(
        'UPDATE users SET profilePicture = NULL, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
        [req.user.id],
        function(err) {
          if (err) {
            console.error('Error removing profile picture:', err);
            return res.status(500).json({ message: 'Error removing profile picture' });
          }
          
          res.json({ message: 'Profile picture removed successfully' });
        }
      );
    }
  );
});

module.exports = router;
