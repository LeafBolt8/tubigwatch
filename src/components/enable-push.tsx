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

  // iOS exposes Push only to apps launched from the home screen, so an installed-but-unsupported
  // case would be a real regression; a Safari tab is the case worth guiding.
  const isIOS =
    typeof window !== 'undefined' &&
    /iPad|iPhone|iPod/.test(navigator.userAgent) &&
    !('MSStream' in window);
  const isStandalone =
    typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches;

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
      setPermission(result);

      if (result === 'denied') {
        setStatus('error');
        // iOS only delivers web push to apps installed on the home screen, so a Safari tab user
        // needs the install steps rather than browser-settings advice.
        setMessage(
          /iPad|iPhone|iPod/.test(navigator.userAgent)
            ? 'To enable alerts on iPhone, tap Share in Safari, choose "Add to Home Screen", then open TubigWatch from your home screen and enable notifications there.'
            : 'Notifications are blocked. Click the lock icon in your browser address bar, set Notifications to "Allow", then try again.',
        );
        return;
      }

      if (result === 'default') {
        setStatus('error');
        setMessage('The permission prompt was dismissed. Click the button again and choose "Allow".');
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

  if (!mounted) return null;

  if (!supported) {
    if (isIOS && !isStandalone) {
      return (
        <div
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-amber-50 text-amber-800 border border-amber-200 shadow-sm"
          title="Tap Share, then Add to Home Screen to enable alerts"
        >
          <Bell className="w-4 h-4" />
          Add to Home Screen for alerts
        </div>
      );
    }

    return null;
  }

  if (permission === 'granted') return null;

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
