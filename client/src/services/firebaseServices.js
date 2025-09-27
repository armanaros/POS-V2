import { 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  getDocs, 
  getDoc,
  setDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  writeBatch,
  increment,
  limit
} from 'firebase/firestore';
import { Timestamp } from 'firebase/firestore';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword,
  signOut
} from 'firebase/auth';
import { db, auth } from '../firebase';
import logger from '../utils/logger';

// Simple in-memory cache to reduce repeat reads and speed up tab switches
let ordersCache = null;
let ordersCacheTimestamp = 0;
let menuCache = null;
let menuCacheTimestamp = 0;
const CACHE_TTL = 30 * 1000; // 30 seconds

/**
 * Complete POS Firebase Service
 * Handles ALL POS operations with Firestore
 */

// ============= USER AUTHENTICATION & MANAGEMENT =============
export class UserService {
  static get usersRef() {
    return collection(db, 'users');
  }

  static async getUserById(userId) {
    try {
      const userDoc = await getDoc(doc(this.usersRef, userId));
      if (userDoc.exists()) {
        return { id: userDoc.id, ...userDoc.data() };
      }
      return null;
    } catch (error) {
      console.error('Error getting user by ID:', error);
      throw error;
    }
  }

  static async getUserByUsername(username) {
    try {
      // Get all users and filter by username in JavaScript to avoid index requirements
      const snapshot = await getDocs(this.usersRef);
      const users = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      const user = users.find(user => user.username === username);
      return user || null;
    } catch (error) {
      console.error('Error getting user by username:', error);
      throw error;
    }
  }

  // Authentication
  static async signIn(usernameOrEmail, password) {
    try {
      let email = usernameOrEmail;
      
      // If the input doesn't contain '@', treat it as username and find the email
      if (!usernameOrEmail.includes('@')) {
        const userDoc = await this.getUserByUsername(usernameOrEmail);
        if (!userDoc) {
          throw new Error('Invalid username or password');
        }
        // If the user document doesn't have an email (created with generated local email),
        // fall back to the generated local email pattern so Auth sign-in uses the correct address.
        email = userDoc.email || `${userDoc.username}@ptownv2.local`;
        
        // Debug logging to help troubleshoot
        console.log('Signing in user:', userDoc.username, 'with email:', email);
      }
      
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const userDoc = await this.getUserById(userCredential.user.uid);
      return userDoc;
    } catch (error) {
      console.error('Error signing in:', error);
      // If auth/invalid-credential, check if it's a password mismatch
      if (error.code === 'auth/invalid-credential') {
        throw new Error('Invalid username or password. Please check your credentials.');
      }
      throw error;
    }
  }  static async signOut() {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Error signing out:', error);
      throw error;
    }
  }

  // User CRUD
  static async createUser(userData, options = { forceClient: false }) {
    try {
      // Store current user info to restore session later
      const currentUser = auth.currentUser;
      
      if (!currentUser) {
        throw new Error('You must be logged in to create users');
      }
      
      // Validate username uniqueness first to avoid generated-email collisions
      if (!userData.username) {
        throw new Error('Username is required');
      }

      const existingByUsername = await this.getUserByUsername(userData.username);
      if (existingByUsername) {
        throw new Error('Username already exists. Choose a different username.');
      }

      // Generate email if not provided (Firebase Auth requires email)
      const email = userData.email || `${userData.username}@ptownv2.local`;

      // Check if email is already present in user documents to give a nicer error
      try {
        const emailQuery = query(this.usersRef, where('email', '==', email));
        const emailSnap = await getDocs(emailQuery);
        if (!emailSnap.empty) {
          throw new Error('Email already in use');
        }
      } catch (qErr) {
        // If the query failed, continue to auth call and rely on auth errors
        console.warn('Email existence check failed, will rely on Auth result:', qErr);
      }

      // Prefer server-side admin endpoint to create users (so current admin session is not affected)
      try {
        const token = await currentUser.getIdToken();
        const resp = await fetch('/api/admin/create-user', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ ...userData, email })
        });

        if (resp.status === 501) {
          // Server not configured for admin creation
          console.warn('Server admin endpoint not configured.');
          if (!options.forceClient) {
            const err = new Error('ADMIN_ENDPOINT_UNAVAILABLE');
            err.code = 'ADMIN_ENDPOINT_UNAVAILABLE';
            throw err;
          }
        } else if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          throw new Error(err.error || err.message || `Server responded with ${resp.status}`);
        } else {
          const body = await resp.json();
          return { success: true, userId: body.uid, message: body.message || 'User created by admin', password: body.password };
        }
      } catch (serverErr) {
        console.warn('Admin endpoint create failed or unavailable:', serverErr);
        if (serverErr && serverErr.code === 'ADMIN_ENDPOINT_UNAVAILABLE') throw serverErr;
        // If server unreachable or other network error and not forced, ask caller to confirm fallback
        if (!options.forceClient) {
          const err = new Error('ADMIN_ENDPOINT_UNAVAILABLE');
          err.code = 'ADMIN_ENDPOINT_UNAVAILABLE';
          throw err;
        }
        // else continue to fallback to client-side creation below
      }

      // Fallback: Create auth user on client (older behavior) - this will sign out current admin
      let userCredential;
      try {
        userCredential = await createUserWithEmailAndPassword(
          auth,
          email,
          userData.password
        );
      } catch (authErr) {
        console.error('Auth creation error:', authErr);
        if (authErr && authErr.code === 'auth/email-already-in-use') {
          throw new Error('Email already in use. Please use a different email or username.');
        }
        // Re-throw other auth errors for higher-level handling
        throw authErr;
      }

      // Create user document
      const userDocRef = doc(this.usersRef, userCredential.user.uid);
      await setDoc(userDocRef, {
        id: userCredential.user.uid,
        username: userData.username,
        // Store the actual email used for Auth (either provided or the generated local email)
        email: email || '',
        role: userData.role || 'employee',
        firstName: userData.firstName,
        lastName: userData.lastName,
        phone: userData.phone || '',
        address: userData.address || '',
        // Store dailyRate; fall back to legacy hourlyRate if provided
        dailyRate: userData.dailyRate || userData.hourlyRate || '',
        department: userData.department || '',
        hireDate: userData.hireDate || '',
        isActive: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      // Sign out the newly created user (old behavior)
      await signOut(auth);

      return {
        success: true,
        userId: userCredential.user.uid,
        message: 'User created successfully. You will need to log in again.'
      };
    } catch (error) {
      console.error('Error creating user:', error);
      throw error;
    }
  }

  static async getAllUsers() {
    try {
      const snapshot = await getDocs(this.usersRef);
      const users = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      // Filter active users in JavaScript
      return users.filter(user => user.isActive !== false);
    } catch (error) {
      console.error('Error getting users:', error);
      throw error;
    }
  }

  static async updateUser(userId, userData) {
    try {
      const userRef = doc(this.usersRef, userId);
      await updateDoc(userRef, {
        ...userData,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error updating user:', error);
      throw error;
    }
  }

  static async deleteUser(userId) {
    try {
      const userRef = doc(this.usersRef, userId);
      await updateDoc(userRef, {
        isActive: false,
        deletedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error deleting user:', error);
      throw error;
    }
  }

  // Real-time listeners
  static subscribeToUsers(callback) {
    return onSnapshot(this.usersRef, (snapshot) => {
      const users = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      // Filter active users in JavaScript
      const activeUsers = users.filter(user => user.isActive !== false);
      callback(activeUsers);
    });
  }
}

// ============= SCHEDULING / SHIFTS =============
export class ScheduleService {
  static get shiftsRef() {
    return collection(db, 'shifts');
  }

  static async createShift(shift) {
    try {
      const data = {
        employeeId: shift.employeeId,
        name: shift.name || '',
        position: shift.position || '',
        notes: shift.notes || '',
        // store as Firestore timestamps for accurate queries
        startISO: shift.startISO ? Timestamp.fromDate(new Date(shift.startISO)) : null,
        endISO: shift.endISO ? Timestamp.fromDate(new Date(shift.endISO)) : null,
        date: shift.date || (shift.startISO ? shift.startISO.split('T')[0] : null),
        startTime: shift.startTime || '',
        endTime: shift.endTime || '',
        createdAt: serverTimestamp()
      };

      const docRef = await addDoc(this.shiftsRef, data);
      return { id: docRef.id, ...data };
    } catch (error) {
      console.error('Error creating shift:', error);
      throw error;
    }
  }

  static async updateShift(id, patch) {
    try {
      if (!id) throw new Error('Invalid shift id');
      const docRef = doc(this.shiftsRef, id);
      const updateData = {};
      if (typeof patch.name !== 'undefined') updateData.name = patch.name;
      if (typeof patch.position !== 'undefined') updateData.position = patch.position;
      if (typeof patch.notes !== 'undefined') updateData.notes = patch.notes;
      if (typeof patch.startISO !== 'undefined') updateData.startISO = Timestamp.fromDate(new Date(patch.startISO));
      if (typeof patch.endISO !== 'undefined') updateData.endISO = Timestamp.fromDate(new Date(patch.endISO));
      if (typeof patch.date !== 'undefined') updateData.date = patch.date;
      if (typeof patch.startTime !== 'undefined') updateData.startTime = patch.startTime;
      if (typeof patch.endTime !== 'undefined') updateData.endTime = patch.endTime;

      await updateDoc(docRef, updateData);
      return { id, ...patch };
    } catch (error) {
      console.error('Error updating shift:', error);
      throw error;
    }
  }

  static async deleteShift(id) {
    try {
      if (!id) throw new Error('Invalid shift id');
      await deleteDoc(doc(this.shiftsRef, id));
      return true;
    } catch (error) {
      console.error('Error deleting shift:', error);
      throw error;
    }
  }

  static async fetchShifts() {
    try {
      const snapshot = await getDocs(this.shiftsRef);
      const shifts = snapshot.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          employeeId: data.employeeId,
          name: data.name,
          position: data.position,
          notes: data.notes,
          startISO: data.startISO ? (data.startISO.toDate ? data.startISO.toDate().toISOString() : new Date(data.startISO).toISOString()) : null,
          endISO: data.endISO ? (data.endISO.toDate ? data.endISO.toDate().toISOString() : new Date(data.endISO).toISOString()) : null,
          date: data.date,
          startTime: data.startTime,
          endTime: data.endTime
        };
      });
      return shifts;
    } catch (error) {
      console.error('Error fetching shifts:', error);
      throw error;
    }
  }
}

// ============= ABSENCE TRACKING =============
export class AbsenceService {
  static get absencesRef() {
    return collection(db, 'absences');
  }

  static async markAbsent(employeeId, date, reason = '', markedBy = null) {
    try {
      const dateStr = typeof date === 'string' ? date : date.toISOString().split('T')[0];
      
      // Check if absence already exists for this employee and date
      const existingQuery = query(
        this.absencesRef,
        where('employeeId', '==', employeeId),
        where('date', '==', dateStr)
      );
      const existingSnapshot = await getDocs(existingQuery);
      
      if (!existingSnapshot.empty) {
        throw new Error('Employee is already marked absent for this date');
      }

      const absenceData = {
        employeeId,
        date: dateStr,
        reason: reason || '',
        markedBy: markedBy || null,
        markedAt: serverTimestamp(),
        status: 'absent'
      };

      const docRef = await addDoc(this.absencesRef, absenceData);
      return { id: docRef.id, ...absenceData };
    } catch (error) {
      console.error('Error marking employee absent:', error);
      throw error;
    }
  }

  static async removeAbsence(absenceId) {
    try {
      if (!absenceId) throw new Error('Invalid absence id');
      await deleteDoc(doc(this.absencesRef, absenceId));
      return true;
    } catch (error) {
      console.error('Error removing absence:', error);
      throw error;
    }
  }

  static async getAbsences(startDate = null, endDate = null) {
    try {
      let q = this.absencesRef;
      
      if (startDate && endDate) {
        const startStr = typeof startDate === 'string' ? startDate : startDate.toISOString().split('T')[0];
        const endStr = typeof endDate === 'string' ? endDate : endDate.toISOString().split('T')[0];
        q = query(q, where('date', '>=', startStr), where('date', '<=', endStr));
      }

      const snapshot = await getDocs(q);
      const absences = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data(),
        markedAt: d.data().markedAt?.toDate?.() || null
      }));
      
      return absences;
    } catch (error) {
      console.error('Error fetching absences:', error);
      throw error;
    }
  }

  static async getEmployeeAbsences(employeeId, startDate = null, endDate = null) {
    try {
      let q = query(this.absencesRef, where('employeeId', '==', employeeId));
      
      if (startDate && endDate) {
        const startStr = typeof startDate === 'string' ? startDate : startDate.toISOString().split('T')[0];
        const endStr = typeof endDate === 'string' ? endDate : endDate.toISOString().split('T')[0];
        q = query(q, where('date', '>=', startStr), where('date', '<=', endStr));
      }

      const snapshot = await getDocs(q);
      const absences = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data(),
        markedAt: d.data().markedAt?.toDate?.() || null
      }));
      
      return absences;
    } catch (error) {
      console.error('Error fetching employee absences:', error);
      throw error;
    }
  }
}

// ============= INVENTORY / ALERTS =============
export class InventoryService {
  static get alertsRef() {
    return collection(db, 'inventory_alerts');
  }

  // Check stock levels for a list of menu item IDs and create alerts for items below threshold
  static async checkAndCreateLowStockAlerts(itemIds = []) {
    try {
      // Fetch latest item docs
      const snapshots = await Promise.all(itemIds.map(id => getDoc(doc(MenuService.itemsRef, id))));
      const lowStockItems = [];

      snapshots.forEach(snap => {
        if (!snap.exists()) return;
        const data = snap.data();
        const stock = Number(data.stockLevel || 0);
        const threshold = Number(data.lowStockThreshold || 5);
        if (stock <= threshold) {
          lowStockItems.push({ id: snap.id, name: data.name || 'Unknown', stock, threshold });
        }
      });

      // We'll upsert alerts: if an unresolved alert exists for the item, update it; otherwise create one.
      // Also, if item is no longer low (stock > threshold) and there are unresolved alerts, mark them resolved.
      if (itemIds.length === 0) return [];

      // Firestore 'in' supports up to 10 values; protect by batching if needed
      const BATCH_SIZE = 10;
      const results = [];

      for (let i = 0; i < itemIds.length; i += BATCH_SIZE) {
        const batchIds = itemIds.slice(i, i + BATCH_SIZE);

        // Fetch existing unresolved alerts for these itemIds
        const alertsQuery = query(this.alertsRef, where('itemId', 'in', batchIds), where('resolved', '==', false));
        const existingAlertsSnap = await getDocs(alertsQuery);
        const existingByItem = existingAlertsSnap.docs.reduce((m, d) => { m[d.data().itemId] = d; return m; }, {});

        const batch = writeBatch(db);

        // Process each item snapshot in this batch
        for (const id of batchIds) {
          const snap = snapshots.find(s => s.id === id);
          if (!snap || !snap.exists()) continue;
          const data = snap.data();
          const stock = Number(data.stockLevel || 0);
          const threshold = Number(data.lowStockThreshold || 5);
          const existingAlertDoc = existingByItem[id];

          if (stock <= threshold) {
            // low stock: create or update alert
            if (existingAlertDoc) {
              // update existing alert with latest stock
              const alertRef = doc(this.alertsRef, existingAlertDoc.id);
              batch.update(alertRef, {
                currentStock: stock,
                threshold,
                itemName: data.name || 'Unknown',
                updatedAt: serverTimestamp()
              });
              results.push({ id, action: 'updated' });
            } else {
              // create new alert
              const alertRef = doc(this.alertsRef);
              batch.set(alertRef, {
                itemId: id,
                itemName: data.name || 'Unknown',
                currentStock: stock,
                threshold,
                createdAt: serverTimestamp(),
                resolved: false
              });
              results.push({ id, action: 'created' });
            }
          } else {
            // stock is above threshold: resolve any existing unresolved alerts
            if (existingAlertDoc) {
              const alertRef = doc(this.alertsRef, existingAlertDoc.id);
              batch.update(alertRef, {
                resolved: true,
                resolvedAt: serverTimestamp(),
                updatedAt: serverTimestamp()
              });
              results.push({ id, action: 'resolved' });
            }
          }
        }

        // Commit writes for this batch
        await batch.commit();
      }

      return results;
    } catch (error) {
      console.error('Error checking/creating low stock alerts:', error);
      throw error;
    }
  }

  static async getActiveAlerts(limitCount = 50) {
    try {
      const q = query(this.alertsRef, where('resolved', '==', false), orderBy('createdAt', 'desc'), limit(limitCount));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
  // Log and return empty instead of throwing so UI can gracefully handle missing alerts
  console.error('Error getting active alerts (returning empty):', error);
  return [];
    }
  }

  static async resolveAlert(alertId) {
    try {
      const alertRef = doc(this.alertsRef, alertId);
      await updateDoc(alertRef, {
        resolved: true,
        resolvedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      return true;
    } catch (error) {
      console.error('Error resolving alert:', error);
      throw error;
    }
  }
}

// ============= ORDER MANAGEMENT =============
export class OrderService {
  static get ordersRef() {
    return collection(db, 'orders');
  }

  static get orderItemsRef() {
    return collection(db, 'order_items');
  }

  // Generate order number
  static generateOrderNumber() {
    const now = new Date();
    const year = now.getFullYear().toString().slice(-2);
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const time = now.getTime().toString().slice(-6);
    return `ORD${year}${month}${day}${time}`;
  }

  // Create order with items
  static async createOrder(orderData, orderItems) {
    try {
      const batch = writeBatch(db);
      
      // Create order document
      const orderRef = doc(this.ordersRef);
      const orderNumber = this.generateOrderNumber();
      
      batch.set(orderRef, {
        orderNumber,
        employeeId: orderData.employeeId,
        customerName: orderData.customerName || '',
        customerPhone: orderData.customerPhone || '',
        orderType: orderData.orderType,
        tableNumber: orderData.tableNumber || '',
        // Delivery-specific fields
        deliveryAddress: orderData.deliveryAddress || '',
        deliveryPersonId: orderData.deliveryPersonId || null,
        assignedAt: orderData.assignedAt || null,
        estimatedDeliveryTime: orderData.estimatedDeliveryTime || null,
        actualDeliveryTime: orderData.actualDeliveryTime || null,
        status: 'pending',
        subtotal: orderData.subtotal,
        tax: orderData.tax,
        discount: orderData.discount || 0,
        total: orderData.total,
        paymentMethod: orderData.paymentMethod,
        paymentStatus: 'pending',
        notes: orderData.notes || '',
        // Ensure each item saved in the order doc includes category info if provided
        items: (orderData.items || []).map(it => ({
          ...it,
          categoryId: it.categoryId || null,
          categoryName: it.categoryName || null
        })), // Store items directly in order document
        createdAt: serverTimestamp()
      });

      // Decrement stock levels for ordered items in the same batch (atomic)
      const affectedItemIds = [];
      // Also create separate order items for detailed tracking (optional)
      orderItems.forEach(item => {
        const itemRef = doc(this.orderItemsRef);
        batch.set(itemRef, {
          orderId: orderRef.id,
          menuItemId: item.menuItemId,
          name: item.name || 'Unknown Item',
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice,
          specialInstructions: item.specialInstructions || '',
          // Persist category metadata when available so server-side queries/reports
          // can rely on this field without depending on client lookups later
          categoryId: item.categoryId || null,
          categoryName: item.categoryName || null,
          createdAt: serverTimestamp()
        });
        try {
          if (item.menuItemId) {
            // Update stock using Firestore increment so we don't need to read current value here
            const menuItemDocRef = doc(MenuService.itemsRef, item.menuItemId);
            batch.update(menuItemDocRef, {
              stockLevel: increment(-(Number(item.quantity) || 0)),
              updatedAt: serverTimestamp()
            });
            affectedItemIds.push(item.menuItemId);
          }
        } catch (err) {
          // If update fails (missing item, etc.), log and continue; do not abort entire order
          console.error('Failed to add stock decrement to batch for item:', item.menuItemId, err);
        }
      });

      await batch.commit();

      // After commit, check for low stock and create alerts if needed (best-effort)
      try {
        if (affectedItemIds.length > 0) {
          await InventoryService.checkAndCreateLowStockAlerts(affectedItemIds);
        }
      } catch (alertErr) {
        console.error('Error while checking/creating low-stock alerts:', alertErr);
      }
      // After commit, ensure items with zero or negative stock are marked unavailable
      try {
        if (affectedItemIds.length > 0) {
          const postChecks = await Promise.all(affectedItemIds.map(id => getDoc(doc(MenuService.itemsRef, id))));
          const disableBatch = writeBatch(db);
          let hasDisable = false;
          postChecks.forEach(snap => {
            if (!snap.exists()) return;
            const data = snap.data();
            const stock = Number(data.stockLevel || 0);
            if (stock <= 0 && data.isAvailable !== false) {
              disableBatch.update(doc(MenuService.itemsRef, snap.id), { isAvailable: false, updatedAt: serverTimestamp() });
              hasDisable = true;
            }
          });
          if (hasDisable) await disableBatch.commit();
        }
      } catch (disableErr) {
        console.error('Error while auto-disabling out-of-stock items:', disableErr);
      }
      return orderRef.id;
    } catch (error) {
      console.error('Error creating order:', error);
      throw error;
    }
  }

  // Get all orders
  static async getAllOrders() {
    try {
      const snapshot = await getDocs(this.ordersRef);
      const now = Date.now();
      if (ordersCache && (now - ordersCacheTimestamp) < CACHE_TTL) {
        return ordersCache;
      }

      const orders = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      // Sort by createdAt in JavaScript
      const sorted = orders.sort((a, b) => {
        const aTime = a.createdAt?.toDate?.() || new Date(0);
        const bTime = b.createdAt?.toDate?.() || new Date(0);
        return bTime - aTime; // Newest first
      });

      ordersCache = sorted;
      ordersCacheTimestamp = Date.now();
      return sorted;
    } catch (error) {
      console.error('Error getting orders:', error);
      throw error;
    }
  }

  // Update order status
  static async updateOrderStatus(orderId, status) {
    try {
      const orderRef = doc(this.ordersRef, orderId);
      const orderSnap = await getDoc(orderRef);
      if (!orderSnap.exists()) throw new Error('Order not found');

      const prevStatus = orderSnap.data().status;
      // No-op if status isn't changing
      if (prevStatus === status) return;

      const updateData = {
        status,
        updatedAt: serverTimestamp()
      };

      if (status === 'served' || status === 'completed') {
        updateData.completedAt = serverTimestamp();
      }
      if (status === 'delivered') {
        updateData.deliveredAt = serverTimestamp();
      }

      // Decide whether to restore stock on cancellation. We restore when the order
      // transitions to 'cancelled' from a non-final, non-served state. Do not restore
      // if the order was already served/completed/refunded.
      const NON_RESTORE_PREV = ['served', 'completed', 'refunded'];
      const shouldRestoreStock = status === 'cancelled' && !NON_RESTORE_PREV.includes(prevStatus);

      if (shouldRestoreStock) {
        // Try to get items stored in the order document first, fall back to order_items collection
        let items = orderSnap.data().items || [];
        if (!Array.isArray(items) || items.length === 0) {
          const itemsQuery = query(this.orderItemsRef, where('orderId', '==', orderId));
          const itemsSnap = await getDocs(itemsQuery);
          items = itemsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        }

        // Collect unique menu item ids and quantities
        const qtyByItem = {};
        items.forEach(it => {
          const menuItemId = it.menuItemId || it.menuItem || it.id;
          const qty = Number(it.quantity || it.qty || 0);
          if (!menuItemId || qty <= 0) return;
          qtyByItem[menuItemId] = (qtyByItem[menuItemId] || 0) + qty;
        });

        const itemIds = Object.keys(qtyByItem);

        // Prefetch item docs so we only update existing docs
        const itemSnaps = await Promise.all(itemIds.map(id => getDoc(doc(MenuService.itemsRef, id))));

        const batch = writeBatch(db);
        batch.update(orderRef, updateData);

        const affectedItemIds = [];

        itemSnaps.forEach((snap, idx) => {
          const id = itemIds[idx];
          if (!snap.exists()) {
            console.warn('Skipping stock restore; menu item not found:', id);
            return;
          }
          const inc = Number(qtyByItem[id] || 0);
          if (inc <= 0) return;
          const itemRef = doc(MenuService.itemsRef, id);
          batch.update(itemRef, {
            stockLevel: increment(inc),
            updatedAt: serverTimestamp()
          });
          affectedItemIds.push(id);
        });

        // Commit order status + stock restores together
        await batch.commit();

        // After commit, resolve any low-stock alerts (item was restocked) and
        // ensure isAvailable is true for items with positive stock
        try {
          if (affectedItemIds.length > 0) {
            await InventoryService.checkAndCreateLowStockAlerts(affectedItemIds);

            const postChecks = await Promise.all(affectedItemIds.map(id => getDoc(doc(MenuService.itemsRef, id))));
            const availBatch = writeBatch(db);
            let hasAvailUpdate = false;
            postChecks.forEach(snap => {
              if (!snap.exists()) return;
              const data = snap.data();
              const stock = Number(data.stockLevel || 0);
              if (stock > 0 && data.isAvailable !== true) {
                availBatch.update(doc(MenuService.itemsRef, snap.id), { isAvailable: true, updatedAt: serverTimestamp() });
                hasAvailUpdate = true;
              }
            });
            if (hasAvailUpdate) await availBatch.commit();
          }
        } catch (postErr) {
          console.error('Error after restoring stock on cancellation:', postErr);
        }
      } else {
        // Normal status update (no stock restore)
        await updateDoc(orderRef, updateData);
      }
    } catch (error) {
      console.error('Error updating order status:', error);
      throw error;
    }
  }

  // Update order (for editing orders)
  static async updateOrder(orderId, updateData) {
    try {
      const orderRef = doc(this.ordersRef, orderId);

      // Support optimistic concurrency by allowing callers to pass a baseVersion
      // If baseVersion is provided, we attempt a transactionally-safe update that
      // checks the current version before committing. If versions mismatch, throw
      // a specific ConflictError so UI can notify the user.
      const baseVersion = updateData?.baseVersion;

      // Build payload without baseVersion
      const { baseVersion: _bv, ...rest } = updateData || {};
      const updatePayload = {
        ...rest,
        updatedAt: serverTimestamp()
      };

      const forceUpdate = updateData?.force === true;

      if (forceUpdate) {
        // Forced update: admins can override version checks and apply changes.
        try {
          await updateDoc(orderRef, {
            ...updatePayload,
            // Ensure version increments so future optimistic checks see a new value
            version: increment(1)
          });
          console.log('Order force-updated successfully:', orderId);
        } catch (e) {
          // Fallback to non-incremental update
          await updateDoc(orderRef, updatePayload);
          console.log('Order force-updated (fallback) successfully:', orderId);
        }
      } else if (typeof baseVersion !== 'undefined') {
        // Use transaction to ensure version hasn't changed
        await runTransaction(db, async (transaction) => {
          const snap = await transaction.get(orderRef);
          if (!snap.exists()) throw new Error('Order not found');

          const current = snap.data();
          const currentVersion = Number(current.version || 0);

          if (currentVersion !== Number(baseVersion)) {
            const err = new Error('Version conflict');
            err.code = 'VERSION_CONFLICT';
            throw err;
          }

          // Increment version on successful update
          updatePayload.version = currentVersion + 1;
          transaction.update(orderRef, updatePayload);
        });
        console.log('Order updated (transactional) successfully:', orderId);
      } else {
        // No version provided - fire-and-forget update and increment version if exists
        try {
          // Try to increment version atomically if document has version
          await updateDoc(orderRef, {
            ...updatePayload,
            version: increment(1)
          });
        } catch (e) {
          // Fallback to simple update if increment fails
          await updateDoc(orderRef, updatePayload);
        }
        console.log('Order updated successfully (non-transactional):', orderId);
      }
    } catch (error) {
      console.error('Error updating order:', error);
      throw error;
    }
  }

  // Update payment status
  static async updatePaymentStatus(orderId, paymentStatus) {
    try {
      const orderRef = doc(this.ordersRef, orderId);
      await updateDoc(orderRef, {
        paymentStatus,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error updating payment status:', error);
      throw error;
    }
  }

  // Real-time order listener
  static subscribeToOrders(callback) {
    return onSnapshot(this.ordersRef, (snapshot) => {
      const orders = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      // Sort by createdAt in JavaScript
      const sortedOrders = orders.sort((a, b) => {
        const aTime = a.createdAt?.toDate?.() || new Date(0);
        const bTime = b.createdAt?.toDate?.() || new Date(0);
        return bTime - aTime; // Newest first
      });
      callback(sortedOrders);
    });
  }

  // Get order by id
  static async getOrderById(orderId) {
    try {
      const orderRef = doc(this.ordersRef, orderId);
      const snap = await getDoc(orderRef);
      if (!snap.exists()) return null;
      return { id: snap.id, ...snap.data() };
    } catch (error) {
      console.error('Error fetching order by id:', error);
      throw error;
    }
  }

  // Debug method to check orders data
  static async debugOrders() {
    try {
      const snapshot = await getDocs(this.ordersRef);
      const orders = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      logger.log('=== ORDERS DEBUG INFO ===');
      logger.log('Total orders:', orders.length);
      
      orders.forEach(order => {
        logger.log(`Order ${order.id}:`, {
          orderNumber: order.orderNumber,
          status: order.status,
          total: order.total,
          items: order.items?.length || 0,
          createdAt: order.createdAt?.toDate?.()
        });
      });
      
      return orders;
    } catch (error) {
      console.error('Error debugging orders:', error);
      return [];
    }
  }
}

// ============= MENU MANAGEMENT =============
export class MenuService {
  static get categoriesRef() {
    return collection(db, 'menu_categories');
  }
  
  static get itemsRef() {
    return collection(db, 'menu_items');
  }

  // Category operations
  static async createCategory(categoryData) {
    try {
      const docRef = await addDoc(this.categoriesRef, {
        ...categoryData,
        isActive: true,
        sortOrder: categoryData.sortOrder || 0,
        createdAt: serverTimestamp()
      });
  // Invalidate menu cache
  menuCache = null;
  menuCacheTimestamp = 0;
      return docRef.id;
    } catch (error) {
      console.error('Error creating category:', error);
      throw error;
    }
  }

  static async getCategories() {
    try {
      const snapshot = await getDocs(this.categoriesRef);
      const categories = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      // Sort by sortOrder in JavaScript instead of Firestore
      return categories.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    } catch (error) {
      console.error('Error getting categories:', error);
      throw error;
    }
  }

  static async updateCategory(categoryId, categoryData) {
    try {
      const categoryRef = doc(this.categoriesRef, categoryId);
      await updateDoc(categoryRef, {
        ...categoryData,
        updatedAt: serverTimestamp()
      });
  // Invalidate menu cache
  menuCache = null;
  menuCacheTimestamp = 0;
    } catch (error) {
      console.error('Error updating category:', error);
      throw error;
    }
  }

  static async deleteCategory(categoryId) {
    try {
      // Check if category has items by getting all items and filtering
      const itemsSnapshot = await getDocs(this.itemsRef);
      const items = itemsSnapshot.docs.map(doc => doc.data());
      const categoryItems = items.filter(item => item.categoryId === categoryId);
      
      if (categoryItems.length > 0) {
        throw new Error('Cannot delete category with existing menu items');
      }
      
      const categoryRef = doc(this.categoriesRef, categoryId);
      await deleteDoc(categoryRef);
  // Invalidate menu cache
  menuCache = null;
  menuCacheTimestamp = 0;
    } catch (error) {
      console.error('Error deleting category:', error);
      throw error;
    }
  }

  // Menu item operations
  static async createItem(itemData) {
    try {
      const docRef = await addDoc(this.itemsRef, {
  ...itemData,
  isAvailable: itemData.isAvailable !== undefined ? itemData.isAvailable : true,
  isActive: true,
  preparationTime: itemData.preparationTime || 15,
  sortOrder: itemData.sortOrder || 0,
  // Inventory and cost fields: safe defaults
  stockLevel: Number(itemData.stockLevel || 0),
  lowStockThreshold: Number(itemData.lowStockThreshold || 5),
  costOfGoods: Number(itemData.costOfGoods || 0),
  createdAt: serverTimestamp()
      });
  // Invalidate menu cache
  menuCache = null;
  menuCacheTimestamp = 0;
      return docRef.id;
    } catch (error) {
      console.error('Error creating item:', error);
      throw error;
    }
  }

  static async getAllItems() {
    try {
      const snapshot = await getDocs(this.itemsRef);
      const items = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      // Sort by name in JavaScript instead of Firestore
      return items.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    } catch (error) {
      console.error('Error getting all items:', error);
      throw error;
    }
  }

  static async updateItem(itemId, itemData) {
    try {
      const itemRef = doc(this.itemsRef, itemId);

      // Build a safe update payload
      const safe = {
        ...itemData,
        updatedAt: serverTimestamp()
      };

      // If isAvailable not explicitly provided but stockLevel is, derive availability from stock
      if (typeof itemData.isAvailable !== 'boolean' && typeof itemData.stockLevel === 'number') {
        safe.isAvailable = itemData.stockLevel > 0;
      }

      await updateDoc(itemRef, safe);
  // Invalidate menu cache
  menuCache = null;
  menuCacheTimestamp = 0;
    } catch (error) {
      console.error('Error updating item:', error);
      throw error;
    }
  }

  static async deleteItem(itemId) {
    try {
      const itemRef = doc(this.itemsRef, itemId);
      await deleteDoc(itemRef);
  // Invalidate menu cache
  menuCache = null;
  menuCacheTimestamp = 0;
    } catch (error) {
      console.error('Error deleting item:', error);
      throw error;
    }
  }

  // Get full menu with categories and their items
  static async getFullMenu() {
    try {
      const now = Date.now();
      if (menuCache && (now - menuCacheTimestamp) < CACHE_TTL) {
        return menuCache;
      }

      // Get categories first
      const categoriesSnapshot = await getDocs(query(this.categoriesRef, orderBy('sortOrder', 'asc')));
      const categories = categoriesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Get all items (without complex composite query)
      const itemsSnapshot = await getDocs(this.itemsRef);
      const items = itemsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        // normalize categoryId to string for consistent comparisons
        categoryId: String(doc.data().categoryId ?? '')
      }));

      // Group items by category and sort them
      const categoriesWithItems = categories.map(category => ({
        ...category,
        items: items
          .filter(item => String(item.categoryId) === String(category.id))
          .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
      }));

      menuCache = categoriesWithItems;
      menuCacheTimestamp = Date.now();
      return categoriesWithItems;
    } catch (error) {
      console.error('Error getting full menu:', error);
      throw error;
    }
  }

  // Real-time listeners
  static subscribeToCategoriesChanges(callback) {
    return onSnapshot(this.categoriesRef, (snapshot) => {
      const categories = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      // Sort by sortOrder in JavaScript
      const sortedCategories = categories.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
      callback(sortedCategories);
    });
  }

  static subscribeToItemsChanges(callback) {
    return onSnapshot(this.itemsRef, (snapshot) => {
      const items = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      // Sort by name in JavaScript
      const sortedItems = items.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      callback(sortedItems);
    });
  }
}

// ============= REPORTS & ANALYTICS =============
export class ReportsService {
  static async getDashboardData() {
    try {
      const today = new Date();
      const startOfToday = new Date(today);
      startOfToday.setHours(0, 0, 0, 0);
      
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - 7);
      
      const startOfMonth = new Date(today);
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      // Get all orders
      const ordersSnapshot = await getDocs(OrderService.ordersRef);
      const allOrders = ordersSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate()
      }));

      console.log('Dashboard: Total orders found:', allOrders.length);
      
      // Debug: log some order details
      if (allOrders.length > 0) {
        console.log('First order details:', {
          id: allOrders[0].id,
          status: allOrders[0].status,
          total: allOrders[0].total,
          createdAt: allOrders[0].createdAt,
          items: allOrders[0].items
        });
        allOrders.forEach((order, index) => {
          console.log(`Order ${index + 1}:`, {
            id: order.id,
            status: order.status,
            total: order.total,
            createdAt: order.createdAt,
            itemsCount: order.items?.length || 0
          });
        });
      }

  // Invalidate orders cache after creating
  ordersCache = null;
  ordersCacheTimestamp = 0;
      // Get all users
      const usersSnapshot = await getDocs(UserService.usersRef);
      const allUsers = usersSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Get all menu items
      const menuData = await MenuService.getFullMenu();
      const totalMenuItems = menuData.reduce((total, category) => total + category.items.length, 0);

      // Build a quick lookup for menu item costOfGoods
      const flatMenuItems = menuData.flatMap(cat => cat.items || []);
      const menuItemCostMap = flatMenuItems.reduce((m, it) => {
        m[it.id] = Number(it.costOfGoods || 0);
        return m;
      }, {});

      // Helper to compute COGS for an order
      const computeOrderCOGS = (order) => {
        if (!order || !Array.isArray(order.items)) return 0;
        return order.items.reduce((s, it) => {
          const qty = Number(it.quantity || 0);
          const itemCost = Number(it.costOfGoods ?? menuItemCostMap[it.menuItemId] ?? 0);
          return s + (qty * itemCost);
        }, 0);
      };

      // Calculate today's data
      const todaysOrders = allOrders.filter(order => 
        order.createdAt && order.createdAt >= startOfToday
      );
      const completedTodaysOrders = todaysOrders.filter(order => 
        order.status === 'served' || order.status === 'completed' || order.status === 'delivered'
      );
      const todaysRevenue = completedTodaysOrders.reduce((sum, order) => sum + (Number(order.total) || 0), 0);
      const todaysCOGS = completedTodaysOrders.reduce((sum, order) => sum + computeOrderCOGS(order), 0);
      const todaysProfit = todaysRevenue - todaysCOGS; // expenses not tracked here

      console.log('Dashboard: Today orders:', todaysOrders.length, 'Completed:', completedTodaysOrders.length, 'Revenue:', todaysRevenue);
      console.log('Start of today:', startOfToday);
      console.log('Current time:', new Date());
      
      // Debug today's orders
      todaysOrders.forEach((order, index) => {
        console.log(`Today's order ${index + 1}:`, {
          id: order.id,
          status: order.status,
          total: order.total,
          createdAt: order.createdAt,
          isCompleted: order.status === 'served' || order.status === 'completed'
        });
      });

  // Calculate weekly data
      const weeklyOrders = allOrders.filter(order => 
        order.createdAt && order.createdAt >= startOfWeek
      );
      const completedWeeklyOrders = weeklyOrders.filter(order => {
        const s = (order.status || '').toString().toLowerCase();
        return s === 'served' || s === 'completed' || s === 'delivered' || s === 'paid';
      });
  const weeklyRevenue = completedWeeklyOrders.reduce((sum, order) => sum + (Number(order.total) || 0), 0);
  const weeklyCOGS = completedWeeklyOrders.reduce((sum, order) => sum + computeOrderCOGS(order), 0);
  const weeklyProfit = weeklyRevenue - weeklyCOGS;

  // Calculate monthly data
      const monthlyOrders = allOrders.filter(order => 
        order.createdAt && order.createdAt >= startOfMonth
      );
      const completedMonthlyOrders = monthlyOrders.filter(order => {
        const s = (order.status || '').toString().toLowerCase();
        return s === 'served' || s === 'completed' || s === 'delivered' || s === 'paid';
      });
  const monthlyRevenue = completedMonthlyOrders.reduce((sum, order) => sum + (Number(order.total) || 0), 0);
  const monthlyCOGS = completedMonthlyOrders.reduce((sum, order) => sum + computeOrderCOGS(order), 0);
  const monthlyProfit = monthlyRevenue - monthlyCOGS;

      // Order status distribution
      const ordersByStatus = allOrders.reduce((acc, order) => {
        const status = (order.status || 'pending').toString().toLowerCase();
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      }, {});

      // Generate daily sales chart data for the last 7 days
      const salesChartData = [];
      for (let i = 6; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(today.getDate() - i);
        date.setHours(0, 0, 0, 0);
        
        const endDate = new Date(date);
        endDate.setHours(23, 59, 59, 999);
        
        const dayOrders = allOrders.filter(order => 
          order.createdAt && 
          order.createdAt >= date && 
          order.createdAt <= endDate &&
          (() => {
            const s = (order.status || '').toString().toLowerCase();
            return s === 'served' || s === 'completed' || s === 'delivered' || s === 'paid';
          })()
        );
        
        const dayRevenue = dayOrders.reduce((sum, order) => sum + (Number(order.total) || 0), 0);
        const dayCOGS = dayOrders.reduce((s, order) => s + computeOrderCOGS(order), 0);
        
        salesChartData.push({
          date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          sales: dayRevenue,
          cogs: dayCOGS,
          orders: dayOrders.length
        });
      }

      const totalCompletedOrders = allOrders.filter(order => {
        const s = (order.status || '').toString().toLowerCase();
        return s === 'served' || s === 'completed' || s === 'delivered' || s === 'paid';
      });
      const totalRevenue = totalCompletedOrders.reduce((sum, order) => sum + (Number(order.total) || 0), 0);
      const totalCOGS = totalCompletedOrders.reduce((sum, order) => sum + computeOrderCOGS(order), 0);
      const totalProfit = totalRevenue - totalCOGS;

      // Get today's top items
      const topItems = await this.getTopItems(today, today);

      // Simple prediction: next day = 7-day average; next month = 7-day average * 30
      const sevenDayAvg = salesChartData.length > 0 ? (salesChartData.reduce((s, d) => s + (Number(d.sales) || 0), 0) / salesChartData.length) : 0;
      const predictedNextDay = sevenDayAvg;
      const predictedNextMonth = sevenDayAvg * 30;

      const dashboardData = {
        overview: {
          totalRevenue,
          totalOrders: allOrders.length,
          pendingRevenue: allOrders.reduce((sum, order) => sum + (order.total || 0), 0), // All orders including pending
          totalCustomers: new Set(allOrders.map(order => order.customerName || order.customerPhone).filter(Boolean)).size,
          totalMenuItems,
          activeEmployees: allUsers.filter(user => user.role !== 'admin' && user.status === 'active').length
        },
        today: {
          revenue: todaysRevenue,
          orders: todaysOrders.length,
          cogs: todaysCOGS,
          profit: todaysProfit,
          averageOrderValue: completedTodaysOrders.length > 0 ? todaysRevenue / completedTodaysOrders.length : 0
        },
        weekly: {
          revenue: weeklyRevenue,
          orders: weeklyOrders.length,
          cogs: weeklyCOGS,
          profit: weeklyProfit,
          averageOrderValue: completedWeeklyOrders.length > 0 ? weeklyRevenue / completedWeeklyOrders.length : 0
        },
        monthly: {
          revenue: monthlyRevenue,
          orders: monthlyOrders.length,
          cogs: monthlyCOGS,
          profit: monthlyProfit,
          averageOrderValue: completedMonthlyOrders.length > 0 ? monthlyRevenue / completedMonthlyOrders.length : 0
        },
        ordersByStatus,
        salesChartData,
        topItems,
        predictions: {
          nextDayRevenue: predictedNextDay,
          nextMonthRevenue: predictedNextMonth
        },
        totals: {
          totalCOGS,
          totalProfit
        },
        recentOrders: allOrders
          .sort((a, b) => (b.createdAt || new Date(0)) - (a.createdAt || new Date(0)))
          .slice(0, 10)
      };

      console.log('Dashboard data:', dashboardData);
      return dashboardData;
    } catch (error) {
      console.error('Error getting dashboard data:', error);
      throw error;
    }
  }

  static async getDailySales(date) {
    try {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      const ordersSnapshot = await getDocs(OrderService.ordersRef);
      const allOrders = ordersSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate()
      }));

      const dayOrders = allOrders.filter(order => {
        if (!order.createdAt) return false;
        if (order.createdAt < startOfDay || order.createdAt > endOfDay) return false;
        const s = (order.status || '').toString().toLowerCase();
        // include completed/paid/delivered statuses, exclude cancelled
        return (s === 'served' || s === 'completed' || s === 'delivered' || s === 'paid');
      });
      
      return {
        totalSales: dayOrders.reduce((sum, order) => sum + (order.total || 0), 0),
        totalOrders: dayOrders.length,
        orders: dayOrders
      };
    } catch (error) {
      console.error('Error getting daily sales:', error);
      throw error;
    }
  }

  static async getSalesReport(startDate, endDate) {
    try {
      console.log('=== SALES REPORT DEBUG ===');
      console.log('Date range:', { startDate, endDate });
      
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);

      console.log('Processed date range:', { start, end });

      const ordersSnapshot = await getDocs(OrderService.ordersRef);
      const allOrders = ordersSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate()
      }));

      console.log('All orders found:', allOrders.length);
      if (allOrders.length > 0) {
        console.log('Sample order:', {
          id: allOrders[0].id,
          createdAt: allOrders[0].createdAt,
          status: allOrders[0].status,
          total: allOrders[0].total
        });
      }

      // Use deliveredAt or completedAt when available to determine the actual completed date
      const filteredOrders = allOrders.filter(order => {
        const completedAt = (order.deliveredAt && new Date(order.deliveredAt)) || (order.completedAt && new Date(order.completedAt)) || (order.createdAt && new Date(order.createdAt));
        if (!completedAt) return false;
        return completedAt >= start && completedAt <= end;
      });

      console.log('Orders in date range:', filteredOrders.length);

      const completedOrders = filteredOrders.filter(order => 
        order.status === 'served' || order.status === 'completed' || order.status === 'delivered'
      );

      console.log('Completed orders in range:', completedOrders.length);

      console.log('Sales Report - Total orders in range:', filteredOrders.length, 'Completed:', completedOrders.length);

      // Generate daily breakdown
      const dailySales = [];
      const currentDate = new Date(start);
      
      while (currentDate <= end) {
        const dayStart = new Date(currentDate);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(currentDate);
        dayEnd.setHours(23, 59, 59, 999);

        const dayOrders = completedOrders.filter(order => {
          const completedAt = (order.deliveredAt && new Date(order.deliveredAt)) || (order.completedAt && new Date(order.completedAt)) || (order.createdAt && new Date(order.createdAt));
          return completedAt >= dayStart && completedAt <= dayEnd;
        });

        const dayRevenue = dayOrders.reduce((sum, order) => sum + (order.total || 0), 0);

        // Use ISO date strings for stable parsing on the client
        dailySales.push({
          date: currentDate.toISOString(),
          revenue: dayRevenue,
          orders: dayOrders.length,
          averageOrderValue: dayOrders.length > 0 ? dayRevenue / dayOrders.length : 0
        });

        currentDate.setDate(currentDate.getDate() + 1);
      }

      const totalRevenue = completedOrders.reduce((sum, order) => sum + (order.total || 0), 0);

      console.log('Sales Report Results:', {
        totalRevenue,
        filteredOrdersCount: filteredOrders.length,
        completedOrdersCount: completedOrders.length
      });

      // Return totals based on COMPLETED orders so totals, averages and daily rows align
      return {
        totalRevenue,
        totalOrders: completedOrders.length, // only completed orders count towards totals
        completedOrders: completedOrders.length, // Completed orders count
        averageOrderValue: completedOrders.length > 0 ? totalRevenue / completedOrders.length : 0,
        dailySales
      };
    } catch (error) {
      console.error('Error getting sales report:', error);
      throw error;
    }
  }

  static async getTopItems(startDate, endDate) {
    try {
      console.log('=== TOP ITEMS DEBUG ===');
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);

      console.log('Top Items date range:', { start, end });

      const ordersSnapshot = await getDocs(OrderService.ordersRef);
      
      const orders = ordersSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate()
      }));

      console.log('Total orders for top items:', orders.length);

      // Filter orders by date range and completed status
      const filteredOrders = orders.filter(order => 
        order.createdAt &&
        order.createdAt >= start &&
        order.createdAt <= end &&
        (order.status === 'served' || order.status === 'completed' || order.status === 'delivered') &&
        order.items && Array.isArray(order.items)
      );

      console.log('Filtered orders for top items:', filteredOrders.length);
      if (filteredOrders.length > 0) {
        console.log('Sample filtered order items:', filteredOrders[0].items);
      }

      // Calculate item statistics from items stored directly in orders
      const itemStats = {};

      // Load menu items and categories once and build lookups so we can get category information
      let menuItemsLookup = {};
      let categoriesLookup = {};
      try {
        const [menuItems, categories] = await Promise.all([
          MenuService.getAllItems(),
          MenuService.getCategories()
        ]);
        menuItemsLookup = menuItems.reduce((acc, it) => {
          acc[it.id] = it;
          return acc;
        }, {});
        categoriesLookup = categories.reduce((acc, c) => {
          acc[c.id] = c;
          return acc;
        }, {});
      } catch (err) {
        console.debug('Failed to load menu items/categories for top items lookup', err);
      }

      filteredOrders.forEach(order => {
        (order.items || []).forEach(item => {
          const itemKey = item.menuItemId || item.name || 'Unknown';

          // Determine category info from order item, from menu item meta, or from categories collection
          const menuMeta = item.menuItemId ? menuItemsLookup[item.menuItemId] : null;
          const inferredCategoryId = menuMeta?.categoryId || item.categoryId || item.category || null;
          const categoryName = item.categoryName
            || item.category
            || (inferredCategoryId && categoriesLookup[inferredCategoryId]?.name)
            || (menuMeta && (menuMeta.categoryName || menuMeta.category))
            || 'Uncategorized';

          if (!itemStats[itemKey]) {
            const categoryIdToUse = inferredCategoryId || (menuMeta && (menuMeta.categoryId || menuMeta.category)) || null;

            itemStats[itemKey] = {
              id: item.menuItemId || itemKey,
              name: item.name || (menuMeta && menuMeta.name) || 'Unknown Item',
              quantity: 0,
              revenue: 0,
              price: item.unitPrice || item.price || (menuMeta && menuMeta.price) || 0,
              category: categoryIdToUse,
              categoryName
            };
          }

          itemStats[itemKey].quantity += Number(item.quantity || 0);
          itemStats[itemKey].revenue += Number(item.totalPrice || (item.unitPrice * (item.quantity || 0)) || 0);
        });
      });

      // Convert to array and sort by quantity
      const topItems = Object.values(itemStats)
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 10);

      console.log('Top items result:', topItems);
      return topItems;
    } catch (error) {
      console.error('Error getting top items:', error);
      return [];
    }
  }

  static async getEmployeePerformance(startDate, endDate) {
    try {
      console.log('=== EMPLOYEE PERFORMANCE DEBUG ===');
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);

      const ordersSnapshot = await getDocs(OrderService.ordersRef);
      const usersSnapshot = await getDocs(UserService.usersRef);
      
      const orders = ordersSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate()
      }));

      const users = usersSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      console.log('Employee Performance - Orders:', orders.length, 'Users:', users.length);
      
      // Debug: Check if users have the expected structure
      if (users.length > 0) {
        console.log('Sample user:', users[0]);
      }

      // Filter orders by date range
      const filteredOrders = orders.filter(order => 
        order.createdAt &&
        order.createdAt >= start &&
        order.createdAt <= end
      );

      console.log('Filtered orders for employee performance:', filteredOrders.length);
      
      // Debug: Check what employeeIds we have in orders
      const employeeIds = [...new Set(filteredOrders.map(order => order.employeeId).filter(Boolean))];
      console.log('Unique employee IDs in orders:', employeeIds);

      // Calculate performance by employee
      const employeeStats = {};
      
      filteredOrders.forEach(order => {
        const employeeId = order.employeeId || 'unknown';
        const employee = users.find(u => u.id === employeeId);
        const firstName = employee?.firstName || 'Unknown';
        const lastName = employee?.lastName || 'Employee';
        const employeeName = `${firstName} ${lastName}`.trim();
        
        if (!employeeStats[employeeId]) {
          employeeStats[employeeId] = {
            id: employeeId,
            name: employeeName,
            firstName: firstName,
            lastName: lastName,
            role: employee?.role || 'employee',
            ordersProcessed: 0,
            totalRevenue: 0,
            totalSales: 0, // Add this for Reports page compatibility
            averageOrderValue: 0,
            performanceScore: 0 // Add this for Reports page compatibility
          };
        }
        
        employeeStats[employeeId].ordersProcessed += 1;
        if (order.status === 'served' || order.status === 'completed' || order.status === 'delivered') {
          const orderTotal = order.total || 0;
          employeeStats[employeeId].totalRevenue += orderTotal;
          employeeStats[employeeId].totalSales += orderTotal; // Sync with totalRevenue
        }
      });

      // Calculate averages and performance scores
      Object.values(employeeStats).forEach(emp => {
        if (emp.ordersProcessed > 0) {
          emp.averageOrderValue = emp.totalRevenue / emp.ordersProcessed;
          // Calculate performance score based on orders processed and revenue
          // This is a simple formula - you can adjust it based on your business needs
          emp.performanceScore = Math.min(100, Math.round((emp.ordersProcessed * 10) + (emp.totalRevenue / 100)));
        } else {
          emp.averageOrderValue = 0;
          emp.performanceScore = 0;
        }
      });

      const result = Object.values(employeeStats)
        .filter(emp => emp.ordersProcessed > 0) // Only include employees who processed orders
        .sort((a, b) => b.totalRevenue - a.totalRevenue);
      
      console.log('Employee performance result:', result);
      return result;
    } catch (error) {
      console.error('Error getting employee performance:', error);
      return [];
    }
  }

  static async getOrderAnalytics(startDate, endDate) {
    try {
      console.log('=== ORDER ANALYTICS DEBUG ===');
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);

      const ordersSnapshot = await getDocs(OrderService.ordersRef);
      const orders = ordersSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate()
      }));

      console.log('Order Analytics - Total orders:', orders.length);

      // Filter orders by date range
      const filteredOrders = orders.filter(order => 
        order.createdAt &&
        order.createdAt >= start &&
        order.createdAt <= end
      );

      console.log('Filtered orders for analytics:', filteredOrders.length);

      // Status distribution
      const statusDistribution = filteredOrders.reduce((acc, order) => {
        const status = order.status || 'pending';
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      }, {});

      // Calculate completion rate
      const completedOrders = filteredOrders.filter(order => 
  order.status === 'served' || order.status === 'completed' || order.status === 'delivered'
      ).length;
      const completionRate = filteredOrders.length > 0 ? 
        (completedOrders / filteredOrders.length) * 100 : 0;

      // Calculate refund/cancellation rate
      const cancelledOrders = filteredOrders.filter(order => 
        order.status === 'cancelled' || order.status === 'refunded'
      ).length;
      const refundRate = filteredOrders.length > 0 ? 
        (cancelledOrders / filteredOrders.length) * 100 : 0;

      // Find peak hours
      const hourlyDistribution = {};
      filteredOrders.forEach(order => {
        if (order.createdAt) {
          const hour = order.createdAt.getHours();
          hourlyDistribution[hour] = (hourlyDistribution[hour] || 0) + 1;
        }
      });

      const peakHour = Object.entries(hourlyDistribution)
        .sort(([,a], [,b]) => b - a)[0];
      const peakHours = peakHour ? `${peakHour[0]}:00` : 'N/A';

      const result = {
        averageOrderTime: 15, // Placeholder - would need timestamps to calculate
        peakHours,
        completionRate,
        refundRate,
        statusDistribution: Object.entries(statusDistribution).map(([status, count]) => ({
          status,
          count,
          percentage: (count / filteredOrders.length) * 100
        }))
      };

      console.log('Order analytics result:', result);
      return result;
    } catch (error) {
      console.error('Error getting order analytics:', error);
      return {
        averageOrderTime: 0,
        peakHours: 'N/A',
        completionRate: 0,
        refundRate: 0,
        statusDistribution: []
      };
    }
  }
}

// ============= ACTIVITY LOGGING =============
export class ActivityService {
  static get activitiesRef() {
    return collection(db, 'activity_logs');
  }

  static async logActivity(activityData) {
    try {
      await addDoc(this.activitiesRef, {
        ...activityData,
        timestamp: serverTimestamp()
      });
    } catch (error) {
      console.error('Error logging activity:', error);
      throw error;
    }
  }

  static async getRecentActivities(limitCount = 50) {
    try {
      const q = query(
        this.activitiesRef,
        orderBy('timestamp', 'desc'),
        limit(limitCount)
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error('Error getting activities:', error);
      throw error;
    }
  }

  static async getUserActivities(userId, limitCount = 20) {
    try {
      const q = query(
        this.activitiesRef,
        where('userId', '==', userId),
        orderBy('timestamp', 'desc'),
        limit(limitCount)
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error('Error getting user activities:', error);
      throw error;
    }
  }

  static subscribeToActivities(callback, limitCount = 50) {
    const q = query(
      this.activitiesRef,
      orderBy('timestamp', 'desc'),
      limit(limitCount)
    );
    return onSnapshot(q, (snapshot) => {
      const activities = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      callback(activities);
    });
  }
}

// ============= ANNOUNCEMENTS =============
export class AnnouncementService {
  static get announcementsRef() {
    return collection(db, 'announcements');
  }

  static async createAnnouncement({ title, message, createdBy, audience = 'all' }) {
    try {
      const docRef = await addDoc(this.announcementsRef, {
        title: title || '',
        message: message || '',
        audience: audience, // 'all' | 'employees' | 'managers' etc.
        createdBy: createdBy || null,
        createdAt: serverTimestamp(),
      });
      return { id: docRef.id };
    } catch (error) {
      console.error('Error creating announcement:', error);
      throw error;
    }
  }

  static async getAllAnnouncements(limitCount = 50) {
    try {
      const q = query(this.announcementsRef, orderBy('createdAt', 'desc'), limit(limitCount));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      console.error('Error getting announcements:', error);
      throw error;
    }
  }

  static subscribeToAnnouncements(callback, limitCount = 10) {
    const q = query(this.announcementsRef, orderBy('createdAt', 'desc'), limit(limitCount));
    return onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      callback(items);
    });
  }
}
