// Quick test script to create sample delivery personnel and add location data
// Run this with: node create-sample-delivery-data.js

import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  addDoc, 
  query, 
  where, 
  getDocs,
  updateDoc,
  doc,
  serverTimestamp 
} from 'firebase/firestore';

// Firebase config (replace with your actual config)
const firebaseConfig = {
  // Add your Firebase config here
  apiKey: "your-api-key",
  authDomain: "your-auth-domain",
  projectId: "your-project-id",
  storageBucket: "your-storage-bucket",
  messagingSenderId: "your-messaging-sender-id",
  appId: "your-app-id"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const sampleDeliveryPersons = [
  {
    username: 'delivery1',
    email: 'delivery1@restaurant.com',
    firstName: 'Juan',
    lastName: 'Santos',
    role: 'employee',
    permissions: ['delivery'],
    isActive: true,
    phone: '+63 912 345 6789',
    location: {
      latitude: 14.5995, // Manila
      longitude: 120.9842,
      accuracy: 10,
      isOnline: true
    }
  },
  {
    username: 'delivery2',
    email: 'delivery2@restaurant.com',
    firstName: 'Maria',
    lastName: 'Cruz',
    role: 'employee',
    permissions: ['delivery'],
    isActive: true,
    phone: '+63 917 654 3210',
    location: {
      latitude: 14.6091, // Quezon City
      longitude: 121.0223,
      accuracy: 15,
      isOnline: true
    }
  },
  {
    username: 'delivery3',
    email: 'delivery3@restaurant.com',
    firstName: 'Pedro',
    lastName: 'Reyes',
    role: 'employee',
    permissions: ['delivery'],
    isActive: true,
    phone: '+63 908 111 2233',
    location: {
      latitude: 14.5547, // Makati
      longitude: 121.0244,
      accuracy: 8,
      isOnline: false // This one is offline
    }
  }
];

async function createSampleDeliveryData() {
  console.log('Creating sample delivery personnel...');

  try {
    for (const person of sampleDeliveryPersons) {
      // Check if user already exists
      const userQuery = query(
        collection(db, 'users'),
        where('username', '==', person.username)
      );
      const userSnapshot = await getDocs(userQuery);

      let userId;
      if (userSnapshot.empty) {
        // Create user
        const userRef = await addDoc(collection(db, 'users'), {
          username: person.username,
          email: person.email,
          firstName: person.firstName,
          lastName: person.lastName,
          role: person.role,
          permissions: person.permissions,
          isActive: person.isActive,
          phone: person.phone,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        userId = userRef.id;
        console.log(`Created user: ${person.firstName} ${person.lastName} (${userId})`);
      } else {
        userId = userSnapshot.docs[0].id;
        console.log(`User already exists: ${person.firstName} ${person.lastName} (${userId})`);
      }

      // Create or update location data
      const locationQuery = query(
        collection(db, 'locations'),
        where('userId', '==', userId)
      );
      const locationSnapshot = await getDocs(locationQuery);

      if (locationSnapshot.empty) {
        // Create location
        await addDoc(collection(db, 'locations'), {
          userId: userId,
          latitude: person.location.latitude,
          longitude: person.location.longitude,
          accuracy: person.location.accuracy,
          heading: null,
          speed: null,
          isOnline: person.location.isOnline,
          lastSeen: serverTimestamp(),
          timestamp: serverTimestamp()
        });
        console.log(`Created location for: ${person.firstName} ${person.lastName}`);
      } else {
        // Update existing location
        const locationDoc = locationSnapshot.docs[0];
        await updateDoc(doc(db, 'locations', locationDoc.id), {
          latitude: person.location.latitude,
          longitude: person.location.longitude,
          accuracy: person.location.accuracy,
          isOnline: person.location.isOnline,
          lastSeen: serverTimestamp(),
          timestamp: serverTimestamp()
        });
        console.log(`Updated location for: ${person.firstName} ${person.lastName}`);
      }
    }

    console.log('✅ Sample delivery data created successfully!');
    console.log('📍 You should now see delivery personnel on the map.');
    
  } catch (error) {
    console.error('❌ Error creating sample data:', error);
  }
}

// Run the script
createSampleDeliveryData();