import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const VideoHero = ({
  videoSrc = "/videos/hero-video.mp4",
  posterImage = "/images/hero-poster.jpg",
  fallbackImage = "/images/woman-work-having-video-call.jpg",
  autoPlay = true,
  muted = true,
  loop = true,
  showControls = false,
  overlayOpacity = 0.6
}) => {
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    // Check if device is mobile
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Handle video load
  const handleVideoLoad = () => {
    setIsVideoLoaded(true);
    if (autoPlay && !isMobile) {
      videoRef.current?.play().then(() => {
        setIsVideoPlaying(true);
      }).catch(console.error);
    }
  };

  // Toggle video play/pause
  const toggleVideoPlay = () => {
    if (videoRef.current) {
      if (isVideoPlaying) {
        videoRef.current.pause();
        setIsVideoPlaying(false);
      } else {
        videoRef.current.play();
        setIsVideoPlaying(true);
      }
    }
  };

  // Handle CTA clicks
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
    if (isAuthenticated && user?.role === 'mentor') {
      navigate('/mentor/dashboard');
    } else if (isAuthenticated) {
      navigate('/mentor/apply');
    } else {
      navigate('/register?type=mentor');
    }
  };

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Video Background */}
      <div className="absolute inset-0 w-full h-full">
        {/* Fallback Image */}
        <div 
          className="absolute inset-0 w-full h-full bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: `url(${fallbackImage})` }}
        />
        
        {/* Video Element */}
        {!isMobile && (
          <video
            ref={videoRef}
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ${
              isVideoLoaded ? 'opacity-100' : 'opacity-0'
            }`}
            autoPlay={autoPlay}
            muted={muted}
            loop={loop}
            playsInline
            poster={posterImage}
            controls={showControls}
            onLoadedData={handleVideoLoad}
            onPlay={() => setIsVideoPlaying(true)}
            onPause={() => setIsVideoPlaying(false)}
          >
            <source src={videoSrc} type="video/mp4" />
            Your browser does not support the video tag.
          </video>
        )}
        
        {/* Gradient Overlay */}
        <div 
          className="absolute inset-0 bg-gradient-to-br from-black/60 via-black/40 to-black/60"
          style={{ opacity: overlayOpacity }}
        />
      </div>

      {/* Content Overlay */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <div className="max-w-4xl mx-auto">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full px-4 py-2 mb-8">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
            <span className="text-white/90 text-sm font-medium">
              ✨ Now in early access — be one of the first to find your mentor
            </span>
          </div>

          {/* Main Heading */}
          <h1 className="text-5xl md:text-7xl font-bold text-white mb-6 leading-tight">
            Unlock Your
            <span className="block bg-gradient-to-r from-blue-400 via-purple-500 to-pink-500 bg-clip-text text-transparent">
              Potential
            </span>
            with Expert Mentors
          </h1>

          {/* Subheading */}
          <p className="text-xl md:text-2xl text-white/90 mb-8 max-w-3xl mx-auto leading-relaxed">
            Connect with world-class mentors for personalized 1-on-1 video sessions. 
            Get expert guidance, accelerate your growth, and achieve your goals faster.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-8">
            <button
              onClick={handleGetStarted}
              className="group relative px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-bold rounded-2xl transition-all duration-300 transform hover:scale-105 shadow-xl hover:shadow-2xl"
            >
              <span className="relative z-10 flex items-center gap-2">
                {isAuthenticated ? '🚀 Go to Dashboard' : '🎯 Get Started Free'}
                <svg className="w-5 h-5 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </span>
            </button>

            <button
              onClick={handleFindMentor}
              className="px-8 py-4 bg-white/10 backdrop-blur-sm border-2 border-white/30 hover:bg-white/20 text-white font-semibold rounded-2xl transition-all duration-300 flex items-center gap-2"
            >
              🔍 Find a Mentor
            </button>
          </div>

          {/* Secondary CTA */}
          <div className="mb-8">
            <button
              onClick={handleBecomeMentor}
              className="text-white/80 hover:text-white font-medium underline underline-offset-4 transition-colors"
            >
              Want to become a mentor? Join our expert community →
            </button>
          </div>

          {/* Trust Indicators */}
          <div className="flex flex-wrap justify-center items-center gap-8 opacity-75">
            <div className="text-white/60 text-sm">Trusted by professionals from:</div>
            <div className="flex gap-6 items-center">
              <div className="h-8 px-4 bg-white/10 rounded-lg flex items-center text-white/80 text-sm font-medium">
                Google
              </div>
              <div className="h-8 px-4 bg-white/10 rounded-lg flex items-center text-white/80 text-sm font-medium">
                Microsoft
              </div>
              <div className="h-8 px-4 bg-white/10 rounded-lg flex items-center text-white/80 text-sm font-medium">
                Meta
              </div>
              <div className="h-8 px-4 bg-white/10 rounded-lg flex items-center text-white/80 text-sm font-medium">
                Netflix
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Video Controls (if enabled) */}
      {!isMobile && isVideoLoaded && (
        <div className="absolute bottom-8 right-8 z-20">
          <button
            onClick={toggleVideoPlay}
            className="w-12 h-12 bg-white/20 backdrop-blur-sm border border-white/30 rounded-full flex items-center justify-center text-white hover:bg-white/30 transition-all duration-200"
            aria-label={isVideoPlaying ? 'Pause video' : 'Play video'}
          >
            {isVideoPlaying ? (
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
              </svg>
            ) : (
              <svg className="w-6 h-6 ml-1" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z"/>
              </svg>
            )}
          </button>
        </div>
      )}

      {/* Scroll Indicator */}
      <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-20">
        <div className="animate-bounce">
          <svg className="w-6 h-6 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        </div>
      </div>

      {/* Mobile Optimization: Particles Effect */}
      {isMobile && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute w-4 h-4 bg-blue-400/30 rounded-full animate-float-1"></div>
          <div className="absolute w-6 h-6 bg-purple-400/20 rounded-full animate-float-2"></div>
          <div className="absolute w-3 h-3 bg-pink-400/40 rounded-full animate-float-3"></div>
        </div>
      )}
    </section>
  );
};

export default VideoHero;
