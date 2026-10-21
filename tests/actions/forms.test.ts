import { describe, expect, it } from 'vitest';
import { editPatchFromForm, newItemFormError, personFormError } from '@/lib/actions/forms';

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

describe('newItemFormError', () => {
  it('pide un título si está vacío', () => {
    expect(newItemFormError(form({ title: '   ' }))).toBe('Escribe un título.');
    expect(newItemFormError(form({ title: 'Leche' }))).toBeNull();
  });
});

describe('personFormError', () => {
  it('pide un nombre si está vacío', () => {
    expect(personFormError(form({ name: '' }))).toBe('Escribe un nombre.');
    expect(personFormError(form({ name: 'Ana' }))).toBeNull();
  });
});

describe('editPatchFromForm', () => {
  it('tarea: título, notas, área y fecha de Madrid', () => {
    const r = editPatchFromForm(form({ title: ' Dentista ', notes: '', dueDate: '2026-10-22', dueTime: '09:30' }), {
      type: 'tarea',
      area: 'trabajo',
    });
    expect(r).toEqual({
      ok: true,
      value: {
        title: 'Dentista',
        notes: null,
        type: 'tarea',
        area: 'trabajo',
        dueAt: '2026-10-22T07:30:00.000Z',
        hasTime: true,
        personId: null,
      },
    });
  });

  it('fecha inválida → error en español, sin patch', () => {
    expect(editPatchFromForm(form({ title: 'X', dueDate: '2026-02-30' }), { type: 'tarea', area: 'personal' })).toEqual({
      ok: false,
      error: 'La fecha no es válida.',
    });
  });

  it('título vacío → error', () => {
    expect(editPatchFromForm(form({ title: ' ' }), { type: 'idea', area: 'personal' })).toEqual({
      ok: false,
      error: 'Escribe un título.',
    });
  });

  it('regalo: guarda la persona; Sin clasificar: archiva la revisión', () => {
    const r = editPatchFromForm(form({ title: 'Libro', personId: 'p1' }), { type: 'regalo', area: 'personal', reviewMode: true });
    expect(r).toEqual({
      ok: true,
      value: { title: 'Libro', notes: null, type: 'regalo', personId: 'p1', needsReview: false },
    });
  });
});
