import React, { useState, useEffect } from 'react';
import {
  Grid,
  Card,
  CardContent,
  Typography,
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
  Box,
  Avatar,
  Switch,
  FormControlLabel,
  FormControl,
  Fab,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  ListItemSecondaryAction,
  Divider,
  Tabs,
  Tab,
  Alert,
  InputLabel,
  Select,
  MenuItem,
  Stack,
  Pagination,
} from '@mui/material';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider, DatePicker, TimePicker, DateTimePicker } from '@mui/x-date-pickers';
import {
  Add,
  Edit,
  Delete,
  Person,
  AdminPanelSettings,
  Work,
  Email,
  Phone,
  Lock,
  LockOpen,
  Timeline,
  Schedule,
  CalendarToday,
  AccessTime,
  Event,
  Search,
  DeleteSweep,
  LocalShipping,
} from '@mui/icons-material';
import { Tooltip } from '@mui/material';

import Layout from '../components/Layout';
import { UserService, ActivityService, AnnouncementService, ScheduleService, AbsenceService } from '../services/firebaseServices';
import operationsAPI from '../services/firebaseOperationsAPI';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import toast from 'react-hot-toast';

const Users = () => {
  const { user, canManageUsers, users: authUsers, refreshData } = useAuth();
  const { users: socketUsers, updateLocalUsers, notifications } = useSocket();
  const [users, setUsers] = useState([]);
  const [userActivities, setUserActivities] = useState([]);
  const [activeTab, setActiveTab] = useState(0);
  const [openDialog, setOpenDialog] = useState(false);
  const [openActivityDialog, setOpenActivityDialog] = useState(false);
  const [openClearScheduleDialog, setOpenClearScheduleDialog] = useState(false);
  const [clearTargetUser, setClearTargetUser] = useState(null);
  // Clear all shifts confirmation
  const [openClearAllDialog, setOpenClearAllDialog] = useState(false);
  const [openAnnouncementDialog, setOpenAnnouncementDialog] = useState(false);
  const [announcementForm, setAnnouncementForm] = useState({ title: '', message: '', audience: 'all' });
  const [editingUser, setEditingUser] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [loading, setLoading] = useState(false);

  // Scheduling state
  const [shifts, setShifts] = useState([]);
  const [scheduleView, setScheduleView] = useState('week'); // 'week' or 'month'
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [openShiftDialog, setOpenShiftDialog] = useState(false);
  const [editingShift, setEditingShift] = useState(null);
  const [shiftForm, setShiftForm] = useState({
    employeeId: '',
    // Use full datetimes for easier scheduling
    startDateTime: new Date(),
    endDateTime: new Date(new Date().getTime() + 60 * 60 * 1000), // default +1 hour
    position: '',
    notes: ''
  });

  // Week day dialog state for clickable week overview
  const [openDayDialog, setOpenDayDialog] = useState(false);
  const [dayShifts, setDayShifts] = useState([]);
  const [dayDate, setDayDate] = useState(null);

  // Drag and drop state
  const [draggedShift, setDraggedShift] = useState(null);
  const [dragOverDay, setDragOverDay] = useState(null);

  // Smart scheduler state
  const [openRecurringDialog, setOpenRecurringDialog] = useState(false);
  const [recurringForm, setRecurringForm] = useState({
    employeeId: '',
    startTime: '08:00',
    endTime: '17:00',
    position: '',
    workDays: [1, 2, 3, 4, 5], // Mon-Fri by default
    restDays: [0, 6], // Sun, Sat by default
    startDate: (() => {
      // Get current PH date (UTC+8)
      const now = new Date();
      const phTime = new Date(now.getTime() + (8 * 60 * 60 * 1000)); // Add 8 hours for PH timezone
      return phTime.toISOString().split('T')[0];
    })(),
    duration: 4, // Number of weeks (1-12)
    notes: ''
  });

  // Absence tracking state
  const [absences, setAbsences] = useState([]);
  const [openAbsenceDialog, setOpenAbsenceDialog] = useState(false);
  const [absenceForm, setAbsenceForm] = useState({
    employeeId: '',
    date: new Date().toISOString().split('T')[0], // Today's date
    reason: ''
  });

  // Schedule filtering state
  const [scheduleFilters, setScheduleFilters] = useState({
    searchTerm: '',
    selectedEmployee: '',
    dateFrom: '',
    dateTo: '',
    position: ''
  });
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Helper: get all date objects for the month including leading/trailing days to fill weeks
  const monthDaysForDate = (date) => {
    const d = new Date(date.getFullYear(), date.getMonth(), 1);
    const firstWeekday = (d.getDay() + 6) % 7; // Make Monday=0
    const days = [];

    // Start from the Monday before (or equal) the first day
    const start = new Date(d);
    start.setDate(d.getDate() - firstWeekday);

    // 6 weeks grid to cover any month layout
    for (let i = 0; i < 42; i++) {
      const dt = new Date(start);
      dt.setDate(start.getDate() + i);
      days.push(dt);
    }

    return days;
  };

  // Helper: render the month grid as array of Grid items (polished cards)
  const renderMonthGrid = (date, shifts) => {
    const days = monthDaysForDate(date);
    return days.map((dt, idx) => {
      const inMonth = dt.getMonth() === date.getMonth();
      const dayShifts = shifts.filter(s => shiftCoversDate(s, dt));
      const dayLabel = new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(dt);
      const shortDate = dt.getDate();
      const tooltip = formatShiftTooltip(dayShifts);

      return (
        <Grid key={idx} item xs={12} sm={6} md={1.714} lg={1.714} sx={{ display: 'flex' }}>
          <Tooltip title={tooltip} arrow placement="top">
            <Paper
              elevation={2}
              onClick={() => {
                // open day dialog for clicks inside the month view
                setDayDate(new Date(dt));
                setDayShifts(dayShifts);
                setOpenDayDialog(true);
              }}
              sx={{
                width: '100%',
                p: 1.25,
                borderRadius: 3,
                minHeight: 96,
                textAlign: 'center',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                transition: 'transform 180ms ease, box-shadow 180ms ease',
                bgcolor: inMonth ? 'background.paper' : 'grey.50',
                '&:hover': {
                  transform: 'translateY(-6px)',
                  boxShadow: 8
                }
              }}
            >
              <Box sx={{
                width: 44,
                height: 44,
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                mb: 1,
                background: dayShifts.length > 0 ? 'linear-gradient(135deg,#6366f1 0%,#a78bfa 100%)' : 'linear-gradient(135deg,#f3f4f6 0%,#ffffff 100%)',
                color: dayShifts.length > 0 ? 'white' : 'text.primary',
                boxShadow: dayShifts.length > 0 ? '0 6px 18px rgba(99,102,241,0.18)' : 'none'
              }}>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  {shortDate}
                </Typography>
              </Box>

              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                {dayLabel}
              </Typography>

              <Typography variant="h6" sx={{ fontWeight: 700, mt: 0.5 }}>
                {dayShifts.length}
              </Typography>

              <Typography variant="caption" color="textSecondary">
                shifts
              </Typography>
            </Paper>
          </Tooltip>
        </Grid>
      );
    });
  };

  // User form state
  const [userForm, setUserForm] = useState({
    username: '',
    email: '',
    firstName: '',
    lastName: '',
    password: '',
    confirmPassword: '',
    role: 'employee',
    phone: '',
    address: '',
    dailyRate: '',
    department: '',
    hireDate: '',
    isActive: true,
  });

  useEffect(() => {
    // Use users from AuthContext instead of fetching separately (allow empty array to be set)
    if (Array.isArray(authUsers)) {
      setUsers(authUsers);
    }
  }, [authUsers]);

  // If the Scheduling tab is opened and we don't have users yet (non-admin session or delayed load),
  // fetch all users from the service so the Add Shift dialog can list employees.
  useEffect(() => {
    const ensureUsersForScheduling = async () => {
      try {
        if (activeTab === 3 && (!users || users.length === 0)) {
          const allUsers = await UserService.getAllUsers();
          if (Array.isArray(allUsers) && allUsers.length > 0) {
            setUsers(allUsers);
          }
        }
      } catch (err) {
        console.error('Failed to load users for scheduling:', err);
      }
    };

    ensureUsersForScheduling();
  }, [activeTab]);

  // Clear all shifts for a specific employee (admin action)
  const clearEmployeeSchedule = async (userId) => {
    if (!userId) return;
  closeDialogSafely(() => setOpenClearScheduleDialog(false));
    try {
      const allShifts = await ScheduleService.fetchShifts();
      const toDelete = allShifts.filter(s => s.employeeId === userId);
      if (toDelete.length === 0) {
        toast('No shifts found for this employee');
        return;
      }
      for (const s of toDelete) {
        try {
          await ScheduleService.deleteShift(s.id);
        } catch (err) {
          console.warn('Failed to delete shift', s.id, err);
        }
      }
      const refreshed = await ScheduleService.fetchShifts();
      setShifts(refreshed || []);
      toast.success(`Cleared ${toDelete.length} shifts for the employee`);
    } catch (error) {
      console.error('Error clearing schedule:', error);
      toast.error('Failed to clear schedule');
    }
  };

  // Clear ALL shifts in the system (admin action)
  const clearAllShifts = async () => {
  // Safely close the dialog (will blur active element first)
  closeDialogSafely(() => setOpenClearAllDialog(false));
    try {
      const allShifts = await ScheduleService.fetchShifts();
      if (!allShifts || allShifts.length === 0) {
        toast('No shifts to delete');
        return;
      }
      let deleted = 0;
      for (const s of allShifts) {
        try {
          await ScheduleService.deleteShift(s.id);
          deleted++;
        } catch (err) {
          console.warn('Failed to delete shift', s.id, err);
        }
      }
      setShifts([]);
      toast.success(`Deleted ${deleted} shifts`);
    } catch (err) {
      console.error('Failed clearing all shifts', err);
      toast.error('Failed to delete all shifts');
    }
  };


  // Load shifts from Firestore when Scheduling tab becomes active
  useEffect(() => {
    const loadShifts = async () => {
      try {
        if (activeTab === 3) {
          const fetched = await ScheduleService.fetchShifts();
          setShifts(fetched || []);
        }
      } catch (err) {
        console.error('Failed to load shifts:', err);
      }
    };

    loadShifts();
  }, [activeTab]);

  // Load absences from Firestore when Scheduling tab becomes active
  useEffect(() => {
    const loadAbsences = async () => {
      try {
        if (activeTab === 3) {
          const fetched = await AbsenceService.getAbsences();
          setAbsences(fetched || []);
        }
      } catch (err) {
        console.error('Failed to load absences:', err);
      }
    };

    loadAbsences();
  }, [activeTab]);

  // Also ensure users are loaded when the Add/Edit Shift dialog opens (covers delayed loads)
  useEffect(() => {
    const loadOnDialogOpen = async () => {
      try {
        if (openShiftDialog) {
          if (!users || users.length === 0) {
            const allUsers = await UserService.getAllUsers();
            if (Array.isArray(allUsers) && allUsers.length > 0) setUsers(allUsers);
          }
        }
      } catch (err) {
        console.error('Error fetching users on dialog open:', err);
      }
    };

    loadOnDialogOpen();
  }, [openShiftDialog]);

  // When opening the Add Shift dialog for a new shift, ensure the employee select is empty so
  // the placeholder 'Select an employee' is shown by default. Do not override when editing.
  useEffect(() => {
    if (openShiftDialog && !editingShift) {
      setShiftForm(prev => ({
        ...prev,
        employeeId: '',
        // ensure date/time defaults are sensible
        startDateTime: prev.startDateTime || new Date(),
        endDateTime: prev.endDateTime || new Date(new Date().getTime() + 60 * 60 * 1000),
      }));
    }
  }, [openShiftDialog, editingShift]);

  // Sync users from socket
  useEffect(() => {
    if (socketUsers.length > 0) {
      setUsers(socketUsers);
      updateLocalUsers(socketUsers);
    }
  }, [socketUsers, updateLocalUsers]);

  // Handle notifications for real-time updates
  useEffect(() => {
    notifications.forEach(notification => {
      if (notification.type === 'user_update') {
        toast(notification.message);
        // Users will be automatically updated through AuthContext
      }
    });
  }, [notifications]);

  const fetchUserActivity = async (userId) => {
    try {
      try {
        const activities = await ActivityService.getUserActivities(userId);
        setUserActivities(activities);
      } catch (apiError) {
        console.log('Error fetching user activity:', apiError.message);
        // Mock activity data as fallback
        const mockActivities = [
          { action: 'Logged in', timestamp: new Date().toISOString() },
          { action: 'Processed order #1234', timestamp: new Date(Date.now() - 3600000).toISOString() },
          { action: 'Updated menu item', timestamp: new Date(Date.now() - 7200000).toISOString() },
        ];
        setUserActivities(mockActivities);
      }
    } catch (error) {
      console.error('Error fetching user activity:', error);
      toast.error('Failed to load user activity');
    }
  };

  const handleCreateUser = async () => {
    try {
      // Validate required fields
      if (!userForm.username.trim()) {
        toast.error('Username is required');
        return;
      }
      
      if (!userForm.firstName.trim()) {
        toast.error('First name is required');
        return;
      }
      
      if (!userForm.lastName.trim()) {
        toast.error('Last name is required');
        return;
      }
      
      if (!editingUser && !userForm.password) {
        toast.error('Password is required');
        return;
      }
      
      if (userForm.password !== userForm.confirmPassword) {
        toast.error('Passwords do not match');
        return;
      }

      setLoading(true);
      
      try {
        if (editingUser) {
          await UserService.updateUser(editingUser.id, userForm);
          toast.success('User updated successfully!');
          // If role is employee, delivery, or manager and dailyRate provided, record today's wage as an expense
          if ((userForm.role === 'employee' || userForm.role === 'delivery' || userForm.role === 'manager') && userForm.dailyRate) {
            try {
              await operationsAPI.addOperation({
                type: 'expense',
                amount: Number(userForm.dailyRate),
                note: `Daily wage - ${userForm.firstName} ${userForm.lastName}`,
                date: new Date().toISOString()
              });
            } catch (opErr) {
              console.warn('Failed to record daily wage expense on update:', opErr);
            }
          }
          setOpenDialog(false);
          resetForm();
          await refreshData();
        } else {
          let result;
          try {
            result = await UserService.createUser(userForm);
          } catch (e) {
            if (e && e.code === 'ADMIN_ENDPOINT_UNAVAILABLE') {
              // Ask admin whether to proceed with client-side create that will sign them out
              const proceed = window.confirm('Server admin endpoint is not configured.\n\nProceeding will create the user on the client and will sign you out (you will need to log in again).\n\nClick OK to proceed, Cancel to abort.');
              if (!proceed) {
                setLoading(false);
                return;
              }
              // Force client fallback create
              result = await UserService.createUser(userForm, { forceClient: true });
            } else {
              throw e;
            }
          }

          if (result && result.success) {
            toast.success(result.message, {
              duration: 6000,
            });
            // If new user is employee or manager and has a dailyRate, record today's wage as an expense
            if ((userForm.role === 'employee' || userForm.role === 'manager') && userForm.dailyRate) {
              try {
                await operationsAPI.addOperation({
                  type: 'expense',
                  amount: Number(userForm.dailyRate),
                  note: `Daily wage - ${userForm.firstName} ${userForm.lastName}`,
                  date: new Date().toISOString()
                });
              } catch (opErr) {
                console.warn('Failed to record daily wage expense on create:', opErr);
              }
            }
            // Close dialog and reset only on success
            setOpenDialog(false);
            resetForm();
            // Don't refresh data here as the user will be logged out
          }
        }
      } catch (apiError) {
        console.error('Firebase Error:', apiError);
        // Handle some common Firebase/auth errors with friendlier messages
        const msg = (apiError && apiError.message) ? apiError.message : 'Unknown error';
        if (msg.includes('Username already exists')) {
          toast.error('Username already exists. Please choose a different username.');
        } else if (msg.includes('Email already in use') || msg.includes('auth/email-already-in-use')) {
          toast.error('Email is already registered. Use a different email or change the username.');
        } else if (msg.includes('Username is required')) {
          toast.error('Please provide a username.');
        } else {
          toast.error(`Failed to ${editingUser ? 'update' : 'create'} user: ${msg}`);
        }
        // Keep the dialog open so the admin can correct the input
      }
      // Refresh data to show the new user
      if (editingUser) {
        await refreshData();
      }
      // For new users, data refresh is handled above or skipped due to logout
    } catch (error) {
      console.error('Error saving user:', error);
      toast.error('Failed to save user');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (userId, isActive) => {
    try {
      await UserService.updateUser(userId, { isActive: !isActive });
      toast.success('User status updated!');
      // Refresh data to show the updated status
      await refreshData();
    } catch (error) {
      console.error('Error updating user status:', error);
      toast.error('Failed to update user status');
    }
  };

  const handleDeleteUser = async (userId) => {
    if (window.confirm('Are you sure you want to delete this user?')) {
      try {
        await UserService.deleteUser(userId);
        toast.success('User deleted successfully!');
        // Refresh data to remove the deleted user
        await refreshData();
      } catch (error) {
        console.error('Error deleting user:', error);
        toast.error('Failed to delete user');
      }
    }
  };

  const resetForm = () => {
    setUserForm({
      username: '',
      email: '',
      firstName: '',
      lastName: '',
      password: '',
      confirmPassword: '',
      role: 'employee',
      phone: '',
      address: '',
  dailyRate: '',
      department: '',
      hireDate: '',
      isActive: true,
    });
    setEditingUser(null);
  };

  // Helper to safely close dialogs by blurring active element first (prevents aria-hidden focus warnings)
  const closeDialogSafely = (closer) => {
    try {
      if (document && document.activeElement instanceof HTMLElement) document.activeElement.blur();
    } catch (e) {
      // ignore
    }
    // closer is a function that closes the specific dialog (e.g., () => setOpenClearAllDialog(false))
    try { if (typeof closer === 'function') closer(); } catch (e) { console.warn('Failed to run dialog closer', e); }
  };

  const openEditUser = (user) => {
    setUserForm({
      username: user.username,
      email: user.email || '',
      firstName: user.firstName,
      lastName: user.lastName,
      password: '',
      confirmPassword: '',
      role: user.role,
      phone: user.phone || '',
      address: user.address || '',
  dailyRate: user.dailyRate || user.hourlyRate || '',
      department: user.department || '',
      hireDate: user.hireDate || '',
      isActive: user.isActive,
    });
    setEditingUser(user);
    setOpenDialog(true);
  };

  const openUserActivity = async (user) => {
    setSelectedUser(user);
    await fetchUserActivity(user.id);
    setOpenActivityDialog(true);
  };

  // Shift Management Functions
  const handleSaveShift = async () => {
    try {
      if (!shiftForm.employeeId || !shiftForm.position) {
        toast.error('Please fill in all required fields');
        return;
      }
      // Validate time order
      if (new Date(shiftForm.startDateTime) >= new Date(shiftForm.endDateTime)) {
        toast.error('End time must be after start time');
        return;
      }

      // Check for overlapping shifts for the same employee
      const newStart = new Date(shiftForm.startDateTime);
      const newEnd = new Date(shiftForm.endDateTime);
      const conflictingShifts = shifts.filter(shift => {
        if (shift.employeeId !== shiftForm.employeeId) return false;
        if (!shift.startISO || !shift.endISO) return false;
        const s = new Date(shift.startISO);
        const e = new Date(shift.endISO);
        // overlap if start < existing end && end > existing start
        return newStart < e && newEnd > s && shift.id !== editingShift?.id;
      });

      if (conflictingShifts.length > 0) {
        const proceed = window.confirm(
          `This employee already has ${conflictingShifts.length} overlapping shift(s). Do you want to continue?`
        );
        if (!proceed) return;
      }

      const selectedEmployee = users.find(u => u.id === shiftForm.employeeId);
      const shiftData = {
        id: editingShift ? editingShift.id : Date.now().toString(),
        employeeId: shiftForm.employeeId,
        // store full display name in `name`
        name: `${selectedEmployee.firstName || selectedEmployee.username || ''} ${selectedEmployee.lastName || ''}`.trim(),
        // store ISO datetimes for accurate scheduling
        startISO: newStart.toISOString(),
        endISO: newEnd.toISOString(),
  // legacy/readable fields for UI (use local date to avoid UTC backdating)
  date: localDateISO(newStart),
        startTime: newStart.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        endTime: newEnd.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        // prefer provided position, otherwise use user's stored position/role
        position: shiftForm.position || selectedEmployee.position || selectedEmployee.role || 'employee',
        notes: shiftForm.notes
      };

      if (editingShift) {
        // Update existing shift in Firestore
        try {
          const patch = {
            name: shiftData.name,
            position: shiftData.position,
            notes: shiftData.notes,
            startISO: shiftData.startISO,
            endISO: shiftData.endISO,
            date: shiftData.date,
            startTime: shiftData.startTime,
            endTime: shiftData.endTime
          };
          await ScheduleService.updateShift(editingShift.id, patch);
          setShifts(prev => prev.map(sh => sh.id === editingShift.id ? { ...sh, ...shiftData } : sh));
          toast.success('Shift updated successfully!');
        } catch (err) {
          console.error('Failed to update shift in Firestore:', err);
          toast.error('Failed to update shift');
        }
      } else {
        // Create new shift in Firestore
        try {
          const created = await ScheduleService.createShift(shiftData);
          // created.id is the Firestore id; reconcile local state
          setShifts(prev => prev.map(s => s.id === shiftData.id ? { ...shiftData, id: created.id } : s));
          // If our optimistic add didn't exist (rare), ensure it's added
          setShifts(prev => {
            if (!prev.find(p => p.id === created.id)) return [...prev, { ...shiftData, id: created.id }];
            return prev;
          });
          toast.success('Shift added successfully!');
        } catch (err) {
          console.error('Failed to save shift to Firestore:', err);
          toast.error('Failed to save shift');
        }
      }

      // Reset form and close dialog
      setOpenShiftDialog(false);
      setEditingShift(null);
      setShiftForm({
        employeeId: '',
        startDateTime: new Date(),
        endDateTime: new Date(new Date().getTime() + 60 * 60 * 1000),
        position: '',
        notes: ''
      });
    } catch (error) {
      console.error('Error saving shift:', error);
      toast.error('Failed to save shift');
    }
  };

  const handleDeleteShift = async (shiftId) => {
    if (window.confirm('Are you sure you want to delete this shift?')) {
      try {
        // Attempt to delete from Firestore (if present)
        try {
          await ScheduleService.deleteShift(shiftId);
        } catch (err) {
          console.warn('Failed to delete shift from Firestore (may not exist):', err);
        }
        setShifts(prev => prev.filter(shift => shift.id !== shiftId));
        toast.success('Shift deleted successfully!');
      } catch (error) {
        console.error('Error deleting shift:', error);
        toast.error('Failed to delete shift');
      }
    }
  };

  // Absence handling functions
  const handleMarkAbsent = async () => {
    try {
      if (!absenceForm.employeeId) {
        toast.error('Please select an employee');
        return;
      }

      if (!absenceForm.date) {
        toast.error('Please select a date');
        return;
      }

      const selectedEmployee = users.find(u => u.id === absenceForm.employeeId);
      const employeeName = selectedEmployee ? `${selectedEmployee.firstName || selectedEmployee.username} ${selectedEmployee.lastName || ''}`.trim() : 'Unknown';

      const absenceData = await AbsenceService.markAbsent(
        absenceForm.employeeId,
        absenceForm.date,
        absenceForm.reason,
        user?.id
      );

      // Add to local state with employee name for display
      setAbsences(prev => [...prev, { ...absenceData, employeeName }]);
      
      // Reset form and close dialog
      setOpenAbsenceDialog(false);
      setAbsenceForm({
        employeeId: '',
        date: new Date().toISOString().split('T')[0],
        reason: ''
      });

      toast.success(`${employeeName} marked absent for ${new Date(absenceForm.date).toLocaleDateString()}`);
    } catch (error) {
      console.error('Error marking absent:', error);
      if (error.message.includes('already marked absent')) {
        toast.error('Employee is already marked absent for this date');
      } else {
        toast.error('Failed to mark employee absent');
      }
    }
  };

  const handleRemoveAbsence = async (absenceId, employeeName, date) => {
    if (window.confirm(`Remove absence for ${employeeName} on ${new Date(date).toLocaleDateString()}?`)) {
      try {
        await AbsenceService.removeAbsence(absenceId);
        setAbsences(prev => prev.filter(absence => absence.id !== absenceId));
        toast.success('Absence removed successfully');
      } catch (error) {
        console.error('Error removing absence:', error);
        toast.error('Failed to remove absence');
      }
    }
  };

  const formatDate = (date) => {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(new Date(date));
  };

  const formatDateTime = (date) => {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(date));
  };

  // Return local YYYY-MM-DD for a Date (avoids UTC shift when using toISOString())
  const localDateISO = (d) => {
    const dt = new Date(d);
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const day = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  // Check whether a shift spans/contains a particular date (by local YYYY-MM-DD)
  const shiftCoversDate = (shift, date) => {
    const dayStr = localDateISO(date);
    const startStr = shift.startISO ? localDateISO(new Date(shift.startISO)) : (shift.date || '');
    const endStr = shift.endISO ? localDateISO(new Date(shift.endISO)) : (shift.date || '');
    if (!startStr || !endStr) return false;
    return dayStr >= startStr && dayStr <= endStr;
  };

  // Determine dominant role/position color for a day's shifts
  const getDominantRoleColor = (shiftsForDay) => {
    if (!Array.isArray(shiftsForDay) || shiftsForDay.length === 0) return null;
    const counts = {};
    shiftsForDay.forEach(s => {
      const pos = (s.position || '').toLowerCase();
      let key = 'primary';
      if (pos.includes('manager')) key = 'warning';
      else if (pos.includes('server') || pos.includes('wait')) key = 'info';
      else if (pos.includes('cook') || pos.includes('kitchen')) key = 'success';
      else if (pos.includes('admin')) key = 'error';
      else if (pos.includes('bar')) key = 'secondary';
      counts[key] = (counts[key] || 0) + 1;
    });
    // pick the most frequent
    let best = null; let bestCount = 0;
    Object.keys(counts).forEach(k => { if (counts[k] > bestCount) { best = k; bestCount = counts[k]; } });
    return best ? `${best}.main` : 'primary.main';
  };

  // Build a small list of avatars (up to 2) for day preview
  const getDayAvatars = (shiftsForDay) => {
    if (!Array.isArray(shiftsForDay) || shiftsForDay.length === 0) return [];
    const unique = [];
    for (const s of shiftsForDay) {
      const name = s.name || '';
      if (!unique.find(u => u === name)) unique.push(name);
      if (unique.length >= 3) break;
    }
    return unique.slice(0, 3).map(n => ({ initials: (n.split(' ').map(p => p.charAt(0)).join('').slice(0,2) || 'NA'), name: n }));
  };

  // Calculate labor cost for shifts
  const calculateLaborCost = (shiftsArray) => {
    if (!Array.isArray(shiftsArray)) return 0;
    return shiftsArray.reduce((total, shift) => {
      if (!shift.startISO || !shift.endISO) return total;
      const hours = (new Date(shift.endISO) - new Date(shift.startISO)) / (1000 * 60 * 60);
      const employee = users.find(u => u.id === shift.employeeId);
      const rate = parseFloat(employee?.dailyRate || employee?.hourlyRate || 0);
      // If dailyRate, use it directly; if hourlyRate, multiply by hours
      const cost = employee?.dailyRate ? rate : (rate * hours);
      return total + cost;
    }, 0);
  };

  // Shift templates for quick creation
  const shiftTemplates = {
    morning: {
      label: 'Morning Shift',
      startHour: 7,
      startMinute: 0,
      endHour: 15,
      endMinute: 0,
      position: 'Server'
    },
    evening: {
      label: 'Evening Shift', 
      startHour: 15,
      startMinute: 0,
      endHour: 23,
      endMinute: 0,
      position: 'Server'
    },
    night: {
      label: 'Night Shift',
      startHour: 22,
      startMinute: 0,
      endHour: 6,
      endMinute: 0,
      position: 'Server'
    }
  };

  // Budget limits (could be moved to settings/config)
  const budgetLimits = {
    dailyLimit: 5000, // ₱5000 per day
    weeklyLimit: 30000 // ₱30000 per week
  };

  // Apply shift template
  const applyShiftTemplate = (templateKey) => {
    const template = shiftTemplates[templateKey];
    if (!template) return;

    const baseDate = shiftForm.startDateTime || new Date();
    const startDate = new Date(baseDate);
    startDate.setHours(template.startHour, template.startMinute, 0, 0);
    
    const endDate = new Date(startDate);
    if (template.endHour < template.startHour) {
      // Next day for night shifts
      endDate.setDate(endDate.getDate() + 1);
    }
    endDate.setHours(template.endHour, template.endMinute, 0, 0);

    setShiftForm(prev => ({
      ...prev,
      startDateTime: startDate,
      endDateTime: endDate,
      position: prev.position || template.position
    }));
  };

  // Format shift info for tooltip
  const formatShiftTooltip = (shiftsForDay) => {
    if (!Array.isArray(shiftsForDay) || shiftsForDay.length === 0) return 'No shifts scheduled';
    return shiftsForDay.map(s => 
      `${s.name || 'Unknown'}: ${s.startTime || ''}-${s.endTime || ''} (${s.position || 'Staff'})`
    ).join('\n');
  };

  // Check if costs exceed budget limits
  const checkBudgetAlerts = () => {
    const todayCost = calculateLaborCost(shifts.filter(s => shiftCoversDate(s, new Date())));
    const weekCost = calculateLaborCost(shifts.filter(s => {
      const today = new Date();
      const weekStart = new Date(today.setDate(today.getDate() - today.getDay()));
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      const start = s.startISO ? new Date(s.startISO) : new Date(s.date);
      const end = s.endISO ? new Date(s.endISO) : new Date(s.date);
      return start <= weekEnd && end >= weekStart;
    }));

    return {
      dailyAlert: todayCost > budgetLimits.dailyLimit,
      weeklyAlert: weekCost > budgetLimits.weeklyLimit,
      todayCost,
      weekCost
    };
  };

  // Drag and drop handlers
  const handleDragStart = (e, shift) => {
    setDraggedShift(shift);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, dayIndex) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverDay(dayIndex);
  };

  const handleDragLeave = () => {
    setDragOverDay(null);
  };

  const handleDrop = async (e, dayIndex) => {
    e.preventDefault();
    setDragOverDay(null);
    
    if (!draggedShift) return;

    // Calculate the target date
    const weekStart = new Date(selectedDate);
    weekStart.setDate(selectedDate.getDate() - selectedDate.getDay() + 1 + dayIndex);
    const targetDate = localDateISO(weekStart);

    // Update the shift with new date
    try {
      const updatedShift = {
        ...draggedShift,
        date: targetDate,
        startISO: (() => {
          const start = new Date(draggedShift.startISO);
          start.setFullYear(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate());
          return start.toISOString();
        })(),
        endISO: (() => {
          const end = new Date(draggedShift.endISO);
          end.setFullYear(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate());
          return end.toISOString();
        })()
      };

      await ScheduleService.updateShift(draggedShift.id, updatedShift);
      setShifts(prev => prev.map(s => s.id === draggedShift.id ? updatedShift : s));
      toast.success(`Shift moved to ${weekStart.toLocaleDateString()}`);
    } catch (error) {
      console.error('Error moving shift:', error);
      toast.error('Failed to move shift');
    }

    setDraggedShift(null);
  };

  // Smart recurring schedule functions
  const createRecurringSchedule = async () => {
    try {
      if (!recurringForm.employeeId) {
        toast.error('Please select an employee');
        return;
      }

      const employee = users.find(u => u.id === recurringForm.employeeId);
      if (!employee) {
        toast.error('Employee not found');
        return;
      }

      const startDate = new Date(recurringForm.startDate);
      const shiftsToCreate = [];

      const totalDays = recurringForm.duration * 7; // duration is now number of weeks

      for (let day = 0; day < totalDays; day++) {
        const currentDate = new Date(startDate);
        currentDate.setDate(startDate.getDate() + day);
        const dayOfWeek = currentDate.getDay(); // 0 = Sunday, 1 = Monday, etc.

        // Check if this day is a work day
        if (recurringForm.workDays.includes(dayOfWeek)) {
          // Create shift for this day using PH timezone
          const startDateTime = new Date(currentDate);
          const [startHour, startMinute] = recurringForm.startTime.split(':');
          startDateTime.setHours(parseInt(startHour), parseInt(startMinute), 0, 0);

          const endDateTime = new Date(currentDate);
          const [endHour, endMinute] = recurringForm.endTime.split(':');
          endDateTime.setHours(parseInt(endHour), parseInt(endMinute), 0, 0);

          const shiftData = {
            id: `recurring_${Date.now()}_${day}`,
            employeeId: recurringForm.employeeId,
            name: `${employee.firstName || employee.username} ${employee.lastName || ''}`.trim(),
            startISO: startDateTime.toISOString(),
            endISO: endDateTime.toISOString(),
            date: localDateISO(currentDate),
            startTime: startDateTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
            endTime: endDateTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
            position: recurringForm.position || employee.position || employee.role || 'Staff',
            notes: recurringForm.notes || 'Recurring schedule',
            isRecurring: true
          };

          shiftsToCreate.push(shiftData);
        }
      }

      if (shiftsToCreate.length === 0) {
        toast.error('No shifts to create with selected work days');
        return;
      }

      // Create all shifts in Firestore
      const createdShifts = [];
      for (const shiftData of shiftsToCreate) {
        try {
          const created = await ScheduleService.createShift(shiftData);
          createdShifts.push({ ...shiftData, id: created.id });
        } catch (err) {
          console.warn('Failed to create shift:', err);
        }
      }

      // Update local state
      setShifts(prev => [...prev, ...createdShifts]);

      toast.success(`Created ${createdShifts.length} recurring shifts for ${employee.firstName || employee.username}`);
      setOpenRecurringDialog(false);
      setRecurringForm({
        employeeId: '',
        startTime: '08:00',
        endTime: '17:00',
        position: '',
        workDays: [1, 2, 3, 4, 5],
        restDays: [0, 6],
        startDate: (() => {
          const now = new Date();
          const phTime = new Date(now.getTime() + (8 * 60 * 60 * 1000));
          return phTime.toISOString().split('T')[0];
        })(),
        duration: 4,
        notes: ''
      });

    } catch (error) {
      console.error('Error creating recurring schedule:', error);
      toast.error('Failed to create recurring schedule');
    }
  };

  const getDayName = (dayIndex) => {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[dayIndex];
  };

  const toggleWorkDay = (dayIndex) => {
    setRecurringForm(prev => {
      const workDays = prev.workDays.includes(dayIndex) 
        ? prev.workDays.filter(d => d !== dayIndex)
        : [...prev.workDays, dayIndex].sort();
      
      const restDays = [0, 1, 2, 3, 4, 5, 6].filter(d => !workDays.includes(d));
      
      return { ...prev, workDays, restDays };
    });
  };

  // Schedule filtering logic
  const getFilteredShifts = () => {
    let filtered = [...shifts];

    // Search by employee name
    if (scheduleFilters.searchTerm) {
      filtered = filtered.filter(shift => 
        shift.name?.toLowerCase().includes(scheduleFilters.searchTerm.toLowerCase())
      );
    }

    // Filter by selected employee
    if (scheduleFilters.selectedEmployee) {
      filtered = filtered.filter(shift => shift.employeeId === scheduleFilters.selectedEmployee);
    }

    // Filter by date range
    if (scheduleFilters.dateFrom) {
      filtered = filtered.filter(shift => shift.date >= scheduleFilters.dateFrom);
    }
    if (scheduleFilters.dateTo) {
      filtered = filtered.filter(shift => shift.date <= scheduleFilters.dateTo);
    }

    // Sort by date (newest first)
    filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

    return filtered;
  };

  const filteredShifts = getFilteredShifts();
  const totalPages = Math.ceil(filteredShifts.length / itemsPerPage);
  const paginatedShifts = filteredShifts.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const titleCase = (str) => {
    if (!str) return '';
    return String(str).split(' ').map(s => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()).join(' ');
  };

  const parseDateTime = (isoOrDate, dateStr, timeStr) => {
    if (!isoOrDate && dateStr && timeStr) {
      try {
        const combined = new Date(`${dateStr}T${timeStr}`);
        if (!isNaN(combined)) return combined;
      } catch (err) {
        // fallthrough
      }
    }
    if (isoOrDate) {
      try {
        return new Date(isoOrDate);
      } catch (err) {
        return new Date(isoOrDate);
      }
    }
    return new Date();
  };

  const getWeekRange = (date) => {
    const d = new Date(date);
    // Start week on Monday
    const day = d.getDay();
    const diffToMonday = (day + 6) % 7; // 0->Mon, 6->Sun
    const monday = new Date(d);
    monday.setDate(d.getDate() - diffToMonday);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const fmt = (dt) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(dt);
    return { from: fmt(monday), to: fmt(sunday) };
  };

  const getRoleColor = (role) => {
    switch (role) {
      case 'admin': return 'error';
      case 'manager': return 'warning';
      case 'employee': return 'primary';
      case 'delivery': return 'success';
      default: return 'default';
    }
  };

  const getRoleIcon = (role) => {
    switch (role) {
      case 'admin': return <AdminPanelSettings />;
      case 'manager': return <Work />;
      case 'employee': return <Person />;
      case 'delivery': return <LocalShipping />;
      default: return <Person />;
    }
  };

  // Helper function to check if an employee is absent on a specific date
  const isEmployeeAbsent = (employeeId, date) => {
    const dateStr = typeof date === 'string' ? date : date.toISOString().split('T')[0];
    return absences.some(absence => 
      absence.employeeId === employeeId && absence.date === dateStr
    );
  };

  const getAbsenceForEmployeeAndDate = (employeeId, date) => {
    const dateStr = typeof date === 'string' ? date : date.toISOString().split('T')[0];
    return absences.find(absence => 
      absence.employeeId === employeeId && absence.date === dateStr
    );
  };

  if (!canManageUsers()) {
    return (
      <Layout>
        <Typography variant="h4" gutterBottom>
          Access Denied
        </Typography>
        <Typography variant="body1">
          You don't have permission to manage users. Only administrators can access this section.
        </Typography>
      </Layout>
    );
  }

  return (
    <Layout>
    <Box sx={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" gutterBottom>
          Employee Management
        </Typography>
        <Box sx={{ display: 'flex', gap: 2 }}>
          {activeTab !== 3 && (
            <>
              <Button variant="outlined" onClick={() => setOpenAnnouncementDialog(true)}>New Announcement</Button>
              <Button
                variant="contained"
                startIcon={<Add />}
                onClick={() => setOpenDialog(true)}
              >
                Add Employee
              </Button>
            </>
          )}
        </Box>
      </Box>

      {/* Tabs (icons above labels; muted inactive color; active underline) */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs
          value={activeTab}
          onChange={(e, newValue) => setActiveTab(newValue)}
          TabIndicatorProps={{ sx: { height: 3, borderRadius: 3, bgcolor: 'primary.main' } }}
        >
          <Tab
            icon={<Person />}
            iconPosition="top"
            label="All Employees"
            sx={{ textTransform: 'none', color: 'text.secondary', '&.Mui-selected': { color: 'primary.main' }, '& .MuiTab-iconWrapper': { fontSize: 18, mb: 0.25 }, minHeight: 56 }}
          />
          <Tab
            icon={<AdminPanelSettings />}
            iconPosition="top"
            label="Admin Users"
            sx={{ textTransform: 'none', color: 'text.secondary', '&.Mui-selected': { color: 'primary.main' }, '& .MuiTab-iconWrapper': { fontSize: 18, mb: 0.25 }, minHeight: 56 }}
          />
          <Tab
            icon={<Timeline />}
            iconPosition="top"
            label="Statistics"
            sx={{ textTransform: 'none', color: 'text.secondary', '&.Mui-selected': { color: 'primary.main' }, '& .MuiTab-iconWrapper': { fontSize: 18, mb: 0.25 }, minHeight: 56 }}
          />
          <Tab
            icon={<Schedule />}
            iconPosition="top"
            label="Scheduling"
            sx={{ textTransform: 'none', color: 'text.secondary', '&.Mui-selected': { color: 'primary.main' }, '& .MuiTab-iconWrapper': { fontSize: 18, mb: 0.25 }, minHeight: 56 }}
          />
        </Tabs>
      </Box>

      {/* All Employees Tab */}
      {activeTab === 0 && (
        <Grid container spacing={3}>
          <Grid size={{ xs: 12 }}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Employee Directory
                </Typography>
                <TableContainer>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell>Employee</TableCell>
                        <TableCell>Role</TableCell>
                        <TableCell>Contact</TableCell>
                        <TableCell>Hire Date</TableCell>
                        <TableCell>Status</TableCell>
                        <TableCell>Actions</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {users.map((employee) => (
                        <TableRow key={employee.id}>
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center' }}>
                              <Avatar sx={{ mr: 2, bgcolor: 'primary.main' }}>
                                {employee.firstName.charAt(0)}{employee.lastName.charAt(0)}
                              </Avatar>
                              <Box>
                                <Typography variant="subtitle1">
                                  {employee.firstName} {employee.lastName}
                                </Typography>
                                <Typography variant="body2" color="textSecondary">
                                  @{employee.username}
                                </Typography>
                              </Box>
                            </Box>
                          </TableCell>
                          <TableCell>
                            <Chip
                              icon={getRoleIcon(employee.role)}
                              label={employee.role.charAt(0).toUpperCase() + employee.role.slice(1)}
                              color={getRoleColor(employee.role)}
                              size="small"
                            />
                          </TableCell>
                          <TableCell>
                            <Box>
                              <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center' }}>
                                <Email sx={{ fontSize: 16, mr: 0.5 }} />
                                {employee.email || 'No email'}
                              </Typography>
                              <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center' }}>
                                <Phone sx={{ fontSize: 16, mr: 0.5 }} />
                                {employee.phone || 'No phone'}
                              </Typography>
                            </Box>
                          </TableCell>
                          <TableCell>
                            {employee.hireDate ? formatDate(employee.hireDate) : 'Not set'}
                          </TableCell>
                          <TableCell>
                            <FormControlLabel
                              control={
                                <Switch
                                  checked={employee.isActive}
                                  onChange={() => handleToggleActive(employee.id, employee.isActive)}
                                  size="small"
                                />
                              }
                              label={employee.isActive ? 'Active' : 'Inactive'}
                            />
                          </TableCell>
                          <TableCell>
                            <IconButton onClick={() => openUserActivity(employee)}>
                              <Timeline />
                            </IconButton>
                            <IconButton onClick={() => openEditUser(employee)}>
                              <Edit />
                            </IconButton>
                            <IconButton 
                              onClick={() => handleDeleteUser(employee.id)}
                              color="error"
                              disabled={employee.id === user.id}
                            >
                              <Delete />
                            </IconButton>
                            <IconButton
                              onClick={() => { setClearTargetUser(employee); setOpenClearScheduleDialog(true); }}
                              color="warning"
                              disabled={employee.id === user.id}
                              title="Clear all shifts for this employee"
                            >
                              <DeleteSweep />
                            </IconButton>
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

      {/* Admin Users Tab */}
      {activeTab === 1 && (
        <Grid container spacing={3}>
          <Grid size={{ xs: 12 }}>
            <Alert severity="warning" sx={{ mb: 3 }}>
              Admin users have full access to the system. Be careful when modifying admin accounts.
            </Alert>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Administrative Users
                </Typography>
                <List>
                  {users.filter(u => u.role === 'admin').map((admin) => (
                    <React.Fragment key={admin.id}>
                      <ListItem>
                        <ListItemAvatar>
                          <Avatar sx={{ bgcolor: 'error.main' }}>
                            <AdminPanelSettings />
                          </Avatar>
                        </ListItemAvatar>
                        <ListItemText
                          primary={`${admin.firstName} ${admin.lastName}`}
                          secondary={
                            <Box>
                              <Typography variant="body2">
                                Username: @{admin.username}
                              </Typography>
                              <Typography variant="body2">
                                Email: {admin.email || 'Not set'}
                              </Typography>
                              <Typography variant="body2">
                                Status: {admin.isActive ? 'Active' : 'Inactive'}
                              </Typography>
                            </Box>
                          }
                        />
                        <ListItemSecondaryAction>
                          <IconButton onClick={() => openEditUser(admin)}>
                            <Edit />
                          </IconButton>
                          <IconButton 
                            onClick={() => handleToggleActive(admin.id, admin.isActive)}
                            disabled={admin.id === user.id}
                          >
                            {admin.isActive ? <Lock /> : <LockOpen />}
                          </IconButton>
                          <IconButton
                            onClick={() => { setClearTargetUser(admin); setOpenClearScheduleDialog(true); }}
                            title="Clear schedule"
                          >
                            <Delete color="error" />
                          </IconButton>
                        </ListItemSecondaryAction>
                      </ListItem>
                      <Divider />
                    </React.Fragment>
                  ))}
                </List>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Statistics Tab */}
      {activeTab === 2 && (
        <Grid container spacing={3}>
          <Grid size={{ xs: 12 }}>
            <Alert severity="info" sx={{ mb: 3 }}>
              <Typography variant="h6" gutterBottom>
                Role Permissions
              </Typography>
              <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle2" color="error">
                  <AdminPanelSettings sx={{ verticalAlign: 'middle', mr: 1 }} />
                  Administrator:
                </Typography>
                <Typography variant="body2" sx={{ ml: 3, mb: 1 }}>
                  • Full access to all system features
                  • Manage users, view reports, manage menu
                  • Process orders, access all dashboards
                </Typography>

                <Typography variant="subtitle2" color="warning.main">
                  <Work sx={{ verticalAlign: 'middle', mr: 1 }} />
                  Manager:
                </Typography>
                <Typography variant="body2" sx={{ ml: 3, mb: 1 }}>
                  • View reports and analytics
                  • Manage menu items and categories
                  • Process and cancel orders
                  • Cannot manage users
                </Typography>

                <Typography variant="subtitle2" color="primary">
                  <Person sx={{ verticalAlign: 'middle', mr: 1 }} />
                  Employee:
                </Typography>
                <Typography variant="body2" sx={{ ml: 3 }}>
                  • View menu (read-only)
                  • Process and cancel orders
                  • Cannot access reports or user management
                  • Cannot modify menu items
                </Typography>
              </Box>
            </Alert>
          </Grid>
          
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Paper sx={{ p: 2, textAlign: 'center' }}>
              <Typography variant="h4" color="primary">
                {users.length}
              </Typography>
              <Typography variant="body2">Total Employees</Typography>
            </Paper>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Paper sx={{ p: 2, textAlign: 'center' }}>
              <Typography variant="h4" color="error">
                {users.filter(u => u.role === 'admin').length}
              </Typography>
              <Typography variant="body2">Administrators</Typography>
            </Paper>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Paper sx={{ p: 2, textAlign: 'center' }}>
              <Typography variant="h4" color="success.main">
                {users.filter(u => u.isActive).length}
              </Typography>
              <Typography variant="body2">Active Users</Typography>
            </Paper>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Paper sx={{ p: 2, textAlign: 'center' }}>
              <Typography variant="h4" color="warning.main">
                {users.filter(u => !u.isActive).length}
              </Typography>
              <Typography variant="body2">Inactive Users</Typography>
            </Paper>
          </Grid>

          <Grid size={{ xs: 12 }}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Role Distribution
                </Typography>
                <TableContainer>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell>Role</TableCell>
                        <TableCell>Count</TableCell>
                        <TableCell>Percentage</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {['admin', 'manager', 'employee'].map((role) => {
                        const count = users.filter(u => u.role === role).length;
                        const percentage = users.length > 0 ? Math.round((count / users.length) * 100) : 0;
                        return (
                          <TableRow key={role}>
                            <TableCell>
                              <Chip
                                icon={getRoleIcon(role)}
                                label={role.charAt(0).toUpperCase() + role.slice(1)}
                                color={getRoleColor(role)}
                                size="small"
                              />
                            </TableCell>
                            <TableCell>{count}</TableCell>
                            <TableCell>{percentage}%</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Scheduling Tab */}
      {activeTab === 3 && (
        <LocalizationProvider dateAdapter={AdapterDateFns}>
          <Grid container spacing={3}>
            {/* Scheduling Header */}
            <Grid size={{ xs: 12 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h5">Employee Scheduling</Typography>
                <Stack direction="row" spacing={2}>
                  <Button
                    variant="outlined"
                    onClick={() => setScheduleView(scheduleView === 'week' ? 'month' : 'week')}
                    startIcon={<CalendarToday />}
                  >
                    {scheduleView === 'week' ? 'Monthly View' : 'Weekly View'}
                  </Button>
                  <Button
                    variant="contained"
                    color="primary"
                    onClick={() => setOpenRecurringDialog(true)}
                    startIcon={<Schedule />}
                  >
                    Smart Schedule
                  </Button>
                  <Button
                    variant="outlined"
                    onClick={() => setOpenShiftDialog(true)}
                    startIcon={<Add />}
                    size="small"
                  >
                    Single Shift
                  </Button>
                  <Button
                    variant="outlined"
                    color="error"
                    onClick={() => setOpenAbsenceDialog(true)}
                    startIcon={<Person />}
                  >
                    Mark Absent
                  </Button>
                </Stack>
              </Box>
            </Grid>

            {/* Date Navigation */}
            <Grid size={{ xs: 12 }}>
              <Card sx={{ mb: 3 }}>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <DatePicker
                      label="Select Date"
                      value={selectedDate}
                      onChange={setSelectedDate}
                      slotProps={{ textField: { size: 'small' } }}
                    />
                    <Typography variant="h6">
                      {scheduleView === 'week' ? (
                        (() => {
                          const r = getWeekRange(selectedDate);
                          return `Week of ${r.from} - ${r.to}`;
                        })()
                      ) : (
                        `Month of ${new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date(selectedDate))}`
                      )}
                    </Typography>
                  </Box>
                </CardContent>
              </Card>
            </Grid>

            {/* Current Shifts */}
            <Grid size={{ xs: 12, md: 8 }}>
              <Card>
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                    <Typography variant="h6">
                      Scheduled Shifts
                    </Typography>
                    <Chip 
                      label={`${scheduleView === 'week' ? 'Weekly' : 'Monthly'} View`} 
                      color="primary" 
                      size="small" 
                    />
                  </Box>
                  
                  {scheduleView === 'week' && (
                    <Box sx={{ mb: 3 }}>
                      <Typography variant="subtitle2" color="textSecondary" gutterBottom>
                        Week Schedule Overview
                      </Typography>
                      <Grid container spacing={1}>
                        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, index) => {
                          const weekStart = new Date(selectedDate);
                          weekStart.setDate(selectedDate.getDate() - selectedDate.getDay() + 1 + index);
                          const dayShifts = shifts.filter(shift => shiftCoversDate(shift, weekStart));
                          
                          return (
                            <Grid size={{ xs: 12/7 }} key={day}>
                              <Tooltip 
                                title={formatShiftTooltip(dayShifts)}
                                arrow
                                placement="top"
                              >
                                <Paper 
                                  onClick={() => {
                                    const weekStart = new Date(selectedDate);
                                    weekStart.setDate(selectedDate.getDate() - selectedDate.getDay() + 1 + index);
                                    
                                    if (dayShifts.length === 0) {
                                      // Empty day - create new shift
                                      const dayStart = new Date(weekStart);
                                      dayStart.setHours(9, 0, 0, 0); // Default 9 AM
                                      const dayEnd = new Date(dayStart.getTime() + 8 * 60 * 60 * 1000); // +8 hours
                                      
                                      setShiftForm({
                                        employeeId: '',
                                        startDateTime: dayStart,
                                        endDateTime: dayEnd,
                                        position: '',
                                        notes: ''
                                      });
                                      setEditingShift(null);
                                      setOpenShiftDialog(true);
                                    } else {
                                      // Day has shifts - show day dialog
                                      setDayDate(new Date(weekStart));
                                      setDayShifts(dayShifts);
                                      setOpenDayDialog(true);
                                    }
                                  }}
                                sx={{ 
                                  p: 1, 
                                  textAlign: 'center', 
                                  minHeight: 110,
                                  cursor: 'pointer',
                                  // Color-code by dominant role; fall back to primary
                                  bgcolor: dayShifts.length > 0 ? getDominantRoleColor(dayShifts) : 'grey.100',
                                  color: dayShifts.length > 0 ? 'common.white' : 'text.primary',
                                  transition: 'transform 180ms ease, box-shadow 180ms ease, background-color 180ms ease',
                                  '&:hover': {
                                    transform: 'translateY(-4px)',
                                    boxShadow: 6,
                                  },
                                  borderRadius: 2,
                                  position: 'relative',
                                  overflow: 'visible',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  justifyContent: 'space-between',
                                  border: dragOverDay === index ? '2px dashed' : 'none',
                                  borderColor: dragOverDay === index ? 'primary.main' : 'transparent'
                                }}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => { if (e.key === 'Enter') { const weekStart = new Date(selectedDate); weekStart.setDate(selectedDate.getDate() - selectedDate.getDay() + 1 + index); setDayDate(new Date(weekStart)); setDayShifts(dayShifts); setOpenDayDialog(true); } }}
                                onDragOver={(e) => handleDragOver(e, index)}
                                onDragLeave={handleDragLeave}
                                onDrop={(e) => handleDrop(e, index)}
                              >
                                <Box sx={{ flex: 1 }}>
                                  <Typography variant="caption" fontWeight="bold">
                                    {day}
                                  </Typography>
                                  <Typography variant="h6" sx={{ color: 'inherit', fontWeight: 600 }}>
                                    {dayShifts.length}
                                  </Typography>
                                  <Typography variant="caption" sx={{ color: 'inherit' }}>
                                    {dayShifts.length === 1 ? 'shift' : 'shifts'}
                                  </Typography>
                                </Box>
                                {/* Avatars preview at bottom */}
                                {dayShifts.length > 0 && (
                                  <Box sx={{ display: 'flex', justifyContent: 'center', gap: 0.5, mt: 1 }}>
                                    {getDayAvatars(dayShifts).slice(0,2).map((a, i) => (
                                      <Avatar key={i} sx={{ width: 24, height: 24, fontSize: 10, border: '1px solid', borderColor: 'common.white', bgcolor: 'rgba(255,255,255,0.2)', color: 'common.white' }}>
                                        {a.initials}
                                      </Avatar>
                                    ))}
                                    {dayShifts.length > 2 && (
                                      <Typography variant="caption" sx={{ color: 'inherit', alignSelf: 'center', ml: 0.5 }}>
                                        +{dayShifts.length - 2}
                                      </Typography>
                                    )}
                                  </Box>
                                )}
                              </Paper>
                              </Tooltip>
                            </Grid>
                          );
                        })}
                      </Grid>
                    </Box>
                  )}

                  {scheduleView === 'month' && (
                    <Box sx={{ mb: 3 }}>
                      <Typography variant="subtitle2" color="textSecondary" gutterBottom>
                        Month Schedule Overview
                      </Typography>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                        <Button size="small" onClick={() => {
                          const d = new Date(selectedDate);
                          d.setMonth(d.getMonth() - 1);
                          setSelectedDate(d);
                        }}>Previous</Button>
                        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                          {new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date(selectedDate))}
                        </Typography>
                        <Button size="small" onClick={() => {
                          const d = new Date(selectedDate);
                          d.setMonth(d.getMonth() + 1);
                          setSelectedDate(d);
                        }}>Next</Button>
                      </Box>

                      <Grid container spacing={2}>
                        {renderMonthGrid(selectedDate, shifts)}
                      </Grid>
                    </Box>
                  )}

                  {/* Filtering Controls */}
                  <Card sx={{ 
                    mb: 3, 
                    borderRadius: 3, 
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
                    background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
                    border: '1px solid rgba(0, 0, 0, 0.08)'
                  }}>
                    <CardContent sx={{ pb: 2 }}>
                      <Box sx={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center', 
                        mb: 3,
                        pb: 2,
                        borderBottom: '2px solid',
                        borderImage: 'linear-gradient(90deg, #3b82f6, #8b5cf6) 1'
                      }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                          <Box sx={{
                            p: 1.5,
                            borderRadius: 2,
                            background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}>
                            <Search sx={{ color: 'white', fontSize: 20 }} />
                          </Box>
                          <Typography variant="h6" sx={{ 
                            fontWeight: 700, 
                            background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
                            backgroundClip: 'text',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            fontSize: '1.3rem'
                          }}>
                            Filter Schedules
                          </Typography>
                        </Box>
                        <Chip 
                          label={`${filteredShifts.length} shift${filteredShifts.length !== 1 ? 's' : ''} found`}
                          sx={{
                            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                            color: 'white',
                            fontWeight: 600,
                            fontSize: '0.75rem',
                            '& .MuiChip-label': {
                              px: 2,
                              py: 0.5
                            }
                          }}
                          size="small"
                        />
                      </Box>
                      <Grid container spacing={2} alignItems="center">
                        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                          <TextField
                            fullWidth
                            size="small"
                            label="Search"
                            placeholder="Employee name..."
                            value={scheduleFilters.searchTerm}
                            onChange={(e) => setScheduleFilters(prev => ({ ...prev, searchTerm: e.target.value }))}
                            InputProps={{
                              startAdornment: (
                                <Search sx={{ color: 'action.active', mr: 1 }} />
                              ),
                            }}
                            sx={{
                              '& .MuiOutlinedInput-root': {
                                borderRadius: 2,
                              }
                            }}
                          />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6, md: 2.5 }}>
                          <FormControl fullWidth size="small">
                            <InputLabel>Employee</InputLabel>
                            <Select
                              value={scheduleFilters.selectedEmployee}
                              onChange={(e) => setScheduleFilters(prev => ({ ...prev, selectedEmployee: e.target.value }))}
                              label="Employee"
                              sx={{
                                borderRadius: 2,
                              }}
                            >
                              <MenuItem value="">All Employees</MenuItem>
                              {users.map((user) => (
                                <MenuItem key={user.id} value={user.id}>
                                  {user.firstName ? `${user.firstName} ${user.lastName}` : user.username}
                                </MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6, md: 2 }}>
                          <TextField
                            fullWidth
                            size="small"
                            type="date"
                            label="From Date"
                            value={scheduleFilters.dateFrom}
                            onChange={(e) => setScheduleFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
                            InputLabelProps={{ shrink: true }}
                            sx={{
                              '& .MuiOutlinedInput-root': {
                                borderRadius: 2,
                              }
                            }}
                          />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6, md: 2 }}>
                          <TextField
                            fullWidth
                            size="small"
                            type="date"
                            label="To Date"
                            value={scheduleFilters.dateTo}
                            onChange={(e) => setScheduleFilters(prev => ({ ...prev, dateTo: e.target.value }))}
                            InputLabelProps={{ shrink: true }}
                            sx={{
                              '& .MuiOutlinedInput-root': {
                                borderRadius: 2,
                              }
                            }}
                          />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6, md: 1.25 }}>
                          <Button
                            fullWidth
                            variant="outlined"
                            size="small"
                            onClick={() => {
                              setScheduleFilters({
                                searchTerm: '',
                                selectedEmployee: '',
                                dateFrom: '',
                                dateTo: '',
                                position: ''
                              });
                              setCurrentPage(1);
                            }}
                            sx={{
                              borderRadius: 3,
                              textTransform: 'none',
                              fontWeight: 600,
                              minHeight: 42,
                              borderWidth: 2,
                              borderColor: '#e2e8f0',
                              color: '#64748b',
                              fontSize: '0.8rem',
                              letterSpacing: '0.5px',
                              '&:hover': {
                                borderColor: '#cbd5e1',
                                backgroundColor: '#f8fafc',
                                transform: 'translateY(-1px)',
                                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                              },
                              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                            }}
                          >
                            Clear
                          </Button>
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6, md: 1.25 }}>
                          <Tooltip title="Remove all shifts" arrow>
                            <IconButton
                              onClick={() => setOpenClearAllDialog(true)}
                              aria-label="Remove all shifts"
                              size="large"
                              sx={{
                                width: 56,
                                height: 56,
                                borderRadius: 3,
                                background: 'linear-gradient(135deg, #e53e3e 0%, #c53030 100%)',
                                color: 'white',
                                boxShadow: '0 8px 24px rgba(197, 48, 48, 0.28)',
                                '&:hover': {
                                  background: 'linear-gradient(135deg, #c53030 0%, #9c2a2a 100%)',
                                  transform: 'translateY(-2px)',
                                  boxShadow: '0 12px 40px rgba(197, 48, 48, 0.36)'
                                },
                                transition: 'all 0.18s ease-in-out',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                            >
                              <DeleteSweep sx={{ fontSize: 22 }} />
                            </IconButton>
                          </Tooltip>
                        </Grid>
                      </Grid>
                    </CardContent>
                  </Card>

                  {/* Filter Results Summary */}
                  {(scheduleFilters.searchTerm || scheduleFilters.selectedEmployee || scheduleFilters.dateFrom || scheduleFilters.dateTo) && (
                    <Alert severity="info" sx={{ mb: 2 }}>
                      Showing {filteredShifts.length} of {shifts.length} shifts
                      {scheduleFilters.searchTerm && ` matching "${scheduleFilters.searchTerm}"`}
                      {scheduleFilters.selectedEmployee && ` for ${users.find(u => u.id === scheduleFilters.selectedEmployee)?.firstName || 'selected employee'}`}
                      {(scheduleFilters.dateFrom || scheduleFilters.dateTo) && 
                        ` ${scheduleFilters.dateFrom ? `from ${scheduleFilters.dateFrom}` : ''} ${scheduleFilters.dateTo ? `to ${scheduleFilters.dateTo}` : ''}`
                      }
                    </Alert>
                  )}

                  <Card sx={{ borderRadius: 2, boxShadow: 2 }}>
                    <TableContainer>
                      <Table>
                        <TableHead>
                          <TableRow sx={{ backgroundColor: 'grey.50' }}>
                            <TableCell sx={{ fontWeight: 600 }}>Employee</TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>Date</TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>Time</TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>Position</TableCell>
                            <TableCell sx={{ fontWeight: 600 }} align="center">Actions</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {filteredShifts.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={5} align="center">
                                <Box sx={{ py: 6 }}>
                                  <Schedule sx={{ fontSize: 64, color: 'grey.300', mb: 2 }} />
                                  <Typography variant="h6" color="textSecondary" gutterBottom>
                                    {shifts.length === 0 
                                      ? "No shifts scheduled"
                                      : "No matching shifts found"
                                    }
                                  </Typography>
                                  <Typography variant="body2" color="textSecondary">
                                    {shifts.length === 0 
                                      ? "Click \"Smart Schedule\" to get started."
                                      : "Try adjusting your search criteria."
                                    }
                                  </Typography>
                                </Box>
                              </TableCell>
                            </TableRow>
                          ) : (
                            paginatedShifts.map((shift, index) => (
                              <TableRow 
                                key={shift.id}
                                sx={{ 
                                  '&:nth-of-type(even)': { backgroundColor: 'grey.25' },
                                  '&:hover': { backgroundColor: 'action.hover' },
                                  transition: 'background-color 0.2s ease'
                                }}
                              >
                                <TableCell>
                                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                    <Avatar 
                                      sx={{ 
                                        mr: 2, 
                                        bgcolor: 'primary.main',
                                        width: 36,
                                        height: 36,
                                        fontSize: '0.9rem'
                                      }}
                                    >
                                      {shift.name?.charAt(0)}
                                    </Avatar>
                                    <Box>
                                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                        {shift.name}
                                      </Typography>
                                      {isEmployeeAbsent(shift.employeeId, shift.date) && (
                                        <Chip 
                                          label="ABSENT" 
                                          size="small" 
                                          color="error" 
                                          variant="filled"
                                          sx={{ 
                                            mt: 0.5, 
                                            fontSize: '0.65rem',
                                            height: 18,
                                            fontWeight: 600
                                          }}
                                        />
                                      )}
                                    </Box>
                                  </Box>
                                </TableCell>
                                <TableCell>
                                  <Box>
                                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                      {new Date(shift.date).toLocaleDateString()}
                                    </Typography>
                                    <Typography variant="caption" color="textSecondary">
                                      {new Date(shift.date).toLocaleDateString('en-US', { weekday: 'long' })}
                                    </Typography>
                                  </Box>
                                </TableCell>
                                <TableCell>
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <AccessTime sx={{ fontSize: 16, color: 'grey.500' }} />
                                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                      {shift.startTime} - {shift.endTime}
                                    </Typography>
                                  </Box>
                                </TableCell>
                                <TableCell>
                                  <Chip 
                                    label={shift.position} 
                                    size="small" 
                                    color="primary" 
                                    variant="outlined"
                                    sx={{ 
                                      fontWeight: 500,
                                      borderRadius: 2
                                    }}
                                  />
                                </TableCell>
                                <TableCell align="center">
                                  <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                                    <IconButton 
                                      onClick={() => {
                                        setEditingShift(shift);
                                        // Populate DateTime fields for editing. Prefer ISO datetimes when available.
                                        const parseDateTime = (iso, dateStr, timeStr) => {
                                          if (iso) return new Date(iso);
                                          try {
                                            if (dateStr && timeStr) {
                                              // combine date and time into a single datetime
                                              const combined = new Date(`${dateStr}T${timeStr}`);
                                              if (!isNaN(combined)) return combined;
                                            }
                                          } catch (err) {
                                            // fallthrough
                                          }
                                          return new Date();
                                        };

                                        setShiftForm({
                                          employeeId: shift.employeeId,
                                          startDateTime: parseDateTime(shift.startISO, shift.date, shift.startTime),
                                          endDateTime: parseDateTime(shift.endISO, shift.date, shift.endTime),
                                          position: shift.position,
                                          notes: shift.notes || ''
                                        });
                                        setOpenShiftDialog(true);
                                      }}
                                      size="small"
                                      sx={{
                                        color: 'primary.main',
                                        '&:hover': { backgroundColor: 'primary.50' }
                                      }}
                                    >
                                      <Edit />
                                    </IconButton>
                                    <IconButton 
                                      onClick={() => handleDeleteShift(shift.id)}
                                      size="small"
                                      sx={{
                                        color: 'error.main',
                                        '&:hover': { backgroundColor: 'error.50' }
                                      }}
                                    >
                                      <Delete />
                                    </IconButton>
                                  </Box>
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Card>

                  {/* Pagination Controls */}
                  {filteredShifts.length > 0 && (
                    <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography variant="body2" color="textSecondary">
                        Showing {((currentPage - 1) * itemsPerPage) + 1}-{Math.min(currentPage * itemsPerPage, filteredShifts.length)} of {filteredShifts.length} shifts
                      </Typography>
                      <Pagination
                        count={totalPages}
                        page={currentPage}
                        onChange={(event, page) => setCurrentPage(page)}
                        color="primary"
                        size="small"
                      />
                    </Box>
                  )}
                </CardContent>
              </Card>
            </Grid>

            {/* Quick Stats */}
            <Grid size={{ xs: 12, md: 4 }}>
              <Stack spacing={2}>
                <Card>
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                      <CalendarToday sx={{ mr: 1, color: 'primary.main' }} />
                      <Typography variant="h6">
                        Today's Schedule
                      </Typography>
                    </Box>
                    <Typography variant="h4" color="primary.main" gutterBottom>
                      {shifts.filter(s => shiftCoversDate(s, new Date())).length}
                    </Typography>
                    <Typography variant="body2" color="textSecondary">
                      shifts scheduled for today
                    </Typography>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                      <Schedule sx={{ mr: 1, color: 'success.main' }} />
                      <Typography variant="h6">
                        This Week
                      </Typography>
                    </Box>
                    <Typography variant="h4" color="success.main" gutterBottom>
                      {shifts.filter(s => {
                        const today = new Date();
                        const weekStart = new Date(today.setDate(today.getDate() - today.getDay()));
                        const weekEnd = new Date(weekStart);
                        weekEnd.setDate(weekStart.getDate() + 6);
                        // include shifts that cover any day in the week
                        return shiftCoversDate(s, weekStart) || shiftCoversDate(s, weekEnd) || (
                          (() => {
                            // fallback: check start/end date range inclusively
                            const start = s.startISO ? new Date(s.startISO) : new Date(s.date);
                            const end = s.endISO ? new Date(s.endISO) : new Date(s.date);
                            return start <= weekEnd && end >= weekStart;
                          })()
                        );
                      }).length}
                    </Typography>
                    <Typography variant="body2" color="textSecondary">
                      total shifts this week
                    </Typography>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                      <Person sx={{ mr: 1, color: 'info.main' }} />
                      <Typography variant="h6">
                        Available Staff
                      </Typography>
                    </Box>
                    <Typography variant="h4" color="info.main" gutterBottom>
                      {users.filter(u => u.isActive).length}
                    </Typography>
                    <Typography variant="body2" color="textSecondary">
                      active employees ready to work
                    </Typography>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      Labor Cost Tracking
                    </Typography>
                    <Box sx={{ mb: 2 }}>
                      <Typography variant="body2" color="textSecondary">
                        Today's Cost
                      </Typography>
                      <Typography variant="h5" color={checkBudgetAlerts().dailyAlert ? "error.main" : "warning.main"}>
                        ₱{checkBudgetAlerts().todayCost.toFixed(2)}
                        {checkBudgetAlerts().dailyAlert && (
                          <Typography variant="caption" color="error.main" sx={{ display: 'block' }}>
                            Over budget! (Limit: ₱{budgetLimits.dailyLimit})
                          </Typography>
                        )}
                      </Typography>
                    </Box>
                    <Box sx={{ mb: 2 }}>
                      <Typography variant="body2" color="textSecondary">
                        This Week's Cost
                      </Typography>
                      <Typography variant="h5" color={checkBudgetAlerts().weeklyAlert ? "error.main" : "info.main"}>
                        ₱{checkBudgetAlerts().weekCost.toFixed(2)}
                        {checkBudgetAlerts().weeklyAlert && (
                          <Typography variant="caption" color="error.main" sx={{ display: 'block' }}>
                            Over budget! (Limit: ₱{budgetLimits.weeklyLimit})
                          </Typography>
                        )}
                      </Typography>
                    </Box>
                    <Box>
                      <Typography variant="body2" color="textSecondary">
                        Average per Shift
                      </Typography>
                      <Typography variant="body1">
                        ₱{shifts.length > 0 ? (calculateLaborCost(shifts) / shifts.length).toFixed(2) : '0.00'}
                      </Typography>
                    </Box>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      Quick Actions
                    </Typography>
                    <Stack spacing={1}>
                      <Button
                        fullWidth
                        variant="outlined"
                        startIcon={<Event />}
                        onClick={() => {
                          const start = new Date();
                          const end = new Date(start.getTime() + 60 * 60 * 1000);
                          setShiftForm(prev => ({ ...prev, startDateTime: start, endDateTime: end }));
                          setOpenShiftDialog(true);
                        }}
                      >
                        Schedule Today
                      </Button>
                      <Button
                        fullWidth
                        variant="outlined"
                        startIcon={<AccessTime />}
                        onClick={() => {
                          const start = new Date();
                          start.setDate(start.getDate() + 1);
                          const end = new Date(start.getTime() + 60 * 60 * 1000);
                          setShiftForm(prev => ({ ...prev, startDateTime: start, endDateTime: end }));
                          setOpenShiftDialog(true);
                        }}
                      >
                        Schedule Tomorrow
                      </Button>
                    </Stack>
                  </CardContent>
                </Card>
              </Stack>
            </Grid>
          </Grid>
        </LocalizationProvider>
      )}

      {/* Add/Edit User Dialog */}
      <Dialog
        open={openDialog}
        onClose={() => closeDialogSafely(() => setOpenDialog(false))}
        maxWidth="md"
        fullWidth
        disableEnforceFocus
        disableAutoFocus
        disableRestoreFocus
        hideBackdrop={false}
        BackdropProps={{
          invisible: false,
        }}
        sx={{
          '& .MuiDialog-paper': {
            zIndex: 1300,
          },
          '& .MuiBackdrop-root': {
            zIndex: 1200,
          }
        }}
      >
        <DialogTitle>
          {editingUser ? 'Edit Employee' : 'Add New Employee'}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                label="Username"
                value={userForm.username}
                onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
                required
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                label="Email (Optional)"
                type="email"
                placeholder="user@example.com"
                value={userForm.email}
                onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                helperText="Email is optional. If not provided, a default will be generated."
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                label="First Name"
                value={userForm.firstName}
                onChange={(e) => setUserForm({ ...userForm, firstName: e.target.value })}
                required
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                label="Last Name"
                value={userForm.lastName}
                onChange={(e) => setUserForm({ ...userForm, lastName: e.target.value })}
                required
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                label="Password"
                type="password"
                value={userForm.password}
                onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                required={!editingUser}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                label="Confirm Password"
                type="password"
                value={userForm.confirmPassword}
                onChange={(e) => setUserForm({ ...userForm, confirmPassword: e.target.value })}
                required={!editingUser}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormControl component="fieldset">
                <Typography variant="subtitle2" gutterBottom>
                  Role
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <FormControlLabel
                    control={
                      <input
                        type="radio"
                        name="role"
                        value="employee"
                        checked={userForm.role === 'employee'}
                        onChange={(e) => {
                          setUserForm({ ...userForm, role: e.target.value });
                        }}
                      />
                    }
                    label="Employee"
                  />
                  <FormControlLabel
                    control={
                      <input
                        type="radio"
                        name="role"
                        value="delivery"
                        checked={userForm.role === 'delivery'}
                        onChange={(e) => {
                          setUserForm({ ...userForm, role: e.target.value });
                        }}
                      />
                    }
                    label="Delivery Person"
                  />
                  <FormControlLabel
                    control={
                      <input
                        type="radio"
                        name="role"
                        value="manager"
                        checked={userForm.role === 'manager'}
                        onChange={(e) => {
                          setUserForm({ ...userForm, role: e.target.value });
                        }}
                      />
                    }
                    label="Manager"
                  />
                  <FormControlLabel
                    control={
                      <input
                        type="radio"
                        name="role"
                        value="admin"
                        checked={userForm.role === 'admin'}
                        onChange={(e) => {
                          setUserForm({ ...userForm, role: e.target.value });
                        }}
                      />
                    }
                    label="Administrator"
                  />
                </Box>
              </FormControl>
              {/* Debug info */}
              <Typography variant="caption" sx={{ mt: 1, display: 'block' }}>
                Current role: {userForm.role || 'none'}
              </Typography>
            </Grid>
            <Grid size={{ xs: 12 }}>
              <Box sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                <Typography variant="subtitle2" gutterBottom>
                  Role Permissions:
                </Typography>
                <Typography variant="body2" color="textSecondary">
                  <strong>Employee:</strong> View menu, process orders, cancel orders<br/>
                  <strong>Delivery:</strong> View delivery orders, update delivery status, access delivery routes<br/>
                  <strong>Manager:</strong> Employee permissions + manage menu, view reports<br/>
                  <strong>Administrator:</strong> Full access to all features including user management
                </Typography>
              </Box>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                label="Phone"
                value={userForm.phone}
                onChange={(e) => setUserForm({ ...userForm, phone: e.target.value })}
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                label="Address"
                value={userForm.address}
                onChange={(e) => setUserForm({ ...userForm, address: e.target.value })}
                multiline
                rows={2}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                label="Daily Rate"
                type="number"
                step="0.01"
                value={userForm.dailyRate}
                onChange={(e) => setUserForm({ ...userForm, dailyRate: e.target.value })}
                InputProps={{ startAdornment: '₱' }}
                helperText="Enter the daily wage to be recorded as an expense"
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                label="Department"
                value={userForm.department}
                onChange={(e) => setUserForm({ ...userForm, department: e.target.value })}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                label="Hire Date"
                type="date"
                value={userForm.hireDate}
                onChange={(e) => setUserForm({ ...userForm, hireDate: e.target.value })}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={userForm.isActive}
                    onChange={(e) => setUserForm({ ...userForm, isActive: e.target.checked })}
                  />
                }
                label="Active"
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => closeDialogSafely(() => setOpenDialog(false))}>Cancel</Button>
          <Button
            onClick={handleCreateUser}
            variant="contained"
            disabled={loading || !userForm.username || !userForm.firstName || !userForm.lastName}
          >
            {editingUser ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* User Activity Dialog */}
      <Dialog
        open={openActivityDialog}
        onClose={() => closeDialogSafely(() => setOpenActivityDialog(false))}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          {selectedUser && `Activity Log - ${selectedUser.firstName} ${selectedUser.lastName}`}
        </DialogTitle>
        <DialogContent>
          <List>
            {userActivities.map((activity, index) => (
              <React.Fragment key={index}>
                <ListItem>
                  <ListItemText
                    primary={activity.action}
                    secondary={formatDateTime(activity.timestamp)}
                  />
                </ListItem>
                {index < userActivities.length - 1 && <Divider />}
              </React.Fragment>
            ))}
            {userActivities.length === 0 && (
              <Typography color="textSecondary">No activity recorded.</Typography>
            )}
          </List>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => closeDialogSafely(() => setOpenActivityDialog(false))}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Floating Action Button */}
      {activeTab !== 3 && (
        <Fab
          color="primary"
          aria-label="add employee"
          sx={{ position: 'fixed', bottom: 16, right: 16 }}
          onClick={() => setOpenDialog(true)}
        >
          <Add />
        </Fab>
      )}

      {/* Announcement Dialog */}
  <Dialog open={openAnnouncementDialog} onClose={() => closeDialogSafely(() => setOpenAnnouncementDialog(false))} fullWidth maxWidth="sm">
        <DialogTitle>New Announcement</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Title"
            value={announcementForm.title}
            onChange={(e) => setAnnouncementForm({ ...announcementForm, title: e.target.value })}
            sx={{ mb: 2 }}
          />
          <TextField
            fullWidth
            multiline
            minRows={3}
            label="Message"
            value={announcementForm.message}
            onChange={(e) => setAnnouncementForm({ ...announcementForm, message: e.target.value })}
            sx={{ mb: 2 }}
          />
          <FormControl fullWidth sx={{ mb: 1 }}>
            <InputLabel>Audience</InputLabel>
            <Select
              value={announcementForm.audience}
              label="Audience"
              onChange={(e) => setAnnouncementForm({ ...announcementForm, audience: e.target.value })}
            >
              <MenuItem value="all">All</MenuItem>
              <MenuItem value="employees">Employees</MenuItem>
              <MenuItem value="managers">Managers</MenuItem>
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => closeDialogSafely(() => setOpenAnnouncementDialog(false))}>Cancel</Button>
          <Button
            variant="contained"
            onClick={async () => {
              try {
                await AnnouncementService.createAnnouncement({
                  ...announcementForm,
                  createdBy: user?.id || null
                });
                setOpenAnnouncementDialog(false);
                setAnnouncementForm({ title: '', message: '', audience: 'all' });
                await refreshData();
                toast.success('Announcement sent');
              } catch (err) {
                console.error('Announcement error', err);
                toast.error('Failed to send announcement');
              }
            }}
          >
            Send
          </Button>
        </DialogActions>
      </Dialog>

      {/* Clear Schedule Confirmation Dialog */}
      <Dialog
        open={openClearScheduleDialog}
        onClose={() => closeDialogSafely(() => { setOpenClearScheduleDialog(false); setClearTargetUser(null); })}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>Clear Employee Schedule</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to permanently remove all scheduled shifts for {
              clearTargetUser ? `${clearTargetUser.firstName || clearTargetUser.username} ${clearTargetUser.lastName || ''}` : ''
            }?
          </Typography>
          <Typography variant="caption" color="textSecondary" sx={{ mt: 1, display: 'block' }}>
            This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => closeDialogSafely(() => { setOpenClearScheduleDialog(false); setClearTargetUser(null); })}>Cancel</Button>
              <Button
            color="error"
            variant="contained"
            onClick={async () => {
              if (!clearTargetUser) return;
              await clearEmployeeSchedule(clearTargetUser.id);
              closeDialogSafely(() => { setOpenClearScheduleDialog(false); setClearTargetUser(null); });
            }}
          >
            Clear Schedule
          </Button>
        </DialogActions>
      </Dialog>

      {/* Clear ALL Shifts Confirmation Dialog */}
      <Dialog
          open={openClearAllDialog}
          onClose={() => closeDialogSafely(() => setOpenClearAllDialog(false))}
          fullWidth
          maxWidth="xs"
        >
        <DialogTitle>Remove All Shifts</DialogTitle>
        <DialogContent>
          <Typography>
            This will permanently delete <b>all scheduled shifts</b> in the system. This cannot be undone.
          </Typography>
          <Typography variant="caption" color="textSecondary" sx={{ mt: 1, display: 'block' }}>
            Consider exporting or backing up schedules before proceeding.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => closeDialogSafely(() => setOpenClearAllDialog(false))}>Cancel</Button>
          <Button color="error" variant="contained" onClick={clearAllShifts}>Remove all</Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={openShiftDialog}
        onClose={() => {
          setOpenShiftDialog(false);
          setEditingShift(null);
          setShiftForm({
            employeeId: '',
            date: new Date(),
            startTime: new Date(),
            endTime: new Date(),
            position: '',
            notes: ''
          });
        }}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          {editingShift ? 'Edit Shift' : 'Add New Shift'}
        </DialogTitle>
        <DialogContent>
          <LocalizationProvider dateAdapter={AdapterDateFns}>
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid size={{ xs: 12 }}>
                <Typography variant="subtitle2" gutterBottom>
                  Quick Templates
                </Typography>
                <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => applyShiftTemplate('morning')}
                  >
                    Morning (7AM-3PM)
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => applyShiftTemplate('evening')}
                  >
                    Evening (3PM-11PM)
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => applyShiftTemplate('night')}
                  >
                    Night (10PM-6AM)
                  </Button>
                </Stack>
              </Grid>

              <Grid size={{ xs: 12, sm: 6 }}>
                {/* Use native select to avoid portal/z-index rendering issues inside modal */}
                <TextField
                  select
                  fullWidth
                  label="Employee"
                  value={shiftForm.employeeId}
                    onChange={(e) => {
                    const id = e.target.value;
                    const emp = users.find(u => u.id === id);
                    if (emp) {
                      const posSource = emp.position || emp.role || '';
                      const posTitle = titleCase(posSource);
                      // Auto-fill position from employee role/position
                      setShiftForm(prev => ({
                        ...prev,
                        employeeId: id,
                        position: posTitle
                      }));
                    } else {
                      setShiftForm(prev => ({ ...prev, employeeId: id }));
                    }
                  }}
                  SelectProps={{ native: true }}
                  InputLabelProps={{ shrink: true }}
                  sx={{ '& select': { paddingLeft: '12px', paddingRight: '12px' } }}
                >
                  {/* If a specific employee is selected, render them first so they always appear on top.
                      Otherwise show a disabled placeholder as the first option. */}
                  {(() => {
                    if (!Array.isArray(users) || users.length === 0) return (
                      <option value="">No employees loaded</option>
                    );

                    const selected = users.find(u => u.id === shiftForm.employeeId);

                    return (
                      <>
                        {!selected ? (
                          <option value="" disabled>Select an employee</option>
                        ) : (
                          // Show the selected employee first so it's visible at the top
                          <option key={selected.id} value={selected.id}>{`${selected.firstName || selected.username} ${selected.lastName || ''}`.trim()}</option>
                        )}

                        {users.filter(u => !selected || u.id !== selected.id).map((employee) => (
                          <option key={employee.id} value={employee.id}>
                            {`${employee.firstName || employee.username} ${employee.lastName || ''}`.trim()}
                          </option>
                        ))}
                      </>
                    );
                  })()}
                </TextField>
              </Grid>
              
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  fullWidth
                  label="Position"
                  value={shiftForm.position}
                  onChange={(e) => setShiftForm({ ...shiftForm, position: e.target.value })}
                  placeholder="e.g. Server, Kitchen Staff, Manager"
                />
              </Grid>

              <Grid size={{ xs: 12, sm: 6 }}>
                <DateTimePicker
                  label="Start"
                  value={shiftForm.startDateTime}
                  onChange={(newVal) => setShiftForm({ ...shiftForm, startDateTime: newVal })}
                  slotProps={{ textField: { fullWidth: true } }}
                />
              </Grid>

              <Grid size={{ xs: 12, sm: 6 }}>
                <DateTimePicker
                  label="End"
                  value={shiftForm.endDateTime}
                  onChange={(newVal) => setShiftForm({ ...shiftForm, endDateTime: newVal })}
                  slotProps={{ textField: { fullWidth: true } }}
                />
              </Grid>

              <Grid size={{ xs: 12 }}>
                <TextField
                  fullWidth
                  label="Notes (Optional)"
                  multiline
                  rows={3}
                  value={shiftForm.notes}
                  onChange={(e) => setShiftForm({ ...shiftForm, notes: e.target.value })}
                  placeholder="Special instructions, break times, etc."
                />
              </Grid>

              {/* Show existing shifts for selected employee */}
              {shiftForm.employeeId && (
                <Grid size={{ xs: 12 }}>
                  <Alert severity="info" sx={{ mt: 2 }}>
                    <Typography variant="subtitle2" gutterBottom>
                      Existing shifts for {(() => {
                        const u = users.find(u => u.id === shiftForm.employeeId);
                        return u ? `${u.firstName || u.username} ${u.lastName || ''}`.trim() : '';
                      })()}:
                    </Typography>
                    {shifts
                      .filter(s => s.employeeId === shiftForm.employeeId)
                      .slice(0, 3) // Show only next 3 shifts
                      .map(shift => (
                        <Typography key={shift.id} variant="body2" color="textSecondary">
                          • {shift.startISO ? formatDateTime(shift.startISO) : `${new Date(shift.date).toLocaleDateString()} ${shift.startTime}`} - {shift.endISO ? formatDateTime(shift.endISO) : shift.endTime} ({shift.position})
                        </Typography>
                      ))}
                    {shifts.filter(s => s.employeeId === shiftForm.employeeId).length === 0 && (
                      <Typography variant="body2" color="textSecondary">
                        No existing shifts found.
                      </Typography>
                    )}
                  </Alert>
                </Grid>
              )}
            </Grid>
          </LocalizationProvider>
        </DialogContent>
  {/* shiftForm debug removed */}
        <DialogActions>
          <Button onClick={() => {
            setOpenShiftDialog(false);
            setEditingShift(null);
            setShiftForm({
              employeeId: '',
              startDateTime: new Date(),
              endDateTime: new Date(new Date().getTime() + 60 * 60 * 1000),
              position: '',
              notes: ''
            });
          }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSaveShift}
            disabled={!shiftForm.employeeId || !(shiftForm.position && shiftForm.position.toString().trim().length > 0)}
          >
            {editingShift ? 'Update Shift' : 'Add Shift'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Day Shifts Dialog (opened by clicking a day in week overview) */}
      <Dialog
        open={openDayDialog}
        onClose={() => { setOpenDayDialog(false); setDayShifts([]); setDayDate(null); }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          {dayDate ? `Shifts on ${new Date(dayDate).toLocaleDateString()}` : 'Shifts'}
        </DialogTitle>
        <DialogContent>
          {dayShifts && dayShifts.length > 0 ? (
            <List>
              {dayShifts.map((s) => (
                <React.Fragment key={s.id}>
                  <ListItem
                    button
                    onClick={() => {
                      // Open the existing edit flow for this shift
                      setEditingShift(s);
                      setShiftForm({
                        employeeId: s.employeeId,
                        startDateTime: parseDateTime(s.startISO, s.date, s.startTime),
                        endDateTime: parseDateTime(s.endISO, s.date, s.endTime),
                        position: s.position,
                        notes: s.notes || ''
                      });
                      setOpenDayDialog(false);
                      setOpenShiftDialog(true);
                    }}
                  >
                    <ListItemAvatar>
                      <Avatar>{s.name?.charAt(0)}</Avatar>
                    </ListItemAvatar>
                    <ListItemText
                      primary={`${s.name} — ${s.position}`}
                      secondary={`${s.startTime} - ${s.endTime}`}
                    />
                    <ListItemSecondaryAction>
                      <IconButton edge="end" onClick={() => { handleDeleteShift(s.id); }}>
                        <Delete />
                      </IconButton>
                    </ListItemSecondaryAction>
                  </ListItem>
                  <Divider />
                </React.Fragment>
              ))}
            </List>
          ) : (
            <Typography color="textSecondary">No shifts scheduled for this day.</Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setOpenDayDialog(false); setDayShifts([]); setDayDate(null); }}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Mark Absent Dialog */}
      <Dialog
        open={openAbsenceDialog}
        onClose={() => {
          setOpenAbsenceDialog(false);
          setAbsenceForm({
            employeeId: '',
            date: new Date().toISOString().split('T')[0],
            reason: ''
          });
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Mark Employee Absent</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid size={{ xs: 12 }}>
              <TextField
                select
                fullWidth
                label="Employee"
                value={absenceForm.employeeId}
                onChange={(e) => setAbsenceForm(prev => ({ ...prev, employeeId: e.target.value }))}
                SelectProps={{ native: true }}
                InputLabelProps={{ shrink: true }}
              >
                <option value="" disabled>Select an employee</option>
                {Array.isArray(users) && users.length > 0 ? (
                  users.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {`${employee.firstName || employee.username} ${employee.lastName || ''}`.trim()}
                    </option>
                  ))
                ) : null}
              </TextField>
            </Grid>

            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                label="Date"
                type="date"
                value={absenceForm.date}
                onChange={(e) => setAbsenceForm(prev => ({ ...prev, date: e.target.value }))}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>

            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                label="Reason (Optional)"
                multiline
                rows={3}
                value={absenceForm.reason}
                onChange={(e) => setAbsenceForm(prev => ({ ...prev, reason: e.target.value }))}
                placeholder="Sick leave, personal day, vacation, etc."
              />
            </Grid>

            {/* Show existing absence if any */}
            {absenceForm.employeeId && absenceForm.date && (() => {
              const existingAbsence = getAbsenceForEmployeeAndDate(absenceForm.employeeId, absenceForm.date);
              if (existingAbsence) {
                const employee = users.find(u => u.id === absenceForm.employeeId);
                const employeeName = employee ? `${employee.firstName || employee.username} ${employee.lastName || ''}`.trim() : 'Employee';
                return (
                  <Grid size={{ xs: 12 }}>
                    <Alert severity="warning" sx={{ mt: 1 }}>
                      <Typography variant="subtitle2">
                        {employeeName} is already marked absent for {new Date(absenceForm.date).toLocaleDateString()}
                      </Typography>
                      <Typography variant="body2" color="textSecondary">
                        Reason: {existingAbsence.reason || 'No reason provided'}
                      </Typography>
                      <Button 
                        size="small" 
                        color="error" 
                        onClick={() => handleRemoveAbsence(existingAbsence.id, employeeName, existingAbsence.date)}
                        sx={{ mt: 1 }}
                      >
                        Remove Absence
                      </Button>
                    </Alert>
                  </Grid>
                );
              }
              return null;
            })()}
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => {
            setOpenAbsenceDialog(false);
            setAbsenceForm({
              employeeId: '',
              date: new Date().toISOString().split('T')[0],
              reason: ''
            });
          }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleMarkAbsent}
            disabled={!absenceForm.employeeId || !absenceForm.date || (() => {
              // Disable if employee is already absent for this date
              return getAbsenceForEmployeeAndDate(absenceForm.employeeId, absenceForm.date) !== undefined;
            })()}
          >
            Mark Absent
          </Button>
        </DialogActions>
      </Dialog>

      {/* Smart Recurring Schedule Dialog */}
      <Dialog
        open={openRecurringDialog}
        onClose={() => {
          setOpenRecurringDialog(false);
          setRecurringForm({
            employeeId: '',
            startTime: '08:00',
            endTime: '17:00',
            position: '',
            workDays: [1, 2, 3, 4, 5],
            restDays: [0, 6],
            startDate: new Date().toISOString().split('T')[0],
            duration: 'month',
            weeks: 4,
            notes: ''
          });
        }}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          Smart Recurring Schedule
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="textSecondary" sx={{ mb: 3 }}>
            Create recurring shifts for an employee with custom work days and rest days.
          </Typography>

          <Grid container spacing={3}>
            {/* Employee Selection */}
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                select
                fullWidth
                label="Employee"
                value={recurringForm.employeeId}
                onChange={(e) => {
                  const id = e.target.value;
                  const emp = users.find(u => u.id === id);
                  setRecurringForm(prev => ({
                    ...prev,
                    employeeId: id,
                    position: emp ? titleCase(emp.position || emp.role || '') : prev.position
                  }));
                }}
                SelectProps={{ native: true }}
                InputLabelProps={{ shrink: true }}
              >
                <option value="" disabled>Select an employee</option>
                {Array.isArray(users) && users.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {`${employee.firstName || employee.username} ${employee.lastName || ''}`.trim()}
                  </option>
                ))}
              </TextField>
            </Grid>

            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                label="Position"
                value={recurringForm.position}
                onChange={(e) => setRecurringForm(prev => ({ ...prev, position: e.target.value }))}
                placeholder="e.g. Server, Manager, Cook"
              />
            </Grid>

            {/* Time Settings */}
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                type="time"
                label="Start Time"
                value={recurringForm.startTime}
                onChange={(e) => setRecurringForm(prev => ({ ...prev, startTime: e.target.value }))}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>

            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                type="time"
                label="End Time"
                value={recurringForm.endTime}
                onChange={(e) => setRecurringForm(prev => ({ ...prev, endTime: e.target.value }))}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>

            {/* Work Days Selection */}
            <Grid size={{ xs: 12 }}>
              <Typography variant="subtitle2" gutterBottom>
                Work Days
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {[0, 1, 2, 3, 4, 5, 6].map((dayIndex) => (
                  <Button
                    key={dayIndex}
                    size="small"
                    variant={recurringForm.workDays.includes(dayIndex) ? "contained" : "outlined"}
                    color={recurringForm.workDays.includes(dayIndex) ? "primary" : "default"}
                    onClick={() => toggleWorkDay(dayIndex)}
                    sx={{ minWidth: 80 }}
                  >
                    {getDayName(dayIndex).slice(0, 3)}
                  </Button>
                ))}
              </Box>
              <Typography variant="caption" color="textSecondary" sx={{ mt: 1, display: 'block' }}>
                Rest Days: {recurringForm.restDays.map(d => getDayName(d).slice(0, 3)).join(', ')}
              </Typography>
            </Grid>

            {/* Duration Settings */}
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                type="date"
                label="Start Date"
                value={recurringForm.startDate}
                onChange={(e) => setRecurringForm(prev => ({ ...prev, startDate: e.target.value }))}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>

            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                type="number"
                label="Number of Weeks"
                value={recurringForm.duration}
                onChange={(e) => setRecurringForm(prev => ({ ...prev, duration: parseInt(e.target.value) || 1 }))}
                inputProps={{ min: 1, max: 52 }}
                helperText="How many weeks to schedule (1-52)"
              />
            </Grid>

            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                multiline
                rows={2}
                label="Notes (Optional)"
                value={recurringForm.notes}
                onChange={(e) => setRecurringForm(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Additional notes for this recurring schedule"
              />
            </Grid>

            {/* Preview */}
            {recurringForm.employeeId && (
              <Grid size={{ xs: 12 }}>
                <Alert severity="info">
                  <Typography variant="subtitle2" gutterBottom>
                    Schedule Preview
                  </Typography>
                  <Typography variant="body2">
                    <strong>Employee:</strong> {(() => {
                      const emp = users.find(u => u.id === recurringForm.employeeId);
                      return emp ? `${emp.firstName || emp.username} ${emp.lastName || ''}`.trim() : 'Unknown';
                    })()}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Work Days:</strong> {recurringForm.workDays.map(d => getDayName(d).slice(0, 3)).join(', ')}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Time:</strong> {recurringForm.startTime} - {recurringForm.endTime}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Duration:</strong> {recurringForm.duration} week{recurringForm.duration !== 1 ? 's' : ''}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Total Shifts:</strong> {(() => {
                      const totalDays = recurringForm.duration * 7;
                      let count = 0;
                      const startDate = new Date(recurringForm.startDate);
                      for (let day = 0; day < totalDays; day++) {
                        const currentDate = new Date(startDate);
                        currentDate.setDate(startDate.getDate() + day);
                        if (recurringForm.workDays.includes(currentDate.getDay())) {
                          count++;
                        }
                      }
                      return count;
                    })()}
                  </Typography>
                </Alert>
              </Grid>
            )}
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenRecurringDialog(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={createRecurringSchedule}
            disabled={!recurringForm.employeeId || recurringForm.workDays.length === 0}
          >
            Create Schedule
          </Button>
        </DialogActions>
      </Dialog>
    </Layout>
  );
};

export default Users;
