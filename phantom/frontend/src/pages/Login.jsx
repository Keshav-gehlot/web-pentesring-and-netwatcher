import React, { useState, useEffect } from 'react';
import { API_BASE, setAuthData } from '../api';
import { useNavigate } from 'react-router-dom';

function Login({ onLoginSuccess }) {
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [oauthConfig, setOauthConfig] = useState({ google: false, github: false });
  const navigate = useNavigate();

  useEffect(() => {
    fetch(`${API_BASE}/auth/oauth/config`)
      .then(res => res.ok && res.json())
      .then(data => { if (data) setOauthConfig(data); })
      .catch(() => {});
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const url = mode === 'login' ? `${API_BASE}/auth/login` : `${API_BASE}/auth/signup`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const contentType = res.headers.get('content-type') || '';
      const raw = await res.text();

      let data = null;
      if (raw) {
        try {
          data = contentType.includes('application/json') ? JSON.parse(raw) : JSON.parse(raw);
        } catch {
          const backendMessage = raw.replace(/<[^>]*>/g, ' ').replace(/\\s+/g, ' ').trim();
          if (/your space|sleeping|building|application error|not found/i.test(backendMessage)) {
            throw new Error('PHANTOM backend is unavailable or still starting. Please restart/wake the backend and try again.');
          }
          throw new Error(backendMessage || 'Backend returned an invalid response.');
        }
      }

      if (!res.ok) {
        throw new Error(data?.detail || data?.message || `Authentication failed (HTTP ${res.status})`);
      }

      if (!data?.access_token) {
        throw new Error('Backend did not return an access token.');
      }
      setAuthData(data.access_token, data.username, data.role);
      onLoginSuccess(data.access_token, data.username, data.role);
      navigate('/');
    } catch (err) {
      setError(err.message);
    }
  };

  const hasOAuth = oauthConfig.google || oauthConfig.github;

  return (
    <div className="login-container">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="login-title-section">
          <h1 className="login-logo">PHANTOM</h1>
          <p className="login-subtitle">SecOps Audit & Sniff Engine</p>
        </div>
        <div className="form-group">
          <label className="form-label">Username</label>
          <input
            type="text"
            className="form-input"
            placeholder="e.g. admin"
            value={username}
            onChange={e => setUsername(e.target.value)}
            required
          />
        </div>
        <div className="form-group">
          <label className="form-label">Password</label>
          <input
            type="password"
            className="form-input"
            placeholder="••••••••"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />
        </div>
        {error && <div className="login-error">{error}</div>}
        <button type="submit" className="login-btn">
          {mode === 'login' ? 'Initialize Connection' : 'Create Account'}
        </button>

        <div className="login-switch">
          {mode === 'login' ? (
            <span>New user? <button type="button" className="login-switch-btn" onClick={() => { setMode('signup'); setError(''); }}>Sign up</button></span>
          ) : (
            <span>Already have an account? <button type="button" className="login-switch-btn" onClick={() => { setMode('login'); setError(''); }}>Log in</button></span>
          )}
        </div>

        {hasOAuth && (
          <>
            <div className="oauth-divider"><span>OR</span></div>
            <div className="oauth-buttons">
              {oauthConfig.google && (
                <a href={`${API_BASE}/auth/google/login`} className="oauth-btn google-btn">
                  <img src="https://img.icons8.com/color/24/000000/google-logo.png" alt="Google" />
                  <span>Login with Google</span>
                </a>
              )}
              {oauthConfig.github && (
                <a href={`${API_BASE}/auth/github/login`} className="oauth-btn github-btn">
                  <img src="https://img.icons8.com/fluency/24/000000/github.png" alt="GitHub" />
                  <span>Login with GitHub</span>
                </a>
              )}
            </div>
          </>
        )}
      </form>
    </div>
  );
}

export default Login;
