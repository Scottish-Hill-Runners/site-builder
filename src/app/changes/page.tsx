import ChangesClient from '@/app/changes/changes-client';

export default function ChangesPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-slate-950">
      <main className="flex min-h-screen w-full max-w-3xl flex-col items-start justify-start bg-white px-4 py-12 dark:bg-slate-950 sm:px-6">
        <div className="flex flex-col items-start gap-6 w-full">
          <h1 className="text-3xl font-semibold leading-10 tracking-tight text-black dark:text-slate-50">
            Recent Changes
          </h1>

          <section className="w-full mt-8">
            <ChangesClient />
          </section>
        </div>
      </main>
    </div>
  );
}
