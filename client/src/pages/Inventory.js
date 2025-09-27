import React, { useState, useEffect } from 'react';
import {
  Grid,
  Card,
  CardContent,
  Typography,
  Box,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  IconButton,
  Fab,
  Alert,
} from '@mui/material';
import {
  Add,
  Edit,
  Delete,
  Inventory,
  Warning,
  CheckCircle,
  Error,
} from '@mui/icons-material';

import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import toast from 'react-hot-toast';

const InventoryPage = () => {
  const { user, isAdmin } = useAuth();
  const { menuItems: socketMenuItems, notifications, updateLocalMenuItems } = useSocket();
  const [inventoryItems, setInventoryItems] = useState([]);
  const [openDialog, setOpenDialog] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [loading, setLoading] = useState(false);

  const [itemForm, setItemForm] = useState({
    name: '',
    category: '',
    currentStock: 0,
    minStock: 0,
    maxStock: 0,
    unit: '',
    supplier: '',
    cost: 0,
  });

  useEffect(() => {
    fetchInventoryData();
  }, []);

  // Sync inventory with menu items from socket
  useEffect(() => {
    if (socketMenuItems.length > 0) {
      // Convert menu items to inventory format
      const inventoryFromMenu = socketMenuItems.map(item => ({
        id: item.id,
        name: item.name,
        category: item.categoryName || 'Unknown',
        currentStock: item.inventory || 0,
        minStock: 5,
        maxStock: 100,
        unit: 'unit',
        supplier: 'Default Supplier',
        cost: item.price * 0.6, // Estimate cost as 60% of price
        status: (item.inventory || 0) <= 5 ? 'low' : 'good'
      }));
      setInventoryItems(inventoryFromMenu);
      updateLocalMenuItems(socketMenuItems);
    }
  }, [socketMenuItems, updateLocalMenuItems]);

  // Handle notifications for real-time updates
  useEffect(() => {
    notifications.forEach(notification => {
      if (notification.type === 'menu_update') {
        toast('Menu updated - Inventory synced');
        fetchInventoryData();
      }
    });
  }, [notifications]);

  const fetchInventoryData = async () => {
    try {
      setLoading(true);
      // Mock inventory data since we don't have a dedicated inventory API
      const mockInventory = [
        {
          id: 1,
          name: 'Ground Beef',
          category: 'Meat',
          currentStock: 50,
          minStock: 10,
          maxStock: 100,
          unit: 'lbs',
          supplier: 'Local Butcher',
          cost: 5.99,
          status: 'good'
        },
        {
          id: 2,
          name: 'Tomatoes',
          category: 'Vegetables',
          currentStock: 3,
          minStock: 5,
          maxStock: 50,
          unit: 'lbs',
          supplier: 'Fresh Farm',
          cost: 2.99,
          status: 'low'
        },
        {
          id: 3,
          name: 'Cheese',
          category: 'Dairy',
          currentStock: 25,
          minStock: 5,
          maxStock: 40,
          unit: 'lbs',
          supplier: 'Dairy Co',
          cost: 8.99,
          status: 'good'
        }
      ];
      setInventoryItems(mockInventory);
    } catch (error) {
      console.error('Error fetching inventory:', error);
      toast.error('Failed to fetch inventory data');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'low': return 'error';
      case 'good': return 'success';
      case 'overstock': return 'warning';
      default: return 'default';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'low': return <Warning />;
      case 'good': return <CheckCircle />;
      case 'overstock': return <Error />;
      default: return null;
    }
  };

  if (!isAdmin()) {
    return (
      <Layout>
        <Alert severity="warning">
          Access denied. Only administrators can view inventory.
        </Alert>
      </Layout>
    );
  }

  return (
    <Layout>
      <Box sx={{ width: '100%' }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Inventory Management
        </Typography>
        
        <Grid container spacing={3} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={4}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  Total Items
                </Typography>
                <Typography variant="h5">
                  {inventoryItems.length}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={4}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  Low Stock Items
                </Typography>
                <Typography variant="h5" color="error">
                  {inventoryItems.filter(item => item.status === 'low').length}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={4}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  Total Value
                </Typography>
                <Typography variant="h5">
                  ${inventoryItems.reduce((total, item) => total + (item.currentStock * item.cost), 0).toFixed(2)}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        <Card>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6">
                Inventory Items
              </Typography>
              <Button
                variant="contained"
                startIcon={<Add />}
                onClick={() => setOpenDialog(true)}
              >
                Add Item
              </Button>
            </Box>

            <TableContainer component={Paper}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Name</TableCell>
                    <TableCell>Category</TableCell>
                    <TableCell>Current Stock</TableCell>
                    <TableCell>Min/Max</TableCell>
                    <TableCell>Unit</TableCell>
                    <TableCell>Cost</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {inventoryItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.name}</TableCell>
                      <TableCell>{item.category}</TableCell>
                      <TableCell>{item.currentStock}</TableCell>
                      <TableCell>{item.minStock}/{item.maxStock}</TableCell>
                      <TableCell>{item.unit}</TableCell>
                      <TableCell>${item.cost}</TableCell>
                      <TableCell>
                        <Chip
                          icon={getStatusIcon(item.status)}
                          label={item.status}
                          color={getStatusColor(item.status)}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        <IconButton
                          size="small"
                          onClick={() => {
                            setEditingItem(item);
                            setItemForm(item);
                            setOpenDialog(true);
                          }}
                        >
                          <Edit />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>

        {/* Add/Edit Dialog */}
        <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="sm" fullWidth>
          <DialogTitle>
            {editingItem ? 'Edit' : 'Add'} Inventory Item
          </DialogTitle>
          <DialogContent>
            <TextField
              autoFocus
              margin="dense"
              label="Item Name"
              fullWidth
              variant="outlined"
              value={itemForm.name}
              onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
            />
            <TextField
              margin="dense"
              label="Category"
              fullWidth
              variant="outlined"
              value={itemForm.category}
              onChange={(e) => setItemForm({ ...itemForm, category: e.target.value })}
            />
            <TextField
              margin="dense"
              label="Current Stock"
              type="number"
              fullWidth
              variant="outlined"
              value={itemForm.currentStock}
              onChange={(e) => setItemForm({ ...itemForm, currentStock: parseInt(e.target.value) || 0 })}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpenDialog(false)}>Cancel</Button>
            <Button onClick={() => {
              // Handle save logic here
              setOpenDialog(false);
              setEditingItem(null);
              toast.success('Inventory item saved');
            }} variant="contained">
              Save
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </Layout>
  );
};

export default InventoryPage;