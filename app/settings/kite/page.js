'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

function KiteSettingsContent() {
  const searchParams = useSearchParams();
  const [config, setConfig] = useState({
    apiKey: '',
    apiSecret: '', // Only kept in memory, never saved to disk
    accessToken: '',
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [tokenStatus, setTokenStatus] = useState('unknown'); // unknown, valid, invalid
  const [pendingRequestToken, setPendingRequestToken] = useState(null);
  const [showSecretModal, setShowSecretModal] = useState(false);
  const [hasApiSecretInEnv, setHasApiSecretInEnv] = useState(false);
  const [useEnvSecret, setUseEnvSecret] = useState(false);

  // On mount: load config first, then handle OAuth callback if present.
  // The OAuth modal must open AFTER config loads so hasApiSecretInEnv is already
  // set — otherwise the "use env secret" checkbox is hidden for ~300ms and the
  // user sees only the manual input box.
  useEffect(() => {
    const requestToken = searchParams.get('request_token');
    const status       = searchParams.get('status');

    if (requestToken && status === 'success') {
      // OAuth redirect: wait for config, then show modal
      fetchCurrentConfig().then(() => {
        setPendingRequestToken(requestToken);
        setShowSecretModal(true);
        setMessage({ type: 'info', text: 'Enter your API Secret to complete authentication' });
        window.history.replaceState({}, '', '/settings/kite');
      });
    } else {
      fetchCurrentConfig();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchCurrentConfig = async () => {
    try {
      const res = await fetch('/api/kite-config');
      const data = await res.json();
      if (data.success) {
        setConfig(prev => ({
          ...prev,
          apiKey: data.config.apiKey || '',
          // accessToken not fetched from server for security
        }));
        setTokenStatus(data.tokenValid ? 'valid' : 'invalid');
        setHasApiSecretInEnv(data.hasApiSecretInEnv || false);
        setUseEnvSecret(data.hasApiSecretInEnv || false);
      }
    } catch (error) {
      console.error('Failed to fetch config:', error);
    }
  };

  const handleRequestToken = async () => {
    // If using env secret, don't require manual input
    if (!useEnvSecret && !config.apiSecret) {
      setMessage({ type: 'error', text: 'Please enter your API Secret' });
      return;
    }
    
    setLoading(true);
    setMessage({ type: 'info', text: 'Exchanging request token for access token...' });
    
    try {
      const res = await fetch('/api/kite-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          requestToken: pendingRequestToken,
          apiSecret: config.apiSecret || '',  // Send empty string instead of null
          useEnvSecret: useEnvSecret,
        }),
      });
      
      const data = await res.json();
      
      if (data.success) {
        setConfig(prev => ({ ...prev, accessToken: data.accessToken, apiSecret: '' }));
        setTokenStatus('valid');
        setShowSecretModal(false);
        setPendingRequestToken(null);
        setMessage({ type: 'success', text: 'Access token generated and saved! Closing in 2 seconds...' });
        
        // Notify opener window (if opened from OrderModal popup)
        if (window.opener) {
          window.opener.postMessage({ type: 'KITE_LOGIN_SUCCESS' }, '*');
          // Auto-close popup after success
          setTimeout(() => {
            window.close();
          }, 2000);
        }
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to exchange token' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to exchange token: ' + error.message });
    } finally {
      setLoading(false);
    }
  };

  const cancelSecretModal = () => {
    setShowSecretModal(false);
    setPendingRequestToken(null);
    setConfig(prev => ({ ...prev, apiSecret: '' }));
    setMessage({ type: '', text: '' });
  };

  const saveApiKey = async () => {
    setLoading(true);
    setMessage({ type: '', text: '' });
    
    try {
      const res = await fetch('/api/kite-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: config.apiKey,
          // API Secret is never saved
        }),
      });
      
      const data = await res.json();
      
      if (data.success) {
        setMessage({ type: 'success', text: 'API Key saved successfully!' });
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to save API Key' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to save: ' + error.message });
    } finally {
      setLoading(false);
    }
  };

  const initiateLogin = () => {
    if (!config.apiKey) {
      setMessage({ type: 'error', text: 'Please save your API Key first' });
      return;
    }
    
    // Redirect to Kite login
    const redirectUrl = `${window.location.origin}/settings/kite`;
    const loginUrl = `https://kite.zerodha.com/connect/login?v=3&api_key=${config.apiKey}&redirect_url=${encodeURIComponent(redirectUrl)}`;
    window.location.href = loginUrl;
  };

  const validateToken = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/kite-config');
      const data = await res.json();
      setTokenStatus(data.tokenValid ? 'valid' : 'invalid');
      setMessage({ 
        type: data.tokenValid ? 'success' : 'error', 
        text: data.tokenValid ? 'Access token is valid!' : 'Access token is invalid or expired' 
      });
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to validate token' });
    } finally {
      setLoading(false);
    }
  };

  const disconnectKite = async () => {
    setLoading(true);
    try {
      // Clear the access token
      const res = await fetch('/api/kite-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: '' }),
      });
      
      if (res.ok) {
        setConfig(prev => ({ ...prev, accessToken: '' }));
        setTokenStatus('invalid');
        setMessage({ type: 'success', text: 'Disconnected from Kite successfully' });

        // Send message first, THEN close after a delay so message is received
        if (window.opener) {
          window.opener.postMessage({ type: 'KITE_LOGOUT_SUCCESS' }, '*');
          setTimeout(() => window.close(), 1500);
        }
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to disconnect: ' + error.message });
    } finally {
      setLoading(false);
    }
  };

  const closeWindow = () => {
    if (window.opener) {
      window.close();
    } else {
      window.location.href = '/trades';
    }
  };

  return (
    <div className="min-h-screen bg-[#0a1628] text-slate-100 p-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <Link href="/trades" className="text-blue-400 hover:text-blue-300 text-sm mb-2 inline-block">
              ← Back to Trades
            </Link>
            <h1 className="text-2xl font-bold text-blue-300">Kite Connect Settings</h1>
            <p className="text-slate-400 text-sm mt-1">Configure your Zerodha Kite API credentials</p>
          </div>
          <div className="flex items-center gap-3">
            <div className={`px-3 py-1 rounded-full text-xs font-medium ${
              tokenStatus === 'valid' ? 'bg-green-500/20 text-green-400' :
              tokenStatus === 'invalid' ? 'bg-red-500/20 text-red-400' :
              'bg-slate-500/20 text-slate-400'
            }`}>
              {tokenStatus === 'valid' ? '● Connected' : tokenStatus === 'invalid' ? '● Disconnected' : '● Unknown'}
            </div>
            <button
              onClick={closeWindow}
              className="p-2 rounded-lg bg-slate-700/50 hover:bg-slate-600/50 text-slate-300 hover:text-white transition-colors"
              title="Close"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Message */}
        {message.text && (
          <div className={`mb-6 p-4 rounded-lg border ${
            message.type === 'success' ? 'bg-green-500/10 border-green-500/30 text-green-400' :
            message.type === 'error' ? 'bg-red-500/10 border-red-500/30 text-red-400' :
            'bg-blue-500/10 border-blue-500/30 text-blue-400'
          }`}>
            {message.text}
          </div>
        )}

        {/* API Secret Modal - shown after OAuth redirect */}
        {showSecretModal && (
          <div className="mb-6 bg-[#112240] border-2 border-blue-500/50 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-blue-300 mb-4 flex items-center gap-2">
              🔐 Enter API Secret to Complete Login
            </h2>
            
            {hasApiSecretInEnv && (
              <div className="mb-4 p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useEnvSecret}
                    onChange={(e) => setUseEnvSecret(e.target.checked)}
                    className="w-4 h-4 rounded border-green-500/50 bg-green-900/20 text-green-500 focus:ring-green-500"
                  />
                  <span className="text-green-400 text-sm font-medium">Use saved API Secret from .env.local</span>
                </label>
                <p className="text-green-300/70 text-xs mt-1 ml-6">Your secret is securely stored and will be used automatically.</p>
              </div>
            )}
            
            {!useEnvSecret && (
              <>
                <p className="text-slate-400 text-sm mb-4">
                  Your API secret is required to generate the access token. It will <strong className="text-slate-200">NOT</strong> be saved anywhere.
                </p>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">API Secret</label>
                    <input
                      type="password"
                      value={config.apiSecret}
                      onChange={(e) => setConfig(prev => ({ ...prev, apiSecret: e.target.value }))}
                      placeholder="Enter your API Secret"
                      autoFocus
                      className="w-full bg-[#0a1628] border border-blue-500/50 rounded-lg px-4 py-2.5 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-400"
                    />
                  </div>
                </div>
              </>
            )}
            
            <div className="flex gap-3 mt-4">
              <button
                onClick={handleRequestToken}
                disabled={loading || (!useEnvSecret && !config.apiSecret)}
                className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-lg transition-colors"
              >
                {loading ? 'Generating Token...' : useEnvSecret ? '🔓 Generate Token with Saved Secret' : 'Generate Access Token'}
              </button>
              <button
                onClick={cancelSecretModal}
                className="px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Step 1: API Key */}
        <div className="bg-[#112240] border border-blue-800/40 rounded-xl p-6 mb-6">
          <h2 className="text-lg font-semibold text-blue-300 mb-4 flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-blue-500 text-white text-sm flex items-center justify-center">1</span>
            API Key
          </h2>
          <p className="text-slate-400 text-sm mb-4">
            Get your API Key from{' '}
            <a href="https://kite.zerodha.com/developer" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">
              Kite Developer Console
            </a>
          </p>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">API Key</label>
              <input
                type="text"
                value={config.apiKey}
                onChange={(e) => setConfig(prev => ({ ...prev, apiKey: e.target.value }))}
                placeholder="Enter your API Key"
                className="w-full bg-[#0a1628] border border-blue-700/50 rounded-lg px-4 py-2.5 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>
            
            <button
              onClick={saveApiKey}
              disabled={loading || !config.apiKey}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-lg transition-colors"
            >
              {loading ? 'Saving...' : 'Save API Key'}
            </button>
          </div>
        </div>

        {/* Step 2: Login & Get Access Token */}
        <div className="bg-[#112240] border border-blue-800/40 rounded-xl p-6 mb-6">
          <h2 className="text-lg font-semibold text-blue-300 mb-4 flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-blue-500 text-white text-sm flex items-center justify-center">2</span>
            Login & Get Access Token
          </h2>
          <p className="text-slate-400 text-sm mb-4">
            Click below to login to Kite. After login, you'll enter your API Secret (never saved) to generate the token.
          </p>
          
          <button
            onClick={initiateLogin}
            disabled={loading || !config.apiKey}
            className="w-full bg-green-600 hover:bg-green-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
            </svg>
            Login to Kite
          </button>
        </div>

        {/* Current Access Token */}
        <div className={`bg-[#112240] border rounded-xl p-6 ${tokenStatus === 'invalid' ? 'border-red-500/50' : 'border-blue-800/40'}`}>
          <h2 className="text-lg font-semibold text-blue-300 mb-4 flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-blue-500 text-white text-sm flex items-center justify-center">3</span>
            Current Access Token
            {tokenStatus === 'invalid' && config.accessToken && (
              <span className="ml-2 px-2 py-0.5 text-xs font-medium rounded bg-red-500/20 text-red-400 border border-red-500/30">
                EXPIRED
              </span>
            )}
            {tokenStatus === 'valid' && (
              <span className="ml-2 px-2 py-0.5 text-xs font-medium rounded bg-green-500/20 text-green-400 border border-green-500/30">
                ACTIVE
              </span>
            )}
          </h2>
          
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-300 mb-2">Access Token</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={tokenStatus === 'valid' ? '••••••••••••••••••••' : ''}
                readOnly
                disabled={tokenStatus === 'invalid'}
                className={`flex-1 border rounded-lg px-4 py-2.5 font-mono text-sm ${
                  tokenStatus === 'invalid' 
                    ? 'bg-red-900/20 border-red-700/50 text-red-400/60 line-through' 
                    : 'bg-[#0a1628] border-blue-700/50 text-slate-400'
                }`}
                placeholder="No access token yet"
              />
              <button
                onClick={validateToken}
                disabled={loading || !config.accessToken}
                className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg transition-colors text-sm"
              >
                Validate
              </button>
              {tokenStatus === 'valid' && (
                <button
                  onClick={disconnectKite}
                  disabled={loading}
                  className="px-4 py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg transition-colors text-sm"
                >
                  Disconnect
                </button>
              )}
            </div>
          </div>
          
          {tokenStatus === 'invalid' && config.accessToken && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-300 text-sm">
              ⚠️ Your access token has expired. Please login again to get a fresh token.
            </div>
          )}
          
          <div className="text-slate-400 text-sm">
            <p className="mb-2">💡 <strong className="text-slate-300">Note:</strong> Access tokens expire daily at ~6 AM IST.</p>
            <p>You'll need to login again each day to get a fresh token.</p>
          </div>
        </div>

        {/* Instructions */}
        <div className="mt-6 p-4 bg-[#0a1628] border border-blue-800/40 rounded-xl">
          <h3 className="text-sm font-semibold text-blue-300 mb-3">How it works:</h3>
          <ol className="text-slate-400 text-sm space-y-2 list-decimal list-inside">
            <li>Enter your API Key and click "Save API Key"</li>
            <li>Click "Login to Kite" to authorize the app</li>
            <li>After redirect, enter your API Secret {hasApiSecretInEnv && '(or use saved secret from env)'}</li>
            <li>Access token is generated and saved to .env.local</li>
            <li>Your API Secret stays private {hasApiSecretInEnv ? '(stored securely in .env.local)' : 'and is never stored'}</li>
          </ol>
        </div>
      </div>
    </div>
  );
}

export default function KiteSettingsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    }>
      <KiteSettingsContent />
    </Suspense>
  );
}
