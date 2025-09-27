const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3').verbose();

async function createEmployee() {
  const db = new sqlite3.Database('./database/pos.db');
  
  const hashedPassword = await bcrypt.hash('employee123', 10);
  
  db.run(
    'INSERT INTO users (username, email, password, role, firstName, lastName, phone) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ['employee', 'employee@restaurant.com', hashedPassword, 'employee', 'Jane', 'Employee', '555-0456'],
    function(err) {
      if (err) {
        console.error('Error creating employee:', err);
      } else {
        console.log('Employee user created successfully!');
        console.log('Username: employee');
        console.log('Password: employee123');
      }
      db.close();
    }
  );
}

createEmployee();
