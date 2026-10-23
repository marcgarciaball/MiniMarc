// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { CaptureBar } from '@/components/CaptureBar';
import { fail } from '@/lib/actions/result';
import { captureActions, renderScreen } from './setup';

vi.mock('@/app/actions/capture', () => import('./setup').then((m) => m.captureActionsModule));
vi.mock('next/navigation', () => import('./setup').then((m) => m.navigationModule));

const field = () => screen.getByRole('textbox', { name: 'Apunta algo' }) as HTMLInputElement;

test('escribir y enviar llama a la acción de captura y vacía el campo', async () => {
  const { user } = renderScreen(<CaptureBar />);
  await user.type(field(), 'Pagar la luz');
  await user.keyboard('{Enter}');

  expect(await screen.findByText('Guardado')).toBeTruthy();
  expect(captureActions.quickCapture).toHaveBeenCalledTimes(1);
  const fd = captureActions.quickCapture.mock.calls[0][0] as FormData;
  expect(fd.get('text')).toBe('Pagar la luz');
  expect(field().value).toBe('');
});

test('si la captura falla, el toast lo dice y el texto no se pierde', async () => {
  captureActions.quickCapture.mockResolvedValue(fail('La IA no responde.'));
  const { user } = renderScreen(<CaptureBar />);
  await user.type(field(), 'Pagar la luz');
  await user.keyboard('{Enter}');

  expect(await screen.findByText('La IA no responde.')).toBeTruthy();
  expect(field().value).toBe('Pagar la luz');
});

test('no envía nada con el campo vacío', async () => {
  const { user } = renderScreen(<CaptureBar />);
  await user.click(field());
  await user.keyboard('{Enter}');
  await user.type(field(), '   {Enter}');

  expect((screen.getByRole('button', { name: 'Guardar' }) as HTMLButtonElement).disabled).toBe(true);
  expect(captureActions.quickCapture).not.toHaveBeenCalled();
});
