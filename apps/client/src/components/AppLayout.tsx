import { Group, Panel, Separator } from 'react-resizable-panels';
import { useAuth } from '../hooks/useAuth';
import { LoginPage } from './LoginPage';

export interface AppLayoutProps {
  children?: React.ReactNode;
  leftSidebar?: React.ReactNode;
  rightSidebar?: React.ReactNode;
  bottomPanel?: React.ReactNode;
  footer?: React.ReactNode;
}

export function AppLayout({ children, leftSidebar, rightSidebar, bottomPanel, footer }: AppLayoutProps) {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) return <LoginPage />;

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: '#1e1e1e',
        color: '#ccc',
      }}
    >
      <Group orientation="horizontal" style={{ flex: 1, minHeight: 0 }}>
        {/* Left sidebar - workspace list */}
        <Panel
          defaultSize="15%"
          minSize="10%"
          maxSize="80%"
          style={{ background: '#252526', borderRight: '1px solid #333' }}
        >
          <div data-testid="left-sidebar">{leftSidebar ?? 'Left Sidebar'}</div>
        </Panel>
        <Separator style={{ width: '2px', background: '#333' }} />

        {/* Center - main content with bottom panel */}
        <Panel defaultSize="55%" minSize="30%">
          <Group orientation="vertical">
            <Panel defaultSize="75%" minSize="30%">
              <div data-testid="main-content" style={{ height: '100%', overflow: 'auto' }}>
                {children ?? null}
              </div>
            </Panel>
            <Separator style={{ height: '2px', background: '#333' }} />
            <Panel
              defaultSize="25%"
              minSize="10%"
              maxSize="90%"
              style={{ background: '#252526', borderTop: '1px solid #333' }}
            >
              <div data-testid="bottom-panel">{bottomPanel ?? 'Bottom Panel'}</div>
            </Panel>
          </Group>
        </Panel>
        <Separator style={{ width: '2px', background: '#333' }} />

        {/* Right sidebar - file tree */}
        <Panel
          defaultSize="30%"
          minSize="15%"
          maxSize="80%"
          style={{ background: '#252526', borderLeft: '1px solid #333' }}
        >
          <div data-testid="right-sidebar">{rightSidebar ?? 'Right Sidebar'}</div>
        </Panel>
      </Group>
      {footer}
    </div>
  );
}
