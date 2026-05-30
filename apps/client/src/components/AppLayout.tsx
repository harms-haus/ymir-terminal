import { useRef, useEffect } from 'react';
import { Group, Panel, Separator, type PanelImperativeHandle } from 'react-resizable-panels';
import { useAuth } from '../hooks/useAuth';
import { LoginPage } from './LoginPage';
import { AnimatedPane } from './AnimatedPane';
import { COLOR_BG_PRIMARY, COLOR_BG_SECONDARY, COLOR_BORDER, COLOR_TEXT } from '../lib/theme';

export interface AppLayoutProps {
  children?: React.ReactNode;
  leftSidebar?: React.ReactNode;
  rightSidebar?: React.ReactNode;
  bottomPanel?: React.ReactNode;
  topBar?: React.ReactNode;
  paneVisibility: { left: boolean; right: boolean; bottom: boolean };
}

export function AppLayout({
  children,
  leftSidebar,
  rightSidebar,
  bottomPanel,
  topBar,
  paneVisibility,
}: AppLayoutProps) {
  const { isAuthenticated } = useAuth();

  const leftPanelRef = useRef<PanelImperativeHandle>(null);
  const rightPanelRef = useRef<PanelImperativeHandle>(null);
  const bottomPanelRef = useRef<PanelImperativeHandle>(null);

  useEffect(() => {
    // When showing: expand the panel immediately, then AnimatedPane will slide content in
    if (paneVisibility.left) {
      leftPanelRef.current?.expand();
    }
    if (paneVisibility.right) {
      rightPanelRef.current?.expand();
    }
    if (paneVisibility.bottom) {
      bottomPanelRef.current?.expand();
    }
  }, [paneVisibility.left, paneVisibility.right, paneVisibility.bottom]);

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
      {topBar}
      <Group orientation="horizontal" style={{ flex: 1, minHeight: 0 }}>
        {/* Left sidebar - workspace list */}
        <Panel
          collapsible={true}
          collapsedSize={0}
          panelRef={leftPanelRef}
          defaultSize="15%"
          minSize="10%"
          maxSize="80%"
        >
          <AnimatedPane direction="left" visible={paneVisibility.left} onCollapseReady={() => leftPanelRef.current?.collapse()}>
            <nav aria-label="Workspaces" data-testid="left-sidebar">
              {leftSidebar ?? 'Left Sidebar'}
            </nav>
          </AnimatedPane>
        </Panel>
        {paneVisibility.left && <Separator style={{ width: '2px', background: COLOR_BORDER }} />}

        {/* Center - main content with bottom panel */}
        <Panel defaultSize="55%" minSize="30%">
          <Group orientation="vertical">
            <Panel defaultSize="75%" minSize="30%">
              <main data-testid="main-content" style={{ height: '100%', overflow: 'auto' }}>
                {children ?? null}
              </main>
            </Panel>
            {paneVisibility.bottom && <Separator style={{ height: '2px', background: COLOR_BORDER }} />}
            <Panel
              collapsible={true}
              collapsedSize={0}
              panelRef={bottomPanelRef}
              defaultSize="25%"
              minSize="10%"
              maxSize="90%"
            >
              <AnimatedPane direction="bottom" visible={paneVisibility.bottom} onCollapseReady={() => bottomPanelRef.current?.collapse()}>
                <div data-testid="bottom-panel" style={{ height: '100%' }}>{bottomPanel ?? 'Bottom Panel'}</div>
              </AnimatedPane>
            </Panel>
          </Group>
        </Panel>
        {paneVisibility.right && <Separator style={{ width: '2px', background: COLOR_BORDER }} />}

        {/* Right sidebar - file tree */}
        <Panel
          collapsible={true}
          collapsedSize={0}
          panelRef={rightPanelRef}
          defaultSize="30%"
          minSize="15%"
          maxSize="80%"
        >
          <AnimatedPane direction="right" visible={paneVisibility.right} onCollapseReady={() => rightPanelRef.current?.collapse()}>
            <aside aria-label="Explorer" data-testid="right-sidebar" style={{ height: '100%' }}>
              {rightSidebar ?? 'Right Sidebar'}
            </aside>
          </AnimatedPane>
        </Panel>
      </Group>
    </div>
  );
}
