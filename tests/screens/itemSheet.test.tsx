// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { ItemsScreen } from '@/components/items/ItemsScreen';
import { itemsActions, makeItem, renderScreen } from './setup';

vi.mock('@/app/actions/items', () => import('./setup').then((m) => m.itemsActionsModule));
vi.mock('@/app/actions/photos', () => ({ addPhoto: vi.fn(), deletePhoto: vi.fn() }));
vi.mock('@/lib/supabase/browser', () => ({ createClient: vi.fn() }));
vi.mock('next/navigation', () => import('./setup').then((m) => m.navigationModule));

const item = makeItem({ notes: 'Pedir cita por la tarde', dueAt: '2026-10-25T10:00:00.000Z' });
const screenUi = () => (
  <ItemsScreen title="Tareas" today="2026-10-22" sections={[{ key: 'a', items: [item] }]} />
);

async function openRow(user: ReturnType<typeof renderScreen>['user']) {
  await user.click(screen.getByRole('button', { name: 'Abrir «Llamar al dentista»' }));
  const dialog = await screen.findByRole('dialog', { name: 'Editar' });
  expect(dialog.getAttribute('data-open')).toBe('true');
  return dialog;
}

test('abrir una fila carga sus datos en la hoja', async () => {
  const { user } = renderScreen(screenUi());
  await openRow(user);

  expect((screen.getByLabelText('Título') as HTMLInputElement).value).toBe('Llamar al dentista');
  expect((screen.getByLabelText('Notas') as HTMLTextAreaElement).value).toBe('Pedir cita por la tarde');
  expect((screen.getByLabelText('Fecha') as HTMLInputElement).value).toBe('2026-10-25');
});

test('guardar manda el patch con el título y la fecha editados', async () => {
  const { user } = renderScreen(screenUi());
  await openRow(user);

  const title = screen.getByLabelText('Título');
  await user.clear(title);
  await user.type(title, 'Llamar al médico');
  const date = screen.getByLabelText('Fecha') as HTMLInputElement;
  await user.clear(date);
  await user.type(date, '2026-11-02');
  await user.click(screen.getByRole('button', { name: 'OK' }));

  await waitFor(() => expect(itemsActions.moveItem).toHaveBeenCalledTimes(1));
  const [id, patch] = itemsActions.moveItem.mock.calls[0];
  expect(id).toBe('item-1');
  expect(patch).toMatchObject({ title: 'Llamar al médico', type: 'tarea' });
  expect(JSON.stringify(patch.dueAt)).toContain('2026-11-0');
});

test('cerrar sin guardar no llama a ninguna acción', async () => {
  const { user } = renderScreen(screenUi());
  const dialog = await openRow(user);
  await user.type(screen.getByLabelText('Título'), ' (editado)');
  await user.click(screen.getByRole('button', { name: 'Cancelar' }));

  await waitFor(() => expect(dialog.getAttribute('data-open')).toBe('false'));

  expect(itemsActions.addItem).not.toHaveBeenCalled();
  expect(itemsActions.moveItem).not.toHaveBeenCalled();
  expect(itemsActions.toggleDone).not.toHaveBeenCalled();
  expect(itemsActions.deleteItem).not.toHaveBeenCalled();
});
