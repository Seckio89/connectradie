import { useState, useCallback, useRef, useEffect } from 'react';

interface Toast {
  message: string;
  show: boolean;
  isError?: boolean;
}

export function useToast(duration = 3000) {
  const [toast, setToast] = useState<Toast>({ message: '', show: false });
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const showToast = useCallback((message: string, isError = false) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToast({ message, show: true, isError });
    timerRef.current = setTimeout(() => {
      setToast({ message: '', show: false });
    }, duration);
  }, [duration]);

  const hideToast = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToast({ message: '', show: false });
  }, []);

  return { toast, showToast, hideToast };
}
