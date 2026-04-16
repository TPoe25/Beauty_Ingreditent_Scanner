import Link from "next/link";

export default function Home() {
    return (
        <main className="min-h-screen bg-linear-to-b from-rose-50 via-white to-neutral-50">
            <section className="mx-auto flex min-h-screen max-w-6xl items-center px-6 py-16">
                <div className="grid w-full gap-12 lg:grid-cols-2 lg:items-center">
                    <div>
                        <div className="mb-4 inline-flex items-center rounded-full bg-rose-100 px-4 py-1 text-sm font-medium text-rose-700">
                            AI-powered ingredient analysis
                        </div>

                        <h1 className="text-5xl font-bold tracking-tight text-neutral-900 sm:text-6xl">
                            InciSight makes ingredient scanning clear.
                        </h1>

                        <p className="mt-6 max-w-xl text-lg leading-8 text-neutral-600">
                            Scan labels, understand ingredients, compare products, and get
                            AI-powered explanations that actually make sense with InciSight.
                        </p>

                        <div className="mt-8 flex flex-wrap gap-4">
                            <Link
                                href="/dashboard"
                                className="relative z-10 inline-flex cursor-pointer rounded-xl bg-neutral-900 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-neutral-800"
                            >
                                Start Scanning
                            </Link>

                            <Link
                                href="/compare"
                                className="relative z-10 inline-flex cursor-pointer rounded-xl border border-neutral-300 bg-white px-6 py-3 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
                            >
                                Compare Products
                            </Link>
                        </div>

                        <div className="mt-10 flex gap-8 text-sm text-neutral-500">
                            <div>
                                <p className="text-2xl font-bold text-neutral-900">AI</p>
                                <p>Ingredient explanations</p>
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-neutral-900">3-step</p>
                                <p>Scan → Analyze → Decide</p>
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-neutral-900">Smart</p>
                                <p>Comparison tools</p>
                            </div>
                        </div>
                    </div>

                    <div className="relative">
                        <div className="rounded-3xl border border-rose-100 bg-white p-6 shadow-[0_20px_80px_rgba(0,0,0,0.08)]">
                            <div className="rounded-2xl bg-neutral-50 p-5">
                                <div className="mb-4 flex items-center justify-between">
                                    <div>
                                        <p className="text-sm text-neutral-500">Sample Result</p>
                                        <h2 className="text-xl font-semibold">Hydrating Face Wash</h2>
                                    </div>
                                    <div className="rounded-full bg-emerald-100 px-4 py-2 text-sm font-semibold text-emerald-700">
                                        84 • Safe
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <div className="rounded-xl bg-white p-4 shadow-sm">
                                        <p className="text-sm font-medium text-neutral-500">
                                            Flagged Notes
                                        </p>
                                        <p className="mt-1 text-sm text-neutral-700">
                                            Mostly low-concern ingredients with light preservative use.
                                        </p>
                                    </div>

                                    <div className="rounded-xl bg-white p-4 shadow-sm">
                                        <p className="text-sm font-medium text-neutral-500">
                                            AI Insight
                                        </p>
                                        <p className="mt-1 text-sm text-neutral-700">
                                            This formula looks generally gentle for most users and may
                                            be a good option for hydration-focused routines.
                                        </p>
                                    </div>

                                    <div className="rounded-xl bg-white p-4 shadow-sm">
                                        <p className="text-sm font-medium text-neutral-500">
                                            Better Alternatives
                                        </p>
                                        <p className="mt-1 text-sm text-neutral-700">
                                            3 similar products with lower fragrance and irritant risk.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="pointer-events-none absolute -left-6 -top-6 h-24 w-24 rounded-full bg-rose-200/50 blur-2xl" />
                        <div className="pointer-events-none absolute -bottom-6 -right-6 h-28 w-28 rounded-full bg-amber-200/40 blur-2xl" />
                    </div>
                </div>
            </section>
        </main>
    );
}
