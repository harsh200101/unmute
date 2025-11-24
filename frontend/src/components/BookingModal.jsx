import React, { useState, useEffect } from 'react';
import { format, addDays, startOfTomorrow, setHours, setMinutes } from 'date-fns';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from './LoadingSpinner';

const BookingModal = ({ mentor, isOpen, onClose }) => {
    const { isAuthenticated } = useAuth();
    const [step, setStep] = useState(1); // 1: DateTime, 2: Create Session, 3: Confirmation
    const [bookingData, setBookingData] = useState({
      selectedDate: null,
      selectedTime: null,
      durationMinutes: 60,
      sessionType: 'video',
      description: '',
      title: ''
    });
    const [loading, setLoading] = useState(false);
    const [createdSession, setCreatedSession] = useState(null);
    const [availability, setAvailability] = useState([]);
    const [existingBookings, setExistingBookings] = useState([]);
    const [loadingAvailability, setLoadingAvailability] = useState(false);
    const [walletBalance, setWalletBalance] = useState(null);
    const [loadingBalance, setLoadingBalance] = useState(false);
    const [showTopupModal, setShowTopupModal] = useState(false);
    const [topupAmount, setTopupAmount] = useState('');
    const [topupLoading, setTopupLoading] = useState(false);
    const [topupError, setTopupError] = useState('');

  // Load mentor availability and wallet balance when modal opens
  useEffect(() => {
    if (isOpen && mentor?.id) {
      loadMentorAvailability();
      fetchWalletBalance();
    }
  }, [isOpen, mentor?.id]);

  const loadMentorAvailability = async () => {
    setLoadingAvailability(true);
    try {
      const response = await api.get(`/mentors/${mentor.id}/availability`);
      setAvailability(response.data.data.availability || []);
      setExistingBookings(response.data.data.existingBookings || []);
    } catch (error) {
      console.error('Failed to load availability:', error);
      toast.error('Failed to load mentor availability');
    } finally {
      setLoadingAvailability(false);
    }
  };

  const fetchWalletBalance = async () => {
    setLoadingBalance(true);
    try {
      const response = await api.get('/wallet/balance');
      if (response.data.success) {
        setWalletBalance(response.data.data);
      } else {
        throw new Error(response.data.message || 'Failed to fetch balance');
      }
    } catch (error) {
      console.error('Failed to fetch wallet balance:', error);
      toast.error('Failed to load wallet balance');
    } finally {
      setLoadingBalance(false);
    }
  };

  const handleTopupSubmit = async () => {
    const amount = parseFloat(topupAmount);

    // Validation
    if (!amount || amount < 1 || amount > 50000) {
      setTopupError('Please enter an amount between ₹1 and ₹50,000');
      return;
    }

    try {
      setTopupLoading(true);
      setTopupError('');

      const response = await api.post('/wallet/topup', { amount });

      if (response.data.success) {
        toast.success('Redirecting to payment...');
        window.location.href = response.data.redirectUrl;
      } else {
        throw new Error(response.data.message || 'Failed to initiate top-up');
      }
    } catch (err) {
      console.error('Error initiating top-up:', err);
      setTopupError(err.response?.data?.message || err.message || 'Failed to initiate top-up');
      toast.error('Failed to initiate top-up');
    } finally {
      setTopupLoading(false);
    }
  };

  const closeTopupModal = () => {
    setShowTopupModal(false);
    setTopupAmount('');
    setTopupError('');
  };

  // Generate available dates (next 30 days)
  const availableDates = Array.from({ length: 30 }, (_, i) => 
    addDays(startOfTomorrow(), i)
  );

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
      const slotEnd = new Date(slotStart.getTime() + bookingData.durationMinutes * 60000);

      // Check if this slot conflicts with any existing booking
      return !existingBookings.some(booking => {
        const bookingStart = new Date(booking.scheduledAt);
        const bookingEnd = new Date(bookingStart.getTime() + booking.duration * 60000);

        // Overlap check: slot starts before booking ends AND booking starts before slot ends
        return slotStart < bookingEnd && bookingStart < slotEnd;
      });
    });

    console.log('Generated time slots:', availableSlots);
    return availableSlots;
  };

  const calculatePrice = () => {
    // Dynamic pricing based on mentor's per-minute rate
    if (!mentor?.perMinuteRate || !bookingData.durationMinutes) return 0;
    return mentor.perMinuteRate * bookingData.durationMinutes;
  };

  const calculateMinimumBalance = () => {
    // Minimum balance required (15 minutes worth)
    if (!mentor?.perMinuteRate) return 0;
    return mentor.perMinuteRate * 15; // 15 minutes minimum
  };

  const calculateFees = () => {
    const subtotal = calculatePrice();
    const platformFee = subtotal * 0.1; // 10% platform fee
    const mentorEarnings = subtotal - platformFee;

    return {
      subtotal,
      platformFee,
      mentorEarnings,
      total: subtotal // Mentee pays the full price
    };
  };

  const handleDateTimeSubmit = () => {
    // Comprehensive validation
    if (!isAuthenticated) {
      toast.error('Please login to book a session');
      return;
    }

    if (!bookingData.selectedDate) {
      toast.error('Please select a date for your session');
      return;
    }

    if (!bookingData.selectedTime) {
      toast.error('Please select a time for your session');
      return;
    }

    // Validate that selected time is in the future
    const [hours, minutes] = bookingData.selectedTime.split(':').map(Number);
    const selectedDateTime = setMinutes(setHours(bookingData.selectedDate, hours), minutes);

    if (selectedDateTime <= new Date()) {
      toast.error('Please select a future date and time');
      return;
    }

    // Validate duration
    if (!bookingData.durationMinutes || bookingData.durationMinutes < 30) {
      toast.error('Please select a valid session duration');
      return;
    }

    setStep(2); // Go to session creation step
  };

  const handleCreateSession = async () => {
    setLoading(true);
    try {
      // Check wallet balance first - use minimum balance requirement
      const requiredAmount = calculateMinimumBalance();
      const currentBalance = walletBalance?.balance || 0;

      if (currentBalance < requiredAmount) {
        setShowTopupModal(true);
        toast.error(`Insufficient wallet balance. You need at least ₹${requiredAmount.toFixed(2)} to book this session.`);
        return;
      }

      // Validate session data
      if (!bookingData.selectedDate || !bookingData.selectedTime) {
        toast.error('Please select a valid date and time.');
        return;
      }

      // Combine date and time
      const [hours, minutes] = bookingData.selectedTime.split(':').map(Number);
      const scheduledAt = setMinutes(setHours(bookingData.selectedDate, hours), minutes);

      // Validate scheduled time is in the future
      if (scheduledAt <= new Date()) {
        toast.error('Please select a future date and time.');
        return;
      }

      const sessionData = {
        mentorId: mentor.id,
        title: bookingData.title?.trim() || `Mentoring Session with ${mentor.firstName} ${mentor.lastName}`,
        description: bookingData.description?.trim() || '',
        sessionType: bookingData.sessionType,
        scheduledAt: scheduledAt.toISOString(),
        durationMinutes: bookingData.durationMinutes,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      };

      console.log('Creating session with data:', sessionData);

      const response = await api.post('/sessions', sessionData);

      if (response.data.success) {
        setCreatedSession(response.data.data.session);
        setStep(3); // Go to confirmation step
        toast.success('Session booked successfully!');
      } else {
        throw new Error(response.data.message || 'Failed to create session');
      }
    } catch (error) {
      console.error('Session creation error:', error);
      let errorMessage = 'Failed to create session. Please try again.';

      if (error.response?.status === 400) {
        errorMessage = error.response.data?.message || 'Invalid session data. Please check your inputs.';
      } else if (error.response?.status === 409) {
        errorMessage = 'This time slot is no longer available. Please select a different time.';
      } else if (error.response?.status === 402) {
        errorMessage = 'Payment failed. Please check your wallet balance.';
        setShowTopupModal(true);
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      }

      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };


  const handleBookingComplete = () => {
    toast.success('Session booked successfully!');
    onClose();
    resetModal();
    // Redirect to dashboard or sessions page
    window.location.href = '/dashboard';
  };

  const resetModal = () => {
    setStep(1);
    setBookingData({
      selectedDate: null,
      selectedTime: null,
      durationMinutes: 60,
      sessionType: 'video',
      description: '',
      title: ''
    });
    setCreatedSession(null);
    setAvailability([]);
    setExistingBookings([]);
    setShowTopupModal(false);
    setTopupAmount('');
    setTopupError('');
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-lg max-w-3xl w-full max-h-screen overflow-y-auto">
          {/* Header */}
          <div className="flex justify-between items-center p-6 border-b">
            <h2 className="text-2xl font-bold">
              Book Session with {mentor?.firstName} {mentor?.lastName}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 text-2xl font-bold"
            >
              ×
            </button>
          </div>

          <div className="p-6">
            {/* Step Indicator */}
            <StepIndicator currentStep={step} />

            {/* Step Content */}
            {step === 1 && (
              <DateTimeStep
                mentor={mentor}
                bookingData={bookingData}
                setBookingData={setBookingData}
                availableDates={availableDates}
                getAvailableTimeSlots={getAvailableTimeSlots}
                calculateFees={calculateFees}
                onNext={handleDateTimeSubmit}
                loadingAvailability={loadingAvailability}
                walletBalance={walletBalance}
                loadingBalance={loadingBalance}
                calculateMinimumBalance={calculateMinimumBalance}
              />
            )}

            {step === 2 && (
              <CreateSessionStep
                bookingData={bookingData}
                mentor={mentor}
                calculateFees={calculateFees}
                onBack={() => setStep(1)}
                onSubmit={handleCreateSession}
                loading={loading}
                walletBalance={walletBalance}
              />
            )}

            {step === 3 && (
              <ConfirmationStep
                bookingData={bookingData}
                mentor={mentor}
                onComplete={handleBookingComplete}
              />
            )}
          </div>
        </div>
      </div>

      {showTopupModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Add Money to Wallet</h3>
                <button
                  onClick={closeTopupModal}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="mb-4">
                <label htmlFor="topup-amount" className="block text-sm font-medium text-gray-700 mb-2">
                  Amount (₹)
                </label>
                <input
                  type="number"
                  id="topup-amount"
                  value={topupAmount}
                  onChange={(e) => setTopupAmount(e.target.value)}
                  placeholder="Enter amount"
                  min="1"
                  max="50000"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={topupLoading}
                />
                {topupError && (
                  <p className="mt-1 text-sm text-red-600">{topupError}</p>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={closeTopupModal}
                  className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
                  disabled={topupLoading}
                >
                  Cancel
                </button>
                <button
                  onClick={handleTopupSubmit}
                  disabled={topupLoading || !topupAmount}
                  className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white rounded-md transition-colors flex items-center justify-center gap-2"
                >
                  {topupLoading ? (
                    <>
                      <LoadingSpinner size="sm" color="white" />
                      Processing...
                    </>
                  ) : (
                    'Add Money'
                  )}
                </button>
              </div>

              <div className="mt-4 text-xs text-gray-500 text-center">
                Amount must be between ₹1 and ₹50,000
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
  };

// Step Indicator Component
const StepIndicator = ({ currentStep }) => (
  <div className="flex items-center mb-8">
    <StepItem step={1} currentStep={currentStep} label="Date & Time" />
    <StepDivider active={currentStep >= 2} />
    <StepItem step={2} currentStep={currentStep} label="Create Session" />
    <StepDivider active={currentStep >= 3} />
    <StepItem step={3} currentStep={currentStep} label="Confirmation" />
  </div>
);

const StepItem = ({ step, currentStep, label }) => (
  <div className={`flex items-center ${currentStep >= step ? 'text-blue-600' : 'text-gray-400'}`}>
    <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${
      currentStep >= step ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300'
    }`}>
      {step}
    </div>
    <span className="ml-2 font-medium">{label}</span>
  </div>
);

const StepDivider = ({ active }) => (
  <div className="flex-1 h-1 mx-4 bg-gray-200">
    <div className={`h-1 ${active ? 'bg-blue-600' : 'bg-gray-200'} transition-all`}></div>
  </div>
);

// Date & Time Selection Step
const DateTimeStep = ({
  mentor,
  bookingData,
  setBookingData,
  availableDates,
  getAvailableTimeSlots,
  calculateFees,
  onNext,
  loadingAvailability,
  walletBalance,
  loadingBalance,
  calculateMinimumBalance
}) => {
  const availableTimeSlots = getAvailableTimeSlots(bookingData.selectedDate);
  const fees = calculateFees();
  const minBalance = calculateMinimumBalance();

  return (
    <div className="space-y-6">
      {/* Session Title */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Session Title
        </label>
        <input
          type="text"
          value={bookingData.title}
          onChange={(e) => setBookingData({...bookingData, title: e.target.value})}
          placeholder={`Mentoring Session with ${mentor?.firstName} ${mentor?.lastName}`}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      {/* Session Type */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Session Type
        </label>
        <div className="flex space-x-4">
          {['video', 'voice', 'chat'].map(type => (
            <label key={type} className="flex items-center">
              <input
                type="radio"
                name="sessionType"
                value={type}
                checked={bookingData.sessionType === type}
                onChange={(e) => setBookingData({...bookingData, sessionType: e.target.value})}
                className="mr-2"
              />
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </label>
          ))}
        </div>
      </div>

      {/* Duration */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Duration
        </label>
        <select
          value={bookingData.durationMinutes}
          onChange={(e) => setBookingData({...bookingData, durationMinutes: parseInt(e.target.value)})}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
        >
          <option value={30}>30 minutes</option>
          <option value={60}>60 minutes</option>
          <option value={90}>90 minutes</option>
          <option value={120}>120 minutes</option>
        </select>
      </div>

      {/* Date Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Select Date
        </label>
        {loadingAvailability ? (
          <div className="flex items-center justify-center py-8">
            <LoadingSpinner size="md" />
            <span className="ml-3 text-gray-600">Loading mentor availability...</span>
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-40 overflow-y-auto">
            {availableDates.slice(0, 14).map((date) => {
              const isPast = date < new Date(new Date().setHours(0, 0, 0, 0));
              return (
                <button
                  key={date.toISOString()}
                  onClick={() => !isPast && setBookingData({...bookingData, selectedDate: date, selectedTime: null})}
                  disabled={isPast}
                  className={`p-3 text-sm rounded-lg border transition-colors ${
                    isPast
                      ? 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed'
                      : bookingData.selectedDate?.toDateString() === date.toDateString()
                      ? 'border-blue-500 bg-blue-50 text-blue-600'
                      : 'border-gray-300 hover:border-blue-300 hover:bg-blue-50'
                  }`}
                  title={isPast ? 'Past dates are not available' : ''}
                >
                  {format(date, 'EEE, MMM d')}
                </button>
              );
            })}
          </div>
        )}
        {!loadingAvailability && (
          <p className="text-xs text-gray-500 mt-2">
            Select a date to view available time slots
          </p>
        )}
      </div>

      {/* Time Selection */}
      {bookingData.selectedDate && (
        <div>
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
                  onClick={() => setBookingData({...bookingData, selectedTime: time})}
                  className={`p-2 text-sm rounded-lg border transition-colors ${
                    bookingData.selectedTime === time
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

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Session Description (Optional)
        </label>
        <textarea
          value={bookingData.description}
          onChange={(e) => setBookingData({...bookingData, description: e.target.value})}
          placeholder="What would you like to discuss in this session?"
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
          rows={3}
        />
      </div>

      {/* Wallet Balance Display */}
      <div className="bg-gray-50 p-4 rounded-lg">
        <div className="space-y-2">
          <div className="flex justify-between">
            <span>Session Cost:</span>
            <span>₹{fees.subtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm text-gray-600">
            <span>Platform Fee (10%):</span>
            <span>-₹{fees.platformFee.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm text-green-600 font-medium">
            <span>Mentor Earnings:</span>
            <span>₹{fees.mentorEarnings.toFixed(2)}</span>
          </div>
          <hr />
          <div className="flex justify-between text-sm text-gray-600">
            <span>Minimum Balance Required:</span>
            <span>₹{minBalance.toFixed(2)}</span>
          </div>
          {loadingBalance ? (
            <div className="text-center py-2">
              <LoadingSpinner size="sm" />
              <span className="text-sm text-gray-600 ml-2">Loading balance...</span>
            </div>
          ) : (
            <div className="flex justify-between text-sm">
              <span>Your Wallet Balance:</span>
              <span className={walletBalance?.balance >= fees.subtotal ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                ₹{(walletBalance?.balance || 0).toFixed(2)}
              </span>
            </div>
          )}
          <hr />
          <div className="text-sm text-gray-600">
            Funds will be deducted from your wallet upon booking confirmation.
          </div>
        </div>
      </div>

      <button
        onClick={onNext}
        disabled={!bookingData.selectedDate || !bookingData.selectedTime}
        className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-700 transition-colors"
      >
        Continue
      </button>
    </div>
  );
};

// Create Session Step
const CreateSessionStep = ({ bookingData, mentor, calculateFees, onBack, onSubmit, loading, walletBalance }) => {
  const fees = calculateFees();

  return (
    <div className="space-y-6">
      {/* Session Summary */}
      <div className="bg-blue-50 p-4 rounded-lg">
        <h3 className="font-semibold text-blue-900 mb-2">Session Summary</h3>
        <div className="space-y-1 text-sm text-blue-800">
          <div>Mentor: {mentor?.firstName} {mentor?.lastName}</div>
          <div>Date: {bookingData.selectedDate && format(bookingData.selectedDate, 'EEEE, MMMM d, yyyy')}</div>
          <div>Time: {bookingData.selectedTime}</div>
          <div>Duration: {bookingData.durationMinutes} minutes</div>
          <div>Type: {bookingData.sessionType}</div>
          <div className="font-medium pt-2 border-t border-blue-200">
            Amount to be deducted: ₹{fees.total.toFixed(2)}
          </div>
          <div className="text-sm text-blue-600">
            Wallet Balance: ₹{(walletBalance?.balance || 0).toFixed(2)}
          </div>
        </div>
      </div>

      {/* Terms and Conditions */}
      <div className="bg-gray-50 p-4 rounded-lg">
        <h3 className="font-semibold text-gray-900 mb-2">Booking Terms</h3>
        <div className="space-y-2 text-sm text-gray-600">
          <div>• Sessions can be cancelled up to 24 hours in advance for a full refund</div>
          <div>• Late cancellations may incur fees</div>
          <div>• Amount will be deducted from your wallet upon booking confirmation</div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex space-x-4">
        <button
          onClick={onBack}
          className="flex-1 bg-gray-200 text-gray-800 py-3 px-4 rounded-lg font-medium hover:bg-gray-300 transition-colors"
        >
          Back
        </button>
        <button
          onClick={onSubmit}
          disabled={loading}
          className="flex-1 bg-blue-600 text-white py-3 px-4 rounded-lg font-medium disabled:opacity-50 hover:bg-blue-700 transition-colors"
        >
          {loading ? 'Booking Session...' : 'Book Session'}
        </button>
      </div>
    </div>
  );
};



// Confirmation Step
const ConfirmationStep = ({ bookingData, mentor, onComplete }) => (
  <div className="text-center space-y-6">
    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
      <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    </div>
    
    <h3 className="text-2xl font-bold text-green-600">Session Booked Successfully!</h3>
    
    <div className="bg-green-50 p-4 rounded-lg text-left max-w-md mx-auto">
      <h4 className="font-semibold text-green-900 mb-3">What's Next?</h4>
      <ul className="space-y-2 text-sm text-green-800">
        <li className="flex items-start">
          <span className="text-green-600 mr-2">•</span>
          You'll receive an email confirmation with all session details
        </li>
        <li className="flex items-start">
          <span className="text-green-600 mr-2">•</span>
          Meeting link will be sent 1 hour before your session
        </li>
        <li className="flex items-start">
          <span className="text-green-600 mr-2">•</span>
          View and manage your sessions in the dashboard
        </li>
        <li className="flex items-start">
          <span className="text-green-600 mr-2">•</span>
          Need to reschedule? Contact us 24+ hours in advance
        </li>
      </ul>
    </div>
    
    <button
      onClick={onComplete}
      className="bg-blue-600 text-white py-3 px-8 rounded-lg font-medium hover:bg-blue-700 transition-colors"
    >
      Go to Dashboard
    </button>
  </div>
);

export default BookingModal;
