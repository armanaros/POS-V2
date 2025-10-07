import React, { useRef, useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Divider,
  Stack,
  IconButton,
  useTheme,
  useMediaQuery,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  Paper,
  Slide,
  TextField,
  Alert,
  InputAdornment,
  Chip
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { CloudUpload } from '@mui/icons-material';

const Transition = React.forwardRef(function Transition(props, ref) {
  return <Slide direction="up" ref={ref} {...props} />;
});

const CheckoutModal = ({
  open,
  onClose,
  cart = [],
  subtotal = 0,
  customerName,
  customerPhone,
  deliveryAddress,
  onConfirm,
  isSubmitting,
  // setters from parent
  setCustomerName,
  setCustomerPhone,
  setDeliveryAddress,
  couponCode,
  setCouponCode,
  appliedCoupon,
  setAppliedCoupon,
  couponError,
  setCouponError,
  AVAILABLE_COUPONS,
  fetchedCoupons = [],
  discount = 0,
  total = 0,
  // Payment method and receipt props
  paymentMethod,
  setPaymentMethod,
  paymentReceipt,
  setPaymentReceipt
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  // compute values (subtotal provided by parent, discount and total expected to be provided)
  const displaySubtotal = subtotal || 0;
  // coupon apply: validate server-side if needed
  const handleApplyCoupon = async () => {
    const code = (couponCode || '').toString().trim();
    if (!code) {
      setCouponError && setCouponError('Please enter a coupon code');
      return;
    }

    const upper = code.toUpperCase();
    // First try local caches
    let found = Array.isArray(fetchedCoupons) ? fetchedCoupons.find(c => (c.code || '').toUpperCase() === upper) : null;
    if (!found && AVAILABLE_COUPONS) {
      const ac = AVAILABLE_COUPONS[upper];
      if (ac) found = { code: upper, ...ac };
    }

    // If not found locally, ask the server to validate
    if (!found) {
      try {
        const resp = await fetch('/api/coupons/validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: upper })
        });
        const data = await resp.json();
        if (resp.ok && data && data.valid) {
          found = data.coupon;
        } else {
          setAppliedCoupon && setAppliedCoupon(null);
          const msg = (data && data.message) ? data.message : 'Invalid coupon code';
          setCouponError && setCouponError(msg);
          return;
        }
      } catch (e) {
        console.error('Coupon validation request failed', e);
        setCouponError && setCouponError('Coupon validation failed');
        return;
      }
    }

    // Apply coupon
    if (found) {
      setAppliedCoupon && setAppliedCoupon(found);
      setCouponError && setCouponError('');
      toast && toast.success && toast.success('Coupon applied');
    }
  };

  // compute discount locally if not provided
  const computeDiscountLocal = (couponObj, base) => {
    if (!couponObj || !base) return 0;
    const { type, value } = couponObj;
    if (!type || !value) return 0;
    if (type === 'percent') return Math.round((base * (value / 100)) * 100) / 100;
    if (type === 'fixed') return Math.min(base, Number(value));
    return 0;
  };

  const computedDiscount = (typeof discount === 'number' && discount > 0) ? discount : computeDiscountLocal(appliedCoupon, subtotal);
  const computedTotal = Math.max(0, (subtotal || 0) - computedDiscount);

  // final values shown in the UI: prefer parent-provided discount/total, otherwise use computed ones
  const displayDiscount = (typeof discount === 'number' && discount > 0) ? discount : computedDiscount;
  const displayTotal = (typeof total === 'number' && total > 0) ? total : computedTotal;

  // Refs for fields to enable auto-scroll/focus
  const nameRef = useRef(null);
  const phoneRef = useRef(null);
  const addressRef = useRef(null);

  const [validationError, setValidationError] = useState('');

  useEffect(() => {
    if (!open) {
      setValidationError('');
    }
  }, [open]);



  const handleReceiptUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      // Validate file type
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
      if (!allowedTypes.includes(file.type)) {
        toast.error('Please upload an image file (JPG, PNG, WebP) or PDF');
        return;
      }
      
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast.error('File size must be less than 5MB');
        return;
      }
      
      setPaymentReceipt && setPaymentReceipt(file);
      toast.success('Payment receipt uploaded successfully');
    }
  };
  const validatePhone = (p) => {
    if (!p) return false;
    try {
      const cleanPhone = String(p).trim();
      
      // Try parsing with Philippines country code first
      let pn = parsePhoneNumberFromString(cleanPhone, 'PH');
      if (pn && pn.isValid()) return true;
      
      // Try parsing as international format
      pn = parsePhoneNumberFromString(cleanPhone);
      if (pn && pn.isValid()) return true;
      
      // Fallback: Philippine mobile number patterns
      const digits = cleanPhone.replace(/[^0-9]/g, '');
      
      // Accept these patterns:
      // 09XXXXXXXXX (11 digits, starts with 09)
      // 639XXXXXXXXX (12 digits, starts with 639)  
      // +639XXXXXXXXX (12 digits with +, starts with +639)
      if (digits.length === 11 && digits.startsWith('09')) return true;
      if (digits.length === 12 && digits.startsWith('639')) return true;
      if (digits.length >= 10 && digits.length <= 12) return true; // General fallback
      
      return false;
    } catch (e) {
      // Final fallback: basic digit count
      const digits = (p || '').replace(/[^0-9]/g, '');
      return digits.length >= 10 && digits.length <= 13;
    }
  };

  const focusAndScroll = (ref) => {
    try {
      if (ref && ref.current) {
        ref.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (typeof ref.current.focus === 'function') ref.current.focus();
      }
    } catch (e) {}
  };

  const handlePlace = async () => {
    // validate required fields: name and phone
    if (!customerName || String(customerName).trim() === '') {
      setValidationError('Please enter your name');
      focusAndScroll(nameRef);
      return;
    }
    if (!customerPhone || !validatePhone(customerPhone)) {
      setValidationError('Please enter a valid phone number');
      focusAndScroll(phoneRef);
      return;
    }

    // Validate payment method (required for all orders)
    if (!paymentMethod) {
      setValidationError('Please select a payment method');
      return;
    }

    // Validate payment receipt (required for all online orders)
    if (!paymentReceipt) {
      setValidationError('Please upload your payment receipt/proof');
      return;
    }

    // clear validation error and call parent onConfirm
    setValidationError('');
    if (onConfirm) await onConfirm();
  };

  return (
    <Dialog
      open={!!open}
      onClose={onClose}
      fullWidth
      maxWidth="xs"
      fullScreen={isMobile}
      TransitionComponent={Transition}
      PaperProps={{ sx: { borderRadius: isMobile ? 1 : 2, overflow: 'hidden' } }}
      BackdropProps={{ sx: { backdropFilter: 'blur(2px)' } }}
    >
      <DialogTitle sx={{ fontSize: '1rem', py: 1 }}>
        <Box sx={{ position: 'relative' }}>
          <Box component="span">Review your order</Box>
          <IconButton onClick={onClose} size="small" aria-label="close" sx={{ position: 'absolute', right: 8, top: 8, color: 'text.secondary' }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
      </DialogTitle>
      <DialogContent dividers sx={{ p: 2 }}>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>Items</Typography>

        {cart.length === 0 ? (
          <Typography variant="body2" color="text.secondary">Your cart is empty</Typography>
        ) : (
          <TableContainer component={Paper} variant="outlined" sx={{ boxShadow: 'none', mb: 1, maxHeight: isMobile ? 220 : 300, overflow: 'auto', borderRadius: 2 }}>
            <Table size="small" stickyHeader={false}>
              <TableBody>
                {cart.map((it, idx) => {
                  const lineTotal = ((it.price || 0) * (it.quantity || 0));
                  const isLast = idx === cart.length - 1;
                  return (
                    <TableRow key={it.id} sx={{ '&:last-child td': { borderBottom: 'none' } }}>
                      <TableCell sx={{ borderBottom: isLast ? 'none' : '1px solid #f3f4f6', py: 0.6, pr: 1, minWidth: 0 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{it.name}</Typography>
                        {it.notes && <Typography variant="caption" color="text.secondary">{it.notes}</Typography>}
                      </TableCell>
                      <TableCell align="center" sx={{ borderBottom: isLast ? 'none' : '1px solid #f3f4f6', py: 0.6, width: 56, px: 0.5 }}>
                        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>x{it.quantity}</Typography>
                      </TableCell>
                      <TableCell align="right" sx={{ borderBottom: isLast ? 'none' : '1px solid #f3f4f6', py: 0.6, width: 92, pl: 1 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>₱{lineTotal.toFixed(2)}</Typography>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        <Divider sx={{ my: 1 }} />

        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Name"
            size="small"
            inputRef={nameRef}
            value={customerName || ''}
            onChange={(e) => setCustomerName && setCustomerName(e.target.value)}
            fullWidth
          />
          <TextField
            label="Phone"
            size="small"
            inputRef={phoneRef}
            value={customerPhone || ''}
            onChange={(e) => setCustomerPhone && setCustomerPhone(e.target.value)}
            error={!!validationError && validationError.toLowerCase().includes('phone')}
            helperText={!!validationError && validationError.toLowerCase().includes('phone') ? validationError : 'e.g., 09171234567 or +639171234567'}
            placeholder="09171234567 or +639171234567"
            fullWidth
          />
          <TextField
            label="Delivery address (leave empty for Takeaway)"
            size="small"
            inputRef={addressRef}
            value={deliveryAddress || ''}
            onChange={(e) => setDeliveryAddress && setDeliveryAddress(e.target.value)}
            fullWidth
            multiline
            minRows={2}
          />

          {/* Coupon input */}
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <TextField
              label="Coupon code"
              size="small"
              value={couponCode || ''}
              onChange={(e) => setCouponCode && setCouponCode(e.target.value)}
              fullWidth
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <Button size="small" onClick={handleApplyCoupon}>Apply</Button>
                  </InputAdornment>
                )
              }}
            />
          </Box>

          {couponError && <Alert severity="error">{couponError}</Alert>}
          {appliedCoupon && (
            <Alert severity="success">Applied: {appliedCoupon.code} — {appliedCoupon.description || (appliedCoupon.type === 'percent' ? `${appliedCoupon.value}% off` : `₱${appliedCoupon.value} off`)}</Alert>
          )}

          {/* Payment Method Selection */}
          <Box sx={{ mt: 1, p: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1, bgcolor: 'background.paper' }}>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>Choose payment method</Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Button size="small" variant={paymentMethod === 'gcash' ? 'contained' : 'outlined'} onClick={() => setPaymentMethod && setPaymentMethod('gcash')}>GCash</Button>
              <Button size="small" variant={paymentMethod === 'paymaya' ? 'contained' : 'outlined'} onClick={() => setPaymentMethod && setPaymentMethod('paymaya')}>PayMaya</Button>
              <Button size="small" variant={paymentMethod === 'bank_transfer' ? 'contained' : 'outlined'} onClick={() => setPaymentMethod && setPaymentMethod('bank_transfer')}>Bank Transfer</Button>
            </Box>

            {/* Visible selected method indicator for clarity */}
            {paymentMethod && (
              <Typography variant="caption" sx={{ mt: 0.5, color: 'text.secondary' }}>Selected: {String(paymentMethod).replace('_', ' ').toUpperCase()}</Typography>
            )}
          </Box>

          {/* Payment QR Code Display */}
          {paymentMethod && (
            <Box sx={{ mt: 1, mb: 2 }}>
              {paymentMethod === 'gcash' && (
                <Box sx={{ textAlign: 'center', p: 2, bgcolor: '#1565c0', borderRadius: 2, color: 'white' }}>
                  <Typography variant="h6" sx={{ mb: 2, fontWeight: 'bold' }}>
                    📱 Scan to Pay with GCash
                  </Typography>
                  <Box 
                    sx={{ 
                      bgcolor: 'white', 
                      borderRadius: 2, 
                      p: 2, 
                      mx: 'auto', 
                      maxWidth: 300,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center'
                    }}
                  >
                    <Box
                      component="img"
                      src="/gcash-qr.jpg"
                      alt="GCash QR Code - P-Town Restaurant"
                      sx={{ 
                        width: 240, 
                        height: 'auto',
                        maxHeight: 350,
                        borderRadius: 3, 
                        mb: 1,
                        objectFit: 'contain',
                        border: '1px solid #ddd'
                      }}
                      onError={(e) => {
                        // Fallback if image fails to load
                        console.log('Failed to load GCash QR image');
                        e.target.style.display = 'none';
                        e.target.nextElementSibling.style.display = 'flex';
                      }}
                    />
                    {/* Fallback display if image fails to load */}
                    <Box
                      sx={{ 
                        width: 240, 
                        height: 300, 
                        borderRadius: 3, 
                        mb: 1,
                        bgcolor: 'white',
                        border: '1px solid #ddd',
                        display: 'none',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        p: 2
                      }}
                    >
                      <Typography sx={{ fontSize: '48px', mb: 2 }}>📱</Typography>
                      <Typography variant="h6" sx={{ fontWeight: 'bold', color: '#1565c0', mb: 1 }}>
                        P-Town Restaurant
                      </Typography>
                      <Typography variant="body2" sx={{ color: '#666', textAlign: 'center' }}>
                        GCash QR Code<br/>
                        Image not found
                      </Typography>
                    </Box>
                    {/* Fallback QR placeholder if image fails */}
                    <Box
                      sx={{ 
                        width: 200, 
                        height: 200, 
                        borderRadius: 1, 
                        mb: 1,
                        bgcolor: '#f5f5f5',
                        display: 'none',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: '1px solid #ddd',
                        flexDirection: 'column'
                      }}
                    >
                      <Typography variant="h6" sx={{ mb: 1 }}>📱</Typography>
                      <Typography variant="caption" sx={{ textAlign: 'center', color: '#666' }}>
                        GCash QR Code<br/>
                        P-Town Restaurant
                      </Typography>
                    </Box>
                    <Typography variant="body2" sx={{ color: '#666', textAlign: 'center', mb: 1 }}>
                      P-Town Restaurant
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#999' }}>
                      Transfer fees may apply
                    </Typography>
                  </Box>
                  <Typography variant="body2" sx={{ mt: 2, opacity: 0.9 }}>
                    1. Open GCash app and scan the QR code<br/>
                    2. Enter the order amount: ₱{total?.toFixed(2) || '0.00'}<br/>
                    3. Complete the payment<br/>
                    4. Upload your payment receipt below
                  </Typography>
                </Box>
              )}
              
              {paymentMethod === 'paymaya' && (
                <Box sx={{ textAlign: 'center', p: 2, bgcolor: '#00d4aa', borderRadius: 2, color: 'white' }}>
                  <Typography variant="h6" sx={{ mb: 2, fontWeight: 'bold' }}>
                    💳 Scan to Pay with PayMaya
                  </Typography>
                  <Box
                    component="img"
                    src="/paymaya-qr.jpg"
                    alt="PayMaya QR Code - P-Town Restaurant"
                    sx={{ 
                      width: 240, 
                      height: 'auto',
                      maxHeight: 350,
                      borderRadius: 2, 
                      mb: 2,
                      objectFit: 'contain',
                      bgcolor: 'white'
                    }}
                    onError={(e) => {
                      // Fallback if image fails to load
                      console.log('Failed to load PayMaya QR image');
                      e.target.style.display = 'none';
                      e.target.nextElementSibling.style.display = 'block';
                    }}
                  />
                  <Typography 
                    variant="body2" 
                    sx={{ 
                      display: 'none',
                      bgcolor: 'rgba(255,255,255,0.2)', 
                      p: 2, 
                      borderRadius: 1,
                      mb: 2
                    }}
                  >
                    PayMaya QR Code<br/>
                    P-Town Restaurant<br/>
                    Amount: ₱{total?.toFixed(2) || '0.00'}
                  </Typography>
                  <Typography variant="body2" sx={{ opacity: 0.9 }}>
                    1. Open PayMaya app and scan the QR code<br/>
                    2. Enter the order amount: ₱{total?.toFixed(2) || '0.00'}<br/>
                    3. Complete the payment<br/>
                    4. Upload your payment receipt below
                  </Typography>
                </Box>
              )}
              
              {paymentMethod === 'bank_transfer' && (
                <Box sx={{ textAlign: 'center', p: 2, bgcolor: '#6366f1', borderRadius: 2, color: 'white' }}>
                  <Typography variant="h6" sx={{ mb: 2, fontWeight: 'bold' }}>
                    🏦 Scan to Pay via Bank Transfer
                  </Typography>
                  <Box
                    component="img"
                    src="/bank-qr.jpg"
                    alt="Bank QR Code - P-Town Restaurant"
                    sx={{ 
                      width: 240, 
                      height: 'auto',
                      maxHeight: 350,
                      borderRadius: 2, 
                      mb: 2,
                      objectFit: 'contain',
                      bgcolor: 'white'
                    }}
                    onError={(e) => {
                      // Fallback if image fails to load
                      console.log('Failed to load Bank QR image');
                      e.target.style.display = 'none';
                      e.target.nextElementSibling.style.display = 'block';
                    }}
                  />
                  <Typography 
                    variant="body2" 
                    sx={{ 
                      display: 'none',
                      bgcolor: 'rgba(255,255,255,0.2)', 
                      p: 2, 
                      borderRadius: 1,
                      mb: 2
                    }}
                  >
                    Bank Transfer QR Code<br/>
                    P-Town Restaurant<br/>
                    Amount: ₱{total?.toFixed(2) || '0.00'}
                  </Typography>
                  <Typography variant="body2" sx={{ opacity: 0.9 }}>
                    1. Open your banking app and scan the QR code<br/>
                    2. Enter the order amount: ₱{total?.toFixed(2) || '0.00'}<br/>
                    3. Complete the transfer<br/>
                    4. Upload your payment receipt below
                  </Typography>
                </Box>
              )}
            </Box>
          )}

          {/* Payment Receipt Upload */}
          {paymentMethod && (
            <Box sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 1, border: '1px dashed #ccc' }}>
              <Typography variant="subtitle2" gutterBottom color="primary" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <CloudUpload fontSize="small" />
                Upload Payment Receipt/Proof *
              </Typography>
              <Typography variant="caption" display="block" sx={{ mb: 1, color: 'text.secondary' }}>
                Please upload a screenshot or photo of your {paymentMethod.replace('_', ' ').toUpperCase()} payment confirmation
              </Typography>
              <input
                type="file"
                accept="image/*,.pdf"
                onChange={handleReceiptUpload}
                style={{ 
                  width: '100%', 
                  padding: '8px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  backgroundColor: 'white'
                }}
              />
              {paymentReceipt && (
                <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Chip 
                    label={`✓ ${paymentReceipt.name}`} 
                    color="success" 
                    size="small" 
                    sx={{ maxWidth: '100%' }}
                  />
                </Box>
              )}
              <Typography variant="caption" display="block" sx={{ mt: 1, color: 'text.secondary' }}>
                Supported formats: JPG, PNG, WebP, PDF (max 5MB)
              </Typography>
            </Box>
          )}

        </Stack>

        <Divider sx={{ my: 1 }} />

        <Box sx={{ mt: 1 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography variant="body2" color="text.secondary">Subtotal</Typography>
            <Typography variant="body2">₱{displaySubtotal.toFixed(2)}</Typography>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography variant="body2" color="text.secondary">Discount</Typography>
            <Typography variant="body2">- ₱{displayDiscount.toFixed(2)}</Typography>
          </Box>
          <Divider sx={{ my: 1 }} />
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>Total</Typography>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>₱{displayTotal.toFixed(2)}</Typography>
          </Box>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 1.5, pb: 1.25 }}>
        <Button onClick={onClose} disabled={isSubmitting} size="small">Back</Button>
        <Button variant="contained" onClick={handlePlace} disabled={isSubmitting} size="small">{isSubmitting ? 'Placing...' : 'Place Order'}</Button>
      </DialogActions>
    </Dialog>
  );
};

export default CheckoutModal;
