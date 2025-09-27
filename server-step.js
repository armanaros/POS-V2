// Step by step server test
const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

console.log('1. Starting server setup...');

const app = express();

console.log('2. Setting up CORS...');
app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:3000",
  credentials: true
}));

console.log('3. Setting up middleware...');
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

console.log('4. Setting up test route...');
app.get('/api/test', (req, res) => {
  res.json({ message: 'Server is working!' });
});

console.log('5. Loading auth routes...');
try {
  const authRoutes = require('./routes/auth');
  app.use('/api/auth', authRoutes);
  console.log('✓ Auth routes loaded successfully');
} catch (error) {
  console.error('✗ Error loading auth routes:', error.message);
}

console.log('6. Loading user routes...');
try {
  const userRoutes = require('./routes/users');
  app.use('/api/users', userRoutes);
  console.log('✓ User routes loaded successfully');
} catch (error) {
  console.error('✗ Error loading user routes:', error.message);
}

console.log('7. Loading menu routes...');
try {
  const menuRoutes = require('./routes/menu');
  app.use('/api/menu', menuRoutes);
  console.log('✓ Menu routes loaded successfully');
} catch (error) {
  console.error('✗ Error loading menu routes:', error.message);
}

console.log('8. Loading order routes...');
try {
  const orderRoutes = require('./routes/orders');
  app.use('/api/orders', orderRoutes);
  console.log('✓ Order routes loaded successfully');
} catch (error) {
  console.error('✗ Error loading order routes:', error.message);
}

console.log('9. Loading report routes...');
try {
  const reportRoutes = require('./routes/reports');
  app.use('/api/reports', reportRoutes);
  console.log('✓ Report routes loaded successfully');
} catch (error) {
  console.error('✗ Error loading report routes:', error.message);
}

console.log('10. Loading profile routes...');
try {
  const profileRoutes = require('./routes/profile');
  app.use('/api/profile', profileRoutes);
  console.log('✓ Profile routes loaded successfully');
} catch (error) {
  console.error('✗ Error loading profile routes:', error.message);
}

const PORT = process.env.PORT || 5001;

console.log('11. Starting server...');
const server = app.listen(PORT, () => {
  console.log(`✓ Server running on port ${PORT}`);
  console.log('Server is ready to accept connections');
});

// Add error handlers
server.on('error', (error) => {
  console.error('Server error:', error);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
});

// Keep alive
setInterval(() => {
  console.log('Server heartbeat - still running');
}, 15000);
