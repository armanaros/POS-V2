import React, { useEffect, useState } from 'react';
import { 
  Box, 
  Typography, 
  Card, 
  CardContent, 
  Chip, 
  Button, 
  Stack, 
  TextField,
  Stepper,
  Step,
  StepLabel,
  StepConnector,
  stepConnectorClasses,
  Fade,
  Slide,
  Zoom,
  keyframes,
  alpha
} from '@mui/material';
import { styled } from '@mui/material/styles';
import LoadingSpinner from '../components/LoadingSpinner';
import { OrderService } from '../services/firebaseServices';
import toast from 'react-hot-toast';
import { 
  LocalShipping as DeliveryIcon, 
  ContentCopy as CopyIcon,
  Restaurant as RestaurantIcon,
  Schedule as ScheduleIcon,
  CheckCircle as CheckIcon,
  Cancel as CancelIcon,
  Kitchen as KitchenIcon
} from '@mui/icons-material';

// Animation keyframes
const pulse = keyframes`
  0% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.05);
    opacity: 0.8;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
`;

const bounce = keyframes`
  0%, 20%, 50%, 80%, 100% {
    transform: translateY(0);
  }
  40% {
    transform: translateY(-10px);
  }
  60% {
    transform: translateY(-5px);
  }
`;

const slideInUp = keyframes`
  from {
    transform: translateY(30px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
`;

// Custom Stepper Connector
const CustomConnector = styled(StepConnector)(({ theme }) => ({
  [`&.${stepConnectorClasses.alternativeLabel}`]: {
    top: 22,
  },
  [`&.${stepConnectorClasses.active}`]: {
    [`& .${stepConnectorClasses.line}`]: {
      background: 'linear-gradient(95deg, #667eea 0%, #764ba2 100%)',
      animation: `${pulse} 2s ease-in-out infinite`,
    },
  },
  [`&.${stepConnectorClasses.completed}`]: {
    [`& .${stepConnectorClasses.line}`]: {
      background: 'linear-gradient(95deg, #4caf50 0%, #45a049 100%)',
    },
  },
  [`& .${stepConnectorClasses.line}`]: {
    height: 3,
    border: 0,
    backgroundColor: '#eaeaf0',
    borderRadius: 1,
  },
}));

// Custom Step Icon
const CustomStepIcon = styled('div')(({ theme, ownerState }) => ({
  backgroundColor: '#eaeaf0',
  zIndex: 1,
  color: '#fff',
  width: 50,
  height: 50,
  display: 'flex',
  borderRadius: '50%',
  justifyContent: 'center',
  alignItems: 'center',
  transition: 'all 0.3s ease',
  ...(ownerState.active && {
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    boxShadow: '0 4px 10px 0 rgba(0,0,0,.25)',
    animation: `${bounce} 2s infinite`,
  }),
  ...(ownerState.completed && {
    background: 'linear-gradient(135deg, #4caf50 0%, #45a049 100%)',
    boxShadow: '0 4px 10px 0 rgba(76, 175, 80, 0.3)',
  }),
  ...(ownerState.error && {
    background: 'linear-gradient(135deg, #f44336 0%, #d32f2f 100%)',
    boxShadow: '0 4px 10px 0 rgba(244, 67, 54, 0.3)',
  }),
}));

const statusColor = (s) => {
  if (!s) return 'default';
  switch (s) {
    case 'pending': return 'warning';
    case 'preparing': return 'info';
    case 'ready': return 'success';
    case 'served': return 'secondary';
    case 'out_for_delivery': return 'primary';
    case 'delivered': return 'success';
    case 'completed': return 'success';
    case 'cancelled': return 'error';
    default: return 'default';
  }
};

const getStatusIcon = (status) => {
  switch (status) {
    case 'pending':
      return <ScheduleIcon />;
    case 'preparing':
      return <KitchenIcon />;
    case 'ready':
      return <RestaurantIcon />;
    case 'served':
      return <CheckIcon />;
    case 'out_for_delivery':
      return <DeliveryIcon />;
    case 'completed':
    case 'delivered':
      return <CheckIcon />;
    case 'cancelled':
      return <CancelIcon />;
    default:
      return <ScheduleIcon />;
  }
};

const getOrderSteps = (orderType, isOnline = false) => {
  if (orderType === 'delivery' || isOnline) {
    return ['pending', 'preparing', 'ready', 'out_for_delivery', 'delivered'];
  } else if (orderType === 'takeaway') {
    return ['pending', 'preparing', 'ready', 'completed'];
  } else {
    return ['pending', 'preparing', 'ready', 'served'];
  }
};

const getStepLabel = (step, orderType) => {
  const labels = {
    pending: 'Order Placed',
    preparing: 'Preparing',
    ready: 'Ready',
    served: 'Served',
    out_for_delivery: 'Out for Delivery',
    delivered: 'Delivered',
    completed: 'Completed',
    cancelled: 'Cancelled'
  };
  return labels[step] || step;
};

const OrderTrack = ({ orderId }) => {
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const data = await OrderService.getOrderById(orderId);
        setOrder(data);
      } catch (err) {
        console.error('Failed to load order', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [orderId]);

  if (loading) return <LoadingSpinner message="Loading order..." />;
  if (!order) return <Box sx={{ p: 3 }}><Typography>Order not found</Typography></Box>;

  // Delivery provider links removed per request

  const steps = getOrderSteps(order.orderType || 'dine-in', order.employeeId === 'public');
  const activeStep = steps.indexOf(order.status);
  const isOrderCancelled = order.status === 'cancelled';

  return (
    <Box sx={{ 
      minHeight: '100vh',
      background: 'transparent',
      py: { xs: 2, md: 4 }
    }}>
      <Box sx={{ maxWidth: 900, mx: 'auto', px: { xs: 2, md: 4 } }}>
        {/* Header Card with Animation */}
        <Slide direction="down" in={true} mountOnEnter timeout={600}>
          <Card 
            elevation={8} 
            sx={{ 
              mb: 3,
              borderRadius: 4,
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white',
              animation: `${slideInUp} 0.8s ease-out`,
            }}
          >
            <CardContent sx={{ p: 4 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                <Zoom in={true} timeout={800} style={{ transitionDelay: '400ms' }}>
                  <Box
                    sx={{
                      width: 64,
                      height: 64,
                      borderRadius: '50%',
                      background: 'rgba(255, 255, 255, 0.2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backdropFilter: 'blur(10px)',
                    }}
                  >
                    {getStatusIcon(order.status)}
                  </Box>
                </Zoom>
                <Box>
                  <Typography variant="h4" sx={{ fontWeight: 'bold', mb: 0.5 }}>
                    Order #{order.orderNumber}
                  </Typography>
                  <Typography variant="body1" sx={{ opacity: 0.9 }}>
                    Placed by <strong>{order.customerName || 'Walk-in'}</strong>
                    {order.customerPhone && ` • ${order.customerPhone}`}
                  </Typography>
                </Box>
              </Box>
              
              {/* Current Status Chip */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Typography variant="h6" sx={{ opacity: 0.9 }}>Current Status:</Typography>
                <Chip 
                  label={order.status?.toUpperCase()} 
                  sx={{ 
                    backgroundColor: 'rgba(255, 255, 255, 0.2)',
                    color: 'white',
                    fontWeight: 'bold',
                    fontSize: '0.9rem',
                    animation: order.status === 'preparing' ? `${pulse} 2s infinite` : 'none',
                    backdropFilter: 'blur(10px)',
                  }} 
                />
              </Box>
            </CardContent>
          </Card>
        </Slide>

        {/* Status Progress Stepper */}
        {!isOrderCancelled && (
          <Fade in={true} timeout={1000} style={{ transitionDelay: '600ms' }}>
            <Card elevation={4} sx={{ mb: 3, borderRadius: 3, overflow: 'hidden' }}>
              <CardContent sx={{ p: 4 }}>
                <Typography variant="h6" sx={{ mb: 3, fontWeight: 'bold', color: 'primary.main' }}>
                  Order Progress
                </Typography>
                <Stepper 
                  activeStep={activeStep} 
                  connector={<CustomConnector />}
                  sx={{ 
                    '& .MuiStepLabel-label': { 
                      fontWeight: 'medium',
                      fontSize: '0.875rem',
                    }
                  }}
                >
                  {steps.map((step, index) => (
                    <Step key={step}>
                      <StepLabel
                        StepIconComponent={(props) => (
                          <CustomStepIcon 
                            ownerState={{
                              active: index === activeStep,
                              completed: index < activeStep,
                            }}
                          >
                            {getStatusIcon(step)}
                          </CustomStepIcon>
                        )}
                      >
                        {getStepLabel(step, order.orderType)}
                      </StepLabel>
                    </Step>
                  ))}
                </Stepper>
              </CardContent>
            </Card>
          </Fade>
        )}

        {/* Cancelled Order Alert */}
        {isOrderCancelled && (
          <Fade in={true} timeout={1000}>
            <Card 
              elevation={4} 
              sx={{ 
                mb: 3, 
                borderRadius: 3,
                border: '2px solid #f44336',
                backgroundColor: alpha('#f44336', 0.1)
              }}
            >
              <CardContent sx={{ p: 3, textAlign: 'center' }}>
                <CancelIcon sx={{ fontSize: 48, color: '#f44336', mb: 2 }} />
                <Typography variant="h6" sx={{ color: '#f44336', fontWeight: 'bold' }}>
                  Order Cancelled
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  This order has been cancelled and will not be processed.
                </Typography>
              </CardContent>
            </Card>
          </Fade>
        )}

        {/* Order Details */}
        <Fade in={true} timeout={1000} style={{ transitionDelay: '800ms' }}>
          <Card elevation={4} sx={{ mb: 3, borderRadius: 3 }}>
            <CardContent sx={{ p: 4 }}>
              <Typography variant="h6" sx={{ mb: 3, fontWeight: 'bold', color: 'primary.main' }}>
                Order Details
              </Typography>
              
              {/* Items List */}
              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 'medium' }}>
                  Items Ordered
                </Typography>
                <Stack spacing={1.5}>
                  {(order.items || []).map((item, index) => (
                    <Fade 
                      key={item.menuItemId || item.id || index}
                      in={true} 
                      timeout={600} 
                      style={{ transitionDelay: `${900 + (index * 100)}ms` }}
                    >
                      <Card 
                        variant="outlined" 
                        sx={{ 
                          p: 2, 
                          backgroundColor: '#f8f9fa',
                          borderRadius: 2,
                          '&:hover': {
                            transform: 'translateY(-2px)',
                            transition: 'transform 0.3s ease',
                            boxShadow: 4,
                          }
                        }}
                      >
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Box>
                            <Typography variant="body1" sx={{ fontWeight: 'medium' }}>
                              {item.name}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              Quantity: {item.quantity}
                            </Typography>
                          </Box>
                          <Typography variant="h6" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                            ₱{((item.totalPrice || item.price * item.quantity) || 0).toFixed(2)}
                          </Typography>
                        </Box>
                      </Card>
                    </Fade>
                  ))}
                </Stack>
              </Box>

              {/* Order Summary */}
              <Box sx={{ 
                p: 3, 
                backgroundColor: alpha('#667eea', 0.1), 
                borderRadius: 2,
                border: '1px solid',
                borderColor: alpha('#667eea', 0.2)
              }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
                    Total Amount
                  </Typography>
                  <Typography variant="h5" sx={{ fontWeight: 'bold', color: 'success.main' }}>
                    ₱{(order.total || 0).toFixed(2)}
                  </Typography>
                </Box>
                
                {order.createdAt && (
                  <Typography variant="body2" color="text.secondary">
                    <strong>Order placed:</strong> {order.createdAt?.toDate?.()?.toLocaleString?.() || new Date(order.createdAt).toLocaleString()}
                  </Typography>
                )}
              </Box>
            </CardContent>
          </Card>
        </Fade>

        {/* Delivery Tracking Section */}
        {order.status === 'out_for_delivery' && (
          <Fade in={true} timeout={1000} style={{ transitionDelay: '1100ms' }}>
            <Card 
              elevation={4} 
              sx={{ 
                mb: 3, 
                borderRadius: 3,
                background: order.deliveryUrl ? 
                  'linear-gradient(135deg, #9c27b0 0%, #7b1fa2 100%)' : 
                  'linear-gradient(135deg, #ff9800 0%, #f57c00 100%)',
                color: 'white'
              }}
            >
              <CardContent sx={{ p: 4 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
                  <Box
                    sx={{
                      width: 48,
                      height: 48,
                      borderRadius: '50%',
                      background: 'rgba(255, 255, 255, 0.2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backdropFilter: 'blur(10px)',
                    }}
                  >
                    <DeliveryIcon />
                  </Box>
                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 'bold', mb: 0.5 }}>
                      🚚 Your Order is Out for Delivery!
                    </Typography>
                    <Typography variant="body1" sx={{ opacity: 0.9 }}>
                      {order.deliveryUrl ? 'Track your delivery in real-time' : 'Your order is on its way'}
                    </Typography>
                  </Box>
                </Box>
                
                {order.deliveryUrl ? (
                  <>
                    <Typography variant="body2" sx={{ mb: 2, opacity: 0.9 }}>
                      Click the button below to track your delivery:
                    </Typography>
                    
                    <Button
                      fullWidth
                      variant="contained"
                      href={order.deliveryUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      startIcon={<DeliveryIcon />}
                      sx={{
                        backgroundColor: 'rgba(255, 255, 255, 0.2)',
                        color: 'white',
                        borderRadius: 2,
                        py: 1.5,
                        fontWeight: 'bold',
                        backdropFilter: 'blur(10px)',
                        '&:hover': {
                          backgroundColor: 'rgba(255, 255, 255, 0.3)',
                          transform: 'translateY(-2px)',
                        },
                        transition: 'all 0.3s ease',
                      }}
                    >
                      Track Your Delivery
                    </Button>
                    
                    <Box sx={{ 
                      mt: 3, 
                      p: 2, 
                      backgroundColor: 'rgba(255, 255, 255, 0.1)', 
                      borderRadius: 2,
                      backdropFilter: 'blur(5px)'
                    }}>
                      <Typography variant="body2" sx={{ opacity: 0.9, textAlign: 'center' }}>
                        💡 Tip: Bookmark the tracking page to get live updates about your delivery
                      </Typography>
                    </Box>
                  </>
                ) : (
                  <>
                    <Typography variant="body2" sx={{ mb: 2, opacity: 0.9 }}>
                      Your order has been dispatched and is on its way to you!
                    </Typography>
                    
                    <Box sx={{ 
                      p: 3, 
                      backgroundColor: 'rgba(255, 255, 255, 0.1)', 
                      borderRadius: 2,
                      backdropFilter: 'blur(5px)',
                      textAlign: 'center'
                    }}>
                      <Typography variant="body1" sx={{ fontWeight: 'medium', mb: 1 }}>
                        📱 Estimated Delivery Time
                      </Typography>
                      <Typography variant="body2" sx={{ opacity: 0.9 }}>
                        Your order should arrive within 30-45 minutes.
                        We'll call you when the delivery driver is nearby.
                      </Typography>
                      {order.customerPhone && (
                        <Typography variant="body2" sx={{ opacity: 0.8, mt: 1 }}>
                          📞 Contact: {order.customerPhone}
                        </Typography>
                      )}
                    </Box>
                  </>
                )}
              </CardContent>
            </Card>
          </Fade>
        )}

        {/* Share Order Link */}
        <Fade in={true} timeout={1000} style={{ transitionDelay: '1200ms' }}>
          <Card elevation={4} sx={{ borderRadius: 3 }}>
            <CardContent sx={{ p: 4 }}>
              <Typography variant="h6" sx={{ mb: 2, fontWeight: 'bold', color: 'primary.main' }}>
                Share Order
              </Typography>
              <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>
                Share this link to track your order status:
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <TextField 
                  value={window.location.href} 
                  size="small" 
                  fullWidth 
                  InputProps={{ 
                    readOnly: true,
                    sx: { backgroundColor: '#f8f9fa' }
                  }}
                  sx={{ 
                    '& .MuiOutlinedInput-root': {
                      borderRadius: 2,
                    }
                  }}
                />
                <Button 
                  variant="contained" 
                  onClick={async () => { 
                    await navigator.clipboard.writeText(window.location.href); 
                    toast.success('Link copied to clipboard!'); 
                  }} 
                  startIcon={<CopyIcon />}
                  sx={{
                    borderRadius: 2,
                    px: 3,
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    '&:hover': {
                      background: 'linear-gradient(135deg, #5a6fd8 0%, #6a4190 100%)',
                      transform: 'translateY(-2px)',
                    },
                    transition: 'all 0.3s ease',
                  }}
                >
                  Copy
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Fade>
      </Box>
    </Box>
  );
};

export default OrderTrack;
