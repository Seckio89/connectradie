import { useState, useEffect } from 'react';
import { X, Lightbulb } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Insert } from '../types/database';
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
    blue: 'from-ct-surface-2 to-ct-surface-2 border-ct-line text-ct-paper',
    green: 'from-ct-teal to-ct-surface-2 border-ct-teal/30 text-ct-teal',
    amber: 'from-ct-teal to-ct-teal border-ct-amber/[0.34] text-ct-teal',
    purple: 'from-ct-teal to-ct-teal border-ct-amber/[0.34] text-ct-teal',
  };

  const iconColors = {
    blue: 'bg-ct-surface-2 text-ct-mute-2',
    green: 'bg-ct-teal/[0.14] text-ct-teal',
    amber: 'bg-ct-amber/[0.13] text-ct-amber',
    purple: 'bg-ct-amber/[0.13] text-ct-amber',
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
      // Annotated so every key is column-checked — see the `Insert`/`Update`
      // note in types/database.ts.
      const hintRows: Insert<'hint_tracking'>[] = [
        {
          user_id: user.id,
          hint_key: hintKey,
          dismissed_at: new Date().toISOString(),
          view_count: 1,
        },
      ];
      await supabase
        .from('hint_tracking')
        .insert(hintRows);
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
    <div className={`bg-gradient-to-br ${themeClasses[theme]} border rounded-ct-md p-4 shadow-lg max-w-xs animate-in fade-in slide-in-from-bottom-2 duration-300`}>
      <div className="flex items-start gap-3">
        <div className={`flex-shrink-0 w-8 h-8 rounded-ct-sm flex items-center justify-center ${iconColors[theme]}`}>
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
              className={`text-xs font-semibold px-3 py-1.5 rounded-ct-sm bg-ct-surface/60 hover:bg-ct-surface transition-colors`}
            >
              {action.label}
            </button>
          )}
        </div>
        <button
          onClick={handleDismiss}
          className="flex-shrink-0 p-1 text-ct-mute hover:text-ct-mute-2 hover:bg-ct-surface/40 rounded-ct-xs transition-colors"
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
