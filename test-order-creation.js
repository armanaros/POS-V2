const axios = require('axios');

async function testOrderCreation() {
  try {
    // Login to get token
    console.log('Logging in...');
    const loginResponse = await axios.post('http://localhost:5001/api/auth/login', {
      username: 'admin',
      password: 'admin123'
    });
    
    const token = loginResponse.data.token;
    console.log('✅ Login successful');

    // Create a test order
    console.log('Creating test order...');
    const orderResponse = await axios.post('http://localhost:5001/api/orders', {
      customerName: 'Test Customer',
      orderType: 'dine-in', 
      paymentMethod: 'cash',
      items: [{
        menuItemId: 1,
        unitPrice: 12.99,
        quantity: 1
      }]
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    console.log('✅ Order created:', orderResponse.data);
    console.log('🏷️ Order Number:', orderResponse.data.orderNumber);
    
    // Test income analysis
    console.log('Testing income analysis...');
    const incomeResponse = await axios.get('http://localhost:5001/api/orders/income/analysis', {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    console.log('✅ Income analysis:', incomeResponse.data);
    
  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
  }
}

testOrderCreation();