import { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  Paperclip,
  RotateCcw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type {
  AkmFocusMode,
  AssessmentType,
  CurriculumType,
  DifficultyLevel,
  DocumentExportConfig,
  DocumentIdentity,
  EducationLevel,
  GeneratorParams,
  KopTemplate,
  LogoFitMode,
  QuestionFormat,
  QuestionSubType,
  ReferenceAttachment,
  StoredLogoAsset,
  SubjectCatalogMap,
  ValidationErrors,
} from '../types/question';
import {
  AKM_FOCUS_MODES,
  ASSESSMENT_TYPES,
  CURRICULUM_OPTIONS,
  DIFFICULTY_DETAILS,
  EDUCATION_LEVELS,
  QUESTION_SUBTYPES,
  getGradesForLevel,
  getSubjectsForLevel,
  getTopicSuggestions,
} from '../utils/curriculum';
import { parseReferenceFile } from '../utils/documentParser';
import {
  MAX_QUESTIONS_LIMIT,
  calculateMaxImagedQuestions,
} from '../utils/imageQuota';
import { APP_OFFICIAL_BRANDING, APP_OFFICIAL_NAME } from '../utils/kopTemplates';
import { LogoUploaderControl } from './LogoUploaderControl';

interface GeneratorFormProps {
  params: GeneratorParams;
  subjectCatalog: SubjectCatalogMap;
  attachments: ReferenceAttachment[];
  onChangeAttachments: (next: ReferenceAttachment[]) => void;
  errors: ValidationErrors;
  isGenerating: boolean;
  apiError: string | null;
  logos: StoredLogoAsset[];
  kopTemplates: KopTemplate[];
  activeKopId: string;
  onUpdateParam: <K extends keyof GeneratorParams>(
    key: K,
    value: GeneratorParams[K]
  ) => void;
  onUpdateDocIdentity: (patch: Partial<DocumentIdentity>) => void;
  onUpdateExportConfig: (patch: Partial<DocumentExportConfig>) => void;
  onChangeLevel: (level: EducationLevel) => void;
  onApplyLogoToTargets: (
    asset: StoredLogoAsset,
    targets: {
      profile?: boolean;
      kopIds?: string[];
      kopSide?: 'left' | 'right';
      examCard?: boolean;
      makePrimary?: boolean;
      fitMode?: LogoFitMode;
    }
  ) => Promise<void>;
  onDeleteStoredLogo: (logoId: string) => Promise<void>;
  onNotify?: (msg: string) => void;
  onOpenKopEditor?: () => void;
  onReset: () => void;
  onSubmit: () => void;
}

const FORMATS: QuestionFormat[] = ['Pilihan Ganda', 'Esai / Uraian', 'Campuran'];
const DIFFICULTIES: DifficultyLevel[] = ['Mudah', 'Sedang', 'Sulit', 'HOTS'];

export function GeneratorForm({
  params,
  subjectCatalog,
  attachments,
  onChangeAttachments,
  errors,
  isGenerating,
  apiError,
  logos,
  kopTemplates,
  activeKopId,
  onUpdateParam,
  onUpdateDocIdentity,
  onUpdateExportConfig,
  onChangeLevel,
  onApplyLogoToTargets,
  onDeleteStoredLogo,
  onNotify,
  onOpenKopEditor,
  onReset,
  onSubmit,
}: GeneratorFormProps) {
  const [openSection, setOpenSection] = useState<'core' | 'plan' | 'advanced' | 'doc'>('core');
  const [uploadError, setUploadError] = useState<string | null>(null);

  const gradeOptions = getGradesForLevel(params.educationLevel);
  const subjectOptions = getSubjectsForLevel(params.educationLevel, subjectCatalog);
  const topicSuggestions = getTopicSuggestions(params.educationLevel, params.subject);
  const selectedDifficultyInfo = DIFFICULTY_DETAILS[params.difficulty];
  const isK13 = params.curriculum === 'Kurikulum 2013 Revisi';

  const handleToggleSubType = (subType: QuestionSubType) => {
    const exists = params.selectedSubTypes.includes(subType);
    if (exists && params.selectedSubTypes.length === 1) return;
    const next = exists
      ? params.selectedSubTypes.filter((t) => t !== subType)
      : [...params.selectedSubTypes, subType];
    onUpdateParam('selectedSubTypes', next);
    if (params.subTypeCounts && params.subTypeCounts.length > 0) {
      const updatedCounts = params.subTypeCounts.filter((c) => next.includes(c.subType));
      onUpdateParam('subTypeCounts', updatedCounts.length > 0 ? updatedCounts : undefined);
    }
  };

  const maxImagesAllowed = calculateMaxImagedQuestions(
    Math.min(MAX_QUESTIONS_LIMIT, Math.max(1, params.questionCount || 1))
  );
  const subTypeSum = (params.subTypeCounts ?? []).reduce(
    (acc, item) => acc + (Number.isFinite(item.count) ? Math.max(0, Math.round(item.count)) : 0),
    0
  );

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadError(null);
    try {
      const parsed = await parseReferenceFile(file);
      onChangeAttachments([...attachments.slice(0, 2), parsed]);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Gagal membaca berkas referensi.');
    }
  };

  const handleImageAssetUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    target: 'schoolLogoDataUrl' | 'teacherSignatureDataUrl',
    label: string
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 450_000) {
      setUploadError(`Ukuran ${label} maksimal 450 KB.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onUpdateDocIdentity({ [target]: reader.result });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit();
  };

  const toggleSection = (sec: 'core' | 'plan' | 'advanced' | 'doc') => {
    setOpenSection((prev) => (prev === sec ? 'core' : sec));
  };

  return (
    <aside className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-[#1E293B]">
      <div className="mb-4 flex items-center justify-between gap-3 border-b border-slate-100 pb-4 dark:border-slate-700">
        <div>
          <h1 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
            Parameter Asesmen
          </h1>
          <p className="mt-0.5 text-[11px] font-medium text-green-700 dark:text-green-400">
            {APP_OFFICIAL_NAME} · {APP_OFFICIAL_BRANDING}
          </p>
          <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
            {params.docIdentity.schoolName.trim()
              ? `${params.docIdentity.schoolName.trim()} · Kurikulum Adaptif`
              : 'Kurikulum Adaptif Nasional'}
          </p>
        </div>
        <button
          type="button"
          onClick={onReset}
          aria-label="Reset parameter formulir"
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-green-50 hover:text-green-800 whitespace-nowrap shrink-0 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          Reset
        </button>
      </div>

      <form onSubmit={handleFormSubmit} noValidate className="space-y-4">
        {/* Kurikulum & Jenjang Utama */}
        <div>
          <label
            htmlFor="curriculum-select"
            className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-200"
          >
            Kurikulum Satuan Pendidikan
          </label>
          <select
            id="curriculum-select"
            value={params.curriculum}
            onChange={(e) =>
              onUpdateParam('curriculum', e.target.value as CurriculumType)
            }
            className="min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-green-600 focus:outline-none dark:border-slate-700 dark:bg-[#0F172A] dark:text-slate-100"
          >
            {CURRICULUM_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label
              htmlFor="level-select"
              className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-200"
            >
              Jenjang Pendidikan
            </label>
            <select
              id="level-select"
              value={params.educationLevel}
              onChange={(e) => onChangeLevel(e.target.value as EducationLevel)}
              className="min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-green-600 focus:outline-none dark:border-slate-700 dark:bg-[#0F172A] dark:text-slate-100"
            >
              {EDUCATION_LEVELS.map((lvl) => (
                <option key={lvl.value} value={lvl.value}>
                  {lvl.label}
                </option>
              ))}
            </select>
            {errors.educationLevel && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400" role="alert">
                {errors.educationLevel}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="grade-select"
              className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-200"
            >
              Kelas / Fase
            </label>
            <select
              id="grade-select"
              value={params.grade}
              onChange={(e) => onUpdateParam('grade', e.target.value)}
              className="min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-green-600 focus:outline-none dark:border-slate-700 dark:bg-[#0F172A] dark:text-slate-100"
            >
              {gradeOptions.map((g) => (
                <option key={g.value} value={g.value}>
                  {isK13 ? g.value : `${g.value} (${g.faseMerdeka})`}
                </option>
              ))}
            </select>
            {errors.grade && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400" role="alert">
                {errors.grade}
              </p>
            )}
          </div>
        </div>

        {/* Mata Pelajaran */}
        <div>
          <label
            htmlFor="subject-select"
            className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-200"
          >
            Mata Pelajaran
          </label>
          <select
            id="subject-select"
            value={subjectOptions.includes(params.subject) ? params.subject : '__custom__'}
            onChange={(e) => {
              if (e.target.value === '__custom__') {
                onUpdateParam('subject', '');
              } else {
                onUpdateParam('subject', e.target.value);
              }
            }}
            className="min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-green-600 focus:outline-none dark:border-slate-700 dark:bg-[#0F172A] dark:text-slate-100"
          >
            {subjectOptions.map((subj) => (
              <option key={subj} value={subj}>
                {subj}
              </option>
            ))}
            <option value="__custom__">Mata Pelajaran Lainnya (Ketik Sendiri)</option>
          </select>

          {!subjectOptions.includes(params.subject) && (
            <input
              type="text"
              aria-label="Nama mata pelajaran kustom"
              value={params.subject}
              onChange={(e) => onUpdateParam('subject', e.target.value)}
              placeholder="Ketik nama mata pelajaran (misal: Bahasa Jawa)"
              className="mt-2 min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-green-600 focus:outline-none dark:border-slate-700 dark:bg-[#0F172A] dark:text-slate-100 dark:placeholder:text-slate-500"
            />
          )}
          {errors.subject && (
            <p className="mt-1 text-xs text-red-600 dark:text-red-400" role="alert">
              {errors.subject}
            </p>
          )}
        </div>

        {/* Jenis Asesmen & Mode AKM/SD */}
        <div className="grid grid-cols-1 gap-3">
          <div>
            <label
              htmlFor="assessment-select"
              className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-200"
            >
              Jenis Asesmen
            </label>
            <select
              id="assessment-select"
              value={params.assessmentType}
              onChange={(e) =>
                onUpdateParam('assessmentType', e.target.value as AssessmentType)
              }
              className="min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-green-600 focus:outline-none dark:border-slate-700 dark:bg-[#0F172A] dark:text-slate-100"
            >
              {ASSESSMENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="akm-select"
              className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-200"
            >
              Model / Fokus Khusus
            </label>
            <select
              id="akm-select"
              value={params.akmMode}
              onChange={(e) =>
                onUpdateParam('akmMode', e.target.value as AkmFocusMode)
              }
              className="min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-green-600 focus:outline-none dark:border-slate-700 dark:bg-[#0F172A] dark:text-slate-100"
            >
              {AKM_FOCUS_MODES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Topik / Materi */}
        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <label
              htmlFor="topic-input"
              className="text-xs font-semibold text-slate-700 dark:text-slate-200"
            >
              Topik / Materi Pembelajaran
            </label>
            <span className="font-mono-tabular text-xs text-slate-500 dark:text-slate-400">
              {params.topic.length}/500
            </span>
          </div>
          <textarea
            id="topic-input"
            rows={2}
            value={params.topic}
            onChange={(e) => onUpdateParam('topic', e.target.value)}
            placeholder="Contoh: Keliling dan luas persegi panjang dalam kehidupan sehari-hari"
            className={`w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none dark:bg-[#0F172A] dark:text-slate-100 dark:placeholder:text-slate-500 ${
              errors.topic
                ? 'border-red-500 focus:border-red-600'
                : 'border-slate-200 focus:border-green-600 dark:border-slate-700'
            }`}
          />
          {errors.topic && (
            <p className="mt-1 text-xs text-red-600 dark:text-red-400" role="alert">
              {errors.topic}
            </p>
          )}
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {topicSuggestions.map((sug) => (
              <button
                key={sug}
                type="button"
                onClick={() => onUpdateParam('topic', sug)}
                className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-700 transition-colors hover:border-green-300 hover:bg-green-50 hover:text-green-800 dark:border-slate-700 dark:bg-[#0F172A] dark:text-slate-300 dark:hover:border-green-600 dark:hover:text-green-300"
              >
                {sug}
              </button>
            ))}
          </div>
        </div>

        {/* Jenis Soal & Tingkat Kesulitan */}
        <div>
          <span className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-200">
            Format & Tingkat Kesulitan
          </span>
          <div
            role="group"
            aria-label="Pilih jenis soal"
            className="grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1 dark:bg-[#0F172A]"
          >
            {FORMATS.map((fmt) => {
              const active = params.questionFormat === fmt;
              const shortLabel = fmt === 'Esai / Uraian' ? 'Esai' : fmt;
              return (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => onUpdateParam('questionFormat', fmt)}
                  aria-pressed={active}
                  className={`min-h-9 rounded-md px-2 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-white text-green-700 shadow-xs dark:bg-[#1E293B] dark:text-green-400'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
                  }`}
                >
                  {shortLabel}
                </button>
              );
            })}
          </div>

          <div
            role="group"
            aria-label="Pilih tingkat kesulitan"
            className="mt-2 grid grid-cols-4 gap-1 rounded-lg bg-slate-100 p-1 dark:bg-[#0F172A]"
          >
            {DIFFICULTIES.map((diff) => {
              const active = params.difficulty === diff;
              return (
                <button
                  key={diff}
                  type="button"
                  onClick={() => onUpdateParam('difficulty', diff)}
                  aria-pressed={active}
                  className={`min-h-9 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-white text-green-700 shadow-xs dark:bg-[#1E293B] dark:text-green-400'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
                  }`}
                >
                  {diff}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400">
            <span className="font-medium text-slate-800 dark:text-slate-200">
              {selectedDifficultyInfo.cognitiveTarget}
            </span>{' '}
            — {selectedDifficultyInfo.description}
          </p>
        </div>

        {/* Jumlah Soal (1-50) + Info Kuota Gambar 30% */}
        <div>
          <div className="mb-1 flex items-center justify-between gap-2">
            <label
              htmlFor="count-range"
              className="text-xs font-semibold text-slate-700 dark:text-slate-200"
            >
              Jumlah Soal (1–50 Butir)
            </label>
            <span className="font-mono-tabular text-xs font-semibold text-green-700 dark:text-green-400">
              {params.questionCount} Soal
            </span>
          </div>
          <div className="flex items-center gap-3">
            <input
              id="count-range"
              type="range"
              min={1}
              max={50}
              value={Math.min(50, Math.max(1, params.questionCount || 1))}
              onChange={(e) => onUpdateParam('questionCount', Number(e.target.value))}
              className="h-2 w-full cursor-pointer accent-green-700 dark:accent-green-500"
            />
            <input
              id="count-number"
              aria-label="Jumlah soal numerik"
              type="number"
              min={1}
              max={50}
              value={params.questionCount}
              onChange={(e) => onUpdateParam('questionCount', Number(e.target.value))}
              className="font-mono-tabular min-h-9 w-16 rounded-lg border border-slate-200 bg-white px-2 py-1 text-center text-xs text-slate-900 focus:border-green-600 focus:outline-none dark:border-slate-700 dark:bg-[#0F172A] dark:text-slate-100"
            />
          </div>
          <p
            data-testid="form-image-quota-info"
            className="mt-1 text-[11px] leading-relaxed text-slate-600 dark:text-slate-400"
          >
            Jumlah soal:{' '}
            <span className="font-mono-tabular font-semibold text-slate-800 dark:text-slate-200">
              {Math.min(MAX_QUESTIONS_LIMIT, Math.max(1, params.questionCount || 1))}
            </span>{' '}
            · Maksimal soal bergambar (≤30%):{' '}
            <span className="font-mono-tabular font-semibold text-green-700 dark:text-green-400">
              {maxImagesAllowed}
            </span>{' '}
            · Minimal soal tanpa gambar:{' '}
            <span className="font-mono-tabular font-semibold text-slate-800 dark:text-slate-200">
              {Math.max(
                0,
                Math.min(MAX_QUESTIONS_LIMIT, Math.max(1, params.questionCount || 1)) -
                  maxImagesAllowed
              )}
            </span>
            {Math.min(MAX_QUESTIONS_LIMIT, Math.max(1, params.questionCount || 1)) < 4
              ? ' (0 gambar untuk paket < 4 soal).'
              : '.'}
          </p>
          {params.questionCount > 50 && (
            <div className="mt-1.5 flex items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-900 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-200">
              <span>Batas maksimal 50 soal dalam satu proses.</span>
              <button
                type="button"
                onClick={() => onUpdateParam('questionCount', 50)}
                className="font-semibold underline"
              >
                Batasi ke 50
              </button>
            </div>
          )}
          {errors.questionCount && (
            <p className="mt-1 text-xs text-red-600 dark:text-red-400" role="alert">
              {errors.questionCount}
            </p>
          )}
        </div>

        {/* Accordion 2: Pemetaan CP/TP/ATP/KKTP atau KI/KD/IPK */}
        <div className="rounded-lg border border-slate-200 dark:border-slate-700">
          <button
            type="button"
            onClick={() => toggleSection('plan')}
            aria-expanded={openSection === 'plan'}
            className="flex min-h-10 w-full items-center justify-between px-3.5 py-2 text-left text-xs font-semibold text-slate-800 hover:bg-green-50/50 dark:text-slate-200 dark:hover:bg-slate-800/50"
          >
            <span>
              {isK13
                ? 'Pemetaan KI, KD & IPK (Kurikulum 2013)'
                : 'Pemetaan CP, TP, ATP & KKTP'}
            </span>
            {openSection === 'plan' ? (
              <ChevronUp className="h-4 w-4 text-slate-500" />
            ) : (
              <ChevronDown className="h-4 w-4 text-slate-500" />
            )}
          </button>

          {openSection === 'plan' && (
            <div className="space-y-2.5 border-t border-slate-100 p-3 text-xs dark:border-slate-700">
              {isK13 ? (
                <>
                  <div>
                    <label htmlFor="ki-input" className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                      Kompetensi Inti (KI)
                    </label>
                    <input
                      id="ki-input"
                      type="text"
                      value={params.learningPlan.ki}
                      onChange={(e) =>
                        onUpdateParam('learningPlan', { ...params.learningPlan, ki: e.target.value })
                      }
                      placeholder="Contoh: KI-3 Memahami pengetahuan faktual & konseptual"
                      className="min-h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-[#0F172A]"
                    />
                  </div>
                  <div>
                    <label htmlFor="kd-input" className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                      Kompetensi Dasar (KD)
                    </label>
                    <textarea
                      id="kd-input"
                      rows={2}
                      value={params.learningPlan.kd}
                      onChange={(e) =>
                        onUpdateParam('learningPlan', { ...params.learningPlan, kd: e.target.value })
                      }
                      placeholder="Salin KD resmi dari dokumen kurikulum sekolah"
                      className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-[#0F172A]"
                    />
                  </div>
                  <div>
                    <label htmlFor="ipk-input" className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                      Indikator Pencapaian Kompetensi (IPK)
                    </label>
                    <input
                      id="ipk-input"
                      type="text"
                      value={params.learningPlan.ipk}
                      onChange={(e) =>
                        onUpdateParam('learningPlan', { ...params.learningPlan, ipk: e.target.value })
                      }
                      placeholder="Opsional: diturunkan dari KD"
                      className="min-h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-[#0F172A]"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label htmlFor="cp-input" className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                      Capaian Pembelajaran (CP — {params.learningPlan.phase})
                    </label>
                    <textarea
                      id="cp-input"
                      rows={2}
                      value={params.learningPlan.cp}
                      onChange={(e) =>
                        onUpdateParam('learningPlan', { ...params.learningPlan, cp: e.target.value })
                      }
                      placeholder="Tempel CP resmi BSKAP atau biarkan kosong untuk dibantu AI"
                      className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-[#0F172A]"
                    />
                  </div>
                  <div>
                    <label htmlFor="tp-input" className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                      Tujuan Pembelajaran (TP)
                    </label>
                    <textarea
                      id="tp-input"
                      rows={2}
                      value={params.learningPlan.tp}
                      onChange={(e) =>
                        onUpdateParam('learningPlan', { ...params.learningPlan, tp: e.target.value })
                      }
                      placeholder="Contoh: Peserta didik mampu menyelesaikan masalah..."
                      className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-[#0F172A]"
                    />
                  </div>
                  <div>
                    <label htmlFor="atp-input" className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                      Alur Tujuan Pembelajaran (ATP)
                    </label>
                    <input
                      id="atp-input"
                      type="text"
                      value={params.learningPlan.atp}
                      onChange={(e) =>
                        onUpdateParam('learningPlan', { ...params.learningPlan, atp: e.target.value })
                      }
                      placeholder="Urutan logis rangkaian tujuan pembelajaran dalam satu fase"
                      className="min-h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-[#0F172A]"
                    />
                  </div>
                  <div>
                    <label htmlFor="kktp-input" className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                      Kriteria Ketercapaian Tujuan Pembelajaran (KKTP)
                    </label>
                    <input
                      id="kktp-input"
                      type="text"
                      value={params.learningPlan.kktp}
                      onChange={(e) =>
                        onUpdateParam('learningPlan', { ...params.learningPlan, kktp: e.target.value })
                      }
                      placeholder="Indikator/rubrik/interval ketercapaian sesuai satuan pendidikan"
                      className="min-h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-[#0F172A]"
                    />
                  </div>
                </>
              )}
              <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                Catatan: Guru memegang kewenangan penuh memeriksa & menyunting hasil CP/TP/KD agar selaras dengan dokumen BSKAP terbaru.
              </p>
            </div>
          )}
        </div>

        {/* Accordion 3: 18 Bentuk Soal, Distribusi Bloom & Upload Dokumen/Gambar */}
        <div className="rounded-lg border border-slate-200 dark:border-slate-700">
          <button
            type="button"
            onClick={() => toggleSection('advanced')}
            aria-expanded={openSection === 'advanced'}
            className="flex min-h-10 w-full items-center justify-between px-3.5 py-2 text-left text-xs font-semibold text-slate-800 hover:bg-green-50/50 dark:text-slate-200 dark:hover:bg-slate-800/50"
          >
            <span>Bentuk Soal Nasional, HOTS & Bahan Referensi</span>
            {openSection === 'advanced' ? (
              <ChevronUp className="h-4 w-4 text-slate-500" />
            ) : (
              <ChevronDown className="h-4 w-4 text-slate-500" />
            )}
          </button>

          {openSection === 'advanced' && (
            <div className="space-y-3 border-t border-slate-100 p-3 text-xs dark:border-slate-700">
              <div>
                <span className="mb-1.5 block font-medium text-slate-700 dark:text-slate-300">
                  Pilih Variasi Bentuk Soal (18 Tipe Nasional)
                </span>
                <div className="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto">
                  {QUESTION_SUBTYPES.map((st) => {
                    const active = params.selectedSubTypes.includes(st);
                    return (
                      <button
                        key={st}
                        type="button"
                        onClick={() => handleToggleSubType(st)}
                        aria-pressed={active}
                        className={`rounded-md border px-2 py-1 text-[11px] transition-colors ${
                          active
                            ? 'border-green-600 bg-green-50 font-medium text-green-800 dark:border-green-500 dark:bg-green-950/60 dark:text-green-300'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-[#0F172A] dark:text-slate-400'
                        }`}
                      >
                        {st}
                      </button>
                    );
                  })}
                </div>

                {params.selectedSubTypes.length > 1 && (
                  <div className="mt-2.5 rounded-lg border border-slate-200 bg-slate-50/80 p-2.5 dark:border-slate-700 dark:bg-[#0F172A]/60">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-slate-700 dark:text-slate-300">
                        Alokasi Jumlah per Bentuk (Total ≤ 50)
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          if (params.subTypeCounts && params.subTypeCounts.length > 0) {
                            onUpdateParam('subTypeCounts', undefined);
                          } else {
                            const per = Math.max(
                              1,
                              Math.floor(params.questionCount / params.selectedSubTypes.length)
                            );
                            const nextCounts = params.selectedSubTypes.map((st, idx) => ({
                              subType: st,
                              count:
                                idx === 0
                                  ? Math.max(
                                      1,
                                      params.questionCount -
                                        per * (params.selectedSubTypes.length - 1)
                                    )
                                  : per,
                            }));
                            onUpdateParam('subTypeCounts', nextCounts);
                          }
                        }}
                        className="text-[11px] font-semibold text-green-700 hover:underline dark:text-green-400"
                      >
                        {params.subTypeCounts && params.subTypeCounts.length > 0
                          ? 'Gunakan Proporsi Otomatis'
                          : 'Atur Jumlah Spesifik'}
                      </button>
                    </div>
                    {params.subTypeCounts && params.subTypeCounts.length > 0 && (
                      <div className="mt-2 space-y-1.5">
                        {params.selectedSubTypes.map((st) => {
                          const existing = params.subTypeCounts?.find((c) => c.subType === st);
                          const val = existing?.count ?? 0;
                          return (
                            <div key={st} className="flex items-center justify-between gap-2">
                              <span className="truncate text-[11px] text-slate-700 dark:text-slate-300">
                                {st}
                              </span>
                              <input
                                type="number"
                                min={0}
                                max={50}
                                aria-label={`Jumlah soal ${st}`}
                                value={val}
                                onChange={(e) => {
                                  const num = Math.max(0, Math.round(Number(e.target.value) || 0));
                                  const next = params.selectedSubTypes.map((s) => ({
                                    subType: s,
                                    count:
                                      s === st
                                        ? num
                                        : params.subTypeCounts?.find((c) => c.subType === s)
                                            ?.count ?? 0,
                                  }));
                                  const newTotal = next.reduce((a, b) => a + b.count, 0);
                                  onUpdateParam('subTypeCounts', next);
                                  if (newTotal > 0) {
                                    onUpdateParam('questionCount', newTotal);
                                  }
                                }}
                                className="font-mono-tabular min-h-7 w-16 rounded border border-slate-200 bg-white px-1.5 text-center text-[11px] dark:border-slate-700 dark:bg-[#1E293B]"
                              />
                            </div>
                          );
                        })}
                        <p
                          className={`font-mono-tabular text-[11px] font-medium ${
                            subTypeSum > 50
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-green-700 dark:text-green-400'
                          }`}
                        >
                          Total gabungan: {subTypeSum} / 50 soal
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div>
                <span className="mb-1.5 block font-medium text-slate-700 dark:text-slate-300">
                  Distribusi Acuan Kognitif (%) — Fleksibel
                </span>
                <div className="grid grid-cols-3 gap-2">
                  {(['LOTS', 'MOTS', 'HOTS'] as const).map((tier) => (
                    <label key={tier} className="block">
                      <span className="mb-0.5 block text-[11px] text-slate-500">{tier} %</span>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={params.cognitiveDistribution[tier]}
                        onChange={(e) =>
                          onUpdateParam('cognitiveDistribution', {
                            ...params.cognitiveDistribution,
                            [tier]: Number(e.target.value),
                          })
                        }
                        className="font-mono-tabular min-h-8 w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-[#0F172A]"
                      />
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1.5 block font-medium text-slate-700 dark:text-slate-300">
                  Unggah Dokumen / Gambar Referensi (TXT, DOCX, PPTX, PDF, JPG/PNG)
                </label>
                <label className="flex min-h-9 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-700 hover:border-green-400 hover:bg-green-50/40 dark:border-slate-700 dark:bg-[#0F172A] dark:text-slate-300">
                  <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Pilih Berkas Materi / Modul Ajar</span>
                  <input
                    type="file"
                    accept=".txt,.md,.csv,.docx,.pptx,.pdf,image/png,image/jpeg,image/webp"
                    onChange={handleFileUpload}
                    className="sr-only"
                  />
                </label>
                {uploadError && (
                  <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">{uploadError}</p>
                )}
                {attachments.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {attachments.map((att) => (
                      <li
                        key={att.id}
                        className="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] dark:border-slate-700 dark:bg-[#0F172A]"
                      >
                        <span className="truncate font-medium text-slate-800 dark:text-slate-200">
                          {att.name}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            onChangeAttachments(attachments.filter((a) => a.id !== att.id))
                          }
                          aria-label={`Hapus lampiran ${att.name}`}
                          className="text-slate-500 hover:text-red-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Accordion 4: Identitas Sekolah, Profil Guru & Tata Letak Ekspor */}
        <div className="rounded-lg border border-slate-200 dark:border-slate-700">
          <button
            type="button"
            onClick={() => toggleSection('doc')}
            aria-expanded={openSection === 'doc'}
            className="flex min-h-10 w-full items-center justify-between px-3.5 py-2 text-left text-xs font-semibold text-slate-800 hover:bg-green-50/50 dark:text-slate-200 dark:hover:bg-slate-800/50"
          >
            <span>Profil Sekolah, Guru & Tata Letak Dokumen</span>
            {openSection === 'doc' ? (
              <ChevronUp className="h-4 w-4 text-slate-500" />
            ) : (
              <ChevronDown className="h-4 w-4 text-slate-500" />
            )}
          </button>

          {openSection === 'doc' && (
            <div className="space-y-3 border-t border-slate-100 p-3 text-xs dark:border-slate-700">
              {/* Identitas Sekolah */}
              <div className="space-y-2">
                <p className="font-semibold text-green-800 dark:text-green-400">
                  Identitas Sekolah / Madrasah
                </p>
                <div>
                  <label htmlFor="school-input" className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                    Nama Sekolah
                  </label>
                  <input
                    id="school-input"
                    type="text"
                    value={params.docIdentity.schoolName}
                    onChange={(e) => onUpdateDocIdentity({ schoolName: e.target.value })}
                    placeholder="Masukkan nama sekolah / madrasah"
                    className="min-h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-[#0F172A]"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor="school-npsn" className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                      NPSN <span className="font-normal text-slate-400">(Opsional)</span>
                    </label>
                    <input
                      id="school-npsn"
                      type="text"
                      value={params.docIdentity.schoolNpsn}
                      onChange={(e) => onUpdateDocIdentity({ schoolNpsn: e.target.value })}
                      placeholder="Kosongkan jika tidak dicetak"
                      className="min-h-8 w-full rounded-md border border-slate-200 bg-white px-2.5 text-xs dark:border-slate-700 dark:bg-[#0F172A]"
                    />
                  </div>
                  <div>
                    <label htmlFor="academic-year" className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                      Tahun Ajaran
                    </label>
                    <input
                      id="academic-year"
                      type="text"
                      value={params.docIdentity.academicYear}
                      onChange={(e) => onUpdateDocIdentity({ academicYear: e.target.value })}
                      placeholder="Contoh: 2026/2027"
                      className="min-h-8 w-full rounded-md border border-slate-200 bg-white px-2.5 text-xs dark:border-slate-700 dark:bg-[#0F172A]"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="school-address" className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                    Alamat Sekolah <span className="font-normal text-slate-400">(Opsional)</span>
                  </label>
                  <input
                    id="school-address"
                    type="text"
                    value={params.docIdentity.schoolAddress}
                    onChange={(e) => onUpdateDocIdentity({ schoolAddress: e.target.value })}
                    placeholder="Kosongkan jika tidak dicetak di kop"
                    className="min-h-8 w-full rounded-md border border-slate-200 bg-white px-2.5 text-xs dark:border-slate-700 dark:bg-[#0F172A]"
                  />
                </div>
                <LogoUploaderControl
                  label="Logo Sekolah / Madrasah"
                  slot="school"
                  currentDataUrl={params.docIdentity.schoolLogoDataUrl}
                  currentFitMode={params.docIdentity.schoolLogoFit ?? 'contain'}
                  logos={logos}
                  testIdPrefix="profile-school-logo"
                  onCommitLogo={async (asset, scope) => {
                    const syncTargets =
                      scope === 'primary'
                        ? Array.from(
                            new Set([
                              activeKopId,
                              ...kopTemplates.filter((k) => k.isDefault).map((k) => k.id),
                            ])
                          ).filter(Boolean)
                        : undefined;
                    await onApplyLogoToTargets(asset, {
                      profile: true,
                      makePrimary: scope === 'primary',
                      kopIds: syncTargets,
                      kopSide: 'left',
                      fitMode: asset.fit_mode,
                    });
                  }}
                  onChangeFitMode={(fit) => onUpdateDocIdentity({ schoolLogoFit: fit })}
                  onClearCurrent={() =>
                    onUpdateDocIdentity({ schoolLogoDataUrl: '', schoolLogoId: undefined })
                  }
                  onDeleteFromLibrary={onDeleteStoredLogo}
                  onNotify={(msg) => onNotify?.(msg)}
                />
              </div>

              {/* Profil Guru Pengampu */}
              <div className="space-y-2 border-t border-slate-100 pt-2.5 dark:border-slate-700">
                <p className="font-semibold text-green-800 dark:text-green-400">
                  Profil Guru Pengampu
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div>
                    <label htmlFor="teacher-input" className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                      Nama Guru
                    </label>
                    <input
                      id="teacher-input"
                      type="text"
                      value={params.docIdentity.teacherName}
                      onChange={(e) => onUpdateDocIdentity({ teacherName: e.target.value })}
                      placeholder="Masukkan nama guru penyusun"
                      className="min-h-8 w-full rounded-md border border-slate-200 bg-white px-2.5 text-xs dark:border-slate-700 dark:bg-[#0F172A]"
                    />
                  </div>
                  <div>
                    <label htmlFor="teacher-nip" className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                      NIP <span className="font-normal text-slate-400">(Opsional)</span>
                    </label>
                    <input
                      id="teacher-nip"
                      type="text"
                      value={params.docIdentity.teacherNip}
                      onChange={(e) => onUpdateDocIdentity({ teacherNip: e.target.value })}
                      placeholder="Kosongkan jika tidak ingin dicetak"
                      className="min-h-8 w-full rounded-md border border-slate-200 bg-white px-2.5 text-xs dark:border-slate-700 dark:bg-[#0F172A]"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor="teacher-role" className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                      Jabatan <span className="font-normal text-slate-400">(Opsional)</span>
                    </label>
                    <input
                      id="teacher-role"
                      type="text"
                      value={params.docIdentity.teacherRole}
                      onChange={(e) => onUpdateDocIdentity({ teacherRole: e.target.value })}
                      placeholder="Contoh: Guru Kelas V"
                      className="min-h-8 w-full rounded-md border border-slate-200 bg-white px-2.5 text-xs dark:border-slate-700 dark:bg-[#0F172A]"
                    />
                  </div>
                  <div>
                    <label htmlFor="teacher-unit" className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                      Unit Kerja
                    </label>
                    <input
                      id="teacher-unit"
                      type="text"
                      value={params.docIdentity.teacherUnit}
                      onChange={(e) => onUpdateDocIdentity({ teacherUnit: e.target.value })}
                      placeholder="Kosongkan atau isi unit kerja"
                      className="min-h-8 w-full rounded-md border border-slate-200 bg-white px-2.5 text-xs dark:border-slate-700 dark:bg-[#0F172A]"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <label className="flex min-h-8 flex-1 cursor-pointer items-center justify-between rounded-md border border-slate-200 px-2.5 py-1 text-[11px] dark:border-slate-700">
                    <span>Tanda Tangan Guru (Opsional)</span>
                    <span className="font-semibold text-green-700 dark:text-green-400">
                      {params.docIdentity.teacherSignatureDataUrl ? 'Terpasang' : 'Pilih'}
                    </span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg"
                      onChange={(e) =>
                        handleImageAssetUpload(e, 'teacherSignatureDataUrl', 'tanda tangan')
                      }
                      className="sr-only"
                    />
                  </label>
                  {params.docIdentity.teacherSignatureDataUrl && (
                    <button
                      type="button"
                      onClick={() => onUpdateDocIdentity({ teacherSignatureDataUrl: '' })}
                      className="min-h-8 rounded border border-slate-200 px-2 text-[11px] text-red-600 hover:bg-red-50 dark:border-slate-700"
                    >
                      Hapus
                    </button>
                  )}
                </div>
              </div>

              {/* Pengaturan Tata Letak Dokumen & Kotak Nilai */}
              <div className="space-y-2 border-t border-slate-100 pt-2.5 dark:border-slate-700">
                <p className="font-semibold text-green-800 dark:text-green-400">
                  Tata Letak Cetak & Kotak Nilai
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor="semester-select" className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                      Semester
                    </label>
                    <select
                      id="semester-select"
                      value={params.docIdentity.semester}
                      onChange={(e) =>
                        onUpdateDocIdentity({
                          semester: e.target.value as 'Ganjil' | 'Genap',
                        })
                      }
                      className="min-h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs dark:border-slate-700 dark:bg-[#0F172A]"
                    >
                      <option value="Ganjil">Ganjil</option>
                      <option value="Genap">Genap</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="time-input" className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                      Alokasi Waktu
                    </label>
                    <input
                      id="time-input"
                      type="text"
                      value={params.docIdentity.timeAllocation}
                      onChange={(e) => onUpdateDocIdentity({ timeAllocation: e.target.value })}
                      className="min-h-8 w-full rounded-md border border-slate-200 bg-white px-2.5 text-xs dark:border-slate-700 dark:bg-[#0F172A]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label htmlFor="paper-select" className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                      Kertas
                    </label>
                    <select
                      id="paper-select"
                      value={params.exportConfig.paperSize}
                      onChange={(e) =>
                        onUpdateExportConfig({
                          paperSize: e.target.value as DocumentExportConfig['paperSize'],
                        })
                      }
                      className="min-h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs dark:border-slate-700 dark:bg-[#0F172A]"
                    >
                      <option value="A4">A4</option>
                      <option value="F4/Folio">F4 / Folio</option>
                      <option value="Letter">Letter</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="layout-mode-select" className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                      Kolom Soal
                    </label>
                    <select
                      id="layout-mode-select"
                      value={params.exportConfig.layoutMode}
                      onChange={(e) => {
                        const mode = e.target.value as DocumentExportConfig['layoutMode'];
                        onUpdateExportConfig({
                          layoutMode: mode,
                          columns: mode === 'single' ? 1 : 2,
                        });
                      }}
                      className="min-h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs dark:border-slate-700 dark:bg-[#0F172A]"
                    >
                      <option value="two-column">Dua Kolom</option>
                      <option value="single">Satu Kolom</option>
                      <option value="auto">Otomatis</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="font-select" className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                      Font
                    </label>
                    <select
                      id="font-select"
                      value={params.exportConfig.fontFamily}
                      onChange={(e) =>
                        onUpdateExportConfig({
                          fontFamily: e.target.value as DocumentExportConfig['fontFamily'],
                        })
                      }
                      className="min-h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs dark:border-slate-700 dark:bg-[#0F172A]"
                    >
                      <option value="Times New Roman">Times New Roman</option>
                      <option value="Calibri">Calibri</option>
                      <option value="Arial">Arial</option>
                    </select>
                  </div>
                </div>

                <label className="flex min-h-8 cursor-pointer items-center gap-2 rounded-md border border-slate-200 px-2.5 py-1 dark:border-slate-700">
                  <input
                    type="checkbox"
                    checked={params.exportConfig.scoreBox.enabled}
                    onChange={(e) =>
                      onUpdateExportConfig({
                        scoreBox: {
                          ...params.exportConfig.scoreBox,
                          enabled: e.target.checked,
                        },
                      })
                    }
                    className="h-3.5 w-3.5 accent-green-700"
                  />
                  <span>Tampilkan Kotak Nilai Guru di Halaman 1 Naskah Soal</span>
                </label>

                <label className="flex min-h-8 cursor-pointer items-center gap-2 rounded-md border border-slate-200 px-2.5 py-1 dark:border-slate-700">
                  <input
                    type="checkbox"
                    checked={params.exportConfig.includeAppBranding !== false}
                    onChange={(e) =>
                      onUpdateExportConfig({
                        includeAppBranding: e.target.checked,
                      })
                    }
                    className="h-3.5 w-3.5 accent-green-700"
                  />
                  <span>Sertakan branding {APP_OFFICIAL_NAME} pada footer ekspor</span>
                </label>

                {onOpenKopEditor && (
                  <button
                    type="button"
                    onClick={onOpenKopEditor}
                    data-testid="btn-open-kop-editor-shortcut"
                    className="flex min-h-9 w-full items-center justify-center rounded-md border border-green-300 bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-800 transition-colors hover:bg-green-100 dark:border-green-800 dark:bg-green-950/50 dark:text-green-300"
                  >
                    Buka Editor Kop Dokumen
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        <div>
          <label
            htmlFor="notes-input"
            className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-200"
          >
            Catatan Tambahan Pendidik <span className="font-normal text-slate-500">(Opsional)</span>
          </label>
          <input
            id="notes-input"
            type="text"
            value={params.additionalNotes}
            onChange={(e) => onUpdateParam('additionalNotes', e.target.value)}
            placeholder="Contoh: Sertakan stimulus tabel atau cerita kontekstual"
            className="min-h-9 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-green-600 focus:outline-none dark:border-slate-700 dark:bg-[#0F172A] dark:text-slate-100 dark:placeholder:text-slate-500"
          />
        </div>

        <label className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-800 dark:border-slate-700 dark:text-slate-200">
          <input
            type="checkbox"
            checked={params.includeAnswerKey}
            onChange={(e) => onUpdateParam('includeAnswerKey', e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 accent-green-700"
          />
          <span>Sertakan Kunci Jawaban, Pembahasan & Kisi-Kisi</span>
        </label>

        {apiError && (
          <div
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-800 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-300"
          >
            {apiError}
          </div>
        )}

        <button
          type="submit"
          disabled={isGenerating}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-green-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-600 dark:bg-green-600 dark:hover:bg-green-500"
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Menjalankan 10-Stage AI Deep Analysis...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              Buat Soal Otomatis
            </>
          )}
        </button>
      </form>
    </aside>
  );
}
