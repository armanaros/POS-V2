import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
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
  AccountBalance,
  Payment,
  Calculate,
  Print,
  Refresh,
  Cancel,
  Edit,
  TrendingUp,
  Analytics,
  AttachMoney,
  CloudUpload,
  AttachFile
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import Layout from '../components/Layout';
import LoadingSpinner from '../components/LoadingSpinner';
import { OrderService, MenuService } from '../services/firebaseServices';
// import { ordersAPI } from '../services/api'; // Unused - was for SQLite operations
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import logger from '../utils/logger';

const Orders = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, users: authUsers } = useAuth();
  const { isProcessing, startProcessing, stopProcessing, users: socketUsers } = useSocket();
  const [orders, setOrders] = useState([]);
  const [menu, setMenu] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [completedStartDate, setCompletedStartDate] = useState(null);
  const [completedEndDate, setCompletedEndDate] = useState(null);
  const [openOrderDialog, setOpenOrderDialog] = useState(false);
  const [openViewDialog, setOpenViewDialog] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [selectedOrderItems, setSelectedOrderItems] = useState([]);
  const [loadingOrderItems, setLoadingOrderItems] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedMenuItems, setSelectedMenuItems] = useState([]);
  const [cashTendered, setCashTendered] = useState('');
  const [changeAmount, setChangeAmount] = useState(0);
  
  // Delivery URL Dialog state
  const [openDeliveryDialog, setOpenDeliveryDialog] = useState(false);
  const [deliveryUrl, setDeliveryUrl] = useState('');
  const [orderForDelivery, setOrderForDelivery] = useState(null);
  
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
    paymentReceipt: null
  });
  
  // Payment receipt states
  const [paymentReceiptFile, setPaymentReceiptFile] = useState(null);
  const [paymentReceiptPreview, setPaymentReceiptPreview] = useState('');

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
      // TEMPORARILY DISABLED: SQLite dependency - will implement Firebase version
      // const response = await ordersAPI.getIncomeAnalysis();
      // setIncomeData(response.data);
      
      // Set placeholder data to avoid UI errors
      setIncomeData({
        grossDaily: 0,
        netDaily: 0,
        grossMonthly: 0,
        netMonthly: 0
      });
    } catch (error) {
      // Debug-only: this endpoint is admin-only and may return 401 for other roles.
      if (error?.response?.status === 401) {
        logger.debug && logger.debug('Income analysis returned 401 — caller handles it');
      } else {
        console.debug('Error fetching income data:', error);
      }
    }
  }, []);

  // Load income data once when user is present and privileged (admin/manager).
  const incomeFetchedRef = useRef(false);
  const dailyTimerRef = useRef(null);
  const monthlyTimerRef = useRef(null);
  useEffect(() => {
    if (!user) {
      incomeFetchedRef.current = false;
      setIncomeData(null);
      return;
    }

    const isPrivileged = user.role === 'admin' || user.role === 'manager';
    // Helper to clear any timers
    const clearIncomeTimers = () => {
      if (dailyTimerRef.current) {
        clearInterval(dailyTimerRef.current);
        dailyTimerRef.current = null;
      }
      if (monthlyTimerRef.current) {
        clearTimeout(monthlyTimerRef.current);
        monthlyTimerRef.current = null;
      }
    };

    // Helper to schedule daily and monthly refreshes
    const scheduleIncomeRefreshes = () => {
      // Clear existing timers first
      clearIncomeTimers();

      const now = new Date();
      // Schedule daily refresh at next midnight, then every 24h
      const nextMidnight = new Date(now);
      nextMidnight.setDate(now.getDate() + 1);
      nextMidnight.setHours(0, 0, 0, 0);
      const msToMidnight = nextMidnight - now;

      // One-shot to align to midnight, then an interval every 24h
      setTimeout(() => {
        fetchIncomeData().catch(() => {});
        dailyTimerRef.current = setInterval(() => fetchIncomeData().catch(() => {}), 24 * 60 * 60 * 1000);
      }, msToMidnight);

      // Schedule monthly refresh at start of next month, then reschedule recursively
      const scheduleNextMonth = () => {
        const now2 = new Date();
        const nextMonthStart = new Date(now2.getFullYear(), now2.getMonth() + 1, 1, 0, 0, 0, 0);
        const msToNextMonth = nextMonthStart - now2;
        monthlyTimerRef.current = setTimeout(async function monthlyTick() {
          try {
            await fetchIncomeData();
          } catch (e) {
            // ignore; will attempt again next month
          }
          scheduleNextMonth();
        }, msToNextMonth);
      };

      scheduleNextMonth();
    };

    if (isPrivileged && !incomeFetchedRef.current) {
      // avoid multiple concurrent attempts
      incomeFetchedRef.current = true;

      (async () => {
        const token = localStorage.getItem('token');
        if (!token) {
          logger.debug && logger.debug('Skipping income analysis fetch: no auth token');
          // mark as fetched for this session to avoid repeated unauthenticated calls
          incomeFetchedRef.current = true;
          return;
        }

        try {
          await fetchIncomeData();
          // schedule regular refreshes after successful initial fetch
          scheduleIncomeRefreshes();
        } catch (err) {
          if (err?.response?.status === 401) {
            logger.debug && logger.debug('Income analysis fetch returned 401; will not retry this session');
            incomeFetchedRef.current = true;
          } else {
            // allow future attempts if an unexpected error occurred
            incomeFetchedRef.current = false;
          }
        }
      })();
    } else if (!isPrivileged) {
      setIncomeData(null);
      incomeFetchedRef.current = false;
      // clear any scheduled timers when user is not privileged
      if (dailyTimerRef.current || monthlyTimerRef.current) {
        if (dailyTimerRef.current) { clearInterval(dailyTimerRef.current); dailyTimerRef.current = null; }
        if (monthlyTimerRef.current) { clearTimeout(monthlyTimerRef.current); monthlyTimerRef.current = null; }
      }
    }
    // Cleanup when effect re-runs/unmounts: clear timers
    return () => {
      if (dailyTimerRef.current) { clearInterval(dailyTimerRef.current); dailyTimerRef.current = null; }
      if (monthlyTimerRef.current) { clearTimeout(monthlyTimerRef.current); monthlyTimerRef.current = null; }
    };
  }, [fetchIncomeData, user]);

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
      // Filter categories for POS interface
      const posCategories = categories.filter(category => {
        // If category is inactive, don't show it in POS
        if (!category.isActive) return false;
        
        // Hide specific categories that should only appear in online orders
        // Hide categories that contain "test" (case-insensitive) from POS
        if (category.name && category.name.toLowerCase().includes('test')) {
          return false;
        }
        
        // Show all other active categories in POS
        return true;
      });
      
      const menuWithItems = posCategories.map(category => ({
        ...category,
        items: items.filter(item => item.categoryId === category.id)
      }));
  logger.debug && logger.debug('Real-time menu update (POS filtered):', menuWithItems);
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
        logger.debug && logger.debug('Real-time orders update:', realTimeOrders);

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
  logger.debug && logger.debug('Firebase menu data received:', menuData);
      
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

    // Validate payment receipt for online orders
    if (['takeaway', 'delivery'].includes(newOrder.orderType) && 
        newOrder.paymentMethod !== 'cash' && 
        !paymentReceiptFile) {
      toast.error('Please upload payment receipt for online orders');
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

      // Convert payment receipt to base64 if exists
      let paymentReceiptData = null;
      if (paymentReceiptFile) {
        paymentReceiptData = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve({
            data: e.target.result,
            name: paymentReceiptFile.name,
            type: paymentReceiptFile.type,
            size: paymentReceiptFile.size
          });
          reader.readAsDataURL(paymentReceiptFile);
        });
      }

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
        paymentReceipt: paymentReceiptData,
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

  const handleStatusUpdate = async (orderId, newStatus, deliveryUrl = null) => {
    try {
      await OrderService.updateOrderStatus(orderId, newStatus, deliveryUrl);
      toast.success(`Order status updated to ${newStatus}`);
      // Real-time listener will handle the update automatically
    } catch (error) {
      console.error('Error updating order status:', error);
      toast.error('Failed to update order status');
    }
  };

  const handleMarkOutForDelivery = (order) => {
    setOrderForDelivery(order);
    setDeliveryUrl('');
    setOpenDeliveryDialog(true);
  };

  const handleConfirmDelivery = async () => {
    if (!orderForDelivery) return;
    
    try {
      await handleStatusUpdate(orderForDelivery.id, 'out_for_delivery', deliveryUrl || null);
      setOpenDeliveryDialog(false);
      setOrderForDelivery(null);
      setDeliveryUrl('');
      toast.success('Order marked as out for delivery!');
    } catch (error) {
      console.error('Error marking order for delivery:', error);
      toast.error('Failed to mark order for delivery');
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

  const handleViewOrderDetails = async (order) => {
    try {
      setLoadingOrderItems(true);
      setSelectedOrder(order);
      setOpenViewDialog(true);
      
      // Load order items
      const items = await OrderService.getOrderItems(order.id);
      setSelectedOrderItems(items);
    } catch (error) {
      console.error('Error loading order items:', error);
      toast.error('Failed to load order items');
      setSelectedOrderItems([]);
    } finally {
      setLoadingOrderItems(false);
    }
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
      paymentReceipt: null
    });
    setSelectedMenuItems([]);
    setCashTendered('');
    setChangeAmount(0);
    setPaymentReceiptFile(null);
    setPaymentReceiptPreview('');
  };

  // Handle payment receipt file upload
  const handlePaymentReceiptUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      // Check file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast.error('File size should be less than 5MB');
        return;
      }

      // Check file type
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'application/pdf'];
      if (!allowedTypes.includes(file.type)) {
        toast.error('Please upload an image (JPG, PNG, GIF) or PDF file');
        return;
      }

      setPaymentReceiptFile(file);
      
      // Create preview for images
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
          setPaymentReceiptPreview(e.target.result);
        };
        reader.readAsDataURL(file);
      } else {
        setPaymentReceiptPreview('PDF file selected');
      }
      
      toast.success('Payment receipt uploaded successfully');
    }
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
      case 'bank_transfer': return <AccountBalance sx={{ color: '#1976d2' }} />;
      default: return <Payment />;
    }
  };

  const filteredOrders = orders.filter(order => {
    // Treat these as terminal/completed statuses (do not show in 'All')
    const completedStatuses = new Set(['served', 'completed', 'delivered', 'paid', 'cancelled']);

    // 'All' should show active/non-completed orders only (completed orders live in the Completed tab)
    if (filter === 'all') return !completedStatuses.has(order.status);

    if (filter === 'active') return ['pending', 'preparing', 'ready'].includes(order.status);

    if (filter === 'completed') {
      if (!completedStatuses.has(order.status)) return false;

      if (completedStartDate || completedEndDate) {
        const ref = order.deliveredAt || order.completedAt || order.createdAt || null;
        if (!ref) return false;
        const completedAt = ref?.toDate ? ref.toDate() : (ref ? new Date(ref) : null);
        if (!completedAt || isNaN(completedAt.getTime())) return false;

        if (completedStartDate) {
          const start = new Date(completedStartDate);
          start.setHours(0,0,0,0);
          if (completedAt < start) return false;
        }
        if (completedEndDate) {
          const end = new Date(completedEndDate);
          end.setHours(23,59,59,999);
          if (completedAt > end) return false;
        }
      }

      return true;
    }

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
                <Grid size={{ xs: 12, md: 4 }}>
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
                <Grid size={{ xs: 12, md: 4 }}>
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
                <Grid size={{ xs: 12, md: 4 }}>
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
              { value: 'out_for_delivery', label: 'Out for Delivery', icon: <LocalShipping /> },
              { value: 'delivered', label: 'Delivered', icon: <LocalShipping /> },
              { value: 'cancelled', label: 'Cancelled', icon: <Cancel /> },
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
          {/* Date range controls for Completed filter */}
          {filter === 'completed' && (
            <Box sx={{ mt: 2, display: 'flex', gap: 2, alignItems: 'center' }}>
              <LocalizationProvider dateAdapter={AdapterDateFns}>
                <DatePicker
                  label="Start date"
                  value={completedStartDate}
                  onChange={(newVal) => setCompletedStartDate(newVal)}
                  renderInput={(params) => <TextField {...params} size="small" />}
                />
                <DatePicker
                  label="End date"
                  value={completedEndDate}
                  onChange={(newVal) => setCompletedEndDate(newVal)}
                  renderInput={(params) => <TextField {...params} size="small" />}
                />
              </LocalizationProvider>
              <Button size="small" variant="outlined" onClick={() => { setCompletedStartDate(null); setCompletedEndDate(null); }}>
                Clear
              </Button>
            </Box>
          )}
        </Paper>

        {/* Orders Grid */}
        <Grid container spacing={3}>
          {filteredOrders.map((order) => (
            <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }} key={order.id}>
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
                  borderColor: order.employeeId === 'public' ? alpha('#ff6b35', 0.3) : alpha('#667eea', 0.1),
                  backgroundColor: order.employeeId === 'public' ? alpha('#ff6b35', 0.05) : 'white',
                }}
              >
                <CardContent sx={{ p: 3 }}>
                  {/* Order Header */}
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                    <Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                        <Typography variant="h6" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                          #{order.orderNumber}
                        </Typography>
                        {order.employeeId === 'public' && (
                          <Chip 
                            label="ONLINE" 
                            size="small" 
                            sx={{ 
                              backgroundColor: '#ff6b35',
                              color: 'white',
                              fontWeight: 'bold',
                              fontSize: '0.7rem'
                            }} 
                          />
                        )}
                      </Box>
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
                    <Box sx={{ ml: 1, flex: 1 }}>
                      <Typography variant="body1" sx={{ fontWeight: 'medium' }}>
                        {order.customerName || 'Walk-in Customer'}
                      </Typography>
                      {order.employeeId === 'public' ? (
                        <>
                          {order.customerPhone && (
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                              📞 {order.customerPhone}
                            </Typography>
                          )}
                          {order.orderType === 'delivery' && order.tableNumber && (
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                              🏠 {order.tableNumber}
                            </Typography>
                          )}
                          {order.orderType === 'takeaway' && (
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                              🥡 Pickup Order
                            </Typography>
                          )}
                        </>
                      ) : (
                        order.tableNumber && (
                          <Typography variant="caption" color="text.secondary">
                            Table {order.tableNumber}
                          </Typography>
                        )
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
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: order.employeeId === 'public' ? 2 : 3 }}>
                    {getPaymentIcon(order.paymentMethod)}
                    <Typography variant="body2" sx={{ ml: 1, textTransform: 'capitalize' }}>
                      {order.paymentMethod === 'gcash' ? 'GCash' : 
                       order.paymentMethod === 'paymaya' ? 'PayMaya' : 
                       order.paymentMethod === 'bank_transfer' ? 'Bank Transfer' :
                       order.paymentMethod}
                    </Typography>
                  </Box>

                  {/* Online orders are already accessible via the View Details button below. Removed the extra clickable indicator. */}

                  {/* Action Buttons */}
                  <Stack spacing={1}>
                    <Button
                      fullWidth
                      variant="outlined"
                      onClick={() => handleViewOrderDetails(order)}
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
                          let nextStatus;
                          if (order.status === 'pending') {
                            nextStatus = 'preparing';
                          } else if (order.status === 'preparing') {
                            nextStatus = 'ready';
                          } else if (order.status === 'ready') {
                            // For delivery orders (including online orders), go to out_for_delivery
                            if (order.orderType === 'delivery' || order.orderType === 'takeaway' || order.employeeId === 'public') {
                              handleMarkOutForDelivery(order);
                              return;
                            } else {
                              nextStatus = 'served';
                            }
                          }
                          handleStatusUpdate(order.id, nextStatus);
                        }}
                        sx={{
                          background: order.status === 'pending' ? 
                            'linear-gradient(135deg, #ff9800 0%, #f57c00 100%)' :
                            order.status === 'preparing' ?
                            'linear-gradient(135deg, #2196f3 0%, #1976d2 100%)' :
                            (order.orderType === 'delivery' || order.orderType === 'takeaway' || order.employeeId === 'public') ?
                            'linear-gradient(135deg, #9c27b0 0%, #7b1fa2 100%)' :
                            'linear-gradient(135deg, #4caf50 0%, #388e3c 100%)',
                          borderRadius: 2,
                          fontWeight: 'bold',
                        }}
                      >
                        {order.status === 'pending' ? 'Start Preparing' :
                         order.status === 'preparing' ? 'Mark Ready' : 
                         (order.orderType === 'delivery' || order.orderType === 'takeaway' || order.employeeId === 'public') ? 'Mark Out for Delivery' : 'Mark Served'}
                      </Button>
                    )}

                    {/* Delivery Status Management */}
                    {order.status === 'served' && (order.orderType === 'delivery' || order.orderType === 'takeaway' || order.employeeId === 'public') && (
                      <Button
                        fullWidth
                        variant="contained"
                        startIcon={<LocalShipping />}
                        onClick={() => handleMarkOutForDelivery(order)}
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
                    <Grid size={{ xs: 6, sm: 4, md: 3 }} key={item.id}>
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
                        logger.debug && logger.debug('Type FormControl clicked');
                        // try to programmatically focus the underlying select
                        const el = document.getElementById('order-type-native');
                        if (el && typeof el.focus === 'function') el.focus();
                      }}
                    >
                      <InputLabel shrink htmlFor="order-type-native">Type</InputLabel>
                      <NativeSelect
                        id="order-type-native"
                        value={newOrder.orderType}
                        onChange={(e) => {
                          const newOrderType = e.target.value;
                          setNewOrder({ 
                            ...newOrder, 
                            orderType: newOrderType,
                            // Reset payment method to gcash for online orders, cash for dine-in
                            paymentMethod: newOrderType === 'dine-in' ? 'cash' : 'gcash'
                          });
                          // Reset payment receipt when changing order type
                          setPaymentReceiptFile(null);
                          setPaymentReceiptPreview('');
                        }}
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
                      logger.debug && logger.debug('Debug toggle orderType ->', next);
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
                        // Reset payment receipt when changing methods
                        setPaymentReceiptFile(null);
                        setPaymentReceiptPreview('');
                      }}
                      MenuProps={{ disablePortal: false, PaperProps: { style: { zIndex: 2000 } } }}
                    >
                      {/* Show cash only for dine-in orders */}
                      {newOrder.orderType === 'dine-in' && (
                        <MenuItem value="cash">
                          <Box sx={{ display: 'flex', alignItems: 'center' }}>
                            <Money sx={{ mr: 1, color: '#4caf50' }} />
                            Cash
                          </Box>
                        </MenuItem>
                      )}
                      {/* Online payment methods for all order types */}
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
                      <MenuItem value="bank_transfer">
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                          <AccountBalance sx={{ mr: 1, color: '#1976d2' }} />
                          Bank Transfer
                        </Box>
                      </MenuItem>
                    </Select>
                  </FormControl>

                  {/* Payment Receipt Upload for Online Orders */}
                  {['takeaway', 'delivery'].includes(newOrder.orderType) && 
                   newOrder.paymentMethod !== 'cash' && (
                    <Box sx={{ mb: 2 }}>
                      <Typography variant="body2" sx={{ mb: 1, fontWeight: 'bold', color: 'primary.main' }}>
                        Payment Proof Required *
                      </Typography>
                      
                      {/* File Upload Button */}
                      <Button
                        component="label"
                        variant="outlined"
                        fullWidth
                        startIcon={<CloudUpload />}
                        sx={{ 
                          mb: 1,
                          borderStyle: 'dashed',
                          borderWidth: 2,
                          '&:hover': {
                            borderStyle: 'dashed'
                          }
                        }}
                      >
                        Upload Payment Receipt
                        <input
                          type="file"
                          hidden
                          accept="image/*,application/pdf"
                          onChange={handlePaymentReceiptUpload}
                        />
                      </Button>

                      {/* File Preview */}
                      {paymentReceiptFile && (
                        <Paper sx={{ p: 2, bgcolor: 'success.light', alpha: 0.1 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center' }}>
                              <AttachFile sx={{ mr: 1, color: 'success.main' }} />
                              <Typography variant="body2" sx={{ color: 'success.main', fontWeight: 'bold' }}>
                                {paymentReceiptFile.name}
                              </Typography>
                            </Box>
                            <Button
                              size="small"
                              color="error"
                              onClick={() => {
                                setPaymentReceiptFile(null);
                                setPaymentReceiptPreview('');
                              }}
                            >
                              Remove
                            </Button>
                          </Box>
                          
                          {/* Image Preview */}
                          {paymentReceiptPreview && paymentReceiptPreview !== 'PDF file selected' && (
                            <Box sx={{ mt: 1, textAlign: 'center' }}>
                              <img 
                                src={paymentReceiptPreview} 
                                alt="Payment Receipt Preview" 
                                style={{ 
                                  maxWidth: '100%', 
                                  maxHeight: '200px', 
                                  borderRadius: '4px',
                                  border: '1px solid #e0e0e0'
                                }} 
                              />
                            </Box>
                          )}
                        </Paper>
                      )}

                      {/* Payment Instructions */}
                      <Paper sx={{ p: 2, mt: 1, bgcolor: 'info.light', alpha: 0.1 }}>
                        <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 1 }}>
                          Payment Instructions:
                        </Typography>
                        <Typography variant="caption" component="div">
                          {newOrder.paymentMethod === 'gcash' && (
                            <>
                              • Send payment to: <strong>09XX-XXX-XXXX</strong><br/>
                              • Reference: Order #{Date.now().toString().slice(-6)}
                            </>
                          )}
                          {newOrder.paymentMethod === 'paymaya' && (
                            <>
                              • Send payment to: <strong>09XX-XXX-XXXX</strong><br/>
                              • Reference: Order #{Date.now().toString().slice(-6)}
                            </>
                          )}
                          {newOrder.paymentMethod === 'bank_transfer' && (
                            <>
                              • Bank: BPI<br/>
                              • Account: 1234-5678-90<br/>
                              • Name: P-Town Restaurant<br/>
                              • Reference: Order #{Date.now().toString().slice(-6)}
                            </>
                          )}
                          <br/>• Upload screenshot/photo of payment confirmation
                        </Typography>
                      </Paper>
                    </Box>
                  )}

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
                        (newOrder.paymentMethod === 'cash' && changeAmount < 0) ||
                        (['takeaway', 'delivery'].includes(newOrder.orderType) && 
                         newOrder.paymentMethod !== 'cash' && 
                         !paymentReceiptFile)
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
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            Order Details
            {selectedOrder?.employeeId === 'public' && (
              <Chip 
                label="ONLINE ORDER" 
                size="small" 
                sx={{ 
                  backgroundColor: '#ff6b35',
                  color: 'white',
                  fontWeight: 'bold'
                }} 
              />
            )}
          </Box>
        </DialogTitle>
        <DialogContent>
          {selectedOrder && (
            <Box sx={{ pt: 1 }}>
              {/* Order Number */}
              <Typography variant="h6" sx={{ mb: 2, color: 'primary.main' }}>
                Order #{selectedOrder.orderNumber}
              </Typography>

              {/* Order Type & Status */}
              <Box sx={{ mb: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
                  <Chip 
                    label={selectedOrder.status.toUpperCase()} 
                    color={getStatusColor(selectedOrder.status)}
                    size="small"
                  />
                  <Chip 
                    label={selectedOrder.orderType.toUpperCase()} 
                    variant="outlined"
                    size="small"
                  />
                </Box>
              </Box>

              {/* Customer Information */}
              <Paper sx={{ p: 2, mb: 2, backgroundColor: '#f8f9fa' }}>
                <Typography variant="h6" sx={{ mb: 1 }}>Customer Information</Typography>
                <Typography><strong>Name:</strong> {selectedOrder.customerName || 'Walk-in Customer'}</Typography>
                {selectedOrder.employeeId === 'public' && (
                  <>
                    {selectedOrder.customerPhone && (
                      <Typography><strong>Phone:</strong> {selectedOrder.customerPhone}</Typography>
                    )}
                    {selectedOrder.orderType === 'delivery' && selectedOrder.tableNumber && (
                      <Typography><strong>Delivery Address:</strong> {selectedOrder.tableNumber}</Typography>
                    )}
                    {selectedOrder.orderType === 'takeaway' && (
                      <Typography><strong>Service:</strong> Pickup/Takeaway</Typography>
                    )}
                  </>
                )}
                {selectedOrder.employeeId !== 'public' && selectedOrder.tableNumber && (
                  <Typography><strong>Table:</strong> {selectedOrder.tableNumber}</Typography>
                )}
              </Paper>

              {/* Order Items */}
              <Paper sx={{ p: 2, mb: 2, backgroundColor: '#f9f9f9' }}>
                <Typography variant="h6" sx={{ mb: 2 }}>Order Items</Typography>
                {loadingOrderItems ? (
                  <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                    <LoadingSpinner />
                  </Box>
                ) : selectedOrderItems.length > 0 ? (
                  <Stack spacing={1.5}>
                    {selectedOrderItems.map((item, index) => (
                      <Card key={index} elevation={1} sx={{ p: 2, backgroundColor: 'white' }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <Box sx={{ flex: 1 }}>
                            <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
                              {item.name}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              Qty: {item.quantity} × ₱{item.unitPrice?.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                            </Typography>
                            {item.specialInstructions && (
                              <Box sx={{ mt: 1, p: 1, backgroundColor: '#fff3e0', borderRadius: 1, border: '1px solid #ffcc80' }}>
                                <Typography variant="body2" sx={{ fontStyle: 'italic', color: '#e65100' }}>
                                  <strong>📝 Special Instructions:</strong> {item.specialInstructions}
                                </Typography>
                              </Box>
                            )}
                          </Box>
                          <Typography variant="h6" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                            ₱{item.totalPrice?.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                          </Typography>
                        </Box>
                      </Card>
                    ))}
                  </Stack>
                ) : (
                  <Typography color="text.secondary" sx={{ fontStyle: 'italic' }}>
                    No items found for this order
                  </Typography>
                )}
              </Paper>

              {/* Order Financial Details */}
              <Paper sx={{ p: 2, mb: 2, backgroundColor: '#f0f8f0' }}>
                <Typography variant="h6" sx={{ mb: 1 }}>Order Summary</Typography>
                <Typography><strong>Subtotal:</strong> ₱{selectedOrder.subtotal?.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</Typography>
                {selectedOrder.discount > 0 && (
                  <Typography><strong>Discount:</strong> -₱{selectedOrder.discount?.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</Typography>
                )}
                <Typography><strong>Tax:</strong> ₱{selectedOrder.tax?.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</Typography>
                <Typography variant="h6" sx={{ color: 'success.main', mt: 1 }}>
                  <strong>Total: ₱{selectedOrder.total?.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</strong>
                </Typography>
                <Typography><strong>Payment:</strong> {selectedOrder.paymentMethod.toUpperCase()}</Typography>
              </Paper>

              {/* Payment Receipt - Only show for online orders with receipt */}
              {console.log('Order data for receipt check:', {
                employeeId: selectedOrder.employeeId,
                paymentReceipt: selectedOrder.paymentReceipt,
                hasReceipt: !!selectedOrder.paymentReceipt
              })}
              {selectedOrder.employeeId === 'public' && selectedOrder.paymentReceipt && (
                <Paper sx={{ p: 2, mb: 2, backgroundColor: '#fff8e1', border: '1px solid #ffcc02' }}>
                  <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                    📧 Payment Receipt
                    <Chip 
                      label="UPLOADED BY CUSTOMER" 
                      size="small" 
                      sx={{ 
                        backgroundColor: '#ff6b35',
                        color: 'white',
                        fontWeight: 'bold'
                      }} 
                    />
                  </Typography>
                  <Box sx={{ 
                    display: 'flex', 
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 2,
                    p: 2,
                    bgcolor: 'white',
                    borderRadius: 2,
                    border: '1px dashed #ccc'
                  }}>
                    {selectedOrder.paymentReceipt.startsWith('data:image') ? (
                      <>
                        <Box
                          component="img"
                          src={selectedOrder.paymentReceipt}
                          alt="Payment Receipt"
                          sx={{
                            maxWidth: '100%',
                            maxHeight: 400,
                            borderRadius: 1,
                            border: '1px solid #ddd',
                            cursor: 'pointer'
                          }}
                          onClick={() => window.open(selectedOrder.paymentReceipt, '_blank')}
                        />
                        <Typography variant="caption" color="text.secondary">
                          Click image to view full size
                        </Typography>
                      </>
                    ) : (
                      <Box sx={{ textAlign: 'center', p: 3 }}>
                        <Typography variant="body1" sx={{ mb: 1 }}>
                          📄 Receipt File
                        </Typography>
                        <Button 
                          variant="outlined" 
                          onClick={() => window.open(selectedOrder.paymentReceipt, '_blank')}
                        >
                          View Receipt
                        </Button>
                      </Box>
                    )}
                  </Box>
                </Paper>
              )}

              {/* Payment Receipt Status for Online Orders */}
              {selectedOrder.employeeId === 'public' && (
                <Paper sx={{ p: 2, mb: 2, backgroundColor: selectedOrder.paymentReceipt ? '#e8f5e8' : '#fff3e0' }}>
                  <Typography variant="h6" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                    📧 Payment Receipt Status
                  </Typography>
                  {selectedOrder.paymentReceipt ? (
                    <Typography sx={{ color: 'success.main', fontWeight: 'bold' }}>
                      ✅ Receipt uploaded by customer
                    </Typography>
                  ) : (
                    <Typography sx={{ color: 'warning.main', fontWeight: 'bold' }}>
                      ⚠️ No payment receipt uploaded
                    </Typography>
                  )}
                </Paper>
              )}

              {/* Order Source */}
              <Paper sx={{ p: 2, backgroundColor: selectedOrder.employeeId === 'public' ? '#fff3e0' : '#e3f2fd' }}>
                <Typography variant="h6" sx={{ mb: 1 }}>Order Source</Typography>
                <Typography>
                  <strong>Created by:</strong> {(() => {
                    if (selectedOrder.employeeId === 'public') {
                      return '🌐 Online Customer (Web Order)';
                    }
                    const allUsers = ([...(socketUsers || []), ...(authUsers || [])]);
                    const matched = allUsers.find(u => u.id === selectedOrder.employeeId);
                    if (matched) return `👨‍💼 ${matched.firstName || ''} ${matched.lastName || ''}`.trim() || matched.username || matched.email || selectedOrder.employeeId;
                    if (selectedOrder.employeeName) return `👨‍💼 ${selectedOrder.employeeName}`;
                    if (!selectedOrder.employeeId) return '🏪 System';
                    return selectedOrder.employeeId.length > 12 ? `👨‍💼 ${selectedOrder.employeeId.slice(0,8)}...` : `👨‍💼 ${selectedOrder.employeeId}`;
                  })()}
                </Typography>
                <Typography>
                  <strong>Created at:</strong> {selectedOrder.createdAt?.toDate ? 
                    selectedOrder.createdAt.toDate().toLocaleString('en-PH') :
                    selectedOrder.createdAt ? 
                      new Date(selectedOrder.createdAt).toLocaleString('en-PH') :
                      'Unknown'
                  }
                </Typography>
                {selectedOrder.notes && (
                  <Typography><strong>Notes:</strong> {selectedOrder.notes}</Typography>
                )}
              </Paper>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenViewDialog(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Delivery URL Dialog */}
      <Dialog
        open={openDeliveryDialog}
        onClose={() => setOpenDeliveryDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <LocalShipping sx={{ color: 'primary.main' }} />
            Mark Order Out for Delivery
          </Box>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            {orderForDelivery && (
              <Box sx={{ mb: 3, p: 2, bgcolor: 'grey.50', borderRadius: 2 }}>
                <Typography variant="h6" sx={{ mb: 1 }}>
                  Order #{orderForDelivery.orderNumber}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Customer: {orderForDelivery.customerName}
                </Typography>
                {orderForDelivery.customerPhone && (
                  <Typography variant="body2" color="text.secondary">
                    Phone: {orderForDelivery.customerPhone}
                  </Typography>
                )}
              </Box>
            )}
            
            <Typography variant="body1" sx={{ mb: 2 }}>
              Add a delivery tracking URL from your delivery service (optional):
            </Typography>
            
            <TextField
              fullWidth
              label="Delivery Tracking URL"
              placeholder="e.g., https://grab.com/track/ABC123 or https://foodpanda.com/track/XYZ789"
              value={deliveryUrl}
              onChange={(e) => setDeliveryUrl(e.target.value)}
              sx={{ mb: 2 }}
              helperText="This URL will be shared with the customer so they can track their delivery"
            />
            
            <Box sx={{ 
              p: 2, 
              bgcolor: 'info.50', 
              borderRadius: 2, 
              border: '1px solid',
              borderColor: 'info.200'
            }}>
              <Typography variant="body2" sx={{ fontWeight: 'medium', mb: 1 }}>
                📱 Customer Notification
              </Typography>
              <Typography variant="body2" color="text.secondary">
                The customer will be notified that their order is out for delivery
                {deliveryUrl ? ' and will receive the tracking URL to monitor their delivery.' : '.'}
              </Typography>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setOpenDeliveryDialog(false)}>
            Cancel
          </Button>
          <Button 
            variant="contained" 
            onClick={handleConfirmDelivery}
            startIcon={<LocalShipping />}
            sx={{
              background: 'linear-gradient(135deg, #9c27b0 0%, #7b1fa2 100%)',
              '&:hover': {
                background: 'linear-gradient(135deg, #8e24aa 0%, #6a1b9a 100%)',
              }
            }}
          >
            Mark Out for Delivery
          </Button>
        </DialogActions>
      </Dialog>
    </Layout>
  );
};

export default Orders;
