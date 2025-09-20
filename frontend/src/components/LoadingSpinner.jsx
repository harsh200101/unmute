import React from 'react';

const LoadingSpinner = ({ 
  size = 'md', 
  variant = 'default', 
  text = null, 
  fullScreen = false,
  color = 'blue' 
}) => {
  
  // Size configurations
  const sizes = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
    xl: 'w-16 h-16',
    '2xl': 'w-20 h-20'
  };

  // Color configurations
  const colors = {
    blue: 'border-blue-600',
    purple: 'border-purple-600',
    green: 'border-green-600',
    red: 'border-red-600',
    yellow: 'border-yellow-600',
    indigo: 'border-indigo-600',
    pink: 'border-pink-600'
  };

  // Spinner variants
  const renderSpinner = () => {
    const spinnerSize = sizes[size];
    const spinnerColor = colors[color];

    switch (variant) {
      case 'dots':
        return (
          <div className="flex space-x-1">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className={`${size === 'sm' ? 'w-2 h-2' : size === 'lg' ? 'w-4 h-4' : 'w-3 h-3'} bg-${color}-600 rounded-full animate-pulse`}
                style={{
                  animationDelay: `${i * 0.2}s`,
                  animationDuration: '1.4s'
                }}
              />
            ))}
          </div>
        );

      case 'pulse':
        return (
          <div className={`${spinnerSize} bg-${color}-600 rounded-full animate-ping`} />
        );

      case 'bars':
        return (
          <div className="flex space-x-1">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`${size === 'sm' ? 'w-1 h-4' : size === 'lg' ? 'w-2 h-8' : 'w-1.5 h-6'} bg-${color}-600 animate-pulse`}
                style={{
                  animationDelay: `${i * 0.1}s`,
                  animationDuration: '1.2s'
                }}
              />
            ))}
          </div>
        );

      case 'dual-ring':
        return (
          <div className="relative">
            <div className={`${spinnerSize} border-4 border-gray-200 rounded-full animate-spin`} />
            <div className={`absolute inset-0 ${spinnerSize} border-4 border-transparent ${spinnerColor} border-t-transparent rounded-full animate-spin`} style={{ animationDirection: 'reverse' }} />
          </div>
        );

      case 'gradient':
        return (
          <div className={`${spinnerSize} rounded-full animate-spin`}>
            <div className={`w-full h-full rounded-full border-4 border-transparent bg-gradient-to-r from-${color}-400 to-${color}-600`} 
                 style={{
                   background: `conic-gradient(from 0deg, transparent, ${color === 'blue' ? '#3b82f6' : '#8b5cf6'})`
                 }} 
            />
          </div>
        );

      case 'modern':
        return (
          <div className="relative">
            <div className={`${spinnerSize} border-4 border-gray-100 rounded-full`} />
            <div className={`absolute inset-0 ${spinnerSize} border-4 border-transparent ${spinnerColor} border-t-4 rounded-full animate-spin`} />
            <div className={`absolute inset-2 ${size === 'sm' ? 'w-2 h-2' : size === 'lg' ? 'w-4 h-4' : 'w-3 h-3'} bg-${color}-600 rounded-full animate-ping opacity-75`} />
          </div>
        );

      default: // 'default'
        return (
          <div className={`${spinnerSize} border-4 border-gray-200 ${spinnerColor} border-t-transparent rounded-full animate-spin`} />
        );
    }
  };

  // Container styles
  const containerClasses = fullScreen 
    ? "fixed inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-50"
    : "flex items-center justify-center";

  return (
    <div className={containerClasses}>
      <div className="flex flex-col items-center space-y-4">
        {/* Spinner */}
        <div className="relative">
          {renderSpinner()}
        </div>

        {/* Loading text */}
        {text && (
          <div className="text-center">
            <p className={`text-gray-700 font-medium ${
              size === 'sm' ? 'text-xs' : 
              size === 'lg' ? 'text-lg' : 
              size === 'xl' ? 'text-xl' : 'text-sm'
            }`}>
              {text}
            </p>
            <div className="flex justify-center mt-2">
              <div className="flex space-x-1">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="w-1 h-1 bg-gray-400 rounded-full animate-bounce"
                    style={{
                      animationDelay: `${i * 0.3}s`,
                      animationDuration: '1.4s'
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Pre-configured spinner components for common use cases
export const PageLoader = ({ text = "Loading..." }) => (
  <LoadingSpinner 
    size="xl" 
    variant="modern" 
    text={text} 
    fullScreen={true} 
    color="blue" 
  />
);

export const ButtonSpinner = ({ color = "white" }) => (
  <LoadingSpinner 
    size="sm" 
    variant="default" 
    color={color === "white" ? "gray" : color} 
  />
);

export const CardLoader = ({ text }) => (
  <div className="flex items-center justify-center py-12">
    <LoadingSpinner 
      size="lg" 
      variant="dots" 
      text={text} 
      color="indigo" 
    />
  </div>
);

export const InlineLoader = ({ text = "Loading" }) => (
  <div className="flex items-center space-x-2">
    <LoadingSpinner size="sm" variant="default" color="blue" />
    <span className="text-sm text-gray-600">{text}</span>
  </div>
);

// Loading skeleton component
export const LoadingSkeleton = ({ lines = 3, className = "" }) => (
  <div className={`animate-pulse space-y-3 ${className}`}>
    {Array.from({ length: lines }).map((_, i) => (
      <div key={i} className="flex space-x-4">
        <div className="rounded-full bg-gray-200 h-10 w-10"></div>
        <div className="flex-1 space-y-2 py-1">
          <div className="h-4 bg-gray-200 rounded w-3/4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
        </div>
      </div>
    ))}
  </div>
);

// Loading overlay component
export const LoadingOverlay = ({ isLoading, children, text = "Processing..." }) => (
  <div className="relative">
    {children}
    {isLoading && (
      <div className="absolute inset-0 bg-white/90 backdrop-blur-sm flex items-center justify-center z-10 rounded-lg">
        <LoadingSpinner 
          size="lg" 
          variant="modern" 
          text={text} 
          color="blue" 
        />
      </div>
    )}
  </div>
);

// Progress loader with percentage
export const ProgressLoader = ({ progress = 0, text = "Loading" }) => (
  <div className="flex flex-col items-center space-y-4">
    <div className="relative">
      <div className="w-16 h-16 border-4 border-gray-200 rounded-full">
        <div 
          className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full transform -rotate-90 transition-transform duration-300"
          style={{
            background: `conic-gradient(#3b82f6 ${progress * 3.6}deg, transparent 0deg)`
          }}
        />
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xs font-bold text-gray-700">{Math.round(progress)}%</span>
      </div>
    </div>
    <p className="text-sm text-gray-600">{text}</p>
  </div>
);

export default LoadingSpinner;
