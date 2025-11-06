import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import LoadingSpinner from '../components/LoadingSpinner';
import { toast } from 'react-hot-toast';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const MentorDashboard = () => {
  const { user, isAuthenticated, isMentor } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // State management
  const [loading, setLoading] = useState(false);
  const [mentorProfile, setMentorProfile] = useState(null);
  const [upcomingSessions, setUpcomingSessions] = useState([]);
  const [recentSessions, setRecentSessions] = useState([]);
  const [earnings, setEarnings] = useState({});
  const [stats, setStats] = useState({});
  const [sessionStats, setSessionStats] = useState([]);
  const [dataLoaded, setDataLoaded] = useState(false);

  // Refs to prevent multiple loads and handle timeouts
  const hasLoadedRef = useRef(false);
  const loadTimeoutRef = useRef(null);
  const navigationRef = useRef(false);

  // Load mentor profile
  const loadMentorProfile = async () => {
    console.log('🔄 MentorDashboard: Loading mentor profile...');
    try {
      const response = await fetch('/api/mentors/profile', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        console.log('✅ MentorDashboard: Mentor profile loaded:', data.data.mentor);
        setMentorProfile(data.data.mentor);
      } else {
        console.error('❌ MentorDashboard: Failed to load mentor profile, status:', response.status);
      }
    } catch (error) {
      console.error('❌ MentorDashboard: Error loading mentor profile:', error);
    }
  };

  // Load upcoming sessions
  const loadUpcomingSessions = async () => {
    try {
      const response = await fetch('/api/sessions/mentor/upcoming?limit=5', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setUpcomingSessions(data.data?.sessions || []);
      }
    } catch (error) {
      console.error('Failed to load upcoming sessions:', error);
    }
  };

  // Load recent sessions
  const loadRecentSessions = async () => {
    try {
      const response = await fetch('/api/sessions/mentor/recent?limit=3', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setRecentSessions(data.data?.sessions || []);
      }
    } catch (error) {
      console.error('Failed to load recent sessions:', error);
    }
  };

  // Load earnings data
  const loadEarnings = async () => {
    try {
      const response = await fetch('/api/mentors/earnings/summary', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setEarnings(data.data || {});
      }
    } catch (error) {
      console.error('Failed to load earnings:', error);
    }
  };

  // Load stats
  const loadStats = async () => {
    try {
      const response = await fetch('/api/mentors/stats', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setStats(data.data || {});
      }
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  };

  // Load session stats for chart
  const loadSessionStats = async () => {
    try {
      const response = await fetch('/api/mentors/session-stats', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setSessionStats(data.data?.monthlySessions || []);
      }
    } catch (error) {
      console.error('Failed to load session stats:', error);
    }
  };

  // Load all dashboard data
  const loadDashboardData = async () => {
    if (!isAuthenticated || !isMentor() || dataLoaded) {
      console.log('🚫 MentorDashboard: Skipping load - auth:', isAuthenticated, 'mentor:', isMentor(), 'loaded:', dataLoaded);
      return;
    }

    console.log('🚀 MentorDashboard: Starting dashboard data load...');
    setLoading(true);

    // Set timeout to stop loading after 30 seconds
    loadTimeoutRef.current = setTimeout(() => {
      console.log('⏰ MentorDashboard: Load timeout reached, stopping loading');
      setLoading(false);
      toast.error('Loading took too long. Please refresh the page.');
    }, 30000);

    try {
      await Promise.all([
        loadMentorProfile(),
        loadUpcomingSessions(),
        loadRecentSessions(),
        loadEarnings(),
        loadStats(),
        loadSessionStats()
      ]);
      setDataLoaded(true);
      console.log('✅ MentorDashboard: Dashboard data loaded successfully');
    } catch (error) {
      console.error('❌ MentorDashboard: Dashboard loading error:', error);
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current);
        loadTimeoutRef.current = null;
      }
    }
  };

  // Reset data when navigating to this component (location.key changes on navigation)
  useEffect(() => {
    console.log('🔄 MentorDashboard: Location key changed, resetting data');
    setDataLoaded(false);
    setMentorProfile(null);
    setUpcomingSessions([]);
    setRecentSessions([]);
    setEarnings({});
    setStats({});
  }, [location.key]);

  // Load data on mount
  useEffect(() => {
    if (isAuthenticated && isMentor()) {
      loadDashboardData();
    } else {
      // Reset data when user logs out or changes role
      setDataLoaded(false);
      setMentorProfile(null);
      setUpcomingSessions([]);
      setRecentSessions([]);
      setEarnings({});
      setStats({});
      setSessionStats([]);
      setSessionStats([]);
    }
  }, [isAuthenticated]);

  // Reset navigation ref on location change
  useEffect(() => {
    navigationRef.current = false;
  }, [location.key]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current);
      }
    };
  }, []);

  // Handle redirects
  useEffect(() => {
    console.log('🔍 MentorDashboard: Checking redirects', {
      isAuthenticated,
      isMentor: isMentor(),
      userRole: user?.role,
      userId: user?.id,
      hasMentorProfile: !!mentorProfile
    });

    if (!isAuthenticated && !navigationRef.current) {
      console.log('🔍 MentorDashboard: Redirecting to /login - not authenticated');
      navigationRef.current = true;
      // Use replace to avoid adding to history stack
      navigate('/login', { replace: true });
    } else if (!isMentor() && !navigationRef.current) {
      console.log('🔍 MentorDashboard: Redirecting to /dashboard - not a mentor, user role:', user?.role, 'isMentor():', isMentor());
      navigationRef.current = true;
      // Use replace to avoid adding to history stack
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, isMentor, user?.role, navigate, mentorProfile]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
      {/* Header */}
      <div className="bg-white shadow-lg border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div className="flex items-center gap-6">
              <div className="relative">
                <div className="w-20 h-20 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-2xl flex items-center justify-center text-white text-3xl font-bold shadow-lg">
                  {user?.first_name?.charAt(0).toUpperCase() || 'M'}
                </div>
                {mentorProfile?.isVerified && (
                  <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                    <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                )}
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">
                  Welcome back, {user?.first_name}! 👨‍🏫
                </h1>
                <p className="text-gray-600 mt-1">
                  {mentorProfile?.status === 'active' ? 'Ready to inspire and mentor today!' : 'Complete your profile to start mentoring'}
                </p>
                <div className="flex items-center gap-4 mt-2">
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                    mentorProfile?.status === 'active' ? 'bg-green-100 text-green-800' :
                    mentorProfile?.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {mentorProfile?.status === 'active' ? 'Active Mentor' :
                     mentorProfile?.status === 'pending' ? 'Profile Under Review' :
                     'Inactive'}
                  </span>
                  <span className="text-sm text-gray-500">
                    ⭐ {(mentorProfile?.averageRating || 0).toFixed(1)} ({mentorProfile?.totalReviews || 0} reviews)
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => {
                  setDataLoaded(false);
                  loadDashboardData();
                }}
                disabled={loading}
                className="px-4 py-3 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-gray-700 font-semibold rounded-xl transition-all duration-200 flex items-center gap-2"
              >
                {loading ? <LoadingSpinner size="sm" /> : '🔄'} Refresh
              </button>
              <button
                onClick={() => navigate('/mentor/profile')}
                className="px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-semibold rounded-xl transition-all duration-200 transform hover:scale-105 shadow-lg hover:shadow-xl flex items-center gap-2"
              >
                ⚙️ Manage Profile
              </button>
              <button
                onClick={() => navigate('/mentor/availability')}
                className="px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-semibold rounded-xl transition-all duration-200 transform hover:scale-105 shadow-lg hover:shadow-xl flex items-center gap-2"
              >
                📅 Set Availability
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100 hover:shadow-xl transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Sessions</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">
                  {stats.totalSessions || 0}
                </p>
                <p className="text-sm text-green-600 mt-1">
                  Completed sessions
                </p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100 hover:shadow-xl transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Sessions Today</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">
                  {stats.sessionsToday || 0}
                </p>
                <p className="text-sm text-blue-600 mt-1">
                  Scheduled for today
                </p>
              </div>
              <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center">
                <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100 hover:shadow-xl transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Average Rating</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">
                  {(stats.averageRating || 0).toFixed(1)} ⭐
                </p>
                <p className="text-sm text-green-600 mt-1">
                  {stats.totalReviews || 0} reviews
                </p>
              </div>
              <div className="w-12 h-12 bg-yellow-100 rounded-xl flex items-center justify-center">
                <div className="flex">
                  {[...Array(5)].map((_, i) => {
                    const starValue = i + 1;
                    const rating = stats.averageRating || 0;
                    const isFull = rating >= starValue;
                    const isHalf = rating >= starValue - 0.5 && rating < starValue;

                    if (isFull) {
                      return (
                        <svg key={i} className="w-3 h-3 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                      );
                    } else if (isHalf) {
                      return (
                        <div key={i} className="relative overflow-hidden w-1.5">
                          <svg className="w-3 h-3 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                          </svg>
                        </div>
                      );
                    } else {
                      return (
                        <svg key={i} className="w-3 h-3 text-gray-300" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                      );
                    }
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100 hover:shadow-xl transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Monthly Earnings</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">
                  ₹{earnings.thisMonth || 0}
                </p>
                <p className={`text-sm mt-1 ${earnings.growth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {earnings.growth >= 0 ? '+' : ''}{earnings.growth || 0}% from last month
                </p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                </svg>
              </div>
            </div>
          </div>

        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Sessions Chart */}
          <div className="lg:col-span-3 mb-8">
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                📈 Sessions Per Month
              </h2>
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <LoadingSpinner size="md" />
                  <span className="ml-3 text-gray-600">Loading chart data...</span>
                </div>
              ) : sessionStats.length > 0 ? (
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={sessionStats}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis
                        dataKey="month"
                        stroke="#6b7280"
                        fontSize={12}
                        tickLine={false}
                      />
                      <YAxis
                        stroke="#6b7280"
                        fontSize={12}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#ffffff',
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px',
                          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                        }}
                        labelStyle={{ color: '#374151', fontWeight: '600' }}
                      />
                      <Line
                        type="monotone"
                        dataKey="sessions"
                        stroke="#3b82f6"
                        strokeWidth={3}
                        dot={{ fill: '#3b82f6', strokeWidth: 2, r: 4 }}
                        activeDot={{ r: 6, stroke: '#3b82f6', strokeWidth: 2, fill: '#ffffff' }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                  <p className="text-gray-500 text-lg mb-2">No session data available</p>
                  <p className="text-gray-400 text-sm">
                    Chart will show data once you complete your first sessions
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-2 space-y-8">
            {/* Upcoming Sessions */}
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
              <div className="p-6 border-b border-gray-100">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                    📅 Upcoming Sessions
                  </h2>
                  <button
                    onClick={() => navigate('/mentor/sessions')}
                    className="text-indigo-600 hover:text-indigo-700 font-medium text-sm transition-colors"
                  >
                    View All →
                  </button>
                </div>
              </div>

              <div className="p-6">
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <LoadingSpinner size="md" />
                    <span className="ml-3 text-gray-600">Loading sessions...</span>
                  </div>
                ) : upcomingSessions.length > 0 ? (
                  <div className="space-y-4">
                    {upcomingSessions.map((session) => (
                      <div key={session.id} className="border border-gray-200 rounded-xl p-4 hover:shadow-md transition-all hover:border-indigo-200">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <h3 className="font-semibold text-gray-900">{session.title}</h3>
                            <p className="text-sm text-gray-600 mt-1">
                              {new Date(session.scheduledAt).toLocaleDateString('en-US', {
                                weekday: 'long',
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                                timeZone: 'Asia/Kolkata'
                              })}
                            </p>
                            <p className="text-sm text-gray-500">
                              {new Date(session.scheduledAt).toLocaleTimeString('en-US', {
                                hour: '2-digit',
                                minute: '2-digit',
                                timeZone: 'Asia/Kolkata'
                              })} • {session.durationMinutes} minutes
                            </p>
                            <div className="flex items-center gap-4 mt-2">
                              <span className="text-sm text-gray-600">
                                👨‍🎓 {session.mentee?.firstName} {session.mentee?.lastName}
                              </span>
                              <span className="text-sm font-medium text-green-600">
                                ₹{session.price}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                              session.status === 'scheduled' ? 'bg-blue-100 text-blue-800' :
                              session.status === 'confirmed' ? 'bg-green-100 text-green-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {session.status}
                            </span>
                            {session.meetingUrl && (
                              <button
                                onClick={() => window.open(session.meetingUrl, '_blank')}
                                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 transition-colors"
                              >
                                Join Call
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <p className="text-gray-500 text-lg mb-4">No upcoming sessions</p>
                    <p className="text-gray-400 text-sm mb-6">
                      Sessions will appear here once mentees book time with you
                    </p>
                    <button
                      onClick={() => navigate('/mentor/availability')}
                      className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl transition-colors"
                    >
                      Set Your Availability
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Recent Sessions & Reviews */}
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100">
              <div className="p-6 border-b border-gray-100">
                <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  📈 Recent Activity
                </h2>
              </div>
              <div className="p-6">
                {recentSessions.length > 0 ? (
                  <div className="space-y-4">
                    {recentSessions.map((session) => (
                      <div key={session.id} className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl">
                        <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                          <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                        </div>
                        <div className="flex-1">
                          <p className="font-medium text-gray-900">
                            Session completed with {session.mentee?.firstName} {session.mentee?.lastName}
                          </p>
                          <p className="text-sm text-gray-500">
                            {new Date(session.completedAt).toLocaleDateString()} • Earned ₹{session.mentorEarnings}
                          </p>
                        </div>
                        {session.review && (
                          <div className="text-right">
                            <div className="flex items-center gap-1">
                              {[...Array(5)].map((_, i) => (
                                <span key={i} className={`text-sm ${i < session.review.rating ? 'text-yellow-400' : 'text-gray-300'}`}>
                                  ⭐
                                </span>
                              ))}
                            </div>
                            <p className="text-xs text-gray-500 mt-1">Reviewed</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-gray-500">No recent activity</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">

            {/* Quick Actions */}
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4">🚀 Quick Actions</h3>
              <div className="space-y-3">
                <button
                  onClick={() => navigate('/mentor/availability')}
                  className="w-full text-left p-3 rounded-xl bg-indigo-50 hover:bg-indigo-100 transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-indigo-600">⏰</span>
                    <span className="font-medium text-gray-900 group-hover:text-indigo-700">Set Availability</span>
                  </div>
                </button>
                <button
                  onClick={() => navigate('/mentor/earnings')}
                  className="w-full text-left p-3 rounded-xl bg-green-50 hover:bg-green-100 transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-green-600">💰</span>
                    <span className="font-medium text-gray-900 group-hover:text-green-700">View Earnings</span>
                  </div>
                </button>
                <button
                  onClick={() => navigate('/mentor/reviews')}
                  className="w-full text-left p-3 rounded-xl bg-yellow-50 hover:bg-yellow-100 transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-yellow-600">⭐</span>
                    <span className="font-medium text-gray-900 group-hover:text-yellow-700">Read Reviews</span>
                  </div>
                </button>
                <button
                  onClick={() => navigate('/mentor/messages')}
                  className="w-full text-left p-3 rounded-xl bg-purple-50 hover:bg-purple-100 transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-purple-600">💬</span>
                    <span className="font-medium text-gray-900 group-hover:text-purple-700">Messages</span>
                  </div>
                </button>
              </div>
            </div>

            {/* Support */}
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4">❓ Need Help?</h3>
              <div className="space-y-3">
                <button
                  onClick={() => navigate('/mentor/help')}
                  className="w-full text-left p-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span>📖</span>
                    <span className="font-medium text-gray-900">Mentor Guide</span>
                  </div>
                </button>
                <button
                  onClick={() => navigate('/support')}
                  className="w-full text-left p-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span>💬</span>
                    <span className="font-medium text-gray-900">Contact Support</span>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MentorDashboard;