import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import LoadingSpinner from '../components/LoadingSpinner';
import { toast } from 'react-hot-toast';
import api from '../utils/api';

const MentorAvailability = () => {
  const { user, isAuthenticated, isMentor } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [availability, setAvailability] = useState([]);
  const [weeklySchedule, setWeeklySchedule] = useState({});
  const [dateOverrides, setDateOverrides] = useState({});
  const [activeTab, setActiveTab] = useState('weekly'); // 'weekly' or 'overrides'

  // Days of the week
  const daysOfWeek = [
    { value: 0, label: 'Sunday', short: 'Sun' },
    { value: 1, label: 'Monday', short: 'Mon' },
    { value: 2, label: 'Tuesday', short: 'Tue' },
    { value: 3, label: 'Wednesday', short: 'Wed' },
    { value: 4, label: 'Thursday', short: 'Thu' },
    { value: 5, label: 'Friday', short: 'Fri' },
    { value: 6, label: 'Saturday', short: 'Sat' }
  ];

  // Initialize default weekly schedule (10am - 10pm)
  const initializeDefaultSchedule = () => {
    const defaultSchedule = {};
    daysOfWeek.forEach(day => {
      defaultSchedule[day.value] = [{
        id: null,
        isAvailable: true,
        startTime: '10:00',
        endTime: '22:00',
        slotDurationMinutes: 60
      }];
    });
    return defaultSchedule;
  };

  // Load current availability
  const loadAvailability = async () => {
    try {
      setLoading(true);
      const response = await api.get('/mentors/availability');

      if (response.data.success) {
        const availabilityData = response.data.data.availability;

        // Separate weekly and specific date availability
        const weekly = {};
        const overrides = {};

        // Initialize empty arrays for each day
        daysOfWeek.forEach(day => {
          weekly[day.value] = [];
        });

        availabilityData.forEach(slot => {
          if (slot.specificDate) {
            // Specific date override
            const dateKey = slot.specificDate.split('T')[0]; // Get date part only
            if (!overrides[dateKey]) {
              overrides[dateKey] = [];
            }
            overrides[dateKey].push({
              id: slot.id,
              isAvailable: slot.isAvailable,
              startTime: slot.startTime ? slot.startTime.substring(0, 5) : null,
              endTime: slot.endTime ? slot.endTime.substring(0, 5) : null,
              slotDurationMinutes: slot.slotDurationMinutes,
              notes: slot.notes || ''
            });
          } else if (slot.dayOfWeek !== null && slot.dayOfWeek !== undefined) {
            // Weekly recurring
            if (!weekly[slot.dayOfWeek]) {
              weekly[slot.dayOfWeek] = [];
            }
            weekly[slot.dayOfWeek].push({
              id: slot.id,
              isAvailable: slot.isAvailable,
              startTime: slot.startTime ? slot.startTime.substring(0, 5) : '10:00',
              endTime: slot.endTime ? slot.endTime.substring(0, 5) : '22:00',
              slotDurationMinutes: slot.slotDurationMinutes || 60
            });
          }
        });

        // Fill in missing days with defaults
        daysOfWeek.forEach(day => {
          if (weekly[day.value].length === 0) {
            weekly[day.value] = [{
              isAvailable: true,
              startTime: '10:00',
              endTime: '22:00',
              slotDurationMinutes: 60
            }];
          }
        });

        setWeeklySchedule(weekly);
        setDateOverrides(overrides);
      }
    } catch (error) {
      console.error('Failed to load availability:', error);
      // Initialize with defaults if no data exists
      setWeeklySchedule(initializeDefaultSchedule());
      setDateOverrides({});
      if (error.response?.status !== 404) {
        toast.error('Failed to load availability');
      }
    } finally {
      setLoading(false);
    }
  };

  // Update weekly schedule slot
  const updateWeeklySchedule = (dayOfWeek, slotIndex, field, value) => {
    setWeeklySchedule(prev => ({
      ...prev,
      [dayOfWeek]: prev[dayOfWeek].map((slot, index) =>
        index === slotIndex ? { ...slot, [field]: value } : slot
      )
    }));
  };

  // Toggle day availability (affects all slots for that day)
  const toggleDayAvailability = (dayOfWeek) => {
    setWeeklySchedule(prev => ({
      ...prev,
      [dayOfWeek]: prev[dayOfWeek].map(slot => ({
        ...slot,
        isAvailable: !slot.isAvailable
      }))
    }));
  };

  // Add time slot to a day
  const addTimeSlot = (dayOfWeek) => {
    const newSlot = {
      isAvailable: true,
      startTime: '09:00',
      endTime: '17:00',
      slotDurationMinutes: 60
    };
    setWeeklySchedule(prev => ({
      ...prev,
      [dayOfWeek]: [...prev[dayOfWeek], newSlot]
    }));
  };

  // Remove time slot from a day
  const removeTimeSlot = (dayOfWeek, slotIndex) => {
    setWeeklySchedule(prev => ({
      ...prev,
      [dayOfWeek]: prev[dayOfWeek].filter((_, index) => index !== slotIndex)
    }));
  };

  // Add date override
  const addDateOverride = () => {
    const today = new Date().toISOString().split('T')[0];
    const newOverride = [{
      isAvailable: true,
      startTime: '10:00',
      endTime: '22:00',
      slotDurationMinutes: 60,
      notes: ''
    }];
    setDateOverrides(prev => ({
      ...prev,
      [today]: newOverride
    }));
  };

  // Update date override slot
  const updateDateOverride = (date, slotIndex, field, value) => {
    setDateOverrides(prev => ({
      ...prev,
      [date]: prev[date].map((slot, index) =>
        index === slotIndex ? { ...slot, [field]: value } : slot
      )
    }));
  };

  // Remove date override
  const removeDateOverride = (date) => {
    setDateOverrides(prev => {
      const newOverrides = { ...prev };
      delete newOverrides[date];
      return newOverrides;
    });
  };

  // Toggle date availability (affects all slots for that date)
  const toggleDateAvailability = (date) => {
    setDateOverrides(prev => ({
      ...prev,
      [date]: prev[date].map(slot => ({
        ...slot,
        isAvailable: !slot.isAvailable
      }))
    }));
  };

  // Add time slot to a date override
  const addDateTimeSlot = (date) => {
    const newSlot = {
      isAvailable: true,
      startTime: '09:00',
      endTime: '17:00',
      slotDurationMinutes: 60,
      notes: ''
    };
    setDateOverrides(prev => ({
      ...prev,
      [date]: [...prev[date], newSlot]
    }));
  };

  // Remove time slot from a date override
  const removeDateTimeSlot = (date, slotIndex) => {
    setDateOverrides(prev => ({
      ...prev,
      [date]: prev[date].filter((_, index) => index !== slotIndex)
    }));
  };

  // Validate time range
  const validateTimeRange = (startTime, endTime) => {
    if (!startTime || !endTime) return true; // Allow null times for unavailable days
    return startTime < endTime;
  };

  // Validate slot array for overlaps
  const validateSlotArray = (slots, dayLabel) => {
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      if (slot.isAvailable && !validateTimeRange(slot.startTime, slot.endTime)) {
        toast.error(`Invalid time range for ${dayLabel} (slot ${i + 1})`);
        return false;
      }

      // Check for overlaps with other slots
      for (let j = i + 1; j < slots.length; j++) {
        const otherSlot = slots[j];
        if (slot.isAvailable && otherSlot.isAvailable) {
          const slotStart = slot.startTime;
          const slotEnd = slot.endTime;
          const otherStart = otherSlot.startTime;
          const otherEnd = otherSlot.endTime;

          // Check if slots overlap
          if (slotStart < otherEnd && otherStart < slotEnd) {
            toast.error(`Overlapping time ranges for ${dayLabel}`);
            return false;
          }
        }
      }
    }
    return true;
  };

  // Save availability
  const saveAvailability = async () => {
    try {
      setSaving(true);

      // Validate weekly schedule
      for (const [dayOfWeek, slots] of Object.entries(weeklySchedule)) {
        const dayLabel = daysOfWeek.find(d => d.value === parseInt(dayOfWeek))?.label;
        if (!validateSlotArray(slots, dayLabel)) {
          return;
        }
      }

      // Validate date overrides
      for (const [date, slots] of Object.entries(dateOverrides)) {
        if (!validateSlotArray(slots, date)) {
          return;
        }
      }

      // Convert to API format
      const availabilitySlots = [];

      // Add weekly schedule (multiple slots per day)
      Object.entries(weeklySchedule).forEach(([dayOfWeek, slots]) => {
        slots.forEach(slot => {
          if (slot.id) {
            // Update existing
            availabilitySlots.push({
              id: slot.id,
              dayOfWeek: parseInt(dayOfWeek),
              startTime: slot.isAvailable ? slot.startTime : null,
              endTime: slot.isAvailable ? slot.endTime : null,
              isAvailable: slot.isAvailable,
              slotDurationMinutes: slot.slotDurationMinutes,
              specificDate: null
            });
          } else {
            // New slot
            availabilitySlots.push({
              dayOfWeek: parseInt(dayOfWeek),
              startTime: slot.isAvailable ? slot.startTime : null,
              endTime: slot.isAvailable ? slot.endTime : null,
              isAvailable: slot.isAvailable,
              slotDurationMinutes: slot.slotDurationMinutes,
              specificDate: null
            });
          }
        });
      });

      // Add date overrides (multiple slots per date)
      Object.entries(dateOverrides).forEach(([date, slots]) => {
        slots.forEach(slot => {
          if (slot.id) {
            // Update existing
            availabilitySlots.push({
              id: slot.id,
              dayOfWeek: null,
              startTime: slot.isAvailable ? slot.startTime : null,
              endTime: slot.isAvailable ? slot.endTime : null,
              isAvailable: slot.isAvailable,
              slotDurationMinutes: slot.slotDurationMinutes,
              specificDate: date,
              notes: slot.notes
            });
          } else {
            // New override
            availabilitySlots.push({
              dayOfWeek: null,
              startTime: slot.isAvailable ? slot.startTime : null,
              endTime: slot.isAvailable ? slot.endTime : null,
              isAvailable: slot.isAvailable,
              slotDurationMinutes: slot.slotDurationMinutes,
              specificDate: date,
              notes: slot.notes
            });
          }
        });
      });

      await api.put('/mentors/availability', { availability: availabilitySlots });

      toast.success('Availability updated successfully!');
      await loadAvailability(); // Reload to get updated IDs
    } catch (error) {
      console.error('Failed to save availability:', error);
      toast.error(error.response?.data?.message || 'Failed to save availability');
    } finally {
      setSaving(false);
    }
  };

  // Load data on mount
  useEffect(() => {
    if (isAuthenticated && isMentor()) {
      loadAvailability();
    }
  }, [isAuthenticated, isMentor]);

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
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Manage Your Availability</h1>
              <p className="text-gray-600 mt-1">
                Set when you're available for mentoring sessions
              </p>
            </div>
            <button
              onClick={() => navigate('/mentor/dashboard')}
              className="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl transition-all duration-200"
            >
              ← Back to Dashboard
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <LoadingSpinner size="xl" />
          </div>
        ) : (
          <div className="space-y-8">
            {/* Instructions */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-blue-900 mb-2">How Availability Works</h3>
              <ul className="text-blue-800 space-y-1 text-sm">
                <li>• <strong>Weekly Schedule:</strong> Set your regular availability for each day of the week</li>
                <li>• <strong>Date Overrides:</strong> Override your weekly schedule for specific dates</li>
                <li>• <strong>Unavailable Days:</strong> Mark entire days as unavailable when needed</li>
                <li>• <strong>Time Slots:</strong> Define time ranges and session durations</li>
                <li>• <strong>Default Hours:</strong> 10:00 AM to 10:00 PM (22:00)</li>
              </ul>
            </div>

            {/* Tab Navigation */}
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
              <div className="border-b border-gray-200">
                <nav className="flex">
                  <button
                    onClick={() => setActiveTab('weekly')}
                    className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === 'weekly'
                        ? 'border-indigo-500 text-indigo-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Weekly Schedule
                  </button>
                  <button
                    onClick={() => setActiveTab('overrides')}
                    className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === 'overrides'
                        ? 'border-indigo-500 text-indigo-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Date Overrides
                  </button>
                </nav>
              </div>

              <div className="p-6">
                {/* Weekly Schedule Tab */}
                {activeTab === 'weekly' && (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <h2 className="text-xl font-bold text-gray-900">Weekly Availability</h2>
                      <button
                        onClick={() => setWeeklySchedule(initializeDefaultSchedule())}
                        className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
                      >
                        Reset to Defaults
                      </button>
                    </div>

                    <div className="grid gap-4">
                      {daysOfWeek.map((day) => {
                        const slots = weeklySchedule[day.value] || [{
                          isAvailable: true,
                          startTime: '10:00',
                          endTime: '22:00',
                          slotDurationMinutes: 60
                        }];

                        return (
                          <div key={day.value} className="border border-gray-200 rounded-xl p-4">
                            <div className="flex items-center justify-between mb-4">
                              <div className="flex items-center space-x-4">
                                <h3 className="font-semibold text-gray-900">{day.label}</h3>
                                <label className="flex items-center">
                                  <input
                                    type="checkbox"
                                    checked={slots.some(slot => slot.isAvailable)}
                                    onChange={() => toggleDayAvailability(day.value)}
                                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                  />
                                  <span className="ml-2 text-sm text-gray-600">Available</span>
                                </label>
                              </div>
                              <button
                                onClick={() => addTimeSlot(day.value)}
                                className="px-3 py-1 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 text-sm font-medium rounded-lg transition-colors flex items-center gap-1"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                                </svg>
                                Add Slot
                              </button>
                            </div>

                            {slots.some(slot => slot.isAvailable) ? (
                              <div className="space-y-3">
                                {slots.map((slot, slotIndex) => (
                                  <div key={slotIndex} className="border border-gray-100 rounded-lg p-3 bg-gray-50">
                                    <div className="flex items-center justify-between mb-2">
                                      <span className="text-sm font-medium text-gray-700">Time Slot {slotIndex + 1}</span>
                                      {slots.length > 1 && (
                                        <button
                                          onClick={() => removeTimeSlot(day.value, slotIndex)}
                                          className="text-red-500 hover:text-red-700 text-sm"
                                        >
                                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                          </svg>
                                        </button>
                                      )}
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                      <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
                                        <input
                                          type="time"
                                          value={slot.startTime}
                                          onChange={(e) => updateWeeklySchedule(day.value, slotIndex, 'startTime', e.target.value)}
                                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        />
                                      </div>

                                      <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
                                        <input
                                          type="time"
                                          value={slot.endTime}
                                          onChange={(e) => updateWeeklySchedule(day.value, slotIndex, 'endTime', e.target.value)}
                                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        />
                                      </div>

                                      <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Slot Duration</label>
                                        <select
                                          value={slot.slotDurationMinutes}
                                          onChange={(e) => updateWeeklySchedule(day.value, slotIndex, 'slotDurationMinutes', parseInt(e.target.value))}
                                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        >
                                          <option value={30}>30 minutes</option>
                                          <option value={60}>60 minutes</option>
                                          <option value={90}>90 minutes</option>
                                          <option value={120}>120 minutes</option>
                                        </select>
                                      </div>

                                      <div className="flex items-end">
                                        <div className="text-sm text-gray-500">
                                          {slot.startTime && slot.endTime && (
                                            <span>
                                              {Math.floor(((new Date(`2000-01-01T${slot.endTime}`) - new Date(`2000-01-01T${slot.startTime}`)) / (1000 * 60)) / slot.slotDurationMinutes)} slots available
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="text-sm text-gray-500 italic">
                                Unavailable all day
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Date Overrides Tab */}
                {activeTab === 'overrides' && (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <h2 className="text-xl font-bold text-gray-900">Date-Specific Overrides</h2>
                      <button
                        onClick={addDateOverride}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                        </svg>
                        Add Override
                      </button>
                    </div>

                    {Object.keys(dateOverrides).length === 0 ? (
                      <div className="text-center py-12">
                        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                          <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                        <p className="text-gray-500 text-lg mb-4">No date overrides set</p>
                        <p className="text-gray-400 text-sm mb-6">
                          Add specific dates when your availability differs from your weekly schedule
                        </p>
                        <button
                          onClick={addDateOverride}
                          className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl transition-colors"
                        >
                          Add Your First Override
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {Object.entries(dateOverrides).map(([date, slots]) => (
                          <div key={date} className="border border-gray-200 rounded-xl p-4">
                            <div className="flex items-center justify-between mb-4">
                              <div className="flex items-center space-x-4">
                                <h3 className="font-semibold text-gray-900">
                                  {new Date(date).toLocaleDateString('en-US', {
                                    weekday: 'long',
                                    year: 'numeric',
                                    month: 'long',
                                    day: 'numeric'
                                  })}
                                </h3>
                                <label className="flex items-center">
                                  <input
                                    type="checkbox"
                                    checked={slots.some(slot => slot.isAvailable)}
                                    onChange={() => toggleDateAvailability(date)}
                                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                  />
                                  <span className="ml-2 text-sm text-gray-600">Available</span>
                                </label>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => addDateTimeSlot(date)}
                                  className="px-3 py-1 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 text-sm font-medium rounded-lg transition-colors flex items-center gap-1"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                                  </svg>
                                  Add Slot
                                </button>
                                <button
                                  onClick={() => removeDateOverride(date)}
                                  className="px-3 py-1 bg-red-100 hover:bg-red-200 text-red-700 text-sm font-medium rounded-lg transition-colors"
                                >
                                  Remove Date
                                </button>
                              </div>
                            </div>

                            {slots.some(slot => slot.isAvailable) ? (
                              <div className="space-y-3">
                                {slots.map((slot, slotIndex) => (
                                  <div key={slotIndex} className="border border-gray-100 rounded-lg p-3 bg-gray-50">
                                    <div className="flex items-center justify-between mb-2">
                                      <span className="text-sm font-medium text-gray-700">Time Slot {slotIndex + 1}</span>
                                      {slots.length > 1 && (
                                        <button
                                          onClick={() => removeDateTimeSlot(date, slotIndex)}
                                          className="text-red-500 hover:text-red-700 text-sm"
                                        >
                                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                          </svg>
                                        </button>
                                      )}
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                      <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
                                        <input
                                          type="time"
                                          value={slot.startTime}
                                          onChange={(e) => updateDateOverride(date, slotIndex, 'startTime', e.target.value)}
                                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        />
                                      </div>

                                      <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
                                        <input
                                          type="time"
                                          value={slot.endTime}
                                          onChange={(e) => updateDateOverride(date, slotIndex, 'endTime', e.target.value)}
                                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        />
                                      </div>

                                      <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Slot Duration</label>
                                        <select
                                          value={slot.slotDurationMinutes}
                                          onChange={(e) => updateDateOverride(date, slotIndex, 'slotDurationMinutes', parseInt(e.target.value))}
                                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        >
                                          <option value={30}>30 minutes</option>
                                          <option value={60}>60 minutes</option>
                                          <option value={90}>90 minutes</option>
                                          <option value={120}>120 minutes</option>
                                        </select>
                                      </div>

                                      <div className="flex items-end">
                                        <div className="text-sm text-gray-500">
                                          {slot.startTime && slot.endTime && (
                                            <span>
                                              {Math.floor(((new Date(`2000-01-01T${slot.endTime}`) - new Date(`2000-01-01T${slot.startTime}`)) / (1000 * 60)) / slot.slotDurationMinutes)} slots available
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="text-sm text-gray-500 italic">
                                Unavailable all day
                              </div>
                            )}

                            <div className="mt-4">
                              <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
                              <input
                                type="text"
                                value={slots[0]?.notes || ''}
                                onChange={(e) => updateDateOverride(date, 0, 'notes', e.target.value)}
                                placeholder="e.g., Conference day, vacation, etc."
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Save Button */}
            <div className="flex justify-end">
              <button
                onClick={saveAvailability}
                disabled={saving}
                className="px-8 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold rounded-xl transition-all duration-200 transform hover:scale-105 shadow-lg hover:shadow-xl flex items-center gap-2"
              >
                {saving ? <LoadingSpinner size="sm" /> : '💾'} Save Availability
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MentorAvailability;