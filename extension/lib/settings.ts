/**
 * The extension's settings, in chrome.storage.local (not `sync`: the token stays on this
 * machine). Never logs the token.
 */
import { DEFAULT_BASE_URL } from './api.js';

export type ExtSettings = { baseUrl: string; token: string; area: 'personal' | 'trabajo' };

export async function loadSettings(): Promise<ExtSettings> {
  const s = await chrome.storage.local.get(['baseUrl', 'token', 'area']);
  return {
    baseUrl: typeof s.baseUrl === 'string' && s.baseUrl.trim() ? s.baseUrl.trim() : DEFAULT_BASE_URL,
    token: typeof s.token === 'string' ? s.token.trim() : '',
    area: s.area === 'trabajo' ? 'trabajo' : 'personal',
  };
}

export async function saveSettings(patch: Partial<ExtSettings>): Promise<void> {
  await chrome.storage.local.set(patch);
}
