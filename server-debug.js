// Debug version of server.js
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

const express = require('express');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const http = require('http');
const socketIo = require('socket.io');
require('dotenv').config();

console.log('Loading routes...');
const authRoutes = require('./routes/auth');
console.log('Auth routes loaded');
const userRoutes = require('./routes/users');
console.log('User routes loaded');
const menuRoutes = require('./routes/menu');
console.log('Menu routes loaded');
const orderRoutes = require('./routes/orders');
console.log('Order routes loaded');
const reportRoutes = require('./routes/reports');
console.log('Report routes loaded');
const profileRoutes = require('./routes/profile');
console.log('Profile routes loaded');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

console.log('Setting up middleware...');

// CORS must be first
app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:3000",
  credentials: true
}));

// Handle preflight requests for all routes
app.options('*', cors({
  origin: process.env.CLIENT_URL || "http://localhost:3000",
  credentials: true
}));

// Security middleware
app.use(helmet());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Make io accessible to routes
app.use((req, res, next) => {
  req.io = io;
  next();
});

console.log('Setting up routes...');

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/profile', profileRoutes);

console.log('Routes setup complete');

// Serve static files from React build
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'client/build')));
  
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'client/build', 'index.html'));
  });
}

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  socket.on('join_restaurant', (restaurantId) => {
    socket.join(`restaurant_${restaurantId}`);
  });
  
  socket.on('new_order', (orderData) => {
    socket.to(`restaurant_${orderData.restaurantId}`).emit('order_update', orderData);
  });
  
  socket.on('order_status_update', (updateData) => {
    socket.to(`restaurant_${updateData.restaurantId}`).emit('order_status_changed', updateData);
  });
  
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 5001;

console.log('Starting server...');

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Server is ready to accept connections');
});

// Keep the process alive
setInterval(() => {
  console.log('Server heartbeat - still running');
}, 30000);
