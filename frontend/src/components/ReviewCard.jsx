import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from './LoadingSpinner';

const ReviewCard = ({ 
  review, 
  showMentorInfo = false, 
  showMenteeInfo = true,
  showActions = true,
  compact = false,
  onHelpfulVote,
  onReportReview,
  className = ""
}) => {
  const { user, isAuthenticated } = useAuth();
  const [isVoting, setIsVoting] = useState(false);
  const [localHelpfulVotes, setLocalHelpfulVotes] = useState(review.helpful_votes || 0);
  const [hasVoted, setHasVoted] = useState(false);
  const [showFullComment, setShowFullComment] = useState(false);
  const [showMentorResponse, setShowMentorResponse] = useState(false);

  // Handle helpful vote
  const handleHelpfulVote = async () => {
    if (!isAuthenticated || isVoting || hasVoted) return;

    setIsVoting(true);
    try {
      await onHelpfulVote?.(review.id);
      setLocalHelpfulVotes(prev => prev + 1);
      setHasVoted(true);
    } catch (error) {
      console.error('Error voting on review:', error);
    } finally {
      setIsVoting(false);
    }
  };

  // Format date
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.ceil(diffDays / 7)} weeks ago`;
    if (diffDays < 365) return `${Math.ceil(diffDays / 30)} months ago`;
    return date.toLocaleDateString();
  };

  // Render star rating
  const StarRating = ({ rating, label, showLabel = true }) => (
    <div className="flex items-center gap-1">
      {showLabel && <span className="text-xs text-gray-600 font-medium min-w-[80px]">{label}:</span>}
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <svg
            key={star}
            className={`w-4 h-4 ${
              star <= rating ? 'text-yellow-400' : 'text-gray-300'
            }`}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        ))}
      </div>
      <span className="text-sm font-semibold text-gray-800 ml-1">{(rating || 0).toFixed(1)}</span>
    </div>
  );

  // Truncate long comments
  const truncateText = (text, maxLength = 200) => {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  const commentText = showFullComment ? review.comment : truncateText(review.comment);
  const shouldShowReadMore = review.comment && review.comment.length > 200;

  return (
    <div className={`bg-white rounded-2xl shadow-sm border border-gray-200 hover:shadow-lg transition-all duration-300 ${className}`}>
      {/* Featured Badge */}
      {review.is_featured && (
        <div className="bg-gradient-to-r from-yellow-400 to-orange-500 text-white text-xs font-bold px-3 py-1 rounded-t-2xl text-center">
          ⭐ Featured Review
        </div>
      )}

      <div className={`p-6 ${compact ? 'p-4' : ''}`}>
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            {/* Reviewer Avatar */}
            {showMenteeInfo && (
              <>
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-semibold text-sm">
                  {review.mentee_name ? review.mentee_name.charAt(0).toUpperCase() : 'U'}
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900">
                    {review.mentee_name || 'Anonymous User'}
                  </h4>
                  <p className="text-sm text-gray-500">{formatDate(review.created_at)}</p>
                </div>
              </>
            )}

            {/* Mentor Info (if showing mentor) */}
            {showMentorInfo && (
              <>
                <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-teal-600 rounded-full flex items-center justify-center text-white font-semibold text-sm">
                  {review.mentor_name ? review.mentor_name.charAt(0).toUpperCase() : 'M'}
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900">
                    {review.mentor_name || 'Mentor'}
                  </h4>
                  <p className="text-sm text-gray-500">Session: {formatDate(review.session_date)}</p>
                </div>
              </>
            )}
          </div>

          {/* Overall Rating */}
          <div className="flex items-center gap-2">
            <div className="flex">
              {[1, 2, 3, 4, 5].map((star) => (
                <svg
                  key={star}
                  className={`w-5 h-5 ${
                    star <= review.overall_rating ? 'text-yellow-400' : 'text-gray-300'
                  }`}
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              ))}
            </div>
            <span className="text-lg font-bold text-gray-800">{(review.overall_rating || 0).toFixed(1)}</span>
          </div>
        </div>

        {/* Detailed Ratings */}
        {!compact && (review.communication_rating || review.knowledge_rating || review.helpfulness_rating) && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4 p-4 bg-gray-50 rounded-xl">
            {review.communication_rating && (
              <StarRating 
                rating={review.communication_rating} 
                label="Communication" 
              />
            )}
            {review.knowledge_rating && (
              <StarRating 
                rating={review.knowledge_rating} 
                label="Knowledge" 
              />
            )}
            {review.helpfulness_rating && (
              <StarRating 
                rating={review.helpfulness_rating} 
                label="Helpfulness" 
              />
            )}
          </div>
        )}

        {/* Review Comment */}
        {review.comment && (
          <div className="mb-4">
            <p className="text-gray-700 leading-relaxed">
              "{commentText}"
            </p>
            {shouldShowReadMore && (
              <button
                onClick={() => setShowFullComment(!showFullComment)}
                className="text-blue-600 hover:text-blue-700 text-sm font-medium mt-2 transition-colors"
              >
                {showFullComment ? 'Show Less' : 'Read More'}
              </button>
            )}
          </div>
        )}

        {/* Mentor Response */}
        {review.mentor_response && (
          <div className="mt-4 p-4 bg-blue-50 rounded-xl border-l-4 border-blue-500">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M18 13V5a2 2 0 00-2-2H4a2 2 0 00-2 2v8a2 2 0 002 2h3l3 3 3-3h3a2 2 0 002-2zM5 7a1 1 0 011-1h8a1 1 0 110 2H6a1 1 0 01-1-1zm1 3a1 1 0 100 2h3a1 1 0 100-2H6z" />
                </svg>
              </div>
              <span className="text-sm font-semibold text-blue-900">Mentor Response</span>
              <span className="text-xs text-blue-600">
                {formatDate(review.mentor_response_at)}
              </span>
            </div>
            <p className="text-blue-800 text-sm italic">
              "{review.mentor_response}"
            </p>
          </div>
        )}

        {/* Actions */}
        {showActions && (
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200">
            <div className="flex items-center gap-4">
              {/* Helpful Vote */}
              <button
                onClick={handleHelpfulVote}
                disabled={!isAuthenticated || isVoting || hasVoted}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-200 ${
                  hasVoted 
                    ? 'bg-green-100 text-green-700' 
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700 hover:text-gray-900'
                } ${
                  !isAuthenticated || hasVoted ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
                }`}
              >
                {isVoting ? (
                  <LoadingSpinner size="sm" />
                ) : (
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M2 10.5a1.5 1.5 0 113 0v6a1.5 1.5 0 01-3 0v-6zM6 10.333v5.43a2 2 0 001.106 1.79l.05.025A4 4 0 008.943 18h5.416a2 2 0 001.962-1.608l1.2-6A2 2 0 0015.56 8H12V4a2 2 0 00-2-2 1 1 0 00-1 1v.667a4 4 0 01-.8 2.4L6.8 7.933a4 4 0 00-.8 2.4z" />
                  </svg>
                )}
                <span className="text-sm font-medium">
                  Helpful ({localHelpfulVotes})
                </span>
              </button>

              {/* Session Info */}
              {review.session_duration && (
                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                  {review.session_duration} min session
                </span>
              )}
            </div>

            {/* Report Review */}
            {isAuthenticated && user?.id !== review.mentee_id && (
              <button
                onClick={() => onReportReview?.(review.id)}
                className="text-gray-400 hover:text-red-500 transition-colors p-2 rounded-lg hover:bg-red-50"
                title="Report Review"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ReviewCard;
