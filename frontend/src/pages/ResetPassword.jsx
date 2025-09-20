import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'react-hot-toast';

export default function ResetPassword() {
  const location = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);
  const token = params.get('token');
  const id = params.get('id');

  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);

  if (!token || !id) {
    return <p className="text-red-500">Invalid reset link. Please request a new one.</p>;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await axios.post('/api/auth/reset-password', { token, id, newPassword });
      toast.success(response.data.message || 'Password reset successful!');
      setTimeout(() => navigate('/login'), 2000); // Redirect to login after 2s
    } catch (error) {
      toast.error('Invalid or expired link. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container max-w-md mx-auto p-6">
      <h2 className="text-2xl font-bold mb-4">Reset Password</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="Enter new password"
          required
          className="w-full p-2 border rounded"
        />
        <button type="submit" disabled={loading} className="w-full p-2 bg-blue-600 text-white rounded">
          {loading ? 'Resetting...' : 'Reset Password'}
        </button>
      </form>
    </div>
  );
}
