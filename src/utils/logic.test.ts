import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeGeneratorParams,
  sanitizeQuestionImage,
  sanitizeQuestionItem,
  sanitizeReferenceAttachments,
  sanitizeSvgMarkup,
  sanitizeText,
  stripHtmlTags,
} from './sanitizer';
import { validateGeneratorParams } from './validation';
import {
  DEFAULT_DOC_IDENTITY,
  DEFAULT_EXPORT_CONFIG,
  DEFAULT_GENERATOR_PARAMS,
  SAMPLE_QUESTION_SETS,
  getDefaultGradeForLevel,
  getPhaseForGrade,
  getSubjectsForLevel,
} from './curriculum';
import {
  buildKisiKisiRows,
  buildSafeFilename,
  computeSetStats,
  filterQuestions,
  formatQuestionSetAsText,
} from './formatter';
import {
  analyzeQuestionItems,
  evaluateStudentResponses,
} from './assessmentAnalytics';
import {
  buildExamLayoutBlocks,
  buildTeacherIdentityLines,
  canFitTwoColumns,
  formatOptionalNip,
} from './layoutEngine';
import {
  assessQuestionVisualNeedHeuristic,
  calculateMaxImagedQuestions,
  canAddImageToQuestion,
  computeQuestionSnapshotHash,
  getImageQuotaStatus,
  selectPriorityQuestionsForVisuals,
} from './imageQuota';
import {
  autoRepairQuestionSet,
  validateQuestionSet,
} from './masterValidator';
import {
  analyzeScoringStatus,
  calculateIntelligentScores,
  round2,
  scaleRubricToWeight,
} from './scoring';
import {
  APP_OFFICIAL_BRANDING,
  APP_OFFICIAL_NAME,
  cloneKopTemplate,
  createStarterKopTemplates,
  shouldRenderKopForDoc,
  validateKopTemplate,
} from './kopTemplates';
import {
  buildParticipantsFromRows,
  createDefaultExamCardConfig,
  detectSpreadsheetMapping,
  matchBulkPhotosToParticipants,
  validateParticipants,
} from './examCard';
import {
  detectLogoMagicBytes,
  extractImageDimensionsFromBytes,
  fitImageBoxDimensions,
  scrubLegacyExamCardConfigDefaults,
  scrubLegacyKopTemplatesDefaults,
  scrubLegacyParamsDefaults,
} from './logoManager';
import type { ExamCardParticipant, QuestionItem, QuestionSet } from '../types/question';

test('stripHtmlTags & sanitizeText neutralize XSS vectors cleanly', () => {
  const xssPayload =
    '<script>alert("xss")</script><img src=x onerror="evil()" />Persamaan <b onclick="hack()">Linear</b> javascript:alert(1)';
  const stripped = stripHtmlTags(xssPayload);
  assert.equal(stripped.includes('<script>'), false);
  assert.equal(stripped.includes('onerror'), false);
  assert.equal(stripped.includes('javascript:'), false);
  assert.equal(stripped.includes('Persamaan Linear'), true);

  const longText = sanitizeText('  Halo   Dunia  \u0007', 100);
  assert.equal(longText, 'Halo   Dunia');
});

test('sanitizeGeneratorParams clamps questionCount and supports Indonesian levels', () => {
  const sanitized = sanitizeGeneratorParams({
    educationLevel: 'SMK',
    grade: 'Kelas XI (Konsentrasi Keahlian)',
    questionCount: 99,
    topic: '<script>hack</script>Keselamatan Kerja K3LH',
  });
  assert.equal(sanitized.educationLevel, 'SMK');
  assert.equal(sanitized.questionCount, 50);
  assert.equal(sanitized.topic, 'Keselamatan Kerja K3LH');
});

test('sanitizeQuestionItem cleans options, rubric, and sets default scoreWeight', () => {
  const item = sanitizeQuestionItem(
    {
      questionText: '<b>Berapa</b> hasil 2 + 2?',
      options: [
        { label: 'A', text: '3' },
        { label: 'B', text: '<i>4</i>' },
      ],
      correctAnswer: 'B',
      difficulty: 'Mudah',
      cognitiveLevel: 'C1',
      rubric: [{ criterion: '<b>Ketepatan</b>', maxScore: 15, descriptor: 'Benar' }],
    },
    0
  );
  assert.equal(item.questionText, 'Berapa hasil 2 + 2?');
  assert.equal(item.options[1]?.text, '4');
  assert.equal(item.type, 'Pilihan Ganda');
  assert.equal(item.scoreWeight, 10);
  assert.equal(item.rubric?.[0]?.criterion, 'Ketepatan');
});

test('sanitizeReferenceAttachments filters unsafe binary MIME types', () => {
  const list = sanitizeReferenceAttachments([
    {
      name: 'modul.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024,
      extractedText: 'Materi',
      base64Data: 'QUJDRA==',
    },
    {
      name: 'evil.html',
      mimeType: 'text/html',
      sizeBytes: 500,
      extractedText: '<script>x</script>',
      base64Data: 'QUJDRA==',
    },
  ]);
  assert.equal(list.length, 2);
  assert.equal(list[0]?.base64Data, 'QUJDRA==');
  assert.equal(list[1]?.base64Data, undefined);
});

test('validateGeneratorParams enforces required fields and grade-level matching', () => {
  const validResult = validateGeneratorParams(DEFAULT_GENERATOR_PARAMS);
  assert.equal(validResult.isValid, true);
  assert.deepEqual(validResult.errors, {});

  const invalidResult = validateGeneratorParams({
    ...DEFAULT_GENERATOR_PARAMS,
    educationLevel: 'SD/MI',
    grade: 'Kelas XII',
    topic: 'ab',
    questionCount: 0,
  });
  assert.equal(invalidResult.isValid, false);
  assert.ok(invalidResult.errors.grade);
  assert.ok(invalidResult.errors.topic);
  assert.ok(invalidResult.errors.questionCount);
});

test('curriculum helpers return expected Indonesian phases, grades, and subjects', () => {
  assert.equal(getDefaultGradeForLevel('PAUD/TK'), 'Kelompok A (4–5 Tahun)');
  assert.equal(getDefaultGradeForLevel('SD/MI'), 'Kelas I');
  assert.equal(getDefaultGradeForLevel('SMP/MTs'), 'Kelas VII');
  assert.equal(getDefaultGradeForLevel('SMA/MA'), 'Kelas X');
  assert.equal(getPhaseForGrade('SD/MI', 'Kelas V'), 'Fase C');
  assert.ok(getSubjectsForLevel('SMK').includes('Konsentrasi Keahlian'));
});

test('filterQuestions, buildKisiKisiRows & computeSetStats process question sets cleanly', () => {
  const sample = SAMPLE_QUESTION_SETS[1];
  const stats = computeSetStats(sample.questions);
  assert.equal(stats.total, 4);
  assert.equal(stats.multipleChoiceCount, 3);
  assert.equal(stats.essayCount, 1);
  assert.equal(stats.totalScoreWeight, 100);

  const kisi = buildKisiKisiRows(sample);
  assert.equal(kisi.length, sample.questions.length);
  assert.equal(kisi[0]?.questionNumber, 1);

  const essayOnly = filterQuestions(sample.questions, {
    typeFilter: 'Esai',
    difficultyFilter: 'Semua',
    searchQuery: '',
  });
  assert.equal(essayOnly.length, 1);
});

test('formatQuestionSetAsText & buildSafeFilename support xlsx and answer key toggles', () => {
  const sample = SAMPLE_QUESTION_SETS[0];
  const xlsxName = buildSafeFilename(sample, 'xlsx');
  assert.ok(xlsxName.endsWith('.xlsx'));

  const withKey = formatQuestionSetAsText(sample, { includeAnswerKey: true });
  assert.ok(withKey.includes('KUNCI JAWABAN'));
  assert.ok(withKey.includes('Rubrik Penskoran'));

  const withoutKey = formatQuestionSetAsText(sample, { includeAnswerKey: false });
  assert.equal(withoutKey.includes('KUNCI JAWABAN'), false);
});

test('assessmentAnalytics evaluates KKTP mastery and enforces item analysis minimum data guard', () => {
  const sample = SAMPLE_QUESTION_SETS[2]; // 3 PG questions (Sulit 37.5, HOTS 37.5, Sedang 25)
  const smallResponses = [
    {
      id: 's1',
      studentName: 'Budi',
      answers: { 'sma-q1': 'B', 'sma-q2': 'B', 'sma-q3': 'B' },
      manualScores: {},
    },
    {
      id: 's2',
      studentName: 'Siti',
      answers: { 'sma-q1': 'A', 'sma-q2': 'A', 'sma-q3': 'B' },
      manualScores: {},
    },
  ];

  const evals = evaluateStudentResponses(sample.questions, smallResponses, 75);
  assert.equal(evals[0]?.percentageScore, 100);
  assert.equal(evals[0]?.status, 'Pengayaan');
  assert.equal(evals[1]?.percentageScore, 25);
  assert.equal(evals[1]?.status, 'Perlu Remedial');

  // Under 6 students -> must refuse fabricating item statistics
  const insufficient = analyzeQuestionItems(sample.questions, smallResponses, 75);
  assert.equal(insufficient.hasSufficientData, false);
  assert.equal(insufficient.metrics.length, 0);

  // With 6 students -> computes valid P & D
  const sixResponses = [
    ...smallResponses,
    { id: 's3', studentName: 'Ani', answers: { 'sma-q1': 'B', 'sma-q2': 'B', 'sma-q3': 'A' }, manualScores: {} },
    { id: 's4', studentName: 'Dodi', answers: { 'sma-q1': 'B', 'sma-q2': 'A', 'sma-q3': 'B' }, manualScores: {} },
    { id: 's5', studentName: 'Eka', answers: { 'sma-q1': 'A', 'sma-q2': 'A', 'sma-q3': 'A' }, manualScores: {} },
    { id: 's6', studentName: 'Fajar', answers: { 'sma-q1': 'B', 'sma-q2': 'B', 'sma-q3': 'B' }, manualScores: {} },
  ];
  const sufficient = analyzeQuestionItems(sample.questions, sixResponses, 75);
  assert.equal(sufficient.hasSufficientData, true);
  assert.equal(sufficient.metrics.length, 3);
  assert.ok(sufficient.metrics[0]!.correctRateP !== null);
});

test('sanitizeSvgMarkup & sanitizeQuestionImage sanitize SVG payloads and enforce valid data URLs', () => {
  const dirtySvg =
    '<svg onclick="evil()" viewBox="0 0 800 600"><script>alert(1)</script><rect x="10" y="10" width="100" height="50" fill="#15803D" /><text x="20" y="40">Persegi Panjang</text></svg>';
  const cleanSvg = sanitizeSvgMarkup(dirtySvg);
  assert.equal(cleanSvg.includes('<script>'), false);
  assert.equal(cleanSvg.includes('onclick'), false);
  assert.equal(cleanSvg.includes('<rect'), true);
  assert.equal(cleanSvg.includes('Persegi Panjang'), true);

  const validImg = sanitizeQuestionImage(
    {
      questionId: 'q-1',
      dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      format: 'png',
      placement: 'before',
      displaySize: 'medium',
      caption: '<b>Gambar 1</b>',
      source: 'ai',
    },
    'q-1'
  );
  assert.ok(validImg);
  assert.equal(validImg?.caption, 'Gambar 1');

  const invalidImg = sanitizeQuestionImage(
    {
      questionId: 'q-2',
      dataUrl: 'data:text/html;base64,PHNjcmlwdD4=',
      format: 'png',
    },
    'q-2'
  );
  assert.equal(invalidImg, undefined);
});

test('layoutEngine pairs objective PG questions in two-column mode and spans essays/large images full-width', () => {
  const sample = SAMPLE_QUESTION_SETS[0]; // SD/MI: 3 PG + 1 Esai
  const blocksTwoCol = buildExamLayoutBlocks(sample.questions, {
    ...DEFAULT_EXPORT_CONFIG,
    layoutMode: 'two-column',
  });
  assert.equal(blocksTwoCol.length, 3);
  assert.equal(blocksTwoCol[0]?.kind, 'two-column-row');
  assert.equal(blocksTwoCol[1]?.kind, 'two-column-row');
  assert.equal(blocksTwoCol[2]?.kind, 'full-width');

  const largeImgQuestion = {
    ...sample.questions[0]!,
    supportingImage: {
      id: 'img-large',
      questionId: sample.questions[0]!.id,
      dataUrl: 'data:image/png;base64,AAAA',
      fileName: 'diagram.png',
      mimeType: 'image/png' as const,
      format: 'png' as const,
      sizeBytes: 100,
      source: 'ai' as const,
      placement: 'before' as const,
      displaySize: 'large' as const,
      caption: 'Diagram Besar',
      createdAt: new Date().toISOString(),
    },
  };
  assert.equal(canFitTwoColumns(largeImgQuestion, DEFAULT_EXPORT_CONFIG), false);

  const blocksSingle = buildExamLayoutBlocks(sample.questions, {
    ...DEFAULT_EXPORT_CONFIG,
    layoutMode: 'single',
  });
  assert.equal(blocksSingle.every((b) => b.kind === 'full-width'), true);
});

test('default school/teacher identity starts blank while optional NIP & custom identity work cleanly', () => {
  assert.equal(DEFAULT_DOC_IDENTITY.schoolName, '');
  assert.equal(DEFAULT_DOC_IDENTITY.teacherName, '');
  assert.equal(DEFAULT_DOC_IDENTITY.teacherUnit, '');
  assert.equal(DEFAULT_DOC_IDENTITY.teacherNip, '');
  assert.equal(DEFAULT_GENERATOR_PARAMS.schoolName, '');
  assert.equal(DEFAULT_GENERATOR_PARAMS.docIdentity?.schoolName, '');
  assert.equal(DEFAULT_EXPORT_CONFIG.layoutMode, 'two-column');
  assert.equal(DEFAULT_EXPORT_CONFIG.scoreBox.enabled, true);

  assert.equal(formatOptionalNip(''), '');
  assert.equal(formatOptionalNip('  -  '), '');
  assert.equal(formatOptionalNip('198901012015012001'), 'NIP. 198901012015012001');

  // Empty identity yields no fake default lines
  const linesEmpty = buildTeacherIdentityLines(DEFAULT_DOC_IDENTITY);
  assert.deepEqual(linesEmpty, []);

  const customIdentity = {
    ...DEFAULT_DOC_IDENTITY,
    schoolName: 'SDN Nusantara 01',
    teacherName: 'Budi Santoso, S.Pd.',
    teacherUnit: 'SDN Nusantara 01',
  };
  const linesWithoutNip = buildTeacherIdentityLines(customIdentity);
  assert.equal(linesWithoutNip.some((line) => line.includes('NIP')), false);
  assert.ok(linesWithoutNip.includes('Budi Santoso, S.Pd.'));
  assert.ok(linesWithoutNip.includes('SDN Nusantara 01'));

  const linesWithNip = buildTeacherIdentityLines({
    ...customIdentity,
    teacherNip: '199002022020122002',
  });
  assert.ok(linesWithNip.includes('NIP. 199002022020122002'));
});

test('calculateMaxImagedQuestions enforces strict floor 30% rule across 1-50 questions (<4 -> 0)', () => {
  const expected: Array<[number, number]> = [
    [1, 0],
    [2, 0],
    [3, 0],
    [4, 1],
    [5, 1],
    [10, 3],
    [15, 4],
    [20, 6],
    [25, 7],
    [30, 9],
    [35, 10],
    [40, 12],
    [45, 13],
    [50, 15],
  ];
  for (const [total, maxAllowed] of expected) {
    assert.equal(
      calculateMaxImagedQuestions(total),
      maxAllowed,
      `Expected ${total} questions -> max ${maxAllowed} imaged`
    );
  }

  // Verify < 4 questions blocks adding any image (both AI and manual upload)
  const twoQuestions = SAMPLE_QUESTION_SETS[0]!.questions.slice(0, 2).map((q) => ({
    ...q,
    supportingImage: undefined,
  }));
  const checkUnderFour = canAddImageToQuestion(twoQuestions, twoQuestions[0]!.id);
  assert.equal(checkUnderFour.allowed, false);
  assert.ok(checkUnderFour.reason?.includes('30%'));
});

test('canAddImageToQuestion blocks exceeding 30% quota while allowing replacement on imaged question', () => {
  const baseQuestions: QuestionItem[] = Array.from({ length: 10 }, (_, idx) => ({
    id: `q-${idx + 1}`,
    number: idx + 1,
    type: 'Pilihan Ganda',
    difficulty: 'Sedang',
    cognitiveLevel: 'C2',
    questionText: `Pertanyaan uji nomor ${idx + 1}`,
    options: [
      { label: 'A', text: 'Satu' },
      { label: 'B', text: 'Dua' },
    ],
    correctAnswer: 'A',
    explanation: 'Penjelasan',
    supportingImage:
      idx < 3
        ? {
            id: `img-${idx + 1}`,
            questionId: `q-${idx + 1}`,
            fileName: `img-${idx + 1}.png`,
            format: 'png',
            mimeType: 'image/png',
            sizeBytes: 1000,
            source: 'ai',
            dataUrl: 'data:image/png;base64,AAAA',
            caption: `Gambar ${idx + 1}`,
            placement: 'before',
            displaySize: 'medium',
            createdAt: new Date().toISOString(),
          }
        : undefined,
  }));

  const status = getImageQuotaStatus(baseQuestions);
  assert.equal(status.imagedCount, 3);
  assert.equal(status.maxAllowed, 3);
  assert.equal(status.isExceeded, false);

  // 4th new image must be blocked
  const addFourth = canAddImageToQuestion(baseQuestions, 'q-4');
  assert.equal(addFourth.allowed, false);
  assert.ok(addFourth.reason?.includes('30%'));

  // Regenerating/replacing image on q-1 must remain allowed
  const replaceFirst = canAddImageToQuestion(baseQuestions, 'q-1');
  assert.equal(replaceFirst.allowed, true);
});

test('selectPriorityQuestionsForVisuals skips NOT REQUIRED questions and spreads visuals evenly', () => {
  const verbalQuestion: QuestionItem = {
    id: 'q-verbal',
    number: 1,
    type: 'Esai',
    difficulty: 'Mudah',
    cognitiveLevel: 'C1',
    questionText: 'Sebutkan tiga contoh kata benda yang ada di kelas!',
    options: [],
    correctAnswer: 'Meja, kursi, papan tulis',
    explanation: 'Kata benda menyatakan nama objek.',
  };
  assert.equal(
    assessQuestionVisualNeedHeuristic(verbalQuestion, 'Bahasa Indonesia').necessity,
    'NOT REQUIRED'
  );

  const mixedSet: QuestionItem[] = Array.from({ length: 10 }, (_, idx) => {
    const num = idx + 1;
    if (num === 1 || num === 4 || num === 7) {
      return {
        ...verbalQuestion,
        id: `q-${num}`,
        number: num,
      };
    }
    return {
      id: `q-${num}`,
      number: num,
      type: 'Pilihan Ganda',
      difficulty: 'Sedang',
      cognitiveLevel: 'C3',
      questionText: `Perhatikan gambar persegi panjang nomor ${num} dengan ukuran 8 cm x 5 cm. Hitunglah luasnya!`,
      options: [
        { label: 'A', text: '26 cm2' },
        { label: 'B', text: '40 cm2' },
      ],
      correctAnswer: 'B',
      explanation: 'Luas = p x l',
    };
  });

  const selected = selectPriorityQuestionsForVisuals(mixedSet, 'Matematika', 3);
  assert.equal(selected.length, 3);
  assert.equal(
    selected.some((s) => s.questionId === 'q-1' || s.questionId === 'q-4' || s.questionId === 'q-7'),
    false
  );
  // Check distributed across exam segments (not 2,3,5 all at start)
  assert.ok(selected[2]!.questionNumber >= 8);
});

test('validateGeneratorParams accepts 1-50 and rejects >50 or subtype allocation overflow', () => {
  const ok50 = validateGeneratorParams({
    ...DEFAULT_GENERATOR_PARAMS,
    questionCount: 50,
  });
  assert.equal(ok50.isValid, true);

  const over50 = validateGeneratorParams({
    ...DEFAULT_GENERATOR_PARAMS,
    questionCount: 51,
  });
  assert.equal(over50.isValid, false);
  assert.ok(over50.errors.questionCount);

  const overSubtypeSum = validateGeneratorParams({
    ...DEFAULT_GENERATOR_PARAMS,
    questionCount: 50,
    selectedSubTypes: ['Pilihan Ganda', 'Uraian'],
    subTypeCounts: [
      { subType: 'Pilihan Ganda', count: 35 },
      { subType: 'Uraian', count: 20 },
    ],
  });
  assert.equal(overSubtypeSum.isValid, false);
  assert.ok(overSubtypeSum.errors.questionCount?.includes('50'));
});

test('computeQuestionSnapshotHash detects stem changes & autoRepairQuestionSet preserves guru-approved images', () => {
  const sample = SAMPLE_QUESTION_SETS[0]!;
  const q1 = sample.questions[0]!;
  const hashBefore = computeQuestionSnapshotHash(q1);
  const hashAfter = computeQuestionSnapshotHash({
    ...q1,
    questionText: `${q1.questionText} (Revisi soal baru)`,
  });
  assert.notEqual(hashBefore, hashAfter);

  const approvedImage = {
    id: 'img-approved',
    questionId: q1.id,
    fileName: 'approved.png',
    format: 'png' as const,
    mimeType: 'image/png',
    sizeBytes: 1024,
    source: 'ai' as const,
    dataUrl: 'data:image/png;base64,AAAA',
    caption: 'Gambar disetujui guru',
    placement: 'before' as const,
    displaySize: 'medium' as const,
    approvalStatus: 'approved' as const,
    createdAt: new Date().toISOString(),
  };

  // Deliberately create a set with 2 approved images on 4 questions (>30% = 2 max, actually let's test 2 images on 3 questions -> max 1, so exceeded!)
  // plus out-of-order numbering and duplicate stem
  const brokenSet: QuestionSet = {
    ...sample,
    questions: [
      { ...q1, number: 9, supportingImage: approvedImage, indicator: '' },
      {
        ...sample.questions[1]!,
        id: 'q-dup',
        number: 5,
        questionText: q1.questionText, // duplicate
      },
      {
        ...sample.questions[1]!,
        number: 7,
        supportingImage: { ...approvedImage, id: 'img-approved-2', questionId: sample.questions[1]!.id },
        material: '',
      },
    ],
  };

  const reportBefore = validateQuestionSet(brokenSet);
  assert.equal(reportBefore.isValid, false);

  const { repairedSet, appliedFixes } = autoRepairQuestionSet(brokenSet);
  assert.ok(appliedFixes.length > 0);
  // Duplicate removed -> 2 questions left, numbered 1 and 2 sequentially
  assert.equal(repairedSet.questions.length, 2);
  assert.equal(repairedSet.questions[0]!.number, 1);
  assert.equal(repairedSet.questions[1]!.number, 2);
  // Guru-approved images MUST remain intact
  assert.equal(repairedSet.questions[0]!.supportingImage?.id, 'img-approved');
  assert.equal(repairedSet.questions[1]!.supportingImage?.id, 'img-approved-2');
});

test('calculateIntelligentScores guarantees exact 100.00 total across counts & scales essay rubrics', () => {
  const counts = [1, 3, 7, 13, 20, 50];
  const diffs: Array<QuestionItem['difficulty']> = ['Mudah', 'Sedang', 'Sulit', 'HOTS'];

  for (const n of counts) {
    const items: QuestionItem[] = Array.from({ length: n }, (_, idx) => ({
      id: `sc-${n}-${idx}`,
      number: idx + 1,
      type: idx === n - 1 ? 'Esai' : 'Pilihan Ganda',
      difficulty: diffs[idx % diffs.length]!,
      cognitiveLevel: 'C3',
      questionText: `Pertanyaan uji skor #${idx + 1}`,
      options: idx === n - 1 ? [] : [{ label: 'A', text: 'Satu' }, { label: 'B', text: 'Dua' }],
      correctAnswer: 'A',
      explanation: 'Pembahasan',
      rubric:
        idx === n - 1
          ? [
              { criterion: 'Konsep', maxScore: 5, descriptor: 'Tepat' },
              { criterion: 'Langkah', maxScore: 5, descriptor: 'Lengkap' },
            ]
          : undefined,
    }));

    const scored = calculateIntelligentScores(items);
    const total = round2(scored.reduce((s, q) => s + (q.scoreWeight || 0), 0));
    assert.equal(total, 100, `Total weight for ${n} questions must be exact 100.00`);

    const essay = scored[scored.length - 1]!;
    if (essay.rubric && essay.rubric.length > 0) {
      const rubricTotal = round2(essay.rubric.reduce((s, r) => s + r.maxScore, 0));
      assert.equal(rubricTotal, essay.scoreWeight);
    }

    const analysis = analyzeScoringStatus(scored);
    assert.equal(analysis.status, 'VALID');
  }

  // Test invalid status when sum != 100 and NEEDS RECALCULATION on rubric mismatch
  const scored7 = calculateIntelligentScores(
    SAMPLE_QUESTION_SETS[0]!.questions.map((q, i) => ({
      ...q,
      difficulty: i === 0 ? 'Mudah' : 'Sulit',
    }))
  );
  const brokenTotal = scored7.map((q, idx) => (idx === 0 ? { ...q, scoreWeight: 1 } : q));
  assert.equal(analyzeScoringStatus(brokenTotal).status, 'INVALID');

  const scaled = scaleRubricToWeight(
    [
      { criterion: 'A', maxScore: 10, descriptor: 'A' },
      { criterion: 'B', maxScore: 20, descriptor: 'B' },
    ],
    27.27
  );
  assert.equal(round2((scaled ?? []).reduce((s, r) => s + r.maxScore, 0)), 27.27);
});

test('kopTemplates provides 7 starter templates, official branding, cloning, blank school validity & page rules', () => {
  assert.equal(APP_OFFICIAL_NAME, 'SMART QUEST GENERATOR');
  assert.equal(
    APP_OFFICIAL_BRANDING,
    'By Klick Assets Generator Ft. Lilin Annisa Putri S., S.Pd.'
  );

  const starters = createStarterKopTemplates();
  assert.equal(starters.length, 7);
  assert.equal(starters[0]?.isDefault, true);
  assert.equal(starters[0]?.schoolName, '');

  const cloned = cloneKopTemplate(starters[1]!, 'Kop Sumatif Ganjil');
  assert.notEqual(cloned.id, starters[1]!.id);
  assert.equal(cloned.name, 'Kop Sumatif Ganjil');
  assert.equal(cloned.layout, 'B');

  assert.equal(validateKopTemplate(cloned).valid, true);
  assert.equal(validateKopTemplate({ ...cloned, schoolName: '' }).valid, true);

  assert.equal(shouldRenderKopForDoc(starters[0], 'examPaper', 1), true);
  assert.equal(shouldRenderKopForDoc(starters[0], 'examPaper', 2), false);
  const allPagesKop = { ...starters[0]!, pageRule: 'all' as const };
  assert.equal(shouldRenderKopForDoc(allPagesKop, 'examPaper', 2), true);
});

test('logoManager validates magic bytes, extracts PNG dimensions, preserves aspect ratio & runs non-destructive legacy migration', () => {
  // Valid PNG header + IHDR (320 x 160)
  const pngHeader = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x01, 0x40, // width 320
    0x00, 0x00, 0x00, 0xa0, // height 160
  ]);
  const pngSig = detectLogoMagicBytes(pngHeader);
  assert.equal(pngSig.valid, true);
  assert.equal(pngSig.detectedFormat, 'png');
  assert.deepEqual(extractImageDimensionsFromBytes(pngHeader), { width: 320, height: 160 });

  // Spoofed/corrupt non-image bytes must be rejected
  const spoofedPng = new Uint8Array([0x3c, 0x73, 0x76, 0x67, 0x3e, 0x66, 0x61, 0x6b, 0x65]);
  assert.equal(detectLogoMagicBytes(spoofedPng).valid, false);

  // Proportional containment box fit
  const fitted = fitImageBoxDimensions(320, 160, 20, 20);
  assert.equal(fitted.width, 20);
  assert.equal(fitted.height, 10);

  // Legacy default scrubbing strips prefilled Randusari/Lilin Annisa without wiping user data
  const legacyParams = scrubLegacyParamsDefaults({
    ...DEFAULT_GENERATOR_PARAMS,
    schoolName: 'UPT SD NEGERI RANDUSARI',
    docIdentity: {
      ...DEFAULT_DOC_IDENTITY,
      schoolName: 'UPT SD NEGERI RANDUSARI',
      teacherName: 'LILIN ANNISA PUTRI S., S.Pd.',
      teacherUnit: 'UPT SD NEGERI RANDUSARI',
    },
  });
  assert.equal(legacyParams.changed, true);
  assert.equal(legacyParams.cleaned.schoolName, '');
  assert.equal(legacyParams.cleaned.docIdentity?.teacherName, '');
  assert.equal(legacyParams.cleaned.docIdentity?.teacherUnit, '');

  const customParams = scrubLegacyParamsDefaults({
    ...DEFAULT_GENERATOR_PARAMS,
    schoolName: 'SDN Harapan Jaya',
    docIdentity: {
      ...DEFAULT_DOC_IDENTITY,
      schoolName: 'SDN Harapan Jaya',
      teacherName: 'Budi Santoso, S.Pd.',
      teacherUnit: 'SDN Harapan Jaya',
    },
  });
  assert.equal(customParams.changed, false);
  assert.equal(customParams.cleaned.docIdentity?.teacherName, 'Budi Santoso, S.Pd.');

  const starterKops = createStarterKopTemplates();
  const dirtyKops = starterKops.map((k, idx) =>
    idx === 0 ? { ...k, schoolName: 'UPT SD NEGERI RANDUSARI' } : { ...k, schoolName: 'SDN Maju' }
  );
  const scrubbedKops = scrubLegacyKopTemplatesDefaults(dirtyKops);
  assert.equal(scrubbedKops.changed, true);
  assert.equal(scrubbedKops.cleaned[0]?.schoolName, '');
  assert.equal(scrubbedKops.cleaned[1]?.schoolName, 'SDN Maju');

  const cardDef = scrubLegacyExamCardConfigDefaults({
    ...createDefaultExamCardConfig(),
    issuePlace: 'Randusari',
  });
  assert.equal(cardDef.changed, true);
  assert.equal(cardDef.cleaned.issuePlace, '');
});

test('examCard validates duplicates/missing fields, maps spreadsheet rows & binds bulk photos strictly per participant', () => {
  const mapping = detectSpreadsheetMapping([
    'Nama Lengkap',
    'Nomor Peserta',
    'NIS',
    'Kelas',
    'Ruang',
    'No. Meja',
    'Nama File Foto',
  ]);
  assert.equal(mapping.name, 'Nama Lengkap');
  assert.equal(mapping.participantNumber, 'Nomor Peserta');

  const rows = [
    {
      'Nama Lengkap': 'Aulia Rahma',
      'Nomor Peserta': '2026-001',
      NIS: '1001',
      Kelas: 'Kelas V',
      Ruang: 'Ruang 1',
      'No. Meja': '01',
      'Nama File Foto': 'aulia.jpg',
    },
    {
      'Nama Lengkap': 'Budi Santoso',
      'Nomor Peserta': '2026-001', // duplicate!
      NIS: '1002',
      Kelas: '', // missing!
      Ruang: 'Ruang 1',
      'No. Meja': '02',
      'Nama File Foto': '',
    },
  ];
  const built: ExamCardParticipant[] = buildParticipantsFromRows(rows, mapping);
  assert.equal(built.length, 2);

  const validation = validateParticipants(built);
  assert.equal(validation.valid, false);
  assert.ok(validation.duplicateNumbers.includes('2026-001'));
  assert.equal(validation.missingFieldCount, 1);

  const { updated, matchedCount } = matchBulkPhotosToParticipants(
    [built[0]!, { ...built[1]!, participantNumber: '2026-002', className: 'Kelas V' }],
    [
      { fileName: 'aulia.jpg', dataUrl: 'data:image/jpeg;base64,AULIA' },
      { fileName: '2026-002.png', dataUrl: 'data:image/png;base64,BUDI' },
    ]
  );
  assert.equal(matchedCount, 2);
  assert.equal(updated[0]?.photoDataUrl, 'data:image/jpeg;base64,AULIA');
  assert.equal(updated[1]?.photoDataUrl, 'data:image/png;base64,BUDI');
});


