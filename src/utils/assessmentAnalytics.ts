import type {
  ItemAnalysisMetrics,
  QuestionItem,
  StudentEvaluationResult,
  StudentResponseEntry,
} from '../types/question.ts';

export function isObjectiveAnswerCorrect(
  studentAnswer: string,
  correctAnswer: string
): boolean {
  const cleanStudent = studentAnswer.trim().toUpperCase();
  const cleanCorrect = correctAnswer.trim().toUpperCase();
  if (!cleanStudent || !cleanCorrect) return false;
  if (cleanStudent === cleanCorrect) return true;
  // Support matching single option letter e.g. "B" vs "B. 10 cm"
  const studentLetter = cleanStudent.match(/^([A-E])\b/)?.[1];
  const correctLetter = cleanCorrect.match(/^([A-E])\b/)?.[1];
  if (studentLetter && correctLetter && studentLetter.length === 1 && cleanCorrect.length <= 3) {
    return studentLetter === correctLetter;
  }
  return false;
}

export function evaluateStudentResponses(
  questions: QuestionItem[],
  responses: StudentResponseEntry[],
  kktpThreshold: number
): StudentEvaluationResult[] {
  const safeThreshold = Math.max(1, Math.min(100, kktpThreshold));
  const enrichmentThreshold = Math.min(100, safeThreshold + 15);
  const maxScore = questions.reduce(
    (sum, q) => sum + (q.scoreWeight ?? (q.type === 'Esai' ? 20 : 10)),
    0
  );

  return responses.map((student) => {
    let earnedScore = 0;

    questions.forEach((q) => {
      const weight = q.scoreWeight ?? (q.type === 'Esai' ? 20 : 10);
      const manual = student.manualScores[q.id];
      if (typeof manual === 'number' && Number.isFinite(manual)) {
        earnedScore += Math.max(0, Math.min(weight, manual));
      } else if (q.type === 'Pilihan Ganda') {
        const ans = student.answers[q.id] ?? '';
        if (isObjectiveAnswerCorrect(ans, q.correctAnswer)) {
          earnedScore += weight;
        }
      }
    });

    const percentageScore =
      maxScore > 0 ? Math.round((earnedScore / maxScore) * 1000) / 10 : 0;

    let status: StudentEvaluationResult['status'] = 'Perlu Remedial';
    let recommendation =
      'Laksanakan pembelajaran remedial terbimbing pada indikator tujuan pembelajaran yang belum tercapai.';

    if (percentageScore >= enrichmentThreshold) {
      status = 'Pengayaan';
      recommendation =
        'Berikan tantangan proyek atau soal HOTS pengayaan untuk pendalaman kompetensi.';
    } else if (percentageScore >= safeThreshold) {
      status = 'Tuntas';
      recommendation =
        'Peserta didik telah mencapai Kriteria Ketercapaian Tujuan Pembelajaran (KKTP) yang ditetapkan.';
    }

    return {
      studentId: student.id,
      studentName: student.studentName,
      earnedScore,
      maxScore,
      percentageScore,
      status,
      recommendation,
    };
  });
}

export function analyzeQuestionItems(
  questions: QuestionItem[],
  responses: StudentResponseEntry[],
  kktpThreshold: number
): {
  hasSufficientData: boolean;
  minimumRequired: number;
  metrics: ItemAnalysisMetrics[];
} {
  const minimumRequired = 6;
  if (responses.length < minimumRequired || questions.length === 0) {
    return {
      hasSufficientData: false,
      minimumRequired,
      metrics: [],
    };
  }

  const evaluations = evaluateStudentResponses(questions, responses, kktpThreshold);
  const sortedIds = [...evaluations]
    .sort((a, b) => b.percentageScore - a.percentageScore)
    .map((e) => e.studentId);

  const groupSize = Math.max(2, Math.round(responses.length * 0.27));
  const upperIds = new Set(sortedIds.slice(0, groupSize));
  const lowerIds = new Set(sortedIds.slice(-groupSize));

  const responseById = new Map(responses.map((r) => [r.id, r]));

  const metrics: ItemAnalysisMetrics[] = questions.map((q, idx) => {
    const weight = q.scoreWeight ?? (q.type === 'Esai' ? 20 : 10);

    const scoreRatio = (student: StudentResponseEntry): number => {
      const manual = student.manualScores[q.id];
      if (typeof manual === 'number' && Number.isFinite(manual)) {
        return Math.max(0, Math.min(1, manual / weight));
      }
      if (q.type === 'Pilihan Ganda') {
        return isObjectiveAnswerCorrect(student.answers[q.id] ?? '', q.correctAnswer)
          ? 1
          : 0;
      }
      return 0;
    };

    const totalRatio = responses.reduce((sum, r) => sum + scoreRatio(r), 0);
    const p = Math.round((totalRatio / responses.length) * 100) / 100;

    let upperCorrect = 0;
    let lowerCorrect = 0;
    upperIds.forEach((id) => {
      const s = responseById.get(id);
      if (s) upperCorrect += scoreRatio(s);
    });
    lowerIds.forEach((id) => {
      const s = responseById.get(id);
      if (s) lowerCorrect += scoreRatio(s);
    });

    const d = Math.round(((upperCorrect - lowerCorrect) / groupSize) * 100) / 100;

    const difficultyCategory =
      p > 0.7 ? 'Mudah' : p >= 0.3 ? 'Sedang (Ideal)' : 'Sukar';

    const discriminationCategory =
      d >= 0.4
        ? 'Sangat Baik'
        : d >= 0.3
          ? 'Baik'
          : d >= 0.2
            ? 'Cukup (Perlu Revisi Ringan)'
            : 'Kurang (Disarankan Revisi)';

    let distractorSummary = 'Penilaian uraian menggunakan rubrik.';
    if (q.type === 'Pilihan Ganda' && q.options.length > 0) {
      const counts = q.options.map((opt) => {
        const chosen = responses.filter(
          (r) => (r.answers[q.id] ?? '').trim().toUpperCase() === opt.label.toUpperCase()
        ).length;
        return `${opt.label}: ${chosen}`;
      });
      distractorSummary = counts.join(' · ');
    }

    return {
      questionId: q.id,
      questionNumber: idx + 1,
      correctRateP: p,
      difficultyCategory,
      discriminationD: d,
      discriminationCategory,
      distractorSummary,
    };
  });

  return {
    hasSufficientData: true,
    minimumRequired,
    metrics,
  };
}
