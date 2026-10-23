import type { Metadata } from 'next';
import { SharedRooms } from '@/components/shared-rooms';
export const metadata: Metadata = {
  title: 'Shared rooms · Ascent',
  description: 'Transaction Rooms that homeowners shared with you, limited to the sections they chose.',
  robots: { index: false },
  referrer: 'no-referrer',
};
export default function SharedRoomsPage() {
  return <SharedRooms />;
}
