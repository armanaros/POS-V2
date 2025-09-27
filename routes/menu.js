const express = require('express');
const database = require('../config/database');
const { adminOnly, employeeOrAdmin, managerOrAdmin } = require('../middleware/auth');

const router = express.Router();

// Get all menu categories with items
router.get('/categories', employeeOrAdmin, (req, res) => {
  database.getConnection().all(
    `SELECT mc.*, 
            COUNT(mi.id) as itemCount,
            SUM(CASE WHEN mi.isAvailable = 1 THEN 1 ELSE 0 END) as availableCount
     FROM menu_categories mc
     LEFT JOIN menu_items mi ON mc.id = mi.categoryId AND mi.isActive = 1
     WHERE mc.isActive = 1
     GROUP BY mc.id
     ORDER BY mc.sortOrder, mc.name`,
    (err, categories) => {
      if (err) {
        return res.status(500).json({ message: 'Database error' });
      }
      res.json(categories);
    }
  );
});

// Get menu items by category
router.get('/categories/:categoryId/items', employeeOrAdmin, (req, res) => {
  const categoryId = req.params.categoryId;
  
  database.getConnection().all(
    `SELECT * FROM menu_items 
     WHERE categoryId = ? AND isActive = 1 
     ORDER BY sortOrder, name`,
    [categoryId],
    (err, items) => {
      if (err) {
        return res.status(500).json({ message: 'Database error' });
      }
      res.json(items);
    }
  );
});

// Get full menu with categories and items
router.get('/full', employeeOrAdmin, (req, res) => {
  database.getConnection().all(
    `SELECT 
       mc.id as categoryId, mc.name as categoryName, mc.description as categoryDescription,
       mi.id as itemId, mi.name as itemName, mi.description as itemDescription,
       mi.price, mi.costOfGoods, mi.image, mi.isAvailable, mi.preparationTime, mi.ingredients, mi.allergens, mi.calories
     FROM menu_categories mc
     LEFT JOIN menu_items mi ON mc.id = mi.categoryId AND mi.isActive = 1
     WHERE mc.isActive = 1
     ORDER BY mc.sortOrder, mc.name, mi.sortOrder, mi.name`,
    (err, results) => {
      if (err) {
        return res.status(500).json({ message: 'Database error' });
      }

      // Group items by category
      const menu = {};
      results.forEach(row => {
        if (!menu[row.categoryId]) {
          menu[row.categoryId] = {
            id: row.categoryId,
            name: row.categoryName,
            description: row.categoryDescription,
            items: []
          };
        }

        if (row.itemId) {
          menu[row.categoryId].items.push({
            id: row.itemId,
            name: row.itemName,
            description: row.itemDescription,
            price: row.price,
            costOfGoods: row.costOfGoods || 0,
            image: row.image,
            isAvailable: row.isAvailable,
            preparationTime: row.preparationTime,
            ingredients: row.ingredients,
            allergens: row.allergens,
            calories: row.calories
          });
        }
      });

      res.json(Object.values(menu));
    }
  );
});

// Create new category (admin only)
router.post('/categories', adminOnly, (req, res) => {
  const { name, description, sortOrder } = req.body;

  if (!name) {
    return res.status(400).json({ message: 'Category name is required' });
  }

  database.getConnection().run(
    'INSERT INTO menu_categories (name, description, sortOrder) VALUES (?, ?, ?)',
    [name, description, sortOrder || 0],
    function(err) {
      if (err) {
        return res.status(500).json({ message: 'Error creating category' });
      }

      // Log activity
      database.getConnection().run(
        'INSERT INTO activity_logs (userId, action, details, ipAddress) VALUES (?, ?, ?, ?)',
        [req.user.id, 'CREATE_CATEGORY', `Created category: ${name}`, req.ip]
      );

      res.status(201).json({
        id: this.lastID,
        name,
        description,
        sortOrder: sortOrder || 0
      });
    }
  );
});

// Create new menu item (admin only)
router.post('/items', adminOnly, (req, res) => {
  const {
    categoryId, name, description, price, costOfGoods, image, preparationTime,
    ingredients, allergens, calories, sortOrder
  } = req.body;

  if (!categoryId || !name || !price) {
    return res.status(400).json({ message: 'Category ID, name, and price are required' });
  }

  database.getConnection().run(
    `INSERT INTO menu_items 
     (categoryId, name, description, price, costOfGoods, image, preparationTime, ingredients, allergens, calories, sortOrder) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [categoryId, name, description, price, costOfGoods || 0, image, preparationTime || 15, ingredients, allergens, calories, sortOrder || 0],
    function(err) {
      if (err) {
        return res.status(500).json({ message: 'Error creating menu item' });
      }

      // Log activity
      database.getConnection().run(
        'INSERT INTO activity_logs (userId, action, details, ipAddress) VALUES (?, ?, ?, ?)',
        [req.user.id, 'CREATE_MENU_ITEM', `Created menu item: ${name}`, req.ip]
      );

      const newMenuItem = {
        id: this.lastID,
        categoryId,
        name,
        description,
        price,
        image,
        preparationTime: preparationTime || 15,
        ingredients,
        allergens,
        calories,
        sortOrder: sortOrder || 0,
        isAvailable: true,
        isActive: true
      };

      // Emit socket event for real-time updates
      if (req.io) {
        req.io.emit('menu_item_added', newMenuItem);
      }

      res.status(201).json(newMenuItem);
    }
  );
});

// Update category (admin only)
router.put('/categories/:id', adminOnly, (req, res) => {
  const categoryId = req.params.id;
  const { name, description, sortOrder, isActive } = req.body;

  database.getConnection().run(
    'UPDATE menu_categories SET name = ?, description = ?, sortOrder = ?, isActive = ? WHERE id = ?',
    [name, description, sortOrder, isActive, categoryId],
    function(err) {
      if (err) {
        return res.status(500).json({ message: 'Error updating category' });
      }

      if (this.changes === 0) {
        return res.status(404).json({ message: 'Category not found' });
      }

      // Log activity
      database.getConnection().run(
        'INSERT INTO activity_logs (userId, action, details, ipAddress) VALUES (?, ?, ?, ?)',
        [req.user.id, 'UPDATE_CATEGORY', `Updated category ID: ${categoryId}`, req.ip]
      );

      res.json({ message: 'Category updated successfully' });
    }
  );
});

// Update menu item (admin only)
router.put('/items/:id', adminOnly, (req, res) => {
  const itemId = req.params.id;
  const {
    categoryId, name, description, price, costOfGoods, image, isAvailable, preparationTime,
    ingredients, allergens, calories, sortOrder, isActive
  } = req.body;

  database.getConnection().run(
    `UPDATE menu_items SET 
     categoryId = ?, name = ?, description = ?, price = ?, costOfGoods = ?, image = ?, 
     isAvailable = ?, preparationTime = ?, ingredients = ?, allergens = ?, 
     calories = ?, sortOrder = ?, isActive = ?
     WHERE id = ?`,
    [categoryId, name, description, price, costOfGoods || 0, image, isAvailable, preparationTime, 
     ingredients, allergens, calories, sortOrder, isActive, itemId],
    function(err) {
      if (err) {
        return res.status(500).json({ message: 'Error updating menu item' });
      }

      if (this.changes === 0) {
        return res.status(404).json({ message: 'Menu item not found' });
      }

      // Log activity
      database.getConnection().run(
        'INSERT INTO activity_logs (userId, action, details, ipAddress) VALUES (?, ?, ?, ?)',
        [req.user.id, 'UPDATE_MENU_ITEM', `Updated menu item ID: ${itemId}`, req.ip]
      );

      const updatedMenuItem = {
        id: itemId,
        categoryId,
        name,
        description,
        price,
        image,
        isAvailable,
        preparationTime,
        ingredients,
        allergens,
        calories,
        sortOrder,
        isActive
      };

      // Emit socket event for real-time updates
      if (req.io) {
        req.io.emit('menu_item_updated', updatedMenuItem);
      }

      res.json({ message: 'Menu item updated successfully' });
    }
  );
});

// Toggle item availability (admin and employees)
router.patch('/items/:id/availability', employeeOrAdmin, (req, res) => {
  const itemId = req.params.id;
  const { isAvailable } = req.body;

  database.getConnection().run(
    'UPDATE menu_items SET isAvailable = ? WHERE id = ?',
    [isAvailable, itemId],
    function(err) {
      if (err) {
        return res.status(500).json({ message: 'Error updating availability' });
      }

      if (this.changes === 0) {
        return res.status(404).json({ message: 'Menu item not found' });
      }

      // Log activity
      database.getConnection().run(
        'INSERT INTO activity_logs (userId, action, details, ipAddress) VALUES (?, ?, ?, ?)',
        [req.user.id, 'UPDATE_AVAILABILITY', `Changed availability for item ID: ${itemId}`, req.ip]
      );

      // Emit socket event for real-time updates
      if (req.io) {
        req.io.emit('menu_item_updated', {
          id: itemId,
          isAvailable
        });
      }

      res.json({ message: 'Availability updated successfully' });
    }
  );
});

// Delete category (admin only)
router.delete('/categories/:id', adminOnly, (req, res) => {
  const categoryId = req.params.id;

  // Check if category has items
  database.getConnection().get(
    'SELECT COUNT(*) as count FROM menu_items WHERE categoryId = ? AND isActive = 1',
    [categoryId],
    (err, result) => {
      if (err) {
        return res.status(500).json({ message: 'Database error' });
      }

      if (result.count > 0) {
        return res.status(400).json({ message: 'Cannot delete category with active items' });
      }

      database.getConnection().run(
        'UPDATE menu_categories SET isActive = 0 WHERE id = ?',
        [categoryId],
        function(err) {
          if (err) {
            return res.status(500).json({ message: 'Error deleting category' });
          }

          if (this.changes === 0) {
            return res.status(404).json({ message: 'Category not found' });
          }

          // Log activity
          database.getConnection().run(
            'INSERT INTO activity_logs (userId, action, details, ipAddress) VALUES (?, ?, ?, ?)',
            [req.user.id, 'DELETE_CATEGORY', `Deleted category ID: ${categoryId}`, req.ip]
          );

          res.json({ message: 'Category deleted successfully' });
        }
      );
    }
  );
});

// Delete menu item (admin only)
router.delete('/items/:id', adminOnly, (req, res) => {
  const itemId = req.params.id;

  database.getConnection().run(
    'UPDATE menu_items SET isActive = 0 WHERE id = ?',
    [itemId],
    function(err) {
      if (err) {
        return res.status(500).json({ message: 'Error deleting menu item' });
      }

      if (this.changes === 0) {
        return res.status(404).json({ message: 'Menu item not found' });
      }

      // Log activity
      database.getConnection().run(
        'INSERT INTO activity_logs (userId, action, details, ipAddress) VALUES (?, ?, ?, ?)',
        [req.user.id, 'DELETE_MENU_ITEM', `Deleted menu item ID: ${itemId}`, req.ip]
      );

      // Emit socket event for real-time updates
      if (req.io) {
        req.io.emit('menu_item_deleted', itemId);
      }

      res.json({ message: 'Menu item deleted successfully' });
    }
  );
});

module.exports = router;
