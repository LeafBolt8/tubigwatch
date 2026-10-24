'use client';

import { useState, useSyncExternalStore } from 'react';
import { Bell } from 'lucide-react';

type Favorite = { type: 'city' | 'barangay'; name: string };

const FAVORITES_KEY = 'tubigwatch_favorites_v2';
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const bytes = new Uint8Array(rawData.length);
  for (let index = 0; index < rawData.length; index += 1) {
    bytes[index] = rawData.charCodeAt(index);
  }
  return bytes;
}

// Gates the browser-only render until after hydration without a setState-in-effect.
const subscribeToNothing = () => () => {};
const getMountedSnapshot = () => true;
const getServerMountedSnapshot = () => false;

/**
 * Reads the same typed favorites the dashboard pins write. Invalid or legacy entries are
 * ignored here too, so a corrupt localStorage value cannot block the subscription.
 */
function readFavorites(): Favorite[] {
  try {
    const raw = window.localStorage.getItem(FAVORITES_KEY);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter((value): value is Favorite => {
      if (!value || typeof value !== 'object') return false;
      const candidate = value as { type?: unknown; name?: unknown };
      return (
        (candidate.type === 'city' || candidate.type === 'barangay') &&
        typeof candidate.name === 'string' &&
        candidate.name.length > 0
      );
    });
  } catch {
    return [];
  }
}

export default function EnablePush() {
  const mounted = useSyncExternalStore(
    subscribeToNothing,
    getMountedSnapshot,
    getServerMountedSnapshot,
  );
  const [permission, setPermission] = useState<NotificationPermission>(() =>
    typeof window !== 'undefined' && 'Notification' in window
      ? Notification.permission
      : 'default',
  );
  const [status, setStatus] = useState<'idle' | 'subscribing' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const supported =
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window;

  const handleEnable = async () => {
    if (status === 'subscribing') return;
    if (!VAPID_PUBLIC_KEY) {
      setStatus('error');
      setMessage('Notifications are not configured.');
      return;
    }

    setStatus('subscribing');
    setMessage('');

    try {
      const result = await Notification.requestPermission();

      if (result !== 'granted') {
        setStatus('error');
        setMessage(
          result === 'denied'
            ? 'Notifications are blocked in your browser settings.'
            : 'Notification permission was not granted.',
        );
        return;
      }

      await navigator.serviceWorker.register('/sw.js');
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      const subscription =
        existing ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        }));

      const response = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription: subscription.toJSON(),
          favorites: readFavorites(),
        }),
      });

      if (!response.ok) {
        throw new Error('Could not save your subscription. Please try again.');
      }

      setStatus('idle');
      setPermission('granted');
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Could not enable notifications.');
    }
  };

  if (!mounted || !supported || permission === 'granted') return null;

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={status === 'subscribing' || !VAPID_PUBLIC_KEY}
        title={VAPID_PUBLIC_KEY ? undefined : 'Push notifications are not configured'}
        onClick={handleEnable}
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors border bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
      >
        <Bell className="w-4 h-4" />
        {status === 'subscribing' ? 'Enabling…' : 'Enable Notifications'}
      </button>
      {message && (
        <p role="status" className="max-w-xs text-right text-sm font-medium text-red-700">
          {message}
        </p>
      )}
    </div>
  );
}
