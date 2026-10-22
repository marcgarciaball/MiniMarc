export type ItemType = 'tarea' | 'idea' | 'compra' | 'regalo' | 'libro';
export type Area = 'personal' | 'trabajo';
export type ItemStatus = 'pendiente' | 'hecho' | 'archivado';
export type Origin = 'web' | 'siri' | 'extension';
/** Only libros have one; every other item has null. */
export type ReadingState = 'por_leer' | 'leyendo' | 'leido';

export interface Item {
  id: string;
  type: ItemType;
  title: string;
  notes: string | null;
  area: Area | null;
  /** ISO 8601 (UTC). */
  dueAt: string | null;
  hasTime: boolean;
  status: ItemStatus;
  personId: string | null;
  origin: Origin;
  needsReview: boolean;
  confidence: number | null;
  calendarEventId: string | null;
  syncError: string | null;
  /** The whole captured text (Siri, extension, web) this item came from; null if made by hand. */
  sourceText: string | null;
  /** Libro: its author (kept on the item so a future search finds it). */
  author: string | null;
  /** Libro: 'por_leer' (default), 'leyendo' or 'leido'. 'leido' ⇔ status 'hecho'. Null otherwise. */
  readingState: ReadingState | null;
  /**
   * The item's link: a libro's ficha, tienda o reseña, or the first URL of the title or notes
   * (set on save by deriveLink, lib/links/linkify.ts).
   */
  link: string | null;
  /** Link preview (0009), fetched on the server after saving: page title, og:image URL, site name. */
  linkTitle: string | null;
  linkImage: string | null;
  /** Set on every preview attempt (the domain when the page gives no site name); null = not fetched yet. */
  linkSite: string | null;
  createdAt: string;
  deletedAt: string | null;
}

/** Campos obligatorios: type y title; el resto toma valores por defecto. */
export type NewItem = Pick<Item, 'type' | 'title'> &
  Partial<Omit<Item, 'id' | 'type' | 'title' | 'createdAt' | 'deletedAt'>>;

export type ItemPatch = Partial<Omit<Item, 'id' | 'createdAt' | 'deletedAt'>>;

export interface ItemFilter {
  type?: ItemType;
  area?: Area;
  status?: ItemStatus;
  needsReview?: boolean;
  /** Only items created at or after this ISO instant (Bandeja "Recién añadido"). */
  createdSince?: string;
}

export interface Person {
  id: string;
  name: string;
  /** 'YYYY-MM-DD' */
  birthday: string | null;
  notes: string | null;
}

/** A special date of a person besides the birthday (person_dates row). */
export interface PersonDate {
  id: string;
  personId: string;
  /** "Aniversario", "Santo", "Nos conocimos"… */
  label: string;
  /** 'YYYY-MM-DD'. Year NO_YEAR (1604, as Apple Contacts does) = year unknown. */
  date: string;
  /** Repeats every year (default); false = a one-off date. */
  yearly: boolean;
  notes: string | null;
  createdAt: string;
}

export type NewPersonDate = Pick<PersonDate, 'personId' | 'label' | 'date'> &
  Partial<Pick<PersonDate, 'yearly' | 'notes'>>;

export type PersonDatePatch = Partial<Pick<PersonDate, 'label' | 'date' | 'yearly' | 'notes'>>;
