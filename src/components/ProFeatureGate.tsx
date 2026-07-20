import { useState } from 'react';
import { Crown, Lock } from 'lucide-react';
import { type ProFeature, getFeatureLabel, getFeatureDescription, isPlatformAdmin } from '../lib/subscription';
import { useAuth } from '../contexts/AuthContext';
import SubscriptionModal from './SubscriptionModal';

interface ProFeatureGateProps {
  feature: ProFeature;
  isProUser: boolean;
  children: React.ReactNode;
  className?: string;
}

export default function ProFeatureGate({ feature, isProUser, children, className = '' }: ProFeatureGateProps) {
  const { profile } = useAuth();
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);

  // The platform owner/admin passes every gate regardless of the caller's prop.
  if (isProUser || isPlatformAdmin(profile)) {
    return <>{children}</>;
  }

  return (
    <>
      <div className={`relative group ${className}`}>
        <div className="pointer-events-none opacity-30 select-none blur-[1px] grayscale">
          {children}
        </div>
        <button
          onClick={() => setShowSubscriptionModal(true)}
          className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-white/80 via-white/90 to-white/80 backdrop-blur-[2px] rounded-xl border-2 border-dashed border-gray-300 hover:border-warm-400 transition-all cursor-pointer group/gate min-h-[44px]"
        >
          <div className="flex flex-col items-center gap-3 px-6 py-4">
            <div className="w-14 h-14 bg-gradient-to-br from-warm-100 to-warm-200 rounded-xl flex items-center justify-center shadow-sm group-hover/gate:shadow-md transition-shadow">
              <Lock className="w-6 h-6 text-warm-600" />
            </div>
            <div className="text-center">
              <p className="text-base font-bold text-gray-900">{getFeatureLabel(feature)}</p>
              <p className="text-sm text-gray-600 mt-1 max-w-[240px]">{getFeatureDescription(feature)}</p>
            </div>
            <div className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-warm-500 to-warm-600 text-white text-sm font-bold rounded-xl shadow-sm group-hover/gate:shadow-md transition-all min-h-[44px]">
              <Lock className="w-4 h-4" />
              Upgrade to Unlock
            </div>
          </div>
        </button>
      </div>

      <SubscriptionModal
        isOpen={showSubscriptionModal}
        onClose={() => setShowSubscriptionModal(false)}
      />
    </>
  );
}

interface ProBadgeButtonProps {
  onClick: () => void;
  label?: string;
  className?: string;
}

export function ProBadgeButton({ onClick, label = 'Pro', className = '' }: ProBadgeButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-2 py-0.5 bg-gradient-to-r from-warm-500 to-warm-600 text-white text-xs font-bold rounded-md shadow-sm hover:shadow-md transition-all ${className}`}
    >
      <Crown className="w-2.5 h-2.5" />
      {label}
    </button>
  );
}

interface UpgradeBannerProps {
  message: string;
  remainingCount?: number;
  totalCount?: number;
  onUpgrade: () => void;
}

export function UpgradeBanner({ message, remainingCount, totalCount, onUpgrade }: UpgradeBannerProps) {
  return (
    <div className="bg-gradient-to-r from-warm-50 to-warm-50 border border-warm-200 rounded-xl p-4 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-warm-100 rounded-lg flex items-center justify-center flex-shrink-0">
          <Crown className="w-5 h-5 text-warm-600" />
        </div>
        <div>
          <p className="text-sm font-medium text-warm-900">{message}</p>
          {remainingCount !== undefined && totalCount !== undefined && (
            <div className="flex items-center gap-2 mt-1">
              <div className="w-24 h-1.5 bg-warm-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-warm-500 rounded-full transition-all"
                  style={{ width: `${((totalCount - remainingCount) / totalCount) * 100}%` }}
                />
              </div>
              <span className="text-xs text-warm-700 font-medium">
                {remainingCount} of {totalCount} left
              </span>
            </div>
          )}
        </div>
      </div>
      <button
        onClick={onUpgrade}
        className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-warm-500 to-warm-600 text-white text-sm font-semibold rounded-lg shadow-sm hover:shadow-md transition-all"
      >
        <Crown className="w-4 h-4" />
        Upgrade
      </button>
    </div>
  );
}

interface ProLockInlineProps {
  feature: ProFeature;
  onUpgrade: () => void;
}

export function ProLockInline({ feature, onUpgrade }: ProLockInlineProps) {
  return (
    <button
      onClick={onUpgrade}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-warm-50 border border-warm-200 text-warm-700 text-xs font-medium rounded-lg hover:bg-warm-100 transition-colors"
    >
      <Lock className="w-3 h-3" />
      {getFeatureLabel(feature)}
      <Crown className="w-3 h-3 text-warm-500" />
    </button>
  );
}
