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
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Admin Tools</h3>
        <p className="text-sm text-gray-600 mb-6">Administrative tools for testing and managing platform features.</p>
      </div>

      <div className={`rounded-xl p-6 border-2 transition-colors ${trainingModeEnabled ? 'bg-gradient-to-br from-secondary-50 to-secondary-50 border-secondary-300' : 'bg-gradient-to-br from-gray-50 to-primary-50 border-gray-200'}`}>
        <div className="flex items-start gap-4">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${trainingModeEnabled ? 'bg-secondary-100' : 'bg-gray-200'}`}>
            <FlaskConical className={`w-6 h-6 ${trainingModeEnabled ? 'text-secondary-600' : 'text-gray-500'}`} />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <h4 className="font-semibold text-gray-900">Subscription Training Mode</h4>
              <button onClick={onToggleTrainingMode} disabled={trainingModeLoading} aria-label={trainingModeEnabled ? 'Disable training mode' : 'Enable training mode'} className="flex items-center gap-2 transition-colors">
                {trainingModeLoading ? <Loader2 className="w-6 h-6 animate-spin text-gray-400" /> : trainingModeEnabled ? <ToggleRight className="w-10 h-10 text-secondary-600" /> : <ToggleLeft className="w-10 h-10 text-gray-400" />}
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-4">When enabled, all tradies and clients will see a "Subscribe (Test Mode)" button that activates Pro features instantly without requiring Stripe payment.</p>
            <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold ${trainingModeEnabled ? 'bg-secondary-100 text-secondary-800 border border-secondary-200' : 'bg-gray-100 text-gray-600 border border-gray-200'}`}>
              <span className={`w-2 h-2 rounded-full ${trainingModeEnabled ? 'bg-secondary-500 animate-pulse' : 'bg-gray-400'}`} />
              {trainingModeEnabled ? 'Training Mode Active' : 'Training Mode Off'}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-gradient-to-br from-secondary-50 to-secondary-50 border border-secondary-200 rounded-xl p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-secondary-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <Users className="w-6 h-6 text-secondary-600" />
          </div>
          <div className="flex-1">
            <h4 className="font-semibold text-gray-900 mb-1">Subscribed Users</h4>
            <p className="text-sm text-gray-600 mb-4">Currently <span className="font-bold text-gray-900">{subscribedUsersCount}</span> user{subscribedUsersCount !== 1 ? 's' : ''} have an active Pro subscription (including test mode activations).</p>
            <button onClick={onResetSubscriptions} disabled={trainingModeLoading || subscribedUsersCount === 0} className="inline-flex items-center gap-2 px-5 py-2.5 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all min-h-[44px]">
              {trainingModeLoading ? (<><Loader2 className="w-4 h-4 animate-spin" />Resetting...</>) : 'Reset All Test Subscriptions'}
            </button>
            <p className="text-xs text-gray-500 mt-2">This will revert all users back to the free plan. Use after training sessions.</p>
          </div>
        </div>
      </div>

      <Link to="/admin/verifications" className="block bg-gradient-to-br from-secondary-50 to-secondary-50 border border-secondary-200 rounded-xl p-6 hover:border-secondary-300 transition-colors">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-secondary-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <Shield className="w-6 h-6 text-secondary-600" />
          </div>
          <div className="flex-1">
            <h4 className="font-semibold text-gray-900 mb-1">Verification Queue</h4>
            <p className="text-sm text-gray-600">Review pending tradie verifications, view uploaded documents and credentials, and approve or reject requests.</p>
          </div>
        </div>
      </Link>

      <div className="bg-gradient-to-br from-warm-50 to-warm-50 border border-warm-200 rounded-xl p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-warm-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <Zap className="w-6 h-6 text-warm-600" />
          </div>
          <div className="flex-1">
            <h4 className="font-semibold text-gray-900 mb-1">Flash Boost Algorithm</h4>
            <p className="text-sm text-gray-600 mb-4">Finds all pending jobs created more than 2 hours ago that haven't been picked up yet, and marks them as Flash Deals with priority visibility for 1 hour to incentivize fast pickup.</p>
            <button onClick={onRunFlashBoost} disabled={flashBoostLoading} className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-warm-500 to-warm-500 text-white font-semibold rounded-xl hover:from-warm-600 hover:to-warm-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg min-h-[44px]">
              {flashBoostLoading ? (<><Loader2 className="w-4 h-4 animate-spin" />Running...</>) : (<><Zap className="w-4 h-4" />Run Flash Boost Algorithm</>)}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
