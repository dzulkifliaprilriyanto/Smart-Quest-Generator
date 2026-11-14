import { useState } from 'react';
import {
  Check,
  Crop,
  Image as ImageIcon,
  Minimize2,
  RotateCcw,
  Save,
  Trash2,
  Upload,
} from 'lucide-react';
import type {
  KopTemplate,
  LogoFitMode,
  LogoSlot,
  StoredLogoAsset,
} from '../types/question';
import {
  createStoredLogoAsset,
  formatBytesReadable,
  optimizeLogoDataUrl,
  validateAndReadLogoFile,
} from '../utils/logoManager';
import { ImageCropModal } from './ImageCropModal';

interface LogoUploaderControlProps {
  label: string;
  slot: LogoSlot;
  currentDataUrl: string;
  currentFitMode?: LogoFitMode;
  logos: StoredLogoAsset[];
  kopTemplates?: KopTemplate[];
  showScopeSelector?: boolean;
  testIdPrefix?: string;
  onCommitLogo: (
    asset: StoredLogoAsset,
    scope: 'current' | 'selected' | 'primary',
    selectedKopIds?: string[]
  ) => Promise<void> | void;
  onChangeFitMode?: (fit: LogoFitMode) => void;
  onClearCurrent: () => void;
  onDeleteFromLibrary?: (logoId: string) => Promise<void> | void;
  onNotify: (msg: string) => void;
}

interface PendingLogoDraft {
  fileName: string;
  dataUrl: string;
  originalDataUrl: string;
  width: number;
  height: number;
  fileSize: number;
  fileType: 'png' | 'jpg' | 'jpeg' | 'webp';
  fitMode: LogoFitMode;
  rotationDeg: number;
  needsCompressionOffer: boolean;
}

export function LogoUploaderControl({
  label,
  slot,
  currentDataUrl,
  currentFitMode = 'contain',
  logos,
  kopTemplates,
  showScopeSelector = false,
  testIdPrefix = 'logo-ctrl',
  onCommitLogo,
  onChangeFitMode,
  onClearCurrent,
  onDeleteFromLibrary,
  onNotify,
}: LogoUploaderControlProps) {
  const [pending, setPending] = useState<PendingLogoDraft | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [confirmDeleteLibId, setConfirmDeleteLibId] = useState<string | null>(null);
  const [applyScope, setApplyScope] = useState<'current' | 'selected' | 'primary'>(
    slot === 'school' ? 'primary' : 'current'
  );
  const [selectedKopIds, setSelectedKopIds] = useState<string[]>([]);
  const [isBusy, setIsBusy] = useState(false);

  const matchingSaved = logos.find((l) => l.dataUrl === currentDataUrl);

  const handleFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadError(null);
    setConfirmClearOpen(false);
    try {
      const prepared = await validateAndReadLogoFile(file);
      setPending({
        fileName: prepared.fileName,
        dataUrl: prepared.dataUrl,
        originalDataUrl: prepared.dataUrl,
        width: prepared.width,
        height: prepared.height,
        fileSize: prepared.fileSize,
        fileType: prepared.fileType,
        fitMode: currentFitMode || 'contain',
        rotationDeg: 0,
        needsCompressionOffer: prepared.needsCompressionOffer,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal membaca berkas logo.';
      setUploadError(msg);
      onNotify(msg);
    }
  };

  const handleCompressPending = async () => {
    if (!pending) return;
    setIsBusy(true);
    try {
      const opt = await optimizeLogoDataUrl(pending.dataUrl, 520, pending.fileType !== 'jpg');
      setPending((prev) =>
        prev
          ? {
              ...prev,
              dataUrl: opt.dataUrl,
              width: opt.width,
              height: opt.height,
              fileSize: opt.fileSize,
              fileType: opt.mimeType === 'image/jpeg' ? 'jpg' : 'png',
              needsCompressionOffer: false,
            }
          : null
      );
      onNotify('Ukuran logo berhasil dikompres ringan dengan rasio tetap terjaga.');
    } catch {
      setUploadError('Gagal mengompres logo.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleSavePending = async () => {
    if (!pending) return;
    setIsBusy(true);
    try {
      const asset = createStoredLogoAsset({
        file_name: pending.fileName,
        dataUrl: pending.dataUrl,
        width: pending.width,
        height: pending.height,
        file_size: pending.fileSize,
        fit_mode: pending.fitMode,
        slot,
        rotation_deg: pending.rotationDeg,
      });
      await onCommitLogo(
        asset,
        applyScope,
        applyScope === 'selected' ? selectedKopIds : undefined
      );
      setPending(null);
      setUploadError(null);
      onNotify(`Logo "${asset.file_name}" berhasil disimpan & diterapkan.`);
    } finally {
      setIsBusy(false);
    }
  };

  const handleOpenCropForExisting = () => {
    if (!currentDataUrl) return;
    setPending({
      fileName: matchingSaved?.file_name || 'logo-aktif.png',
      dataUrl: currentDataUrl,
      originalDataUrl: currentDataUrl,
      width: matchingSaved?.width || 256,
      height: matchingSaved?.height || 256,
      fileSize: matchingSaved?.file_size || 0,
      fileType: matchingSaved?.file_type || 'png',
      fitMode: currentFitMode,
      rotationDeg: matchingSaved?.rotation_deg || 0,
      needsCompressionOffer: false,
    });
    setCropOpen(true);
  };

  return (
    <div className="space-y-2.5 rounded-lg border border-slate-200 bg-slate-50/50 p-3 text-xs dark:border-slate-700 dark:bg-[#0F172A]/60">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold text-slate-800 dark:text-slate-200">{label}</span>
        <span className="rounded bg-slate-200/80 px-1.5 py-0.5 text-[10px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
          PNG (Transparan) / JPG / WEBP
        </span>
      </div>

      {uploadError && (
        <div
          role="alert"
          data-testid={`${testIdPrefix}-error`}
          className="rounded border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/50 dark:text-rose-200"
        >
          {uploadError}
        </div>
      )}

      {/* Active vs Pending Preview Box */}
      {pending ? (
        <div
          data-testid={`${testIdPrefix}-pending-panel`}
          className="space-y-2.5 rounded-lg border border-green-300 bg-white p-2.5 dark:border-green-800 dark:bg-[#1E293B]"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-[#0F172A]">
              <img
                src={pending.dataUrl}
                alt="Pratinjau draf logo"
                className={`h-full w-full ${
                  pending.fitMode === 'cover' ? 'object-cover' : 'object-contain'
                }`}
              />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="truncate font-semibold text-slate-900 dark:text-white">
                {pending.fileName}
              </p>
              <p className="font-mono-tabular text-[10.5px] text-slate-500 dark:text-slate-400">
                {pending.fileType.toUpperCase()} · {formatBytesReadable(pending.fileSize)} ·{' '}
                {pending.width}×{pending.height}px
              </p>
              <div className="flex flex-wrap gap-1 pt-0.5">
                <button
                  type="button"
                  onClick={() => setCropOpen(true)}
                  data-testid={`${testIdPrefix}-btn-crop`}
                  className="inline-flex h-7 items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 text-[10.5px] font-medium text-slate-700 hover:bg-green-50 dark:border-slate-700 dark:bg-[#0F172A] dark:text-slate-200"
                >
                  <Crop className="h-3 w-3" />
                  Crop & Putar
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setPending((p) =>
                      p
                        ? {
                            ...p,
                            dataUrl: p.originalDataUrl,
                            rotationDeg: 0,
                          }
                        : null
                    )
                  }
                  className="inline-flex h-7 items-center gap-1 rounded border border-slate-200 px-2 text-[10.5px] font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                >
                  <RotateCcw className="h-3 w-3" />
                  Reset Asli
                </button>
                {pending.needsCompressionOffer && (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={handleCompressPending}
                    className="inline-flex h-7 items-center gap-1 rounded border border-amber-300 bg-amber-50 px-2 text-[10.5px] font-semibold text-amber-900 hover:bg-amber-100"
                  >
                    <Minimize2 className="h-3 w-3" />
                    Kompres Ringan
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-1.5 border-t border-slate-100 pt-2 dark:border-slate-700">
            <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
              Mode Fit:
            </span>
            <div className="flex items-center gap-1">
              {(
                [
                  ['contain', 'Fit Contain'],
                  ['cover', 'Fit Cover'],
                  ['original', 'Original Ratio'],
                ] as const
              ).map(([mode, lbl]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setPending((p) => (p ? { ...p, fitMode: mode } : null))}
                  className={`rounded px-2 py-0.5 text-[10px] font-medium ${
                    pending.fitMode === mode
                      ? 'bg-green-700 text-white dark:bg-green-600'
                      : 'border border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'
                  }`}
                >
                  {lbl}
                </button>
              ))}
            </div>
          </div>

          {showScopeSelector && (
            <div className="space-y-1.5 border-t border-slate-100 pt-2 text-[11px] dark:border-slate-700">
              <span className="block font-medium text-slate-700 dark:text-slate-300">
                Terapkan Pembaruan Logo Ke:
              </span>
              <div className="grid grid-cols-1 gap-1">
                <label className="flex cursor-pointer items-center gap-1.5">
                  <input
                    type="radio"
                    name={`${testIdPrefix}-scope`}
                    checked={applyScope === 'current'}
                    onChange={() => setApplyScope('current')}
                    className="accent-green-700"
                  />
                  <span>Template / halaman aktif saat ini saja</span>
                </label>
                <label className="flex cursor-pointer items-center gap-1.5">
                  <input
                    type="radio"
                    name={`${testIdPrefix}-scope`}
                    checked={applyScope === 'primary'}
                    onChange={() => setApplyScope('primary')}
                    className="accent-green-700"
                  />
                  <span>Jadikan Logo Utama Sekolah (sinkron ke profil & dokumen utama)</span>
                </label>
                {kopTemplates && kopTemplates.length > 1 && (
                  <label className="flex cursor-pointer items-center gap-1.5">
                    <input
                      type="radio"
                      name={`${testIdPrefix}-scope`}
                      checked={applyScope === 'selected'}
                      onChange={() => setApplyScope('selected')}
                      className="accent-green-700"
                    />
                    <span>Pilih template kop tertentu</span>
                  </label>
                )}
              </div>
              {applyScope === 'selected' && kopTemplates && (
                <div className="max-h-24 space-y-1 overflow-y-auto rounded border border-slate-200 p-1.5 dark:border-slate-700">
                  {kopTemplates.map((tpl) => (
                    <label key={tpl.id} className="flex cursor-pointer items-center gap-1.5 text-[10.5px]">
                      <input
                        type="checkbox"
                        checked={selectedKopIds.includes(tpl.id)}
                        onChange={(e) =>
                          setSelectedKopIds((prev) =>
                            e.target.checked
                              ? [...prev, tpl.id]
                              : prev.filter((id) => id !== tpl.id)
                          )
                        }
                        className="accent-green-700"
                      />
                      <span className="truncate">{tpl.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setPending(null)}
              className="h-8 rounded border border-slate-200 px-2.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={isBusy}
              onClick={handleSavePending}
              data-testid={`${testIdPrefix}-btn-save`}
              className="inline-flex h-8 items-center gap-1 rounded bg-green-700 px-3 text-[11px] font-semibold text-white hover:bg-green-800 disabled:opacity-50 dark:bg-green-600"
            >
              <Save className="h-3 w-3" />
              Simpan Logo
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-[#0F172A]">
            {currentDataUrl ? (
              <img
                src={currentDataUrl}
                alt={`Pratinjau ${label}`}
                data-testid={`${testIdPrefix}-preview-img`}
                className={`h-full w-full ${
                  currentFitMode === 'cover' ? 'object-cover' : 'object-contain'
                }`}
              />
            ) : (
              <ImageIcon className="h-4 w-4 text-slate-400" />
            )}
          </div>

          <div className="min-w-0 flex-1 space-y-1">
            {currentDataUrl ? (
              <>
                <p className="truncate font-medium text-slate-800 dark:text-slate-200">
                  {matchingSaved?.file_name || 'Logo Aktif Terpasang'}
                </p>
                <p className="font-mono-tabular text-[10px] text-slate-500">
                  {matchingSaved
                    ? `${matchingSaved.file_type.toUpperCase()} · ${formatBytesReadable(matchingSaved.file_size)} · ${matchingSaved.width}×${matchingSaved.height}px`
                    : 'Siap diterapkan ke dokumen & pratinjau'}
                </p>
              </>
            ) : (
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Belum ada logo terpasang. Unggah PNG/JPG/WEBP atau pilih dari pustaka.
              </p>
            )}

            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              <label
                data-testid={`${testIdPrefix}-upload-label`}
                className="inline-flex min-h-7 cursor-pointer items-center gap-1 rounded border border-green-300 bg-green-50 px-2.5 text-[11px] font-semibold text-green-800 hover:bg-green-100 dark:border-green-800 dark:bg-green-950/60 dark:text-green-300"
              >
                <Upload className="h-3 w-3" />
                <span>{currentDataUrl ? 'Ganti Logo' : 'Unggah Logo'}</span>
                <input
                  type="file"
                  data-testid={`${testIdPrefix}-file-input`}
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleFilePick}
                  className="sr-only"
                />
              </label>

              {currentDataUrl && (
                <>
                  <button
                    type="button"
                    onClick={handleOpenCropForExisting}
                    className="inline-flex min-h-7 items-center gap-1 rounded border border-slate-200 bg-white px-2 text-[11px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-[#1E293B] dark:text-slate-200"
                  >
                    <Crop className="h-3 w-3" />
                    Crop/Putar
                  </button>

                  {onChangeFitMode && (
                    <select
                      aria-label={`Mode fit ${label}`}
                      value={currentFitMode}
                      onChange={(e) => onChangeFitMode(e.target.value as LogoFitMode)}
                      className="h-7 rounded border border-slate-200 bg-white px-1.5 text-[10.5px] dark:border-slate-700 dark:bg-[#1E293B]"
                    >
                      <option value="contain">Fit Contain</option>
                      <option value="cover">Fit Cover</option>
                      <option value="original">Original Ratio</option>
                    </select>
                  )}

                  {!confirmClearOpen ? (
                    <button
                      type="button"
                      onClick={() => setConfirmClearOpen(true)}
                      data-testid={`${testIdPrefix}-btn-clear`}
                      className="inline-flex min-h-7 items-center gap-1 rounded border border-rose-200 px-2 text-[11px] font-medium text-rose-700 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-300"
                    >
                      <Trash2 className="h-3 w-3" />
                      Hapus
                    </button>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded border border-rose-300 bg-rose-50 px-2 py-0.5 text-[10.5px] dark:border-rose-800 dark:bg-rose-950/60">
                      <span className="text-rose-800 dark:text-rose-200">Lepas logo ini?</span>
                      <button
                        type="button"
                        onClick={() => {
                          onClearCurrent();
                          setConfirmClearOpen(false);
                        }}
                        data-testid={`${testIdPrefix}-btn-confirm-clear`}
                        className="font-bold text-rose-700 underline dark:text-rose-300"
                      >
                        Ya
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmClearOpen(false)}
                        className="text-slate-600 underline dark:text-slate-300"
                      >
                        Batal
                      </button>
                    </span>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Persistent Reusable Logo Library */}
      {logos.length > 0 && !pending && (
        <div className="space-y-1.5 border-t border-slate-200 pt-2 dark:border-slate-700">
          <p className="text-[10.5px] font-semibold text-slate-600 dark:text-slate-300">
            Pustaka Logo Tersimpan ({logos.length}) — klik untuk gunakan kembali:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {logos.map((item) => {
              const isSelected = currentDataUrl === item.dataUrl;
              return (
                <div
                  key={item.logo_id}
                  className={`group relative flex items-center gap-1.5 rounded border px-1.5 py-1 text-[10.5px] ${
                    isSelected
                      ? 'border-green-600 bg-green-50 dark:border-green-500 dark:bg-green-950/40'
                      : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-[#1E293B]'
                  }`}
                >
                  <button
                    type="button"
                    onClick={async () => {
                      await onCommitLogo(item, slot === 'school' ? 'primary' : 'current');
                      onNotify(`Logo "${item.file_name}" diterapkan.`);
                    }}
                    title={`Gunakan ${item.file_name}`}
                    className="flex items-center gap-1.5 text-left"
                  >
                    <img
                      src={item.dataUrl}
                      alt={item.file_name}
                      className="h-6 w-6 rounded object-contain"
                    />
                    <span className="max-w-[90px] truncate font-medium">{item.file_name}</span>
                    {isSelected && <Check className="h-3 w-3 text-green-700 dark:text-green-400" />}
                  </button>

                  {onDeleteFromLibrary && (
                    confirmDeleteLibId === item.logo_id ? (
                      <span className="ml-1 flex items-center gap-1 text-[9.5px]">
                        <button
                          type="button"
                          onClick={async () => {
                            await onDeleteFromLibrary(item.logo_id);
                            setConfirmDeleteLibId(null);
                          }}
                          className="font-bold text-rose-700 underline"
                        >
                          Hapus
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteLibId(null)}
                          className="text-slate-500 underline"
                        >
                          Batal
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        aria-label={`Hapus ${item.file_name} dari pustaka`}
                        onClick={() => setConfirmDeleteLibId(item.logo_id)}
                        className="ml-0.5 rounded p-0.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {pending && (
        <ImageCropModal
          open={cropOpen}
          imageSrc={pending.dataUrl}
          aspectMode="free"
          title={`Sesuaikan & Putar ${label}`}
          outputMime={pending.fileType === 'jpg' ? 'image/jpeg' : 'image/png'}
          showLogoFitControls
          initialFitMode={pending.fitMode}
          onCancel={() => setCropOpen(false)}
          onConfirm={() => {
            setCropOpen(false);
          }}
          onConfirmWithMeta={(res) => {
            setPending((prev) =>
              prev
                ? {
                    ...prev,
                    dataUrl: res.dataUrl,
                    fitMode: res.fitMode,
                    rotationDeg: res.rotationDeg,
                    width: res.width,
                    height: res.height,
                  }
                : null
            );
            setCropOpen(false);
          }}
        />
      )}
    </div>
  );
}
