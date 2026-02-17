import type { Metadata } from "next";
import { AuthProvider } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Source_Serif_4, Inter } from "next/font/google";
import "./globals.css";

const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "OpenSOUL.md",
  description: "Your agent deserves a SOUL.",
  metadataBase: new URL("https://opensoul.md"),
  openGraph: {
    title: "OpenSOUL.md",
    description: "Your agent deserves a SOUL.",
    url: "https://opensoul.md",
    siteName: "OpenSOUL.md",
    type: "website",
    images: [
      {
        url: "/og.png",
        width: 955,
        height: 500,
        alt: "OpenSOUL.md — Your agent deserves a soul",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "OpenSOUL.md",
    description: "Your agent deserves a SOUL.",
    images: ["/og.png"],
    creator: "@opensoulmd",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`dark ${inter.variable}`}
      suppressHydrationWarning
    >
      <body className={sourceSerif.className}>
        <ThemeProvider>
          <AuthProvider>
            <Navbar />
            <main className="max-w-6xl mx-auto px-4 py-8 min-h-[calc(100vh-theme(spacing.14)-theme(spacing.32))]">
              {children}
            </main>
            <Footer />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
