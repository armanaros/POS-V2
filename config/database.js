const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = process.env.DB_PATH || './database/pos.db';

class Database {
  constructor() {
    this.db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Error opening database:', err.message);
      } else {
        console.log('Connected to SQLite database');
        this.initTables();
      }
    });
  }

  initTables() {
    // First, migrate existing table if needed
    this.migrateUsersTable();
    this.migrateMenuItemsTable();
    
    const tables = [
      // Users table
      `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
  role TEXT CHECK(role IN ('admin', 'manager', 'employee', 'delivery')) NOT NULL DEFAULT 'employee',
        firstName VARCHAR(50) NOT NULL,
        lastName VARCHAR(50) NOT NULL,
        phone VARCHAR(20),
        profilePicture TEXT,
        isActive BOOLEAN DEFAULT 1,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      // Menu categories table
      `CREATE TABLE IF NOT EXISTS menu_categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        isActive BOOLEAN DEFAULT 1,
        sortOrder INTEGER DEFAULT 0,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      // Menu items table
      `CREATE TABLE IF NOT EXISTS menu_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        categoryId INTEGER NOT NULL,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        price DECIMAL(10,2) NOT NULL,
        costOfGoods DECIMAL(10,2) DEFAULT 0,
        image VARCHAR(255),
        isAvailable BOOLEAN DEFAULT 1,
        isActive BOOLEAN DEFAULT 1,
        preparationTime INTEGER DEFAULT 15,
        ingredients TEXT,
        allergens TEXT,
        calories INTEGER,
        sortOrder INTEGER DEFAULT 0,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (categoryId) REFERENCES menu_categories (id)
      )`,

      // Orders table
      `CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        orderNumber VARCHAR(20) UNIQUE NOT NULL,
        employeeId INTEGER NOT NULL,
        customerName VARCHAR(100),
        customerPhone VARCHAR(20),
        orderType TEXT CHECK(orderType IN ('dine-in', 'takeaway', 'delivery')) NOT NULL,
        tableNumber VARCHAR(10),
        status TEXT CHECK(status IN ('pending', 'preparing', 'ready', 'served', 'cancelled')) DEFAULT 'pending',
        subtotal DECIMAL(10,2) NOT NULL,
        tax DECIMAL(10,2) NOT NULL,
        discount DECIMAL(10,2) DEFAULT 0,
        total DECIMAL(10,2) NOT NULL,
        paymentMethod TEXT CHECK(paymentMethod IN ('cash', 'card', 'mobile')) NOT NULL,
        paymentStatus TEXT CHECK(paymentStatus IN ('pending', 'paid', 'refunded')) DEFAULT 'pending',
        notes TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        completedAt DATETIME,
        FOREIGN KEY (employeeId) REFERENCES users (id)
      )`,

      // Order items table
      `CREATE TABLE IF NOT EXISTS order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        orderId INTEGER NOT NULL,
        menuItemId INTEGER NOT NULL,
        quantity INTEGER NOT NULL,
        unitPrice DECIMAL(10,2) NOT NULL,
        totalPrice DECIMAL(10,2) NOT NULL,
        specialInstructions TEXT,
        FOREIGN KEY (orderId) REFERENCES orders (id),
        FOREIGN KEY (menuItemId) REFERENCES menu_items (id)
      )`,

      // Shifts table
      `CREATE TABLE IF NOT EXISTS shifts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employeeId INTEGER NOT NULL,
        startTime DATETIME NOT NULL,
        endTime DATETIME,
        openingCash DECIMAL(10,2) DEFAULT 0,
        closingCash DECIMAL(10,2),
        totalSales DECIMAL(10,2) DEFAULT 0,
        totalOrders INTEGER DEFAULT 0,
        notes TEXT,
        isActive BOOLEAN DEFAULT 1,
        FOREIGN KEY (employeeId) REFERENCES users (id)
      )`,

      // Activity logs table
      `CREATE TABLE IF NOT EXISTS activity_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER NOT NULL,
        action VARCHAR(100) NOT NULL,
        details TEXT,
        ipAddress VARCHAR(45),
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (userId) REFERENCES users (id)
      )`
    ];

    tables.forEach((tableSQL, index) => {
      this.db.run(tableSQL, (err) => {
        if (err) {
          console.error(`Error creating table ${index + 1}:`, err.message);
        }
      });
    });

    // Create default admin user
    this.createDefaultAdmin();
    this.createSampleData();
  }

  migrateUsersTable() {
    // Check if the table exists and needs migration for manager role
    this.db.get(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='users'",
      (err, result) => {
        if (err) {
          console.error('Error checking users table:', err);
          return;
        }
        
        if (result && result.sql) {
          let needsMigration = false;
          
          // Check if manager role is already in the constraint
          if (!result.sql.includes("'manager'")) {
            needsMigration = true;
          }
          
          // Check if profilePicture field exists
          if (!result.sql.includes('profilePicture')) {
            needsMigration = true;
          }
          
          if (needsMigration) {
            console.log('Migrating users table...');
            
            // SQLite doesn't support ALTER TABLE with CHECK constraints
            // So we need to recreate the table
            this.db.serialize(() => {
              // Create backup table
              this.db.run(`CREATE TABLE users_backup AS SELECT * FROM users`);
              
              // Drop original table
              this.db.run(`DROP TABLE users`);
              
              // Create new table with manager role and profilePicture
              this.db.run(`CREATE TABLE users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username VARCHAR(50) UNIQUE NOT NULL,
                email VARCHAR(100) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                role TEXT CHECK(role IN ('admin', 'manager', 'employee', 'delivery')) NOT NULL DEFAULT 'employee',
                firstName VARCHAR(50) NOT NULL,
                lastName VARCHAR(50) NOT NULL,
                phone VARCHAR(20),
                profilePicture TEXT,
                isActive BOOLEAN DEFAULT 1,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
              )`);
              
              // Copy data back (adding default NULL for profilePicture)
              this.db.run(`INSERT INTO users (id, username, email, password, role, firstName, lastName, phone, isActive, createdAt, updatedAt) 
                          SELECT id, username, email, password, role, firstName, lastName, phone, isActive, createdAt, updatedAt FROM users_backup`);
              
              // Drop backup table
              this.db.run(`DROP TABLE users_backup`);
              
              console.log('Users table migration completed successfully');
            });
          }
        }
      }
    );
  }

  migrateMenuItemsTable() {
    // Add costOfGoods column if it doesn't exist
    this.db.get(
      "PRAGMA table_info(menu_items)",
      (err, result) => {
        if (err) {
          console.error('Error checking menu_items table:', err);
          return;
        }
        
        // Check if costOfGoods column exists
        this.db.all(
          "PRAGMA table_info(menu_items)",
          (err, columns) => {
            if (err) {
              console.error('Error getting menu_items columns:', err);
              return;
            }
            
            const hasCostOfGoods = columns.some(col => col.name === 'costOfGoods');
            
            if (!hasCostOfGoods) {
              console.log('Adding costOfGoods column to menu_items table...');
              this.db.run(
                'ALTER TABLE menu_items ADD COLUMN costOfGoods DECIMAL(10,2) DEFAULT 0',
                (err) => {
                  if (err) {
                    console.error('Error adding costOfGoods column:', err);
                  } else {
                    console.log('✅ costOfGoods column added to menu_items table');
                  }
                }
              );
            }
          }
        );
      }
    );
  }

  async createDefaultAdmin() {
    const hashedPassword = await bcrypt.hash('admin123', 10);
    
    const adminUser = {
      username: 'admin',
      email: 'admin@restaurant.com',
      password: hashedPassword,
      role: 'admin',
      firstName: 'Restaurant',
      lastName: 'Admin',
      phone: '1234567890'
    };

    this.db.run(
      `INSERT OR IGNORE INTO users (username, email, password, role, firstName, lastName, phone) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [adminUser.username, adminUser.email, adminUser.password, adminUser.role, 
       adminUser.firstName, adminUser.lastName, adminUser.phone],
      (err) => {
        if (err && !err.message.includes('UNIQUE constraint failed')) {
          console.error('Error creating admin user:', err.message);
        } else if (!err) {
          console.log('Default admin user created (username: admin, password: admin123)');
        }
      }
    );
  }

  createSampleData() {
    // Wait for tables to be created
    setTimeout(() => {
      // Sample categories
      const categories = [
        { name: 'Appetizers', description: 'Start your meal right' },
        { name: 'Main Courses', description: 'Hearty and delicious main dishes' },
        { name: 'Desserts', description: 'Sweet endings to your meal' },
        { name: 'Beverages', description: 'Refreshing drinks' }
      ];

      categories.forEach((category, index) => {
        this.db.run(
          `INSERT OR IGNORE INTO menu_categories (name, description, sortOrder) VALUES (?, ?, ?)`,
          [category.name, category.description, index + 1],
          (err) => {
            if (err) {
              console.error('Error inserting category:', err.message);
            }
          }
        );
      });

      // Sample menu items - wait for categories to be inserted
      setTimeout(() => {
        const menuItems = [
          { categoryId: 1, name: 'Caesar Salad', description: 'Fresh romaine lettuce with caesar dressing', price: 12.99, costOfGoods: 4.50, preparationTime: 10 },
          { categoryId: 1, name: 'Chicken Wings', description: 'Spicy buffalo wings with blue cheese', price: 15.99, costOfGoods: 7.20, preparationTime: 15 },
          { categoryId: 2, name: 'Grilled Salmon', description: 'Fresh salmon with lemon butter sauce', price: 24.99, costOfGoods: 12.00, preparationTime: 20 },
          { categoryId: 2, name: 'Ribeye Steak', description: 'Premium ribeye steak grilled to perfection', price: 32.99, costOfGoods: 18.50, preparationTime: 25 },
          { categoryId: 2, name: 'Chicken Pasta', description: 'Creamy alfredo pasta with grilled chicken', price: 18.99, costOfGoods: 8.75, preparationTime: 18 },
          { categoryId: 3, name: 'Chocolate Cake', description: 'Rich chocolate cake with vanilla ice cream', price: 8.99, costOfGoods: 3.20, preparationTime: 5 },
          { categoryId: 3, name: 'Cheesecake', description: 'New York style cheesecake', price: 7.99, costOfGoods: 2.80, preparationTime: 5 },
          { categoryId: 4, name: 'Coffee', description: 'Freshly brewed coffee', price: 3.99, costOfGoods: 0.85, preparationTime: 3 },
          { categoryId: 4, name: 'Fresh Juice', description: 'Orange, apple, or cranberry juice', price: 4.99, costOfGoods: 1.50, preparationTime: 2 }
        ];

        menuItems.forEach(item => {
          this.db.run(
            `INSERT OR IGNORE INTO menu_items (categoryId, name, description, price, costOfGoods, preparationTime) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [item.categoryId, item.name, item.description, item.price, item.costOfGoods, item.preparationTime],
            (err) => {
              if (err) {
                console.error('Error inserting menu item:', err.message);
              }
            }
          );
        });
      }, 2000);
    }, 1000);
  }

  getConnection() {
    return this.db;
  }

  close() {
    this.db.close((err) => {
      if (err) {
        console.error(err.message);
      } else {
        console.log('Database connection closed');
      }
    });
  }
}

module.exports = new Database();
