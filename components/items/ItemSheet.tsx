'use client';

import { useRef, useState, useTransition, type FormEvent, type TransitionStartFunction } from 'react';
import { InsetList, Segmented, Sheet } from '@/components/ui';
import { editPatchFromForm, newItemFormError } from '@/lib/actions/forms';
import type { MovePatch } from '@/lib/actions/items';
import type { ActionResult } from '@/lib/actions/result';
import type { Area, Item, ItemType, Person } from '@/lib/db/types';
import { madridDateTime } from '@/lib/time';

export type NewItemDefaults = { type: ItemType; area?: Area; personId?: string; label: string };

export type SheetMode = { kind: 'new'; defaults: NewItemDefaults } | { kind: 'edit'; item: Item };

const AREA_OPTIONS = [
  { value: 'personal', label: 'Personal' },
  { value: 'trabajo', label: 'Trabajo' },
] as const;

const TYPE_OPTIONS: { value: ItemType; label: string }[] = [
  { value: 'tarea', label: 'Tareas' },
  { value: 'idea', label: 'Ideas' },
  { value: 'compra', label: 'Compras' },
  { value: 'regalo', label: 'Regalos' },
];

export type ItemSheetProps = {
  open: boolean;
  mode: SheetMode;
  people: Person[];
  /** Sin clasificar: saving files the item (clears needsReview). */
  reviewMode?: boolean;
  onClose: () => void;
  /** Must not throw; on `ok: false` the sheet stays open with the typed text and shows `error`. */
  onCreate: (fd: FormData) => Promise<ActionResult<unknown>>;
  onSave: (item: Item, patch: MovePatch) => Promise<ActionResult<unknown>>;
  onComplete: (item: Item) => void;
  onArchive: (item: Item) => void;
  onDelete: (item: Item) => void;
};

const FORM_ID = 'item-sheet-form';

/** Add or edit an item. Also the non-gesture way to complete, archive or delete (reduced motion, keyboard). */
export function ItemSheet(props: ItemSheetProps) {
  const { open, mode, onClose } = props;
  const [pending, startTransition] = useTransition();
  const editing = mode.kind === 'edit' ? mode.item : null;
  const title = editing ? (props.reviewMode ? 'Clasificar' : 'Editar') : mode.kind === 'new' ? mode.defaults.label : '';

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      leading={
        <button type="button" className="ui-bar-button" onClick={onClose}>
          Cancelar
        </button>
      }
      trailing={
        <button type="submit" form={FORM_ID} className="ui-bar-button ui-bar-button--strong" disabled={pending}>
          {editing ? 'OK' : 'Añadir'}
        </button>
      }
    >
      {/* Remount per item so the uncontrolled fields start from its values. A new item's fields
          reset only when the sheet closes, which happens only after a successful save. */}
      <ItemForm key={editing ? editing.id : `new-${String(open)}`} {...props} startTransition={startTransition} />
    </Sheet>
  );
}

type ItemFormProps = ItemSheetProps & { startTransition: TransitionStartFunction };

function ItemForm(props: ItemFormProps) {
  const { mode, people, reviewMode, onClose, onCreate, onSave, onComplete, onArchive, onDelete, startTransition } = props;
  const item = mode.kind === 'edit' ? mode.item : null;
  const defaults = mode.kind === 'new' ? mode.defaults : null;
  const [type, setType] = useState<ItemType>(item?.type ?? defaults?.type ?? 'tarea');
  const [area, setArea] = useState<Area>(item?.area ?? defaults?.area ?? 'personal');
  const [error, setError] = useState<string | null>(null);
  // Blocks a second submit (double tap, Enter) before `pending` re-renders the button.
  const inFlight = useRef(false);
  const due = item?.dueAt ? madridDateTime(new Date(item.dueAt)) : null;

  // onSubmit, not <form action>: React resets an action form's fields when the action ends,
  // which would wipe the typed text on failure.
  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (inFlight.current) return;
    const fd = new FormData(e.currentTarget);
    let call: () => Promise<ActionResult<unknown>>;
    if (item) {
      const patch = editPatchFromForm(fd, { type, area, reviewMode });
      if (!patch.ok) return setError(patch.error);
      call = () => onSave(item, patch.value);
    } else {
      const invalid = newItemFormError(fd);
      if (invalid) return setError(invalid);
      call = () => onCreate(fd);
    }
    setError(null);
    inFlight.current = true;
    startTransition(async () => {
      const result = await call();
      inFlight.current = false;
      startTransition(() => {
        if (result.ok) onClose();
        else setError(result.error);
      });
    });
  }

  return (
    <form id={FORM_ID} onSubmit={handleSubmit} className="app-form">
      <input type="hidden" name="type" value={type} />
      {type === 'tarea' && <input type="hidden" name="area" value={area} />}
      <InsetList>
        <input
          className="app-input app-input--title"
          name="title"
          defaultValue={item?.title}
          placeholder="Título"
          aria-label="Título"
          autoComplete="off"
          enterKeyHint="done"
        />
        <textarea
          className="app-input app-input--notes"
          name="notes"
          defaultValue={item?.notes ?? ''}
          placeholder="Notas"
          aria-label="Notas"
          rows={2}
        />
      </InsetList>

      {item && (
        <InsetList header="Lista">
          <label className="app-field">
            <span>Mover a</span>
            <select className="app-input" value={type} onChange={(e) => setType(e.target.value as ItemType)}>
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </InsetList>
      )}

      {type === 'tarea' && (
        <>
          <div className="app-form__segmented">
            <Segmented label="Área" options={[...AREA_OPTIONS]} value={area} onChange={setArea} />
          </div>
          <InsetList footer={area === 'trabajo' ? 'Las tareas de Trabajo no se envían a la IA.' : undefined}>
            <label className="app-field">
              <span>Fecha</span>
              <input className="app-input" type="date" name="dueDate" defaultValue={due?.date} />
            </label>
            <label className="app-field">
              <span>Hora</span>
              <input className="app-input" type="time" name="dueTime" defaultValue={item?.hasTime ? due?.time : undefined} />
            </label>
          </InsetList>
        </>
      )}

      {type === 'regalo' && (
        <InsetList>
          <label className="app-field">
            <span>Para</span>
            <select className="app-input" name="personId" defaultValue={item?.personId ?? defaults?.personId ?? ''}>
              <option value="">Sin persona</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </InsetList>
      )}

      {error && (
        <p className="app-form__error" role="alert">
          {error}
        </p>
      )}

      {item && (
        <InsetList>
          <button type="button" className="ui-row app-action" onClick={() => onComplete(item)}>
            Marcar como hecho
          </button>
          <button type="button" className="ui-row app-action" onClick={() => onArchive(item)}>
            Archivar
          </button>
          <button type="button" className="ui-row app-action app-action--destructive" onClick={() => onDelete(item)}>
            Eliminar
          </button>
        </InsetList>
      )}
    </form>
  );
}
