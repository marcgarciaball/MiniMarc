import type { Metadata } from 'next';
import Link from 'next/link';
import { Glass } from '@/components/ui';
import './privacidad.css';

export const metadata: Metadata = {
  title: 'Privacidad · Agente Personal',
};

/** Public privacy policy (Google requires its URL to publish the OAuth app). */
export default function PrivacidadPage() {
  return (
    <main className="privacidad">
      <h1 className="ui-large-title">Privacidad</h1>
      <Glass as="section" className="privacidad__card">
        <p>
          Agente Personal es una app privada de un solo usuario: la usa y la gestiona Marc, su dueño. Nadie más
          tiene cuenta.
        </p>

        <h2>Qué datos guarda</h2>
        <p>
          Tareas, ideas, compras, regalos, personas y sus cumpleaños. Se guardan en Supabase, en servidores de la
          Unión Europea.
        </p>

        <h2>Google Calendar</h2>
        <p>El acceso a Google Calendar se usa solo para crear y leer sus eventos y recordatorios.</p>

        <h2>Gemini</h2>
        <p>
          El texto personal (no de trabajo) que se captura puede enviarse a Gemini para clasificarlo. El contenido
          de trabajo nunca se envía.
        </p>

        <h2>Nada se vende ni se comparte</h2>
        <p>Los datos no se venden ni se comparten con nadie.</p>

        <h2>Exportar y borrar</h2>
        <p>Los datos se pueden exportar y borrar cuando se pida.</p>
      </Glass>
      <Link href="/login" className="privacidad__back">
        Volver
      </Link>
    </main>
  );
}
