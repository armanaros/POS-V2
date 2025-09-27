const express = require('express');
const bcrypt = require('bcryptjs');
const database = require('../config/database');
const { adminOnly, employeeOrAdmin, managerOrAdmin } = require('../middleware/auth');

const router = express.Router();

// Get all users (admin and manager only)
router.get('/', managerOrAdmin, (req, res) => {
  database.getConnection().all(
    'SELECT id, username, email, role, firstName, lastName, phone, isActive, createdAt FROM users ORDER BY createdAt DESC',
    (err, users) => {
      if (err) {
        return res.status(500).json({ message: 'Database error' });
      }
      res.json(users);
    }
  );
});

// Get user by ID
router.get('/:id', employeeOrAdmin, (req, res) => {
  const userId = req.params.id;
  
  // Admin can view any user, employees can only view their own profile
  if (req.user.role !== 'admin' && req.user.id !== parseInt(userId)) {
    return res.status(403).json({ message: 'Access denied' });
  }

  database.getConnection().get(
    'SELECT id, username, email, role, firstName, lastName, phone, isActive, createdAt FROM users WHERE id = ?',
    [userId],
    (err, user) => {
      if (err) {
        return res.status(500).json({ message: 'Database error' });
      }
      
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
      
      res.json(user);
    }
  );
});

// Create new user (admin and manager only)
router.post('/', managerOrAdmin, async (req, res) => {
  try {
    const { username, email, password, role, firstName, lastName, phone } = req.body;

    if (!username || !email || !password || !firstName || !lastName) {
      return res.status(400).json({ message: 'Required fields missing' });
    }

    // Managers can only create employees, not other managers or admins
    if (req.user.role === 'manager' && role && role !== 'employee') {
      return res.status(403).json({ message: 'Managers can only create employee accounts' });
    }

    // Check if username or email already exists
    database.getConnection().get(
      'SELECT id FROM users WHERE username = ? OR email = ?',
      [username, email],
      async (err, existingUser) => {
        if (err) {
          return res.status(500).json({ message: 'Database error' });
        }

        if (existingUser) {
          return res.status(400).json({ message: 'Username or email already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        database.getConnection().run(
          'INSERT INTO users (username, email, password, role, firstName, lastName, phone) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [username, email, hashedPassword, role || 'employee', firstName, lastName, phone],
          function(err) {
            if (err) {
              return res.status(500).json({ message: 'Error creating user' });
            }

            console.log('User created successfully with ID:', this.lastID);

            // Log activity
            database.getConnection().run(
              'INSERT INTO activity_logs (userId, action, details, ipAddress) VALUES (?, ?, ?, ?)',
              [req.user.id, 'CREATE_USER', `Created user: ${username}`, req.ip]
            );

            const newUser = {
              id: this.lastID,
              username,
              email,
              role: role || 'employee',
              firstName,
              lastName,
              phone,
              isActive: true
            };

            // Emit socket event for real-time updates
            if (req.io) {
              req.io.emit('user_added', newUser);
            }

            res.status(201).json(newUser);
          }
        );
      }
    );
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Update user
router.put('/:id', employeeOrAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    const { username, email, role, firstName, lastName, phone, isActive, password } = req.body;

    // Admin can update any user, employees can only update their own profile
    if (req.user.role !== 'admin' && req.user.id !== parseInt(userId)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    let updateQuery = 'UPDATE users SET email = ?, firstName = ?, lastName = ?, phone = ?, updatedAt = CURRENT_TIMESTAMP';
    let params = [email, firstName, lastName, phone];

    // Only admin can change active status and role
    if (req.user.role === 'admin') {
      if (isActive !== undefined) {
        updateQuery += ', isActive = ?';
        params.push(isActive);
      }
      if (role !== undefined) {
        updateQuery += ', role = ?';
        params.push(role);
      }
      if (username !== undefined) {
        updateQuery += ', username = ?';
        params.push(username);
      }
    }

    // Handle password update
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      updateQuery += ', password = ?';
      params.push(hashedPassword);
    }

    updateQuery += ' WHERE id = ?';
    params.push(userId);

    database.getConnection().run(updateQuery, params, function(err) {
      if (err) {
        return res.status(500).json({ message: 'Error updating user' });
      }

      if (this.changes === 0) {
        return res.status(404).json({ message: 'User not found' });
      }

      // Log activity
      database.getConnection().run(
        'INSERT INTO activity_logs (userId, action, details, ipAddress) VALUES (?, ?, ?, ?)',
        [req.user.id, 'UPDATE_USER', `Updated user ID: ${userId}`, req.ip]
      );

      const updatedUser = {
        id: userId,
        username,
        email,
        role,
        firstName,
        lastName,
        phone
      };

      // Emit socket event for real-time updates
      if (req.io) {
        req.io.emit('user_updated', updatedUser);
      }

      res.json({ message: 'User updated successfully' });
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete user (admin only)
router.delete('/:id', adminOnly, (req, res) => {
  const userId = req.params.id;

  if (parseInt(userId) === req.user.id) {
    return res.status(400).json({ message: 'Cannot delete your own account' });
  }

  // First, transfer any orders from this user to the admin to preserve order history
  database.getConnection().run(
    'UPDATE orders SET employeeId = ? WHERE employeeId = ?',
    [req.user.id, userId], // Transfer orders to the current admin user
    function(orderUpdateErr) {
      if (orderUpdateErr) {
        console.error('Error transferring orders:', orderUpdateErr);
        return res.status(500).json({ message: 'Error transferring user orders' });
      }

      // Update activity logs to transfer to admin as well
      database.getConnection().run(
        'UPDATE activity_logs SET userId = ? WHERE userId = ?',
        [req.user.id, userId],
        function(logUpdateErr) {
          if (logUpdateErr) {
            console.error('Error transferring activity logs:', logUpdateErr);
          }

          // Now delete the user record completely
          database.getConnection().run(
            'DELETE FROM users WHERE id = ?',
            [userId],
            function(err) {
              if (err) {
                console.error('Error deleting user:', err);
                return res.status(500).json({ message: 'Error deleting user' });
              }

              if (this.changes === 0) {
                return res.status(404).json({ message: 'User not found' });
              }

              // Log activity for the deletion
              database.getConnection().run(
                'INSERT INTO activity_logs (userId, action, details, ipAddress) VALUES (?, ?, ?, ?)',
                [req.user.id, 'DELETE_USER', `Permanently deleted user ID: ${userId}`, req.ip]
              );

              // Emit socket event for real-time updates
              if (req.io) {
                req.io.emit('user_deleted', userId);
              }

              res.json({ message: 'User deleted successfully' });
            }
          );
        }
      );
    }
  );
});

module.exports = router;
