import "./globals.css";
import Link from "next/link";
import AuthNav from "./components/AuthNav";

export const metadata = {
  title: "InciSight",
  description: "Scan and analyze beauty product ingredients with InciSight",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-neutral-50 text-neutral-900 antialiased">
        <div className="flex min-h-screen flex-col">
          <header className="border-b border-neutral-200/80 bg-white/90 backdrop-blur-sm">
            <div className="relative z-20 mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
              <Link href="/" className="flex items-center gap-3">
                <div className="rounded-2xl bg-rose-100 px-3 py-2 text-sm font-semibold text-rose-700">
                  InciSight
                </div>
                <div className="hidden sm:block">
                  <p className="text-sm font-semibold text-neutral-900">Ingredient Intelligence</p>
                  <p className="text-xs text-neutral-500">
                    Personalized scanning and explanation
                  </p>
                </div>
              </Link>
              <AuthNav />
            </div>
          </header>
          <div className="flex-1">{children}</div>
          <footer className="border-t border-neutral-200/80 bg-white/90 px-6 py-5 backdrop-blur-sm">
            <div className="mx-auto flex max-w-6xl flex-col items-center justify-center gap-2 text-center">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-400">
                Data Sources
              </p>
              <p className="text-xs text-neutral-500">
                Data by BeautyFeeds.io, PubChem, NIH, and EU Banned Ingredients.
              </p>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
