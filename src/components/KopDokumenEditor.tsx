import { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  Edit3,
  Eye,
  Layers,
  Maximize2,
  Plus,
  Redo2,
  RefreshCw,
  RotateCcw,
  Save,
  Star,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import type {
  DocumentIdentity,
  KopLayoutId,
  KopLineStyle,
  KopPageRule,
  KopTemplate,
  LogoFitMode,
  StoredLogoAsset,
} from '../types/question';
import { validateKopTemplate } from '../utils/kopTemplates';
import { LogoUploaderControl } from './LogoUploaderControl';

interface KopDokumenEditorProps {
  templates: KopTemplate[];
  activeKopId: string;
  activeKopTemplate: KopTemplate | undefined;
  schoolIdentity: DocumentIdentity;
  logos: StoredLogoAsset[];
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
  onSelectTemplate: (kopId: string) => void;
  onSaveTemplate: (kop: KopTemplate) => void;
  onSaveAsNew: (source: KopTemplate, newName: string) => KopTemplate;
  onDuplicateTemplate: (kopId: string) => KopTemplate | null;
  onRenameTemplate: (kopId: string, newName: string) => void;
  onDeleteTemplate: (kopId: string) => boolean;
  onSetDefault: (kopId: string) => void;
  onResetStarter: (kopId?: string) => void;
  onSyncFromSchoolProfile: () => void;
  onNotify: (msg: string) => void;
}

type EditorTab = 'layout' | 'logos' | 'typography' | 'scope';

const LAYOUT_OPTIONS: Array<{ id: KopLayoutId; label: string; desc: string }> = [
  { id: 'A', label: 'Layout A', desc: 'Logo Kiri + Teks Tengah (Resmi Standar)' },
  { id: 'B', label: 'Layout B', desc: 'Logo Kiri & Kanan + Teks Tengah' },
  { id: 'C', label: 'Layout C', desc: 'Logo Tengah Atas + Teks Simetris' },
  { id: 'D', label: 'Layout D', desc: 'Minimalis Modern Tanpa Logo' },
  { id: 'E', label: 'Layout E', desc: 'Kop Ujian & Semester Kustom' },
];

const DIVIDER_STYLES: Array<{ value: KopLineStyle; label: string }> = [
  { value: 'double', label: 'Garis Ganda (Resmi)' },
  { value: 'thick-thin', label: 'Garis Tebal-Tipis' },
  { value: 'single', label: 'Garis Tunggal Standar' },
  { value: 'thick', label: 'Garis Tunggal Tebal' },
  { value: 'thin', label: 'Garis Tunggal Tipis' },
  { value: 'custom', label: 'Garis Putus-putus / Aksen' },
  { value: 'none', label: 'Tanpa Garis' },
];

function renderDividerPreview(draft: KopTemplate) {
  if (draft.dividerStyle === 'none') return null;
  const widthPct = Math.max(20, Math.min(100, draft.dividerLengthPct || 100));
  const color = draft.dividerColorHex || '#0F172A';
  const topMm = Math.max(0, draft.dividerMarginTopMm ?? 2);
  const botMm = Math.max(0, draft.dividerMarginBottomMm ?? 3);

  const wrapperStyle = {
    width: `${widthPct}%`,
    marginTop: `${topMm}mm`,
    marginBottom: `${botMm}mm`,
    marginLeft: 'auto',
    marginRight: 'auto',
  };

  if (draft.dividerStyle === 'double') {
    return (
      <div style={wrapperStyle}>
        <div style={{ borderTop: `2px solid ${color}`, marginBottom: '2px' }} />
        <div style={{ borderTop: `1px solid ${color}` }} />
      </div>
    );
  }
  if (draft.dividerStyle === 'thick-thin') {
    return (
      <div style={wrapperStyle}>
        <div style={{ borderTop: `3px solid ${color}`, marginBottom: '2px' }} />
        <div style={{ borderTop: `1px solid ${color}` }} />
      </div>
    );
  }
  if (draft.dividerStyle === 'custom') {
    return (
      <div style={wrapperStyle}>
        <div
          style={{
            borderTop: `${Math.max(1, draft.dividerThicknessPt || 1.5)}pt dashed ${color}`,
          }}
        />
      </div>
    );
  }

  const thickPt =
    draft.dividerStyle === 'thick'
      ? Math.max(2.5, draft.dividerThicknessPt || 2.5)
      : draft.dividerStyle === 'thin'
        ? 0.75
        : Math.max(1, draft.dividerThicknessPt || 1.5);

  return (
    <div style={wrapperStyle}>
      <div style={{ borderTop: `${thickPt}pt solid ${color}` }} />
    </div>
  );
}

export function KopPaperPreview({
  kop,
  compact = false,
}: {
  kop: KopTemplate;
  compact?: boolean;
}) {
  const fontFamilyCss =
    kop.fontFamily === 'Times New Roman'
      ? '"Times New Roman", Times, serif'
      : kop.fontFamily === 'Georgia'
        ? 'Georgia, serif'
        : kop.fontFamily === 'Calibri'
          ? 'Calibri, "DM Sans", sans-serif'
          : 'Arial, sans-serif';

  const alignClass =
    kop.textAlign === 'left'
      ? 'text-left'
      : kop.textAlign === 'right'
        ? 'text-right'
        : 'text-center';

  const vAlignClass =
    kop.logoVerticalAlign === 'top'
      ? 'items-start'
      : kop.logoVerticalAlign === 'bottom'
        ? 'items-end'
        : 'items-center';

  const showLeftLogo =
    kop.layout !== 'D' &&
    kop.layout !== 'C' &&
    Boolean(kop.leftLogoDataUrl) &&
    (kop.layout === 'A' ||
      kop.layout === 'B' ||
      kop.customLogoPosition === 'left' ||
      kop.customLogoPosition === 'both');

  const showRightLogo =
    kop.layout !== 'D' &&
    kop.layout !== 'C' &&
    Boolean(kop.rightLogoDataUrl) &&
    (kop.layout === 'B' ||
      kop.customLogoPosition === 'right' ||
      kop.customLogoPosition === 'both');

  const showTopLogo =
    kop.layout !== 'D' &&
    Boolean(kop.leftLogoDataUrl) &&
    (kop.layout === 'C' || (kop.layout === 'E' && kop.customLogoPosition === 'top'));

  const contactParts = [
    kop.schoolAddress.trim(),
    kop.phone.trim() ? `Telp. ${kop.phone.trim()}` : '',
    kop.email.trim() ? `Email: ${kop.email.trim()}` : '',
    kop.website.trim(),
    kop.npsn.trim() ? `NPSN: ${kop.npsn.trim()}` : '',
  ].filter(Boolean);

  const logoFitClass = kop.logoFitMode === 'cover' ? 'object-cover' : 'object-contain';
  const topLogoJustifyClass =
    kop.logoHorizontalAlign === 'left'
      ? 'justify-start'
      : kop.logoHorizontalAlign === 'right'
        ? 'justify-end'
        : 'justify-center';

  const logoSizeStyle = {
    width: `${Math.max(8, kop.logoWidthMm)}mm`,
    height: `${Math.max(8, kop.logoHeightMm)}mm`,
  };

  return (
    <div
      data-testid="kop-paper-preview"
      className={
        compact
          ? 'w-full bg-white text-slate-900'
          : 'w-full rounded border border-slate-300 bg-white text-slate-900 shadow-sm'
      }
      style={{
        paddingTop: compact ? '0mm' : '10mm',
        paddingBottom: compact ? '1mm' : '8mm',
        paddingLeft: compact ? '0mm' : `${Math.max(6, kop.marginLeftMm)}mm`,
        paddingRight: compact ? '0mm' : `${Math.max(6, kop.marginRightMm)}mm`,
        fontFamily: fontFamilyCss,
        color: kop.textColorHex || '#0F172A',
      }}
    >
      <div style={compact ? undefined : { minHeight: `${Math.max(12, kop.headerHeightMm)}mm` }}>
        {showTopLogo && kop.leftLogoDataUrl && (
          <div className={`mb-1.5 flex ${topLogoJustifyClass}`}>
            <img
              src={kop.leftLogoDataUrl}
              alt="Logo Institusi Tengah"
              style={logoSizeStyle}
              className={logoFitClass}
            />
          </div>
        )}

        <div
          className={`flex ${vAlignClass}`}
          style={{ gap: `${Math.max(1, kop.logoGapMm)}mm` }}
        >
          {showLeftLogo && kop.leftLogoDataUrl && (
            <img
              src={kop.leftLogoDataUrl}
              alt="Logo Kiri"
              style={logoSizeStyle}
              className={`shrink-0 ${logoFitClass}`}
            />
          )}

          <div
            className={`min-w-0 flex-1 ${alignClass}`}
            style={{ lineHeight: kop.lineHeight || 1.25 }}
          >
            {kop.institutionName.trim() && (
              <p
                className="font-semibold uppercase"
                style={{ fontSize: `${kop.institutionFontSizePt}pt` }}
              >
                {kop.institutionName.trim()}
              </p>
            )}
            {kop.schoolName.trim() ? (
              <p
                className="font-bold uppercase"
                style={{
                  fontSize: `${kop.schoolFontSizePt}pt`,
                  color: kop.accentColorHex || kop.textColorHex || '#0F172A',
                }}
              >
                {kop.schoolName.trim()}
              </p>
            ) : (
              !compact && (
                <p
                  className="font-semibold italic text-slate-400"
                  style={{ fontSize: `${Math.max(10, kop.schoolFontSizePt - 1)}pt` }}
                >
                  [Nama Sekolah Belum Diisi]
                </p>
              )
            )}
            {kop.subIdentity.trim() && (
              <p
                className="font-medium"
                style={{ fontSize: `${Math.max(8, kop.contactFontSizePt + 0.5)}pt` }}
              >
                {kop.subIdentity.trim()}
              </p>
            )}
            {contactParts.length > 0 && (
              <p style={{ fontSize: `${kop.contactFontSizePt}pt`, color: '#475569' }}>
                {contactParts.join(' · ')}
              </p>
            )}
            {kop.layout === 'E' && (
              <div className="mt-1 space-y-0.5">
                {kop.defaultDocTitle.trim() && (
                  <p
                    className="font-bold tracking-wide uppercase"
                    style={{ fontSize: `${Math.max(10, kop.institutionFontSizePt)}pt` }}
                  >
                    {kop.defaultDocTitle.trim()}
                  </p>
                )}
                {(kop.academicYear.trim() || kop.semester) && (
                  <p style={{ fontSize: `${kop.contactFontSizePt}pt` }}>
                    Semester {kop.semester} · Tahun Ajaran {kop.academicYear.trim()}
                  </p>
                )}
              </div>
            )}
          </div>

          {showRightLogo && kop.rightLogoDataUrl && (
            <img
              src={kop.rightLogoDataUrl}
              alt="Logo Kanan"
              style={logoSizeStyle}
              className={`shrink-0 ${logoFitClass}`}
            />
          )}
        </div>
      </div>

      {renderDividerPreview(kop)}
    </div>
  );
}

export function KopDokumenEditor({
  templates,
  activeKopId,
  activeKopTemplate,
  schoolIdentity,
  logos,
  onApplyLogoToTargets,
  onDeleteStoredLogo,
  onSelectTemplate,
  onSaveTemplate,
  onSaveAsNew,
  onDuplicateTemplate,
  onRenameTemplate,
  onDeleteTemplate,
  onSetDefault,
  onResetStarter,
  onSyncFromSchoolProfile,
  onNotify,
}: KopDokumenEditorProps) {
  const [draft, setDraft] = useState<KopTemplate | null>(activeKopTemplate ?? templates[0] ?? null);
  const [undoStack, setUndoStack] = useState<KopTemplate[]>([]);
  const [redoStack, setRedoStack] = useState<KopTemplate[]>([]);
  const [editorTab, setEditorTab] = useState<EditorTab>('layout');
  const [fullPreviewOpen, setFullPreviewOpen] = useState(false);

  const [saveAsModalOpen, setSaveAsModalOpen] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  useEffect(() => {
    if (activeKopTemplate) {
      setDraft(activeKopTemplate);
      setUndoStack([]);
      setRedoStack([]);
      setConfirmDeleteOpen(false);
    }
  }, [activeKopId, activeKopTemplate]);

  if (!draft) return null;

  const updateDraft = (updater: (prev: KopTemplate) => KopTemplate) => {
    setDraft((prev) => {
      if (!prev) return prev;
      setUndoStack((u) => [...u.slice(-24), prev]);
      setRedoStack([]);
      return updater(prev);
    });
  };

  const patchDraft = (patch: Partial<KopTemplate>) => {
    updateDraft((prev) => ({ ...prev, ...patch }));
  };

  const handleUndo = () => {
    if (undoStack.length === 0 || !draft) return;
    const previous = undoStack[undoStack.length - 1]!;
    setUndoStack((u) => u.slice(0, -1));
    setRedoStack((r) => [...r, draft]);
    setDraft(previous);
  };

  const handleRedo = () => {
    if (redoStack.length === 0 || !draft) return;
    const next = redoStack[redoStack.length - 1]!;
    setRedoStack((r) => r.slice(0, -1));
    setUndoStack((u) => [...u, draft]);
    setDraft(next);
  };

  const validation = validateKopTemplate(draft);

  const handleSave = () => {
    if (!validation.valid) {
      onNotify(validation.issues[0] || 'Periksa kembali parameter kop.');
      return;
    }
    onSaveTemplate(draft);
  };

  return (
    <section aria-label="Editor Kop Dokumen Sekolah" className="space-y-4">
      {/* Header & Template Bar */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-[#1E293B]">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4 dark:border-slate-700">
          <div>
            <h1 className="font-display flex items-center gap-2 text-xl font-semibold text-slate-900 dark:text-white">
              <Layers className="h-5 w-5 text-green-700 dark:text-green-400" />
              Editor Kop Dokumen & Identitas Sekolah
            </h1>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
              Atur layout kop resmi sekolah secara visual (ukuran dalam mm & pt) — langsung
              terintegrasi ke Pratinjau Cetak, PDF, DOCX, Kisi-Kisi, dan Kartu Peserta Ujian.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleUndo}
              disabled={undoStack.length === 0}
              aria-label="Urungkan perubahan kop"
              data-testid="btn-kop-undo"
              className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-45 dark:border-slate-700 dark:bg-[#0F172A] dark:text-slate-200"
            >
              <Undo2 className="h-3.5 w-3.5" />
              Undo
            </button>
            <button
              type="button"
              onClick={handleRedo}
              disabled={redoStack.length === 0}
              aria-label="Ulangi perubahan kop"
              data-testid="btn-kop-redo"
              className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-45 dark:border-slate-700 dark:bg-[#0F172A] dark:text-slate-200"
            >
              <Redo2 className="h-3.5 w-3.5" />
              Redo
            </button>
            <button
              type="button"
              onClick={() => setFullPreviewOpen(true)}
              data-testid="btn-kop-full-preview"
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-[#0F172A] dark:text-slate-200"
            >
              <Maximize2 className="h-3.5 w-3.5" />
              Pratinjau Penuh
            </button>
            <button
              type="button"
              onClick={() => {
                setNewTemplateName(`${draft.name} (Baru)`);
                setSaveAsModalOpen(true);
              }}
              data-testid="btn-kop-save-as-new"
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-green-300 bg-green-50 px-3 text-xs font-semibold text-green-800 hover:bg-green-100 dark:border-green-800 dark:bg-green-950/60 dark:text-green-300"
            >
              <Plus className="h-3.5 w-3.5" />
              Simpan Sebagai Baru
            </button>
            <button
              type="button"
              onClick={handleSave}
              data-testid="btn-kop-save"
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-green-700 px-3.5 text-xs font-semibold text-white hover:bg-green-800 dark:bg-green-600"
            >
              <Save className="h-3.5 w-3.5" />
              Simpan Template
            </button>
          </div>
        </div>

        {/* Template Management Bar */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="kop-template-select" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Template Aktif:
            </label>
            <select
              id="kop-template-select"
              data-testid="select-kop-template"
              value={activeKopId}
              onChange={(e) => onSelectTemplate(e.target.value)}
              className="min-h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-900 dark:border-slate-700 dark:bg-[#0F172A] dark:text-slate-100"
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} {t.isDefault ? '★ Default' : ''}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => {
                onSyncFromSchoolProfile();
                onNotify('Identitas Profil Sekolah disalin ke template kop aktif.');
              }}
              data-testid="btn-kop-sync-profile"
              title={`Salin nama (${schoolIdentity.schoolName}), alamat, NPSN, dan logo dari Profil Sekolah`}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-700 hover:border-green-400 hover:bg-green-50 dark:border-slate-700 dark:bg-[#0F172A] dark:text-slate-200"
            >
              <RefreshCw className="h-3.5 w-3.5 text-green-700 dark:text-green-400" />
              Sinkronkan dari Profil Sekolah
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <button
              type="button"
              onClick={() => onSetDefault(draft.id)}
              disabled={draft.isDefault}
              className="inline-flex min-h-8 items-center gap-1 rounded border border-slate-200 px-2.5 text-[11px] font-medium text-slate-700 hover:bg-green-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200"
            >
              <Star className={`h-3 w-3 ${draft.isDefault ? 'fill-amber-400 text-amber-500' : ''}`} />
              {draft.isDefault ? 'Template Default' : 'Jadikan Default'}
            </button>
            <button
              type="button"
              onClick={() => onDuplicateTemplate(draft.id)}
              className="inline-flex min-h-8 items-center gap-1 rounded border border-slate-200 px-2.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
            >
              <Copy className="h-3 w-3" />
              Duplikasi
            </button>
            <button
              type="button"
              onClick={() => {
                setRenameValue(draft.name);
                setRenameModalOpen(true);
              }}
              className="inline-flex min-h-8 items-center gap-1 rounded border border-slate-200 px-2.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
            >
              <Edit3 className="h-3 w-3" />
              Ubah Nama
            </button>
            <button
              type="button"
              onClick={() => onResetStarter(draft.id)}
              className="inline-flex min-h-8 items-center gap-1 rounded border border-slate-200 px-2.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
            >
              <RotateCcw className="h-3 w-3" />
              Kembalikan Awal
            </button>
            {templates.length > 1 && !confirmDeleteOpen && (
              <button
                type="button"
                onClick={() => setConfirmDeleteOpen(true)}
                className="inline-flex min-h-8 items-center gap-1 rounded border border-rose-200 px-2.5 text-[11px] font-medium text-rose-700 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-300"
              >
                <Trash2 className="h-3 w-3" />
                Hapus
              </button>
            )}
            {confirmDeleteOpen && (
              <span className="inline-flex items-center gap-1 rounded border border-rose-300 bg-rose-50 px-2 py-1 text-[11px] dark:border-rose-800 dark:bg-rose-950/50">
                <span className="text-rose-800 dark:text-rose-200">Hapus kop ini?</span>
                <button
                  type="button"
                  onClick={() => {
                    onDeleteTemplate(draft.id);
                    setConfirmDeleteOpen(false);
                  }}
                  className="font-bold text-rose-700 underline dark:text-rose-300"
                >
                  Ya
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDeleteOpen(false)}
                  className="text-slate-600 underline dark:text-slate-300"
                >
                  Batal
                </button>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Main Split Workspace: Left Controls + Right Live Paper Preview */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[440px_minmax(0,1fr)]">
        {/* Left Controls */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-xs dark:border-slate-700 dark:bg-[#1E293B]">
          <div className="mb-4 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 sm:grid-cols-4 dark:bg-[#0F172A]">
            {(
              [
                ['layout', 'Layout & Teks'],
                ['logos', 'Logo & Ukuran'],
                ['typography', 'Font & Garis'],
                ['scope', 'Cakupan'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setEditorTab(id)}
                aria-pressed={editorTab === id}
                data-testid={`kop-tab-${id}`}
                className={`min-h-8 rounded-md px-2 py-1 text-[11px] font-semibold transition-colors ${
                  editorTab === id
                    ? 'bg-white text-green-800 shadow-xs dark:bg-[#1E293B] dark:text-green-400'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {editorTab === 'layout' && (
            <div className="space-y-3">
              <div>
                <span className="mb-1.5 block font-semibold text-slate-800 dark:text-slate-200">
                  Pilih Gaya Layout Kop (A–E)
                </span>
                <div className="grid grid-cols-1 gap-1.5">
                  {LAYOUT_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() =>
                        patchDraft({
                          layout: opt.id,
                          customLogoPosition:
                            opt.id === 'B'
                              ? 'both'
                              : opt.id === 'C'
                                ? 'top'
                                : opt.id === 'D'
                                  ? 'none'
                                  : 'left',
                        })
                      }
                      aria-pressed={draft.layout === opt.id}
                      data-testid={`kop-layout-btn-${opt.id}`}
                      className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left transition-colors ${
                        draft.layout === opt.id
                          ? 'border-green-600 bg-green-50/80 text-green-900 dark:border-green-500 dark:bg-green-950/40 dark:text-green-200'
                          : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/50'
                      }`}
                    >
                      <span>
                        <strong className="font-semibold">{opt.label}</strong> — {opt.desc}
                      </span>
                      {draft.layout === opt.id && (
                        <Check className="h-3.5 w-3.5 shrink-0 text-green-700 dark:text-green-400" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label htmlFor="kop-inst" className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                  Institusi Induk / Yayasan / Dinas (Opsional)
                </label>
                <input
                  id="kop-inst"
                  type="text"
                  value={draft.institutionName}
                  onChange={(e) => patchDraft({ institutionName: e.target.value })}
                  placeholder="Contoh: PEMERINTAH KABUPATEN ... / DINAS PENDIDIKAN"
                  className="min-h-8 w-full rounded-md border border-slate-200 bg-white px-2.5 dark:border-slate-700 dark:bg-[#0F172A]"
                />
              </div>

              <div>
                <label htmlFor="kop-school" className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                  Nama Sekolah / Satuan Pendidikan
                </label>
                <input
                  id="kop-school"
                  type="text"
                  value={draft.schoolName}
                  onChange={(e) => patchDraft({ schoolName: e.target.value })}
                  placeholder="Masukkan nama sekolah / satuan pendidikan"
                  className="min-h-8 w-full rounded-md border border-slate-200 bg-white px-2.5 font-semibold dark:border-slate-700 dark:bg-[#0F172A]"
                />
              </div>

              <div>
                <label htmlFor="kop-subid" className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                  Sub-Identitas / Akreditasi (Opsional)
                </label>
                <input
                  id="kop-subid"
                  type="text"
                  value={draft.subIdentity}
                  onChange={(e) => patchDraft({ subIdentity: e.target.value })}
                  placeholder="Kosongkan bila tidak diperlukan"
                  className="min-h-8 w-full rounded-md border border-slate-200 bg-white px-2.5 dark:border-slate-700 dark:bg-[#0F172A]"
                />
              </div>

              <div>
                <label htmlFor="kop-address" className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                  Alamat Sekolah (Opsional)
                </label>
                <input
                  id="kop-address"
                  type="text"
                  value={draft.schoolAddress}
                  onChange={(e) => patchDraft({ schoolAddress: e.target.value })}
                  placeholder="Kosongkan jika tidak dicetak"
                  className="min-h-8 w-full rounded-md border border-slate-200 bg-white px-2.5 dark:border-slate-700 dark:bg-[#0F172A]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="kop-npsn" className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                    NPSN (Opsional)
                  </label>
                  <input
                    id="kop-npsn"
                    type="text"
                    value={draft.npsn}
                    onChange={(e) => patchDraft({ npsn: e.target.value })}
                    className="min-h-8 w-full rounded-md border border-slate-200 bg-white px-2.5 dark:border-slate-700 dark:bg-[#0F172A]"
                  />
                </div>
                <div>
                  <label htmlFor="kop-phone" className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                    Telepon (Opsional)
                  </label>
                  <input
                    id="kop-phone"
                    type="text"
                    value={draft.phone}
                    onChange={(e) => patchDraft({ phone: e.target.value })}
                    className="min-h-8 w-full rounded-md border border-slate-200 bg-white px-2.5 dark:border-slate-700 dark:bg-[#0F172A]"
                  />
                </div>
                <div>
                  <label htmlFor="kop-email" className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                    Email (Opsional)
                  </label>
                  <input
                    id="kop-email"
                    type="text"
                    value={draft.email}
                    onChange={(e) => patchDraft({ email: e.target.value })}
                    className="min-h-8 w-full rounded-md border border-slate-200 bg-white px-2.5 dark:border-slate-700 dark:bg-[#0F172A]"
                  />
                </div>
                <div>
                  <label htmlFor="kop-web" className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                    Website (Opsional)
                  </label>
                  <input
                    id="kop-web"
                    type="text"
                    value={draft.website}
                    onChange={(e) => patchDraft({ website: e.target.value })}
                    className="min-h-8 w-full rounded-md border border-slate-200 bg-white px-2.5 dark:border-slate-700 dark:bg-[#0F172A]"
                  />
                </div>
              </div>

              {draft.layout === 'E' && (
                <div className="space-y-2 rounded-lg border border-green-200 bg-green-50/40 p-2.5 dark:border-green-900/60 dark:bg-green-950/20">
                  <p className="font-semibold text-green-800 dark:text-green-300">
                    Judul Ujian Khusus (Layout E)
                  </p>
                  <input
                    type="text"
                    aria-label="Judul ujian default Layout E"
                    value={draft.defaultDocTitle}
                    onChange={(e) => patchDraft({ defaultDocTitle: e.target.value })}
                    placeholder="Contoh: PENILAIAN SUMATIF AKHIR SEMESTER"
                    className="min-h-8 w-full rounded border border-slate-200 bg-white px-2.5 dark:border-slate-700 dark:bg-[#0F172A]"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      aria-label="Semester Kop"
                      value={draft.semester}
                      onChange={(e) =>
                        patchDraft({ semester: e.target.value as 'Ganjil' | 'Genap' })
                      }
                      className="min-h-8 rounded border border-slate-200 bg-white px-2 dark:border-slate-700 dark:bg-[#0F172A]"
                    >
                      <option value="Ganjil">Semester Ganjil</option>
                      <option value="Genap">Semester Genap</option>
                    </select>
                    <input
                      type="text"
                      aria-label="Tahun ajaran kop"
                      value={draft.academicYear}
                      onChange={(e) => patchDraft({ academicYear: e.target.value })}
                      className="min-h-8 rounded border border-slate-200 bg-white px-2.5 dark:border-slate-700 dark:bg-[#0F172A]"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {editorTab === 'logos' && (
            <div className="space-y-3">
              {/* Left / Primary Logo via LogoUploaderControl */}
              <LogoUploaderControl
                label="Logo Kiri / Utama"
                slot="school"
                currentDataUrl={draft.leftLogoDataUrl}
                currentFitMode={draft.logoFitMode ?? 'contain'}
                logos={logos}
                kopTemplates={templates}
                showScopeSelector
                testIdPrefix="kop-left-logo"
                onCommitLogo={async (asset, scope, selectedKopIds) => {
                  const targetKopIds =
                    scope === 'selected' && selectedKopIds && selectedKopIds.length > 0
                      ? selectedKopIds
                      : scope === 'primary'
                        ? Array.from(
                            new Set([
                              draft.id,
                              ...templates.filter((t) => t.isDefault).map((t) => t.id),
                            ])
                          )
                        : [draft.id];
                  patchDraft({
                    leftLogoDataUrl: asset.dataUrl,
                    leftLogoId: asset.logo_id,
                    logoFitMode: asset.fit_mode,
                  });
                  await onApplyLogoToTargets(asset, {
                    profile: scope === 'primary',
                    makePrimary: scope === 'primary',
                    kopIds: targetKopIds,
                    kopSide: 'left',
                    fitMode: asset.fit_mode,
                  });
                }}
                onChangeFitMode={(fit) => patchDraft({ logoFitMode: fit })}
                onClearCurrent={() => patchDraft({ leftLogoDataUrl: '', leftLogoId: undefined })}
                onDeleteFromLibrary={onDeleteStoredLogo}
                onNotify={onNotify}
              />

              {/* Right / Alternative Logo via LogoUploaderControl */}
              <LogoUploaderControl
                label="Logo Kanan (Layout B / Kustom)"
                slot="alternative"
                currentDataUrl={draft.rightLogoDataUrl}
                currentFitMode={draft.logoFitMode ?? 'contain'}
                logos={logos}
                kopTemplates={templates}
                showScopeSelector
                testIdPrefix="kop-right-logo"
                onCommitLogo={async (asset, scope, selectedKopIds) => {
                  const targetKopIds =
                    scope === 'selected' && selectedKopIds && selectedKopIds.length > 0
                      ? selectedKopIds
                      : scope === 'primary'
                        ? Array.from(
                            new Set([
                              draft.id,
                              ...templates.filter((t) => t.isDefault).map((t) => t.id),
                            ])
                          )
                        : [draft.id];
                  patchDraft({
                    rightLogoDataUrl: asset.dataUrl,
                    rightLogoId: asset.logo_id,
                    logoFitMode: asset.fit_mode,
                  });
                  await onApplyLogoToTargets(asset, {
                    kopIds: targetKopIds,
                    kopSide: 'right',
                    fitMode: asset.fit_mode,
                  });
                }}
                onChangeFitMode={(fit) => patchDraft({ logoFitMode: fit })}
                onClearCurrent={() => patchDraft({ rightLogoDataUrl: '', rightLogoId: undefined })}
                onDeleteFromLibrary={onDeleteStoredLogo}
                onNotify={onNotify}
              />

              {/* Dimension, Fit & Spacing Controls in mm */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="mb-1 block font-medium">Lebar Logo (mm)</label>
                  <input
                    type="number"
                    min={8}
                    max={40}
                    value={draft.logoWidthMm}
                    onChange={(e) => {
                      const val = Math.max(8, Math.min(40, Number(e.target.value) || 16));
                      patchDraft(
                        draft.logoLockAspect
                          ? { logoWidthMm: val, logoHeightMm: val }
                          : { logoWidthMm: val }
                      );
                    }}
                    className="font-mono-tabular min-h-8 w-full rounded border border-slate-200 bg-white px-2 dark:border-slate-700 dark:bg-[#0F172A]"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-medium">Tinggi Logo (mm)</label>
                  <input
                    type="number"
                    min={8}
                    max={40}
                    value={draft.logoHeightMm}
                    onChange={(e) => {
                      const val = Math.max(8, Math.min(40, Number(e.target.value) || 16));
                      patchDraft(
                        draft.logoLockAspect
                          ? { logoHeightMm: val, logoWidthMm: val }
                          : { logoHeightMm: val }
                      );
                    }}
                    className="font-mono-tabular min-h-8 w-full rounded border border-slate-200 bg-white px-2 dark:border-slate-700 dark:bg-[#0F172A]"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-medium">Jarak Logo–Teks (mm)</label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={draft.logoGapMm}
                    onChange={(e) =>
                      patchDraft({ logoGapMm: Math.max(1, Math.min(20, Number(e.target.value) || 4)) })
                    }
                    className="font-mono-tabular min-h-8 w-full rounded border border-slate-200 bg-white px-2 dark:border-slate-700 dark:bg-[#0F172A]"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-medium">Posisi Vertikal Logo</label>
                  <select
                    value={draft.logoVerticalAlign}
                    onChange={(e) =>
                      patchDraft({
                        logoVerticalAlign: e.target.value as KopTemplate['logoVerticalAlign'],
                      })
                    }
                    className="min-h-8 w-full rounded border border-slate-200 bg-white px-2 dark:border-slate-700 dark:bg-[#0F172A]"
                  >
                    <option value="top">Atas</option>
                    <option value="middle">Tengah</option>
                    <option value="bottom">Bawah</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block font-medium">Mode Fit Logo</label>
                  <select
                    value={draft.logoFitMode ?? 'contain'}
                    onChange={(e) =>
                      patchDraft({ logoFitMode: e.target.value as LogoFitMode })
                    }
                    className="min-h-8 w-full rounded border border-slate-200 bg-white px-2 dark:border-slate-700 dark:bg-[#0F172A]"
                  >
                    <option value="contain">Fit Contain (Proporsional)</option>
                    <option value="cover">Fit Cover</option>
                    <option value="original">Original Ratio</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block font-medium">Perataan Logo Atas (Layout C)</label>
                  <select
                    value={draft.logoHorizontalAlign ?? 'center'}
                    onChange={(e) =>
                      patchDraft({
                        logoHorizontalAlign: e.target.value as KopTemplate['logoHorizontalAlign'],
                      })
                    }
                    className="min-h-8 w-full rounded border border-slate-200 bg-white px-2 dark:border-slate-700 dark:bg-[#0F172A]"
                  >
                    <option value="center">Tengah (Center)</option>
                    <option value="left">Kiri</option>
                    <option value="right">Kanan</option>
                  </select>
                </div>
              </div>

              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={draft.logoLockAspect}
                  onChange={(e) => patchDraft({ logoLockAspect: e.target.checked })}
                  className="h-3.5 w-3.5 accent-green-700"
                />
                <span>Kunci rasio aspek proporsional logo (1:1)</span>
              </label>
            </div>
          )}

          {editorTab === 'typography' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block font-medium">Jenis Font Kop</label>
                  <select
                    value={draft.fontFamily}
                    onChange={(e) =>
                      patchDraft({ fontFamily: e.target.value as KopTemplate['fontFamily'] })
                    }
                    className="min-h-8 w-full rounded border border-slate-200 bg-white px-2 dark:border-slate-700 dark:bg-[#0F172A]"
                  >
                    <option value="Times New Roman">Times New Roman</option>
                    <option value="Calibri">Calibri</option>
                    <option value="Arial">Arial</option>
                    <option value="Georgia">Georgia</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block font-medium">Perataan Teks</label>
                  <select
                    value={draft.textAlign}
                    onChange={(e) =>
                      patchDraft({ textAlign: e.target.value as KopTemplate['textAlign'] })
                    }
                    className="min-h-8 w-full rounded border border-slate-200 bg-white px-2 dark:border-slate-700 dark:bg-[#0F172A]"
                  >
                    <option value="center">Tengah (Center)</option>
                    <option value="left">Rata Kiri</option>
                    <option value="right">Rata Kanan</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block font-medium">Ukuran Institusi (pt)</label>
                  <input
                    type="number"
                    min={8}
                    max={18}
                    value={draft.institutionFontSizePt}
                    onChange={(e) =>
                      patchDraft({ institutionFontSizePt: Number(e.target.value) || 11 })
                    }
                    className="font-mono-tabular min-h-8 w-full rounded border border-slate-200 bg-white px-2 dark:border-slate-700 dark:bg-[#0F172A]"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-medium">Ukuran Nama Sekolah (pt)</label>
                  <input
                    type="number"
                    min={10}
                    max={24}
                    value={draft.schoolFontSizePt}
                    onChange={(e) =>
                      patchDraft({ schoolFontSizePt: Number(e.target.value) || 14 })
                    }
                    className="font-mono-tabular min-h-8 w-full rounded border border-slate-200 bg-white px-2 dark:border-slate-700 dark:bg-[#0F172A]"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-medium">Ukuran Kontak (pt)</label>
                  <input
                    type="number"
                    min={7}
                    max={13}
                    value={draft.contactFontSizePt}
                    onChange={(e) =>
                      patchDraft({ contactFontSizePt: Number(e.target.value) || 9 })
                    }
                    className="font-mono-tabular min-h-8 w-full rounded border border-slate-200 bg-white px-2 dark:border-slate-700 dark:bg-[#0F172A]"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-medium">Tinggi Kop (mm)</label>
                  <input
                    type="number"
                    min={14}
                    max={65}
                    value={draft.headerHeightMm}
                    onChange={(e) =>
                      patchDraft({
                        headerHeightMm: Math.max(14, Math.min(65, Number(e.target.value) || 28)),
                      })
                    }
                    className="font-mono-tabular min-h-8 w-full rounded border border-slate-200 bg-white px-2 dark:border-slate-700 dark:bg-[#0F172A]"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-medium">Warna Teks Sekolah</label>
                  <input
                    type="color"
                    value={draft.accentColorHex}
                    onChange={(e) => patchDraft({ accentColorHex: e.target.value })}
                    className="h-8 w-full cursor-pointer rounded border border-slate-200 bg-white p-0.5 dark:border-slate-700"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-medium">Warna Garis Pemisah</label>
                  <input
                    type="color"
                    value={draft.dividerColorHex}
                    onChange={(e) => patchDraft({ dividerColorHex: e.target.value })}
                    className="h-8 w-full cursor-pointer rounded border border-slate-200 bg-white p-0.5 dark:border-slate-700"
                  />
                </div>
              </div>

              <div className="border-t border-slate-100 pt-2.5 dark:border-slate-700">
                <p className="mb-2 font-semibold text-green-800 dark:text-green-400">
                  Garis Pembatas Kop (7 Gaya)
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="col-span-2">
                    <select
                      aria-label="Gaya garis pembatas kop"
                      value={draft.dividerStyle}
                      onChange={(e) =>
                        patchDraft({ dividerStyle: e.target.value as KopLineStyle })
                      }
                      className="min-h-8 w-full rounded border border-slate-200 bg-white px-2 dark:border-slate-700 dark:bg-[#0F172A]"
                    >
                      {DIVIDER_STYLES.map((st) => (
                        <option key={st.value} value={st.value}>
                          {st.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block font-medium">Ketebalan (pt)</label>
                    <input
                      type="number"
                      step="0.25"
                      min={0.5}
                      max={6}
                      value={draft.dividerThicknessPt}
                      onChange={(e) =>
                        patchDraft({ dividerThicknessPt: Number(e.target.value) || 2 })
                      }
                      className="font-mono-tabular min-h-8 w-full rounded border border-slate-200 bg-white px-2 dark:border-slate-700 dark:bg-[#0F172A]"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block font-medium">Panjang Garis (%)</label>
                    <input
                      type="number"
                      min={20}
                      max={100}
                      value={draft.dividerLengthPct}
                      onChange={(e) =>
                        patchDraft({
                          dividerLengthPct: Math.max(
                            20,
                            Math.min(100, Number(e.target.value) || 100)
                          ),
                        })
                      }
                      className="font-mono-tabular min-h-8 w-full rounded border border-slate-200 bg-white px-2 dark:border-slate-700 dark:bg-[#0F172A]"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {editorTab === 'scope' && (
            <div className="space-y-3">
              <div>
                <label className="mb-1 block font-semibold text-slate-800 dark:text-slate-200">
                  Aturan Kemunculan Halaman
                </label>
                <select
                  value={draft.pageRule}
                  onChange={(e) => patchDraft({ pageRule: e.target.value as KopPageRule })}
                  className="min-h-8 w-full rounded border border-slate-200 bg-white px-2 dark:border-slate-700 dark:bg-[#0F172A]"
                >
                  <option value="first-only">Hanya Halaman 1 (Standar Ujian)</option>
                  <option value="all">Semua Halaman</option>
                  <option value="first-full-rest-simple">
                    Halaman 1 Lengkap, Halaman Lanjutan Header Ringkas
                  </option>
                </select>
              </div>

              <div className="border-t border-slate-100 pt-2.5 dark:border-slate-700">
                <p className="mb-2 font-semibold text-slate-800 dark:text-slate-200">
                  Terapkan Kop pada Dokumen:
                </p>
                <div className="space-y-1.5">
                  {(
                    [
                      ['examPaper', 'Naskah Soal Ujian'],
                      ['answerKey', 'Kunci Jawaban & Pembahasan'],
                      ['blueprint', 'Kisi-Kisi Asesmen'],
                      ['questionCard', 'Kartu Soal'],
                      ['rubric', 'Pedoman Penskoran & Rubrik'],
                      ['answerSheet', 'Lembar Jawaban Peserta Didik'],
                      ['examCard', 'Kartu Peserta Ujian'],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={draft.appliedDocs[key]}
                        onChange={(e) =>
                          patchDraft({
                            appliedDocs: { ...draft.appliedDocs, [key]: e.target.checked },
                          })
                        }
                        className="h-3.5 w-3.5 accent-green-700"
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-2.5 dark:border-slate-700">
                <div>
                  <label className="mb-1 block font-medium">Margin Kiri (mm)</label>
                  <input
                    type="number"
                    min={5}
                    max={40}
                    value={draft.marginLeftMm}
                    onChange={(e) => patchDraft({ marginLeftMm: Number(e.target.value) || 17 })}
                    className="font-mono-tabular min-h-8 w-full rounded border border-slate-200 bg-white px-2 dark:border-slate-700 dark:bg-[#0F172A]"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-medium">Margin Kanan (mm)</label>
                  <input
                    type="number"
                    min={5}
                    max={40}
                    value={draft.marginRightMm}
                    onChange={(e) => patchDraft({ marginRightMm: Number(e.target.value) || 17 })}
                    className="font-mono-tabular min-h-8 w-full rounded border border-slate-200 bg-white px-2 dark:border-slate-700 dark:bg-[#0F172A]"
                  />
                </div>
              </div>
            </div>
          )}

          {!validation.valid && (
            <p role="alert" className="mt-3 rounded bg-rose-50 px-2.5 py-1.5 text-[11px] text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
              {validation.issues[0]}
            </p>
          )}
        </div>

        {/* Right Live Visual Paper Preview */}
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-100/80 p-5 dark:border-slate-700 dark:bg-[#0F172A]">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-200">
                <Eye className="h-4 w-4 text-green-700 dark:text-green-400" />
                Pratinjau Kertas Kop Real-Time ({draft.layout} · {draft.fontFamily})
              </span>
              <span className="font-mono-tabular text-[11px] text-slate-500 dark:text-slate-400">
                Tinggi {draft.headerHeightMm}mm · Margin {draft.marginLeftMm}/{draft.marginRightMm}mm
              </span>
            </div>

            <div className="overflow-hidden rounded-lg border border-slate-300 bg-white shadow-md">
              <KopPaperPreview kop={draft} />
              <div className="space-y-2 px-6 py-5 text-[11px] text-slate-400">
                <div className="h-3 w-48 rounded bg-slate-100" />
                <div className="h-2.5 w-full rounded bg-slate-100/80" />
                <div className="h-2.5 w-5/6 rounded bg-slate-100/80" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Save As New Template Modal */}
      {saveAsModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Simpan Sebagai Template Kop Baru"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4"
        >
          <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-[#1E293B]">
            <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
              Simpan Sebagai Template Baru
            </h3>
            <input
              type="text"
              value={newTemplateName}
              onChange={(e) => setNewTemplateName(e.target.value)}
              placeholder="Nama template kop baru..."
              className="mt-3 min-h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs dark:border-slate-700 dark:bg-[#0F172A]"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSaveAsModalOpen(false)}
                className="min-h-8 rounded border border-slate-200 px-3 text-xs font-medium dark:border-slate-700"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!newTemplateName.trim()) return;
                  onSaveAsNew(draft, newTemplateName.trim());
                  setSaveAsModalOpen(false);
                }}
                className="min-h-8 rounded bg-green-700 px-3 text-xs font-semibold text-white hover:bg-green-800"
              >
                Simpan & Aktifkan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Modal */}
      {renameModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Ubah Nama Template Kop"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4"
        >
          <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-[#1E293B]">
            <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
              Ubah Nama Template Kop
            </h3>
            <input
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              className="mt-3 min-h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs dark:border-slate-700 dark:bg-[#0F172A]"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRenameModalOpen(false)}
                className="min-h-8 rounded border border-slate-200 px-3 text-xs font-medium dark:border-slate-700"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!renameValue.trim()) return;
                  onRenameTemplate(draft.id, renameValue.trim());
                  patchDraft({ name: renameValue.trim() });
                  setRenameModalOpen(false);
                }}
                className="min-h-8 rounded bg-green-700 px-3 text-xs font-semibold text-white hover:bg-green-800"
              >
                Simpan Nama
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full-size Preview Modal */}
      {fullPreviewOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Pratinjau Kop Dokumen Ukuran Penuh"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4"
        >
          <div className="w-full max-w-4xl rounded-xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-[#1E293B]">
            <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2.5 dark:border-slate-700">
              <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                Pratinjau Ukuran Penuh — {draft.name}
              </h3>
              <button
                type="button"
                onClick={() => setFullPreviewOpen(false)}
                aria-label="Tutup pratinjau penuh kop"
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-[75vh] overflow-y-auto rounded-lg bg-slate-100 p-6">
              <KopPaperPreview kop={draft} />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
