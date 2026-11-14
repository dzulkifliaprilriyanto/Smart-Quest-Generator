import { useEffect, useRef, useState } from 'react';
import { Check, Crop, RotateCcw, RotateCw, X, ZoomIn } from 'lucide-react';
import type { LogoFitMode } from '../types/question';

interface ImageCropModalProps {
  open: boolean;
  imageSrc: string;
  aspectMode: '3:4' | '1:1' | 'free';
  title?: string;
  outputMime?: 'image/png' | 'image/jpeg';
  showLogoFitControls?: boolean;
  initialFitMode?: LogoFitMode;
  onCancel: () => void;
  onConfirm: (croppedDataUrl: string) => void;
  onConfirmWithMeta?: (result: {
    dataUrl: string;
    fitMode: LogoFitMode;
    rotationDeg: number;
    width: number;
    height: number;
  }) => void;
}

export function ImageCropModal({
  open,
  imageSrc,
  aspectMode,
  title = 'Sesuaikan & Potong Gambar',
  outputMime = 'image/png',
  showLogoFitControls = false,
  initialFitMode = 'contain',
  onCancel,
  onConfirm,
  onConfirmWithMeta,
}: ImageCropModalProps) {
  const [imgEl, setImgEl] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [rotationDeg, setRotationDeg] = useState(0);
  const [fitMode, setFitMode] = useState<LogoFitMode>(initialFitMode);
  const draggingRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    if (!open || !imageSrc) return;
    let active = true;
    const img = new Image();
    img.onload = () => {
      if (!active) return;
      setImgEl(img);
      setZoom(1);
      setOffsetX(0);
      setOffsetY(0);
      setRotationDeg(0);
      setFitMode(initialFitMode);
    };
    img.src = imageSrc;
    return () => {
      active = false;
    };
  }, [open, imageSrc, initialFitMode]);

  if (!open) return null;

  const isQuarterRotated = rotationDeg % 180 !== 0;
  const effectiveNatW = imgEl ? (isQuarterRotated ? imgEl.naturalHeight : imgEl.naturalWidth) : 240;
  const effectiveNatH = imgEl ? (isQuarterRotated ? imgEl.naturalWidth : imgEl.naturalHeight) : 200;

  const frameW = aspectMode === '3:4' ? 210 : 240;
  const frameH =
    aspectMode === '3:4'
      ? 280
      : aspectMode === '1:1'
        ? 240
        : imgEl
          ? Math.max(
              140,
              Math.min(280, Math.round(240 * (effectiveNatH / Math.max(1, effectiveNatW))))
            )
          : 200;

  const handleConfirm = () => {
    if (!imgEl) {
      onConfirm(imageSrc);
      onConfirmWithMeta?.({
        dataUrl: imageSrc,
        fitMode,
        rotationDeg,
        width: frameW,
        height: frameH,
      });
      return;
    }

    const outW = aspectMode === '3:4' ? 300 : aspectMode === '1:1' ? 320 : 400;
    const outH = Math.round(outW * (frameH / frameW));
    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      onConfirm(imageSrc);
      return;
    }

    if (outputMime === 'image/jpeg') {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, outW, outH);
    }

    const imgRatio = effectiveNatW / Math.max(1, effectiveNatH);
    const boxRatio = outW / outH;
    let baseW = outW;
    let baseH = outH;

    // Fit Contain / Original preserves entire logo inside box without cropping edges
    if (showLogoFitControls && fitMode !== 'cover') {
      if (imgRatio > boxRatio) {
        baseW = outW;
        baseH = outW / imgRatio;
      } else {
        baseH = outH;
        baseW = outH * imgRatio;
      }
    } else {
      if (imgRatio > boxRatio) {
        baseH = outH;
        baseW = outH * imgRatio;
      } else {
        baseW = outW;
        baseH = outW / imgRatio;
      }
    }

    const drawW = baseW * zoom;
    const drawH = baseH * zoom;
    const centerX = outW / 2 + (offsetX / 100) * outW;
    const centerY = outH / 2 + (offsetY / 100) * outH;

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate((rotationDeg * Math.PI) / 180);
    const unrotatedW = isQuarterRotated ? drawH : drawW;
    const unrotatedH = isQuarterRotated ? drawW : drawH;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(imgEl, -unrotatedW / 2, -unrotatedH / 2, unrotatedW, unrotatedH);
    ctx.restore();

    const result =
      outputMime === 'image/jpeg'
        ? canvas.toDataURL('image/jpeg', 0.9)
        : canvas.toDataURL('image/png');
    onConfirm(result);
    onConfirmWithMeta?.({
      dataUrl: result,
      fitMode,
      rotationDeg,
      width: outW,
      height: outH,
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/75 p-4"
    >
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-[#1E293B]">
        <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2.5 dark:border-slate-700">
          <h3 className="font-display flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
            <Crop className="h-4 w-4 text-green-700 dark:text-green-400" />
            {title}
          </h3>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Tutup pemotong gambar"
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col items-center">
          <div
            className="relative flex cursor-move items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-green-600 bg-slate-100 select-none dark:bg-[#0F172A]"
            style={{ width: `${frameW}px`, height: `${frameH}px` }}
            onMouseDown={(e) => {
              draggingRef.current = {
                x: e.clientX,
                y: e.clientY,
                ox: offsetX,
                oy: offsetY,
              };
            }}
            onMouseMove={(e) => {
              if (!draggingRef.current) return;
              const dxPct = ((e.clientX - draggingRef.current.x) / frameW) * 100;
              const dyPct = ((e.clientY - draggingRef.current.y) / frameH) * 100;
              setOffsetX(Math.max(-60, Math.min(60, Math.round(draggingRef.current.ox + dxPct))));
              setOffsetY(Math.max(-60, Math.min(60, Math.round(draggingRef.current.oy + dyPct))));
            }}
            onMouseUp={() => {
              draggingRef.current = null;
            }}
            onMouseLeave={() => {
              draggingRef.current = null;
            }}
          >
            {imgEl && (
              <img
                src={imageSrc}
                alt="Pratinjau crop"
                draggable={false}
                className="pointer-events-none max-h-full max-w-full"
                style={{
                  objectFit: showLogoFitControls && fitMode !== 'cover' ? 'contain' : 'cover',
                  width:
                    showLogoFitControls && fitMode !== 'cover'
                      ? '100%'
                      : imgEl.naturalWidth / Math.max(1, imgEl.naturalHeight) > frameW / frameH
                        ? 'auto'
                        : '100%',
                  height:
                    showLogoFitControls && fitMode !== 'cover'
                      ? '100%'
                      : imgEl.naturalWidth / Math.max(1, imgEl.naturalHeight) > frameW / frameH
                        ? '100%'
                        : 'auto',
                  transform: `translate(${offsetX}%, ${offsetY}%) rotate(${rotationDeg}deg) scale(${zoom})`,
                  transformOrigin: 'center center',
                }}
              />
            )}
          </div>
          <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
            Rasio {aspectMode === '3:4' ? '3:4 (Pas Foto)' : aspectMode === '1:1' ? '1:1 (Persegi)' : 'Proporsional'} · Seret untuk memposisikan
          </p>
        </div>

        <div className="mt-4 space-y-2.5 text-xs">
          {showLogoFitControls && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 dark:border-slate-700 dark:bg-[#0F172A]">
              <span className="font-medium text-slate-700 dark:text-slate-300">Mode Fit:</span>
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
                    onClick={() => setFitMode(mode)}
                    className={`rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                      fitMode === mode
                        ? 'bg-green-700 text-white dark:bg-green-600'
                        : 'bg-white text-slate-600 hover:bg-slate-100 dark:bg-[#1E293B] dark:text-slate-300'
                    }`}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            <span className="flex w-20 items-center gap-1 font-medium text-slate-700 dark:text-slate-300">
              <ZoomIn className="h-3.5 w-3.5" /> Zoom
            </span>
            <input
              type="range"
              min={0.6}
              max={2.6}
              step={0.05}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-full accent-green-700"
            />
            <span className="font-mono-tabular w-10 text-right">{zoom.toFixed(1)}×</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="w-20 font-medium text-slate-700 dark:text-slate-300">Geser X</span>
            <input
              type="range"
              min={-50}
              max={50}
              value={offsetX}
              onChange={(e) => setOffsetX(Number(e.target.value))}
              className="w-full accent-green-700"
            />
            <span className="font-mono-tabular w-10 text-right">{offsetX}%</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="w-20 font-medium text-slate-700 dark:text-slate-300">Geser Y</span>
            <input
              type="range"
              min={-50}
              max={50}
              value={offsetY}
              onChange={(e) => setOffsetY(Number(e.target.value))}
              className="w-full accent-green-700"
            />
            <span className="font-mono-tabular w-10 text-right">{offsetY}%</span>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-700">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setRotationDeg((r) => (r + 90) % 360)}
              data-testid="btn-rotate-crop-90"
              className="inline-flex min-h-8 items-center gap-1 rounded border border-slate-200 px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
            >
              <RotateCw className="h-3 w-3" />
              Putar 90° {rotationDeg > 0 ? `(${rotationDeg}°)` : ''}
            </button>
            <button
              type="button"
              onClick={() => {
                setZoom(1);
                setOffsetX(0);
                setOffsetY(0);
                setRotationDeg(0);
                setFitMode(initialFitMode);
              }}
              className="inline-flex min-h-8 items-center gap-1 rounded border border-slate-200 px-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
            >
              <RotateCcw className="h-3 w-3" />
              Reset
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="min-h-8 rounded border border-slate-200 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              data-testid="btn-confirm-crop"
              className="inline-flex min-h-8 items-center gap-1.5 rounded bg-green-700 px-3.5 text-xs font-semibold text-white hover:bg-green-800 dark:bg-green-600"
            >
              <Check className="h-3.5 w-3.5" />
              Terapkan Gambar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
