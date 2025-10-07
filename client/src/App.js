import React, { useEffect } from 'react';
import logger from './utils/logger';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import { CssBaseline, Box } from '@mui/material';
import { Toaster } from 'react-hot-toast';

import theme from './theme';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './contexts/SocketContext';
import Login from './pages/Login';
import AdminDashboard from './pages/AdminDashboard';
import EmployeeDashboard from './pages/EmployeeDashboard';
import Orders from './pages/Orders';
import Menu from './pages/Menu';
import Reports from './pages/Reports';
import Users from './pages/Users';
import Profile from './pages/Profile';
import Operations from './pages/Operations';
import Deliveries from './pages/Deliveries';
import OnlineOrder from './pages/OnlineOrder';
import OrderTrack from './pages/OrderTrack';
import { useParams } from 'react-router-dom';
import LoadingSpinner from './components/LoadingSpinner';
import AdminSetup from './components/AdminSetup';

const OrderTrackWrapper = () => {
  const { id } = useParams();
  return <OrderTrack orderId={id} />;
};

const AppContent = () => {
  const { loading, isAuthenticated, user } = useAuth();

  // Only log on important state changes, not every render
  useEffect(() => {
    if (!loading) {
      logger.debug && logger.debug('Auth state resolved - Authenticated:', isAuthenticated, 'User:', user?.email);
    }
  }, [loading, isAuthenticated, user?.email]);

  if (loading) {
    return <LoadingSpinner message="Verifying session..." fullscreen />;
  }


  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <Routes>
        <Route 
          path="/setup" 
          element={<AdminSetup />} 
        />
        
        <Route 
          path="/login" 
          element={!isAuthenticated ? <Login /> : <Navigate to="/dashboard" replace />} 
        />
        
        <Route 
          path="/dashboard" 
          element={
            isAuthenticated ? (
              (user?.role === 'admin' || user?.role === 'manager') ? <AdminDashboard /> : <EmployeeDashboard />
            ) : (
              <Navigate to="/login" replace />
            )
          } 
        />
        
        <Route 
          path="/orders" 
          element={
            isAuthenticated ? <Orders /> : <Navigate to="/login" replace />
          } 
        />
        
        <Route 
          path="/menu" 
          element={
            isAuthenticated ? <Menu /> : <Navigate to="/login" replace />
          } 
        />
        
        <Route 
          path="/deliveries" 
          element={
            isAuthenticated && (user?.role === 'admin' || user?.role === 'manager' || user?.role === 'delivery') ? 
            <Deliveries /> : <Navigate to="/login" replace />
          } 
        />
        
        <Route 
          path="/reports" 
          element={
            isAuthenticated && (user?.role === 'admin' || user?.role === 'manager') ? 
            <Reports /> : <Navigate to="/login" replace />
          } 
        />
        
        <Route 
          path="/users" 
          element={
            isAuthenticated && user?.role === 'admin' ? 
            <Users /> : <Navigate to="/login" replace />
          } 
        />

        <Route
          path="/operations"
          element={
            !isAuthenticated ? <Navigate to="/login" replace /> : (user?.role === 'admin' ? <Operations /> : <Navigate to="/dashboard" replace />)
          }
        />


        
        <Route 
          path="/profile" 
          element={
            isAuthenticated ? <Profile /> : <Navigate to="/login" replace />
          } 
        />
        
        <Route 
          path="/" 
          element={<Navigate to="/onlineorders" replace />} 
        />
        
        <Route path="*" element={<Navigate to="/onlineorders" replace />} />
      </Routes>
    </Box>
  );
};

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Router>
        {/* Full-viewport background video (muted, loop) */}
        <video
          // Using a safe short filename for the background video.
          src="/videos/pvid2.mp4"
          muted
          autoPlay
          loop
          playsInline
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            minWidth: '100%',
            minHeight: '100%',
            objectFit: 'cover',
            zIndex: -999,
            pointerEvents: 'none',
            opacity: 0.6,
            filter: 'brightness(0.95)',
            transform: 'translateZ(0)'
          }}
        />
        
        <Routes>
          {/* Public routes - no auth required */}
          <Route path="/onlineorders" element={<OnlineOrder />} />
          <Route path="/order/:id" element={<OrderTrackWrapper />} />
          
          {/* Protected routes - wrapped in AuthProvider */}
          <Route path="/*" element={
            <AuthProvider>
              <SocketProvider>
                <AppContent />
              </SocketProvider>
            </AuthProvider>
          } />
        </Routes>
        
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: '#333',
              color: '#fff',
              fontSize: '14px',
              borderRadius: '8px',
              padding: '12px 16px',
            },
            success: {
              duration: 3000,
              iconTheme: {
                primary: '#4caf50',
                secondary: '#fff',
              },
            },
            error: {
              duration: 5000,
              iconTheme: {
                primary: '#f44336',
                secondary: '#fff',
              },
            },
          }}
        />
      </Router>
    </ThemeProvider>
  );
}

export default App;
