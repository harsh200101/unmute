import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import SessionCard from '../components/SessionCard';
import LoadingSpinner from '../components/LoadingSpinner';
import sessionController from '../controllers/sessionController';
import { toast } from 'react-hot-toast';

const SessionManagement = () => {
  const { user, isMentor, isMentee, isAdmin } = useAuth();
  const navigate = useNavigate();

  // State management
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSessions, setSelectedSessions] = useState([]);
  const [showBulkActions, setShowBulkActions] = useState(false);
  
  // Filter states
  const [filters, setFilters] = useState({
    status: '',
    type: '',
    dateRange: '',
    search: '',
    mentorId: '',
    startDate: '',
    endDate: ''
  });
  
  // Pagination and sorting
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [sortBy, setSortBy] = useState('scheduled_at');
  const [sortOrder, setSortOrder] = useState('desc');
  
  // UI states
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [viewMode, setViewMode] = useState('card'); // 'card' or 'table'

  // Filter options
  const statusOptions = [
    { value: '', label: 'All Status' },
    { value: 'pending', label: 'Pending' },
    { value: 'scheduled', label: 'Scheduled' },
    { value: 'confirmed', label: 'Confirmed' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'completed', label: 'Completed' },
    { value: 'cancelled_by_mentee', label: 'Cancelled by Mentee' },
    { value: 'cancelled_by_mentor', label: 'Cancelled by Mentor' },
    { value: 'no_show_mentee', label: 'No Show - Mentee' },
    { value: 'no_show_mentor', label: 'No Show - Mentor' },
    { value: 'disputed', label: 'Disputed' },
    { value: 'refunded', label: 'Refunded' }
  ];

  const typeOptions = [
    { value: '', label: 'All Types' },
    { value: 'video', label: 'Video Call' },
    { value: 'voice', label: 'Voice Call' },
    { value: 'chat', label: 'Chat Session' },
    { value: 'in_person', label: 'In Person' }
  ];

  const dateRangeOptions = [
    { value: '', label: 'All Time' },
    { value: 'today', label: 'Today' },
    { value: 'tomorrow', label: 'Tomorrow' },
    { value: 'this_week', label: 'This Week' },
    { value: 'next_week', label: 'Next Week' },
    { value: 'this_month', label: 'This Month' },
    { value: 'next_month', label: 'Next Month' },
    { value: 'custom', label: 'Custom Range' }
  ];

  const sortOptions = [
    { value: 'scheduled_at', label: 'Date' },
    { value: 'created_at', label: 'Created' },
    { value: 'price', label: 'Price' },
    { value: 'duration_minutes', label: 'Duration' },
    { value: 'status', label: 'Status' }
  ];

  // Load sessions
  const loadSessions = async () => {
    setLoading(true);
    try {
      const requestFilters = {
        ...filters,
        page,
        limit: 12,
        sort: `${sortBy}:${sortOrder}`
      };

      // Handle date range filtering
      if (filters.dateRange && filters.dateRange !== 'custom') {
        const now = new Date();
        switch (filters.dateRange) {
          case 'today':
            requestFilters.startDate = now.toISOString().split('T')[0];
            requestFilters.endDate = now.toISOString().split('T')[0];
            break;
          case 'tomorrow':
            const tomorrow = new Date(now);
            tomorrow.setDate(tomorrow.getDate() + 1);
            requestFilters.startDate = tomorrow.toISOString().split('T')[0];
            requestFilters.endDate = tomorrow.toISOString().split('T')[0];
            break;
          case 'this_week':
            const startOfWeek = new Date(now);
            startOfWeek.setDate(now.getDate() - now.getDay());
            const endOfWeek = new Date(startOfWeek);
            endOfWeek.setDate(startOfWeek.getDate() + 6);
            requestFilters.startDate = startOfWeek.toISOString().split('T')[0];
            requestFilters.endDate = endOfWeek.toISOString().split('T')[0];
            break;
          // Add more date range cases as needed
        }
      }

      const response = await sessionController.getMySessions(requestFilters);
      
      if (response.success) {
        setSessions(response.sessions || []);
        setTotalPages(response.pagination?.totalPages || 1);
        setTotalItems(response.pagination?.totalItems || 0);
      } else {
        setSessions([]);
        toast.error('Failed to load sessions');
      }
    } catch (error) {
      console.error('Error loading sessions:', error);
      setSessions([]);
      toast.error('Error loading sessions');
    } finally {
      setLoading(false);
    }
  };

  // Load sessions when filters change
  useEffect(() => {
    loadSessions();
  }, [filters, page, sortBy, sortOrder]);

  // Filter handlers
  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPage(1); // Reset to first page when filtering
  };

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
    setPage(1);
  };

  const clearFilters = () => {
    setFilters({
      status: '',
      type: '',
      dateRange: '',
      search: '',
      mentorId: '',
      startDate: '',
      endDate: ''
    });
    setPage(1);
  };

  // Session selection
  const handleSessionSelect = (sessionId) => {
    setSelectedSessions(prev => {
      if (prev.includes(sessionId)) {
        return prev.filter(id => id !== sessionId);
      } else {
        return [...prev, sessionId];
      }
    });
  };

  const handleSelectAll = () => {
    if (selectedSessions.length === sessions.length) {
      setSelectedSessions([]);
    } else {
      setSelectedSessions(sessions.map(s => s.id));
    }
  };

  // Bulk actions
  const handleBulkAction = async (action) => {
    if (selectedSessions.length === 0) {
      toast.error('Please select sessions first');
      return;
    }

    if (!window.confirm(`Are you sure you want to ${action} ${selectedSessions.length} session(s)?`)) {
      return;
    }

    try {
      const promises = selectedSessions.map(sessionId => {
        switch (action) {
          case 'cancel':
            return sessionController.cancelSession(sessionId);
          case 'reschedule':
            // This would typically open a modal or navigate to reschedule page
            navigate(`/sessions/bulk-reschedule?ids=${selectedSessions.join(',')}`);
            return Promise.resolve();
          default:
            return Promise.resolve();
        }
      });

      await Promise.all(promises);
      
      if (action !== 'reschedule') {
        toast.success(`Successfully ${action}ed ${selectedSessions.length} session(s)`);
        setSelectedSessions([]);
        await loadSessions();
      }
    } catch (error) {
      console.error('Bulk action error:', error);
      toast.error(`Failed to ${action} sessions`);
    }
  };

  // Session action handlers
  const handleJoinSession = async (sessionId, meetingUrl) => {
    try {
      await sessionController.joinSession(sessionId, meetingUrl);
      await loadSessions();
    } catch (error) {
      console.error('Join session error:', error);
    }
  };

  const handleCancelSession = async (sessionId) => {
    if (window.confirm('Are you sure you want to cancel this session?')) {
      try {
        await sessionController.cancelSession(sessionId);
        await loadSessions();
      } catch (error) {
        console.error('Cancel session error:', error);
      }
    }
  };

  const handleRescheduleSession = (sessionId) => {
    navigate(`/sessions/${sessionId}/reschedule`);
  };

  const handleStartSession = async (sessionId) => {
    try {
      await sessionController.startSession(sessionId);
      await loadSessions();
    } catch (error) {
      console.error('Start session error:', error);
    }
  };

  const handleCompleteSession = async (sessionId) => {
    try {
      await sessionController.completeSession(sessionId);
      await loadSessions();
    } catch (error) {
      console.error('Complete session error:', error);
    }
  };

  const handleAddNotes = (sessionId) => {
    navigate(`/sessions/${sessionId}/notes`);
  };

  // Export sessions
  const handleExport = async () => {
    try {
      // This would call an export API endpoint
      toast.success('Export started. You will receive an email when ready.');
    } catch (error) {
      toast.error('Export failed');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                Session Management
              </h1>
              <p className="text-gray-600">
                Manage and track all your {isMentor() ? 'mentoring' : 'learning'} sessions
              </p>
            </div>
            
            <div className="mt-4 lg:mt-0 flex gap-3">
              {/* View Toggle */}
              <div className="flex bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setViewMode('card')}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    viewMode === 'card' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14-7H5m14 14H5" />
                  </svg>
                </button>
                <button
                  onClick={() => setViewMode('table')}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    viewMode === 'table' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                  </svg>
                </button>
              </div>

              <button
                onClick={handleExport}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Export
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Filters */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 mb-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-900">Filters</h2>
            <div className="flex gap-2">
              <button
                onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                {showAdvancedFilters ? 'Hide' : 'Show'} Advanced
              </button>
              <button
                onClick={clearFilters}
                className="text-sm text-gray-600 hover:text-gray-700 font-medium"
              >
                Clear All
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Search */}
            <div className="lg:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
              <input
                type="text"
                placeholder="Search sessions..."
                value={filters.search}
                onChange={(e) => handleFilterChange('search', e.target.value)}
                className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Status */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select
                value={filters.status}
                onChange={(e) => handleFilterChange('status', e.target.value)}
                className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {statusOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select
                value={filters.type}
                onChange={(e) => handleFilterChange('type', e.target.value)}
                className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {typeOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Advanced Filters */}
          {showAdvancedFilters && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-4 pt-4 border-t border-gray-200">
              {/* Date Range */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date Range</label>
                <select
                  value={filters.dateRange}
                  onChange={(e) => handleFilterChange('dateRange', e.target.value)}
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {dateRangeOptions.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Custom Date Range */}
              {filters.dateRange === 'custom' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                    <input
                      type="date"
                      value={filters.startDate}
                      onChange={(e) => handleFilterChange('startDate', e.target.value)}
                      className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                    <input
                      type="date"
                      value={filters.endDate}
                      onChange={(e) => handleFilterChange('endDate', e.target.value)}
                      className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </>
              )}

              {/* Sort */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Sort By</label>
                <div className="flex gap-2">
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="flex-1 px-4 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {sortOptions.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                    className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    {sortOrder === 'asc' ? '↑' : '↓'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Results Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
          <div className="flex items-center gap-4 mb-4 sm:mb-0">
            <p className="text-sm text-gray-600">
              Showing {sessions.length} of {totalItems.toLocaleString()} sessions
            </p>
            
            {/* Bulk Actions */}
            {selectedSessions.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">
                  {selectedSessions.length} selected
                </span>
                <button
                  onClick={() => handleBulkAction('cancel')}
                  className="px-3 py-1 bg-red-100 hover:bg-red-200 text-red-700 text-sm font-medium rounded-lg transition-colors"
                >
                  Cancel Selected
                </button>
                <button
                  onClick={() => handleBulkAction('reschedule')}
                  className="px-3 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 text-sm font-medium rounded-lg transition-colors"
                >
                  Reschedule Selected
                </button>
              </div>
            )}
          </div>
          
          {sessions.length > 0 && (
            <button
              onClick={handleSelectAll}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              {selectedSessions.length === sessions.length ? 'Deselect All' : 'Select All'}
            </button>
          )}
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
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No sessions found</h3>
            <p className="text-gray-600 mb-6">
              Try adjusting your filters or {isMentee() ? 'book your first session' : 'wait for bookings'}
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
          /* Sessions Grid/List */
          <>
            {viewMode === 'card' ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {sessions.map((session) => (
                  <div key={session.id} className="relative">
                    {/* Selection Checkbox */}
                    <input
                      type="checkbox"
                      checked={selectedSessions.includes(session.id)}
                      onChange={() => handleSessionSelect(session.id)}
                      className="absolute top-4 left-4 z-10 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    
                    <SessionCard
                      session={session}
                      userRole={isMentor() ? 'mentor' : 'mentee'}
                      onJoinSession={handleJoinSession}
                      onCancelSession={handleCancelSession}
                      onRescheduleSession={handleRescheduleSession}
                      onStartSession={handleStartSession}
                      onCompleteSession={handleCompleteSession}
                      onAddNotes={handleAddNotes}
                      className="ml-8"
                    />
                  </div>
                ))}
              </div>
            ) : (
              /* Table View */
              <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left">
                          <input
                            type="checkbox"
                            checked={selectedSessions.length === sessions.length && sessions.length > 0}
                            onChange={handleSelectAll}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                          />
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Participant
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer" onClick={() => handleSort('scheduled_at')}>
                          Date & Time
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Type
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer" onClick={() => handleSort('status')}>
                          Status
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer" onClick={() => handleSort('price')}>
                          Price
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {sessions.map((session) => (
                        <tr key={session.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4">
                            <input
                              type="checkbox"
                              checked={selectedSessions.includes(session.id)}
                              onChange={() => handleSessionSelect(session.id)}
                              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                            />
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white text-sm font-bold">
                                {(isMentor() ? session.mentee_name : session.mentor_name)?.charAt(0) || 'U'}
                              </div>
                              <div className="ml-3">
                                <div className="text-sm font-medium text-gray-900">
                                  {isMentor() ? session.mentee_name : session.mentor_name}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {new Date(session.scheduled_at).toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata' })} <br />
                            {new Date(session.scheduled_at).toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata' })}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                              {session.session_type}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                              session.status === 'completed' ? 'bg-green-100 text-green-800' :
                              session.status === 'confirmed' ? 'bg-blue-100 text-blue-800' :
                              session.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {session.status.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            ${session.price}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                            <div className="flex gap-2">
                              <button
                                onClick={() => navigate(`/sessions/${session.id}`)}
                                className="text-blue-600 hover:text-blue-700"
                              >
                                View
                              </button>
                              {session.status === 'confirmed' && (
                                <button
                                  onClick={() => handleJoinSession(session.id, session.meeting_url)}
                                  className="text-green-600 hover:text-green-700"
                                >
                                  Join
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-8">
                <button
                  onClick={() => setPage(page - 1)}
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
                      onClick={() => setPage(pageNum)}
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
                  onClick={() => setPage(page + 1)}
                  disabled={page >= totalPages}
                  className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default SessionManagement;
