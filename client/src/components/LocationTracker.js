import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Button,
  Box,
  Stack,
  Chip,
  Switch,
  FormControlLabel,
  Alert,
  IconButton,
  Divider,
} from '@mui/material';
import {
  LocationOn,
  Navigation,
  Speed,
  Refresh,
  MyLocation,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import LocationService from '../services/locationService';
import { useAuth } from '../context/AuthContext';

const LocationTracker = ({ onLocationUpdate, showControls = true }) => {
  const { user } = useAuth();
  const [isTracking, setIsTracking] = useState(false);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [locationPermission, setLocationPermission] = useState('prompt');
  const [accuracy, setAccuracy] = useState(null);
  const [speed, setSpeed] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);

  // Auto-restart tracking if it stops unexpectedly for delivery personnel
  useEffect(() => {
    if (user?.role === 'delivery' && !isTracking && locationPermission === 'granted') {
      const savedPreference = localStorage.getItem(`locationTracking_${user.id}`);
      
      // If tracking was not explicitly disabled, restart it
      if (savedPreference !== 'false') {
        const restartTimer = setTimeout(() => {
          handleStartTracking();
        }, 5000); // Wait 5 seconds before auto-restart
        
        return () => clearTimeout(restartTimer);
      }
    }
  }, [isTracking, user?.role, user?.id, locationPermission, handleStartTracking]);

  useEffect(() => {
    // Check location permission status
    checkLocationPermission();
    
    // Auto-start tracking for delivery personnel or restore previous state
    if (user?.role === 'delivery' && !isTracking && locationPermission !== 'denied') {
      const shouldRestore = LocationService.shouldRestoreTracking(user.id);
      const savedPreference = localStorage.getItem(`locationTracking_${user.id}`);
      
      // Start tracking if it's a new session or if tracking was previously enabled
      if (shouldRestore || savedPreference === null || savedPreference === 'true') {
        handleStartTracking();
      }
    }
    
    // Subscribe to location updates if tracking is enabled
    if (isTracking && user?.id) {
      const unsubscribe = LocationService.subscribeToUserLocation(user.id, (location) => {
        setCurrentLocation(location);
        setAccuracy(location.accuracy);
        setSpeed(location.speed);
        setLastUpdate(new Date(location.timestamp?.toDate?.() || Date.now()));
        
        if (onLocationUpdate) {
          onLocationUpdate(location);
        }
      });

      return () => unsubscribe();
    }
  }, [isTracking, user?.id, user?.role, onLocationUpdate, locationPermission, handleStartTracking]);

  const checkLocationPermission = async () => {
    if (!navigator.permissions) {
      setLocationPermission('unknown');
      return;
    }

    try {
      const permission = await navigator.permissions.query({ name: 'geolocation' });
      setLocationPermission(permission.state);
      
      permission.addEventListener('change', () => {
        setLocationPermission(permission.state);
      });
    } catch (error) {
      console.error('Error checking location permission:', error);
      setLocationPermission('unknown');
    }
  };

  const handleStartTracking = useCallback(async () => {
    if (!user?.id) {
      toast.error('User not authenticated');
      return;
    }

    const success = await LocationService.startTracking(user.id);
    if (success) {
      setIsTracking(true);
      // Save tracking preference for delivery personnel
      if (user?.role === 'delivery') {
        localStorage.setItem(`locationTracking_${user.id}`, 'true');
      }
    }
  }, [user?.id, user?.role]);

  const handleStopTracking = async () => {
    if (!user?.id) return;

    await LocationService.stopTrackingAndMarkOffline(user.id);
    setIsTracking(false);
    setCurrentLocation(null);
    setAccuracy(null);
    setSpeed(null);
    setLastUpdate(null);
    
    // Save tracking preference and clear restoration state
    if (user?.role === 'delivery') {
      localStorage.setItem(`locationTracking_${user.id}`, 'false');
      LocationService.clearTrackingState(user.id);
    }
  };

  const handleRefreshLocation = async () => {
    if (!user?.id || !isTracking) return;

    try {
      toast('Acquiring high accuracy location...', { icon: '📡' });
      
      // Try multiple readings for better accuracy
      const positions = [];
      for (let i = 0; i < 3; i++) {
        try {
          const position = await LocationService.getCurrentPosition();
          positions.push(position);
          await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s between readings
        } catch (error) {
          console.warn(`Reading ${i + 1} failed:`, error);
        }
      }
      
      if (positions.length === 0) {
        throw new Error('No position readings obtained');
      }
      
      // Use the most accurate reading
      const bestPosition = positions.reduce((best, current) => 
        current.coords.accuracy < best.coords.accuracy ? current : best
      );
      
      await LocationService.handleLocationUpdate(user.id, bestPosition);
      
      const accuracyRating = getAccuracyRating(bestPosition.coords.accuracy);
      toast.success(`Location updated with ${accuracyRating.text.toLowerCase()} accuracy (±${Math.round(bestPosition.coords.accuracy)}m)`);
    } catch (error) {
      toast.error('Failed to update location');
    }
  };

  const formatSpeed = (speed) => {
    if (!speed || speed < 0) return 'Stationary';
    const kmh = Math.round(speed * 3.6);
    return `${kmh} km/h`;
  };

  const formatAccuracy = (accuracy) => {
    if (!accuracy) return 'Unknown';
    return `±${Math.round(accuracy)}m`;
  };

  const getAccuracyRating = (accuracy) => {
    if (!accuracy) return { level: 'unknown', text: 'Unknown', color: 'default' };
    if (accuracy <= 5) return { level: 'excellent', text: 'Excellent', color: 'success' };
    if (accuracy <= 10) return { level: 'high', text: 'High', color: 'success' };
    if (accuracy <= 20) return { level: 'good', text: 'Good', color: 'info' };
    if (accuracy <= 50) return { level: 'moderate', text: 'Moderate', color: 'warning' };
    if (accuracy <= 100) return { level: 'low', text: 'Low', color: 'warning' };
    return { level: 'poor', text: 'Poor', color: 'error' };
  };

  const formatLastUpdate = (date) => {
    if (!date) return 'Never';
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);
    
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return date.toLocaleString();
  };

  const getLocationStatusColor = () => {
    if (!isTracking) return 'default';
    if (!currentLocation) return 'warning';
    const rating = getAccuracyRating(accuracy);
    if (rating.level === 'poor' || rating.level === 'low') return 'warning';
    return 'success';
  };

  const getLocationStatusText = () => {
    if (!isTracking) return 'Tracking Off';
    if (!currentLocation) return 'Acquiring Location...';
    const rating = getAccuracyRating(accuracy);
    if (rating.level === 'poor') return 'Poor Accuracy';
    if (rating.level === 'low') return 'Low Accuracy';
    if (rating.level === 'moderate') return 'Moderate Accuracy';
    return 'High Accuracy Active';
  };

  if (!showControls && !isTracking) {
    return null;
  }

  return (
    <Card 
      sx={{ 
        mb: 2, 
        borderRadius: 3,
        boxShadow: (theme) => theme.shadows[2],
        background: (theme) => 
          isTracking 
            ? `linear-gradient(135deg, ${theme.palette.primary.main}08, ${theme.palette.primary.main}03)` 
            : 'inherit',
        border: (theme) => 
          isTracking 
            ? `1px solid ${theme.palette.primary.main}20` 
            : `1px solid ${theme.palette.divider}`,
        transition: 'all 0.3s ease-in-out',
        '&:hover': {
          boxShadow: (theme) => theme.shadows[4],
          transform: 'translateY(-1px)',
        }
      }}
    >
      <CardContent sx={{ pb: 2 }}>
        <Stack spacing={2.5}>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Box display="flex" alignItems="center" gap={1.5}>
              <Box 
                sx={{ 
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 40,
                  height: 40,
                  borderRadius: 2,
                  backgroundColor: isTracking ? 'primary.main' : 'grey.300',
                  color: 'white',
                  transition: 'all 0.3s ease',
                }}
              >
                <LocationOn sx={{ fontSize: 20 }} />
              </Box>
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5 }}>
                  Location Tracking
                </Typography>
                {user?.role === 'delivery' && (
                  <Box display="flex" gap={0.5} alignItems="center">
                    <Chip 
                      label="Required" 
                      color="warning" 
                      size="small" 
                      sx={{ 
                        fontSize: '0.7rem',
                        height: 20,
                        fontWeight: 'bold',
                        '& .MuiChip-label': { px: 1 }
                      }}
                    />
                  </Box>
                )}
              </Box>
            </Box>
            <Chip 
              label={getLocationStatusText()}
              color={getLocationStatusColor()}
              size="medium"
              sx={{ 
                fontWeight: 'bold',
                fontSize: '0.8rem',
                boxShadow: 1,
                '& .MuiChip-label': { px: 2 }
              }}
            />
          </Box>

          {locationPermission === 'denied' && (
            <Alert 
              severity="error"
              variant="outlined"
              sx={{ 
                borderRadius: 2,
                backgroundColor: 'error.light',
                border: (theme) => `1px solid ${theme.palette.error.main}40`,
                '& .MuiAlert-message': { fontWeight: 500 }
              }}
            >
              <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                Location Access Denied
              </Typography>
              Please enable location permissions in your browser settings to use this feature.
            </Alert>
          )}

          {showControls && (
            <Box 
              sx={{ 
                backgroundColor: (theme) => theme.palette.grey[50],
                borderRadius: 2,
                p: 2,
                border: (theme) => `1px solid ${theme.palette.grey[200]}`,
              }}
            >
              <FormControlLabel
                control={
                  <Switch
                    checked={isTracking}
                    onChange={(e) => {
                      if (e.target.checked) {
                        handleStartTracking();
                      } else {
                        // For delivery personnel, show warning before stopping
                        if (user?.role === 'delivery') {
                          if (window.confirm('Are you sure you want to stop location tracking? This may affect delivery management.')) {
                            handleStopTracking();
                          }
                        } else {
                          handleStopTracking();
                        }
                      }
                    }}
                    disabled={locationPermission === 'denied'}
                    size="medium"
                    sx={{
                      '& .MuiSwitch-thumb': {
                        boxShadow: 2,
                      },
                    }}
                  />
                }
                label={
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    {user?.role === 'delivery' ? "Location Tracking (Required for Deliveries)" : "Enable Location Tracking"}
                  </Typography>
                }
                sx={{ mb: user?.role === 'delivery' && !isTracking ? 1 : 0 }}
              />
              {user?.role === 'delivery' && !isTracking && (
                <Alert 
                  severity="warning" 
                  variant="outlined"
                  sx={{ 
                    mt: 1,
                    backgroundColor: 'warning.light',
                    '& .MuiAlert-message': { fontSize: '0.8rem' }
                  }}
                >
                  Location tracking is recommended for delivery personnel to enable order tracking and navigation.
                </Alert>
              )}
            </Box>
          )}

          {isTracking && (
            <>
              <Divider sx={{ my: 1 }} />
              <Box 
                sx={{ 
                  backgroundColor: (theme) => theme.palette.success.main + '08',
                  borderRadius: 2,
                  p: 2,
                  border: (theme) => `1px solid ${theme.palette.success.main}20`,
                }}
              >
                <Stack spacing={2}>
                  <Box display="flex" justifyContent="space-between" alignItems="center">
                    <Typography 
                      variant="subtitle2" 
                      sx={{ 
                        fontWeight: 600,
                        color: 'success.dark',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1
                      }}
                    >
                      <MyLocation sx={{ fontSize: 16 }} />
                      Live Status
                    </Typography>
                    <IconButton 
                      size="small" 
                      onClick={handleRefreshLocation}
                      disabled={!isTracking}
                      sx={{ 
                        backgroundColor: 'success.main',
                        color: 'white',
                        '&:hover': { backgroundColor: 'success.dark' },
                        '&:disabled': { backgroundColor: 'grey.300' }
                      }}
                    >
                      <Refresh sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Box>

                  <Box display="flex" gap={1.5} flexWrap="wrap">
                    <Chip
                      icon={<MyLocation sx={{ fontSize: 16 }} />}
                      label={`${getAccuracyRating(accuracy).text} (${formatAccuracy(accuracy)})`}
                      size="small"
                      variant="filled"
                      color={getAccuracyRating(accuracy).color}
                      sx={{ 
                        fontWeight: 600,
                        '& .MuiChip-icon': { ml: 1 },
                        boxShadow: 1,
                      }}
                    />
                    <Chip
                      icon={<Speed sx={{ fontSize: 16 }} />}
                      label={formatSpeed(speed)}
                      size="small"
                      variant="filled"
                      color="info"
                      sx={{ 
                        fontWeight: 500,
                        '& .MuiChip-icon': { ml: 1 }
                      }}
                    />
                  </Box>

                  <Box 
                    sx={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center',
                      backgroundColor: 'white',
                      borderRadius: 1,
                      px: 1.5,
                      py: 1,
                      border: (theme) => `1px solid ${theme.palette.grey[200]}`
                    }}
                  >
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>
                      Last update:
                    </Typography>
                    <Typography variant="caption" sx={{ fontWeight: 600, color: 'success.dark' }}>
                      {formatLastUpdate(lastUpdate)}
                    </Typography>
                  </Box>

                  {/* Improve Accuracy tips removed per UX request */}

                  {currentLocation && (
                    <Button
                      variant="contained"
                      size="medium"
                      fullWidth
                      startIcon={<Navigation />}
                      onClick={() => {
                        const url = `https://www.google.com/maps/@${currentLocation.latitude},${currentLocation.longitude},15z`;
                        window.open(url, '_blank');
                      }}
                      sx={{ 
                        mt: 1,
                        background: 'linear-gradient(45deg, #2196F3 30%, #21CBF3 90%)',
                        boxShadow: 2,
                        fontWeight: 600,
                        '&:hover': {
                          boxShadow: 4,
                          transform: 'translateY(-1px)',
                        }
                      }}
                    >
                      View on Map
                    </Button>
                  )}
                </Stack>
              </Box>
            </>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
};

export default LocationTracker;