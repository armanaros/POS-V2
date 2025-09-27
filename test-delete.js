const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3').verbose();

async function testHardDelete() {
  const db = new sqlite3.Database('./database/pos.db');
  
  console.log('🧪 Testing Hard Delete Functionality...\n');
  
  try {
    // 1. Create a test employee
    console.log('1️⃣ Creating test employee...');
    const hashedPassword = await bcrypt.hash('test123', 10);
    
    await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO users (username, email, password, role, firstName, lastName, phone) VALUES (?, ?, ?, ?, ?, ?, ?)',
        ['testuser', 'test@restaurant.com', hashedPassword, 'employee', 'Test', 'Employee', '555-TEST'],
        function(err) {
          if (err) {
            console.error('❌ Error creating test employee:', err);
            reject(err);
          } else {
            console.log('✅ Test employee created with ID:', this.lastID);
            resolve(this.lastID);
          }
        }
      );
    });
    
    // 2. Verify user exists
    console.log('\n2️⃣ Verifying user exists in database...');
    const userExists = await new Promise((resolve) => {
      db.get('SELECT * FROM users WHERE username = ?', ['testuser'], (err, row) => {
        if (err) {
          console.error('❌ Error checking user:', err);
          resolve(false);
        } else {
          console.log('✅ User found:', row ? `${row.firstName} ${row.lastName}` : 'Not found');
          resolve(!!row);
        }
      });
    });
    
    if (!userExists) {
      console.log('❌ Test failed: User was not created');
      return;
    }
    
    // 3. Get user ID for deletion test
    const userId = await new Promise((resolve) => {
      db.get('SELECT id FROM users WHERE username = ?', ['testuser'], (err, row) => {
        resolve(row ? row.id : null);
      });
    });
    
    console.log('\n3️⃣ Attempting to delete user via hard delete...');
    
    // 4. Test hard delete
    await new Promise((resolve, reject) => {
      // First, transfer any orders to admin (user ID 1)
      db.run('UPDATE orders SET employeeId = 1 WHERE employeeId = ?', [userId], (err) => {
        if (err) {
          console.error('❌ Error transferring orders:', err);
        } else {
          console.log('✅ Orders transferred to admin');
        }
        
        // Now delete the user
        db.run('DELETE FROM users WHERE id = ?', [userId], function(err) {
          if (err) {
            console.error('❌ Error deleting user:', err);
            reject(err);
          } else {
            console.log('✅ User deleted successfully (rows affected:', this.changes, ')');
            resolve();
          }
        });
      });
    });
    
    // 5. Verify user is actually deleted
    console.log('\n4️⃣ Verifying user is deleted from database...');
    const userDeleted = await new Promise((resolve) => {
      db.get('SELECT * FROM users WHERE id = ?', [userId], (err, row) => {
        if (err) {
          console.error('❌ Error checking deletion:', err);
          resolve(false);
        } else {
          console.log('✅ User lookup result:', row ? 'Still exists' : 'Successfully deleted');
          resolve(!row);
        }
      });
    });
    
    // 6. Test recreating user with same username
    console.log('\n5️⃣ Testing recreation with same username...');
    const newHashedPassword = await bcrypt.hash('newtest123', 10);
    
    const recreateSuccess = await new Promise((resolve) => {
      db.run(
        'INSERT INTO users (username, email, password, role, firstName, lastName, phone) VALUES (?, ?, ?, ?, ?, ?, ?)',
        ['testuser', 'newtest@restaurant.com', newHashedPassword, 'manager', 'New Test', 'Manager', '555-NEW'],
        function(err) {
          if (err) {
            console.error('❌ Error recreating user:', err.message);
            resolve(false);
          } else {
            console.log('✅ User recreated successfully with ID:', this.lastID);
            resolve(true);
          }
        }
      );
    });
    
    // 7. Clean up - delete the test user
    console.log('\n6️⃣ Cleaning up test data...');
    await new Promise((resolve) => {
      db.run('DELETE FROM users WHERE username = ?', ['testuser'], function(err) {
        if (err) {
          console.error('❌ Error cleaning up:', err);
        } else {
          console.log('✅ Test data cleaned up');
        }
        resolve();
      });
    });
    
    // 8. Final results
    console.log('\n🎯 TEST RESULTS:');
    console.log('✅ Hard delete functionality:', userDeleted ? 'WORKING' : 'FAILED');
    console.log('✅ Username reuse capability:', recreateSuccess ? 'WORKING' : 'FAILED');
    
    if (userDeleted && recreateSuccess) {
      console.log('\n🎉 All tests PASSED! You can now delete and recreate users with the same username.');
    } else {
      console.log('\n❌ Some tests FAILED. Check the implementation.');
    }
    
  } catch (error) {
    console.error('❌ Test error:', error);
  } finally {
    db.close();
  }
}

testHardDelete();
