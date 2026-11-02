import { SiteBrand } from '@/components/site-chrome';

export default function Loading() {
  return (
    <div className="studio-page">
      <main className="public-main public-status public-loading" aria-busy="true">
        <SiteBrand />
        <p role="status">Opening Ascent…</p>
      </main>
    </div>
  );
}
