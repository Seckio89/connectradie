import { Link } from 'react-router-dom';
import { Loader2, Shield, Zap, FlaskConical, ToggleLeft, ToggleRight, Users } from 'lucide-react';

interface AdminToolsTabProps {
  trainingModeEnabled: boolean;
  trainingModeLoading: boolean;
  subscribedUsersCount: number;
  flashBoostLoading: boolean;
  onToggleTrainingMode: () => void;
  onResetSubscriptions: () => void;
  onRunFlashBoost: () => void;
}

export default function AdminToolsTab({
  trainingModeEnabled, trainingModeLoading, subscribedUsersCount,
  flashBoostLoading, onToggleTrainingMode, onResetSubscriptions, onRunFlashBoost,
}: AdminToolsTabProps) {
  return (
    <div className="space-y-6 p-6 md:p-8">
      <div>
        <h3 className="text-lg font-semibold text-ct-paper mb-2">Admin Tools</h3>
        <p className="text-sm text-ct-mute-2 mb-6">Administrative tools for testing and managing platform features.</p>
      </div>

      <div className={`rounded-ct-md p-6 border-2 transition-colors ${trainingModeEnabled ? 'bg-gradient-to-br from-ct-surface-2 to-ct-surface-2 border-ct-line' : 'bg-gradient-to-br from-ct-surface-2 to-ct-teal border-ct-line'}`}>
        <div className="flex items-start gap-4">
          <div className={`w-12 h-12 rounded-ct-md flex items-center justify-center flex-shrink-0 ${trainingModeEnabled ? 'bg-ct-surface-2' : 'bg-ct-line'}`}>
            <FlaskConical className={`w-6 h-6 ${trainingModeEnabled ? 'text-ct-mute-2' : 'text-ct-mute'}`} />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <h4 className="font-semibold text-ct-paper">Subscription Training Mode</h4>
              <button onClick={onToggleTrainingMode} disabled={trainingModeLoading} aria-label={trainingModeEnabled ? 'Disable training mode' : 'Enable training mode'} className="flex items-center gap-2 transition-colors">
                {trainingModeLoading ? <Loader2 className="w-6 h-6 animate-spin text-ct-mute" /> : trainingModeEnabled ? <ToggleRight className="w-10 h-10 text-ct-mute-2" /> : <ToggleLeft className="w-10 h-10 text-ct-mute" />}
              </button>
            </div>
            <p className="text-sm text-ct-mute-2 mb-4">When enabled, all tradies and clients will see a "Subscribe (Test Mode)" button that activates Pro features instantly without requiring Stripe payment.</p>
            <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold ${trainingModeEnabled ? 'bg-ct-surface-2 text-ct-mute-2 border border-ct-line' : 'bg-ct-surface-2 text-ct-mute-2 border border-ct-line'}`}>
              <span className={`w-2 h-2 rounded-full ${trainingModeEnabled ? 'bg-ct-surface-2 animate-pulse' : 'bg-ct-surface-2'}`} />
              {trainingModeEnabled ? 'Training Mode Active' : 'Training Mode Off'}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-gradient-to-br from-ct-surface-2 to-ct-surface-2 border border-ct-line rounded-ct-md p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-ct-surface-2 rounded-ct-md flex items-center justify-center flex-shrink-0">
            <Users className="w-6 h-6 text-ct-mute-2" />
          </div>
          <div className="flex-1">
            <h4 className="font-semibold text-ct-paper mb-1">Subscribed Users</h4>
            <p className="text-sm text-ct-mute-2 mb-4">Currently <span className="font-bold text-ct-paper">{subscribedUsersCount}</span> user{subscribedUsersCount !== 1 ? 's' : ''} have an active Pro subscription (including test mode activations).</p>
            <button onClick={onResetSubscriptions} disabled={trainingModeLoading || subscribedUsersCount === 0} className="inline-flex items-center gap-2 px-5 py-2.5 bg-ct-rose text-ct-ink font-semibold rounded-ct-md hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all min-h-[44px]">
              {trainingModeLoading ? (<><Loader2 className="w-4 h-4 animate-spin" />Resetting...</>) : 'Reset All Test Subscriptions'}
            </button>
            <p className="text-xs text-ct-mute mt-2">This will revert all users back to the free plan. Use after training sessions.</p>
          </div>
        </div>
      </div>

      <Link to="/admin/verifications" className="block bg-gradient-to-br from-ct-surface-2 to-ct-surface-2 border border-ct-line rounded-ct-md p-6 hover:border-ct-line transition-colors">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-ct-surface-2 rounded-ct-md flex items-center justify-center flex-shrink-0">
            <Shield className="w-6 h-6 text-ct-mute-2" />
          </div>
          <div className="flex-1">
            <h4 className="font-semibold text-ct-paper mb-1">Verification Queue</h4>
            <p className="text-sm text-ct-mute-2">Review pending tradie verifications, view uploaded documents and credentials, and approve or reject requests.</p>
          </div>
        </div>
      </Link>

      <div className="bg-gradient-to-br from-ct-teal to-ct-teal border border-ct-amber/[0.34] rounded-ct-md p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-ct-amber/[0.13] rounded-ct-md flex items-center justify-center flex-shrink-0">
            <Zap className="w-6 h-6 text-ct-amber" />
          </div>
          <div className="flex-1">
            <h4 className="font-semibold text-ct-paper mb-1">Flash Boost Algorithm</h4>
            <p className="text-sm text-ct-mute-2 mb-4">Finds all pending jobs created more than 2 hours ago that haven't been picked up yet, and marks them as Flash Deals with priority visibility for 1 hour to incentivize fast pickup.</p>
            <button onClick={onRunFlashBoost} disabled={flashBoostLoading} className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-ct-teal to-ct-teal text-ct-paper font-semibold rounded-ct-md hover:from-ct-teal hover:to-ct-teal disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg min-h-[44px]">
              {flashBoostLoading ? (<><Loader2 className="w-4 h-4 animate-spin" />Running...</>) : (<><Zap className="w-4 h-4" />Run Flash Boost Algorithm</>)}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
