import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Paper,
  Grid,
  TextField,
  Button,
  MenuItem,
  FormControl,
  InputLabel,
  Select,
  Divider,
  List,
  ListItem,
  ListItemText,
  IconButton,
  Chip,
  Card,
  CardContent,
  Stack,
  Alert,
  Tooltip,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
  LinearProgress,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from '@mui/material';
import { 
  Delete, 
  Edit, 
  ArrowBack,
  FileDownload,
  FileUpload,
  Psychology,
  TrendingUp,
  AccountBalance,
  MonetizationOn,
  Receipt
} from '@mui/icons-material';
import { LineChart, Line, XAxis, YAxis, Tooltip as RechartsTooltip, CartesianGrid, ResponsiveContainer } from 'recharts';
import operationsAPI from '../services/firebaseOperationsAPI';
import { ReportsService, OrderService } from '../services/firebaseServices';
import logger from '../utils/logger';
import Papa from 'papaparse';
import { MenuService, ScheduleService, UserService } from '../services/firebaseServices';
import toast from 'react-hot-toast';


const defaultTransactions = [
  // Firebase only - no default seeded data
];

const typeOptions = [
  { value: 'investment', label: 'Investment' },
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
];

// Firebase only - goals are server-backed; initialize to defaults

const Operations = () => {
  // Tab state
  const [currentTab, setCurrentTab] = useState(0);
  
  // Calendar & per-day state
  const [selectedDate, setSelectedDate] = useState(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarViewMonth, setCalendarViewMonth] = useState(() => new Date());
  const [transactions, setTransactions] = useState([]); // Firebase only - no localStorage fallback
  const [goals, setGoals] = useState({ monthlyRevenue: 0, recoupTarget: 0 });
  const [form, setForm] = useState({ type: 'income', amount: '', note: '' });
  const [editingIndex, setEditingIndex] = useState(null);
  const [transactionFilter, setTransactionFilter] = useState('today');
  
  // Cost management state
  const [menuItems, setMenuItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loadingMenu, setLoadingMenu] = useState(false);
  
  // Schedule and employee data
  const [scheduleData, setScheduleData] = useState([]);
  const [employeeData, setEmployeeData] = useState([]);
  const [loadingSchedule, setLoadingSchedule] = useState(false);
  
  // Sales data
  const [salesData, setSalesData] = useState([]);
  const [loadingSales, setLoadingSales] = useState(false);
  
  const navigate = useNavigate();

  // Helpers for calendar and totals
  // Return local YYYY-MM-DD (avoid UTC shifts from toISOString)
  function formatDateISO(d) {
    const dt = new Date(d);
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const day = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  // Return an ISO timestamp representing local noon for a YYYY-MM-DD or Date input
  // Return an ISO timestamp representing Manila noon for a YYYY-MM-DD or Date input
  function manilaNoonISOFromYMD(ymdOrDate) {
    try {
      // Use the shared helper logic (manilaNoonISO) from operations API logic
      // But provide a local implementation to avoid circular imports
      const MANILA_OFFSET_HOURS = 8;
      if (typeof ymdOrDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(ymdOrDate)) {
        const [yy, mm, dd] = ymdOrDate.split('-').map(Number);
        return new Date(Date.UTC(yy, mm - 1, dd, 12 - MANILA_OFFSET_HOURS, 0, 0, 0)).toISOString();
      }
      const d = new Date(ymdOrDate || Date.now());
      const manilaOffsetMs = MANILA_OFFSET_HOURS * 60 * 60 * 1000;
      const manila = new Date(d.getTime() + manilaOffsetMs);
      const y = manila.getUTCFullYear();
      const m = manila.getUTCMonth();
      const day = manila.getUTCDate();
      return new Date(Date.UTC(y, m, day, 12 - MANILA_OFFSET_HOURS, 0, 0, 0)).toISOString();
    } catch (e) {
      return new Date().toISOString();
    }
  }

  function localNowISO() {
    // Return Manila noon for today's Manila date
    return manilaNoonISOFromYMD(new Date());
  }

  // Schedule and sales calculation functions - defined early to avoid initialization issues
  const getDailyScheduleCosts = (date) => {
    if (!scheduleData || !employeeData) return { employees: [], totalCost: 0 };
    
    const dateStr = typeof date === 'string' ? date : formatDateISO(date);
    
    // Find all shifts for this date
    const dayShifts = scheduleData.filter(shift => {
      if (shift.date === dateStr) return true;
      if (shift.startISO) {
        const shiftDate = formatDateISO(new Date(shift.startISO));
        return shiftDate === dateStr;
      }
      return false;
    });
    
    const employeeShifts = [];
    let totalCost = 0;
    
    dayShifts.forEach(shift => {
      const employee = employeeData.find(emp => emp.id === shift.employeeId);
      if (employee) {
        const dailyRate = Number(employee.dailyRate) || 0;
        employeeShifts.push({
          ...shift,
          employee,
          dailyRate,
          displayName: `${employee.firstName || ''} ${employee.lastName || ''}`.trim() || employee.username || employee.email
        });
        totalCost += dailyRate;
      }
    });
    
    return { employees: employeeShifts, totalCost };
  };

  const getDailySales = (date) => {
    if (!salesData || !Array.isArray(salesData)) return 0;
    
    const dateStr = typeof date === 'string' ? date : formatDateISO(date);
    
    // Filter orders for the specific date and calculate total
    const completedStatuses = new Set(['served', 'completed', 'delivered', 'paid']);
    const dayOrders = salesData.filter(order => {
      if (!order || !order.createdAt) return false;
      const orderDate = formatDateISO(new Date(order.createdAt));
      const status = (order.status || '').toString().toLowerCase();
      // Only count orders that reached a completed/paid/delivered state; ignore cancelled ones
      return orderDate === dateStr && completedStatuses.has(status);
    });
    
    return dayOrders.reduce((total, order) => {
      return total + (Number(order.total) || 0);
    }, 0);
  };

  function getDailyTotals(txns) {
    const map = {};
    txns.forEach(t => {
      // prefer explicit dateOnly (YYYY-MM-DD) stored by the client to avoid timezone shifts
  const day = t.dateOnly || (typeof t.date === 'string' ? t.date.split('T')[0] : formatDateISO(t.date || t.createdAt || manilaNoonISOFromYMD(new Date())));
      map[day] = map[day] || { income: 0, expense: 0 };
      
      const amount = Number(t.amount || 0);
      
      if (t.type === 'income') map[day].income += amount;
      if (t.type === 'expense') map[day].expense += amount;
      if (t.type === 'investment') map[day].investment = (map[day].investment || 0) + amount;
    });
    
    return map;
  }

  // Build month grid (weeks) with Date objects
  function getMonthMatrix(viewMonth) {
    const start = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
    const end = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0);
    const startDay = start.getDay();
    const days = [];
    let week = new Array(startDay).fill(null);
    for (let d = 1; d <= end.getDate(); d++) {
      week.push(new Date(viewMonth.getFullYear(), viewMonth.getMonth(), d));
      if (week.length === 7) { days.push(week); week = []; }
    }
    if (week.length) { while (week.length < 7) week.push(null); days.push(week); }
    return days;
  }

  const dailyTotalsMemo = useMemo(() => getDailyTotals(transactions), [transactions]);

  // Transactions and aggregates limited to the currently viewed month (for backtracking)
  const transactionsForViewMonth = useMemo(() => {
    try {
      const y = calendarViewMonth.getFullYear();
      const m = calendarViewMonth.getMonth();
      
      const filtered = transactions.filter(t => {
        const d = new Date(t.date || t.createdAt || new Date().toISOString());
        return d.getFullYear() === y && d.getMonth() === m;
      });
      
      return filtered;
    } catch (e) {
      console.error('Error filtering transactions for month:', e);
      return [];
    }
  }, [transactions, calendarViewMonth]);

  const monthDailyTotals = useMemo(() => getDailyTotals(transactionsForViewMonth), [transactionsForViewMonth]);

  const monthTotals = useMemo(() => {
    let income = 0, expense = 0, investment = 0;
    
    // Add manual transactions
    for (const t of transactionsForViewMonth) {
      const a = Number(t.amount) || 0;
      if (t.type === 'income') income += a;
      if (t.type === 'expense') expense += a;
      if (t.type === 'investment') investment += a;
    }
    
    // Add sales and wages for the viewed month
    if (calendarViewMonth && scheduleData && employeeData && salesData) {
      const year = calendarViewMonth.getFullYear();
      const month = calendarViewMonth.getMonth();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      
      for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month, day);
        const dateISO = date.toISOString().split('T')[0];

        // Add daily wages to expenses (sales are derived into `transactions` already)
        const dayWages = getDailyScheduleCosts(dateISO);
        if (dayWages && dayWages.totalCost > 0) {
          expense += dayWages.totalCost;
        }
      }
    }
    
    return { income, expense, investment };
  }, [transactionsForViewMonth, calendarViewMonth, scheduleData, employeeData, salesData]);

  // Sync calendar view with browser history so back/forward works (backtracking)
  useEffect(() => {
    try {
      // On mount, read ?calendar=YYYY-MM and set initial month if present
      const params = new URLSearchParams(window.location.search);
      const cal = params.get('calendar');
      if (cal) {
        const [y, m] = cal.split('-').map(Number);
        if (!isNaN(y) && !isNaN(m)) setCalendarViewMonth(new Date(y, m - 1, 1));
      }

      const onPop = () => {
        const p = new URLSearchParams(window.location.search).get('calendar');
        if (p) {
          const [yy, mm] = p.split('-').map(Number);
          if (!isNaN(yy) && !isNaN(mm)) setCalendarViewMonth(new Date(yy, mm - 1, 1));
        }
      };

      window.addEventListener('popstate', onPop);
      return () => window.removeEventListener('popstate', onPop);
    } catch (e) {
      // ignore (non-browser environment)
    }
  }, []);

  // Push calendar view changes to history so users can backtrack with browser back button
  useEffect(() => {
    try {
      const y = calendarViewMonth.getFullYear();
      const m = String(calendarViewMonth.getMonth() + 1).padStart(2, '0');
      const key = `${y}-${m}`;
      const url = new URL(window.location.href);
      url.searchParams.set('calendar', key);
      // Use pushState so each month navigation is trackable
      window.history.pushState({}, '', url);
    } catch (e) {
      // ignore
    }
  }, [calendarViewMonth]);

  // Load data from Firebase only on mount
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const serverData = await operationsAPI.fetchOperations();
        if (!mounted) return;
        if (Array.isArray(serverData)) {
          setTransactions(serverData.map(s => ({
            type: s.type,
            amount: Number(s.amount),
            note: s.note || '',
            // prefer explicit dateOnly (YYYY-MM-DD); attach local noon to produce ISO for calendar
            date: s.dateOnly ? `${s.dateOnly}T12:00:00.000Z` : (s.createdAt || s.date || manilaNoonISOFromYMD(new Date())),
            dateOnly: s.dateOnly || (s.createdAt ? (s.createdAt.split('T')[0]) : null),
            id: s.id
          })));
        }
      } catch (e) {
        console.error('Failed to load operations from Firebase:', e);
      }
    })();
    // Load goals from Firebase
    (async () => {
      try {
        const g = await operationsAPI.getGoals();
        if (mounted) setGoals(g);
      } catch (e) {
        console.error('Failed to load goals from Firebase:', e);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Load menu data for cost management
  useEffect(() => {
    const loadMenuData = async () => {
      if (currentTab !== 1) return; // Only load when Cost Management tab is active
      
      setLoadingMenu(true);
      try {
        const [categoriesData, itemsData] = await Promise.all([
          MenuService.getCategories(),
          MenuService.getAllItems()
        ]);
        
        setCategories(categoriesData || []);
        setMenuItems(itemsData || []);
      } catch (error) {
        console.error('Error loading menu data:', error);
        toast.error('Failed to load menu data');
      } finally {
        setLoadingMenu(false);
      }
    };

    loadMenuData();
  }, [currentTab]);

  // Load schedule and employee data (always load for automatic wage calculations)
  useEffect(() => {
    const loadScheduleData = async () => {
      setLoadingSchedule(true);
      try {
        const [shifts, users] = await Promise.all([
          ScheduleService.fetchShifts(),
          UserService.getAllUsers()
        ]);
        
        setScheduleData(shifts || []);
        setEmployeeData(users || []);
      } catch (error) {
        console.error('Error loading schedule data:', error);
      } finally {
        setLoadingSchedule(false);
      }
    };

    loadScheduleData();
  }, []); // Load once on mount

  // Load sales data from Firestore for automatic income calculations
  useEffect(() => {
    const loadSalesData = async () => {
      setLoadingSales(true);
      try {
        // Get all orders from Firestore and filter to the current month
        const today = new Date();
        const year = today.getFullYear();
        const month = today.getMonth();

        const allOrders = await OrderService.getAllOrders();
        // Normalize createdAt to ISO if Firestore Timestamp present
        const normalized = (allOrders || []).map(o => ({
          ...o,
          createdAt: o.createdAt && o.createdAt.toDate ? o.createdAt.toDate().toISOString() : (o.createdAt || null)
        }));

        const monthOrders = normalized.filter(o => {
          if (!o.createdAt) return false;
          const d = new Date(o.createdAt);
          return d.getFullYear() === year && d.getMonth() === month;
        });

        setSalesData(monthOrders);

        // Derive transactions from completed orders so calendar can show income markers
        try {
          const derived = monthOrders
            .filter(o => o && (o.completedAt || o.status === 'served' || o.status === 'completed'))
            .map(o => {
              const dt = o.completedAt || o.createdAt || null;
              const dateOnly = dt && dt.split ? dt.split('T')[0] : null;
              return {
                id: o.id || o.orderNumber || Math.random().toString(36).slice(2, 9),
                type: 'income',
                amount: Number(o.subtotal != null ? o.subtotal : (o.total || 0)),
                note: `order:${o.orderNumber || o.id || ''}`,
                date: dt || null,
                dateOnly
              };
            });

          setTransactions(prev => {
            const existing = prev || [];
            // keep non-order transactions
            const nonSales = existing.filter(t => !(t.note && String(t.note).startsWith('order:')));
            // build map to dedupe by id (prefer derived order entries)
            const map = new Map();
            // add nonSales first
            nonSales.forEach(t => map.set(String(t.id || Math.random()), t));
            // add derived (orders) overriding by id
            derived.forEach(d => map.set(String(d.id), d));
            return Array.from(map.values()).sort((a, b) => (b.date || b.createdAt || '') > (a.date || a.createdAt || '') ? 1 : -1);
          });
        } catch (e) {
          console.error('Failed to derive transactions from Firestore sales data', e);
        }
      } catch (error) {
        console.error('Error loading sales data from Firestore:', error);
        setSalesData([]);
      } finally {
        setLoadingSales(false);
      }
    };

    loadSalesData();
  }, []); // Load once on mount

  // Automatic daily sales sync (Manila-local aware)
  useEffect(() => {
    let mounted = true;

    const LAST_SYNC_KEY = 'ptown:lastDailySalesSync';

    // compute Manila YYYY-MM-DD for a Date
    function manilaDateOnly(d) {
      const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
      const dt = new Date(d);
      const manila = new Date(dt.getTime() + MANILA_OFFSET_MS);
      const y = manila.getUTCFullYear();
      const m = String(manila.getUTCMonth() + 1).padStart(2, '0');
      const day = String(manila.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }

    async function autoSyncDailySales() {
      try {
        const today = manilaDateOnly(new Date());
        const last = localStorage.getItem(LAST_SYNC_KEY);
        if (last === today) return; // already synced for Manila today

        // Use Firebase ReportsService to compute today's sales (Firestore source of truth)
        let totalRevenue = 0;
        try {
          const fbReport = await ReportsService.getDailySales(today);
          logger.debug('Firebase ReportsService.getDailySales result:', fbReport);
          totalRevenue = (fbReport && Array.isArray(fbReport.orders))
            ? fbReport.orders.reduce((sum, o) => sum + (Number(o.subtotal != null ? o.subtotal : (o.total || 0)) || 0), 0)
            : (fbReport?.totalSales || 0);
        } catch (err) {
          console.error('Failed to fetch today summary from Firebase ReportsService:', err?.message || err);
          return;
        }

        // fetch existing operations to check for today's daily-sales marker
        const ops = await operationsAPI.fetchOperations();
        const exists = ops.some(o => {
          const d = o.dateOnly || ((o.createdAt || o.date || '').split && (o.createdAt || o.date || '').split('T')[0]) || null;
          return d === today && (o.note || '').includes('daily-sales');
        });

        if (!exists && totalRevenue > 0) {
          // create a daily-sales income operation and pass date as YYYY-MM-DD so server/client persist dateOnly
          const item = { type: 'income', amount: Number(totalRevenue), note: `daily-sales:${today}`, date: today };
          try {
            await operationsAPI.addOperation(item);
            const refreshed = await operationsAPI.fetchOperations();
            if (mounted) setTransactions(refreshed.map(s => ({ type: s.type, amount: Number(s.amount), note: s.note || '', date: s.createdAt || s.date || manilaNoonISOFromYMD(new Date()), dateOnly: s.dateOnly || (s.createdAt ? (s.createdAt.split('T')[0]) : null), id: s.id })));
          } catch (err) {
            console.error('Failed to add daily-sales operation:', err);
          }
        }

        // mark last sync as today (Manila)
        localStorage.setItem(LAST_SYNC_KEY, today);
      } catch (err) {
        console.error('Daily sales sync failed', err?.message || err);
      }
    }

    // Run immediately on mount
    autoSyncDailySales();

    // Check hourly for sync (ensures runs once per day)
    const interval = setInterval(autoSyncDailySales, 1000 * 60 * 60);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  // Firebase only - no automatic seeding of sample data

  // Goals persistence is handled via operationsAPI.setGoals/getGoals (server-backed)

  // Firebase only - no localStorage persistence needed

  // Schedule and sales calculation functions - moved to earlier position

  const totals = useMemo(() => {
    let investment = 0, expense = 0, income = 0;
    
    // Add manual transactions
    for (const t of transactions) {
      const a = Number(t.amount) || 0;
      if (t.type === 'investment') investment += a;
      if (t.type === 'expense') expense += a;
      if (t.type === 'income') income += a;
    }
    
    // Automatically add daily wages from scheduled employees
    if (scheduleData && employeeData) {
      const today = new Date();
      const currentMonth = today.getMonth();
      const currentYear = today.getFullYear();
      
      // Get all days in current month
      const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
      
      for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(currentYear, currentMonth, day);
        const dateISO = date.toISOString().split('T')[0];
        
        // Calculate wages for this day
        const dayWages = getDailyScheduleCosts(dateISO);
        if (dayWages && dayWages.totalCost > 0) {
          expense += dayWages.totalCost;
        }
      }
    }
    
    // Automatically add daily sales from orders
    // Note: sales are already added to `transactions` (derived from Firestore orders),
    // so we must not add `salesData` again here to avoid double-counting.
    
    return { investment, expense, income };
  }, [transactions, scheduleData, employeeData, salesData]);

  // Enhanced prediction using simple and accurate calculation
  const prediction = useMemo(() => {
    // Calculate current monthly net profit
    const currentNet = totals.income - totals.expense;
    
    // If no investment, return early
    if (totals.investment <= 0) {
      return { 
        months: 0, 
        message: 'No investment to recover', 
        avgMonthlyNet: currentNet 
      };
    }
    
    // If negative net, can't recover
    if (currentNet <= 0) {
      return { 
        months: Infinity, 
        message: 'Current net profit is negative. Focus on increasing revenue and reducing costs before investment recovery is possible.', 
        avgMonthlyNet: currentNet 
      };
    }
    
    // Simple calculation: investment / monthly net profit
    const monthsToRecover = totals.investment / currentNet;
    
    let message;
    if (monthsToRecover <= 3) {
      message = `Excellent! Investment will be recovered in ${monthsToRecover.toFixed(1)} months with current profitability.`;
    } else if (monthsToRecover <= 12) {
      message = `Good progress. Investment recovery estimated in ${monthsToRecover.toFixed(1)} months at current profit rate.`;
    } else {
      message = `Investment recovery will take ${monthsToRecover.toFixed(1)} months. Consider strategies to boost profitability.`;
    }
    
    return { 
      months: monthsToRecover, 
      message, 
      avgMonthlyNet: currentNet 
    };
  }, [totals]);

  // Enhanced heuristic suggestions (aggressive approach)
  const suggestions = useMemo(() => {
    const s = [];
    const margin = totals.income - totals.expense;
    const profitMargin = totals.income > 0 ? (margin / totals.income * 100) : 0;
    
    if (totals.investment > 0 && margin <= 0) {
      s.push('🚨 CRITICAL: Zero/negative profit with investment to recover! Implement emergency 15% price increase and cut expenses by 25% immediately.');
    }
    
    if (totals.expense > totals.income * 0.7) {
      s.push('💸 EXPENSE ALERT: Operating costs are dangerously high (>70% of revenue). Renegotiate supplier contracts and optimize staffing now.');
    }
    
    if (totals.income === 0) {
      s.push('📊 DATA ISSUE: No income recorded. Ensure POS system is tracking all sales and implement daily sales reporting.');
    }
    
    if (profitMargin < 15 && totals.income > 0) {
      s.push('📈 LOW MARGINS: Profit margin is under 15%. Focus on high-margin items and reduce portion sizes by 10-15%.');
    }
    
    if (totals.income > 0 && margin > 0) {
      s.push('🎯 GROWTH OPPORTUNITY: You\'re profitable! Launch aggressive marketing campaigns and expand high-performing menu items.');
      s.push('💰 UPSELL STRATEGY: Train staff to increase average ticket by ₱200 through strategic upselling of drinks and desserts.');
    }
    
    // Always include these aggressive tactics
    s.push('🔥 PRICING POWER: Test 8-12% price increases on your top 5 selling items. Most customers won\'t notice but profits will surge.');
    s.push('📱 DIGITAL REVENUE: Launch food delivery immediately. Online orders typically have 20-30% higher margins.');
    s.push('⚡ EFFICIENCY HACK: Implement "rush hour" pricing (+15% surcharge) during peak times. Maximize revenue when demand is highest.');
    
    return s;
  }, [totals]);

  function resetForm() {
    setForm({ type: 'income', amount: '', note: '' });
    setEditingIndex(null);
  }

  async function handleAddOrUpdate() {
    const amount = Number(form.amount);
    if (!form.type || isNaN(amount)) return;
  const newItem = { type: form.type, amount: amount, note: form.note || '', date: manilaNoonISOFromYMD(new Date()) };
    try {
      const saved = await operationsAPI.addOperation(newItem);
      const entryDate = saved.createdAt || saved.date || manilaNoonISOFromYMD(new Date());
      const entry = { 
        type: saved.type, 
        amount: Number(saved.amount), 
        note: saved.note || '', 
        date: entryDate, 
        dateOnly: (entryDate && String(entryDate).split) ? String(entryDate).split('T')[0] : null,
        id: saved.id 
      };
      console.debug('Operation saved:', saved, 'Entry added to state:', entry);
      setTransactions(prev => [entry, ...prev.filter(p => p.id !== entry.id)]);
      toast.success('Transaction saved');
    } catch (err) {
      console.error('Failed to add operation to Firebase:', err);
      alert('Failed to save transaction. Please try again.');
      return;
    }
    resetForm();
  }

  function handleEdit(i) {
    const t = transactions[i];
    setForm({ type: t.type, amount: String(t.amount), note: t.note || '' });
    setEditingIndex(i);
  }

  // Schedule and daily rate functions - moved before totals calculation

  // Cost management functions
  const handleUpdateItemCost = async (itemId, newCostOfGoods) => {
    try {
      await MenuService.updateItem(itemId, { costOfGoods: Number(newCostOfGoods) });
      
      // Update local state
      setMenuItems(prev => prev.map(item => 
        item.id === itemId 
          ? { ...item, costOfGoods: Number(newCostOfGoods) }
          : item
      ));
      
      toast.success('Cost updated successfully');
    } catch (error) {
      console.error('Error updating cost:', error);
      toast.error('Failed to update cost');
    }
  };

  const calculateProfit = (price, cost) => {
    const profit = price - cost;
    return profit;
  };

  const calculateProfitMargin = (price, cost) => {
    if (price === 0) return 0;
    return ((price - cost) / price) * 100;
  };

  const getItemsWithCostData = () => {
    return menuItems.map(item => {
      const category = categories.find(cat => cat.id === item.categoryId);
      const price = Number(item.price) || 0;
      const cost = Number(item.costOfGoods) || 0;
      const profit = calculateProfit(price, cost);
      const margin = calculateProfitMargin(price, cost);
      
      return {
        ...item,
        categoryName: category?.name || 'Unknown',
        price,
        cost,
        profit,
        margin
      };
    });
  };

  async function handleDelete(i) {
    const item = transactions[i];
    console.log('Deleting item:', item); // Debug log
    try {
      if (item && item.id) {
        console.log('Calling deleteOperation with id:', item.id); // Debug log
        await operationsAPI.deleteOperation(item.id);
      } else {
        console.warn('Item has no valid id:', item);
      }
    } catch (e) {
      console.error('Delete operation failed:', e);
    }
    setTransactions(prev => prev.filter((_, idx) => idx !== i));
  }

  // CSV export/import
  function exportCSV() {
    const csv = Papa.unparse(transactions.map(t => ({ type: t.type, amount: t.amount, note: t.note, date: t.date })));
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'operations.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  function importCSV(file) {
    Papa.parse(file, { header: true, complete: (res) => {
  const rows = res.data.map(r => ({ type: r.type, amount: Number(r.amount || 0), note: r.note || '', date: r.date || manilaNoonISOFromYMD(new Date()) }));
      setTransactions(prev => [...rows, ...prev]);
    } });
  }

  // Firebase only - no sample data generation

  // AI suggestions fetch
  const [aiSuggestions, setAiSuggestions] = useState([]);
  async function refreshAISuggestions() {
    const ctx = { 
      income: totals.income, 
      expense: totals.expense, 
      investment: totals.investment, 
      net: totals.income - totals.expense,
      recentTransactions: transactions.slice(0, 10),
      monthlyProjection: prediction.avgMonthlyNet,
      recoveryMonths: prediction.months
    };
    const s = await operationsAPI.aiSuggest(ctx);
    setAiSuggestions(s || []);
  }

  // file input ref for CSV import
  const fileInputRef = React.useRef(null);
  function onFileSelected(e) {
    const f = e.target.files && e.target.files[0];
    if (f) importCSV(f);
    // clear input so same file can be re-selected later
    e.target.value = null;
  }

  async function handleAddByDate(item) {
    try {
      // Ensure date is converted to local-noon ISO to avoid timezone shifts
      const payload = { ...item };
      if (payload.date && /^\d{4}-\d{2}-\d{2}$/.test(payload.date)) {
  payload.date = manilaNoonISOFromYMD(payload.date);
      } else if (!payload.date) {
        payload.date = manilaNoonISOFromYMD(new Date());
      }
      await operationsAPI.addOperation(payload);
      const refreshed = await operationsAPI.fetchOperations();
  setTransactions(refreshed.map(s => ({ type: s.type, amount: Number(s.amount), note: s.note || '', date: s.createdAt || s.date || manilaNoonISOFromYMD(new Date()), id: s.id })));
    } catch (e) {
      console.error('Failed to add operation via date assignment:', e);
      alert('Failed to save transaction. Please try again.');
    }
  }

  return (
    <>
    <Box sx={{ p: { xs: 2, sm: 3 }, backgroundColor: 'grey.50', minHeight: '100vh' }}>
      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 2 }}>
          <Tooltip title="Go back">
            <IconButton 
              onClick={() => {
                console.log('Back button clicked - going to dashboard');
                navigate('/dashboard');
              }} 
              sx={{ p: 1 }}
            >
              <ArrowBack />
            </IconButton>
          </Tooltip>
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 600, color: 'primary.main' }}>
              Operations Dashboard
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Financial tracking and business insights
            </Typography>
          </Box>
        </Stack>
        
        {/* Tabs */}
        <Paper elevation={0} sx={{ borderRadius: 2, overflow: 'hidden' }}>
          <Tabs 
            value={currentTab} 
            onChange={(e, newValue) => setCurrentTab(newValue)}
            sx={{ 
              backgroundColor: 'primary.main',
              '& .MuiTabs-indicator': { backgroundColor: 'white' },
              '& .MuiTab-root': { color: 'white', fontWeight: 600 },
              '& .Mui-selected': { color: 'white !important' }
            }}
          >
            <Tab label="Financial Tracking" />
            <Tab label="Cost Management" />
          </Tabs>
        </Paper>
      </Box>

      {/* Tab Content */}
      {currentTab === 0 ? (
        <Grid container spacing={3} wrap={{ xs: 'wrap', sm: 'nowrap' }}>
          {/* Main Content */}
          <Grid item xs={12} sm={9} md={8} sx={{ minWidth: 0 }}>
          <Stack spacing={3}>
            {/* Transaction Input */}
            <Card elevation={2}>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Receipt color="primary" />
                  Add Transaction
                </Typography>
                
                <Grid container spacing={2} alignItems="center">
                  <Grid item xs={12} sm={6} md={2}>
                    <FormControl fullWidth size="small" sx={{ minHeight: 40 }}>
                      <Select
                        native
                        value={form.type}
                        onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                        inputProps={{ 'aria-label': 'Type' }}
                      >
                        {typeOptions.map(o => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} sm={6} md={2}>
                    <TextField 
                      label="Amount" 
                      fullWidth 
                      value={form.amount} 
                      onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                      type="number"
                      size="small"
                      InputProps={{ startAdornment: '₱' }}
                      sx={{ minHeight: 40 }}
                    />
                  </Grid>
                  <Grid item xs={12} sm={8} md={4}>
                    <TextField 
                      label="Note" 
                      fullWidth 
                      value={form.note} 
                      onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                      size="small"
                      placeholder="Optional description"
                      sx={{ minHeight: 40 }}
                    />
                  </Grid>
                  <Grid item xs={12} sm={4} md={4}>
                    <Stack direction="row" spacing={1} sx={{ width: '100%' }}>
                      <Button 
                        variant="contained" 
                        onClick={handleAddOrUpdate}
                        fullWidth
                        sx={{ height: 44 }}
                      >
                        {editingIndex !== null ? 'Update' : 'Add'}
                      </Button>
                      {editingIndex !== null && (
                        <Button variant="outlined" onClick={resetForm} sx={{ minWidth: 40, height: 44 }}>
                          ✕
                        </Button>
                      )}
                    </Stack>
                  </Grid>
                </Grid>

                {/* Action Buttons */}
                <Box sx={{ mt: 3, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    <input ref={fileInputRef} type="file" accept="text/csv" style={{ display: 'none' }} onChange={onFileSelected} />
                    
                    <Button 
                      variant="outlined" 
                      size="small" 
                      startIcon={<FileDownload />}
                      onClick={() => exportCSV()}
                      sx={{ mb: 1 }}
                    >
                      Export CSV
                    </Button>
                    
                    <Button 
                      variant="outlined" 
                      size="small" 
                      startIcon={<FileUpload />}
                      onClick={() => fileInputRef.current && fileInputRef.current.click()}
                      sx={{ mb: 1 }}
                    >
                      Import CSV
                    </Button>
                    
                    <Button 
                      variant="contained" 
                      size="small" 
                      startIcon={<Psychology />}
                      onClick={() => refreshAISuggestions()}
                      color="secondary"
                      sx={{ mb: 1 }}
                    >
                      Get AI Suggestions
                    </Button>
                    
                    <Button 
                      variant="outlined" 
                      size="small" 
                      onClick={async () => {
                        const confirmText = 'DELETE ALL POS DATA';
                        const userInput = prompt(`⚠️ DANGER: This will permanently delete ALL POS data from Firebase!\n\nThis includes:\n• All operations & financial records\n• All orders & order history\n• All menu items & categories\n• All inventory alerts\n• All activity logs\n• All announcements\n\nUser accounts will be preserved.\n\nThis action CANNOT be undone!\n\nType "${confirmText}" to confirm:`);
                        
                        if (userInput !== confirmText) {
                          alert('❌ Deletion cancelled. Incorrect confirmation text.');
                          return;
                        }
                        
                        const finalConfirm = window.confirm('🚨 FINAL WARNING 🚨\n\nYou are about to permanently delete ALL POS SYSTEM DATA.\n\nThis includes:\n• ALL financial operations data\n• ALL order history and items\n• ALL menu categories and items\n• ALL inventory alerts\n• ALL system activity logs\n• ALL announcements\n\nOnly user accounts will remain for continued access.\n\nClick OK to proceed with COMPLETE POS RESET.');
                        
                        if (!finalConfirm) {
                          alert('❌ Complete reset cancelled.');
                          return;
                        }
                        
                        try {
                          const result = await operationsAPI.eraseAllData();
                          setTransactions([]);
                          setGoals({ monthlyRevenue: 0, recoupTarget: 0 });
                          alert(`✅ Complete POS reset successful!\n\n${result.message}\n\nThe POS system is now completely clean.\nUser access has been preserved.`);
                        } catch (e) {
                          console.error('Complete reset failed:', e);
                          alert('❌ Failed to complete POS reset. Check console for details.');
                        }
                      }}
                      color="error"
                      sx={{ mb: 1, backgroundColor: 'error.main', color: 'white', '&:hover': { backgroundColor: 'error.dark' } }}
                    >
                      🗑️ Complete POS Reset
                    </Button>
                  </Stack>
                </Box>
              </CardContent>
            </Card>

            {/* Calendar */}
            <Card elevation={2}>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 2 }}>Calendar</Typography>
                <Box>
                  {(() => {
                    // Use month-scoped totals so back/forward shows the correct month data
                    const daily = monthDailyTotals;
                    const matrix = getMonthMatrix(calendarViewMonth);
                    return (
                      <Box>
                        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
                          <Button 
                            size="small" 
                            variant="outlined"
                            onClick={() => setCalendarViewMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
                            sx={{ minWidth: 40 }}
                          >
                            ‹
                          </Button>
                          <Box sx={{ textAlign: 'center' }}>
                            <Typography variant="h6" sx={{ fontWeight: 600 }}>
                              {calendarViewMonth.toLocaleString(undefined, { month: 'long', year: 'numeric' })}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              Current Month: ₱{monthTotals.income.toLocaleString()} / -₱{monthTotals.expense.toLocaleString()}
                            </Typography>
                          </Box>
                          <Button 
                            size="small" 
                            variant="outlined"
                            onClick={() => setCalendarViewMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
                            sx={{ minWidth: 40 }}
                          >
                            ›
                          </Button>
                        </Stack>
                        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: { xs: 0.5, sm: 1 }, textAlign: 'center' }}>
                          {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
                            <Typography 
                              key={d} 
                              variant="caption" 
                              color="text.secondary"
                              sx={{ fontWeight: 600, py: 1 }}
                            >
                              {d}
                            </Typography>
                          ))}
                          {matrix.map((week, wi) => week.map((day, di) => {
                            const iso = day ? formatDateISO(day) : null;
                            const stats = iso ? (daily[iso] || {}) : {};
                            const scheduleInfo = iso ? getDailyScheduleCosts(iso) : { employees: [], totalCost: 0 };
                            const isToday = iso === formatDateISO(new Date());
                            return (
                              <Box key={`${wi}-${di}`}>
                                {day ? (
                                  <Button 
                                    size="small"
                                    variant={isToday ? 'contained' : 'text'}
                                    onClick={() => { if (iso) { setSelectedDate(iso); setCalendarOpen(true); } }}
                                    sx={{ 
                                      width: '100%', 
                                      height: { xs: 72, sm: 84 }, 
                                      display: 'flex', 
                                      flexDirection: 'column', 
                                      alignItems: 'center', 
                                      justifyContent: 'center',
                                      gap: 0.25,
                                      border: '1px solid',
                                      borderColor: isToday ? 'primary.main' : 'grey.300',
                                      borderRadius: 1,
                                      '&:hover': {
                                        borderColor: 'primary.main',
                                        backgroundColor: 'primary.50'
                                      }
                                    }}
                                  >
                                    <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1 }}>
                                      {day.getDate()}
                                    </Typography>
                                    
                                    {/* Employee Schedule Indicator */}
                                    {scheduleInfo.employees.length > 0 && (
                                      <Typography 
                                        variant="caption" 
                                        sx={{ 
                                          fontSize: 9, 
                                          lineHeight: 1, 
                                          color: 'primary.main',
                                          fontWeight: 'bold',
                                          backgroundColor: 'primary.light',
                                          px: 0.5,
                                          borderRadius: 0.5
                                        }}
                                      >
                                        {scheduleInfo.employees.length} Staff
                                      </Typography>
                                    )}
                                    
                                    {/* Daily Rate Cost */}
                                    {scheduleInfo.totalCost > 0 && (
                                      <Typography variant="caption" color="warning.main" sx={{ fontSize: 9, lineHeight: 1 }}>
                                        Wages: ₱{scheduleInfo.totalCost.toLocaleString()}
                                      </Typography>
                                    )}
                                    
                                    {/* Daily Sales */}
                                    {(() => {
                                      const dailySales = getDailySales(iso);
                                      return dailySales > 0 ? (
                                        <Typography variant="caption" color="success.main" sx={{ fontSize: 9, lineHeight: 1 }}>
                                          Sales: ₱{dailySales.toLocaleString()}
                                        </Typography>
                                      ) : null;
                                    })()}

                                    {/* Income */}
                                    {stats.income > 0 && (
                                      <Typography variant="caption" color="success.main" sx={{ fontSize: 9, lineHeight: 1 }}>
                                        +₱{stats.income.toLocaleString()}
                                      </Typography>
                                    )}
                                    
                                    {/* Expenses */}
                                    {stats.expense > 0 && (
                                      <Typography variant="caption" color="error.main" sx={{ fontSize: 9, lineHeight: 1 }}>
                                        -₱{stats.expense.toLocaleString()}
                                      </Typography>
                                    )}
                                  </Button>
                                ) : (
                                  <Box sx={{ height: { xs: 72, sm: 84 } }} />
                                )}
                              </Box>
                            );
                          }))}
                        </Box>
                      </Box>
                    );
                  })()}
                </Box>
              </CardContent>
            </Card>

            {/* Chart */}
            <Card elevation={2}>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <TrendingUp color="primary" />
                  Income vs Expenses Trend
                </Typography>
                
                <Box sx={{ height: { xs: 300, md: 400 }, width: '100%' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={(() => {
                      const map = {};
                      transactions.slice().reverse().forEach(t => {
                        const day = new Date(t.date).toLocaleDateString();
                        map[day] = map[day] || { date: day, income: 0, expense: 0 };
                        if (t.type === 'income') map[day].income += Number(t.amount || 0);
                        if (t.type === 'expense') map[day].expense += Number(t.amount || 0);
                      });
                      return Object.values(map).slice(-30);
                    })()}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="date" fontSize={12} />
                      <YAxis fontSize={12} />
                      <RechartsTooltip 
                        contentStyle={{ 
                          backgroundColor: 'white', 
                          border: '1px solid #ccc',
                          borderRadius: 8
                        }}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="income" 
                        stroke="#4caf50" 
                        strokeWidth={2}
                        dot={{ fill: '#4caf50', strokeWidth: 2, r: 4 }}
                        name="Income"
                      />
                      <Line 
                        type="monotone" 
                        dataKey="expense" 
                        stroke="#f44336" 
                        strokeWidth={2}
                        dot={{ fill: '#f44336', strokeWidth: 2, r: 4 }}
                        name="Expenses"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </Box>
              </CardContent>
            </Card>

            {/* Transactions List */}
            <Card elevation={2}>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Box>
                    <Typography variant="h6">
                      Today's Transactions
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {new Date().toLocaleDateString('en-US', { 
                        weekday: 'long', 
                        year: 'numeric', 
                        month: 'long', 
                        day: 'numeric' 
                      })}
                    </Typography>
                  </Box>
                  <Select
                    size="small"
                    value={transactionFilter || 'today'}
                    onChange={(e) => setTransactionFilter(e.target.value)}
                    sx={{ minWidth: 120 }}
                  >
                    <MenuItem value="today">Today</MenuItem>
                    <MenuItem value="week">This Week</MenuItem>
                    <MenuItem value="month">This Month</MenuItem>
                    <MenuItem value="all">All Time</MenuItem>
                  </Select>
                </Box>

                {(() => {
                  // Filter transactions based on selected period
                  const now = new Date();
                  const today = now.toISOString().split('T')[0];
                  
                  let filteredTransactions = transactions;
                  
                  switch (transactionFilter || 'today') {
                    case 'today':
                      filteredTransactions = transactions.filter(t => {
                        if (!t.date) return false;
                        try {
                          const transactionDate = new Date(t.date);
                          if (isNaN(transactionDate.getTime())) return false;
                          const transactionDateString = transactionDate.toISOString().split('T')[0];
                          return transactionDateString === today;
                        } catch (e) {
                          return false;
                        }
                      });
                      break;
                    case 'week':
                      const weekStart = new Date(now);
                      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
                      weekStart.setHours(0, 0, 0, 0);
                      filteredTransactions = transactions.filter(t => {
                        if (!t.date) return false;
                        try {
                          const transactionDate = new Date(t.date);
                          if (isNaN(transactionDate.getTime())) return false;
                          return transactionDate >= weekStart;
                        } catch (e) {
                          return false;
                        }
                      });
                      break;
                    case 'month':
                      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
                      filteredTransactions = transactions.filter(t => {
                        if (!t.date) return false;
                        try {
                          const transactionDate = new Date(t.date);
                          if (isNaN(transactionDate.getTime())) return false;
                          return transactionDate >= monthStart;
                        } catch (e) {
                          return false;
                        }
                      });
                      break;
                    case 'all':
                    default:
                      // Show all transactions
                      break;
                  }
                  
                  // Sort by date (newest first)
                  filteredTransactions = filteredTransactions.sort((a, b) => {
                    try {
                      const dateA = new Date(a.date || 0);
                      const dateB = new Date(b.date || 0);
                      
                      if (isNaN(dateA.getTime())) return 1;
                      if (isNaN(dateB.getTime())) return -1;
                      
                      return dateB - dateA;
                    } catch (e) {
                      return 0;
                    }
                  });

                  if (filteredTransactions.length === 0) {
                    return (
                      <Alert severity="info" sx={{ mt: 2 }}>
                        No transactions found for the selected period. 
                        {(transactionFilter || 'today') === 'today' 
                          ? ' Start processing orders to see today\'s income transactions here.'
                          : ' Try selecting a different time period or add transactions above.'
                        }
                      </Alert>
                    );
                  }

                  return (
                    <List sx={{ maxHeight: { xs: 360, md: 520 }, overflow: 'auto' }}>
                      {filteredTransactions.map((t, i) => (
                      <ListItem 
                        key={i}
                        sx={{ 
                          border: '1px solid',
                          borderColor: 'grey.200',
                          borderRadius: 1,
                          mb: 1,
                          backgroundColor: 'white'
                        }}
                        secondaryAction={
                          <Stack direction="row" spacing={0.5}>
                            <Tooltip title="Edit">
                              <IconButton edge="end" size="small" onClick={() => handleEdit(i)}>
                                <Edit fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Delete">
                              <IconButton edge="end" size="small" onClick={() => handleDelete(i)} color="error">
                                <Delete fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </Stack>
                        }
                      >
                        <ListItemText 
                          primary={
                            <Stack direction="row" alignItems="center" spacing={1}>
                              <Chip 
                                label={t.type.toUpperCase()} 
                                size="small"
                                color={t.type === 'income' ? 'success' : t.type === 'expense' ? 'error' : 'warning'}
                                variant="outlined"
                              />
                              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                                ₱{Number(t.amount).toLocaleString()}
                              </Typography>
                            </Stack>
                          }
                          secondary={
                            <React.Fragment>
                              {t.note && (
                                <Typography variant="body2" color="text.secondary" component="span" display="block">
                                  {t.note}
                                </Typography>
                              )}
                              <Typography variant="caption" color="text.secondary" component="span" display="block">
                                {(() => {
                                  try {
                                    const date = new Date(t.date);
                                    return isNaN(date.getTime()) ? 'Invalid Date' : date.toLocaleString();
                                  } catch (e) {
                                    return 'Invalid Date';
                                  }
                                })()}
                              </Typography>
                            </React.Fragment>
                          }
                        />
                      </ListItem>
                    ))}
                  </List>
                  );
                })()}
              </CardContent>
            </Card>
          </Stack>
        </Grid>

  {/* Sidebar - Summary & Goals */}
        <Grid item xs={12} sm={3} md={4} sx={{ minWidth: { sm: 520, md: 620 }, maxWidth: { sm: 680, md: 820 } }}>
          <Stack spacing={3}>
            {/* Summary Cards */}
            <Card elevation={2}>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <AccountBalance color="primary" />
                  Financial Summary
                </Typography>
                
                <Stack spacing={2}>
                  <Box sx={{ p: 2, borderRadius: 1, backgroundColor: 'success.light', color: 'success.contrastText' }}>
                    <Stack direction="row" alignItems="center" justifyContent="space-between">
                      <Stack>
                        <Typography variant="caption" sx={{ opacity: 0.8 }}>Total Income (All Time)</Typography>
                        <Typography variant="h6" sx={{ fontWeight: 600 }}>
                          ₱{totals.income.toLocaleString()}
                        </Typography>
                      </Stack>
                      <MonetizationOn sx={{ fontSize: 28, opacity: 0.8 }} />
                    </Stack>
                  </Box>

                  <Box sx={{ p: 2, borderRadius: 1, backgroundColor: 'error.light', color: 'error.contrastText' }}>
                    <Stack direction="row" alignItems="center" justifyContent="space-between">
                      <Stack>
                        <Typography variant="caption" sx={{ opacity: 0.8 }}>Total Expenses (incl. wages)</Typography>
                        <Typography variant="h6" sx={{ fontWeight: 600 }}>
                          ₱{totals.expense.toLocaleString()}
                        </Typography>
                      </Stack>
                      <Receipt sx={{ fontSize: 28, opacity: 0.8 }} />
                    </Stack>
                  </Box>

                  <Box sx={{ p: 2, borderRadius: 1, backgroundColor: 'warning.light', color: 'warning.contrastText' }}>
                    <Stack direction="row" alignItems="center" justifyContent="space-between">
                      <Stack>
                        <Typography variant="caption" sx={{ opacity: 0.8 }}>Investment</Typography>
                        <Typography variant="h6" sx={{ fontWeight: 600 }}>
                          ₱{totals.investment.toLocaleString()}
                        </Typography>
                      </Stack>
                      <AccountBalance sx={{ fontSize: 28, opacity: 0.8 }} />
                    </Stack>
                  </Box>

                  

                  <Box sx={{ p: 2, borderRadius: 1, backgroundColor: (totals.income - totals.expense) >= 0 ? 'info.main' : 'grey.200', color: (totals.income - totals.expense) >= 0 ? 'common.white' : 'text.primary' }}>
                    <Stack direction="row" alignItems="center" justifyContent="space-between">
                      <Stack>
                        <Typography variant="caption" sx={{ color: (totals.income - totals.expense) >= 0 ? 'rgba(255,255,255,0.85)' : 'text.secondary' }}>Net Profit</Typography>
                        <Typography
                          variant="h6"
                          sx={{
                            fontWeight: 800,
                            fontSize: '1.05rem',
                            color: (totals.income - totals.expense) >= 0 ? 'common.white' : 'error.dark',
                            letterSpacing: '0.01em'
                          }}
                        >
                          ₱{(totals.income - totals.expense).toLocaleString()}
                        </Typography>
                      </Stack>
                      <TrendingUp
                        sx={{
                          fontSize: 28,
                          color: (totals.income - totals.expense) >= 0 ? 'common.white' : 'error.dark'
                        }}
                      />
                    </Stack>
                  </Box>
                </Stack>
              </CardContent>
            </Card>

            {/* Prediction */}
            <Card elevation={2}>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 2 }}>Investment Recovery</Typography>
                
                <Alert 
                  severity={isFinite(prediction.months) && prediction.months > 0 ? "success" : "warning"} 
                  sx={{ mb: 2 }}
                >
                  {prediction.message}
                </Alert>
                
                {prediction.avgMonthlyNet && (
                  <Typography variant="body2" color="text.secondary">
                    Average monthly net: ₱{prediction.avgMonthlyNet.toFixed(2)}
                  </Typography>
                )}
              </CardContent>
            </Card>

            {/* Goals */}
            <Card elevation={2}>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 2 }}>Goals</Typography>
                
                <Stack spacing={2}>
                  <TextField
                    label="Monthly Revenue Target"
                    fullWidth
                    size="small"
                    value={goals.monthlyRevenue || ''}
                    onChange={e => setGoals(g => ({ ...g, monthlyRevenue: Number(e.target.value || 0) }))}
                    type="number"
                    InputProps={{ startAdornment: '₱' }}
                  />
                  <TextField
                    label="Recoup Target"
                    fullWidth
                    size="small"
                    value={goals.recoupTarget || ''}
                    onChange={e => setGoals(g => ({ ...g, recoupTarget: Number(e.target.value || 0) }))}
                    type="number"
                    InputProps={{ startAdornment: '₱' }}
                  />
                  
                  <Button 
                    variant="contained" 
                    onClick={async () => { await operationsAPI.setGoals(goals); }}
                    fullWidth
                  >
                    Save Goals
                  </Button>
                </Stack>

                {(goals.monthlyRevenue || goals.recoupTarget) && (
                  <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
                    <Typography variant="subtitle2" sx={{ mb: 1 }}>Progress</Typography>
                    {goals.monthlyRevenue && (
                      <Box sx={{ mb: 1 }}>
                        <Typography variant="caption" color="text.secondary">
                          Monthly: ₱{monthTotals.income.toLocaleString()} / ₱{goals.monthlyRevenue.toLocaleString()}
                        </Typography>
                        <LinearProgress 
                          variant="determinate" 
                          value={Math.min((monthTotals.income / goals.monthlyRevenue) * 100, 100)}
                          sx={{ mt: 0.5 }}
                        />
                      </Box>
                    )}
                    {goals.recoupTarget && (
                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          Recovery: ₱{(totals.income - totals.expense).toLocaleString()} / ₱{goals.recoupTarget.toLocaleString()}
                        </Typography>
                        <LinearProgress 
                          variant="determinate" 
                          value={Math.min(((totals.income - totals.expense) / goals.recoupTarget) * 100, 100)}
                          sx={{ mt: 0.5 }}
                        />
                      </Box>
                    )}
                  </Box>
                )}
              </CardContent>
            </Card>

            {/* AI Suggestions */}
            <Card elevation={2}>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Psychology color="primary" />
                  Business Suggestions
                </Typography>
                
                {(aiSuggestions && aiSuggestions.length > 0) ? (
                  <List dense>
                    {aiSuggestions.map((s, i) => (
                      <ListItem key={i} sx={{ py: 0.5, alignItems: 'flex-start' }}>
                        <ListItemText 
                          primary={s}
                          primaryTypographyProps={{ variant: 'body2' }}
                        />
                      </ListItem>
                    ))}
                  </List>
                ) : suggestions.length > 0 ? (
                  <List dense>
                    {suggestions.map((s, i) => (
                      <ListItem key={i} sx={{ py: 0.5, alignItems: 'flex-start' }}>
                        <ListItemText 
                          primary={s}
                          primaryTypographyProps={{ variant: 'body2' }}
                        />
                      </ListItem>
                    ))}
                  </List>
                ) : (
                  <Alert severity="info">
                    Click "Get AI Suggestions" to receive personalized recommendations
                  </Alert>
                )}
                
                <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                  Suggestions are {aiSuggestions?.length > 0 ? 'AI-generated' : 'heuristic-based'} starting points for improvement.
                </Typography>
              </CardContent>
            </Card>
          </Stack>
        </Grid>
      </Grid>
      ) : (
        /* Cost Management Tab */
        <Card elevation={2}>
          <CardContent>
            <Typography variant="h6" sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
              <MonetizationOn color="primary" />
              Smart Cost Management
            </Typography>
            
            {loadingMenu ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <LinearProgress sx={{ width: '100%' }} />
              </Box>
            ) : (
              <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
                <Table>
                  <TableHead>
                    <TableRow sx={{ bgcolor: 'primary.main' }}>
                      <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Item Name</TableCell>
                      <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Category</TableCell>
                      <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Selling Price</TableCell>
                      <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Cost to Make</TableCell>
                      <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Profit per Item</TableCell>
                      <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Profit Margin</TableCell>
                      <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Action</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {getItemsWithCostData().map((item) => (
                      <TableRow key={item.id} hover>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                            {item.name}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip 
                            label={item.categoryName} 
                            size="small" 
                            variant="outlined"
                            sx={{ borderRadius: 1 }}
                          />
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ color: 'success.main', fontWeight: 'bold' }}>
                            ₱{item.price.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <TextField
                            size="small"
                            type="number"
                            step="0.01"
                            value={item.cost || ''}
                            onChange={(e) => {
                              const newCost = e.target.value;
                              setMenuItems(prev => prev.map(menuItem => 
                                menuItem.id === item.id 
                                  ? { ...menuItem, costOfGoods: Number(newCost) }
                                  : menuItem
                              ));
                            }}
                            onBlur={() => handleUpdateItemCost(item.id, item.cost)}
                            InputProps={{
                              startAdornment: <Typography sx={{ mr: 0.5, color: 'text.secondary' }}>₱</Typography>
                            }}
                            sx={{ width: 120 }}
                          />
                        </TableCell>
                        <TableCell>
                          <Typography 
                            variant="body2" 
                            sx={{ 
                              color: item.profit >= 0 ? 'success.main' : 'error.main', 
                              fontWeight: 'bold' 
                            }}
                          >
                            ₱{item.profit.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography 
                              variant="body2" 
                              sx={{ 
                                color: item.margin >= 50 ? 'success.main' 
                                      : item.margin >= 25 ? 'warning.main' 
                                      : 'error.main',
                                fontWeight: 'bold'
                              }}
                            >
                              {item.margin.toFixed(1)}%
                            </Typography>
                            <Chip 
                              label={
                                item.margin >= 50 ? 'Excellent' 
                                : item.margin >= 25 ? 'Good' 
                                : item.margin >= 0 ? 'Low' 
                                : 'Loss'
                              }
                              size="small"
                              color={
                                item.margin >= 50 ? 'success' 
                                : item.margin >= 25 ? 'warning' 
                                : 'error'
                              }
                              sx={{ fontSize: '0.7rem', height: 20 }}
                            />
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={() => handleUpdateItemCost(item.id, item.cost)}
                            disabled={!item.cost}
                          >
                            Update
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
            
            {/* Summary Cards */}
            <Grid container spacing={2} sx={{ mt: 3 }}>
              <Grid item xs={12} sm={6} md={3}>
                <Card elevation={1} sx={{ bgcolor: 'success.light', color: 'white' }}>
                  <CardContent>
                    <Typography variant="h6">
                      {getItemsWithCostData().filter(item => item.margin >= 50).length}
                    </Typography>
                    <Typography variant="body2">High Profit Items</Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Card elevation={1} sx={{ bgcolor: 'warning.light', color: 'white' }}>
                  <CardContent>
                    <Typography variant="h6">
                      {getItemsWithCostData().filter(item => item.margin >= 25 && item.margin < 50).length}
                    </Typography>
                    <Typography variant="body2">Medium Profit Items</Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Card elevation={1} sx={{ bgcolor: 'error.light', color: 'white' }}>
                  <CardContent>
                    <Typography variant="h6">
                      {getItemsWithCostData().filter(item => item.margin < 25).length}
                    </Typography>
                    <Typography variant="body2">Low/Loss Items</Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Card elevation={1} sx={{ bgcolor: 'primary.light', color: 'white' }}>
                  <CardContent>
                    <Typography variant="h6">
                      ₱{getItemsWithCostData().reduce((sum, item) => sum + item.profit, 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </Typography>
                    <Typography variant="body2">Total Profit Potential</Typography>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>

            <Alert severity="info" sx={{ mt: 3 }}>
              <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 1 }}>
                Cost Management Tips:
              </Typography>
              <Typography variant="body2">
                • Aim for 50%+ profit margins on high-volume items<br/>
                • Review items with low margins - consider price increases or cost reductions<br/>
                • Items showing losses need immediate attention<br/>
                • Update cost data regularly to reflect ingredient price changes
              </Typography>
            </Alert>
          </CardContent>
        </Card>
      )}
    </Box>
    <AddByDateDialog 
      open={calendarOpen} 
      date={selectedDate} 
      onClose={() => setCalendarOpen(false)} 
      onAdd={handleAddByDate}
      recent={transactions.slice(0, 12)}
      scheduleInfo={selectedDate ? getDailyScheduleCosts(selectedDate) : { employees: [], totalCost: 0 }}
      onAssign={async (ids, targetDate) => {
        // Ensure targetDate is an ISO at local noon so server dateOnly becomes the intended YYYY-MM-DD
        let isoDate = targetDate;
        if (/^\d{4}-\d{2}-\d{2}$/.test(String(targetDate))) {
          isoDate = manilaNoonISOFromYMD(targetDate);
        }
        // assign selected transaction ids to targetDate (pass ISO)
        const patches = ids.map(id => operationsAPI.updateOperation(id, { date: isoDate }));
        try {
          await Promise.all(patches);
        } catch (e) { /* ignore individual errors */ }
        const refreshed = await operationsAPI.fetchOperations();
  setTransactions(refreshed.map(s => ({ type: s.type, amount: Number(s.amount), note: s.note || '', date: s.createdAt || s.date || manilaNoonISOFromYMD(new Date()), id: s.id })));
      }}
    />
    </>
  );
};

// Add dialog outside main component return to keep code organized
function AddByDateDialog({ open, date, onClose, onAdd, recent = [], scheduleInfo = { employees: [], totalCost: 0 }, onAssign }) {
  const [local, setLocal] = useState({ type: 'income', amount: '', note: '' });
  const [selectedIds, setSelectedIds] = useState([]);
  useEffect(() => { if (date) { setLocal({ type: 'income', amount: '', note: '' }); setSelectedIds([]); } }, [date]);
  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box>
          <Typography variant="h6">Add transaction for {date}</Typography>
          {scheduleInfo.employees.length > 0 && (
            <Alert severity="info" sx={{ mt: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 0.5 }}>
                Scheduled Staff ({scheduleInfo.employees.length}):
              </Typography>
              <Typography variant="body2">
                {scheduleInfo.employees.map(emp => emp.displayName).join(', ')}
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 'bold', mt: 0.5 }}>
                Total Daily Wages: ₱{scheduleInfo.totalCost.toLocaleString()}
              </Typography>
            </Alert>
          )}
        </Box>
      </DialogTitle>
      <DialogContent>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>Create new</Typography>
        <FormControl fullWidth sx={{ mb: 1 }}>
          <Select native value={local.type} onChange={e => setLocal(l => ({ ...l, type: e.target.value }))}>
            <option value="income">Income</option>
            <option value="expense">Expense</option>
            <option value="investment">Investment</option>
          </Select>
        </FormControl>
        <TextField label="Amount" fullWidth type="number" value={local.amount} onChange={e => setLocal(l => ({ ...l, amount: e.target.value }))} sx={{ mb: 1 }} />
        <TextField label="Note" fullWidth value={local.note} onChange={e => setLocal(l => ({ ...l, note: e.target.value }))} sx={{ mb: 2 }} />

        {/* Quick Action removed as requested */}

        <Divider sx={{ my: 2 }} />
        <Typography variant="subtitle2" sx={{ mb: 1 }}>Or assign recent transactions to {date}</Typography>
        <List dense sx={{ maxHeight: 240, overflow: 'auto' }}>
          {recent.map(r => (
            <ListItem key={r.id} button onClick={() => setSelectedIds(s => s.includes(r.id) ? s.filter(x => x !== r.id) : [...s, r.id])} selected={selectedIds.includes(r.id)}>
              <ListItemText primary={`${r.type.toUpperCase()} ₱${Number(r.amount).toLocaleString()}`} secondary={r.note || ''} />
            </ListItem>
          ))}
        </List>
      </DialogContent>
        <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={async () => { if (Number(local.amount) && local.type) { await onAdd({ ...local, date: date, amount: Number(local.amount) }); toast.success('Transaction saved'); } if (selectedIds.length && onAssign) { await onAssign(selectedIds, date); } onClose(); }} variant="contained">Save</Button>
      </DialogActions>
    </Dialog>
  );
}

export default Operations;
