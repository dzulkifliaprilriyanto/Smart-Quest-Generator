import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  CopyPlus,
  Download,
  Edit3,
  Eye,
  EyeOff,
  FileText,
  History,
  ImagePlus,
  Loader2,
  Monitor,
  Moon,
  Printer,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Sun,
  Trash2,
  Wand2,
  Wrench,
  X,
} from 'lucide-react';
import type {
  DifficultyLevel,
  KopTemplate,
  QuestionFilterState,
  QuestionImage,
  QuestionItem,
  QuestionQaReport,
  QuestionRevisionEntry,
  QuestionSet,
  QuestionSubType,
  ThemeMode,
} from '../types/question';
import {
  DEFAULT_IMAGE_GEN_CONFIG,
  QUESTION_SUBTYPES,
  SAMPLE_QUESTION_SETS,
} from '../utils/curriculum';
import {
  exportAsDocx,
  exportAsPdf,
  exportAsTxt,
  exportAsXlsx,
} from '../utils/exporter';
import {
  computeSetStats,
  filterQuestions,
  formatQuestionSetAsText,
} from '../utils/formatter';
import {
  canAddImageToQuestion,
  getImageQuotaStatus,
  selectPriorityQuestionsForVisuals,
} from '../utils/imageQuota';
import { APP_OFFICIAL_BRANDING, APP_OFFICIAL_NAME } from '../utils/kopTemplates';
import { formatOptionalNip } from '../utils/layoutEngine';
import { validateQuestionSet } from '../utils/masterValidator';
import { formatScore } from '../utils/scoring';
import { requestAiQuestionVisual } from '../utils/visualGenerator';
import { QuestionImagePanel } from './QuestionImagePanel';
import { ScoringDashboard } from './ScoringDashboard';

interface QuestionPreviewProps {
  questionSet: QuestionSet | null;
  isGenerating: boolean;
  theme: ThemeMode;
  onSelectTheme: (next: ThemeMode) => void;
  includeAnswerKey: boolean;
  onToggleAnswerKey: (next: boolean) => void;
  activeKopTemplate?: KopTemplate;
  onOpenPrintPreview: () => void;
  onLoadSample: (sampleId: string) => void;
  onRemoveQuestion: (questionId: string) => void;
  onDuplicateQuestion: (questionId: string) => void;
  onRepairSet: () => void;
  onUpdateQuestion: (
    questionId: string,
    patch: Partial<QuestionItem>,
    actionLabel?: string
  ) => void;
  onRecalculateWeights: () => void;
  onResetWeightsAuto: () => void;
  onSaveScoringChanges: (nextQuestions: QuestionItem[]) => void;
  onNotify: (message: string) => void;
}

const TYPE_FILTERS: Array<QuestionFilterState['typeFilter']> = [
  'Semua',
  'Pilihan Ganda',
  'Esai',
];

const DIFFICULTY_FILTERS: Array<QuestionFilterState['difficultyFilter']> = [
  'Semua',
  'Mudah',
  'Sedang',
  'Sulit',
  'HOTS',
];

function getDifficultyTextClass(diff: DifficultyLevel): string {
  switch (diff) {
    case 'Mudah':
      return 'text-green-700 dark:text-green-400';
    case 'Sedang':
      return 'text-emerald-700 dark:text-emerald-400';
    case 'Sulit':
      return 'text-amber-700 dark:text-amber-400';
    case 'HOTS':
      return 'text-rose-700 dark:text-rose-400';
  }
}

function getPreviewImgSizeClass(size: QuestionImage['displaySize']): string {
  if (size === 'small') return 'max-h-40 max-w-xs';
  if (size === 'large') return 'max-h-80 max-w-full';
  return 'max-h-56 max-w-md';
}

export function QuestionPreview({
  questionSet,
  isGenerating,
  theme,
  onSelectTheme,
  includeAnswerKey,
  onToggleAnswerKey,
  activeKopTemplate,
  onOpenPrintPreview,
  onLoadSample,
  onRemoveQuestion,
  onDuplicateQuestion,
  onRepairSet,
  onUpdateQuestion,
  onRecalculateWeights,
  onResetWeightsAuto,
  onSaveScoringChanges,
  onNotify,
}: QuestionPreviewProps) {
  const [filter, setFilter] = useState<QuestionFilterState>({
    typeFilter: 'Semua',
    difficultyFilter: 'Semua',
    searchQuery: '',
  });
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isExportingDocx, setIsExportingDocx] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<QuestionItem>>({});
  const [showValidationChecklist, setShowValidationChecklist] = useState(false);
  const [batchVisualProgress, setBatchVisualProgress] = useState<string | null>(null);
  const [aiToolsOpenId, setAiToolsOpenId] = useState<string | null>(null);
  const [revisionOpenId, setRevisionOpenId] = useState<string | null>(null);
  const [aiBusyKey, setAiBusyKey] = useState<string | null>(null);
  const [targetSubTypeByQuestion, setTargetSubTypeByQuestion] = useState<
    Record<string, QuestionSubType>
  >({});

  const filteredQuestions = useMemo(() => {
    if (!questionSet) return [];
    const base = filterQuestions(questionSet.questions, filter);
    return favoritesOnly ? base.filter((q) => Boolean(q.isFavorite)) : base;
  }, [questionSet, filter, favoritesOnly]);

  const stats = useMemo(() => {
    if (!questionSet) return null;
    return computeSetStats(questionSet.questions);
  }, [questionSet]);

  const imageQuotaStatus = useMemo(() => {
    return getImageQuotaStatus(questionSet?.questions ?? []);
  }, [questionSet]);

  const masterValidation = useMemo(() => {
    if (!questionSet) return null;
    return validateQuestionSet(questionSet);
  }, [questionSet]);

  const handleBatchGenerateVisuals = async () => {
    if (!questionSet || batchVisualProgress) return;
    if (imageQuotaStatus.remaining <= 0) {
      onNotify(
        `Kuota gambar maksimal 30% (${imageQuotaStatus.imagedCount}/${imageQuotaStatus.maxAllowed}) sudah penuh.`
      );
      return;
    }

    const unimaged = questionSet.questions.filter((q) => !q.supportingImage?.dataUrl);
    const candidates = selectPriorityQuestionsForVisuals(
      unimaged,
      questionSet.params.subject,
      imageQuotaStatus.remaining
    );

    if (candidates.length === 0) {
      onNotify(
        'Seluruh soal tanpa gambar bersifat verbal (NOT REQUIRED) sehingga tidak memerlukan gambar pendukung.'
      );
      return;
    }

    let createdCount = 0;
    try {
      for (let idx = 0; idx < candidates.length; idx += 1) {
        const candidate = candidates[idx]!;
        const targetQ = questionSet.questions.find((q) => q.id === candidate.questionId);
        if (!targetQ) continue;
        setBatchVisualProgress(
          `Membuat visual ${idx + 1}/${candidates.length} (Soal ${targetQ.number})...`
        );

        const result = await requestAiQuestionVisual({
          question: targetQ,
          subject: questionSet.params.subject,
          educationLevel: questionSet.params.educationLevel,
          grade: questionSet.params.grade,
          topic: questionSet.params.topic,
          additionalNotes: questionSet.params.additionalNotes,
          config: {
            ...DEFAULT_IMAGE_GEN_CONFIG,
            imageType: candidate.recommendedType,
          },
        });

        if (result.status === 'generated' && result.image) {
          onUpdateQuestion(targetQ.id, { supportingImage: result.image });
          createdCount += 1;
        }
      }
      onNotify(
        createdCount > 0
          ? `Berhasil membuat ${createdCount} gambar soal merata sesuai kuota maksimal 30%.`
          : 'Tidak ada visual baru yang dibuat karena soal sudah jelas secara tekstual.'
      );
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'Sebagian visual otomatis gagal diproses.'
      );
    } finally {
      setBatchVisualProgress(null);
    }
  };

  const handleRefineQuestion = async (
    q: QuestionItem,
    action: 'simplify' | 'grammar' | 'expand' | 'variation' | 'change_subtype' | 'qa_audit',
    actionLabel: string,
    targetSubType?: QuestionSubType
  ) => {
    if (!questionSet) return;
    setAiBusyKey(`${q.id}:${action}`);
    try {
      const res = await fetch('/api/refine-question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          subject: questionSet.params.subject,
          educationLevel: questionSet.params.educationLevel,
          grade: questionSet.params.grade,
          targetSubType,
          question: q,
        }),
      });
      const data = (await res.json()) as {
        updatedQuestion?: Partial<QuestionItem>;
        qaReport?: QuestionQaReport;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || 'Gagal memproses penyempurnaan soal.');
      }
      if (action === 'qa_audit' && data.qaReport) {
        onUpdateQuestion(q.id, { qaReport: data.qaReport }, 'Audit Kualitas (QA)');
        onNotify(
          `Audit QA Soal ${q.number} selesai: Skor ${data.qaReport.qualityScore}/100 (${
            data.qaReport.status === 'layak' ? 'Layak' : 'Perlu Revisi'
          }).`
        );
      } else if (data.updatedQuestion) {
        onUpdateQuestion(
          q.id,
          {
            type: data.updatedQuestion.type ?? q.type,
            questionSubType: data.updatedQuestion.questionSubType ?? q.questionSubType,
            stimulus: data.updatedQuestion.stimulus,
            questionText: data.updatedQuestion.questionText ?? q.questionText,
            options: data.updatedQuestion.options ?? q.options,
            correctAnswer: data.updatedQuestion.correctAnswer ?? q.correctAnswer,
            explanation: data.updatedQuestion.explanation ?? q.explanation,
          },
          actionLabel
        );
        onNotify(`${actionLabel} untuk Soal ${q.number} selesai diterapkan.`);
      }
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Gagal menghubungi layanan AI editor.');
    } finally {
      setAiBusyKey(null);
    }
  };

  const handleRestoreRevision = (q: QuestionItem, rev: QuestionRevisionEntry) => {
    onUpdateQuestion(
      q.id,
      {
        questionText: rev.questionText,
        correctAnswer: rev.correctAnswer,
        explanation: rev.explanation,
      },
      `Pulihkan: ${rev.actionLabel}`
    );
    setRevisionOpenId(null);
    onNotify(`Revisi Soal ${q.number} dipulihkan.`);
  };

  const startEditing = (q: QuestionItem) => {
    setEditingId(q.id);
    setEditDraft({
      stimulus: q.stimulus ?? '',
      questionText: q.questionText,
      correctAnswer: q.correctAnswer,
      explanation: q.explanation,
      scoreWeight: q.scoreWeight ?? 10,
      indicator: q.indicator ?? '',
    });
  };

  const saveEdit = (questionId: string) => {
    onUpdateQuestion(questionId, editDraft, 'Sunting Manual Guru');
    setEditingId(null);
    setEditDraft({});
  };

  const handleCopyAll = async () => {
    if (!questionSet) return;
    const text = formatQuestionSetAsText(questionSet, {
      includeAnswerKey,
      filteredQuestions,
    });
    try {
      await navigator.clipboard.writeText(text);
      setCopiedAll(true);
      onNotify('Seluruh soal berhasil disalin ke papan klip.');
      window.setTimeout(() => setCopiedAll(false), 2000);
    } catch {
      onNotify('Gagal menyalin otomatis. Gunakan tombol unduh TXT/DOCX/PDF/XLSX.');
    }
  };

  const handleCopySingle = async (questionId: string, formatted: string) => {
    try {
      await navigator.clipboard.writeText(formatted);
      setCopiedId(questionId);
      onNotify('Butir soal disalin.');
      window.setTimeout(() => setCopiedId(null), 1600);
    } catch {
      onNotify('Tidak dapat mengakses papan klip browser.');
    }
  };

  const handleExportTxt = () => {
    if (!questionSet || filteredQuestions.length === 0) return;
    exportAsTxt(questionSet, { includeAnswerKey, filteredQuestions });
    onNotify('Berkas TXT berhasil diunduh.');
  };

  const handleExportDocx = async () => {
    if (!questionSet || filteredQuestions.length === 0) return;
    setIsExportingDocx(true);
    try {
      await exportAsDocx(questionSet, {
        includeAnswerKey,
        filteredQuestions,
        kopTemplate: activeKopTemplate,
      });
      onNotify('Dokumen DOCX (Naskah, Gambar, Kunci, Kisi-Kisi & Lembar Jawaban) berhasil diunduh.');
    } finally {
      setIsExportingDocx(false);
    }
  };

  const handleExportPdf = () => {
    if (!questionSet || filteredQuestions.length === 0) return;
    exportAsPdf(questionSet, {
      includeAnswerKey,
      filteredQuestions,
      kopTemplate: activeKopTemplate,
    });
    onNotify('Dokumen PDF berhasil diunduh.');
  };

  const handleExportXlsx = () => {
    if (!questionSet || filteredQuestions.length === 0) return;
    exportAsXlsx(questionSet, { includeAnswerKey, filteredQuestions });
    onNotify('Workbook XLSX (Kisi-Kisi, Bank Soal & Template Rekap Nilai) berhasil diunduh.');
  };

  const docId = questionSet?.params.docIdentity;
  const schoolTitle = (docId?.schoolName || questionSet?.params.schoolName || '').trim();
  const nipText = formatOptionalNip(docId?.teacherNip);
  const scoreBoxCfg = questionSet?.params.exportConfig?.scoreBox;

  return (
    <section aria-label="Pratinjau dan ekspor soal" className="space-y-4">
      {/* Workspace Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-[#1E293B]">
        <div className="flex flex-wrap items-center gap-2">
          {/* 3-State Theme Switcher: Light / Dark / System */}
          <div
            role="group"
            aria-label="Pilih tema tampilan"
            className="inline-flex items-center gap-0.5 rounded-lg border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-[#0F172A]"
          >
            {(
              [
                { id: 'light', label: 'Terang', icon: Sun },
                { id: 'dark', label: 'Gelap', icon: Moon },
                { id: 'system', label: 'Sistem', icon: Monitor },
              ] as const
            ).map((opt) => {
              const Icon = opt.icon;
              const active = theme === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onSelectTheme(opt.id)}
                  aria-pressed={active}
                  data-testid={`theme-btn-${opt.id}`}
                  className={`inline-flex min-h-8 items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-green-700 text-white shadow-xs dark:bg-green-600'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => onToggleAnswerKey(!includeAnswerKey)}
            aria-pressed={includeAnswerKey}
            className={`inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              includeAnswerKey
                ? 'border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950/60 dark:text-green-300'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-[#0F172A] dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            {includeAnswerKey ? (
              <Eye className="h-4 w-4" aria-hidden="true" />
            ) : (
              <EyeOff className="h-4 w-4" aria-hidden="true" />
            )}
            {includeAnswerKey ? 'Kunci: Tampil' : 'Kunci: Tersembunyi'}
          </button>

          <button
            type="button"
            disabled={!questionSet || filteredQuestions.length === 0}
            onClick={onOpenPrintPreview}
            data-testid="btn-open-print-preview"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-xs font-semibold text-green-800 transition-colors hover:bg-green-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 whitespace-nowrap shrink-0 dark:border-green-800 dark:bg-green-950/60 dark:text-green-300 dark:hover:bg-green-900/60 dark:disabled:border-slate-800 dark:disabled:bg-slate-800/60 dark:disabled:text-slate-500"
          >
            <Printer className="h-3.5 w-3.5" aria-hidden="true" />
            Pratinjau Cetak
          </button>
        </div>

        {/* 1-Click Copy & Export Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!questionSet || filteredQuestions.length === 0}
            onClick={handleCopyAll}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-[#0F172A] dark:text-slate-200 dark:hover:bg-slate-800 dark:disabled:border-slate-800 dark:disabled:bg-slate-800/60 dark:disabled:text-slate-500"
          >
            {copiedAll ? (
              <>
                <Check className="h-4 w-4 text-green-600 dark:text-green-400" aria-hidden="true" />
                Tersalin
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" aria-hidden="true" />
                Salin Teks
              </>
            )}
          </button>

          <button
            type="button"
            disabled={!questionSet || filteredQuestions.length === 0}
            onClick={handleExportTxt}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-[#0F172A] dark:text-slate-200 dark:hover:bg-slate-800 dark:disabled:border-slate-800 dark:disabled:bg-slate-800/60 dark:disabled:text-slate-500"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            TXT
          </button>

          <button
            type="button"
            disabled={!questionSet || filteredQuestions.length === 0}
            onClick={handleExportXlsx}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 whitespace-nowrap shrink-0 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300 dark:hover:bg-emerald-900/60 dark:disabled:border-slate-800 dark:disabled:bg-slate-800/60 dark:disabled:text-slate-500"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            XLSX
          </button>

          <button
            type="button"
            disabled={!questionSet || filteredQuestions.length === 0 || isExportingDocx}
            onClick={handleExportDocx}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs font-semibold text-green-800 transition-colors hover:bg-green-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 whitespace-nowrap shrink-0 dark:border-green-800 dark:bg-green-950/60 dark:text-green-300 dark:hover:bg-green-900/60 dark:disabled:border-slate-800 dark:disabled:bg-slate-800/60 dark:disabled:text-slate-500"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            {isExportingDocx ? 'Menyusun...' : 'DOCX'}
          </button>

          <button
            type="button"
            disabled={!questionSet || filteredQuestions.length === 0}
            onClick={handleExportPdf}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-transparent bg-green-700 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-green-800 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 whitespace-nowrap shrink-0 dark:bg-green-600 dark:hover:bg-green-500 dark:disabled:border-slate-800 dark:disabled:bg-slate-800/60 dark:disabled:text-slate-500"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            PDF
          </button>
        </div>
      </div>

      {/* Category & Difficulty Filter Bar */}
      {questionSet && (
        <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-[#1E293B]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div
                role="group"
                aria-label="Filter jenis soal"
                className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-[#0F172A]"
              >
                {TYPE_FILTERS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setFilter((prev) => ({ ...prev, typeFilter: t }))}
                    aria-pressed={filter.typeFilter === t}
                    className={`min-h-8 rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                      filter.typeFilter === t
                        ? 'bg-white text-green-800 shadow-xs dark:bg-[#1E293B] dark:text-green-400'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              <div
                role="group"
                aria-label="Filter tingkat kesulitan"
                className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-[#0F172A]"
              >
                {DIFFICULTY_FILTERS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() =>
                      setFilter((prev) => ({ ...prev, difficultyFilter: d }))
                    }
                    aria-pressed={filter.difficultyFilter === d}
                    className={`min-h-8 rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                      filter.difficultyFilter === d
                        ? 'bg-white text-green-800 shadow-xs dark:bg-[#1E293B] dark:text-green-400'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setFavoritesOnly((prev) => !prev)}
                  aria-pressed={favoritesOnly}
                  data-testid="filter-favorites-btn"
                  className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                    favoritesOnly
                      ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300'
                      : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-[#0F172A] dark:text-slate-300'
                  }`}
                >
                  <Star className={`h-3.5 w-3.5 ${favoritesOnly ? 'fill-current' : ''}`} aria-hidden="true" />
                  Favorit
                </button>

                <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
                  <Search
                    className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
                    aria-hidden="true"
                  />
                  <input
                    type="search"
                    aria-label="Cari kata kunci soal"
                    value={filter.searchQuery}
                    onChange={(e) =>
                      setFilter((prev) => ({ ...prev, searchQuery: e.target.value }))
                    }
                    placeholder="Cari kata kunci soal..."
                    className="min-h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pr-3 pl-9 text-xs text-slate-900 placeholder:text-slate-400 focus:border-green-600 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-[#0F172A] dark:text-slate-100 dark:placeholder:text-slate-500"
                  />
                </div>
              </div>
          </div>

          {stats && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-mono-tabular">
                Menampilkan {filteredQuestions.length} dari {stats.total} butir
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono-tabular">
                Pilihan Ganda: {stats.multipleChoiceCount}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono-tabular">Esai/Non-PG: {stats.essayCount}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono-tabular">
                Total Bobot: {formatScore(stats.totalScoreWeight)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* 30% Image Quota & Master Validation Engine Bar */}
      {!isGenerating && questionSet && masterValidation && (
        <div
          data-testid="quota-and-validation-bar"
          className="no-print space-y-3 rounded-xl border border-slate-200 bg-white p-4 text-xs dark:border-slate-700 dark:bg-[#1E293B]"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-100">
                <ImagePlus className="h-4 w-4 text-green-700 dark:text-green-400" aria-hidden="true" />
                <span data-testid="image-quota-summary" className="font-mono-tabular">
                  Kuota Gambar: {imageQuotaStatus.imagedCount}/{imageQuotaStatus.maxAllowed} ·{' '}
                  Maksimal bergambar: {imageQuotaStatus.maxAllowed} · Minimal tanpa gambar:{' '}
                  {Math.max(0, imageQuotaStatus.totalQuestions - imageQuotaStatus.maxAllowed)}
                </span>
              </div>

              <button
                type="button"
                onClick={() => setShowValidationChecklist((prev) => !prev)}
                data-testid="btn-toggle-master-validation"
                className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                  masterValidation.isValid
                    ? 'border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950/60 dark:text-green-300'
                    : 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
                }`}
              >
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                Validasi Paket: {masterValidation.overallScore}/100
                {showValidationChecklist ? (
                  <ChevronUp className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {masterValidation.checks.some((c) => c.autoFixable) && (
                <button
                  type="button"
                  onClick={onRepairSet}
                  data-testid="btn-auto-repair-set"
                  className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-900 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200"
                >
                  <Wrench className="h-3.5 w-3.5" aria-hidden="true" />
                  Perbaiki Otomatis
                </button>
              )}

              <button
                type="button"
                disabled={Boolean(batchVisualProgress) || imageQuotaStatus.remaining <= 0}
                onClick={handleBatchGenerateVisuals}
                data-testid="btn-auto-generate-visuals"
                className="inline-flex min-h-8 items-center gap-1.5 rounded-md bg-green-700 px-3 py-1 text-[11px] font-semibold text-white hover:bg-green-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 dark:bg-green-600 dark:hover:bg-green-500 dark:disabled:bg-slate-800 dark:disabled:text-slate-500"
              >
                {batchVisualProgress ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    {batchVisualProgress}
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                    Buat Visual Otomatis (Maks 30%)
                  </>
                )}
              </button>
            </div>
          </div>

          {imageQuotaStatus.isExceeded && (
            <div
              role="alert"
              data-testid="image-quota-exceeded-banner"
              className="flex items-start gap-2 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-[11px] text-rose-900 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <div>
                <p className="font-semibold">
                  Peringatan Kuota 30% Terlampaui ({imageQuotaStatus.imagedCount} dari maksimal{' '}
                  {imageQuotaStatus.maxAllowed} soal bergambar).
                </p>
                <p className="mt-0.5">
                  Sistem tidak menghapus gambar pilihan guru secara otomatis. Silakan tinjau dan
                  hapus gambar pada salah satu soal berikut:{' '}
                  <span className="font-mono-tabular font-semibold">
                    Soal{' '}
                    {questionSet.questions
                      .filter((q) => Boolean(q.supportingImage?.dataUrl))
                      .map((q) => `#${q.number}`)
                      .join(', ')}
                  </span>
                </p>
              </div>
            </div>
          )}

          {showValidationChecklist && (
            <div
              data-testid="master-validation-checklist"
              className="grid grid-cols-1 gap-2 border-t border-slate-100 pt-3 sm:grid-cols-2 dark:border-slate-700"
            >
              {masterValidation.checks.map((chk) => (
                <div
                  key={chk.id}
                  className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50/70 p-2.5 dark:border-slate-700 dark:bg-[#0F172A]/70"
                >
                  {chk.status === 'passed' ? (
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600 dark:text-green-400" />
                  ) : (
                    <AlertTriangle
                      className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
                        chk.status === 'failed'
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-amber-600 dark:text-amber-400'
                      }`}
                    />
                  )}
                  <div>
                    <p className="font-semibold text-slate-800 dark:text-slate-100">{chk.label}</p>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400">{chk.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* AI Deep Analysis Summary */}
      {!isGenerating && questionSet?.deepAnalysis && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-xs dark:border-slate-700 dark:bg-[#1E293B]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold text-green-800 dark:text-green-400">
              Ringkasan AI Deep Analysis & Kontrol Kualitas
            </span>
            <span className="text-slate-500 dark:text-slate-400">
              {questionSet.params.curriculum} · {questionSet.params.assessmentType}
            </span>
          </div>
          <p className="mt-1.5 leading-relaxed text-slate-600 dark:text-slate-300">
            {questionSet.deepAnalysis.pedagogicalSummary}
          </p>
          {questionSet.deepAnalysis.verificationReminder && (
            <p className="mt-1.5 text-[11px] text-amber-700 dark:text-amber-400">
              Catatan Verifikasi: {questionSet.deepAnalysis.verificationReminder}
            </p>
          )}
        </div>
      )}

      {/* Loading Skeleton State */}
      {isGenerating && (
        <div
          aria-live="polite"
          className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-[#1E293B]"
        >
          <div className="space-y-2 border-b border-slate-100 pb-4 dark:border-slate-700">
            <div className="h-5 w-2/3 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
            <div className="h-3.5 w-1/2 animate-pulse rounded bg-slate-100 dark:bg-slate-800/70" />
          </div>
          {[1, 2, 3].map((idx) => (
            <div key={idx} className="space-y-2.5 py-2">
              <div className="h-3 w-40 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
              <div className="h-4 w-full animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
              <div className="h-4 w-5/6 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
            </div>
          ))}
        </div>
      )}

      {/* Empty Initial State with Starter Presets */}
      {!isGenerating && !questionSet && (
        <div className="rounded-xl border border-slate-200 bg-white p-8 dark:border-slate-700 dark:bg-[#1E293B]">
          <div className="mx-auto max-w-2xl">
            <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-lg border border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950/60 dark:text-green-400">
              <FileText className="h-5 w-5" aria-hidden="true" />
            </div>
            <p className="text-[11px] font-bold tracking-wider text-green-700 uppercase dark:text-green-400">
              {APP_OFFICIAL_NAME} · {APP_OFFICIAL_BRANDING}
            </p>
            <h2 className="font-display mt-1 text-xl font-semibold text-slate-900 dark:text-white">
              Pratinjau Lembar Soal & Visual Studio
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              Lengkapi parameter kurikulum di panel kiri lalu tekan{' '}
              <span className="font-medium text-slate-900 dark:text-white">
                Buat Soal Otomatis
              </span>
              , atau muat salah satu contoh paket asesmen di bawah ini untuk menguji
              penilaian otomatis skala 100.00, generator gambar soal AI per nomor, kop dokumen
              kustom, kartu peserta ujian, serta ekspor DOCX, PDF, dan XLSX.
            </p>

            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {SAMPLE_QUESTION_SETS.map((sample) => (
                <button
                  key={sample.id}
                  type="button"
                  onClick={() => onLoadSample(sample.id)}
                  className="flex flex-col items-start rounded-lg border border-slate-200 bg-green-50/40 p-4 text-left transition-colors hover:border-green-400 hover:bg-green-50 dark:border-slate-700 dark:bg-[#0F172A]/70 dark:hover:border-green-600 dark:hover:bg-green-950/30"
                >
                  <span className="text-xs font-semibold text-green-700 dark:text-green-400">
                    {sample.params.educationLevel} · {sample.params.grade}
                  </span>
                  <span className="mt-1.5 text-sm font-semibold text-slate-900 dark:text-white">
                    {sample.params.subject}
                  </span>
                  <span className="mt-1 line-clamp-2 text-xs text-slate-600 dark:text-slate-400">
                    {sample.params.topic}
                  </span>
                  <span className="font-mono-tabular mt-3 text-xs font-medium text-green-700 dark:text-green-400">
                    Muat {sample.questions.length} Soal →
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Intelligent Difficulty-Based Scoring Dashboard (100.00) */}
      {!isGenerating && questionSet && (
        <ScoringDashboard
          questions={questionSet.questions}
          onRecalculate={onRecalculateWeights}
          onResetAuto={onResetWeightsAuto}
          onSaveChanges={onSaveScoringChanges}
          onUpdateDifficulty={(qId, diff) => onUpdateQuestion(qId, { difficulty: diff })}
        />
      )}

      {/* Populated Academic Worksheet Preview */}
      {!isGenerating && questionSet && (
        <article
          data-testid="question-sheet-preview"
          className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8 dark:border-slate-700 dark:bg-[#1E293B]"
        >
          {/* Formal Indonesian Exam Header with Teacher Score Box */}
          <header className="relative border-b-2 border-green-800 pb-5 dark:border-green-600">
            <div className="flex flex-col items-center justify-between gap-4 sm:flex-row sm:items-start">
              <div className="flex-1 text-center">
                {docId?.schoolLogoDataUrl && (
                  <img
                    src={docId.schoolLogoDataUrl}
                    alt="Logo Sekolah"
                    referrerPolicy="no-referrer"
                    className={`mx-auto mb-2 h-12 w-12 ${
                      docId.schoolLogoFit === 'cover' ? 'object-cover' : 'object-contain'
                    }`}
                  />
                )}
                {schoolTitle.trim() && (
                  <p className="text-xs font-bold tracking-wider text-green-800 uppercase dark:text-green-400">
                    {schoolTitle}
                  </p>
                )}
                {(docId?.schoolAddress?.trim() || docId?.schoolNpsn?.trim()) && (
                  <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                    {[
                      docId.schoolAddress?.trim(),
                      docId.schoolNpsn?.trim() ? `NPSN: ${docId.schoolNpsn.trim()}` : '',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                )}
                <h2 className="font-display mt-1 text-xl font-bold text-slate-900 text-balance sm:text-2xl dark:text-white">
                  {questionSet.title}
                </h2>
                <div className="mt-2.5 flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
                  <span>
                    {questionSet.params.educationLevel} · {questionSet.params.grade}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{questionSet.params.curriculum}</span>
                  <span aria-hidden="true">·</span>
                  <span>{questionSet.params.assessmentType}</span>
                  <span aria-hidden="true">·</span>
                  <span>{questionSet.params.subject}</span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {docId?.semester ?? 'Ganjil'} {docId?.academicYear ?? '2026/2027'}
                  </span>
                </div>
              </div>

              {scoreBoxCfg?.enabled && (
                <div
                  data-testid="preview-score-box"
                  className="w-24 shrink-0 rounded-md border-[1.5px] border-green-800 bg-green-50/40 text-center dark:border-green-500 dark:bg-[#0F172A]"
                >
                  <div className="border-b border-green-800 py-1 text-[10px] font-bold tracking-wider text-green-900 uppercase dark:border-green-500 dark:text-green-300">
                    {scoreBoxCfg.label || 'NILAI'}
                  </div>
                  <div className="h-10" />
                </div>
              )}
            </div>
          </header>

          {/* Topic, Teacher & Metadata Line (Optional NIP cleanly omitted if empty) */}
          <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 pb-4 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-400">
            <div className="space-y-0.5">
              <p>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  Materi:
                </span>{' '}
                {questionSet.params.topic}
              </p>
              {docId?.teacherName?.trim() && (
                <p data-testid="preview-teacher-line">
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    Guru Pengampu:
                  </span>{' '}
                  {docId.teacherName.trim()}
                  {nipText ? ` · ${nipText}` : ''}
                  {docId.teacherUnit?.trim() ? ` · ${docId.teacherUnit.trim()}` : ''}
                </p>
              )}
            </div>
            <p className="font-mono-tabular">
              Waktu: {docId?.timeAllocation ?? '90 Menit'} · Tata Letak:{' '}
              {questionSet.params.exportConfig?.layoutMode === 'single'
                ? '1 Kolom'
                : questionSet.params.exportConfig?.layoutMode === 'auto'
                  ? 'Smart Auto'
                  : '2 Kolom'}{' '}
              · {filteredQuestions.length} butir
            </p>
          </div>

          {filteredQuestions.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Tidak ada butir soal yang cocok dengan filter saat ini.
              </p>
              <button
                type="button"
                onClick={() =>
                  setFilter({
                    typeFilter: 'Semua',
                    difficultyFilter: 'Semua',
                    searchQuery: '',
                  })
                }
                className="mt-3 inline-flex min-h-9 items-center rounded-lg border border-slate-200 px-3.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Tampilkan Semua Soal
              </button>
            </div>
          ) : (
            <ol className="mt-6 space-y-6">
              {filteredQuestions.map((q, index) => {
                const displayNumber = q.number || index + 1;
                const isEditing = editingId === q.id;
                const img = q.supportingImage;
                const canAddCheck = canAddImageToQuestion(questionSet.questions, q.id);
                const isAiToolsOpen = aiToolsOpenId === q.id;
                const isRevisionOpen = revisionOpenId === q.id;
                const selectedTargetSubType =
                  targetSubTypeByQuestion[q.id] ?? q.questionSubType ?? 'Pilihan Ganda';
                const singleText = [
                  `${displayNumber}. ${q.questionText}`,
                  ...q.options.map((o) => `   ${o.label}. ${o.text}`),
                  includeAnswerKey ? `   Kunci: ${q.correctAnswer}` : '',
                ]
                  .filter(Boolean)
                  .join('\n');

                const renderSupportingImage = () => {
                  if (!img) return null;
                  return (
                    <figure
                      data-testid={`question-image-figure-${displayNumber}`}
                      className="my-3 flex flex-col items-start"
                    >
                      <img
                        src={img.dataUrl}
                        alt={img.caption || `Gambar pendukung Soal ${displayNumber}`}
                        className={`rounded-lg border border-slate-200 bg-white object-contain p-1 dark:border-slate-700 ${getPreviewImgSizeClass(
                          img.displaySize
                        )}`}
                      />
                      {img.caption && (
                        <figcaption className="mt-1 text-xs italic text-slate-600 dark:text-slate-400">
                          {img.caption}
                        </figcaption>
                      )}
                    </figure>
                  );
                };

                return (
                  <li
                    key={q.id}
                    data-testid="question-item"
                    className="border-b border-slate-100 pb-6 last:border-b-0 last:pb-0 dark:border-slate-700"
                  >
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-mono-tabular font-semibold text-slate-900 dark:text-white">
                          Soal {displayNumber}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{q.questionSubType || q.type}</span>
                        <span aria-hidden="true">·</span>
                        <select
                          aria-label={`Tingkat kesulitan soal nomor ${displayNumber}`}
                          value={q.difficulty}
                          onChange={(e) =>
                            onUpdateQuestion(q.id, {
                              difficulty: e.target.value as DifficultyLevel,
                            })
                          }
                          className={`rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] font-semibold dark:border-slate-700 dark:bg-[#0F172A] ${getDifficultyTextClass(
                            q.difficulty
                          )}`}
                        >
                          <option value="Mudah">Mudah</option>
                          <option value="Sedang">Sedang</option>
                          <option value="Sulit">Sulit</option>
                          <option value="HOTS">HOTS</option>
                        </select>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono-tabular">
                          {q.cognitiveLevel} ({q.cognitiveTier || 'MOTS'})
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono-tabular">
                          Bobot {formatScore(q.scoreWeight)}
                        </span>
                        {q.qaReport && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span
                              data-testid={`qa-badge-${displayNumber}`}
                              className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                                q.qaReport.status === 'layak'
                                  ? 'bg-green-100 text-green-800 dark:bg-green-950/60 dark:text-green-300'
                                  : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                              }`}
                            >
                              QA {q.qaReport.qualityScore}/100
                            </span>
                          </>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateQuestion(q.id, { isFavorite: !q.isFavorite })
                          }
                          aria-label={`Tandai favorit soal nomor ${displayNumber}`}
                          aria-pressed={Boolean(q.isFavorite)}
                          data-testid={`btn-favorite-question-${displayNumber}`}
                          className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
                            q.isFavorite
                              ? 'text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/40'
                              : 'text-slate-400 hover:bg-slate-100 hover:text-amber-500 dark:hover:bg-slate-800'
                          }`}
                        >
                          <Star className={`h-3.5 w-3.5 ${q.isFavorite ? 'fill-current' : ''}`} />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDuplicateQuestion(q.id)}
                          aria-label={`Duplikasi soal nomor ${displayNumber}`}
                          data-testid={`btn-duplicate-question-${displayNumber}`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-green-50 hover:text-green-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-green-400"
                        >
                          <CopyPlus className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setAiToolsOpenId((prev) => (prev === q.id ? null : q.id))
                          }
                          aria-label={`Alat AI dan QA soal nomor ${displayNumber}`}
                          data-testid={`btn-ai-tools-${displayNumber}`}
                          className={`inline-flex h-8 items-center gap-1 rounded-md px-2 text-[11px] font-medium transition-colors ${
                            isAiToolsOpen
                              ? 'bg-green-100 text-green-800 dark:bg-green-950/70 dark:text-green-300'
                              : 'text-slate-600 hover:bg-green-50 hover:text-green-700 dark:text-slate-300 dark:hover:bg-slate-800'
                          }`}
                        >
                          <Wand2 className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">AI Editor</span>
                        </button>
                        {q.revisionHistory && q.revisionHistory.length > 0 && (
                          <button
                            type="button"
                            onClick={() =>
                              setRevisionOpenId((prev) => (prev === q.id ? null : q.id))
                            }
                            aria-label={`Riwayat revisi soal nomor ${displayNumber}`}
                            className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                          >
                            <History className="h-3.5 w-3.5" />
                            <span>{q.revisionHistory.length}</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => (isEditing ? setEditingId(null) : startEditing(q))}
                          aria-label={`Sunting soal nomor ${displayNumber}`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-green-50 hover:text-green-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-green-400"
                        >
                          {isEditing ? <X className="h-3.5 w-3.5" /> : <Edit3 className="h-3.5 w-3.5" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCopySingle(q.id, singleText)}
                          aria-label={`Salin soal nomor ${displayNumber}`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                        >
                          {copiedId === q.id ? (
                            <Check className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => onRemoveQuestion(q.id)}
                          aria-label={`Hapus soal nomor ${displayNumber}`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-slate-400 dark:hover:bg-red-950/50 dark:hover:text-red-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {isAiToolsOpen && (
                      <div
                        data-testid={`ai-tools-panel-${displayNumber}`}
                        className="no-print mb-3 space-y-2.5 rounded-lg border border-green-200 bg-green-50/40 p-3 text-xs dark:border-green-900/60 dark:bg-green-950/20"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold text-green-800 dark:text-green-300">
                            Alat Penyuntingan AI & Quality Assurance (Soal {displayNumber})
                          </span>
                          <button
                            type="button"
                            onClick={() => setAiToolsOpenId(null)}
                            className="text-slate-400 hover:text-slate-700 dark:hover:text-white"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {(
                            [
                              { action: 'simplify', label: 'Sederhanakan Bahasa' },
                              { action: 'grammar', label: 'Perbaiki Tata Bahasa' },
                              { action: 'expand', label: 'Kembangkan Pertanyaan' },
                              { action: 'variation', label: 'Buat Variasi Soal' },
                              { action: 'qa_audit', label: 'Audit Kualitas (QA)' },
                            ] as const
                          ).map((tool) => {
                            const busy = aiBusyKey === `${q.id}:${tool.action}`;
                            return (
                              <button
                                key={tool.action}
                                type="button"
                                disabled={Boolean(aiBusyKey)}
                                onClick={() =>
                                  handleRefineQuestion(q, tool.action, tool.label)
                                }
                                data-testid={`btn-ai-${tool.action}-${displayNumber}`}
                                className="inline-flex min-h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:border-green-300 hover:bg-green-50 hover:text-green-800 disabled:opacity-60 dark:border-slate-700 dark:bg-[#1E293B] dark:text-slate-200"
                              >
                                {busy && <Loader2 className="h-3 w-3 animate-spin" />}
                                {tool.label}
                              </button>
                            );
                          })}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <label className="text-[11px] font-medium text-slate-700 dark:text-slate-300">
                            Ubah Jenis Soal:
                          </label>
                          <select
                            value={selectedTargetSubType}
                            onChange={(e) =>
                              setTargetSubTypeByQuestion((prev) => ({
                                ...prev,
                                [q.id]: e.target.value as QuestionSubType,
                              }))
                            }
                            className="min-h-8 rounded border border-slate-200 bg-white px-2 text-[11px] dark:border-slate-700 dark:bg-[#0F172A]"
                          >
                            {QUESTION_SUBTYPES.map((st) => (
                              <option key={st} value={st}>
                                {st}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            disabled={Boolean(aiBusyKey)}
                            onClick={() =>
                              handleRefineQuestion(
                                q,
                                'change_subtype',
                                `Ubah Jenis → ${selectedTargetSubType}`,
                                selectedTargetSubType
                              )
                            }
                            className="inline-flex min-h-8 items-center gap-1 rounded bg-green-700 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-green-800 disabled:opacity-60"
                          >
                            {aiBusyKey === `${q.id}:change_subtype` && (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            )}
                            Terapkan Bentuk
                          </button>
                        </div>
                      </div>
                    )}

                    {isRevisionOpen && q.revisionHistory && q.revisionHistory.length > 0 && (
                      <div className="no-print mb-3 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-700 dark:bg-[#0F172A]">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            Riwayat Revisi Soal {displayNumber}
                          </span>
                          <button
                            type="button"
                            onClick={() => setRevisionOpenId(null)}
                            className="text-slate-400 hover:text-slate-700 dark:hover:text-white"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <ul className="space-y-2">
                          {q.revisionHistory.map((rev) => (
                            <li
                              key={rev.id}
                              className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-[#1E293B]"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="text-[10px] font-semibold text-green-700 dark:text-green-400">
                                  Sebelum: {rev.actionLabel} ·{' '}
                                  {new Date(rev.changedAt).toLocaleTimeString('id-ID')}
                                </p>
                                <p className="truncate text-[11px] text-slate-700 dark:text-slate-300">
                                  {rev.questionText}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleRestoreRevision(q, rev)}
                                className="inline-flex shrink-0 items-center gap-1 rounded border border-green-300 bg-green-50 px-2 py-1 text-[10px] font-semibold text-green-800 hover:bg-green-100 dark:border-green-800 dark:bg-green-950/60 dark:text-green-300"
                              >
                                <RotateCcw className="h-3 w-3" />
                                Pulihkan
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {q.qaReport && (
                      <div
                        data-testid={`qa-report-box-${displayNumber}`}
                        className="no-print mb-3 rounded-lg border border-slate-200 bg-slate-50/80 p-3 text-xs dark:border-slate-700 dark:bg-[#0F172A]/80"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            Hasil Audit QA: Skor {q.qaReport.qualityScore}/100 (
                            {q.qaReport.status === 'layak' ? 'Layak Pakai' : 'Disarankan Revisi'})
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-300">
                          {q.qaReport.summary}
                        </p>
                        {q.qaReport.suggestions.length > 0 && (
                          <ul className="mt-1 space-y-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                            {q.qaReport.suggestions.map((s, sIdx) => (
                              <li key={sIdx}>• Saran: {s}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}

                    {isEditing ? (
                      <div className="space-y-3 rounded-lg border border-green-200 bg-green-50/40 p-4 text-xs dark:border-green-900 dark:bg-green-950/20">
                        <div>
                          <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                            Stimulus / Bacaan (Opsional)
                          </label>
                          <textarea
                            rows={2}
                            value={editDraft.stimulus ?? ''}
                            onChange={(e) =>
                              setEditDraft((prev) => ({ ...prev, stimulus: e.target.value }))
                            }
                            className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-[#0F172A]"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                            Teks Pertanyaan
                          </label>
                          <textarea
                            rows={3}
                            value={editDraft.questionText ?? ''}
                            onChange={(e) =>
                              setEditDraft((prev) => ({ ...prev, questionText: e.target.value }))
                            }
                            className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-[#0F172A]"
                          />
                        </div>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                          <div className="sm:col-span-2">
                            <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                              Kunci Jawaban
                            </label>
                            <input
                              type="text"
                              value={editDraft.correctAnswer ?? ''}
                              onChange={(e) =>
                                setEditDraft((prev) => ({ ...prev, correctAnswer: e.target.value }))
                              }
                              className="min-h-8 w-full rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs dark:border-slate-700 dark:bg-[#0F172A]"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                              Bobot Skor
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              min={0}
                              max={100}
                              value={editDraft.scoreWeight ?? 10}
                              onChange={(e) =>
                                setEditDraft((prev) => ({
                                  ...prev,
                                  scoreWeight: Number(e.target.value),
                                }))
                              }
                              className="font-mono-tabular min-h-8 w-full rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs dark:border-slate-700 dark:bg-[#0F172A]"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                            Pembahasan
                          </label>
                          <textarea
                            rows={2}
                            value={editDraft.explanation ?? ''}
                            onChange={(e) =>
                              setEditDraft((prev) => ({ ...prev, explanation: e.target.value }))
                            }
                            className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-[#0F172A]"
                          />
                        </div>
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="min-h-8 rounded-md border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-[#0F172A] dark:text-slate-200"
                          >
                            Batal
                          </button>
                          <button
                            type="button"
                            onClick={() => saveEdit(q.id)}
                            className="min-h-8 rounded-md bg-green-700 px-3 py-1 text-xs font-semibold text-white hover:bg-green-800 dark:bg-green-600"
                          >
                            Simpan Perubahan
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {q.stimulus && (
                          <div className="mb-2.5 rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-xs leading-relaxed text-slate-700 dark:border-slate-700 dark:bg-[#0F172A]/70 dark:text-slate-300">
                            <span className="font-semibold text-slate-900 dark:text-white">
                              Stimulus:
                            </span>{' '}
                            {q.stimulus}
                          </div>
                        )}

                        {img && img.placement === 'before' && renderSupportingImage()}

                        <p className="text-[15px] leading-relaxed text-slate-900 dark:text-slate-100">
                          {q.questionText}
                        </p>

                        {img && img.placement === 'after' && renderSupportingImage()}

                        {q.matchingPairs && q.matchingPairs.length > 0 && (
                          <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
                            <table className="w-full border-collapse text-left text-xs">
                              <thead>
                                <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-[#0F172A]">
                                  <th className="px-3 py-2 font-semibold">Premis / Pernyataan</th>
                                  <th className="px-3 py-2 font-semibold">Pasangan</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                {q.matchingPairs.map((pair, pIdx) => (
                                  <tr key={pIdx}>
                                    <td className="px-3 py-2">
                                      {pIdx + 1}. {pair.prompt}
                                    </td>
                                    <td className="px-3 py-2">
                                      {String.fromCharCode(65 + pIdx)}. {pair.match}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        {q.options.length > 0 && (
                          <ul className="mt-3 space-y-1.5 pl-1">
                            {q.options.map((opt) => {
                              const isCorrect =
                                includeAnswerKey &&
                                (q.correctAnswer.trim().toUpperCase() === opt.label.toUpperCase() ||
                                  q.correctAnswer
                                    .trim()
                                    .toUpperCase()
                                    .startsWith(`${opt.label.toUpperCase()}.`) ||
                                  q.correctAnswer
                                    .trim()
                                    .toUpperCase()
                                    .startsWith(`${opt.label.toUpperCase()} `));
                              return (
                                <li
                                  key={opt.label}
                                  className={`flex items-baseline gap-2.5 rounded-md px-2.5 py-1.5 text-sm ${
                                    isCorrect
                                      ? 'bg-green-50 font-medium text-green-900 dark:bg-green-950/60 dark:text-green-200'
                                      : 'text-slate-700 dark:text-slate-300'
                                  }`}
                                >
                                  <span className="font-mono-tabular font-semibold">
                                    {opt.label}.
                                  </span>
                                  <span>{opt.text}</span>
                                </li>
                              );
                            })}
                          </ul>
                        )}

                        {includeAnswerKey && (
                          <div className="mt-3.5 rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-xs leading-relaxed dark:border-slate-700 dark:bg-[#0F172A]">
                            <p className="font-semibold text-green-700 dark:text-green-400">
                              Kunci Jawaban: {q.correctAnswer}
                            </p>
                            {q.explanation && (
                              <p className="mt-1 text-slate-700 dark:text-slate-300">
                                <span className="font-medium text-slate-900 dark:text-white">
                                  Pembahasan:
                                </span>{' '}
                                {q.explanation}
                              </p>
                            )}
                            {q.rubric && q.rubric.length > 0 && (
                              <div className="mt-2 border-t border-slate-200 pt-2 dark:border-slate-700">
                                <p className="font-semibold text-slate-800 dark:text-slate-200">
                                  Rubrik Penskoran:
                                </p>
                                <ul className="mt-1 space-y-1 text-slate-600 dark:text-slate-300">
                                  {q.rubric.map((r, rIdx) => (
                                    <li key={rIdx}>
                                      • <span className="font-medium">{r.criterion}</span> (Maks{' '}
                                      {formatScore(r.maxScore)}): {r.descriptor}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        )}

                        <QuestionImagePanel
                          question={q}
                          displayNumber={displayNumber}
                          subject={questionSet.params.subject}
                          educationLevel={questionSet.params.educationLevel}
                          grade={questionSet.params.grade}
                          topic={questionSet.params.topic}
                          additionalNotes={questionSet.params.additionalNotes}
                          canAddNewImage={canAddCheck.allowed}
                          quotaReason={canAddCheck.reason}
                          onUpdateImage={(nextImg) =>
                            onUpdateQuestion(q.id, { supportingImage: nextImg })
                          }
                          onNotify={onNotify}
                        />
                      </>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </article>
      )}
    </section>
  );
}
