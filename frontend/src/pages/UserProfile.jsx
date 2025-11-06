import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import LoadingSpinner from '../components/LoadingSpinner';
import { toast } from 'react-hot-toast';

const UserProfile = () => {
  const { 
    user, 
    updateProfile, 
    changePassword, 
    sendEmailVerification, 
    isEmailVerified, 
    isMentor, 
    isMentee 
  } = useAuth();
  const navigate = useNavigate();

  // State management
  const [activeTab, setActiveTab] = useState('profile');
  const [editMode, setEditMode] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // Profile form state
  const [profileData, setProfileData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    location: '',
    timezone: ''
  });

  // Password change state
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  // Settings state
  const [settings, setSettings] = useState({
    emailNotifications: true,
    smsNotifications: false,
    marketingEmails: true,
    profileVisibility: 'public',
    sessionReminders: true
  });

  // File upload state
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState('');
  
  const [formErrors, setFormErrors] = useState({});

  // Helper function to safely render values
  const safeRender = (value, fallback = 'Not provided') => {
    if (value == null || value === '') return fallback;
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };


  const timezoneOptions = [
    'UTC', 'America/New_York', 'America/Los_Angeles', 'Europe/London',
    'Europe/Paris', 'Asia/Tokyo', 'Asia/Shanghai', 'Australia/Sydney'
  ];

  // Initialize form data
  useEffect(() => {
    if (user) {
      console.log('DEBUG: User object:', user);
      console.log('DEBUG: User fields types and values:');
      console.log('firstName:', typeof user.firstName, user.firstName);
      console.log('lastName:', typeof user.lastName, user.lastName);
      console.log('email:', typeof user.email, user.email);
      console.log('phone:', typeof user.phone, user.phone);
      console.log('location:', typeof user.location, user.location);
      console.log('timezone:', typeof user.timezone, user.timezone);
      console.log('avatarUrl:', typeof user.avatarUrl, user.avatarUrl);

      setProfileData({
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        email: user.email || '',
        phone: user.phone || '',
        location: user.location || '',
        timezone: user.timezone || 'UTC'
      });

      setSettings({
        emailNotifications: user.emailNotifications ?? true,
        smsNotifications: user.smsNotifications ?? false,
        marketingEmails: user.marketingEmails ?? true,
        profileVisibility: user.profileVisibility || 'public',
        sessionReminders: user.sessionReminders ?? true
      });

      setAvatarPreview(user.avatarUrl || '');
    }
  }, [user]);

  // Handle form input changes
  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    
    if (activeTab === 'profile') {
      setProfileData(prev => ({
        ...prev,
        [name]: type === 'checkbox' ? checked : value
      }));
    } else if (activeTab === 'password') {
      setPasswordData(prev => ({
        ...prev,
        [name]: value
      }));
    } else if (activeTab === 'settings') {
      setSettings(prev => ({
        ...prev,
        [name]: type === 'checkbox' ? checked : value
      }));
    }

    // Clear field errors
    if (formErrors[name]) {
      setFormErrors(prev => ({
        ...prev,
        [name]: undefined
      }));
    }
  };


  // Handle avatar upload
  const handleAvatarChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file size (5MB limit)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File size must be less than 5MB');
      return;
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please select a valid image file');
      return;
    }

    setAvatarFile(file);
    
    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setAvatarPreview(e.target.result);
    };
    reader.readAsDataURL(file);
  };

  // Form validation
  const validateProfileForm = () => {
    const errors = {};

    if (!profileData.firstName.trim()) {
      errors.firstName = 'First name is required';
    }
    if (!profileData.lastName.trim()) {
      errors.lastName = 'Last name is required';
    }
    if (!profileData.email.trim()) {
      errors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profileData.email)) {
      errors.email = 'Please enter a valid email address';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const validatePasswordForm = () => {
    const errors = {};

    if (!passwordData.currentPassword) {
      errors.currentPassword = 'Current password is required';
    }
    if (!passwordData.newPassword) {
      errors.newPassword = 'New password is required';
    } else if (passwordData.newPassword.length < 8) {
      errors.newPassword = 'Password must be at least 8 characters';
    }
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      errors.confirmPassword = 'Passwords do not match';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Handle profile update
  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateProfileForm()) return;

    setLoading(true);
    try {
      let avatarUrl = user.avatarUrl;

      // Upload avatar if changed
      if (avatarFile) {
        const formData = new FormData();
        formData.append('avatar', avatarFile);

        const uploadResponse = await fetch('/api/users/upload-avatar', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
          },
          body: formData
        });

        if (uploadResponse.ok) {
          const uploadData = await uploadResponse.json();
          avatarUrl = uploadData.data.avatar_url;
        } else {
          throw new Error('Failed to upload avatar');
        }
      }

      // Update profile
      await updateProfile({
        first_name: profileData.firstName,
        last_name: profileData.lastName,
        email: profileData.email,
        phone: profileData.phone,
        location: profileData.location,
        timezone: profileData.timezone,
        avatar_url: avatarUrl,
        ...settings
      });

      setEditMode(false);
      setAvatarFile(null);
      toast.success('Profile updated successfully!');
    } catch (error) {
      console.error('Profile update error:', error);
      toast.error(error.message || 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  // Handle password change
  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    
    if (!validatePasswordForm()) return;

    setLoading(true);
    try {
      await changePassword(passwordData.currentPassword, passwordData.newPassword);
      setPasswordData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      });
      toast.success('Password changed successfully!');
    } catch (error) {
      console.error('Password change error:', error);
    } finally {
      setLoading(false);
    }
  };

  // Handle settings update
  const handleSettingsSubmit = async (e) => {
    e.preventDefault();
    
    setLoading(true);
    try {
      await updateProfile(settings);
      toast.success('Settings updated successfully!');
    } catch (error) {
      console.error('Settings update error:', error);
      toast.error('Failed to update settings');
    } finally {
      setLoading(false);
    }
  };

  // Handle email verification
  const handleSendVerification = async () => {
    try {
      await sendEmailVerification();
      toast.success('Verification email sent!');
    } catch (error) {
      console.error('Email verification error:', error);
    }
  };

  // Handle mentor verification request
  const handleRequestMentorVerification = async () => {
    try {
      const response = await fetch('/api/mentors/request-verification', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      if (data.success) {
        toast.success('Verification request sent to admin!');
        // Update user data to reflect pending status
        await updateProfile({
          ...user,
          verification_status: 'pending'
        });
      } else {
        toast.error(data.message || 'Failed to send verification request');
      }
    } catch (error) {
      console.error('Mentor verification request error:', error);
      toast.error('Failed to send verification request');
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <LoadingSpinner size="xl" variant="gradient" />
      </div>
    );
  }

  const tabs = [
    { id: 'profile', label: 'Profile', icon: '👤' },
    { id: 'password', label: 'Password', icon: '🔒' },
    { id: 'settings', label: 'Settings', icon: '⚙️' }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center gap-6">
            <div className="relative">
              <div className="w-20 h-20 rounded-full overflow-hidden bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                {avatarPreview ? (
                  <img
                    src={avatarPreview}
                    alt="Profile"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-white text-2xl font-bold">
                    {typeof user.firstName === 'string' && user.firstName ? user.firstName.charAt(0).toUpperCase() : 'U'}
                  </span>
                )}
              </div>
              {!isEmailVerified() && (
                <div className="absolute -top-1 -right-1 w-6 h-6 bg-yellow-500 rounded-full flex items-center justify-center">
                  <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </div>
              )}
            </div>
            
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-gray-900">
                {safeRender(user.firstName)} {safeRender(user.lastName)}
              </h1>
              <p className="text-gray-600 mt-1">{safeRender(user.email)}</p>
              {!isEmailVerified() && (
                <div className="mt-2">
                  <button
                    onClick={handleSendVerification}
                    className="text-sm text-yellow-600 hover:text-yellow-700 font-medium"
                  >
                    Verify Email Address
                  </button>
                </div>
              )}
              {isMentor() && user.verification_status !== 'approved' && (
                <div className="mt-2">
                  <button
                    onClick={handleRequestMentorVerification}
                    disabled={user.verification_status === 'pending'}
                    className={`text-sm font-medium ${
                      user.verification_status === 'pending'
                        ? 'text-gray-500 cursor-not-allowed'
                        : 'text-blue-600 hover:text-blue-700'
                    }`}
                  >
                    {user.verification_status === 'pending'
                      ? 'Verification Request Sent'
                      : 'Request Mentor Verification'}
                  </button>
                  {user.verification_status === 'rejected' && (
                    <p className="text-xs text-red-600 mt-1">
                      Your verification was rejected. Please update your profile and try again.
                    </p>
                  )}
                </div>
              )}
              <div className="flex items-center gap-2 mt-2">
                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                  isMentor() ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
                }`}>
                  {isMentor() ? '👨‍🏫 Mentor' : '🎓 Mentee'}
                </span>
                {typeof user.badge_level === 'string' && user.badge_level && (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                    {user.badge_level.toUpperCase()}
                  </span>
                )}
                {isMentor() && user.verification_status && (
                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                    user.verification_status === 'approved' ? 'bg-green-100 text-green-800' :
                    user.verification_status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {user.verification_status === 'approved' ? '✓ Verified' :
                     user.verification_status === 'pending' ? '⏳ Pending' :
                     '✗ Rejected'}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3">
              {isMentee() && (
                <button
                  onClick={() => navigate('/mentors')}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
                >
                  Find Mentors
                </button>
              )}
              {isMentor() && (
                <button
                  onClick={() => navigate('/mentor/profile')}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg transition-colors"
                >
                  Mentor Profile
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Tabs */}
        <div className="flex space-x-1 mb-8 bg-gray-100 p-1 rounded-xl">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-all duration-200 ${
                activeTab === tab.id
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Profile Tab */}
        {activeTab === 'profile' && (
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900">Profile Information</h2>
              {!editMode ? (
                <button
                  onClick={() => setEditMode(true)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Edit Profile
                </button>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setEditMode(false);
                      setFormErrors({});
                      // Reset form data
                      setProfileData({
                        firstName: user.firstName || '',
                        lastName: user.lastName || '',
                        email: user.email || '',
                        phone: user.phone || '',
                        location: user.location || '',
                        timezone: user.timezone || 'UTC'
                      });
                      setAvatarFile(null);
                      setAvatarPreview(user.avatarUrl || '');
                    }}
                    className="px-4 py-2 bg-gray-300 hover:bg-gray-400 text-gray-700 font-medium rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleProfileSubmit}
                    disabled={loading}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
                  >
                    {loading ? <LoadingSpinner size="sm" /> : 'Save Changes'}
                  </button>
                </div>
              )}
            </div>

            <form onSubmit={handleProfileSubmit}>
              {/* Avatar Upload */}
              {editMode && (
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Profile Picture
                  </label>
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-full overflow-hidden bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                      {avatarPreview ? (
                        <img
                          src={avatarPreview}
                          alt="Profile preview"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-white text-lg font-bold">
                          {typeof profileData.firstName === 'string' && profileData.firstName ? profileData.firstName.charAt(0).toUpperCase() : 'U'}
                        </span>
                      )}
                    </div>
                    <label className="cursor-pointer bg-gray-100 hover:bg-gray-200 px-4 py-2 rounded-lg border border-gray-300 transition-colors">
                      <span className="text-sm font-medium text-gray-700">Choose File</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleAvatarChange}
                        className="hidden"
                      />
                    </label>
                    <p className="text-sm text-gray-500">Max 5MB, JPG/PNG only</p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Basic Information */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    First Name
                  </label>
                  {editMode ? (
                    <input
                      type="text"
                      name="firstName"
                      value={profileData.firstName}
                      onChange={handleInputChange}
                      className={`w-full px-4 py-3 rounded-xl border ${
                        formErrors.firstName ? 'border-red-300' : 'border-gray-300'
                      } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                      placeholder="Enter first name"
                    />
                  ) : (
                    <p className="px-4 py-3 bg-gray-50 rounded-xl text-gray-900">
                      {safeRender(user.firstName)}
                    </p>
                  )}
                  {formErrors.firstName && (
                    <p className="mt-1 text-sm text-red-600">{formErrors.firstName}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Last Name
                  </label>
                  {editMode ? (
                    <input
                      type="text"
                      name="lastName"
                      value={profileData.lastName}
                      onChange={handleInputChange}
                      className={`w-full px-4 py-3 rounded-xl border ${
                        formErrors.lastName ? 'border-red-300' : 'border-gray-300'
                      } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                      placeholder="Enter last name"
                    />
                  ) : (
                    <p className="px-4 py-3 bg-gray-50 rounded-xl text-gray-900">
                      {safeRender(user.lastName)}
                    </p>
                  )}
                  {formErrors.lastName && (
                    <p className="mt-1 text-sm text-red-600">{formErrors.lastName}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email Address
                  </label>
                  {editMode ? (
                    <input
                      type="email"
                      name="email"
                      value={profileData.email}
                      onChange={handleInputChange}
                      className={`w-full px-4 py-3 rounded-xl border ${
                        formErrors.email ? 'border-red-300' : 'border-gray-300'
                      } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                      placeholder="Enter email address"
                    />
                  ) : (
                    <p className="px-4 py-3 bg-gray-50 rounded-xl text-gray-900">
                      {safeRender(user.email)}
                    </p>
                  )}
                  {formErrors.email && (
                    <p className="mt-1 text-sm text-red-600">{formErrors.email}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Phone Number
                  </label>
                  {editMode ? (
                    <input
                      type="tel"
                      name="phone"
                      value={profileData.phone}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Enter phone number"
                    />
                  ) : (
                    <p className="px-4 py-3 bg-gray-50 rounded-xl text-gray-900">
                      {safeRender(user.phone)}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Location
                  </label>
                  {editMode ? (
                    <input
                      type="text"
                      name="location"
                      value={profileData.location}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Enter your location"
                    />
                  ) : (
                    <p className="px-4 py-3 bg-gray-50 rounded-xl text-gray-900">
                      {safeRender(user.location)}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Timezone
                  </label>
                  {editMode ? (
                    <select
                      name="timezone"
                      value={profileData.timezone}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {timezoneOptions.map(tz => (
                        <option key={tz} value={tz}>{tz}</option>
                      ))}
                    </select>
                  ) : (
                    <p className="px-4 py-3 bg-gray-50 rounded-xl text-gray-900">
                      {safeRender(user.timezone, 'UTC')}
                    </p>
                  )}
                </div>
              </div>



            </form>
          </div>
        )}

        {/* Password Tab */}
        {activeTab === 'password' && (
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Change Password</h2>
            
            <form onSubmit={handlePasswordSubmit}>
              <div className="space-y-6 max-w-md">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Current Password
                  </label>
                  <input
                    type="password"
                    name="currentPassword"
                    value={passwordData.currentPassword}
                    onChange={handleInputChange}
                    className={`w-full px-4 py-3 rounded-xl border ${
                      formErrors.currentPassword ? 'border-red-300' : 'border-gray-300'
                    } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                    placeholder="Enter current password"
                  />
                  {formErrors.currentPassword && (
                    <p className="mt-1 text-sm text-red-600">{formErrors.currentPassword}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    New Password
                  </label>
                  <input
                    type="password"
                    name="newPassword"
                    value={passwordData.newPassword}
                    onChange={handleInputChange}
                    className={`w-full px-4 py-3 rounded-xl border ${
                      formErrors.newPassword ? 'border-red-300' : 'border-gray-300'
                    } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                    placeholder="Enter new password"
                  />
                  {formErrors.newPassword && (
                    <p className="mt-1 text-sm text-red-600">{formErrors.newPassword}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    name="confirmPassword"
                    value={passwordData.confirmPassword}
                    onChange={handleInputChange}
                    className={`w-full px-4 py-3 rounded-xl border ${
                      formErrors.confirmPassword ? 'border-red-300' : 'border-gray-300'
                    } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                    placeholder="Confirm new password"
                  />
                  {formErrors.confirmPassword && (
                    <p className="mt-1 text-sm text-red-600">{formErrors.confirmPassword}</p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading ? <LoadingSpinner size="sm" /> : 'Change Password'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Account Settings</h2>
            
            <form onSubmit={handleSettingsSubmit}>
              <div className="space-y-6">
                {/* Notifications */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Notifications</h3>
                  <div className="space-y-4">
                    <label className="flex items-center justify-between">
                      <div>
                        <span className="font-medium text-gray-900">Email Notifications</span>
                        <p className="text-sm text-gray-600">Receive notifications via email</p>
                      </div>
                      <input
                        type="checkbox"
                        name="emailNotifications"
                        checked={settings.emailNotifications}
                        onChange={handleInputChange}
                        className="h-5 w-5 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                    </label>

                    <label className="flex items-center justify-between">
                      <div>
                        <span className="font-medium text-gray-900">SMS Notifications</span>
                        <p className="text-sm text-gray-600">Receive notifications via SMS</p>
                      </div>
                      <input
                        type="checkbox"
                        name="smsNotifications"
                        checked={settings.smsNotifications}
                        onChange={handleInputChange}
                        className="h-5 w-5 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                    </label>

                    <label className="flex items-center justify-between">
                      <div>
                        <span className="font-medium text-gray-900">Session Reminders</span>
                        <p className="text-sm text-gray-600">Get reminded about upcoming sessions</p>
                      </div>
                      <input
                        type="checkbox"
                        name="sessionReminders"
                        checked={settings.sessionReminders}
                        onChange={handleInputChange}
                        className="h-5 w-5 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                    </label>

                    <label className="flex items-center justify-between">
                      <div>
                        <span className="font-medium text-gray-900">Marketing Emails</span>
                        <p className="text-sm text-gray-600">Receive updates and promotional content</p>
                      </div>
                      <input
                        type="checkbox"
                        name="marketingEmails"
                        checked={settings.marketingEmails}
                        onChange={handleInputChange}
                        className="h-5 w-5 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                    </label>
                  </div>
                </div>

                {/* Privacy */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Privacy</h3>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Profile Visibility
                    </label>
                    <select
                      name="profileVisibility"
                      value={settings.profileVisibility}
                      onChange={handleInputChange}
                      className="w-full max-w-xs px-4 py-3 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="public">Public</option>
                      <option value="private">Private</option>
                      <option value="registered_users">Registered Users Only</option>
                    </select>
                    <p className="mt-1 text-sm text-gray-600">
                      Control who can see your profile information
                    </p>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-xl transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {loading ? <LoadingSpinner size="sm" /> : 'Save Settings'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Danger Zone */}
        <div className="mt-8 bg-red-50 border border-red-200 rounded-2xl p-6">
          <h3 className="text-lg font-semibold text-red-900 mb-2">Danger Zone</h3>
          <p className="text-red-700 mb-4">
            These actions cannot be undone. Please be careful.
          </p>
          <div className="flex gap-4">
            <button
              onClick={() => {
                if (window.confirm('Are you sure you want to deactivate your account? This action cannot be undone.')) {
                  // Handle account deactivation
                  toast.error('Account deactivation is not yet implemented');
                }
              }}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors"
            >
              Deactivate Account
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserProfile;
