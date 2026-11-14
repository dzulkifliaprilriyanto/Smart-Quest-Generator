import type {
  ImageAspectRatio,
  QuestionImage,
  QuestionImageConfig,
  QuestionImageHistoryEntry,
  QuestionItem,
  StructuredVisualPrompt,
  VisualNecessity,
  VisualValidationReport,
} from '../types/question.ts';
import { computeQuestionSnapshotHash } from './imageQuota.ts';

export function getAspectDimensions(ratio: ImageAspectRatio): {
  width: number;
  height: number;
} {
  switch (ratio) {
    case '1:1':
      return { width: 640, height: 640 };
    case '3:2':
      return { width: 750, height: 500 };
    case '16:9':
      return { width: 800, height: 450 };
    case 'Portrait':
      return { width: 540, height: 720 };
    case '4:3':
    default:
      return { width: 800, height: 600 };
  }
}

export async function svgMarkupToPngDataUrl(
  svgMarkup: string,
  width: number,
  height: number
): Promise<{ dataUrl: string; sizeBytes: number; format: 'png' | 'svg'; rendered: boolean }> {
  const scale = 2;
  const targetW = width * scale;
  const targetH = height * scale;

  try {
    const svgBlob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    const pngDataUrl = await new Promise<string>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = targetW;
          canvas.height = targetH;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Canvas context unavailable'));
            return;
          }
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, targetW, targetH);
          ctx.drawImage(img, 0, 0, targetW, targetH);
          const out = canvas.toDataURL('image/png');
          resolve(out);
        } catch (err) {
          reject(err);
        } finally {
          URL.revokeObjectURL(url);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('SVG render failed'));
      };
      img.src = url;
    });

    const base64Part = pngDataUrl.split(',')[1] ?? '';
    const approxBytes = Math.round((base64Part.length * 3) / 4);
    return { dataUrl: pngDataUrl, sizeBytes: approxBytes, format: 'png', rendered: true };
  } catch {
    const encoded = btoa(unescape(encodeURIComponent(svgMarkup)));
    return {
      dataUrl: `data:image/svg+xml;base64,${encoded}`,
      sizeBytes: svgMarkup.length,
      format: 'svg',
      rendered: false,
    };
  }
}

export function archiveImageToHistory(
  existing: QuestionImage | undefined
): QuestionImageHistoryEntry[] {
  if (!existing) return [];
  const prevHistory = existing.history ?? [];
  const entry: QuestionImageHistoryEntry = {
    id: existing.id,
    fileName: existing.fileName,
    format: existing.format,
    mimeType: existing.mimeType,
    sizeBytes: existing.sizeBytes,
    width: existing.width,
    height: existing.height,
    source: existing.source,
    dataUrl: existing.dataUrl,
    caption: existing.caption,
    createdAt: existing.createdAt,
    approvalStatus: existing.approvalStatus,
    analysisSummary: existing.analysisSummary,
  };
  return [entry, ...prevHistory].slice(0, 4);
}

export async function readUploadedQuestionImage(
  file: File,
  question: QuestionItem,
  questionNumber: number
): Promise<QuestionImage> {
  const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
  if (!allowed.includes(file.type)) {
    throw new Error('Format gambar harus PNG, JPG/JPEG, atau WEBP.');
  }
  if (file.size > 3_000_000) {
    throw new Error('Ukuran gambar maksimal 3 MB agar ekspor Word/PDF tetap optimal.');
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Gagal membaca berkas gambar.'));
    reader.readAsDataURL(file);
  });

  const dims = await new Promise<{ width: number; height: number; valid: boolean }>((resolve) => {
    const img = new Image();
    img.onload = () =>
      resolve({
        width: img.naturalWidth || 800,
        height: img.naturalHeight || 600,
        valid: img.naturalWidth > 0 && img.naturalHeight > 0,
      });
    img.onerror = () => resolve({ width: 800, height: 600, valid: false });
    img.src = dataUrl;
  });

  if (!dims.valid) {
    throw new Error('Berkas gambar rusak atau tidak dapat dibuka.');
  }

  const ext =
    file.type === 'image/webp'
      ? 'webp'
      : file.type === 'image/jpeg' || file.type === 'image/jpg'
        ? 'jpg'
        : 'png';

  const validationReport: VisualValidationReport = {
    semanticStatus: 'warning',
    semanticScore: 80,
    semanticNotes: [
      'Diunggah manual oleh pendidik — pastikan objek pada gambar sesuai dengan teks pertanyaan.',
    ],
    technicalStatus: 'passed',
    technicalChecks: [
      `Format ${ext.toUpperCase()} valid (${dims.width}×${dims.height} px)`,
      'Ukuran berkas aman untuk cetak & ekspor DOCX/PDF',
    ],
  };

  return {
    id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    questionId: question.id,
    fileName: file.name || `soal-${questionNumber}.${ext}`,
    format: ext,
    mimeType: file.type === 'image/jpg' ? 'image/jpeg' : file.type,
    sizeBytes: file.size,
    width: dims.width,
    height: dims.height,
    source: 'upload',
    dataUrl,
    caption: `Gambar pendukung Soal ${questionNumber}`,
    placement: question.supportingImage?.placement ?? 'before',
    displaySize: question.supportingImage?.displaySize ?? 'medium',
    approvalStatus: 'approved',
    needsQuestionSyncReview: false,
    questionSnapshotHash: computeQuestionSnapshotHash(question),
    validationReport,
    history: archiveImageToHistory(question.supportingImage),
    createdAt: new Date().toISOString(),
  };
}

export interface AiVisualRequestResult {
  status: 'generated' | 'skipped_not_required';
  image?: QuestionImage;
  visualNecessity: VisualNecessity;
  analysisSummary: string;
  structuredPrompt?: StructuredVisualPrompt;
}

export async function requestAiQuestionVisual(params: {
  question: QuestionItem;
  subject: string;
  educationLevel: string;
  grade: string;
  topic: string;
  additionalNotes?: string;
  customEditInstruction?: string;
  forceOverride?: boolean;
  config: QuestionImageConfig;
}): Promise<AiVisualRequestResult> {
  const res = await fetch('/api/generate-question-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      questionId: params.question.id,
      questionNumber: params.question.number,
      questionText: params.question.questionText,
      stimulus: params.question.stimulus ?? '',
      material: params.question.material ?? params.topic,
      learningObjective: params.question.learningObjective ?? '',
      indicator: params.question.indicator ?? '',
      options: params.question.options ?? [],
      correctAnswer: params.question.correctAnswer ?? '',
      subject: params.subject,
      educationLevel: params.educationLevel,
      grade: params.grade,
      topic: params.topic,
      additionalNotes: params.additionalNotes ?? '',
      customEditInstruction: params.customEditInstruction ?? '',
      forceOverride: Boolean(params.forceOverride),
      ...params.config,
    }),
  });

  const data = (await res.json()) as {
    skippedByNecessity?: boolean;
    visualNecessity?: VisualNecessity;
    structuredPrompt?: StructuredVisualPrompt;
    validationReport?: VisualValidationReport;
    svgMarkup?: string;
    caption?: string;
    analysisSummary?: string;
    width?: number;
    height?: number;
    regenerationAttempts?: number;
    error?: string;
  };

  if (!res.ok) {
    throw new Error(data.error || 'Gagal menghasilkan gambar pendukung soal.');
  }

  if (data.skippedByNecessity) {
    return {
      status: 'skipped_not_required',
      visualNecessity: data.visualNecessity ?? 'NOT REQUIRED',
      analysisSummary:
        data.analysisSummary ||
        'Pertanyaan ini sudah jelas secara tekstual dan tidak memerlukan gambar pendukung.',
      structuredPrompt: data.structuredPrompt,
    };
  }

  if (!data.svgMarkup) {
    throw new Error(data.error || 'Server tidak mengembalikan visual SVG yang valid.');
  }

  const dims = getAspectDimensions(params.config.aspectRatio);
  const w = data.width || dims.width;
  const h = data.height || dims.height;
  const converted = await svgMarkupToPngDataUrl(data.svgMarkup, w, h);

  const mergedValidation: VisualValidationReport = {
    semanticStatus: data.validationReport?.semanticStatus ?? 'passed',
    semanticScore: data.validationReport?.semanticScore ?? 88,
    semanticNotes: data.validationReport?.semanticNotes ?? [
      'Visual disusun berdasarkan konteks lengkap soal.',
    ],
    technicalStatus: converted.sizeBytes > 0 ? 'passed' : 'failed',
    technicalChecks: [
      ...(data.validationReport?.technicalChecks ?? []),
      converted.rendered
        ? `Rasterisasi PNG 2× berhasil (${w}×${h} · ${Math.max(1, Math.round(converted.sizeBytes / 1024))} KB)`
        : 'Tersimpan sebagai SVG terstruktur',
    ],
  };

  const existing = params.question.supportingImage;

  const image: QuestionImage = {
    id: `img-ai-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    questionId: params.question.id,
    fileName: `visual-soal-${params.question.number}.${converted.format}`,
    format: converted.format,
    mimeType: converted.format === 'png' ? 'image/png' : 'image/svg+xml',
    sizeBytes: converted.sizeBytes,
    width: w,
    height: h,
    source: 'ai',
    dataUrl: converted.dataUrl,
    caption: data.caption || `Ilustrasi Soal ${params.question.number}`,
    placement: existing?.placement ?? 'before',
    displaySize: existing?.displaySize ?? 'medium',
    ...params.config,
    analysisSummary: data.analysisSummary,
    visualNecessity: data.visualNecessity ?? 'REQUIRED',
    structuredPrompt: data.structuredPrompt,
    validationReport: mergedValidation,
    approvalStatus:
      mergedValidation.semanticStatus === 'failed' ? 'needs_revision' : 'pending_review',
    needsQuestionSyncReview: false,
    questionSnapshotHash: computeQuestionSnapshotHash(params.question),
    regenerationCount:
      (existing?.regenerationCount ?? 0) + (data.regenerationAttempts ? 1 : 0),
    customEditInstruction: params.customEditInstruction || undefined,
    history: archiveImageToHistory(existing),
    createdAt: new Date().toISOString(),
  };

  return {
    status: 'generated',
    image,
    visualNecessity: image.visualNecessity ?? 'REQUIRED',
    analysisSummary: data.analysisSummary ?? '',
    structuredPrompt: data.structuredPrompt,
  };
}
