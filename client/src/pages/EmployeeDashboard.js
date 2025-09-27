import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Button,
  Fab,
  Grid,
  Card,
  CardContent,
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
  alpha,
  Stack,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from '@mui/material';
import {
  Add,
  Search,
  Restaurant,
  ShoppingCart,
  Remove,
  Delete,
  Money,
  AccountBalanceWallet,
  CreditCard,
  Payment,
  Calculate,
  Print,
  Person,
  Refresh,
  Cancel
} from '@mui/icons-material';
import { toast } from 'react-toastify';

import Layout from '../components/Layout';
import LocationTracker from '../components/LocationTracker';
import LoadingSpinner from '../components/LoadingSpinner';
import { OrderService, MenuService } from '../services/firebaseServices';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../contexts/SocketContext';

const EmployeeDashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isProcessing, startProcessing, stopProcessing } = useSocket();
  
  const [menu, setMenu] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedMenuItems, setSelectedMenuItems] = useState([]);
  const [cashTendered, setCashTendered] = useState('');
  const [changeAmount, setChangeAmount] = useState(0);

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

  // Calculation functions
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

  // Load menu data
  const fetchMenu = async () => {
    try {
      const menuData = await MenuService.getFullMenu();
      setMenu(menuData || []);
    } catch (error) {
      console.error('Error fetching menu:', error);
      toast.error('Failed to load menu');
    }
  };

  // Load menu and set up real-time subscriptions
  useEffect(() => {
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
      if (unsubscribeCategories) unsubscribeCategories();
      if (unsubscribeItems) unsubscribeItems();
    };
  }, []);

  // Add menu item - exact same logic as Orders.js
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
      resetNewOrder();
      // Remove manual fetchOrders() - real-time listener will handle the update
    } catch (error) {
      console.error('Error creating order:', error);
      toast.error('Failed to create order');
    } finally {
      setLoading(false);
    }
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
        if (category && category.items && Array.isArray(category.items)) {
          const availableItems = category.items.filter(item => item.isAvailable);
          const totalCategoryItems = category.items.length;
          
          totalAvailable += availableItems.length;
          totalItems += totalCategoryItems;
          
          tabs.push({
            id: category.id,
            name: category.name,
            availableCount: availableItems.length,
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

  if (loading) {
    return <LoadingSpinner message="Loading dashboard..." fullscreen />;
  }

  // For delivery role, show location tracker
  if (user?.role === 'delivery') {
    return (
      <Layout>
        <Box sx={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', borderRadius: 3, p: 4, mb: 4, color: 'white' }}>
          <Typography variant="h4" sx={{ fontWeight: 'bold' }}>Delivery Dashboard</Typography>
          <Typography variant="body1">Manage your deliveries and track your location</Typography>
        </Box>
        <LocationTracker showControls onLocationUpdate={() => {}} />
      </Layout>
    );
  }

  return (
    <Layout>
      <Box sx={{ height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column', bgcolor: '#f8fafc' }}>
        {/* Header - Mobile Responsive */}
        <Box sx={{ 
          bgcolor: 'white', 
          p: { xs: 2, md: 3 }, 
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <Typography variant="h5" sx={{ fontWeight: 'bold', color: 'primary.main', fontSize: { xs: '1.05rem', md: '1.4rem' } }}>
            P-Town POS - New Order
          </Typography>
        </Box>

        <Box sx={{ 
          display: 'flex', 
          flex: 1, 
          overflow: 'hidden',
          flexDirection: { xs: 'column', md: 'row' },
          // Explicit handling for iPad 10th gen widths (~820px)
          '@media (max-width:820px)': {
            flexDirection: 'column'
          }
        }}>
          {/* Left Side - Menu Items */}
          <Box sx={{ 
            flex: { xs: 1, lg: 2 }, 
            p: { xs: 2, md: 3 }, 
            overflow: 'auto',
            height: { xs: '50vh', lg: 'auto' },
            // Slightly larger touch area on tablets
            '@media (min-width:700px) and (max-width:1024px)': {
              padding: 3
            }
          }}>
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
                      minWidth: { xs: 110, md: 150 },
                      borderRadius: 2,
                      textTransform: 'none',
                      fontWeight: selectedCategory === tab.id ? 'bold' : 'normal',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      py: 1
                    ,
                      // iPad-specific tweaks
                      '@media (max-width:820px)': {
                        minWidth: 120,
                        py: 1.25
                      }
                    }}
                  >
                    <Typography variant="body2" sx={{ fontWeight: 'inherit', fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>
                      {tab.name}
                    </Typography>
                    <Typography variant="caption" sx={{ 
                      opacity: 0.8,
                      fontSize: { xs: '0.6rem', sm: '0.7rem' }
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
                  <Grid item xs={6} sm={4} md={3} lg={4} xl={3} key={item.id}>
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
                        // ensure a comfortable tap target on tablets
                        minHeight: { xs: 140, md: 170 },
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
                          image={item.image}
                          alt={item.name}
                          sx={{ objectFit: 'cover', height: { xs: 100, md: 140 } }}
                        />
                      )}
                      <CardContent sx={{ flexGrow: 1, p: 2 }}>
                        <Typography variant="subtitle2" sx={{ 
                          fontWeight: 'bold', 
                          fontSize: { xs: '0.8rem', sm: '0.9rem' },
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
                            fontSize: { xs: '1rem', sm: '1.1rem' }
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
            width: { xs: '100%', md: 420, lg: 400 }, 
            bgcolor: 'white', 
            borderLeft: { lg: '1px solid #e2e8f0' },
            borderTop: { xs: '1px solid #e2e8f0', lg: 'none' },
            display: 'flex',
            flexDirection: 'column',
            height: { xs: '50vh', lg: 'auto' },
            // make the order panel sticky on larger devices but full width on iPad portrait
            position: { md: 'sticky', xs: 'relative' },
            top: { md: 64 },
            '@media (max-width:820px)': {
              width: '100%',
              borderLeft: 'none',
              borderTop: '1px solid #e2e8f0'
            }
          }}>
            {/* Order Header */}
            <Box sx={{ p: { xs: 2, md: 3 }, borderBottom: '1px solid #e2e8f0' }}>
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
                
                <Box sx={{ display: 'flex', gap: 1, flexDirection: { xs: 'column', sm: 'row' } }}>
                  <FormControl
                    size="small"
                    sx={{ flex: 1 }}
                  >
                    <InputLabel>Type</InputLabel>
                    <Select
                      value={newOrder.orderType}
                      label="Type"
                      onChange={(e) => setNewOrder({ ...newOrder, orderType: e.target.value })}
                    >
                      <MenuItem value="dine-in">Dine In</MenuItem>
                      <MenuItem value="takeaway">Takeaway</MenuItem>
                      <MenuItem value="delivery">Delivery</MenuItem>
                    </Select>
                  </FormControl>
                  <IconButton size="small" onClick={() => {
                    const next = newOrder.orderType === 'dine-in' ? 'takeaway' : (newOrder.orderType === 'takeaway' ? 'delivery' : 'dine-in');
                    setNewOrder({ ...newOrder, orderType: next });
                  }} sx={{ alignSelf: { xs: 'center', sm: 'flex-start' }, mt: { xs: 0, sm: 0.5 } }}>
                    <Refresh fontSize="small" />
                  </IconButton>
                </Box>
                
                {newOrder.orderType === 'dine-in' && (
                  <TextField
                    label="Table"
                    value={newOrder.tableNumber}
                    onChange={(e) => setNewOrder({ ...newOrder, tableNumber: e.target.value })}
                    size="small"
                    fullWidth
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
                    fullWidth
                    placeholder="Enter full delivery address"
                  />
                )}
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
                            sx={{ p: { xs: '6px', md: '10px' } }}
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
                            sx={{ p: { xs: '6px', md: '10px' } }}
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
                            sx={{ p: { xs: '6px', md: '10px' } }}
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
              <Box sx={{ p: { xs: 2, md: 3 }, borderTop: '1px solid #e2e8f0', bgcolor: '#f8fafc' }}>
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
                          sx={{ flex: 1, fontSize: { xs: '0.7rem', sm: '0.8rem' } }}
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
                      py: { xs: 1.6, md: 2 },
                      fontSize: { xs: '1.05rem', md: '1.1rem' },
                      fontWeight: 'bold',
                      '&:hover': {
                        background: 'linear-gradient(135deg, #388e3c 0%, #2e7d32 100%)',
                      }
                    }}
                    startIcon={<Payment />}
                  >
                    {loading ? 'Processing...' : 'Complete Order'}
                  </Button>
                  
                  <Button
                    fullWidth
                    variant="outlined"
                    onClick={resetNewOrder}
                    disabled={loading}
                    startIcon={<Cancel />}
                  >
                    Clear Order
                  </Button>
                </Stack>
              </Box>
            )}
          </Box>
        </Box>
      </Box>
    </Layout>
  );
};

export default EmployeeDashboard;
