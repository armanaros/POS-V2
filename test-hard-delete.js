const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3').verbose();

async function testHardDelete() {
  const db = new sqlite3.Database('./database/pos.db');
  
  console.log('🧪 Testing Hard Delete Functionality');
  console.log('=====================================');
  
  try {
    // Create a test user
    const hashedPassword = await bcrypt.hash('test123', 10);
    
    console.log('1. Creating test user...');
    await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO users (username, email, password, role, firstName, lastName, phone) VALUES (?, ?, ?, ?, ?, ?, ?)',
        ['testuser', 'test@restaurant.com', hashedPassword, 'employee', 'Test', 'User', '555-0789'],
        function(err) {
          if (err) {
            console.error('❌ Error creating test user:', err.message);
            reject(err);
          } else {
            console.log('✅ Test user created with ID:', this.lastID);
            resolve(this.lastID);
          }
        }
      );
    });
    
    // Check if user exists
    console.log('2. Checking if user exists...');
    const userExists = await new Promise((resolve) => {
      db.get('SELECT * FROM users WHERE username = ?', ['testuser'], (err, row) => {
        if (err) {
          console.error('❌ Error checking user:', err.message);
          resolve(false);
        } else {
          console.log('✅ User found:', row ? 'Yes' : 'No');
          resolve(!!row);
        }
      });
    });
    
    if (userExists) {
      console.log('3. Now you can test deleting this user through the admin interface.');
      console.log('   Username: testuser');
      console.log('   After deletion, try creating another user with username "testuser"');
      console.log('   - It should work without any constraint errors!');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    db.close();
    console.log('=====================================');
  }
}

testHardDelete();
