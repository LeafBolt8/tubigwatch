import Link from 'next/link';

export default function PrivacyPage() {
  return (
    <main className="mx-4 my-8 md:mx-auto max-w-3xl px-4 py-8 md:px-8 text-zinc-900">
      <div className="bg-white/95 rounded-2xl shadow-sm border border-slate-200 p-8 md:p-12">
        <h1 className="text-4xl font-extrabold mb-6">Privacy Policy</h1>
        <div className="space-y-4 text-lg text-zinc-700 leading-relaxed">
          <p>
            TubigWatch is an open-source civic utility. We do not sell your data, show ads,
            or track you across the internet.
          </p>
          <h2 className="text-2xl font-bold text-zinc-900 mt-8">1. Geolocation</h2>
          <p>
            If you click &quot;Near Me&quot;, your browser shares your approximate coordinates with{' '}
            our app. This is used <strong>only</strong> to sort the dashboard by your closest city.
            We do not save your coordinates to our servers.
          </p>
          <h2 className="text-2xl font-bold text-zinc-900 mt-8">2. Push Notifications</h2>
          <p>
            If you enable notifications and pin a location, your browser generates a secure Push
            Subscription. This is saved to our database (Upstash Redis) along with your pinned
            locations so we can send you alerts. You can revoke this at any time in your browser
            settings.
          </p>
          <h2 className="text-2xl font-bold text-zinc-900 mt-8">3. Data Sources</h2>
          <p>
            All water advisory data is scraped from public sources (Maynilad and Manila Water). If
            you have questions, contact us at{' '}
            <a href="mailto:hello@tubigwatch.app" className="text-blue-600 underline">
              hello@tubigwatch.app
            </a>
            .
          </p>
        </div>
        <Link
          href="/"
          className="inline-flex items-center gap-2 mt-8 px-5 py-2.5 bg-zinc-900 text-white rounded-xl text-sm font-medium hover:bg-zinc-800 transition-colors shadow-sm"
        >
          <span aria-hidden="true">&larr;</span> Back to Dashboard
        </Link>
      </div>
    </main>
  );
}
