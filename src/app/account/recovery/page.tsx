import { AccountRecovery } from '@/components/account-security';
export const metadata = {
  title: 'Password recovery · Ascent',
  referrer: 'no-referrer',
  robots: { index: false, follow: false },
};
export default function Page() {
  return <AccountRecovery />;
}
