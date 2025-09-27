import React, { createContext, useContext, useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../firebase';
import { doc, getDoc, setDoc, serverTimestamp, getDocs, collection } from 'firebase/firestore';
// Services are imported dynamically inside effects/functions to avoid circular import
// which can cause "Cannot access 'AuthProvider' before initialization" errors.
import toast from 'react-hot-toast';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Data state
  const [users, setUsers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [categories, setCategories] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [activities, setActivities] = useState([]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      console.log('Auth state changed:', firebaseUser ? `User logged in: ${firebaseUser.email}` : 'User logged out');
      
      if (firebaseUser) {
        try {
          // Add a small delay to ensure Firestore operations have completed
          await new Promise(resolve => setTimeout(resolve, 100));
          
          // Get user data from Firestore
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          if (userDoc.exists()) {
            const userData = { id: userDoc.id, ...userDoc.data() };
            console.log('User data loaded successfully:', userData.email, userData.role);
            setUser(userData);
            setIsAuthenticated(true);
            setLoading(false);
          } else {
            // User exists in Auth but not in Firestore - give it a moment and try again
            console.warn('User exists in Auth but not in Firestore - waiting and retrying...');
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Retry once more
            const retryUserDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
            if (retryUserDoc.exists()) {
              const userData = { id: retryUserDoc.id, ...retryUserDoc.data() };
              console.log('User data loaded on retry:', userData.email, userData.role);
              setUser(userData);
              setIsAuthenticated(true);
              setLoading(false);
            } else {
              console.warn('User still not found in Firestore after retry - attempting recovery');
              try {
                // Try to find an existing user document that matches this auth user's email or username
                const usersCol = collection(db, 'users');
                const snapshot = await getDocs(usersCol);
                const allUsers = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

                const matchByEmail = allUsers.find(u => u.email && firebaseUser.email && u.email === firebaseUser.email);
                const usernameFromEmail = firebaseUser.email ? firebaseUser.email.split('@')[0] : null;
                const matchByUsername = allUsers.find(u => usernameFromEmail && u.username === usernameFromEmail);

                let recovered = null;
                if (matchByEmail) recovered = matchByEmail;
                else if (matchByUsername) recovered = matchByUsername;

                if (recovered) {
                  console.log('Found matching user document; copying to auth UID to recover session:', recovered.username);
                  // Copy recovered data to a new document keyed by the auth UID
                  const newDocRef = doc(db, 'users', firebaseUser.uid);
                  await setDoc(newDocRef, {
                    ...recovered,
                    id: firebaseUser.uid,
                    email: recovered.email || firebaseUser.email || '',
                    updatedAt: serverTimestamp()
                  });
                  const newUserData = { id: firebaseUser.uid, ...recovered, email: recovered.email || firebaseUser.email || '' };
                  setUser(newUserData);
                  setIsAuthenticated(true);
                  setLoading(false);
                } else {
                  console.log('No matching user doc found; creating default employee record');
                  // Create a minimal employee document so the user can proceed
                  const newDocRef = doc(db, 'users', firebaseUser.uid);
                  const defaultUsername = firebaseUser.email ? firebaseUser.email.split('@')[0] : `user_${firebaseUser.uid.slice(0,6)}`;
                  const defaultUser = {
                    id: firebaseUser.uid,
                    username: defaultUsername,
                    email: firebaseUser.email || '',
                    role: 'employee',
                    firstName: '',
                    lastName: '',
                    isActive: true,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                  };
                  await setDoc(newDocRef, defaultUser);
                  setUser(defaultUser);
                  setIsAuthenticated(true);
                  setLoading(false);
                }
              } catch (recErr) {
                console.error('Error recovering user document:', recErr);
                setUser(null);
                setIsAuthenticated(false);
                setLoading(false);
              }
            }
          }
        } catch (error) {
          console.error('Error getting user data:', error);
          setUser(null);
          setIsAuthenticated(false);
          setLoading(false);
        }
      } else {
        console.log('No user authenticated');
        setUser(null);
        setIsAuthenticated(false);
        setLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  // Load initial data without real-time subscriptions to prevent infinite refresh
  useEffect(() => {
    if (!user) return;
    
    const loadInitialData = async () => {
      try {
        console.log('Loading initial data for user:', user.email);
        // Import services lazily to avoid circular dependency at module init
        const services = await import('../services/firebaseServices');
        const { UserService, OrderService, MenuService, ActivityService } = services;

        // Load users (admin only)
        if (user.role === 'admin') {
          const usersData = await UserService.getAllUsers();
          setUsers(usersData);
        }

        // Load orders
        const ordersData = await OrderService.getAllOrders();
        setOrders(ordersData);

        // Load menu categories
        const categoriesData = await MenuService.getCategories();
        setCategories(categoriesData);

        // Load menu items
        const itemsData = await MenuService.getAllItems();
        setMenuItems(itemsData);

        // Load activities
        const activitiesData = await ActivityService.getRecentActivities();
        setActivities(activitiesData);

        console.log('Initial data loaded successfully');
      } catch (error) {
        console.error('Error loading initial data:', error);
        toast.error('Error loading data');
      }
    };

    loadInitialData();
  }, [user]);

  // Enable real-time subscriptions for admin users so updates like `isAvailable` propagate immediately
  useEffect(() => {
    if (!user) return;
    
    let unsubscribeUsers;

    // Subscribe to users (admin only)
    if (user.role === 'admin') {
      // Load UserService lazily to avoid circular import at module init
      (async () => {
        try {
          const services = await import('../services/firebaseServices');
          unsubscribeUsers = services.UserService.subscribeToUsers((newUsers) => {
            setUsers(newUsers);
          });
        } catch (err) {
          console.error('Failed to subscribe to users:', err);
        }
      })();
    }

    // Cleanup subscription
    return () => {
      unsubscribeUsers?.();
    };
  }, [user]);

  const login = async (credentials) => {
    try {
      setLoading(true);
      console.log('Attempting login for:', credentials.email || credentials.username);
      const services = await import('../services/firebaseServices');
      const { UserService, ActivityService } = services;

      const userData = await UserService.signIn(credentials.email || credentials.username, credentials.password);
      console.log('Login successful for user:', userData.username, userData.role);
      
      // Log activity
      await ActivityService.logActivity({
        type: 'AUTH',
        action: 'LOGIN',
        userId: userData.id,
        details: `User ${userData.username} logged in`,
        metadata: { role: userData.role }
      });
      
      toast.success(`Welcome back, ${userData.firstName || userData.username}!`);
      return { success: true };
    } catch (error) {
      console.error('Login error:', error);
      const message = error.message || 'Login failed';
      toast.error(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      const services = await import('../services/firebaseServices');
      const { ActivityService, UserService } = services;

      if (user) {
        await ActivityService.logActivity({
          type: 'AUTH',
          action: 'LOGOUT',
          userId: user.id,
          details: `User ${user.username} logged out`
        });
      }

      await UserService.signOut();
      setUser(null);
      setIsAuthenticated(false);
      setUsers([]);
      setOrders([]);
      setCategories([]);
      setMenuItems([]);
      setActivities([]);
      toast.success('Logged out successfully');
    } catch (error) {
      console.error('Logout error:', error);
      // Force logout even if there's an error
      setUser(null);
      setIsAuthenticated(false);
      toast.success('Logged out successfully');
    }
  };

  const updateUser = async (userId, userData) => {
    try {
      const services = await import('../services/firebaseServices');
      const { UserService } = services;

      await UserService.updateUser(userId, userData);
      if (userId === user.id) {
        setUser({ ...user, ...userData });
      }
      toast.success('User updated successfully');
    } catch (error) {
      toast.error('Failed to update user');
      throw error;
    }
  };

  // Menu management methods
  const createCategory = async (categoryData) => {
    try {
      const services = await import('../services/firebaseServices');
      const { MenuService, ActivityService } = services;

      const categoryId = await MenuService.createCategory(categoryData);
      await ActivityService.logActivity({
        type: 'MENU',
        action: 'CREATE_CATEGORY',
        userId: user.id,
        details: `Created category: ${categoryData.name}`,
        metadata: { categoryId }
      });
      toast.success('Category created successfully');
      return categoryId;
    } catch (error) {
      toast.error('Failed to create category');
      throw error;
    }
  };

  const createMenuItem = async (itemData) => {
    try {
      const services = await import('../services/firebaseServices');
      const { MenuService, ActivityService } = services;

      const itemId = await MenuService.createItem(itemData);
      await ActivityService.logActivity({
        type: 'MENU',
        action: 'CREATE_ITEM',
        userId: user.id,
        details: `Created menu item: ${itemData.name}`,
        metadata: { itemId }
      });
      toast.success('Menu item created successfully');
      return itemId;
    } catch (error) {
      toast.error('Failed to create menu item');
      throw error;
    }
  };

  // Order management methods
  const createOrder = async (orderData, orderItems) => {
    try {
      const services = await import('../services/firebaseServices');
      const { OrderService, ActivityService } = services;

      const orderId = await OrderService.createOrder(orderData, orderItems);
      await ActivityService.logActivity({
        type: 'ORDER',
        action: 'CREATE',
        userId: user.id,
        details: `Created order: ${orderData.orderNumber || orderId}`,
        metadata: { orderId, total: orderData.total }
      });
      toast.success('Order created successfully');
      return orderId;
    } catch (error) {
      toast.error('Failed to create order');
      throw error;
    }
  };

  const isAdmin = () => {
    return user?.role === 'admin';
  };

  const isManager = () => {
    return user?.role === 'manager';
  };

  const isEmployee = () => {
    return user?.role === 'employee';
  };

  const isDelivery = () => {
    return user?.role === 'delivery';
  };

  const isManagerOrAdmin = () => {
    return user?.role === 'admin' || user?.role === 'manager';
  };

  const canAccessReports = () => {
    return user?.role === 'admin' || user?.role === 'manager';
  };

  const canManageUsers = () => {
    return user?.role === 'admin';
  };

  const canManageMenu = () => {
    return user?.role === 'admin' || user?.role === 'manager';
  };

  const canProcessOrders = () => {
    return user?.role === 'admin' || user?.role === 'manager' || user?.role === 'employee';
  };

  const canViewMenu = () => {
    return user?.role === 'admin' || user?.role === 'manager' || user?.role === 'employee';
  };

  const canViewDeliveries = () => {
    return user?.role === 'admin' || user?.role === 'manager' || user?.role === 'delivery';
  };

  const canManageDeliveries = () => {
    return user?.role === 'admin' || user?.role === 'manager' || user?.role === 'delivery';
  };

  const refreshData = async () => {
    if (!user) return;
    
    try {
      console.log('Refreshing data...');
      const services = await import('../services/firebaseServices');
      const { UserService, OrderService, MenuService, ActivityService } = services;

      // Reload users (admin only)
      if (user.role === 'admin') {
        const usersData = await UserService.getAllUsers();
        setUsers(usersData);
      }

      // Reload orders
      const ordersData = await OrderService.getAllOrders();
      setOrders(ordersData);

      // Reload menu categories
      const categoriesData = await MenuService.getCategories();
      setCategories(categoriesData);

      // Reload menu items
      const itemsData = await MenuService.getAllItems();
      setMenuItems(itemsData);

      // Reload activities
      const activitiesData = await ActivityService.getRecentActivities();
      setActivities(activitiesData);

      console.log('Data refreshed successfully');
    } catch (error) {
      console.error('Error refreshing data:', error);
    }
  };

  const value = {
    user,
    loading,
    isAuthenticated,
    login,
    logout,
    updateUser,
    createCategory,
    createMenuItem,
    createOrder,
    isAdmin,
    isManager,
    isEmployee,
    isDelivery,
    isManagerOrAdmin,
    canAccessReports,
    canManageUsers,
    canManageMenu,
    canProcessOrders,
    canViewMenu,
    canViewDeliveries,
    canManageDeliveries,
    refreshData,
    // Data
    users,
    orders,
    categories,
    menuItems,
    activities,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
