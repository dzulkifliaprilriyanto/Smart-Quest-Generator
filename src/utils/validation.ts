import type { GeneratorParams, ValidationErrors } from '../types/question.ts';
import { EDUCATION_LEVELS, getGradesForLevel } from './curriculum.ts';

const VALID_LEVEL_VALUES = [
  ...EDUCATION_LEVELS.map((l) => l.value),
  'SD',
  'SMP',
  'SMA',
];

export function validateGeneratorParams(params: GeneratorParams): {
  isValid: boolean;
  errors: ValidationErrors;
} {
  const errors: ValidationErrors = {};

  if (!VALID_LEVEL_VALUES.includes(params.educationLevel)) {
    errors.educationLevel =
      'Pilih jenjang pendidikan yang valid (PAUD/TK, SD/MI, SMP/MTs, SMA/MA, SMK, Kesetaraan, atau SLB).';
  }

  const allowedGrades = getGradesForLevel(params.educationLevel);
  if (!params.grade.trim() || !allowedGrades.some((g) => g.value === params.grade)) {
    errors.grade = `Pilih kelas/fase yang sesuai untuk jenjang ${params.educationLevel}.`;
  }

  if (!params.subject.trim()) {
    errors.subject = 'Mata pelajaran wajib dipilih atau diisi.';
  } else if (params.subject.trim().length < 2) {
    errors.subject = 'Nama mata pelajaran minimal 2 karakter.';
  }

  const trimmedTopic = params.topic.trim();
  if (!trimmedTopic) {
    errors.topic = 'Topik atau materi pembelajaran wajib diisi.';
  } else if (trimmedTopic.length < 3) {
    errors.topic = 'Topik materi minimal 3 karakter agar soal tetap kontekstual.';
  } else if (trimmedTopic.length > 500) {
    errors.topic = 'Topik materi maksimal 500 karakter.';
  }

  if (
    !Number.isInteger(params.questionCount) ||
    params.questionCount < 1 ||
    params.questionCount > 50
  ) {
    errors.questionCount = 'Jumlah soal harus antara 1 hingga 50 butir dalam satu proses.';
  } else if (Array.isArray(params.subTypeCounts) && params.subTypeCounts.length > 0) {
    const sum = params.subTypeCounts.reduce(
      (acc, item) => acc + (Number.isFinite(item.count) ? Math.max(0, Math.round(item.count)) : 0),
      0
    );
    if (sum < 1 || sum > 50) {
      errors.questionCount = `Total kombinasi seluruh bentuk soal (${sum}) harus antara 1 hingga maksimal 50 butir.`;
    }
  }

  if (params.schoolName.length > 120) {
    errors.schoolName = 'Nama sekolah/instansi maksimal 120 karakter.';
  }

  if (params.additionalNotes.length > 400) {
    errors.additionalNotes = 'Catatan tambahan maksimal 400 karakter.';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}
