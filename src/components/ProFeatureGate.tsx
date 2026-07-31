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
          className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-ct-ink/80 via-ct-ink/90 to-ct-ink/80 backdrop-blur-[2px] rounded-ct-md border-2 border-dashed border-ct-line hover:border-ct-teal transition-all cursor-pointer group/gate min-h-[44px]"
        >
          <div className="flex flex-col items-center gap-3 px-6 py-4">
            <div className="w-14 h-14 bg-gradient-to-br from-ct-teal to-ct-teal rounded-ct-md flex items-center justify-center shadow-sm group-hover/gate:shadow-md transition-shadow">
              <Lock className="w-6 h-6 text-ct-amber" />
            </div>
            <div className="text-center">
              <p className="text-base font-bold text-ct-paper">{getFeatureLabel(feature)}</p>
              <p className="text-sm text-ct-mute-2 mt-1 max-w-[240px]">{getFeatureDescription(feature)}</p>
            </div>
            <div className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-ct-teal to-ct-teal text-ct-ink text-sm font-bold rounded-ct-md shadow-sm group-hover/gate:shadow-md transition-all min-h-[44px]">
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
      className={`inline-flex items-center gap-1 px-2 py-0.5 bg-gradient-to-r from-ct-teal to-ct-teal text-ct-ink text-xs font-bold rounded-ct-xs shadow-sm hover:shadow-md transition-all ${className}`}
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
    <div className="bg-gradient-to-r from-ct-teal to-ct-teal border border-ct-amber/[0.34] rounded-ct-md p-4 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-ct-amber/[0.13] rounded-ct-sm flex items-center justify-center flex-shrink-0">
          <Crown className="w-5 h-5 text-ct-amber" />
        </div>
        <div>
          <p className="text-sm font-medium text-ct-teal">{message}</p>
          {remainingCount !== undefined && totalCount !== undefined && (
            <div className="flex items-center gap-2 mt-1">
              <div className="w-24 h-1.5 bg-ct-teal/[0.14] rounded-full overflow-hidden">
                <div
                  className="h-full bg-ct-teal rounded-full transition-all"
                  style={{ width: `${((totalCount - remainingCount) / totalCount) * 100}%` }}
                />
              </div>
              <span className="text-xs text-ct-amber font-medium">
                {remainingCount} of {totalCount} left
              </span>
            </div>
          )}
        </div>
      </div>
      <button
        onClick={onUpgrade}
        className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-ct-teal to-ct-teal text-ct-ink text-sm font-semibold rounded-ct-sm shadow-sm hover:shadow-md transition-all"
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
      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-ct-amber/[0.13] border border-ct-amber/[0.34] text-ct-amber text-xs font-medium rounded-ct-sm hover:bg-ct-amber/[0.13] transition-colors"
    >
      <Lock className="w-3 h-3" />
      {getFeatureLabel(feature)}
      <Crown className="w-3 h-3 text-ct-teal" />
    </button>
  );
}
