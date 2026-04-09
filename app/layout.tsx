export const metadata = {
  title: 'Company Intake — Unconventional Ventures',
  description: 'Early-stage signal assessment for startup screening',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: 'monospace',
          background: '#0f0f0f',
          color: '#e0e0e0',
          margin: 0,
          padding: 0,
        }}
      >
        {children}
      </body>
    </html>
  );
}
