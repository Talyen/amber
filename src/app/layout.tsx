import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { SITE_NAME, SITE_TAGLINE, SITE_URL } from "@/lib/site";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "optional",
  preload: true,
  adjustFontFallback: true,
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "optional",
  preload: true,
  adjustFontFallback: true,
});

const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("amber-theme");if(t==="light"||t==="dark"){document.documentElement.dataset.theme=t;}}catch(e){}})();`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} | SEC Filings, Cash Flow & Valuation`,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_TAGLINE,
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: `${SITE_NAME} | SEC Filings, Cash Flow & Valuation`,
    description: SITE_TAGLINE,
    url: SITE_URL,
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} | SEC Filings, Cash Flow & Valuation`,
    description: SITE_TAGLINE,
  },
};

const structuredDataJsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: SITE_NAME,
    applicationCategory: "FinanceApplication",
    operatingSystem: "Web",
    url: SITE_URL,
    description: SITE_TAGLINE,
    keywords: "SEC EDGAR, fundamental analysis, True Free Cash Flow, stock-based compensation, reverse DCF, filing diffs, insider trading, stock screener",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
  },
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: SITE_URL,
    description: SITE_TAGLINE,
    sameAs: ["https://github.com/Talyen/amber"],
    contactPoint: {
      "@type": "ContactPoint",
      email: "research@amberstocks.com",
      contactType: "customer support",
      url: `${SITE_URL}/contact`,
    },
    address: {
      "@type": "PostalAddress",
      addressLocality: "West Linn",
      addressRegion: "OR",
      addressCountry: "US",
    },
  },
];

export const viewport: Viewport = {
  colorScheme: "light dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-screen antialiased selection:bg-[var(--amber-soft)] selection:text-[var(--amber)]">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredDataJsonLd) }}
        />
        {children}
      </body>
    </html>
  );
}
