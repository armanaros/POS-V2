import React, { useState } from 'react';
import {
  Container,
  Paper,
  TextField,
  Button,
  Typography,
  Box,
  Alert,
  InputAdornment,
  IconButton,
  useTheme,
  Fade,
  Slide,
} from '@mui/material';
import { Visibility, VisibilityOff } from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';

const Login = () => {
  const [credentials, setCredentials] = useState({
    username: '',
    password: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const theme = useTheme();

  const { login } = useAuth();

  const handleChange = (e) => {
    setCredentials({
      ...credentials,
      [e.target.name]: e.target.value,
    });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!credentials.username || !credentials.password) {
      setError('Please enter both username and password');
      return;
    }

    setLoading(true);
    const result = await login(credentials);
    
    if (!result.success) {
      setError(result.error);
    }
    setLoading(false);
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 2,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Background decoration */}
      <Box
        sx={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cg fill-opacity='0.05'%3E%3Cpolygon fill='%23FFD700' points='50 0 60 40 100 50 60 60 50 100 40 60 0 50 40 40'/%3E%3C/g%3E%3C/svg%3E")`,
          backgroundSize: '100px 100px',
        }}
      />
      
  <Container component="main" maxWidth="sm" sx={{ display: 'flex', justifyContent: 'center' }}>
        <Fade in={true} timeout={1000}>
          <Paper
            elevation={24}
            sx={{
              padding: 5,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              borderRadius: 4,
              backgroundColor: '#f5f5f5',
              border: '2px solid #FFD700',
              boxShadow: '0 25px 60px rgba(255, 215, 0, 0.3)',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {/* Subtle background animation */}
            <Box
              sx={{
                position: 'absolute',
                top: -50,
                right: -50,
                width: 100,
                height: 100,
                background: 'linear-gradient(45deg, #FFD70020, #DC143C20)',
                borderRadius: '50%',
                animation: 'float 6s ease-in-out infinite',
                '@keyframes float': {
                  '0%, 100%': { transform: 'translateY(0px) rotate(0deg)' },
                  '50%': { transform: 'translateY(-20px) rotate(180deg)' },
                },
              }}
            />
            
            {/* Logo Section */}
            <Box sx={{ mb: 4, textAlign: 'center' }}>
              <Slide direction="down" in={true} timeout={800}>
                <Box>
                  <Paper
                    elevation={6}
                    sx={{
                      width: 140,
                      display: 'inline-block',
                      p: 1,
                      borderRadius: 2,
                      backgroundColor: '#ffffff',
                      position: 'relative',
                      boxShadow: '0 8px 20px rgba(0,0,0,0.12)',
                    }}
                  >
                    {/* est. badge removed per request */}

                    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', p: 1 }}>
                      <img
                        src="/images/ptown-logo.png"
                        alt="P-TOWN Logo"
                        onError={(e) => { e.target.onerror = null; e.target.src = '/images/ptown-logo.svg'; }}
                        style={{
                          width: '100px',
                          height: 'auto',
                          display: 'block',
                          objectFit: 'contain',
                        }}
                      />
                    </Box>
                  </Paper>
                </Box>
              </Slide>
              
              {/* Brand text removed; logo will be used instead */}
            </Box>

            {/* Welcome Section */}
            <Fade in={true} timeout={1200}>
              <Box sx={{ textAlign: 'center', mb: 4 }}>
                <Typography
                  variant="h5"
                  sx={{
                    fontWeight: 600,
                    color: '#1a1a1a',
                    mb: 1,
                  }}
                >
                  Welcome Back
                </Typography>
                <Typography
                  variant="body1"
                  sx={{
                    color: '#666666',
                    fontSize: '1rem',
                  }}
                >
                  Sign in to access your dashboard
                </Typography>
              </Box>
            </Fade>
            {error && (
              <Slide direction="down" in={!!error} timeout={300}>
                <Alert 
                  severity="error" 
                  sx={{ 
                    mb: 3,
                    borderRadius: 2,
                    '& .MuiAlert-message': {
                      fontSize: '0.95rem'
                    }
                  }}
                >
                  {error}
                </Alert>
              </Slide>
            )}

            {/* Login Form */}
            <Fade in={true} timeout={1400}>
              <Box component="form" onSubmit={handleSubmit} sx={{ width: '100%', maxWidth: 400 }}>
                <TextField
                  margin="normal"
                  required
                  fullWidth
                  id="username"
                  label="Username"
                  name="username"
                  type="text"
                  autoComplete="username"
                  autoFocus
                  value={credentials.username}
                  onChange={handleChange}
                  disabled={loading}
                  sx={{
                    mb: 2,
                    '& .MuiOutlinedInput-root': {
                      borderRadius: 3,
                      backgroundColor: 'rgba(255, 215, 0, 0.04)',
                      border: '2px solid transparent',
                      transition: 'all 0.3s ease',
                      '&:hover': {
                        backgroundColor: 'rgba(255, 215, 0, 0.08)',
                        borderColor: 'rgba(255, 215, 0, 0.3)',
                      },
                      '&.Mui-focused': {
                        backgroundColor: 'rgba(255, 215, 0, 0.08)',
                        borderColor: '#FFD700',
                        boxShadow: '0 0 0 3px rgba(255, 215, 0, 0.1)',
                      },
                    },
                    '& .MuiInputLabel-root': {
                      color: '#666666',
                      fontWeight: 500,
                    },
                  }}
                />
                <TextField
                  margin="normal"
                  required
                  fullWidth
                  name="password"
                  label="Password"
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  autoComplete="current-password"
                  value={credentials.password}
                  onChange={handleChange}
                  disabled={loading}
                  sx={{
                    mb: 4,
                    '& .MuiOutlinedInput-root': {
                      borderRadius: 3,
                      backgroundColor: 'rgba(255, 215, 0, 0.04)',
                      border: '2px solid transparent',
                      transition: 'all 0.3s ease',
                      '&:hover': {
                        backgroundColor: 'rgba(255, 215, 0, 0.08)',
                        borderColor: 'rgba(255, 215, 0, 0.3)',
                      },
                      '&.Mui-focused': {
                        backgroundColor: 'rgba(255, 215, 0, 0.08)',
                        borderColor: '#FFD700',
                        boxShadow: '0 0 0 3px rgba(255, 215, 0, 0.1)',
                      },
                    },
                    '& .MuiInputLabel-root': {
                      color: '#666666',
                      fontWeight: 500,
                    },
                  }}
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          aria-label="toggle password visibility"
                          onClick={() => setShowPassword(!showPassword)}
                          edge="end"
                          sx={{
                            color: '#666666',
                            '&:hover': {
                              color: '#FFD700',
                            },
                          }}
                        >
                          {showPassword ? <VisibilityOff /> : <Visibility />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                />
                
                <Button
                  type="submit"
                  fullWidth
                  variant="contained"
                  disabled={loading}
                  sx={{
                    py: 2,
                    fontSize: '1.1rem',
                    fontWeight: 600,
                    borderRadius: 3,
                    textTransform: 'none',
                    background: 'linear-gradient(135deg, #1a1a1a 0%, #FFD700 50%, #DC143C 100%)',
                    boxShadow: '0 8px 32px rgba(255, 215, 0, 0.4)',
                    border: 'none',
                    position: 'relative',
                    overflow: 'hidden',
                    '&:hover': {
                      background: 'linear-gradient(135deg, #000000 0%, #DAA520 50%, #B22222 100%)',
                      boxShadow: '0 12px 40px rgba(255, 215, 0, 0.6)',
                      transform: 'translateY(-2px)',
                    },
                    '&:active': {
                      transform: 'translateY(0px)',
                    },
                    '&:disabled': {
                      background: '#808080',
                      color: '#ffffff',
                      boxShadow: 'none',
                    },
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    '&::before': {
                      content: '""',
                      position: 'absolute',
                      top: 0,
                      left: '-100%',
                      width: '100%',
                      height: '100%',
                      background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)',
                      transition: 'left 0.5s',
                    },
                    '&:hover::before': {
                      left: '100%',
                    },
                  }}
                >
                  {loading ? (
                    <>
                      Sign In
                    </>
                  ) : (
                    'Sign In'
                  )}
                </Button>
                {loading && <LoadingSpinner message="Signing in..." fullscreen />}
              </Box>
            </Fade>
          </Paper>
        </Fade>
      </Container>
    </Box>
  );
};

export default Login;
