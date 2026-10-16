'use client';
export default function ErrorPage({reset}:{reset:()=>void}) { return <main className="error-page"><h1>We couldn’t open this workspace.</h1><p>Your saved work remains in the database. Try loading it again.</p><button onClick={reset}>Try again</button></main>; }
