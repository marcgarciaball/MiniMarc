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

describe('0003_source_text.sql', () => {
  const s = sql('0003_source_text.sql');

  it('añade items.source_text como texto opcional', () => {
    expect(s).toMatch(/alter table public\.items\s+add column if not exists source_text text;/);
    expect(s).not.toMatch(/source_text text not null/);
  });

  it('indexa la búsqueda de duplicados: usuario y fecha, solo capturas no eliminadas', () => {
    expect(s).toMatch(
      /create index if not exists items_recent_captures_idx\s+on public\.items \(user_id, created_at desc\)\s+where deleted_at is null and source_text is not null;/,
    );
  });
});

describe('0004_cron.sql', () => {
  const raw = readFileSync(path.join(__dirname, '../../supabase/migrations/0004_cron.sql'), 'utf8');
  const s = sql('0004_cron.sql');

  it('añade el titular cacheado a settings', () => {
    expect(s).toMatch(/add column if not exists last_digest_headline text/);
    expect(s).toMatch(/add column if not exists last_digest_headline_date date/);
  });

  it('activa pg_cron y pg_net y programa un trabajo cada hora en el minuto 0', () => {
    expect(s).toMatch(/create extension if not exists pg_cron/);
    expect(s).toMatch(/create extension if not exists pg_net/);
    expect(s).toMatch(/cron\.schedule\(\s*'agente-resumen-manana',\s*'0 \* \* \* \*'/);
    expect(s).toMatch(/net\.http_post\(/);
    expect(s).toMatch(/'\/api\/cron\/morning'/);
  });

  it('es idempotente: desprograma el trabajo antes de programarlo', () => {
    expect(s.indexOf("cron.unschedule('agente-resumen-manana')")).toBeGreaterThan(-1);
    expect(s.indexOf("cron.unschedule('agente-resumen-manana')")).toBeLessThan(s.indexOf('cron.schedule('));
  });

  it('lee la URL y el secreto de Vault; ningún secreto en el SQL', () => {
    expect(s).toMatch(/from vault\.decrypted_secrets where name = 'app_url'/);
    expect(s).toMatch(/from vault\.decrypted_secrets where name = 'cron_secret'/);
    expect(s).toMatch(/'Authorization', 'Bearer ' \|\|/);
    expect(raw).not.toMatch(/[0-9a-f]{32,}/i);
    expect(s).not.toMatch(/vault\.create_secret/);
  });
});

describe('0005_photos.sql', () => {
  const s = sql('0005_photos.sql');

  it('crea el bucket privado photos con límite de tamaño y tipos de imagen, idempotente', () => {
    expect(s).toMatch(/insert into storage\.buckets[^;]*values \('photos', 'photos', false, 8388608,/);
    expect(s).toMatch(/'image\/jpeg', 'image\/png', 'image\/webp', 'image\/heic'/);
    expect(s).toMatch(/on conflict \(id\) do update set\s+public = false/);
  });

  it.each(['select', 'insert', 'update', 'delete'])(
    'storage.objects (%s): solo la carpeta {auth.uid()} y el usuario permitido',
    (op) => {
      expect(s).toMatch(new RegExp(`drop policy if exists photos_owner_${op} on storage\\.objects;`));
      const policy = new RegExp(`create policy photos_owner_${op} on storage\\.objects\\s+for ${op} to authenticated[^;]*;`);
      const body = s.match(policy)?.[0] ?? '';
      expect(body).toMatch(/bucket_id = 'photos'/);
      expect(body).toMatch(/\(storage\.foldername\(name\)\)\[1\] = \(select auth\.uid\(\)\)::text/);
      expect(body).toMatch(/\(select private\.is_allowed_user\(\)\)/);
    },
  );

  it('item_photos: cascada desde items, user_id por defecto auth.uid() y RLS como en 0002', () => {
    expect(s).toMatch(/create table if not exists public\.item_photos/);
    expect(s).toMatch(/item_id\s+uuid not null references public\.items\(id\) on delete cascade/);
    expect(s).toMatch(/user_id\s+uuid not null default auth\.uid\(\)/);
    expect(s).toMatch(/path\s+text not null/);
    expect(s).toMatch(/alter table public\.item_photos enable row level security;/);
    expect(s).toMatch(/drop policy if exists item_photos_owner on public\.item_photos;/);
    expect(s).toMatch(
      /create policy item_photos_owner on public\.item_photos[^;]*using \(user_id = \(select auth\.uid\(\)\) and \(select private\.is_allowed_user\(\)\)\)\s+with check \(user_id = \(select auth\.uid\(\)\) and \(select private\.is_allowed_user\(\)\)\);/,
    );
  });

  it('el bucket no es público', () => {
    expect(s).not.toMatch(/'photos', 'photos', true/);
  });
});

describe('0006_person_dates.sql', () => {
  const s = sql('0006_person_dates.sql');

  it('person_dates: cascada desde people, columnas y valores por defecto', () => {
    expect(s).toMatch(/create table if not exists public\.person_dates/);
    expect(s).toMatch(/person_id\s+uuid not null references public\.people\(id\) on delete cascade/);
    expect(s).toMatch(/user_id\s+uuid not null default auth\.uid\(\)/);
    expect(s).toMatch(/label\s+text not null/);
    expect(s).toMatch(/date\s+date not null/);
    expect(s).toMatch(/yearly\s+boolean not null default true/);
    expect(s).toMatch(/notes\s+text,/);
    expect(s).toMatch(/created_at\s+timestamptz not null default now\(\)/);
  });

  it('RLS como en 0002 (propietario y usuario permitido), idempotente', () => {
    expect(s).toMatch(/alter table public\.person_dates enable row level security;/);
    expect(s).toMatch(/drop policy if exists person_dates_owner on public\.person_dates;/);
    expect(s).toMatch(
      /create policy person_dates_owner on public\.person_dates[^;]*using \(user_id = \(select auth\.uid\(\)\) and \(select private\.is_allowed_user\(\)\)\)\s+with check \(user_id = \(select auth\.uid\(\)\) and \(select private\.is_allowed_user\(\)\)\);/,
    );
    expect(s).not.toMatch(/create (table|index) (?!if not exists)/);
  });
});

describe('0007_weekly.sql', () => {
  const s = sql('0007_weekly.sql');

  it('añade a settings el resumen semanal (lunes por defecto), la última semana y la frase cacheada', () => {
    expect(s).toMatch(/add column if not exists weekly_digest text not null default 'lunes'/);
    expect(s).toMatch(/add column if not exists last_weekly_date date/);
    expect(s).toMatch(/add column if not exists last_week_headline text/);
    expect(s).toMatch(/add column if not exists last_week_headline_week date/);
  });

  it('solo admite lunes, domingo u off, sin fallar al repetirse', () => {
    expect(s).toMatch(/if not exists \(select 1 from pg_constraint where conname = 'settings_weekly_digest_check'\)/);
    expect(s).toMatch(/check \(weekly_digest in \('lunes', 'domingo', 'off'\)\)/);
  });

  it('RLS de settings como en 0002: propietario y usuario permitido', () => {
    expect(s).toMatch(/alter table public\.settings enable row level security;/);
    expect(s).toMatch(/drop policy if exists settings_owner on public\.settings;/);
    expect(s).toMatch(
      /create policy settings_owner on public\.settings\s+for all to authenticated\s+using \(user_id = \(select auth\.uid\(\)\) and \(select private\.is_allowed_user\(\)\)\)\s+with check \(user_id = \(select auth\.uid\(\)\) and \(select private\.is_allowed_user\(\)\)\);/,
    );
  });
});
