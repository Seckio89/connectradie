import { useNavigate } from 'react-router-dom';
import { MapPin } from 'lucide-react';

// A compact entry point to a job's geo/time tracking screen. Self-contained so
// it can drop into any job-detail surface without threading router props.
export default function ViewTrackingButton({ jobId, className }: { jobId: string; className?: string }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate(`/tracking/${jobId}`)}
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-secondary-200 text-sm font-medium text-secondary-700 hover:bg-secondary-50 transition-colors ${className ?? ''}`}
    >
      <MapPin className="w-4 h-4" /> View Tracking
    </button>
  );
}
