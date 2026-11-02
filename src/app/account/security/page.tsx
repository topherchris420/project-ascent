import { AccountSecurity } from '@/components/account-security';
import { SiteFooter, SiteHeader } from '@/components/site-chrome';
export const metadata = {
  title: 'Account security · Ascent',
  referrer: 'no-referrer',
  robots: { index: false, follow: false },
};
export default function Page() {
  return (
    <div className="studio-page">
      <SiteHeader label="Account" />
      <AccountSecurity />
      <SiteFooter />
    </div>
  );
}
