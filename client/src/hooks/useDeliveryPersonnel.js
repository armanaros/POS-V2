import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, doc } from 'firebase/firestore';

export const useDeliveryPersonnel = () => {
  const [deliveryPersons, setDeliveryPersons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let unsubscribeUsers = null;
    let locationUnsubscribes = [];

    const fetchDeliveryPersonnel = async () => {
      try {
        // Query for users with delivery role only
        const usersQuery = query(
          collection(db, 'users'),
          where('role', '==', 'delivery')
        );

        unsubscribeUsers = onSnapshot(usersQuery, async (snapshot) => {
          const users = [];
          snapshot.forEach((doc) => {
            const userData = { id: doc.id, ...doc.data() };
            
            // Include all employees for now - in production you might want to filter
            // by specific delivery permissions or roles
            users.push(userData);
          });

          // Clear previous location subscriptions
          locationUnsubscribes.forEach(unsub => unsub && unsub());
          locationUnsubscribes = [];

          // Get location data for each user and subscribe to updates
          const usersWithLocations = await Promise.all(
            users.map(async (user) => {
              return new Promise((resolve) => {
                try {
                  // The app stores the latest location on the user document
                  // (users/{userId}.location). Subscribe to the user doc and
                  // extract the `location` field so we get updates when the
                  // delivery person updates their location.
                  const userRef = doc(db, 'users', user.id);
                  const unsubUser = onSnapshot(
                    userRef,
                    (userDoc) => {
                      if (!userDoc.exists()) {
                        resolve({ ...user, location: null });
                        return;
                      }
                      const data = userDoc.data() || {};
                      const location = data.location || null;
                      resolve({ ...user, location });
                    },
                    (error) => {
                      console.warn('Error fetching user doc for location', user.id, error);
                      resolve({ ...user, location: null });
                    }
                  );

                  locationUnsubscribes.push(unsubUser);
                } catch (error) {
                  console.warn('Error setting up location subscription for user', user.id, error);
                  resolve({
                    ...user,
                    location: null,
                  });
                }
              });
            })
          );

          setDeliveryPersons(usersWithLocations);
          setLoading(false);
        }, (error) => {
          console.error('Error fetching users:', error);
          setError(error.message);
          setLoading(false);
        });

      } catch (error) {
        console.error('Error setting up delivery personnel listener:', error);
        setError(error.message);
        setLoading(false);
      }
    };

    fetchDeliveryPersonnel();

    return () => {
      if (unsubscribeUsers) unsubscribeUsers();
      locationUnsubscribes.forEach(unsub => unsub && unsub());
    };
  }, []);

  // compute status for a person: 'online' | 'idle' | 'away' | 'offline'
  const computePersonStatus = (person) => {
    if (!person || !person.location) return 'offline';
    const loc = person.location;
    const lastSeen = new Date(loc.lastSeen?.toDate?.() || loc.lastSeen || Date.now());
    const now = new Date();
    const diffMinutes = Math.floor((now - lastSeen) / (1000 * 60));

    if (!loc.isOnline) return 'offline';
    if (diffMinutes > 10) return 'away';
    if (diffMinutes > 5) return 'idle';
    return 'online';
  };

  // Get online delivery personnel only (strictly 'online')
  const getOnlineDeliveryPersons = () => {
    return deliveryPersons.filter(person => computePersonStatus(person) === 'online');
  };

  // Get delivery persons by status
  const getDeliveryPersonsByStatus = (status) => {
    return deliveryPersons.filter(person => computePersonStatus(person) === status);
  };

  // Get statistics
  const getStatistics = () => {
    const online = getDeliveryPersonsByStatus('online').length;
    const idle = getDeliveryPersonsByStatus('idle').length;
    const away = getDeliveryPersonsByStatus('away').length;
    const offline = getDeliveryPersonsByStatus('offline').length;
    
    return {
      total: deliveryPersons.length,
      online,
      idle,
      away,
      offline,
      active: online + idle // Consider both online and idle as active
    };
  };

  return {
    deliveryPersons,
    loading,
    error,
    getOnlineDeliveryPersons,
    getDeliveryPersonsByStatus,
    getStatistics,
    refresh: () => {
      setLoading(true);
      // The useEffect will re-run and refresh the data
    }
  };
};