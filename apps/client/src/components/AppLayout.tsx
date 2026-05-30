import { useRef, useEffect, useCallback } from 'react';
import { Group, Panel, Separator, type PanelImperativeHandle, type GroupImperativeHandle } from 'react-resizable-panels';
import { useAuth } from '../hooks/useAuth';
import { LoginPage } from './LoginPage';
import { AnimatedPane } from './AnimatedPane';
import { COLOR_BG_PRIMARY, COLOR_BORDER, COLOR_TEXT } from '../lib/theme';
import { sendRequest } from '../lib/send-request';

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
  const horizontalGroupRef = useRef<GroupImperativeHandle>(null);
  const verticalGroupRef = useRef<GroupImperativeHandle>(null);
  const sizesLoadedRef = useRef(false);

  useEffect(() => {
    if (paneVisibility.left) leftPanelRef.current?.expand();
    else leftPanelRef.current?.collapse();
    if (paneVisibility.right) rightPanelRef.current?.expand();
    else rightPanelRef.current?.collapse();
    if (paneVisibility.bottom) bottomPanelRef.current?.expand();
    else bottomPanelRef.current?.collapse();
  }, [paneVisibility.left, paneVisibility.right, paneVisibility.bottom]);

  useEffect(() => {
    sendRequest<{ key: string; value: string | null }>('config.get', { key: 'ui_panel_sizes' })
      .then((response) => {
        if (response.value) {
          const sizes = JSON.parse(response.value) as {
            horizontal: { [id: string]: number };
            vertical: { [id: string]: number };
          };
          if (sizes.horizontal) {
            horizontalGroupRef.current?.setLayout(sizes.horizontal);
          }
          if (sizes.vertical) {
            verticalGroupRef.current?.setLayout(sizes.vertical);
          }
          if (!paneVisibility.left) leftPanelRef.current?.collapse();
          if (!paneVisibility.right) rightPanelRef.current?.collapse();
          if (!paneVisibility.bottom) bottomPanelRef.current?.collapse();
        }
      })
      .catch(() => {})
      .finally(() => {
        sizesLoadedRef.current = true;
      });
  }, [paneVisibility.left, paneVisibility.right, paneVisibility.bottom]);

  const handleHorizontalLayoutChanged = useCallback((layout: { [id: string]: number }) => {
    if (!sizesLoadedRef.current) return;
    if (Object.values(layout).some((v) => v < 1)) return;
    sendRequest('config.set', {
      key: 'ui_panel_sizes',
      value: JSON.stringify({
        horizontal: horizontalGroupRef.current?.getLayout() ?? {},
        vertical: verticalGroupRef.current?.getLayout() ?? {},
      }),
    }).catch(() => {});
  }, []);

  const handleVerticalLayoutChanged = useCallback((layout: { [id: string]: number }) => {
    if (!sizesLoadedRef.current) return;
    if (Object.values(layout).some((v) => v < 1)) return;
    sendRequest('config.set', {
      key: 'ui_panel_sizes',
      value: JSON.stringify({
        horizontal: horizontalGroupRef.current?.getLayout() ?? {},
        vertical: verticalGroupRef.current?.getLayout() ?? {},
      }),
    }).catch(() => {});
  }, []);

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
      <Group orientation="horizontal" groupRef={horizontalGroupRef} onLayoutChanged={handleHorizontalLayoutChanged} style={{ flex: 1, minHeight: 0 }}>
        {/* Left sidebar - workspace list */}
        <Panel
          id="left"
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
        <Separator style={{ width: '2px', background: COLOR_BORDER }} />

        {/* Center - main content with bottom panel */}
        <Panel id="center" defaultSize="55%" minSize="30%">
          <Group orientation="vertical" groupRef={verticalGroupRef} onLayoutChanged={handleVerticalLayoutChanged}>
            <Panel id="content" defaultSize="75%" minSize="30%">
              <main data-testid="main-content" style={{ height: '100%', overflow: 'auto' }}>
                {children ?? null}
              </main>
            </Panel>
            <Separator style={{ height: '2px', background: COLOR_BORDER }} />
            <Panel
              id="bottom"
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
        <Separator style={{ width: '2px', background: COLOR_BORDER }} />

        {/* Right sidebar - file tree */}
        <Panel
          id="right"
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
