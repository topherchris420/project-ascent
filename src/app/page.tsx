import WorkspaceApp from '@/components/workspace';
import { workspaceIsAvailable } from '@/lib/deployment';
export default function Page() {
  return <WorkspaceApp workspaceAvailable={workspaceIsAvailable()} />;
}
