import React, { useState, useEffect } from 'react';
import {
  Grid,
  Card,
  CardContent,
  CardMedia,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Paper,
  Chip,
  IconButton,
  Box,
  Divider,
  Stack,
  alpha,
  Container,
  InputAdornment,
} from '@mui/material';
import {
  Add,
  Edit,
  Delete,
  Visibility,
  ShoppingCart,
  Remove,
  Restaurant,
  LocalShipping,
  Phone,
  Person,
  TableBar,
  Payment,
  Search,
  Receipt,
  CreditCard,
  AccountBalanceWallet,
  Money,
  Calculate,
} from '@mui/icons-material';

import Layout from '../components/Layout';
import { ordersAPI, menuAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

const Orders = () => {
  const [orders, setOrders] = useState([]);
  const [menu, setMenu] = useState([]);
  const [openOrderDialog, setOpenOrderDialog] = useState(false);
  const [openViewDialog, setOpenViewDialog] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('all');
  const { user, canProcessOrders } = useAuth();

  // New order state
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

  const [selectedMenuItems, setSelectedMenuItems] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [cashTendered, setCashTendered] = useState('');
  const [changeAmount, setChangeAmount] = useState(0);

  // Calculate totals (no tax)
  const calculateSubtotal = () => {
    return selectedMenuItems.reduce((total, item) => total + (item.price * item.quantity), 0);
  };

  const calculateTotal = () => {
    const subtotal = calculateSubtotal();
    return subtotal - newOrder.discount;
  };

  // Calculate change for cash payments
  useEffect(() => {
    if (newOrder.paymentMethod === 'cash' && cashTendered) {
      const total = calculateTotal();
      const tendered = parseFloat(cashTendered) || 0;
      setChangeAmount(Math.max(0, tendered - total));
    } else {
      setChangeAmount(0);
    }
  }, [cashTendered, selectedMenuItems, newOrder.discount, newOrder.paymentMethod]);

  useEffect(() => {
    fetchOrders();
    fetchMenu();
  }, []);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const response = await ordersAPI.getAll({ limit: 100 });
      setOrders(response.data);
    } catch (error) {
      console.error('Error fetching orders:', error);
      toast.error('Failed to load orders');
    } finally {
      setLoading(false);
    }
  };

  const fetchMenu = async () => {
    try {
      const response = await menuAPI.getFullMenu();
      setMenu(response.data);
    } catch (error) {
      console.error('Error fetching menu:', error);
      toast.error('Failed to load menu');
    }
  };

  const handleCreateOrder = async () => {
    if (selectedMenuItems.length === 0) {
      toast.error('Please add at least one item to the order');
      return;
    }

    if (newOrder.paymentMethod === 'cash' && changeAmount < 0) {
      toast.error('Insufficient cash amount');
      return;
    }

    try {
      setLoading(true);
      
      const orderItems = selectedMenuItems.map(item => ({
        menuItemId: item.id,
        quantity: item.quantity,
        unitPrice: item.price,
        specialInstructions: item.notes || '',
      }));

      await ordersAPI.create({
        ...newOrder,
        items: orderItems,
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

  const updateItemQuantity = (menuItemId, quantity) => {
    if (quantity <= 0) {
      removeMenuItem(menuItemId);
      return;
    }
    setSelectedMenuItems(prev =>
      prev.map(item =>
        item.id === menuItemId
          ? { ...item, quantity }
          : item
      )
    );
  };

  const calculateSubtotal = () => {
    return selectedMenuItems.reduce((total, item) => total + (item.price * item.quantity), 0);
  };

  // Filter menu items
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

  const calculateSubtotal = () => {
    return selectedMenuItems.reduce((total, item) => total + (item.price * item.quantity), 0);
  };

  const calculateTotal = () => {
    const subtotal = calculateSubtotal();
    return subtotal - newOrder.discount;
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
                        minWidth: 120,
                        borderRadius: 2,
                        textTransform: 'none',
                        fontWeight: selectedCategory === tab.id ? 'bold' : 'normal',
                      }}
                    >
                      {tab.name}
                    </Button>
                  ))}
                </Stack>
              </Box>

              {/* Menu Items Grid */}
              <Grid container spacing={2}>
                {getFilteredMenuItems().map((item) => (
                  <Grid item xs={6} sm={4} md={3} key={item.id}>
                    <Card 
                      elevation={2}
                      sx={{ 
                        cursor: 'pointer',
                        borderRadius: 2,
                        transition: 'all 0.2s ease',
                        '&:hover': {
                          transform: 'translateY(-2px)',
                          boxShadow: theme => theme.shadows[8],
                        },
                        height: '100%',
                        display: 'flex',
                        flexDirection: 'column'
                      }}
                      onClick={() => addMenuItem(item)}
                    >
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
                        <Typography variant="h6" sx={{ 
                          color: 'primary.main', 
                          fontWeight: 'bold',
                          fontSize: '1.1rem'
                        }}>
                          ₱{item.price.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                        </Typography>
                        {item.preparationTime && (
                          <Typography variant="caption" color="text.secondary">
                            {item.preparationTime} min
                          </Typography>
                        )}
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
              </Grid>
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
                    <FormControl size="small" sx={{ flex: 1 }}>
                      <InputLabel shrink htmlFor="order-type-native-backup">Type</InputLabel>
                      <NativeSelect
                        id="order-type-native-backup"
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
                    
                    {newOrder.orderType === 'dine-in' && (
                      <TextField
                        label="Table"
                        value={newOrder.tableNumber}
                        onChange={(e) => setNewOrder({ ...newOrder, tableNumber: e.target.value })}
                        size="small"
                        sx={{ width: 80 }}
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
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Add Items
                  </Typography>
                  {menu.map((category) => (
                    <Box key={category.id} sx={{ mb: 2 }}>
                      <Typography variant="subtitle1" color="primary" gutterBottom>
                        {category.name}
                      </Typography>
                      {category.items.map((item) => (
                        <Box
                          key={item.id}
                          sx={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            p: 1,
                            border: '1px solid #eee',
                            borderRadius: 1,
                            mb: 1,
                          }}
                        >
                          <Box>
                            <Typography variant="body2">{item.name}</Typography>
                              <Typography variant="caption" color="textSecondary">
                                ₱{parseFloat(item.price).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                              </Typography>
                          </Box>
                          <Button
                            size="small"
                            onClick={() => addMenuItem(item)}
                            disabled={!item.isAvailable}
                          >
                            Add
                          </Button>
                        </Box>
                      ))}
                    </Box>
                  ))}
                </CardContent>
              </Card>
            </Grid>

            {/* Selected Items */}
            <Grid size={{ xs: 12 }}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Order Items
                  </Typography>
                  {selectedMenuItems.length === 0 ? (
                    <Typography color="textSecondary">No items selected</Typography>
                  ) : (
                    <List>
                      {selectedMenuItems.map((item) => (
                        <ListItem key={item.id}>
                          <ListItemText
                            primary={item.name}
                            secondary={`₱${parseFloat(item.price).toLocaleString('en-PH', { minimumFractionDigits: 2 })} each`}
                          />
                          <Box sx={{ display: 'flex', alignItems: 'center', mr: 2 }}>
                            <IconButton
                              onClick={() => updateItemQuantity(item.id, item.quantity - 1)}
                            >
                              <Remove />
                            </IconButton>
                            <Typography sx={{ mx: 2 }}>{item.quantity}</Typography>
                            <IconButton
                              onClick={() => updateItemQuantity(item.id, item.quantity + 1)}
                            >
                              <Add />
                            </IconButton>
                          </Box>
                          <Typography sx={{ mr: 2 }}>
                            ₱{(item.price * item.quantity).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                          </Typography>
                          <IconButton onClick={() => removeMenuItem(item.id)}>
                            <Delete />
                          </IconButton>
                        </ListItem>
                      ))}
                      <Divider />
                      <ListItem>
                        <ListItemText
                          primary="Subtotal"
                          secondary={`₱${calculateSubtotal().toLocaleString('en-PH', { minimumFractionDigits: 2 })}`}
                        />
                      </ListItem>
                      <ListItem>
                        <ListItemText
                          primary="Tax (10%)"
                          secondary={`₱${calculateTax().toLocaleString('en-PH', { minimumFractionDigits: 2 })}`}
                        />
                      </ListItem>
                      <ListItem>
                        <ListItemText
                          primary={<Typography variant="h6">Total</Typography>}
                          secondary={<Typography variant="h6">₱{calculateTotal().toLocaleString('en-PH', { minimumFractionDigits: 2 })}</Typography>}
                        />
                      </ListItem>
                    </List>
                  )}
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenOrderDialog(false)}>Cancel</Button>
          <Button
            onClick={handleCreateOrder}
            variant="contained"
            disabled={loading || selectedMenuItems.length === 0}
          >
            Create Order
          </Button>
        </DialogActions>
      </Dialog>

      {/* View Order Dialog */}
      <Dialog
        open={openViewDialog}
        onClose={() => setOpenViewDialog(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Order Details</DialogTitle>
        <DialogContent>
          {selectedOrder && (
            <Box>
              <Typography variant="h6">Order #{selectedOrder.orderNumber}</Typography>
              <Typography>Customer: {selectedOrder.customerName || 'Walk-in'}</Typography>
              <Typography>Type: {selectedOrder.orderType}</Typography>
              <Typography>Status: {selectedOrder.status}</Typography>
              <Typography>Total: ₱{selectedOrder.total?.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</Typography>
              <Typography>Created: {new Date(selectedOrder.createdAt).toLocaleString()}</Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenViewDialog(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Floating Action Button */}
      <Fab
        color="primary"
        aria-label="add order"
        sx={{ position: 'fixed', bottom: 16, right: 16 }}
        onClick={() => setOpenOrderDialog(true)}
      >
        <Add />
      </Fab>
    </Layout>
  );
};

export default Orders;
