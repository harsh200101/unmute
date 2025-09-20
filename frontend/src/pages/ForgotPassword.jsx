import React, { useState } from 'react';
import axios from 'axios';
import { toast } from 'react-hot-toast'; // Assuming you use this for notifications (from App.js)

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await axios.post('/api/auth/forgot-password', { email });
      toast.success(response.data.message || 'If email exists, a reset link was sent.');
    } catch (error) {
      toast.error('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container max-w-md mx-auto p-6">
      <h2 className="text-2xl font-bold mb-4">Forgot Password</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Enter your email"
          required
          className="w-full p-2 border rounded"
        />
        <button type="submit" disabled={loading} className="w-full p-2 bg-blue-600 text-white rounded">
          {loading ? 'Sending...' : 'Send Reset Link'}
        </button>
      </form>
    </div>
  );
}
