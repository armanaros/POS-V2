import React, { useEffect, useRef, useState } from 'react';
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

// Dynamically load Leaflet library from CDN
const loadLeaflet = () => {
  return new Promise((resolve, reject) => {
    if (window.L) {
      console.log('Leaflet already loaded');
      resolve(window.L);
      return;
    }

    console.log('Loading Leaflet from CDN...');
    
    // Load CSS first
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    link.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
    link.crossOrigin = '';
    document.head.appendChild(link);

    // Load JavaScript
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
    script.crossOrigin = '';
    
    script.onload = () => {
      console.log('Leaflet loaded successfully');
      resolve(window.L);
    };
    
    script.onerror = (error) => {
      console.error('Failed to load Leaflet:', error);
      reject(new Error('Failed to load Leaflet library'));
    };
    
    document.head.appendChild(script);
  });
};

// Free map implementation using Leaflet and OpenStreetMap  
const DeliveryMap = ({ deliveryPersons = [], onPersonSelect, selectedPersonId }) => {
  const mapRef = useRef(null);
  const leafletMapRef = useRef(null);
  const markersRef = useRef({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [zoom, setZoom] = useState(13);

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

        console.log('Loading Leaflet library...');
        const L = await loadLeaflet();
        
        if (!mounted) {
          console.log('Component unmounted during Leaflet loading');
          return;
        }

        console.log('Creating Leaflet map instance...');
        
        // Clear any existing content
        container.innerHTML = '';
        
        // Create map centered on Manila (free OpenStreetMap tiles)
        leafletMapRef.current = L.map(container, {
          center: [14.5995, 120.9842],
          zoom: zoom,
          zoomControl: false,
          attributionControl: true
        });

        console.log('Map instance created, adding tile layer...');
        
        // Add OpenStreetMap tiles (completely free)
        const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          maxZoom: 19
        });
        
        tileLayer.addTo(leafletMapRef.current);
        
        // Event handlers for debugging
        tileLayer.on('loading', () => console.log('Map tiles loading...'));
        tileLayer.on('load', () => console.log('Map tiles loaded successfully'));
        tileLayer.on('tileerror', (e) => console.error('Tile loading error:', e));
        
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
        
      } catch (err) {
        if (!mounted) return;
        console.error('Failed to initialize map:', err);
        console.error('Error stack:', err.stack);
        
        setError(`Map initialization failed: ${err.message}`);
        setLoading(false);
      }
    };

    // Start initialization with timeout fallback
    const timeout = setTimeout(() => {
      if (loading && mounted) {
        console.error('Map initialization timeout after 15 seconds');
        setError('Map loading timeout. Please check your internet connection and refresh.');
        setLoading(false);
      }
    }, 15000);

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
      clearTimeout(timeout);
      
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
  }, [zoom]);

  // Helper functions
  const getPersonStatus = (person) => {
    if (!person.lastSeen) return 'offline';
    const lastSeen = new Date(person.lastSeen);
    const now = new Date();
    const diffMinutes = (now - lastSeen) / (1000 * 60);
    
    if (diffMinutes < 5) return 'online';
    if (diffMinutes < 15) return 'idle'; 
    if (diffMinutes < 60) return 'away';
    return 'offline';
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

  if (loading) {
    return (
      <Card sx={{ height: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CardContent sx={{ textAlign: 'center' }}>
          <DirectionsCar sx={{ fontSize: 48, color: 'primary.main', mb: 2 }} />
          <Typography variant="h6" gutterBottom>
            Loading delivery map...
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Initializing free OpenStreetMap
          </Typography>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card sx={{ height: 500 }}>
        <Alert 
          severity="error" 
          sx={{ mb: 2 }}
          action={
            <Button 
              color="inherit" 
              size="small"
              onClick={() => window.location.reload()}
            >
              Refresh Page
            </Button>
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
    );
  }

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
          bgcolor: 'rgba(255,255,255,0.95)'
        }}>
          <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
            <Typography variant="subtitle2" gutterBottom>
              Active Delivery Personnel ({deliveryPersons.length})
            </Typography>
            <Stack spacing={1}>
              {deliveryPersons.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No active delivery personnel
                </Typography>
              ) : (
                deliveryPersons.map((person) => {
                  const status = getPersonStatus(person);
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
                        <Avatar sx={{ width: 24, height: 24 }}>
                          <Person sx={{ fontSize: 14 }} />
                        </Avatar>
                      </Badge>
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography variant="body2" noWrap>
                          {person.name}
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
      </Card>
    </Box>
  );
};

export default DeliveryMap;