import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { API_URL, authHeader } from '../config';

function PaymentResult() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState('checking');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const paymentId = searchParams.get('payment_id');
  const redirectStatus = searchParams.get('status');

  useEffect(() => {
    if (!paymentId) {
      navigate('/dashboard');
      return;
    }

    if (redirectStatus === 'cancelled') {
      setStatus('cancelled');
      return;
    }

    // Confirm with PayMongo directly rather than trusting the redirect alone --
    // a user could land on the success URL without actually completing payment.
    fetch(`${API_URL}/payments/${paymentId}/sync`, { headers: authHeader() })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) {
          setError(data?.error || 'Could not confirm your payment.');
          setStatus('error');
          return;
        }
        setStatus(data.status === 'paid' ? 'paid' : 'pending');
      })
      .catch(() => {
        setError('Could not reach the server.');
        setStatus('error');
      });
  }, [paymentId, redirectStatus]);

  return (
    <div className="min-h-screen bg-brand-bg flex items-center justify-center px-6">
      <div className="w-full max-w-md bg-brand-surface rounded-2xl shadow-sm p-8 text-center">
        {status === 'checking' && <p className="text-brand-ink/70">Confirming your payment...</p>}

        {status === 'paid' && (
          <>
            <p className="text-3xl mb-2">✅</p>
            <p className="font-display text-lg font-semibold mb-1">Payment successful</p>
            <p className="text-sm text-brand-ink/60">Your session is now paid for.</p>
          </>
        )}

        {status === 'pending' && (
          <>
            <p className="text-3xl mb-2">⏳</p>
            <p className="font-display text-lg font-semibold mb-1">Still processing</p>
            <p className="text-sm text-brand-ink/60">
              We haven't received confirmation yet. If you completed payment, check back shortly.
            </p>
          </>
        )}

        {status === 'cancelled' && (
          <>
            <p className="text-3xl mb-2">✕</p>
            <p className="font-display text-lg font-semibold mb-1">Payment cancelled</p>
            <p className="text-sm text-brand-ink/60">You can try again from your dashboard.</p>
          </>
        )}

        {status === 'error' && (
          <>
            <p className="text-3xl mb-2">⚠️</p>
            <p className="font-display text-lg font-semibold mb-1">Something went wrong</p>
            <p className="text-sm text-brand-ink/60">{error}</p>
          </>
        )}

        <Link
          to="/dashboard"
          className="inline-block mt-6 bg-brand-primary text-white text-sm font-medium px-5 py-2.5 rounded-full"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}

export default PaymentResult;
