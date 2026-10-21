/**
 * Static guards on the SQL migrations (no Postgres in CI/sandbox). They pin the single-user
 * rule (I-1) and the service-role-only google_credentials (M-1); the SQL itself is run by Marc.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = (name: string) =>
  readFileSync(path.join(__dirname, '../../supabase/migrations', name), 'utf8').replace(/--.*$/gm, '');

describe('0002_single_user.sql', () => {
  const s = sql('0002_single_user.sql');

  it('rechaza en auth.users cualquier alta que no sea el correo permitido', () => {
    expect(s).toMatch(/create trigger single_user_only\s+before insert or update of email on auth\.users/);
    expect(s).toMatch(/if not private\.is_allowed_email\(new\.email\) then\s+raise exception/);
  });

  it('falla cerrado si no hay correo configurado', () => {
    expect(s).toMatch(/coalesce\([\s\S]*?,\s*false\s*\)/);
  });

  it.each(['people', 'items', 'api_tokens', 'settings', 'push_subscriptions'])(
    'la política de %s exige propietario y usuario permitido, en using y with check',
    (table) => {
      const policy = new RegExp(
        `create policy ${table}_owner on public\\.${table}[^;]*using \\(user_id = \\(select auth\\.uid\\(\\)\\) and \\(select private\\.is_allowed_user\\(\\)\\)\\)\\s+with check \\(user_id = \\(select auth\\.uid\\(\\)\\) and \\(select private\\.is_allowed_user\\(\\)\\)\\);`,
      );
      expect(s).toMatch(new RegExp(`drop policy if exists ${table}_owner on public\\.${table};`));
      expect(s).toMatch(policy);
    },
  );

  it('google_credentials: sin política ni permisos para anon/authenticated', () => {
    expect(s).toMatch(/drop policy if exists google_credentials_owner on public\.google_credentials;/);
    expect(s).toMatch(/revoke all on public\.google_credentials from anon, authenticated;/);
    expect(s).not.toMatch(/create policy google_credentials/);
  });

  it('la configuración vive en un esquema sin acceso para el navegador', () => {
    expect(s).toMatch(/revoke all on private\.app_config from public, anon, authenticated;/);
    expect(s).not.toMatch(/grant [^;]* on private\.app_config/);
  });
});
