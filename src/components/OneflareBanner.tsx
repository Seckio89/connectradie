import { useState } from 'react';
import { X, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const STORAGE_KEY = 'oneflare-banner-dismissed';

export default function OneflareBanner() {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const navigate = useNavigate();

  if (dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      // localStorage unavailable — banner stays dismissed for this session only
    }
  };

  return (
    <div className="relative bg-emerald-600 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-4">
        <p className="text-sm sm:text-base font-medium flex-1 text-center sm:text-left">
          Coming from Oneflare? Welcome to ConnecTradie — same trusted tradies, better payment protection.
        </p>

        <button
          onClick={() => navigate('/register')}
          className="shrink-0 inline-flex items-center gap-1.5 px-4 py-1.5 bg-white text-emerald-700 text-sm font-semibold rounded-lg hover:bg-emerald-50 transition-colors"
        >
          Switch Now — Free
          <ArrowRight className="w-4 h-4" />
        </button>

        <button
          onClick={handleDismiss}
          aria-label="Dismiss banner"
          className="shrink-0 p-1 rounded-md hover:bg-emerald-500 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
