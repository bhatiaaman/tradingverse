import { useState, useEffect } from 'react';

export function useProviderStatus() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch_status = async () => {
      try {
        const res = await fetch('/api/provider-status');
        const data = await res.json();
        setStatus(data);
      } catch (e) {
        console.error('Failed to fetch provider status:', e);
      } finally {
        setLoading(false);
      }
    };

    fetch_status();
    // Refresh every 5 seconds
    const interval = setInterval(fetch_status, 5000);
    return () => clearInterval(interval);
  }, []);

  return { status, loading };
}
