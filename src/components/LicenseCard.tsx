import { Shield, Calendar, MapPin, CheckCircle, AlertCircle, Clock, XCircle, BadgeCheck } from 'lucide-react';

interface LicenseCardProps {
  licenseNumber: string;
  licenseState: string;
  expiryDate: string;
  verified: boolean;
  /** Raw `profiles.verification_status` (profiles_verification_status_check
   *  restricts it to unverified|pending|verified|rejected|expired). */
  verificationStatus?: string | null;
  holderName: string;
  businessName?: string;
  tradeType?: string;
  apiVerified?: boolean;
  licenseClass?: string;
}

export default function LicenseCard({
  licenseNumber,
  licenseState,
  expiryDate,
  verified,
  verificationStatus,
  holderName,
  businessName,
  tradeType,
  apiVerified = false,
  licenseClass,
}: LicenseCardProps) {
  const expiry = new Date(expiryDate);
  const now = new Date();
  const daysUntilExpiry = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  const isExpired = expiry < now;
  const isExpiringSoon = daysUntilExpiry < 30 && daysUntilExpiry > 0;

  const effectiveStatus = verificationStatus || (verified ? 'verified' : 'pending');

  const renderStatusBadge = () => {
    if (isExpired) {
      return (
        <div className="flex items-center gap-1 bg-ct-rose px-3 py-1 rounded-full text-xs font-medium">
          <AlertCircle className="h-3 w-3" />
          <span>Expired</span>
        </div>
      );
    }

    switch (effectiveStatus) {
      case 'verified':
        return (
          <div className="flex items-center gap-1 bg-ct-teal px-3 py-1 rounded-full text-xs font-medium">
            <CheckCircle className="h-3 w-3" />
            <span>Verified</span>
          </div>
        );
      case 'rejected':
        return (
          <div className="flex items-center gap-1 bg-ct-rose px-3 py-1 rounded-full text-xs font-medium">
            <XCircle className="h-3 w-3" />
            <span>Rejected</span>
          </div>
        );
      case 'pending':
        return (
          <div className="flex items-center gap-1 bg-ct-teal px-3 py-1 rounded-full text-xs font-medium">
            <Clock className="h-3 w-3" />
            <span>Pending Admin Approval</span>
          </div>
        );
      default:
        return (
          <div className="flex items-center gap-1 bg-ct-surface-2 px-3 py-1 rounded-full text-xs font-medium">
            <AlertCircle className="h-3 w-3" />
            <span>Unverified</span>
          </div>
        );
    }
  };

  return (
    <div className="relative bg-gradient-to-br from-ct-surface via-ct-surface-2 to-ct-ink rounded-ct-md p-6 shadow-md text-ct-ink overflow-hidden">
      <div className="absolute top-0 right-0 w-64 h-64 bg-ct-surface-2 opacity-10 rounded-full -mr-32 -mt-32"></div>
      <div className="absolute bottom-0 left-0 w-48 h-48 bg-ct-teal opacity-10 rounded-full -ml-24 -mb-24"></div>

      <div className="relative z-10">
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="bg-ct-teal p-3 rounded-ct-sm">
              <Shield className="h-6 w-6" />
            </div>
            <div>
              <div className="text-xs text-ct-mute uppercase tracking-wide">Trade License</div>
              <div className="text-lg font-bold">{licenseState}</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {renderStatusBadge()}
            {apiVerified && (
              <div className="flex items-center gap-1 bg-ct-teal px-3 py-1 rounded-full text-xs font-medium">
                <BadgeCheck className="h-3 w-3" />
                <span>API Verified</span>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4 mb-6">
          <div>
            <div className="text-xs text-ct-mute uppercase tracking-wide mb-1">License Holder</div>
            <div className="text-xl font-bold">{holderName}</div>
          </div>

          {businessName && (
            <div>
              <div className="text-xs text-ct-mute uppercase tracking-wide mb-1">Business Name</div>
              <div className="text-sm font-medium">{businessName}</div>
            </div>
          )}

          {tradeType && (
            <div>
              <div className="text-xs text-ct-mute uppercase tracking-wide mb-1">Trade Type</div>
              <div className="text-sm font-medium">{tradeType}</div>
            </div>
          )}

          {licenseClass && (
            <div>
              <div className="text-xs text-ct-mute uppercase tracking-wide mb-1">License Class</div>
              <div className="text-sm font-medium">{licenseClass}</div>
            </div>
          )}
        </div>

        <div className="border-t border-ct-line pt-4 grid grid-cols-2 gap-4">
          <div>
            <div className="text-xs text-ct-mute uppercase tracking-wide mb-1">License Number</div>
            <div className="text-lg font-mono font-bold tracking-wider">{licenseNumber}</div>
          </div>

          <div>
            <div className="flex items-center gap-1 text-xs text-ct-mute uppercase tracking-wide mb-1">
              <Calendar className="h-3 w-3" />
              <span>Expiry Date</span>
            </div>
            <div className={`text-lg font-bold ${
              isExpired ? 'text-ct-rose' :
              isExpiringSoon ? 'text-ct-amber' :
              'text-ct-teal'
            }`}>
              {expiry.toLocaleDateString('en-AU')}
            </div>
            {isExpiringSoon && !isExpired && (
              <div className="text-xs text-ct-amber mt-1">
                Expires in {daysUntilExpiry} days
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 mt-4 text-xs text-ct-mute">
          <MapPin className="h-3 w-3" />
          <span>{apiVerified ? 'Verified by' : 'Issued by'} {licenseState} Licensing Authority</span>
        </div>
      </div>
    </div>
  );
}
