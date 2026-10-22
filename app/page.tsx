import { redirect } from 'next/navigation';

/** The app opens on Hoy (the morning digest). */
export default function Home() {
  redirect('/hoy');
}
