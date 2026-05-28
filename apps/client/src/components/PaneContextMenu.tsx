import * as ContextMenu from '@radix-ui/react-context-menu';

interface PaneContextMenuProps {
  paneId: string;
  isOnlyPane: boolean;
  onSplitRight?: (paneId: string) => void;
  onSplitDown?: (paneId: string) => void;
  onClosePane?: (paneId: string) => void;
  children: React.ReactNode;
}

export function PaneContextMenu({ paneId, isOnlyPane, onSplitRight, onSplitDown, onClosePane, children }: PaneContextMenuProps) {
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content
          data-testid="pane-context-menu"
          style={{
            background: '#252526',
            border: '1px solid #333',
            borderRadius: '4px',
            padding: '4px 0',
            minWidth: '160px',
            zIndex: 1000,
          }}
        >
          <ContextMenu.Item
            data-testid="split-right"
            onSelect={() => onSplitRight?.(paneId)}
            style={{ padding: '6px 12px', cursor: 'pointer', fontSize: '13px', color: '#ccc', outline: 'none' }}
          >
            Split Right
          </ContextMenu.Item>
          <ContextMenu.Item
            data-testid="split-down"
            onSelect={() => onSplitDown?.(paneId)}
            style={{ padding: '6px 12px', cursor: 'pointer', fontSize: '13px', color: '#ccc', outline: 'none' }}
          >
            Split Down
          </ContextMenu.Item>
          <ContextMenu.Separator style={{ height: '1px', background: '#333', margin: '4px 0' }} />
          <ContextMenu.Item
            data-testid="close-pane"
            disabled={isOnlyPane}
            onSelect={() => onClosePane?.(paneId)}
            style={{
              padding: '6px 12px',
              cursor: isOnlyPane ? 'not-allowed' : 'pointer',
              fontSize: '13px',
              color: isOnlyPane ? '#666' : '#c74e39',
              outline: 'none',
            }}
          >
            Close Pane
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
