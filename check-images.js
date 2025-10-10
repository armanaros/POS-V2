const admin = require('firebase-admin');

// Initialize Firebase Admin
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'ptownv2'
});

const db = admin.firestore();

async function checkImageData() {
  console.log('🖼️ Checking image data in menu items...\n');
  
  try {
    const itemsSnapshot = await db.collection('menu_items').get();
    let itemsWithImages = 0;
    let itemsWithoutImages = 0;
    
    console.log('📋 Menu Items Image Audit:');
    itemsSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.isActive === true) {
        if (data.imageUrl || data.image || data.img) {
          itemsWithImages++;
          console.log(`✅ ${data.name} - Has image: ${data.imageUrl || data.image || data.img}`);
        } else {
          itemsWithoutImages++;
          console.log(`❌ ${data.name} - No image`);
        }
        
        // Show all possible image-related fields
        const imageFields = ['imageUrl', 'image', 'img', 'photo', 'picture'];
        imageFields.forEach(field => {
          if (data[field]) {
            console.log(`   📸 ${field}: ${data[field]}`);
          }
        });
      }
    });
    
    console.log(`\n📊 Image Summary:`);
    console.log(`   🖼️ Items with images: ${itemsWithImages}`);
    console.log(`   ❌ Items without images: ${itemsWithoutImages}`);
    
    if (itemsWithImages > 0) {
      console.log(`\n✅ Legacy system CAN use images! Found ${itemsWithImages} items with image URLs.`);
    } else {
      console.log(`\n⚠️ No image URLs found. Legacy will need to use fallback display.`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
  
  process.exit(0);
}

checkImageData();