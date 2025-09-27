const admin = require('firebase-admin');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// Initialize Firebase Admin (using the same project as client)
const firebaseConfig = {
  projectId: "ptownv2",
  // For local testing, we can use application default credentials
  // or you can add a service account key file
};

try {
  initializeApp(firebaseConfig);
} catch (error) {
  console.log('Firebase already initialized or error:', error.message);
}

const db = getFirestore();

async function createTestMenu() {
  try {
    console.log('Creating test menu data...');
    
    // Create a sample category
    const categoryRef = await db.collection('categories').add({
      name: 'Main Dishes',
      description: 'Delicious main course items',
      sortOrder: 1,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    
    console.log('Category created:', categoryRef.id);
    
    // Create a sample menu item
    const itemRef = await db.collection('items').add({
      categoryId: categoryRef.id,
      name: 'Chicken Adobo',
      description: 'Traditional Filipino braised chicken dish',
      price: 250,
      preparationTime: 20,
      ingredients: 'Chicken, soy sauce, vinegar, garlic, bay leaves',
      allergens: 'Soy',
      calories: 320,
      image: '',
      isAvailable: true,
      isActive: true,
      sortOrder: 1,
      costOfGoods: 120, // For cost management
      createdAt: new Date(),
      updatedAt: new Date()
    });
    
    console.log('Menu item created:', itemRef.id);
    
    // Create a sample order for today to test sales tracking
    const todayOrder = await db.collection('orders').add({
      orderNumber: 'ORD-001',
      items: [{
        id: itemRef.id,
        name: 'Chicken Adobo',
        price: 250,
        quantity: 2,
        subtotal: 500
      }],
      subtotal: 500,
      tax: 60,
      total: 560,
      status: 'completed',
      paymentStatus: 'paid',
      paymentMethod: 'cash',
      customerInfo: {
        name: 'Test Customer',
        phone: '123-456-7890'
      },
      createdAt: new Date(),
      updatedAt: new Date()
    });
    
    console.log('Test order created:', todayOrder.id);
    
    // Create another order for yesterday to test calendar
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    const yesterdayOrder = await db.collection('orders').add({
      orderNumber: 'ORD-002',
      items: [{
        id: itemRef.id,
        name: 'Chicken Adobo',
        price: 250,
        quantity: 1,
        subtotal: 250
      }],
      subtotal: 250,
      tax: 30,
      total: 280,
      status: 'completed',
      paymentStatus: 'paid',
      paymentMethod: 'card',
      customerInfo: {
        name: 'Another Customer',
        phone: '987-654-3210'
      },
      createdAt: yesterday,
      updatedAt: yesterday
    });
    
    console.log('Yesterday order created:', yesterdayOrder.id);
    
    console.log('✅ Test menu and orders created successfully!');
    console.log('You should now see:');
    console.log('- Menu categories and items in the Menu page');
    console.log('- Sales data in the Operations calendar');
    console.log('- Updated financial totals');
    
  } catch (error) {
    console.error('Error creating test data:', error);
  }
}

// Run the script
createTestMenu().then(() => {
  console.log('Script completed');
  process.exit(0);
}).catch((error) => {
  console.error('Script failed:', error);
  process.exit(1);
});