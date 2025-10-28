import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import LoadingSpinner from '../components/LoadingSpinner';
import { toast } from 'react-hot-toast';

const MentorProfileForm = () => {
  const { user, isAuthenticated, isMentor } = useAuth();
  const navigate = useNavigate();

  // Form state
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mentorProfile, setMentorProfile] = useState(null);
  const [formData, setFormData] = useState({
    // Professional Information (from users table)
    bio: '',

    // Mentor Profile (from mentors table)
    yearsExperience: 1,
    specializations: [],
    industries: [],
    skills: [],
    languages: ['en'], // Default to English
    hourlyRate: 75,
    profileImage: '',
    videoIntroUrl: '',
    portfolioUrls: [],
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    instantBooking: false,
    advanceBookingDays: 30,
    minSessionDuration: 30,
    maxSessionDuration: 120,
    sessionBufferMinutes: 15,

    // Categories (relationship table)
    categories: [],

    // Additional Settings
    publicProfile: true
  });

  const [formErrors, setFormErrors] = useState({});
  const [availableCategories, setAvailableCategories] = useState([]);
  const [availableSpecializations] = useState([
    'Life Coaching', 'Spiritual Guidance', 'Career Counseling', 'Relationship Counseling',
    'Personal Development', 'Mindfulness & Meditation', 'Stress Management', 'Emotional Intelligence',
    'Leadership Development', 'Work-Life Balance', 'Grief Counseling', 'Anxiety Management',
    'Self-Confidence Building', 'Goal Setting', 'Life Transitions', 'Purpose Discovery',
    'Communication Skills', 'Conflict Resolution', 'Parenting Guidance', 'Retirement Planning'
  ]);

  const [availableIndustries] = useState([
    'Personal Development', 'Mental Health', 'Education', 'Healthcare', 'Corporate Wellness',
    'Non-profit Organizations', 'Community Services', 'Spiritual Centers', 'Counseling Centers',
    'Life Coaching Practices', 'Wellness Retreats', 'Educational Institutions',
    'Corporate Training', 'Government Services', 'Religious Organizations', 'Therapy Practices'
  ]);

  const [availableSkills] = useState([
    'Empathy', 'Active Listening', 'Emotional Intelligence', 'Communication', 'Motivation',
    'Goal Setting', 'Conflict Resolution', 'Stress Management', 'Mindfulness', 'Meditation',
    'Counseling Techniques', 'Life Coaching', 'Spiritual Guidance', 'Psychology', 'CBT',
    'NLP', 'Public Speaking', 'Workshop Facilitation', 'Group Counseling', 'Crisis Intervention',
    'Relationship Counseling', 'Career Guidance', 'Personal Development', 'Leadership'
  ]);

  // Load mentor profile and categories
  const loadData = async () => {
    if (!isAuthenticated || !isMentor()) return;

    setLoading(true);
    try {
      // Load categories first
      const categoriesResponse = await fetch('/api/mentors/meta/categories');
      let categories = [];
      if (categoriesResponse.ok) {
        const categoriesData = await categoriesResponse.json();
        categories = categoriesData.data.categories || [];
        setAvailableCategories(categories);
      }

      // Load mentor profile
      const profileResponse = await fetch('/api/mentors/profile', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
          'Content-Type': 'application/json'
        }
      });

      if (profileResponse.ok) {
        const profileData = await profileResponse.json();
        const mentor = profileData.data.mentor;
        setMentorProfile(mentor);

        // Convert category names/strings to IDs for form compatibility
        const categoryIds = [];
        if (mentor.categories && Array.isArray(mentor.categories)) {
          mentor.categories.forEach((cat) => {
            // Handle both string names and objects with id/name
            if (typeof cat === 'string') {
              // Find category by name in availableCategories
              const foundCategory = categories.find(ac => ac.name === cat);
              if (foundCategory) {
                categoryIds.push(foundCategory.id);
              }
            } else if (cat && cat.id) {
              // Handle object format
              categoryIds.push(cat.id);
            }
          });
        }

        // Populate form with existing data
        setFormData({
          bio: mentor.bio || '',
          yearsExperience: mentor.yearsExperience || 1,
          specializations: mentor.specializations || [],
          industries: mentor.industries || [],
          skills: mentor.skills || [],
          languages: mentor.languages || ['en'],
          hourlyRate: mentor.hourlyRate || 75,
          profileImage: mentor.profileImage || '',
          videoIntroUrl: mentor.videoIntroUrl || '',
          portfolioUrls: mentor.portfolioUrls || [],
          timezone: mentor.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
          instantBooking: mentor.instantBooking || false,
          advanceBookingDays: mentor.advanceBookingDays || 30,
          minSessionDuration: mentor.minSessionDuration || 30,
          maxSessionDuration: mentor.maxSessionDuration || 120,
          sessionBufferMinutes: mentor.sessionBufferMinutes || 15,
          categories: categoryIds,
          publicProfile: mentor.publicProfile !== undefined ? mentor.publicProfile : true
        });
      }

    } catch (error) {
      console.error('Failed to load data:', error);
      toast.error('Failed to load profile data');
    } finally {
      setLoading(false);
    }
  };

  // Load data on mount
  useEffect(() => {
    if (isAuthenticated && isMentor()) {
      loadData();
    }
  }, [isAuthenticated, isMentor()]);

  // Handle input changes
  const handleChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));

    // Clear field error
    if (formErrors[field]) {
      setFormErrors(prev => ({
        ...prev,
        [field]: undefined
      }));
    }
  };

  // Handle array field changes
  const handleArrayChange = (field, value, action = 'toggle') => {
    setFormData(prev => {
      const currentArray = prev[field] || [];
      let newArray;

      if (action === 'toggle') {
        newArray = currentArray.includes(value)
          ? currentArray.filter(item => item !== value)
          : [...currentArray, value];
      } else if (action === 'add' && !currentArray.includes(value)) {
        newArray = [...currentArray, value];
      } else if (action === 'remove') {
        newArray = currentArray.filter(item => item !== value);
      } else {
        newArray = currentArray;
      }

      return {
        ...prev,
        [field]: newArray
      };
    });
  };

  // Form validation
  const validateForm = () => {
    const errors = {};

    if (!formData.bio.trim()) {
      errors.bio = 'Professional bio is required';
    } else if (formData.bio.length < 100) {
      errors.bio = 'Bio must be at least 100 characters';
    }

    if (!formData.yearsExperience || formData.yearsExperience < 1) {
      errors.yearsExperience = 'Years of experience is required';
    }

    if (formData.specializations.length === 0) {
      errors.specializations = 'Select at least one specialization';
    }

    if (formData.categories.length === 0) {
      errors.categories = 'Select at least one category';
    }

    if (!formData.hourlyRate || formData.hourlyRate < 10) {
      errors.hourlyRate = 'Hourly rate must be at least $10';
    }

    if (formData.languages.length === 0) {
      errors.languages = 'Select at least one language';
    }

    if (!formData.minSessionDuration) {
      errors.minSessionDuration = 'Minimum session duration is required';
    }

    if (!formData.maxSessionDuration) {
      errors.maxSessionDuration = 'Maximum session duration is required';
    }

    if (formData.minSessionDuration >= formData.maxSessionDuration) {
      errors.maxSessionDuration = 'Maximum duration must be greater than minimum';
    }

    if (formData.profileImage && !formData.profileImage.match(/^https?:\/\/.+/)) {
      errors.profileImage = 'Profile image must be a valid URL';
    }

    if (formData.videoIntroUrl && !formData.videoIntroUrl.match(/^https?:\/\/.+/)) {
      errors.videoIntroUrl = 'Video intro URL must be a valid URL';
    }

    if (formData.portfolioUrls.some(url => url && !url.match(/^https?:\/\/.+/))) {
      errors.portfolioUrls = 'All portfolio URLs must be valid';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      toast.error('Please fix the errors in the form');
      return;
    }

    setSaving(true);
    try {
      const submitData = {
        bio: formData.bio,
        years_experience: parseInt(formData.yearsExperience),
        specializations: formData.specializations,
        industries: formData.industries,
        skills: formData.skills,
        languages: formData.languages,
        hourly_rate: parseFloat(formData.hourlyRate),
        profile_image: formData.profileImage,
        video_intro_url: formData.videoIntroUrl,
        portfolio_urls: formData.portfolioUrls,
        timezone: formData.timezone,
        instant_booking: formData.instantBooking,
        advance_booking_days: parseInt(formData.advanceBookingDays),
        min_session_duration: parseInt(formData.minSessionDuration),
        max_session_duration: parseInt(formData.maxSessionDuration),
        session_buffer_minutes: parseInt(formData.sessionBufferMinutes),
        categories: formData.categories,
        public_profile: formData.publicProfile
      };

      const response = await fetch('/api/mentors/profile', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(submitData)
      });

      if (response.ok) {
        toast.success('Profile updated successfully!');
        navigate('/mentor/dashboard');
      } else {
        const error = await response.json();
        throw new Error(error.message || 'Failed to update profile');
      }

    } catch (error) {
      console.error('Profile update error:', error);
      toast.error(error.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  // Redirect if not authenticated or not a mentor
  if (!isAuthenticated) {
    navigate('/login');
    return null;
  }

  if (!isMentor()) {
    navigate('/dashboard');
    return null;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50">
        <LoadingSpinner size="xl" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Complete Your Life Mentor Profile</h1>
              <p className="text-gray-600 mt-2">
                Share your wisdom and experience to help others navigate life's challenges and find their path
              </p>
            </div>
            <button
              onClick={() => navigate('/mentor/dashboard')}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl transition-colors"
            >
              ← Back to Dashboard
            </button>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Professional Information */}
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Professional Information</h2>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Professional Bio <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={formData.bio}
                  onChange={(e) => handleChange('bio', e.target.value)}
                  rows={6}
                  className={`w-full px-4 py-3 rounded-xl border ${formErrors.bio ? 'border-red-300' : 'border-gray-300'} focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none`}
                  placeholder="Share your journey, wisdom, and what inspires you to guide others on their life path..."
                />
                <div className="flex justify-between mt-1">
                  {formErrors.bio && <p className="text-sm text-red-600">{formErrors.bio}</p>}
                  <p className="text-sm text-gray-500">{formData.bio.length}/1000 characters</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Years of Experience <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  value={formData.yearsExperience}
                  onChange={(e) => handleChange('yearsExperience', parseInt(e.target.value) || 1)}
                  min="1"
                  max="50"
                  className={`w-full px-4 py-3 rounded-xl border ${formErrors.yearsExperience ? 'border-red-300' : 'border-gray-300'} focus:outline-none focus:ring-2 focus:ring-indigo-500`}
                  placeholder="e.g. 5"
                />
                {formErrors.yearsExperience && <p className="mt-1 text-sm text-red-600">{formErrors.yearsExperience}</p>}
              </div>
            </div>
          </div>

          {/* Media & Portfolio */}
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Media & Portfolio</h2>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Profile Image URL <span className="text-gray-500">(optional)</span>
                </label>
                <input
                  type="url"
                  value={formData.profileImage}
                  onChange={(e) => handleChange('profileImage', e.target.value)}
                  className={`w-full px-4 py-3 rounded-xl border ${formErrors.profileImage ? 'border-red-300' : 'border-gray-300'} focus:outline-none focus:ring-2 focus:ring-indigo-500`}
                  placeholder="https://example.com/profile-image.jpg"
                />
                {formErrors.profileImage && <p className="mt-1 text-sm text-red-600">{formErrors.profileImage}</p>}
                <p className="mt-1 text-sm text-gray-600">URL to your professional profile image</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Video Introduction URL <span className="text-gray-500">(optional)</span>
                </label>
                <input
                  type="url"
                  value={formData.videoIntroUrl}
                  onChange={(e) => handleChange('videoIntroUrl', e.target.value)}
                  className={`w-full px-4 py-3 rounded-xl border ${formErrors.videoIntroUrl ? 'border-red-300' : 'border-gray-300'} focus:outline-none focus:ring-2 focus:ring-indigo-500`}
                  placeholder="https://example.com/intro-video.mp4"
                />
                {formErrors.videoIntroUrl && <p className="mt-1 text-sm text-red-600">{formErrors.videoIntroUrl}</p>}
                <p className="mt-1 text-sm text-gray-600">URL to your introduction video</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Portfolio URLs <span className="text-gray-500">(optional)</span>
                </label>
                <div className="space-y-2">
                  {formData.portfolioUrls.map((url, index) => (
                    <div key={index} className="flex gap-2">
                      <input
                        type="url"
                        value={url}
                        onChange={(e) => {
                          const newUrls = [...formData.portfolioUrls];
                          newUrls[index] = e.target.value;
                          handleChange('portfolioUrls', newUrls);
                        }}
                        className="flex-1 px-4 py-3 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder="https://github.com/yourusername"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const newUrls = formData.portfolioUrls.filter((_, i) => i !== index);
                          handleChange('portfolioUrls', newUrls);
                        }}
                        className="px-3 py-3 bg-red-100 hover:bg-red-200 text-red-600 rounded-xl"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => handleChange('portfolioUrls', [...formData.portfolioUrls, ''])}
                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm"
                  >
                    + Add Portfolio URL
                  </button>
                </div>
                {formErrors.portfolioUrls && <p className="mt-1 text-sm text-red-600">{formErrors.portfolioUrls}</p>}
                <p className="mt-1 text-sm text-gray-600">Links to your website, blog, LinkedIn, or other professional profiles</p>
              </div>
            </div>
          </div>

          {/* Areas of Guidance */}
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Areas of Guidance</h2>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-4">
                  Specializations <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {availableSpecializations.map((spec) => (
                    <label key={spec} className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.specializations.includes(spec)}
                        onChange={() => handleArrayChange('specializations', spec)}
                        className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                      />
                      <span className="text-sm text-gray-700">{spec}</span>
                    </label>
                  ))}
                </div>
                {formErrors.specializations && <p className="mt-2 text-sm text-red-600">{formErrors.specializations}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-4">
                  Categories <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {availableCategories.map((category) => (
                    <label key={category.id} className="flex items-center space-x-2 cursor-pointer p-3 border border-gray-200 rounded-xl hover:bg-gray-50">
                      <input
                        type="checkbox"
                        checked={formData.categories.includes(category.id)}
                        onChange={() => handleArrayChange('categories', category.id)}
                        className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                      />
                      <div>
                        <span className="text-sm font-medium text-gray-900">{category.name}</span>
                        <p className="text-xs text-gray-600">{category.description}</p>
                      </div>
                    </label>
                  ))}
                </div>
                {formErrors.categories && <p className="mt-2 text-sm text-red-600">{formErrors.categories}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-4">
                  Industries <span className="text-gray-500">(optional)</span>
                </label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {availableIndustries.map((industry) => (
                    <label key={industry} className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.industries.includes(industry)}
                        onChange={() => handleArrayChange('industries', industry)}
                        className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                      />
                      <span className="text-sm text-gray-700">{industry}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-4">
                  Skills <span className="text-gray-500">(optional)</span>
                </label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {availableSkills.map((skill) => (
                    <label key={skill} className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.skills.includes(skill)}
                        onChange={() => handleArrayChange('skills', skill)}
                        className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                      />
                      <span className="text-sm text-gray-700">{skill}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Languages <span className="text-red-500">*</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { code: 'en', name: 'English' },
                    { code: 'hi', name: 'Hindi' },
                    { code: 'bn', name: 'Bengali' },
                    { code: 'te', name: 'Telugu' },
                    { code: 'mr', name: 'Marathi' },
                    { code: 'ta', name: 'Tamil' },
                    { code: 'ur', name: 'Urdu' },
                    { code: 'gu', name: 'Gujarati' }
                  ].map((lang) => (
                    <label key={lang.code} className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.languages.includes(lang.code)}
                        onChange={() => handleArrayChange('languages', lang.code)}
                        className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                      />
                      <span className="text-sm text-gray-700">{lang.name}</span>
                    </label>
                  ))}
                </div>
                {formErrors.languages && <p className="mt-2 text-sm text-red-600">{formErrors.languages}</p>}
              </div>
            </div>
          </div>

          {/* Pricing & Availability */}
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Pricing & Availability</h2>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Hourly Rate (USD) <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-500">$</span>
                  <input
                    type="number"
                    value={formData.hourlyRate}
                    onChange={(e) => handleChange('hourlyRate', parseInt(e.target.value))}
                    min="10"
                    max="500"
                    className={`w-full pl-8 pr-4 py-3 rounded-xl border ${formErrors.hourlyRate ? 'border-red-300' : 'border-gray-300'} focus:outline-none focus:ring-2 focus:ring-indigo-500`}
                    placeholder="75"
                  />
                </div>
                {formErrors.hourlyRate && <p className="mt-1 text-sm text-red-600">{formErrors.hourlyRate}</p>}
                <p className="mt-1 text-sm text-gray-600">Typical life coaching session rate</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Minimum Session (minutes) <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.minSessionDuration}
                    onChange={(e) => handleChange('minSessionDuration', parseInt(e.target.value))}
                    className={`w-full px-4 py-3 rounded-xl border ${formErrors.minSessionDuration ? 'border-red-300' : 'border-gray-300'} focus:outline-none focus:ring-2 focus:ring-indigo-500`}
                  >
                    <option value="">Select minimum</option>
                    <option value={15}>15 minutes</option>
                    <option value={30}>30 minutes</option>
                    <option value={45}>45 minutes</option>
                    <option value={60}>1 hour</option>
                  </select>
                  {formErrors.minSessionDuration && <p className="mt-1 text-sm text-red-600">{formErrors.minSessionDuration}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Maximum Session (minutes) <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.maxSessionDuration}
                    onChange={(e) => handleChange('maxSessionDuration', parseInt(e.target.value))}
                    className={`w-full px-4 py-3 rounded-xl border ${formErrors.maxSessionDuration ? 'border-red-300' : 'border-gray-300'} focus:outline-none focus:ring-2 focus:ring-indigo-500`}
                  >
                    <option value="">Select maximum</option>
                    <option value={60}>1 hour</option>
                    <option value={90}>1.5 hours</option>
                    <option value={120}>2 hours</option>
                    <option value={180}>3 hours</option>
                  </select>
                  {formErrors.maxSessionDuration && <p className="mt-1 text-sm text-red-600">{formErrors.maxSessionDuration}</p>}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Session Buffer (minutes)</label>
                  <select
                    value={formData.sessionBuffer}
                    onChange={(e) => handleChange('sessionBuffer', parseInt(e.target.value))}
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value={0}>No buffer</option>
                    <option value={15}>15 minutes</option>
                    <option value={30}>30 minutes</option>
                  </select>
                  <p className="mt-1 text-sm text-gray-600">Time between sessions for preparation</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Advance Booking (days)</label>
                  <select
                    value={formData.advanceBookingDays}
                    onChange={(e) => handleChange('advanceBookingDays', parseInt(e.target.value))}
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value={7}>7 days</option>
                    <option value={14}>14 days</option>
                    <option value={30}>30 days</option>
                    <option value={60}>60 days</option>
                  </select>
                  <p className="mt-1 text-sm text-gray-600">How far in advance can sessions be booked</p>
                </div>
              </div>

              <div className="space-y-4">
                <label className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    checked={formData.instantBooking}
                    onChange={(e) => handleChange('instantBooking', e.target.checked)}
                    className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                  />
                  <div>
                    <span className="font-medium text-gray-900">Enable Instant Booking</span>
                    <p className="text-sm text-gray-600">Allow mentees to book available slots immediately without approval</p>
                  </div>
                </label>

                <label className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    checked={formData.publicProfile}
                    onChange={(e) => handleChange('publicProfile', e.target.checked)}
                    className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                  />
                  <div>
                    <span className="font-medium text-gray-900">Make my profile public</span>
                    <p className="text-sm text-gray-600">Allow your profile to be discoverable by mentees</p>
                  </div>
                </label>
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="px-8 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-semibold rounded-xl transition-all duration-200 transform hover:scale-105 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {saving ? (
                  <>
                    <LoadingSpinner size="sm" />
                    Saving Profile...
                  </>
                ) : (
                  '💾 Save Profile'
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default MentorProfileForm;