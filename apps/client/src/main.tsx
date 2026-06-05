import './styles/global.css';
import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import { Route as rootRoute } from './routes/__root';
import { Route as indexRoute } from './routes/index';
import { AuthProvider } from './hooks/useAuth';
import { ConnectionUrlProvider } from './contexts/ConnectionUrlContext';

const routeTree = rootRoute.addChildren([indexRoute]);

const queryClient = new QueryClient();

const router = createRouter({
  routeTree,
  context: {
    queryClient,
  },
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  state = { hasError: false, error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: 40,
            color: '#e06c75',
            fontFamily: 'monospace',
            background: '#1e1e1e',
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <h2 style={{ marginBottom: 16 }}>An unexpected error occurred</h2>
          <p style={{ marginBottom: 24, color: '#abb2bf' }}>Please try reloading the page.</p>
          <details style={{ marginBottom: 24, width: '100%', maxWidth: 600 }}>
            <summary style={{ cursor: 'pointer', marginBottom: 8, color: '#abb2bf' }}>
              Technical details
            </summary>
            <pre
              style={{
                padding: 16,
                background: '#282c34',
                borderRadius: 4,
                overflow: 'auto',
                color: '#e06c75',
              }}
            >
              {this.state.error?.message ?? 'No error message available.'}
            </pre>
          </details>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '8px 24px',
              background: '#e06c75',
              color: '#1e1e1e',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: 14,
            }}
            onMouseOver={(e) => {
              (e.currentTarget as HTMLButtonElement).style.outline = '2px solid #abb2bf';
            }}
            onMouseOut={(e) => {
              (e.currentTarget as HTMLButtonElement).style.outline = 'none';
            }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

window.addEventListener('unhandledrejection', (e) => {
  console.error('Unhandled promise rejection:', e.reason);
});

const rootElement = document.getElementById('root')!;
createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ConnectionUrlProvider>
        <AuthProvider>
          <AppErrorBoundary>
            <RouterProvider router={router} />
          </AppErrorBoundary>
        </AuthProvider>
      </ConnectionUrlProvider>
    </QueryClientProvider>
  </StrictMode>,
);
