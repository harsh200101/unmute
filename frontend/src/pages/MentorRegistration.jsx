import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import LoadingSpinner from '../components/LoadingSpinner';
import { toast } from 'react-hot-toast';

const MentorRegistration = () => {
  const { user, isAuthenticated, updateProfile } = useAuth();
  const navigate = useNavigate();
  
  // Multi-step form state
  const [currentStep, setCurrentStep] = useState(1);
  const totalSteps = 5;
  
  // Form data state
  const [formData, setFormData] = useState({
    // Personal Information
    firstName: user?.first_name || '',
    lastName: user?.last_name || '',
    email: user?.email || '',
    phone: user?.phone || '',
    location: {
      country: '',
      city: '',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    },
    
    // Professional Information
    bio: '',
    yearsExperience: '',
    currentRole: '',
    currentCompany: '',
    education: '',
    certifications: '',
    
    // Expertise & Specializations
    specializations: [],
    categories: [],
    languages: ['en'],
    
    // Pricing & Availability
    hourlyRate: 75,
    minSessionDuration: 30,
    maxSessionDuration: 120,
    sessionBuffer: 15,
    advanceBookingDays: 30,
    
    // Verification Documents
    documents: {
      resume: null,
      portfolio: null,
      linkedinUrl: '',
      websiteUrl: '',
      githubUrl: ''
    },
    
    // Additional Settings
    instantBooking: false,
    publicProfile: true,
    emailNotifications: true
  });

  const [formErrors, setFormErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [availableCategories, setAvailableCategories] = useState([]);
  const [availableSpecializations] = useState([
    'Software Development', 'Product Management', 'Data Science', 'UI/UX Design',
    'Digital Marketing', 'Business Strategy', 'Career Development', 'Leadership',
    'Entrepreneurship', 'Finance', 'Sales', 'Project Management', 'DevOps',
    'Machine Learning', 'Cybersecurity', 'Mobile Development', 'Web Development'
  ]);

  // Redirect if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login', { 
        state: { 
          from: '/mentor/apply',
          message: 'Please log in to apply as a mentor'
        }
      });
    }
  }, [isAuthenticated, navigate]);

  // Load categories
  useEffect(() => {
    const loadCategories = async () => {
      try {
        const response = await fetch('/api/mentors/meta/categories');
        if (response.ok) {
          const data = await response.json();
          setAvailableCategories(data.data || []);
        }
      } catch (error) {
        console.error('Failed to load categories:', error);
      }
    };
    loadCategories();
  }, []);

  // Handle input changes
  const handleChange = (field, value) => {
    setFormData(prev => {
      if (field.includes('.')) {
        const [parent, child] = field.split('.');
        return {
          ...prev,
          [parent]: {
            ...prev[parent],
            [child]: value
          }
        };
      }
      return {
        ...prev,
        [field]: value
      };
    });
    
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

  // Handle file uploads
  const handleFileChange = (field, file) => {
    if (file && file.size > 10 * 1024 * 1024) { // 10MB limit
      toast.error('File size must be less than 10MB');
      return;
    }
    
    setFormData(prev => ({
      ...prev,
      documents: {
        ...prev.documents,
        [field]: file
      }
    }));
  };

  // Validation functions
  const validateStep = (step) => {
    const errors = {};
    
    switch (step) {
      case 1: // Personal Information
        if (!formData.firstName.trim()) errors.firstName = 'First name is required';
        if (!formData.lastName.trim()) errors.lastName = 'Last name is required';
        if (!formData.email.trim()) errors.email = 'Email is required';
        if (!formData.phone.trim()) errors.phone = 'Phone number is required';
        if (!formData.location.country) errors['location.country'] = 'Country is required';
        if (!formData.location.city) errors['location.city'] = 'City is required';
        break;
        
      case 2: // Professional Information
        if (!formData.bio.trim()) errors.bio = 'Bio is required';
        if (formData.bio.length < 100) errors.bio = 'Bio must be at least 100 characters';
        if (!formData.yearsExperience) errors.yearsExperience = 'Years of experience is required';
        if (!formData.currentRole.trim()) errors.currentRole = 'Current role is required';
        break;
        
      case 3: // Expertise
        if (formData.specializations.length === 0) errors.specializations = 'Select at least one specialization';
        if (formData.categories.length === 0) errors.categories = 'Select at least one category';
        break;
        
      case 4: // Pricing & Availability
        if (!formData.hourlyRate || formData.hourlyRate < 10) errors.hourlyRate = 'Hourly rate must be at least $10';
        if (!formData.minSessionDuration) errors.minSessionDuration = 'Minimum session duration is required';
        if (!formData.maxSessionDuration) errors.maxSessionDuration = 'Maximum session duration is required';
        if (formData.minSessionDuration >= formData.maxSessionDuration) {
          errors.maxSessionDuration = 'Maximum duration must be greater than minimum';
        }
        break;
        
      case 5: // Verification
        if (!formData.documents.linkedinUrl.trim()) {
          errors['documents.linkedinUrl'] = 'LinkedIn profile is required';
        }
        break;
    }
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Handle next step
  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => Math.min(prev + 1, totalSteps));
    }
  };

  // Handle previous step
  const handlePrevious = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };

  // Handle form submission
  const handleSubmit = async () => {
    if (!validateStep(currentStep)) {
      return;
    }

    setIsSubmitting(true);
    
    try {
      // Create FormData for file uploads
      const submitData = new FormData();
      
      // Add all form fields
      Object.keys(formData).forEach(key => {
        if (key === 'documents') {
          Object.keys(formData.documents).forEach(docKey => {
            if (formData.documents[docKey] instanceof File) {
              submitData.append(`documents.${docKey}`, formData.documents[docKey]);
            } else if (formData.documents[docKey]) {
              submitData.append(`documents.${docKey}`, formData.documents[docKey]);
            }
          });
        } else if (Array.isArray(formData[key])) {
          submitData.append(key, JSON.stringify(formData[key]));
        } else if (typeof formData[key] === 'object') {
          submitData.append(key, JSON.stringify(formData[key]));
        } else {
          submitData.append(key, formData[key]);
        }
      });

      // Submit mentor application
      const response = await fetch('/api/mentors/apply', {
        method: 'POST',
        body: submitData,
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
        }
      });

      if (response.ok) {
        const result = await response.json();
        
        // Update user profile to reflect mentor application
        await updateProfile({ role: 'mentor' });
        
        toast.success('Mentor application submitted successfully!');
        navigate('/mentor/application-pending');
      } else {
        const error = await response.json();
        throw new Error(error.message || 'Application submission failed');
      }
      
    } catch (error) {
      console.error('Application submission error:', error);
      toast.error(error.message || 'Failed to submit application');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Render step indicator
  const renderStepIndicator = () => (
    <div className="flex justify-center mb-8">
      <div className="flex items-center space-x-4">
        {Array.from({ length: totalSteps }, (_, i) => i + 1).map((step) => (
          <div key={step} className="flex items-center">
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                step < currentStep
                  ? 'bg-green-500 text-white'
                  : step === currentStep
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-600'
              }`}
            >
              {step < currentStep ? '✓' : step}
            </div>
            {step < totalSteps && (
              <div
                className={`w-12 h-1 mx-2 transition-colors ${
                  step < currentStep ? 'bg-green-500' : 'bg-gray-200'
                }`}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );

  // Render form steps
  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Personal Information</h2>
              <p className="text-gray-600">Let's start with your basic information</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">First Name</label>
                <input
                  type="text"
                  value={formData.firstName}
                  onChange={(e) => handleChange('firstName', e.target.value)}
                  className={`w-full px-4 py-3 rounded-xl border ${
                    formErrors.firstName ? 'border-red-300' : 'border-gray-300'
                  } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                  placeholder="Enter your first name"
                />
                {formErrors.firstName && (
                  <p className="mt-1 text-sm text-red-600">{formErrors.firstName}</p>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Last Name</label>
                <input
                  type="text"
                  value={formData.lastName}
                  onChange={(e) => handleChange('lastName', e.target.value)}
                  className={`w-full px-4 py-3 rounded-xl border ${
                    formErrors.lastName ? 'border-red-300' : 'border-gray-300'
                  } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                  placeholder="Enter your last name"
                />
                {formErrors.lastName && (
                  <p className="mt-1 text-sm text-red-600">{formErrors.lastName}</p>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => handleChange('email', e.target.value)}
                className={`w-full px-4 py-3 rounded-xl border ${
                  formErrors.email ? 'border-red-300' : 'border-gray-300'
                } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                placeholder="Enter your email"
              />
              {formErrors.email && (
                <p className="mt-1 text-sm text-red-600">{formErrors.email}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Phone Number</label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => handleChange('phone', e.target.value)}
                className={`w-full px-4 py-3 rounded-xl border ${
                  formErrors.phone ? 'border-red-300' : 'border-gray-300'
                } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                placeholder="Enter your phone number"
              />
              {formErrors.phone && (
                <p className="mt-1 text-sm text-red-600">{formErrors.phone}</p>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Country</label>
                <input
                  type="text"
                  value={formData.location.country}
                  onChange={(e) => handleChange('location.country', e.target.value)}
                  className={`w-full px-4 py-3 rounded-xl border ${
                    formErrors['location.country'] ? 'border-red-300' : 'border-gray-300'
                  } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                  placeholder="Enter your country"
                />
                {formErrors['location.country'] && (
                  <p className="mt-1 text-sm text-red-600">{formErrors['location.country']}</p>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">City</label>
                <input
                  type="text"
                  value={formData.location.city}
                  onChange={(e) => handleChange('location.city', e.target.value)}
                  className={`w-full px-4 py-3 rounded-xl border ${
                    formErrors['location.city'] ? 'border-red-300' : 'border-gray-300'
                  } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                  placeholder="Enter your city"
                />
                {formErrors['location.city'] && (
                  <p className="mt-1 text-sm text-red-600">{formErrors['location.city']}</p>
                )}
              </div>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Professional Background</h2>
              <p className="text-gray-600">Tell us about your professional experience</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Professional Bio</label>
              <textarea
                value={formData.bio}
                onChange={(e) => handleChange('bio', e.target.value)}
                rows={6}
                className={`w-full px-4 py-3 rounded-xl border ${
                  formErrors.bio ? 'border-red-300' : 'border-gray-300'
                } focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none`}
                placeholder="Write a compelling bio that showcases your expertise and experience. This will be visible to potential mentees."
              />
              <div className="flex justify-between mt-1">
                {formErrors.bio && (
                  <p className="text-sm text-red-600">{formErrors.bio}</p>
                )}
                <p className="text-sm text-gray-500">{formData.bio.length}/1000 characters</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Years of Experience</label>
                <select
                  value={formData.yearsExperience}
                  onChange={(e) => handleChange('yearsExperience', e.target.value)}
                  className={`w-full px-4 py-3 rounded-xl border ${
                    formErrors.yearsExperience ? 'border-red-300' : 'border-gray-300'
                  } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                >
                  <option value="">Select experience</option>
                  <option value="1-2">1-2 years</option>
                  <option value="3-5">3-5 years</option>
                  <option value="6-10">6-10 years</option>
                  <option value="11-15">11-15 years</option>
                  <option value="16+">16+ years</option>
                </select>
                {formErrors.yearsExperience && (
                  <p className="mt-1 text-sm text-red-600">{formErrors.yearsExperience}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Current Role</label>
                <input
                  type="text"
                  value={formData.currentRole}
                  onChange={(e) => handleChange('currentRole', e.target.value)}
                  className={`w-full px-4 py-3 rounded-xl border ${
                    formErrors.currentRole ? 'border-red-300' : 'border-gray-300'
                  } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                  placeholder="e.g. Senior Software Engineer"
                />
                {formErrors.currentRole && (
                  <p className="mt-1 text-sm text-red-600">{formErrors.currentRole}</p>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Current Company</label>
              <input
                type="text"
                value={formData.currentCompany}
                onChange={(e) => handleChange('currentCompany', e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. Google, Microsoft, Startup"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Education</label>
              <input
                type="text"
                value={formData.education}
                onChange={(e) => handleChange('education', e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. BS Computer Science, MIT"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Certifications (Optional)</label>
              <textarea
                value={formData.certifications}
                onChange={(e) => handleChange('certifications', e.target.value)}
                rows={3}
                className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                placeholder="List relevant certifications, one per line"
              />
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Expertise & Specializations</h2>
              <p className="text-gray-600">Select your areas of expertise</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-4">Specializations</label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {availableSpecializations.map((spec) => (
                  <label key={spec} className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.specializations.includes(spec)}
                      onChange={() => handleArrayChange('specializations', spec)}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <span className="text-sm text-gray-700">{spec}</span>
                  </label>
                ))}
              </div>
              {formErrors.specializations && (
                <p className="mt-2 text-sm text-red-600">{formErrors.specializations}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-4">Categories</label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {availableCategories.map((category) => (
                  <label key={category.id} className="flex items-center space-x-2 cursor-pointer p-3 border border-gray-200 rounded-xl hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={formData.categories.includes(category.id)}
                      onChange={() => handleArrayChange('categories', category.id)}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <div>
                      <span className="text-sm font-medium text-gray-900">{category.name}</span>
                      <p className="text-xs text-gray-600">{category.description}</p>
                    </div>
                  </label>
                ))}
              </div>
              {formErrors.categories && (
                <p className="mt-2 text-sm text-red-600">{formErrors.categories}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Languages</label>
              <div className="flex flex-wrap gap-2">
                {['English', 'Spanish', 'French', 'German', 'Chinese', 'Japanese', 'Portuguese', 'Hindi'].map((lang) => (
                  <label key={lang} className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.languages.includes(lang.toLowerCase())}
                      onChange={() => handleArrayChange('languages', lang.toLowerCase())}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <span className="text-sm text-gray-700">{lang}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        );

      case 4:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Pricing & Availability</h2>
              <p className="text-gray-600">Set your rates and availability preferences</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Hourly Rate (USD)</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-500">$</span>
                <input
                  type="number"
                  value={formData.hourlyRate}
                  onChange={(e) => handleChange('hourlyRate', parseInt(e.target.value))}
                  min="10"
                  max="500"
                  className={`w-full pl-8 pr-4 py-3 rounded-xl border ${
                    formErrors.hourlyRate ? 'border-red-300' : 'border-gray-300'
                  } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                  placeholder="75"
                />
              </div>
              {formErrors.hourlyRate && (
                <p className="mt-1 text-sm text-red-600">{formErrors.hourlyRate}</p>
              )}
              <p className="mt-1 text-sm text-gray-600">
                Average mentor rate is $75/hour. You can adjust this later.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Minimum Session (minutes)</label>
                <select
                  value={formData.minSessionDuration}
                  onChange={(e) => handleChange('minSessionDuration', parseInt(e.target.value))}
                  className={`w-full px-4 py-3 rounded-xl border ${
                    formErrors.minSessionDuration ? 'border-red-300' : 'border-gray-300'
                  } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                >
                  <option value="">Select minimum</option>
                  <option value={15}>15 minutes</option>
                  <option value={30}>30 minutes</option>
                  <option value={45}>45 minutes</option>
                  <option value={60}>1 hour</option>
                </select>
                {formErrors.minSessionDuration && (
                  <p className="mt-1 text-sm text-red-600">{formErrors.minSessionDuration}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Maximum Session (minutes)</label>
                <select
                  value={formData.maxSessionDuration}
                  onChange={(e) => handleChange('maxSessionDuration', parseInt(e.target.value))}
                  className={`w-full px-4 py-3 rounded-xl border ${
                    formErrors.maxSessionDuration ? 'border-red-300' : 'border-gray-300'
                  } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                >
                  <option value="">Select maximum</option>
                  <option value={60}>1 hour</option>
                  <option value={90}>1.5 hours</option>
                  <option value={120}>2 hours</option>
                  <option value={180}>3 hours</option>
                </select>
                {formErrors.maxSessionDuration && (
                  <p className="mt-1 text-sm text-red-600">{formErrors.maxSessionDuration}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Session Buffer (minutes)</label>
                <select
                  value={formData.sessionBuffer}
                  onChange={(e) => handleChange('sessionBuffer', parseInt(e.target.value))}
                  className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value={0}>No buffer</option>
                  <option value={15}>15 minutes</option>
                  <option value={30}>30 minutes</option>
                </select>
                <p className="mt-1 text-sm text-gray-600">
                  Time between sessions for preparation
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Advance Booking (days)</label>
                <select
                  value={formData.advanceBookingDays}
                  onChange={(e) => handleChange('advanceBookingDays', parseInt(e.target.value))}
                  className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value={7}>7 days</option>
                  <option value={14}>14 days</option>
                  <option value={30}>30 days</option>
                  <option value={60}>60 days</option>
                </select>
                <p className="mt-1 text-sm text-gray-600">
                  How far in advance can sessions be booked
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <label className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  checked={formData.instantBooking}
                  onChange={(e) => handleChange('instantBooking', e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <div>
                  <span className="font-medium text-gray-900">Enable Instant Booking</span>
                  <p className="text-sm text-gray-600">Allow mentees to book available slots immediately without approval</p>
                </div>
              </label>
            </div>
          </div>
        );

      case 5:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Verification & Social Links</h2>
              <p className="text-gray-600">Help us verify your credentials and showcase your work</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                LinkedIn Profile URL <span className="text-red-500">*</span>
              </label>
              <input
                type="url"
                value={formData.documents.linkedinUrl}
                onChange={(e) => handleChange('documents.linkedinUrl', e.target.value)}
                className={`w-full px-4 py-3 rounded-xl border ${
                  formErrors['documents.linkedinUrl'] ? 'border-red-300' : 'border-gray-300'
                } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                placeholder="https://linkedin.com/in/yourprofile"
              />
              {formErrors['documents.linkedinUrl'] && (
                <p className="mt-1 text-sm text-red-600">{formErrors['documents.linkedinUrl']}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Website/Portfolio URL</label>
              <input
                type="url"
                value={formData.documents.websiteUrl}
                onChange={(e) => handleChange('documents.websiteUrl', e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="https://yourwebsite.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">GitHub Profile URL</label>
              <input
                type="url"
                value={formData.documents.githubUrl}
                onChange={(e) => handleChange('documents.githubUrl', e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="https://github.com/yourusername"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Resume/CV</label>
              <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center">
                <input
                  type="file"
                  id="resume"
                  accept=".pdf,.doc,.docx"
                  onChange={(e) => handleFileChange('resume', e.target.files[0])}
                  className="hidden"
                />
                <label htmlFor="resume" className="cursor-pointer">
                  <div className="text-gray-400 mb-2">
                    <svg className="mx-auto h-12 w-12" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                      <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <p className="text-gray-600">
                    {formData.documents.resume ? formData.documents.resume.name : 'Click to upload resume'}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">PDF, DOC, DOCX up to 10MB</p>
                </label>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Portfolio/Work Samples</label>
              <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center">
                <input
                  type="file"
                  id="portfolio"
                  accept=".pdf,.doc,.docx,.zip"
                  onChange={(e) => handleFileChange('portfolio', e.target.files[0])}
                  className="hidden"
                />
                <label htmlFor="portfolio" className="cursor-pointer">
                  <div className="text-gray-400 mb-2">
                    <svg className="mx-auto h-12 w-12" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                      <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <p className="text-gray-600">
                    {formData.documents.portfolio ? formData.documents.portfolio.name : 'Click to upload portfolio'}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">PDF, DOC, DOCX, ZIP up to 10MB</p>
                </label>
              </div>
            </div>

            <div className="space-y-4 pt-4 border-t border-gray-200">
              <label className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  checked={formData.publicProfile}
                  onChange={(e) => handleChange('publicProfile', e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <div>
                  <span className="font-medium text-gray-900">Make my profile public</span>
                  <p className="text-sm text-gray-600">Allow your profile to be discoverable by mentees</p>
                </div>
              </label>

              <label className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  checked={formData.emailNotifications}
                  onChange={(e) => handleChange('emailNotifications', e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <div>
                  <span className="font-medium text-gray-900">Email notifications</span>
                  <p className="text-sm text-gray-600">Receive email updates about bookings and messages</p>
                </div>
              </label>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Become a Mentor on Unmute
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Share your expertise and help others grow while building your personal brand and earning income.
          </p>
        </div>

        {/* Step Indicator */}
        {renderStepIndicator()}

        {/* Form Container */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden">
          <div className="p-8">
            {renderStep()}
          </div>

          {/* Navigation */}
          <div className="bg-gray-50 px-8 py-6 flex justify-between items-center">
            <button
              onClick={handlePrevious}
              disabled={currentStep === 1}
              className="px-6 py-3 border border-gray-300 text-gray-700 font-medium rounded-xl hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>

            <div className="text-sm text-gray-600">
              Step {currentStep} of {totalSteps}
            </div>

            {currentStep < totalSteps ? (
              <button
                onClick={handleNext}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-colors"
              >
                Next
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="px-8 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold rounded-xl transition-all duration-200 transform hover:scale-[1.02] shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <LoadingSpinner size="sm" />
                    Submitting Application...
                  </>
                ) : (
                  '🚀 Submit Application'
                )}
              </button>
            )}
          </div>
        </div>

        {/* Benefits Section */}
        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="text-center">
            <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Earn $75+ per hour</h3>
            <p className="text-gray-600">Set your own rates and work on your schedule</p>
          </div>

          <div className="text-center">
            <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Build Your Brand</h3>
            <p className="text-gray-600">Grow your reputation and expand your network</p>
          </div>

          <div className="text-center">
            <div className="w-16 h-16 bg-purple-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Make an Impact</h3>
            <p className="text-gray-600">Help others succeed and advance their careers</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MentorRegistration;
