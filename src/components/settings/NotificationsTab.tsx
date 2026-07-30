import { Bell, BellRing, Smartphone, MessageSquare, MapPin } from 'lucide-react';

interface NotificationsTabProps {
  pushEnabled: boolean;
  pushPermission: string;
  notifSaving: boolean;
  onTogglePush: (enabled: boolean) => void;
  smsEnabled: boolean;
  onToggleSms: (enabled: boolean) => void;
  siteArrivalEnabled: boolean;
  onToggleSiteArrival: (enabled: boolean) => void;
  role?: 'tradie' | 'client' | 'admin';
}

export default function NotificationsTab({ pushEnabled, pushPermission, notifSaving, onTogglePush, smsEnabled, onToggleSms, siteArrivalEnabled, onToggleSiteArrival, role }: NotificationsTabProps) {
  const isClient = role === 'client';

  return (
    <div className="space-y-6 p-6 md:p-8">
      <div>
        <h3 className="text-lg font-semibold text-ct-paper mb-1">Notification Preferences</h3>
        <p className="text-sm text-ct-mute-2 mb-6">
          {isClient
            ? 'Control how you receive alerts about quotes, job updates, and scheduled services.'
            : 'Control how you receive alerts about new leads and urgent jobs.'}
        </p>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between p-4 bg-ct-surface-2 rounded-ct-md border border-ct-line">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-ct-surface-2 rounded-ct-sm flex items-center justify-center">
              <BellRing className="w-5 h-5 text-ct-mute-2" />
            </div>
            <div>
              <p className="font-medium text-ct-paper">Web Push Alerts</p>
              <p className="text-sm text-ct-mute-2">
                {isClient
                  ? 'Receive browser notifications for quotes and job updates'
                  : 'Receive browser notifications for urgent leads'}
              </p>
              <span className="inline-block mt-1 text-xs font-medium text-ct-teal bg-ct-teal/[0.14] px-3 py-1 rounded-full border border-ct-teal/30">Free</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onTogglePush(!pushEnabled)}
            disabled={notifSaving || pushPermission === 'denied' || pushPermission === 'unsupported'}
            role="switch"
            aria-checked={pushEnabled}
            aria-label={pushEnabled ? 'Disable push notifications' : 'Enable push notifications'}
            className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-ct-teal focus:ring-offset-2 ${pushEnabled ? 'bg-ct-teal' : 'bg-ct-line'} ${(notifSaving || pushPermission === 'denied' || pushPermission === 'unsupported') ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <span className={`inline-block h-5 w-5 transform rounded-full bg-ct-surface shadow-sm transition-transform ${pushEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>

        {pushPermission === 'denied' && (
          <div className="flex items-center gap-2 px-4 py-2 bg-ct-rose/[0.13] border border-ct-rose/[0.34] rounded-ct-sm">
            <Bell className="w-4 h-4 text-ct-rose flex-shrink-0" />
            <p className="text-sm text-ct-rose">Notifications are blocked. To enable them, click the lock icon in your browser's address bar and allow notifications for this site.</p>
          </div>
        )}

        {pushPermission === 'unsupported' && (
          <div className="flex items-center gap-2 px-4 py-2 bg-ct-amber/[0.13] border border-ct-amber/[0.34] rounded-ct-sm">
            <Bell className="w-4 h-4 text-ct-teal flex-shrink-0" />
            <p className="text-sm text-ct-amber">Push notifications are not supported in your current browser. Try using Chrome, Firefox, or Safari for the best experience.</p>
          </div>
        )}

        <div className="flex items-center justify-between p-4 bg-ct-surface-2 rounded-ct-md border border-ct-line">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-ct-amber/[0.13] rounded-ct-sm flex items-center justify-center">
              <Smartphone className="w-5 h-5 text-ct-amber" />
            </div>
            <div>
              <p className="font-medium text-ct-paper">
                {isClient ? 'SMS Alerts for Job Updates' : 'SMS Alerts for Urgent Jobs'}
              </p>
              <p className="text-sm text-ct-mute-2">
                {isClient
                  ? 'Get a text when tradies quote or your job status changes'
                  : 'Get a text when urgent leads are posted nearby'}
              </p>
              <span className="inline-block mt-1 text-xs font-medium text-ct-teal bg-ct-teal/[0.14] px-3 py-1 rounded-full border border-ct-teal/30">Free</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onToggleSms(!smsEnabled)}
            disabled={notifSaving}
            role="switch"
            aria-checked={smsEnabled}
            aria-label={smsEnabled ? 'Disable SMS alerts' : 'Enable SMS alerts'}
            className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-ct-teal focus:ring-offset-2 ${smsEnabled ? 'bg-ct-teal' : 'bg-ct-line'} ${notifSaving ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <span className={`inline-block h-5 w-5 transform rounded-full bg-ct-surface shadow-sm transition-transform ${smsEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>

        {/* Job-site arrival (geofence) alerts */}
        <div className="flex items-center justify-between p-4 bg-ct-surface-2 rounded-ct-md border border-ct-line">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-ct-surface-2 rounded-ct-sm flex items-center justify-center flex-shrink-0">
              <MapPin className="w-5 h-5 text-ct-mute-2" />
            </div>
            <div>
              <p className="font-medium text-ct-paper">Job-site arrival alerts</p>
              <p className="text-sm text-ct-mute-2">
                {isClient
                  ? 'Get notified when your tradie arrives on site'
                  : 'Get notified when a worker arrives at one of your job sites'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onToggleSiteArrival(!siteArrivalEnabled)}
            disabled={notifSaving}
            role="switch"
            aria-checked={siteArrivalEnabled}
            aria-label={siteArrivalEnabled ? 'Disable job-site arrival alerts' : 'Enable job-site arrival alerts'}
            className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-ct-teal focus:ring-offset-2 ${siteArrivalEnabled ? 'bg-ct-teal' : 'bg-ct-line'} ${notifSaving ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <span className={`inline-block h-5 w-5 transform rounded-full bg-ct-surface shadow-sm transition-transform ${siteArrivalEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>
      </div>

      <div className="bg-ct-surface-2 border border-ct-line rounded-ct-md p-4 mt-6">
        <div className="flex items-start gap-3">
          <MessageSquare className="w-5 h-5 text-ct-mute-2 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-ct-paper">How it works</p>
            <p className="text-sm text-ct-mute-2 mt-1">
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
