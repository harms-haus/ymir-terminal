import React, { useState, useCallback, type FormEvent } from 'react';
import { useAuth } from '../hooks/useAuth';

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    backgroundColor: '#0d1117',
    color: '#e6edf3',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, sans-serif',
  },
  card: {
    backgroundColor: '#161b22',
    border: '1px solid #30363d',
    borderRadius: '12px',
    padding: '40px',
    width: '100%',
    maxWidth: '400px',
    boxSizing: 'border-box',
  },
  title: {
    fontSize: '24px',
    fontWeight: 600,
    margin: '0 0 8px 0',
    textAlign: 'center' as const,
    color: '#e6edf3',
  },
  subtitle: {
    fontSize: '14px',
    color: '#8b949e',
    margin: '0 0 32px 0',
    textAlign: 'center' as const,
  },
  inputGroup: {
    marginBottom: '16px',
  },
  label: {
    display: 'block',
    fontSize: '14px',
    fontWeight: 500,
    marginBottom: '8px',
    color: '#e6edf3',
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    fontSize: '14px',
    backgroundColor: '#0d1117',
    border: '1px solid #30363d',
    borderRadius: '6px',
    color: '#e6edf3',
    outline: 'none',
    boxSizing: 'border-box',
  },
  button: {
    width: '100%',
    padding: '10px 16px',
    fontSize: '14px',
    fontWeight: 600,
    backgroundColor: '#238636',
    color: '#ffffff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
  },
  buttonDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
  errorBox: {
    backgroundColor: '#3d1114',
    border: '1px solid #6e2d2f',
    borderRadius: '6px',
    padding: '10px 12px',
    marginBottom: '16px',
    fontSize: '13px',
    color: '#f85149',
  },
  spinner: {
    width: '16px',
    height: '16px',
    border: '2px solid rgba(255, 255, 255, 0.3)',
    borderTopColor: '#ffffff',
    borderRadius: '50%',
    animation: 'spin 0.6s linear infinite',
  },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LoginPage() {
  const { login } = useAuth();
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!password.trim() || loading) return;

      setLoading(true);
      setError(null);

      try {
        await login(password);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Authentication failed');
      } finally {
        setLoading(false);
      }
    },
    [password, loading, login],
  );

  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={styles.container}>
        <div style={styles.card}>
          <h1 style={styles.title}>Ymir Terminal</h1>
          <p style={styles.subtitle}>Enter your password to connect</p>

          <form onSubmit={handleSubmit}>
            {error && (
              <div style={styles.errorBox} data-testid="login-error">
                {error}
              </div>
            )}

            <div style={styles.inputGroup}>
              <label htmlFor="password" style={styles.label}>
                Password
              </label>
              <input
                id="password"
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                autoFocus
                style={styles.input}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                ...styles.button,
                ...(loading ? styles.buttonDisabled : {}),
              }}
              data-loading={loading || undefined}
            >
              {loading && <span style={styles.spinner} />}
              {loading ? 'Connecting…' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
