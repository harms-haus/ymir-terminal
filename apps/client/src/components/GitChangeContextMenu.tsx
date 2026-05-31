import * as ContextMenu from '@radix-ui/react-context-menu';
import { toast } from 'sonner';
import { COLOR_ERROR } from '../lib/theme';
import {
  getContextMenuCss,
  getMenuContainerStyle,
  menuItemStyle,
  separatorStyle,
} from '../lib/context-menu-styles';

import type { GitFileChangeStatus } from '@ymir/shared';

interface GitChangeContextMenuProps {
  path: string;
  status?: GitFileChangeStatus;
  isDirectory: boolean;
  isStaged: boolean;
  onStage?: (path: string) => void;
  onUnstage?: (path: string) => void;
  onDiscard?: (path: string) => void;
  onOpenDiff?: (path: string) => void;
  onOpenEditor?: (path: string) => void;
  children: React.ReactNode;
}

export function GitChangeContextMenu({
  path,
  status: _status,
  isDirectory,
  isStaged,
  onStage,
  onUnstage,
  onDiscard,
  onOpenDiff: _onOpenDiff,
  onOpenEditor,
  children,
}: GitChangeContextMenuProps) {
  const testId = 'git-change-context-menu';
  const css = getContextMenuCss(testId);

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content data-testid={testId} style={getMenuContainerStyle('180px')}>
          <style>{css}</style>

          {/* UNSTAGED file */}
          {!isStaged && !isDirectory && (
            <>
              <ContextMenu.Item
                data-testid="git-ctx-stage"
                onSelect={() => onStage?.(path)}
                style={menuItemStyle}
              >
                Stage
              </ContextMenu.Item>
              <ContextMenu.Item
                data-testid="git-ctx-discard"
                onSelect={() => {
                  if (window.confirm('Discard changes to ' + path + '?')) {
                    onDiscard?.(path);
                  }
                }}
                style={{ ...menuItemStyle, color: COLOR_ERROR }}
              >
                Discard Changes
              </ContextMenu.Item>
              <ContextMenu.Separator style={separatorStyle} />
              <ContextMenu.Item
                data-testid="git-ctx-diff"
                onSelect={() => toast.info('Diff viewer not yet implemented')}
                style={menuItemStyle}
              >
                View Diff
              </ContextMenu.Item>
              <ContextMenu.Item
                data-testid="git-ctx-open-editor"
                onSelect={() => onOpenEditor?.(path)}
                style={menuItemStyle}
              >
                Open in Editor
              </ContextMenu.Item>
            </>
          )}

          {/* STAGED file */}
          {isStaged && !isDirectory && (
            <>
              <ContextMenu.Item
                data-testid="git-ctx-unstage"
                onSelect={() => onUnstage?.(path)}
                style={menuItemStyle}
              >
                Unstage
              </ContextMenu.Item>
              <ContextMenu.Separator style={separatorStyle} />
              <ContextMenu.Item
                onSelect={() => toast.info('Diff viewer not yet implemented')}
                style={menuItemStyle}
              >
                View Diff
              </ContextMenu.Item>
              <ContextMenu.Item onSelect={() => onOpenEditor?.(path)} style={menuItemStyle}>
                Open in Editor
              </ContextMenu.Item>
            </>
          )}

          {/* UNSTAGED directory */}
          {!isStaged && isDirectory && (
            <>
              <ContextMenu.Item
                data-testid="git-ctx-stage-all"
                onSelect={() => onStage?.(path)}
                style={menuItemStyle}
              >
                Stage All
              </ContextMenu.Item>
              <ContextMenu.Item
                data-testid="git-ctx-discard-all"
                onSelect={() => {
                  if (window.confirm('Discard all changes in ' + path + '?')) {
                    onDiscard?.(path);
                  }
                }}
                style={{ ...menuItemStyle, color: COLOR_ERROR }}
              >
                Discard All
              </ContextMenu.Item>
            </>
          )}

          {/* STAGED directory */}
          {isStaged && isDirectory && (
            <ContextMenu.Item
              data-testid="git-ctx-unstage-all"
              onSelect={() => onUnstage?.(path)}
              style={menuItemStyle}
            >
              Unstage All
            </ContextMenu.Item>
          )}
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
