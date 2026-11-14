import type {
  QuestionImageType,
  QuestionItem,
  VisualNecessity,
} from '../types/question.ts';

export const MAX_QUESTIONS_LIMIT = 50;
export const MIN_QUESTIONS_LIMIT = 1;
export const MAX_IMAGE_QUOTA_RATIO = 0.3;

/**
 * Computes maximum allowed questions with supporting images under the strict 30% rule:
 * Math.floor(totalQuestions * 0.30)
 * Table: 1->0, 5->1, 10->3, 15->4, 20->6, 25->7, 30->9, 35->10, 40->12, 45->13, 50->15
 */
export function calculateMaxImagedQuestions(totalQuestions: number): number {
  if (!Number.isFinite(totalQuestions) || totalQuestions <= 0) return 0;
  const clamped = Math.min(MAX_QUESTIONS_LIMIT, Math.round(totalQuestions));
  return Math.floor(clamped * MAX_IMAGE_QUOTA_RATIO);
}

/**
 * Counts how many distinct questions currently have a supporting image.
 * One question counts as 1 imaged question regardless of revision history.
 */
export function countImagedQuestions(questions: QuestionItem[]): number {
  return questions.filter((q) => Boolean(q.supportingImage?.dataUrl)).length;
}

export interface ImageQuotaStatus {
  totalQuestions: number;
  imagedCount: number;
  maxAllowed: number;
  remaining: number;
  nonImagedCount: number;
  imagedPercent: number;
  nonImagedPercent: number;
  isExceeded: boolean;
}

export function getImageQuotaStatus(questions: QuestionItem[]): ImageQuotaStatus {
  const totalQuestions = questions.length;
  const imagedCount = countImagedQuestions(questions);
  const maxAllowed = calculateMaxImagedQuestions(totalQuestions);
  const remaining = Math.max(0, maxAllowed - imagedCount);
  const nonImagedCount = Math.max(0, totalQuestions - imagedCount);
  const imagedPercent =
    totalQuestions > 0 ? Math.round((imagedCount / totalQuestions) * 100) : 0;
  const nonImagedPercent = totalQuestions > 0 ? 100 - imagedPercent : 100;

  return {
    totalQuestions,
    imagedCount,
    maxAllowed,
    remaining,
    nonImagedCount,
    imagedPercent,
    nonImagedPercent,
    isExceeded: imagedCount > maxAllowed,
  };
}

export function canAddImageToQuestion(
  questions: QuestionItem[],
  targetQuestionId: string
): { allowed: boolean; status: ImageQuotaStatus; reason?: string } {
  const status = getImageQuotaStatus(questions);
  const target = questions.find((q) => q.id === targetQuestionId);
  const alreadyHasImage = Boolean(target?.supportingImage?.dataUrl);

  if (alreadyHasImage && !status.isExceeded) {
    return { allowed: true, status };
  }

  if (status.maxAllowed === 0) {
    return {
      allowed: false,
      status,
      reason: `Kuota gambar maksimal 30% untuk ${status.totalQuestions} soal adalah 0 gambar (minimal 4 soal untuk menyertakan 1 soal bergambar).`,
    };
  }

  if (alreadyHasImage) {
    return { allowed: true, status };
  }

  if (status.imagedCount >= status.maxAllowed) {
    return {
      allowed: false,
      status,
      reason: `Kuota gambar maksimal 30% telah terpenuhi (${status.imagedCount}/${status.maxAllowed} soal bergambar). Hapus salah satu gambar lain terlebih dahulu atau tinjau gambar terpilih.`,
    };
  }

  return { allowed: true, status };
}

export function computeQuestionSnapshotHash(
  q: Pick<QuestionItem, 'questionText' | 'stimulus' | 'options'>
): string {
  const raw = [
    q.stimulus ?? '',
    q.questionText ?? '',
    ...(q.options ?? []).map((o) => `${o.label}:${o.text}`),
  ]
    .join('|')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

  let hash = 2166136261;
  for (let i = 0; i < raw.length; i += 1) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

export interface VisualNeedAssessment {
  questionId: string;
  questionNumber: number;
  necessity: VisualNecessity;
  priorityScore: number;
  recommendedType: QuestionImageType;
  reason: string;
}

const NOT_REQUIRED_TEXT_PATTERNS =
  /^(?:sebutkan|tuliskan|jelaskan pengertian|apa arti|apa antonim|apa sinonim|siapa nama|kapan terjadi)\b/i;

export function assessQuestionVisualNeedHeuristic(
  q: QuestionItem,
  subject: string
): VisualNeedAssessment {
  const combined = `${subject} ${q.questionSubType ?? ''} ${q.material ?? ''} ${q.stimulus ?? ''} ${q.questionText}`.toLowerCase();

  let score = 20;
  let recommendedType: QuestionImageType = 'Ilustrasi edukasi';
  const reasons: string[] = [];

  if (
    q.questionSubType === 'Soal Berbasis Gambar' ||
    q.questionSubType === 'Soal Berbasis Diagram' ||
    q.questionSubType === 'Soal Berbasis Grafik' ||
    q.questionSubType === 'Soal Berbasis Tabel'
  ) {
    score += 55;
    reasons.push(`Bentuk soal (${q.questionSubType}) menuntut media visual`);
  }

  if (/perhatikan gambar|amati gambar|berdasarkan gambar|perhatikan diagram|perhatikan grafik|perhatikan bangun|gambar berikut/i.test(combined)) {
    score += 45;
    reasons.push('Teks pertanyaan merujuk langsung pada stimulus gambar/diagram');
  }

  if (/persegi|persegi panjang|segitiga|lingkaran|trapesium|kubus|balok|tabung|kerucut|bola|sudut|garis bilangan|pecahan|bangun datar|bangun ruang|luas|keliling|volume/i.test(combined)) {
    score += 32;
    recommendedType = 'Bangun datar dan bangun ruang';
    reasons.push('Konsep geometri/pengukuran membutuhkan representasi ukuran & bentuk presisi');
  } else if (/grafik|diagram batang|diagram garis|diagram lingkaran|persentase|statistik/i.test(combined)) {
    score += 32;
    recommendedType = 'Grafik';
    reasons.push('Interpretasi data kuantitatif membutuhkan grafik');
  } else if (/daur air|siklus|fotosintesis|rantai makanan|penguapan|perubahan wujud|tata surya|organ|jantung|paru|eksperimen|percobaan|rangkaian listrik/i.test(combined)) {
    score += 32;
    recommendedType = /eksperimen|percobaan|rangkaian/i.test(combined)
      ? 'Ilustrasi eksperimen'
      : /organ|jantung|paru/i.test(combined)
        ? 'Ilustrasi anatomi atau sains'
        : 'Diagram';
    reasons.push('Fenomena ilmiah IPAS/IPA lebih jelas melalui diagram proses/skema');
  } else if (/peta|wilayah|pulau|indonesia|benua|kegiatan ekonomi|perdagangan|pertanian|menanam padi/i.test(combined)) {
    score += 26;
    recommendedType = /peta|wilayah|pulau/i.test(combined)
      ? 'Peta sederhana'
      : 'Ilustrasi aktivitas sehari-hari';
    reasons.push('Konteks geografis/sosial-ekonomi IPS terbantu visual situasi');
  } else if (/gotong royong|musyawarah|kerja bakti|toleransi|pancasila|menyiram tanaman|membaca buku|perpustakaan/i.test(combined)) {
    score += 26;
    recommendedType = 'Ilustrasi aktivitas sehari-hari';
    reasons.push('Konteks sikap/aktivitas membutuhkan ilustrasi adegan yang akurat');
  }

  // Penalize pure verbal/text recall questions that need NO image
  if (
    score < 50 &&
    (NOT_REQUIRED_TEXT_PATTERNS.test(q.questionText.trim()) ||
      /contoh kata benda|antonim|sinonim|ejaan|kalimat efektif|arti kata|definisi|sebutkan tiga contoh/i.test(
        combined
      ))
  ) {
    score = Math.min(score, 18);
    reasons.length = 0;
    reasons.push('Pertanyaan dapat dipahami sepenuhnya lewat teks tanpa stimulus gambar');
  }

  const clampedScore = Math.max(0, Math.min(100, score));
  const necessity: VisualNecessity =
    clampedScore >= 60 ? 'REQUIRED' : clampedScore >= 38 ? 'OPTIONAL' : 'NOT REQUIRED';

  return {
    questionId: q.id,
    questionNumber: q.number,
    necessity,
    priorityScore: clampedScore,
    recommendedType,
    reason:
      reasons[0] ||
      (necessity === 'NOT REQUIRED'
        ? 'Pertanyaan bersifat verbal/konseptual teks.'
        : 'Visual dapat memperjelas konteks soal.'),
  };
}

/**
 * Selects up to maxAllowed (default Math.ceil(N * 0.30)) questions that genuinely need images,
 * spreading selections evenly across question buckets without altering question order.
 */
export function selectPriorityQuestionsForVisuals(
  questions: QuestionItem[],
  subject: string,
  maxAllowed = calculateMaxImagedQuestions(questions.length)
): VisualNeedAssessment[] {
  if (questions.length === 0 || maxAllowed <= 0) return [];

  const assessed = questions.map((q) => assessQuestionVisualNeedHeuristic(q, subject));
  const eligible = assessed.filter((a) => a.necessity !== 'NOT REQUIRED');
  if (eligible.length === 0) return [];
  if (eligible.length <= maxAllowed) return eligible;

  // Distribute across proportional segments of the exam so images aren't clumped at the start/end
  const picked = new Map<string, VisualNeedAssessment>();
  const bucketSize = questions.length / maxAllowed;

  for (let slot = 0; slot < maxAllowed; slot += 1) {
    const startIdx = Math.floor(slot * bucketSize);
    const endIdx = Math.min(questions.length, Math.ceil((slot + 1) * bucketSize));
    const bucketCandidates = eligible
      .filter((item) => {
        const qIdx = questions.findIndex((q) => q.id === item.questionId);
        return qIdx >= startIdx && qIdx < endIdx && !picked.has(item.questionId);
      })
      .sort((a, b) => b.priorityScore - a.priorityScore);

    if (bucketCandidates[0]) {
      picked.set(bucketCandidates[0].questionId, bucketCandidates[0]);
    }
  }

  if (picked.size < maxAllowed) {
    const remainingPool = eligible
      .filter((item) => !picked.has(item.questionId))
      .sort((a, b) => b.priorityScore - a.priorityScore);
    for (const item of remainingPool) {
      if (picked.size >= maxAllowed) break;
      picked.set(item.questionId, item);
    }
  }

  // Return in original exam question order
  return questions
    .map((q) => picked.get(q.id))
    .filter((item): item is VisualNeedAssessment => Boolean(item));
}
