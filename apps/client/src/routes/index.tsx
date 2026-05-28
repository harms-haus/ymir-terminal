import { createRoute } from '@tanstack/react-router';
import { Route as rootRoute } from './__root';
import { WorkspaceView } from '../components/WorkspaceView';

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: () => <WorkspaceView />,
});
