import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import ProtectedRoute, { PublicOnly } from './components/ProtectedRoute.jsx';
import { PageSpinner } from './components/ui/Spinner.jsx';

import Landing from './pages/Landing.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import VerifyEmail from './pages/VerifyEmail.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import Dashboard from './pages/Dashboard.jsx';
import MentorList from './pages/MentorList.jsx';
import MentorProfile from './pages/MentorProfile.jsx';
import MentorApply from './pages/MentorApply.jsx';
import MentorAvailability from './pages/MentorAvailability.jsx';
import Book from './pages/Book.jsx';
import MyBookings from './pages/MyBookings.jsx';
import BookingDetail from './pages/BookingDetail.jsx';
import Wallet from './pages/Wallet.jsx';
import PhonepeStub from './pages/PhonepeStub.jsx';
// Lazy-load: pulls Agora SDK (~1.5 MB) only when entering a meeting
const MeetingRoom = lazy(() => import('./pages/MeetingRoom.jsx'));
import NotFound from './pages/NotFound.jsx';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
        <Route path="/register" element={<PublicOnly><Register /></PublicOnly>} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/forgot-password" element={<PublicOnly><ForgotPassword /></PublicOnly>} />
        <Route path="/reset-password" element={<PublicOnly><ResetPassword /></PublicOnly>} />

        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />

        <Route path="/mentors" element={<MentorList />} />
        <Route path="/mentors/:uuid" element={<MentorProfile />} />
        <Route path="/mentor/apply" element={<ProtectedRoute><MentorApply /></ProtectedRoute>} />
        <Route path="/mentor/availability" element={<ProtectedRoute role="mentor"><MentorAvailability /></ProtectedRoute>} />

        <Route path="/book/:uuid" element={<ProtectedRoute><Book /></ProtectedRoute>} />
        <Route path="/bookings" element={<ProtectedRoute><MyBookings /></ProtectedRoute>} />
        <Route path="/bookings/:uuid" element={<ProtectedRoute><BookingDetail /></ProtectedRoute>} />

        <Route path="/wallet" element={<ProtectedRoute><Wallet /></ProtectedRoute>} />
        <Route path="/dev/phonepe-stub" element={<PhonepeStub />} />

        <Route path="*" element={<NotFound />} />
      </Route>

      {/* Meeting room: no Layout/header — uses its own full-screen dark UI */}
      <Route
        path="/meetings/:uuid"
        element={
          <ProtectedRoute>
            <Suspense fallback={<PageSpinner />}>
              <MeetingRoom />
            </Suspense>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
