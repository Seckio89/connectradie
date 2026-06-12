import { Bell, BellRing, Smartphone, MessageSquare } from 'lucide-react';

interface NotificationsTabProps {
  pushEnabled: boolean;
  pushPermission: string;
  notifSaving: boolean;
  onTogglePush: (enabled: boolean) => void;
  smsEnabled: boolean;
  onToggleSms: (enabled: boolean) => void;
  role?: 'tradie' | 'client' | 'admin';
}

export default function NotificationsTab({ pushEnabled, pushPermission, notifSaving, onTogglePush, smsEnabled, onToggleSms, role }: NotificationsTabProps) {
  const isClient = role === 'client';

  return (
    <div className="space-y-6 p-6 md:p-8">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Notification Preferences</h3>
        <p className="text-sm text-gray-600 mb-6">
          {isClient
            ? 'Control how you receive alerts about quotes, job updates, and scheduled services.'
            : 'Control how you receive alerts about new leads and urgent jobs.'}
        </p>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-200">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-secondary-100 rounded-lg flex items-center justify-center">
              <BellRing className="w-5 h-5 text-secondary-600" />
            </div>
            <div>
              <p className="font-medium text-gray-900">Web Push Alerts</p>
              <p className="text-sm text-gray-600">
                {isClient
                  ? 'Receive browser notifications for quotes and job updates'
                  : 'Receive browser notifications for urgent leads'}
              </p>
              <span className="inline-block mt-1 text-xs font-medium text-green-700 bg-green-50 px-3 py-1 rounded-full border border-green-200">Free</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onTogglePush(!pushEnabled)}
            disabled={notifSaving || pushPermission === 'denied' || pushPermission === 'unsupported'}
            aria-label={pushEnabled ? 'Disable push notifications' : 'Enable push notifications'}
            className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${pushEnabled ? 'bg-warm-500' : 'bg-gray-300'} ${(notifSaving || pushPermission === 'denied' || pushPermission === 'unsupported') ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${pushEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>

        {pushPermission === 'denied' && (
          <div className="flex items-center gap-2 px-4 py-2 bg-red-50 border border-red-200 rounded-lg">
            <Bell className="w-4 h-4 text-red-500 flex-shrink-0" />
            <p className="text-sm text-red-700">Notifications are blocked. To enable them, click the lock icon in your browser's address bar and allow notifications for this site.</p>
          </div>
        )}

        {pushPermission === 'unsupported' && (
          <div className="flex items-center gap-2 px-4 py-2 bg-warm-50 border border-warm-200 rounded-lg">
            <Bell className="w-4 h-4 text-warm-500 flex-shrink-0" />
            <p className="text-sm text-warm-700">Push notifications are not supported in your current browser. Try using Chrome, Firefox, or Safari for the best experience.</p>
          </div>
        )}

        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-200">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-warm-100 rounded-lg flex items-center justify-center">
              <Smartphone className="w-5 h-5 text-warm-600" />
            </div>
            <div>
              <p className="font-medium text-gray-900">
                {isClient ? 'SMS Alerts for Job Updates' : 'SMS Alerts for Urgent Jobs'}
              </p>
              <p className="text-sm text-gray-600">
                {isClient
                  ? 'Get a text when tradies quote or your job status changes'
                  : 'Get a text when urgent leads are posted nearby'}
              </p>
              <span className="inline-block mt-1 text-xs font-medium text-green-700 bg-green-50 px-3 py-1 rounded-full border border-green-200">Free</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onToggleSms(!smsEnabled)}
            disabled={notifSaving}
            aria-label={smsEnabled ? 'Disable SMS alerts' : 'Enable SMS alerts'}
            className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${smsEnabled ? 'bg-warm-500' : 'bg-gray-300'} ${notifSaving ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${smsEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>
      </div>

      <div className="bg-secondary-50 border border-secondary-200 rounded-xl p-4 mt-6">
        <div className="flex items-start gap-3">
          <MessageSquare className="w-5 h-5 text-secondary-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-secondary-900">How it works</p>
            <p className="text-sm text-secondary-800 mt-1">
              {isClient
                ? 'Get notified when tradies submit quotes on your jobs, when job milestones are completed, and when scheduled services are coming up. Web push is free for all users.'
                : 'When a client posts an urgent job marked with Flash Boost, all tradies with matching notification preferences in that area are alerted instantly. Web push is free for all users. SMS alerts require a Pro subscription.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
