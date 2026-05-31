export default function SiteFooter() {
  return (
    <footer className="w-full border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-center py-6 mt-8 text-sm text-slate-500">
      <div className="container mx-auto flex flex-col items-center gap-2">
        <span>&copy; {new Date().getFullYear()} Scottish Hill Runners</span>
        <a href="/privacy" className="underline hover:text-slate-700 dark:hover:text-slate-300">Privacy Policy</a>
      </div>
    </footer>
  );
}
