import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import LoadingSpinner from '../components/LoadingSpinner';
import { toast } from 'react-hot-toast';

const MentorDashboard = () => {
  const { user, isAuthenticated, isMentor } = useAuth();
  const navigate = useNavigate();

  // State management
  const [loading, setLoading] = useState(false);
  const [mentorProfile, setMentorProfile] = useState(null);
  const [upcomingSessions, setUpcomingSessions] = useState([]);
  const [recentSessions, setRecentSessions] = useState([]);
  const [earnings, setEarnings] = useState({});
  const [stats, setStats] = useState({});

  // Load mentor profile
  const loadMentorProfile = async () => {
    try {
      const response = await fetch('/api/mentors/profile', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setMentorProfile(data.data.mentor);
      }
    } catch (error) {
      console.error('Failed to load mentor profile:', error);
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

  // Load all dashboard data
  const loadDashboardData = async () => {
    if (!isAuthenticated || !isMentor()) return;

    setLoading(true);
    try {
      await Promise.all([
        loadMentorProfile(),
        loadUpcomingSessions(),
        loadRecentSessions(),
        loadEarnings(),
        loadStats()
      ]);
    } catch (error) {
      console.error('Dashboard loading error:', error);
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  // Load data on mount
  useEffect(() => {
    if (isAuthenticated && isMentor()) {
      loadDashboardData();
    }
  }, [isAuthenticated, isMentor()]);

  // Redirect if not authenticated or not a mentor
  if (!isAuthenticated) {
    navigate('/login');
    return null;
  }

  if (!isMentor()) {
    navigate('/dashboard');
    return null;
  }

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
                    ⭐ {mentorProfile?.averageRating?.toFixed(1) || '0.0'} ({mentorProfile?.totalReviews || 0} reviews)
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={loadDashboardData}
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
                  +{stats.sessionsThisMonth || 0} this month
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
                <p className="text-sm font-medium text-gray-600">Average Rating</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">
                  {stats.averageRating?.toFixed(1) || '0.0'} ⭐
                </p>
                <p className="text-sm text-green-600 mt-1">
                  {stats.totalReviews || 0} reviews
                </p>
              </div>
              <div className="w-12 h-12 bg-yellow-100 rounded-xl flex items-center justify-center">
                <svg className="w-6 h-6 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100 hover:shadow-xl transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Monthly Earnings</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">
                  ${earnings.thisMonth || 0}
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

          <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100 hover:shadow-xl transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Response Rate</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">
                  {stats.responseRate || 0}%
                </p>
                <p className="text-sm text-green-600 mt-1">
                  Avg {stats.responseTime || 0}h response time
                </p>
              </div>
              <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
                <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
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
                                day: 'numeric'
                              })}
                            </p>
                            <p className="text-sm text-gray-500">
                              {new Date(session.scheduledAt).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                                timeZoneName: 'short'
                              })} • {session.durationMinutes} minutes
                            </p>
                            <div className="flex items-center gap-4 mt-2">
                              <span className="text-sm text-gray-600">
                                👨‍🎓 {session.mentee?.firstName} {session.mentee?.lastName}
                              </span>
                              <span className="text-sm font-medium text-green-600">
                                ${session.price}
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
                            {new Date(session.completedAt).toLocaleDateString()} • Earned ${session.mentorEarnings}
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
            {/* Profile Completion */}
            {mentorProfile && (
              <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
                <h3 className="text-lg font-bold text-gray-900 mb-4">📊 Profile Status</h3>
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span>Profile Completion</span>
                      <span>{mentorProfile.profileCompletionPercentage || 0}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${mentorProfile.profileCompletionPercentage || 0}%` }}
                      ></div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-indigo-600">{mentorProfile.totalSessions || 0}</p>
                      <p className="text-xs text-gray-500">Sessions</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-green-600">${mentorProfile.totalEarnings || 0}</p>
                      <p className="text-xs text-gray-500">Earned</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

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