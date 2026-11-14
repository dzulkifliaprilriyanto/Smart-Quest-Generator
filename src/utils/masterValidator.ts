import type {
  MasterValidationCheck,
  MasterValidationReport,
  QuestionItem,
  QuestionSet,
} from '../types/question.ts';
import {
  MAX_QUESTIONS_LIMIT,
  MIN_QUESTIONS_LIMIT,
  getImageQuotaStatus,
} from './imageQuota.ts';
import { analyzeScoringStatus, calculateIntelligentScores } from './scoring.ts';

function normalizeForDupCheck(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function validateQuestionSet(set: QuestionSet): MasterValidationReport {
  const checks: MasterValidationCheck[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];

  const total = set.questions.length;

  // 1. Jumlah Soal (1..50)
  if (total < MIN_QUESTIONS_LIMIT || total > MAX_QUESTIONS_LIMIT) {
    const msg = `Jumlah soal (${total}) berada di luar batas 1–50 butir.`;
    errors.push(msg);
    checks.push({
      id: 'count',
      label: 'Jumlah Soal (1–50)',
      status: 'failed',
      detail: msg,
      autoFixable: total > MAX_QUESTIONS_LIMIT,
    });
  } else {
    checks.push({
      id: 'count',
      label: 'Jumlah Soal (1–50)',
      status: 'passed',
      detail: `${total} butir soal memenuhi batas 1–50.`,
    });
  }

  // 2. Penomoran Berurutan & Deteksi Duplikat
  const outOfOrder = set.questions.some((q, idx) => q.number !== idx + 1);
  const seenTexts = new Set<string>();
  const duplicateNumbers: number[] = [];
  for (const q of set.questions) {
    const norm = normalizeForDupCheck(q.questionText);
    if (norm && seenTexts.has(norm)) {
      duplicateNumbers.push(q.number);
    } else if (norm) {
      seenTexts.add(norm);
    }
  }

  if (outOfOrder || duplicateNumbers.length > 0) {
    const parts: string[] = [];
    if (outOfOrder) parts.push('nomor soal tidak berurutan');
    if (duplicateNumbers.length > 0) {
      parts.push(`terdeteksi duplikasi pada nomor ${duplicateNumbers.join(', ')}`);
    }
    const msg = `Konsistensi nomor/duplikat: ${parts.join('; ')}.`;
    errors.push(msg);
    checks.push({
      id: 'numbering',
      label: 'Penomoran & Anti-Duplikat',
      status: 'failed',
      detail: msg,
      autoFixable: true,
    });
  } else {
    checks.push({
      id: 'numbering',
      label: 'Penomoran & Anti-Duplikat',
      status: 'passed',
      detail: 'Seluruh nomor urut berurutan (1–N) tanpa duplikasi.',
    });
  }

  // 3. Kuota Gambar Maksimal 30% (Math.floor) & Minimal 70% Tanpa Gambar
  const quota = getImageQuotaStatus(set.questions);
  if (quota.isExceeded) {
    const msg = `Kuota gambar melebihi 30% (floor): ${quota.imagedCount} dari ${quota.totalQuestions} soal bergambar (maksimal ${quota.maxAllowed}). Pilih gambar yang dipertahankan.`;
    warnings.push(msg);
    checks.push({
      id: 'imageQuota',
      label: 'Kuota Gambar (Maks 30%)',
      status: 'warning',
      detail: msg,
      autoFixable: false,
    });
  } else {
    checks.push({
      id: 'imageQuota',
      label: 'Kuota Gambar (Maks 30%)',
      status: 'passed',
      detail: `${quota.imagedCount}/${quota.maxAllowed} soal bergambar (${quota.imagedPercent}% bergambar · ${quota.nonImagedPercent}% teks).`,
    });
  }

  // 4. Kesesuaian Visual & Status Persetujuan Gambar
  const imagedQuestions = set.questions.filter((q) => Boolean(q.supportingImage));
  const staleImages = imagedQuestions.filter(
    (q) =>
      q.supportingImage?.needsQuestionSyncReview ||
      q.supportingImage?.approvalStatus === 'needs_revision' ||
      q.supportingImage?.validationReport?.semanticStatus === 'failed' ||
      q.supportingImage?.validationReport?.technicalStatus === 'failed'
  );
  const pendingApproval = imagedQuestions.filter(
    (q) => q.supportingImage?.approvalStatus === 'pending_review'
  );

  if (staleImages.length > 0) {
    const msg = `Gambar pada soal nomor ${staleImages.map((q) => q.number).join(', ')} perlu ditinjau ulang karena teks soal berubah atau pemeriksaan visual menandai revisi.`;
    warnings.push(msg);
    checks.push({
      id: 'visualSync',
      label: 'Kesesuaian Gambar & Soal',
      status: 'warning',
      detail: msg,
    });
  } else if (pendingApproval.length > 0) {
    const msg = `${pendingApproval.length} gambar menunggu persetujuan guru (Gunakan Gambar).`;
    warnings.push(msg);
    checks.push({
      id: 'visualSync',
      label: 'Kesesuaian Gambar & Soal',
      status: 'warning',
      detail: msg,
    });
  } else {
    checks.push({
      id: 'visualSync',
      label: 'Kesesuaian Gambar & Soal',
      status: 'passed',
      detail:
        imagedQuestions.length === 0
          ? 'Seluruh soal tersaji rapi tanpa ketergantungan gambar berlebih.'
          : `${imagedQuestions.length} gambar terhubung valid ke ID soal terkait.`,
    });
  }

  // 5. Sistem Pembobotan Nilai Tepat 100.00 & Sinkronisasi Rubrik
  const scoring = analyzeScoringStatus(set.questions);
  if (scoring.status === 'INVALID') {
    errors.push(scoring.statusReason);
    checks.push({
      id: 'scoring100',
      label: 'Pembobotan Nilai (Total 100.00)',
      status: 'failed',
      detail: scoring.statusReason,
      autoFixable: true,
    });
  } else if (scoring.status === 'NEEDS RECALCULATION') {
    warnings.push(scoring.statusReason);
    checks.push({
      id: 'scoring100',
      label: 'Pembobotan Nilai (Total 100.00)',
      status: 'warning',
      detail: scoring.statusReason,
      autoFixable: true,
    });
  } else {
    checks.push({
      id: 'scoring100',
      label: 'Pembobotan Nilai (Total 100.00)',
      status: 'passed',
      detail: `Total nilai tepat ${scoring.totalWeight.toFixed(2)} (Total faktor kesulitan: ${scoring.totalFactor}).`,
    });
  }

  // 6. Kunci Jawaban, Opsi, & Rubrik
  const keyIssues: number[] = [];
  const optionIssues: number[] = [];
  for (const q of set.questions) {
    if (!q.correctAnswer.trim()) {
      keyIssues.push(q.number);
    }
    if (q.type === 'Pilihan Ganda') {
      if (q.options.length < 2 || q.options.some((o) => !o.text.trim())) {
        optionIssues.push(q.number);
      } else {
        const optTexts = q.options.map((o) => normalizeForDupCheck(o.text));
        if (new Set(optTexts).size < optTexts.length) {
          optionIssues.push(q.number);
        }
        const keyNorm = q.correctAnswer.trim().toUpperCase();
        const matchesLabel = q.options.some(
          (o) =>
            keyNorm === o.label.toUpperCase() ||
            keyNorm.startsWith(`${o.label.toUpperCase()}.`) ||
            keyNorm.startsWith(`${o.label.toUpperCase()} `) ||
            keyNorm.includes(o.label.toUpperCase())
        );
        if (!matchesLabel && q.questionSubType !== 'Pilihan Ganda Kompleks') {
          keyIssues.push(q.number);
        }
      }
    }
  }

  if (keyIssues.length > 0 || optionIssues.length > 0) {
    const parts: string[] = [];
    if (keyIssues.length > 0) parts.push(`kunci jawaban soal ${Array.from(new Set(keyIssues)).join(', ')}`);
    if (optionIssues.length > 0) parts.push(`opsi jawaban soal ${Array.from(new Set(optionIssues)).join(', ')}`);
    const msg = `Perlu pemeriksaan pada ${parts.join(' dan ')}.`;
    warnings.push(msg);
    checks.push({
      id: 'answerKey',
      label: 'Kunci Jawaban & Pengecoh',
      status: 'warning',
      detail: msg,
    });
  } else {
    checks.push({
      id: 'answerKey',
      label: 'Kunci Jawaban & Pengecoh',
      status: 'passed',
      detail: 'Kunci jawaban dan opsi jawaban konsisten.',
    });
  }

  // 7. Kisi-Kisi, TP, & Taksonomi Kognitif
  const missingBlueprint = set.questions.filter(
    (q) => !q.indicator?.trim() || !q.material?.trim() || !q.learningObjective?.trim()
  );
  if (missingBlueprint.length > 0) {
    const msg = `${missingBlueprint.length} soal belum memiliki data kisi-kisi lengkap (Materi/TP/Indikator).`;
    warnings.push(msg);
    checks.push({
      id: 'blueprint',
      label: 'Kisi-Kisi & Tujuan Pembelajaran',
      status: 'warning',
      detail: msg,
      autoFixable: true,
    });
  } else {
    checks.push({
      id: 'blueprint',
      label: 'Kisi-Kisi & Tujuan Pembelajaran',
      status: 'passed',
      detail: 'Seluruh butir soal sinkron dengan Kisi-Kisi dan Tujuan Pembelajaran.',
    });
  }

  const passedCount = checks.filter((c) => c.status === 'passed').length;
  const failedCount = checks.filter((c) => c.status === 'failed').length;
  const overallScore = Math.max(
    0,
    Math.min(100, Math.round((passedCount / checks.length) * 100 - failedCount * 15))
  );

  return {
    isValid: errors.length === 0 && !quota.isExceeded,
    overallScore,
    checks,
    warnings,
    errors,
    checkedAt: new Date().toISOString(),
  };
}

/**
 * Safely repairs structural issues (sequential numbering, duplicate texts, >50 cap,
 * missing kisi-kisi fields, cognitive tier alignment, exact 100.00 scoring weights)
 * WITHOUT touching guru-approved images.
 */
export function autoRepairQuestionSet(set: QuestionSet): {
  repairedSet: QuestionSet;
  appliedFixes: string[];
} {
  const appliedFixes: string[] = [];
  const seen = new Set<string>();
  const deduped: QuestionItem[] = [];

  for (const q of set.questions) {
    const norm = normalizeForDupCheck(q.questionText);
    if (norm && seen.has(norm)) {
      appliedFixes.push(`Menghapus soal duplikat pada nomor ${q.number}.`);
      continue;
    }
    if (norm) seen.add(norm);
    deduped.push(q);
  }

  let bounded = deduped;
  if (bounded.length > MAX_QUESTIONS_LIMIT) {
    bounded = bounded.slice(0, MAX_QUESTIONS_LIMIT);
    appliedFixes.push(`Membatasi jumlah soal maksimal ${MAX_QUESTIONS_LIMIT} butir.`);
  }

  let renumbered = false;
  let filledBlueprint = false;
  let alignedTier = false;

  const baseQuestions: QuestionItem[] = bounded.map((q, idx) => {
    const expectedNum = idx + 1;
    if (q.number !== expectedNum) renumbered = true;

    const material = q.material?.trim() || set.params.topic || set.params.subject;
    const learningObjective =
      q.learningObjective?.trim() ||
      set.params.learningPlan?.tp?.trim() ||
      `Peserta didik memahami materi ${set.params.topic || set.params.subject}.`;
    const indicator =
      q.indicator?.trim() ||
      `Disajikan konteks terkait ${material}, peserta didik dapat menyelesaikan soal nomor ${expectedNum}.`;

    if (!q.material?.trim() || !q.learningObjective?.trim() || !q.indicator?.trim()) {
      filledBlueprint = true;
    }

    const expectedTier =
      q.cognitiveLevel === 'C1' || q.cognitiveLevel === 'C2'
        ? 'LOTS'
        : q.cognitiveLevel === 'C3'
          ? 'MOTS'
          : 'HOTS';
    if (q.cognitiveTier !== expectedTier) {
      alignedTier = true;
    }

    return {
      ...q,
      number: expectedNum,
      material,
      learningObjective,
      indicator,
      cognitiveTier: expectedTier,
    };
  });

  const scoringBefore = analyzeScoringStatus(baseQuestions);
  const scoredQuestions =
    scoringBefore.status !== 'VALID'
      ? calculateIntelligentScores(baseQuestions)
      : baseQuestions;
  if (scoringBefore.status !== 'VALID' && scoredQuestions.length > 0) {
    appliedFixes.push('Menyelaraskan bobot skor seluruh butir soal agar total tepat 100.00.');
  }

  if (renumbered) appliedFixes.push('Menyesuaikan penomoran soal menjadi berurutan 1–N.');
  if (filledBlueprint) appliedFixes.push('Melengkapi komponen Kisi-Kisi (Materi, TP, Indikator).');
  if (alignedTier) appliedFixes.push('Menyelaraskan klasifikasi LOTS/MOTS/HOTS dengan C1–C6.');

  return {
    repairedSet: {
      ...set,
      questions: scoredQuestions,
    },
    appliedFixes,
  };
}
