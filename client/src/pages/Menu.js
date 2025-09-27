import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Grid,
  Card,
  CardContent,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  IconButton,
  Box,
  Tabs,
  Tab,
  FormControlLabel,
  Switch,
  Fab,
  
  Badge,
  Avatar,
  AppBar,
  Toolbar,
} from '@mui/material';
import {
  Add,
  Edit,
  Delete,
  Visibility,
  Restaurant,
  Category,
  AttachMoney,
  Schedule,
  Image,
  Remove,
  ShoppingCart,
  ToggleOn,
  ToggleOff,
  ArrowBack,
} from '@mui/icons-material';

import Layout from '../components/Layout';
import { MenuService } from '../services/firebaseServices';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import toast from 'react-hot-toast';

const Menu = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [categories, setCategories] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [fullMenu, setFullMenu] = useState([]);
  // Raw sources from real-time listeners. We keep raw arrays separate from
  // the derived `categories` state to avoid re-processing loops when we
  // enrich categories with stats.
  const [rawCategories, setRawCategories] = useState([]);
  const [rawMenuItems, setRawMenuItems] = useState([]);
  const [activeTab, setActiveTab] = useState(0);
  const [openCategoryDialog, setOpenCategoryDialog] = useState(false);
  const [openItemDialog, setOpenItemDialog] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  const [loading, setLoading] = useState(false);
  
  // Edit mode state
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingOrderData, setEditingOrderData] = useState(null);
  const [editCart, setEditCart] = useState([]);
  
  const { user, canManageMenu } = useAuth();
  const { menuItems: socketMenuItems, updateLocalMenuItems, notifications, isProcessing } = useSocket();

  // Category form state
  const [categoryForm, setCategoryForm] = useState({
    name: '',
    description: '',
    sortOrder: 0,
    isActive: true,
  });

  // Item form state
  const [itemForm, setItemForm] = useState({
    categoryId: '',
    name: '',
    description: '',
    price: '',
    preparationTime: 15,
    ingredients: '',
    allergens: '',
    calories: '',
    image: '',
    isAvailable: true,
    isActive: true,
    sortOrder: 0,
  // Inventory & cost fields
  stockLevel: 0,
  lowStockThreshold: 5,
  costOfGoods: ''
  });

  useEffect(() => {
    // Initial data load
    const initializeData = async () => {
      setLoading(true);
      await fetchMenuData();
      setLoading(false);
    };
    
    initializeData();

    // Set up real-time listeners
    let unsubscribeCategories = null;
    let unsubscribeItems = null;

    // When real-time updates arrive we store the raw arrays into state.
    // Derived values (categoriesWithStats, fullMenu) will be computed in a separate effect
    // so we always use the latest state and avoid stale closures.

    unsubscribeCategories = MenuService.subscribeToCategoriesChanges((realTimeCategories) => {
      if (isProcessing) {
        console.log('Ignoring real-time categories update because an order is being processed');
        return;
      }
      console.log('Real-time categories update (raw):', realTimeCategories);
      // Store the incoming raw categories in a separate state variable.
      setRawCategories(realTimeCategories || []);
    });

    unsubscribeItems = MenuService.subscribeToItemsChanges((realTimeItems) => {
      if (isProcessing) {
        console.log('Ignoring real-time items update because an order is being processed');
        return;
      }
      console.log('Real-time menu items update (raw):', realTimeItems);
      // Store the incoming raw items in a separate state variable.
      setRawMenuItems(realTimeItems || []);
    });

    // Cleanup function
    return () => {
      if (unsubscribeCategories) unsubscribeCategories();
      if (unsubscribeItems) unsubscribeItems();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Compute derived state (categories with stats and fullMenu) whenever raw categories or items change
  useEffect(() => {
    // Compute derived state from raw sources. This ensures we always use the
    // freshest arrays and avoids stomping over the raw data used by listeners.
    const categorySource = rawCategories || [];
    const itemSource = rawMenuItems || [];

    const categoriesWithStats = categorySource.map(category => {
      const categoryItems = (itemSource || []).filter(item => item.categoryId === category.id);
      const availableItems = categoryItems.filter(item => item.isAvailable);

      return {
        ...category,
        itemCount: categoryItems.length,
        availableCount: availableItems.length,
        items: categoryItems
      };
    });

    const fullMenuData = categorySource.map(category => ({
      ...category,
      items: (itemSource || []).filter(item => item.categoryId === category.id)
    }));

    console.log('Real-time menu data update (derived):', { categoriesWithStats, fullMenuData, itemSource });
    setCategories(categoriesWithStats);
    setFullMenu(fullMenuData);
    setMenuItems(itemSource || []);
  }, [rawCategories, rawMenuItems]);

  // Debug: Log categories state
  useEffect(() => {
    console.log('Categories state updated:', categories);
  }, [categories]);

  // Update menu items from socket data
  useEffect(() => {
    if (socketMenuItems.length > 0) {
      setMenuItems(socketMenuItems);
      updateLocalMenuItems(socketMenuItems);
    }
  }, [socketMenuItems, updateLocalMenuItems]);

  // Show notifications for menu updates (notifications is empty with current Socket implementation)
  useEffect(() => {
    notifications.forEach(notification => {
      if (notification.type === 'menu_update') {
        toast(notification.message);
        // Real-time listeners will handle menu updates automatically
      }
    });
  }, [notifications]);

  // Check for edit mode and load editing order data
  useEffect(() => {
    const mode = searchParams.get('mode');
    if (mode === 'edit') {
      const editData = localStorage.getItem('ptown:editingOrder');
      if (editData) {
        try {
          const orderData = JSON.parse(editData);
          setIsEditMode(true);
          setEditingOrderData(orderData);
          setEditCart(orderData.currentItems || []);
          toast.success(`Editing Order #${orderData.orderNumber}`);
        } catch (error) {
          console.error('Error parsing edit data:', error);
          toast.error('Error loading order for editing');
          navigate('/menu');
        }
      } else {
        toast.error('No order data found for editing');
        navigate('/menu');
      }
    } else {
      setIsEditMode(false);
      setEditingOrderData(null);
      setEditCart([]);
    }
  }, [searchParams, navigate]);

  const fetchMenuData = async () => {
    try {
      // If an order is currently being processed, skip fetching/updating the menu
      if (isProcessing) {
        console.log('Skipping menu fetch because an order is being processed');
        return;
      }
      setLoading(true);
      console.log('Fetching menu data...');
      const [categoriesData, fullMenuData] = await Promise.all([
        MenuService.getCategories(),
        MenuService.getFullMenu()
      ]);
      console.log('Categories loaded:', categoriesData);
      console.log('Full menu loaded:', fullMenuData);
      
      // Calculate category statistics from fullMenuData
      const categoriesWithStats = categoriesData.map(category => {
        const categoryItems = fullMenuData.find(menuCat => menuCat.id === category.id)?.items || [];
        const availableItems = categoryItems.filter(item => item.isAvailable);
        
        return {
          ...category,
          itemCount: categoryItems.length,
          availableCount: availableItems.length,
          items: categoryItems
        };
      });
      
      setCategories(categoriesWithStats);
      setFullMenu(fullMenuData);
      
      // Update socket context with fresh data
      const allItems = fullMenuData.flatMap(category => 
        category.items || []
      );
      updateLocalMenuItems(allItems);
    } catch (error) {
      console.error('Error fetching menu data:', error);
      toast.error('Failed to load menu data');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCategory = async () => {
    try {
      setLoading(true);
      if (editingCategory) {
        await MenuService.updateCategory(editingCategory.id, categoryForm);
        toast.success('Category updated successfully!');
      } else {
        await MenuService.createCategory(categoryForm);
        toast.success('Category created successfully!');
      }
      setOpenCategoryDialog(false);
      resetCategoryForm();
      // Real-time listener will handle the update automatically
    } catch (error) {
      console.error('Error saving category:', error);
      toast.error('Failed to save category');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateItem = async () => {
    try {
      setLoading(true);
      const payload = {
        ...itemForm,
        categoryId: String(itemForm.categoryId || ''),
        price: itemForm.price !== '' ? parseFloat(itemForm.price) : 0,
        preparationTime: Number(itemForm.preparationTime) || 0,
        sortOrder: Number(itemForm.sortOrder) || 0
  ,
  stockLevel: Number(itemForm.stockLevel || 0),
  lowStockThreshold: Number(itemForm.lowStockThreshold || 5),
  costOfGoods: Number(itemForm.costOfGoods || 0)
      };

      if (editingItem) {
        await MenuService.updateItem(editingItem.id, payload);
        toast.success('Item updated successfully!');
      } else {
        await MenuService.createItem(payload);
        toast.success('Item created successfully!');
      }
      setOpenItemDialog(false);
      resetItemForm();
      // Real-time listener will handle the update automatically
    } catch (error) {
      console.error('Error saving item:', error);
      toast.error('Failed to save item');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleAvailability = async (itemId, isAvailable) => {
    try {
      await MenuService.updateItem(itemId, { isAvailable: !isAvailable });
      toast.success('Item availability updated!');
      // Real-time listener will handle the update automatically
    } catch (error) {
      console.error('Error updating availability:', error);
      toast.error('Failed to update availability');
    }
  };

  const handleDeleteCategory = async (categoryId) => {
    if (window.confirm('Are you sure you want to delete this category?')) {
      try {
        await MenuService.deleteCategory(categoryId);
        toast.success('Category deleted successfully!');
        // Real-time listener will handle the update automatically
      } catch (error) {
        console.error('Error deleting category:', error);
        toast.error('Failed to delete category');
      }
    }
  };

  const handleDeleteItem = async (itemId) => {
    if (window.confirm('Are you sure you want to delete this item?')) {
      try {
        await MenuService.deleteItem(itemId);
        toast.success('Item deleted successfully!');
        // Real-time listener will handle the update automatically
      } catch (error) {
        console.error('Error deleting item:', error);
        toast.error('Failed to delete item');
      }
    }
  };

  const resetCategoryForm = () => {
    setCategoryForm({
      name: '',
      description: '',
      sortOrder: 0,
      isActive: true,
    });
    setEditingCategory(null);
  };

  const resetItemForm = () => {
    setItemForm({
      categoryId: '',
      name: '',
      description: '',
      price: '',
      preparationTime: 15,
      ingredients: '',
      allergens: '',
      calories: '',
      image: '',
      isAvailable: true,
      isActive: true,
      sortOrder: 0,
  stockLevel: 0,
  lowStockThreshold: 5,
  costOfGoods: ''
    });
    setEditingItem(null);
  };

  const openEditCategory = (category) => {
    setCategoryForm({
      name: category.name,
      description: category.description || '',
      sortOrder: category.sortOrder || 0,
      isActive: category.isActive,
    });
    setEditingCategory(category);
    setOpenCategoryDialog(true);
  };

  const handleAddItem = async () => {
    console.log('Opening add item dialog. Categories available:', categories.length);
    
    // Check if categories are available
    if (categories.length === 0) {
      alert('Please create at least one category before adding items.');
      return;
    }
    
    // Reset form for new item
    setItemForm({
      categoryId: '',
      name: '',
      description: '',
      price: '',
      preparationTime: 15,
      ingredients: '',
      allergens: '',
      calories: '',
      image: '',
      isAvailable: true,
      isActive: true,
      sortOrder: 0,
    });
    setEditingItem(null);
    setOpenItemDialog(true);
  };

  const openEditItem = (item) => {
    setItemForm({
      categoryId: item.categoryId,
      name: item.name,
      description: item.description || '',
      price: item.price.toString(),
      preparationTime: item.preparationTime || 15,
      ingredients: item.ingredients || '',
      allergens: item.allergens || '',
      calories: item.calories || '',
      image: item.image || '',
      isAvailable: item.isAvailable,
      isActive: item.isActive,
      sortOrder: item.sortOrder || 0,
  stockLevel: item.stockLevel || 0,
  lowStockThreshold: item.lowStockThreshold || 5,
  costOfGoods: item.costOfGoods || ''
    });
    setEditingItem(item);
    setOpenItemDialog(true);
  };

  // Edit mode functions
  const handleAddToEditCart = (item) => {
    const existingItem = editCart.find(cartItem => cartItem.id === item.id);
    
    if (existingItem) {
      setEditCart(prev => 
        prev.map(cartItem => 
          cartItem.id === item.id 
            ? { ...cartItem, quantity: cartItem.quantity + 1 }
            : cartItem
        )
      );
    } else {
      setEditCart(prev => [...prev, {
        id: item.id,
        menuItemId: item.id,
        name: item.name,
        price: item.price,
        quantity: 1
      }]);
    }
    toast.success(`Added ${item.name} to order`);
  };

  const handleRemoveFromEditCart = (itemId) => {
    setEditCart(prev => prev.filter(item => item.id !== itemId));
    toast.info('Item removed from order');
  };

  const handleUpdateEditCartQuantity = (itemId, newQuantity) => {
    if (newQuantity <= 0) {
      handleRemoveFromEditCart(itemId);
      return;
    }
    
    setEditCart(prev => 
      prev.map(item => 
        item.id === itemId 
          ? { ...item, quantity: newQuantity }
          : item
      )
    );
  };

  const handleSaveEditedOrder = async () => {
    if (!editingOrderData || editCart.length === 0) {
      toast.error('Please add items to the order');
      return;
    }

    try {
      setLoading(true);
      
      // Calculate new total
      const newTotal = editCart.reduce((total, item) => total + (item.price * item.quantity), 0);
      
      console.log('Updating order with data:', {
        orderId: editingOrderData.orderId,
        items: editCart,
        total: newTotal,
        updatedBy: user.id
      });
      
      // Import OrderService and update the order with optimistic concurrency
      const { OrderService } = await import('../services/firebaseServices');
      try {
        await OrderService.updateOrder(editingOrderData.orderId, {
          items: editCart,
          total: newTotal,
          updatedBy: user.id,
          // Provide the base version we loaded when starting the edit so the
          // service can detect concurrent modifications
          baseVersion: editingOrderData.version || 0
        });
      } catch (txErr) {
        // Detect version conflict and surface a helpful message
        if (txErr && txErr.code === 'VERSION_CONFLICT') {
          toast.error('This order was modified by someone else while you were editing. Reloading the latest order.');
          // Replace local edit state with freshest data
          try {
            const latest = await OrderService.getOrderById(editingOrderData.orderId);
            // If order has items, replace editCart and editingOrderData
            setEditCart(latest.items?.map(it => ({
              id: it.menuItemId || it.id,
              menuItemId: it.menuItemId || it.id,
              name: it.name,
              price: it.price || it.unitPrice || 0,
              quantity: it.quantity || 1
            })) || []);
            setEditingOrderData(prev => ({ ...prev, version: latest.version || 0 }));
          } catch (reloadErr) {
            console.error('Failed to reload latest order after conflict:', reloadErr);
          }
          setLoading(false);
          return;
        }
        throw txErr;
      }

      // Clear edit data and navigate back
      localStorage.removeItem('ptown:editingOrder');
      toast.success(`Order #${editingOrderData.orderNumber} updated successfully!`);
      navigate('/orders');
    } catch (error) {
      console.error('Error updating order:', error);
      toast.error(`Failed to update order: ${error.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelEdit = () => {
    localStorage.removeItem('ptown:editingOrder');
    navigate('/orders');
  };

  const calculateEditTotal = () => {
    return editCart.reduce((total, item) => total + (item.price * item.quantity), 0);
  };

  return (
    <Layout>
      {/* Edit Mode Header */}
      {isEditMode && editingOrderData && (
        <AppBar position="static" sx={{ mb: 3, bgcolor: 'warning.main' }}>
          <Toolbar>
            <IconButton
              edge="start"
              color="inherit"
              onClick={handleCancelEdit}
              sx={{ mr: 2 }}
            >
              <ArrowBack />
            </IconButton>
            <Box sx={{ flexGrow: 1 }}>
              <Typography variant="h6">
                Editing Order #{editingOrderData.orderNumber}
                {editingOrderData.customerName && ` - ${editingOrderData.customerName}`}
              </Typography>
              <Typography variant="caption" sx={{ opacity: 0.9 }}>
                Version: {editingOrderData.version || 0}
              </Typography>
            </Box>
            <Badge badgeContent={editCart.length} color="error">
              <ShoppingCart />
            </Badge>
            <Typography variant="h6" sx={{ ml: 2 }}>
              ₱{calculateEditTotal().toLocaleString('en-PH', { minimumFractionDigits: 2 })}
            </Typography>
            <Button
              color="inherit"
              variant="outlined"
              onClick={handleSaveEditedOrder}
              disabled={editCart.length === 0}
              sx={{ ml: 2 }}
            >
              Save Changes
            </Button>
            {/* Admin-only force save */}
            {user?.role === 'admin' && (
              <Button
                color="error"
                variant="contained"
                onClick={async () => {
                  setLoading(true);
                  try {
                    const { OrderService } = await import('../services/firebaseServices');
                    const newTotal = calculateEditTotal();
                    await OrderService.updateOrder(editingOrderData.orderId, {
                      items: editCart,
                      total: newTotal,
                      updatedBy: user.id,
                      force: true
                    });
                    localStorage.removeItem('ptown:editingOrder');
                    toast.success('Order force-saved successfully (override)');
                    navigate('/orders');
                  } catch (err) {
                    console.error('Force save failed:', err);
                    toast.error('Force save failed');
                  } finally {
                    setLoading(false);
                  }
                }}
                sx={{ ml: 2 }}
              >
                Force Save
              </Button>
            )}
          </Toolbar>
        </AppBar>
      )}

      {/* Current Items in Edit Mode */}
      {isEditMode && editCart.length > 0 && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>Current Order Items</Typography>
            <Grid container spacing={2}>
              {editCart.map((item, index) => (
                <Grid item xs={12} sm={6} md={4} key={index}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography variant="subtitle1">{item.name}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        ₱{item.price.toLocaleString('en-PH', { minimumFractionDigits: 2 })} each
                      </Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
                        <IconButton 
                          size="small"
                          onClick={() => handleUpdateEditCartQuantity(item.id, item.quantity - 1)}
                        >
                          <Remove />
                        </IconButton>
                        <Typography sx={{ mx: 2 }}>{item.quantity}</Typography>
                        <IconButton 
                          size="small"
                          onClick={() => handleUpdateEditCartQuantity(item.id, item.quantity + 1)}
                        >
                          <Add />
                        </IconButton>
                        <IconButton 
                          size="small"
                          color="error"
                          onClick={() => handleRemoveFromEditCart(item.id)}
                          sx={{ ml: 1 }}
                        >
                          <Delete />
                        </IconButton>
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </CardContent>
        </Card>
      )}
      <Box sx={{ 
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        borderRadius: 3,
        p: 4,
        mb: 4,
        color: 'white',
        position: 'relative',
        overflow: 'hidden'
      }}>
        <Box sx={{
          position: 'absolute',
          top: -50,
          right: -50,
          width: 100,
          height: 100,
          borderRadius: '50%',
          backgroundColor: 'rgba(255, 255, 255, 0.1)',
        }} />
        <Box sx={{
          position: 'absolute',
          bottom: -30,
          left: -30,
          width: 80,
          height: 80,
          borderRadius: '50%',
          backgroundColor: 'rgba(255, 255, 255, 0.05)',
        }} />
        
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', zIndex: 1 }}>
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 'bold', mb: 1 }}>
              Menu Management
            </Typography>
            <Typography variant="body1" sx={{ opacity: 0.9 }}>
              Manage your restaurant's menu categories and items
            </Typography>
          </Box>
          {canManageMenu() && (
            <Box sx={{ display: 'flex', gap: 2 }}>
              <Button
                variant="contained"
                startIcon={<Category />}
                onClick={() => setOpenCategoryDialog(true)}
                sx={{ 
                  bgcolor: 'rgba(255, 255, 255, 0.2)',
                  backdropFilter: 'blur(10px)',
                  border: '1px solid rgba(255, 255, 255, 0.3)',
                  '&:hover': {
                    bgcolor: 'rgba(255, 255, 255, 0.3)',
                  }
                }}
              >
                Add Category
              </Button>
              <Button
                variant="contained"
                startIcon={<Add />}
                onClick={handleAddItem}
                sx={{ 
                  bgcolor: 'white',
                  color: '#667eea',
                  fontWeight: 'bold',
                  '&:hover': {
                    bgcolor: 'rgba(255, 255, 255, 0.9)',
                    transform: 'translateY(-2px)',
                    boxShadow: '0 8px 25px rgba(0, 0, 0, 0.15)',
                  },
                  transition: 'all 0.3s ease'
                }}
              >
                Add Item
              </Button>
            </Box>
          )}
        </Box>
      </Box>

      {/* Modern Tabs */}
      <Box sx={{ 
        mb: 4,
        bgcolor: 'white',
        borderRadius: 2,
        p: 1,
        boxShadow: '0 2px 10px rgba(0, 0, 0, 0.1)',
        border: '1px solid #e0e0e0'
      }}>
        <Tabs 
          value={activeTab} 
          onChange={(e, newValue) => setActiveTab(newValue)}
          sx={{
            '& .MuiTab-root': {
              textTransform: 'none',
              fontWeight: 'bold',
              fontSize: '1rem',
              minHeight: 'auto',
              py: 2,
              px: 3,
              borderRadius: 1.5,
              mx: 0.5,
              transition: 'all 0.3s ease',
              '&:hover': {
                bgcolor: 'rgba(102, 126, 234, 0.1)',
              }
            },
            '& .Mui-selected': {
              bgcolor: '#667eea',
              color: 'white !important',
              '&:hover': {
                bgcolor: '#667eea',
              }
            },
            '& .MuiTabs-indicator': {
              display: 'none'
            }
          }}
        >
          <Tab label="📂 Menu Categories" />
          <Tab label="🍽️ Full Menu" />
        </Tabs>
      </Box>

      {/* Categories Tab */}
      {activeTab === 0 && (
        <Box>
          {categories.length === 0 ? (
            <Card sx={{ 
              textAlign: 'center', 
              py: 8,
              background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
              border: '2px dashed #e0e0e0'
            }}>
              <CardContent>
                <Restaurant sx={{ fontSize: 80, color: '#bdbdbd', mb: 2 }} />
                <Typography variant="h6" color="textSecondary" gutterBottom>
                  No categories found
                </Typography>
                <Typography variant="body2" color="textSecondary" sx={{ mb: 3 }}>
                  Create your first menu category to get started
                </Typography>
                {canManageMenu() && (
                  <Button
                    variant="contained"
                    startIcon={<Category />}
                    onClick={() => setOpenCategoryDialog(true)}
                    sx={{ borderRadius: 3 }}
                  >
                    Create Category
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <Grid container spacing={3}>
              {categories.map((category) => (
                <Grid item xs={12} md={6} lg={4} key={category.id}>
                  <Card sx={{ 
                    height: '100%',
                    borderRadius: 3,
                    border: '1px solid #e0e0e0',
                    transition: 'all 0.3s ease',
                    '&:hover': {
                      transform: 'translateY(-4px)',
                      boxShadow: '0 12px 40px rgba(0, 0, 0, 0.15)',
                    }
                  }}>
                    <CardContent sx={{ p: 3 }}>
                      {/* Category Header */}
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                          <Avatar sx={{ 
                            bgcolor: '#667eea', 
                            mr: 2,
                            width: 48,
                            height: 48
                          }}>
                            <Restaurant />
                          </Avatar>
                          <Box>
                            <Typography variant="h6" sx={{ fontWeight: 'bold', color: '#2d3748' }}>
                              {category.name}
                            </Typography>
                            <Chip
                              label={category.isActive ? 'Active' : 'Inactive'}
                              size="small"
                              color={category.isActive ? 'success' : 'default'}
                              sx={{ mt: 0.5 }}
                            />
                          </Box>
                        </Box>
                        {canManageMenu() && (
                          <Box>
                            <IconButton 
                              onClick={() => openEditCategory(category)}
                              size="small"
                              sx={{ 
                                bgcolor: 'rgba(102, 126, 234, 0.1)',
                                '&:hover': { bgcolor: 'rgba(102, 126, 234, 0.2)' }
                              }}
                            >
                              <Edit sx={{ color: '#667eea' }} />
                            </IconButton>
                            <IconButton 
                              onClick={() => handleDeleteCategory(category.id)}
                              size="small"
                              sx={{ 
                                ml: 1,
                                bgcolor: 'rgba(239, 68, 68, 0.1)',
                                '&:hover': { bgcolor: 'rgba(239, 68, 68, 0.2)' }
                              }}
                            >
                              <Delete sx={{ color: '#ef4444' }} />
                            </IconButton>
                          </Box>
                        )}
                      </Box>

                      {/* Category Description */}
                      <Typography variant="body2" color="textSecondary" sx={{ mb: 3, lineHeight: 1.6 }}>
                        {category.description || 'No description provided'}
                      </Typography>

                      {/* Category Stats */}
                      <Box sx={{ 
                        bgcolor: '#f8fafc', 
                        borderRadius: 2, 
                        p: 2,
                        border: '1px solid #e2e8f0'
                      }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1, color: '#4a5568' }}>
                          Items in this category
                        </Typography>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Typography variant="h5" sx={{ fontWeight: 'bold', color: '#667eea' }}>
                            {category.itemCount || 0}
                          </Typography>
                          <Chip 
                            label={`Sort: ${category.sortOrder || 0}`}
                            size="small"
                            variant="outlined"
                            sx={{ fontSize: '0.75rem' }}
                          />
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
                          <Typography variant="caption" color="success.main">
                            {category.availableCount || 0} available
                          </Typography>
                          <Typography variant="caption" color="error.main">
                            {(category.itemCount || 0) - (category.availableCount || 0)} unavailable
                          </Typography>
                        </Box>
                      </Box>

                      {/* Quick Actions */}
                      {canManageMenu() && (
                        <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
                          <Button
                            size="small"
                            variant="outlined"
                            startIcon={<Add />}
                              onClick={() => {
                              handleAddItem();
                              setItemForm(prev => ({ ...prev, categoryId: String(category.id) }));
                            }}
                            sx={{ 
                              flex: 1,
                              borderRadius: 2,
                              textTransform: 'none'
                            }}
                          >
                            Add Item
                          </Button>
                          <Button
                            size="small"
                            variant="text"
                            startIcon={<Visibility />}
                            onClick={() => setActiveTab(1)}
                            sx={{ 
                              borderRadius: 2,
                              textTransform: 'none'
                            }}
                          >
                            View Items
                          </Button>
                        </Box>
                      )}
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          )}
        </Box>
      )}

      {/* Full Menu Tab */}
      {activeTab === 1 && (
        <Box>
          {fullMenu.length === 0 ? (
            <Card sx={{ 
              textAlign: 'center', 
              py: 8,
              background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
              border: '2px dashed #e0e0e0'
            }}>
              <CardContent>
                <Restaurant sx={{ fontSize: 80, color: '#bdbdbd', mb: 2 }} />
                <Typography variant="h6" color="textSecondary" gutterBottom>
                  No menu items found
                </Typography>
                <Typography variant="body2" color="textSecondary" sx={{ mb: 3 }}>
                  Add categories and items to build your menu
                </Typography>
                {canManageMenu() && (
                  <Button
                    variant="contained"
                    startIcon={<Add />}
                    onClick={handleAddItem}
                    sx={{ borderRadius: 3 }}
                  >
                    Add First Item
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <Grid container spacing={3}>
              {fullMenu.map((category) => (
                <Grid item xs={12} key={category.id}>
                  <Card sx={{ 
                    borderRadius: 3,
                    border: '1px solid #e0e0e0',
                    overflow: 'hidden'
                  }}>
                    {/* Category Header */}
                    <Box sx={{ 
                      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                      color: 'white',
                      p: 3
                    }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                          <Avatar sx={{ bgcolor: 'rgba(255, 255, 255, 0.2)', mr: 2 }}>
                            <Restaurant />
                          </Avatar>
                          <Box>
                            <Typography variant="h5" sx={{ fontWeight: 'bold' }}>
                              {category.name}
                            </Typography>
                            <Typography variant="body2" sx={{ opacity: 0.9 }}>
                              {category.description || 'No description provided'}
                            </Typography>
                          </Box>
                        </Box>
                        <Chip 
                          label={`${category.items.length} items`}
                          sx={{ 
                            bgcolor: 'rgba(255, 255, 255, 0.2)',
                            color: 'white',
                            fontWeight: 'bold'
                          }}
                        />
                      </Box>
                    </Box>

                    <CardContent sx={{ p: 0 }}>
                      {category.items.length === 0 ? (
                        <Box sx={{ textAlign: 'center', py: 6 }}>
                          <Restaurant sx={{ fontSize: 48, color: '#e0e0e0', mb: 2 }} />
                          <Typography variant="h6" color="textSecondary" gutterBottom>
                            No items in this category
                          </Typography>
                          {canManageMenu() && (
                            <Button
                              variant="outlined"
                              startIcon={<Add />}
                              onClick={() => {
                                handleAddItem();
                                setItemForm(prev => ({ ...prev, categoryId: String(category.id) }));
                              }}
                              sx={{ mt: 2, borderRadius: 2 }}
                            >
                              Add Item
                            </Button>
                          )}
                        </Box>
                      ) : (
                        <TableContainer component={Paper} sx={{ boxShadow: 'none' }}>
                          <Table>
                            <TableHead>
                              <TableRow sx={{ bgcolor: '#f8fafc' }}>
                                <TableCell sx={{ fontWeight: 'bold', color: '#374151' }}>Item</TableCell>
                                <TableCell sx={{ fontWeight: 'bold', color: '#374151' }}>Price</TableCell>
                                <TableCell sx={{ fontWeight: 'bold', color: '#374151' }}>Status</TableCell>
                                <TableCell sx={{ fontWeight: 'bold', color: '#374151' }}>Details</TableCell>
                                <TableCell sx={{ fontWeight: 'bold', color: '#374151', textAlign: 'center' }}>
                                  {isEditMode ? 'Add to Order' : (canManageMenu() ? 'Actions' : '')}
                                </TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {category.items.map((item, index) => (
                                <TableRow 
                                  key={item.id}
                                  sx={{ 
                                    '&:hover': { 
                                      bgcolor: '#f8fafc',
                                      cursor: 'pointer'
                                    },
                                    borderLeft: item.isAvailable ? '4px solid #10b981' : '4px solid #ef4444',
                                    opacity: (Number(item.stockLevel || 0) <= 0 || !item.isAvailable) ? 0.5 : 1,
                                    '&:last-child td, &:last-child th': { border: 0 }
                                  }}
                                >
                                  {/* Item Info */}
                                  <TableCell sx={{ py: 2 }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                      {item.image ? (
                                        <Avatar
                                          src={item.image}
                                          sx={{ width: 50, height: 50, mr: 2, borderRadius: 2 }}
                                          variant="rounded"
                                        />
                                      ) : (
                                        <Avatar sx={{ 
                                          width: 50, 
                                          height: 50, 
                                          mr: 2, 
                                          bgcolor: '#667eea',
                                          borderRadius: 2
                                        }}
                                        variant="rounded">
                                          <Restaurant />
                                        </Avatar>
                                      )}
                                      <Box>
                                        <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mb: 0.5 }}>
                                          {item.name}
                                        </Typography>
                                        <Typography variant="body2" color="textSecondary" sx={{ 
                                          maxWidth: 200,
                                          overflow: 'hidden',
                                          textOverflow: 'ellipsis',
                                          whiteSpace: 'nowrap'
                                        }}>
                                          {item.description}
                                        </Typography>
                                        {item.allergens && (
                                          <Chip
                                            label={`⚠️ ${item.allergens}`}
                                            size="small"
                                            sx={{ 
                                              mt: 0.5,
                                              bgcolor: '#fef3c7',
                                              color: '#92400e',
                                              fontSize: '0.7rem',
                                              height: 20
                                            }}
                                          />
                                        )}
                                      </Box>
                                    </Box>
                                  </TableCell>

                                  {/* Price */}
                                  <TableCell>
                                    <Typography variant="h6" sx={{ color: '#10b981', fontWeight: 'bold' }}>
                                      ₱{parseFloat(item.price).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                                    </Typography>
                                  </TableCell>

                                  {/* Status */}
                                  <TableCell>
                                    {Number(item.stockLevel || 0) <= 0 ? (
                                      <Chip
                                        label={`Out of stock`}
                                        size="small"
                                        color="error"
                                        sx={{ fontWeight: 'bold' }}
                                      />
                                    ) : (
                                      <Chip
                                        label={item.isAvailable ? 'Available' : 'Unavailable'}
                                        size="small"
                                        color={item.isAvailable ? 'success' : 'error'}
                                        sx={{ fontWeight: 'bold' }}
                                      />
                                    )}
                                    {typeof item.stockLevel === 'number' && (
                                      <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>
                                        Stock: {item.stockLevel}
                                      </Typography>
                                    )}
                                  </TableCell>

                                  {/* Details */}
                                  <TableCell>
                                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                      {item.preparationTime && (
                                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                          <Schedule sx={{ fontSize: 16, mr: 0.5, color: '#6b7280' }} />
                                          <Typography variant="caption" color="textSecondary">
                                            {item.preparationTime} min
                                          </Typography>
                                        </Box>
                                      )}
                                      {item.calories && (
                                        <Typography variant="caption" color="textSecondary">
                                          {item.calories} calories
                                        </Typography>
                                      )}
                                      {item.ingredients && (
                                        <Typography variant="caption" color="textSecondary" sx={{ 
                                          maxWidth: 150,
                                          overflow: 'hidden',
                                          textOverflow: 'ellipsis',
                                          whiteSpace: 'nowrap'
                                        }}>
                                          {item.ingredients}
                                        </Typography>
                                      )}
                                    </Box>
                                  </TableCell>

                                  {/* Actions */}
                                  <TableCell sx={{ textAlign: 'center' }}>
                                    {isEditMode ? (
                                      // Edit Mode: Add to Order button
                                      <Button
                                        variant="contained"
                                        size="small"
                                        onClick={() => handleAddToEditCart(item)}
                                        disabled={!(item.isAvailable && Number(item.stockLevel || 0) > 0)}
                                        sx={{ 
                                          bgcolor: (item.isAvailable && Number(item.stockLevel || 0) > 0) ? 'primary.main' : 'grey.300',
                                          minWidth: 100
                                        }}
                                      >
                                        Add to Order
                                      </Button>
                                    ) : canManageMenu() ? (
                                      // Management Mode: Edit/Toggle/Delete buttons
                                      <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                                        <IconButton 
                                          onClick={() => openEditItem(item)}
                                          size="small"
                                          sx={{ 
                                            bgcolor: 'rgba(102, 126, 234, 0.1)',
                                            '&:hover': { bgcolor: 'rgba(102, 126, 234, 0.2)' }
                                          }}
                                        >
                                          <Edit sx={{ fontSize: 16, color: '#667eea' }} />
                                        </IconButton>
                                        <IconButton 
                                          onClick={() => handleToggleAvailability(item.id, item.isAvailable)}
                                          size="small"
                                          sx={{ 
                                            bgcolor: item.isAvailable ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.1)',
                                            '&:hover': { bgcolor: item.isAvailable ? 'rgba(239, 68, 68, 0.2)' : 'rgba(34, 197, 94, 0.2)' }
                                          }}
                                        >
                                          {item.isAvailable ? 
                                            <ToggleOff sx={{ fontSize: 16, color: '#ef4444' }} /> : 
                                            <ToggleOn sx={{ fontSize: 16, color: '#22c55e' }} />
                                          }
                                        </IconButton>
                                        <IconButton 
                                          onClick={() => handleDeleteItem(item.id)}
                                          size="small"
                                          sx={{ 
                                            bgcolor: 'rgba(239, 68, 68, 0.1)',
                                            '&:hover': { bgcolor: 'rgba(239, 68, 68, 0.2)' }
                                          }}
                                        >
                                          <Delete sx={{ fontSize: 16, color: '#ef4444' }} />
                                        </IconButton>
                                      </Box>
                                    ) : null}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </TableContainer>
                      )}
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          )}
        </Box>
      )}

      {/* Add Category Dialog */}
      <Dialog
        open={openCategoryDialog}
        onClose={() => setOpenCategoryDialog(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3
          }
        }}
      >
        <DialogTitle sx={{ 
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          gap: 2
        }}>
          <Category sx={{ fontSize: 28 }} />
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 'bold' }}>
              {editingCategory ? 'Edit Category' : 'Add New Category'}
            </Typography>
            <Typography variant="body2" sx={{ opacity: 0.9 }}>
              {editingCategory ? 'Update category information' : 'Create a new menu category'}
            </Typography>
          </Box>
        </DialogTitle>
        
        <DialogContent sx={{ p: 4 }}>
          <Box sx={{ 
            bgcolor: '#f8fafc', 
            borderRadius: 2, 
            p: 3,
            border: '1px solid #e2e8f0'
          }}>
            <TextField
              fullWidth
              label="Category Name *"
              value={categoryForm.name}
              onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
              required
              sx={{ mb: 3 }}
              InputProps={{
                startAdornment: <Category sx={{ mr: 1, color: '#94a3b8' }} />
              }}
            />
            
            <TextField
              fullWidth
              label="Description"
              value={categoryForm.description}
              onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
              multiline
              rows={3}
              placeholder="Describe this category..."
              sx={{ mb: 3 }}
            />
            
            <TextField
              fullWidth
              label="Sort Order"
              type="number"
              value={categoryForm.sortOrder}
              onChange={(e) => setCategoryForm({ ...categoryForm, sortOrder: parseInt(e.target.value) || 0 })}
              helperText="Lower numbers appear first"
              sx={{ mb: 3 }}
            />
            
            <Box sx={{ 
              display: 'flex', 
              alignItems: 'center', 
              p: 2, 
              bgcolor: 'white', 
              borderRadius: 2, 
              border: '1px solid #e2e8f0' 
            }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={categoryForm.isActive}
                    onChange={(e) => setCategoryForm({ ...categoryForm, isActive: e.target.checked })}
                    color="success"
                  />
                }
                label="Active Category"
                sx={{ flex: 1 }}
              />
            </Box>
          </Box>
        </DialogContent>
        
        <DialogActions sx={{ p: 3, bgcolor: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
          <Button 
            onClick={() => setOpenCategoryDialog(false)}
            size="large"
            sx={{ 
              borderRadius: 2,
              textTransform: 'none',
              px: 3
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreateCategory}
            variant="contained"
            size="large"
            disabled={loading || !categoryForm.name}
            sx={{ 
              borderRadius: 2,
              textTransform: 'none',
              px: 4,
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              '&:hover': {
                background: 'linear-gradient(135deg, #5a67d8 0%, #6b46c1 100%)',
              }
            }}
          >
            {editingCategory ? 'Update Category' : 'Create Category'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add Item Dialog */}
      <Dialog
        open={openItemDialog}
        onClose={() => setOpenItemDialog(false)}
        maxWidth="lg"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            maxHeight: '95vh',
            height: 'auto',
            margin: 1
          }
        }}
        scroll="body"
      >
        <DialogTitle sx={{ 
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          gap: 2
        }}>
          <Restaurant sx={{ fontSize: 28 }} />
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 'bold' }}>
              {editingItem ? 'Edit Menu Item' : 'Add New Menu Item'}
            </Typography>
            <Typography variant="body2" sx={{ opacity: 0.9 }}>
              {editingItem ? 'Update the details of your menu item' : `Create a new delicious menu item (${categories.length} categories available)`}
            </Typography>
          </Box>
        </DialogTitle>
        
        <DialogContent sx={{ p: 3, maxHeight: '70vh', overflowY: 'auto' }}>
          {/* Debug Information Panel */}
          <Box sx={{ 
            mb: 2, 
            p: 2, 
            border: '2px solid #4ade80', 
            borderRadius: 2, 
            backgroundColor: '#f0fdf4' 
          }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 'bold', color: '#16a34a', mb: 1 }}>
              🔍 Debug Information
            </Typography>
            <Typography variant="body2" sx={{ color: '#16a34a' }}>
              Categories loaded: {categories.length} | Selected: {itemForm.categoryId || 'None'}
            </Typography>
            <Typography variant="body2" sx={{ color: '#16a34a', fontSize: '0.8rem' }}>
              Categories: {categories.map(c => c.name).join(', ') || 'No categories'}
            </Typography>
          </Box>
          
          <Grid container spacing={3}>
            
            {/* Basic Information Section */}
            <Grid item xs={12}>
              <Box sx={{ 
                bgcolor: '#f8fafc', 
                borderRadius: 2, 
                p: 3,
                border: '1px solid #e2e8f0',
                mb: 2
              }}>
                <Typography variant="h6" sx={{ fontWeight: 'bold', color: '#2d3748', mb: 2, display: 'flex', alignItems: 'center' }}>
                  <Restaurant sx={{ mr: 1, color: '#667eea' }} />
                  Basic Information
                </Typography>
                
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      select
                      fullWidth
                      label="Category *"
                      value={(itemForm.categoryId || '') + ''}
                      onChange={(e) => {
                        const val = String(e.target.value);
                        console.log('🔥 Category selected:', val);
                        setItemForm({ ...itemForm, categoryId: val });
                      }}
                      InputLabelProps={{ shrink: true }}
                      SelectProps={{
                        native: true,
                        displayEmpty: true,
                        inputProps: { name: 'category', id: 'category-select-native' }
                      }}
                      sx={{
                        minHeight: 48,
                        '& .MuiSelect-select': {
                          paddingTop: '10px',
                          paddingBottom: '10px',
                        },
                        '& .MuiInputBase-root': {
                          lineHeight: '1.2'
                        }
                      }}
                      variant="outlined"
                    >
                      <option aria-label="Select a category" value="">Select a category</option>
                      {categories.length === 0 && (
                        <option disabled value="">No categories available</option>
                      )}
                      {categories.length > 0 && categories.map((category) => (
                        <option key={category.id} value={String(category.id)}>
                          {category.name || '(no name)'}
                        </option>
                      ))}
                    </TextField>
                  </Grid>
                  
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Item Name *"
                      value={itemForm.name}
                      onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
                      required
                      InputProps={{
                        startAdornment: <Restaurant sx={{ mr: 1, color: '#94a3b8' }} />
                      }}
                    />
                  </Grid>
                  
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      label="Description"
                      value={itemForm.description}
                      onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
                      multiline
                      rows={3}
                      placeholder="Describe your delicious menu item..."
                    />
                  </Grid>
                </Grid>
              </Box>
            </Grid>

            {/* Pricing & Time Section */}
            <Grid item xs={12}>
              <Box sx={{ 
                bgcolor: '#f0fdf4', 
                borderRadius: 2, 
                p: 3,
                border: '1px solid #bbf7d0',
                mb: 2
              }}>
                <Typography variant="h6" sx={{ fontWeight: 'bold', color: '#2d3748', mb: 2, display: 'flex', alignItems: 'center' }}>
                  <AttachMoney sx={{ mr: 1, color: '#10b981' }} />
                  Pricing & Preparation
                </Typography>
                
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Price *"
                      type="number"
                      step="0.01"
                      value={itemForm.price}
                      onChange={(e) => setItemForm({ ...itemForm, price: e.target.value })}
                      InputProps={{ 
                        startAdornment: <Typography sx={{ mr: 1, color: '#10b981', fontWeight: 'bold' }}>₱</Typography>
                      }}
                      required
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Cost of Goods (COGS)"
                      type="number"
                      step="0.01"
                      value={itemForm.costOfGoods}
                      onChange={(e) => setItemForm({ ...itemForm, costOfGoods: e.target.value })}
                      InputProps={{ 
                        startAdornment: <Typography sx={{ mr: 1, color: '#64748b', fontWeight: 'bold' }}>₱</Typography>
                      }}
                      helperText="(used for profitability calculations)"
                    />
                  </Grid>
                  
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Preparation Time (minutes)"
                      type="number"
                      value={itemForm.preparationTime}
                      onChange={(e) => setItemForm({ ...itemForm, preparationTime: parseInt(e.target.value) || 0 })}
                      InputProps={{
                        startAdornment: <Schedule sx={{ mr: 1, color: '#94a3b8' }} />
                      }}
                    />
                  </Grid>
                </Grid>
              </Box>
            </Grid>

            {/* Additional Details Section */}
            <Grid item xs={12}>
              <Box sx={{ 
                bgcolor: '#fefce8', 
                borderRadius: 2, 
                p: 3,
                border: '1px solid #fde047',
                mb: 2
              }}>
                <Typography variant="h6" sx={{ fontWeight: 'bold', color: '#2d3748', mb: 2, display: 'flex', alignItems: 'center' }}>
                  <Image sx={{ mr: 1, color: '#eab308' }} />
                  Additional Details
                </Typography>
                
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Ingredients"
                      value={itemForm.ingredients}
                      onChange={(e) => setItemForm({ ...itemForm, ingredients: e.target.value })}
                      placeholder="e.g., Tomato, Lettuce, Cheese..."
                    />
                  </Grid>
                  
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Allergens"
                      value={itemForm.allergens}
                      onChange={(e) => setItemForm({ ...itemForm, allergens: e.target.value })}
                      placeholder="e.g., Nuts, Dairy, Gluten..."
                    />
                  </Grid>
                  
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Calories"
                      type="number"
                      value={itemForm.calories}
                      onChange={(e) => setItemForm({ ...itemForm, calories: e.target.value })}
                      placeholder="Estimated calories"
                    />
                  </Grid>
                  
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Sort Order"
                      type="number"
                      value={itemForm.sortOrder}
                      onChange={(e) => setItemForm({ ...itemForm, sortOrder: parseInt(e.target.value) || 0 })}
                      helperText="Lower numbers appear first"
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Stock Level"
                      type="number"
                      value={itemForm.stockLevel}
                      onChange={(e) => setItemForm({ ...itemForm, stockLevel: Number(e.target.value) || 0 })}
                      helperText="Current available stock"
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Low Stock Threshold"
                      type="number"
                      value={itemForm.lowStockThreshold}
                      onChange={(e) => setItemForm({ ...itemForm, lowStockThreshold: Number(e.target.value) || 0 })}
                      helperText="Trigger alert when stock <= threshold"
                    />
                  </Grid>
                  
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      label="Image URL"
                      value={itemForm.image}
                      onChange={(e) => setItemForm({ ...itemForm, image: e.target.value })}
                      placeholder="https://example.com/image.jpg"
                    />
                  </Grid>
                </Grid>
              </Box>
            </Grid>

            {/* Status & Availability Section */}
            <Grid item xs={12}>
              <Box sx={{ 
                bgcolor: '#f1f5f9', 
                borderRadius: 2, 
                p: 3,
                border: '1px solid #cbd5e1'
              }}>
                <Typography variant="h6" sx={{ fontWeight: 'bold', color: '#2d3748', mb: 2, display: 'flex', alignItems: 'center' }}>
                  <ToggleOn sx={{ mr: 1, color: '#667eea' }} />
                  Status & Availability
                </Typography>
                
                <Grid container spacing={3}>
                  <Grid item xs={12} sm={6}>
                    <Box sx={{ display: 'flex', alignItems: 'center', p: 2, bgcolor: 'white', borderRadius: 2, border: '1px solid #e2e8f0' }}>
                      <FormControlLabel
                        control={
                          <Switch
                            checked={itemForm.isAvailable}
                            onChange={(e) => setItemForm({ ...itemForm, isAvailable: e.target.checked })}
                            color="success"
                          />
                        }
                        label="Available for orders"
                        sx={{ flex: 1 }}
                      />
                    </Box>
                  </Grid>
                  
                  <Grid item xs={12} sm={6}>
                    <Box sx={{ display: 'flex', alignItems: 'center', p: 2, bgcolor: 'white', borderRadius: 2, border: '1px solid #e2e8f0' }}>
                      <FormControlLabel
                        control={
                          <Switch
                            checked={itemForm.isActive}
                            onChange={(e) => setItemForm({ ...itemForm, isActive: e.target.checked })}
                            color="primary"
                          />
                        }
                        label="Active in menu"
                        sx={{ flex: 1 }}
                      />
                    </Box>
                  </Grid>
                </Grid>
              </Box>
            </Grid>
          </Grid>
        </DialogContent>
        
        <DialogActions sx={{ p: 3, bgcolor: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
          <Button 
            onClick={() => setOpenItemDialog(false)}
            size="large"
            sx={{ 
              borderRadius: 2,
              textTransform: 'none',
              px: 3
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreateItem}
            variant="contained"
            size="large"
            disabled={loading || !itemForm.name || !itemForm.price || !itemForm.categoryId}
            sx={{ 
              borderRadius: 2,
              textTransform: 'none',
              px: 4,
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              '&:hover': {
                background: 'linear-gradient(135deg, #5a67d8 0%, #6b46c1 100%)',
              }
            }}
          >
            {editingItem ? 'Update Item' : 'Create Item'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Modern Floating Action Buttons */}
      {canManageMenu() && (
        <Box>
          <Fab
            color="primary"
            aria-label="add item"
            sx={{ 
              position: 'fixed', 
              bottom: 100, 
              right: 20,
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              boxShadow: '0 8px 32px rgba(102, 126, 234, 0.4)',
              '&:hover': {
                background: 'linear-gradient(135deg, #5a67d8 0%, #6b46c1 100%)',
                transform: 'scale(1.1)',
                boxShadow: '0 12px 40px rgba(102, 126, 234, 0.6)',
              },
              transition: 'all 0.3s ease'
            }}
            onClick={handleAddItem}
          >
            <Add />
          </Fab>
          <Fab
            color="secondary"
            aria-label="add category"
            sx={{ 
              position: 'fixed', 
              bottom: 20, 
              right: 20,
              background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
              boxShadow: '0 8px 32px rgba(245, 87, 108, 0.4)',
              '&:hover': {
                background: 'linear-gradient(135deg, #ec4899 0%, #ef4444 100%)',
                transform: 'scale(1.1)',
                boxShadow: '0 12px 40px rgba(245, 87, 108, 0.6)',
              },
              transition: 'all 0.3s ease'
            }}
            onClick={() => setOpenCategoryDialog(true)}
          >
            <Category />
          </Fab>
        </Box>
      )}
    </Layout>
  );
};

export default Menu;
