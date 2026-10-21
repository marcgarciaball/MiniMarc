export type ItemType = 'tarea' | 'idea' | 'compra' | 'regalo';
export type Area = 'personal' | 'trabajo';
export type ItemStatus = 'pendiente' | 'hecho' | 'archivado';
export type Origin = 'web' | 'siri' | 'extension';

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
}

export interface Person {
  id: string;
  name: string;
  /** 'YYYY-MM-DD' */
  birthday: string | null;
  notes: string | null;
}
