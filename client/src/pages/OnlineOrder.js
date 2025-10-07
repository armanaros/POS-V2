import React, { useEffect, useState, useMemo, useRef } from 'react';
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  Button,
  TextField,
  Chip,
  IconButton,
  // Badge, (removed - redundant cart button removed)
  InputAdornment,
  Container,
  Paper,
  Slide,
  Fade,
  Zoom,
  keyframes
} from '@mui/material';
import {
  Add as AddIcon,
  ShoppingCart as CartIcon,
  ContentCopy as CopyIcon,
  CloseRounded as RemoveIcon,
  Search as SearchIcon,
  CheckCircle as CheckIcon,
} from '@mui/icons-material';
import toast from 'react-hot-toast';
import LoadingSpinner from '../components/LoadingSpinner';
import { MenuService, CouponService, OrderService, SystemSettingsService } from '../services/firebaseServices';
import { io as createSocket } from 'socket.io-client';
import logger from '../utils/logger';
import ItemDetailModal from '../components/ItemDetailModal';
import CheckoutModal from '../components/CheckoutModal';

const OnlineOrder = () => {
  // Debug: ensure imported components are defined at runtime (helps diagnose "Element type is invalid" errors)
  try {
    // eslint-disable-next-line no-console
    console.debug('OnlineOrder imports:', {
      LoadingSpinner: typeof LoadingSpinner,
      ItemDetailModal: typeof ItemDetailModal,
      CheckoutModal: typeof CheckoutModal,
      AddIcon: typeof AddIcon,
      CartIcon: typeof CartIcon,
      SearchIcon: typeof SearchIcon,
      CopyIcon: typeof CopyIcon
    });
  } catch (e) {}

  // Create safe local wrappers so a missing import doesn't crash the whole page
  const LS = (typeof LoadingSpinner === 'function') ? LoadingSpinner : ({ message = 'Loading...' }) => (<Box sx={{ p: 4 }}><Typography>{message}</Typography></Box>);
  const IDM = (typeof ItemDetailModal === 'function') ? ItemDetailModal : ({ open }) => open ? (<Box sx={{ p: 2 }}><Typography>Item detail (missing component)</Typography></Box>) : null;
  const CM = (typeof CheckoutModal === 'function') ? CheckoutModal : ({ open }) => open ? (<Box sx={{ p: 2 }}><Typography>Checkout (missing component)</Typography></Box>) : null;
  const [menu, setMenu] = useState([]);
  const [loading, setLoading] = useState(true);
  const socketRef = useRef(null);
  const [cart, setCart] = useState([]);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [orderPlacedId, setOrderPlacedId] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedItem, setSelectedItem] = useState(null);
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponError, setCouponError] = useState('');
  const [fetchedCoupons, setFetchedCoupons] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [paymentReceipt, setPaymentReceipt] = useState(null);
  
  // System settings state
  const [systemSettings, setSystemSettings] = useState({ onlineOrdersEnabled: true });
  const [settingsLoading, setSettingsLoading] = useState(true);

  // simple in-memory coupon catalog (replace with server validation if available)
  const AVAILABLE_COUPONS = {
    'SAVE10': { type: 'percent', value: 10, description: '10% off your order' },
    'P100': { type: 'fixed', value: 100, description: '?100 off' },
  };
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  // Animation keyframes
  const pulse = keyframes`
    0% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.05);
    }
    100% {
      transform: scale(1);
    }
  `;

  const slideInUp = keyframes`
    from {
      transform: translateY(100%);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  `;

  const checkmarkDraw = keyframes`
    0% {
      stroke-dasharray: 0 100;
    }
    100% {
      stroke-dasharray: 100 0;
    }
  `;

  // Build the categories dynamically from the loaded menu so chips match available categories.
  const getIconForCategory = (key) => {
    const k = (key || '').toLowerCase().trim();
    const map = {
      pizza: '🍕',
      burgers: '🍔',
      burger: '🍔',
      chicken: '🍗',
      dessert: '🍰',
      desserts: '🍰',
      beverage: '🥤',
      beverages: '🥤',
      drinks: '🥤',
      drink: '🥤',
      asian: '🥢',
      filipino: '🇵🇭',
      sushi: '🍣',
      pasta: '🍝',
      seafood: '🦐',
      breakfast: '🍳',
      'dried fish': '🐟',
      egg: '🥚',
      ham: '🥓',
      hotdogs: '🌭',
      longanisa: '🌭',
      snacks: '🍿',
      rice: '🍚',
      noodles: '🍜',
      'all': '🍽️',
      // Test categories
      'test 1': '🍕',
      'test 2': '🍔',
      'test 3': '🍗',
      'test 4': '🍰',
      'test 5': '🥤',
      'test 6': '🍜',
      'test 7': '🍣',
      'test 8': '🥗'
    };
    return map[k] || '🍽️';
  };

  // Build categories using the real category ids/names from the menu
  const CATEGORIES = useMemo(() => {
    try {
      if (!Array.isArray(menu) || menu.length === 0) {
        return [
          { id: 'all', name: 'All', icon: getIconForCategory('all') },
          { id: 'pizza', name: 'Pizza', icon: getIconForCategory('pizza') },
          { id: 'burgers', name: 'Burgers', icon: getIconForCategory('burgers') },
          { id: 'chicken', name: 'Chicken', icon: getIconForCategory('chicken') },
          { id: 'desserts', name: 'Desserts', icon: getIconForCategory('desserts') },
        ];
      }

      // Build a unique, ordered list of categories from the fetched menu.
      const seen = new Map();
      for (const section of menu) {
        // require explicit opt-in: only include categories where availableOnline === true
        if (section.availableOnline !== true) continue;
        const name = String(section.name || section.categoryName || '').trim();
        if (!name) continue;
        // Use consistent slug generation - always use name-based slug, not section.id
        const id = name.toLowerCase().replace(/\s+/g, '-');
        if (!seen.has(id)) {
          seen.set(id, { id, name, icon: getIconForCategory(name) });
        }
      }

      const cats = Array.from(seen.values());
      return [{ id: 'all', name: 'All', icon: getIconForCategory('all') }, ...cats];
    } catch (e) {
      return [{ id: 'all', name: 'All', icon: '🍽️' }];
    }
  }, [menu]);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const data = await MenuService.getFullMenu();
        setMenu(Array.isArray(data) ? data : []);
        // fetch active coupons from server if available
        try {
          if (CouponService && CouponService.getCoupons) {
            const list = await CouponService.getCoupons();
            setFetchedCoupons(Array.isArray(list) ? (list.filter(x => x && x.active)) : []);
          }
        } catch (e) {
          console.warn('Failed to fetch coupons:', e);
        }
      } catch (err) {
        console.error('Failed to load menu for online ordering', err);
        toast.error('Failed to load menu');
      } finally {
        setLoading(false);
      }
    })();

    // Setup socket connection for real-time menu updates
    try {
      const socket = createSocket(process.env.REACT_APP_SOCKET_URL || window.location.origin);
      // store socket to cleanup later
      socketRef.current = socket;

      socket.on('connect', () => {
        // optional: join restaurant room if applicable
        // socket.emit('join_restaurant', process.env.REACT_APP_RESTAURANT_ID || 'main');
      });

      const refreshMenu = async () => {
        try {
          const fresh = await MenuService.getFullMenu();
          setMenu(Array.isArray(fresh) ? fresh : []);
        } catch (e) {
          console.warn('Failed to refresh menu after socket event', e);
        }
      };

      socket.on('menu_item_added', refreshMenu);
      socket.on('menu_item_updated', refreshMenu);
      socket.on('menu_item_deleted', refreshMenu);
      socket.on('sync_menu', (data) => {
        // server may send menu payloads in different shape; just refresh
        refreshMenu();
      });

    } catch (e) {
      console.warn('Socket initialization failed', e);
    }

    return () => {
      try {
        if (socketRef.current) {
          socketRef.current.disconnect();
          socketRef.current = null;
        }
      } catch (e) {}
    };
  }, []);

  // Load system settings to check if online orders are enabled
  useEffect(() => {
    const loadSystemSettings = async () => {
      try {
        setSettingsLoading(true);
        const settings = await SystemSettingsService.getSettings();
        setSystemSettings(settings);
      } catch (error) {
        console.error('Failed to load system settings:', error);
        // Default to enabled if we can't load settings
        setSystemSettings({ onlineOrdersEnabled: true });
      } finally {
        setSettingsLoading(false);
      }
    };

    loadSystemSettings();
  }, []);

  // load cart from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem('pos_v2_cart');
      if (raw) setCart(JSON.parse(raw));
    } catch (e) {
      // ignore
    }
  }, []);

  // persist cart
  useEffect(() => {
    try { localStorage.setItem('pos_v2_cart', JSON.stringify(cart)); } catch (e) {}
  }, [cart]);

  const addToCart = (item, qty = 1) => {
    setCart(prev => {
      const found = prev.find(p => p.id === item.id);
      if (found) {
        return prev.map(p => p.id === item.id ? { ...p, quantity: p.quantity + qty } : p);
      }
      return [...prev, { id: item.id, name: item.name, price: item.price, quantity: qty, menuItemId: item.id }];
    });
    toast.success(`${item.name} added to cart`);
  };

  const handleAddFromModal = (item, qty = 1, notes = '') => {
    // attach notes into cart item
    setCart(prev => {
      const found = prev.find(p => p.id === item.id);
      if (found) {
        return prev.map(p => p.id === item.id ? { ...p, quantity: p.quantity + qty, notes: (p.notes || '') + (notes ? '\n' + notes : '') } : p);
      }
      return [...prev, { id: item.id, name: item.name, price: item.price, quantity: qty, menuItemId: item.id, notes }];
    });
    toast.success(`${item.name} added to cart`);
  };


  const closeCheckout = () => setCheckoutOpen(false);

  const handleConfirmOrder = async () => {
    // reuse handlePlaceOrder logic but ensure fields present
    await handlePlaceOrder();
    closeCheckout();
  };

  const removeFromCart = (id) => {
    const item = cart.find(c => c.id === id);
    setCart(prev => prev.filter(p => p.id !== id));
    if (item) toast(`${item.name} removed`, { icon: '🗑️' });
  };

  const changeQty = (id, delta) => {
    setCart(prev => prev.map(p => p.id === id ? { ...p, quantity: Math.max(1, p.quantity + delta) } : p));
  };

  const subtotal = cart.reduce((s, it) => s + (it.price * it.quantity), 0);

  const computeDiscount = (coupon, base) => {
    if (!coupon || base <= 0) return 0;
    if (coupon.type === 'percent') return Math.round((base * (coupon.value / 100)) * 100) / 100;
    if (coupon.type === 'fixed') return Math.min(base, coupon.value);
    return 0;
  };

  const discount = computeDiscount(appliedCoupon, subtotal);
  const tax = 0; // keep existing behavior
  const total = Math.max(0, subtotal - discount + tax);

  const handlePlaceOrder = async () => {
    if (cart.length === 0) return toast.error('Please add items to cart');
    if (!customerName || !customerPhone) return toast.error('Please enter your name and phone');
    if (!paymentMethod) return toast.error('Please select a payment method');
    if (!paymentReceipt) return toast.error('Please upload your payment receipt');

    setIsSubmitting(true);
    try {
      // Convert payment receipt to base64 for storage
      let paymentReceiptBase64 = null;
      if (paymentReceipt) {
        paymentReceiptBase64 = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.readAsDataURL(paymentReceipt);
        });
      }

      const orderData = {
        customerName,
        customerPhone,
        orderType: deliveryAddress ? 'delivery' : 'takeaway',
        tableNumber: deliveryAddress || null, // Use tableNumber field for delivery address
        items: cart.map(it => ({ 
          menuItemId: it.menuItemId || it.id, 
          name: it.name, 
          quantity: it.quantity, 
          unitPrice: it.price, 
          totalPrice: it.price * it.quantity, 
          specialInstructions: it.notes || '' 
        })),
        subtotal,
        tax,
        discount,
        total,
        coupon: appliedCoupon ? { code: appliedCoupon.code, type: appliedCoupon.type, value: appliedCoupon.value } : null,
        paymentMethod,
        paymentReceipt: paymentReceiptBase64,
        notes: deliveryAddress ? `Online delivery order - Address: ${deliveryAddress}` : 'Online takeaway order'
      };

      console.log('Sending order data to Firebase:', orderData); // Debug log
      
      // Use Firebase instead of API call
      const result = await OrderService.createPublicOrder(orderData);
      
      setOrderPlacedId(result.id || null);
      logger.debug && logger.debug('Firebase order placed', result);
      toast.success(`Order placed! Order #${result.orderNumber}`);
      setCart([]);
      setCustomerName('');
      setCustomerPhone('');
      setDeliveryAddress('');
      setPaymentMethod('');
      setPaymentReceipt(null);
      setCouponCode('');
      setAppliedCoupon(null);
    } catch (err) {
      console.error('Failed to place online order via Firebase', err);
      toast.error(`Failed to place order: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // lalamove links removed per request

  // Filter items based on search and category
  const getFilteredItems = () => {
    // Build a flattened list of items while keeping a reference to their parent category id
  const allItems = menu.flatMap(section => {
  // require explicit opt-in for online ordering
  if (section.availableOnline !== true) return [];
      const rawName = String(section.name || section.categoryName || '').trim();
      const slug = rawName.toLowerCase().replace(/\s+/g, '-');
      const sectionItems = (section.items || []).map(it => ({ ...it, __categoryId: slug, __categoryName: rawName }));
      

      
      return sectionItems;
    }).filter(i => i.isAvailable);

    let filtered = allItems;

    // Filter by category using the parent section id
    if (selectedCategory && selectedCategory !== 'all') {
      const sc = String(selectedCategory).toLowerCase();
      filtered = filtered.filter(item => {
        const itemCategoryId = String(item.__categoryId).toLowerCase();
        const itemCategoryName = String(item.__categoryName || '').toLowerCase();
        // Match by exact category slug or by category name
        return itemCategoryId === sc || itemCategoryName.replace(/\s+/g, '-') === sc;
      });
    }

    // Filter by search
    if (search.trim()) {
      const searchTerm = search.toLowerCase();
      filtered = filtered.filter(item => 
        (item.name || '').toLowerCase().includes(searchTerm) ||
        (item.description || '').toLowerCase().includes(searchTerm)
      );
    }

    return filtered;
  };

  if (loading) return <LS message="Loading menu..." />;

  const filteredItems = getFilteredItems();

  // Count items that are enabled for online ordering (used to show a clear empty state)
  const onlineItemsCount = menu.flatMap(section => {
    if (section.availableOnline !== true) return [];
    return (section.items || []).map(it => ({ ...it, __categoryId: String(section.name || section.categoryName || '').toLowerCase().replace(/\s+/g, '-') }));
  }).filter(i => i.isAvailable).length;

  // Precompute center column content:
  // - If there are no online-enabled menu items at all, show a friendly client-facing message.
  // - If the menu exists but the current filters/search yield no items, show a 'no results' message.
  // - Otherwise render the item grid.
  const centerContent = (() => {
    if (onlineItemsCount === 0) {
      return (
        <Box sx={{ width: '100%', minHeight: 260, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Box sx={{ textAlign: 'center', maxWidth: 560 }}>
            <Typography variant="h2" sx={{ fontSize: '3rem', mb: 1, opacity: 0.35 }}>🍽️</Typography>
            <Typography variant="h5" sx={{ fontWeight: 700, color: '#1f2937', mb: 1 }}>Online ordering coming soon</Typography>
            <Typography variant="body1" color="text.secondary">We're not taking online orders just yet. Please check back soon.</Typography>
          </Box>
        </Box>
      );
    }

    if (filteredItems.length === 0) {
      return (
        <Box sx={{ width: '100%', minHeight: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="h4" sx={{ fontWeight: 700, color: '#374151', mb: 0.5 }}>No items found</Typography>
            <Typography variant="body2" color="text.secondary">Try a different category or search term to discover our menu.</Typography>
          </Box>
        </Box>
      );
    }

    return (
      <Grid container spacing={2}>
        {filteredItems.map((item) => (
          <Grid size={{ xs: 6, sm: 4, md: 4, lg: 3 }} key={item.id}>
          <Card
            sx={{
              height: 240,
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              cursor: 'pointer',
              borderRadius: 2,
              overflow: 'hidden',
              border: '1px solid #f0f0f0',
              boxShadow: 'none',
              bgcolor: '#ffffff',
              transition: 'all 0.2s ease',
              '&:hover': {
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                transform: 'translateY(-1px)'
              }
            }}
            onClick={() => setSelectedItem(item)}
          >
            <Box sx={{ 
              height: { xs: 100, sm: 120 }, 
              width: '100%', 
              overflow: 'hidden', 
              position: 'relative', 
              backgroundColor: '#ffffff', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              p: { xs: 0.5, sm: 1 } 
            }}>
              {item.image ? (
                <Box 
                  component="img" 
                  src={item.image} 
                  alt={item.name} 
                  sx={{ 
                    maxWidth: '90%', 
                    maxHeight: '90%', 
                    width: 'auto', 
                    height: 'auto', 
                    objectFit: 'contain', 
                    borderRadius: 1 
                  }} 
                />
              ) : (
                <Box sx={{ 
                  width: { xs: '60px', sm: '80px' }, 
                  height: { xs: '60px', sm: '80px' }, 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  backgroundColor: '#f5f5f5', 
                  borderRadius: 2, 
                  color: '#999' 
                }}>
                  <Typography variant="h3" sx={{ fontSize: { xs: '1.5rem', sm: '2rem' } }}>🍽️</Typography>
                </Box>
              )}
            </Box>

            <CardContent sx={{ 
              display: 'flex', 
              flexDirection: 'column', 
              flexGrow: 1, 
              p: { xs: 1, sm: 2 }, 
              pt: { xs: 0.5, sm: 1 }, 
              pb: { xs: 1, sm: 1.5 }, 
              height: { xs: 100, sm: 120 }, 
              justifyContent: 'space-between' 
            }}>
              <Box>
                <Typography 
                  variant="subtitle2" 
                  sx={{ 
                    fontWeight: 500, 
                    mb: 0.5, 
                    fontSize: { xs: '0.75rem', sm: '0.875rem' }, 
                    lineHeight: 1.2, 
                    color: '#374151', 
                    textAlign: 'center',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical'
                  }}
                >
                  {item.name}
                </Typography>
                <Typography 
                  variant="h6" 
                  sx={{ 
                    fontWeight: 700, 
                    fontSize: { xs: '0.875rem', sm: '1rem' }, 
                    color: '#ff6b35', 
                    textAlign: 'center', 
                    mb: { xs: 0.5, sm: 1 } 
                  }}
                >
                  ₱{(item.price || 0).toFixed(2)}
                </Typography>
              </Box>
              <Button 
                variant="contained" 
                size="small" 
                startIcon={<AddIcon sx={{ fontSize: { xs: '0.875rem', sm: '1rem' } }} />} 
                onClick={(e) => { e.stopPropagation(); addToCart(item, 1); }} 
                sx={{ 
                  width: '100%', 
                  textTransform: 'none', 
                  borderRadius: 1.5, 
                  py: { xs: 0.5, sm: 0.75 }, 
                  fontSize: { xs: '0.7rem', sm: '0.8rem' }, 
                  fontWeight: 500, 
                  bgcolor: '#6366f1', 
                  minHeight: { xs: 28, sm: 32 },
                  '&:hover': { bgcolor: '#5855eb' },
                  '& .MuiButton-startIcon': {
                    marginRight: { xs: '4px', sm: '8px' }
                  }
                }}
              >
                Add
              </Button>
            </CardContent>
          </Card>
        </Grid>
      ))}
    </Grid>
  );
})();

  // Show loading screen while checking settings
  if (settingsLoading) {
    return <LS message="Loading system settings..." />;
  }

  // Show disabled message if online orders are turned off
  if (!systemSettings.onlineOrdersEnabled) {
    return (
      <Box sx={{ 
        minHeight: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        bgcolor: '#f8fafc'
      }}>
        <Container maxWidth="md">
          <Paper elevation={3} sx={{ p: 6, textAlign: 'center', borderRadius: 3 }}>
            <Box sx={{ mb: 3 }}>
              <Typography variant="h3" sx={{ mb: 2, color: '#ef4444', fontWeight: 700 }}>
                🚫 Online Orders Temporarily Unavailable
              </Typography>
              <Typography variant="h6" sx={{ mb: 3, color: '#6b7280' }}>
                We're sorry, but online ordering is currently disabled.
              </Typography>
              <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
                Please visit our restaurant in person or call us to place your order. 
                We apologize for any inconvenience and appreciate your understanding.
              </Typography>
            </Box>
            
            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Button 
                variant="contained" 
                color="primary"
                size="large"
                sx={{ minWidth: 150 }}
                onClick={() => window.location.reload()}
              >
                Check Again
              </Button>
              <Button 
                variant="outlined" 
                color="primary"
                size="large"
                sx={{ minWidth: 150 }}
                onClick={() => window.history.back()}
              >
                Go Back
              </Button>
            </Box>

            <Box sx={{ mt: 4, p: 2, bgcolor: '#f3f4f6', borderRadius: 2 }}>
              <Typography variant="caption" color="text.secondary">
                If you believe this is an error, please contact the restaurant administrator.
              </Typography>
            </Box>
          </Paper>
        </Container>
      </Box>
    );
  }

  return (
    <Box sx={{ 
      minHeight: '100vh', 
      bgcolor: 'transparent',
      width: '100%',
      maxWidth: '100vw',
      overflowX: 'hidden',
      position: 'relative'
    }}>
      {/* Mobile-First Compact Header */}
      <Box sx={{ 
        bgcolor: 'white',
        borderBottom: '1px solid #e5e7eb',
        position: 'sticky', 
        top: 0, 
        zIndex: 100,
        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
        width: '100%',
        overflow: 'hidden'
      }}>
        <Box sx={{ 
          maxWidth: '100vw',
          px: { xs: 1.5, sm: 2, md: 3 }, 
          py: { xs: 1, sm: 1.25, md: 1.5 },
          width: '100%'
        }}>
          {/* Mobile Layout: Single Column */}
          <Box sx={{ display: { xs: 'block', md: 'none' } }}>
            <Box sx={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between',
              mb: 1,
              width: '100%'
            }}>
              <Box sx={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 }}>
                <Box
                  sx={{
                    width: 32,
                    height: 32,
                    borderRadius: 2,
                    bgcolor: '#3b82f6',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    mr: 1.5,
                    flexShrink: 0
                  }}
                >
                  <Typography sx={{ fontSize: '1rem' }}>🍽️</Typography>
                </Box>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography 
                    variant="h6" 
                    sx={{ 
                      fontWeight: 700,
                      color: '#1f2937',
                      fontSize: '1.1rem',
                      lineHeight: 1.2,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}
                  >
                    P-Town Restaurant
                  </Typography>
                  <Typography 
                    variant="body2" 
                    sx={{ 
                      color: '#6b7280',
                      fontSize: '0.75rem',
                      lineHeight: 1.2,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}
                  >
                    Delicious meals delivered to your door
                  </Typography>
                </Box>
              </Box>
            </Box>
            {/* Mobile Search */}
            <Box sx={{ width: '100%' }}>
              <TextField
                fullWidth
                size="small"
                placeholder="Search dishes..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon sx={{ color: '#9ca3af', fontSize: '1rem' }} />
                    </InputAdornment>
                  ),
                }}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 2,
                    bgcolor: '#f9fafb',
                    border: '1px solid #e5e7eb',
                    fontSize: '0.875rem',
                    '&:hover': {
                      bgcolor: '#ffffff',
                      borderColor: '#d1d5db'
                    },
                    '&.Mui-focused': {
                      bgcolor: '#ffffff',
                      borderColor: '#3b82f6',
                      boxShadow: '0 0 0 3px rgba(59, 130, 246, 0.1)'
                    }
                  },
                  '& .MuiOutlinedInput-input': {
                    padding: '10px 12px',
                    '&::placeholder': {
                      color: '#888',
                      fontSize: '0.875rem'
                    }
                  }
                }}
              />
            </Box>
          </Box>

          {/* Desktop Layout: Two Column */}
          <Box sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center', justifyContent: 'space-between' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', flex: 1 }}>
              <Box
                sx={{
                  width: 44,
                  height: 44,
                  borderRadius: 2,
                  bgcolor: '#3b82f6',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  mr: 2.5
                }}
              >
                <Typography sx={{ fontSize: '1.6rem' }}>🍽️</Typography>
              </Box>
              <Box>
                <Typography 
                  variant="h5" 
                  sx={{ 
                    fontWeight: 700,
                    color: '#1f2937',
                    fontSize: '1.6rem',
                    lineHeight: 1.2
                  }}
                >
                  P-Town Restaurant
                </Typography>
                <Typography 
                  variant="body2" 
                  sx={{ 
                    color: '#6b7280',
                    fontSize: '0.9rem',
                    mt: 0.25
                  }}
                >
                  Delicious meals delivered to your door
                </Typography>
              </Box>
            </Box>
            <Box sx={{ width: '300px', ml: 3 }}>
              <TextField
                fullWidth
                size="medium"
                placeholder="Search dishes..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon sx={{ color: '#9ca3af', fontSize: '1.25rem' }} />
                    </InputAdornment>
                  ),
                }}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 2,
                    bgcolor: '#f9fafb',
                    border: '1px solid #e5e7eb',
                    fontSize: '1rem',
                    minHeight: '48px',
                    '&:hover': {
                      bgcolor: '#ffffff',
                      borderColor: '#d1d5db'
                    },
                    '&.Mui-focused': {
                      bgcolor: '#ffffff',
                      borderColor: '#3b82f6',
                      boxShadow: '0 0 0 3px rgba(59, 130, 246, 0.1)'
                    }
                  },
                  '& .MuiOutlinedInput-input': {
                    padding: '16px 18px',
                    '&::placeholder': {
                      color: '#888',
                      opacity: 1,
                      fontWeight: 400
                    }
                  }
                }}
              />
            </Box>
          </Box>
        </Box>
      </Box>

  {/* Responsive Layout: Desktop 3-column, Mobile stacked */}
  <Box sx={{ 
    display: { xs: 'block', md: 'flex' }, 
    height: { xs: 'auto', md: 'calc(100vh - 88px)' }, 
    overflow: { xs: 'visible', md: 'hidden' },
    bgcolor: { xs: '#f8f9fa', md: 'transparent' },
    width: '100%',
    maxWidth: '100vw'
  }}>
        {/* Categories - Mobile: Horizontal scroll, Desktop: Left sidebar */}
        <Box sx={{ 
          width: { xs: '100vw', md: 300 }, 
          maxWidth: { xs: '100vw', md: 300 },
          flexShrink: 0, 
          borderRight: { xs: 'none', md: '1px solid #e5e7eb' }, 
          borderBottom: { xs: '1px solid #e5e7eb', md: 'none' },
          bgcolor: { xs: '#ffffff', md: '#f9fafb' }, 
          height: { xs: 'auto', md: 'calc(100vh - 80px)' }, 
          overflow: { xs: 'hidden', md: 'hidden' },
          boxShadow: { xs: '0 1px 3px rgba(0,0,0,0.1)', md: 'none' }
        }}>
          <Box sx={{ 
            p: { xs: '8px 12px', sm: '12px 16px', md: '24px' }, 
            height: { xs: 'auto', md: '100%' }, 
            display: 'flex', 
            flexDirection: { xs: 'row', md: 'column' },
            width: '100%',
            maxWidth: '100%'
          }}>
            <Typography 
              variant="h6" 
              sx={{ 
                mb: { xs: 0, md: 2.5 }, 
                mr: { xs: 1, sm: 1.5, md: 0 },
                fontWeight: 600, 
                color: '#374151', 
                flexShrink: 0,
                fontSize: { xs: '0.85rem', sm: '0.9rem', md: '1.2rem' },
                display: { xs: 'block' },
                whiteSpace: 'nowrap'
              }}
            >
              Categories
            </Typography>
            <Box sx={{ 
              display: 'flex', 
              flexDirection: { xs: 'row', md: 'column' }, 
              gap: { xs: 0.5, sm: 0.75, md: 1.25 }, 
              flex: 1,
              overflowX: { xs: 'auto', md: 'visible' },
              overflowY: { xs: 'visible', md: 'auto' },
              pb: { xs: 0.5, md: 0 },
              px: { xs: 0, md: 0 },
              width: { xs: 'auto', md: '100%' },
              maxWidth: { xs: 'none', md: '100%' },
              scrollBehavior: 'smooth',
              '&::-webkit-scrollbar': {
                height: { xs: 2, md: 'auto' },
                width: { xs: 'auto', md: 2 }
              },
              '&::-webkit-scrollbar-track': {
                bgcolor: 'transparent'
              },
              '&::-webkit-scrollbar-thumb': {
                bgcolor: '#d1d5db',
                borderRadius: 1
              }
            }}>
              {onlineItemsCount === 0 ? (
                <Box sx={{ p: 2 }} />
              ) : (
                CATEGORIES.map((category) => (
                  <Chip
                    key={category.id}
                    label={`${category.icon} ${category.name}`}
                    onClick={() => setSelectedCategory(category.id)}
                    variant={selectedCategory === category.id ? 'filled' : 'outlined'}
                    sx={{
                      justifyContent: { xs: 'center', md: 'flex-start' },
                      textTransform: 'none',
                      fontWeight: 500,
                      borderRadius: { xs: 2.5, md: 2.5 },
                      px: { xs: 1, sm: 1.25, md: 2 },
                      py: { xs: 0.5, sm: 0.75, md: 1.25 },
                      minWidth: { xs: 'max-content', md: 'unset' },
                      maxWidth: { xs: 'none', md: '100%' },
                      whiteSpace: 'nowrap',
                      fontSize: { xs: '0.75rem', sm: '0.8rem', md: '0.9rem' },
                      fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                      borderColor: selectedCategory === category.id ? '#3b82f6' : '#e5e7eb',
                      bgcolor: selectedCategory === category.id ? '#3b82f6' : 'rgba(255, 255, 255, 0.9)',
                      color: selectedCategory === category.id ? '#fff' : '#374151',
                      boxShadow: { xs: '0 1px 2px rgba(0,0,0,0.05)', md: 'none' },
                      transition: 'all 0.2s ease-in-out',
                      flexShrink: 0,
                      '&:hover': {
                        transform: { xs: 'none', md: 'translateY(-1px)' },
                        boxShadow: { xs: '0 2px 4px rgba(0,0,0,0.1)', md: '0 2px 8px rgba(0,0,0,0.15)' },
                        borderColor: selectedCategory === category.id ? '#2563eb' : '#d1d5db'
                      },
                      '& .MuiChip-label': {
                        px: { xs: 0.25, sm: 0.5, md: 1 },
                        py: { xs: 0, sm: 0 },
                        fontSize: 'inherit'
                      }
                    }}
                  />
                ))
              )}
            </Box>
          </Box>
        </Box>

        {/* Main Content Area - Mobile: Full width, Desktop: Flexible */}
        <Box sx={{ 
          flex: { xs: 'none', md: 1 }, 
          width: { xs: '100vw', md: 'auto' },
          maxWidth: { xs: '100vw', md: 'none' },
          display: { xs: 'block', md: 'flex' },
          overflow: { xs: 'hidden', md: 'visible' }
        }}>
          {/* Items */}
          <Box sx={{ 
            flex: { xs: 'none', md: 1 }, 
            p: { xs: '12px', sm: '16px', md: '24px' }, 
            overflow: { xs: 'visible', md: 'auto' },
            minHeight: { xs: '60vh', md: 'auto' },
            width: '100%',
            maxWidth: '100%'
          }}>
            {centerContent}
          </Box>

          {/* Cart - Mobile: Bottom sheet style, Desktop: Right sidebar */}
          <Box sx={{ 
            width: { xs: '100%', md: 320 }, 
            flexShrink: 0, 
            borderLeft: { xs: 'none', md: '1px solid #e5e7eb' }, 
            borderTop: { xs: '1px solid #e5e7eb', md: 'none' },
            bgcolor: '#f9fafb', 
            height: { xs: 'auto', md: 'calc(100vh - 80px)' }, 
            overflow: { xs: 'visible', md: 'hidden' },
            position: { xs: 'sticky', md: 'static' },
            bottom: { xs: 0, md: 'auto' },
            zIndex: { xs: 10, md: 'auto' }
          }}>
          <Box sx={{ 
            p: { xs: 2, md: 3 }, 
            height: { xs: 'auto', md: '100%' }, 
            display: 'flex', 
            flexDirection: 'column',
            maxHeight: { xs: '400px', md: '100%' } 
          }}>
            <Typography 
              variant="h6" 
              sx={{ 
                mb: { xs: 1.5, md: 2 }, 
                fontWeight: 600, 
                color: '#374151', 
                flexShrink: 0,
                fontSize: { xs: '1rem', md: '1.25rem' }
              }}
            >
              Your Cart {cart.length > 0 && <Chip size="small" label={cart.length} sx={{ ml: 1 }} />}
            </Typography>
            {cart.length === 0 ? (
              <Box sx={{ 
                display: 'flex', 
                flexDirection: 'column', 
                alignItems: 'center', 
                justifyContent: 'center', 
                flex: 1, 
                py: 4 
              }}>
                <Typography variant="h4" sx={{ mb: 1, opacity: 0.3 }}>🛒</Typography>
                <Typography variant="body2" color="text.secondary">Your cart is empty</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>Add some delicious items to get started</Typography>
              </Box>
            ) : (
              <Box sx={{ flex: 1, overflow: 'auto', pr: 1 }}>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                  {cart.map(ci => (
                    <Paper key={ci.id} sx={{ 
                      p: 1.5, 
                      borderRadius: 2, 
                      bgcolor: 'white', 
                      border: '1px solid #f0f0f0',
                      boxShadow: 'none'
                    }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                        <Box sx={{ flex: 1 }}>
                          <Typography variant="body2" sx={{ 
                            fontWeight: 600, 
                            mb: 0.25,
                            fontSize: '0.875rem',
                            lineHeight: 1.2,
                            color: '#1f2937'
                          }}>
                            {ci.name}
                          </Typography>
                          <Typography variant="body2" sx={{ 
                            fontWeight: 600, 
                            color: '#059669',
                            fontSize: '0.8rem'
                          }}>
                            ₱{(ci.price || 0).toFixed(2)}
                          </Typography>
                        </Box>
                        <IconButton
                          size="small"
                          onClick={() => removeFromCart(ci.id)}
                          aria-label="remove"
                          sx={{
                            width: 32,
                            height: 32,
                            minWidth: 32,
                            p: 0,
                            bgcolor: '#ef4444',
                            color: '#fff',
                            borderRadius: '50%',
                            boxShadow: 'none',
                            '&:hover': {
                              bgcolor: '#dc2626'
                            }
                          }}
                        >
                          <RemoveIcon sx={{ fontSize: '16px' }} />
                        </IconButton>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <Button 
                            size="small" 
                            variant="outlined" 
                            onClick={() => changeQty(ci.id, -1)} 
                            sx={{ 
                              minWidth: 28, 
                              width: 28,
                              height: 28,
                              p: 0,
                              borderColor: '#e5e7eb',
                              color: '#6b7280',
                              fontSize: '0.875rem',
                              '&:hover': {
                                borderColor: '#d1d5db',
                                bgcolor: '#f9fafb'
                              }
                            }}
                          >
                            -
                          </Button>
                          <Typography sx={{ 
                            minWidth: 32, 
                            textAlign: 'center', 
                            fontWeight: 600,
                            fontSize: '0.875rem',
                            px: 1
                          }}>
                            {ci.quantity}
                          </Typography>
                          <Button 
                            size="small" 
                            variant="outlined" 
                            onClick={() => changeQty(ci.id, 1)} 
                            sx={{ 
                              minWidth: 28, 
                              width: 28,
                              height: 28,
                              p: 0,
                              borderColor: '#e5e7eb',
                              color: '#6b7280',
                              fontSize: '0.875rem',
                              '&:hover': {
                                borderColor: '#d1d5db',
                                bgcolor: '#f9fafb'
                              }
                            }}
                          >
                            +
                          </Button>
                        </Box>
                        <Typography variant="body2" sx={{ 
                          fontWeight: 600,
                          color: '#1f2937',
                          fontSize: '0.8rem'
                        }}>
                          ₱{((ci.price || 0) * ci.quantity).toFixed(2)}
                        </Typography>
                      </Box>
                    </Paper>
                  ))}
                </Box>
              </Box>
            )}

            {cart.length > 0 && (
              <Box sx={{ flexShrink: 0, mt: 1.5 }}>
                <Paper sx={{ 
                  p: 1.5, 
                  bgcolor: 'white', 
                  borderRadius: 2,
                  border: '1px solid #f0f0f0',
                  boxShadow: 'none'
                }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                    <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8rem' }}>
                      Subtotal
                    </Typography>
                    <Typography variant="body2" sx={{ fontSize: '0.8rem', fontWeight: 500 }}>
                      ₱{subtotal.toFixed(2)}
                    </Typography>
                  </Box>
                  {discount > 0 && (
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                      <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8rem' }}>
                        Discount
                      </Typography>
                      <Typography variant="body2" sx={{ fontSize: '0.8rem', fontWeight: 500, color: '#059669' }}>
                        -₱{discount.toFixed(2)}
                      </Typography>
                    </Box>
                  )}
                  <Box sx={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    mb: 1.5, 
                    pt: 1, 
                    borderTop: '1px solid #f3f4f6' 
                  }}>
                    <Typography variant="body1" sx={{ fontWeight: 700, fontSize: '0.9rem' }}>
                      Total
                    </Typography>
                    <Typography variant="body1" sx={{ 
                      fontWeight: 700, 
                      color: '#ff6b35',
                      fontSize: '1rem'
                    }}>
                      ₱{total.toFixed(2)}
                    </Typography>
                  </Box>
                  <Button 
                    fullWidth 
                    variant="contained" 
                    onClick={() => setCheckoutOpen(true)} 
                    sx={{ 
                      mb: 1, 
                      bgcolor: '#ff6b35', 
                      py: 1.25,
                      fontSize: '0.875rem',
                      fontWeight: 600,
                      borderRadius: 1.5,
                      boxShadow: '0 2px 4px rgba(255, 107, 53, 0.2)',
                      '&:hover': {
                        bgcolor: '#e55a2b',
                        boxShadow: '0 4px 8px rgba(255, 107, 53, 0.3)'
                      }
                    }}
                  >
                    Proceed to Checkout
                  </Button>
                  <Button 
                    fullWidth 
                    variant="text" 
                    onClick={() => { setCart([]); toast.success('Cart cleared'); }}
                    sx={{ 
                      color: '#6b7280',
                      fontSize: '0.75rem',
                      py: 0.75,
                      '&:hover': {
                        bgcolor: '#f9fafb',
                        color: '#ef4444'
                      }
                    }}
                  >
                    Clear Cart
                  </Button>
                </Paper>
              </Box>
            )}
          </Box>
        </Box>
      </Box>

      {/* Order success modal with animations */}
      {orderPlacedId && (
        <Slide direction="up" in={!!orderPlacedId} mountOnEnter unmountOnExit>
          <Fade in={!!orderPlacedId} timeout={500}>
            <Paper 
              sx={{ 
                position: 'fixed', 
                bottom: 16, 
                left: 16, 
                right: 16, 
                p: 3, 
                zIndex: 1000,
                maxWidth: 400,
                mx: 'auto',
                borderRadius: 3,
                background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 50%, #f3e5f5 100%)',
                border: '2px solid rgba(34, 197, 94, 0.2)',
                animation: `${slideInUp} 0.6s cubic-bezier(0.16, 1, 0.3, 1)`
              }}
              elevation={12}
            >
              {/* Success Header with animated checkmark */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                <Zoom in={!!orderPlacedId} timeout={800} style={{ transitionDelay: '300ms' }}>
                  <Box
                    sx={{
                      width: 48,
                      height: 48,
                      borderRadius: '50%',
                      background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: '0 4px 12px rgba(34, 197, 94, 0.4)',
                    }}
                  >
                    <CheckIcon sx={{ color: 'white', fontSize: '2rem' }} />
                  </Box>
                </Zoom>
                <Box>
                  <Typography variant="h6" sx={{ color: 'success.main', fontWeight: 'bold', mb: 0.5 }}>
                    Order Placed Successfully!
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Your order has been received
                  </Typography>
                </Box>
              </Box>

              {/* Order Details */}
              <Box sx={{ 
                bgcolor: 'rgba(255, 255, 255, 0.8)', 
                borderRadius: 2, 
                p: 2, 
                mb: 2,
                border: '1px solid rgba(34, 197, 94, 0.1)'
              }}>
                <Typography variant="body2" sx={{ mb: 1, color: 'text.secondary' }}>
                  Order Number
                </Typography>
                <Typography variant="h6" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                  #{orderPlacedId}
                </Typography>
              </Box>

              {/* Share Link */}
              <Typography variant="body2" sx={{ mb: 1, fontWeight: 'medium' }}>
                Share your order:
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 3 }}>
                <TextField 
                  value={window.location.origin + '/order/' + orderPlacedId} 
                  size="small" 
                  fullWidth 
                  InputProps={{ 
                    readOnly: true,
                    sx: { fontSize: '0.875rem' }
                  }} 
                  sx={{ 
                    '& .MuiOutlinedInput-root': {
                      bgcolor: 'rgba(255, 255, 255, 0.9)',
                    }
                  }}
                />
                <IconButton 
                  onClick={async () => { 
                    await navigator.clipboard.writeText(window.location.origin + '/order/' + orderPlacedId); 
                    toast.success('Link copied to clipboard!'); 
                  }}
                  sx={{
                    bgcolor: 'primary.main',
                    color: 'white',
                    animation: `${pulse} 2s infinite`,
                    '&:hover': {
                      bgcolor: 'primary.dark',
                      animation: 'none',
                    }
                  }}
                >
                  <CopyIcon />
                </IconButton>
              </Box>

              {/* Action Buttons */}
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  variant="contained"
                  fullWidth
                  onClick={() => setOrderPlacedId(null)}
                  sx={{ 
                    borderRadius: 2,
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    '&:hover': {
                      background: 'linear-gradient(135deg, #5a6fd8 0%, #6a4190 100%)',
                    }
                  }}
                >
                  Continue Shopping
                </Button>
              </Box>
            </Paper>
          </Fade>
        </Slide>
      )}

      <CM
        open={checkoutOpen}
        onClose={closeCheckout}
        cart={cart}
        subtotal={subtotal}
        customerName={customerName}
        customerPhone={customerPhone}
        deliveryAddress={deliveryAddress}
        onConfirm={handleConfirmOrder}
        isSubmitting={isSubmitting}
        couponCode={couponCode}
        setCouponCode={setCouponCode}
        appliedCoupon={appliedCoupon}
        setAppliedCoupon={setAppliedCoupon}
        couponError={couponError}
        setCouponError={setCouponError}
        AVAILABLE_COUPONS={AVAILABLE_COUPONS}
        fetchedCoupons={fetchedCoupons}
        discount={discount}
        total={total}
        setCustomerName={setCustomerName}
        setCustomerPhone={setCustomerPhone}
        setDeliveryAddress={setDeliveryAddress}
        changeQty={changeQty}
        removeFromCart={removeFromCart}
        paymentMethod={paymentMethod}
        setPaymentMethod={setPaymentMethod}
        paymentReceipt={paymentReceipt}
        setPaymentReceipt={setPaymentReceipt}
      />
      
      <IDM
        open={!!selectedItem}
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
        onAdd={(item, quantity, notes) => {
          addToCart(item, quantity, notes);
          setSelectedItem(null);
        }}
      />
      </Box>
    </Box>
  );
};

export default OnlineOrder;
