import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Ascent · Real estate, reasoned.', description: 'An evidence-led workspace for property decisions, clients, and closings.' };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="en"><body>{children}</body></html>; }
