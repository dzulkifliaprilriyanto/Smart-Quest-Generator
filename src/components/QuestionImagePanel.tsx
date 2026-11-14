import { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  History,
  ImagePlus,
  Loader2,
  Maximize2,
  MessageSquarePlus,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type {
  ImageAspectRatio,
  ImageBackgroundStyle,
  ImageDetailLevel,
  ImageDisplaySize,
  ImagePlacement,
  QuestionImage,
  QuestionImageConfig,
  QuestionImageHistoryEntry,
  QuestionImageType,
  QuestionItem,
} from '../types/question';
import {
  DEFAULT_IMAGE_GEN_CONFIG,
  IMAGE_ASPECT_RATIOS,
  QUESTION_IMAGE_TYPES,
} from '../utils/curriculum';
import { computeQuestionSnapshotHash } from '../utils/imageQuota';
import {
  archiveImageToHistory,
  readUploadedQuestionImage,
  requestAiQuestionVisual,
} from '../utils/visualGenerator';

interface QuestionImagePanelProps {
  question: QuestionItem;
  displayNumber: number;
  subject: string;
  educationLevel: string;
  grade: string;
  topic: string;
  additionalNotes?: string;
  canAddNewImage: boolean;
  quotaReason?: string;
  onUpdateImage: (nextImage: QuestionImage | undefined) => void;
  onNotify: (message: string) => void;
}

const DETAIL_LEVELS: ImageDetailLevel[] = ['Sederhana', 'Standar', 'Detail'];
const BG_STYLES: ImageBackgroundStyle[] = [
  'Putih Bersih',
  'Lembut Edukatif',
  'Transparan / Netral',
];
const ORIENTATIONS: Array<QuestionImageConfig['orientation']> = [
  'Landscape',
  'Square',
  'Portrait',
];

function inferSmartImageType(questionText: string, subject: string): QuestionImageType {
  const txt = `${subject} ${questionText}`.toLowerCase();
  if (/persegi|segitiga|lingkaran|kubus|balok|tabung|bangun|sudut|luas|keliling|volume/.test(txt)) {
    return 'Bangun datar dan bangun ruang';
  }
  if (/grafik|diagram batang|diagram garis|diagram lingkaran/.test(txt)) {
    return 'Grafik';
  }
  if (/tabel|jadwal|data/.test(txt)) {
    return 'Tabel visual';
  }
  if (/daur|siklus|rantai makanan|proses|tahap|bagan/.test(txt)) {
    return 'Diagram';
  }
  if (/eksperimen|percobaan|gelas|tabung reaksi|termometer|rangkaian listrik/.test(txt)) {
    return 'Ilustrasi eksperimen';
  }
  if (/peta|wilayah|provinsi|pulau|indonesia|benua/.test(txt)) {
    return 'Peta sederhana';
  }
  if (/organ|jantung|paru|sel|tumbuhan|daun|akar|anatomi/.test(txt)) {
    return 'Ilustrasi anatomi atau sains';
  }
  if (/gotong royong|kerja bakti|pasar|kegiatan|sekolah|bermain|keluarga/.test(txt)) {
    return 'Ilustrasi aktivitas sehari-hari';
  }
  return 'Ilustrasi edukasi';
}

export function QuestionImagePanel({
  question,
  displayNumber,
  subject,
  educationLevel,
  grade,
  topic,
  additionalNotes,
  canAddNewImage,
  quotaReason,
  onUpdateImage,
  onNotify,
}: QuestionImagePanelProps) {
  const existing = question.supportingImage;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [instructionOpen, setInstructionOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [skippedNotice, setSkippedNotice] = useState<string | null>(null);
  const [customInstruction, setCustomInstruction] = useState(
    existing?.customEditInstruction ?? ''
  );

  const [config, setConfig] = useState<QuestionImageConfig>(() => ({
    ...DEFAULT_IMAGE_GEN_CONFIG,
    imageType:
      existing?.imageType ?? inferSmartImageType(question.questionText, subject),
    visualStyle: existing?.visualStyle ?? DEFAULT_IMAGE_GEN_CONFIG.visualStyle,
    aspectRatio: existing?.aspectRatio ?? DEFAULT_IMAGE_GEN_CONFIG.aspectRatio,
    detailLevel: existing?.detailLevel ?? DEFAULT_IMAGE_GEN_CONFIG.detailLevel,
    backgroundStyle:
      existing?.backgroundStyle ?? DEFAULT_IMAGE_GEN_CONFIG.backgroundStyle,
    orientation: existing?.orientation ?? DEFAULT_IMAGE_GEN_CONFIG.orientation,
    includeLabels: existing?.includeLabels ?? true,
  }));

  const runAiGeneration = async (options?: {
    customConfig?: QuestionImageConfig;
    editInstruction?: string;
    forceOverride?: boolean;
  }) => {
    if (!existing && !canAddNewImage) {
      setErrorMsg(
        quotaReason ||
          'Kuota maksimal 30% soal bergambar telah tercapai. Hapus gambar pada soal lain terlebih dahulu.'
      );
      return;
    }

    setErrorMsg(null);
    setSkippedNotice(null);
    setIsGenerating(true);
    const activeCfg = options?.customConfig ?? config;
    const instruction = options?.editInstruction ?? customInstruction;

    try {
      const result = await requestAiQuestionVisual({
        question: { ...question, number: displayNumber },
        subject,
        educationLevel,
        grade,
        topic,
        additionalNotes,
        customEditInstruction: instruction.trim() || undefined,
        forceOverride: options?.forceOverride ?? Boolean(existing),
        config: activeCfg,
      });

      if (result.status === 'skipped_not_required' || !result.image) {
        setSkippedNotice(result.analysisSummary);
        setDrawerOpen(false);
        onNotify(
          `Soal ${displayNumber} dinilai TIDAK MEMERLUKAN gambar (${result.visualNecessity}). Kuota gambar dihemat.`
        );
        return;
      }

      onUpdateImage(result.image);
      setDrawerOpen(false);
      setInstructionOpen(false);
      onNotify(
        `Visual Soal ${displayNumber} selesai dibuat (${result.visualNecessity}). Silakan tinjau & klik "Gunakan Gambar".`
      );
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Gagal menghasilkan gambar AI. Coba lagi.'
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!existing && !canAddNewImage) {
      setErrorMsg(
        quotaReason ||
          'Kuota maksimal 30% soal bergambar telah tercapai. Hapus gambar pada soal lain terlebih dahulu.'
      );
      return;
    }
    setErrorMsg(null);
    setSkippedNotice(null);
    try {
      const uploaded = await readUploadedQuestionImage(file, question, displayNumber);
      onUpdateImage(uploaded);
      setDrawerOpen(false);
      onNotify(`Gambar "${uploaded.fileName}" berhasil dipasang pada Soal ${displayNumber}.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal mengunggah gambar.');
    }
  };

  const handleApproveImage = () => {
    if (!existing) return;
    onUpdateImage({
      ...existing,
      approvalStatus: 'approved',
      needsQuestionSyncReview: false,
      questionSnapshotHash: computeQuestionSnapshotHash(question),
    });
    onNotify(`Gambar Soal ${displayNumber} disetujui dan siap dicetak.`);
  };

  const handleRestoreHistory = (entry: QuestionImageHistoryEntry) => {
    if (!existing) return;
    const remainingHistory = (existing.history ?? []).filter((h) => h.id !== entry.id);
    const currentArchived = archiveImageToHistory({ ...existing, history: remainingHistory });
    onUpdateImage({
      ...existing,
      id: entry.id,
      fileName: entry.fileName,
      format: entry.format,
      mimeType: entry.mimeType,
      sizeBytes: entry.sizeBytes,
      width: entry.width,
      height: entry.height,
      source: entry.source,
      dataUrl: entry.dataUrl,
      caption: entry.caption,
      createdAt: entry.createdAt,
      approvalStatus: entry.approvalStatus ?? 'pending_review',
      analysisSummary: entry.analysisSummary,
      needsQuestionSyncReview: false,
      questionSnapshotHash: computeQuestionSnapshotHash(question),
      history: currentArchived,
    });
    setHistoryOpen(false);
    onNotify(`Versi gambar sebelumnya untuk Soal ${displayNumber} berhasil dipulihkan.`);
  };

  const handleRemove = () => {
    onUpdateImage(undefined);
    setDrawerOpen(false);
    setInstructionOpen(false);
    setHistoryOpen(false);
    setPreviewOpen(false);
    onNotify(`Gambar Soal ${displayNumber} dihapus.`);
  };

  const isNeedsReview = Boolean(
    existing &&
      (existing.needsQuestionSyncReview ||
        existing.approvalStatus === 'needs_revision' ||
        existing.validationReport?.semanticStatus === 'failed' ||
        existing.validationReport?.technicalStatus === 'failed')
  );
  const isApproved = Boolean(
    existing && existing.approvalStatus === 'approved' && !isNeedsReview
  );

  return (
    <div className="no-print mt-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-xs dark:border-slate-700 dark:bg-[#0F172A]/60">
      {/* Compact Action Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <ImagePlus
            className="h-3.5 w-3.5 text-green-700 dark:text-green-400"
            aria-hidden="true"
          />
          <span className="font-semibold text-slate-800 dark:text-slate-200">
            Visual Pendukung Soal {displayNumber}
          </span>
          {existing && (
            <span className="font-mono-tabular text-[11px] text-green-700 dark:text-green-400">
              · {existing.source === 'ai' ? 'AI Visual' : 'Unggahan'} (
              {existing.format.toUpperCase()})
            </span>
          )}
          {existing && (
            <span
              data-testid={`image-approval-badge-${displayNumber}`}
              className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                isApproved
                  ? 'bg-green-100 text-green-800 dark:bg-green-950/70 dark:text-green-300'
                  : isNeedsReview
                    ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300'
                    : 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300'
              }`}
            >
              {isApproved
                ? 'Disetujui Guru'
                : isNeedsReview
                  ? 'Perlu Ditinjau Ulang'
                  : 'Menunggu Persetujuan'}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {!existing ? (
            <>
              <button
                type="button"
                disabled={isGenerating || !canAddNewImage}
                title={!canAddNewImage ? quotaReason : undefined}
                onClick={() => setDrawerOpen((prev) => !prev)}
                data-testid={`btn-generate-image-${displayNumber}`}
                className="inline-flex min-h-8 items-center gap-1.5 rounded-md bg-green-700 px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-green-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 dark:bg-green-600 dark:hover:bg-green-500 dark:disabled:bg-slate-800 dark:disabled:text-slate-500"
              >
                <Sparkles className="h-3 w-3" aria-hidden="true" />
                Generate Image
              </button>

              <label
                data-testid={`btn-upload-image-${displayNumber}`}
                title={!canAddNewImage ? quotaReason : undefined}
                className={`inline-flex min-h-8 items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  !canAddNewImage
                    ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-500'
                    : 'cursor-pointer border-slate-200 bg-white text-slate-700 hover:border-green-300 hover:bg-green-50 hover:text-green-800 dark:border-slate-700 dark:bg-[#1E293B] dark:text-slate-200 dark:hover:border-green-600'
                }`}
              >
                <Upload className="h-3 w-3" aria-hidden="true" />
                Upload Manual
                <input
                  type="file"
                  disabled={!canAddNewImage}
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleUploadFile}
                  className="sr-only"
                />
              </label>
            </>
          ) : (
            <>
              {!isApproved && (
                <button
                  type="button"
                  onClick={handleApproveImage}
                  data-testid={`btn-approve-image-${displayNumber}`}
                  className="inline-flex min-h-8 items-center gap-1 rounded-md bg-green-700 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-green-800 dark:bg-green-600 dark:hover:bg-green-500"
                >
                  <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                  Gunakan Gambar
                </button>
              )}

              <button
                type="button"
                onClick={() => setPreviewOpen(true)}
                className="inline-flex min-h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-[#1E293B] dark:text-slate-200"
              >
                <Maximize2 className="h-3 w-3" aria-hidden="true" />
                Pratinjau
              </button>

              <button
                type="button"
                onClick={() => setInstructionOpen((prev) => !prev)}
                data-testid={`btn-edit-image-instruction-${displayNumber}`}
                className="inline-flex min-h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:border-green-300 hover:bg-green-50 dark:border-slate-700 dark:bg-[#1E293B] dark:text-slate-200"
              >
                <MessageSquarePlus className="h-3 w-3" aria-hidden="true" />
                Edit Instruksi
              </button>

              <button
                type="button"
                disabled={isGenerating}
                onClick={() => runAiGeneration({ forceOverride: true })}
                data-testid={`btn-regenerate-image-${displayNumber}`}
                className="inline-flex min-h-8 items-center gap-1 rounded-md border border-green-200 bg-green-50 px-2 py-1 text-[11px] font-semibold text-green-800 hover:bg-green-100 disabled:opacity-60 dark:border-green-800 dark:bg-green-950/60 dark:text-green-300"
              >
                {isGenerating ? (
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                ) : (
                  <RefreshCw className="h-3 w-3" aria-hidden="true" />
                )}
                Generate Ulang
              </button>

              <label className="inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:border-green-300 hover:bg-green-50 dark:border-slate-700 dark:bg-[#1E293B] dark:text-slate-200">
                <Upload className="h-3 w-3" aria-hidden="true" />
                Upload Manual
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleUploadFile}
                  className="sr-only"
                />
              </label>

              {existing.history && existing.history.length > 0 && (
                <button
                  type="button"
                  onClick={() => setHistoryOpen((prev) => !prev)}
                  data-testid={`btn-image-history-${displayNumber}`}
                  className="inline-flex min-h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-[#1E293B] dark:text-slate-200"
                >
                  <History className="h-3 w-3" aria-hidden="true" />
                  Riwayat ({existing.history.length})
                </button>
              )}

              <button
                type="button"
                onClick={() => setDrawerOpen((prev) => !prev)}
                className="inline-flex min-h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-[#1E293B] dark:text-slate-200"
              >
                Atur AI
              </button>

              <button
                type="button"
                onClick={handleRemove}
                data-testid={`btn-remove-image-${displayNumber}`}
                className="inline-flex min-h-8 items-center gap-1 rounded-md border border-red-200 bg-white px-2 py-1 text-[11px] font-medium text-red-700 hover:bg-red-50 dark:border-red-900/60 dark:bg-[#1E293B] dark:text-red-400"
              >
                <Trash2 className="h-3 w-3" aria-hidden="true" />
                Hapus Gambar
              </button>
            </>
          )}
        </div>
      </div>

      {/* Quota Blocked Hint on Unimaged Question */}
      {!existing && !canAddNewImage && quotaReason && (
        <p
          data-testid={`image-quota-blocked-${displayNumber}`}
          className="mt-2 flex items-center gap-1.5 text-[11px] text-amber-700 dark:text-amber-300"
        >
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{quotaReason}</span>
        </p>
      )}

      {/* Skipped by Necessity Notice with Optional Force Override */}
      {skippedNotice && !existing && (
        <div
          data-testid={`image-skipped-notice-${displayNumber}`}
          className="mt-2.5 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-[11px] text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200"
        >
          <div className="flex-1">
            <span className="font-semibold">Visual Tidak Diperlukan (NOT REQUIRED):</span>{' '}
            {skippedNotice}
          </div>
          {canAddNewImage && (
            <button
              type="button"
              disabled={isGenerating}
              onClick={() => runAiGeneration({ forceOverride: true })}
              className="rounded border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:bg-[#1E293B] dark:text-amber-200"
            >
              Tetap Buat Visual
            </button>
          )}
        </div>
      )}

      {/* Sync Review / Validation Details when Image Exists */}
      {existing && (
        <div className="mt-2.5 space-y-2 border-t border-slate-200 pt-2.5 dark:border-slate-700">
          {existing.needsQuestionSyncReview && (
            <div
              data-testid={`image-stale-warning-${displayNumber}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
            >
              <span>
                Teks pertanyaan atau opsi berubah setelah gambar dibuat. Periksa kecocokan gambar
                atau klik Generate Ulang / Gunakan Gambar.
              </span>
              <button
                type="button"
                onClick={handleApproveImage}
                className="rounded bg-amber-700 px-2 py-0.5 font-semibold text-white hover:bg-amber-800"
              >
                Tandai Tetap Sesuai
              </button>
            </div>
          )}

          {existing.validationReport && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-600 dark:text-slate-300">
              <span className="inline-flex items-center gap-1 font-medium text-green-800 dark:text-green-400">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                Skor Semantik: {existing.validationReport.semanticScore}/100 (
                {existing.validationReport.semanticStatus === 'passed'
                  ? 'Sesuai Konteks'
                  : existing.validationReport.semanticStatus === 'warning'
                    ? 'Perlu Cek'
                    : 'Revisi'}
                )
              </span>
              <span>
                · Teknis:{' '}
                {existing.validationReport.technicalStatus === 'passed' ? 'Lolos' : 'Bermasalah'}
              </span>
              {existing.structuredPrompt?.required_objects?.length ? (
                <span className="text-slate-500 dark:text-slate-400">
                  · Objek: {existing.structuredPrompt.required_objects.slice(0, 4).join(', ')}
                </span>
              ) : null}
            </div>
          )}

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-12">
            <div className="sm:col-span-3">
              <label className="mb-0.5 block text-[11px] font-medium text-slate-600 dark:text-slate-400">
                Posisi Gambar
              </label>
              <select
                aria-label={`Posisi gambar soal ${displayNumber}`}
                value={existing.placement}
                onChange={(e) =>
                  onUpdateImage({
                    ...existing,
                    placement: e.target.value as ImagePlacement,
                  })
                }
                className="min-h-8 w-full rounded border border-slate-200 bg-white px-2 text-[11px] dark:border-slate-700 dark:bg-[#1E293B] dark:text-slate-100"
              >
                <option value="before">Sebelum Teks Soal</option>
                <option value="after">Sesudah Teks Soal</option>
              </select>
            </div>

            <div className="sm:col-span-3">
              <label className="mb-0.5 block text-[11px] font-medium text-slate-600 dark:text-slate-400">
                Ukuran Cetak
              </label>
              <select
                aria-label={`Ukuran gambar soal ${displayNumber}`}
                value={existing.displaySize}
                onChange={(e) =>
                  onUpdateImage({
                    ...existing,
                    displaySize: e.target.value as ImageDisplaySize,
                  })
                }
                className="min-h-8 w-full rounded border border-slate-200 bg-white px-2 text-[11px] dark:border-slate-700 dark:bg-[#1E293B] dark:text-slate-100"
              >
                <option value="small">Kecil (Ringkas)</option>
                <option value="medium">Sedang (Standar)</option>
                <option value="large">Besar (Lebar Penuh)</option>
              </select>
            </div>

            <div className="sm:col-span-6">
              <label className="mb-0.5 block text-[11px] font-medium text-slate-600 dark:text-slate-400">
                Keterangan / Caption Gambar
              </label>
              <input
                type="text"
                aria-label={`Keterangan gambar soal ${displayNumber}`}
                value={existing.caption}
                onChange={(e) =>
                  onUpdateImage({
                    ...existing,
                    caption: e.target.value,
                  })
                }
                placeholder="Contoh: Gambar 1. Persegi panjang ukuran 12 cm x 8 cm"
                className="min-h-8 w-full rounded border border-slate-200 bg-white px-2.5 text-[11px] dark:border-slate-700 dark:bg-[#1E293B] dark:text-slate-100"
              />
            </div>
          </div>
        </div>
      )}

      {/* Custom Instruction Editor for Image Revision */}
      {instructionOpen && existing && (
        <div className="mt-3 space-y-2 rounded-lg border border-green-200 bg-white p-3 dark:border-green-900/60 dark:bg-[#1E293B]">
          <label className="block text-[11px] font-semibold text-slate-800 dark:text-slate-200">
            Instruksi Revisi Gambar untuk Soal {displayNumber}
          </label>
          <textarea
            rows={2}
            value={customInstruction}
            onChange={(e) => setCustomInstruction(e.target.value)}
            placeholder="Contoh: Perjelas label sisi 8 cm, ubah sudut pandang lebih sederhana, atau tambahkan panah arah siklus."
            className="w-full rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-[#0F172A] dark:text-slate-100"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setInstructionOpen(false)}
              className="rounded border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-600 dark:border-slate-700 dark:text-slate-300"
            >
              Tutup
            </button>
            <button
              type="button"
              disabled={isGenerating}
              onClick={() =>
                runAiGeneration({
                  editInstruction: customInstruction,
                  forceOverride: true,
                })
              }
              className="inline-flex items-center gap-1 rounded bg-green-700 px-3 py-1 text-[11px] font-semibold text-white hover:bg-green-800 disabled:opacity-60"
            >
              {isGenerating ? (
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCw className="h-3 w-3" aria-hidden="true" />
              )}
              Terapkan & Generate Ulang
            </button>
          </div>
        </div>
      )}

      {/* Image Version History Panel */}
      {historyOpen && existing?.history && existing.history.length > 0 && (
        <div className="mt-3 space-y-2 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-[#1E293B]">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              Riwayat Versi Gambar Soal {displayNumber}
            </span>
            <button
              type="button"
              onClick={() => setHistoryOpen(false)}
              className="text-slate-400 hover:text-slate-700 dark:hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {existing.history.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between gap-2 rounded border border-slate-200 p-2 dark:border-slate-700"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <img
                    src={entry.dataUrl}
                    alt={entry.caption}
                    className="h-10 w-12 shrink-0 rounded border border-slate-200 bg-white object-contain"
                  />
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-800 dark:text-slate-200">
                      {entry.caption}
                    </p>
                    <p className="text-[10px] text-slate-500">
                      {entry.source === 'ai' ? 'AI' : 'Manual'} ·{' '}
                      {new Date(entry.createdAt).toLocaleTimeString('id-ID')}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleRestoreHistory(entry)}
                  className="inline-flex shrink-0 items-center gap-1 rounded border border-green-300 bg-green-50 px-2 py-1 text-[10px] font-semibold text-green-800 hover:bg-green-100 dark:border-green-800 dark:bg-green-950/60 dark:text-green-300"
                >
                  <RotateCcw className="h-3 w-3" aria-hidden="true" />
                  Pulihkan
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI Image Generation Configuration Drawer */}
      {drawerOpen && (
        <div className="mt-3 space-y-3 rounded-lg border border-green-200 bg-white p-3.5 dark:border-green-900/60 dark:bg-[#1E293B]">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2 dark:border-slate-700">
            <span className="font-semibold text-green-800 dark:text-green-300">
              Smart Question Visual Engine (9-Tahap Context-Aware AI)
            </span>
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              aria-label="Tutup konfigurasi gambar"
              className="text-slate-400 hover:text-slate-700 dark:hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-slate-700 dark:text-slate-300">
                Jenis Gambar Pendukung
              </label>
              <select
                value={config.imageType}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    imageType: e.target.value as QuestionImageType,
                  }))
                }
                className="min-h-8 w-full rounded border border-slate-200 bg-white px-2 text-[11px] dark:border-slate-700 dark:bg-[#0F172A]"
              >
                {QUESTION_IMAGE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-medium text-slate-700 dark:text-slate-300">
                Rasio Gambar
              </label>
              <select
                value={config.aspectRatio}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    aspectRatio: e.target.value as ImageAspectRatio,
                  }))
                }
                className="min-h-8 w-full rounded border border-slate-200 bg-white px-2 text-[11px] dark:border-slate-700 dark:bg-[#0F172A]"
              >
                {IMAGE_ASPECT_RATIOS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-medium text-slate-700 dark:text-slate-300">
                Tingkat Detail
              </label>
              <select
                value={config.detailLevel}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    detailLevel: e.target.value as ImageDetailLevel,
                  }))
                }
                className="min-h-8 w-full rounded border border-slate-200 bg-white px-2 text-[11px] dark:border-slate-700 dark:bg-[#0F172A]"
              >
                {DETAIL_LEVELS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-medium text-slate-700 dark:text-slate-300">
                Latar Belakang
              </label>
              <select
                value={config.backgroundStyle}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    backgroundStyle: e.target.value as ImageBackgroundStyle,
                  }))
                }
                className="min-h-8 w-full rounded border border-slate-200 bg-white px-2 text-[11px] dark:border-slate-700 dark:bg-[#0F172A]"
              >
                {BG_STYLES.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-medium text-slate-700 dark:text-slate-300">
                Orientasi
              </label>
              <select
                value={config.orientation}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    orientation: e.target.value as QuestionImageConfig['orientation'],
                  }))
                }
                className="min-h-8 w-full rounded border border-slate-200 bg-white px-2 text-[11px] dark:border-slate-700 dark:bg-[#0F172A]"
              >
                {ORIENTATIONS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-medium text-slate-700 dark:text-slate-300">
                Gaya Visual
              </label>
              <input
                type="text"
                value={config.visualStyle}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, visualStyle: e.target.value }))
                }
                className="min-h-8 w-full rounded border border-slate-200 bg-white px-2 text-[11px] dark:border-slate-700 dark:bg-[#0F172A]"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-medium text-slate-700 dark:text-slate-300">
              Catatan Tambahan Objek / Label Visual (Opsional)
            </label>
            <input
              type="text"
              value={customInstruction}
              onChange={(e) => setCustomInstruction(e.target.value)}
              placeholder="Contoh: Tampilkan panjang 12 cm dan lebar 8 cm tanpa menulis rumus luas."
              className="min-h-8 w-full rounded border border-slate-200 bg-white px-2.5 text-[11px] dark:border-slate-700 dark:bg-[#0F172A]"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <label className="inline-flex cursor-pointer items-center gap-2 text-[11px] text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={config.includeLabels}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, includeLabels: e.target.checked }))
                }
                className="h-3.5 w-3.5 accent-green-700"
              />
              <span>Sertakan label ukuran / keterangan edukatif di dalam gambar</span>
            </label>

            <button
              type="button"
              disabled={isGenerating}
              onClick={() => runAiGeneration({ customConfig: config })}
              data-testid={`btn-confirm-generate-image-${displayNumber}`}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-green-700 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-green-800 disabled:opacity-60 dark:bg-green-600 dark:hover:bg-green-500"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  Menganalisis Soal & Validasi Visual...
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                  Buat Visual Soal Otomatis
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {errorMsg && (
        <p role="alert" className="mt-2 text-[11px] text-red-600 dark:text-red-400">
          {errorMsg}
        </p>
      )}

      {/* Lightbox Image Preview Modal */}
      {previewOpen && existing && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Pratinjau gambar soal ${displayNumber}`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4"
        >
          <div className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-[#1E293B]">
            <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2.5 dark:border-slate-700">
              <div>
                <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                  Pratinjau Gambar Pendukung — Soal {displayNumber}
                </h3>
                <p className="font-mono-tabular text-[11px] text-slate-500 dark:text-slate-400">
                  {existing.fileName} · {existing.format.toUpperCase()} ·{' '}
                  {Math.max(1, Math.round(existing.sizeBytes / 1024))} KB ·{' '}
                  {existing.width ?? 800}×{existing.height ?? 600}px · Sumber:{' '}
                  {existing.source === 'ai' ? 'AI Generator' : 'Unggahan Manual'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewOpen(false)}
                aria-label="Tutup pratinjau gambar"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex max-h-[55vh] items-center justify-center overflow-auto rounded-lg border border-slate-200 bg-white p-3">
              <img
                src={existing.dataUrl}
                alt={existing.caption || `Visual Soal ${displayNumber}`}
                className="max-h-[48vh] w-auto object-contain"
              />
            </div>

            {existing.analysisSummary && (
              <p className="mt-2.5 rounded-md bg-green-50 px-3 py-2 text-[11px] text-green-900 dark:bg-green-950/50 dark:text-green-200">
                <span className="font-semibold">Analisis Konteks AI:</span>{' '}
                {existing.analysisSummary}
              </p>
            )}

            {existing.validationReport?.semanticNotes?.length ? (
              <ul className="mt-2 space-y-0.5 text-[11px] text-slate-600 dark:text-slate-300">
                {existing.validationReport.semanticNotes.map((note, idx) => (
                  <li key={idx}>• {note}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
