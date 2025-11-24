import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import sessionController from '../controllers/sessionController';
import LoadingSpinner from '../components/LoadingSpinner';
import { toast } from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

const RescheduleSession = () => {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rescheduling, setRescheduling] = useState(false);
  const [availability, setAvailability] = useState([]);
  const [existingBookings, setExistingBookings] = useState([]);
  const [loadingAvailability, setLoadingAvailability] = useState(false);

  // Form state
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedTime, setSelectedTime] = useState(null);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [reason, setReason] = useState('');

  // Generate available dates (next 30 days)
  const availableDates = Array.from({ length: 30 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() + i + 1); // Start from tomorrow
    date.setHours(0, 0, 0, 0); // Reset time to start of day
    return date;
  });

  // Load session details
  useEffect(() => {
    const loadSession = async () => {
      try {
        setLoading(true);
        const response = await sessionController.getSessionDetails(sessionId);

        if (response.success) {
          const sessionData = response.session;
          setSession(sessionData);
          setDurationMinutes(sessionData.durationMinutes);

          // Load mentor availability
          await loadMentorAvailability(sessionData.mentor.id);
        } else {
          toast.error('Failed to load session details');
          navigate('/dashboard', { replace: true });
        }
      } catch (error) {
        console.error('Failed to load session:', error);
        toast.error('Failed to load session details');
        navigate('/dashboard', { replace: true });
      } finally {
        setLoading(false);
      }
    };

    if (sessionId) {
      loadSession();
    }
  }, [sessionId, navigate]);

  // Load mentor availability
  const loadMentorAvailability = async (mentorId, date = null) => {
    setLoadingAvailability(true);
    try {
      // Use the direct API endpoint for mentor availability
      const dateParam = date ? `?date=${date.toISOString().split('T')[0]}` : '';
      const response = await fetch(`/api/mentors/${mentorId}/availability${dateParam}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        console.log('🔍 Availability response:', data);
        setAvailability(data.data?.availability || []);
        setExistingBookings(data.data?.existingBookings || []);
      } else {
        throw new Error('Failed to load availability');
      }
    } catch (error) {
      console.error('Failed to load availability:', error);
      toast.error('Failed to load mentor availability');
    } finally {
      setLoadingAvailability(false);
    }
  };

  // Enhanced time slots based on mentor availability
  const getAvailableTimeSlots = (selectedDate) => {
    if (!selectedDate || !availability.length) {
      // Default availability: 10 AM to 10 PM (22:00)
      const defaultSlots = [];
      for (let hour = 10; hour <= 21; hour++) {
        defaultSlots.push(`${hour.toString().padStart(2, '0')}:00`);
      }
      return defaultSlots;
    }

    // Get date key for specific overrides
    const dateKey = selectedDate.toISOString().split('T')[0];
    const dayOfWeek = selectedDate.getDay();

    // Check if there are specific date overrides for this date
    const dateOverrides = availability.filter(slot => slot.specific_date === dateKey);
    const hasDateOverrides = dateOverrides.length > 0;

    let availableRanges;
    if (hasDateOverrides) {
      // Use date-specific overrides
      availableRanges = dateOverrides.filter(slot => slot.is_available);
    } else {
      // Use recurring availability
      availableRanges = availability.filter(slot =>
        slot.day_of_week === dayOfWeek && slot.is_available && slot.specific_date === null
      );
    }

    if (availableRanges.length === 0) return [];

    // Generate time slots from available ranges (1-hour slots)
    const allSlots = availableRanges.flatMap(slot => {
      const slots = [];
      const startHour = parseInt(slot.start_time.split(':')[0]);
      const endHour = parseInt(slot.end_time.split(':')[0]);

      for (let hour = startHour; hour < endHour; hour++) {
        slots.push(`${hour.toString().padStart(2, '0')}:00`);
      }
      return slots;
    });

    // Remove duplicates and sort
    const uniqueSlots = [...new Set(allSlots)].sort();

    // Filter out slots that conflict with existing bookings
    const availableSlots = uniqueSlots.filter(slotTime => {
      const slotStart = new Date(selectedDate);
      const [hours, minutes] = slotTime.split(':').map(Number);
      slotStart.setHours(hours, minutes, 0, 0);
      const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60000);

      // Check if this slot conflicts with any existing booking
      return !existingBookings.some(booking => {
        const bookingStart = new Date(booking.scheduledAt);
        const bookingEnd = new Date(bookingStart.getTime() + booking.duration * 60000);

        // Overlap check: slot starts before booking ends AND booking starts before slot ends
        return slotStart < bookingEnd && bookingStart < slotEnd;
      });
    });

    return availableSlots;
  };

  // Check if selected time conflicts with existing sessions
  const checkTimeConflict = (date, time) => {
    if (!session || !date || !time) return false;

    // For simplicity, we'll let the backend handle conflict checking
    // In a real implementation, you might want to check against existing bookings here
    return false;
  };

  // Handle reschedule submission
  const handleReschedule = async () => {
    if (!selectedDate || !selectedTime) {
      toast.error('Please select both date and time');
      return;
    }

    // Reason is optional when responding to mentor's reschedule request
    // Only required for direct rescheduling by mentee

    // Check 24-hour rule
    const selectedDateTime = new Date(selectedDate);
    const [hours, minutes] = selectedTime.split(':').map(Number);
    selectedDateTime.setHours(hours, minutes, 0, 0);
    const now = new Date();
    const hoursUntilSession = (selectedDateTime - now) / (1000 * 60 * 60);

    if (hoursUntilSession < 24) {
      toast.error('New session time must be at least 24 hours from now');
      return;
    }

    // Check if time conflicts
    if (checkTimeConflict(selectedDate, selectedTime)) {
      toast.error('This time slot conflicts with an existing session');
      return;
    }

    setRescheduling(true);
    try {
      const newScheduledAt = new Date(selectedDate);
      const [hours, minutes] = selectedTime.split(':').map(Number);
      newScheduledAt.setHours(hours, minutes, 0, 0);

      const rescheduleData = {
        newScheduledAt: newScheduledAt.toISOString(),
        newDuration: durationMinutes,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        reason: reason.trim()
      };

      const response = await sessionController.rescheduleSession(sessionId, rescheduleData);

      if (response.success) {
        toast.success('Session rescheduled successfully!');
        navigate('/dashboard', { replace: true });
      } else {
        toast.error(response.message || 'Failed to reschedule session');
      }
    } catch (error) {
      console.error('Reschedule error:', error);
      toast.error(error.response?.data?.message || 'Failed to reschedule session');
    } finally {
      setRescheduling(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center">
        <LoadingSpinner size="xl" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Session Not Found</h2>
          <button
            onClick={() => navigate('/dashboard', { replace: true })}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const availableTimeSlots = getAvailableTimeSlots(selectedDate);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Reschedule Session</h1>
              <p className="text-gray-600 mt-1">
                Select a new date and time for your session with {session.mentor.firstName} {session.mentor.lastName}
              </p>
            </div>
            <button
              onClick={() => navigate('/dashboard', { replace: true })}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
            >
              ← Back
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Current Session Info */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 mb-8">
          <h3 className="text-lg font-semibold text-blue-900 mb-4">Current Session</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <span className="font-medium text-blue-900">Mentor:</span>
              <p className="text-blue-800">{session.mentor.firstName} {session.mentor.lastName}</p>
            </div>
            <div>
              <span className="font-medium text-blue-900">Current Time:</span>
              <p className="text-blue-800">
                {new Date(session.scheduledAt).toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata' })} at {new Date(session.scheduledAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}
              </p>
            </div>
            <div>
              <span className="font-medium text-blue-900">Duration:</span>
              <p className="text-blue-800">{session.durationMinutes} minutes</p>
            </div>
          </div>
        </div>

        {/* Reschedule Form */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Select New Time</h2>

          {/* Duration */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Session Duration
            </label>
            <select
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(parseInt(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
            >
              <option value={30}>30 minutes</option>
              <option value={60}>60 minutes</option>
              <option value={90}>90 minutes</option>
              <option value={120}>120 minutes</option>
            </select>
          </div>

          {/* Date Selection */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Date
            </label>
            {loadingAvailability ? (
              <div className="text-center py-4">Loading availability...</div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-40 overflow-y-auto">
                {availableDates.slice(0, 14).map((date) => (
                  <button
                    key={date.toISOString()}
                    onClick={() => {
                      setSelectedDate(date);
                      setSelectedTime(null);
                    }}
                    className={`p-3 text-sm rounded-lg border transition-colors ${
                      selectedDate?.toDateString() === date.toDateString()
                        ? 'border-blue-500 bg-blue-50 text-blue-600'
                        : 'border-gray-300 hover:border-blue-300 hover:bg-blue-50'
                    }`}
                  >
                    {date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Time Selection */}
          {selectedDate && (
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Available Times
              </label>
              {availableTimeSlots.length === 0 ? (
                <div className="text-center py-4 text-gray-500">
                  No available times for this date
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {availableTimeSlots.map((time) => (
                    <button
                      key={time}
                      onClick={() => setSelectedTime(time)}
                      className={`p-2 text-sm rounded-lg border transition-colors ${
                        selectedTime === time
                          ? 'border-blue-500 bg-blue-50 text-blue-600'
                          : 'border-gray-300 hover:border-blue-300 hover:bg-blue-50'
                      }`}
                    >
                      {time}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Reason */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Reason for Rescheduling (Optional)
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Please explain why you need to reschedule..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
              rows={3}
            />
          </div>

          {/* Summary */}
          {selectedDate && selectedTime && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6">
              <h4 className="font-semibold text-green-900 mb-2">New Session Details</h4>
              <div className="text-sm text-green-800 space-y-1">
                <p><strong>Date:</strong> {selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'Asia/Kolkata' })}</p>
                <p><strong>Time:</strong> {selectedTime}</p>
                <p><strong>Duration:</strong> {durationMinutes} minutes</p>
                <p><strong>Ends:</strong> {(() => {
                  const [hours, minutes] = selectedTime.split(':').map(Number);
                  const endTime = new Date(selectedDate);
                  endTime.setHours(hours, minutes + durationMinutes);
                  return endTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
                })()}</p>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex space-x-4">
            <button
              onClick={() => navigate('/dashboard', { replace: true })}
              className="flex-1 bg-gray-200 text-gray-800 py-3 px-4 rounded-lg font-medium hover:bg-gray-300 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleReschedule}
              disabled={!selectedDate || !selectedTime || rescheduling}
              className="flex-1 bg-blue-600 text-white py-3 px-4 rounded-lg font-medium disabled:opacity-50 hover:bg-blue-700 transition-colors"
            >
              {rescheduling ? 'Rescheduling...' : 'Reschedule Session'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RescheduleSession;