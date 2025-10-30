import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import ReviewCard from '../components/ReviewCard';
import LoadingSpinner from '../components/LoadingSpinner';
import BookingModal from '../components/BookingModal';
import { toast } from 'react-hot-toast';

const MentorProfile = () => {
  const { mentorId } = useParams();
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  
  // State management
  const [mentor, setMentor] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [categories, setCategories] = useState([]);

  // Pagination for reviews
  const [reviewsPage, setReviewsPage] = useState(1);
  const [reviewsTotal, setReviewsTotal] = useState(0);
  const reviewsLimit = 6;

  // Load mentor data on mount
  useEffect(() => {
    const loadMentorData = async () => {
      try {
        setLoading(true);

        // Load categories first
        const categoriesResponse = await fetch('/api/mentors/meta/categories');
        if (categoriesResponse.ok) {
          const categoriesData = await categoriesResponse.json();
          const categoriesList = categoriesData.data?.categories || [];
          setCategories(categoriesList);
        }

        // Load mentor profile
        const mentorResponse = await fetch(`/api/mentors/${mentorId}`);
        if (!mentorResponse.ok) {
          throw new Error('Mentor not found');
        }
        const mentorData = await mentorResponse.json();
        setMentor(mentorData.data.mentor);

        // Load reviews
        await loadReviews(1);

      } catch (error) {
        console.error('Failed to load mentor data:', error);
        toast.error('Failed to load mentor profile');
        navigate('/mentors');
      } finally {
        setLoading(false);
      }
    };

    if (mentorId) {
      loadMentorData();
    }
  }, [mentorId, navigate]);

  // Load reviews with pagination
  const loadReviews = async (page = 1) => {
    try {
      setReviewsLoading(true);
      const response = await fetch(
        `/api/mentors/${mentorId}/reviews?page=${page}&limit=${reviewsLimit}`
      );
      if (response.ok) {
        const data = await response.json();
        const transformedReviews = (data.data.reviews || []).map(review => ({
          id: review.id,
          overall_rating: review.rating,
          comment: review.comment,
          created_at: review.createdAt,
          is_featured: review.isFeatured,
          helpful_votes: review.helpfulVotes,
          mentor_response: review.mentorResponse,
          mentor_response_at: review.mentorResponseAt,
          mentee_name: `${review.mentee.firstName} ${review.mentee.lastName}`,
          session_duration: review.session.duration,
        }));

        if (page === 1) {
          setReviews(transformedReviews);
        } else {
          setReviews(prev => [...prev, ...transformedReviews]);
        }
        setReviewsTotal(data.data.pagination?.totalReviews || 0);
        setReviewsPage(page);
      }
    } catch (error) {
      console.error('Failed to load reviews:', error);
    } finally {
      setReviewsLoading(false);
    }
  };


  // Handle helpful vote on reviews
  const handleHelpfulVote = async (reviewId) => {
    try {
      await fetch(`/api/reviews/${reviewId}/helpful`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      // Reload reviews to get updated vote counts
      await loadReviews(1);
    } catch (error) {
      console.error('Vote error:', error);
      toast.error('Failed to submit vote');
    }
  };

  // Handle review reporting
  const handleReportReview = async (reviewId) => {
    try {
      await fetch(`/api/reviews/${reviewId}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'inappropriate' })
      });
      toast.success('Review reported successfully');
    } catch (error) {
      console.error('Report error:', error);
      toast.error('Failed to report review');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center">
          <LoadingSpinner size="xl" variant="gradient" />
          <p className="text-gray-600 mt-4 text-lg">Loading mentor profile...</p>
        </div>
      </div>
    );
  }

  if (!mentor) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">Mentor not found</h1>
          <button
            onClick={() => navigate('/mentors')}
            className="mt-4 px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700"
          >
            Browse Mentors
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      {/* Hero Section */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col lg:flex-row gap-8">
            {/* Mentor Info */}
            <div className="flex-1">
              <div className="flex items-start gap-6">
                <div className="w-24 h-24 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center text-white text-3xl font-bold flex-shrink-0">
                  {mentor.firstName?.charAt(0).toUpperCase() || mentor.lastName?.charAt(0).toUpperCase() || 'M'}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h1 className="text-3xl font-bold text-gray-900">
                      {mentor.firstName && mentor.lastName
                        ? `${mentor.firstName} ${mentor.lastName}`
                        : mentor.fullName || 'Mentor'}
                    </h1>
                    {mentor.isFeatured && (
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                        ⭐ Featured
                      </span>
                    )}
                    {mentor.badgeLevel && (
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                        mentor.badgeLevel === 'diamond' ? 'bg-purple-100 text-purple-800' :
                        mentor.badgeLevel === 'platinum' ? 'bg-gray-100 text-gray-800' :
                        mentor.badgeLevel === 'gold' ? 'bg-yellow-100 text-yellow-800' :
                        mentor.badgeLevel === 'silver' ? 'bg-gray-100 text-gray-600' :
                        'bg-orange-100 text-orange-800'
                      }`}>
                        {mentor.badgeLevel.toUpperCase()}
                      </span>
                    )}
                  </div>

                  <p className="text-lg text-gray-600 mb-4">
                    {mentor.specializations?.join(' • ') || 'Professional Mentor'}
                  </p>

                  {/* Categories */}
                  {mentor.categories && mentor.categories.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-4">
                      <span className="text-sm font-medium text-gray-700">Categories:</span>
                      {mentor.categories.map((category, index) => {
                        // Handle both object and string formats
                        const categoryName = typeof category === 'object' ? category.name : category;
                        const categoryColor = typeof category === 'object' ? category.colorHex : '#6B7280';
                        return (
                          <span
                            key={index}
                            className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium"
                            style={{
                              backgroundColor: `${categoryColor}20`,
                              color: categoryColor,
                              border: `1px solid ${categoryColor}40`
                            }}
                          >
                            {categoryName}
                          </span>
                        );
                      })}
                    </div>
                  )}

                  {/* Languages */}
                  {mentor.languages && mentor.languages.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-4">
                      <span className="text-sm font-medium text-gray-700">Languages:</span>
                      {mentor.languages.map((lang, index) => (
                        <span
                          key={index}
                          className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800"
                        >
                          🌐 {lang.toUpperCase()}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-4 mb-4">
                    <div className="flex items-center gap-2">
                      <div className="flex text-yellow-400">
                        {[...Array(5)].map((_, i) => (
                          <svg key={i} className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                          </svg>
                        ))}
                      </div>
                      <span className="font-semibold text-gray-900">
                        {(mentor.averageRating || 0).toFixed(1)}
                      </span>
                      <span className="text-gray-600">
                        ({mentor.totalReviews || 0} reviews)
                      </span>
                    </div>
                    <div className="text-gray-600">
                      📅 {mentor.totalSessions || 0} sessions completed
                    </div>
                    <div className="text-gray-600">
                      ⚡ Responds in ~{mentor.responseTimeHours || 24}h
                    </div>
                  </div>

                </div>
              </div>
            </div>

            {/* Booking Card */}
            <div className="lg:w-80">
              <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6 sticky top-4">
                <div className="text-center mb-6">
                  <div className="text-3xl font-bold text-gray-900 mb-1">
                    ₹{mentor.hourlyRate || 5000}/hour
                  </div>
                  <p className="text-sm text-gray-600">Video session</p>
                </div>

                <button
                  onClick={() => setShowBookingModal(true)}
                  className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold py-3 px-6 rounded-xl transition-all duration-200 transform hover:scale-[1.02] shadow-lg hover:shadow-xl mb-4"
                >
                  Book Session
                </button>

                <div className="space-y-3 text-sm text-gray-600">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {mentor.minSessionDuration || 30} - {mentor.maxSessionDuration || 180} min sessions
                  </div>
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {mentor.responseRate || 100}% response rate
                  </div>
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    Book up to {mentor.advanceBookingDays || 30} days ahead
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-8">
            {/* About Section */}
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">About</h2>
              <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                {mentor.bio || 'This mentor hasn\'t added a bio yet.'}
              </p>
              
              {mentor.yearsExperience && (
                <div className="mt-4 p-4 bg-blue-50 rounded-xl">
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    <span className="font-semibold text-blue-900">
                      {mentor.yearsExperience} years of experience
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Specializations */}
            {mentor.specializations && mentor.specializations.length > 0 && (
              <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-4">Specializations</h2>
                <div className="flex flex-wrap gap-3">
                  {mentor.specializations.map((spec, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center px-4 py-2 rounded-xl bg-gradient-to-r from-blue-100 to-purple-100 text-blue-800 font-medium"
                    >
                      {spec}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Categories */}
            {mentor.categories && mentor.categories.length > 0 && (
              <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-4">Categories</h2>
                <div className="flex flex-wrap gap-3">
                  {mentor.categories.map((category, index) => {
                    // Handle both object and string formats
                    const categoryName = typeof category === 'object' ? category.name : category;
                    const categoryColor = typeof category === 'object' ? category.colorHex : '#6B7280';
                    const categoryDesc = typeof category === 'object' ? category.description : '';
                    return (
                      <div
                        key={index}
                        className="flex-1 min-w-0 p-4 rounded-xl border"
                        style={{ borderColor: `${categoryColor}40` }}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: categoryColor }}
                          ></div>
                          <span className="font-medium text-gray-900">{categoryName}</span>
                        </div>
                        {categoryDesc && (
                          <p className="text-sm text-gray-600">{categoryDesc}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Languages */}
            {mentor.languages && mentor.languages.length > 0 && (
              <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-4">Languages</h2>
                <div className="flex flex-wrap gap-3">
                  {mentor.languages.map((lang, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center px-4 py-2 rounded-xl bg-gradient-to-r from-green-100 to-emerald-100 text-green-800 font-medium"
                    >
                      🌐 {lang.toUpperCase()}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Reviews Section */}
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-900">
                  Reviews ({reviewsTotal})
                </h2>
                {mentor.averageRating && (
                  <div className="flex items-center gap-2">
                    <div className="flex text-yellow-400">
                      {[...Array(5)].map((_, i) => (
                        <svg key={i} className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                      ))}
                    </div>
                    <span className="text-xl font-bold text-gray-900">
                      {(mentor.averageRating || 0).toFixed(1)}
                    </span>
                  </div>
                )}
              </div>

              {reviews.length > 0 ? (
                <div className="space-y-6">
                  {reviews.map((review) => (
                    <ReviewCard
                      key={review.id}
                      review={review}
                      showMentorInfo={false}
                      onHelpfulVote={handleHelpfulVote}
                      onReportReview={handleReportReview}
                    />
                  ))}

                  {/* Load More Reviews */}
                  {reviews.length < reviewsTotal && (
                    <div className="text-center pt-4">
                      <button
                        onClick={() => loadReviews(reviewsPage + 1)}
                        disabled={reviewsLoading}
                        className="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-xl transition-colors flex items-center gap-2 mx-auto"
                      >
                        {reviewsLoading ? <LoadingSpinner size="sm" /> : 'Load More Reviews'}
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                    </svg>
                  </div>
                  <p className="text-gray-500 text-lg">No reviews yet</p>
                  <p className="text-gray-400 text-sm">Be the first to book and review this mentor!</p>
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Quick Stats */}
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Quick Stats</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Sessions</span>
                  <span className="font-semibold text-gray-900">{mentor.totalSessions || 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Response Time</span>
                  <span className="font-semibold text-gray-900">{mentor.responseTimeHours || 24}h</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Response Rate</span>
                  <span className="font-semibold text-gray-900">{mentor.responseRate || 100}%</span>
                </div>
                {mentor.yearsExperience && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Experience</span>
                    <span className="font-semibold text-gray-900">{mentor.yearsExperience} years</span>
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Booking Modal */}
      <BookingModal
        mentor={{
          id: mentor?.id,
          firstName: mentor?.firstName || 'Mentor',
          lastName: mentor?.lastName || '',
          hourlyRate: mentor?.hourlyRate || 5000
        }}
        isOpen={showBookingModal}
        onClose={() => setShowBookingModal(false)}
      />
    </div>
  );
};

export default MentorProfile;
