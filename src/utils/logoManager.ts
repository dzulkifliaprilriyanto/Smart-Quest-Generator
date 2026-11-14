import type {
  ExamCardConfig,
  GeneratorParams,
  KopTemplate,
  LogoFitMode,
  LogoSlot,
  StoredLogoAsset,
} from '../types/question.ts';

export const MAX_LOGO_UPLOAD_BYTES = 2 * 1024 * 1024; // 2 MB raw file safety ceiling
export const RECOMMENDED_LOGO_BYTES = 350 * 1024; // 350 KB lightweight threshold

export const LEGACY_DEFAULT_SCHOOL = 'UPT SD NEGERI RANDUSARI';
export const LEGACY_DEFAULT_TEACHER = 'LILIN ANNISA PUTRI S., S.Pd.';
export const LEGACY_DEFAULT_PLACE = 'Randusari';

export type DetectedLogoFormat = 'png' | 'jpg' | 'webp';

export interface LogoValidationResult {
  valid: boolean;
  detectedFormat?: DetectedLogoFormat;
  mimeType?: string;
  error?: string;
}

/**
 * Inspects actual file header magic bytes (not just filename extension)
 * to validate PNG, JPEG/JPG, and WEBP image files.
 */
export function detectLogoMagicBytes(bytes: Uint8Array): LogoValidationResult {
  if (!bytes || bytes.length < 12) {
    return {
      valid: false,
      error: 'Berkas terlalu kecil atau rusak untuk dibaca sebagai gambar logo.',
    };
  }

  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return { valid: true, detectedFormat: 'png', mimeType: 'image/png' };
  }

  // JPEG signature: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { valid: true, detectedFormat: 'jpg', mimeType: 'image/jpeg' };
  }

  // WEBP signature: "RIFF" (0..3) + "WEBP" (8..11)
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return { valid: true, detectedFormat: 'webp', mimeType: 'image/webp' };
  }

  return {
    valid: false,
    error: 'Format file tidak didukung. Gunakan file asli berformat PNG, JPG, JPEG, atau WEBP.',
  };
}

/**
 * Parses intrinsic pixel dimensions from raw PNG, JPEG, or WEBP bytes without needing DOM.
 */
export function extractImageDimensionsFromBytes(
  bytes: Uint8Array
): { width: number; height: number } | null {
  if (!bytes || bytes.length < 16) return null;

  // PNG IHDR chunk starts at byte 16..23
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes.length >= 24
  ) {
    const width =
      ((bytes[16]! << 24) | (bytes[17]! << 16) | (bytes[18]! << 8) | bytes[19]!) >>> 0;
    const height =
      ((bytes[20]! << 24) | (bytes[21]! << 16) | (bytes[22]! << 8) | bytes[23]!) >>> 0;
    if (width > 0 && height > 0) return { width, height };
  }

  // JPEG SOF0 / SOF2 markers
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = bytes[offset + 1]!;
      if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
        const height = (bytes[offset + 5]! << 8) | bytes[offset + 6]!;
        const width = (bytes[offset + 7]! << 8) | bytes[offset + 8]!;
        if (width > 0 && height > 0) return { width, height };
        break;
      }
      if (marker === 0xd8 || marker === 0xd9 || marker === 0x01) {
        offset += 2;
        continue;
      }
      const segLen = (bytes[offset + 2]! << 8) | bytes[offset + 3]!;
      if (segLen < 2) break;
      offset += 2 + segLen;
    }
  }

  // WEBP VP8X / VP8 / VP8L basic dimensions
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes.length >= 30 &&
    bytes[12] === 0x56 &&
    bytes[13] === 0x50 &&
    bytes[14] === 0x38
  ) {
    // VP8X (extended)
    if (bytes[15] === 0x58) {
      const w = 1 + (bytes[24]! | (bytes[25]! << 8) | (bytes[26]! << 16));
      const h = 1 + (bytes[27]! | (bytes[28]! << 8) | (bytes[29]! << 16));
      if (w > 0 && h > 0) return { width: w, height: h };
    }
    // VP8 (lossy)
    if (bytes[15] === 0x20 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
      const w = ((bytes[26]! | (bytes[27]! << 8)) & 0x3fff) >>> 0;
      const h = ((bytes[28]! | (bytes[29]! << 8)) & 0x3fff) >>> 0;
      if (w > 0 && h > 0) return { width: w, height: h };
    }
    // VP8L (lossless)
    if (bytes[15] === 0x4c && bytes[20] === 0x2f) {
      const b1 = bytes[21]!;
      const b2 = bytes[22]!;
      const b3 = bytes[23]!;
      const b4 = bytes[24]!;
      const bits = b1 | (b2 << 8) | (b3 << 16) | (b4 << 24);
      const w = (bits & 0x3fff) + 1;
      const h = ((bits >> 14) & 0x3fff) + 1;
      if (w > 0 && h > 0) return { width: w, height: h };
    }
  }

  return null;
}

export function extractDimensionsFromDataUrl(
  dataUrl: string
): { width: number; height: number } | null {
  try {
    const commaIdx = dataUrl.indexOf(',');
    if (commaIdx === -1) return null;
    const base64 = dataUrl.slice(commaIdx + 1);
    const bin = atob(base64.slice(0, 256));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) {
      bytes[i] = bin.charCodeAt(i);
    }
    return extractImageDimensionsFromBytes(bytes);
  } catch {
    return null;
  }
}

/**
 * Fits an image proportionally into a bounding box (e.g., mm or px) without stretching.
 */
export function fitImageBoxDimensions(
  naturalW: number,
  naturalH: number,
  maxBoxW: number,
  maxBoxH: number,
  fitMode: LogoFitMode = 'contain'
): { width: number; height: number } {
  if (!naturalW || !naturalH || naturalW <= 0 || naturalH <= 0) {
    return { width: maxBoxW, height: maxBoxH };
  }
  if (fitMode === 'cover') {
    return { width: maxBoxW, height: maxBoxH };
  }
  const imgRatio = naturalW / naturalH;
  const boxRatio = maxBoxW / Math.max(0.01, maxBoxH);
  if (imgRatio >= boxRatio) {
    const width = maxBoxW;
    const height = Math.round((width / imgRatio) * 100) / 100;
    return { width, height };
  }
  const height = maxBoxH;
  const width = Math.round(height * imgRatio * 100) / 100;
  return { width, height };
}

export function formatBytesReadable(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function estimateDataUrlBytes(dataUrl: string): number {
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx === -1) return 0;
  const base64 = dataUrl.slice(commaIdx + 1);
  return Math.floor((base64.length * 3) / 4);
}

export function detectFileTypeFromDataUrl(
  dataUrl: string
): 'png' | 'jpg' | 'jpeg' | 'webp' {
  if (dataUrl.startsWith('data:image/jpeg') || dataUrl.startsWith('data:image/jpg')) {
    return 'jpg';
  }
  if (dataUrl.startsWith('data:image/webp')) {
    return 'webp';
  }
  return 'png';
}

export interface PreparedLogoFile {
  fileName: string;
  fileType: 'png' | 'jpg' | 'jpeg' | 'webp';
  mimeType: string;
  fileSize: number;
  width: number;
  height: number;
  dataUrl: string;
  needsCompressionOffer: boolean;
}

export async function validateAndReadLogoFile(file: File): Promise<PreparedLogoFile> {
  if (!file) {
    throw new Error('Tidak ada berkas logo yang dipilih.');
  }
  if (file.size === 0) {
    throw new Error('Berkas gambar kosong (0 byte). Pilih gambar lain yang valid.');
  }
  if (file.size > MAX_LOGO_UPLOAD_BYTES) {
    throw new Error(
      `Ukuran berkas (${formatBytesReadable(file.size)}) melebihi batas maksimal 2.00 MB.`
    );
  }

  const headSlice = await file.slice(0, 64).arrayBuffer();
  const magic = detectLogoMagicBytes(new Uint8Array(headSlice));
  if (!magic.valid || !magic.detectedFormat || !magic.mimeType) {
    throw new Error(
      magic.error || 'Format gambar tidak valid. Gunakan PNG, JPG, JPEG, atau WEBP.'
    );
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Gagal membaca berkas logo.'));
      }
    };
    reader.onerror = () => reject(new Error('Berkas logo tidak dapat dibaca.'));
    reader.readAsDataURL(file);
  });

  const dims = await measureImageElementDimensions(dataUrl);
  const fullBytes = new Uint8Array(await file.arrayBuffer());
  const headerDims = extractImageDimensionsFromBytes(fullBytes);
  const width = dims?.width || headerDims?.width || 256;
  const height = dims?.height || headerDims?.height || 256;

  return {
    fileName: file.name || `logo.${magic.detectedFormat}`,
    fileType: magic.detectedFormat,
    mimeType: magic.mimeType,
    fileSize: file.size,
    width,
    height,
    dataUrl,
    needsCompressionOffer: file.size > RECOMMENDED_LOGO_BYTES || width > 1200 || height > 1200,
  };
}

export function measureImageElementDimensions(
  src: string
): Promise<{ width: number; height: number } | null> {
  if (typeof Image === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/**
 * Resizes & optimizes a logo while strictly preserving aspect ratio and PNG alpha transparency.
 */
export async function optimizeLogoDataUrl(
  dataUrl: string,
  maxSidePx = 560,
  preferPng = true
): Promise<{ dataUrl: string; width: number; height: number; fileSize: number; mimeType: string }> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Gagal memuat gambar untuk optimalisasi.'));
    el.src = dataUrl;
  });

  const srcW = Math.max(1, img.naturalWidth);
  const srcH = Math.max(1, img.naturalHeight);
  const scale = Math.min(1, maxSidePx / Math.max(srcW, srcH));
  const outW = Math.max(1, Math.round(srcW * scale));
  const outH = Math.max(1, Math.round(srcH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Konteks kanvas tidak tersedia.');
  }

  const keepPng =
    preferPng || dataUrl.startsWith('data:image/png') || dataUrl.startsWith('data:image/webp');
  if (!keepPng) {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, outW, outH);
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, outW, outH);

  const mimeType = keepPng ? 'image/png' : 'image/jpeg';
  const resultUrl = keepPng ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.88);
  return {
    dataUrl: resultUrl,
    width: outW,
    height: outH,
    fileSize: estimateDataUrlBytes(resultUrl),
    mimeType,
  };
}

export function createStoredLogoAsset(input: {
  logo_id?: string;
  file_name: string;
  dataUrl: string;
  width?: number;
  height?: number;
  file_size?: number;
  fit_mode?: LogoFitMode;
  slot?: LogoSlot;
  rotation_deg?: number;
  uploaded_at?: string;
}): StoredLogoAsset {
  const now = new Date().toISOString();
  const fileType = detectFileTypeFromDataUrl(input.dataUrl);
  const mimeType =
    fileType === 'jpg' || fileType === 'jpeg'
      ? 'image/jpeg'
      : fileType === 'webp'
        ? 'image/webp'
        : 'image/png';
  return {
    logo_id: input.logo_id || `logo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    file_name: input.file_name || `logo-sekolah.${fileType}`,
    file_type: fileType,
    mime_type: mimeType,
    file_size: input.file_size ?? estimateDataUrlBytes(input.dataUrl),
    width: input.width || 256,
    height: input.height || 256,
    fit_mode: input.fit_mode ?? 'contain',
    slot: input.slot ?? 'school',
    rotation_deg: input.rotation_deg ?? 0,
    dataUrl: input.dataUrl,
    uploaded_at: input.uploaded_at || now,
    updated_at: now,
  };
}

/**
 * Non-destructive legacy default cleanup:
 * Clears ONLY exact legacy pre-filled values ('UPT SD NEGERI RANDUSARI',
 * 'LILIN ANNISA PUTRI S., S.Pd.', 'Randusari') while keeping any user-entered custom values.
 */
export function isLegacyDefaultSchool(value?: string): boolean {
  return (value ?? '').trim().toUpperCase() === LEGACY_DEFAULT_SCHOOL;
}

export function isLegacyDefaultTeacher(value?: string): boolean {
  return (value ?? '').trim().toUpperCase() === LEGACY_DEFAULT_TEACHER.toUpperCase();
}

export function isLegacyDefaultPlace(value?: string): boolean {
  return (value ?? '').trim().toLowerCase() === LEGACY_DEFAULT_PLACE.toLowerCase();
}

export function scrubLegacyParamsDefaults(params: GeneratorParams): {
  cleaned: GeneratorParams;
  changed: boolean;
} {
  let changed = false;
  const docId = { ...(params.docIdentity ?? {}) };
  let schoolName = params.schoolName ?? '';

  if (isLegacyDefaultSchool(schoolName)) {
    schoolName = '';
    changed = true;
  }
  if (isLegacyDefaultSchool(docId.schoolName)) {
    docId.schoolName = '';
    changed = true;
  }
  if (isLegacyDefaultTeacher(docId.teacherName)) {
    docId.teacherName = '';
    changed = true;
  }
  if (isLegacyDefaultSchool(docId.teacherUnit)) {
    docId.teacherUnit = '';
    changed = true;
  }

  return {
    changed,
    cleaned: {
      ...params,
      schoolName,
      docIdentity: docId,
    },
  };
}

export function scrubLegacyKopTemplatesDefaults(templates: KopTemplate[]): {
  cleaned: KopTemplate[];
  changed: boolean;
} {
  let changed = false;
  const cleaned = templates.map((tpl) => {
    if (isLegacyDefaultSchool(tpl.schoolName)) {
      changed = true;
      return { ...tpl, schoolName: '' };
    }
    return tpl;
  });
  return { cleaned, changed };
}

export function scrubLegacyExamCardConfigDefaults(cfg: ExamCardConfig): {
  cleaned: ExamCardConfig;
  changed: boolean;
} {
  let changed = false;
  let next = cfg;
  if (isLegacyDefaultPlace(cfg.issuePlace)) {
    next = { ...next, issuePlace: '' };
    changed = true;
  }
  return { cleaned: next, changed };
}
