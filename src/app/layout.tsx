import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'VaseMaker Web',
  description: 'Parametric 3D vase designer with real-time preview',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
