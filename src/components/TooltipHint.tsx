import { useState, useEffect } from 'react';
import { X, Lightbulb } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface HintRecord {
  user_id: string;
  hint_key: string;
  dismissed_at: string | null;
  view_count: number;
}

interface TooltipHintProps {
  hintKey: string;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  position?: 'top' | 'bottom' | 'left' | 'right';
  theme?: 'blue' | 'green' | 'amber' | 'purple';
  children?: React.ReactNode;
}

export default function TooltipHint({
  hintKey,
  title,
  description,
  action,
  position = 'bottom',
  theme = 'blue',
  children,
}: TooltipHintProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useAuth();

  const themeClasses = {
    blue: 'from-secondary-50 to-secondary-50 border-secondary-200 text-secondary-900',
    green: 'from-green-50 to-secondary-50 border-green-200 text-green-900',
    amber: 'from-warm-50 to-warm-50 border-warm-200 text-warm-900',
    purple: 'from-warm-50 to-warm-50 border-warm-200 text-warm-900',
  };

  const iconColors = {
    blue: 'bg-secondary-100 text-secondary-600',
    green: 'bg-green-100 text-green-600',
    amber: 'bg-warm-100 text-warm-600',
    purple: 'bg-warm-100 text-warm-600',
  };

  useEffect(() => {
    if (!user) return;

    const checkHintStatus = async () => {
      const { data } = await supabase
        .from('hint_tracking')
        .select('*')
        .eq('user_id', user.id)
        .eq('hint_key', hintKey)
        .maybeSingle();

      if (!data || !(data as HintRecord).dismissed_at) {
        setIsVisible(true);
      } else {
        setIsDismissed(true);
      }
      setIsLoading(false);
    };

    checkHintStatus();
  }, [user, hintKey]);

  const handleDismiss = async () => {
    if (!user) return;

    const { data: existing } = await supabase
      .from('hint_tracking')
      .select('*')
      .eq('user_id', user.id)
      .eq('hint_key', hintKey)
      .maybeSingle();

    if (existing) {
      await supabase
        .from('hint_tracking')
        .update({
          dismissed_at: new Date().toISOString(),
          view_count: ((existing as HintRecord).view_count || 0) + 1,
        })
        .eq('user_id', user.id)
        .eq('hint_key', hintKey);
    } else {
      await supabase
        .from('hint_tracking')
        .insert([
          {
            user_id: user.id,
            hint_key: hintKey,
            dismissed_at: new Date().toISOString(),
            view_count: 1,
          },
        ]);
    }

    setIsVisible(false);
    setIsDismissed(true);
  };

  if (isLoading || isDismissed || !isVisible) {
    return children ? <>{children}</> : null;
  }

  const positionClasses = {
    top: '-top-2 -translate-y-full',
    bottom: 'top-full mt-2',
    left: 'right-full mr-2',
    right: 'left-full ml-2',
  };

  const content = (
    <div className={`bg-gradient-to-br ${themeClasses[theme]} border rounded-xl p-4 shadow-lg max-w-xs animate-in fade-in slide-in-from-bottom-2 duration-300`}>
      <div className="flex items-start gap-3">
        <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${iconColors[theme]}`}>
          <Lightbulb className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <h4 className="font-semibold text-sm mb-1">{title}</h4>
          <p className="text-xs opacity-90 mb-3">{description}</p>
          {action && (
            <button
              onClick={() => {
                action.onClick();
                handleDismiss();
              }}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg bg-white/60 hover:bg-white transition-colors`}
            >
              {action.label}
            </button>
          )}
        </div>
        <button
          onClick={handleDismiss}
          className="flex-shrink-0 p-1 text-gray-400 hover:text-gray-600 hover:bg-white/40 rounded transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );

  if (!children) {
    return content;
  }

  return (
    <div className="relative inline-block">
      {children}
      <div className={`absolute ${positionClasses[position]} z-50`}>
        {content}
      </div>
    </div>
  );
}
