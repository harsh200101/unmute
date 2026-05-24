import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../auth/AuthContext.jsx';
import { SignInAuthComponent } from '../components/ui/sign-in.jsx';
import Logo from '../components/Logo.jsx';
import { API_BASE_URL } from '../api/client.js';

/* -------------------------------------------------------------------------- */
/* Sign-in screen.                                                            */
/* Thin wrapper around the glass two-step <SignInAuthComponent>.              */
/*   - email → password → success modal → navigate to `next`.                 */
/*   - Google OAuth handoff preserves the `next` query param.                 */
/*   - Throws on bad creds; component surfaces the backend message in modal.  */
/* -------------------------------------------------------------------------- */
export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next') || '/dashboard';

  const onLogin = async ({ email, password }) => {
    await login(email, password);
  };

  const onSuccess = () => {
    toast.success('Welcome back');
    navigate(next, { replace: true });
  };

  const onGoogleSignIn = () => {
    window.location.href = `${API_BASE_URL}/auth/google?next=${encodeURIComponent(next)}`;
  };

  const onForgotPassword = () => {
    navigate('/forgot-password');
  };

  return (
    <SignInAuthComponent
      brandName="unmute"
      logo={<Logo size={28} />}
      onLogin={onLogin}
      onGoogleSignIn={onGoogleSignIn}
      onSuccess={onSuccess}
      onForgotPassword={onForgotPassword}
      onCreateAccount={() => navigate('/register')}
    />
  );
}
