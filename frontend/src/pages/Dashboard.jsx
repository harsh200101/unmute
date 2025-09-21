import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import LoadingSpinner from '../components/LoadingSpinner';
import { toast } from 'react-hot-toast';

const Dashboard = () => {
  const { user, isAuthenticated, isMentor, isMentee, isAdmin } = useAuth();
  const navigate = useNavigate();

  // Simple state management
  const [loading, setLoading] = useState(false);
  const [upcomingSessions, setUpcomingSessions] = useState([]);
  const [sessionStats, setSessionStats] = useState({});

  // Load upcoming sessions
  const loadUpcomingSessions = useCallback(async () => {
    console.log('🔄 API CALL: loadUpcomingSessions at', new Date().toISOString());
    try {
      const response = await fetch('/api/sessions/upcoming?limit=5', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        console.log('Sessions API response:', data);
        setUpcomingSessions(data.data?.upcomingSessions || []);
      } else {
        console.warn('Sessions API failed:', response.status);
        setUpcomingSessions([]);
      }
    } catch (error) {
      console.warn('Sessions API error:', error);
      setUpcomingSessions([]);
    }
  }, []);

  // Load session stats
  const loadSessionStats = useCallback(async () => {
    console.log('🔄 API CALL: loadSessionStats at', new Date().toISOString());
    try {
      const response = await fetch('/api/sessions/my-sessions/stats?timeframe=month', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        console.log('Stats API response:', data);
        setSessionStats(data.data || {});
      } else {
        console.warn('Stats API failed:', response.status);
        setSessionStats({});
      }
    } catch (error) {
      console.warn('Stats API error:', error);
      setSessionStats({});
    }
  }, []);

  // Load all dashboard data
  const loadDashboardData = useCallback(async () => {
    if (!isAuthenticated) return;

    setLoading(true);
    console.log('🚀 Loading dashboard data...');

    try {
      await Promise.all([
        loadUpcomingSessions(),
        loadSessionStats()
      ]);
      console.log('✅ Dashboard data loaded successfully');
    } catch (error) {
      console.error('Dashboard loading error:', error);
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, loadUpcomingSessions, loadSessionStats]);

  // Load data on mount and handle redirects
  useEffect(() => {
    console.log('🔄 Dashboard useEffect running at', new Date().toISOString(), { isAuthenticated, isMentor: isMentor() });
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }

    if (isMentor()) {
      navigate('/mentor/dashboard');
      return;
    }

    // Load dashboard data only if authenticated and not a mentor
    loadDashboardData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, isMentor, navigate]);

  // Don't render if not authenticated or if mentor (will redirect)
  if (!isAuthenticated || isMentor()) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-purple-600 rounded-2xl flex items-center justify-center text-white text-2xl font-bold">
                {user?.first_name?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">
                  Welcome back, {user?.first_name}! 👋
                </h1>
                <p className="text-gray-600 mt-1">
                  {isMentor() && "Ready to mentor and inspire today?"}
                  {isMentee() && "Ready to learn and grow today?"}
                  {isAdmin() && "Managing the platform like a pro!"}
                </p>
              </div>
            </div>

            <div className="flex gap-3 mt-4 md:mt-0">
              <button
                onClick={loadDashboardData}
                disabled={loading}
                className="px-4 py-3 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-gray-700 font-semibold rounded-xl transition-all duration-200 flex items-center gap-2"
              >
                {loading ? <LoadingSpinner size="sm" /> : '🔄'} Refresh
              </button>
              {isMentee() && (
                <button
                  onClick={() => navigate('/mentors')}
                  className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold rounded-xl transition-all duration-200 transform hover:scale-105 shadow-lg hover:shadow-xl flex items-center gap-2"
                >
                  🔍 Find Mentor
                </button>
              )}
              {isMentor() && (
                <button
                  onClick={() => navigate('/mentor/schedule')}
                  className="px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-semibold rounded-xl transition-all duration-200 transform hover:scale-105 shadow-lg hover:shadow-xl flex items-center gap-2"
                >
                  📅 Manage Schedule
                </button>
              )}
              <button
                onClick={() => navigate('/profile')}
                className="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl transition-all duration-200 flex items-center gap-2"
              >
                ⚙️ Settings
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Sessions</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">
                  {sessionStats.totalSessions || 0}
                </p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </div>
            </div>
            <p className="text-sm text-green-600 mt-2">
              Great progress!
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">
                  {isMentor() ? 'Avg Rating' : 'Hours Learned'}
                </p>
                <p className="text-3xl font-bold text-gray-900 mt-1">
                  {isMentor()
                    ? `${(sessionStats.averageRating || 4.8).toFixed(1)}★`
                    : `${Math.round((sessionStats.averageSessionDuration || 60) / 60)}h`
                  }
                </p>
              </div>
              <div className="w-12 h-12 bg-yellow-100 rounded-xl flex items-center justify-center">
                <svg className="w-6 h-6 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              </div>
            </div>
            <p className="text-sm text-green-600 mt-2">
              {isMentor() ? 'Excellent feedback!' : 'Keep learning!'}
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">
                  {isMentor() ? 'This Month' : 'Completed'}
                </p>
                <p className="text-3xl font-bold text-gray-900 mt-1">
                  {isMentor()
                    ? `$${sessionStats.totalMentorEarnings || 0}`
                    : sessionStats.completedSessions || 0
                  }
                </p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                </svg>
              </div>
            </div>
            <p className="text-sm text-green-600 mt-2">
              {isMentor() ? '+15% from last month' : 'Great progress!'}
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Success Rate</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">
                  {sessionStats.completionRate || 98}%
                </p>
              </div>
              <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
                <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <p className="text-sm text-green-600 mt-2">Excellent performance!</p>
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
                    onClick={() => navigate('/sessions')}
                    className="text-blue-600 hover:text-blue-700 font-medium text-sm transition-colors"
                  >
                    View All
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
                    {upcomingSessions.slice(0, 3).map((session) => (
                      <div key={session.id} className="border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <h3 className="font-semibold text-gray-900">{session.title}</h3>
                            <p className="text-sm text-gray-600 mt-1">
                              {new Date(session.scheduledAt).toLocaleDateString()} at {new Date(session.scheduledAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                            </p>
                            <p className="text-sm text-gray-500">
                              With {session.participant?.firstName} {session.participant?.lastName}
                            </p>
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
                                className="px-3 py-1 bg-blue-600 text-white rounded-lg text-xs hover:bg-blue-700 transition-colors"
                              >
                                Join
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
                    {isMentee() && (
                      <button
                        onClick={() => navigate('/mentors')}
                        className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-colors"
                      >
                        Book Your First Session
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Recent Activity */}
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100">
              <div className="p-6 border-b border-gray-100">
                <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  📊 Recent Activity
                </h2>
              </div>
              <div className="p-6">
                <div className="space-y-4">
                  <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl">
                    <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                      <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">Welcome to your dashboard!</p>
                      <p className="text-sm text-gray-500">Start exploring mentoring opportunities</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Quick Actions */}
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4">🚀 Quick Actions</h3>
              <div className="space-y-3">
                {isMentee() && (
                  <>
                    <button
                      onClick={() => navigate('/mentors')}
                      className="w-full text-left p-3 rounded-xl bg-blue-50 hover:bg-blue-100 transition-colors group"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-blue-600">🔍</span>
                        <span className="font-medium text-gray-900 group-hover:text-blue-700">Find Mentors</span>
                      </div>
                    </button>
                    <button
                      onClick={() => navigate('/sessions')}
                      className="w-full text-left p-3 rounded-xl bg-green-50 hover:bg-green-100 transition-colors group"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-green-600">📅</span>
                        <span className="font-medium text-gray-900 group-hover:text-green-700">My Sessions</span>
                      </div>
                    </button>
                  </>
                )}
                {isMentor() && (
                  <>
                    <button
                      onClick={() => navigate('/mentor/schedule')}
                      className="w-full text-left p-3 rounded-xl bg-purple-50 hover:bg-purple-100 transition-colors group"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-purple-600">⏰</span>
                        <span className="font-medium text-gray-900 group-hover:text-purple-700">Manage Schedule</span>
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
                  </>
                )}
              </div>
            </div>

            {/* Support */}
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4">❓ Need Help?</h3>
              <div className="space-y-3">
                <button
                  onClick={() => navigate('/support')}
                  className="w-full text-left p-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span>📖</span>
                    <span className="font-medium text-gray-900">Help Center</span>
                  </div>
                </button>
                <button
                  onClick={() => navigate('/contact')}
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

export default Dashboard;
