// Test script to verify real-time synchronization between roles
const io = require('socket.io-client');

console.log('Testing POS System Real-time Synchronization...\n');

// Simulate connections for different roles
const adminSocket = io('http://localhost:5001');
const cashierSocket = io('http://localhost:5001'); 
const managerSocket = io('http://localhost:5001');

let testResults = {
  orderSync: false,
  menuSync: false,
  userSync: false,
  notifications: false
};

// Admin socket setup
adminSocket.on('connect', () => {
  console.log('✅ Admin connected:', adminSocket.id);
  adminSocket.emit('join_restaurant', 'default');
  adminSocket.emit('request_sync');
});

// Cashier socket setup
cashierSocket.on('connect', () => {
  console.log('✅ Cashier connected:', cashierSocket.id);
  cashierSocket.emit('join_restaurant', 'default');
  cashierSocket.emit('request_sync');
});

// Manager socket setup
managerSocket.on('connect', () => {
  console.log('✅ Manager connected:', managerSocket.id);
  managerSocket.emit('join_restaurant', 'default');
  managerSocket.emit('request_sync');
});

// Test order synchronization
adminSocket.on('new_order', (order) => {
  console.log('🔄 Admin received new order:', order.orderNumber);
  testResults.orderSync = true;
});

cashierSocket.on('new_order', (order) => {
  console.log('🔄 Cashier received new order:', order.orderNumber);
});

managerSocket.on('new_order', (order) => {
  console.log('🔄 Manager received new order:', order.orderNumber);
});

// Test menu item synchronization
adminSocket.on('menu_item_added', (item) => {
  console.log('🍽️ Admin received menu item:', item.name);
  testResults.menuSync = true;
});

cashierSocket.on('menu_item_added', (item) => {
  console.log('🍽️ Cashier received menu item:', item.name);
});

managerSocket.on('menu_item_added', (item) => {
  console.log('🍽️ Manager received menu item:', item.name);
});

// Test user management synchronization
adminSocket.on('user_added', (user) => {
  console.log('👤 Admin received new user:', user.username);
  testResults.userSync = true;
});

cashierSocket.on('user_added', (user) => {
  console.log('👤 Cashier received new user:', user.username);
});

managerSocket.on('user_added', (user) => {
  console.log('👤 Manager received new user:', user.username);
});

// Test sync responses
adminSocket.on('sync_orders', (orders) => {
  console.log(`📊 Admin synced ${orders.length} orders`);
});

cashierSocket.on('sync_orders', (orders) => {
  console.log(`📊 Cashier synced ${orders.length} orders`);
});

managerSocket.on('sync_orders', (orders) => {
  console.log(`📊 Manager synced ${orders.length} orders`);
});

// Simulate some activity after connections stabilize
setTimeout(() => {
  console.log('\n🧪 Starting synchronization tests...\n');
  
  // Simulate new order
  adminSocket.emit('new_order', {
    orderNumber: 'TEST-001',
    total: 25.99,
    status: 'pending',
    restaurantId: 'default'
  });
  
  // Test order status update
  setTimeout(() => {
    cashierSocket.emit('order_status_update', {
      orderId: 1,
      status: 'preparing',
      restaurantId: 'default'
    });
  }, 1000);
  
}, 2000);

// Generate test summary after 10 seconds
setTimeout(() => {
  console.log('\n📋 SYNCHRONIZATION TEST SUMMARY:');
  console.log('=====================================');
  console.log(`Order Sync: ${testResults.orderSync ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Menu Sync: ${testResults.menuSync ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`User Sync: ${testResults.userSync ? '✅ PASS' : '❌ FAIL'}`);
  console.log('=====================================');
  
  const passed = Object.values(testResults).filter(result => result).length;
  const total = Object.keys(testResults).length;
  console.log(`Overall: ${passed}/${total} tests passed\n`);
  
  if (passed === total) {
    console.log('🎉 All synchronization tests PASSED!');
    console.log('✅ Admin, Cashier, and Manager roles are properly synchronized.');
  } else {
    console.log('⚠️ Some synchronization tests FAILED!');
    console.log('❌ Check the socket implementation and event handlers.');
  }
  
  // Cleanup
  adminSocket.disconnect();
  cashierSocket.disconnect();
  managerSocket.disconnect();
  process.exit(0);
}, 10000);

// Handle connection errors
[adminSocket, cashierSocket, managerSocket].forEach((socket, index) => {
  const roles = ['Admin', 'Cashier', 'Manager'];
  socket.on('connect_error', (error) => {
    console.log(`❌ ${roles[index]} connection failed:`, error.message);
  });
});
