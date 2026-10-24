/**
 * Re-sends the browser's existing push subscription with the latest pinned favorites.
 *
 * Called from the dashboard after a pin changes, so a subscriber does not have to click
 * "Enable Notifications" again to receive alerts for the new location. Safe to call when
 * notifications were never granted or the browser has no Push API; it simply returns.
 */
export async function syncPushSubscription(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  let favorites: unknown = [];
  const stored = localStorage.getItem('tubigwatch_favorites_v2');
  if (stored) {
    try {
      favorites = JSON.parse(stored);
    } catch {
      favorites = [];
    }
  }

  const response = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription: subscription.toJSON(), favorites }),
  });

  if (!response.ok) {
    throw new Error(`Push subscription sync failed (${response.status}).`);
  }
}
