import type {
  DifficultyLevel,
  KisiKisiRow,
  QuestionFilterState,
  QuestionItem,
  QuestionSet,
  QuestionSetStats,
} from '../types/question.ts';
import { formatScore, round2 } from './scoring.ts';
import { APP_OFFICIAL_BRANDING, APP_OFFICIAL_NAME } from './kopTemplates.ts';

export function filterQuestions(
  questions: QuestionItem[],
  filter: QuestionFilterState
): QuestionItem[] {
  const query = filter.searchQuery.trim().toLowerCase();

  return questions.filter((q) => {
    if (filter.typeFilter !== 'Semua' && q.type !== filter.typeFilter) {
      return false;
    }
    if (
      filter.difficultyFilter !== 'Semua' &&
      q.difficulty !== filter.difficultyFilter
    ) {
      return false;
    }
    if (query) {
      const haystack = [
        q.stimulus ?? '',
        q.questionText,
        q.correctAnswer,
        q.explanation,
        q.material ?? '',
        q.indicator ?? '',
        ...q.options.map((o) => o.text),
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(query)) {
        return false;
      }
    }
    return true;
  });
}

export function computeSetStats(questions: QuestionItem[]): QuestionSetStats {
  const byDifficulty: Record<DifficultyLevel, number> = {
    Mudah: 0,
    Sedang: 0,
    Sulit: 0,
    HOTS: 0,
  };

  let multipleChoiceCount = 0;
  let essayCount = 0;
  let totalScoreWeight = 0;

  for (const q of questions) {
    if (q.type === 'Pilihan Ganda') {
      multipleChoiceCount += 1;
    } else {
      essayCount += 1;
    }
    totalScoreWeight += q.scoreWeight ?? (q.type === 'Esai' ? 20 : 10);
    if (q.difficulty in byDifficulty) {
      byDifficulty[q.difficulty] += 1;
    }
  }

  return {
    total: questions.length,
    multipleChoiceCount,
    essayCount,
    totalScoreWeight: round2(totalScoreWeight),
    byDifficulty,
  };
}

export function buildKisiKisiRows(set: QuestionSet, questions?: QuestionItem[]): KisiKisiRow[] {
  const list = questions ?? set.questions;
  const schoolName = (set.params.docIdentity?.schoolName || set.params.schoolName || '').trim();
  const semester = set.params.docIdentity?.semester || 'Ganjil';
  const gradePhase = `${set.params.grade} (${set.params.learningPlan?.phase || '-'})`;

  return list.map((q, idx) => ({
    number: idx + 1,
    schoolName,
    subject: set.params.subject,
    gradePhase,
    semester,
    learningObjective:
      q.learningObjective ||
      set.params.learningPlan?.tp ||
      set.params.learningPlan?.kd ||
      `Memahami dan menerapkan materi ${set.params.topic}`,
    material: q.material || set.params.topic,
    indicator:
      q.indicator ||
      `Disajikan stimulus terkait ${q.material || set.params.topic}, peserta didik mampu menyelesaikan soal ${q.questionSubType || q.type}.`,
    cognitiveLevel: q.cognitiveLevel,
    questionForm: q.questionSubType || q.type,
    questionNumber: idx + 1,
    correctAnswer: q.correctAnswer,
  }));
}

export function buildSafeFilename(
  set: QuestionSet,
  ext: 'txt' | 'docx' | 'pdf' | 'xlsx'
): string {
  const slug = `${set.params.educationLevel}-${set.params.subject}-${set.params.topic}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);

  return `soal-${slug || 'paket'}.${ext}`;
}

export function formatQuestionSetAsText(
  set: QuestionSet,
  options: { includeAnswerKey: boolean; filteredQuestions?: QuestionItem[] }
): string {
  const questions = options.filteredQuestions ?? set.questions;
  const divider = '='.repeat(72);
  const subDivider = '-'.repeat(72);
  const school = set.params.docIdentity?.schoolName || set.params.schoolName;

  const lines: string[] = [];
  lines.push(divider);
  if (school?.trim()) {
    lines.push(school.trim().toUpperCase());
  }
  lines.push(set.title.toUpperCase());
  lines.push(divider);
  lines.push(`Jenjang / Kelas   : ${set.params.educationLevel} · ${set.params.grade}`);
  lines.push(`Kurikulum         : ${set.params.curriculum}`);
  lines.push(`Jenis Asesmen     : ${set.params.assessmentType}`);
  lines.push(`Mata Pelajaran    : ${set.params.subject}`);
  lines.push(`Semester / Tahun  : ${set.params.docIdentity?.semester ?? 'Ganjil'} · ${set.params.docIdentity?.academicYear ?? '2026/2027'}`);
  lines.push(`Topik / Materi    : ${set.params.topic}`);
  lines.push(`Tingkat Kesulitan : ${set.params.difficulty}`);
  lines.push(`Alokasi Waktu     : ${set.params.docIdentity?.timeAllocation ?? '90 Menit'}`);
  lines.push(`Jumlah Soal       : ${questions.length} butir`);
  lines.push(subDivider);
  lines.push('');
  lines.push('PETUNJUK PENGERJAAN:');
  lines.push('1. Berdoalah sebelum mulai mengerjakan soal.');
  lines.push('2. Tuliskan nama lengkap, kelas, dan nomor absen pada lembar jawaban.');
  lines.push('3. Bacalah setiap stimulus dan pertanyaan dengan cermat dan teliti.');
  lines.push('');
  lines.push(subDivider);
  lines.push('DAFTAR SOAL');
  lines.push(subDivider);
  lines.push('');

  questions.forEach((q, idx) => {
    const num = idx + 1;
    const formLabel = q.questionSubType || q.type;
    lines.push(
      `${num}. [${formLabel} · ${q.difficulty} · ${q.cognitiveLevel} · Bobot ${q.scoreWeight ?? 10}]`
    );
    if (q.stimulus) {
      lines.push(`   [Stimulus]: ${q.stimulus}`);
    }
    if (q.supportingImage?.dataUrl) {
      lines.push(
        `   [Gambar Pendukung${q.supportingImage.caption ? `: ${q.supportingImage.caption}` : ''}]`
      );
    }
    lines.push(`   ${q.questionText}`);
    if (q.matchingPairs && q.matchingPairs.length > 0) {
      q.matchingPairs.forEach((pair, pIdx) => {
        lines.push(`   (${pIdx + 1}) ${pair.prompt}  <--->  [ .... ]  (${String.fromCharCode(65 + pIdx)}) ${pair.match}`);
      });
    } else if (q.options.length > 0) {
      q.options.forEach((opt) => {
        lines.push(`   ${opt.label}. ${opt.text}`);
      });
    } else {
      lines.push('   Jawaban: ______________________________________________________');
    }
    lines.push('');
  });

  if (options.includeAnswerKey && questions.length > 0) {
    lines.push('');
    lines.push(divider);
    lines.push('KUNCI JAWABAN, PEMBAHASAN & PEDOMAN PENSKORAN');
    lines.push(divider);
    lines.push('');

    questions.forEach((q, idx) => {
      const num = idx + 1;
      lines.push(`${num}. Kunci Jawaban: ${q.correctAnswer} (Bobot: ${formatScore(q.scoreWeight)})`);
      if (q.explanation) {
        lines.push(`   Pembahasan   : ${q.explanation}`);
      }
      if (q.rubric && q.rubric.length > 0) {
        lines.push('   Rubrik Penskoran:');
        q.rubric.forEach((r) => {
          lines.push(`   - ${r.criterion} (Maks ${r.maxScore}): ${r.descriptor}`);
        });
      }
      lines.push('');
    });
  }

  if (set.params.exportConfig?.includeAppBranding !== false) {
    lines.push(subDivider);
    lines.push(`${APP_OFFICIAL_NAME} — ${APP_OFFICIAL_BRANDING}`);
  }

  return lines.join('\n');
}
