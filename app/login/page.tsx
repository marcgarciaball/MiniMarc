import Link from 'next/link';
import { Suspense } from 'react';
import { LoginButton } from './LoginButton';
import './login.css';

const ERRORS: Record<string, string> = {
  no_autorizado: 'Esta cuenta no tiene acceso.',
  auth: 'No se pudo iniciar sesión. Inténtalo de nuevo.',
  credenciales: 'No se pudo guardar el acceso a Google Calendar. Inténtalo de nuevo.',
};

async function LoginActions({ searchParams }: { searchParams: SearchParams }) {
  const { error, reconsent } = await searchParams;
  const message = error ? (ERRORS[error] ?? ERRORS.auth) : null;
  const askConsent = reconsent === '1';
  return (
    <>
      {askConsent && <p className="login__note">Google necesita confirmar el acceso a tu calendario.</p>}
      <LoginButton reconsent={askConsent} />
      {message && <p role="alert">{message}</p>}
    </>
  );
}

type SearchParams = Promise<{ error?: string; reconsent?: string }>;

export default function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="login">
      <div className="login__intro">
        <h1 className="ui-large-title">Agente Personal</h1>
        <p className="login__lead">Tareas, ideas, compras y regalos en un solo sitio.</p>
      </div>
      <div className="login__actions">
        <Suspense fallback={<LoginButton />}>
          <LoginActions searchParams={searchParams} />
        </Suspense>
        <Link href="/privacidad" className="login__privacy">
          Privacidad
        </Link>
      </div>
    </main>
  );
}
