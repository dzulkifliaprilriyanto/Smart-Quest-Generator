import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CreditCard,
  Download,
  FileSpreadsheet,
  Images,
  Plus,
  Printer,
  Search,
  Trash2,
  Upload,
  UserPlus,
  X,
} from 'lucide-react';
import type {
  DocumentIdentity,
  ExamCardConfig,
  ExamCardKopMode,
  ExamCardPaperSize,
  ExamCardParticipant,
  ExamCardTemplateId,
  KopTemplate,
  LogoFitMode,
  StoredLogoAsset,
} from '../types/question';
import {
  type ParsedSpreadsheetResult,
  type SpreadsheetColumnMapping,
  buildParticipantsFromRows,
  downloadParticipantTemplateXlsx,
  exportExamCardsDocx,
  exportExamCardsPdf,
  matchBulkPhotosToParticipants,
  parseParticipantSpreadsheet,
  validateParticipants,
} from '../utils/examCard';
import { resolveEffectiveKop } from '../utils/kopTemplates';
import { formatOptionalNip } from '../utils/layoutEngine';
import { ImageCropModal } from './ImageCropModal';
import { LogoUploaderControl } from './LogoUploaderControl';

interface ExamCardGeneratorViewProps {
  participants: ExamCardParticipant[];
  config: ExamCardConfig;
  kopTemplates: KopTemplate[];
  activeKopTemplate: KopTemplate | undefined;
  docIdentity: DocumentIdentity;
  includeAppBranding: boolean;
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
  onUpdateParticipants: (next: ExamCardParticipant[]) => void;
  onUpsertParticipant: (participant: ExamCardParticipant) => void;
  onDeleteParticipant: (id: string) => void;
  onUpdateConfig: (patch: Partial<ExamCardConfig>) => void;
  onNotify: (msg: string) => void;
}

type SubTab = 'participants' | 'design' | 'paper';

function LandscapeExamCard({
  participant,
  config,
  effectiveKop,
}: {
  participant: ExamCardParticipant;
  config: ExamCardConfig;
  effectiveKop: KopTemplate;
}) {
  const fontFamilyCss =
    config.fontFamily === 'Times New Roman'
      ? '"Times New Roman", Times, serif'
      : config.fontFamily === 'Calibri'
        ? 'Calibri, "DM Sans", sans-serif'
        : 'Arial, sans-serif';

  const hmNip = formatOptionalNip(config.headmasterNip);
  const placeDate = [config.issuePlace.trim(), config.issueDateText.trim()]
    .filter(Boolean)
    .join(', ');
  const cardLogoPos = config.logoPosition ?? 'left';
  const primaryLogoSrc = config.customLogoDataUrl || effectiveKop.leftLogoDataUrl;
  const secondaryLogoSrc = effectiveKop.rightLogoDataUrl || primaryLogoSrc;
  const logoAllowedByMode =
    cardLogoPos !== 'none' &&
    (config.kopMode !== 'simple-header' || Boolean(config.customLogoDataUrl));
  const showLeftLogo =
    logoAllowedByMode &&
    Boolean(primaryLogoSrc) &&
    (cardLogoPos === 'left' || cardLogoPos === 'both');
  const showRightLogo =
    logoAllowedByMode &&
    Boolean(secondaryLogoSrc) &&
    (cardLogoPos === 'right' || cardLogoPos === 'both');
  const logoFitClass = config.logoFitMode === 'cover' ? 'object-cover' : 'object-contain';

  const nisCombined =
    participant.nis && participant.nisn
      ? `${participant.nis} / ${participant.nisn}`
      : participant.nis || participant.nisn || '';

  return (
    <article
      data-testid={`exam-card-${participant.participantNumber || participant.id}`}
      className="relative flex flex-col justify-between bg-white p-3.5 text-slate-900 shadow-xs"
      style={{
        fontFamily: fontFamilyCss,
        borderWidth: '1.5px',
        borderStyle: 'solid',
        borderColor: config.borderColorHex || '#0F172A',
        aspectRatio: '1.55 / 1',
      }}
    >
      {(config.templateId === 'modern' || config.templateId === 'school-identity') && (
        <div
          className="absolute inset-x-0 top-0 h-1.5"
          style={{ backgroundColor: config.accentColorHex || '#15803D' }}
        />
      )}

      {/* Card Centered Header + Divider */}
      <header className="relative flex items-center justify-center border-b border-slate-800 pb-1.5 text-center">
        {showLeftLogo && primaryLogoSrc && (
          <img
            src={primaryLogoSrc}
            alt="Logo Kiri Kartu Ujian"
            className={`absolute left-0 h-8 w-8 ${logoFitClass}`}
          />
        )}
        {showRightLogo && secondaryLogoSrc && (
          <img
            src={secondaryLogoSrc}
            alt="Logo Kanan Kartu Ujian"
            className={`absolute right-0 h-8 w-8 ${logoFitClass}`}
          />
        )}
        <div className="px-10">
          {config.kopMode !== 'simple-header' && effectiveKop.schoolName && (
            <p
              className="text-[10px] font-bold tracking-wide uppercase"
              style={{ color: config.accentColorHex || '#15803D' }}
            >
              {effectiveKop.schoolName}
            </p>
          )}
          {config.kopMode === 'full-kop' && effectiveKop.schoolAddress && (
            <p className="text-[8px] text-slate-600">{effectiveKop.schoolAddress}</p>
          )}
          <h3 className="text-xs font-bold tracking-wide text-slate-900 uppercase">
            {config.cardTitle || 'KARTU PESERTA UJIAN'}
          </h3>
          {config.academicYear.trim() && (
            <p className="text-[9px] text-slate-600">
              Tahun Ajaran {config.academicYear.trim()}
            </p>
          )}
        </div>
      </header>

      {/* Left-aligned Student Details */}
      <div className="mt-1.5 space-y-0.5 text-[10.5px] leading-snug">
        <div className="grid grid-cols-[92px_8px_1fr]">
          <span>Nama</span>
          <span>:</span>
          <span className="truncate font-bold">{participant.name || '-'}</span>
        </div>
        <div className="grid grid-cols-[92px_8px_1fr]">
          <span>Nomor Peserta</span>
          <span>:</span>
          <span className="font-mono-tabular font-bold">
            {participant.participantNumber || '-'}
          </span>
        </div>
        {config.showNis && nisCombined && (
          <div className="grid grid-cols-[92px_8px_1fr]">
            <span>{participant.nis && participant.nisn ? 'NIS / NISN' : participant.nis ? 'NIS' : 'NISN'}</span>
            <span>:</span>
            <span className="font-mono-tabular">{nisCombined}</span>
          </div>
        )}
        {config.showBirthPlaceDate && participant.birthPlaceDate && (
          <div className="grid grid-cols-[92px_8px_1fr]">
            <span>Tempat, Tgl Lahir</span>
            <span>:</span>
            <span className="truncate">{participant.birthPlaceDate}</span>
          </div>
        )}
        <div className="grid grid-cols-[92px_8px_1fr]">
          <span>Kelas</span>
          <span>:</span>
          <span className="font-semibold">{participant.className || '-'}</span>
        </div>
        {config.showRoom && participant.room && (
          <div className="grid grid-cols-[92px_8px_1fr]">
            <span>Ruang</span>
            <span>:</span>
            <span>{participant.room}</span>
          </div>
        )}
        {config.showSeatNumber && participant.seatNumber && (
          <div className="grid grid-cols-[92px_8px_1fr]">
            <span>Nomor Meja</span>
            <span>:</span>
            <span className="font-mono-tabular">{participant.seatNumber}</span>
          </div>
        )}
      </div>

      {/* Bottom Row: Bottom-Left 3:4 Photo + Bottom-Right Signature */}
      <div className="mt-2 flex items-end justify-between gap-3">
        <div className="flex h-[72px] w-[54px] shrink-0 items-center justify-center overflow-hidden border border-slate-600 bg-slate-50 text-center text-[9px] text-slate-400">
          {participant.photoDataUrl ? (
            <img
              src={participant.photoDataUrl}
              alt={`Foto ${participant.name}`}
              className="h-full w-full object-cover"
            />
          ) : (
            <span>
              Pas Foto
              <br />
              3 × 4
            </span>
          )}
        </div>

        <div className="min-w-[140px] text-left text-[10px] leading-tight">
          {placeDate && <p>{placeDate}</p>}
          <p>Kepala Sekolah,</p>
          <div className="h-7" />
          <p className="font-bold underline">
            {config.headmasterName.trim() || '...........................'}
          </p>
          {hmNip && <p className="text-[9px]">{hmNip}</p>}
        </div>
      </div>
    </article>
  );
}

export function ExamCardGeneratorView({
  participants,
  config,
  kopTemplates,
  activeKopTemplate,
  docIdentity,
  includeAppBranding,
  logos,
  onApplyLogoToTargets,
  onDeleteStoredLogo,
  onUpdateParticipants,
  onUpsertParticipant,
  onDeleteParticipant,
  onUpdateConfig,
  onNotify,
}: ExamCardGeneratorViewProps) {
  const [subTab, setSubTab] = useState<SubTab>('participants');
  const [selectedKopId, setSelectedKopId] = useState<string>(activeKopTemplate?.id ?? '');
  const [searchQuery, setSearchQuery] = useState('');
  const [classFilter, setClassFilter] = useState('Semua');
  const [roomFilter, setRoomFilter] = useState('Semua');
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});
  const [isExportingDocx, setIsExportingDocx] = useState(false);

  // Add / Edit Participant Form state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formState, setFormState] = useState<Omit<ExamCardParticipant, 'id'>>({
    name: '',
    participantNumber: '',
    nis: '',
    nisn: '',
    birthPlaceDate: '',
    className: '',
    room: '',
    seatNumber: '',
    photoDataUrl: undefined,
    photoFileName: undefined,
  });

  // Column Mapper Modal state
  const [parsedSheet, setParsedSheet] = useState<ParsedSpreadsheetResult | null>(null);
  const [colMapping, setColMapping] = useState<SpreadsheetColumnMapping | null>(null);

  // 3:4 Photo Cropper Modal state
  const [cropState, setCropState] = useState<{
    participantId: string;
    rawDataUrl: string;
  } | null>(null);

  const chosenKop = useMemo(
    () => kopTemplates.find((k) => k.id === selectedKopId) ?? activeKopTemplate,
    [kopTemplates, selectedKopId, activeKopTemplate]
  );
  const effectiveKop = useMemo(
    () => resolveEffectiveKop(chosenKop, docIdentity),
    [chosenKop, docIdentity]
  );

  const validation = useMemo(() => validateParticipants(participants), [participants]);

  const classOptions = useMemo(() => {
    const set = new Set(participants.map((p) => p.className.trim()).filter(Boolean));
    return ['Semua', ...Array.from(set)];
  }, [participants]);

  const roomOptions = useMemo(() => {
    const set = new Set(participants.map((p) => p.room.trim()).filter(Boolean));
    return ['Semua', ...Array.from(set)];
  }, [participants]);

  const filteredParticipants = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return participants.filter((p) => {
      if (classFilter !== 'Semua' && p.className.trim() !== classFilter) return false;
      if (roomFilter !== 'Semua' && p.room.trim() !== roomFilter) return false;
      if (q) {
        const hay = `${p.name} ${p.participantNumber} ${p.nis ?? ''} ${p.className} ${p.room}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [participants, classFilter, roomFilter, searchQuery]);

  const targetExportList = useMemo(() => {
    const checked = filteredParticipants.filter((p) => selectedIds[p.id]);
    return checked.length > 0 ? checked : filteredParticipants;
  }, [filteredParticipants, selectedIds]);

  const handleSaveParticipant = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formState.name.trim() || !formState.participantNumber.trim() || !formState.className.trim()) {
      onNotify('Nama, Nomor Peserta, dan Kelas wajib diisi.');
      return;
    }
    const item: ExamCardParticipant = {
      ...formState,
      id: editingId || `peserta-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: formState.name.trim(),
      participantNumber: formState.participantNumber.trim(),
      className: formState.className.trim(),
    };
    onUpsertParticipant(item);
    onNotify(editingId ? `Data "${item.name}" diperbarui.` : `Peserta "${item.name}" ditambahkan.`);
    setEditingId(null);
    setFormState({
      name: '',
      participantNumber: '',
      nis: '',
      nisn: '',
      birthPlaceDate: '',
      className: '',
      room: '',
      seatNumber: '',
      photoDataUrl: undefined,
      photoFileName: undefined,
    });
  };

  const handleSpreadsheetUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const parsed = parseParticipantSpreadsheet(buf);
      if (parsed.rows.length === 0) {
        onNotify('Berkas Excel/CSV kosong atau tidak memiliki baris data.');
        return;
      }
      setParsedSheet(parsed);
      setColMapping(parsed.suggestedMapping);
    } catch {
      onNotify('Gagal membaca file Excel/CSV. Pastikan format valid.');
    }
  };

  const handleConfirmSpreadsheetImport = () => {
    if (!parsedSheet || !colMapping) return;
    const imported = buildParticipantsFromRows(parsedSheet.rows, colMapping);
    onUpdateParticipants([...participants, ...imported]);
    setParsedSheet(null);
    setColMapping(null);
    onNotify(`Berhasil mengimpor ${imported.length} peserta dari spreadsheet.`);
  };

  const handleSinglePhotoPick = (
    e: React.ChangeEvent<HTMLInputElement>,
    participantId: string
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setCropState({ participantId, rawDataUrl: reader.result });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleBulkPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;
    const loaded = await Promise.all(
      files.map(
        (file) =>
          new Promise<{ fileName: string; dataUrl: string }>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () =>
              resolve({ fileName: file.name, dataUrl: String(reader.result || '') });
            reader.onerror = reject;
            reader.readAsDataURL(file);
          })
      )
    );
    const { updated, matchedCount } = matchBulkPhotosToParticipants(participants, loaded);
    onUpdateParticipants(updated);
    onNotify(
      matchedCount > 0
        ? `${matchedCount} foto peserta berhasil dicocokkan ke nomor/nama peserta masing-masing.`
        : 'Tidak ada nama file foto yang cocok dengan Nomor Peserta atau Nama Peserta.'
    );
  };

  const handleExportPdf = () => {
    if (targetExportList.length === 0) return;
    exportExamCardsPdf(
      targetExportList,
      config,
      chosenKop,
      docIdentity,
      includeAppBranding
    );
    onNotify(`Kartu Peserta Ujian (${targetExportList.length} kartu) diunduh sebagai PDF.`);
  };

  const handleExportDocx = async () => {
    if (targetExportList.length === 0) return;
    setIsExportingDocx(true);
    try {
      await exportExamCardsDocx(
        targetExportList,
        config,
        chosenKop,
        docIdentity,
        includeAppBranding
      );
      onNotify(`Kartu Peserta Ujian (${targetExportList.length} kartu) diunduh sebagai DOCX.`);
    } finally {
      setIsExportingDocx(false);
    }
  };

  return (
    <section aria-label="Generator Kartu Peserta Ujian" className="space-y-4">
      {/* Header Bar */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-[#1E293B]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display flex items-center gap-2 text-xl font-semibold text-slate-900 dark:text-white">
              <CreditCard className="h-5 w-5 text-green-700 dark:text-green-400" />
              Generator Kartu Peserta Ujian (Otomatis & Massal)
            </h1>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
              Susun kartu peserta ujian horizontal standar sekolah secara satuan maupun massal
              (Excel/CSV + Foto 3×4 terikat ketat per peserta) — siap cetak A4/F4/A6, PDF, & DOCX.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={targetExportList.length === 0}
              onClick={() => window.print()}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-45 dark:border-slate-700 dark:bg-[#0F172A] dark:text-slate-100"
            >
              <Printer className="h-3.5 w-3.5" />
              Cetak (Print)
            </button>
            <button
              type="button"
              disabled={targetExportList.length === 0 || isExportingDocx}
              onClick={handleExportDocx}
              data-testid="btn-export-cards-docx"
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-3 text-xs font-semibold text-green-800 hover:bg-green-100 disabled:opacity-45 dark:border-green-800 dark:bg-green-950/60 dark:text-green-300"
            >
              <Download className="h-3.5 w-3.5" />
              {isExportingDocx ? 'Menyusun...' : `Unduh DOCX (${targetExportList.length})`}
            </button>
            <button
              type="button"
              disabled={targetExportList.length === 0}
              onClick={handleExportPdf}
              data-testid="btn-export-cards-pdf"
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-green-700 px-3.5 text-xs font-semibold text-white hover:bg-green-800 disabled:opacity-45 dark:bg-green-600"
            >
              <Download className="h-3.5 w-3.5" />
              Unduh PDF ({targetExportList.length})
            </button>
          </div>
        </div>

        {/* Sub-tabs */}
        <div className="mt-4 flex flex-wrap gap-1.5 border-t border-slate-100 pt-3 dark:border-slate-700">
          {(
            [
              ['participants', `Data Peserta (${participants.length})`],
              ['design', 'Desain Kartu & Kepala Sekolah'],
              ['paper', 'Ukuran Kertas & Tata Letak Cetak'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setSubTab(id)}
              aria-pressed={subTab === id}
              data-testid={`exam-card-subtab-${id}`}
              className={`min-h-9 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                subTab === id
                  ? 'bg-green-700 text-white dark:bg-green-600'
                  : 'text-slate-700 hover:bg-green-50 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Validation Alert if duplicate numbers or missing required fields */}
      {participants.length > 0 && !validation.valid && (
        <div
          role="alert"
          data-testid="exam-card-validation-alert"
          className="flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" />
          <div>
            <p className="font-semibold">
              Ditemukan {validation.issuesByRow.length} data peserta yang perlu diperiksa sebelum
              cetak:
            </p>
            <ul className="mt-1 list-disc pl-4 text-[11px]">
              {validation.duplicateNumbers.length > 0 && (
                <li>
                  Nomor peserta ganda terdeteksi: {validation.duplicateNumbers.join(', ')}
                </li>
              )}
              {validation.issuesByRow.slice(0, 4).map((iss) => (
                <li key={iss.participantId}>
                  Baris #{iss.rowIndex}: {iss.issues.join('; ')}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[440px_minmax(0,1fr)]">
        {/* Left Panel: Participants / Design / Paper */}
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 text-xs dark:border-slate-700 dark:bg-[#1E293B]">
          {subTab === 'participants' && (
            <div className="space-y-4">
              {/* Mass Import Actions */}
              <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-[#0F172A]">
                <p className="font-semibold text-green-800 dark:text-green-400">
                  Impor Data & Foto Massal
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={downloadParticipantTemplateXlsx}
                    data-testid="btn-download-participant-template"
                    className="inline-flex min-h-8 items-center gap-1 rounded border border-slate-200 bg-white px-2.5 text-[11px] font-medium text-slate-700 hover:bg-green-50 dark:border-slate-700 dark:bg-[#1E293B] dark:text-slate-200"
                  >
                    <FileSpreadsheet className="h-3.5 w-3.5 text-green-700 dark:text-green-400" />
                    Unduh Template Excel
                  </button>

                  <label className="inline-flex min-h-8 cursor-pointer items-center gap-1 rounded border border-green-300 bg-green-50 px-2.5 text-[11px] font-semibold text-green-800 hover:bg-green-100 dark:border-green-800 dark:bg-green-950/60 dark:text-green-300">
                    <Upload className="h-3.5 w-3.5" />
                    Unggah Excel / CSV
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      onChange={handleSpreadsheetUpload}
                      data-testid="input-upload-spreadsheet"
                      className="sr-only"
                    />
                  </label>

                  <label className="inline-flex min-h-8 cursor-pointer items-center gap-1 rounded border border-slate-200 bg-white px-2.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-[#1E293B] dark:text-slate-200">
                    <Images className="h-3.5 w-3.5" />
                    Cocokkan Foto Massal
                    <input
                      type="file"
                      multiple
                      accept="image/png,image/jpeg,image/webp"
                      onChange={handleBulkPhotoUpload}
                      className="sr-only"
                    />
                  </label>
                </div>
                <p className="text-[10.5px] text-slate-500 dark:text-slate-400">
                  Foto massal otomatis dicocokkan dengan Nomor Peserta atau Nama File Foto.
                </p>
              </div>

              {/* Manual Add / Edit Form */}
              <form onSubmit={handleSaveParticipant} className="space-y-2.5">
                <p className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-200">
                  <UserPlus className="h-3.5 w-3.5 text-green-700 dark:text-green-400" />
                  {editingId ? 'Sunting Data Peserta' : 'Tambah Peserta Satuan'}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="col-span-2">
                    <label htmlFor="p-name" className="mb-0.5 block font-medium">
                      Nama Lengkap *
                    </label>
                    <input
                      id="p-name"
                      type="text"
                      value={formState.name}
                      onChange={(e) => setFormState((s) => ({ ...s, name: e.target.value }))}
                      placeholder="Contoh: Aulia Rahma"
                      className="min-h-8 w-full rounded border border-slate-200 bg-white px-2.5 dark:border-slate-700 dark:bg-[#0F172A]"
                    />
                  </div>
                  <div>
                    <label htmlFor="p-num" className="mb-0.5 block font-medium">
                      Nomor Peserta *
                    </label>
                    <input
                      id="p-num"
                      type="text"
                      value={formState.participantNumber}
                      onChange={(e) =>
                        setFormState((s) => ({ ...s, participantNumber: e.target.value }))
                      }
                      placeholder="2026-05-001"
                      className="font-mono-tabular min-h-8 w-full rounded border border-slate-200 bg-white px-2.5 dark:border-slate-700 dark:bg-[#0F172A]"
                    />
                  </div>
                  <div>
                    <label htmlFor="p-class" className="mb-0.5 block font-medium">
                      Kelas *
                    </label>
                    <input
                      id="p-class"
                      type="text"
                      value={formState.className}
                      onChange={(e) => setFormState((s) => ({ ...s, className: e.target.value }))}
                      placeholder="Kelas V"
                      className="min-h-8 w-full rounded border border-slate-200 bg-white px-2.5 dark:border-slate-700 dark:bg-[#0F172A]"
                    />
                  </div>
                  <div>
                    <label htmlFor="p-nis" className="mb-0.5 block font-medium">
                      NIS (Opsional)
                    </label>
                    <input
                      id="p-nis"
                      type="text"
                      value={formState.nis ?? ''}
                      onChange={(e) => setFormState((s) => ({ ...s, nis: e.target.value }))}
                      className="font-mono-tabular min-h-8 w-full rounded border border-slate-200 bg-white px-2.5 dark:border-slate-700 dark:bg-[#0F172A]"
                    />
                  </div>
                  <div>
                    <label htmlFor="p-nisn" className="mb-0.5 block font-medium">
                      NISN (Opsional)
                    </label>
                    <input
                      id="p-nisn"
                      type="text"
                      value={formState.nisn ?? ''}
                      onChange={(e) => setFormState((s) => ({ ...s, nisn: e.target.value }))}
                      className="font-mono-tabular min-h-8 w-full rounded border border-slate-200 bg-white px-2.5 dark:border-slate-700 dark:bg-[#0F172A]"
                    />
                  </div>
                  <div className="col-span-2">
                    <label htmlFor="p-ttl" className="mb-0.5 block font-medium">
                      Tempat, Tanggal Lahir
                    </label>
                    <input
                      id="p-ttl"
                      type="text"
                      value={formState.birthPlaceDate}
                      onChange={(e) =>
                        setFormState((s) => ({ ...s, birthPlaceDate: e.target.value }))
                      }
                      placeholder="Pasuruan, 14 Mei 2015"
                      className="min-h-8 w-full rounded border border-slate-200 bg-white px-2.5 dark:border-slate-700 dark:bg-[#0F172A]"
                    />
                  </div>
                  <div>
                    <label htmlFor="p-room" className="mb-0.5 block font-medium">
                      Ruang Ujian
                    </label>
                    <input
                      id="p-room"
                      type="text"
                      value={formState.room}
                      onChange={(e) => setFormState((s) => ({ ...s, room: e.target.value }))}
                      placeholder="Ruang 01"
                      className="min-h-8 w-full rounded border border-slate-200 bg-white px-2.5 dark:border-slate-700 dark:bg-[#0F172A]"
                    />
                  </div>
                  <div>
                    <label htmlFor="p-seat" className="mb-0.5 block font-medium">
                      Nomor Meja
                    </label>
                    <input
                      id="p-seat"
                      type="text"
                      value={formState.seatNumber}
                      onChange={(e) => setFormState((s) => ({ ...s, seatNumber: e.target.value }))}
                      placeholder="01"
                      className="font-mono-tabular min-h-8 w-full rounded border border-slate-200 bg-white px-2.5 dark:border-slate-700 dark:bg-[#0F172A]"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="submit"
                    data-testid="btn-add-participant"
                    className="inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-green-700 px-3 font-semibold text-white hover:bg-green-800 dark:bg-green-600"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {editingId ? 'Simpan Perubahan' : 'Tambahkan Peserta'}
                  </button>
                  {editingId && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(null);
                        setFormState({
                          name: '',
                          participantNumber: '',
                          nis: '',
                          nisn: '',
                          birthPlaceDate: '',
                          className: '',
                          room: '',
                          seatNumber: '',
                        });
                      }}
                      className="min-h-9 rounded-lg border border-slate-200 px-3 font-medium dark:border-slate-700"
                    >
                      Batal
                    </button>
                  )}
                </div>
              </form>

              {/* Participant List */}
              {participants.length > 0 && (
                <div className="space-y-2 border-t border-slate-100 pt-3 dark:border-slate-700">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">Daftar Peserta ({participants.length})</span>
                    <button
                      type="button"
                      onClick={() => onUpdateParticipants([])}
                      className="text-[11px] font-medium text-rose-600 hover:underline"
                    >
                      Kosongkan Semua
                    </button>
                  </div>
                  <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
                    {participants.map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/70 p-2 dark:border-slate-700 dark:bg-[#0F172A]"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <div className="flex h-10 w-8 shrink-0 items-center justify-center overflow-hidden rounded border border-slate-300 bg-white text-[8px] text-slate-400">
                            {p.photoDataUrl ? (
                              <img
                                src={p.photoDataUrl}
                                alt={p.name}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              '3×4'
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-slate-900 dark:text-white">
                              {p.name}
                            </p>
                            <p className="font-mono-tabular truncate text-[10.5px] text-slate-500">
                              {p.participantNumber} · {p.className} {p.room ? `· ${p.room}` : ''}
                            </p>
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-1">
                          <label
                            title="Unggah & Crop Foto 3:4"
                            className="inline-flex h-7 cursor-pointer items-center rounded border border-slate-200 bg-white px-2 text-[10px] font-medium text-slate-700 hover:bg-green-50 dark:border-slate-700 dark:bg-[#1E293B] dark:text-slate-200"
                          >
                            Foto
                            <input
                              type="file"
                              accept="image/png,image/jpeg,image/webp"
                              onChange={(e) => handleSinglePhotoPick(e, p.id)}
                              className="sr-only"
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(p.id);
                              setFormState({
                                name: p.name,
                                participantNumber: p.participantNumber,
                                nis: p.nis ?? '',
                                nisn: p.nisn ?? '',
                                birthPlaceDate: p.birthPlaceDate,
                                className: p.className,
                                room: p.room,
                                seatNumber: p.seatNumber,
                                photoDataUrl: p.photoDataUrl,
                                photoFileName: p.photoFileName,
                              });
                            }}
                            className="h-7 rounded border border-slate-200 bg-white px-2 text-[10px] font-medium dark:border-slate-700 dark:bg-[#1E293B]"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteParticipant(p.id)}
                            aria-label={`Hapus ${p.name}`}
                            className="inline-flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {subTab === 'design' && (
            <div className="space-y-3">
              <div>
                <label className="mb-1 block font-medium">Template Desain Kartu (4 Model)</label>
                <select
                  value={config.templateId}
                  onChange={(e) =>
                    onUpdateConfig({ templateId: e.target.value as ExamCardTemplateId })
                  }
                  className="min-h-8 w-full rounded border border-slate-200 bg-white px-2 dark:border-slate-700 dark:bg-[#0F172A]"
                >
                  <option value="classic">Klasik Resmi Sekolah (Bingkai Tegas)</option>
                  <option value="modern">Modern Minimalis (Aksen Atas)</option>
                  <option value="school-identity">Identitas Sekolah Berwarna</option>
                  <option value="custom">Kustom Warna & Font</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block font-medium">Mode Integrasi Kop Kartu</label>
                <select
                  value={config.kopMode}
                  onChange={(e) =>
                    onUpdateConfig({ kopMode: e.target.value as ExamCardKopMode })
                  }
                  className="min-h-8 w-full rounded border border-slate-200 bg-white px-2 dark:border-slate-700 dark:bg-[#0F172A]"
                >
                  <option value="school-identity">Identitas Sekolah + Judul Kartu</option>
                  <option value="school-logo">Logo Sekolah + Judul Kartu</option>
                  <option value="full-kop">Kop Lengkap (Nama, Alamat, Logo)</option>
                  <option value="simple-header">Header Sederhana Tanpa Nama Sekolah</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block font-medium">Sumber Template Kop</label>
                <select
                  value={selectedKopId}
                  onChange={(e) => setSelectedKopId(e.target.value)}
                  className="min-h-8 w-full rounded border border-slate-200 bg-white px-2 dark:border-slate-700 dark:bg-[#0F172A]"
                >
                  {kopTemplates.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block font-medium">Posisi Logo pada Kartu Ujian</label>
                <select
                  aria-label="Posisi logo kartu ujian"
                  value={config.logoPosition ?? 'left'}
                  onChange={(e) =>
                    onUpdateConfig({
                      logoPosition: e.target.value as ExamCardConfig['logoPosition'],
                    })
                  }
                  className="min-h-8 w-full rounded border border-slate-200 bg-white px-2 dark:border-slate-700 dark:bg-[#0F172A]"
                >
                  <option value="left">Kiri Saja (Standar)</option>
                  <option value="right">Kanan Saja</option>
                  <option value="both">Kiri &amp; Kanan (Simetris)</option>
                  <option value="none">Tanpa Logo</option>
                </select>
              </div>

              <LogoUploaderControl
                label="Logo Khusus Kartu Ujian (Opsional — fallback ke logo Kop/Sekolah)"
                slot="alternative"
                currentDataUrl={config.customLogoDataUrl || ''}
                currentFitMode={config.logoFitMode ?? 'contain'}
                logos={logos}
                testIdPrefix="exam-card-logo"
                onCommitLogo={async (asset) => {
                  await onApplyLogoToTargets(asset, {
                    examCard: true,
                    fitMode: asset.fit_mode,
                  });
                }}
                onChangeFitMode={(fit) => onUpdateConfig({ logoFitMode: fit })}
                onClearCurrent={() =>
                  onUpdateConfig({ customLogoDataUrl: '', customLogoId: undefined })
                }
                onDeleteFromLibrary={onDeleteStoredLogo}
                onNotify={onNotify}
              />

              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2">
                  <label className="mb-1 block font-medium">Judul Kartu Ujian</label>
                  <input
                    type="text"
                    value={config.cardTitle}
                    onChange={(e) => onUpdateConfig({ cardTitle: e.target.value })}
                    className="min-h-8 w-full rounded border border-slate-200 bg-white px-2.5 dark:border-slate-700 dark:bg-[#0F172A]"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-medium">Tahun Ajaran</label>
                  <input
                    type="text"
                    value={config.academicYear}
                    onChange={(e) => onUpdateConfig({ academicYear: e.target.value })}
                    className="min-h-8 w-full rounded border border-slate-200 bg-white px-2.5 dark:border-slate-700 dark:bg-[#0F172A]"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-medium">Jenis Font</label>
                  <select
                    value={config.fontFamily}
                    onChange={(e) =>
                      onUpdateConfig({ fontFamily: e.target.value as ExamCardConfig['fontFamily'] })
                    }
                    className="min-h-8 w-full rounded border border-slate-200 bg-white px-2 dark:border-slate-700 dark:bg-[#0F172A]"
                  >
                    <option value="Times New Roman">Times New Roman</option>
                    <option value="Calibri">Calibri</option>
                    <option value="Arial">Arial</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block font-medium">Tempat Terbit</label>
                  <input
                    type="text"
                    value={config.issuePlace}
                    onChange={(e) => onUpdateConfig({ issuePlace: e.target.value })}
                    placeholder="Contoh: Kota / Kabupaten"
                    className="min-h-8 w-full rounded border border-slate-200 bg-white px-2.5 dark:border-slate-700 dark:bg-[#0F172A]"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-medium">Tanggal Terbit</label>
                  <input
                    type="text"
                    value={config.issueDateText}
                    onChange={(e) => onUpdateConfig({ issueDateText: e.target.value })}
                    placeholder="Mei 2026"
                    className="min-h-8 w-full rounded border border-slate-200 bg-white px-2.5 dark:border-slate-700 dark:bg-[#0F172A]"
                  />
                </div>
                <div className="col-span-2">
                  <label className="mb-1 block font-medium">Nama Kepala Sekolah</label>
                  <input
                    type="text"
                    value={config.headmasterName}
                    onChange={(e) => onUpdateConfig({ headmasterName: e.target.value })}
                    placeholder="Nama Kepala Sekolah"
                    className="min-h-8 w-full rounded border border-slate-200 bg-white px-2.5 dark:border-slate-700 dark:bg-[#0F172A]"
                  />
                </div>
                <div className="col-span-2">
                  <label className="mb-1 block font-medium">
                    NIP Kepala Sekolah <span className="font-normal text-slate-400">(Opsional — disembunyikan bila kosong)</span>
                  </label>
                  <input
                    type="text"
                    value={config.headmasterNip}
                    onChange={(e) => onUpdateConfig({ headmasterNip: e.target.value })}
                    placeholder="Kosongkan jika tidak dicetak"
                    className="min-h-8 w-full rounded border border-slate-200 bg-white px-2.5 dark:border-slate-700 dark:bg-[#0F172A]"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-medium">Warna Bingkai</label>
                  <input
                    type="color"
                    value={config.borderColorHex}
                    onChange={(e) => onUpdateConfig({ borderColorHex: e.target.value })}
                    className="h-8 w-full rounded border border-slate-200 bg-white p-0.5 dark:border-slate-700"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-medium">Warna Aksen</label>
                  <input
                    type="color"
                    value={config.accentColorHex}
                    onChange={(e) => onUpdateConfig({ accentColorHex: e.target.value })}
                    className="h-8 w-full rounded border border-slate-200 bg-white p-0.5 dark:border-slate-700"
                  />
                </div>
              </div>

              <div className="space-y-1.5 border-t border-slate-100 pt-2.5 dark:border-slate-700">
                <p className="font-semibold">Tampilkan Field Opsional:</p>
                {(
                  [
                    ['showNis', 'Tampilkan NIS / NISN'],
                    ['showBirthPlaceDate', 'Tampilkan Tempat, Tanggal Lahir'],
                    ['showRoom', 'Tampilkan Ruang Ujian'],
                    ['showSeatNumber', 'Tampilkan Nomor Meja'],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={config[key]}
                      onChange={(e) => onUpdateConfig({ [key]: e.target.checked })}
                      className="h-3.5 w-3.5 accent-green-700"
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {subTab === 'paper' && (
            <div className="space-y-3">
              <div>
                <label className="mb-1 block font-medium">Ukuran Kertas Cetak</label>
                <select
                  value={config.paperSize}
                  onChange={(e) =>
                    onUpdateConfig({ paperSize: e.target.value as ExamCardPaperSize })
                  }
                  className="min-h-8 w-full rounded border border-slate-200 bg-white px-2 dark:border-slate-700 dark:bg-[#0F172A]"
                >
                  <option value="a4">A4 (210 × 297 mm)</option>
                  <option value="f4">F4 / Folio (215 × 330 mm)</option>
                  <option value="letter">Letter (215.9 × 279.4 mm)</option>
                  <option value="a6-landscape">A6 Landscape (148 × 105 mm · 1 Kartu)</option>
                  <option value="reference">Ukuran Kartu Referensi (103 × 66 mm · 1 Kartu)</option>
                  <option value="custom">Ukuran Kustom (mm)</option>
                </select>
              </div>

              {config.paperSize === 'custom' && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block font-medium">Lebar Kartu (mm)</label>
                    <input
                      type="number"
                      min={70}
                      max={200}
                      value={config.customWidthMm}
                      onChange={(e) =>
                        onUpdateConfig({ customWidthMm: Number(e.target.value) || 95 })
                      }
                      className="font-mono-tabular min-h-8 w-full rounded border border-slate-200 bg-white px-2 dark:border-slate-700 dark:bg-[#0F172A]"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block font-medium">Tinggi Kartu (mm)</label>
                    <input
                      type="number"
                      min={48}
                      max={140}
                      value={config.customHeightMm}
                      onChange={(e) =>
                        onUpdateConfig({ customHeightMm: Number(e.target.value) || 62 })
                      }
                      className="font-mono-tabular min-h-8 w-full rounded border border-slate-200 bg-white px-2 dark:border-slate-700 dark:bg-[#0F172A]"
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block font-medium">Kartu per Halaman</label>
                  <select
                    value={String(config.cardsPerPage)}
                    onChange={(e) => {
                      const val = e.target.value;
                      onUpdateConfig({
                        cardsPerPage: val === 'auto' ? 'auto' : (Number(val) as 1 | 2 | 4 | 6),
                      });
                    }}
                    className="min-h-8 w-full rounded border border-slate-200 bg-white px-2 dark:border-slate-700 dark:bg-[#0F172A]"
                  >
                    <option value="1">1 Kartu / Hal</option>
                    <option value="2">2 Kartu / Hal</option>
                    <option value="4">4 Kartu / Hal (2×2)</option>
                    <option value="6">6 Kartu / Hal (2×3)</option>
                    <option value="auto">Otomatis</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block font-medium">Jarak Antar Kartu (mm)</label>
                  <input
                    type="number"
                    min={2}
                    max={15}
                    value={config.cardGapMm}
                    onChange={(e) =>
                      onUpdateConfig({ cardGapMm: Number(e.target.value) || 6 })
                    }
                    className="font-mono-tabular min-h-8 w-full rounded border border-slate-200 bg-white px-2 dark:border-slate-700 dark:bg-[#0F172A]"
                  />
                </div>
              </div>

              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={config.showCutMarks}
                  onChange={(e) => onUpdateConfig({ showCutMarks: e.target.checked })}
                  className="h-3.5 w-3.5 accent-green-700"
                />
                <span>Sertakan tanda potong (cut marks) saat ekspor multi-kartu</span>
              </label>
            </div>
          )}
        </div>

        {/* Right Panel: Filter Bar & Live Cards Preview Grid */}
        <div className="space-y-4">
          {/* Search & Filter */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3 text-xs dark:border-slate-700 dark:bg-[#1E293B]">
            <div className="relative min-w-[200px] flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                aria-label="Cari peserta kartu ujian"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari nama, nomor peserta, NIS..."
                className="min-h-8 w-full rounded-md border border-slate-200 bg-slate-50 pr-3 pl-8 text-xs dark:border-slate-700 dark:bg-[#0F172A]"
              />
            </div>

            <select
              aria-label="Filter kelas"
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
              className="min-h-8 rounded-md border border-slate-200 bg-white px-2.5 text-xs dark:border-slate-700 dark:bg-[#0F172A]"
            >
              {classOptions.map((c) => (
                <option key={c} value={c}>
                  {c === 'Semua' ? 'Semua Kelas' : c}
                </option>
              ))}
            </select>

            <select
              aria-label="Filter ruang"
              value={roomFilter}
              onChange={(e) => setRoomFilter(e.target.value)}
              className="min-h-8 rounded-md border border-slate-200 bg-white px-2.5 text-xs dark:border-slate-700 dark:bg-[#0F172A]"
            >
              {roomOptions.map((r) => (
                <option key={r} value={r}>
                  {r === 'Semua' ? 'Semua Ruang' : r}
                </option>
              ))}
            </select>
          </div>

          {filteredParticipants.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center dark:border-slate-700 dark:bg-[#1E293B]">
              <CreditCard className="mx-auto mb-2 h-8 w-8 text-green-700 dark:text-green-400" />
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                Belum Ada Data Kartu Peserta Ujian
              </h2>
              <p className="mx-auto mt-1 max-w-md text-xs text-slate-600 dark:text-slate-300">
                Tambahkan peserta melalui formulir di sebelah kiri, atau unduh Template Excel
                lalu unggah daftar peserta secara massal.
              </p>
              <div className="mt-5 mx-auto max-w-md text-left opacity-80">
                <p className="mb-1.5 text-[11px] font-medium text-slate-500">
                  Contoh Pratinjau Struktur Kartu Horizontal:
                </p>
                <LandscapeExamCard
                  participant={{
                    id: 'sample-preview',
                    name: 'Contoh Nama Peserta',
                    participantNumber: '2026-001',
                    birthPlaceDate: 'Pasuruan, 14 Mei 2015',
                    className: 'Kelas V',
                    room: 'Ruang 01',
                    seatNumber: '01',
                  }}
                  config={config}
                  effectiveKop={effectiveKop}
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {filteredParticipants.map((p) => {
                const isChecked = Boolean(selectedIds[p.id]);
                return (
                  <div key={p.id} className="space-y-1.5">
                    <div className="flex items-center justify-between px-1 text-[11px] text-slate-600 dark:text-slate-300">
                      <label className="inline-flex cursor-pointer items-center gap-1.5">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) =>
                            setSelectedIds((prev) => ({ ...prev, [p.id]: e.target.checked }))
                          }
                          className="h-3.5 w-3.5 accent-green-700"
                        />
                        <span className="font-medium">Pilih Cetak ({p.participantNumber})</span>
                      </label>
                      {p.photoDataUrl && (
                        <span className="inline-flex items-center gap-1 text-green-700 dark:text-green-400">
                          <Check className="h-3 w-3" /> Foto 3×4 terpasang
                        </span>
                      )}
                    </div>
                    <LandscapeExamCard
                      participant={p}
                      config={config}
                      effectiveKop={effectiveKop}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Spreadsheet Column Mapping Modal */}
      {parsedSheet && colMapping && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Pemetaan Kolom Excel/CSV Peserta"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4"
        >
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-[#1E293B]">
            <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2.5 dark:border-slate-700">
              <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                Pemetaan Kolom Spreadsheet ({parsedSheet.rows.length} Baris Ditemukan)
              </h3>
              <button
                type="button"
                onClick={() => {
                  setParsedSheet(null);
                  setColMapping(null);
                }}
                aria-label="Tutup pemetaan kolom"
                className="rounded p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5 text-xs">
              {(
                [
                  ['name', 'Nama Peserta *'],
                  ['participantNumber', 'Nomor Peserta *'],
                  ['className', 'Kelas *'],
                  ['nis', 'NIS'],
                  ['nisn', 'NISN'],
                  ['birthPlaceDate', 'Tempat / TTL'],
                  ['birthDateSeparate', 'Tanggal Lahir (Jika Terpisah)'],
                  ['room', 'Ruang'],
                  ['seatNumber', 'Nomor Meja'],
                  ['photoFileName', 'Nama File Foto'],
                ] as const
              ).map(([field, label]) => (
                <div key={field}>
                  <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
                    {label}
                  </label>
                  <select
                    value={colMapping[field]}
                    onChange={(e) =>
                      setColMapping((prev) =>
                        prev ? { ...prev, [field]: e.target.value } : prev
                      )
                    }
                    className="min-h-8 w-full rounded border border-slate-200 bg-white px-2 dark:border-slate-700 dark:bg-[#0F172A]"
                  >
                    <option value="">-- Abaikan --</option>
                    {parsedSheet.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-700">
              <button
                type="button"
                onClick={() => {
                  setParsedSheet(null);
                  setColMapping(null);
                }}
                className="min-h-8 rounded border border-slate-200 px-3 text-xs font-medium dark:border-slate-700"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmSpreadsheetImport}
                data-testid="btn-confirm-import-spreadsheet"
                className="min-h-8 rounded bg-green-700 px-3.5 text-xs font-semibold text-white hover:bg-green-800"
              >
                Impor {parsedSheet.rows.length} Peserta
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3:4 Photo Cropper Modal (Strict participantId binding) */}
      {cropState && (
        <ImageCropModal
          open
          imageSrc={cropState.rawDataUrl}
          aspectMode="3:4"
          outputMime="image/jpeg"
          title="Sesuaikan & Potong Pas Foto Peserta (3:4)"
          onCancel={() => setCropState(null)}
          onConfirm={(croppedDataUrl) => {
            const target = participants.find((p) => p.id === cropState.participantId);
            if (target) {
              onUpsertParticipant({
                ...target,
                photoDataUrl: croppedDataUrl,
                photoFileName: `${target.participantNumber || target.id}.jpg`,
              });
              onNotify(`Pas foto 3×4 untuk "${target.name}" berhasil disimpan.`);
            }
            setCropState(null);
          }}
        />
      )}
    </section>
  );
}
