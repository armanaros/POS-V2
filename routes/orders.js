const express = require('express');
const database = require('../config/database');
const { employeeOrAdmin, managerOrAdmin } = require('../middleware/auth');

const router = express.Router();

// Generate order number
function generateOrderNumber() {
  const now = new Date();
  const timestamp = now.getTime().toString().slice(-6);
  return `ORD${timestamp}`;
}

// Get all orders
router.get('/', employeeOrAdmin, (req, res) => {
  const { status, date, employee, limit = 50 } = req.query;
  
  let query = `
    SELECT o.*, u.firstName, u.lastName, u.username
    FROM orders o
    JOIN users u ON o.employeeId = u.id
    WHERE 1=1
  `;
  
  const params = [];
  
  if (status) {
    query += ' AND o.status = ?';
    params.push(status);
  }
  
  if (date) {
    query += ' AND DATE(o.createdAt) = ?';
    params.push(date);
  }
  
  if (employee && req.user.role === 'admin') {
    query += ' AND o.employeeId = ?';
    params.push(employee);
  } else if (req.user.role === 'employee') {
    query += ' AND o.employeeId = ?';
    params.push(req.user.id);
  }
  
  query += ' ORDER BY o.createdAt DESC LIMIT ?';
  params.push(parseInt(limit));

  database.getConnection().all(query, params, (err, orders) => {
    if (err) {
      return res.status(500).json({ message: 'Database error' });
    }
    res.json(orders);
  });
});

// Get order by ID with items
router.get('/:id', employeeOrAdmin, (req, res) => {
  const orderId = req.params.id;

  database.getConnection().get(
    `SELECT o.*, u.firstName, u.lastName, u.username
     FROM orders o
     JOIN users u ON o.employeeId = u.id
     WHERE o.id = ?`,
    [orderId],
    (err, order) => {
      if (err) {
        return res.status(500).json({ message: 'Database error' });
      }

      if (!order) {
        return res.status(404).json({ message: 'Order not found' });
      }

      // Get order items
      database.getConnection().all(
        `SELECT oi.*, mi.name, mi.description, mi.image
         FROM order_items oi
         JOIN menu_items mi ON oi.menuItemId = mi.id
         WHERE oi.orderId = ?`,
        [orderId],
        (err, items) => {
          if (err) {
            return res.status(500).json({ message: 'Database error' });
          }

          order.items = items;
          res.json(order);
        }
      );
    }
  );
});

// Create new order
router.post('/', employeeOrAdmin, (req, res) => {
  const {
    customerName,
    customerPhone,
    orderType,
    tableNumber,
    items,
    paymentMethod,
    notes,
    discount = 0
  } = req.body;

  if (!items || items.length === 0) {
    return res.status(400).json({ message: 'Order must contain at least one item' });
  }

  if (!orderType || !paymentMethod) {
    return res.status(400).json({ message: 'Order type and payment method are required' });
  }

  // Calculate totals
  let subtotal = 0;
  items.forEach(item => {
    subtotal += item.unitPrice * item.quantity;
  });

  const tax = subtotal * 0.1; // 10% tax
  const total = subtotal + tax - discount;

  // Insert a row with a temporary unique placeholder for orderNumber, then
  // update it to use the DB-generated id so order numbers are sequential
  // and restartable when sqlite_sequence is reset.
  const tempOrderNumber = `TMP${Date.now().toString().slice(-9)}${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;

  database.getConnection().run(
    `INSERT INTO orders 
     (orderNumber, employeeId, customerName, customerPhone, orderType, tableNumber, 
      subtotal, tax, discount, total, paymentMethod, notes) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [tempOrderNumber, req.user.id, customerName, customerPhone, orderType, tableNumber,
     subtotal, tax, discount, total, paymentMethod, notes],
    function(err) {
      if (err) {
        return res.status(500).json({ message: 'Error creating order' });
      }

      const orderId = this.lastID;
      // Use DB id for orderNumber so we can reset sequences and start at 1
      const orderNumber = `ORD${String(orderId).padStart(3, '0')}`;

      database.getConnection().run(
        'UPDATE orders SET orderNumber = ? WHERE id = ?',
        [orderNumber, orderId],
        function(updateErr) {
          if (updateErr) {
            console.error('Failed to update orderNumber for order', orderId, updateErr);
            // proceed but warn
          }

          // Insert order items
          const itemPromises = items.map(item => {
            return new Promise((resolve, reject) => {
              database.getConnection().run(
                'INSERT INTO order_items (orderId, menuItemId, quantity, unitPrice, totalPrice, specialInstructions) VALUES (?, ?, ?, ?, ?, ?)',
                [orderId, item.menuItemId, item.quantity, item.unitPrice, item.unitPrice * item.quantity, item.specialInstructions],
                (err) => {
                  if (err) reject(err);
                  else resolve();
                }
              );
            });
          });

          Promise.all(itemPromises)
            .then(() => {
              // Log activity
              database.getConnection().run(
                'INSERT INTO activity_logs (userId, action, details, ipAddress) VALUES (?, ?, ?, ?)',
                [req.user.id, 'CREATE_ORDER', `Created order: ${orderNumber}`, req.ip]
              );

              // Emit socket event for real-time updates
              if (req.io) {
                req.io.emit('new_order', {
                  id: orderId,
                  orderNumber,
                  status: 'pending',
                  total,
                  customerName,
                  orderType,
                  tableNumber,
                  createdAt: new Date().toISOString()
                });
              }

              res.status(201).json({
                id: orderId,
                orderNumber,
                total,
                status: 'pending'
              });
            })
            .catch(err => {
              res.status(500).json({ message: 'Error creating order items' });
            });
        }
      );
    }
  );
});

// Update order status
router.patch('/:id/status', employeeOrAdmin, (req, res) => {
  const orderId = req.params.id;
  const { status } = req.body;

  const validStatuses = ['pending', 'preparing', 'ready', 'served', 'cancelled'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ message: 'Invalid status' });
  }

  const completedAt = ['served', 'cancelled'].includes(status) ? new Date().toISOString() : null;

  database.getConnection().run(
    'UPDATE orders SET status = ?, completedAt = ? WHERE id = ?',
    [status, completedAt, orderId],
    function(err) {
      if (err) {
        return res.status(500).json({ message: 'Error updating order status' });
      }

      if (this.changes === 0) {
        return res.status(404).json({ message: 'Order not found' });
      }

      // Log activity
      database.getConnection().run(
        'INSERT INTO activity_logs (userId, action, details, ipAddress) VALUES (?, ?, ?, ?)',
        [req.user.id, 'UPDATE_ORDER_STATUS', `Changed order ${orderId} status to ${status}`, req.ip]
      );

      // Emit socket event for real-time updates
      if (req.io) {
        req.io.emit('order_status_update', {
          orderId,
          status,
          completedAt
        });
      }

      res.json({ message: 'Order status updated successfully' });
    }
  );
});

// Update payment status
router.patch('/:id/payment', employeeOrAdmin, (req, res) => {
  const orderId = req.params.id;
  const { paymentStatus } = req.body;

  const validStatuses = ['pending', 'paid', 'refunded'];
  if (!validStatuses.includes(paymentStatus)) {
    return res.status(400).json({ message: 'Invalid payment status' });
  }

  database.getConnection().run(
    'UPDATE orders SET paymentStatus = ? WHERE id = ?',
    [paymentStatus, orderId],
    function(err) {
      if (err) {
        return res.status(500).json({ message: 'Error updating payment status' });
      }

      if (this.changes === 0) {
        return res.status(404).json({ message: 'Order not found' });
      }

      // Log activity
      database.getConnection().run(
        'INSERT INTO activity_logs (userId, action, details, ipAddress) VALUES (?, ?, ?, ?)',
        [req.user.id, 'UPDATE_PAYMENT_STATUS', `Changed order ${orderId} payment status to ${paymentStatus}`, req.ip]
      );

      res.json({ message: 'Payment status updated successfully' });
    }
  );
});

// Get active orders (pending, preparing, ready)
router.get('/active/all', employeeOrAdmin, (req, res) => {
  database.getConnection().all(
    `SELECT o.*, u.firstName, u.lastName,
            GROUP_CONCAT(mi.name, ' x' || oi.quantity) as items
     FROM orders o
     JOIN users u ON o.employeeId = u.id
     JOIN order_items oi ON o.id = oi.orderId
     JOIN menu_items mi ON oi.menuItemId = mi.id
     WHERE o.status IN ('pending', 'preparing', 'ready')
     GROUP BY o.id
     ORDER BY o.createdAt ASC`,
    (err, orders) => {
      if (err) {
        return res.status(500).json({ message: 'Database error' });
      }
      res.json(orders);
    }
  );
});

// Get today's orders summary (using Asia/Manila local date)
router.get('/summary/today', employeeOrAdmin, (req, res) => {
  try {
    // Compute Manila local date (UTC+8) to align with client-side Manila dateOnly
    const now = new Date();
    const manilaOffsetMs = 8 * 60 * 60 * 1000; // UTC+8
    const manila = new Date(now.getTime() + manilaOffsetMs);
    const yyyy = manila.getUTCFullYear();
    const mm = String(manila.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(manila.getUTCDate()).padStart(2, '0');
    const today = `${yyyy}-${mm}-${dd}`;

    database.getConnection().all(
      `SELECT 
         status,
         COUNT(*) as count,
         SUM(total) as totalAmount
       FROM orders 
       WHERE DATE(createdAt) = ?
       GROUP BY status`,
      [today],
      (err, summary) => {
        if (err) {
          return res.status(500).json({ message: 'Database error' });
        }

        // Get total statistics
        database.getConnection().get(
          `SELECT 
             COUNT(*) as totalOrders,
             SUM(total) as totalRevenue,
             AVG(total) as averageOrder
           FROM orders 
           WHERE DATE(createdAt) = ?`,
          [today],
          (err, totals) => {
            if (err) {
              return res.status(500).json({ message: 'Database error' });
            }

            res.json({
              summary,
              totals: {
                totalOrders: totals.totalOrders || 0,
                totalRevenue: totals.totalRevenue || 0,
                averageOrder: totals.averageOrder || 0
              }
            });
          }
        );
      }
    );
  } catch (e) {
    console.error('Error computing Manila today summary:', e);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get income analysis (gross daily, monthly, and net income)
router.get('/income/analysis', employeeOrAdmin, (req, res) => {
  try {
    // Compute Manila local date (UTC+8)
    const now = new Date();
    const manilaOffsetMs = 8 * 60 * 60 * 1000; // UTC+8
    const manila = new Date(now.getTime() + manilaOffsetMs);
    const yyyy = manila.getUTCFullYear();
    const mm = String(manila.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(manila.getUTCDate()).padStart(2, '0');
    const today = `${yyyy}-${mm}-${dd}`;
    
    // Get first day of current month
    const monthStart = `${yyyy}-${mm}-01`;

    // Query for daily income with cost calculation
    const dailyQuery = `
      SELECT 
        SUM(o.total) as grossDaily,
        SUM(
          CASE 
            WHEN oi.quantity > 0 AND mi.costOfGoods > 0 
            THEN (oi.quantity * mi.costOfGoods)
            ELSE 0 
          END
        ) as totalCostDaily
      FROM orders o
      JOIN order_items oi ON o.id = oi.orderId
      JOIN menu_items mi ON oi.menuItemId = mi.id
      WHERE DATE(o.createdAt) = ? 
        AND o.status IN ('served', 'completed')
    `;

    // Query for monthly income with cost calculation
    const monthlyQuery = `
      SELECT 
        SUM(o.total) as grossMonthly,
        SUM(
          CASE 
            WHEN oi.quantity > 0 AND mi.costOfGoods > 0 
            THEN (oi.quantity * mi.costOfGoods)
            ELSE 0 
          END
        ) as totalCostMonthly
      FROM orders o
      JOIN order_items oi ON o.id = oi.orderId
      JOIN menu_items mi ON oi.menuItemId = mi.id
      WHERE DATE(o.createdAt) >= ? 
        AND DATE(o.createdAt) <= ?
        AND o.status IN ('served', 'completed')
    `;

    // Execute daily query
    database.getConnection().get(dailyQuery, [today], (err, dailyResult) => {
      if (err) {
        console.error('Error calculating daily income:', err);
        return res.status(500).json({ message: 'Error calculating daily income' });
      }

      // Execute monthly query
      database.getConnection().get(monthlyQuery, [monthStart, today], (err, monthlyResult) => {
        if (err) {
          console.error('Error calculating monthly income:', err);
          return res.status(500).json({ message: 'Error calculating monthly income' });
        }

        const grossDaily = parseFloat(dailyResult?.grossDaily || 0);
        const totalCostDaily = parseFloat(dailyResult?.totalCostDaily || 0);
        const netDaily = grossDaily - totalCostDaily;

        const grossMonthly = parseFloat(monthlyResult?.grossMonthly || 0);
        const totalCostMonthly = parseFloat(monthlyResult?.totalCostMonthly || 0);
        const netMonthly = grossMonthly - totalCostMonthly;

        res.json({
          daily: {
            gross: grossDaily,
            cost: totalCostDaily,
            net: netDaily,
            profitMargin: grossDaily > 0 ? ((netDaily / grossDaily) * 100) : 0
          },
          monthly: {
            gross: grossMonthly,
            cost: totalCostMonthly,
            net: netMonthly,
            profitMargin: grossMonthly > 0 ? ((netMonthly / grossMonthly) * 100) : 0
          },
          date: today,
          month: `${yyyy}-${mm}`
        });
      });
    });

  } catch (error) {
    console.error('Error in income analysis:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get detailed order profitability breakdown
router.get('/income/breakdown', employeeOrAdmin, (req, res) => {
  const { date, orderId } = req.query;
  
  let whereClause = "WHERE o.status IN ('served', 'completed')";
  let params = [];
  
  if (date) {
    whereClause += " AND DATE(o.createdAt) = ?";
    params.push(date);
  }
  
  if (orderId) {
    whereClause += " AND o.id = ?";
    params.push(orderId);
  }

  const query = `
    SELECT 
      o.id as orderId,
      o.orderNumber,
      o.total as orderTotal,
      o.createdAt,
      o.customerName,
      oi.quantity,
      oi.unitPrice,
      oi.totalPrice,
      mi.name as itemName,
      mi.costOfGoods,
      (oi.quantity * mi.costOfGoods) as itemCost,
      (oi.totalPrice - (oi.quantity * mi.costOfGoods)) as itemProfit,
      CASE 
        WHEN oi.totalPrice > 0 
        THEN ((oi.totalPrice - (oi.quantity * mi.costOfGoods)) / oi.totalPrice * 100)
        ELSE 0 
      END as itemProfitMargin
    FROM orders o
    JOIN order_items oi ON o.id = oi.orderId
    JOIN menu_items mi ON oi.menuItemId = mi.id
    ${whereClause}
    ORDER BY o.createdAt DESC, o.id, mi.name
  `;

  database.getConnection().all(query, params, (err, results) => {
    if (err) {
      console.error('Error getting profit breakdown:', err);
      return res.status(500).json({ message: 'Error calculating profit breakdown' });
    }

    // Group by order
    const orderBreakdown = {};
    results.forEach(row => {
      if (!orderBreakdown[row.orderId]) {
        orderBreakdown[row.orderId] = {
          orderId: row.orderId,
          orderNumber: row.orderNumber,
          orderTotal: parseFloat(row.orderTotal),
          customerName: row.customerName,
          createdAt: row.createdAt,
          items: [],
          totalCost: 0,
          totalProfit: 0
        };
      }
      
      const itemCost = parseFloat(row.itemCost || 0);
      const itemProfit = parseFloat(row.itemProfit || 0);
      
      orderBreakdown[row.orderId].items.push({
        name: row.itemName,
        quantity: row.quantity,
        unitPrice: parseFloat(row.unitPrice),
        totalPrice: parseFloat(row.totalPrice),
        costOfGoods: parseFloat(row.costOfGoods || 0),
        itemCost: itemCost,
        itemProfit: itemProfit,
        profitMargin: parseFloat(row.itemProfitMargin || 0)
      });
      
      orderBreakdown[row.orderId].totalCost += itemCost;
      orderBreakdown[row.orderId].totalProfit += itemProfit;
    });

    // Calculate profit margins for each order
    Object.values(orderBreakdown).forEach(order => {
      order.profitMargin = order.orderTotal > 0 ? 
        ((order.totalProfit / order.orderTotal) * 100) : 0;
    });

    res.json(Object.values(orderBreakdown));
  });
});

module.exports = router;
