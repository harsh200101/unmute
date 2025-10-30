import React, { useState, useEffect } from 'react';
import { format, addDays, startOfTomorrow, setHours, setMinutes } from 'date-fns';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import PaymentButton from './PaymentButton';

const BookingModal = ({ mentor, isOpen, onClose }) => {
   const { isAuthenticated } = useAuth();
   const [step, setStep] = useState(1); // 1: DateTime, 2: Create Session, 3: Payment
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
   const [loadingAvailability, setLoadingAvailability] = useState(false);

  // Load mentor availability when modal opens
  useEffect(() => {
    if (isOpen && mentor?.id) {
      loadMentorAvailability();
    }
  }, [isOpen, mentor?.id]);

  const loadMentorAvailability = async () => {
    setLoadingAvailability(true);
    try {
      const response = await api.get(`/mentors/${mentor.id}/availability`);
      setAvailability(response.data.data.availability || []);
    } catch (error) {
      console.error('Failed to load availability:', error);
      toast.error('Failed to load mentor availability');
    } finally {
      setLoadingAvailability(false);
    }
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

    // Filter time slots based on mentor's actual availability
    const dayOfWeek = selectedDate.getDay();
    const dayAvailability = availability.filter(slot =>
      slot.day_of_week === dayOfWeek && slot.is_available
    );

    if (dayAvailability.length === 0) return [];

    // Generate time slots based on mentor's available hours
    const allSlots = dayAvailability.flatMap(slot => {
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
    console.log('Generated time slots:', uniqueSlots);
    return uniqueSlots;
  };

  const calculatePrice = () => {
    if (!mentor?.hourlyRate || !bookingData.durationMinutes) return 0;
    return (mentor.hourlyRate * bookingData.durationMinutes) / 60;
  };

  const calculateFees = () => {
    const subtotal = calculatePrice();
    const platformFee = subtotal * 0.1; // 10% platform fee (deducted internally)

    return {
      subtotal,
      platformFee,
      total: subtotal // Mentee pays only the displayed price
    };
  };

  const handleDateTimeSubmit = () => {
    if (!bookingData.selectedDate || !bookingData.selectedTime) {
      toast.error('Please select both date and time');
      return;
    }
    if (!isAuthenticated) {
      toast.error('Please login to book a session');
      return;
    }
    setStep(2); // Go to session creation step
  };

  const handleCreateSession = async () => {
    setLoading(true);
    try {
      // Combine date and time
      const [hours, minutes] = bookingData.selectedTime.split(':').map(Number);
      const scheduledAt = setMinutes(setHours(bookingData.selectedDate, hours), minutes);

      const sessionData = {
        mentorId: mentor.id,
        title: bookingData.title || `Mentoring Session with ${mentor.firstName} ${mentor.lastName}`,
        description: bookingData.description,
        sessionType: bookingData.sessionType,
        scheduledAt: scheduledAt.toISOString(),
        durationMinutes: bookingData.durationMinutes,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      };

      console.log('Creating session with data:', sessionData);

      const response = await api.post('/sessions', sessionData);

      if (response.data.success) {
        setCreatedSession(response.data.data.session);
        setStep(3); // Go to payment step
        toast.success('Session created! Please complete payment.');
      } else {
        throw new Error(response.data.message || 'Failed to create session');
      }
    } catch (error) {
      console.error('Session creation error:', error);
      const errorMessage = error.response?.data?.message || error.message || 'Failed to create session';
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };


  const handlePaymentComplete = () => {
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
  };

  if (!isOpen) return null;

  return (
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
              />
            )}

            {step === 3 && (
              <PaymentStep
                bookingData={bookingData}
                mentor={mentor}
                calculateFees={calculateFees}
                onBack={() => setStep(2)}
                loading={loading}
                sessionId={createdSession?.id}
              />
            )}

            {step === 4 && (
              <ConfirmationStep
                bookingData={bookingData}
                mentor={mentor}
                onComplete={handlePaymentComplete}
              />
            )}
          </div>
        </div>
      </div>
    );
  };

// Step Indicator Component
const StepIndicator = ({ currentStep }) => (
  <div className="flex items-center mb-8">
    <StepItem step={1} currentStep={currentStep} label="Date & Time" />
    <StepDivider active={currentStep >= 2} />
    <StepItem step={2} currentStep={currentStep} label="Create Session" />
    <StepDivider active={currentStep >= 3} />
    <StepItem step={3} currentStep={currentStep} label="Payment" />
    <StepDivider active={currentStep >= 4} />
    <StepItem step={4} currentStep={currentStep} label="Confirmation" />
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
  loadingAvailability 
}) => {
  const availableTimeSlots = getAvailableTimeSlots(bookingData.selectedDate);
  const fees = calculateFees();

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
          <div className="text-center py-4">Loading availability...</div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-40 overflow-y-auto">
            {availableDates.slice(0, 14).map((date) => (
              <button
                key={date.toISOString()}
                onClick={() => setBookingData({...bookingData, selectedDate: date, selectedTime: null})}
                className={`p-3 text-sm rounded-lg border transition-colors ${
                  bookingData.selectedDate?.toDateString() === date.toDateString()
                    ? 'border-blue-500 bg-blue-50 text-blue-600'
                    : 'border-gray-300 hover:border-blue-300 hover:bg-blue-50'
                }`}
              >
                {format(date, 'EEE, MMM d')}
              </button>
            ))}
          </div>
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

      {/* Price Display */}
      <div className="bg-gray-50 p-4 rounded-lg">
        <div className="space-y-2">
          <div className="flex justify-between">
            <span>Session ({bookingData.durationMinutes} min):</span>
            <span>₹{fees.subtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm text-gray-600">
            <span>Platform fee (10%):</span>
            <span>₹{fees.platformFee.toFixed(2)} (deducted internally)</span>
          </div>
          <hr />
          <div className="flex justify-between items-center font-bold text-lg">
            <span>You Pay:</span>
            <span className="text-green-600">₹{fees.total.toFixed(2)}</span>
          </div>
        </div>
      </div>

      <button
        onClick={onNext}
        disabled={!bookingData.selectedDate || !bookingData.selectedTime}
        className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-700 transition-colors"
      >
        Continue to Payment
      </button>
    </div>
  );
};

// Create Session Step
const CreateSessionStep = ({ bookingData, mentor, calculateFees, onBack, onSubmit, loading }) => {
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
            You Pay: ₹{fees.total.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Terms and Conditions */}
      <div className="bg-gray-50 p-4 rounded-lg">
        <h3 className="font-semibold text-gray-900 mb-2">Booking Terms</h3>
        <div className="space-y-2 text-sm text-gray-600">
          <div>• Sessions can be cancelled up to 24 hours in advance for a full refund</div>
          <div>• Late cancellations may incur fees</div>
          <div>• Payment will be processed securely through Stripe</div>
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
          {loading ? 'Creating Session...' : 'Create Session & Proceed to Payment'}
        </button>
      </div>
    </div>
  );
};

// Payment Step
const PaymentStep = ({ bookingData, mentor, calculateFees, onBack, loading, sessionId }) => {
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
            You Pay: ₹{fees.total.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Payment Method */}
      <div className="space-y-4">
        <h3 className="font-semibold">Payment Information</h3>
        <div className="bg-yellow-50 border border-yellow-200 p-3 rounded-lg">
          <p className="text-yellow-800 text-sm">
            🔒 Secure payment powered by PhonePe
          </p>
        </div>
        <PaymentButton
          sessionId={sessionId}
          amount={fees.subtotal} // Send the actual session price, not total with platform fee
          onSuccess={() => {
            // Payment successful, redirect will happen automatically
          }}
          onError={(error) => {
            console.error('Payment error:', error);
          }}
        />
      </div>

      {/* Navigation */}
      <div className="flex space-x-4">
        <button
          onClick={onBack}
          className="flex-1 bg-gray-200 text-gray-800 py-3 px-4 rounded-lg font-medium hover:bg-gray-300 transition-colors"
        >
          Back
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
