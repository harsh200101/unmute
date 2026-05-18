import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import LoadingSpinner from '../components/LoadingSpinner';
import SessionCard from '../components/SessionCard';
import { toast } from 'react-hot-toast';
import api from '../utils/api';

const MentorSessions = () => {
  const { user, isAuthenticated, isMentor } = useAuth();
  const navigate = useNavigate();

  // State management
  const [loading, setLoading] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [activeTab, setActiveTab] = useState('all'); // all, upcoming, past, pending
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [summary, setSummary] = useState(null); // from API (total, upcoming, past, pending)

  // Tab options - only upcoming and past for confirmed sessions
  const tabOptions = [
    { id: 'all', label: 'All Confirmed Sessions', count: 0 },
    { id: 'upcoming', label: 'Upcoming', count: 0 },
    { id: 'past', label: 'Past', count: 0 }
  ];

  // Status options for filtering - include all relevant statuses
  const statusOptions = [
    { value: 'confirmed,in_progress,completed,cancelled_by_mentee', label: 'All Sessions' },
    { value: 'confirmed,in_progress', label: 'Active Sessions' },
    { value: 'confirmed', label: 'Confirmed Only' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'completed', label: 'Completed' },
    { value: 'cancelled_by_mentee', label: 'Cancelled Only' }
  ];

  // Type options
  const typeOptions = [
    { value: '', label: 'All Types' },
    { value: 'video', label: 'Video Call' },
    { value: 'voice', label: 'Voice Call' },
    { value: 'chat', label: 'Chat Session' }
  ];

  // Load sessions
  const loadSessions = async () => {
    if (!isAuthenticated || !isMentor()) return;

    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('page', page);
      params.append('limit', 10);

      // Use the selected status filter
      if (statusFilter) {
        params.append('status', statusFilter);
      } else {
        // Default to all relevant statuses including in_progress and completed
        params.append('status', 'confirmed,in_progress,completed,cancelled_by_mentee');
      }

      // Add type filter if specified
      if (typeFilter) params.append('type', typeFilter);

      // Apply tab-specific filters (but only for confirmed sessions)
      if (activeTab === 'upcoming') {
        params.append('upcoming', true);
      } else if (activeTab === 'past') {
        params.append('past', true);
      }

      const response = await api.get(`/sessions/mentor/all?${params}`);
      const data = response.data;
      // Don't filter sessions on frontend - let backend handle status filtering
      setSessions(data.data?.sessions || []);
      setTotalPages(data.data?.pagination?.totalPages || 1);
      const total = data.data?.sessions?.length || 0;
      setTotalItems(total);
      setSummary(data.data?.summary || null);
    } catch (error) {
      console.error('Failed to load sessions:', error);
      setSessions([]);
      toast.error(error.response?.data?.message || 'Error loading sessions');
    } finally {
      setLoading(false);
    }
  };

  // Load data on mount and when filters change
  useEffect(() => {
    if (isAuthenticated && isMentor()) {
      loadSessions();
    }
  }, [isAuthenticated, isMentor(), activeTab, statusFilter, typeFilter, page]);

  // Redirect if not authenticated or not a mentor
  if (!isAuthenticated) {
    navigate('/login');
    return null;
  }

  // Session action handlers
  const handleJoinSession = async (sessionId, meetingUrl) => {
    try {
      window.open(meetingUrl, '_blank');
      toast.success('Joining session...');
    } catch (error) {
      console.error('Join session error:', error);
    }
  };

  const handleCancelSession = async (sessionId) => {
    if (window.confirm('Are you sure you want to cancel this session?')) {
      try {
        // Use the API to cancel session
        await api.delete(`/sessions/details/${sessionId}`, {
          data: { reason: 'Cancelled by mentor' }
        });
        toast.success('Session cancelled successfully');
        await loadSessions(); // Refresh list
      } catch (error) {
        console.error('Cancel session error:', error);
        toast.error(error.response?.data?.message || 'Error cancelling session');
      }
    }
  };

  const handleRescheduleSession = async (sessionId) => {
    // For mentors, this should open a modal or navigate to reschedule request page
    navigate(`/sessions/${sessionId}/mentor-reschedule`);
  };

  const handleStartSession = async (sessionId) => {
    try {
      await api.post(`/sessions/details/${sessionId}/start`);
      toast.success('Session started!');
      await loadSessions(); // Refresh list
    } catch (error) {
      console.error('Start session error:', error);
      toast.error(error.response?.data?.message || 'Error starting session');
    }
  };

  const handleCompleteSession = async (sessionId) => {
    try {
      await api.post(`/sessions/details/${sessionId}/complete`, { notes: 'Session completed by mentor' });
      toast.success('Session completed successfully!');
      await loadSessions(); // Refresh list
    } catch (error) {
      console.error('Complete session error:', error);
      toast.error(error.response?.data?.message || 'Error completing session');
    }
  };

  const handleAddNotes = async (sessionId) => {
    navigate(`/sessions/${sessionId}/notes`);
  };

  // Filter handlers
  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    setPage(1);
  };

  const handleStatusFilterChange = (e) => {
    setStatusFilter(e.target.value);
    setPage(1);
  };

  const handleTypeFilterChange = (e) => {
    setTypeFilter(e.target.value);
    setPage(1);
  };

  const handlePageChange = (newPage) => {
    setPage(newPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Get tab counts (prefer API summary if available)
  const getTabCounts = () => {
    if (summary) {
      return {
        all: summary.total ?? totalItems,
        upcoming: summary.upcoming ?? 0,
        pending: summary.pending ?? 0,
        past: summary.past ?? 0,
      };
    }
    // Fallback: compute from current page items
    return {
      all: totalItems,
      upcoming: sessions.filter(s => ['pending', 'confirmed'].includes(s.status) && new Date(s.scheduled_at) > new Date()).length,
      pending: sessions.filter(s => s.status === 'pending').length,
      past: sessions.filter(s => ['completed', 'cancelled_by_mentee', 'cancelled_by_mentor'].includes(s.status)).length
    };
  };

  const tabCounts = getTabCounts();

  if (!isMentor()) {
    navigate('/dashboard');
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
      {/* Header */}
      <div className="bg-white shadow-lg border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">All Sessions</h1>
              <p className="text-gray-600 mt-1">
                View and manage all your mentoring sessions with advanced filtering
              </p>
            </div>
            <button
              onClick={() => navigate('/mentor/dashboard')}
              className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl transition-all duration-200 transform hover:scale-105 shadow-lg hover:shadow-xl"
            >
              ← Back to Dashboard
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Tabs */}
        <div className="flex flex-wrap gap-2 mb-6">
          {tabOptions.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`px-4 py-2 rounded-xl font-medium transition-all duration-200 ${
                activeTab === tab.id
                  ? 'bg-indigo-600 text-white shadow-lg'
                  : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-200'
              }`}
            >
              {tab.label}
              {tabCounts[tab.id] > 0 && (
                <span className={`ml-2 px-2 py-1 text-xs rounded-full ${
                  activeTab === tab.id
                    ? 'bg-indigo-500 text-white'
                    : 'bg-gray-100 text-gray-600'
                }`}>
                  {tabCounts[tab.id]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <select
            value={statusFilter}
            onChange={handleStatusFilterChange}
            className="px-4 py-2 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <select
            value={typeFilter}
            onChange={handleTypeFilterChange}
            className="px-4 py-2 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {typeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <div className="flex-1"></div>

          <div className="text-sm text-gray-600 flex items-center">
            Showing {sessions.length} of {totalItems} sessions
          </div>
        </div>

        {/* Loading State */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <LoadingSpinner size="xl" variant="gradient" />
          </div>
        ) : sessions.length === 0 ? (
          /* Empty State */
          <div className="text-center py-20">
            <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              {activeTab === 'upcoming' ? 'No upcoming sessions' :
               activeTab === 'past' ? 'No past sessions' :
               activeTab === 'pending' ? 'No pending sessions' :
               'No sessions found'}
            </h3>
            <p className="text-gray-600 mb-6">
              {activeTab === 'upcoming' ? "You don't have any upcoming mentoring sessions scheduled." :
               activeTab === 'past' ? "You don't have any completed sessions yet." :
               activeTab === 'pending' ? "You don't have any pending sessions." :
               "You don't have any sessions yet."}
            </p>
            {activeTab === 'upcoming' && (
              <button
                onClick={() => navigate('/mentor/availability')}
                className="px-6 py-3 bg-indigo-600 text-white font-medium rounded-xl hover:bg-indigo-700 transition-colors"
              >
                Set Your Availability
              </button>
            )}
          </div>
        ) : (
          /* Sessions List */
          <>
            <div className="space-y-6">
              {sessions.map((session) => (
                <SessionCard
                  key={session.id}
                  session={session}
                  userRole="mentor"
                  onJoinSession={handleJoinSession}
                  onCancelSession={handleCancelSession}
                  onRescheduleSession={handleRescheduleSession}
                  onStartSession={handleStartSession}
                  onCompleteSession={handleCompleteSession}
                  onAddNotes={handleAddNotes}
                />
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-8">
                <button
                  onClick={() => handlePageChange(page - 1)}
                  disabled={page <= 1}
                  className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Previous
                </button>

                {/* Page Numbers */}
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const pageNum = Math.max(1, Math.min(totalPages - 4, page - 2)) + i;
                  if (pageNum > totalPages) return null;

                  return (
                    <button
                      key={pageNum}
                      onClick={() => handlePageChange(pageNum)}
                      className={`px-3 py-2 border rounded-lg transition-colors ${
                        pageNum === page
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}

                <button
                  onClick={() => handlePageChange(page + 1)}
                  disabled={page >= totalPages}
                  className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}

        {/* Quick Stats */}
        {!loading && sessions.length > 0 && (
          <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 text-center">
              <div className="text-2xl font-bold text-indigo-600 mb-1">
                {sessions.filter(s => s.status === 'completed').length}
              </div>
              <div className="text-sm text-gray-600">Completed</div>
            </div>

            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 text-center">
              <div className="text-2xl font-bold text-green-600 mb-1">
                {sessions.filter(s => ['pending', 'confirmed'].includes(s.status)).length}
              </div>
              <div className="text-sm text-gray-600">Upcoming</div>
            </div>

            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 text-center">
              <div className="text-2xl font-bold text-yellow-600 mb-1">
                {sessions.filter(s => s.status === 'pending').length}
              </div>
              <div className="text-sm text-gray-600">Pending</div>
            </div>

            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 text-center">
              <div className="text-2xl font-bold text-purple-600 mb-1">
                ₹{Math.round(sessions.filter(s => s.status === 'completed').reduce((acc, s) => acc + (s.mentorEarnings || 0), 0))}
              </div>
              <div className="text-sm text-gray-600">Total Earnings</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MentorSessions;