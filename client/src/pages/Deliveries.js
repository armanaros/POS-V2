import React, { useState, useEffect, useMemo } from 'react';
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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  Paper,
  IconButton,
  Divider,
  List,
  ListItem,
  ListItemText,
  Avatar,
  Badge,
  Tabs,
  Tab,
} from '@mui/material';
import {
  LocalShipping,
  LocationOn,
  Schedule,
  Phone,
  CheckCircle,
  Cancel,
  Refresh,
  Navigation,
  MyLocation,
  TrackChanges,
  Map as MapIcon,
  List as ListIcon,
  Close,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import Layout from '../components/Layout';
import LoadingSpinner from '../components/LoadingSpinner';
import DeliveryMap from '../components/DeliveryMap';
import { OrderService, UserService } from '../services/firebaseServices';
import { useAuth } from '../context/AuthContext';
import { useDeliveryPersonnel } from '../hooks/useDeliveryPersonnel';

// Helper functions
const getDisplayName = (person) => {
  if (!person) return 'Unknown';
  const firstName = person.firstName || '';
  const lastName = person.lastName || '';
  if (firstName || lastName) {
    return `${firstName} ${lastName}`.trim();
  }
  return person.email || person.username || 'Unknown User';
};

const computePersonStatus = (person) => {
  if (!person) return 'offline';

  // Support both shapes: person.lastSeen OR person.location.lastSeen (Firestore Timestamp)
  let lastSeenRaw = person.lastSeen || person.location?.lastSeen || person.location?.timestamp;
  if (!lastSeenRaw) return 'offline';

  const lastSeenTime = lastSeenRaw && lastSeenRaw.toDate ? new Date(lastSeenRaw.toDate()) : new Date(lastSeenRaw);
  if (!lastSeenTime || isNaN(lastSeenTime.getTime())) return 'offline';

  const now = new Date();
  const diffMinutes = (now - lastSeenTime) / (1000 * 60);

  // Consider explicit online flag when available
  const isOnlineFlag = (typeof person.isOnline !== 'undefined') ? person.isOnline : (person.location?.isOnline ?? true);
  if (!isOnlineFlag) return 'offline';

  if (diffMinutes <= 5) return 'online';
  if (diffMinutes <= 15) return 'idle';
  if (diffMinutes <= 60) return 'away';
  return 'offline';
};

const Deliveries = () => {
  const { user, canManageDeliveries, users, updateUser } = useAuth();
  const [deliveryOrders, setDeliveryOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending'); // pending, assigned, in_transit, delivered, cancelled
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [deliveryPersonLocations, setDeliveryPersonLocations] = useState({});
  const [trackingDialogOpen, setTrackingDialogOpen] = useState(false);
  const [trackedDeliveryPerson, setTrackedDeliveryPerson] = useState(null);
  const [currentTab, setCurrentTab] = useState(0);
  const [selectedDeliveryPersonId, setSelectedDeliveryPersonId] = useState(null);
  const [selectedDeliveryPerson, setSelectedDeliveryPerson] = useState('');

  // Use the delivery personnel hook
  const { 
    deliveryPersons, 
    loading: deliveryPersonsLoading, 
    getOnlineDeliveryPersons,
    getStatistics 
  } = useDeliveryPersonnel();

  // Merge delivery personnel from both the hook and the auth users list (in case users are loaded differently)
  const mergedDeliveryPersons = useMemo(() => {
    const map = new Map();
    (deliveryPersons || []).forEach(p => map.set(p.id, p));
    (users || []).filter(u => u.role === 'delivery').forEach(u => {
      if (!map.has(u.id)) map.set(u.id, u);
      else {
        // merge basic fields if missing
        const existing = map.get(u.id);
        map.set(u.id, { ...u, ...existing });
      }
    });
    return Array.from(map.values());
  }, [deliveryPersons, users]);

  const getOnlineMerged = () => {
    return mergedDeliveryPersons.filter(p => {
      const s = computePersonStatus(p);
      // Allow selecting if person is online OR if they explicitly marked themselves available
      return s === 'online' || p.isAvailable === true;
    });
  };

  const handleToggleAvailability = async () => {
    if (!user || !user.id) return;
    try {
      const newVal = !user.isAvailable;
      // Use the AuthContext helper so local `user` state updates immediately
      if (updateUser) {
        await updateUser(user.id, { isAvailable: newVal });
      } else {
        await UserService.updateUser(user.id, { isAvailable: newVal });
      }
      toast.success(`You are now ${newVal ? 'available' : 'unavailable'} for assignments`);
    } catch (err) {
      console.error('Failed to update availability', err);
      toast.error('Failed to change availability');
    }
  };

  useEffect(() => {
    fetchDeliveryOrders();
    // Subscribe to real-time updates for delivery orders
    const unsubscribe = OrderService.subscribeToOrders((orders) => {
      const deliveryOrdersOnly = orders.filter(order => 
        order.orderType === 'delivery' || order.orderType === 'takeout'
      );
      setDeliveryOrders(deliveryOrdersOnly);
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  // When the assign dialog opens, auto-select first available delivery person if none selected
  useEffect(() => {
    if (assignDialogOpen && !selectedDeliveryPerson) {
      const first = getOnlineMerged()[0];
      if (first) setSelectedDeliveryPerson(first.id);
    }
  }, [assignDialogOpen]);

  // Ensure delivery-role users always see the Orders tab (hide map)
  useEffect(() => {
    if (user?.role === 'delivery' && currentTab > 0) {
      setCurrentTab(0);
    }
  }, [user, currentTab]);

  // Subscribe to delivery personnel locations
  useEffect(() => {
    if (!users || users.length === 0) return;

    const deliveryPersonnel = users.filter(u => u.role === 'delivery' && u.isActive);
    if (!deliveryPersonnel.length) return;

    const locationUnsubscribes = [];

    const setupLocationTracking = async () => {
      const LocationService = (await import('../services/locationService')).default;
      
      deliveryPersonnel.forEach(person => {
        const unsubscribe = LocationService.subscribeToUserLocation(person.id, (location) => {
          setDeliveryPersonLocations(prev => ({
            ...prev,
            [person.id]: {
              ...location,
              personInfo: person
            }
          }));
        });
        locationUnsubscribes.push(unsubscribe);
      });
    };

    setupLocationTracking();

    return () => {
      locationUnsubscribes.forEach(unsub => unsub && unsub());
    };
  }, [users]);

  const fetchDeliveryOrders = async () => {
    try {
      setLoading(true);
      const orders = await OrderService.getAllOrders();
      const deliveryOrdersOnly = orders.filter(order => 
        order.orderType === 'delivery' || order.orderType === 'takeout'
      );
      setDeliveryOrders(deliveryOrdersOnly);
    } catch (error) {
      console.error('Error fetching delivery orders:', error);
      toast.error('Failed to fetch delivery orders');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusUpdate = async (orderId, newStatus) => {
    try {
      console.log('Updating order status:', orderId, newStatus);
      
      // Update order status with additional metadata
      const updateData = {
        status: newStatus,
        updatedAt: new Date().toISOString(),
        updatedBy: user?.id || 'unknown'
      };
      
      // Add specific fields for delivery status changes
      if (newStatus === 'in_transit') {
        updateData.startedDeliveryAt = new Date().toISOString();
        updateData.deliveryStartedBy = user?.id;
      } else if (newStatus === 'delivered') {
        updateData.deliveredAt = new Date().toISOString();
        updateData.deliveredBy = user?.id;
      } else if (newStatus === 'out_for_delivery') {
        updateData.outForDeliveryAt = new Date().toISOString();
        updateData.deliveryPersonId = user?.id;
      }
      
      await OrderService.updateOrder(orderId, updateData);
      
      // Update local state immediately for better UX
      setDeliveryOrders(prev => 
        prev.map(order => 
          order.id === orderId 
            ? { ...order, ...updateData }
            : order
        )
      );
      
      // Show success messages
      const statusMessages = {
        'in_transit': 'Delivery started! Customer will be notified.',
        'out_for_delivery': 'Order marked as out for delivery!',
        'delivered': 'Order successfully delivered! 🎉',
        'ready': 'Order is ready for pickup/delivery!',
        'preparing': 'Order is now being prepared.',
        'pending': 'Order status reset to pending.'
      };
      
      toast.success(statusMessages[newStatus] || `Order status updated to ${newStatus}`);
      
      console.log('Order status update successful');
      
    } catch (error) {
      console.error('Error updating order status:', error);
      toast.error('Failed to update order status. Please try again.');
      
      // Refresh data to ensure consistency
      setTimeout(() => {
        fetchDeliveryOrders();
      }, 1000);
    }
  };

  const handleAssignDelivery = async (orderId, deliveryPersonId) => {
    try {
      await OrderService.updateOrder(orderId, {
        deliveryPersonId,
        status: 'assigned',
        assignedAt: new Date().toISOString(),
      });
      toast.success('Delivery assigned successfully!');
      setAssignDialogOpen(false);
      setSelectedOrder(null);
    } catch (error) {
      console.error('Error assigning delivery:', error);
      toast.error('Failed to assign delivery');
    }
  };

  const handleTrackDeliveryPerson = (deliveryPersonId) => {
    const person = users.find(u => u.id === deliveryPersonId);
    const location = deliveryPersonLocations[deliveryPersonId];
    
    if (person && location) {
      setTrackedDeliveryPerson({ ...person, location });
      setTrackingDialogOpen(true);
    } else {
      toast.warning('Location not available for this delivery person');
    }
  };

  const getDeliveryPersonStatus = (deliveryPersonId) => {
    const location = deliveryPersonLocations[deliveryPersonId];
    if (!location) return { status: 'offline', text: 'Offline' };
    
    if (!location.isOnline) return { status: 'offline', text: 'Offline' };
    
    const lastSeen = new Date(location.lastSeen?.toDate?.() || location.lastSeen);
    const now = new Date();
    const diffMinutes = Math.floor((now - lastSeen) / (1000 * 60));
    
    if (diffMinutes > 10) return { status: 'away', text: 'Away' };
    if (diffMinutes > 5) return { status: 'idle', text: 'Idle' };
    return { status: 'online', text: 'Online' };
  };

  const getDirectionsUrl = (deliveryAddress, deliveryPersonId) => {
    const location = deliveryPersonLocations[deliveryPersonId];
    if (!location || !deliveryAddress) return null;
    
    // For demo purposes, using a simple Google Maps directions URL
    // In production, you'd geocode the delivery address first
    return `https://www.google.com/maps/dir/${location.latitude},${location.longitude}/${encodeURIComponent(deliveryAddress)}`;
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending': return 'warning';
      case 'assigned': return 'info';
      case 'in_transit': return 'primary';
      case 'delivered': return 'success';
      case 'cancelled': return 'error';
      default: return 'default';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'pending': return <Schedule />;
      case 'assigned': return <LocalShipping />;
      case 'in_transit': return <Navigation />;
      case 'delivered': return <CheckCircle />;
      case 'cancelled': return <Cancel />;
      default: return <Schedule />;
    }
  };

  const filteredOrders = deliveryOrders.filter(order => {
    if (filter === 'all') return true;
    return order.status === filter || 
           (filter === 'pending' && (!order.status || order.status === 'pending'));
  });

  if (loading) {
    return (
      <Layout>
        <LoadingSpinner message="Loading delivery orders..." />
      </Layout>
    );
  }

  return (
    <Layout>
      {/* Header Section */}
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
        
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', zIndex: 1 }}>
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 'bold', mb: 1 }}>
              Delivery Management
            </Typography>
            <Typography variant="body1" sx={{ opacity: 0.9 }}>
              Track and manage delivery orders
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button
              variant="contained"
              startIcon={<Refresh />}
              onClick={fetchDeliveryOrders}
              sx={{ 
                bgcolor: 'rgba(255, 255, 255, 0.2)',
                backdropFilter: 'blur(10px)',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                '&:hover': {
                  bgcolor: 'rgba(255, 255, 255, 0.3)',
                }
              }}
            >
              Refresh
            </Button>
          </Box>
        </Box>
      </Box>

      {/* Main Navigation Tabs */}
      <Paper sx={{ mb: 3 }}>
        <Tabs 
          value={currentTab} 
          onChange={(event, newValue) => setCurrentTab(newValue)}
          sx={{ borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab 
            icon={<ListIcon />} 
            label="Delivery Orders" 
            sx={{ textTransform: 'none', fontWeight: 'bold' }}
          />
          {user?.role !== 'delivery' && (
            <Tab 
              icon={<MapIcon />} 
              label={`Live Map (${getStatistics().active} Active)`}
              sx={{ textTransform: 'none', fontWeight: 'bold' }}
            />
          )}
        </Tabs>
      </Paper>

      {/* Tab Content */}
      {currentTab === 0 && (
        <>
          {/* Delivery Personnel Dashboard */}
          {user?.role === 'delivery' && (
            <Paper sx={{ mb: 3, p: 3, background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Box>
                  <Typography variant="h5" sx={{ fontWeight: 'bold', mb: 1 }}>
                    My Delivery Dashboard
                  </Typography>
                  <Typography variant="body1" sx={{ opacity: 0.9 }}>
                    Your assigned deliveries and quick actions
                  </Typography>
                </Box>
                <Box sx={{ textAlign: 'center' }}>
                  <Typography variant="h3" sx={{ fontWeight: 'bold' }}>
                    {filteredOrders.filter(o => o.deliveryPersonId === user.id).length}
                  </Typography>
                  <Typography variant="body2" sx={{ opacity: 0.8 }}>
                    Active Deliveries
                  </Typography>
                </Box>
              </Box>
              
              <Stack direction="row" spacing={2}>
                <Chip 
                  label={`${filteredOrders.filter(o => o.deliveryPersonId === user.id && o.status === 'assigned').length} Ready to Start`}
                  sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'white', fontWeight: 'bold' }}
                />
                <Chip 
                  label={`${filteredOrders.filter(o => o.deliveryPersonId === user.id && o.status === 'in_transit').length} In Transit`}
                  sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'white', fontWeight: 'bold' }}
                />
              </Stack>
              <Box sx={{ mt: 2 }}>
                <Button
                  variant={user?.isAvailable ? 'contained' : 'outlined'}
                  color={user?.isAvailable ? 'success' : 'inherit'}
                  onClick={handleToggleAvailability}
                  startIcon={<LocalShipping />}
                >
                  {user?.isAvailable ? 'Mark Unavailable' : 'Mark Available for Assignment'}
                </Button>
              </Box>
            </Paper>
          )}
        
          {/* Filter Chips for Orders Tab */}
          <Paper sx={{ mb: 3, p: 2 }}>
            <Typography variant="h6" gutterBottom>
              {user?.role === 'delivery' ? 'My Delivery Orders' : 'Filter Orders'}
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap">
              {['all', 'pending', 'assigned', 'in_transit', 'delivered', 'cancelled'].map((status) => (
                <Chip
                  key={status}
                  label={status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ')}
                  onClick={() => setFilter(status)}
                  color={filter === status ? 'primary' : 'default'}
                  variant={filter === status ? 'filled' : 'outlined'}
                  sx={{ mb: 1 }}
                />
              ))}
            </Stack>
          </Paper>

          

          {/* Delivery Orders List */}
          <Grid container spacing={3}>
        {filteredOrders.length === 0 ? (
          <Grid item xs={12}>
            <Card sx={{ textAlign: 'center', py: 8 }}>
              <CardContent>
                <LocalShipping sx={{ fontSize: 80, color: '#bdbdbd', mb: 2 }} />
                <Typography variant="h6" color="textSecondary" gutterBottom>
                  No delivery orders found
                </Typography>
                <Typography variant="body2" color="textSecondary">
                  {filter === 'all' ? 'No delivery orders available' : `No ${filter} delivery orders`}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ) : (
          filteredOrders.map((order) => (
            <Grid item xs={12} md={6} lg={4} key={order.id}>
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
                  {/* Order Header */}
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                    <Box>
                      <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
                        Order #{order.orderNumber}
                      </Typography>
                      <Typography variant="body2" color="textSecondary">
                        {new Date(order.createdAt?.toDate?.() || order.createdAt).toLocaleString()}
                      </Typography>
                    </Box>
                    <Chip
                      icon={getStatusIcon(order.status)}
                      label={order.status || 'pending'}
                      color={getStatusColor(order.status)}
                      size="small"
                      sx={{ textTransform: 'capitalize' }}
                    />
                  </Box>

                  {/* Customer Info */}
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1 }}>
                      Customer Details
                    </Typography>
                    <Typography variant="body2">
                      {order.customerName || 'Walk-in Customer'}
                    </Typography>
                    {order.customerPhone && (
                      <Box sx={{ display: 'flex', alignItems: 'center', mt: 0.5 }}>
                        <Phone sx={{ fontSize: 16, mr: 0.5 }} />
                        <Typography variant="body2">{order.customerPhone}</Typography>
                      </Box>
                    )}
                    {order.deliveryAddress && (
                      <Box sx={{ display: 'flex', alignItems: 'center', mt: 0.5 }}>
                        <LocationOn sx={{ fontSize: 16, mr: 0.5 }} />
                        <Typography variant="body2">{order.deliveryAddress}</Typography>
                      </Box>
                    )}
                  </Box>

                  {/* Delivery Person Info */}
                  {order.deliveryPersonId && (
                    <Box sx={{ mb: 2 }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1 }}>
                        Delivery Person
                      </Typography>
                      {(() => {
                        const deliveryPerson = users.find(u => u.id === order.deliveryPersonId);
                        const personStatus = getDeliveryPersonStatus(order.deliveryPersonId);
                        const location = deliveryPersonLocations[order.deliveryPersonId];
                        
                        return deliveryPerson ? (
                          <Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                <Badge 
                                  color={
                                    personStatus.status === 'online' ? 'success' : 
                                    personStatus.status === 'idle' ? 'warning' : 'error'
                                  }
                                  variant="dot"
                                  sx={{ mr: 1 }}
                                >
                                  <Avatar sx={{ width: 24, height: 24, fontSize: 12 }}>
                                    {deliveryPerson.firstName?.[0] || deliveryPerson.username?.[0] || 'D'}
                                  </Avatar>
                                </Badge>
                                <Box>
                                  <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                                    {deliveryPerson.firstName} {deliveryPerson.lastName} ({deliveryPerson.username})
                                  </Typography>
                                  <Typography variant="caption" color="textSecondary">
                                    {personStatus.text}
                                  </Typography>
                                </Box>
                              </Box>
                              <IconButton 
                                size="small" 
                                onClick={() => handleTrackDeliveryPerson(order.deliveryPersonId)}
                                disabled={!location || !location.isOnline}
                              >
                                <MyLocation />
                              </IconButton>
                            </Box>
                            {location && location.isOnline && order.deliveryAddress && (
                              <Button
                                size="small"
                                variant="outlined"
                                startIcon={<Navigation />}
                                onClick={() => {
                                  const directionsUrl = getDirectionsUrl(order.deliveryAddress, order.deliveryPersonId);
                                  if (directionsUrl) window.open(directionsUrl, '_blank');
                                }}
                                sx={{ mt: 1 }}
                              >
                                Get Directions
                              </Button>
                            )}
                          </Box>
                        ) : (
                          <Typography variant="body2" color="textSecondary">
                            Delivery person not found
                          </Typography>
                        );
                      })()}
                    </Box>
                  )}

                  {/* Order Items */}
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1 }}>
                      Items ({order.items?.length || 0})
                    </Typography>
                    <List dense>
                      {(order.items || []).slice(0, 3).map((item, index) => (
                        <ListItem key={index} sx={{ px: 0, py: 0.5 }}>
                          <ListItemText
                            primary={`${item.quantity}x ${item.name}`}
                            secondary={`₱${(item.price * item.quantity).toFixed(2)}`}
                          />
                        </ListItem>
                      ))}
                      {(order.items?.length || 0) > 3 && (
                        <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
                          +{order.items.length - 3} more items
                        </Typography>
                      )}
                    </List>
                  </Box>

                  {/* Total */}
                  <Divider sx={{ my: 2 }} />
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
                      Total Amount
                    </Typography>
                    <Typography variant="h6" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                      ₱{order.total?.toFixed(2) || '0.00'}
                    </Typography>
                  </Box>

                  {/* Action Buttons */}
                  <Stack spacing={1}>
                    {user?.role === 'delivery' && (
                      <Box sx={{ p: 2, bgcolor: '#f8fafc', borderRadius: 2 }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 2, color: '#4a5568' }}>
                          Delivery Actions
                        </Typography>
                        
                        {/* Ready to pick up */}
                        {order.status === 'ready' && !order.deliveryPersonId && (
                          <Button
                            fullWidth
                            variant="contained"
                            color="info"
                            startIcon={<LocalShipping />}
                            onClick={() => handleStatusUpdate(order.id, 'out_for_delivery')}
                            sx={{ mb: 1, fontWeight: 'bold' }}
                          >
                            Pick Up Order
                          </Button>
                        )}
                        
                        {/* Assigned - Start Delivery */}
                        {(order.status === 'assigned' || order.status === 'out_for_delivery') && order.deliveryPersonId === user.id && (
                          <Button
                            fullWidth
                            variant="contained"
                            color="primary"
                            startIcon={<Navigation />}
                            onClick={() => handleStatusUpdate(order.id, 'in_transit')}
                            sx={{ 
                              mb: 1, 
                              fontWeight: 'bold',
                              background: 'linear-gradient(135deg, #2196f3 0%, #1976d2 100%)'
                            }}
                          >
                            Start Delivery
                          </Button>
                        )}
                        
                        {/* In Transit - Mark Delivered */}
                        {order.status === 'in_transit' && order.deliveryPersonId === user.id && (
                          <Button
                            fullWidth
                            variant="contained"
                            color="success"
                            startIcon={<CheckCircle />}
                            onClick={() => handleStatusUpdate(order.id, 'delivered')}
                            sx={{ 
                              mb: 1, 
                              fontWeight: 'bold',
                              background: 'linear-gradient(135deg, #4caf50 0%, #388e3c 100%)',
                              '&:hover': {
                                background: 'linear-gradient(135deg, #388e3c 0%, #2e7d32 100%)',
                              }
                            }}
                          >
                            ✅ Mark as Delivered
                          </Button>
                        )}
                        
                        {/* Navigate to Customer */}
                        {order.deliveryAddress && order.deliveryPersonId === user.id && ['assigned', 'out_for_delivery', 'in_transit'].includes(order.status) && (
                          <Button
                            fullWidth
                            variant="outlined"
                            startIcon={<LocationOn />}
                            onClick={() => {
                              const address = encodeURIComponent(order.deliveryAddress);
                              window.open(`https://www.google.com/maps/dir/?api=1&destination=${address}`, '_blank');
                            }}
                            sx={{ fontWeight: 'bold' }}
                          >
                            Navigate to Customer
                          </Button>
                        )}
                        
                        {/* Status info for delivery person */}
                        <Typography variant="caption" color="textSecondary" sx={{ display: 'block', mt: 1, textAlign: 'center' }}>
                          {order.deliveryPersonId === user.id ? '✓ Assigned to you' : 
                           order.deliveryPersonId ? '⚠️ Assigned to another delivery person' : 
                           '📋 Available for pickup'}
                        </Typography>
                      </Box>
                    )}
                    
                    {canManageDeliveries() && (
                      <>
                        {(!order.status || order.status === 'pending') && (
                          <Button
                                  fullWidth
                                  variant="outlined"
                                  startIcon={<LocalShipping />}
                                  onClick={() => {
                                    // Preselect first available/online person when opening dialog
                                    setSelectedOrder(order);
                                    const first = getOnlineMerged()[0];
                                    setSelectedDeliveryPerson(first ? first.id : '');
                                    setAssignDialogOpen(true);
                                  }}
                                >
                                  Assign Delivery
                                </Button>
                        )}
                        {order.status !== 'delivered' && order.status !== 'cancelled' && (
                          <Button
                            fullWidth
                            variant="outlined"
                            color="error"
                            startIcon={<Cancel />}
                            onClick={() => handleStatusUpdate(order.id, 'cancelled')}
                          >
                            Cancel Order
                          </Button>
                        )}
                      </>
                    )}
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          ))
        )}
      </Grid>
      </>
      )}

      {/* Live Map Tab */}
      {currentTab === 1 && user?.role !== 'delivery' && (
        <>
          {deliveryPersonsLoading ? (
            <Card sx={{ height: 400 }}>
              <CardContent sx={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                height: '100%',
                flexDirection: 'column',
                gap: 2
              }}>
                <LocalShipping sx={{ fontSize: 48, color: 'primary.main', opacity: 0.5 }} />
                <Typography variant="h6" color="text.secondary">
                  Loading Delivery Personnel...
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Fetching live location data
                </Typography>
              </CardContent>
            </Card>
          ) : (
            <DeliveryMap
              deliveryPersons={deliveryPersons}
              onPersonSelect={setSelectedDeliveryPersonId}
              selectedPersonId={selectedDeliveryPersonId}
              statistics={getStatistics()}
            />
          )}
        </>
      )}

      {/* Assign Delivery Dialog */}
      <Dialog open={assignDialogOpen} onClose={() => setAssignDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="h6">Assign Delivery Person</Typography>
            <IconButton onClick={() => setAssignDialogOpen(false)} size="small">
              <Close />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
            Assign a delivery person to Order #{selectedOrder?.orderNumber}
          </Typography>
          <FormControl fullWidth sx={{ mt: 2 }}>
            <InputLabel>Delivery Person</InputLabel>
            <Select
              value={selectedDeliveryPerson}
              label="Delivery Person"
              onChange={(e) => setSelectedDeliveryPerson(e.target.value)}
            >
              <MenuItem value="">
                <em>Select a delivery person</em>
              </MenuItem>
              {mergedDeliveryPersons.map((person) => {
                const displayName = getDisplayName(person);
                const status = computePersonStatus(person);
                const isOnline = status === 'online' || status === 'idle';
                // Allow selection if online or if person explicitly marked available
                const selectable = isOnline || person.isAvailable === true;

                return (
                  <MenuItem 
                    key={person.id} 
                    value={person.id}
                    disabled={!selectable}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', justifyContent: 'space-between' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <Box
                          sx={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            bgcolor: isOnline ? '#4caf50' : '#9e9e9e',
                            mr: 1
                          }}
                        />
                        {displayName}
                      </Box>
                      <Chip 
                        label={status} 
                        size="small" 
                        color={isOnline ? 'success' : 'default'}
                        sx={{ fontSize: '0.7rem' }}
                      />
                    </Box>
                  </MenuItem>
                );
              })}
            </Select>
          </FormControl>
          
          {/* Diagnostics: show helpful info if there are no delivery persons or none online */}
          {(!mergedDeliveryPersons || mergedDeliveryPersons.length === 0) && !deliveryPersonsLoading && (
            <Box sx={{ mt: 2 }}>
              <Alert severity="info">No delivery personnel found. Create delivery users or check that users have <code>role: 'delivery'</code>.</Alert>
            </Box>
          )}

          {mergedDeliveryPersons && mergedDeliveryPersons.length > 0 && getOnlineMerged && getOnlineMerged().length === 0 && (
            <Box sx={{ mt: 2 }}>
              <Alert severity="warning">Delivery personnel found but none are currently online. You can still assign, but they may not receive real-time notifications.</Alert>
            </Box>
          )}

          {/* debug panel removed per user request */}

          {selectedDeliveryPerson && (
            <Box sx={{ mt: 2, p: 2, bgcolor: '#f5f5f5', borderRadius: 1 }}>
              <Typography variant="body2" color="textSecondary">
                <strong>Selected:</strong> {getDisplayName(mergedDeliveryPersons.find(p => p.id === selectedDeliveryPerson))}
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAssignDialogOpen(false)}>Cancel</Button>
          {/* Quick assign to first online delivery person */}
          {getOnlineMerged && getOnlineMerged().length > 0 && (
            <Button
              variant="outlined"
              onClick={() => {
                const firstOnline = getOnlineMerged()[0];
                if (firstOnline) {
                  handleAssignDelivery(selectedOrder?.id, firstOnline.id);
                  setAssignDialogOpen(false);
                }
              }}
              startIcon={<LocalShipping />}
            >
              Quick Assign to First Online
            </Button>
          )}
          <Button 
            variant="contained" 
            onClick={() => {
              if (selectedDeliveryPerson) {
                handleAssignDelivery(selectedOrder?.id, selectedDeliveryPerson);
                setSelectedDeliveryPerson('');
              }
            }}
            disabled={!selectedDeliveryPerson}
          >
            Assign Delivery
          </Button>
        </DialogActions>
      </Dialog>

      {/* Location Tracking Dialog */}
      <Dialog 
        open={trackingDialogOpen} 
        onClose={() => setTrackingDialogOpen(false)} 
        maxWidth="md" 
        fullWidth
      >
        <DialogTitle>
          <Box display="flex" alignItems="center" gap={2}>
            <TrackChanges color="primary" />
            Track Delivery Person
          </Box>
        </DialogTitle>
        <DialogContent>
          {trackedDeliveryPerson && (
            <Box>
              <Box sx={{ mb: 3, p: 2, bgcolor: 'background.paper', borderRadius: 1 }}>
                <Typography variant="h6" gutterBottom>
                  {trackedDeliveryPerson.firstName} {trackedDeliveryPerson.lastName}
                </Typography>
                <Typography variant="body2" color="textSecondary" gutterBottom>
                  @{trackedDeliveryPerson.username}
                </Typography>
                
                {trackedDeliveryPerson.location && (
                  <Box sx={{ mt: 2 }}>
                    <Stack spacing={2}>
                      <Box display="flex" alignItems="center" gap={1}>
                        <MyLocation color="primary" />
                        <Typography variant="body2">
                          Location: {trackedDeliveryPerson.location.latitude?.toFixed(6)}, {trackedDeliveryPerson.location.longitude?.toFixed(6)}
                        </Typography>
                      </Box>
                      
                      <Box display="flex" alignItems="center" gap={1}>
                        <Schedule color="primary" />
                        <Typography variant="body2">
                          Last update: {new Date(trackedDeliveryPerson.location.lastSeen?.toDate?.() || trackedDeliveryPerson.location.lastSeen).toLocaleString()}
                        </Typography>
                      </Box>
                      
                      {trackedDeliveryPerson.location.accuracy && (
                        <Box display="flex" alignItems="center" gap={1}>
                          <LocationOn color="primary" />
                          <Typography variant="body2">
                            Accuracy: ±{Math.round(trackedDeliveryPerson.location.accuracy)}m
                          </Typography>
                        </Box>
                      )}
                      
                      {trackedDeliveryPerson.location.speed !== null && trackedDeliveryPerson.location.speed >= 0 && (
                        <Box display="flex" alignItems="center" gap={1}>
                          <Navigation color="primary" />
                          <Typography variant="body2">
                            Speed: {Math.round(trackedDeliveryPerson.location.speed * 3.6)} km/h
                          </Typography>
                        </Box>
                      )}
                      
                      <Button
                        variant="contained"
                        startIcon={<MyLocation />}
                        onClick={() => {
                          const lat = trackedDeliveryPerson.location.latitude;
                          const lng = trackedDeliveryPerson.location.longitude;
                          const url = `https://www.google.com/maps/@${lat},${lng},15z`;
                          window.open(url, '_blank');
                        }}
                        sx={{ mt: 2 }}
                      >
                        View on Google Maps
                      </Button>
                    </Stack>
                  </Box>
                )}
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTrackingDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Layout>
  );
};

export default Deliveries;