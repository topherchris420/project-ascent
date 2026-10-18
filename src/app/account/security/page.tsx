import { AccountSecurity } from '@/components/account-security';
export const metadata = {
  title: 'Account security · Ascent',
  referrer: 'no-referrer',
  robots: { index: false, follow: false },
};
export default function Page() {
  return <AccountSecurity />;
}
