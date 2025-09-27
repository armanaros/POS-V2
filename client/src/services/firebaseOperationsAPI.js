import { db } from '../firebase';
import { 
  collection, 
  addDoc, 
  getDocs, 
  doc, 
  updateDoc, 
  deleteDoc, 
  query, 
  orderBy, 
  limit,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';

const COLLECTION_NAME = 'operations';
// Firebase only - no localStorage needed

// Helper function to convert Firestore timestamp to ISO string
const timestampToISO = (timestamp) => {
  if (!timestamp) return new Date().toISOString();
  if (timestamp.toDate) return timestamp.toDate().toISOString();
  return new Date(timestamp).toISOString();
};

// Philippines timezone constants (Asia/Manila UTC+8)
const MANILA_OFFSET_HOURS = 8;
const MANILA_OFFSET_MS = MANILA_OFFSET_HOURS * 60 * 60 * 1000;

// Helper function to get Manila noon ISO (represents local Manila 12:00 as an ISO instant)
const manilaNoonISO = (ymdOrDate) => {
  try {
    if (typeof ymdOrDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(ymdOrDate)) {
      const [yy, mm, dd] = ymdOrDate.split('-').map(Number);
      // Manila noon in UTC is 12:00 Manila == 04:00 UTC (12 - 8)
      return new Date(Date.UTC(yy, mm - 1, dd, 12 - MANILA_OFFSET_HOURS, 0, 0, 0)).toISOString();
    }
    const d = new Date(ymdOrDate || Date.now());
    // Convert the provided date to Manila local date components
    const manila = new Date(d.getTime() + MANILA_OFFSET_MS);
    const y = manila.getUTCFullYear();
    const m = manila.getUTCMonth();
    const day = manila.getUTCDate();
    return new Date(Date.UTC(y, m, day, 12 - MANILA_OFFSET_HOURS, 0, 0, 0)).toISOString();
  } catch (e) {
    return new Date().toISOString();
  }
};

// Helper to format Manila YYYY-MM-DD from a Date object
const formatManilaDateOnly = (d) => {
  const dt = new Date(d);
  // shift to Manila local time
  const manila = new Date(dt.getTime() + MANILA_OFFSET_MS);
  const y = manila.getUTCFullYear();
  const m = String(manila.getUTCMonth() + 1).padStart(2, '0');
  const day = String(manila.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export async function fetchOperations() {
  try {
    const q = query(
      collection(db, COLLECTION_NAME), 
      orderBy('createdAt', 'desc'), 
      limit(1000)
    );
    const snapshot = await getDocs(q);
    const operations = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: timestampToISO(doc.data().createdAt),
      // Use explicit dateOnly if present (client-local date), otherwise derive from createdAt
  dateOnly: doc.data().dateOnly || (doc.data().createdAt ? timestampToISO(doc.data().createdAt).split('T')[0] : formatManilaDateOnly(new Date()))
    }));
    
    return operations;
  } catch (error) {
    console.error('Error fetching operations from Firebase:', error);
    throw error; // Firebase only - no localStorage fallback
  }
}

export async function addOperation(item) {
  try {
    // Prepare the data
    // Ensure we write a server timestamp while also persisting a client-local dateOnly
    let createdAtValue;
    let dateOnlyValue;
    if (item.date) {
      const d = new Date(item.date);
      createdAtValue = Timestamp.fromDate(d);
  dateOnlyValue = formatManilaDateOnly(d);
    } else {
      createdAtValue = serverTimestamp();
  dateOnlyValue = formatManilaDateOnly(new Date());
    }

    const data = {
      type: item.type,
      amount: Number(item.amount),
      note: item.note || '',
      createdAt: createdAtValue,
      dateOnly: dateOnlyValue
    };
    
    // Add to Firestore
    const docRef = await addDoc(collection(db, COLLECTION_NAME), data);
    
    // Return the created document with computed fields
    const result = {
      id: docRef.id,
      ...item,
      createdAt: item.date || manilaNoonISO(new Date()),
      dateOnly: dateOnlyValue
    };
    
    return result;
  } catch (error) {
    console.error('Error adding operation to Firebase:', error);
    throw error; // Firebase only - no localStorage fallback
  }
}

export async function updateOperation(id, patch) {
  try {
    // Ensure id is a string and not undefined/null
    const docId = String(id || '');
    if (!docId || docId === 'undefined' || docId === 'null') {
      throw new Error('Invalid document ID for update');
    }
    
    // Prepare update data
    const updateData = {};
    if (typeof patch.type !== 'undefined') updateData.type = patch.type;
    if (typeof patch.amount !== 'undefined') updateData.amount = Number(patch.amount);
    if (typeof patch.note !== 'undefined') updateData.note = patch.note;
    if (typeof patch.date !== 'undefined') {
        const d = new Date(patch.date);
        updateData.createdAt = Timestamp.fromDate(d);
  updateData.dateOnly = formatManilaDateOnly(d);
    }
    
    // Update in Firestore
    const docRef = doc(db, COLLECTION_NAME, docId);
    await updateDoc(docRef, updateData);
    
    // Return updated data
    const result = {
      id: docId,
      ...patch,
      createdAt: patch.date || manilaNoonISO(new Date()),
      dateOnly: updateData.dateOnly || formatManilaDateOnly(new Date())
    };
    
    return result;
  } catch (error) {
    console.error('Error updating operation in Firebase:', error);
    throw error; // Firebase only - no localStorage fallback
  }
}

export async function deleteOperation(id) {
  try {
    // Ensure id is a string and not undefined/null
    const docId = String(id || '');
    if (!docId || docId === 'undefined' || docId === 'null') {
      throw new Error('Invalid document ID for deletion');
    }
    
    // Delete from Firestore
    await deleteDoc(doc(db, COLLECTION_NAME, docId));
    
    return true;
  } catch (error) {
    console.error('Error deleting operation from Firebase:', error);
    throw error; // Firebase only - no localStorage fallback
  }
}

// AI suggestions - enhanced with detailed and aggressive business recommendations
export async function aiSuggest(context) {
  const suggestions = [];
  const income = context?.income || 0;
  const expense = context?.expense || 0;
  const investment = context?.investment || 0;
  const net = income - expense;
  
  // Critical financial health analysis
  if (net <= 0) {
    suggestions.push('🚨 URGENT: Negative cash flow detected! Immediately implement price increases of 8-12% on high-margin items and cut non-essential expenses by 30%.');
    suggestions.push('💰 REVENUE BOOST: Launch a limited-time "Premium Menu" with 40% higher margins. Market as exclusive chef specials.');
  }
  
  // Expense optimization (aggressive cost-cutting)
  if (expense > income * 0.6) {
    suggestions.push('⚡ COST CRISIS: Expenses are dangerously high! Renegotiate ALL supplier contracts for 15-20% discounts. Switch to local suppliers to cut delivery costs.');
    suggestions.push('🔧 EFFICIENCY OVERHAUL: Implement aggressive portion control, reduce staff during slow hours, and eliminate menu items with <25% profit margin.');
  }
  
  // Revenue acceleration strategies
  if (income > 0) {
    suggestions.push('📈 GROWTH HACK: Implement dynamic pricing - increase prices 20% during peak hours (6-8pm). Customers will pay premium for convenience.');
    suggestions.push('🎯 UPSELL BLITZ: Train staff to aggressively push appetizers (+₱150 average ticket) and desserts (+₱120). Offer commission incentives.');
    suggestions.push('📱 DIGITAL DOMINATION: Launch delivery apps immediately. Capture 30% more revenue through online orders with 15% delivery markup.');
  }
  
  // Investment recovery acceleration
  if (investment > 0) {
    suggestions.push('⚡ PAYBACK ACCELERATION: Implement "Happy Hour" promotions to fill slow periods. 50% markup on drinks = pure profit to recover investment faster.');
    suggestions.push('🔥 CUSTOMER RETENTION: Launch loyalty program with immediate 10% discount for repeat customers. Increase visit frequency by 40%.');
  }
  
  // Market expansion tactics
  suggestions.push('🚀 MARKET EXPANSION: Partner with local offices for catering contracts. Corporate lunches have 60% higher margins than regular orders.');
  suggestions.push('💡 MENU ENGINEERING: Highlight your top 3 profit items with visual callouts, larger fonts, and "Chef Recommended" labels to boost sales by 25%.');
  
  // Operational excellence
  suggestions.push('⏰ PEAK OPTIMIZATION: Analyze your busiest 3-hour window and add temporary staff. Capture 20% more revenue during peak times.');
  // Staffing-focused recommendations (explicit)
  suggestions.push('👥 STAFFING EFFICIENCY: Reduce scheduled staff during off-peak hours, cross-train employees to cover multiple roles, and schedule experienced staff for peak windows to increase throughput with lower total labor cost.');
  suggestions.push('📈 SHIFT MIX STRATEGY: Use one senior employee to lead peak shifts and pair with 1-2 junior staff instead of multiple equal-seniority hires—this keeps costs down while maintaining service quality.');
  suggestions.push('📊 DATA-DRIVEN PRICING: Test ₱50-100 price increases on popular items monthly. Most customers won\'t notice but profits will increase 15-30%.');
  
  // Emergency cash flow tactics
  if (net < investment * 0.1) {
    suggestions.push('🆘 CASH FLOW EMERGENCY: Offer "Pay in Advance" discounts (5% off for weekly prepayment). Improve cash flow immediately.');
    suggestions.push('💳 PAYMENT INNOVATION: Add "service charge" of 10% for peak hours or large groups. Most restaurants do this - capitalize now.');
  }
  
  return suggestions.slice(0, 8); // Return top 8 most impactful suggestions
}

// Goals management - simple localStorage approach
export async function getGoals() {
  try {
    // Prefer authoritative goals from Firestore or default values
    return { monthlyRevenue: 0, recoupTarget: 0 };
  } catch (e) {
    return { monthlyRevenue: 0, recoupTarget: 0 };
  }
}

export async function setGoals(goals) {
  try {
    // In Firebase-backed mode, persist goals to Firestore via a dedicated document or let the caller handle persistence.
    // This function currently returns the provided goals as-is.
    return goals;
  } catch (e) {
    return goals;
  }
}

// Erase ALL POS data from Firebase (DANGER: Cannot be undone!)
// Preserves user accounts but removes all business data
export async function eraseAllData() {
  try {
    console.log('🗑️ Starting COMPLETE POS data erasure...');
    
    // Define all collections to clear (preserve 'users' for admin access)
    const collectionsToErase = [
      'operations',      // Operations data
      'orders',          // Order history
      'order_items',     // Order line items
      'menu_categories', // Menu categories
      'menu_items',      // Menu items
      'inventory_alerts',// Inventory notifications
      'activity_logs',   // System activity logs
      'announcements'    // Admin announcements
    ];
    
    let totalDeleted = 0;
    
    // Process each collection
    for (const collectionName of collectionsToErase) {
      try {
        const querySnapshot = await getDocs(collection(db, collectionName));
        console.log(`📁 Found ${querySnapshot.docs.length} documents in '${collectionName}'`);
        
        if (querySnapshot.docs.length > 0) {
          // Delete all documents in this collection
          const deletePromises = querySnapshot.docs.map(doc => deleteDoc(doc.ref));
          await Promise.all(deletePromises);
          totalDeleted += querySnapshot.docs.length;
          console.log(`✅ Cleared ${querySnapshot.docs.length} documents from '${collectionName}'`);
        }
      } catch (collectionError) {
        console.warn(`⚠️ Error clearing collection '${collectionName}':`, collectionError);
        // Continue with other collections even if one fails
      }
    }
    
    // Clear localStorage data but preserve auth tokens
    const keysToRemove = [
      'ptown:operations:transactions',
      'ptown:operations:goals', 
      'ptown:lastDailySalesSync',
      'ptown:menu:cache',
      'ptown:orders:cache',
      'ptown:reports:cache'
    ];
    
    keysToRemove.forEach(key => {
      try {
        localStorage.removeItem(key);
      } catch (e) {
        console.warn(`⚠️ Could not remove localStorage key '${key}':`, e);
      }
    });
    
    console.log('🎯 COMPLETE POS data erasure finished successfully');
    console.log(`📊 Total documents deleted: ${totalDeleted}`);
    console.log('👤 User accounts preserved for continued access');
    
    return { 
      success: true, 
      deletedCount: totalDeleted,
      collectionsCleared: collectionsToErase.length,
      message: `Successfully cleared ${totalDeleted} documents from ${collectionsToErase.length} collections. User access preserved.`
    };
    
  } catch (error) {
    console.error('❌ Error during complete data erasure:', error);
    throw error;
  }
}

export default { 
  fetchOperations, 
  addOperation, 
  deleteOperation, 
  updateOperation, 
  aiSuggest, 
  getGoals, 
  setGoals,
  eraseAllData
};