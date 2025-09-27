const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const database = require('../config/database');
const { auth } = require('../middleware/auth');

const router = express.Router();

// Login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required' });
    }

    database.getConnection().get(
      'SELECT * FROM users WHERE username = ? AND isActive = 1',
      [username],
      async (err, user) => {
        if (err) {
          return res.status(500).json({ message: 'Database error' });
        }

        if (!user) {
          return res.status(401).json({ message: 'Invalid credentials' });
        }

        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
          return res.status(401).json({ message: 'Invalid credentials' });
        }

        const token = jwt.sign(
          { id: user.id, username: user.username, role: user.role },
          process.env.JWT_SECRET,
          { expiresIn: '12h' }
        );

        // Log activity
        database.getConnection().run(
          'INSERT INTO activity_logs (userId, action, details, ipAddress) VALUES (?, ?, ?, ?)',
          [user.id, 'LOGIN', 'User logged in', req.ip]
        );

        res.json({
          token,
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role,
            firstName: user.firstName,
            lastName: user.lastName
          }
        });
      }
    );
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Verify token
router.get('/verify', auth(), (req, res) => {
  res.json({ user: req.user });
});

// Logout
router.post('/logout', auth(), (req, res) => {
  // Log activity
  database.getConnection().run(
    'INSERT INTO activity_logs (userId, action, details, ipAddress) VALUES (?, ?, ?, ?)',
    [req.user.id, 'LOGOUT', 'User logged out', req.ip]
  );
  
  res.json({ message: 'Logged out successfully' });
});

module.exports = router;
