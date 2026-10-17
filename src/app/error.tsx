'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="error-page">
      <h1>This view couldn’t finish loading.</h1>
      <p>Try again to reopen the view. You can also return to Ascent and restart the sample.</p>
      <button onClick={reset}>Try again</button>
      <a href="/">Return to Ascent</a>
    </main>
  );
}
