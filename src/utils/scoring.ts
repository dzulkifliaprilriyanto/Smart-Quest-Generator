import type {
  DifficultyLevel,
  QuestionItem,
  RubricCriterion,
  ScoringDashboardSummary,
  ScoringValidationStatus,
} from '../types/question.ts';

export const TARGET_TOTAL_SCORE = 100;

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function formatScore(value: number | undefined): string {
  const num = Number.isFinite(Number(value)) ? Number(value) : 0;
  return round2(num).toFixed(2);
}

export function getDifficultyFactor(difficulty: DifficultyLevel): 1 | 2 | 3 {
  if (difficulty === 'Mudah') return 1;
  if (difficulty === 'Sedang') return 2;
  return 3; // Sulit & HOTS
}

export function getDefaultScoringCriteria(q: QuestionItem): string {
  const sub = q.questionSubType || q.type;
  if (sub === 'Pilihan Ganda Kompleks') {
    return 'Skor proporsional (parsial) sesuai jumlah pilihan benar yang dipilih tanpa penalti melebihi bobot.';
  }
  if (sub === 'Benar dan Salah') {
    return 'Benar = bobot penuh (atau dibagi rata per pernyataan); Salah = 0.';
  }
  if (sub === 'Menjodohkan') {
    const pairCount = q.matchingPairs?.length || 3;
    return `Dibagi proporsional per pasangan tepat (${pairCount} pasangan).`;
  }
  if (sub === 'Isian Singkat' || sub === 'Isian Rumpang' || sub === 'Jawaban Singkat') {
    return 'Jawaban sesuai kunci atau variasi penulisan ekuivalen mendapat bobot penuh.';
  }
  if (q.type === 'Esai') {
    return 'Penilaian analitik berbasis rubrik kriteria dengan total skor rubrik tepat sama dengan bobot soal.';
  }
  return 'Benar = bobot penuh; Salah / Kosong = 0.';
}

/**
 * Scales rubric criteria maxScore values proportionally (2 decimal places)
 * so their sum equals the exact target question scoreWeight.
 */
export function scaleRubricToWeight(
  rubric: RubricCriterion[] | undefined,
  targetWeight: number
): RubricCriterion[] | undefined {
  if (!rubric || rubric.length === 0) return rubric;
  const targetBp = Math.max(0, Math.round(targetWeight * 100));
  const rawTotal = rubric.reduce((sum, r) => sum + Math.max(0.01, Number(r.maxScore) || 1), 0);

  const exactBps = rubric.map((r) => {
    const val = Math.max(0.01, Number(r.maxScore) || 1);
    return (val / rawTotal) * targetBp;
  });
  const floors = exactBps.map((v) => Math.floor(v));
  let remainder = targetBp - floors.reduce((a, b) => a + b, 0);

  const order = exactBps
    .map((v, idx) => ({ idx, rem: v - floors[idx]! }))
    .sort((a, b) => b.rem - a.rem || a.idx - b.idx);

  for (let k = 0; k < order.length && remainder > 0; k += 1) {
    floors[order[k]!.idx]! += 1;
    remainder -= 1;
  }

  return rubric.map((r, idx) => ({
    ...r,
    maxScore: round2(floors[idx]! / 100),
  }));
}

/**
 * Distributes exact 100.00 points across all questions proportional to difficulty factors
 * (Mudah=1, Sedang=2, Sulit/HOTS=3) using Largest Remainder Method at 2 decimal places (basis points).
 */
export function calculateIntelligentScores(questions: QuestionItem[]): QuestionItem[] {
  if (questions.length === 0) return [];

  const totalBp = 10000; // 100.00 * 100
  const factors = questions.map((q) => getDifficultyFactor(q.difficulty));
  const totalFactor = factors.reduce((sum, f) => sum + f, 0);

  const exactBps = factors.map((f) => (f * totalBp) / totalFactor);
  const floors = exactBps.map((v) => Math.floor(v));
  let remainder = totalBp - floors.reduce((a, b) => a + b, 0);

  const remaindersOrder = exactBps
    .map((v, idx) => ({ idx, rem: v - floors[idx]!, factor: factors[idx]! }))
    .sort((a, b) => b.rem - a.rem || b.factor - a.factor || a.idx - b.idx);

  for (let i = 0; i < remaindersOrder.length && remainder > 0; i += 1) {
    floors[remaindersOrder[i]!.idx]! += 1;
    remainder -= 1;
  }

  return questions.map((q, idx) => {
    const weight = round2(floors[idx]! / 100);
    return {
      ...q,
      difficultyFactor: factors[idx],
      scoreWeight: weight,
      scoringCriteria: q.scoringCriteria?.trim() || getDefaultScoringCriteria(q),
      rubric: scaleRubricToWeight(q.rubric, weight),
    };
  });
}

export function analyzeScoringStatus(questions: QuestionItem[]): ScoringDashboardSummary {
  const totalQuestions = questions.length;
  let easyCount = 0;
  let mediumCount = 0;
  let hardCount = 0;
  let totalFactor = 0;
  let totalWeightRaw = 0;

  for (const q of questions) {
    const factor = getDifficultyFactor(q.difficulty);
    totalFactor += factor;
    if (factor === 1) easyCount += 1;
    else if (factor === 2) mediumCount += 1;
    else hardCount += 1;

    totalWeightRaw += Number.isFinite(Number(q.scoreWeight)) ? Number(q.scoreWeight) : 0;
  }

  const totalWeight = round2(totalWeightRaw);

  if (totalQuestions === 0) {
    return {
      totalQuestions: 0,
      easyCount: 0,
      mediumCount: 0,
      hardCount: 0,
      totalFactor: 0,
      totalWeight: 0,
      status: 'INVALID',
      statusReason: 'Belum ada butir soal.',
      isManualOverride: false,
    };
  }

  const expected = calculateIntelligentScores(questions);
  const matchesAuto = questions.every((q, idx) => {
    const expW = expected[idx]?.scoreWeight ?? 0;
    const curW = round2(Number(q.scoreWeight) || 0);
    return Math.abs(curW - expW) <= 0.005;
  });

  const rubricMismatch = questions.some((q) => {
    if (!q.rubric || q.rubric.length === 0) return false;
    const rSum = round2(q.rubric.reduce((s, r) => s + (Number(r.maxScore) || 0), 0));
    const qWeight = round2(Number(q.scoreWeight) || 0);
    return Math.abs(rSum - qWeight) > 0.02;
  });

  let status: ScoringValidationStatus = 'VALID';
  let statusReason = 'Total nilai tepat 100.00 dan proporsional terhadap tingkat kesulitan.';

  if (Math.abs(totalWeight - TARGET_TOTAL_SCORE) > 0.01) {
    status = 'INVALID';
    statusReason = `Total nilai saat ini ${totalWeight.toFixed(2)} (harus tepat 100.00).`;
  } else if (rubricMismatch) {
    status = 'NEEDS RECALCULATION';
    statusReason = 'Total skor rubrik uraian belum sinkron dengan bobot butir soal.';
  } else if (!matchesAuto) {
    status = 'VALID';
    statusReason = 'Total nilai tepat 100.00 (penyesuaian bobot kustom pendidik).';
  }

  return {
    totalQuestions,
    easyCount,
    mediumCount,
    hardCount,
    totalFactor,
    totalWeight,
    status,
    statusReason,
    isManualOverride: !matchesAuto,
  };
}
