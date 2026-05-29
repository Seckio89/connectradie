import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';

export default function PaymentSuccess() {
  const navigate = useNavigate();

  // Browsers only let window.close() succeed on tabs opened via window.open().
  // After Stripe redirects the user back here in the same tab, close() is a
  // silent no-op — so we try it and fall through to navigating home.
  const handleDone = () => {
    window.close();
    setTimeout(() => navigate('/dashboard', { replace: true }), 150);
  };

  useEffect(() => {
    const timer = setTimeout(handleDone, 2500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 max-w-sm w-full text-center">
        <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-7 h-7 text-emerald-600" />
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Payment Successful</h1>
        <p className="text-sm text-gray-600 mb-4">
          Your payment has been processed. Redirecting you back to your dashboard…
        </p>
        <button
          onClick={handleDone}
          className="mt-2 inline-flex items-center px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-lg transition-colors"
        >
          Back to Dashboard
        </button>
      </div>
    </div>
  );
}
