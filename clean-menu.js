const sqlite3 = require('sqlite3').verbose();

async function cleanMenuData() {
  const db = new sqlite3.Database('./database/pos.db');
  
  console.log('🧹 Cleaning all menu data...');
  
  try {
    await new Promise((resolve, reject) => {
      db.serialize(() => {
        // First clear menu items
        db.run('DELETE FROM menu_items', (err) => {
          if (err) {
            console.error('❌ Error clearing menu_items:', err);
          } else {
            console.log('✅ Cleared all menu items');
          }
        });
        
        // Then clear categories (if the table exists)
        db.run('DELETE FROM categories', (err) => {
          if (err) {
            if (err.message.includes('no such table')) {
              console.log('ℹ️  Categories table does not exist (skipping)');
            } else {
              console.error('❌ Error clearing categories:', err);
            }
          } else {
            console.log('✅ Cleared all categories');
          }
        });
        
        // Reset auto-increment counters
        db.run('DELETE FROM sqlite_sequence WHERE name IN ("menu_items", "categories")', (err) => {
          if (err) {
            console.error('❌ Error resetting sequences:', err);
          } else {
            console.log('✅ Reset menu auto-increment counters');
          }
          resolve();
        });
      });
    });
    
    console.log('🎉 Menu data cleaned successfully!');
    console.log('📝 All menu items and categories have been removed.');
    
  } catch (error) {
    console.error('❌ Error cleaning menu data:', error);
  } finally {
    db.close();
  }
}

cleanMenuData();
