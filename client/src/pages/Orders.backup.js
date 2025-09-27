import React, { useState, useEffect } from 'react';
import {
  Container,
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
  MenuItem,
  Paper,
  IconButton,
  Divider,
  CardMedia,
  InputAdornment,
  alpha
} from '@mui/material';
import { QRCodeCanvas } from 'qrcode.react';
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
  Cancel as CancelIcon,
  Print as PrintIcon
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import Layout from '../components/Layout';
import ordersAPI from '../services/ordersAPI';
import menuAPI from '../services/menuAPI';
import { useAuth } from '../context/AuthContext';

const Orders = () => {
  const { user } = useAuth();
  
  // Payment method options constant
  const PAYMENT_METHODS = [
    { value: 'cash', label: 'Cash', icon: Money, color: '#4caf50' },
    { value: 'gcash', label: 'GCash', icon: AccountBalanceWallet, color: '#007dff' },
    { value: 'paymaya', label: 'PayMaya', icon: CreditCard, color: '#ff6b00' }
  ];
  
  const [orders, setOrders] = useState([]);
  const [menu, setMenu] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('all');
  const [openOrderDialog, setOpenOrderDialog] = useState(false);
  const [openViewDialog, setOpenViewDialog] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedMenuItems, setSelectedMenuItems] = useState([]);
  const [cashTendered, setCashTendered] = useState('');
  const [changeAmount, setChangeAmount] = useState(0);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [orderToCancel, setOrderToCancel] = useState(null);
  const [cancellationReason, setCancellationReason] = useState('');

  const [newOrder, setNewOrder] = useState({
    customerName: '',
    customerPhone: '',
    orderType: 'dine-in',
    tableNumber: '',
    items: [],
    paymentMethod: 'cash',
    notes: '',
    discount: 0,
  });

  // Debug log for payment method changes
  useEffect(() => {
    console.log('Payment method changed to:', newOrder.paymentMethod);
  }, [newOrder.paymentMethod]);

  // Cash change calculation effect
  useEffect(() => {
    if (cashTendered && newOrder.paymentMethod === 'cash') {
      const tendered = parseFloat(cashTendered) || 0;
      const total = calculateTotal();
      setChangeAmount(tendered - total);
    } else {
      setChangeAmount(0);
    }
  }, [cashTendered, newOrder.paymentMethod, selectedMenuItems, newOrder.discount]);

  useEffect(() => {
    fetchOrders();
    fetchMenu();
  }, []);

  const fetchOrders = async () => {
    try {
      const response = await ordersAPI.getAll();
      setOrders(response.data);
    } catch (error) {
      console.error('Error fetching orders:', error);
      toast.error('Failed to fetch orders');
    }
  };

  const fetchMenu = async () => {
    try {
      const response = await menuAPI.getAll();
      setMenu(response.data);
    } catch (error) {
      console.error('Error fetching menu:', error);
      toast.error('Failed to fetch menu');
    }
  };

  const canProcessOrders = () => {
    return user?.role === 'admin' || user?.role === 'cashier';
  };

  const calculateSubtotal = () => {
    return selectedMenuItems.reduce((total, item) => total + (item.price * item.quantity), 0);
  };

  const calculateTotal = () => {
    const subtotal = calculateSubtotal();
    return subtotal - (newOrder.discount || 0);
  };

  // Use the provided InstaPay QR code
  const getInstapayQR = () => {
    // This is your actual InstaPay QR code data
    // Replace this with the decoded data from your QR image
    return "00020101021226580010A000000772011409171234567020040001030405294802PH5915P-Town Restaurant6006Manila62160512ORD123456786304ABCD";
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
      const orderItems = selectedMenuItems.map(item => ({
        menuItemId: item.id,
        quantity: item.quantity,
        unitPrice: item.price,
        subtotal: item.price * item.quantity,
        notes: item.notes || '',
      }));

      const total = calculateTotal();

      await ordersAPI.create({
        ...newOrder,
        items: orderItems,
        total,
        subtotal: calculateSubtotal(),
      });

      toast.success('Order created successfully!');
      setOpenOrderDialog(false);
      resetNewOrder();
      fetchOrders();
    } catch (error) {
      console.error('Error creating order:', error);
      toast.error('Failed to create order');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusUpdate = async (orderId, newStatus) => {
    try {
      await ordersAPI.updateStatus(orderId, newStatus);
      toast.success(`Order status updated to ${newStatus}`);
      fetchOrders();
    } catch (error) {
      console.error('Error updating order status:', error);
      toast.error('Failed to update order status');
    }
  };

  const handleCancelOrder = (order) => {
    setOrderToCancel(order);
    setCancelDialogOpen(true);
  };

  const confirmCancelOrder = async () => {
    if (!orderToCancel || !cancellationReason) {
      toast.error('Please select a cancellation reason');
      return;
    }

    try {
      await ordersAPI.updateStatus(orderToCancel.id, 'cancelled');
      // You can also save the cancellation reason to the backend here
      toast.success(`Order #${orderToCancel.orderNumber} cancelled: ${cancellationReason}`);
      setCancelDialogOpen(false);
      setOrderToCancel(null);
      setCancellationReason('');
      fetchOrders();
    } catch (error) {
      console.error('Error cancelling order:', error);
      toast.error('Failed to cancel order');
    }
  };

  const handlePrintReceipt = (order) => {
    const receiptContent = generateReceiptContent(order);
    
    // Try to open a new window for printing
    const printWindow = window.open('', '_blank', 'width=400,height=600');
    
    if (!printWindow) {
      // If popup is blocked, create a printable div and print it directly
      const printDiv = document.createElement('div');
      printDiv.innerHTML = `
        <style>
          @media print {
            body * { visibility: hidden; }
            .print-content, .print-content * { visibility: visible; }
            .print-content { position: absolute; left: 0; top: 0; width: 100%; }
          }
          .print-content {
            font-family: 'Courier New', monospace;
            font-size: 12px;
            max-width: 300px;
            margin: 0 auto;
          }
          .receipt-header {
            text-align: center;
            border-bottom: 2px solid #000;
            padding-bottom: 10px;
            margin-bottom: 10px;
          }
          .receipt-title {
            font-size: 18px;
            font-weight: bold;
            margin-bottom: 5px;
          }
          .receipt-section {
            margin-bottom: 10px;
            border-bottom: 1px dashed #000;
            padding-bottom: 8px;
          }
          .order-item {
            display: flex;
            justify-content: space-between;
            margin-bottom: 3px;
          }
          .item-name {
            flex: 1;
          }
          .item-price {
            text-align: right;
          }
          .total-section {
            font-weight: bold;
            font-size: 14px;
            border-top: 2px solid #000;
            padding-top: 8px;
            margin-top: 10px;
          }
          .receipt-footer {
            text-align: center;
            margin-top: 15px;
            font-size: 10px;
          }
        </style>
        <div class="print-content">
          ${receiptContent}
        </div>
      `;
      
      document.body.appendChild(printDiv);
      window.print();
      document.body.removeChild(printDiv);
      
      toast.success('Receipt sent to printer');
      return;
    }
    
    // If popup window opened successfully
    printWindow.document.write(`
      <html>
        <head>
          <title>Receipt - Order #${order.orderNumber}</title>
          <style>
            body {
              font-family: 'Courier New', monospace;
              font-size: 12px;
              margin: 0;
              padding: 20px;
              max-width: 300px;
            }
            .receipt-header {
              text-align: center;
              border-bottom: 2px solid #000;
              padding-bottom: 10px;
              margin-bottom: 10px;
            }
            .receipt-title {
              font-size: 18px;
              font-weight: bold;
              margin-bottom: 5px;
            }
            .receipt-section {
              margin-bottom: 10px;
              border-bottom: 1px dashed #000;
              padding-bottom: 8px;
            }
            .order-item {
              display: flex;
              justify-content: space-between;
              margin-bottom: 3px;
            }
            .item-name {
              flex: 1;
            }
            .item-price {
              text-align: right;
            }
            .total-section {
              font-weight: bold;
              font-size: 14px;
              border-top: 2px solid #000;
              padding-top: 8px;
              margin-top: 10px;
            }
            .receipt-footer {
              text-align: center;
              margin-top: 15px;
              font-size: 10px;
            }
            @media print {
              body { margin: 0; padding: 0; }
            }
          </style>
        </head>
        <body>
          ${receiptContent}
        </body>
      </html>
    `);
    
    printWindow.document.close();
    printWindow.focus();
    
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
    
    toast.success('Receipt sent to printer');
  };

  const generateReceiptContent = (order) => {
    const now = new Date();
    return `
      <div class="receipt-header">
        <div class="receipt-title">P-TOWN RESTAURANT</div>
        <div>123 Restaurant Street</div>
        <div>Manila, Philippines</div>
        <div>Tel: (02) 123-4567</div>
      </div>
      
      <div class="receipt-section">
        <div><strong>Order #:</strong> ${order.orderNumber}</div>
        <div><strong>Date:</strong> ${new Date(order.createdAt).toLocaleDateString('en-PH')}</div>
        <div><strong>Time:</strong> ${new Date(order.createdAt).toLocaleTimeString('en-PH')}</div>
        <div><strong>Customer:</strong> ${order.customerName || 'Walk-in Customer'}</div>
        ${order.tableNumber ? `<div><strong>Table:</strong> ${order.tableNumber}</div>` : ''}
        <div><strong>Order Type:</strong> ${order.orderType || 'Dine-in'}</div>
        <div><strong>Status:</strong> ${order.status.toUpperCase()}</div>
      </div>
      
      <div class="receipt-section">
        <div style="font-weight: bold; margin-bottom: 5px;">ORDER ITEMS:</div>
        ${order.items ? order.items.map(item => `
          <div class="order-item">
            <span class="item-name">${item.name} x${item.quantity}</span>
            <span class="item-price">₱${(item.price * item.quantity).toFixed(2)}</span>
          </div>
        `).join('') : '<div>No items available</div>'}
      </div>
      
      <div class="receipt-section">
        <div><strong>Payment Method:</strong> ${
          order.paymentMethod === 'gcash' ? 'GCash' : 
          order.paymentMethod === 'paymaya' ? 'PayMaya' : 
          order.paymentMethod ? order.paymentMethod.charAt(0).toUpperCase() + order.paymentMethod.slice(1) : 'Cash'
        }</div>
      </div>
      
      <div class="total-section">
        <div class="order-item">
          <span>TOTAL AMOUNT:</span>
          <span>₱${order.total ? order.total.toFixed(2) : '0.00'}</span>
        </div>
      </div>
      
      <div class="receipt-footer">
        <div>Thank you for dining with us!</div>
        <div>Please come again soon</div>
        <div style="margin-top: 10px;">
          Printed: ${now.toLocaleDateString('en-PH')} ${now.toLocaleTimeString('en-PH')}
        </div>
      </div>
    `;
  };

  const resetNewOrder = () => {
    setNewOrder({
      customerName: '',
      customerPhone: '',
      orderType: 'dine-in',
      tableNumber: '',
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
    const existingItem = selectedMenuItems.find(item => item.id === menuItem.id);
    if (existingItem) {
      setSelectedMenuItems(prev =>
        prev.map(item =>
          item.id === menuItem.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      );
    } else {
      setSelectedMenuItems(prev => [
        ...prev,
        { ...menuItem, quantity: 1, notes: '' }
      ]);
    }
  };

  const removeMenuItem = (menuItemId) => {
    setSelectedMenuItems(prev => prev.filter(item => item.id !== menuItemId));
  };

  const getFilteredMenuItems = () => {
    let allItems = [];
    menu.forEach(category => {
      allItems = [...allItems, ...category.items.map(item => ({ 
        ...item, 
        categoryName: category.name, 
        categoryId: category.id 
      }))];
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
    const tabs = [{ id: 'all', name: 'All Categories' }];
    menu.forEach(category => {
      tabs.push({
        id: category.id,
        name: category.name
      });
    });
    return tabs;
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending': return 'warning';
      case 'preparing': return 'info';
      case 'ready': return 'success';
      case 'served': return 'secondary';
      case 'cancelled': return 'error';
      default: return 'default';
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
    return order.status === filter;
  });

  return (
    <Layout>
      <Container maxWidth="xl" sx={{ py: 2 }}>
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
                        {new Date(order.createdAt).toLocaleTimeString('en-PH', { 
                          hour: '2-digit', 
                          minute: '2-digit' 
                        })}
                      </Typography>
                    </Box>
                    <Chip
                      label={order.status.toUpperCase()}
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

                    <Button
                      fullWidth
                      variant="outlined"
                      onClick={() => handlePrintReceipt(order)}
                      startIcon={<PrintIcon />}
                      sx={{ 
                        borderRadius: 2,
                        borderColor: '#2196f3',
                        color: '#2196f3',
                        '&:hover': {
                          backgroundColor: alpha('#2196f3', 0.1),
                          borderColor: '#2196f3',
                        }
                      }}
                    >
                      Print Receipt
                    </Button>
                    
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

                    {(order.status === 'pending' || order.status === 'preparing') && (
                      <Button
                        fullWidth
                        variant="outlined"
                        color="error"
                        onClick={() => handleCancelOrder(order)}
                        startIcon={<CancelIcon />}
                        sx={{ 
                          borderRadius: 2,
                          borderColor: '#f44336',
                          color: '#f44336',
                          '&:hover': {
                            backgroundColor: alpha('#f44336', 0.1),
                            borderColor: '#f44336',
                          }
                        }}
                      >
                        Cancel Order
                      </Button>
                    )}
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Container>

      {/* New Order Dialog - Modern POS Interface */}
      <Dialog
        open={openOrderDialog}
        onClose={() => setOpenOrderDialog(false)}
        maxWidth="xl"
        fullWidth
        fullScreen
        key={`order-dialog-${openOrderDialog}`}
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
            <Box sx={{ flex: 2, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {/* Search and Categories */}
              <Box sx={{ p: 3, pb: 0 }}>
                <TextField
                  fullWidth
                  placeholder="Search menu items..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  InputProps={{
                    startAdornment: <Search sx={{ mr: 1, color: 'text.secondary' }} />,
                  }}
                  sx={{ 
                    mb: 3,
                    '& .MuiOutlinedInput-root': {
                      borderRadius: 3,
                      backgroundColor: 'white',
                      '&:hover': {
                        backgroundColor: '#f8fafc',
                      }
                    }
                  }}
                />
                
                {/* Enhanced Category Tabs */}
                <Box sx={{ 
                  display: 'flex', 
                  gap: 1, 
                  overflowX: 'auto', 
                  pb: 2,
                  '&::-webkit-scrollbar': {
                    height: 6,
                  },
                  '&::-webkit-scrollbar-track': {
                    backgroundColor: '#f1f5f9',
                    borderRadius: 3,
                  },
                  '&::-webkit-scrollbar-thumb': {
                    backgroundColor: '#cbd5e1',
                    borderRadius: 3,
                    '&:hover': {
                      backgroundColor: '#94a3b8',
                    }
                  }
                }}>
                  {getCategoryTabs().map((tab) => (
                    <Button
                      key={tab.id}
                      variant={selectedCategory === tab.id ? 'contained' : 'outlined'}
                      onClick={() => setSelectedCategory(tab.id)}
                      startIcon={tab.id === 'all' ? <Restaurant /> : null}
                      sx={{
                        minWidth: 140,
                        height: 48,
                        borderRadius: 3,
                        textTransform: 'none',
                        fontWeight: selectedCategory === tab.id ? 'bold' : 'medium',
                        fontSize: '0.9rem',
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                        ...(selectedCategory === tab.id ? {
                          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                          boxShadow: '0 4px 15px rgba(102, 126, 234, 0.4)',
                          '&:hover': {
                            background: 'linear-gradient(135deg, #5a67d8 0%, #6b46c1 100%)',
                            transform: 'translateY(-1px)',
                            boxShadow: '0 6px 20px rgba(102, 126, 234, 0.5)',
                          }
                        } : {
                          borderColor: '#e2e8f0',
                          color: '#64748b',
                          backgroundColor: 'white',
                          '&:hover': {
                            backgroundColor: '#f8fafc',
                            borderColor: '#cbd5e1',
                            transform: 'translateY(-1px)',
                            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                          }
                        }),
                        transition: 'all 0.2s ease',
                      }}
                    >
                      {tab.name}
                    </Button>
                  ))}
                </Box>
              </Box>

              {/* Menu Items Grid with Enhanced Design */}
              <Box sx={{ flex: 1, overflow: 'auto', px: 3, pb: 3 }}>
                {getFilteredMenuItems().length === 0 ? (
                  <Box sx={{ 
                    display: 'flex', 
                    flexDirection: 'column',
                    alignItems: 'center', 
                    justifyContent: 'center',
                    height: '100%',
                    textAlign: 'center',
                    py: 8
                  }}>
                    <Restaurant sx={{ fontSize: 80, color: '#e2e8f0', mb: 2 }} />
                    <Typography variant="h6" sx={{ color: '#64748b', mb: 1 }}>
                      No menu items found
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#94a3b8' }}>
                      {searchTerm ? 'Try a different search term' : 'No items available in this category'}
                    </Typography>
                  </Box>
                ) : (
                  <Grid container spacing={2.5}>
                    {getFilteredMenuItems().map((item) => (
                      <Grid item xs={6} sm={4} md={3} key={item.id}>
                        <Card 
                          elevation={0}
                          sx={{ 
                            cursor: 'pointer',
                            borderRadius: 3,
                            border: '1px solid #e2e8f0',
                            transition: 'all 0.3s ease',
                            background: 'linear-gradient(145deg, #ffffff 0%, #f8fafc 100%)',
                            '&:hover': {
                              transform: 'translateY(-4px) scale(1.02)',
                              boxShadow: '0 12px 32px rgba(0, 0, 0, 0.1)',
                              borderColor: '#667eea',
                              '& .item-price': {
                                color: '#667eea',
                                transform: 'scale(1.05)',
                              },
                              '& .add-indicator': {
                                opacity: 1,
                                transform: 'scale(1)',
                              }
                            },
                            height: '100%',
                            display: 'flex',
                            flexDirection: 'column',
                            position: 'relative',
                            overflow: 'hidden'
                          }}
                          onClick={() => addMenuItem(item)}
                        >
                          {/* Add Indicator */}
                          <Box 
                            className="add-indicator"
                            sx={{
                              position: 'absolute',
                              top: 8,
                              right: 8,
                              width: 32,
                              height: 32,
                              borderRadius: '50%',
                              backgroundColor: '#667eea',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              opacity: 0,
                              transform: 'scale(0.8)',
                              transition: 'all 0.3s ease',
                              zIndex: 2,
                              boxShadow: '0 4px 12px rgba(102, 126, 234, 0.4)'
                            }}
                          >
                            <Add sx={{ color: 'white', fontSize: 18 }} />
                          </Box>

                          {/* Image with Overlay */}
                          <Box sx={{ position: 'relative', overflow: 'hidden' }}>
                            {item.image ? (
                              <CardMedia
                                component="img"
                                height="140"
                                image={item.image}
                                alt={item.name}
                                sx={{ 
                                  objectFit: 'cover',
                                  transition: 'transform 0.3s ease',
                                  '&:hover': {
                                    transform: 'scale(1.05)',
                                  }
                                }}
                              />
                            ) : (
                              <Box sx={{
                                height: 140,
                                backgroundColor: '#f1f5f9',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}>
                                <Restaurant sx={{ fontSize: 40, color: '#cbd5e1' }} />
                              </Box>
                            )}
                            
                            {/* Category Badge */}
                            <Chip
                              label={item.categoryName}
                              size="small"
                              sx={{
                                position: 'absolute',
                                top: 8,
                                left: 8,
                                backgroundColor: 'rgba(255, 255, 255, 0.9)',
                                backdropFilter: 'blur(8px)',
                                fontSize: '0.7rem',
                                height: 24,
                                '& .MuiChip-label': {
                                  px: 1
                                }
                              }}
                            />
                          </Box>

                          <CardContent sx={{ flexGrow: 1, p: 2.5, display: 'flex', flexDirection: 'column' }}>
                            <Typography variant="subtitle1" sx={{ 
                              fontWeight: 'bold', 
                              fontSize: '1rem',
                              mb: 1,
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                              lineHeight: 1.3,
                              color: '#1e293b'
                            }}>
                              {item.name}
                            </Typography>
                            
                            {item.description && (
                              <Typography variant="caption" sx={{ 
                                color: '#64748b',
                                mb: 2,
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden',
                                lineHeight: 1.4
                              }}>
                                {item.description}
                              </Typography>
                            )}

                            <Box sx={{ mt: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <Typography 
                                variant="h6" 
                                className="item-price"
                                sx={{ 
                                  color: '#059669', 
                                  fontWeight: 'bold',
                                  fontSize: '1.2rem',
                                  transition: 'all 0.3s ease'
                                }}
                              >
                                ₱{item.price.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                              </Typography>
                              
                              {item.preparationTime && (
                                <Chip
                                  label={`${item.preparationTime} min`}
                                  size="small"
                                  variant="outlined"
                                  sx={{
                                    fontSize: '0.7rem',
                                    height: 24,
                                    borderColor: '#e2e8f0',
                                    color: '#64748b'
                                  }}
                                />
                              )}
                            </Box>
                          </CardContent>
                        </Card>
                      </Grid>
                    ))}
                  </Grid>
                )}
              </Box>
            </Box>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            </Box>

            {/* Right Side - Current Order */}
            <Box sx={{ 
              width: 420, 
              background: 'linear-gradient(145deg, #ffffff 0%, #f8fafc 100%)',
              borderLeft: '1px solid #e2e8f0',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '-4px 0 20px rgba(0, 0, 0, 0.05)'
            }}>
              {/* Order Header */}
              <Box sx={{ 
                p: 3, 
                borderBottom: '1px solid #e2e8f0',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: 'white'
              }}>
                <Typography variant="h6" sx={{ fontWeight: 'bold', mb: 2, color: 'white' }}>
                  🛒 Current Order
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
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        backgroundColor: 'rgba(255, 255, 255, 0.9)',
                        borderRadius: 2,
                        '&:hover': {
                          backgroundColor: 'white',
                        },
                        '&.Mui-focused': {
                          backgroundColor: 'white',
                        }
                      },
                      '& .MuiInputLabel-root': {
                        color: '#64748b',
                        '&.Mui-focused': {
                          color: '#667eea',
                        }
                      }
                    }}
                  />
                  
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <FormControl size="small" sx={{ flex: 1 }}>
                      <InputLabel sx={{ color: '#64748b', '&.Mui-focused': { color: '#667eea' } }}>Type</InputLabel>
                      <Select
                        value={newOrder.orderType}
                        label="Type"
                        onChange={(e) => setNewOrder({ ...newOrder, orderType: e.target.value })}
                        sx={{
                          backgroundColor: 'rgba(255, 255, 255, 0.9)',
                          borderRadius: 2,
                          '&:hover': {
                            backgroundColor: 'white',
                          },
                          '&.Mui-focused': {
                            backgroundColor: 'white',
                          }
                        }}
                      >
                        <MenuItem value="dine-in">
                          <Box sx={{ display: 'flex', alignItems: 'center' }}>
                            <Restaurant sx={{ mr: 1, fontSize: 18 }} />
                            Dine In
                          </Box>
                        </MenuItem>
                        <MenuItem value="takeaway">
                          <Box sx={{ display: 'flex', alignItems: 'center' }}>
                            <ShoppingCart sx={{ mr: 1, fontSize: 18 }} />
                            Takeaway
                          </Box>
                        </MenuItem>
                        <MenuItem value="delivery">
                          <Box sx={{ display: 'flex', alignItems: 'center' }}>
                            <LocalShipping sx={{ mr: 1, fontSize: 18 }} />
                            Delivery
                          </Box>
                        </MenuItem>
                      </Select>
                    </FormControl>
                    
                    {newOrder.orderType === 'dine-in' && (
                      <TextField
                        label="Table"
                        value={newOrder.tableNumber}
                        onChange={(e) => setNewOrder({ ...newOrder, tableNumber: e.target.value })}
                        size="small"
                        sx={{ 
                          width: 80,
                          '& .MuiOutlinedInput-root': {
                            backgroundColor: 'rgba(255, 255, 255, 0.9)',
                            borderRadius: 2,
                            '&:hover': {
                              backgroundColor: 'white',
                            },
                            '&.Mui-focused': {
                              backgroundColor: 'white',
                            }
                          },
                          '& .MuiInputLabel-root': {
                            color: '#64748b',
                            '&.Mui-focused': {
                              color: '#667eea',
                            }
                          }
                        }}
                      />
                    )}
                  </Box>
                </Stack>
              </Box>

              {/* Order Items */}
              <Box sx={{ flex: 1, overflow: 'auto', p: 3 }}>
                {selectedMenuItems.length === 0 ? (
                  <Box sx={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    height: '100%',
                    color: '#64748b',
                    textAlign: 'center'
                  }}>
                    <ShoppingCart sx={{ fontSize: 64, mb: 2, color: '#e2e8f0' }} />
                    <Typography variant="h6" sx={{ mb: 1, color: '#64748b' }}>
                      No items added
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#94a3b8' }}>
                      Select items from the menu to start building your order
                    </Typography>
                  </Box>
                ) : (
                  <Stack spacing={2}>
                    {selectedMenuItems.map((item, index) => (
                      <Card 
                        key={index} 
                        elevation={0}
                        sx={{ 
                          p: 2.5,
                          border: '1px solid #e2e8f0',
                          borderRadius: 2,
                          background: 'linear-gradient(145deg, #ffffff 0%, #f8fafc 100%)',
                          transition: 'all 0.2s ease',
                          '&:hover': {
                            borderColor: '#cbd5e1',
                            transform: 'translateY(-1px)',
                            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)'
                          }
                        }}
                      >
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                          <Box sx={{ flex: 1 }}>
                            <Typography variant="subtitle1" sx={{ fontWeight: 'bold', color: '#1e293b', mb: 0.5 }}>
                              {item.name}
                            </Typography>
                            <Typography variant="body1" sx={{ color: '#059669', fontWeight: 'bold' }}>
                              ₱{item.price.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                            </Typography>
                          </Box>
                          
                          <IconButton 
                            size="small" 
                            onClick={() => removeMenuItem(index)}
                            sx={{ 
                              color: '#ef4444',
                              '&:hover': { 
                                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                                transform: 'scale(1.1)'
                              }
                            }}
                          >
                            <Delete />
                          </IconButton>
                        </Box>
                        
                        <Box sx={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'space-between',
                          backgroundColor: '#f8fafc',
                          borderRadius: 1.5,
                          p: 1
                        }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <IconButton 
                              size="small" 
                              onClick={() => {
                                if (item.quantity > 1) {
                                  setSelectedMenuItems(prev =>
                                    prev.map((prevItem, prevIndex) =>
                                      prevIndex === index
                                        ? { ...prevItem, quantity: prevItem.quantity - 1 }
                                        : prevItem
                                    )
                                  );
                                }
                              }}
                              disabled={item.quantity <= 1}
                              sx={{ 
                                backgroundColor: item.quantity <= 1 ? '#f1f5f9' : '#667eea',
                                color: item.quantity <= 1 ? '#94a3b8' : 'white',
                                width: 32,
                                height: 32,
                                '&:hover': {
                                  backgroundColor: item.quantity <= 1 ? '#f1f5f9' : '#5a67d8',
                                  transform: item.quantity > 1 ? 'scale(1.1)' : 'none'
                                },
                                '&.Mui-disabled': {
                                  backgroundColor: '#f1f5f9',
                                  color: '#94a3b8'
                                }
                              }}
                            >
                              <Remove sx={{ fontSize: 16 }} />
                            </IconButton>
                            
                            <Typography 
                              variant="h6" 
                              sx={{ 
                                minWidth: 40, 
                                textAlign: 'center',
                                fontWeight: 'bold',
                                color: '#1e293b',
                                fontSize: '1.1rem'
                              }}
                            >
                              {item.quantity}
                            </Typography>
                            
                            <IconButton 
                              size="small" 
                              onClick={() => {
                                setSelectedMenuItems(prev =>
                                  prev.map((prevItem, prevIndex) =>
                                    prevIndex === index
                                      ? { ...prevItem, quantity: prevItem.quantity + 1 }
                                      : prevItem
                                  )
                                );
                              }}
                              sx={{ 
                                backgroundColor: '#10b981',
                                color: 'white',
                                width: 32,
                                height: 32,
                                '&:hover': {
                                  backgroundColor: '#059669',
                                  transform: 'scale(1.1)'
                                }
                              }}
                            >
                              <Add sx={{ fontSize: 16 }} />
                            </IconButton>
                          </Box>
                          
                          <Typography variant="body1" sx={{ fontWeight: 'bold', color: '#059669' }}>
                            ₱{(item.price * item.quantity).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                          </Typography>
                        </Box>
                      </Card>
                    ))}
                  </Stack>
                )}
              </Box>
                            
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
                      key={`payment-method-${Date.now()}`}
                      onChange={(e) => {
                        console.log('Payment method selected:', e.target.value);
                        setNewOrder({ ...newOrder, paymentMethod: e.target.value });
                        if (e.target.value !== 'cash') {
                          setCashTendered('');
                          setChangeAmount(0);
                        }
                      }}
                    >
                      {PAYMENT_METHODS.map((method) => (
                        <MenuItem key={method.value} value={method.value}>
                          <Box sx={{ display: 'flex', alignItems: 'center' }}>
                            <method.icon sx={{ mr: 1, color: method.color }} />
                            {method.label}
                          </Box>
                        </MenuItem>
                      ))}
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

                  {/* GCash QR Code Payment */}
                  {newOrder.paymentMethod === 'gcash' && (
                    <Box sx={{ mb: 2 }}>
                      <Paper 
                        elevation={2} 
                        sx={{ 
                          p: 3, 
                          bgcolor: '#f8fafc',
                          border: '2px solid #007dff',
                          borderRadius: 2,
                          textAlign: 'center'
                        }}
                      >
                        <Typography variant="h6" sx={{ mb: 2, color: '#007dff', fontWeight: 'bold' }}>
                          <AccountBalanceWallet sx={{ mr: 1, verticalAlign: 'middle' }} />
                          GCash Payment
                        </Typography>
                        
                        <Box sx={{ 
                          display: 'flex', 
                          flexDirection: 'column', 
                          alignItems: 'center',
                          gap: 2
                        }}>
                          {/* QR Code */}
                          <Box sx={{ 
                            p: 2, 
                            bgcolor: 'white', 
                            borderRadius: 2,
                            border: '1px solid #e2e8f0'
                          }}>
                            <QRCodeCanvas 
                              value={getInstapayQR()}
                              size={200}
                              level="M"
                              includeMargin={true}
                            />
                          </Box>
                          
                          {/* Payment Details */}
                          <Box sx={{ textAlign: 'center' }}>
                            <Typography variant="h5" sx={{ fontWeight: 'bold', color: '#007dff', mb: 1 }}>
                              ₱{calculateTotal().toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                              P-Town Restaurant
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              Scan QR code with GCash app to pay
                            </Typography>
                          </Box>

                          {/* Payment Instructions */}
                          <Box sx={{ 
                            bgcolor: alpha('#007dff', 0.1),
                            p: 2,
                            borderRadius: 1,
                            width: '100%'
                          }}>
                            <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 1 }}>
                              Payment Instructions:
                            </Typography>
                            <Stack spacing={0.5}>
                              <Typography variant="caption">1. Open your GCash app</Typography>
                              <Typography variant="caption">2. Tap "Scan QR" or "Pay QR"</Typography>
                              <Typography variant="caption">3. Scan the QR code above</Typography>
                              <Typography variant="caption">4. Confirm payment amount</Typography>
                              <Typography variant="caption">5. Complete transaction</Typography>
                            </Stack>
                          </Box>

                          {/* Payment Status */}
                          <Box sx={{ width: '100%' }}>
                            <Button
                              fullWidth
                              variant="outlined"
                              sx={{ 
                                borderColor: '#007dff',
                                color: '#007dff',
                                '&:hover': { bgcolor: alpha('#007dff', 0.1) }
                              }}
                            >
                              Waiting for Payment Confirmation...
                            </Button>
                          </Box>
                        </Box>
                      </Paper>
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
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenViewDialog(false)}>Close</Button>
          {selectedOrder && (
            <Button 
              onClick={() => handlePrintReceipt(selectedOrder)}
              startIcon={<PrintIcon />}
              variant="contained"
              sx={{ 
                backgroundColor: '#2196f3',
                '&:hover': { backgroundColor: '#1976d2' }
              }}
            >
              Print Receipt
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Order Cancellation Dialog */}
      <Dialog 
        open={cancelDialogOpen} 
        onClose={() => setCancelDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ 
          bgcolor: '#f44336', 
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          gap: 1
        }}>
          <CancelIcon />
          Cancel Order #{orderToCancel?.orderNumber}
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <Typography variant="body1" sx={{ mb: 3 }}>
            Please select a reason for cancelling this order:
          </Typography>
          <FormControl fullWidth>
            <InputLabel>Cancellation Reason</InputLabel>
            <Select
              value={cancellationReason}
              label="Cancellation Reason"
              onChange={(e) => setCancellationReason(e.target.value)}
            >
              <MenuItem value="customer_request">Customer Request</MenuItem>
              <MenuItem value="kitchen_issue">Kitchen Issue</MenuItem>
              <MenuItem value="ingredient_unavailable">Ingredient Unavailable</MenuItem>
              <MenuItem value="payment_issue">Payment Issue</MenuItem>
              <MenuItem value="duplicate_order">Duplicate Order</MenuItem>
              <MenuItem value="kitchen_overload">Kitchen Overload</MenuItem>
              <MenuItem value="customer_no_show">Customer No Show</MenuItem>
              <MenuItem value="other">Other</MenuItem>
            </Select>
          </FormControl>
          
          {orderToCancel && (
            <Box sx={{ 
              mt: 3, 
              p: 2, 
              bgcolor: '#f5f5f5', 
              borderRadius: 1,
              border: '1px solid #e0e0e0'
            }}>
              <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 1 }}>
                Order Details:
              </Typography>
              <Typography variant="body2">
                Customer: {orderToCancel.customerName || 'Walk-in Customer'}
              </Typography>
              <Typography variant="body2">
                Total: ₱{orderToCancel.total?.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
              </Typography>
              <Typography variant="body2">
                Status: {orderToCancel.status}
              </Typography>
              <Typography variant="body2">
                Time: {new Date(orderToCancel.createdAt).toLocaleString('en-PH')}
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 3, gap: 1 }}>
          <Button 
            onClick={() => setCancelDialogOpen(false)}
            variant="outlined"
            color="inherit"
          >
            Keep Order
          </Button>
          <Button 
            onClick={confirmCancelOrder}
            variant="contained"
            color="error"
            disabled={!cancellationReason}
            startIcon={<CancelIcon />}
          >
            Cancel Order
          </Button>
        </DialogActions>
      </Dialog>
    </Layout>
  );
};

export default Orders;
