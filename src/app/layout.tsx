import type { Metadata } from 'next';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';
import './globals.css';

export const metadata: Metadata = {
  title: 'VaseMaker Web',
  description: 'Parametric 3D vase designer with real-time preview',
};

// dcity.org analytics — §1 of DCity/ANALYTICS.md, the same tag on all four
// sites (change it there). GoatCounter's count.js ignores localhost, so the dev
// server is never counted. The export event is in lib/analytics.ts.
const GOATCOUNTER_CONFIG = `
  // Opt-out: a browser that has visited dcity.org/nocount is never counted.
  var dcNoCount = document.cookie.indexOf('dcity_nocount=1') !== -1;
  window.goatcounter = {
    no_onload: dcNoCount,
    // One GoatCounter site serves four hostnames, and every app's home page is "/".
    // Prefix the host so boxmaker "/" and vasemaker "/" do not merge.
    path: function (p) { return location.host + p; }
  };
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: GOATCOUNTER_CONFIG }} />
        <script data-goatcounter="https://dcity.goatcounter.com/count"
                async src="//gc.zgo.at/count.js" />
      </head>
      <body>
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
