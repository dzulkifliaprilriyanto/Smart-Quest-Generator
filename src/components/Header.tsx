import type { StudioTab } from '../hooks/useSoalStudio';

interface HeaderProps {
  activeTab: StudioTab;
  onSelectTab: (tab: StudioTab) => void;
  onNewPackage: () => void;
  historyCount: number;
}

const NAV_ITEMS: Array<{ id: StudioTab; label: string; mobileLabel: string }> = [
  { id: 'studio', label: 'Studio Soal', mobileLabel: 'Studio' },
  { id: 'kop', label: 'Kop Dokumen', mobileLabel: 'Kop' },
  { id: 'exam-cards', label: 'Kartu Ujian', mobileLabel: 'Kartu' },
  { id: 'administration', label: 'Kisi-Kisi', mobileLabel: 'Kisi-Kisi' },
  { id: 'analytics', label: 'Analisis', mobileLabel: 'Analisis' },
  { id: 'history', label: 'Riwayat', mobileLabel: 'Riwayat' },
  { id: 'guide', label: 'Panduan', mobileLabel: 'Panduan' },
];

export function Header({
  activeTab,
  onSelectTab,
  onNewPackage,
  historyCount,
}: HeaderProps) {
  return (
    <header className="no-print border-b border-slate-200 bg-white dark:border-slate-700 dark:bg-[#1E293B]">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-4 py-2.5 sm:px-6 md:gap-6">
        {/* Zone 1: Official App Brand Wordmark */}
        <a
          href="#studio"
          onClick={(e) => {
            e.preventDefault();
            onSelectTab('studio');
          }}
          className="flex min-w-0 flex-1 flex-col leading-tight lg:flex-none lg:shrink-0"
        >
          <span className="font-display flex items-center gap-2 text-sm font-bold tracking-tight text-green-800 sm:text-base dark:text-green-400">
            <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm bg-green-700 dark:bg-green-400" aria-hidden="true" />
            <span className="truncate">SMART QUEST GENERATOR</span>
          </span>
          <span className="text-[9.5px] font-medium leading-tight tracking-wide text-slate-500 sm:text-[10px] lg:whitespace-nowrap dark:text-slate-400">
            By Klick Assets Generator Ft. Lilin Annisa Putri S., S.Pd.
          </span>
        </a>

        {/* Zone 2: Clean Single-Line Navigation Links (Desktop) */}
        <nav
          aria-label="Navigasi utama"
          className="hidden items-center gap-4 text-[13px] font-medium lg:flex"
        >
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              data-testid={`nav-tab-${item.id}`}
              className={`min-h-10 border-b-2 px-1 py-2 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-green-600 ${
                activeTab === item.id
                  ? 'border-green-700 text-green-700 dark:border-green-400 dark:text-green-400'
                  : 'border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
              }`}
            >
              {item.label}
              {item.id === 'history' && (
                <span className="font-mono-tabular ml-1 text-xs text-slate-500 dark:text-slate-400">
                  ({historyCount})
                </span>
              )}
            </button>
          ))}
        </nav>

        {/* Zone 3: Single Primary Action */}
        <div className="shrink-0">
          <button
            type="button"
            onClick={onNewPackage}
            className="min-h-10 rounded-lg bg-green-700 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-green-800 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-600 dark:bg-green-600 dark:hover:bg-green-500"
          >
            Paket Baru
          </button>
        </div>
      </div>

      {/* Compact Responsive Navigation Row (< lg) */}
      <nav
        aria-label="Navigasi mobile"
        className="grid grid-cols-4 border-t border-slate-100 bg-green-50/40 text-[11px] font-medium sm:grid-cols-7 lg:hidden dark:border-slate-700 dark:bg-[#0F172A]/80"
      >
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelectTab(item.id)}
            className={`min-h-9 border-b-2 px-1 py-1.5 text-center transition-colors whitespace-nowrap ${
              activeTab === item.id
                ? 'border-green-700 text-green-700 dark:border-green-400 dark:text-green-400'
                : 'border-transparent text-slate-600 dark:text-slate-300'
            }`}
          >
            {item.mobileLabel}
            {item.id === 'history' ? ` (${historyCount})` : ''}
          </button>
        ))}
      </nav>
    </header>
  );
}
