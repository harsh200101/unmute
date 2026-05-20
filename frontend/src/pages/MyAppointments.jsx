import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import SessionCard from '../components/SessionCard';
import LoadingSpinner from '../components/LoadingSpinner';
import MenteeRescheduleRequests from './MenteeRescheduleRequests';
import sessionController from '../controllers/sessionController';
import { toast } from 'react-hot-toast';

const MyAppointments = () => {
  const { user, isMentor, isMentee } = useAuth();
  const navigate = useNavigate();

  // State management
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all'); // all, upcoming, past, pending
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [summary, setSummary] = useState(null); // from API (total, upcoming, past, pending)

  // Tab options
  const tabOptions = [
    { id: 'all', label: 'All Sessions', count: 0 },
    { id: 'upcoming', label: 'Upcoming', count: 0 },
    { id: 'pending', label: 'Pending', count: 0 },
    { id: 'past', label: 'Past', count: 0 }
  ];

  // Status options for filtering
  const statusOptions = [
    { value: '', label: 'All Status' },
    { value: 'pending', label: 'Pending' },
    { value: 'confirmed', label: 'Confirmed' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'completed', label: 'Completed' },
    { value: 'cancelled_by_mentee', label: 'Cancelled by Me' },
    { value: 'cancelled_by_mentor', label: 'Cancelled by Mentor' }
  ];

  // Type options
  const typeOptions = [
    { value: '', label: 'All Types' },
    { value: 'video', label: 'Video Call' },
    { value: 'voice', label: 'Voice Call' },
    { value: 'chat', label: 'Chat Session' }
  ];

  // Load sessions.
  // `silent` skips the loading-spinner state so background polls / focus
  // refreshes do not visually flash the whole page every 10 seconds.
  const loadSessions = async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const filters = {
        page,
        limit: 10,
        status: statusFilter,
        type: typeFilter
      };

      // Apply tab-specific filters
      if (activeTab === 'upcoming') {
        filters.upcoming = true;
      } else if (activeTab === 'past') {
        filters.past = true;
      } else if (activeTab === 'pending') {
        filters.status = 'pending';
      }

      const response = await sessionController.getMySessions(filters);
      
      if (response.success) {
        setSessions(response.sessions);
        setTotalPages(response.pagination?.totalPages || 1);
        const total = response.pagination?.totalSessions ?? response.summary?.total ?? response.sessions?.length ?? 0;
        setTotalItems(total);
        setSummary(response.summary || null);
      }
    } catch (error) {
      console.error('Failed to load sessions:', error);
      // Suppress error toast on background polls so a transient network blip
      // doesn't spam the user every 10 seconds.
      if (!silent) toast.error('Failed to load sessions');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // Load sessions when filters change or component mounts
  useEffect(() => {
    loadSessions();
  }, [activeTab, statusFilter, typeFilter, page]);

  // Auto-refresh when there are active meetings (in_progress status)
  useEffect(() => {
    // Check if there are any in_progress sessions
    const hasActiveMeetings = sessions.some(session => session.status === 'in_progress');

    if (hasActiveMeetings) {
      // Refresh every 30 seconds when there are active meetings.
      // Silent mode keeps the data fresh without flashing the loading spinner.
      // 30s strikes a balance between fresh status updates and not breaching
      // the backend rate limit for /my-sessions when the user keeps the
      // dashboard open for long stretches.
      const refreshInterval = setInterval(() => {
        loadSessions({ silent: true });
      }, 30000); // 30 seconds

      return () => clearInterval(refreshInterval);
    }
  }, [sessions, activeTab, statusFilter, typeFilter, page]);

  // Refresh when window regains focus (user might be returning from meeting)
  useEffect(() => {
    const handleFocus = () => {
      loadSessions({ silent: true });
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [activeTab, statusFilter, typeFilter, page]);

  // Session action handlers
  const handleJoinSession = async (sessionId, meetingUrl) => {
    try {
      // Navigate to the video meeting room instead of opening URL
      navigate(`/meeting/${sessionId}`);
    } catch (error) {
      console.error('Join session error:', error);
    }
  };

  const handleCancelSession = async (sessionId) => {
    if (window.confirm('Are you sure you want to cancel this session?')) {
      try {
        await sessionController.cancelSession(sessionId);
        await loadSessions(); // Refresh list
      } catch (error) {
        console.error('Cancel session error:', error);
      }
    }
  };

  const handleRescheduleSession = async (sessionId) => {
    // Navigate to reschedule page or open modal
    navigate(`/sessions/${sessionId}/reschedule`);
  };

  const handleRespondToReschedule = async (sessionId, responseData) => {
    // Handle mentee response to mentor's reschedule request
    try {
      await sessionController.respondToRescheduleRequest(sessionId, responseData);
      await loadSessions(); // Refresh list
    } catch (error) {
      console.error('Respond to reschedule error:', error);
    }
  };

  const handleStartSession = async (sessionId) => {
    try {
      await sessionController.startSession(sessionId);
      await loadSessions(); // Refresh list
    } catch (error) {
      console.error('Start session error:', error);
    }
  };

  const handleCompleteSession = async (sessionId) => {
    try {
      await sessionController.completeSession(sessionId);
      await loadSessions(); // Refresh list
    } catch (error) {
      console.error('Complete session error:', error);
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                My {isMentor() ? 'Mentoring ' : ''}Sessions
              </h1>
              <p className="text-gray-600">
                {isMentor() 
                  ? 'Manage your mentoring sessions and track your progress' 
                  : 'View and manage your learning sessions'
                }
              </p>
            </div>
            
            <div className="mt-4 md:mt-0">
              {isMentee() && (
                <button
                  onClick={() => navigate('/mentors')}
                  className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold rounded-xl transition-all duration-200 transform hover:scale-[1.02] shadow-lg hover:shadow-xl"
                >
                  📅 Book New Session
                </button>
              )}
            </div>
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
                  ? 'bg-blue-600 text-white shadow-lg'
                  : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-200'
              }`}
            >
              {tab.label}
              {tabCounts[tab.id] > 0 && (
                <span className={`ml-2 px-2 py-1 text-xs rounded-full ${
                  activeTab === tab.id
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 text-gray-600'
                }`}>
                  {tabCounts[tab.id]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Reschedule Requests for Mentees */}
        {isMentee() && (
          <div className="mb-8">
            <MenteeRescheduleRequests />
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <select
            value={statusFilter}
            onChange={handleStatusFilterChange}
            className="px-4 py-2 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
            className="px-4 py-2 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              {isMentee() 
                ? "You haven't booked any sessions yet. Find a mentor to get started!" 
                : "You don't have any sessions scheduled yet."
              }
            </p>
            {isMentee() && (
              <button
                onClick={() => navigate('/mentors')}
                className="px-6 py-3 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 transition-colors"
              >
                Find Mentors
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
                  userRole={isMentor() ? 'mentor' : 'mentee'}
                  onJoinSession={handleJoinSession}
                  onCancelSession={handleCancelSession}
                  onRescheduleSession={handleRescheduleSession}
                  onRespondToReschedule={handleRespondToReschedule}
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
                          ? 'bg-blue-600 text-white border-blue-600'
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
              <div className="text-2xl font-bold text-blue-600 mb-1">
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
                {Math.round(sessions.filter(s => s.status === 'completed').reduce((acc, s) => acc + (s.duration_minutes || 0), 0) / 60)}h
              </div>
              <div className="text-sm text-gray-600">Total Hours</div>
            </div>
          </div>
        )}

        {/* Help Section */}
        <div className="mt-12 bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl p-8 text-white text-center">
          <h3 className="text-2xl font-bold mb-2">Need Help?</h3>
          <p className="mb-6 opacity-90">
            Having trouble with your sessions? Our support team is here to help.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={() => navigate('/help')}
              className="px-6 py-3 bg-white text-blue-600 font-medium rounded-xl hover:bg-gray-50 transition-colors"
            >
              📖 Help Center
            </button>
            <button
              onClick={() => navigate('/contact')}
              className="px-6 py-3 bg-white/20 text-white font-medium rounded-xl hover:bg-white/30 transition-colors border border-white/30"
            >
              💬 Contact Support
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MyAppointments;