import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Avatar,
  Grid,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  Divider,
  Paper,
  Stack,
  Chip,
  Badge,
  alpha,
  useTheme
} from '@mui/material';
import {
  Edit as EditIcon,
  PhotoCamera,
  Delete as DeleteIcon,
  Save as SaveIcon,
  Cancel as CancelIcon,
  ArrowBack as ArrowBackIcon,
  Person,
  Email,
  Phone,
  AccountCircle,
  CalendarToday,
  Security
} from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { UserService } from '../services/firebaseServices';
import { updatePassword } from 'firebase/auth';
import { auth } from '../firebase';
import toast from 'react-hot-toast';
import Layout from '../components/Layout';

const Profile = () => {
  const { user, updateUser } = useAuth();
  const navigate = useNavigate();
  const theme = useTheme();
  
  const [profile, setProfile] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    username: '',
    role: '',
    profilePicture: null,
    createdAt: ''
  });
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: ''
  });
  const [passwordDialog, setPasswordDialog] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [loading, setLoading] = useState(true);
  const [pictureUrlDialog, setPictureUrlDialog] = useState(false);
  const [pictureUrl, setPictureUrl] = useState('');

  useEffect(() => {
    if (user) {
      setProfile({
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        email: user.email || '',
        phone: user.phone || '',
        username: user.username || '',
        role: user.role || '',
        profilePicture: user.profilePicture || null,
        createdAt: user.createdAt || ''
      });
      setEditForm({
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        email: user.email || '',
        phone: user.phone || ''
      });
      setLoading(false);
    }
  }, [user]);

  const handleEditToggle = () => {
    if (isEditing) {
      // Cancel editing - reset form
      setEditForm({
        firstName: profile.firstName,
        lastName: profile.lastName,
        email: profile.email,
        phone: profile.phone || ''
      });
    }
    setIsEditing(!isEditing);
  };

  const handleSaveProfile = async () => {
    try {
      console.log('Updating profile for user:', user.id);
      console.log('Update data:', editForm);
      
      // Update the user profile using Firebase
      await UserService.updateUser(user.id, {
        firstName: editForm.firstName,
        lastName: editForm.lastName,
        email: editForm.email,
        phone: editForm.phone
      });

      // Update the local context using the AuthContext updateUser method
      await updateUser(user.id, editForm);
      
      toast.success('Profile updated successfully');
      setProfile({ ...profile, ...editForm });
      setIsEditing(false);
    } catch (error) {
      console.error('Error updating profile:', error);
      toast.error('Error updating profile');
    }
  };

  const handlePasswordChange = async () => {
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }

    if (passwordForm.newPassword.length < 6) {
      toast.error('New password must be at least 6 characters');
      return;
    }

    try {
      // Update password using Firebase Auth
      const currentUser = auth.currentUser;
      if (currentUser) {
        await updatePassword(currentUser, passwordForm.newPassword);
        toast.success('Password updated successfully');
        setPasswordDialog(false);
        setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      } else {
        toast.error('User not authenticated');
      }
    } catch (error) {
      console.error('Error updating password:', error);
      if (error.code === 'auth/requires-recent-login') {
        toast.error('Please log out and log back in before changing your password');
      } else {
        toast.error('Error updating password');
      }
    }
  };

  const handleUpdatePictureUrl = async () => {
    if (!pictureUrl.trim()) {
      toast.error('Please enter a valid image URL');
      return;
    }

    try {
      // Update user document with the new profile picture URL
      await UserService.updateUser(user.id, {
        profilePicture: pictureUrl.trim()
      });
      
      // Update local state
      setProfile({ ...profile, profilePicture: pictureUrl.trim() });
      
      // Update the AuthContext
      await updateUser(user.id, { profilePicture: pictureUrl.trim() });
      
      toast.success('Profile picture updated successfully!');
      setPictureUrlDialog(false);
      setPictureUrl('');
      
    } catch (error) {
      console.error('Error updating profile picture:', error);
      toast.error('Failed to update profile picture. Please try again.');
    }
  };

  const handleDeletePicture = async () => {
    try {
      // Remove profile picture from user document
      await UserService.updateUser(user.id, {
        profilePicture: null
      });
      
      // Update local state
      setProfile({ ...profile, profilePicture: null });
      
      // Update the AuthContext
      await updateUser(user.id, { profilePicture: null });
      
      toast.success('Profile picture removed successfully');
    } catch (error) {
      console.error('Error removing picture:', error);
      toast.error('Error removing picture');
    }
  };

  const getRoleConfig = (role) => {
    switch (role) {
      case 'admin': 
        return { 
          color: '#ef4444', 
          bgcolor: alpha('#ef4444', 0.1),
          label: 'Admin'
        };
      case 'manager': 
        return { 
          color: '#f59e0b', 
          bgcolor: alpha('#f59e0b', 0.1),
          label: 'Manager'
        };
      case 'employee': 
        return { 
          color: '#3b82f6', 
          bgcolor: alpha('#3b82f6', 0.1),
          label: 'Employee'
        };
      default: 
        return { 
          color: '#6b7280', 
          bgcolor: alpha('#6b7280', 0.1),
          label: 'User'
        };
    }
  };

  if (loading) {
    return (
      <Layout>
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
          <Typography>Loading profile...</Typography>
        </Box>
      </Layout>
    );
  }

  return (
    <Layout>
      {/* Header Section */}
      <Box sx={{ 
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        borderRadius: 3,
        p: 4,
        mb: 4,
        color: 'white',
        position: 'relative',
        overflow: 'hidden'
      }}>
        <Box sx={{
          position: 'absolute',
          top: -50,
          right: -50,
          width: 100,
          height: 100,
          borderRadius: '50%',
          backgroundColor: 'rgba(255, 255, 255, 0.1)',
        }} />
        <Box sx={{
          position: 'absolute',
          bottom: -30,
          left: -30,
          width: 80,
          height: 80,
          borderRadius: '50%',
          backgroundColor: 'rgba(255, 255, 255, 0.05)',
        }} />
        
        <Box sx={{ display: 'flex', alignItems: 'center', position: 'relative', zIndex: 1 }}>
          <IconButton 
            onClick={() => navigate('/dashboard')}
            sx={{ 
              mr: 2,
              color: 'white',
              bgcolor: 'rgba(255, 255, 255, 0.1)',
              '&:hover': {
                bgcolor: 'rgba(255, 255, 255, 0.2)',
              }
            }}
          >
            <ArrowBackIcon />
          </IconButton>
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 'bold', mb: 1 }}>
              My Profile
            </Typography>
            <Typography variant="body1" sx={{ opacity: 0.9 }}>
              Manage your personal information and account settings
            </Typography>
          </Box>
        </Box>
      </Box>

      <Grid container spacing={4}>
        {/* Profile Card Section */}
        <Grid item xs={12} lg={4}>
          <Card sx={{ 
            borderRadius: 3,
            border: '1px solid #e0e0e0',
            overflow: 'hidden',
            height: 'fit-content'
          }}>
            {/* Profile Header */}
            <Box sx={{ 
              background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
              p: 4,
              textAlign: 'center',
              position: 'relative'
            }}>
              <Badge
                overlap="circular"
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                badgeContent={
                  <IconButton
                    onClick={() => setPictureUrlDialog(true)}
                    sx={{
                      width: 40,
                      height: 40,
                      bgcolor: '#667eea',
                      color: 'white',
                      '&:hover': { bgcolor: '#5a67d8' },
                      boxShadow: '0 4px 12px rgba(102, 126, 234, 0.4)'
                    }}
                  >
                    <PhotoCamera sx={{ fontSize: 20 }} />
                  </IconButton>
                }
              >
                <Avatar
                  src={profile.profilePicture || undefined}
                  sx={{ 
                    width: 120, 
                    height: 120, 
                    mx: 'auto',
                    border: '4px solid white',
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
                    fontSize: '2.5rem',
                    fontWeight: 'bold',
                    bgcolor: '#667eea'
                  }}
                >
                  {profile.firstName?.[0]}{profile.lastName?.[0]}
                </Avatar>
              </Badge>

              <Typography variant="h5" sx={{ fontWeight: 'bold', mt: 3, mb: 1, color: '#2d3748' }}>
                {profile.firstName} {profile.lastName}
              </Typography>
              
              <Chip
                label={getRoleConfig(profile.role).label}
                sx={{
                  bgcolor: getRoleConfig(profile.role).bgcolor,
                  color: getRoleConfig(profile.role).color,
                  fontWeight: 'bold',
                  fontSize: '0.875rem',
                  px: 2
                }}
              />

              {profile.profilePicture && (
                <Box sx={{ mt: 2 }}>
                  <Button
                    startIcon={<DeleteIcon />}
                    onClick={handleDeletePicture}
                    size="small"
                    sx={{ 
                      color: '#ef4444',
                      '&:hover': {
                        bgcolor: alpha('#ef4444', 0.1)
                      }
                    }}
                  >
                    Remove Picture
                  </Button>
                </Box>
              )}
            </Box>

            {/* Quick Stats */}
            <CardContent sx={{ p: 3 }}>
              <Typography variant="h6" sx={{ fontWeight: 'bold', mb: 2, color: '#2d3748' }}>
                Account Information
              </Typography>
              
              <Stack spacing={2}>
                <Box sx={{ display: 'flex', alignItems: 'center', p: 2, bgcolor: '#f8fafc', borderRadius: 2 }}>
                  <AccountCircle sx={{ color: '#667eea', mr: 2 }} />
                  <Box>
                    <Typography variant="caption" color="textSecondary">Username</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 'bold' }}>{profile.username}</Typography>
                  </Box>
                </Box>
                
                <Box sx={{ display: 'flex', alignItems: 'center', p: 2, bgcolor: '#f8fafc', borderRadius: 2 }}>
                  <CalendarToday sx={{ color: '#667eea', mr: 2 }} />
                  <Box>
                    <Typography variant="caption" color="textSecondary">Member Since</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                      {profile.createdAt ? (
                        profile.createdAt.toDate ? 
                          profile.createdAt.toDate().toLocaleDateString('en-US', { 
                            year: 'numeric', 
                            month: 'long', 
                            day: 'numeric' 
                          }) :
                          new Date(profile.createdAt).toLocaleDateString('en-US', { 
                            year: 'numeric', 
                            month: 'long', 
                            day: 'numeric' 
                          })
                      ) : 'N/A'}
                    </Typography>
                  </Box>
                </Box>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        {/* Profile Information */}
        <Grid item xs={12} lg={8}>
          <Card sx={{ 
            borderRadius: 3,
            border: '1px solid #e0e0e0'
          }}>
            <CardContent sx={{ p: 4 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
                <Box>
                  <Typography variant="h5" sx={{ fontWeight: 'bold', color: '#2d3748', mb: 1 }}>
                    Personal Information
                  </Typography>
                  <Typography variant="body2" color="textSecondary">
                    Update your personal details and contact information
                  </Typography>
                </Box>
                <Button
                  startIcon={isEditing ? <CancelIcon /> : <EditIcon />}
                  onClick={handleEditToggle}
                  variant={isEditing ? "outlined" : "contained"}
                  sx={{ 
                    borderRadius: 2,
                    px: 3,
                    ...(isEditing ? {} : {
                      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                      '&:hover': {
                        background: 'linear-gradient(135deg, #5a67d8 0%, #6b46c1 100%)',
                      }
                    })
                  }}
                >
                  {isEditing ? 'Cancel' : 'Edit Profile'}
                </Button>
              </Box>

              <Grid container spacing={3}>
                <Grid item xs={12} sm={6}>
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="caption" color="textSecondary" sx={{ mb: 1, display: 'block' }}>
                      First Name *
                    </Typography>
                    <TextField
                      fullWidth
                      value={isEditing ? editForm.firstName : profile.firstName}
                      onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })}
                      disabled={!isEditing}
                      variant={isEditing ? "outlined" : "filled"}
                      InputProps={{
                        startAdornment: <Person sx={{ mr: 1, color: '#94a3b8' }} />,
                        sx: { borderRadius: 2 }
                      }}
                    />
                  </Box>
                </Grid>
                
                <Grid item xs={12} sm={6}>
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="caption" color="textSecondary" sx={{ mb: 1, display: 'block' }}>
                      Last Name *
                    </Typography>
                    <TextField
                      fullWidth
                      value={isEditing ? editForm.lastName : profile.lastName}
                      onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })}
                      disabled={!isEditing}
                      variant={isEditing ? "outlined" : "filled"}
                      InputProps={{
                        startAdornment: <Person sx={{ mr: 1, color: '#94a3b8' }} />,
                        sx: { borderRadius: 2 }
                      }}
                    />
                  </Box>
                </Grid>
                
                <Grid item xs={12} sm={6}>
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="caption" color="textSecondary" sx={{ mb: 1, display: 'block' }}>
                      Email Address *
                    </Typography>
                    <TextField
                      fullWidth
                      type="email"
                      value={isEditing ? editForm.email : profile.email}
                      onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                      disabled={!isEditing}
                      variant={isEditing ? "outlined" : "filled"}
                      InputProps={{
                        startAdornment: <Email sx={{ mr: 1, color: '#94a3b8' }} />,
                        sx: { borderRadius: 2 }
                      }}
                    />
                  </Box>
                </Grid>
                
                <Grid item xs={12} sm={6}>
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="caption" color="textSecondary" sx={{ mb: 1, display: 'block' }}>
                      Phone Number
                    </Typography>
                    <TextField
                      fullWidth
                      value={isEditing ? editForm.phone : (profile.phone || '')}
                      onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                      disabled={!isEditing}
                      variant={isEditing ? "outlined" : "filled"}
                      placeholder="Enter phone number"
                      InputProps={{
                        startAdornment: <Phone sx={{ mr: 1, color: '#94a3b8' }} />,
                        sx: { borderRadius: 2 }
                      }}
                    />
                  </Box>
                </Grid>
              </Grid>

              {isEditing && (
                <Box sx={{ 
                  mt: 4,
                  p: 3,
                  bgcolor: '#f8fafc',
                  borderRadius: 2,
                  border: '1px solid #e2e8f0'
                }}>
                  <Typography variant="h6" sx={{ fontWeight: 'bold', mb: 2, color: '#2d3748' }}>
                    Save Changes
                  </Typography>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                    <Button
                      variant="contained"
                      startIcon={<SaveIcon />}
                      onClick={handleSaveProfile}
                      sx={{ 
                        borderRadius: 2,
                        px: 3,
                        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                        '&:hover': {
                          background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                        }
                      }}
                    >
                      Save Changes
                    </Button>
                    <Button
                      variant="outlined"
                      startIcon={<Security />}
                      onClick={() => setPasswordDialog(true)}
                      sx={{ 
                        borderRadius: 2,
                        px: 3,
                        borderColor: '#667eea',
                        color: '#667eea',
                        '&:hover': {
                          borderColor: '#5a67d8',
                          bgcolor: alpha('#667eea', 0.1)
                        }
                      }}
                    >
                      Change Password
                    </Button>
                  </Stack>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Enhanced Password Change Dialog */}
      <Dialog 
        open={passwordDialog} 
        onClose={() => setPasswordDialog(false)} 
        maxWidth="sm" 
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3
          }
        }}
      >
        <DialogTitle sx={{ 
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          gap: 2
        }}>
          <Security sx={{ fontSize: 28 }} />
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 'bold' }}>
              Change Password
            </Typography>
            <Typography variant="body2" sx={{ opacity: 0.9 }}>
              Update your account password for security
            </Typography>
          </Box>
        </DialogTitle>
        
        <DialogContent sx={{ p: 4 }}>
          <Alert severity="info" sx={{ mb: 3, borderRadius: 2 }}>
            Your new password must be at least 6 characters long and different from your current password.
          </Alert>
          
          <Stack spacing={3}>
            <Box>
              <Typography variant="caption" color="textSecondary" sx={{ mb: 1, display: 'block' }}>
                Current Password *
              </Typography>
              <TextField
                type="password"
                fullWidth
                value={passwordForm.currentPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                placeholder="Enter your current password"
                InputProps={{
                  sx: { borderRadius: 2 }
                }}
              />
            </Box>
            
            <Box>
              <Typography variant="caption" color="textSecondary" sx={{ mb: 1, display: 'block' }}>
                New Password *
              </Typography>
              <TextField
                type="password"
                fullWidth
                value={passwordForm.newPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                placeholder="Enter your new password"
                InputProps={{
                  sx: { borderRadius: 2 }
                }}
              />
            </Box>
            
            <Box>
              <Typography variant="caption" color="textSecondary" sx={{ mb: 1, display: 'block' }}>
                Confirm New Password *
              </Typography>
              <TextField
                type="password"
                fullWidth
                value={passwordForm.confirmPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                placeholder="Confirm your new password"
                error={passwordForm.confirmPassword && passwordForm.newPassword !== passwordForm.confirmPassword}
                helperText={
                  passwordForm.confirmPassword && passwordForm.newPassword !== passwordForm.confirmPassword 
                    ? "Passwords do not match" 
                    : ""
                }
                InputProps={{
                  sx: { borderRadius: 2 }
                }}
              />
            </Box>
          </Stack>
        </DialogContent>
        
        <DialogActions sx={{ p: 3, bgcolor: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
          <Button 
            onClick={() => setPasswordDialog(false)}
            size="large"
            sx={{ 
              borderRadius: 2,
              textTransform: 'none',
              px: 3
            }}
          >
            Cancel
          </Button>
          <Button 
            onClick={handlePasswordChange} 
            variant="contained"
            size="large"
            disabled={!passwordForm.currentPassword || !passwordForm.newPassword || passwordForm.newPassword !== passwordForm.confirmPassword}
            sx={{ 
              borderRadius: 2,
              textTransform: 'none',
              px: 4,
              background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
              '&:hover': {
                background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
              }
            }}
          >
            Change Password
          </Button>
        </DialogActions>
      </Dialog>

      {/* Picture URL Dialog */}
      <Dialog 
        open={pictureUrlDialog} 
        onClose={() => setPictureUrlDialog(false)} 
        maxWidth="sm" 
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.1)'
          }
        }}
      >
        <DialogTitle sx={{ 
          bgcolor: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: 'white',
          textAlign: 'center',
          py: 3
        }}>
          Update Profile Picture
        </DialogTitle>
        
        <DialogContent sx={{ p: 3 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Enter the URL of an image you'd like to use as your profile picture.
          </Typography>
          
          <TextField
            fullWidth
            label="Image URL"
            variant="outlined"
            value={pictureUrl}
            onChange={(e) => setPictureUrl(e.target.value)}
            placeholder="https://example.com/your-image.jpg"
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: 2,
              }
            }}
          />
          
          {pictureUrl && (
            <Box sx={{ mt: 2, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Preview:
              </Typography>
              <Avatar
                src={pictureUrl}
                sx={{ 
                  width: 80, 
                  height: 80, 
                  mx: 'auto',
                  border: '2px solid #e2e8f0'
                }}
              />
            </Box>
          )}
        </DialogContent>
        
        <DialogActions sx={{ p: 3, bgcolor: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
          <Button 
            onClick={() => {
              setPictureUrlDialog(false);
              setPictureUrl('');
            }}
            size="large"
            sx={{ 
              borderRadius: 2,
              textTransform: 'none',
              px: 3
            }}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleUpdatePictureUrl} 
            variant="contained"
            size="large"
            disabled={!pictureUrl.trim()}
            sx={{ 
              borderRadius: 2,
              textTransform: 'none',
              px: 4,
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              '&:hover': {
                background: 'linear-gradient(135deg, #5a67d8 0%, #6b46c1 100%)',
              }
            }}
          >
            Update Picture
          </Button>
        </DialogActions>
      </Dialog>
    </Layout>
  );
};

export default Profile;
