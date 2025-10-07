import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  IconButton,
  TextField,
  Stack
} from '@mui/material';
import { Add as AddIcon, Remove as RemoveIcon } from '@mui/icons-material';

const ItemDetailModal = ({ open, item, onClose, onAdd }) => {
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (open) {
      setQty(1);
      setNotes('');
    }
  }, [open, item]);

  if (!item) return null;

  return (
    <Dialog open={!!open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{item.name} • ₱{(item.price || 0).toFixed(2)}</DialogTitle>
      <DialogContent dividers>
        {item.image && (
          <Box component="img" src={item.image} alt={item.name} sx={{ width: '100%', height: 220, objectFit: 'cover', borderRadius: 1, mb: 2 }} />
        )}
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{item.description}</Typography>

        <TextField label="Notes / special instructions" fullWidth multiline rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} size="small" sx={{ mb: 2 }} />

        <Stack direction="row" spacing={1} alignItems="center">
          <IconButton onClick={() => setQty(q => Math.max(1, q - 1))} size="small"><RemoveIcon /></IconButton>
          <Typography>{qty}</Typography>
          <IconButton onClick={() => setQty(q => q + 1)} size="small"><AddIcon /></IconButton>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        <Button variant="contained" onClick={() => { onAdd(item, qty, notes); onClose(); }}>Add {qty} to cart</Button>
      </DialogActions>
    </Dialog>
  );
};

export default ItemDetailModal;
