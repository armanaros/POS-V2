
const express = require('express');
const database = require('../config/database');
const { adminOnly, employeeOrAdmin, managerOrAdmin } = require('../middleware/auth');
const { Parser } = require('json2csv');

const router = express.Router();
// Export report as CSV (single definition, after router is initialized)
router.get('/export', managerOrAdmin, async (req, res) => {
  const { type = 'comprehensive', startDate, endDate } = req.query;
  let data = [];
  let fields = [];
  let filename = `report-${type}-${Date.now()}.csv`;

  try {
    if (type === 'comprehensive') {
      // Example: export all orders in date range
      const query = `SELECT * FROM orders WHERE DATE(createdAt) BETWEEN ? AND ? ORDER BY createdAt DESC`;
      data = await new Promise((resolve, reject) => {
        database.getConnection().all(query, [startDate, endDate], (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
      fields = Object.keys(data[0] || {});
    } else if (type === 'sales') {
      // Example: export sales report
      const query = `SELECT * FROM orders WHERE status = 'served' AND DATE(createdAt) BETWEEN ? AND ? ORDER BY createdAt DESC`;
      data = await new Promise((resolve, reject) => {
        database.getConnection().all(query, [startDate, endDate], (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
      fields = Object.keys(data[0] || {});
    } else {
      return res.status(400).json({ message: 'Invalid report type' });
    }

    if (!data.length) {
      return res.status(404).json({ message: 'No data to export' });
    }

    const json2csv = new Parser({ fields });
    const csv = json2csv.parse(data);
    res.header('Content-Type', 'text/csv');
    res.attachment(filename);
    return res.send(csv);
  } catch (err) {
    console.error('Export error:', err);
    return res.status(500).json({ message: 'Failed to export report' });
  }
});

// Daily sales report
router.get('/sales/daily', employeeOrAdmin, (req, res) => {
  const { date = new Date().toISOString().split('T')[0] } = req.query;

  database.getConnection().all(
    `SELECT 
       DATE(createdAt) as date,
       COUNT(*) as totalOrders,
       SUM(CASE WHEN status = 'served' THEN total ELSE 0 END) as totalRevenue,
       SUM(CASE WHEN status = 'served' THEN subtotal ELSE 0 END) as subtotal,
       SUM(CASE WHEN status = 'served' THEN tax ELSE 0 END) as totalTax,
       SUM(CASE WHEN status = 'served' THEN discount ELSE 0 END) as totalDiscount,
       AVG(CASE WHEN status = 'served' THEN total ELSE NULL END) as averageOrderValue,
       COUNT(CASE WHEN paymentMethod = 'cash' AND status = 'served' THEN 1 END) as cashOrders,
       COUNT(CASE WHEN paymentMethod = 'card' AND status = 'served' THEN 1 END) as cardOrders,
       COUNT(CASE WHEN paymentMethod = 'mobile' AND status = 'served' THEN 1 END) as mobileOrders,
       SUM(CASE WHEN paymentMethod = 'cash' AND status = 'served' THEN total ELSE 0 END) as cashRevenue,
       SUM(CASE WHEN paymentMethod = 'card' AND status = 'served' THEN total ELSE 0 END) as cardRevenue,
       SUM(CASE WHEN paymentMethod = 'mobile' AND status = 'served' THEN total ELSE 0 END) as mobileRevenue
     FROM orders 
     WHERE DATE(createdAt) = ?
     GROUP BY DATE(createdAt)`,
    [date],
    (err, results) => {
      if (err) {
        return res.status(500).json({ message: 'Database error' });
      }

      const report = results[0] || {
        date,
        totalOrders: 0,
        totalRevenue: 0,
        subtotal: 0,
        totalTax: 0,
        totalDiscount: 0,
        averageOrderValue: 0,
        cashOrders: 0,
        cardOrders: 0,
        mobileOrders: 0,
        cashRevenue: 0,
        cardRevenue: 0,
        mobileRevenue: 0
      };

      res.json(report);
    }
  );
});

// Export report as CSV
router.get('/export', managerOrAdmin, async (req, res) => {
  database.getConnection().all(
    `SELECT 
       DATE(createdAt) as date,
       COUNT(*) as totalOrders,
       SUM(CASE WHEN status = 'served' THEN total ELSE 0 END) as totalRevenue,
       SUM(CASE WHEN status = 'served' THEN subtotal ELSE 0 END) as subtotal,
       SUM(CASE WHEN status = 'served' THEN tax ELSE 0 END) as totalTax,
       SUM(CASE WHEN status = 'served' THEN discount ELSE 0 END) as totalDiscount,
       AVG(CASE WHEN status = 'served' THEN total ELSE NULL END) as averageOrderValue,
       COUNT(CASE WHEN paymentMethod = 'cash' AND status = 'served' THEN 1 END) as cashOrders,
       COUNT(CASE WHEN paymentMethod = 'card' AND status = 'served' THEN 1 END) as cardOrders,
       COUNT(CASE WHEN paymentMethod = 'mobile' AND status = 'served' THEN 1 END) as mobileOrders,
       SUM(CASE WHEN paymentMethod = 'cash' AND status = 'served' THEN total ELSE 0 END) as cashRevenue,
       SUM(CASE WHEN paymentMethod = 'card' AND status = 'served' THEN total ELSE 0 END) as cardRevenue,
       SUM(CASE WHEN paymentMethod = 'mobile' AND status = 'served' THEN total ELSE 0 END) as mobileRevenue
     FROM orders 
     WHERE DATE(createdAt) = ?
     GROUP BY DATE(createdAt)`,
    [date],
    (err, results) => {
      if (err) {
        return res.status(500).json({ message: 'Database error' });
      }

      const report = results[0] || {
        date,
        totalOrders: 0,
        totalRevenue: 0,
        subtotal: 0,
        totalTax: 0,
        totalDiscount: 0,
        averageOrderValue: 0,
        cashOrders: 0,
        cardOrders: 0,
        mobileOrders: 0,
        cashRevenue: 0,
        cardRevenue: 0,
        mobileRevenue: 0
      };

      res.json(report);
    }
  );
});

// Weekly sales report
router.get('/sales/weekly', employeeOrAdmin, (req, res) => {
  const { startDate, endDate } = req.query;
  
  if (!startDate || !endDate) {
    return res.status(400).json({ message: 'Start date and end date are required' });
  }

  database.getConnection().all(
    `SELECT 
       DATE(createdAt) as date,
       COUNT(*) as totalOrders,
       SUM(CASE WHEN status = 'served' THEN total ELSE 0 END) as revenue,
       COUNT(CASE WHEN status = 'served' THEN 1 END) as completedOrders,
       COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelledOrders
     FROM orders 
     WHERE DATE(createdAt) BETWEEN ? AND ?
     GROUP BY DATE(createdAt)
     ORDER BY DATE(createdAt)`,
    [startDate, endDate],
    (err, dailyData) => {
      if (err) {
        return res.status(500).json({ message: 'Database error' });
      }

      // Get weekly summary
      database.getConnection().get(
        `SELECT 
           COUNT(*) as totalOrders,
           SUM(CASE WHEN status = 'served' THEN total ELSE 0 END) as totalRevenue,
           AVG(CASE WHEN status = 'served' THEN total ELSE NULL END) as averageOrderValue,
           COUNT(CASE WHEN status = 'served' THEN 1 END) as completedOrders,
           COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelledOrders
         FROM orders 
         WHERE DATE(createdAt) BETWEEN ? AND ?`,
        [startDate, endDate],
        (err, summary) => {
          if (err) {
            return res.status(500).json({ message: 'Database error' });
          }

          res.json({
            summary,
            dailyData
          });
        }
      );
    }
  );
});

// Employee performance report (admin only)
router.get('/employees/performance', managerOrAdmin, (req, res) => {
  const { startDate, endDate } = req.query;
  
  let query = `
    SELECT 
      u.id, u.firstName, u.lastName, u.username,
      COUNT(o.id) as totalOrders,
      SUM(CASE WHEN o.status = 'served' THEN o.total ELSE 0 END) as totalRevenue,
      AVG(CASE WHEN o.status = 'served' THEN o.total ELSE NULL END) as averageOrderValue,
      COUNT(CASE WHEN o.status = 'served' THEN 1 END) as completedOrders,
      COUNT(CASE WHEN o.status = 'cancelled' THEN 1 END) as cancelledOrders
    FROM users u
    LEFT JOIN orders o ON u.id = o.employeeId
  `;
  
  const params = [];
  
  if (startDate && endDate) {
    query += ' AND DATE(o.createdAt) BETWEEN ? AND ?';
    params.push(startDate, endDate);
  }
  
  query += `
    WHERE u.role = 'employee' AND u.isActive = 1
    GROUP BY u.id, u.firstName, u.lastName, u.username
    ORDER BY totalRevenue DESC
  `;

  database.getConnection().all(query, params, (err, results) => {
    if (err) {
      return res.status(500).json({ message: 'Database error' });
    }
    res.json(results);
  });
});

// Menu item performance report
router.get('/menu/performance', employeeOrAdmin, (req, res) => {
  const { startDate, endDate } = req.query;
  
  let query = `
    SELECT 
      mi.id, mi.name, mi.price,
      mc.name as categoryName,
      SUM(oi.quantity) as totalQuantitySold,
      SUM(oi.totalPrice) as totalRevenue,
      COUNT(DISTINCT oi.orderId) as orderCount,
      AVG(oi.quantity) as averageQuantityPerOrder
    FROM menu_items mi
    JOIN menu_categories mc ON mi.categoryId = mc.id
    LEFT JOIN order_items oi ON mi.id = oi.menuItemId
    LEFT JOIN orders o ON oi.orderId = o.id AND o.status = 'served'
  `;
  
  const params = [];
  
  if (startDate && endDate) {
    query += ' AND DATE(o.createdAt) BETWEEN ? AND ?';
    params.push(startDate, endDate);
  }
  
  query += `
    WHERE mi.isActive = 1
    GROUP BY mi.id, mi.name, mi.price, mc.name
    ORDER BY totalQuantitySold DESC
  `;

  database.getConnection().all(query, params, (err, results) => {
    if (err) {
      return res.status(500).json({ message: 'Database error' });
    }
    res.json(results);
  });
});

// Order type analysis
router.get('/orders/types', employeeOrAdmin, (req, res) => {
  const { startDate, endDate } = req.query;
  
  let query = `
    SELECT 
      orderType,
      COUNT(*) as orderCount,
      SUM(CASE WHEN status = 'served' THEN total ELSE 0 END) as revenue,
      AVG(CASE WHEN status = 'served' THEN total ELSE NULL END) as averageOrderValue
    FROM orders
    WHERE 1=1
  `;
  
  const params = [];
  
  if (startDate && endDate) {
    query += ' AND DATE(createdAt) BETWEEN ? AND ?';
    params.push(startDate, endDate);
  }
  
  query += ' GROUP BY orderType ORDER BY revenue DESC';

  database.getConnection().all(query, params, (err, results) => {
    if (err) {
      return res.status(500).json({ message: 'Database error' });
    }
    res.json(results);
  });
});

// Hourly sales pattern
router.get('/sales/hourly', employeeOrAdmin, (req, res) => {
  const { date = new Date().toISOString().split('T')[0] } = req.query;

  database.getConnection().all(
    `SELECT 
       strftime('%H', createdAt) as hour,
       COUNT(*) as orderCount,
       SUM(CASE WHEN status = 'served' THEN total ELSE 0 END) as revenue
     FROM orders 
     WHERE DATE(createdAt) = ?
     GROUP BY strftime('%H', createdAt)
     ORDER BY hour`,
    [date],
    (err, results) => {
      if (err) {
        return res.status(500).json({ message: 'Database error' });
      }

      // Fill in missing hours with zero values
      const hourlyData = Array.from({ length: 24 }, (_, i) => {
        const hour = i.toString().padStart(2, '0');
        const existing = results.find(r => r.hour === hour);
        return existing || { hour, orderCount: 0, revenue: 0 };
      });

      res.json(hourlyData);
    }
  );
});

// Recent activity log (admin only)
router.get('/activity', adminOnly, (req, res) => {
  const { limit = 100, userId, action } = req.query;
  
  let query = `
    SELECT al.*, u.firstName, u.lastName, u.username
    FROM activity_logs al
    JOIN users u ON al.userId = u.id
    WHERE 1=1
  `;
  
  const params = [];
  
  if (userId) {
    query += ' AND al.userId = ?';
    params.push(userId);
  }
  
  if (action) {
    query += ' AND al.action LIKE ?';
    params.push(`%${action}%`);
  }
  
  query += ' ORDER BY al.createdAt DESC LIMIT ?';
  params.push(parseInt(limit));

  database.getConnection().all(query, params, (err, logs) => {
    if (err) {
      return res.status(500).json({ message: 'Database error' });
    }
    res.json(logs);
  });
});

// Dashboard summary
router.get('/dashboard', employeeOrAdmin, (req, res) => {
  const today = new Date().toISOString().split('T')[0];

  // Get today's statistics
  database.getConnection().get(
    `SELECT 
       COUNT(*) as totalOrders,
       SUM(CASE WHEN status = 'served' THEN total ELSE 0 END) as todayRevenue,
       COUNT(CASE WHEN status = 'pending' THEN 1 END) as pendingOrders,
       COUNT(CASE WHEN status = 'preparing' THEN 1 END) as preparingOrders,
       COUNT(CASE WHEN status = 'ready' THEN 1 END) as readyOrders,
       COUNT(CASE WHEN status = 'served' THEN 1 END) as servedOrders,
       COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelledOrders
     FROM orders 
     WHERE DATE(createdAt) = ?`,
    [today],
    (err, todayStats) => {
      if (err) {
        return res.status(500).json({ message: 'Database error' });
      }

      // Get this month's revenue
      database.getConnection().get(
        `SELECT SUM(CASE WHEN status = 'served' THEN total ELSE 0 END) as monthRevenue
         FROM orders 
         WHERE strftime('%Y-%m', createdAt) = strftime('%Y-%m', 'now')`,
        (err, monthStats) => {
          if (err) {
            return res.status(500).json({ message: 'Database error' });
          }

          // Get top selling items today
          database.getConnection().all(
            `SELECT mi.name, SUM(oi.quantity) as quantity
             FROM order_items oi
             JOIN menu_items mi ON oi.menuItemId = mi.id
             JOIN orders o ON oi.orderId = o.id
             WHERE DATE(o.createdAt) = ? AND o.status = 'served'
             GROUP BY mi.id, mi.name
             ORDER BY quantity DESC
             LIMIT 5`,
            [today],
            (err, topItems) => {
              if (err) {
                return res.status(500).json({ message: 'Database error' });
              }

              res.json({
                today: todayStats,
                monthRevenue: monthStats.monthRevenue || 0,
                topItems
              });
            }
          );
        }
      );
    }
  );
});

module.exports = router;
