import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Chip,
  Avatar,
  Stack,
  IconButton,
  Tooltip,
  Alert,
  Button,
  Badge,
} from '@mui/material';
import {
  MyLocation,
  ZoomIn,
  ZoomOut,
  Refresh,
  Person,
  DirectionsCar,
  AccessTime,
} from '@mui/icons-material';

// We're now using the bundled Leaflet package from npm (imported above).
// This avoids runtime fetches and cross-origin failures in restricted environments.


// Free map implementation using Leaflet and OpenStreetMap  
const DeliveryMap = ({ deliveryPersons = [], onPersonSelect, selectedPersonId, statistics = null }) => {
  const mapRef = useRef(null);
  const leafletMapRef = useRef(null);
  const markersRef = useRef({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [zoom, setZoom] = useState(13);
  const [retryKey, setRetryKey] = useState(0);




  // Wait for container to be available
  const waitForContainer = () => {
    return new Promise((resolve) => {
      const checkContainer = () => {
        if (mapRef.current) {
          console.log('Map container found!');
          resolve(mapRef.current);
        } else {
          console.log('Waiting for map container...');
          setTimeout(checkContainer, 50);
        }
      };
      checkContainer();
    });
  };

  // Initialize map with Leaflet (free)
  useEffect(() => {
    let mounted = true;
    let initializationAttempted = false;

    const initializeMap = async () => {
      if (initializationAttempted || !mounted) return;
      initializationAttempted = true;
      // Clear any previous error and ensure loading state
      setError(null);
      setLoading(true);
      
      console.log('Starting map initialization...');
      console.log('Document ready state:', document.readyState);
      
      try {
        // Wait for the container to be available
        const container = await waitForContainer();
        
        if (!mounted) {
          console.log('Component unmounted during wait');
          return;
        }

        console.log('Container found, checking dimensions...');
        console.log('Map container dimensions:', {
          width: container.offsetWidth,
          height: container.offsetHeight,
          display: window.getComputedStyle(container).display,
          visibility: window.getComputedStyle(container).visibility
        });

        if (container.offsetWidth === 0 || container.offsetHeight === 0) {
          console.error('Map container has zero dimensions');
          setError('Map container has invalid dimensions. Please refresh the page.');
          setLoading(false);
          return;
        }

        // Simplified initialization - Leaflet is bundled, no retries needed
        try {
          console.log('Initializing map with bundled Leaflet...');
          
          // Clear any existing content
          container.innerHTML = '';

          // Create map centered on Manila (free OpenStreetMap tiles)
          leafletMapRef.current = L.map(container, {
            center: [14.5995, 120.9842],
            zoom: zoom,
            zoomControl: false,
            attributionControl: true
          });

          // Add OpenStreetMap tiles with higher accuracy settings
          const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 20, // Increased max zoom for more detail
            minZoom: 10
          });
          tileLayer.addTo(leafletMapRef.current);

          // Force map to invalidate size after creation
          setTimeout(() => {
            if (leafletMapRef.current && mounted) {
              console.log('Invalidating map size...');
              leafletMapRef.current.invalidateSize();
            }
          }, 100);

          console.log('Map initialized successfully!');
          setError(null);
          setLoading(false);

        } catch (e) {
          console.error('Map initialization failed:', e);
          if (!mounted) return;
          setError(`Map initialization failed: ${e.message}`);
          setLoading(false);
        }
        
      } catch (err) {
        if (!mounted) return;
        console.error('Failed to initialize map:', err);
        console.error('Error stack:', err.stack);
        
        setError(`Map initialization failed: ${err.message}`);
        setLoading(false);
      }
    };

    // Start initialization immediately

    // Wait for DOM to be ready, then initialize
    if (document.readyState === 'complete') {
      setTimeout(initializeMap, 100);
    } else {
      const readyHandler = () => {
        setTimeout(initializeMap, 100);
        document.removeEventListener('DOMContentLoaded', readyHandler);
      };
      document.addEventListener('DOMContentLoaded', readyHandler);
    }

    return () => {
      mounted = false;
      
      // Cleanup markers
      Object.values(markersRef.current).forEach(marker => {
        if (marker && leafletMapRef.current) {
          leafletMapRef.current.removeLayer(marker);
        }
      });
      markersRef.current = {};
      
      // Cleanup map
      if (leafletMapRef.current) {
        console.log('Cleaning up map instance');
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }
    };
  }, [zoom, retryKey]);

  // Helper functions
  const getPersonStatus = (person) => {
    // Align status computation with useDeliveryPersonnel hook
    const loc = person?.location || null;
    if (!loc) return 'offline';

    // lastSeen might be a Firestore Timestamp or a JS Date/string
    const lastSeen = new Date(loc.lastSeen?.toDate?.() || loc.lastSeen || Date.now());
    const now = new Date();
    const diffMinutes = Math.floor((now - lastSeen) / (1000 * 60));

    if (!loc.isOnline) return 'offline';
    if (diffMinutes > 10) return 'away';
    if (diffMinutes > 5) return 'idle';
    return 'online';
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'online': return '#4caf50';
      case 'idle': return '#ff9800'; 
      case 'away': return '#f44336';
      case 'offline': return '#9e9e9e';
      default: return '#9e9e9e';
    }
  };

  // Helper to normalize location formats with accuracy validation
  const getLatLngFromPerson = (person) => {
    if (!person) return null;
    const loc = person.location || person.loc || person.coords || null;
    if (!loc) return null;
    
    let lat, lng, accuracy = null;
    
    if (Array.isArray(loc) && loc.length >= 2) {
      lat = Number(loc[0]);
      lng = Number(loc[1]);
      accuracy = loc[2] ? Number(loc[2]) : null;
    } else if (typeof loc === 'object') {
      // Handle various location object formats
      if (loc.lat !== undefined && loc.lng !== undefined) {
        lat = Number(loc.lat);
        lng = Number(loc.lng);
      } else if (loc.latitude !== undefined && loc.longitude !== undefined) {
        lat = Number(loc.latitude);
        lng = Number(loc.longitude);
      } else if (loc._lat !== undefined && loc._long !== undefined) {
        // Firestore GeoPoint shape
        lat = Number(loc._lat);
        lng = Number(loc._long);
      } else {
        return null;
      }
      
      // Extract accuracy if available
      accuracy = loc.accuracy || loc.horizontalAccuracy || null;
    } else {
      return null;
    }
    
    // Validate coordinates
    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      console.warn('Invalid coordinates:', { lat, lng });
      return null;
    }
    
    return { 
      lat, 
      lng, 
      accuracy: accuracy ? Number(accuracy) : null,
      timestamp: loc.timestamp || loc.lastUpdated || Date.now()
    };
  };

  // Friendly display name helpers
  const getDisplayName = (person) => {
    // Try to build name from firstName and lastName first
    const firstName = person?.firstName?.trim();
    const lastName = person?.lastName?.trim();
    
    if (firstName && lastName) {
      return `${firstName} ${lastName}`;
    } else if (firstName) {
      return firstName;
    } else if (lastName) {
      return lastName;
    }
    
    // Fallback to other fields
    return person?.name || person?.displayName || person?.email || (person?.username ? person.username : null) || (`#${(person?.id || '').slice(0,6)}`) || 'Unknown';
  };

  const getInitials = (name) => {
    if (!name) return null;
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return null;
    if (parts.length === 1) return parts[0].slice(0,2).toUpperCase();
    return (parts[0][0] + parts[parts.length-1][0]).toUpperCase();
  };

  // Helper to get human-readable time ago
  const getTimeAgo = (timestamp) => {
    const now = Date.now();
    const time = typeof timestamp === 'object' && timestamp.toDate ? timestamp.toDate().getTime() : Number(timestamp);
    const diffMs = now - time;
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    
    if (diffMinutes < 1) return 'now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  // Update markers when deliveryPersons changes
  useEffect(() => {
    if (!leafletMapRef.current || typeof L === 'undefined') return;

    const presentIds = new Set(deliveryPersons.map(p => p.id));

    // Remove markers for people no longer present
    Object.keys(markersRef.current).forEach(id => {
      if (!presentIds.has(id)) {
        try {
          leafletMapRef.current.removeLayer(markersRef.current[id]);
        } catch (e) {
          console.warn('Error removing marker', e);
        }
        delete markersRef.current[id];
      }
    });

    const bounds = [];

    deliveryPersons.forEach(person => {
      const location = getLatLngFromPerson(person);
      if (!location) return; // skip if no location

      const status = getPersonStatus(person);
      const color = getStatusColor(status);
      const displayName = getDisplayName(person);

      // Enhanced marker with accuracy indicator and movement direction
      const accuracyText = location.accuracy ? `±${Math.round(location.accuracy)}m` : '';
      const timeAgo = location.timestamp ? getTimeAgo(location.timestamp) : '';
      
      // Create a more detailed marker
      const html = `
        <div style="display:flex;flex-direction:column;align-items:center;white-space:nowrap;position:relative;"> 
          <div style="position:relative;">
            <div style="width:16px;height:16px;border-radius:50%;background:${color};border:3px solid white;box-shadow:0 0 6px rgba(0,0,0,0.3);position:relative;z-index:2;"></div>
            ${location.accuracy && location.accuracy > 0 ? `
              <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:${Math.min(location.accuracy / 2, 40)}px;height:${Math.min(location.accuracy / 2, 40)}px;border-radius:50%;background:${color};opacity:0.2;z-index:1;"></div>
            ` : ''}
          </div>
          <div style="font-size:10px;margin-top:4px;color:#222;font-weight:bold;background:rgba(255,255,255,0.9);padding:2px 4px;border-radius:3px;box-shadow:0 1px 3px rgba(0,0,0,0.2);">
            ${displayName.split(' ')[0]}
          </div>
        </div>
      `;

      const icon = L.divIcon({ 
        html, 
        className: 'delivery-marker-enhanced', 
        iconSize: [80, 50], 
        iconAnchor: [40, 45] 
      });

      if (markersRef.current[person.id]) {
        // Smooth animation when updating position
        try {
          const currentMarker = markersRef.current[person.id];
          const currentPos = currentMarker.getLatLng();
          const newPos = [location.lat, location.lng];
          
          // If position changed significantly, animate the movement
          if (L.latLng(currentPos).distanceTo(L.latLng(newPos)) > 10) {
            // Animate marker movement
            currentMarker.setLatLng(newPos);
          }
          currentMarker.setIcon(icon);
        } catch (e) {
          console.warn('Error updating marker', e);
        }
      } else {
        // create new marker
        try {
          const marker = L.marker([location.lat, location.lng], { icon }).addTo(leafletMapRef.current);
          
          // Enhanced popup with more details
          const popupContent = `
            <div style="min-width:200px;">
              <strong>${displayName}</strong><br/>
              <span style="color:${color};">●</span> ${status}<br/>
              ${location.accuracy ? `<small>Accuracy: ${accuracyText}</small><br/>` : ''}
              ${timeAgo ? `<small>Updated: ${timeAgo}</small><br/>` : ''}
              <small>Lat: ${location.lat.toFixed(6)}, Lng: ${location.lng.toFixed(6)}</small>
            </div>
          `;
          
          marker.bindPopup(popupContent);
          marker.on('click', () => onPersonSelect?.(person));
          markersRef.current[person.id] = marker;
        } catch (e) {
          console.warn('Error creating marker', e);
        }
      }

      bounds.push([location.lat, location.lng]);
    });

    // Fit map to markers with better zoom control for accuracy
    if (bounds.length > 0) {
      try {
        const b = L.latLngBounds(bounds);
        if (bounds.length === 1) {
          // Single marker - zoom to detailed level
          leafletMapRef.current.setView(bounds[0], 17);
        } else {
          // Multiple markers - fit bounds with good detail
          leafletMapRef.current.fitBounds(b, { 
            padding: [20, 20], 
            maxZoom: 16 // Good balance between detail and overview
          });
        }
      } catch (e) {
        console.warn('Error fitting bounds', e);
      }
    }

  }, [deliveryPersons, onPersonSelect]);



  // Instead of returning early, always render the map container so the ref exists
  // and show overlays for loading / error states. This prevents the mapRef
  // from never being attached (which caused the initialization timeout).
  const loadingOverlay = loading ? (
    <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1400, background: 'rgba(255,255,255,0.85)' }}>
      <CardContent sx={{ textAlign: 'center' }}>
        <DirectionsCar sx={{ fontSize: 48, color: 'primary.main', mb: 2 }} />
        <Typography variant="h6" gutterBottom>
          Loading delivery map...
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Initializing free OpenStreetMap
        </Typography>
      </CardContent>
    </Box>
  ) : null;

  const errorOverlay = error ? (
    <Box sx={{ position: 'absolute', inset: 8, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1500 }}>
      <Card sx={{ width: '100%' }}>
        <Alert
          severity="error"
          sx={{ mb: 2 }}
          action={
            <Stack direction="row" spacing={1}>
              <Button
                color="inherit"
                size="small"
                onClick={() => window.location.reload()}
              >
                Refresh Page
              </Button>
              <Button
                color="inherit"
                size="small"
                onClick={() => setRetryKey(k => k + 1)}
              >
                Retry Map Init
              </Button>
            </Stack>
          }
        >
          <strong>Map Error:</strong> {error}
        </Alert>
        <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
          <strong>Troubleshooting:</strong>
          <br />• Check your internet connection
          <br />• Try refreshing the page
          <br />• Disable any ad blockers that might block map tiles
          <br />• This map uses OpenStreetMap (completely free, no API key required)
        </Typography>

      </Card>
    </Box>
  ) : null;

  return (
    <Box>
      <Card sx={{ height: 500, position: 'relative' }}>
        <Box 
          ref={mapRef} 
          sx={{ 
            height: '100%', 
            width: '100%',
            minHeight: '400px',
            '& .leaflet-control-attribution': {
              fontSize: '10px',
              background: 'rgba(255, 255, 255, 0.8)'
            }
          }} 
        />

        {/* Map Controls */}
        <Stack 
          spacing={1} 
          sx={{ 
            position: 'absolute', 
            top: 12, 
            right: 12, 
            bgcolor: 'rgba(255,255,255,0.95)', 
            borderRadius: 1, 
            p: 0.5,
            boxShadow: 2
          }}
        >
          <Tooltip title="Zoom In">
            <IconButton 
              size="small" 
              onClick={() => leafletMapRef.current?.zoomIn()}
            >
              <ZoomIn />
            </IconButton>
          </Tooltip>
          <Tooltip title="Zoom Out">
            <IconButton 
              size="small" 
              onClick={() => leafletMapRef.current?.zoomOut()}
            >
              <ZoomOut />
            </IconButton>
          </Tooltip>
          <Tooltip title="Refresh Map">
            <IconButton 
              size="small" 
              onClick={() => window.location.reload()}
            >
              <Refresh />
            </IconButton>
          </Tooltip>
        </Stack>

        {/* Delivery Personnel List */}
        <Card sx={{ 
          position: 'absolute', 
          bottom: 12, 
          left: 12, 
          maxWidth: 300,
          maxHeight: 200,
          overflow: 'auto',
          bgcolor: 'rgba(255,255,255,0.95)',
          zIndex: 1200,
          pointerEvents: 'auto'
        }}>
          <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
            <Typography variant="subtitle2" gutterBottom>
              {/* Active = online + idle (prefer statistics.active if provided) */}
              {statistics ? `Active Delivery Personnel (${statistics.active})` : (() => {
                const activeCount = deliveryPersons.reduce((acc, p) => {
                  const s = getPersonStatus(p);
                  return acc + ((s === 'online' || s === 'idle') ? 1 : 0);
                }, 0);
                return `Active Delivery Personnel (${activeCount})`;
              })()}
            </Typography>
            <Stack spacing={1}>
              {deliveryPersons.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No active delivery personnel
                </Typography>
              ) : (
                deliveryPersons.map((person, index) => {
                  const status = getPersonStatus(person);
                  const displayName = getDisplayName(person);
                  const initials = getInitials(displayName);
                  

                  
                  return (
                    <Box 
                      key={person.id}
                      sx={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: 1,
                        p: 0.5,
                        borderRadius: 1,
                        bgcolor: selectedPersonId === person.id ? 'primary.50' : 'transparent',
                        cursor: 'pointer',
                        '&:hover': { bgcolor: 'grey.100' }
                      }}
                      onClick={() => onPersonSelect?.(person)}
                    >
                      <Badge
                        overlap="circular"
                        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                        badgeContent={
                          <Box
                            sx={{
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              bgcolor: getStatusColor(status),
                              border: '1px solid white'
                            }}
                          />
                        }
                      >
                        <Avatar sx={{ width: 24, height: 24, bgcolor: 'primary.main', fontSize: 10 }}>
                          {initials || <Person sx={{ fontSize: 14 }} />}
                        </Avatar>
                      </Badge>
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography variant="body2" noWrap>
                          {displayName}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {status} • {person.activeOrders || 0} orders
                        </Typography>
                      </Box>
                    </Box>
                  );
                })
              )}
            </Stack>
          </CardContent>
        </Card>
        {loadingOverlay}
        {errorOverlay}
      </Card>
    </Box>
  );
};

export default DeliveryMap;