import { useMemo } from 'react';
import {
  FileText,
  MessageSquare,
  ThumbsUp,
  DollarSign,
  Wrench,
  CheckCircle2,
  Star,
  XCircle,
} from 'lucide-react';

interface JobTimelineProps {
  currentStatus: string;
  jobId?: string;
  compact?: boolean;
  className?: string;
}

interface TimelineStep {
  key: string;
  label: string;
  icon: React.ReactNode;
  statusMatch: string[];
}

const TIMELINE_STEPS: TimelineStep[] = [
  {
    key: 'posted',
    label: 'Posted',
    icon: <FileText className="w-4 h-4" />,
    statusMatch: ['pending'],
  },
  {
    key: 'quoted',
    label: 'Quoted',
    icon: <MessageSquare className="w-4 h-4" />,
    statusMatch: ['quoted'],
  },
  {
    key: 'accepted',
    label: 'Accepted',
    icon: <ThumbsUp className="w-4 h-4" />,
    statusMatch: ['accepted'],
  },
  {
    key: 'funded',
    label: 'Funded',
    icon: <DollarSign className="w-4 h-4" />,
    statusMatch: ['funded'],
  },
  {
    key: 'in_progress',
    label: 'In Progress',
    icon: <Wrench className="w-4 h-4" />,
    statusMatch: ['in_progress'],
  },
  {
    key: 'completed',
    label: 'Completed',
    icon: <CheckCircle2 className="w-4 h-4" />,
    statusMatch: ['completed'],
  },
  {
    key: 'reviewed',
    label: 'Reviewed',
    icon: <Star className="w-4 h-4" />,
    statusMatch: ['reviewed'],
  },
];

const CANCELLED_STATUSES = ['cancelled', 'declined'];

function getActiveStepIndex(status: string): number {
  const index = TIMELINE_STEPS.findIndex((step) =>
    step.statusMatch.includes(status)
  );
  return index >= 0 ? index : 0;
}

function CompactTimeline({
  currentStatus,
  className = '',
}: {
  currentStatus: string;
  className?: string;
}) {
  const isCancelled = CANCELLED_STATUSES.includes(currentStatus);
  const activeIndex = getActiveStepIndex(currentStatus);

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      {TIMELINE_STEPS.map((step, index) => {
        let colorClass = 'bg-gray-300';
        let title = step.label;

        if (isCancelled) {
          colorClass = index === 0 ? 'bg-red-500' : 'bg-gray-300';
          title = index === 0 ? `${currentStatus.charAt(0).toUpperCase() + currentStatus.slice(1)}` : step.label;
        } else if (index < activeIndex) {
          colorClass = 'bg-green-500';
          title = `${step.label} (completed)`;
        } else if (index === activeIndex) {
          colorClass = 'bg-blue-500';
          title = `${step.label} (current)`;
        }

        return (
          <div
            key={step.key}
            className={`w-2 h-2 rounded-full ${colorClass} transition-colors`}
            title={title}
          />
        );
      })}
      {isCancelled && (
        <div
          className="w-2 h-2 rounded-full bg-red-500"
          title={currentStatus.charAt(0).toUpperCase() + currentStatus.slice(1)}
        />
      )}
    </div>
  );
}

function FullTimeline({
  currentStatus,
  className = '',
}: {
  currentStatus: string;
  className?: string;
}) {
  const isCancelled = CANCELLED_STATUSES.includes(currentStatus);
  const activeIndex = getActiveStepIndex(currentStatus);

  return (
    <div className={`w-full ${className}`}>
      {isCancelled && (
        <div className="flex items-center justify-center gap-2 mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
          <XCircle className="w-4 h-4 text-red-500" />
          <span className="text-sm font-medium text-red-700">
            Job {currentStatus.charAt(0).toUpperCase() + currentStatus.slice(1)}
          </span>
        </div>
      )}

      <div className="flex items-start justify-between">
        {TIMELINE_STEPS.map((step, index) => {
          let dotColor = 'bg-gray-300 border-gray-300';
          let textColor = 'text-gray-400';
          let iconColor = 'text-gray-400';
          let lineColor = 'bg-gray-300';

          if (isCancelled) {
            dotColor = 'bg-gray-300 border-gray-300';
            textColor = 'text-gray-400';
            iconColor = 'text-gray-400';
          } else if (index < activeIndex) {
            dotColor = 'bg-green-500 border-green-500';
            textColor = 'text-green-700';
            iconColor = 'text-white';
            lineColor = 'bg-green-500';
          } else if (index === activeIndex) {
            dotColor = 'bg-blue-500 border-blue-500';
            textColor = 'text-blue-700';
            iconColor = 'text-white';
          }

          return (
            <div
              key={step.key}
              className="flex flex-col items-center flex-1 relative"
            >
              {/* Connector line */}
              {index > 0 && (
                <div
                  className={`absolute top-4 right-1/2 w-full h-0.5 -translate-y-1/2 ${
                    !isCancelled && index <= activeIndex ? 'bg-green-500' : 'bg-gray-300'
                  }`}
                  style={{ zIndex: 0 }}
                />
              )}

              {/* Step dot with icon */}
              <div
                className={`relative z-10 flex items-center justify-center w-8 h-8 rounded-full border-2 ${dotColor} transition-colors`}
              >
                <span className={iconColor}>{step.icon}</span>
              </div>

              {/* Label */}
              <span
                className={`mt-2 text-xs font-medium text-center leading-tight ${textColor} transition-colors`}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function JobTimeline({
  currentStatus,
  jobId,
  compact = false,
  className = '',
}: JobTimelineProps) {
  const normalizedStatus = useMemo(
    () => currentStatus?.toLowerCase().trim() || 'pending',
    [currentStatus]
  );

  if (compact) {
    return <CompactTimeline currentStatus={normalizedStatus} className={className} />;
  }

  return <FullTimeline currentStatus={normalizedStatus} className={className} />;
}

export { CompactTimeline, FullTimeline };
export type { JobTimelineProps, TimelineStep };
