/**
 * The work-token rule (I-2): a token whose name contains "trabajo" (any case) captures
 * everything to Trabajo and never reaches the AI (lib/capture/handler.ts). Shared with Ajustes →
 * Tokens, so the "Solo Trabajo" switch and the badge use the exact rule the server applies.
 * Pure: safe in client components.
 */
export const WORK_TOKEN_WORD = 'trabajo';

export function isWorkTokenName(name: string): boolean {
  return name.toLowerCase().includes(WORK_TOKEN_WORD);
}

/** The name to create: trimmed, plus " trabajo" when the switch is on and the name lacks it. */
export function workTokenName(name: string, workOnly: boolean): string {
  const trimmed = name.trim();
  if (!trimmed || !workOnly || isWorkTokenName(trimmed)) return trimmed;
  return `${trimmed} ${WORK_TOKEN_WORD}`;
}
