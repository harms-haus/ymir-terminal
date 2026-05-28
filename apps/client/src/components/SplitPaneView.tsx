import React, { Fragment } from 'react';
import { Group, Panel, Separator } from 'react-resizable-panels';
import type { LayoutNode, SplitNode } from '@ymir/shared';

interface SplitPaneViewProps {
  layout: LayoutNode;
  renderPane: (paneId: string) => React.ReactNode;
}

export function SplitPaneView({ layout, renderPane }: SplitPaneViewProps) {
  if (layout.type === 'pane') {
    return <div data-testid={`pane-${layout.id}`}>{renderPane(layout.id)}</div>;
  }

  const split = layout as SplitNode;
  return (
    <Group orientation={split.direction === 'horizontal' ? 'horizontal' : 'vertical'}>
      {split.children.map((child, i) => (
        <Fragment key={child.id}>
          {i > 0 && (
            <Separator
              style={
                split.direction === 'horizontal'
                  ? { width: '2px', background: '#333' }
                  : { height: '2px', background: '#333' }
              }
            />
          )}
          <Panel defaultSize={split.sizes?.[i] || 100 / split.children.length}>
            <SplitPaneView layout={child} renderPane={renderPane} />
          </Panel>
        </Fragment>
      ))}
    </Group>
  );
}
