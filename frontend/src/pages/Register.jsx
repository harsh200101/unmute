import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { SignUpAuthComponent } from '../components/ui/sign-up.jsx';
import Logo from '../components/Logo.jsx';
import { API_BASE_URL } from '../api/client.js';

/* -------------------------------------------------------------------------- */
/* Sign-up screen.                                                            */
/* Thin wrapper around the glass four-step <SignUpAuthComponent>.             */
/*   - name → email → password → confirmPassword → success modal.             */
/*   - Wires final-step submit to authApi.register().                         */
/*   - Hands the user to /verify-email after the success modal has landed.    */
/* -------------------------------------------------------------------------- */
export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const onRegister = async ({ full_name, email, password }) => {
    await register({ full_name, email, password });
    sessionStorage.setItem('unmute_pending_email', email);
  };

  const onSuccess = () => {
    const email = sessionStorage.getItem('unmute_pending_email') || '';
    sessionStorage.removeItem('unmute_pending_email');
    navigate('/verify-email?email=' + encodeURIComponent(email), { replace: true });
  };

  const onGoogleSignIn = () => {
    window.location.href = `${API_BASE_URL}/auth/google?next=/dashboard`;
  };

  return (
    <SignUpAuthComponent
      brandName="unmute"
      logo={<Logo size={28} />}
      onRegister={onRegister}
      onGoogleSignIn={onGoogleSignIn}
      onSuccess={onSuccess}
      onSignIn={() => navigate('/login')}
    />
  );
}
