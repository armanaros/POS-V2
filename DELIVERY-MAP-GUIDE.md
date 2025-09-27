# Live Delivery Map Feature

## Overview
The Deliveries page now includes a **Live Map** tab that shows real-time locations of delivery personnel on an interactive map interface.

## Features

### 📍 Real-time Location Tracking
- Shows live positions of all delivery personnel
- Updates automatically when locations change
- Color-coded status indicators (Online, Idle, Away, Offline)

### 🗺️ Interactive Map Interface
- Click on delivery personnel markers to view details
- Zoom controls and map navigation
- Google Maps integration for markers and directions (requires API key)

### 📊 Delivery Personnel Status Panel
- Lists all delivery personnel with current status
- Shows last update times and location accuracy
- Quick access to individual tracking
- Direct link to Google Maps for each person

### 🔄 Tab Navigation
- **Delivery Orders**: Original order management interface
- **Live Map**: New map view with active personnel count

## Status Indicators

| Status | Color | Description |
|--------|--------|-------------|
| Online | 🟢 Green | Last seen within 5 minutes |
| Idle | 🟡 Yellow | Last seen 5-10 minutes ago |
| Away | 🟠 Orange | Last seen 10-30 minutes ago |
| Offline | ⚪ Gray | Last seen over 30 minutes ago or not tracking |

## Usage

### For Administrators
1. Navigate to **Deliveries** page
2. Click on **Live Map** tab
3. View all delivery personnel positions in real-time
4. Click on markers or personnel cards to select/focus
5. Use "Get Directions" to open Google Maps navigation

### For Delivery Personnel
- Ensure location tracking is enabled on your device
- The LocationTracker component will automatically start tracking
- Your location will appear on the admin map in real-time

## Technical Implementation

### Components
- **DeliveryMap**: Main map component with personnel visualization
- **useDeliveryPersonnel**: React hook for managing delivery personnel data
- **LocationTracker**: Persistent location tracking for delivery staff

### Data Flow
1. Delivery personnel devices track GPS location
2. Location data saved to the user document at `users/{userId}.location` (this app writes location to the user doc)
3. Admin map subscribes to real-time location updates from each user document
4. Map displays live positions with status indicators

### Firebase Collections / Documents Used
- `users` documents: delivery personnel info and the latest `location` field (e.g. `users/{id}.location`)

Note: This implementation stores the live location on the user document rather than a separate `locations` collection. The hook subscribes to `users/{id}` for updates.

## Setup Instructions

### ✅ **No Setup Required - Completely Free!**

The Live Map feature uses **OpenStreetMap** with **Leaflet** - completely free with:
- ❌ No API keys required
- ❌ No registration needed  
- ❌ No usage limits
- ❌ No billing or payment required
- ✅ Just works out of the box!

Simply start your development server:

```bash
npm run dev
```

### 2. Test with Sample Data

To test the map with sample delivery personnel:

```bash
# Create sample delivery personnel with locations
node create-sample-delivery-data.js
```

This creates 3 sample delivery personnel:
- Juan Santos (Manila) - Online
- Maria Cruz (Quezon City) - Online  
- Pedro Reyes (Makati) - Offline

## Future Enhancements

### Planned Features
- [x] ✅ **Free OpenStreetMap integration with live markers**
- [x] ✅ **Interactive map with zoom and pan controls**
- [x] ✅ **Custom status-based markers (Online/Idle/Away/Offline)**
- [x] ✅ **Click-to-select personnel functionality**
- [ ] Route optimization for multiple deliveries
- [ ] Delivery time estimation
- [ ] Geofencing for delivery zones
- [ ] Push notifications for location updates
- [ ] Historical location tracking and analytics

### Map Technology Used
- **✅ OpenStreetMap**: Completely free, no API key required
- **✅ Leaflet**: Open source mapping library, excellent performance
- **✅ Self-hosted**: No external dependencies or billing

## Security Considerations

- Location data is only accessible to admin users
- Delivery personnel can only see their own location
- Location tracking requires explicit user consent
- Data is encrypted in transit and at rest

## Performance Notes

- Location updates are throttled to every 30 seconds
- Map only shows personnel active within last 30 minutes
- Real-time subscriptions are properly cleaned up on unmount
- Demo map is lightweight for testing purposes

## Troubleshooting

### Map Loading Issues

**Map not loading or showing errors:**
1. Check internet connection (OpenStreetMap tiles load from external CDN)
2. Verify browser console for any JavaScript errors
3. Try refreshing the page - Leaflet library loads dynamically

**Map shows but no markers:**
1. Check browser console for any errors
2. Verify delivery personnel have `location` data in Firebase
3. Ensure location data has valid `latitude` and `longitude` numbers

### Delivery Personnel Issues

**No personnel showing on map:**
1. Check if users have `role: 'employee'` or `role: 'delivery'`
2. Verify location data exists: `users/{userId}.location`
3. Ensure `location.isOnline: true` and recent `lastSeen` timestamp
4. Check browser console for Firebase connection errors

### Required Data Structure

Location data should be stored as:
```javascript
// Firebase: users/{userId}.location
{
  latitude: 14.5995,
  longitude: 120.9842,
  accuracy: 10,
  isOnline: true,
  lastSeen: Timestamp,
  timestamp: Timestamp
}
```