const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');

async function cleanDatabase() {
  const db = new sqlite3.Database('./database/pos.db');
  
  console.log('🧹 Cleaning database...');
  
  try {
    // Delete all seeded data except keep only one admin user
    await new Promise((resolve, reject) => {
      db.serialize(() => {
        // Clear all orders and order items
        db.run('DELETE FROM order_items', (err) => {
          if (err) console.error('Error clearing order_items:', err);
          else console.log('✅ Cleared order_items');
        });
        
        db.run('DELETE FROM orders', (err) => {
          if (err) console.error('Error clearing orders:', err);
          else console.log('✅ Cleared orders');
        });
        
        // Clear all menu items except keep structure
        db.run('DELETE FROM menu_items', (err) => {
          if (err) console.error('Error clearing menu_items:', err);
          else console.log('✅ Cleared menu_items');
        });
        
        // Clear all menu categories except keep structure
        db.run('DELETE FROM menu_categories', (err) => {
          if (err) console.error('Error clearing menu_categories:', err);
          else console.log('✅ Cleared menu_categories');
        });
        
        // Clear activity logs
        db.run('DELETE FROM activity_logs', (err) => {
          if (err) console.error('Error clearing activity_logs:', err);
          else console.log('✅ Cleared activity_logs');
        });
        
        // Remove all users except admin
        db.run('DELETE FROM users WHERE username != "admin"', (err) => {
          if (err) console.error('Error clearing users:', err);
          else console.log('✅ Cleared seeded users (kept admin)');
        });
        
        // Reset auto-increment counters (sqlite_sequence). Include actual table names.
        db.run('DELETE FROM sqlite_sequence WHERE name IN ("users", "orders", "order_items", "menu_items", "menu_categories", "activity_logs")', (err) => {
          if (err) console.error('Error resetting sequences:', err);
          else console.log('✅ Reset auto-increment counters');
          resolve();
        });
      });
    });
    
    console.log('🎉 Database cleaned successfully!');
    console.log('📝 Only admin user remains: username="admin", password="admin123"');
    
  } catch (error) {
    console.error('❌ Error cleaning database:', error);
  } finally {
    db.close();
  }
}

cleanDatabase();
