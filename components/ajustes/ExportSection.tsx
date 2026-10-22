import { InsetList } from '@/components/ui';

const FORMATS = [
  { fmt: 'json', title: 'Exportar todo (JSON)', subtitle: 'Elementos, papelera, personas, fechas, fotos y ajustes.' },
  { fmt: 'csv', title: 'Exportar elementos (CSV)', subtitle: 'Para abrir en Numbers o Excel.' },
] as const;

/**
 * Ajustes → "Tus datos": plain links (not next/link, so nothing prefetches the download) to
 * GET /api/export, which needs the session.
 */
export function ExportSection() {
  return (
    <InsetList header="Tus datos" footer="Una copia de todo lo tuyo, para guardarla donde quieras.">
      {FORMATS.map((f) => (
        <a key={f.fmt} className="ui-row" href={`/api/export?fmt=${f.fmt}`} download>
          <span className="ui-row__body">
            <span className="ui-row__text">
              <span className="ui-row__title">{f.title}</span>
              <span className="ui-row__subtitle">{f.subtitle}</span>
            </span>
          </span>
        </a>
      ))}
    </InsetList>
  );
}
