import { redirect } from 'next/navigation';

export default function Home() {
  redirect('/fraction-target?view=teacher');
}
