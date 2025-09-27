import { doc, updateDoc, onSnapshot, serverTimestamp, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import toast from 'react-hot-toast';

class LocationService {
  constructor() {
    this.watchId = null;
    this.isTracking = false;
    this.lastUpdateTime = 0;
    this.updateInterval = 15000; // Update every 15 seconds for better accuracy
    this.minUpdateDistance = 25; // Minimum 25 meters before update (more sensitive)
    this.accuracyThreshold = 20; // Only accept readings better than 20m when possible
  }

  // Start location tracking for delivery personnel
  async startTracking(userId) {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by this browser');
      return false;
    }

    if (this.isTracking) {
      this.stopTracking();
    }

    try {
      // Request permission and get initial position
      const position = await this.getCurrentPosition();
      
      // Update initial location
      await this.updateLocationInFirestore(userId, {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        heading: position.coords.heading,
        speed: position.coords.speed,
        timestamp: serverTimestamp(),
        isOnline: true,
        lastSeen: serverTimestamp()
      });

      // Start watching position
      this.watchId = navigator.geolocation.watchPosition(
        (position) => this.handleLocationUpdate(userId, position),
        (error) => this.handleLocationError(error),
        {
          enableHighAccuracy: true,
          timeout: 15000, // Increased timeout for better accuracy
          maximumAge: 10000, // Reduced max age for fresher readings
          priority: 'high' // Request high priority GPS
        }
      );

      this.isTracking = true;
      this.userId = userId; // Store user ID for cleanup
      // Try to acquire a screen wake lock to keep GPS active on supporting browsers
      this.acquireWakeLock().catch(err => {
        console.warn('Wake Lock not available or failed:', err?.message || err);
      });

      // Start a keep-alive ping to refresh auth/session state while tracking (helps some webviews)
      this.startKeepAlivePing(userId);
      
      // Set up page visibility handling to maintain tracking
      this.setupPageVisibilityHandling(userId);
      
      toast.success('Location tracking started');
      return true;
    } catch (error) {
      console.error('Error starting location tracking:', error);
      toast.error('Failed to start location tracking');
      return false;
    }
  }

  // Stop location tracking
  stopTracking() {
    if (this.watchId) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    this.isTracking = false;
    this.userId = null;
    this.cleanupPageVisibilityHandling();
    this.releaseWakeLock();
    this.stopKeepAlivePing();
  }

  // Mark user as offline when stopping tracking
  async stopTrackingAndMarkOffline(userId) {
    this.stopTracking();
    
    try {
      await this.updateLocationInFirestore(userId, {
        isOnline: false,
        lastSeen: serverTimestamp()
      });
      toast.success('Location tracking stopped');
    } catch (error) {
      console.error('Error marking user offline:', error);
    }
  }

  // Get current position as promise
  getCurrentPosition() {
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 15000, // Increased timeout
        maximumAge: 5000, // Very fresh readings only
        priority: 'high' // Request high priority GPS
      });
    });
  }

  // Handle location updates
  async handleLocationUpdate(userId, position) {
    const now = Date.now();
    
    // For high accuracy readings, update more frequently
    const isHighAccuracy = position.coords.accuracy <= this.accuracyThreshold;
    const shouldUpdate = isHighAccuracy || 
                        (now - this.lastUpdateTime >= this.updateInterval) ||
                        this.shouldUpdateByDistance(position);
    
    if (!shouldUpdate) {
      return;
    }

    try {
      await this.updateLocationInFirestore(userId, {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        heading: position.coords.heading,
        speed: position.coords.speed,
        timestamp: serverTimestamp(),
        isOnline: true,
        lastSeen: serverTimestamp()
      });

      this.lastPosition = position;
      this.lastUpdateTime = now;
      
      // Log accuracy improvements
      if (isHighAccuracy) {
        console.log(`High accuracy location update: ±${Math.round(position.coords.accuracy)}m`);
      }
    } catch (error) {
      console.error('Error updating location:', error);
    }
  }

  // Check if location has changed significantly
  shouldUpdateByDistance(position) {
    if (!this.lastPosition) return true;

    const distance = this.calculateDistance(
      this.lastPosition.coords.latitude,
      this.lastPosition.coords.longitude,
      position.coords.latitude,
      position.coords.longitude
    );

    return distance >= this.minUpdateDistance;
  }

  // Calculate distance between two coordinates (Haversine formula)
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Earth's radius in meters
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  toRadians(degrees) {
    return degrees * (Math.PI/180);
  }

  // Handle location errors
  handleLocationError(error) {
    let message = 'Error getting location';
    
    switch(error.code) {
      case error.PERMISSION_DENIED:
        message = 'Location access denied by user';
        break;
      case error.POSITION_UNAVAILABLE:
        message = 'Location information unavailable';
        break;
      case error.TIMEOUT:
        message = 'Location request timed out';
        break;
    }
    
    console.error('Location error:', message);
    toast.error(message);
  }

  // Update location in Firestore
  async updateLocationInFirestore(userId, locationData) {
    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        location: locationData
      });
    } catch (error) {
      console.error('Error updating location in Firestore:', error);
      throw error;
    }
  }

  // Subscribe to location updates for a specific user
  subscribeToUserLocation(userId, callback) {
    const userRef = doc(db, 'users', userId);
    
    return onSnapshot(userRef, (doc) => {
      if (doc.exists()) {
        const userData = doc.data();
        if (userData.location) {
          callback(userData.location);
        }
      }
    }, (error) => {
      console.error('Error subscribing to location updates:', error);
    });
  }

  // Calculate estimated arrival time based on distance and average speed
  calculateEstimatedArrival(deliveryLocation, currentLocation, averageSpeed = 30) {
    if (!deliveryLocation || !currentLocation) return null;

    const distance = this.calculateDistance(
      currentLocation.latitude,
      currentLocation.longitude,
      deliveryLocation.latitude,
      deliveryLocation.longitude
    );

    // Convert distance to km and calculate time in hours
    const distanceKm = distance / 1000;
    const timeHours = distanceKm / averageSpeed;
    const timeMinutes = Math.round(timeHours * 60);

    return {
      distance: Math.round(distance),
      estimatedMinutes: timeMinutes,
      estimatedArrival: new Date(Date.now() + timeMinutes * 60000)
    };
  }

  // Get directions URL for Google Maps
  getDirectionsUrl(fromLat, fromLon, toLat, toLon) {
    return `https://www.google.com/maps/dir/${fromLat},${fromLon}/${toLat},${toLon}`;
  }

  // Setup page visibility handling to maintain tracking
  setupPageVisibilityHandling(userId) {
    this.handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && this.isTracking && this.userId) {
        // Page became visible, ensure tracking is still active
        this.refreshTrackingStatus(userId);
      }
    };

    this.handleBeforeUnload = () => {
      // Don't mark as offline on page unload for delivery personnel
      // They might be refreshing or navigating
      if (this.isTracking && this.userId) {
        localStorage.setItem(`tracking_${this.userId}`, 'true');
      }
    };

    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    window.addEventListener('beforeunload', this.handleBeforeUnload);
  }

  // Try to acquire the Screen Wake Lock (where supported)
  async acquireWakeLock() {
    if (!('wakeLock' in navigator)) return null;
    try {
      this.wakeLock = await navigator.wakeLock.request('screen');
      this.wakeLock.addEventListener('release', () => {
        console.log('Wake Lock released');
      });
      console.log('Wake Lock acquired');
      return this.wakeLock;
    } catch (err) {
      console.warn('Failed to acquire Wake Lock:', err);
      return null;
    }
  }

  // Release the wake lock if held
  async releaseWakeLock() {
    try {
      if (this.wakeLock) {
        await this.wakeLock.release();
        this.wakeLock = null;
      }
    } catch (err) {
      console.warn('Error releasing wake lock:', err);
    }
  }

  // Periodic keep-alive ping to prevent some webviews/browsers from suspending session
  startKeepAlivePing(userId) {
    // Ping interval: every 50 seconds (less than many idle timeouts)
    this.keepAliveInterval = setInterval(async () => {
      try {
        // Perform a light Firestore read to keep connection alive
        const userRef = doc(db, 'users', userId);
        // Use getDoc (modular SDK) for a lightweight read
        // eslint-disable-next-line no-unused-vars
        const snapshot = await getDoc(userRef);
      } catch (err) {
        // Not critical; just log
        console.warn('Keep-alive ping failed:', err?.message || err);
      }
    }, 50000);
  }

  stopKeepAlivePing() {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
  }

  // Cleanup page visibility event listeners
  cleanupPageVisibilityHandling() {
    if (this.handleVisibilityChange) {
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    }
    if (this.handleBeforeUnload) {
      window.removeEventListener('beforeunload', this.handleBeforeUnload);
    }
  }

  // Refresh tracking status when page becomes visible
  async refreshTrackingStatus(userId) {
    if (!this.isTracking || !navigator.geolocation) return;

    try {
      const position = await this.getCurrentPosition();
      await this.updateLocationInFirestore(userId, {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        heading: position.coords.heading,
        speed: position.coords.speed,
        timestamp: serverTimestamp(),
        isOnline: true,
        lastSeen: serverTimestamp()
      });
    } catch (error) {
      console.error('Error refreshing location:', error);
    }
  }

  // Check if tracking should be restored on app load
  shouldRestoreTracking(userId) {
    const savedState = localStorage.getItem(`tracking_${userId}`);
    return savedState === 'true';
  }

  // Clear tracking state
  clearTrackingState(userId) {
    localStorage.removeItem(`tracking_${userId}`);
  }

  // Geocode address to coordinates (requires Google Maps API)
  async geocodeAddress(address) {
    // This would require Google Maps Geocoding API
    // For now, returning a mock response
    // In production, you would implement actual geocoding
    console.log('Geocoding address:', address);
    return null;
  }
}

export default new LocationService();