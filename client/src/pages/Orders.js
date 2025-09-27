import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Typography,
  Grid,
  Card,
  CardContent,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Stack,
  Chip,
  TextField,
  FormControl,
  InputLabel,
  Select,
  NativeSelect,
  MenuItem,
  Paper,
  IconButton,
  Divider,
  CardMedia,
  InputAdornment,
  alpha
} from '@mui/material';
import {
  Add,
  Search,
  Restaurant,
  ShoppingCart,
  LocalShipping,
  Receipt,
  Person,
  Remove,
  Delete,
  Money,
  AccountBalanceWallet,
  CreditCard,
  Payment,
  Calculate,
  Print,
  Refresh,
  Cancel,
  Edit,
  TrendingUp,
  Analytics,
  AttachMoney
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import Layout from '../components/Layout';
import LoadingSpinner from '../components/LoadingSpinner';
import { OrderService, MenuService } from '../services/firebaseServices';
import { ordersAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../contexts/SocketContext';

const Orders = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, users: authUsers } = useAuth();
  const { isProcessing, startProcessing, stopProcessing, users: socketUsers } = useSocket();
  const [orders, setOrders] = useState([]);
  const [menu, setMenu] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [openOrderDialog, setOpenOrderDialog] = useState(false);
  const [openViewDialog, setOpenViewDialog] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedMenuItems, setSelectedMenuItems] = useState([]);
  const [cashTendered, setCashTendered] = useState('');
  const [changeAmount, setChangeAmount] = useState(0);
  
  // Income Analysis State
  const [incomeData, setIncomeData] = useState(null);
  const [showIncomeDetails, setShowIncomeDetails] = useState(false);

  const [newOrder, setNewOrder] = useState({
    customerName: '',
    customerPhone: '',
    orderType: 'dine-in',
    tableNumber: '',
    deliveryAddress: '',
    items: [],
    paymentMethod: 'cash',
    notes: '',
    discount: 0,
  });

  // Define calculation functions first to avoid hoisting issues
  const calculateSubtotal = useCallback(() => {
    return selectedMenuItems.reduce((total, item) => total + (item.price * item.quantity), 0);
  }, [selectedMenuItems]);

  const calculateTotal = useCallback(() => {
    const subtotal = calculateSubtotal();
    return subtotal - (newOrder.discount || 0);
  }, [calculateSubtotal, newOrder.discount]);

  // Cash change calculation effect
  useEffect(() => {
    if (cashTendered && newOrder.paymentMethod === 'cash') {
      const tendered = parseFloat(cashTendered) || 0;
      const total = calculateTotal();
      setChangeAmount(tendered - total);
    } else {
      setChangeAmount(0);
    }
  }, [cashTendered, newOrder.paymentMethod, selectedMenuItems, newOrder.discount, calculateTotal]);

  // Fetch income analysis data
  const fetchIncomeData = useCallback(async () => {
    try {
      const response = await ordersAPI.getIncomeAnalysis();
      setIncomeData(response.data);
    } catch (error) {
      console.error('Error fetching income data:', error);
      toast.error('Failed to load income analysis');
    }
  }, []);

  // Load income data on component mount and when orders change
  useEffect(() => {
    fetchIncomeData();
  }, [fetchIncomeData, orders]);

  useEffect(() => {
    // If we navigated here with a request to open the New Order dialog, do it now.
    try {
      if (location?.state?.openNewOrder) {
        setOpenOrderDialog(true);
        // replace history state so refresh/back doesn't re-open
        navigate(location.pathname, { replace: true });
      }
    } catch (e) {
      // ignore
    }
    // Ensure we load menu first so category lookups are available when orders arrive.
    // Then subscribe to real-time updates. This avoids a race where orders
    // are received before menu/categories are hydrated and UI shows "no category".
    let unsubscribeOrders = null;
    let unsubscribeCategories = null;
    let unsubscribeItems = null;
    let categories = [];
    let items = [];

    const updateMenu = () => {
      const menuWithItems = categories.map(category => ({
        ...category,
        items: items.filter(item => item.categoryId === category.id)
      }));
      console.log('Real-time menu update:', menuWithItems);
      setMenu(menuWithItems);
    };

    (async () => {
      try {
        setLoading(true);
        await fetchMenu(); // wait for initial menu data
      } catch (err) {
        console.error('Initial menu load failed:', err);
      } finally {
        setLoading(false);
      }

      // Subscribe to orders after menu is loaded to avoid missing category info
      unsubscribeOrders = OrderService.subscribeToOrders((realTimeOrders) => {
        console.log('Real-time orders update:', realTimeOrders);

        // Enrich incoming orders' items with category info from current items/categories
        const enriched = (realTimeOrders || []).map(order => ({
          ...order,
          items: (order.items || []).map(it => {
            if (it.categoryName) return it;
            // try to find item in the latest items list
            const found = items.find(mi => mi.id === it.menuItemId || mi.id === it.id || mi.menuItemId === it.menuItemId);
            const category = found ? categories.find(c => c.id === found.categoryId) : null;
            return {
              ...it,
              categoryId: it.categoryId || (found && found.categoryId) || null,
              categoryName: it.categoryName || (found && (found.categoryName || category?.name)) || null
            };
          })
        }));

        setOrders(enriched);
      });

      // Subscribe to categories/items and build menu when updates arrive
      unsubscribeCategories = MenuService.subscribeToCategoriesChanges((realTimeCategories) => {
        categories = realTimeCategories;
        updateMenu();
      });

      unsubscribeItems = MenuService.subscribeToItemsChanges((realTimeItems) => {
        items = realTimeItems;
        updateMenu();
      });
    })();

    // Cleanup function
    return () => {
      if (unsubscribeOrders) unsubscribeOrders();
      if (unsubscribeCategories) unsubscribeCategories();
      if (unsubscribeItems) unsubscribeItems();
    };
  }, []);

  // Note: Socket sync removed - using Firebase real-time listeners instead
  // The socket context provides empty arrays which was clearing the menu after order processing

  // Note: Notifications removed - using Firebase real-time listeners for updates

  // Keep this function for backward compatibility (not used with real-time listeners)
  // const fetchOrders = async () => {
  //   try {
  //     const ordersData = await OrderService.getAllOrders();
  //     setOrders(ordersData);
  //   } catch (error) {
  //     console.error('Error fetching orders:', error);
  //     toast.error('Failed to fetch orders');
  //   }
  // };

  const fetchMenu = async () => {
    try {
      const menuData = await MenuService.getFullMenu();
      console.log('Firebase menu data received:', menuData);
      
      // MenuService.getFullMenu() returns categories with items
      if (menuData && Array.isArray(menuData)) {
        setMenu(menuData);
      } else {
        console.error('Invalid menu data structure:', menuData);
        setMenu([]);
        toast.error('Invalid menu data received');
      }
    } catch (error) {
      console.error('Error fetching menu from Firebase:', error);
      setMenu([]);
      toast.error('Failed to fetch menu from Firebase');
    }
  };

  const canProcessOrders = () => {
    return user?.role === 'admin' || user?.role === 'cashier' || user?.role === 'manager' || user?.role === 'employee';
  };

  const handleCreateOrder = async () => {
    if (selectedMenuItems.length === 0) {
      toast.error('Please add items to the order');
      return;
    }

    if (newOrder.paymentMethod === 'cash' && changeAmount < 0) {
      toast.error('Insufficient cash tendered');
      return;
    }

    setLoading(true);
    try {
        // Build a quick lookup for category info from the current menu
        const flatMenuLookup = menu.flatMap(cat => (cat.items || []).map(i => ({ ...i, categoryId: cat.id, categoryName: cat.name })));
        const itemLookup = flatMenuLookup.reduce((acc, it) => {
          acc[it.id] = it;
          return acc;
        }, {});

        const orderItems = selectedMenuItems.map(item => {
          const menuMeta = itemLookup[item.id] || itemLookup[item.menuItemId] || null;
          return {
            menuItemId: item.id,
            name: item.name,
            price: item.price,
            quantity: item.quantity,
            unitPrice: item.price,
            totalPrice: item.price * item.quantity,
            specialInstructions: item.notes || '',
            // include category info so orders always carry categoryName
            categoryId: item.categoryId || menuMeta?.categoryId || menuMeta?.categoryId || menuMeta?.categoryId || null,
            categoryName: item.categoryName || menuMeta?.categoryName || menuMeta?.category || null,
          };
        });

      const total = calculateTotal();

      // Signal processing start so Menu can avoid reloading categories
      try {
        startProcessing();

        await OrderService.createOrder({
        ...newOrder,
        total,
        subtotal: calculateSubtotal(),
        tax: 0, // You can add tax calculation if needed
        discount: 0, // You can add discount if needed
        employeeId: user?.id || 'unknown',
        items: orderItems // Include items in the main order document
        }, orderItems);

      } finally {
        // Always clear processing flag once the create call completes
        stopProcessing();
      }

      toast.success('Order created successfully!');
      setOpenOrderDialog(false);
      resetNewOrder();
      // Remove manual fetchOrders() - real-time listener will handle the update
    } catch (error) {
      console.error('Error creating order:', error);
      toast.error('Failed to create order');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusUpdate = async (orderId, newStatus) => {
    try {
      await OrderService.updateOrderStatus(orderId, newStatus);
      toast.success(`Order status updated to ${newStatus}`);
      // Real-time listener will handle the update automatically
    } catch (error) {
      console.error('Error updating order status:', error);
      toast.error('Failed to update order status');
    }
  };

  const handleCancelOrder = async (orderId) => {
    try {
      await OrderService.updateOrderStatus(orderId, 'cancelled');
      toast.success('Order cancelled successfully');
      // Real-time listener will handle the update automatically
    } catch (error) {
      console.error('Error cancelling order:', error);
      toast.error('Failed to cancel order');
    }
  };

  const handlePrintReceipt = (order) => {
    const printWindow = window.open('', '_blank');
    const receiptHTML = generateReceiptHTML(order);
    
    printWindow.document.write(receiptHTML);
    printWindow.document.close();
    printWindow.focus();
    
    // Auto print
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
    
    toast.success('Receipt sent to printer');
  };

  const handleEditOrder = (order) => {
    // Store the order being edited in localStorage so the menu page can access it
    const editData = {
      orderId: order.id,
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      version: order.version || 0,
      currentItems: order.items?.map(item => ({
        id: item.menuItemId || item.id,
        name: item.name,
        price: item.price || item.unitPrice,
        quantity: item.quantity,
        menuItemId: item.menuItemId || item.id
      })) || [],
      originalTotal: order.total,
      editMode: true
    };
    
    localStorage.setItem('ptown:editingOrder', JSON.stringify(editData));
    
    // Navigate to menu page with edit mode parameter
    navigate('/menu?mode=edit');
    
    toast.info(`Editing Order #${order.orderNumber} - Select items to modify`);
  };

  const generateReceiptHTML = (order) => {
    const currentDate = new Date().toLocaleString();
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Receipt - Order ${order.orderNumber}</title>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          
          body {
            font-family: 'Courier New', monospace;
            font-size: 12px;
            line-height: 1.4;
            color: #000;
            background: white;
            padding: 20px;
            max-width: 300px;
            margin: 0 auto;
          }
          
          .receipt-header {
            text-align: center;
            border-bottom: 2px solid #000;
            padding-bottom: 10px;
            margin-bottom: 15px;
          }
          
          .restaurant-name {
            font-size: 18px;
            font-weight: bold;
            margin-bottom: 5px;
          }
          
          .restaurant-info {
            font-size: 10px;
            margin-bottom: 2px;
          }
          
          .order-info {
            margin: 15px 0;
            font-size: 11px;
          }
          
          .order-info div {
            margin-bottom: 3px;
          }
          
          .items-table {
            width: 100%;
            border-collapse: collapse;
            margin: 15px 0;
          }
          
          .items-table th,
          .items-table td {
            padding: 5px 2px;
            text-align: left;
            font-size: 11px;
          }
          
          .items-table th {
            border-bottom: 1px solid #000;
            font-weight: bold;
          }
          
          .item-row {
            border-bottom: 1px dotted #666;
          }
          
          .qty {
            text-align: center;
            width: 30px;
          }
          
          .price {
            text-align: right;
            width: 60px;
          }
          
          .totals {
            margin-top: 15px;
            padding-top: 10px;
            border-top: 1px solid #000;
          }
          
          .total-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 5px;
            font-size: 11px;
          }
          
          .final-total {
            display: flex;
            justify-content: space-between;
            font-weight: bold;
            font-size: 14px;
            border-top: 1px solid #000;
            padding-top: 5px;
            margin-top: 10px;
          }
          
          .receipt-footer {
            text-align: center;
            margin-top: 20px;
            padding-top: 15px;
            border-top: 1px solid #000;
            font-size: 10px;
          }
          
          .thank-you {
            font-weight: bold;
            margin-bottom: 10px;
          }
          
          @media print {
            body {
              padding: 0;
              max-width: none;
            }
          }
        </style>
      </head>
      <body>
        <div class="receipt-header">
          <div class="restaurant-name">P-Town POS</div>
          <div class="restaurant-info">123 Restaurant Street</div>
          <div class="restaurant-info">City, State 12345</div>
          <div class="restaurant-info">Tel: (555) 123-4567</div>
        </div>
        
        <div class="order-info">
          <div><strong>Order #:</strong> ${order.orderNumber || order.id}</div>
          <div><strong>Date:</strong> ${order.createdAt?.toDate?.()?.toLocaleString() || currentDate}</div>
          <div><strong>Customer:</strong> ${order.customerName || 'Walk-in'}</div>
          <div><strong>Type:</strong> ${order.orderType || 'Dine In'}</div>
          ${order.tableNumber ? `<div><strong>Table:</strong> ${order.tableNumber}</div>` : ''}
          <div><strong>Status:</strong> ${order.status?.toUpperCase()}</div>
        </div>
        
        <table class="items-table">
          <thead>
            <tr>
              <th>Item</th>
              <th class="qty">Qty</th>
              <th class="price">Price</th>
            </tr>
          </thead>
          <tbody>
            ${(order.items || []).map(item => `
              <tr class="item-row">
                <td>${item.name || 'Menu Item'}</td>
                <td class="qty">${item.quantity}</td>
                <td class="price">₱${item.totalPrice?.toFixed(2) || (item.unitPrice * item.quantity).toFixed(2)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        
        <div class="totals">
          <div class="total-row">
            <span>Subtotal:</span>
            <span>₱${order.subtotal?.toFixed(2) || '0.00'}</span>
          </div>
          ${order.tax ? `
            <div class="total-row">
              <span>Tax:</span>
              <span>₱${order.tax.toFixed(2)}</span>
            </div>
          ` : ''}
          ${order.discount ? `
            <div class="total-row">
              <span>Discount:</span>
              <span>-₱${order.discount.toFixed(2)}</span>
            </div>
          ` : ''}
          <div class="final-total">
            <span>TOTAL:</span>
            <span>₱${order.total?.toFixed(2) || '0.00'}</span>
          </div>
          <div class="total-row" style="margin-top: 10px;">
            <span>Payment Method:</span>
            <span>${order.paymentMethod?.toUpperCase() || 'CASH'}</span>
          </div>
        </div>
        
        <div class="receipt-footer">
          <div class="thank-you">Thank you for dining with us!</div>
          <div>Please come again</div>
          <div style="margin-top: 10px;">Printed: ${currentDate}</div>
        </div>
      </body>
      </html>
    `;
  };

  const resetNewOrder = () => {
    setNewOrder({
      customerName: '',
      customerPhone: '',
      orderType: 'dine-in',
      tableNumber: '',
      deliveryAddress: '',
      items: [],
      paymentMethod: 'cash',
      notes: '',
      discount: 0,
    });
    setSelectedMenuItems([]);
    setCashTendered('');
    setChangeAmount(0);
  };

  const addMenuItem = (menuItem) => {
    // Check if item is available
    if (!menuItem.isAvailable) {
      toast.error(`${menuItem.name} is currently unavailable`);
      return;
    }

    const existingItem = selectedMenuItems.find(item => item.id === menuItem.id);
    if (existingItem) {
      setSelectedMenuItems(prev =>
        prev.map(item =>
          item.id === menuItem.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      );
      toast.success(`Added another ${menuItem.name} to order`);
    } else {
      setSelectedMenuItems(prev => [
        ...prev,
        { ...menuItem, quantity: 1, notes: '' }
      ]);
      toast.success(`${menuItem.name} added to order`);
    }
  };

  const removeMenuItem = (menuItemId) => {
    setSelectedMenuItems(prev => prev.filter(item => item.id !== menuItemId));
  };

  const getFilteredMenuItems = () => {
    let allItems = [];
    
    // Check if menu exists and is an array
    if (!menu || !Array.isArray(menu)) {
      return [];
    }
    
    menu.forEach(category => {
      // Check if category has items and items is an array
      if (category && category.items && Array.isArray(category.items)) {
        allItems = [...allItems, ...category.items.map(item => ({ 
          ...item, 
          categoryName: category.name, 
          categoryId: category.id 
        }))];
      }
    });

    if (selectedCategory !== 'all') {
      allItems = allItems.filter(item => item.categoryId === selectedCategory);
    }

    if (searchTerm) {
      allItems = allItems.filter(item => 
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.description?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    return allItems.filter(item => item.isAvailable);
  };

  const getCategoryTabs = () => {
    const tabs = [{ id: 'all', name: 'All Categories', availableCount: 0, totalCount: 0 }];
    
    // Check if menu exists and is an array
    if (menu && Array.isArray(menu)) {
      let totalAvailable = 0;
      let totalItems = 0;
      
      menu.forEach(category => {
        if (category && category.id && category.name && category.items) {
          const availableItems = category.items.filter(item => item.isAvailable).length;
          const totalCategoryItems = category.items.length;
          
          totalAvailable += availableItems;
          totalItems += totalCategoryItems;
          
          tabs.push({
            id: category.id,
            name: category.name,
            availableCount: availableItems,
            totalCount: totalCategoryItems
          });
        }
      });
      
      // Update "All Categories" counts
      tabs[0].availableCount = totalAvailable;
      tabs[0].totalCount = totalItems;
    }
    
    return tabs;
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending': return 'warning';
      case 'preparing': return 'info';
      case 'ready': return 'success';
      case 'served': return 'secondary';
      case 'out_for_delivery': return 'primary';
      case 'delivered': return 'success';
      case 'completed': return 'success';
      case 'cancelled': return 'error';
      default: return 'default';
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'pending': return 'PENDING';
      case 'preparing': return 'PREPARING';
      case 'ready': return 'READY';
      case 'served': return 'SERVED';
      case 'out_for_delivery': return 'OUT FOR DELIVERY';
      case 'delivered': return 'DELIVERED';
      case 'completed': return 'COMPLETED';
      case 'cancelled': return 'CANCELLED';
      default: return status?.toUpperCase() || 'UNKNOWN';
    }
  };

  const getOrderTypeIcon = (type) => {
    switch (type) {
      case 'dine-in': return <Restaurant />;
      case 'takeaway': return <ShoppingCart />;
      case 'delivery': return <LocalShipping />;
      default: return <Restaurant />;
    }
  };

  const getPaymentIcon = (method) => {
    switch (method) {
      case 'cash': return <Money sx={{ color: '#4caf50' }} />;
      case 'gcash': return <AccountBalanceWallet sx={{ color: '#007dff' }} />;
      case 'paymaya': return <CreditCard sx={{ color: '#ff6b00' }} />;
      default: return <Payment />;
    }
  };

  const filteredOrders = orders.filter(order => {
    if (filter === 'all') return true;
    if (filter === 'active') return ['pending', 'preparing', 'ready'].includes(order.status);
    if (filter === 'delivery') return ['out_for_delivery', 'delivered'].includes(order.status);
    return order.status === filter;
  });

  return (
    <Layout>
      {loading ? (
        <LoadingSpinner message="Loading orders..." fullscreen />
      ) : (
  <Box sx={{ width: '100%', py: 2 }}>
          {/* Header */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
            <Box>
              <Typography variant="h4" gutterBottom sx={{ fontWeight: 700, color: 'primary.main' }}>
                P-Town POS
              </Typography>
              <Typography variant="subtitle1" color="text.secondary">
                Restaurant Point of Sale System
              </Typography>
          </Box>
          
          {canProcessOrders() && (
            <Button
              variant="contained"
              startIcon={<Add />}
              onClick={() => setOpenOrderDialog(true)}
              size="large"
              sx={{ 
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                borderRadius: 2,
                px: 3,
                py: 1.5,
                fontSize: '1.1rem',
                fontWeight: 'bold',
                '&:hover': {
                  background: 'linear-gradient(135deg, #5a6fd8 0%, #6a4190 100%)',
                  transform: 'translateY(-2px)',
                },
              }}
            >
              New Order
            </Button>
          )}
        </Box>

        {/* Income Analysis Section */}
        {incomeData && incomeData.daily && incomeData.monthly && (
          <Card 
            elevation={2} 
            sx={{ 
              mb: 3, 
              background: 'linear-gradient(135deg, #e8f5e8 0%, #f3e5f5 50%, #e3f2fd 100%)',
              border: '1px solid rgba(76, 175, 80, 0.2)'
            }}
          >
            <CardContent sx={{ p: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <TrendingUp sx={{ color: 'success.main', fontSize: '1.8rem' }} />
                  <Typography variant="h6" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                    Income Analysis
                  </Typography>
                </Box>
                <Button
                  startIcon={<Analytics />}
                  onClick={() => setShowIncomeDetails(!showIncomeDetails)}
                  sx={{ borderRadius: 2 }}
                >
                  {showIncomeDetails ? 'Hide Details' : 'View Details'}
                </Button>
              </Box>

              <Grid container spacing={3}>
                {/* Daily Income */}
                <Grid item xs={12} md={4}>
                  <Card elevation={1} sx={{ borderRadius: 3, overflow: 'hidden', height: '100%' }}>
                    <Box sx={{ 
                      background: 'linear-gradient(135deg, #4caf50 0%, #66bb6a 100%)', 
                      color: 'white', 
                      p: 2, 
                      textAlign: 'center' 
                    }}>
                      <Typography variant="subtitle2" sx={{ opacity: 0.9 }}>Today</Typography>
                      <Typography variant="h6" sx={{ fontWeight: 'bold' }}>Daily Income</Typography>
                    </Box>
                    <CardContent sx={{ p: 2 }}>
                      <Box sx={{ textAlign: 'center' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, mb: 1 }}>
                          <AttachMoney sx={{ color: 'success.main' }} />
                          <Typography variant="h5" sx={{ fontWeight: 'bold', color: 'success.main' }}>
                            ₱{(incomeData.daily.gross || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                          </Typography>
                        </Box>
                        <Typography variant="caption" color="text.secondary">Gross Revenue</Typography>
                        
                        <Divider sx={{ my: 1 }} />
                        
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                          <Typography variant="body2">Cost of Goods:</Typography>
                          <Typography variant="body2" color="error.main">
                            -₱{(incomeData.daily.cost || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                          </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                          <Typography variant="body2" sx={{ fontWeight: 'bold' }}>Net Profit:</Typography>
                          <Typography variant="body2" sx={{ fontWeight: 'bold', color: (incomeData.daily.net || 0) > 0 ? 'success.main' : 'error.main' }}>
                            ₱{(incomeData.daily.net || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                          </Typography>
                        </Box>
                        <Chip 
                          label={`${(incomeData.daily.profitMargin || 0).toFixed(1)}% Margin`}
                          size="small"
                          color={(incomeData.daily.profitMargin || 0) > 30 ? 'success' : (incomeData.daily.profitMargin || 0) > 15 ? 'warning' : 'error'}
                          sx={{ fontWeight: 'bold' }}
                        />
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>

                {/* Monthly Income */}
                <Grid item xs={12} md={4}>
                  <Card elevation={1} sx={{ borderRadius: 3, overflow: 'hidden', height: '100%' }}>
                    <Box sx={{ 
                      background: 'linear-gradient(135deg, #2196f3 0%, #42a5f5 100%)', 
                      color: 'white', 
                      p: 2, 
                      textAlign: 'center' 
                    }}>
                      <Typography variant="subtitle2" sx={{ opacity: 0.9 }}>This Month</Typography>
                      <Typography variant="h6" sx={{ fontWeight: 'bold' }}>Monthly Income</Typography>
                    </Box>
                    <CardContent sx={{ p: 2 }}>
                      <Box sx={{ textAlign: 'center' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, mb: 1 }}>
                          <AttachMoney sx={{ color: 'primary.main' }} />
                          <Typography variant="h5" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                            ₱{(incomeData.monthly.gross || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                          </Typography>
                        </Box>
                        <Typography variant="caption" color="text.secondary">Gross Revenue</Typography>
                        
                        <Divider sx={{ my: 1 }} />
                        
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                          <Typography variant="body2">Cost of Goods:</Typography>
                          <Typography variant="body2" color="error.main">
                            -₱{(incomeData.monthly.cost || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                          </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                          <Typography variant="body2" sx={{ fontWeight: 'bold' }}>Net Profit:</Typography>
                          <Typography variant="body2" sx={{ fontWeight: 'bold', color: (incomeData.monthly.net || 0) > 0 ? 'success.main' : 'error.main' }}>
                            ₱{(incomeData.monthly.net || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                          </Typography>
                        </Box>
                        <Chip 
                          label={`${(incomeData.monthly.profitMargin || 0).toFixed(1)}% Margin`}
                          size="small"
                          color={(incomeData.monthly.profitMargin || 0) > 30 ? 'success' : (incomeData.monthly.profitMargin || 0) > 15 ? 'warning' : 'error'}
                          sx={{ fontWeight: 'bold' }}
                        />
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>

                {/* Quick Stats */}
                <Grid item xs={12} md={4}>
                  <Card elevation={1} sx={{ borderRadius: 3, overflow: 'hidden', height: '100%' }}>
                    <Box sx={{ 
                      background: 'linear-gradient(135deg, #ff9800 0%, #ffb74d 100%)', 
                      color: 'white', 
                      p: 2, 
                      textAlign: 'center' 
                    }}>
                      <Typography variant="subtitle2" sx={{ opacity: 0.9 }}>Performance</Typography>
                      <Typography variant="h6" sx={{ fontWeight: 'bold' }}>Key Metrics</Typography>
                    </Box>
                    <CardContent sx={{ p: 2 }}>
                      <Stack spacing={1.5}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Typography variant="body2">Daily vs Monthly Trend:</Typography>
                          <Chip 
                            size="small"
                            label={(incomeData.daily.net || 0) > ((incomeData.monthly.net || 0) / 30) ? '📈 Above Avg' : '📉 Below Avg'}
                            color={(incomeData.daily.net || 0) > ((incomeData.monthly.net || 0) / 30) ? 'success' : 'warning'}
                            sx={{ fontSize: '0.75rem' }}
                          />
                        </Box>
                        
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Typography variant="body2">Daily Avg Profit:</Typography>
                          <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                            ₱{((incomeData.monthly.net || 0) / 30).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                          </Typography>
                        </Box>

                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Typography variant="body2">Cost Efficiency:</Typography>
                          <Typography variant="body2" sx={{ fontWeight: 'bold', color: ((incomeData.monthly.cost || 0) / (incomeData.monthly.gross || 1)) < 0.6 ? 'success.main' : 'warning.main' }}>
                            {(((incomeData.monthly.cost || 0) / (incomeData.monthly.gross || 1)) * 100).toFixed(1)}%
                          </Typography>
                        </Box>

                        <Divider />

                        <Button
                          fullWidth
                          variant="outlined"
                          size="small"
                          onClick={() => navigate('/reports')}
                          sx={{ borderRadius: 2, mt: 2 }}
                        >
                          View Full Reports
                        </Button>
                      </Stack>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        )}

        {/* Filter Tabs */}
        <Paper 
          elevation={0} 
          sx={{ 
            p: 2, 
            mb: 3, 
            bgcolor: alpha('#667eea', 0.05),
            border: '1px solid',
            borderColor: alpha('#667eea', 0.1),
            borderRadius: 2
          }}
        >
          <Stack direction="row" spacing={2} sx={{ overflowX: 'auto' }}>
            {[
              { value: 'all', label: 'All Orders', icon: <Receipt /> },
              { value: 'active', label: 'Active Orders', icon: <Restaurant /> },
              { value: 'pending', label: 'Pending', icon: <ShoppingCart /> },
              { value: 'preparing', label: 'Preparing', icon: <Restaurant /> },
              { value: 'ready', label: 'Ready', icon: <Receipt /> },
              { value: 'served', label: 'Served', icon: <Receipt /> },
              { value: 'delivery', label: 'Delivery', icon: <LocalShipping /> },
              { value: 'delivered', label: 'Delivered', icon: <LocalShipping /> },
              { value: 'completed', label: 'Completed', icon: <Receipt /> },
            ].map((filterOption) => (
              <Button
                key={filterOption.value}
                variant={filter === filterOption.value ? 'contained' : 'outlined'}
                onClick={() => setFilter(filterOption.value)}
                startIcon={filterOption.icon}
                sx={{
                  minWidth: 120,
                  borderRadius: 2,
                  textTransform: 'none',
                  fontWeight: filter === filterOption.value ? 'bold' : 'normal',
                }}
              >
                {filterOption.label}
              </Button>
            ))}
          </Stack>
        </Paper>

        {/* Orders Grid */}
        <Grid container spacing={3}>
          {filteredOrders.map((order) => (
            <Grid item xs={12} sm={6} md={4} lg={3} key={order.id}>
              <Card 
                elevation={2}
                sx={{ 
                  borderRadius: 3,
                  transition: 'all 0.3s ease',
                  '&:hover': {
                    transform: 'translateY(-4px)',
                    boxShadow: theme => theme.shadows[8],
                  },
                  border: '1px solid',
                  borderColor: alpha('#667eea', 0.1),
                }}
              >
                <CardContent sx={{ p: 3 }}>
                  {/* Order Header */}
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                    <Box>
                      <Typography variant="h6" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                        #{order.orderNumber}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {order.status === 'served' || order.status === 'completed' || order.status === 'delivered' ? (
                          <>
                            Completed: {order.completedAt?.toDate ? 
                              order.completedAt.toDate().toLocaleTimeString('en-PH', { 
                                hour: '2-digit', 
                                minute: '2-digit' 
                              }) :
                              order.completedAt ? 
                                new Date(order.completedAt).toLocaleTimeString('en-PH', { 
                                  hour: '2-digit', 
                                  minute: '2-digit' 
                                }) :
                                'Unknown'
                            }
                          </>
                        ) : (
                          <>
                            Created: {order.createdAt?.toDate ? 
                              order.createdAt.toDate().toLocaleTimeString('en-PH', { 
                                hour: '2-digit', 
                                minute: '2-digit' 
                              }) :
                              order.createdAt ? 
                                new Date(order.createdAt).toLocaleTimeString('en-PH', { 
                                  hour: '2-digit', 
                                  minute: '2-digit' 
                                }) :
                                'No date'
                            }
                          </>
                        )}
                      </Typography>
                    </Box>
                    <Chip
                      label={getStatusText(order.status)}
                      color={getStatusColor(order.status)}
                      size="small"
                      sx={{ fontWeight: 'bold' }}
                    />
                  </Box>

                  {/* Customer Info */}
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    {getOrderTypeIcon(order.orderType)}
                    <Box sx={{ ml: 1 }}>
                      <Typography variant="body1" sx={{ fontWeight: 'medium' }}>
                        {order.customerName || 'Walk-in Customer'}
                      </Typography>
                      {order.tableNumber && (
                        <Typography variant="caption" color="text.secondary">
                          Table {order.tableNumber}
                        </Typography>
                      )}
                    </Box>
                  </Box>

                  {/* Order Total */}
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                    <Typography variant="body2" color="text.secondary">
                      Total Amount:
                    </Typography>
                    <Typography variant="h6" sx={{ fontWeight: 'bold', color: 'success.main' }}>
                      ₱{order.total?.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </Typography>
                  </Box>

                  {/* Payment Method */}
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                    {getPaymentIcon(order.paymentMethod)}
                    <Typography variant="body2" sx={{ ml: 1, textTransform: 'capitalize' }}>
                      {order.paymentMethod === 'gcash' ? 'GCash' : 
                       order.paymentMethod === 'paymaya' ? 'PayMaya' : 
                       order.paymentMethod}
                    </Typography>
                  </Box>

                  {/* Action Buttons */}
                  <Stack spacing={1}>
                    <Button
                      fullWidth
                      variant="outlined"
                      onClick={() => {
                        setSelectedOrder(order);
                        setOpenViewDialog(true);
                      }}
                      sx={{ borderRadius: 2 }}
                    >
                      View Details
                    </Button>
                    
                    {/* Edit Order Button - Only for pending and preparing orders */}
                    {['pending', 'preparing'].includes(order.status) && (
                      <Button
                        fullWidth
                        variant="outlined"
                        startIcon={<Edit />}
                        onClick={() => handleEditOrder(order)}
                        sx={{
                          borderColor: '#ffc107',
                          color: '#ffc107',
                          '&:hover': {
                            borderColor: '#e0a800',
                            backgroundColor: '#fffbf0'
                          }
                        }}
                      >
                        Edit Order
                      </Button>
                    )}
                    
                    {/* Print Receipt Button - Available for all orders */}
                    <Button
                      fullWidth
                      variant="outlined"
                      startIcon={<Print />}
                      onClick={() => handlePrintReceipt(order)}
                      sx={{
                        borderColor: '#6c757d',
                        color: '#6c757d',
                        '&:hover': {
                          borderColor: '#495057',
                          backgroundColor: '#f8f9fa'
                        }
                      }}
                    >
                      Print Receipt
                    </Button>
                    
                    {/* Cancel Order Button - Only for pending and preparing orders */}
                    {['pending', 'preparing'].includes(order.status) && (
                      <Button
                        fullWidth
                        variant="outlined"
                        startIcon={<Cancel />}
                        onClick={() => handleCancelOrder(order.id)}
                        sx={{
                          borderColor: '#dc3545',
                          color: '#dc3545',
                          '&:hover': {
                            borderColor: '#c82333',
                            backgroundColor: '#fff5f5'
                          }
                        }}
                      >
                        Cancel Order
                      </Button>
                    )}
                    
                    {['pending', 'preparing', 'ready'].includes(order.status) && (
                      <Button
                        fullWidth
                        variant="contained"
                        onClick={() => {
                          const nextStatus = 
                            order.status === 'pending' ? 'preparing' :
                            order.status === 'preparing' ? 'ready' : 'served';
                          handleStatusUpdate(order.id, nextStatus);
                        }}
                        sx={{
                          background: order.status === 'pending' ? 
                            'linear-gradient(135deg, #ff9800 0%, #f57c00 100%)' :
                            order.status === 'preparing' ?
                            'linear-gradient(135deg, #2196f3 0%, #1976d2 100%)' :
                            'linear-gradient(135deg, #4caf50 0%, #388e3c 100%)',
                          borderRadius: 2,
                          fontWeight: 'bold',
                        }}
                      >
                        {order.status === 'pending' ? 'Start Preparing' :
                         order.status === 'preparing' ? 'Mark Ready' : 'Mark Served'}
                      </Button>
                    )}

                    {/* Delivery Status Management */}
                    {order.status === 'served' && (order.orderType === 'delivery' || order.orderType === 'takeout') && (
                      <Button
                        fullWidth
                        variant="contained"
                        startIcon={<LocalShipping />}
                        onClick={() => handleStatusUpdate(order.id, 'out_for_delivery')}
                        sx={{
                          background: 'linear-gradient(135deg, #9c27b0 0%, #7b1fa2 100%)',
                          borderRadius: 2,
                          fontWeight: 'bold',
                        }}
                      >
                        Mark Out for Delivery
                      </Button>
                    )}

                    {order.status === 'out_for_delivery' && (
                      <Button
                        fullWidth
                        variant="contained"
                        startIcon={<Receipt />}
                        onClick={() => handleStatusUpdate(order.id, 'delivered')}
                        sx={{
                          background: 'linear-gradient(135deg, #4caf50 0%, #2e7d32 100%)',
                          borderRadius: 2,
                          fontWeight: 'bold',
                        }}
                      >
                        Mark as Delivered
                      </Button>
                    )}

                    {/* For served dine-in orders that don't need delivery */}
                    {order.status === 'served' && order.orderType === 'dine-in' && (
                      <Button
                        fullWidth
                        variant="contained"
                        startIcon={<Receipt />}
                        onClick={() => handleStatusUpdate(order.id, 'completed')}
                        sx={{
                          background: 'linear-gradient(135deg, #4caf50 0%, #2e7d32 100%)',
                          borderRadius: 2,
                          fontWeight: 'bold',
                        }}
                      >
                        Mark as Completed
                      </Button>
                    )}
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
  </Box>
      )}

      {/* New Order Dialog - Modern POS Interface */}
      <Dialog
        open={openOrderDialog}
        onClose={() => setOpenOrderDialog(false)}
        maxWidth="xl"
        fullWidth
        fullScreen
        PaperProps={{
          sx: {
            bgcolor: '#f8fafc',
            borderRadius: 0,
          }
        }}
      >
        <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
          {/* Header */}
          <Box sx={{ 
            bgcolor: 'white', 
            p: 2, 
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <Typography variant="h5" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
              P-Town POS - New Order
            </Typography>
            <Button 
              onClick={() => setOpenOrderDialog(false)}
              sx={{ minWidth: 100 }}
            >
              Close
            </Button>
          </Box>

          <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
            {/* Left Side - Menu Items */}
            <Box sx={{ flex: 2, p: 3, overflow: 'auto' }}>
              {/* Search and Categories */}
              <Box sx={{ mb: 3 }}>
                <TextField
                  fullWidth
                  placeholder="Search menu items..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  InputProps={{
                    startAdornment: <Search sx={{ mr: 1, color: 'text.secondary' }} />,
                  }}
                  sx={{ mb: 2 }}
                />
                
                <Stack direction="row" spacing={1} sx={{ overflowX: 'auto', pb: 1 }}>
                  {getCategoryTabs().map((tab) => (
                    <Button
                      key={tab.id}
                      variant={selectedCategory === tab.id ? 'contained' : 'outlined'}
                      onClick={() => setSelectedCategory(tab.id)}
                      sx={{
                        minWidth: 140,
                        borderRadius: 2,
                        textTransform: 'none',
                        fontWeight: selectedCategory === tab.id ? 'bold' : 'normal',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        py: 1
                      }}
                    >
                      <Typography variant="body2" sx={{ fontWeight: 'inherit' }}>
                        {tab.name}
                      </Typography>
                      <Typography variant="caption" sx={{ 
                        opacity: 0.8,
                        fontSize: '0.7rem'
                      }}>
                        {tab.availableCount}/{tab.totalCount} available
                      </Typography>
                    </Button>
                  ))}
                </Stack>
              </Box>

              {/* Menu Items Grid */}
              {getFilteredMenuItems().length === 0 ? (
                <Box sx={{ 
                  display: 'flex', 
                  flexDirection: 'column', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  py: 8,
                  textAlign: 'center'
                }}>
                  <Restaurant sx={{ fontSize: 64, color: '#e0e0e0', mb: 2 }} />
                  <Typography variant="h6" color="textSecondary" gutterBottom>
                    No items available
                  </Typography>
                  <Typography variant="body2" color="textSecondary">
                    {selectedCategory === 'all' 
                      ? 'No menu items are currently available for ordering.'
                      : 'No items available in this category. Try selecting another category.'
                    }
                  </Typography>
                </Box>
              ) : (
                <Grid container spacing={2}>
                  {getFilteredMenuItems().map((item) => (
                    <Grid item xs={6} sm={4} md={3} key={item.id}>
                      <Card 
                        elevation={2}
                        sx={{ 
                          cursor: item.isAvailable ? 'pointer' : 'not-allowed',
                          borderRadius: 2,
                          transition: 'all 0.2s ease',
                          opacity: item.isAvailable ? 1 : 0.6,
                          filter: item.isAvailable ? 'none' : 'grayscale(0.7)',
                          '&:hover': item.isAvailable ? {
                            transform: 'translateY(-2px)',
                            boxShadow: theme => theme.shadows[8],
                          } : {},
                          height: '100%',
                          display: 'flex',
                          flexDirection: 'column',
                          position: 'relative'
                        }}
                        onClick={() => item.isAvailable && addMenuItem(item)}
                      >
                        {/* Unavailable overlay */}
                        {!item.isAvailable && (
                          <Box sx={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            backgroundColor: 'rgba(0, 0, 0, 0.1)',
                            borderRadius: 2,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            zIndex: 1
                          }}>
                            <Chip 
                              label="Unavailable" 
                              color="error" 
                              size="small"
                              sx={{ fontWeight: 'bold' }}
                            />
                          </Box>
                        )}
                        
                        {item.image && (
                          <CardMedia
                            component="img"
                            height="120"
                            image={item.image}
                            alt={item.name}
                            sx={{ objectFit: 'cover' }}
                          />
                        )}
                        <CardContent sx={{ flexGrow: 1, p: 2 }}>
                          <Typography variant="subtitle2" sx={{ 
                            fontWeight: 'bold', 
                            fontSize: '0.9rem',
                            mb: 1,
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden'
                          }}>
                            {item.name}
                          </Typography>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Typography variant="h6" sx={{ 
                              color: 'primary.main', 
                              fontWeight: 'bold',
                              fontSize: '1.1rem'
                            }}>
                              ₱{item.price.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                            </Typography>
                            {item.isAvailable && (
                              <Chip 
                                label="Available" 
                                color="success" 
                                size="small" 
                                variant="outlined"
                                sx={{ fontSize: '0.7rem' }}
                              />
                            )}
                          </Box>
                          {item.preparationTime && (
                            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                              🕐 {item.preparationTime} min prep time
                            </Typography>
                          )}
                        </CardContent>
                      </Card>
                    </Grid>
                  ))}
                </Grid>
              )}
            </Box>

            {/* Right Side - Current Order */}
            <Box sx={{ 
              width: 400, 
              bgcolor: 'white', 
              borderLeft: '1px solid #e2e8f0',
              display: 'flex',
              flexDirection: 'column'
            }}>
              {/* Order Header */}
              <Box sx={{ p: 3, borderBottom: '1px solid #e2e8f0' }}>
                <Typography variant="h6" sx={{ fontWeight: 'bold', mb: 2 }}>
                  Current Order
                </Typography>
                
                {/* Customer Info */}
                <Stack spacing={2}>
                  <TextField
                    fullWidth
                    label="Customer Name"
                    value={newOrder.customerName}
                    onChange={(e) => setNewOrder({ ...newOrder, customerName: e.target.value })}
                    size="small"
                    InputProps={{ 
                      startAdornment: <Person sx={{ mr: 1, color: 'text.secondary' }} /> 
                    }}
                  />
                  
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <FormControl
                      size="small"
                      sx={{ flex: 1 }}
                      onClick={() => {
                        console.log('Type FormControl clicked');
                        // try to programmatically focus the underlying select
                        const el = document.getElementById('order-type-native');
                        if (el && typeof el.focus === 'function') el.focus();
                      }}
                    >
                      <InputLabel shrink htmlFor="order-type-native">Type</InputLabel>
                      <NativeSelect
                        id="order-type-native"
                        value={newOrder.orderType}
                        onChange={(e) => setNewOrder({ ...newOrder, orderType: e.target.value })}
                        inputProps={{ name: 'orderType' }}
                        sx={{ borderRadius: 1, border: '1px solid rgba(0,0,0,0.08)', px: 1 }}
                      >
                        <option value="dine-in">Dine In</option>
                        <option value="takeaway">Takeaway</option>
                        <option value="delivery">Delivery</option>
                      </NativeSelect>
                    </FormControl>
                    <IconButton size="small" onClick={() => {
                      const next = newOrder.orderType === 'dine-in' ? 'takeaway' : (newOrder.orderType === 'takeaway' ? 'delivery' : 'dine-in');
                      console.log('Debug toggle orderType ->', next);
                      setNewOrder({ ...newOrder, orderType: next });
                    }} sx={{ alignSelf: 'center' }}>
                      <Refresh fontSize="small" />
                    </IconButton>
                    
                    {newOrder.orderType === 'dine-in' && (
                      <TextField
                        label="Table"
                        value={newOrder.tableNumber}
                        onChange={(e) => setNewOrder({ ...newOrder, tableNumber: e.target.value })}
                        size="small"
                        sx={{ width: 80 }}
                      />
                    )}
                    
                    {newOrder.orderType === 'delivery' && (
                      <TextField
                        label="Delivery Address"
                        value={newOrder.deliveryAddress}
                        onChange={(e) => setNewOrder({ ...newOrder, deliveryAddress: e.target.value })}
                        multiline
                        rows={2}
                        size="small"
                        sx={{ minWidth: 200 }}
                        placeholder="Enter full delivery address"
                      />
                    )}
                  </Box>
                </Stack>
              </Box>

              {/* Order Items */}
              <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
                {selectedMenuItems.length === 0 ? (
                  <Box sx={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    height: '100%',
                    color: 'text.secondary'
                  }}>
                    <ShoppingCart sx={{ fontSize: 48, mb: 2 }} />
                    <Typography>No items added</Typography>
                    <Typography variant="caption">Select items from menu</Typography>
                  </Box>
                ) : (
                  <Stack spacing={1}>
                    {selectedMenuItems.map((item, index) => (
                      <Card key={index} elevation={1} sx={{ p: 2 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <Box sx={{ flex: 1 }}>
                            <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
                              {item.name}
                            </Typography>
                            <Typography variant="body2" color="primary.main" sx={{ fontWeight: 'bold' }}>
                              ₱{item.price.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                            </Typography>
                          </Box>
                          
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <IconButton 
                              size="small" 
                              onClick={() => {
                                if (item.quantity > 1) {
                                  setSelectedMenuItems(prev =>
                                    prev.map(prevItem =>
                                      prevItem.id === item.id
                                        ? { ...prevItem, quantity: prevItem.quantity - 1 }
                                        : prevItem
                                    )
                                  );
                                } else {
                                  removeMenuItem(item.id);
                                }
                              }}
                            >
                              <Remove />
                            </IconButton>
                            
                            <Typography sx={{ 
                              minWidth: 30, 
                              textAlign: 'center',
                              fontWeight: 'bold',
                              bgcolor: 'grey.100',
                              borderRadius: 1,
                              px: 1
                            }}>
                              {item.quantity}
                            </Typography>
                            
                            <IconButton 
                              size="small" 
                              onClick={() => {
                                setSelectedMenuItems(prev =>
                                  prev.map(prevItem =>
                                    prevItem.id === item.id
                                      ? { ...prevItem, quantity: prevItem.quantity + 1 }
                                      : prevItem
                                  )
                                );
                              }}
                            >
                              <Add />
                            </IconButton>
                            
                            <IconButton 
                              size="small" 
                              color="error"
                              onClick={() => removeMenuItem(item.id)}
                            >
                              <Delete />
                            </IconButton>
                          </Box>
                        </Box>
                        
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
                          <Typography variant="caption" color="text.secondary">
                            Subtotal:
                          </Typography>
                          <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                            ₱{(item.price * item.quantity).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                          </Typography>
                        </Box>
                      </Card>
                    ))}
                  </Stack>
                )}
              </Box>

              {/* Order Summary & Payment */}
              {selectedMenuItems.length > 0 && (
                <Box sx={{ p: 3, borderTop: '1px solid #e2e8f0', bgcolor: '#f8fafc' }}>
                  {/* Order Totals */}
                  <Box sx={{ mb: 3 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                      <Typography>Subtotal:</Typography>
                      <Typography sx={{ fontWeight: 'bold' }}>
                        ₱{calculateSubtotal().toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                      </Typography>
                    </Box>
                    
                    {newOrder.discount > 0 && (
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                        <Typography color="error">Discount:</Typography>
                        <Typography color="error" sx={{ fontWeight: 'bold' }}>
                          -₱{newOrder.discount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                        </Typography>
                      </Box>
                    )}
                    
                    <Divider sx={{ my: 1 }} />
                    
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="h6" sx={{ fontWeight: 'bold' }}>Total:</Typography>
                      <Typography variant="h6" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                        ₱{calculateTotal().toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                      </Typography>
                    </Box>
                  </Box>

                  {/* Payment Method */}
                  <FormControl fullWidth size="small" sx={{ mb: 2 }}>
                    <InputLabel>Payment Method</InputLabel>
                    <Select
                      value={newOrder.paymentMethod}
                      label="Payment Method"
                      onChange={(e) => {
                        setNewOrder({ ...newOrder, paymentMethod: e.target.value });
                        if (e.target.value !== 'cash') {
                          setCashTendered('');
                          setChangeAmount(0);
                        }
                      }}
                      MenuProps={{ disablePortal: false, PaperProps: { style: { zIndex: 2000 } } }}
                    >
                      <MenuItem value="cash">
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                          <Money sx={{ mr: 1, color: '#4caf50' }} />
                          Cash
                        </Box>
                      </MenuItem>
                      <MenuItem value="gcash">
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                          <AccountBalanceWallet sx={{ mr: 1, color: '#007dff' }} />
                          GCash
                        </Box>
                      </MenuItem>
                      <MenuItem value="paymaya">
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                          <CreditCard sx={{ mr: 1, color: '#ff6b00' }} />
                          PayMaya
                        </Box>
                      </MenuItem>
                    </Select>
                  </FormControl>

                  {/* Cash Payment Calculator */}
                  {newOrder.paymentMethod === 'cash' && (
                    <Box sx={{ mb: 2 }}>
                      <TextField
                        fullWidth
                        label="Cash Tendered"
                        type="number"
                        value={cashTendered}
                        onChange={(e) => setCashTendered(e.target.value)}
                        size="small"
                        InputProps={{
                          startAdornment: <InputAdornment position="start">₱</InputAdornment>,
                          endAdornment: (
                            <InputAdornment position="end">
                              <IconButton 
                                onClick={() => setCashTendered(calculateTotal().toString())}
                                size="small"
                              >
                                <Calculate />
                              </IconButton>
                            </InputAdornment>
                          )
                        }}
                        sx={{ mb: 1 }}
                      />
                      
                      {/* Quick Amount Buttons */}
                      <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
                        {[100, 200, 500, 1000].map((amount) => (
                          <Button
                            key={amount}
                            variant="outlined"
                            size="small"
                            onClick={() => setCashTendered(amount.toString())}
                            sx={{ flex: 1, fontSize: '0.8rem' }}
                          >
                            ₱{amount}
                          </Button>
                        ))}
                      </Stack>
                      
                      {/* Change Display */}
                      {cashTendered && (
                        <Box sx={{ 
                          p: 2, 
                          bgcolor: changeAmount >= 0 ? 'success.light' : 'error.light',
                          borderRadius: 1,
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}>
                          <Typography sx={{ fontWeight: 'bold' }}>
                            {changeAmount >= 0 ? 'Change:' : 'Insufficient:'}
                          </Typography>
                          <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
                            ₱{Math.abs(changeAmount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                          </Typography>
                        </Box>
                      )}
                    </Box>
                  )}

                  {/* Action Buttons */}
                  <Stack spacing={2}>
                    <Button
                      fullWidth
                      variant="contained"
                      size="large"
                      onClick={handleCreateOrder}
                      disabled={
                        loading || 
                        selectedMenuItems.length === 0 ||
                        (newOrder.paymentMethod === 'cash' && changeAmount < 0)
                      }
                      sx={{
                        background: 'linear-gradient(135deg, #4caf50 0%, #388e3c 100%)',
                        py: 1.5,
                        fontSize: '1.1rem',
                        fontWeight: 'bold',
                        '&:hover': {
                          background: 'linear-gradient(135deg, #45a049 0%, #2e7d32 100%)',
                        },
                      }}
                    >
                      {loading ? 'Processing...' : 'Place Order'}
                    </Button>
                    
                    <Button
                      fullWidth
                      variant="outlined"
                      onClick={() => {
                        setOpenOrderDialog(false);
                        resetNewOrder();
                      }}
                    >
                      Cancel
                    </Button>
                  </Stack>
                </Box>
              )}
            </Box>
          </Box>
        </Box>
      </Dialog>

      {/* View Order Dialog */}
      <Dialog
        open={openViewDialog}
        onClose={() => setOpenViewDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Order Details</DialogTitle>
        <DialogContent>
          {selectedOrder && (
            <Box>
              <Typography variant="h6">Order #{selectedOrder.orderNumber}</Typography>
              <Typography>Customer: {selectedOrder.customerName || 'Walk-in'}</Typography>
              <Typography>Status: {selectedOrder.status}</Typography>
              <Typography>Total: ₱{selectedOrder.total?.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</Typography>
              <Typography>
                Employee: {(() => {
                  const allUsers = ([...(socketUsers || []), ...(authUsers || [])]);
                  const matched = allUsers.find(u => u.id === selectedOrder.employeeId);
                  if (matched) return `${matched.firstName || ''} ${matched.lastName || ''}`.trim() || matched.username || matched.email || selectedOrder.employeeId;
                  if (selectedOrder.employeeName) return selectedOrder.employeeName;
                  if (!selectedOrder.employeeId) return 'System';
                  return selectedOrder.employeeId.length > 12 ? `${selectedOrder.employeeId.slice(0,8)}...` : selectedOrder.employeeId;
                })()}
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenViewDialog(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Layout>
  );
};

export default Orders;
