const jwt = require('jsonwebtoken');
const database = require('../config/database');

const auth = (roles = []) => {
  return (req, res, next) => {
    try {
      const token = req.header('Authorization')?.replace('Bearer ', '');
      
      if (!token) {
        return res.status(401).json({ message: 'Access denied. No token provided.' });
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Get user from database to ensure user still exists
      database.getConnection().get(
        'SELECT id, username, email, role, firstName, lastName, isActive FROM users WHERE id = ?',
        [decoded.id],
        (err, user) => {
          if (err) {
            return res.status(500).json({ message: 'Database error' });
          }
          
          if (!user) {
            return res.status(401).json({ message: 'Invalid token. User not found.' });
          }

          // Check if user has required role
          if (roles.length > 0 && !roles.includes(user.role)) {
            return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });
          }

          req.user = user;
          next();
        }
      );
    } catch (error) {
      res.status(400).json({ message: 'Invalid token.' });
    }
  };
};

const adminOnly = auth(['admin']);
const employeeOrAdmin = auth(['admin', 'manager', 'employee']);
const managerOrAdmin = auth(['admin', 'manager']);

module.exports = { auth, adminOnly, employeeOrAdmin, managerOrAdmin };
