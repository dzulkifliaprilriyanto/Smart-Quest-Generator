import { useMemo, useState } from 'react';
import { Download, Printer, X } from 'lucide-react';
import type {
  DocumentExportConfig,
  KopTemplate,
  QuestionItem,
  QuestionSet,
  TeacherScoreBoxConfig,
} from '../types/question';
import { exportAsDocx, exportAsPdf } from '../utils/exporter';
import {
  APP_OFFICIAL_BRANDING,
  APP_OFFICIAL_NAME,
  resolveEffectiveKop,
  shouldRenderKopForDoc,
} from '../utils/kopTemplates';
import {
  buildExamLayoutBlocks,
  formatOptionalNip,
  getMarginMm,
} from '../utils/layoutEngine';
import { formatScore } from '../utils/scoring';
import { KopPaperPreview } from './KopDokumenEditor';

interface DocumentPreviewModalProps {
  open: boolean;
  onClose: () => void;
  questionSet: QuestionSet;
  includeAnswerKey: boolean;
  kopTemplates?: KopTemplate[];
  activeKopId?: string;
  activeKopTemplate?: KopTemplate;
  onSelectKop?: (kopId: string) => void;
  onToggleAnswerKey: (next: boolean) => void;
  onUpdateExportConfig: (patch: Partial<DocumentExportConfig>) => void;
  onNotify: (msg: string) => void;
}

function getPaperMaxWidthPx(
  paperSize: DocumentExportConfig['paperSize'],
  orientation: DocumentExportConfig['orientation']
): number {
  if (orientation === 'landscape') {
    return paperSize === 'F4/Folio' ? 1040 : 960;
  }
  return paperSize === 'Letter' ? 760 : 730;
}

function getImageWidthClass(
  displaySize: 'small' | 'medium' | 'large',
  isTwoColCell: boolean
): string {
  if (isTwoColCell) {
    if (displaySize === 'small') return 'max-h-28 w-auto';
    return 'max-h-40 w-auto';
  }
  if (displaySize === 'small') return 'max-h-32 w-auto';
  if (displaySize === 'large') return 'max-h-64 w-auto';
  return 'max-h-44 w-auto';
}

function ScoreBoxWidget({ scoreBox }: { scoreBox: TeacherScoreBoxConfig }) {
  if (!scoreBox.enabled) return null;
  const sizeClass =
    scoreBox.size === 'compact'
      ? 'min-w-[84px] px-2.5 py-1.5'
      : scoreBox.size === 'large'
        ? 'min-w-[146px] px-4 py-2.5'
        : 'min-w-[110px] px-3 py-2';
  const heightClass =
    scoreBox.size === 'compact'
      ? 'h-8'
      : scoreBox.size === 'large'
        ? 'h-14'
        : 'h-10';

  return (
    <div
      data-testid="teacher-score-box"
      className={`shrink-0 rounded border-[1.5px] border-green-800 bg-white text-center text-slate-900 ${sizeClass}`}
    >
      <div className="border-b border-green-800 pb-0.5 text-[10px] font-bold tracking-wider text-green-900 uppercase">
        {scoreBox.label || 'NILAI'}
      </div>
      <div className={heightClass} />
      {(scoreBox.showInitials || scoreBox.showTeacherNote) && (
        <div className="space-y-1 border-t border-slate-300 pt-1 text-left text-[9px] text-slate-700">
          {scoreBox.showInitials && <div>Paraf Guru: ________</div>}
          {scoreBox.showTeacherNote && <div>Catatan: ___________</div>}
        </div>
      )}
    </div>
  );
}

function PaperQuestionItem({
  q,
  cfg,
  isTwoColCell,
}: {
  q: QuestionItem;
  cfg: DocumentExportConfig;
  isTwoColCell: boolean;
}) {
  const img = cfg.includeImages ? q.supportingImage : undefined;

  const renderImg = () => {
    if (!img) return null;
    return (
      <figure className="my-2 flex flex-col items-center">
        <img
          src={img.dataUrl}
          alt={img.caption || `Gambar Soal ${q.number}`}
          className={`rounded border border-slate-200 object-contain ${getImageWidthClass(
            img.displaySize,
            isTwoColCell
          )}`}
        />
        {img.caption && (
          <figcaption className="mt-1 text-center text-[10px] italic text-slate-600">
            {img.caption}
          </figcaption>
        )}
      </figure>
    );
  };

  return (
    <div className="break-inside-avoid">
      {q.stimulus && (
        <div className="mb-1.5 rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] italic text-slate-700">
          {q.stimulus}
        </div>
      )}

      {img && img.placement === 'before' && renderImg()}

      <p className="text-slate-900">
        <span className="font-semibold">{q.number}.</span> {q.questionText}
      </p>

      {img && img.placement === 'after' && renderImg()}

      {q.matchingPairs && q.matchingPairs.length > 0 && (
        <table className="mt-1.5 w-full border-collapse border border-slate-300 text-[11px]">
          <thead>
            <tr className="bg-slate-100">
              <th className="border border-slate-300 px-2 py-1 text-left">Premis</th>
              <th className="border border-slate-300 px-2 py-1 text-left">Pasangan</th>
            </tr>
          </thead>
          <tbody>
            {q.matchingPairs.map((pair, pIdx) => (
              <tr key={pIdx}>
                <td className="border border-slate-300 px-2 py-1">
                  {pIdx + 1}. {pair.prompt}
                </td>
                <td className="border border-slate-300 px-2 py-1">
                  {String.fromCharCode(65 + pIdx)}. {pair.match}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {q.options.length > 0 && (
        <ul className="mt-1 space-y-0.5 pl-4">
          {q.options.map((opt) => (
            <li key={opt.label} className="flex gap-1.5">
              <span className="font-semibold">{opt.label}.</span>
              <span>{opt.text}</span>
            </li>
          ))}
        </ul>
      )}

      {q.type === 'Esai' && (
        <div className="mt-2 space-y-2.5 pt-1">
          <div className="border-b border-dotted border-slate-400" />
          <div className="border-b border-dotted border-slate-400" />
        </div>
      )}
    </div>
  );
}

export function DocumentPreviewModal({
  open,
  onClose,
  questionSet,
  includeAnswerKey,
  kopTemplates,
  activeKopId,
  activeKopTemplate,
  onSelectKop,
  onToggleAnswerKey,
  onUpdateExportConfig,
  onNotify,
}: DocumentPreviewModalProps) {
  const [isExportingDocx, setIsExportingDocx] = useState(false);

  const cfg = questionSet.params.exportConfig;
  const docId = questionSet.params.docIdentity;
  const nipFormatted = formatOptionalNip(docId?.teacherNip);
  const effectiveKop = useMemo(
    () => resolveEffectiveKop(activeKopTemplate, docId),
    [activeKopTemplate, docId]
  );

  const layoutBlocks = useMemo(
    () => buildExamLayoutBlocks(questionSet.questions, cfg),
    [questionSet.questions, cfg]
  );

  if (!open) return null;

  const paperWidthPx = getPaperMaxWidthPx(cfg.paperSize, cfg.orientation);
  const marginMm = getMarginMm(cfg.marginPreset);
  const fontFamilyCss =
    cfg.fontFamily === 'Times New Roman'
      ? '"Times New Roman", Times, serif'
      : cfg.fontFamily === 'Calibri'
        ? 'Calibri, "DM Sans", sans-serif'
        : 'Arial, sans-serif';
  const lineHeightValue =
    cfg.lineSpacing === 'compact' ? 1.32 : cfg.lineSpacing === 'relaxed' ? 1.65 : 1.48;

  const updateScoreBox = (patch: Partial<TeacherScoreBoxConfig>) => {
    onUpdateExportConfig({
      scoreBox: {
        ...cfg.scoreBox,
        ...patch,
      },
    });
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDocx = async () => {
    setIsExportingDocx(true);
    try {
      await exportAsDocx(questionSet, {
        includeAnswerKey,
        kopTemplate: activeKopTemplate,
      });
      onNotify('Dokumen DOCX sesuai tata letak & kop dokumen berhasil diunduh.');
    } finally {
      setIsExportingDocx(false);
    }
  };

  const handlePdf = () => {
    exportAsPdf(questionSet, {
      includeAnswerKey,
      kopTemplate: activeKopTemplate,
    });
    onNotify('Dokumen PDF sesuai tata letak & kop dokumen berhasil diunduh.');
  };

  const totalSheets = includeAnswerKey ? 2 : 1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Pratinjau Cetak dan Tata Letak Dokumen"
      className="fixed inset-0 z-50 flex flex-col bg-slate-950/75"
    >
      {/* Top Modal Header */}
      <div className="no-print flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-3 dark:border-slate-700 dark:bg-[#1E293B]">
        <div>
          <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
            Pratinjau Cetak & Pengaturan Tata Letak Dokumen
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-300">
            Perubahan tata letak langsung tersinkronisasi ke Pratinjau, Print, DOCX, dan PDF.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:bg-[#0F172A] dark:text-slate-100"
          >
            <Printer className="h-3.5 w-3.5" aria-hidden="true" />
            Cetak (Print)
          </button>

          <button
            type="button"
            disabled={isExportingDocx}
            onClick={handleDocx}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-800 hover:bg-green-100 disabled:opacity-60 dark:border-green-800 dark:bg-green-950/60 dark:text-green-300"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            {isExportingDocx ? 'Menyusun...' : 'Unduh DOCX'}
          </button>

          <button
            type="button"
            onClick={handlePdf}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-green-700 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-green-800 dark:bg-green-600 dark:hover:bg-green-500"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Unduh PDF
          </button>

          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup pratinjau cetak"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Main Split Workspace */}
      <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
        {/* Controls Sidebar */}
        <aside className="no-print w-full shrink-0 overflow-y-auto border-b border-slate-200 bg-white p-4 text-xs lg:w-80 lg:border-r lg:border-b-0 dark:border-slate-700 dark:bg-[#1E293B] dark:text-slate-200">
          <div className="space-y-4">
            {kopTemplates && kopTemplates.length > 0 && onSelectKop && (
              <div className="border-b border-slate-200 pb-3 dark:border-slate-700">
                <h3 className="mb-1.5 font-semibold text-green-800 dark:text-green-400">
                  Template Kop Dokumen
                </h3>
                <select
                  aria-label="Pilih template kop dokumen"
                  value={activeKopId || activeKopTemplate?.id || ''}
                  onChange={(e) => onSelectKop(e.target.value)}
                  className="min-h-8 w-full rounded border border-slate-200 bg-white px-2 text-xs dark:border-slate-700 dark:bg-[#0F172A]"
                >
                  {kopTemplates.map((tpl) => (
                    <option key={tpl.id} value={tpl.id}>
                      {tpl.name.includes('Layout') ? tpl.name : `${tpl.name} (Layout ${tpl.layout})`}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <h3 className="mb-2 font-semibold text-green-800 dark:text-green-400">
                Pengaturan Kertas & Tata Letak
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-[11px] text-slate-600 dark:text-slate-400">
                    Ukuran Kertas
                  </label>
                  <select
                    aria-label="Ukuran kertas dokumen"
                    value={cfg.paperSize}
                    onChange={(e) =>
                      onUpdateExportConfig({
                        paperSize: e.target.value as DocumentExportConfig['paperSize'],
                      })
                    }
                    className="min-h-8 w-full rounded border border-slate-200 bg-white px-2 dark:border-slate-700 dark:bg-[#0F172A]"
                  >
                    <option value="A4">A4</option>
                    <option value="F4/Folio">F4 / Folio</option>
                    <option value="Letter">Letter</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] text-slate-600 dark:text-slate-400">
                    Orientasi
                  </label>
                  <select
                    aria-label="Orientasi halaman"
                    value={cfg.orientation}
                    onChange={(e) =>
                      onUpdateExportConfig({
                        orientation: e.target.value as DocumentExportConfig['orientation'],
                      })
                    }
                    className="min-h-8 w-full rounded border border-slate-200 bg-white px-2 dark:border-slate-700 dark:bg-[#0F172A]"
                  >
                    <option value="portrait">Portrait</option>
                    <option value="landscape">Landscape</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] text-slate-600 dark:text-slate-400">
                    Margin
                  </label>
                  <select
                    aria-label="Preset margin"
                    value={cfg.marginPreset}
                    onChange={(e) =>
                      onUpdateExportConfig({
                        marginPreset: e.target.value as DocumentExportConfig['marginPreset'],
                      })
                    }
                    className="min-h-8 w-full rounded border border-slate-200 bg-white px-2 dark:border-slate-700 dark:bg-[#0F172A]"
                  >
                    <option value="Normal">Normal</option>
                    <option value="Sempit">Sempit</option>
                    <option value="Lebar">Lebar</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] text-slate-600 dark:text-slate-400">
                    Spasi Baris
                  </label>
                  <select
                    aria-label="Spasi baris"
                    value={cfg.lineSpacing}
                    onChange={(e) =>
                      onUpdateExportConfig({
                        lineSpacing: e.target.value as DocumentExportConfig['lineSpacing'],
                      })
                    }
                    className="min-h-8 w-full rounded border border-slate-200 bg-white px-2 dark:border-slate-700 dark:bg-[#0F172A]"
                  >
                    <option value="compact">Padat</option>
                    <option value="normal">Normal</option>
                    <option value="relaxed">Lega</option>
                  </select>
                </div>
              </div>

              <div className="mt-2.5">
                <label className="mb-1 block text-[11px] text-slate-600 dark:text-slate-400">
                  Mode Kolom Soal (Smart Exam Layout)
                </label>
                <div className="grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1 dark:bg-[#0F172A]">
                  {(
                    [
                      ['two-column', 'Dua Kolom'],
                      ['single', 'Satu Kolom'],
                      ['auto', 'Otomatis'],
                    ] as const
                  ).map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() =>
                        onUpdateExportConfig({
                          layoutMode: val,
                          columns: val === 'single' ? 1 : 2,
                        })
                      }
                      aria-pressed={cfg.layoutMode === val}
                      className={`min-h-8 rounded px-1.5 text-[11px] font-medium transition-colors ${
                        cfg.layoutMode === val
                          ? 'bg-green-700 text-white'
                          : 'text-slate-700 hover:bg-white dark:text-slate-300 dark:hover:bg-slate-800'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-2.5 grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-[11px] text-slate-600 dark:text-slate-400">
                    Jenis Font
                  </label>
                  <select
                    value={cfg.fontFamily}
                    onChange={(e) =>
                      onUpdateExportConfig({
                        fontFamily: e.target.value as DocumentExportConfig['fontFamily'],
                      })
                    }
                    className="min-h-8 w-full rounded border border-slate-200 bg-white px-2 dark:border-slate-700 dark:bg-[#0F172A]"
                  >
                    <option value="Times New Roman">Times New Roman</option>
                    <option value="Calibri">Calibri</option>
                    <option value="Arial">Arial</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] text-slate-600 dark:text-slate-400">
                    Ukuran Font
                  </label>
                  <select
                    value={cfg.fontSize}
                    onChange={(e) =>
                      onUpdateExportConfig({
                        fontSize: Number(e.target.value) === 11 ? 11 : 12,
                      })
                    }
                    className="min-h-8 w-full rounded border border-slate-200 bg-white px-2 dark:border-slate-700 dark:bg-[#0F172A]"
                  >
                    <option value={11}>11 pt</option>
                    <option value={12}>12 pt</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="border-t border-slate-200 pt-3 dark:border-slate-700">
              <h3 className="mb-2 font-semibold text-green-800 dark:text-green-400">
                Elemen Naskah Soal
              </h3>
              <div className="space-y-1.5">
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={cfg.includeImages}
                    onChange={(e) =>
                      onUpdateExportConfig({ includeImages: e.target.checked })
                    }
                    className="h-3.5 w-3.5 accent-green-700"
                  />
                  <span>Tampilkan Gambar Pendukung Soal</span>
                </label>
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={cfg.includeHeaderFooter}
                    onChange={(e) =>
                      onUpdateExportConfig({ includeHeaderFooter: e.target.checked })
                    }
                    className="h-3.5 w-3.5 accent-green-700"
                  />
                  <span>Tampilkan Header & Nomor Halaman</span>
                </label>
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={cfg.includeStudentIdentity}
                    onChange={(e) =>
                      onUpdateExportConfig({ includeStudentIdentity: e.target.checked })
                    }
                    className="h-3.5 w-3.5 accent-green-700"
                  />
                  <span>Kotak Identitas Peserta Didik</span>
                </label>
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={cfg.includeSignatureBlock}
                    onChange={(e) =>
                      onUpdateExportConfig({ includeSignatureBlock: e.target.checked })
                    }
                    className="h-3.5 w-3.5 accent-green-700"
                  />
                  <span>Blok Tanda Tangan Guru</span>
                </label>
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={includeAnswerKey}
                    onChange={(e) => onToggleAnswerKey(e.target.checked)}
                    className="h-3.5 w-3.5 accent-green-700"
                  />
                  <span>Halaman Kunci Jawaban & Pembahasan</span>
                </label>
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={cfg.includeAppBranding !== false}
                    onChange={(e) =>
                      onUpdateExportConfig({ includeAppBranding: e.target.checked })
                    }
                    className="h-3.5 w-3.5 accent-green-700"
                  />
                  <span>Footer Branding {APP_OFFICIAL_NAME}</span>
                </label>
              </div>
            </div>

            {/* Kotak Nilai Guru Config */}
            <div className="border-t border-slate-200 pt-3 dark:border-slate-700">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-semibold text-green-800 dark:text-green-400">
                  Kotak Nilai Guru (Halaman 1)
                </h3>
                <input
                  type="checkbox"
                  aria-label="Aktifkan kotak nilai guru"
                  checked={cfg.scoreBox.enabled}
                  onChange={(e) => updateScoreBox({ enabled: e.target.checked })}
                  className="h-4 w-4 accent-green-700"
                />
              </div>

              {cfg.scoreBox.enabled && (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="mb-1 block text-[11px] text-slate-600 dark:text-slate-400">
                        Posisi Kotak
                      </label>
                      <select
                        aria-label="Posisi kotak nilai"
                        value={cfg.scoreBox.position}
                        onChange={(e) =>
                          updateScoreBox({
                            position: e.target.value as TeacherScoreBoxConfig['position'],
                          })
                        }
                        className="min-h-8 w-full rounded border border-slate-200 bg-white px-2 dark:border-slate-700 dark:bg-[#0F172A]"
                      >
                        <option value="top-right">Kanan Atas</option>
                        <option value="top-left">Kiri Atas</option>
                        <option value="after-header">Setelah Kop Soal</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] text-slate-600 dark:text-slate-400">
                        Ukuran Kotak
                      </label>
                      <select
                        aria-label="Ukuran kotak nilai"
                        value={cfg.scoreBox.size}
                        onChange={(e) =>
                          updateScoreBox({
                            size: e.target.value as TeacherScoreBoxConfig['size'],
                          })
                        }
                        className="min-h-8 w-full rounded border border-slate-200 bg-white px-2 dark:border-slate-700 dark:bg-[#0F172A]"
                      >
                        <option value="compact">Ringkas</option>
                        <option value="medium">Sedang</option>
                        <option value="large">Besar</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-[11px] text-slate-600 dark:text-slate-400">
                      Label Kotak Nilai
                    </label>
                    <input
                      type="text"
                      value={cfg.scoreBox.label}
                      onChange={(e) => updateScoreBox({ label: e.target.value })}
                      className="min-h-8 w-full rounded border border-slate-200 bg-white px-2.5 dark:border-slate-700 dark:bg-[#0F172A]"
                    />
                  </div>

                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={cfg.scoreBox.showInitials}
                      onChange={(e) =>
                        updateScoreBox({ showInitials: e.target.checked })
                      }
                      className="h-3.5 w-3.5 accent-green-700"
                    />
                    <span>Sertakan Paraf Guru</span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={cfg.scoreBox.showTeacherNote}
                      onChange={(e) =>
                        updateScoreBox({ showTeacherNote: e.target.checked })
                      }
                      className="h-3.5 w-3.5 accent-green-700"
                    />
                    <span>Sertakan Catatan Guru</span>
                  </label>
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* Paginated Paper Preview Canvas */}
        <div className="flex-1 overflow-y-auto bg-slate-200/80 p-4 sm:p-8 dark:bg-[#0F172A]">
          <div className="mx-auto space-y-6" style={{ maxWidth: `${paperWidthPx}px` }}>
            {/* Sheet 1: Naskah Soal */}
            <article
              data-testid="print-sheet-page-1"
              className="print-sheet mx-auto rounded-sm bg-white text-slate-900 shadow-lg"
              style={{
                padding: `${marginMm}mm`,
                fontFamily: fontFamilyCss,
                fontSize: `${cfg.fontSize}px`,
                lineHeight: lineHeightValue,
              }}
            >
              {/* Page 1 Header (Kop Dokumen Resmi) + Teacher Score Box */}
              <header className="pb-2">
                {shouldRenderKopForDoc(activeKopTemplate, 'examPaper', 1) && (
                  <KopPaperPreview kop={effectiveKop} compact />
                )}

                <div className="mt-2 flex items-start justify-between gap-4 border-b border-slate-300 pb-2">
                  {cfg.scoreBox.enabled && cfg.scoreBox.position === 'top-left' && (
                    <ScoreBoxWidget scoreBox={cfg.scoreBox} />
                  )}

                  <div className="flex-1 text-center">
                    <h1 className="text-base font-bold text-slate-900 uppercase">
                      {effectiveKop.layout === 'E' && effectiveKop.defaultDocTitle.trim()
                        ? effectiveKop.defaultDocTitle.trim()
                        : questionSet.title}
                    </h1>
                  </div>

                  {cfg.scoreBox.enabled && cfg.scoreBox.position === 'top-right' && (
                    <ScoreBoxWidget scoreBox={cfg.scoreBox} />
                  )}
                </div>

                {cfg.scoreBox.enabled && cfg.scoreBox.position === 'after-header' && (
                  <div className="mt-2 flex justify-end">
                    <ScoreBoxWidget scoreBox={cfg.scoreBox} />
                  </div>
                )}
              </header>

              {/* Formal Document Identity Grid */}
              <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 border-b border-slate-300 pb-2.5 text-[11px]">
                <div>
                  <span className="font-semibold">Mata Pelajaran:</span>{' '}
                  {questionSet.params.subject}
                </div>
                <div>
                  <span className="font-semibold">Alokasi Waktu:</span>{' '}
                  {docId?.timeAllocation || '90 Menit'}
                </div>
                <div>
                  <span className="font-semibold">Jenjang / Kelas:</span>{' '}
                  {questionSet.params.educationLevel} · {questionSet.params.grade}
                </div>
                <div>
                  <span className="font-semibold">Semester / Tahun:</span>{' '}
                  {docId?.semester || 'Ganjil'} {docId?.academicYear || '2026/2027'}
                </div>
                <div>
                  <span className="font-semibold">Kurikulum:</span>{' '}
                  {questionSet.params.curriculum}
                </div>
                {docId?.teacherName?.trim() && (
                  <div>
                    <span className="font-semibold">Guru Pengampu:</span>{' '}
                    {docId.teacherName.trim()}
                    {nipFormatted ? ` (${nipFormatted})` : ''}
                  </div>
                )}
              </div>

              {/* Student Identity Box */}
              {cfg.includeStudentIdentity && (
                <div className="mt-2.5 grid grid-cols-2 gap-x-6 gap-y-1 rounded border border-slate-400 px-3 py-2 text-[11px]">
                  <div>Nama Peserta Didik : ........................................</div>
                  <div>Nomor Absen / NIS : ..............................</div>
                  <div>Kelas / Fase : ...............................................</div>
                  <div>Hari / Tanggal : ...................................</div>
                </div>
              )}

              {/* Exam Questions via Smart Two-Column Engine */}
              <div className="mt-4 space-y-3.5">
                {layoutBlocks.map((block, bIdx) =>
                  block.kind === 'two-column-row' ? (
                    <div
                      key={`row-${bIdx}`}
                      data-testid="layout-two-column-row"
                      className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2"
                    >
                      <div className="min-w-0">
                        <PaperQuestionItem q={block.left} cfg={cfg} isTwoColCell />
                      </div>
                      {block.right && (
                        <div className="min-w-0">
                          <PaperQuestionItem q={block.right} cfg={cfg} isTwoColCell />
                        </div>
                      )}
                    </div>
                  ) : (
                    <div key={`full-${bIdx}`} data-testid="layout-full-width-row">
                      <PaperQuestionItem
                        q={block.question}
                        cfg={cfg}
                        isTwoColCell={false}
                      />
                    </div>
                  )
                )}
              </div>

              {/* Signature Block */}
              {cfg.includeSignatureBlock && docId?.teacherName?.trim() && (
                <div className="mt-8 flex justify-end text-[11px]">
                  <div className="min-w-[200px] text-center">
                    <p>Guru Mata Pelajaran / Penyusun,</p>
                    {docId.teacherSignatureDataUrl ? (
                      <img
                        src={docId.teacherSignatureDataUrl}
                        alt="Tanda tangan guru"
                        className="mx-auto my-1.5 h-12 w-auto object-contain"
                      />
                    ) : (
                      <div className="h-12" />
                    )}
                    <p className="font-bold underline">{docId.teacherName.trim()}</p>
                    {nipFormatted && <p>{nipFormatted}</p>}
                    {docId.teacherRank?.trim() && <p>{docId.teacherRank.trim()}</p>}
                    {docId.teacherRole?.trim() && <p>{docId.teacherRole.trim()}</p>}
                    {docId.teacherUnit?.trim() && <p>{docId.teacherUnit.trim()}</p>}
                  </div>
                </div>
              )}

              {/* Page 1 Footer */}
              {cfg.includeHeaderFooter && (
                <footer className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-2 text-[10px] text-slate-500">
                  <span>
                    {[
                      docId?.schoolName?.trim(),
                      questionSet.params.subject,
                      cfg.includeAppBranding !== false
                        ? `${APP_OFFICIAL_NAME} (${APP_OFFICIAL_BRANDING})`
                        : '',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                  <span>Halaman 1 / {totalSheets}</span>
                </footer>
              )}
            </article>

            {/* Sheet 2: Kunci Jawaban & Pembahasan (No Score Box) */}
            {includeAnswerKey && (
              <article
                data-testid="print-sheet-page-2"
                className="print-sheet mx-auto rounded-sm bg-white text-slate-900 shadow-lg"
                style={{
                  padding: `${marginMm}mm`,
                  fontFamily: fontFamilyCss,
                  fontSize: `${cfg.fontSize}px`,
                  lineHeight: lineHeightValue,
                  pageBreakBefore: 'always',
                }}
              >
                {shouldRenderKopForDoc(activeKopTemplate, 'answerKey', 2) && (
                  <div className="mb-2">
                    <KopPaperPreview kop={effectiveKop} compact />
                  </div>
                )}
                <header className="border-b-2 border-slate-900 pb-2 text-center">
                  {docId?.schoolName?.trim() && (
                    <p className="text-xs font-bold uppercase">{docId.schoolName.trim()}</p>
                  )}
                  <h2 className="text-sm font-bold uppercase">
                    KUNCI JAWABAN & PEDOMAN PEMBAHASAN
                  </h2>
                  <p className="text-[11px] text-slate-600">{questionSet.title}</p>
                </header>

                <ol className="mt-4 space-y-2.5 text-[11px]">
                  {questionSet.questions.map((q) => (
                    <li key={q.id} className="border-b border-slate-100 pb-2">
                      <p className="font-semibold text-green-800">
                        No. {q.number} — Kunci: {q.correctAnswer} (Bobot{' '}
                        {formatScore(q.scoreWeight)})
                      </p>
                      {q.explanation && (
                        <p className="mt-0.5 text-slate-700">{q.explanation}</p>
                      )}
                    </li>
                  ))}
                </ol>

                {cfg.includeHeaderFooter && (
                  <footer className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-2 text-[10px] text-slate-500">
                    <span>
                      {[
                        `Kunci Jawaban · ${questionSet.params.subject}`,
                        cfg.includeAppBranding !== false ? APP_OFFICIAL_NAME : '',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                    <span>Halaman 2 / {totalSheets}</span>
                  </footer>
                )}
              </article>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
