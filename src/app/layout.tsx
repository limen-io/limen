// Root layout required by Next.js App Router for the `app/` directory to boot.
// Slice 1 has no UI; this layout is never rendered in practice (no `page.tsx`,
// only `mcp/route.ts`). It exists only to satisfy the framework requirement
// and to be ready when the dashboard arrives in slice 5+.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
