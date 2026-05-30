export type SplitDirection = 'horizontal' | 'vertical';

export type PaneNode = {
  id: string;
  type: 'pane';
};

export type SplitNode = {
  id: string;
  type: 'split';
  direction: SplitDirection;
  children: LayoutNode[];
  sizes?: number[];
};

export type LayoutNode = SplitNode | PaneNode;
