'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { InsetList, Row } from '@/components/ui';

type Status = 'unknown' | 'unsupported' | 'ios-install' | 'default' | 'denied' | 'granted';

function isIos(): boolean {
  return /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
}

/** What this browser allows. iOS only offers Web Push to the app installed on the home screen. */
function browserStatus(): Status {
  if (isIos() && !isStandalone()) return 'ios-install';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  return Notification.permission === 'denied' ? 'denied' : 'default';
}

const noSubscribe = () => () => {};

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const b64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Subscribes this device (or reuses its subscription) and saves it on the server. */
async function subscribe(publicKey: string): Promise<void> {
  const reg = (await navigator.serviceWorker.getRegistration('/')) ?? (await navigator.serviceWorker.register('/sw.js', { scope: '/' }));
  await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
  const res = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sub.toJSON()),
  });
  if (!res.ok) throw new Error(`subscribe ${res.status}`);
}

/**
 * "Activar notificaciones" for the morning digest. Shown only while push is possible and not yet
 * granted; on an iPhone outside the installed app it explains how to install it first. Once
 * granted, each visit quietly re-saves this device's subscription (the server may have dropped it).
 */
export function PushButton({ publicKey }: { publicKey: string }) {
  const browser = useSyncExternalStore(noSubscribe, browserStatus, () => 'unknown' as Status);
  const [result, setResult] = useState<'busy' | 'granted' | 'denied' | 'error' | null>(null);
  const status = result ?? browser;

  useEffect(() => {
    if (browser === 'granted') subscribe(publicKey).catch(() => {});
  }, [browser, publicKey]);

  async function activate() {
    setResult('busy');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setResult(permission === 'denied' ? 'denied' : null);
        return;
      }
      await subscribe(publicKey);
      setResult('granted');
    } catch {
      setResult('error');
    }
  }

  if (status === 'unknown' || status === 'unsupported' || status === 'granted') return null;

  if (status === 'ios-install') {
    return (
      <InsetList
        header="Notificaciones"
        footer="En el iPhone, las notificaciones solo funcionan con la app instalada: en Safari, Compartir → Añadir a pantalla de inicio, y ábrela desde el icono."
      >
        <Row title="Activar notificaciones" subtitle="Primero instala la app" />
      </InsetList>
    );
  }

  if (status === 'denied') {
    return (
      <InsetList header="Notificaciones" footer="Las notificaciones están bloqueadas. Actívalas en los ajustes del navegador o del sistema para esta app.">
        <Row title="Notificaciones bloqueadas" />
      </InsetList>
    );
  }

  return (
    <InsetList
      header="Notificaciones"
      footer={status === 'error' ? 'No se han podido activar. Revisa la conexión e inténtalo de nuevo.' : 'Un aviso cada mañana con el resumen del día.'}
    >
      <Row title={status === 'busy' ? 'Activando…' : 'Activar notificaciones'} onClick={status === 'busy' ? undefined : activate} />
    </InsetList>
  );
}
