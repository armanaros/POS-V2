import React, { useState, useEffect } from 'react';
import {
  Grid,
  Card,
  CardContent,
  Typography,
  Box,
  Tabs,
  Tab,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  FormControl,
  TextField,
  Button,
  Chip,
  LinearProgress,
  Avatar,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Divider,
  IconButton,
} from '@mui/material';
import {
  TrendingUp,
  TrendingDown,
  AttachMoney,
  ShoppingCart,
  People,
  Restaurant,
  Schedule,
  Star,
  Download,
  DateRange,
  Assessment,
  PieChart,
  BarChart,
  Timeline,
} from '@mui/icons-material';


import Layout from '../components/Layout';
import { ReportsService, OrderService, UserService } from '../services/firebaseServices';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import toast from 'react-hot-toast';

const Reports = () => {
  const { user, isAdmin, canAccessReports } = useAuth();
  const { orders: socketOrders, users: socketUsers, notifications } = useSocket();
  const [activeTab, setActiveTab] = useState(0);
  const [dateRange, setDateRange] = useState({
    startDate: new Date(new Date().setHours(0, 0, 0, 0)), // Today at 00:00
    endDate: new Date(new Date().setHours(23, 59, 59, 999)), // Today at 23:59
  });
  const [salesData, setSalesData] = useState({
    totalRevenue: 0,
    revenueGrowth: 0,
    totalOrders: 0,
    orderGrowth: 0,
    averageOrderValue: 0,
    aovGrowth: 0,
    uniqueCustomers: 0,
    customerGrowth: 0,
    dailySales: []
  });
  const [topItems, setTopItems] = useState([]);
  const [categoryPerformanceData, setCategoryPerformanceData] = useState([]);
  const [employeePerformance, setEmployeePerformance] = useState([]);
  const [orderAnalytics, setOrderAnalytics] = useState({
    averageOrderTime: 0,
    peakHours: 'N/A',
    completionRate: 0,
    refundRate: 0,
    statusDistribution: []
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Load reports data when component mounts or date range changes
    if (canAccessReports()) {
      fetchReportsData();
    }
  }, [dateRange]);

  // Auto-refresh reports when new orders come in
  useEffect(() => {
    if (socketOrders.length > 0 && canAccessReports()) {
      // Refresh reports data when orders are updated
      fetchReportsData();
    }
  }, [socketOrders, canAccessReports]);

  // Handle notifications for real-time updates
  useEffect(() => {
    notifications.forEach(notification => {
      if (notification.type === 'order' && canAccessReports()) {
        toast('New order received - Reports data refreshed');
        fetchReportsData();
      }
    });
  }, [notifications, canAccessReports]);

  const fetchReportsData = async () => {
    try {
      setLoading(true);
      
      // Initialize with empty data instead of mock data
      const emptySalesData = {
        totalRevenue: 0,
        revenueGrowth: 0,
        totalOrders: 0,
        orderGrowth: 0,
        averageOrderValue: 0,
        aovGrowth: 0,
        uniqueCustomers: 0,
        customerGrowth: 0,
        dailySales: []
      };

      const emptyTopItems = [];

      const emptyEmployeePerformance = [];

      const emptyOrderAnalytics = {
        averageOrderTime: 0,
        peakHours: 'N/A',
        completionRate: 0,
        refundRate: 0,
        statusDistribution: []
      };

      try {
        const [salesResponse, topItemsResponse, performanceResponse, analyticsResponse] = await Promise.all([
          ReportsService.getSalesReport(dateRange.startDate, dateRange.endDate),
          ReportsService.getTopItems(dateRange.startDate, dateRange.endDate),
          ReportsService.getEmployeePerformance(dateRange.startDate, dateRange.endDate),
          ReportsService.getOrderAnalytics(dateRange.startDate, dateRange.endDate)
        ]);
        
        console.log('Reports - Sales Response:', salesResponse);
        console.log('Reports - Top Items Response:', topItemsResponse);
        console.log('Reports - Performance Response:', performanceResponse);
        console.log('Reports - Analytics Response:', analyticsResponse);
        
        setSalesData(salesResponse);

        // Compute period-over-period growth metrics and unique customers
        try {
          const start = new Date(dateRange.startDate);
          const end = new Date(dateRange.endDate);
          // inclusive day count
          const msPerDay = 24 * 60 * 60 * 1000;
          const diffDays = Math.max(1, Math.round((end - start) / msPerDay) + 1);

          const prevEnd = new Date(start);
          prevEnd.setHours(23, 59, 59, 999);
          prevEnd.setDate(prevEnd.getDate() - 1);
          const prevStart = new Date(prevEnd);
          prevStart.setHours(0, 0, 0, 0);
          prevStart.setDate(prevStart.getDate() - (diffDays - 1));

          const prevSales = await ReportsService.getSalesReport(prevStart, prevEnd).catch(() => null);

          const calcPercent = (curr, prev) => {
            const c = Number(curr || 0);
            const p = Number(prev || 0);
            if (p === 0) return c === 0 ? 0 : 100;
            return Math.round(((c - p) / p) * 100);
          };

          const revenueGrowth = prevSales ? calcPercent(salesResponse.totalRevenue, prevSales.totalRevenue) : 0;
          const orderGrowth = prevSales ? calcPercent(salesResponse.totalOrders, prevSales.totalOrders) : 0;
          const aovGrowth = prevSales ? calcPercent(salesResponse.averageOrderValue, prevSales.averageOrderValue) : 0;

          // Compute unique customers for current and previous period using OrderService
          let uniqueCustomersCount = 0;
          let prevUniqueCustomersCount = 0;
          try {
            const allOrders = await OrderService.getAllOrders();
            const filterOrdersInRange = (orders, s, e) => orders.filter(o => {
              const d = o.createdAt?.toDate ? o.createdAt.toDate() : (o.createdAt ? new Date(o.createdAt) : null);
              if (!d) return false;
              return d >= s && d <= e && (o.status === 'served' || o.status === 'completed');
            });

            const currentOrders = filterOrdersInRange(allOrders, start, end);
            const prevOrders = filterOrdersInRange(allOrders, prevStart, prevEnd);

            const uniqCurr = new Set(currentOrders.map(o => o.customerId || o.customerName || o.customerEmail || 'guest'));
            const uniqPrev = new Set(prevOrders.map(o => o.customerId || o.customerName || o.customerEmail || 'guest'));

            uniqueCustomersCount = uniqCurr.size;
            prevUniqueCustomersCount = uniqPrev.size;
          } catch (err) {
            console.warn('Failed to compute unique customers', err);
          }

          const customerGrowth = calcPercent(uniqueCustomersCount, prevUniqueCustomersCount);

          // Merge computed metrics into salesData
          setSalesData(prev => ({
            ...prev,
            revenueGrowth,
            orderGrowth,
            aovGrowth,
            uniqueCustomers: uniqueCustomersCount,
            customerGrowth
          }));
        } catch (calcErr) {
          console.warn('Failed to compute growth metrics', calcErr);
        }

        // Normalize top items to expected UI shape and ensure numeric values
        const normalizedTopItems = (topItemsResponse || []).map(item => {
          const quantity = Number(item.quantity || item.quantitySold || item.qty || 0) || 0;
          const revenue = Number(item.revenue || item.totalRevenue || item.totalSales || item.sales || 0) || 0;
          const price = Number(item.price || item.unitPrice || 0) || 0;
          return {
            id: item.id || item.menuItemId || item.name || Math.random().toString(36).slice(2, 9),
            name: item.name || item.title || 'Unknown Item',
            quantitySold: quantity,
            totalRevenue: revenue || (price * quantity),
            price,
            // Category fields may not exist in the original response; provide safe defaults
            category: item.category || item.categoryName || 'Uncategorized',
            categoryName: item.categoryName || item.category || 'Uncategorized'
          };
        }).sort((a, b) => b.quantitySold - a.quantitySold);

        setTopItems(normalizedTopItems);

        // Compute category-level aggregates from normalized items
        const categoriesMap = {};
        normalizedTopItems.forEach(it => {
          const key = it.categoryName || it.category || 'Uncategorized';
          if (!categoriesMap[key]) {
            categoriesMap[key] = { categoryName: key, categoryOrders: 0, categoryRevenue: 0 };
          }
          // Use quantitySold as proxy for orders in category when orders-per-category not available
          categoriesMap[key].categoryOrders += it.quantitySold || 0;
          categoriesMap[key].categoryRevenue += it.totalRevenue || 0;
        });

        const categories = Object.values(categoriesMap);
        const maxCategoryRevenue = categories.reduce((m, c) => Math.max(m, c.categoryRevenue || 0), 0) || 1;
        const categoryPerformance = categories.map(c => ({
          ...c,
          categoryPerformance: Math.round(((c.categoryRevenue || 0) / maxCategoryRevenue) * 100)
        }));

        setCategoryPerformanceData(categoryPerformance);

        setEmployeePerformance(performanceResponse);
        setOrderAnalytics(analyticsResponse);
      } catch (apiError) {
        console.log('Firebase service error:', apiError.message);
        // Use empty data when service is not available
        setSalesData(emptySalesData);
        setTopItems(emptyTopItems);
        setEmployeePerformance(emptyEmployeePerformance);
        setOrderAnalytics(emptyOrderAnalytics);
        toast.error('Failed to load reports data');
      }
    } catch (error) {
      console.error('Error fetching reports:', error);
      toast.error('Failed to load reports data');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    const num = Number(amount) || 0;
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 2
    }).format(num);
  };

  const formatDate = (date) => {
    if (!date) return 'N/A';
    const d = (typeof date === 'string' || typeof date === 'number') ? new Date(date) : date;
    if (Number.isNaN(d.getTime())) return 'Invalid date';
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(d);
  };

  const getPerformanceColor = (percentage) => {
    if (percentage >= 80) return 'success';
    if (percentage >= 60) return 'warning';
    return 'error';
  };

  const exportReport = async (reportType) => {
    try {
      // Generate CSV data from current report data
      let csvContent = '';
      const currentDate = new Date().toLocaleDateString();
      
      if (reportType === 'comprehensive') {
        csvContent = `POS System Comprehensive Report\n`;
        csvContent += `Generated: ${currentDate}\n`;
        csvContent += `Period: ${dateRange.startDate} to ${dateRange.endDate}\n\n`;
        
        // Sales Summary
        csvContent += `SALES SUMMARY\n`;
        csvContent += `Total Revenue,${salesData.totalRevenue || 0}\n`;
        csvContent += `Total Orders,${salesData.totalOrders || 0}\n`;
        csvContent += `Average Order Value,${salesData.averageOrderValue || 0}\n\n`;
        
        // Top Items
        csvContent += `TOP SELLING ITEMS\n`;
        csvContent += `Rank,Item Name,Quantity Sold,Revenue\n`;
        topItems.forEach((item, index) => {
          csvContent += `${index + 1},${item.name},${item.quantity},${item.revenue}\n`;
        });
        csvContent += '\n';
        
        // Employee Performance
        csvContent += `EMPLOYEE PERFORMANCE\n`;
        csvContent += `Employee,Orders Processed,Total Revenue,Average Order Value\n`;
        employeePerformance.forEach(emp => {
          csvContent += `${emp.name},${emp.ordersProcessed},${emp.totalRevenue},${emp.averageOrderValue}\n`;
        });
      }
      
      // Create and download file
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const filename = `pos-report-${reportType}-${currentDate.replace(/\//g, '-')}.csv`;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success('Report exported successfully!');
    } catch (error) {
      console.error('Error exporting report:', error);
      toast.error('Failed to export report');
    }
  };

  if (!canAccessReports()) {
    return (
      <Layout>
        <Typography variant="h4" gutterBottom>
          Access Denied
        </Typography>
        <Typography variant="body1">
          You don't have permission to view reports. Only managers and administrators can access this section.
        </Typography>
      </Layout>
    );
  }

  return (
    <Layout>
      <Box sx={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" gutterBottom>
          Reports & Analytics
        </Typography>
        <Button
          variant="outlined"
          startIcon={<Download />}
          onClick={() => exportReport('comprehensive')}
        >
          Export Report
        </Button>
      </Box>

      {/* Date Range Selector */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2} alignItems="center">
            <Grid item>
              <TextField
                label="Start Date"
                type="date"
                value={dateRange.startDate.toISOString().split('T')[0]}
                onChange={(e) => setDateRange({ ...dateRange, startDate: new Date(e.target.value) })}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item>
              <TextField
                label="End Date"
                type="date"
                value={dateRange.endDate.toISOString().split('T')[0]}
                onChange={(e) => setDateRange({ ...dateRange, endDate: new Date(e.target.value) })}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item>
              <Button variant="contained" onClick={fetchReportsData}>
                Update Report
              </Button>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {loading && <LinearProgress sx={{ mb: 3 }} />}

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={activeTab} onChange={(e, newValue) => setActiveTab(newValue)}>
          <Tab label="Sales Overview" />
          <Tab label="Top Items" />
          <Tab label="Employee Performance" />
          <Tab label="Order Analytics" />
        </Tabs>
      </Box>

      {/* Sales Overview Tab */}
      {activeTab === 0 && (
        <Grid container spacing={3}>
          {/* Key Metrics */}
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <Avatar sx={{ bgcolor: 'primary.main', mr: 2 }}>
                    <AttachMoney />
                  </Avatar>
                  <Box>
                    <Typography variant="h4" color="primary">
                      {formatCurrency(salesData.totalRevenue)}
                    </Typography>
                    <Typography variant="body2" color="textSecondary">
                      Total Revenue
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
                      {salesData.revenueGrowth > 0 ? (
                        <TrendingUp color="success" />
                      ) : (
                        <TrendingDown color="error" />
                      )}
                      <Typography variant="caption" sx={{ ml: 0.5 }}>
                        {salesData.revenueGrowth > 0 ? '+' : ''}{salesData.revenueGrowth}%
                      </Typography>
                    </Box>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <Avatar sx={{ bgcolor: 'secondary.main', mr: 2 }}>
                    <ShoppingCart />
                  </Avatar>
                  <Box>
                    <Typography variant="h4" color="secondary">
                      {salesData.totalOrders}
                    </Typography>
                    <Typography variant="body2" color="textSecondary">
                      Total Orders
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
                      {salesData.orderGrowth > 0 ? (
                        <TrendingUp color="success" />
                      ) : (
                        <TrendingDown color="error" />
                      )}
                      <Typography variant="caption" sx={{ ml: 0.5 }}>
                        {salesData.orderGrowth > 0 ? '+' : ''}{salesData.orderGrowth}%
                      </Typography>
                    </Box>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <Avatar sx={{ bgcolor: 'success.main', mr: 2 }}>
                    <Restaurant />
                  </Avatar>
                  <Box>
                    <Typography variant="h4" color="success.main">
                      {formatCurrency(salesData.averageOrderValue)}
                    </Typography>
                    <Typography variant="body2" color="textSecondary">
                      Avg Order Value
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
                      {salesData.aovGrowth > 0 ? (
                        <TrendingUp color="success" />
                      ) : (
                        <TrendingDown color="error" />
                      )}
                      <Typography variant="caption" sx={{ ml: 0.5 }}>
                        {salesData.aovGrowth > 0 ? '+' : ''}{salesData.aovGrowth}%
                      </Typography>
                    </Box>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <Avatar sx={{ bgcolor: 'warning.main', mr: 2 }}>
                    <People />
                  </Avatar>
                  <Box>
                    <Typography variant="h4" color="warning.main">
                      {salesData.uniqueCustomers}
                    </Typography>
                    <Typography variant="body2" color="textSecondary">
                      Unique Customers
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
                      {salesData.customerGrowth > 0 ? (
                        <TrendingUp color="success" />
                      ) : (
                        <TrendingDown color="error" />
                      )}
                      <Typography variant="caption" sx={{ ml: 0.5 }}>
                        {salesData.customerGrowth > 0 ? '+' : ''}{salesData.customerGrowth}%
                      </Typography>
                    </Box>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>

          {/* Daily Sales Chart */}
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Daily Sales Trend
                </Typography>
                <TableContainer>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell>Date</TableCell>
                        <TableCell>Orders</TableCell>
                        <TableCell>Revenue</TableCell>
                        <TableCell>Avg Order Value</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {salesData.dailySales?.map((day) => (
                        <TableRow key={day.date}>
                          <TableCell>{formatDate(day.date)}</TableCell>
                          <TableCell>{day.orders}</TableCell>
                          <TableCell>{formatCurrency(day.revenue)}</TableCell>
                          <TableCell>{formatCurrency(day.averageOrderValue)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Top Items Tab */}
      {activeTab === 1 && (
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Top Selling Items
                </Typography>
                <List>
                  {topItems.map((item, index) => (
                    <React.Fragment key={item.id}>
                      <ListItem>
                        <ListItemAvatar>
                          <Avatar sx={{ bgcolor: index < 3 ? 'primary.main' : 'grey.500' }}>
                            {index + 1}
                          </Avatar>
                        </ListItemAvatar>
                        <ListItemText
                          primary={item.name}
                          secondary={
                            <Box>
                              <Typography variant="body2">
                                {item.quantitySold || 0} sold • {formatCurrency(item.totalRevenue || 0)} revenue
                              </Typography>
                              <LinearProgress
                                variant="determinate"
                                value={topItems[0] && topItems[0].quantitySold ? ((item.quantitySold || 0) / (topItems[0].quantitySold || 1)) * 100 : 0}
                                sx={{ mt: 1 }}
                              />
                            </Box>
                          }
                        />
                      </ListItem>
                      {index < topItems.length - 1 && <Divider />}
                    </React.Fragment>
                  ))}
                </List>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Category Performance
                </Typography>
                <TableContainer>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell>Category</TableCell>
                        <TableCell>Orders</TableCell>
                        <TableCell>Revenue</TableCell>
                        <TableCell>Performance</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {categoryPerformanceData.map((item) => (
                        <TableRow key={item.categoryName}>
                          <TableCell>{item.categoryName}</TableCell>
                          <TableCell>{item.categoryOrders || 0}</TableCell>
                          <TableCell>{formatCurrency(item.categoryRevenue || 0)}</TableCell>
                          <TableCell>
                            <LinearProgress
                              variant="determinate"
                              value={item.categoryPerformance || 0}
                              color={getPerformanceColor(item.categoryPerformance || 0)}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Employee Performance Tab */}
      {activeTab === 2 && (
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Employee Performance
                </Typography>
                <TableContainer>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell>Employee</TableCell>
                        <TableCell>Orders Processed</TableCell>
                        <TableCell>Total Sales</TableCell>
                        <TableCell>Avg Order Value</TableCell>
                        <TableCell>Performance Score</TableCell>
                        <TableCell>Status</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {employeePerformance.map((employee) => (
                        <TableRow key={employee.id}>
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center' }}>
                              <Avatar sx={{ mr: 2, bgcolor: 'primary.main' }}>
                                {(employee.firstName || employee.name || 'U').charAt(0)}
                                {(employee.lastName || '').charAt(0)}
                              </Avatar>
                              <Box>
                                <Typography variant="subtitle2">
                                  {employee.firstName && employee.lastName ? 
                                    `${employee.firstName} ${employee.lastName}` : 
                                    employee.name || 'Unknown Employee'
                                  }
                                </Typography>
                                <Typography variant="caption" color="textSecondary">
                                  {employee.role || 'employee'}
                                </Typography>
                              </Box>
                            </Box>
                          </TableCell>
                          <TableCell>{employee.ordersProcessed || 0}</TableCell>
                          <TableCell>{formatCurrency(employee.totalSales || employee.totalRevenue || 0)}</TableCell>
                          <TableCell>{formatCurrency(employee.averageOrderValue || 0)}</TableCell>
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center' }}>
                              <LinearProgress
                                variant="determinate"
                                value={employee.performanceScore || 0}
                                color={getPerformanceColor(employee.performanceScore || 0)}
                                sx={{ width: 100, mr: 1 }}
                              />
                              <Typography variant="body2">
                                {employee.performanceScore || 0}%
                              </Typography>
                            </Box>
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={(employee.performanceScore || 0) >= 80 ? 'Excellent' : 
                                     (employee.performanceScore || 0) >= 60 ? 'Good' : 'Needs Improvement'}
                              color={getPerformanceColor(employee.performanceScore || 0)}
                              size="small"
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Order Analytics Tab */}
      {activeTab === 3 && (
        <Grid container spacing={3}>
          <Grid item xs={12} sm={6} md={3}>
            <Paper sx={{ p: 2, textAlign: 'center' }}>
              <Typography variant="h4" color="primary">
                {orderAnalytics.averageOrderTime}
              </Typography>
              <Typography variant="body2">Avg Order Time (min)</Typography>
            </Paper>
          </Grid>
          
          <Grid item xs={12} sm={6} md={3}>
            <Paper sx={{ p: 2, textAlign: 'center' }}>
              <Typography variant="h4" color="secondary">
                {orderAnalytics.peakHours}
              </Typography>
              <Typography variant="body2">Peak Hours</Typography>
            </Paper>
          </Grid>
          
          <Grid item xs={12} sm={6} md={3}>
            <Paper sx={{ p: 2, textAlign: 'center' }}>
              <Typography variant="h4" color="success.main">
                {orderAnalytics.completionRate}%
              </Typography>
              <Typography variant="body2">Completion Rate</Typography>
            </Paper>
          </Grid>
          
          <Grid item xs={12} sm={6} md={3}>
            <Paper sx={{ p: 2, textAlign: 'center' }}>
              <Typography variant="h4" color="warning.main">
                {orderAnalytics.refundRate}%
              </Typography>
              <Typography variant="body2">Refund Rate</Typography>
            </Paper>
          </Grid>

          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Order Status Distribution
                </Typography>
                <TableContainer>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell>Status</TableCell>
                        <TableCell>Count</TableCell>
                        <TableCell>Percentage</TableCell>
                        <TableCell>Progress</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {orderAnalytics.statusDistribution?.map((status) => (
                        <TableRow key={status.status}>
                          <TableCell>
                            <Chip
                              label={status.status}
                              color={
                                status.status === 'completed' ? 'success' :
                                status.status === 'cancelled' ? 'error' :
                                status.status === 'pending' ? 'warning' : 'info'
                              }
                              size="small"
                            />
                          </TableCell>
                          <TableCell>{status.count}</TableCell>
                          <TableCell>{status.percentage}%</TableCell>
                          <TableCell>
                            <LinearProgress
                              variant="determinate"
                              value={status.percentage}
                              sx={{ width: 100 }}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}
    </Layout>
  );
};

export default Reports;
