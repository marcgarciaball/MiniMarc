import { Suspense } from 'react';
import { LoginButton } from './LoginButton';
import './login.css';

const ERRORS: Record<string, string> = {
  no_autorizado: 'Esta cuenta no tiene acceso.',
  auth: 'No se pudo iniciar sesión. Inténtalo de nuevo.',
  credenciales: 'No se pudo guardar el acceso a Google Calendar. Inténtalo de nuevo.',
};

async function LoginError({ searchParams }: { searchParams: SearchParams }) {
  const { error } = await searchParams;
  const message = error ? (ERRORS[error] ?? ERRORS.auth) : null;
  return message ? <p role="alert">{message}</p> : null;
}

type SearchParams = Promise<{ error?: string }>;

export default function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="login">
      <div className="login__intro">
        <h1 className="ui-large-title">Agente Personal</h1>
        <p className="login__lead">Tareas, ideas, compras y regalos en un solo sitio.</p>
      </div>
      <div className="login__actions">
        <LoginButton />
        <Suspense fallback={null}>
          <LoginError searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}
