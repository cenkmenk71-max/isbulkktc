'use client';

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="tr">
      <body style={{ margin: 0, padding: '2rem', fontFamily: 'system-ui, sans-serif', background: '#07130f', color: '#fffdf8', textAlign: 'center' }}>
        <h2>Bir hata oluştu</h2>
        <p style={{ opacity: 0.7 }}>Beklenmeyen bir sistem hatası meydana geldi.</p>
        <button
          onClick={() => reset()}
          style={{ marginTop: '1rem', padding: '0.6rem 1.2rem', borderRadius: '8px', border: '1px solid #4b8066', background: '#10211a', color: '#fffdf8', cursor: 'pointer' }}
        >
          Yeniden dene
        </button>
      </body>
    </html>
  );
}
