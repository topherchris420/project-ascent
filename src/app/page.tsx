import { AscentEntry } from '@/components/ascent-entry';
import { workspaceIsAvailable } from '@/lib/deployment';
import { cookies } from 'next/headers';
export default async function Page({ searchParams }: { searchParams: Promise<{ invite?: string | string[] }> }) {
  const cookieStore = await cookies();
  const params = await searchParams;
  return (
    <AscentEntry
      resumeWorkspace={cookieStore.has('ascent_session') || typeof params.invite === 'string'}
      workspaceAvailable={workspaceIsAvailable()}
    />
  );
}
