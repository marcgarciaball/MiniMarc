import { redirect } from 'next/navigation';

/** Hoy lands in a later task; until then the app opens on Tareas. */
export default function Home() {
  redirect('/tareas');
}
