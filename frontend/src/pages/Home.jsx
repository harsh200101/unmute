import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import VideoHero from '../components/VideoHero';
import ReviewCard from '../components/ReviewCard';
import LoadingSpinner from '../components/LoadingSpinner';
import api from '../utils/api';

const Home = () => {
  const { isAuthenticated, user, isMentor } = useAuth();
  const navigate = useNavigate();
  const [featuredMentors, setFeaturedMentors] = useState([]);
  const [testimonials, setTestimonials] = useState([]);
  const [platformStats, setPlatformStats] = useState({});
  const [loading, setLoading] = useState(false);

  // Load featured content on mount
  useEffect(() => {
    const loadFeaturedContent = async () => {
      try {
        setLoading(true);

        // Load featured mentors
        try {
          const mentorsResponse = await api.get('/mentors/featured', { params: { limit: 6 } });
          setFeaturedMentors(mentorsResponse.data.data || []);
        } catch (e) { /* non-critical, ignore */ }

        // Load testimonials
        try {
          const testimonialsResponse = await api.get('/reviews/featured', { params: { limit: 6 } });
          setTestimonials(testimonialsResponse.data.data || []);
        } catch (e) { /* non-critical, ignore */ }

        // Load platform statistics
        setPlatformStats({
          totalMentors: 5000,
          totalSessions: 50000,
          averageRating: 4.9,
          successRate: 98
        });

      } catch (error) {
        console.error('Failed to load featured content:', error);
      } finally {
        setLoading(false);
      }
    };

    loadFeaturedContent();
  }, []);

  // Handle CTA actions
  const handleGetStarted = () => {
    if (isAuthenticated) {
      navigate('/dashboard');
    } else {
      navigate('/register');
    }
  };

  const handleFindMentor = () => {
    if (isAuthenticated) {
      navigate('/mentors');
    } else {
      navigate('/register?redirect=/mentors');
    }
  };

  const handleBecomeMentor = () => {
    if (isAuthenticated && isMentor()) {
      navigate('/mentor/dashboard');
    } else if (isAuthenticated) {
      navigate('/mentor/apply');
    } else {
      navigate('/register?type=mentor');
    }
  };

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <VideoHero />

      {/* Features Section */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
              Why Choose <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">Unmute</span>?
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              We've created the perfect platform to connect ambitious learners with world-class mentors
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <div className="group p-8 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-100 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-2">
              <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-4">1-on-1 Video Sessions</h3>
              <p className="text-gray-600 leading-relaxed">
                Get personalized guidance through high-quality video calls with integrated screen sharing and recording capabilities.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="group p-8 rounded-2xl bg-gradient-to-br from-purple-50 to-pink-100 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-2">
              <div className="w-16 h-16 bg-purple-600 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-4">Verified Experts</h3>
              <p className="text-gray-600 leading-relaxed">
                All mentors go through a rigorous verification process. Connect with professionals from top companies worldwide.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="group p-8 rounded-2xl bg-gradient-to-br from-green-50 to-emerald-100 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-2">
              <div className="w-16 h-16 bg-green-600 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-4">Flexible Scheduling</h3>
              <p className="text-gray-600 leading-relaxed">
                Book sessions that fit your schedule. Available 24/7 with mentors across different time zones.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="group p-8 rounded-2xl bg-gradient-to-br from-yellow-50 to-orange-100 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-2">
              <div className="w-16 h-16 bg-yellow-600 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-4">Transparent Pricing</h3>
              <p className="text-gray-600 leading-relaxed">
                No hidden fees. Pay per session with secure payment processing and automatic refunds for cancellations.
              </p>
            </div>

            {/* Feature 5 */}
            <div className="group p-8 rounded-2xl bg-gradient-to-br from-red-50 to-pink-100 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-2">
              <div className="w-16 h-16 bg-red-600 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-4">Progress Tracking</h3>
              <p className="text-gray-600 leading-relaxed">
                Track your learning journey with detailed analytics, session notes, and progress reports.
              </p>
            </div>

            {/* Feature 6 */}
            <div className="group p-8 rounded-2xl bg-gradient-to-br from-teal-50 to-cyan-100 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-2">
              <div className="w-16 h-16 bg-teal-600 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192L5.636 18.364M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-4">24/7 Support</h3>
              <p className="text-gray-600 leading-relaxed">
                Our dedicated support team is always ready to help with technical issues or booking assistance.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-20 bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
              How It Works
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Get started in just 3 simple steps and begin your learning journey today
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Step 1 */}
            <div className="text-center group">
              <div className="relative mb-8">
                <div className="w-24 h-24 bg-white rounded-full shadow-xl flex items-center justify-center mx-auto group-hover:scale-110 transition-transform">
                  <span className="text-3xl font-bold text-blue-600">1</span>
                </div>
                <div className="absolute top-12 left-1/2 transform -translate-x-1/2 w-1 h-16 bg-blue-200 hidden md:block"></div>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-4">Find Your Mentor</h3>
              <p className="text-gray-600 text-lg">
                Browse our curated list of verified mentors and find the perfect match for your goals and schedule.
              </p>
            </div>

            {/* Step 2 */}
            <div className="text-center group">
              <div className="relative mb-8">
                <div className="w-24 h-24 bg-white rounded-full shadow-xl flex items-center justify-center mx-auto group-hover:scale-110 transition-transform">
                  <span className="text-3xl font-bold text-purple-600">2</span>
                </div>
                <div className="absolute top-12 left-1/2 transform -translate-x-1/2 w-1 h-16 bg-purple-200 hidden md:block"></div>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-4">Book & Pay</h3>
              <p className="text-gray-600 text-lg">
                Choose your preferred time slot and complete secure payment. Get instant confirmation with meeting details.
              </p>
            </div>

            {/* Step 3 */}
            <div className="text-center group">
              <div className="relative mb-8">
                <div className="w-24 h-24 bg-white rounded-full shadow-xl flex items-center justify-center mx-auto group-hover:scale-110 transition-transform">
                  <span className="text-3xl font-bold text-green-600">3</span>
                </div>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-4">Learn & Grow</h3>
              <p className="text-gray-600 text-lg">
                Join your session, get personalized guidance, and accelerate your growth with expert insights.
              </p>
            </div>
          </div>

          <div className="text-center mt-16">
            <button
              onClick={handleGetStarted}
              className="px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-bold text-lg rounded-2xl transition-all duration-300 transform hover:scale-105 shadow-xl hover:shadow-2xl"
            >
              {isAuthenticated ? '🚀 Go to Dashboard' : '🎯 Start Learning Today'}
            </button>
          </div>
        </div>
      </section>

      {/* Statistics Section */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div className="text-center">
              <div className="text-4xl md:text-5xl font-bold text-blue-600 mb-2">
                {platformStats.totalMentors?.toLocaleString() || '5,000+'}
              </div>
              <div className="text-gray-600 font-medium">Expert Mentors</div>
            </div>
            <div className="text-center">
              <div className="text-4xl md:text-5xl font-bold text-purple-600 mb-2">
                {platformStats.totalSessions?.toLocaleString() || '50,000+'}
              </div>
              <div className="text-gray-600 font-medium">Sessions Completed</div>
            </div>
            <div className="text-center">
              <div className="text-4xl md:text-5xl font-bold text-green-600 mb-2">
                {platformStats.averageRating || '4.9'}★
              </div>
              <div className="text-gray-600 font-medium">Average Rating</div>
            </div>
            <div className="text-center">
              <div className="text-4xl md:text-5xl font-bold text-orange-600 mb-2">
                {platformStats.successRate || '98'}%
              </div>
              <div className="text-gray-600 font-medium">Success Rate</div>
            </div>
          </div>
        </div>
      </section>

      {/* Featured Mentors Section */}
      {featuredMentors.length > 0 && (
        <section className="py-20 bg-gradient-to-br from-purple-50 to-pink-100">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
                Meet Our Top Mentors
              </h2>
              <p className="text-xl text-gray-600 max-w-3xl mx-auto">
                Learn from industry leaders and experienced professionals
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {featuredMentors.slice(0, 6).map((mentor) => (
                <div key={mentor.id} className="bg-white rounded-2xl shadow-lg hover:shadow-xl transition-shadow p-6 group cursor-pointer" onClick={() => navigate(`/mentors/${mentor.id}`)}>
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white text-xl font-bold">
                      {mentor.name?.charAt(0) || 'M'}
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-gray-900 group-hover:text-blue-600 transition-colors">
                        {mentor.name}
                      </h3>
                      <p className="text-gray-600">{mentor.title}</p>
                    </div>
                  </div>
                  <p className="text-gray-600 mb-4 line-clamp-2">{mentor.bio}</p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex text-yellow-400">
                        {[...Array(5)].map((_, i) => (
                          <svg key={i} className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                          </svg>
                        ))}
                      </div>
                      <span className="text-sm text-gray-600">({mentor.reviewCount || 0})</span>
                    </div>
                    <span className="text-lg font-bold text-gray-900">${mentor.hourlyRate || 75}/hr</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="text-center mt-12">
              <button
                onClick={() => navigate('/mentors')}
                className="px-8 py-4 bg-white text-purple-600 border-2 border-purple-600 hover:bg-purple-600 hover:text-white font-bold rounded-2xl transition-all duration-300"
              >
                View All Mentors
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Testimonials Section */}
      {testimonials.length > 0 && (
        <section className="py-20 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
                What Our Users Say
              </h2>
              <p className="text-xl text-gray-600 max-w-3xl mx-auto">
                Don't just take our word for it - hear from thousands of successful learners
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {testimonials.slice(0, 6).map((testimonial) => (
                <ReviewCard
                  key={testimonial.id}
                  review={testimonial}
                  showMentorInfo={false}
                  showActions={false}
                  className="transform hover:-translate-y-2 transition-transform"
                />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-r from-blue-600 to-purple-600">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
            Ready to Accelerate Your Growth?
          </h2>
          <p className="text-xl text-white/90 mb-10 max-w-2xl mx-auto">
            Join thousands of successful learners who have transformed their careers with expert mentorship
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <button
              onClick={handleFindMentor}
              className="px-8 py-4 bg-white text-blue-600 font-bold text-lg rounded-2xl hover:bg-gray-50 transition-all duration-300 transform hover:scale-105 shadow-xl hover:shadow-2xl"
            >
              🔍 Find Your Mentor
            </button>
            <button
              onClick={handleBecomeMentor}
              className="px-8 py-4 bg-transparent border-2 border-white text-white font-bold text-lg rounded-2xl hover:bg-white hover:text-blue-600 transition-all duration-300 transform hover:scale-105"
            >
              👨‍🏫 Become a Mentor
            </button>
          </div>

          <div className="mt-8 text-white/80">
            <p className="text-sm">✨ No setup fees • Cancel anytime • 100% satisfaction guarantee</p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div className="md:col-span-2">
              <h3 className="text-2xl font-bold mb-4">Unmute</h3>
              <p className="text-gray-400 mb-6 max-w-md">
                The world's leading platform for 1-on-1 mentorship. Connect, learn, and grow with expert guidance.
              </p>
              <div className="flex gap-4">
                <div className="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center cursor-pointer hover:bg-gray-700 transition-colors">
                  <span className="text-sm">📧</span>
                </div>
                <div className="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center cursor-pointer hover:bg-gray-700 transition-colors">
                  <span className="text-sm">🐦</span>
                </div>
                <div className="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center cursor-pointer hover:bg-gray-700 transition-colors">
                  <span className="text-sm">💼</span>
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-lg font-semibold mb-4">For Learners</h4>
              <ul className="space-y-2 text-gray-400">
                <li><a href="/mentors" className="hover:text-white transition-colors">Find Mentors</a></li>
                <li><a href="/categories" className="hover:text-white transition-colors">Browse Categories</a></li>
                <li><a href="/how-it-works" className="hover:text-white transition-colors">How It Works</a></li>
                <li><a href="/pricing" className="hover:text-white transition-colors">Pricing</a></li>
              </ul>
            </div>

            <div>
              <h4 className="text-lg font-semibold mb-4">For Mentors</h4>
              <ul className="space-y-2 text-gray-400">
                <li><a href="/mentor/apply" className="hover:text-white transition-colors">Become a Mentor</a></li>
                <li><a href="/mentor/resources" className="hover:text-white transition-colors">Resources</a></li>
                <li><a href="/mentor/success-stories" className="hover:text-white transition-colors">Success Stories</a></li>
                <li><a href="/mentor/support" className="hover:text-white transition-colors">Mentor Support</a></li>
              </ul>
            </div>
          </div>

          <div className="border-t border-gray-800 mt-12 pt-8 flex flex-col md:flex-row justify-between items-center">
            <p className="text-gray-400 text-sm">
              © 2025 Unmute. All rights reserved.
            </p>
            <div className="flex gap-6 mt-4 md:mt-0">
              <a href="/privacy" className="text-gray-400 hover:text-white text-sm transition-colors">Privacy Policy</a>
              <a href="/terms" className="text-gray-400 hover:text-white text-sm transition-colors">Terms of Service</a>
              <a href="/support" className="text-gray-400 hover:text-white text-sm transition-colors">Support</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Home;
