import { Group, Panel, Separator } from 'react-resizable-panels';
import { useAuth } from '../hooks/useAuth';
import { LoginPage } from './LoginPage';
import { COLOR_BG_PRIMARY, COLOR_BG_SECONDARY, COLOR_BORDER, COLOR_TEXT } from '../lib/theme';

export interface AppLayoutProps {
  children?: React.ReactNode;
  leftSidebar?: React.ReactNode;
  rightSidebar?: React.ReactNode;
  bottomPanel?: React.ReactNode;
  footer?: React.ReactNode;
}

export function AppLayout({
  children,
  leftSidebar,
  rightSidebar,
  bottomPanel,
  footer,
}: AppLayoutProps) {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) return <LoginPage />;

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: COLOR_BG_PRIMARY,
        color: COLOR_TEXT,
      }}
    >
      <Group orientation="horizontal" style={{ flex: 1, minHeight: 0 }}>
        {/* Left sidebar - workspace list */}
        <Panel
          defaultSize="15%"
          minSize="10%"
          maxSize="80%"
          style={{ background: COLOR_BG_SECONDARY, borderRight: `1px solid ${COLOR_BORDER}` }}
        >
          <nav aria-label="Workspaces" data-testid="left-sidebar">
            {leftSidebar ?? 'Left Sidebar'}
          </nav>
        </Panel>
        <Separator style={{ width: '2px', background: COLOR_BORDER }} />

        {/* Center - main content with bottom panel */}
        <Panel defaultSize="55%" minSize="30%">
          <Group orientation="vertical">
            <Panel defaultSize="75%" minSize="30%">
              <main data-testid="main-content" style={{ height: '100%', overflow: 'auto' }}>
                {children ?? null}
              </main>
            </Panel>
            <Separator style={{ height: '2px', background: COLOR_BORDER }} />
            <Panel
              defaultSize="25%"
              minSize="10%"
              maxSize="90%"
              style={{ background: COLOR_BG_SECONDARY, borderTop: `1px solid ${COLOR_BORDER}` }}
            >
              <div data-testid="bottom-panel">{bottomPanel ?? 'Bottom Panel'}</div>
            </Panel>
          </Group>
        </Panel>
        <Separator style={{ width: '2px', background: COLOR_BORDER }} />

        {/* Right sidebar - file tree */}
        <Panel
          defaultSize="30%"
          minSize="15%"
          maxSize="80%"
          style={{ background: COLOR_BG_SECONDARY, borderLeft: `1px solid ${COLOR_BORDER}` }}
        >
          <aside aria-label="Explorer" data-testid="right-sidebar" style={{ height: '100%' }}>
            {rightSidebar ?? 'Right Sidebar'}
          </aside>
        </Panel>
      </Group>
      {footer}
    </div>
  );
}
