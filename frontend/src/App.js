import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './context/AuthContext';
import ErrorBoundary from './components/ErrorBoundary';
import ProtectedRoute from './components/ProtectedRoute';
import RoleBasedRoute from './components/RoleBasedRoute';
import LoadingSpinner from './components/LoadingSpinner';
import Header from './components/Header';
import Footer from './components/Footer';
import ForgotPassword from './pages/ForgotPassword'; // Import the new component
import ResetPassword from './pages/ResetPassword'; 



// Lazy load existing pages
const Home = lazy(() => import('./pages/Home'));
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const Mentors = lazy(() => import('./pages/Mentors'));
const MentorProfile = lazy(() => import('./pages/MentorProfile'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const MentorDashboard = lazy(() => import('./pages/MentorDashboard'));
const MentorProfileForm = lazy(() => import('./pages/MentorProfileForm'));
const UserProfile = lazy(() => import('./pages/UserProfile'));
const MyAppointments = lazy(() => import('./pages/MyAppointments'));
const SessionManagement = lazy(() => import('./pages/SessionManagement'));
const MentorRegistration = lazy(() => import('./pages/MentorRegistration'));
const MentorAvailability = lazy(() => import('./pages/MentorAvailability'));
const MentorEarnings = lazy(() => import('./pages/MentorEarnings'));
const MentorReviews = lazy(() => import('./pages/MentorReviews'));
const MentorSessions = lazy(() => import('./pages/MentorSessions'));
const MentorRescheduleRequest = lazy(() => import('./pages/MentorRescheduleRequest'));
const OAuthCallback = lazy(() => import('./pages/OAuthCallback'));
const PaymentResult = lazy(() => import('./pages/PaymentResult'));
const PaymentStatusPage = lazy(() => import('./pages/PaymentStatusPage'));
const EmailVerification = lazy(() => import('./pages/EmailVerification'));
const RescheduleSession = lazy(() => import('./pages/RescheduleSession'));
const MeetingRoom = lazy(() => import('./pages/MeetingRoom'));
const NotFound = lazy(() => import('./pages/NotFound'));

// Session Notes History Page
const SessionNotesHistory = lazy(() => import('./pages/SessionNotesHistory'));

// Loading fallback component
const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
    <div className="text-center">
      <LoadingSpinner size="xl" variant="gradient" />
      <p className="text-gray-600 mt-4 text-lg">Loading...</p>
    </div>
  </div>
);

// App Layout component
const AppLayout = ({ children, showHeader = true, showFooter = true }) => (
  <div className="min-h-screen flex flex-col">
    {showHeader && <Header />}
    <main className="flex-1 pt-16">
      <ErrorBoundary>
        <Suspense fallback={<PageLoader />}>
          {children}
        </Suspense>
      </ErrorBoundary>
    </main>
    {showFooter && <Footer />}
  </div>
);

// Auth Layout (no header/footer for login pages)
const AuthLayout = ({ children }) => (
  <div className="min-h-screen">
    <ErrorBoundary>
      <Suspense fallback={<PageLoader />}>
        {children}
      </Suspense>
    </ErrorBoundary>
  </div>
);

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <Router>
          <div className="App">
            <Routes>
              {/* Public Routes */}
              <Route 
                path="/" 
                element={
                  <AppLayout>
                    <Home />
                  </AppLayout>
                } 
              />
              
              <Route 
                path="/mentors" 
                element={
                  <AppLayout>
                    <Mentors />
                  </AppLayout>
                } 
              />
              
              <Route 
                path="/mentors/:mentorId" 
                element={
                  <AppLayout>
                    <MentorProfile />
                  </AppLayout>
                } 
              />

              {/* Auth Routes (no header/footer) */}
              <Route 
                path="/login" 
                element={
                  <AuthLayout>
                    <Login />
                  </AuthLayout>
                } 
              />
              
              <Route 
                path="/register" 
                element={
                  <AuthLayout>
                    <Register />
                  </AuthLayout>
                } 
              />
              
              <Route
                path="/oauth/callback"
                element={
                  <AuthLayout>
                    <OAuthCallback />
                  </AuthLayout>
                }
              />

              <Route
                path="/verify-email"
                element={
                  <AuthLayout>
                    <EmailVerification />
                  </AuthLayout>
                }
              />

              {/* Payment Routes */}
              <Route
                path="/payment/result"
                element={
                  <ProtectedRoute>
                    <AppLayout>
                      <PaymentResult />
                    </AppLayout>
                  </ProtectedRoute>
                }
              />

              <Route
                path="/payment-status"
                element={
                  <ProtectedRoute>
                    <AppLayout showHeader={false} showFooter={false}>
                      <PaymentStatusPage />
                    </AppLayout>
                  </ProtectedRoute>
                }
              />

              <Route
                path="/payment/success"
                element={
                  <ProtectedRoute>
                    <AppLayout showHeader={false} showFooter={false}>
                      <PaymentStatusPage />
                    </AppLayout>
                  </ProtectedRoute>
                }
              />

              <Route
                path="/payment/callback"
                element={
                  <ProtectedRoute>
                    <AppLayout showHeader={false} showFooter={false}>
                      <PaymentStatusPage />
                    </AppLayout>
                  </ProtectedRoute>
                }
              />

              <Route
                path="/payment/status"
                element={
                  <ProtectedRoute>
                    <AppLayout showHeader={false} showFooter={false}>
                      <PaymentStatusPage />
                    </AppLayout>
                  </ProtectedRoute>
                }
              />

              {/* Protected User Routes */}
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute>
                    <AppLayout>
                      <Dashboard />
                    </AppLayout>
                  </ProtectedRoute>
                }
              />

              {/* Mentor Dashboard */}
              <Route
                path="/mentor/dashboard"
                element={
                  <ProtectedRoute>
                    <AppLayout>
                      <MentorDashboard />
                    </AppLayout>
                  </ProtectedRoute>
                }
              />

              {/* Mentor Profile Form */}
              <Route
                path="/mentor/profile"
                element={
                  <ProtectedRoute>
                    <AppLayout>
                      <MentorProfileForm />
                    </AppLayout>
                  </ProtectedRoute>
                }
              />

              {/* Mentor Availability */}
              <Route
                path="/mentor/availability"
                element={
                  <ProtectedRoute>
                    <AppLayout>
                      <MentorAvailability />
                    </AppLayout>
                  </ProtectedRoute>
                }
              />

              {/* Mentor Earnings */}
              <Route
                path="/mentor/earnings"
                element={
                  <ProtectedRoute>
                    <AppLayout>
                      <MentorEarnings />
                    </AppLayout>
                  </ProtectedRoute>
                }
              />

              {/* Mentor Reviews */}
              <Route
                path="/mentor/reviews"
                element={
                  <ProtectedRoute>
                    <AppLayout>
                      <MentorReviews />
                    </AppLayout>
                  </ProtectedRoute>
                }
              />

              {/* Mentor Sessions */}
              <Route
                path="/mentor/sessions"
                element={
                  <ProtectedRoute>
                    <AppLayout>
                      <MentorSessions />
                    </AppLayout>
                  </ProtectedRoute>
                }
              />
              
              <Route 
                path="/profile" 
                element={
                  <ProtectedRoute>
                    <AppLayout>
                      <UserProfile />
                    </AppLayout>
                  </ProtectedRoute>
                } 
              />
              
              <Route 
                path="/sessions" 
                element={
                  <ProtectedRoute>
                    <AppLayout>
                      <MyAppointments />
                    </AppLayout>
                  </ProtectedRoute>
                } 
              />
              
              <Route
                path="/sessions/manage"
                element={
                  <ProtectedRoute>
                    <AppLayout>
                      <SessionManagement />
                    </AppLayout>
                  </ProtectedRoute>
                }
              />

              <Route
                path="/sessions/:sessionId/reschedule"
                element={
                  <ProtectedRoute>
                    <AppLayout>
                      <RescheduleSession />
                    </AppLayout>
                  </ProtectedRoute>
                }
              />

              <Route
                path="/reschedule-session/:sessionId"
                element={
                  <ProtectedRoute>
                    <AppLayout>
                      <RescheduleSession />
                    </AppLayout>
                  </ProtectedRoute>
                }
              />

              <Route
                path="/sessions/:sessionId/mentor-reschedule"
                element={
                  <ProtectedRoute>
                    <AppLayout>
                      <MentorRescheduleRequest />
                    </AppLayout>
                  </ProtectedRoute>
                }
              />

              <Route
                path="/meeting/:sessionId"
                element={
                  <ProtectedRoute>
                    <AuthLayout>
                      <MeetingRoom />
                    </AuthLayout>
                  </ProtectedRoute>
                }
              />

              {/* Session Notes History */}
              <Route
                path="/sessions/:sessionId/notes"
                element={
                  <ProtectedRoute>
                    <AppLayout>
                      <SessionNotesHistory />
                    </AppLayout>
                  </ProtectedRoute>
                }
              />

              {/* Mentor Application Routes */}
              <Route 
                path="/mentor/apply" 
                element={
                  <ProtectedRoute>
                    <AppLayout>
                      <MentorRegistration />
                    </AppLayout>
                  </ProtectedRoute>
                } 
              />

              {/* Legacy Route Redirects */}
              <Route path="/appointments" element={<Navigate to="/sessions" replace />} />
              <Route path="/oauth-success" element={<Navigate to="/oauth/callback" replace />} />
              <Route path="/mentor/register" element={<Navigate to="/mentor/apply" replace />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />

              {/* 404 Not Found */}
              <Route 
                path="*" 
                element={
                  <AppLayout>
                    <NotFound />
                  </AppLayout>
                } 
              />
            </Routes>

            {/* Global Toast Notifications */}
            <Toaster 
              position="top-right"
              toastOptions={{
                duration: 4000,
                style: {
                  background: '#ffffff',
                  color: '#374151',
                  border: '1px solid #e5e7eb',
                  borderRadius: '12px',
                  boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                },
                success: {
                  iconTheme: {
                    primary: '#10b981',
                    secondary: '#ffffff',
                  },
                },
                error: {
                  iconTheme: {
                    primary: '#ef4444',
                    secondary: '#ffffff',
                  },
                },
              }}
            />
          </div>
        </Router>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
