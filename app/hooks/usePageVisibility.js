'use client';

import { useState, useEffect } from 'react';

export function usePageVisibility() {
  // Initialize to true on server, will update on client
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    // Only run on client
    if (typeof document === 'undefined') return;
    
    // Set initial state
    setIsVisible(!document.hidden);

    const handleVisibilityChange = () => {
      setIsVisible(!document.hidden);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  return isVisible;
}