import { useMemo, useState } from 'react';
import {
  Download,
  FolderOpen,
  Plus,
  RotateCcw,
  Search,
  Settings2,
  Trash2,
} from 'lucide-react';
import type {
  DifficultyLevel,
  EducationLevel,
  QuestionSet,
  SubjectCatalogMap,
} from '../types/question';
import {
  EDUCATION_LEVELS,
  getSubjectsForLevel,
  normalizeEducationLevel,
} from '../utils/curriculum';
import { exportAsDocx, exportAsPdf, exportAsXlsx } from '../utils/exporter';

interface HistoryViewProps {
  history: QuestionSet[];
  subjectCatalog: SubjectCatalogMap;
  onAddSubject: (level: EducationLevel, subjectName: string) => void;
  onRemoveSubject: (level: EducationLevel, subjectName: string) => void;
  onResetCatalog: () => void;
  onLoadSet: (entry: QuestionSet) => void;
  onDeleteEntry: (id: string) => void;
  onClearAll: () => void;
  onNotify: (msg: string) => void;
}

const LEVEL_FILTERS: Array<'Semua' | EducationLevel> = [
  'Semua',
  ...EDUCATION_LEVELS.map((lvl) => lvl.value),
];

const DIFFICULTY_FILTERS: Array<'Semua' | DifficultyLevel> = [
  'Semua',
  'Mudah',
  'Sedang',
  'Sulit',
  'HOTS',
];

function formatDateId(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function HistoryView({
  history,
  subjectCatalog,
  onAddSubject,
  onRemoveSubject,
  onResetCatalog,
  onLoadSet,
  onDeleteEntry,
  onClearAll,
  onNotify,
}: HistoryViewProps) {
  const [levelFilter, setLevelFilter] = useState<'Semua' | EducationLevel>('Semua');
  const [difficultyFilter, setDifficultyFilter] = useState<'Semua' | DifficultyLevel>(
    'Semua'
  );
  const [query, setQuery] = useState('');

  // Administrator Subject Catalog State
  const [catalogLevel, setCatalogLevel] = useState<EducationLevel>('SD/MI');
  const [newSubjectName, setNewSubjectName] = useState('');

  const catalogSubjects = useMemo(
    () => getSubjectsForLevel(catalogLevel, subjectCatalog),
    [catalogLevel, subjectCatalog]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return history.filter((entry) => {
      const normalizedLevel = normalizeEducationLevel(entry.params.educationLevel);
      if (levelFilter !== 'Semua' && normalizedLevel !== levelFilter) {
        return false;
      }
      if (difficultyFilter !== 'Semua' && entry.params.difficulty !== difficultyFilter) {
        return false;
      }
      if (q) {
        const hay =
          `${entry.title} ${entry.params.subject} ${entry.params.topic} ${entry.params.curriculum}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [history, levelFilter, difficultyFilter, query]);

  const handleAddSubject = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newSubjectName.trim();
    if (!trimmed) return;
    onAddSubject(catalogLevel, trimmed);
    setNewSubjectName('');
  };

  return (
    <section aria-label="Riwayat aktivitas lokal dan bank soal" className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-[#1E293B]">
        <div>
          <h1 className="font-display text-xl font-semibold text-slate-900 dark:text-white">
            Riwayat Aktivitas Lokal & Bank Soal
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Seluruh paket soal beserta gambar pendukung tersimpan otomatis di IndexedDB browser
            Anda untuk pemulihan instan dan ekspor ulang ke DOCX, PDF, maupun Excel (XLSX).
          </p>
        </div>

        {history.length > 0 && (
          <button
            type="button"
            onClick={onClearAll}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-medium text-red-700 transition-colors hover:bg-red-100 whitespace-nowrap shrink-0 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-300 dark:hover:bg-red-900/50"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            Bersihkan Riwayat
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-[#1E293B]">
        <div className="flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label="Filter jenjang riwayat"
            className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-[#0F172A]"
          >
            {LEVEL_FILTERS.map((lvl) => (
              <button
                key={lvl}
                type="button"
                onClick={() => setLevelFilter(lvl)}
                aria-pressed={levelFilter === lvl}
                className={`min-h-8 rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                  levelFilter === lvl
                    ? 'bg-white text-green-800 shadow-xs dark:bg-[#1E293B] dark:text-green-400'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
                }`}
              >
                {lvl}
              </button>
            ))}
          </div>

          <div
            role="group"
            aria-label="Filter kesulitan riwayat"
            className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-[#0F172A]"
          >
            {DIFFICULTY_FILTERS.map((diff) => (
              <button
                key={diff}
                type="button"
                onClick={() => setDifficultyFilter(diff)}
                aria-pressed={difficultyFilter === diff}
                className={`min-h-8 rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                  difficultyFilter === diff
                    ? 'bg-white text-green-800 shadow-xs dark:bg-[#1E293B] dark:text-green-400'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
                }`}
              >
                {diff}
              </button>
            ))}
          </div>
        </div>

        <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            type="search"
            aria-label="Cari riwayat paket soal"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari judul, mapel, atau topik..."
            className="min-h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pr-3 pl-9 text-xs text-slate-900 placeholder:text-slate-400 focus:border-green-600 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-[#0F172A] dark:text-slate-100 dark:placeholder:text-slate-500"
          />
        </div>
      </div>

      {/* History Table */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-14 text-center dark:border-slate-700 dark:bg-[#1E293B]">
          <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
            {history.length === 0
              ? 'Belum ada riwayat paket soal yang tersimpan.'
              : 'Tidak ada riwayat yang cocok dengan filter pencarian.'}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Paket soal yang Anda buat atau muat dari contoh akan muncul otomatis di sini.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-[#1E293B]">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:bg-[#0F172A] dark:text-slate-300">
                  <th className="px-4 py-3">Paket Soal & Materi</th>
                  <th className="px-4 py-3">Jenjang</th>
                  <th className="px-4 py-3">Kesulitan</th>
                  <th className="px-4 py-3 text-right">Jumlah</th>
                  <th className="px-4 py-3">Waktu</th>
                  <th className="px-4 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {filtered.map((item) => (
                  <tr
                    key={item.id}
                    className="transition-colors hover:bg-green-50/40 dark:hover:bg-slate-800/40"
                  >
                    <td className="px-4 py-3.5">
                      <p className="font-medium text-slate-900 dark:text-white">
                        {item.title}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        {item.params.subject} · {item.params.curriculum} ·{' '}
                        {item.params.assessmentType}
                      </p>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-slate-700 whitespace-nowrap dark:text-slate-300">
                      {normalizeEducationLevel(item.params.educationLevel)} · {item.params.grade}
                    </td>
                    <td className="px-4 py-3.5 text-xs font-medium text-slate-800 whitespace-nowrap dark:text-slate-200">
                      {item.params.difficulty}
                    </td>
                    <td className="font-mono-tabular px-4 py-3.5 text-right text-xs font-semibold text-slate-800 whitespace-nowrap dark:text-slate-200">
                      {item.questions.length} butir
                    </td>
                    <td className="font-mono-tabular px-4 py-3.5 text-xs text-slate-500 whitespace-nowrap dark:text-slate-400">
                      {formatDateId(item.createdAt)}
                    </td>
                    <td className="px-4 py-3.5 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onLoadSet(item)}
                          className="inline-flex min-h-8 items-center gap-1 rounded-md border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-800 hover:bg-green-100 dark:border-green-800 dark:bg-green-950/50 dark:text-green-300"
                        >
                          <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />
                          Buka
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await exportAsDocx(item, {
                              includeAnswerKey: item.params.includeAnswerKey,
                            });
                            onNotify('Dokumen DOCX diunduh dari riwayat.');
                          }}
                          aria-label={`Unduh DOCX ${item.title}`}
                          className="inline-flex min-h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-[#0F172A] dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          <Download className="h-3 w-3" aria-hidden="true" />
                          DOCX
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            exportAsPdf(item, {
                              includeAnswerKey: item.params.includeAnswerKey,
                            });
                            onNotify('Dokumen PDF diunduh dari riwayat.');
                          }}
                          aria-label={`Unduh PDF ${item.title}`}
                          className="inline-flex min-h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-[#0F172A] dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          <Download className="h-3 w-3" aria-hidden="true" />
                          PDF
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            exportAsXlsx(item, {
                              includeAnswerKey: item.params.includeAnswerKey,
                            });
                            onNotify('Spreadsheet XLSX diunduh dari riwayat.');
                          }}
                          aria-label={`Unduh XLSX ${item.title}`}
                          className="inline-flex min-h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-[#0F172A] dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          <Download className="h-3 w-3" aria-hidden="true" />
                          XLSX
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteEntry(item.id)}
                          aria-label={`Hapus riwayat ${item.title}`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-red-50 hover:text-red-600 dark:text-slate-400 dark:hover:bg-red-950/50 dark:hover:text-red-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Administrator: Pembaruan Referensi & Katalog Mata Pelajaran */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-[#1E293B]">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4 dark:border-slate-700">
          <div>
            <h2 className="flex items-center gap-2 font-display text-base font-semibold text-slate-900 dark:text-white">
              <Settings2 className="h-4 w-4 text-green-700 dark:text-green-400" aria-hidden="true" />
              Administrator: Kelola Katalog Mata Pelajaran Satuan Pendidikan
            </h2>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
              Tambahkan muatan lokal, konsentrasi keahlian SMK, atau mata pelajaran khusus sesuai
              kurikulum operasional satuan pendidikan (tersimpan otomatis di IndexedDB).
            </p>
          </div>
          <button
            type="button"
            onClick={onResetCatalog}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-[#0F172A] dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Reset Katalog Nasional
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
          <div className="space-y-3">
            <div>
              <label
                htmlFor="admin-catalog-level"
                className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Pilih Jenjang Katalog
              </label>
              <select
                id="admin-catalog-level"
                value={catalogLevel}
                onChange={(e) => setCatalogLevel(e.target.value as EducationLevel)}
                className="min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-green-600 focus:outline-none dark:border-slate-700 dark:bg-[#0F172A] dark:text-slate-100"
              >
                {EDUCATION_LEVELS.map((lvl) => (
                  <option key={lvl.value} value={lvl.value}>
                    {lvl.label}
                  </option>
                ))}
              </select>
            </div>

            <form onSubmit={handleAddSubject} className="space-y-2">
              <label
                htmlFor="admin-new-subject"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Tambah Mata Pelajaran Baru
              </label>
              <div className="flex gap-2">
                <input
                  id="admin-new-subject"
                  type="text"
                  value={newSubjectName}
                  onChange={(e) => setNewSubjectName(e.target.value)}
                  placeholder="Misal: Bahasa Sunda / Konsentrasi RPL"
                  className="min-h-10 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-green-600 focus:outline-none dark:border-slate-700 dark:bg-[#0F172A] dark:text-slate-100"
                />
                <button
                  type="submit"
                  className="inline-flex min-h-10 items-center gap-1 rounded-lg bg-green-700 px-3 text-xs font-medium text-white hover:bg-green-800 whitespace-nowrap dark:bg-green-600 dark:hover:bg-green-500"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  Tambah
                </button>
              </div>
            </form>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-slate-600 dark:text-slate-400">
              Daftar Mata Pelajaran Aktif — {catalogLevel} ({catalogSubjects.length} mapel)
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {catalogSubjects.map((subj) => (
                <div
                  key={subj}
                  className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 dark:border-slate-700 dark:bg-[#0F172A] dark:text-slate-200"
                >
                  <span className="truncate font-medium" title={subj}>
                    {subj}
                  </span>
                  <button
                    type="button"
                    disabled={catalogSubjects.length <= 1}
                    onClick={() => onRemoveSubject(catalogLevel, subj)}
                    aria-label={`Hapus mata pelajaran ${subj}`}
                    className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40 dark:hover:bg-red-950/60 dark:hover:text-red-400"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
