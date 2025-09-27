import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Typography, Box } from '@mui/material';
import Layout from './Layout';

const RoleRoute = ({ children, allowedRoles, redirectTo = '/' }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return null; // or loading spinner
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!allowedRoles.includes(user.role)) {
    return (
      <Layout>
        <Box sx={{ textAlign: 'center', mt: 4 }}>
          <Typography variant="h4" gutterBottom color="error">
            Access Denied
          </Typography>
          <Typography variant="body1" color="textSecondary">
            You don't have permission to access this page.
          </Typography>
          <Typography variant="body2" sx={{ mt: 2 }}>
            Your role: <strong>{user.role}</strong>
          </Typography>
          <Typography variant="body2">
            Required roles: <strong>{allowedRoles.join(', ')}</strong>
          </Typography>
        </Box>
      </Layout>
    );
  }

  return children;
};

export default RoleRoute;
