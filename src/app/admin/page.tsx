'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [jsonData, setJsonData] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'ok' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password.trim() || !jsonData.trim()) return;

    setStatus('submitting');
    setMessage('');

    try {
      const response = await fetch('/api/admin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${encodeURIComponent(password)}`,
        },
        body: jsonData,
      });

      const data = await response.json();

      if (!response.ok) {
        setStatus('error');

      const errorData = data as { error?: string; issues?: Array<{ path: (string | number)[]; message: string }> };
      let errorMessage = errorData.error ?? 'Failed to submit';

      if (errorData.issues) {
        errorMessage += '\n\nDetails:\n' + errorData.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
      }

      setMessage(errorMessage);
      return;
      }

      setStatus('ok');
      setMessage('Manual overrides saved. Refresh the dashboard to see them.');
      setPassword('');
      setJsonData('');
    } catch (err) {
      setStatus('error');
      setMessage(
        err instanceof Error ? err.message : 'Could not reach /api/admin.',
      );
    }
  }

  return (
    <main className="mx-4 my-8 md:mx-auto max-w-7xl px-4 py-8 md:px-8 text-zinc-900 text-[16px] leading-[1.6]">
      <div className="bg-white/95 rounded-2xl shadow-sm border border-slate-200 p-6 mb-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-blue-700">
              Admin Override Panel
            </h1>
            <p className="mt-1 text-lg text-zinc-600">
              Inject manual outage rows when the live sources can&apos;t be reached.
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.push('/')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-900 text-white rounded-lg text-sm font-medium hover:bg-zinc-800 transition-colors"
          >
            Back to Dashboard
          </button>
        </div>

        {status === 'ok' && (
          <div className="mb-6 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-900 text-sm font-medium">
            {message}
          </div>
        )}

        {status === 'error' && (
          <div className="mb-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-red-800 text-sm font-medium">
            {message}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-zinc-700">
              API key (GEMINI_API_KEY)
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="block w-full rounded-lg border-zinc-300 bg-white px-3 py-2 text-zinc-900 leading-5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              placeholder="GEMINI_API_KEY"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-zinc-700">
              Outages (JSON array)
            </label>
            <textarea
              value={jsonData}
              onChange={(e) => setJsonData(e.target.value)}
              rows={14}
              className="block w-full rounded-lg border-zinc-300 bg-white px-3 py-2 text-zinc-900 leading-6 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm font-mono"
              placeholder="Paste your Outage JSON array here"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={status === 'submitting'}
              className="inline-flex items-center gap-2 rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {status === 'submitting' ? 'Saving…' : 'Submit Overrides'}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
