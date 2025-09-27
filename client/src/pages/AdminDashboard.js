import React, { useState, useEffect, useRef } from 'react';
import {
  Grid,
  Card,
  CardContent,
  Box,
  Typography,
  Button,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Chip,
  IconButton,
  Stack,
  Alert,
  Collapse,
  LinearProgress,
  alpha,
  useTheme,
  useMediaQuery
} from '@mui/material';

import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip as RechartsTooltip } from 'recharts';

import Layout from '../components/Layout';
import {
  AttachMoney,
  ShoppingCart,
  Schedule,
  TrendingUp,
  Warning,
  ReceiptLong,
  ArrowUpward,
  ArrowDownward,
  CheckCircle,
  PieChart as PieChartIcon
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import logger from '../utils/logger';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import { OrderService, ReportsService, InventoryService, UserService } from '../services/firebaseServices';
import LoadingSpinner from '../components/LoadingSpinner';
import toast from 'react-hot-toast';

const AdminDashboard = () => {
  // Normalize various order.status values into the canonical buckets used by the UI
  const normalizeStatus = (raw) => {
    const s = String(raw || '').toLowerCase();
    if (!s || s === 'pending') return 'pending';
    if (s === 'preparing') return 'preparing';
    if (s === 'ready') return 'ready';
    if (s === 'served' || s === 'completed' || s === 'delivered') return 'served';
    if (s === 'cancelled' || s === 'canceled') return 'cancelled';
    // fall back: treat payment/completion-type statuses as served
    if (s === 'paid' || s === 'completed') return 'served';
    return 'pending';
  };
  const [dashboardData, setDashboardData] = useState(null);
  const [recentOrders, setRecentOrders] = useState([]);
  const [allOrders, setAllOrders] = useState([]); // Store all orders for accurate aggregation
  // Banner for newly arrived orders (admin-only). It should not trigger on initial load/login.
  const [newOrderBanner, setNewOrderBanner] = useState({ open: false, orderNumber: null });
  const notificationsInitialized = useRef(false);
  const bannerTimerRef = useRef(null);
  const prevOrdersRef = useRef(new Map());
  const ordersInitialized = useRef(false);
  const [loading, setLoading] = useState(true);
  const [inventoryAlerts, setInventoryAlerts] = useState([]);
  // theme intentionally unused in this file
  const { user, users: authUsers } = useAuth();
  const navigate = useNavigate();
  const { orders: socketOrders, users: socketUsers, notifications, updateLocalOrders } = useSocket();
  const theme = useTheme();
  const isXl = useMediaQuery(theme.breakpoints.up('xl'));
  const isLg = useMediaQuery(theme.breakpoints.up('lg'));
  const isMd = useMediaQuery(theme.breakpoints.up('md'));
  const isSm = useMediaQuery(theme.breakpoints.down('sm'));
  // local cache for lookups of employee names when full users list isn't available (e.g., manager role)
  const [employeeLookup, setEmployeeLookup] = useState({});

  

  useEffect(() => {
    fetchDashboardData();
    // fetch inventory alerts
    (async () => {
      try {
        const alerts = await InventoryService.getActiveAlerts();
        setInventoryAlerts(alerts || []);
      } catch (err) {
        console.error('Failed to load inventory alerts', err);
      }
    })();
  }, []);

  // Update recent orders from socket data
  useEffect(() => {
    if (socketOrders.length > 0) {
      // Show latest 10 orders
      const recent = socketOrders.slice(0, 10);
      setRecentOrders(recent);
    }
  }, [socketOrders]);

  // Subscribe directly to Firestore order changes so dashboard reacts when orders are processed
  useEffect(() => {
    if (!user) return;
    let unsubscribe = null;
    try {
      unsubscribe = OrderService.subscribeToOrders((realTimeOrders) => {
    console.log('AdminDashboard: realtime orders update', realTimeOrders?.length);
        setAllOrders(realTimeOrders); // Store all orders for accurate aggregation
        const recent = realTimeOrders.slice(0, 10);
        setRecentOrders(recent);
        if (updateLocalOrders) updateLocalOrders(recent);
      });
      // Also fetch an initial snapshot once to ensure the dashboard has data
      (async () => {
        try {
          const initial = await OrderService.getAllOrders();
          if (initial && initial.length > 0) {
            console.log('AdminDashboard: initial orders fetched', initial.length);
            setAllOrders(initial);
            setRecentOrders(initial.slice(0, 10));
            if (updateLocalOrders) updateLocalOrders(initial.slice(0, 10));
          }
        } catch (err) {
          console.error('AdminDashboard: initial fetch of orders failed', err);
        }
      })();
    } catch (err) {
      console.error('AdminDashboard: failed to subscribe to orders', err);
    }

    return () => {
      try { unsubscribe && unsubscribe(); } catch (e) {}
    };
  }, [user, updateLocalOrders]);

  // Real-time client-side aggregation from allOrders (no server round-trip)
  useEffect(() => {
    if (!allOrders || allOrders.length === 0) return;
    
  logger.debug('AdminDashboard: computing real-time aggregates from', allOrders.length, 'orders');
    
  // Compute aggregates from ALL orders (not just recent 10)
  const ordersByStatus = { pending: 0, preparing: 0, ready: 0, served: 0, cancelled: 0 };
    let todayRevenue = 0;
    let totalOrders = 0;
    const topItemsMap = new Map();
    const today = new Date().toDateString();
    
    allOrders.forEach(order => {
      if (!order) return;
      
      // Count by status
  const status = normalizeStatus(order.status || 'pending');
  ordersByStatus[status] = (ordersByStatus[status] || 0) + 1;
      
      // Count today's orders and revenue
      const orderDate = order.createdAt?.toDate?.() || (order.createdAt ? new Date(order.createdAt) : new Date());
      if (orderDate.toDateString() === today) {
        totalOrders++;
        if (status === 'served' || status === 'ready') {
          todayRevenue += Number(order.total || 0);
        }
      }
      
      // Track top items (from today's orders only for relevance)
      if (orderDate.toDateString() === today) {
        (order.items || []).forEach(item => {
          const key = item.menuItemId || item.name || 'unknown';
          const current = topItemsMap.get(key) || { name: item.name || 'Unknown Item', quantity: 0 };
          current.quantity += Number(item.quantity || 1);
          topItemsMap.set(key, current);
        });
      }
    });
    
    // Convert top items to sorted array
    const topItems = Array.from(topItemsMap.values())
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);
    
    // Update dashboard data with computed aggregates
    setDashboardData(prev => ({
      ...prev,
      today: { 
        revenue: todayRevenue, 
        orders: totalOrders 
      },
      monthly: {
        revenue: prev?.monthly?.revenue || 0 // keep existing monthly data
      },
      ordersByStatus,
      topItems,
      recentOrders // keep the orders list for the table
    }));
    
  }, [allOrders, recentOrders]); // include recentOrders to ensure aggregates update when recent list changes

  // Ensure managers can see employee display names even when the global `users` list isn't populated.
  // We only fetch the minimal set of user records referenced by recentOrders that aren't already present
  // in the socket-provided or auth-provided users arrays. This avoids loading the entire users collection
  // for non-admins while still showing readable names.
  useEffect(() => {
    if (!user || user.role !== 'manager') return;
    if (!recentOrders || recentOrders.length === 0) return;

    const referencedIds = Array.from(new Set(recentOrders.map(o => o && o.employeeId).filter(Boolean)));
    if (referencedIds.length === 0) return;

    // Build a set of already-known user ids from socketUsers and authUsers
    const knownIds = new Set([...(socketUsers || []).map(u => u.id), ...(authUsers || []).map(u => u.id)]);

    // Determine which ids we still need to fetch
    const toFetch = referencedIds.filter(id => !knownIds.has(id) && !employeeLookup[id]);
    if (toFetch.length === 0) return;

    (async () => {
      try {
        const results = await Promise.all(
          toFetch.map(id => UserService.getUserById(id).catch(() => null))
        );

        const newMap = {};
        results.forEach((res, idx) => {
          const id = toFetch[idx];
          if (res) {
            const name = `${res.firstName || ''} ${res.lastName || ''}`.trim();
            newMap[id] = name || res.username || res.email || id;
          } else {
            newMap[id] = id; // fallback to id so we at least show something
          }
        });

        setEmployeeLookup(prev => ({ ...prev, ...newMap }));
      } catch (err) {
        console.error('Failed to fetch employee names for manager view', err);
      }
    })();

  }, [recentOrders, user, socketUsers, authUsers, employeeLookup]);

  // Show notifications for important updates. For order notifications, show a brief admin-only banner

  // but ignore the initial notifications batch (e.g., on refresh/login).
  useEffect(() => {
    notifications.forEach(notification => {
      if (notification.type === 'order') {
        toast.success(`New order: ${notification.data.orderNumber}`);
        // Only show banner if we've already seen initial notifications and the user is admin
        if (notificationsInitialized.current && user && user.role === 'admin') {
          // Show banner briefly (1.5s)
          setNewOrderBanner({ open: true, orderNumber: notification.data.orderNumber, message: null });
          if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
          bannerTimerRef.current = setTimeout(() => {
            setNewOrderBanner({ open: false, orderNumber: null });
            bannerTimerRef.current = null;
          }, 1500);
        }
      } else if (notification.type === 'user_update') {
        toast(notification.message);
      } else if (notification.type === 'menu_update') {
        toast(notification.message);
      }
    });

    // After processing the first notifications batch, mark initialized so future notifications can show the banner
    if (!notificationsInitialized.current) notificationsInitialized.current = true;

    return () => {
      if (bannerTimerRef.current) {
        clearTimeout(bannerTimerRef.current);
        bannerTimerRef.current = null;
      }
    };
  }, [notifications, user]);

  // Detect processed/order status changes (e.g., cashier marked served) and show banner for admins.
  useEffect(() => {
    if (!user || user.role !== 'admin') return;

    // Build current status map
    const currentMap = new Map();
    recentOrders.forEach(o => {
      if (o && o.id) currentMap.set(o.id, o.status);
    });

    // If this is the first time we see orders, initialize and don't show banners
    if (!ordersInitialized.current) {
      prevOrdersRef.current = currentMap;
      ordersInitialized.current = true;
      return;
    }

    // Compare with previous
    for (const order of recentOrders) {
      if (!order || !order.id) continue;
      const prevStatus = prevOrdersRef.current.get(order.id);
      const currStatus = order.status;
  logger.debug('Order compare', { id: order.id, prevStatus, currStatus });
      if (prevStatus && prevStatus !== currStatus) {
        // Consider this a processed update if status changed to something beyond 'pending'
        if (currStatus && currStatus !== 'pending') {
          // Determine employee name if available
          const allUsers = ([...socketUsers || [], ...authUsers || []]);
          const matched = allUsers.find(u => u.id === order.employeeId);
          const employeeName = matched ? `${matched.firstName || ''} ${matched.lastName || ''}`.trim() : (order.employeeName || 'staff');
          const msg = `Order #${order.orderNumber} ${currStatus} by ${employeeName}`;
          logger.debug('Triggering admin banner:', msg);
          // Show brief banner
          if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
          setNewOrderBanner({ open: true, orderNumber: order.orderNumber, message: msg });
          bannerTimerRef.current = setTimeout(() => {
            setNewOrderBanner({ open: false, orderNumber: null, message: null });
            bannerTimerRef.current = null;
          }, 1500);
          break; // show only one banner per change batch
        }
      }
    }

    // Update prev map
    prevOrdersRef.current = currentMap;

    return () => {
      // noop
    };
  }, [recentOrders, user, socketUsers, authUsers]);

  // Legacy served-order banner logic removed; notifications-driven short banner is used instead.

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      console.log('Fetching initial dashboard data...');
      const dashboardData = await ReportsService.getDashboardData();
      console.log('Dashboard data received:', dashboardData);
      
      // Set the full dashboard data (monthly revenue, etc.) but let real-time subscription handle recentOrders
      // Normalize ordersByStatus keys coming from ReportsService so the UI uses canonical buckets
      try {
        const rawStatus = dashboardData?.ordersByStatus || {};
        const normalized = { pending: 0, preparing: 0, ready: 0, served: 0, cancelled: 0 };
        Object.entries(rawStatus).forEach(([k, v]) => {
          const key = normalizeStatus(k);
          const count = Number(v) || 0;
          normalized[key] = (normalized[key] || 0) + count;
        });
        const normalizedDashboard = { ...(dashboardData || {}), ordersByStatus: normalized };
        setDashboardData(normalizedDashboard);
        console.log('Dashboard data normalized ordersByStatus:', normalized);
      } catch (e) {
        console.error('Failed to normalize dashboardData.ordersByStatus', e);
        setDashboardData(dashboardData);
      }
      // If the reports API did not provide order status counts, fall back to Firestore directly
      const missingStatus = !dashboardData || !dashboardData.ordersByStatus || Object.values(dashboardData.ordersByStatus).every(v => !v);
      if (missingStatus) {
        try {
          const all = await OrderService.getAllOrders();
          const ordersByStatus = { pending: 0, preparing: 0, ready: 0, served: 0, cancelled: 0 };
          all.forEach(o => { const s = normalizeStatus(o?.status); ordersByStatus[s] = (ordersByStatus[s] || 0) + 1; });
          setDashboardData(prev => ({ ...(prev || {}), ordersByStatus, monthly: prev?.monthly || {} }));
          console.log('Fallback: computed ordersByStatus from Firestore', ordersByStatus);
        } catch (err) {
          console.error('Fallback fetch of orders failed:', err);
        }
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  // Resolve an inventory alert (mark resolved in Firestore and update UI)
  const handleResolveAlert = async (alertId) => {
    try {
      await InventoryService.resolveAlert(alertId);
      // remove from local state for immediate feedback
      setInventoryAlerts(prev => prev.filter(a => a.id !== alertId));
      toast.success('Inventory alert cleared');
    } catch (err) {
      console.error('Failed to resolve alert', err);
      toast.error('Failed to clear inventory alert');
    }
  };

  // NOTE: debugOrders helper removed to avoid unused symbol; use OrderService.debugOrders() in console when needed.

  if (loading) {
    return <LoadingSpinner message="Loading dashboard..." fullscreen />;
  }

  // Order stat cards in a simple, consistent order for clarity
  const statCards = [
    {
      title: "Today's Revenue",
      key: 'todayRevenue',
      value: formatCurrency(dashboardData?.today?.revenue),
      icon: <AttachMoney />,
      color: '#22c55e',
      bgColor: alpha('#22c55e', 0.08),
      change: '+12%',
      trend: 'up',
    },
    {
      title: 'Total Orders',
      key: 'totalOrders',
      value: dashboardData?.today?.orders || 0,
      icon: <ShoppingCart />,
      color: '#3b82f6',
      bgColor: alpha('#3b82f6', 0.08),
      change: '+8%',
      trend: 'up',
    },
    {
      title: 'Pending Orders',
      key: 'pendingOrders',
      value: dashboardData?.ordersByStatus?.pending || 0,
      icon: <Schedule />,
      color: '#f59e0b',
      bgColor: alpha('#f59e0b', 0.08),
      change: null,
      trend: null,
    },
    {
      title: 'Monthly Revenue',
      key: 'monthlyRevenue',
      value: formatCurrency(dashboardData?.monthly?.revenue),
      icon: <TrendingUp />,
      color: '#8b5cf6',
      bgColor: alpha('#8b5cf6', 0.08),
      change: '+15%',
      trend: 'up',
    },
    {
      title: 'Inventory Alerts',
      key: 'inventoryAlerts',
      value: inventoryAlerts?.length || 0,
      icon: <Warning />,
      color: '#ef4444',
      bgColor: alpha('#ef4444', 0.08),
      change: inventoryAlerts?.length > 0 ? `+${inventoryAlerts.length}` : null,
      trend: inventoryAlerts?.length > 0 ? 'up' : 'down',
    },
  ];

  const orderStatusData = [
    { name: 'Pending', value: dashboardData?.ordersByStatus?.pending || 0, color: '#ff9800' },
    { name: 'Preparing', value: dashboardData?.ordersByStatus?.preparing || 0, color: '#2196f3' },
    { name: 'Ready', value: dashboardData?.ordersByStatus?.ready || 0, color: '#4caf50' },
    { name: 'Served', value: dashboardData?.ordersByStatus?.served || 0, color: '#9c27b0' },
    { name: 'Cancelled', value: dashboardData?.ordersByStatus?.cancelled || 0, color: '#f44336' },
  ];

  // Debug: log the exact data used by the pie so we see numbers (not collapsed Objects) in console
  try {
    console.log('AdminDashboard: orderStatusData', JSON.stringify(orderStatusData));
  } catch (e) {
    console.log('AdminDashboard: orderStatusData (fallback)', orderStatusData);
  }

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

  // Format currency in PHP (Philippine Peso) safely without relying on literal symbols
  function formatCurrency(amount) {
    const value = Number(amount || 0);
    try {
      return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2 }).format(value);
    } catch (e) {
      // fallback
      return `₱${value.toFixed(2)}`;
    }
  }

  // Responsive chart sizing — bigger on md/lg/xl, compact on small screens
  const pieConfig = isXl
    ? { height: 420, inner: 88, outer: 170, cy: '50%' }
    : isLg
      ? { height: 380, inner: 76, outer: 150, cy: '50%' }
      : isMd
        ? { height: 320, inner: 64, outer: 120, cy: '50%' }
        : { height: 220, inner: 48, outer: 88, cy: '50%' };

  return (
    <Layout>
      {/* Header Section with Modern Styling */}
      <Box 
        sx={{ 
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          borderRadius: '24px',
          px: 4,
          py: 3,
          mb: 3,
          color: 'white',
          position: 'relative',
          overflow: 'hidden',
          boxShadow: '0 8px 32px rgba(102, 126, 234, 0.15)',
        }}>
        <Box sx={{
          position: 'absolute',
          bottom: -30,
          left: -30,
          width: 80,
          height: 80,
          borderRadius: '50%',
          backgroundColor: 'rgba(255, 255, 255, 0.05)',
        }} />

        <Box sx={{ position: 'relative', zIndex: 1 }}>
          <Typography variant="h4" sx={{ fontWeight: 'bold', mb: 1 }}>
            Dashboard Overview
          </Typography>
          <Typography variant="body1" sx={{ opacity: 0.9 }}>
            Welcome back! Here's what's happening at P-Town today.
          </Typography>
        </Box>
      </Box>

      {/* New Order Banner */}
      <Box sx={{ mb: 2 }}>
        <Collapse in={newOrderBanner.open}>
          <Alert 
            severity="success"
            sx={{
              borderRadius: 2,
              border: '1px solid rgba(76, 175, 80, 0.2)',
              backgroundColor: 'rgba(76, 175, 80, 0.05)',
            }}
          >
            <Typography variant="body1" sx={{ fontWeight: 600 }}>
              {newOrderBanner.message || `New order #${newOrderBanner.orderNumber} â€” Nice work!`}
            </Typography>
          </Alert>
        </Collapse>
      </Box>

  {/* Main Layout: Left Content + Right Chart */}
  <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 3, mb: 3 }}>
        {/* Left Content Area */}
        <Box sx={{ flex: { xs: '1 1 100%', md: '2 1 0' }, minWidth: 0 }}>
          {/* ROW 1: 5 Stat Cards (wrap on small screens) */}
          <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
            {statCards.map((card, index) => (
              <Box key={index} sx={{ flex: { xs: '1 1 48%', sm: '1 1 32%', md: '1 1 0' }, minWidth: 0 }}>
                <Card elevation={0} sx={{ background: card.bgColor, border: `1px solid ${alpha(card.color, 0.2)}`, borderRadius: 3, height: 120, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', transition: 'all 0.25s ease', '&:hover': { transform: 'translateY(-4px)', boxShadow: `0 12px 32px ${alpha(card.color, 0.15)}` } }}>
                  <CardContent sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Box sx={{ width: 40, height: 40, borderRadius: '50%', background: card.color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '1.1rem' }}>{card.icon}</Box>
                      {card.change && (<Chip icon={card.trend === 'up' ? <ArrowUpward sx={{ fontSize: 12 }} /> : <ArrowDownward sx={{ fontSize: 12 }} />} label={card.change} size="small" sx={{ backgroundColor: card.trend === 'up' ? alpha('#4caf50', 0.12) : alpha('#f44336', 0.12), color: card.trend === 'up' ? '#2e7d32' : '#c62828', fontWeight: 700, fontSize: '0.7rem', height: 22 }} />)}
                    </Box>
                    <Box sx={{ mt: 1 }}>
                      <Typography variant="h6" sx={{ fontWeight: 800, color: '#111827', fontSize: '1.1rem', lineHeight: 1.2 }}>{card.value}</Typography>
                      <Typography variant="body2" sx={{ color: '#6b7280', fontWeight: 600, fontSize: '0.75rem' }}>{card.title}</Typography>
                    </Box>
                  </CardContent>
                </Card>
              </Box>
            ))}
          </Box>

          {/* ROW 2: Recent Orders (moved up) */}
          <Box sx={{ mb: 3 }}>
            <Card elevation={0} sx={{ borderRadius: 3, border: '1px solid rgba(99, 102, 241, 0.1)', overflow: 'hidden', background: 'linear-gradient(145deg, #ffffff 0%, #f8fafc 100%)' }}>
              <Box sx={{ background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)', color: 'white', p: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Box>
                          <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>Recent Orders</Typography>
                          <Typography variant="body2" sx={{ opacity: 0.9 }}>Latest transactions and order management</Typography>
                        </Box>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                  {/* For non-admin employees, route directly to the New Order page */}
                                  {user && user.role !== 'admin' && (
                                    <Button size="small" variant="contained" onClick={() => navigate('/orders', { state: { openNewOrder: true } })}>New Order</Button>
                                  )}
                                  <ReceiptLong sx={{ fontSize: 28, opacity: 0.8 }} />
                                </Box>
                      </Box>
              </Box>
              {recentOrders.length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 6 }}>
                  <ShoppingCart sx={{ fontSize: 48, color: '#6366f1', mb: 2, opacity: 0.7 }} />
                  <Typography variant="h6" color="text.primary" sx={{ fontWeight: 600, mb: 1 }}>No Recent Orders</Typography>
                  <Typography variant="body1" color="text.secondary">Orders will appear here once they are placed</Typography>
                </Box>
              ) : (
                <Box sx={{ overflow: 'auto', maxHeight: { xs: 300, sm: 360, md: 420 } }}>
                  <Table>
                    <TableHead>
                      <TableRow sx={{ backgroundColor: 'rgba(99, 102, 241, 0.03)' }}>
                        <TableCell sx={{ fontWeight: 700, color: '#1e293b' }}>Order #</TableCell>
                        <TableCell sx={{ fontWeight: 700, color: '#1e293b' }}>Customer</TableCell>
                        <TableCell sx={{ fontWeight: 700, color: '#1e293b' }}>Type</TableCell>
                        <TableCell sx={{ fontWeight: 700, color: '#1e293b' }}>Status</TableCell>
                        <TableCell sx={{ fontWeight: 700, color: '#1e293b' }}>Total</TableCell>
                        <TableCell sx={{ fontWeight: 700, color: '#1e293b' }}>Employee</TableCell>
                        <TableCell sx={{ fontWeight: 700, color: '#1e293b' }}>Time</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {recentOrders.slice(0, 8).map((order, index) => (
                        <TableRow key={order.id} sx={{ '&:hover': { backgroundColor: 'rgba(99, 102, 241, 0.02)' }, '& .MuiTableCell-root': { borderBottom: index < recentOrders.slice(0, 8).length - 1 ? '1px solid rgba(0,0,0,0.06)' : 'none', py: 2 } }}>
                          <TableCell>
                            <Chip label={`#${order.orderNumber}`} size="small" sx={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: 'white', fontWeight: 700, fontSize: '0.75rem' }} />
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" sx={{ fontWeight: 500, color: '#1e293b' }}>{order.customerName || 'Walk-in Customer'}</Typography>
                          </TableCell>
                          <TableCell>
                            <Chip label={order.orderType} size="small" sx={{ backgroundColor: 'rgba(99, 102, 241, 0.1)', color: '#6366f1', fontWeight: 600, fontSize: '0.75rem', textTransform: 'capitalize' }} />
                          </TableCell>
                          <TableCell>
                            <Chip label={order.status} size="small" color={getStatusColor(order.status)} sx={{ fontWeight: 600, fontSize: '0.75rem', textTransform: 'capitalize' }} />
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" sx={{ fontWeight: 700, color: '#10b981' }}>{formatCurrency(order.total)}</Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" sx={{ color: '#64748b' }}>
                              {(() => {
                                // Prefer joined data from socketUsers/authUsers
                                const allUsers = ([...socketUsers || [], ...authUsers || []]);
                                const matched = allUsers.find(u => u.id === order.employeeId || u.uid === order.employeeId);
                                if (matched) return `${matched.firstName || ''} ${matched.lastName || ''}`.trim() || matched.username || matched.email || order.employeeId;

                                // If manager view, check the lightweight lookup we populated
                                if (employeeLookup[order.employeeId]) return employeeLookup[order.employeeId];

                                // If the order includes a denormalized employeeName, use it
                                if (order.employeeName) return order.employeeName;

                                if (!order.employeeId) return 'System';
                                return order.employeeId.length > 12 ? `${order.employeeId.slice(0,8)}...` : order.employeeId;
                              })()}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" sx={{ color: '#64748b' }}>
                              {order.createdAt?.toDate ? order.createdAt.toDate().toLocaleTimeString() : (order.createdAt ? new Date(order.createdAt).toLocaleTimeString() : 'N/A')}
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Box>
              )}
            </Card>
          </Box>

          {/* ROW 3: Inventory Alerts + Top Selling Items */}
          <Box sx={{ display: 'flex', gap: 3 }}>
            {/* Inventory Alerts */}
            <Box sx={{ flex: 1 }}>
              <Card elevation={0} sx={{ borderRadius: 3, border: '1px solid rgba(239, 68, 68, 0.15)', overflow: 'hidden', height: 240, background: 'linear-gradient(135deg, #ffffff 0%, #fef2f2 100%)' }}>
                <Box sx={{ background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)', color: 'white', p: 2.5 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box>
                      <Typography variant="h6" sx={{ fontWeight: 'bold', mb: 0.5 }}>Inventory Alerts</Typography>
                      <Typography variant="body2" sx={{ opacity: 0.9, fontSize: '0.8rem' }}>Low stock notifications requiring attention</Typography>
                    </Box>
                    <Warning sx={{ fontSize: 24 }} />
                  </Box>
                </Box>
                <Box sx={{ p: 2.5, height: 'calc(100% - 80px)', overflow: 'auto' }}>
                  {inventoryAlerts.length === 0 ? (
                    <Box sx={{ textAlign: 'center', py: 2 }}>
                      <CheckCircle sx={{ fontSize: 40, color: '#10b981', mb: 1, opacity: 0.8 }} />
                      <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 0.5, color: '#065f46' }}>All Stock Levels Good!</Typography>
                      <Typography variant="body2" sx={{ color: '#047857' }}>No low stock alerts at the moment</Typography>
                    </Box>
                  ) : (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      {inventoryAlerts.map((alert) => (
                        <Box key={alert.id} sx={{ p: 1.5, borderRadius: 2, border: '1px solid rgba(239, 68, 68, 0.15)', backgroundColor: 'rgba(239, 68, 68, 0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <Box>
                            <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#1e293b' }}>{alert.itemName}</Typography>
                            <Typography variant="caption" color="error.main">Stock: {alert.currentStock} (threshold: {alert.threshold})</Typography>
                          </Box>
                          <Button size="small" variant="outlined" onClick={() => handleResolveAlert(alert.id)}>Resolve</Button>
                        </Box>
                      ))}
                    </Box>
                  )}
                </Box>
              </Card>
            </Box>

            {/* Top Selling Items */}
            <Box sx={{ flex: 1 }}>
              <Card elevation={0} sx={{ borderRadius: 3, border: '1px solid rgba(16, 185, 129, 0.15)', overflow: 'hidden', height: 240, background: 'linear-gradient(135deg, #ffffff 0%, #f0fdf4 100%)' }}>
                <Box sx={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: 'white', p: 2.5 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box>
                      <Typography variant="h6" sx={{ fontWeight: 'bold', mb: 0.5 }}>Top Selling Items</Typography>
                      <Typography variant="body2" sx={{ opacity: 0.9, fontSize: '0.8rem' }}>Most popular menu items today</Typography>
                    </Box>
                    <TrendingUp sx={{ fontSize: 24 }} />
                  </Box>
                </Box>
                <Box sx={{ p: 2.5, height: 'calc(100% - 80px)', overflow: 'auto' }}>
                  {dashboardData?.topItems?.length > 0 ? (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      {dashboardData.topItems.slice(0, 3).map((item, index) => (
                        <Box key={index} sx={{ p: 1.5, borderRadius: 2, background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(16, 185, 129, 0.03) 100%)', border: '1px solid rgba(16, 185, 129, 0.15)' }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Box sx={{ width: 20, height: 20, borderRadius: '50%', background: 'linear-gradient(135deg, #10b981, #059669)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 'bold' }}>{index + 1}</Box>
                              <Typography variant="body2" sx={{ fontWeight: 600, color: '#1e293b' }}>{item.name}</Typography>
                            </Box>
                            <Chip label={`${item.quantity} sold`} size="small" sx={{ background: 'linear-gradient(135deg, #10b981, #059669)', color: 'white', fontSize: '0.65rem', fontWeight: 700, height: 20 }} />
                          </Box>
                          <LinearProgress variant="determinate" value={(item.quantity / (dashboardData.topItems[0]?.quantity || 1)) * 100} sx={{ height: 4, borderRadius: 2, backgroundColor: 'rgba(16, 185, 129, 0.15)', '& .MuiLinearProgress-bar': { background: 'linear-gradient(90deg, #10b981, #059669)', borderRadius: 2 } }} />
                        </Box>
                      ))}
                    </Box>
                  ) : (
                    <Box sx={{ textAlign: 'center', py: 2 }}>
                      <TrendingUp sx={{ fontSize: 40, color: '#10b981', mb: 1, opacity: 0.8 }} />
                      <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 0.5, color: '#065f46' }}>No Sales Data Available</Typography>
                      <Typography variant="body2" sx={{ color: '#047857' }}>Data will appear here once orders are placed</Typography>
                    </Box>
                  )}
                </Box>
              </Card>
            </Box>
          </Box>
        </Box>

        {/* Right: Large Order Status Distribution Chart */}
        <Box sx={{ flex: { xs: '1 1 100%', md: '1 1 0' }, minWidth: 0 }}>
          <Card elevation={0} sx={{ borderRadius: 3, border: '1px solid rgba(99, 102, 241, 0.12)', minHeight: pieConfig.height + 260, background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)', color: 'white', p: 3, borderRadius: '12px 12px 0 0' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography variant="h5" sx={{ fontWeight: 800, mb: 0.5 }}>Order Status Distribution</Typography>
                  <Typography variant="body2" sx={{ opacity: 0.9 }}>Real-time order status breakdown</Typography>
                </Box>
                <PieChartIcon sx={{ fontSize: 32, opacity: 0.9 }} />
              </Box>
            </Box>
            <Box sx={{ px: 2, pt: 2, flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              <ResponsiveContainer width="100%" height={pieConfig.height}>
                <PieChart>
                  <Pie data={orderStatusData} cx="50%" cy={pieConfig.cy} innerRadius={pieConfig.inner} outerRadius={pieConfig.outer} paddingAngle={3} dataKey="value">
                    {orderStatusData.map((entry, index) => (<Cell key={`cell-${index}`} fill={entry.color} />))}
                  </Pie>
                  <RechartsTooltip contentStyle={{ backgroundColor: 'white', border: 'none', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.06)', fontSize: '13px' }} />
                </PieChart>
              </ResponsiveContainer>
            </Box>
            <Box sx={{ px: 3, pb: 3, display: 'flex', gap: 2.5, justifyContent: 'center', flexWrap: 'wrap' }}>
              {orderStatusData.map((item, index) => (
                <Box key={index} sx={{ textAlign: 'center', minWidth: 80 }}>
                  <Box sx={{ width: 56, height: 56, borderRadius: '50%', backgroundColor: alpha(item.color, 0.06), border: `4px solid ${alpha(item.color, 0.12)}`, display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 0.5, mx: 'auto' }}>
                    <Typography variant="h5" sx={{ fontWeight: 800, color: item.color }}>{item.value}</Typography>
                  </Box>
                  <Typography variant="caption" sx={{ fontWeight: 700, color: '#64748b', display: 'block' }}>{item.name}</Typography>
                </Box>
              ))}
            </Box>
          </Card>
        </Box>
      </Box>

      {/* Recent Orders has been moved into the left column earlier to improve layout */}
    </Layout>
  );
};

export default AdminDashboard;
