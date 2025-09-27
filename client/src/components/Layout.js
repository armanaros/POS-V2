import React, { useState } from 'react';
import {
  AppBar,
  Box,
  CssBaseline,
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
  Avatar,
  Menu,
  MenuItem,
  Divider,
  Badge,
  Chip,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
} from '@mui/material';
import {
  Menu as MenuIcon,
  Dashboard,
  ShoppingCart,
  Restaurant,
  Assessment,
  People,
  Build,
  Logout,
  AccountCircle,
  Notifications,
  CloudDone,
  CloudOff,
  LocalShipping,
  
} from '@mui/icons-material';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import { OrderService, MenuService } from '../services/firebaseServices';
import logger from '../utils/logger'; // Added logger import
// AnnouncementBanner removed; notifications menu will replace it

const drawerWidth = 240;

const Layout = ({ children }) => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [anchorEl, setAnchorEl] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, canAccessReports, canManageUsers, canViewMenu, canProcessOrders, canViewDeliveries } = useAuth();
  const { isConnected, forceSync } = useSocket();
  const [hasUnreadAnnouncement, setHasUnreadAnnouncement] = React.useState(false);
  const [notifAnchorEl, setNotifAnchorEl] = React.useState(null);
  const [announcementsList, setAnnouncementsList] = React.useState([]);
  const [openAnnouncementDialog, setOpenAnnouncementDialog] = React.useState(false);
  const [selectedAnnouncement, setSelectedAnnouncement] = React.useState(null);

  // Check latest announcement vs local last seen id
  React.useEffect(() => {
    let mounted = true;
    const checkLatest = async () => {
      try {
        const items = await (await import('../services/firebaseServices')).AnnouncementService.getAllAnnouncements(1);
        if (!mounted) return;
        if (items && items.length > 0) {
          const latest = items[0];
          try {
            const lastSeen = localStorage.getItem('ptown:lastSeenAnnouncementId');
            setHasUnreadAnnouncement(!lastSeen || lastSeen !== latest.id);
          } catch (e) {
            setHasUnreadAnnouncement(true);
          }
        } else {
          setHasUnreadAnnouncement(false);
        }
      } catch (err) {
        logger.debug('Announcement check failed', err.message || err); // Updated to logger.debug
      }
    };
    checkLatest();

    // Also subscribe to announcement updates to update badge in real-time
    const unsubPromise = (async () => {
      const svc = (await import('../services/firebaseServices')).AnnouncementService;
      return svc.subscribeToAnnouncements((items) => {
        if (items && items.length > 0) {
          try {
            const lastSeen = localStorage.getItem('ptown:lastSeenAnnouncementId');
            setHasUnreadAnnouncement(!lastSeen || lastSeen !== items[0].id);
          } catch (e) {
            setHasUnreadAnnouncement(true);
          }
        } else {
          setHasUnreadAnnouncement(false);
        }
      });
    })();

    return () => { mounted = false; unsubPromise.then(u => u && u()); };
  }, []);

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const handleCollapseToggle = () => {
    setCollapsed(prev => !prev);
  };

  // Auto-collapse sidebar on tablet/iPad widths (approx between 820 and 1200px)
  React.useEffect(() => {
    const applyCollapse = () => {
      try {
        const w = window.innerWidth;
        if (w >= 820 && w < 1200) setCollapsed(true);
        else setCollapsed(false);
      } catch (e) {
        // ignore (server-side)
      }
    };
    applyCollapse();
    window.addEventListener('resize', applyCollapse);
    return () => window.removeEventListener('resize', applyCollapse);
  }, []);

  const handleProfileMenuOpen = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleProfileMenuClose = () => {
    setAnchorEl(null);
  };

  const handleLogout = async () => {
    handleProfileMenuClose();
    await logout();
    navigate('/login');
  };

  const handleProfileClick = () => {
    handleProfileMenuClose();
    navigate('/profile');
  };

  const getMenuItems = () => {
    const baseItems = [
      { text: 'Dashboard', icon: <Dashboard />, path: '/' },
    ];

    // Orders - All roles can access
    if (canProcessOrders()) {
      baseItems.push({ text: 'Orders', icon: <ShoppingCart />, path: '/orders' });
    }

    // Menu - All roles can view, but different permissions inside
    if (canViewMenu()) {
      baseItems.push({ text: 'Menu', icon: <Restaurant />, path: '/menu' });
    }

    // Deliveries - For delivery personnel and managers/admins
    if (canViewDeliveries()) {
      baseItems.push({ text: 'Deliveries', icon: <LocalShipping />, path: '/deliveries' });
    }

    // Reports - Only admin and manager
    if (canAccessReports()) {
      baseItems.push({ text: 'Reports', icon: <Assessment />, path: '/reports' });
    }

    // Users - Only admin
    if (canManageUsers()) {
      baseItems.push({ text: 'Users', icon: <People />, path: '/users' });
    }

    // Operations - admin-only page (hide from employees and managers)
    // Previously visible to roles that could process orders or view menu.
    // Only users with manage-users permission (admins) should see this.
    if (canManageUsers && canManageUsers()) {
      baseItems.push({ text: 'Operations', icon: <Build />, path: '/operations' });
    }

    return baseItems;
  };

  const menuItems = getMenuItems();

  const drawer = (
    <div>
      <Toolbar>
        {/* Close button for mobile drawer (appears inside the overlay) */}
        <IconButton
          onClick={handleDrawerToggle}
          sx={{ position: 'absolute', right: 8, top: 8, display: { xs: 'flex', sm: 'none' } }}
          aria-label="close menu"
        >
          <MenuIcon />
        </IconButton>
        <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', justifyContent: collapsed ? 'center' : 'flex-start', px: collapsed ? 1 : 2 }}>
          <Box sx={{ width: 32, height: 32, backgroundColor: 'primary.main', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 900, fontSize: '1.2rem' }}>P</Box>
          {!collapsed && (
            <Box sx={{ ml: 1 }}>
              <Typography variant="h6" sx={{ color: 'primary.main', fontWeight: 700, fontSize: '1.1rem', lineHeight: 1 }}>P-TOWN</Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem', lineHeight: 1, letterSpacing: '0.05em' }}>ALMUSALAN ATBP.</Typography>
            </Box>
          )}
        </Box>
      </Toolbar>
      <Divider />
      <List>
        {menuItems.map((item) => (
          <ListItem key={item.text} disablePadding sx={{ justifyContent: collapsed ? 'center' : 'flex-start' }}>
            <ListItemButton
              selected={location.pathname === item.path}
              onClick={() => navigate(item.path)}
              sx={{ justifyContent: collapsed ? 'center' : 'flex-start', px: collapsed ? 1 : 2 }}
            >
              <ListItemIcon sx={{ minWidth: collapsed ? 'auto' : 56, display: 'flex', justifyContent: 'center' }}>{item.icon}</ListItemIcon>
              {!collapsed && <ListItemText primary={item.text} />}
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </div>
  );

  // Prefetch menu and orders to warm caches for faster tab switching
  React.useEffect(() => {
    (async () => {
      try {
        await Promise.all([
          MenuService.getFullMenu(),
          OrderService.getAllOrders()
        ]);
      } catch (err) {
        // ignore prefetch errors
        logger.debug('Prefetch error', err.message || err); // Updated to logger.debug
      }
    })();
    return () => {};
  }, []);

  return (
    <Box sx={{ display: 'flex' }}>
      <CssBaseline />
      <AppBar
        position="fixed"
        sx={{
          // When collapsed, account for the smaller drawer width so content fills remaining space
          width: { sm: `calc(100% - ${collapsed ? 64 : drawerWidth}px)` },
          ml: { sm: `${collapsed ? 64 : drawerWidth}px` },
        }}
      >
        <Toolbar>
          <IconButton
            color="inherit"
            aria-label="open drawer"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 2, display: { sm: 'none' } }}
          >
            <MenuIcon />
          </IconButton>
          {/* Collapse/Expand toggle visible on tablet widths (hide on very large screens) */}
          <IconButton
            color="inherit"
            aria-label="collapse menu"
            edge="start"
            onClick={handleCollapseToggle}
            sx={{ mr: 2, display: { xs: 'none', lg: 'none', md: 'inline-flex' } }}
          >
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1 }}>
            {menuItems.find(item => item.path === location.pathname)?.text || 'Dashboard'}
          </Typography>
          
          {/* Connection Status Indicator */}
          <Tooltip title={isConnected ? 'Connected - Data synced in real-time' : 'Disconnected - Data may not be current'}>
            <Chip
              icon={isConnected ? <CloudDone /> : <CloudOff />}
              label={isConnected ? 'LIVE' : 'OFFLINE'}
              size="small"
              color={isConnected ? 'success' : 'error'}
              variant="outlined"
              sx={{ 
                mr: 2, 
                color: 'white',
                borderColor: 'white',
                '& .MuiChip-icon': { color: 'white' }
              }}
              onClick={!isConnected ? forceSync : undefined}
              clickable={!isConnected}
            />
          </Tooltip>
          
          <IconButton
            color="inherit"
            sx={{ mr: 1 }}
            onClick={async (e) => {
              // Open notifications menu and fetch recent announcements
              setNotifAnchorEl(e.currentTarget);
              try {
                const svc = (await import('../services/firebaseServices')).AnnouncementService;
                const items = await svc.getAllAnnouncements(10);
                setAnnouncementsList(items || []);
                // Mark latest as seen when opening
                if (items && items.length > 0) {
                  try { localStorage.setItem('ptown:lastSeenAnnouncementId', items[0].id); } catch (err) {}
                  setHasUnreadAnnouncement(false);
                }
              } catch (err) {
                console.error('Failed to load announcements', err);
                setAnnouncementsList([]);
              }
            }}
          >
            <Badge color="error" variant={hasUnreadAnnouncement ? 'dot' : 'standard'} overlap="circular">
              <Notifications />
            </Badge>
          </IconButton>

          <Menu
            anchorEl={notifAnchorEl}
            open={Boolean(notifAnchorEl)}
            onClose={() => setNotifAnchorEl(null)}
            PaperProps={{ sx: { width: 360 } }}
          >
            {announcementsList && announcementsList.length > 0 ? (
              announcementsList.map((a) => (
                <MenuItem
                  key={a.id}
                  onClick={() => {
                    setSelectedAnnouncement(a);
                    setOpenAnnouncementDialog(true);
                    setNotifAnchorEl(null);
                    try { localStorage.setItem('ptown:lastSeenAnnouncementId', a.id); } catch (e) {}
                    setHasUnreadAnnouncement(false);
                  }}
                  sx={{ alignItems: 'flex-start', whiteSpace: 'normal' }}
                >
                  <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{a.title || 'Announcement'}</Typography>
                    <Typography variant="body2" sx={{ opacity: 0.85 }}>{a.message?.slice(0, 180)}</Typography>
                    <Typography variant="caption" sx={{ mt: 0.5, color: 'text.secondary' }}>{a.createdAt?.toDate ? a.createdAt.toDate().toLocaleString() : ''}</Typography>
                  </Box>
                </MenuItem>
              ))
            ) : (
              <MenuItem disabled>No notifications</MenuItem>
            )}
          </Menu>

          <Dialog open={openAnnouncementDialog} onClose={() => setOpenAnnouncementDialog(false)} fullWidth maxWidth="sm">
            <DialogTitle>{selectedAnnouncement?.title || 'Announcement'}</DialogTitle>
            <DialogContent>
              <Typography variant="body1">{selectedAnnouncement?.message}</Typography>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setOpenAnnouncementDialog(false)}>Close</Button>
            </DialogActions>
          </Dialog>
          
          <IconButton
            size="large"
            edge="end"
            aria-label="account of current user"
            aria-controls="profile-menu"
            aria-haspopup="true"
            onClick={handleProfileMenuOpen}
            color="inherit"
          >
            <Avatar sx={{ width: 32, height: 32, bgcolor: 'secondary.main' }}>
              {user?.firstName?.[0] || 'U'}
            </Avatar>
          </IconButton>
        </Toolbar>
      </AppBar>

      <Menu
        id="profile-menu"
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleProfileMenuClose}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
      >
        <MenuItem onClick={handleProfileClick}>
          <ListItemIcon>
            <AccountCircle fontSize="small" />
          </ListItemIcon>
          Profile
        </MenuItem>
        <Divider />
        <MenuItem onClick={handleLogout}>
          <ListItemIcon>
            <Logout fontSize="small" />
          </ListItemIcon>
          Logout
        </MenuItem>
      </Menu>

      <Box
        component="nav"
        sx={{ width: { sm: collapsed ? 64 : drawerWidth }, flexShrink: { sm: 0 } }}
        aria-label="navigation menu"
      >
          <Drawer
          anchor="left"
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          transitionDuration={{ enter: 420, exit: 280 }}
          ModalProps={{
            keepMounted: true,
            // ensure the Drawer sits above other content
            // disableScrollLock is false by default to prevent page scrolling when open
          }}
          BackdropProps={{
            sx: {
              backgroundColor: 'rgba(0,0,0,0.35)',
              backdropFilter: 'blur(6px)',
              WebkitBackdropFilter: 'blur(6px)'
            }
          }}
          sx={{
            display: { xs: 'block', sm: 'none' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: drawerWidth,
              borderRadius: '0 12px 12px 0',
              position: 'fixed',
              right: 'auto',
              left: 0,
              top: 0,
              height: '100vh',
              boxShadow: theme => theme.shadows[25],
              zIndex: theme => theme.zIndex.drawer + 1200,
              // smoother transform and opacity transition for a polished reveal
              transition: theme => theme.transitions.create(['transform', 'opacity'], {
                duration: 420,
                easing: theme.transitions.easing.easeInOut,
              }),
            }
          }}
        >
          {drawer}
        </Drawer>
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', sm: 'block' },
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: collapsed ? 64 : drawerWidth, overflowX: 'hidden' },
          }}
          open
        >
          {drawer}
        </Drawer>
      </Box>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          // Adjust main width based on collapsed state so the blank gutter disappears
          width: { sm: `calc(100% - ${collapsed ? 64 : drawerWidth}px)` },
          bgcolor: 'transparent',
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Toolbar />
  {/* Announcement banner removed; users view announcements from the notifications menu */}
  <Box key={location.pathname} sx={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', bgcolor: 'transparent' }}>
          {children}
        </Box>
      </Box>
    </Box>
  );
};

export default Layout;
