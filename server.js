// Complete server test with socket.io
const express = require('express');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const http = require('http');
const socketIo = require('socket.io');
require('dotenv').config();

console.log('Starting complete server...');

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


// Rate limiting (DISABLED FOR DEVELOPMENT)
// const limiter = rateLimit({
//   windowMs: 15 * 60 * 1000, // 15 minutes
//   max: 100 // limit each IP to 100 requests per windowMs
// });
// app.use(limiter);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Make io accessible to routes
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Simple request logger for debugging
app.use((req, res, next) => {
  console.log(`[REQ] ${req.method} ${req.originalUrl} - Accept: ${req.headers.accept || ''} - Host: ${req.headers.host || ''}`);
  next();
});

console.log('Loading routes...');

// Routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const menuRoutes = require('./routes/menu');
const orderRoutes = require('./routes/orders');
const reportRoutes = require('./routes/reports');
const profileRoutes = require('./routes/profile');
const databaseRoutes = require('./routes/database');
const operationsRoutes = require('./routes/operations');

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/database', databaseRoutes);
app.use('/api/operations', operationsRoutes);

console.log('Routes loaded successfully');

// Lightweight health endpoint for debugging/probes
app.get('/api/health', (req, res) => {
  res.json({ ok: true, env: process.env.NODE_ENV || 'development', time: new Date().toISOString() });
});

// Temporary debug route to verify API routing without auth
app.get('/api/debug/orders', (req, res) => {
  res.json([
    { id: 1, orderNumber: 'ORD001', subtotal: 150.00, total: 165.00, completedAt: new Date().toISOString() }
  ]);
});

// Serve static files from React build
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'client/build')));
  
  app.get('*', (req, res) => {
    // Do not serve the SPA for API routes — pass them through to allow proper 404/handlers
    if (req.originalUrl && req.originalUrl.startsWith('/api')) {
      return res.status(404).json({ message: 'API route not found' });
    }
    res.sendFile(path.join(__dirname, 'client/build', 'index.html'));
  });
}

// Socket.io connection handling
io.on('connection', (socket) => {
  
  socket.on('join_restaurant', (restaurantId) => {
    socket.join(`restaurant_${restaurantId}`);
  });

  socket.on('request_sync', async () => {
    try {
      const database = require('./config/database');
      
      // Send current orders
      database.getConnection().all(
        `SELECT o.*, 
         GROUP_CONCAT(
           json_object(
             'id', oi.id,
             'menuItemId', oi.menuItemId,
             'quantity', oi.quantity,
             'price', oi.price,
             'itemName', mi.name
           )
         ) as items
         FROM orders o
         LEFT JOIN order_items oi ON o.id = oi.orderId
         LEFT JOIN menu_items mi ON oi.menuItemId = mi.id
         WHERE o.createdAt >= date('now', '-1 day')
         GROUP BY o.id
         ORDER BY o.createdAt DESC
         LIMIT 50`,
        (err, orders) => {
          if (!err && orders) {
            socket.emit('sync_orders', orders);
          }
        }
      );

      // Send current menu items
      database.getConnection().all(
        `SELECT mi.*, mc.name as categoryName 
         FROM menu_items mi 
         LEFT JOIN menu_categories mc ON mi.categoryId = mc.id 
         WHERE mi.isActive = 1`,
        (err, menuItems) => {
          if (!err && menuItems) {
            socket.emit('sync_menu', menuItems);
          }
        }
      );

      // Send current users (excluding passwords)
      database.getConnection().all(
        `SELECT id, username, firstName, lastName, email, role, phone, isActive, createdAt 
         FROM users WHERE isActive = 1`,
        (err, users) => {
          if (!err && users) {
            socket.emit('sync_users', users);
          }
        }
      );
    } catch (error) {
      console.error('Error syncing data:', error);
    }
  });
  
  socket.on('new_order', (orderData) => {
    socket.to(`restaurant_${orderData.restaurantId}`).emit('order_update', orderData);
  });
  
  socket.on('order_status_update', (updateData) => {
    socket.to(`restaurant_${updateData.restaurantId}`).emit('order_status_changed', updateData);
  });
  
  socket.on('disconnect', () => {
    // User disconnected - no logging needed for cleaner console
  });
});

const PORT = process.env.PORT || 5001;

console.log('Starting server listener...');

server.listen(PORT, (error) => {
  if (error) {
    console.error('Error starting server:', error);
    return;
  }
  console.log(`Server running on port ${PORT}`);
  console.log('Server is ready and listening for connections');
});

// Error handlers
server.on('error', (error) => {
  console.error('Server error:', error);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection:', reason);
});
