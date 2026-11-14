import type {
  AssessmentType,
  CognitiveTier,
  DifficultyLevel,
  DocumentExportConfig,
  DocumentIdentity,
  EducationLevel,
  GeneratorParams,
  ImageApprovalStatus,
  ImageAspectRatio,
  ImageDisplaySize,
  ImagePlacement,
  LearningPlanMapping,
  QuestionImage,
  QuestionImageHistoryEntry,
  QuestionImageType,
  QuestionItem,
  QuestionQaReport,
  QuestionRevisionEntry,
  QuestionSet,
  QuestionSubType,
  ReferenceAttachment,
  StructuredVisualPrompt,
  SubtypeCountAllocation,
  TeacherScoreBoxConfig,
  VisualNecessity,
  VisualValidationReport,
} from '../types/question.ts';
import {
  ASSESSMENT_TYPES,
  DEFAULT_DOC_IDENTITY,
  DEFAULT_EXPORT_CONFIG,
  DEFAULT_LEARNING_PLAN,
  QUESTION_IMAGE_TYPES,
  QUESTION_SUBTYPES,
  getPhaseForGrade,
  normalizeEducationLevel,
} from './curriculum.ts';

const DANGEROUS_TAG_PATTERN =
  /<\s*(script|iframe|object|embed|style|link|meta|svg|form)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi;
const ANY_HTML_TAG_PATTERN = /<[^>]*>/g;
const EVENT_HANDLER_PATTERN = /\bon\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const JAVASCRIPT_PROTOCOL_PATTERN = /(?:javascript|vbscript|data\s*:\s*text\/html)\s*:/gi;

export function stripHtmlTags(input: string): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(DANGEROUS_TAG_PATTERN, '')
    .replace(EVENT_HANDLER_PATTERN, '')
    .replace(JAVASCRIPT_PROTOCOL_PATTERN, '')
    .replace(ANY_HTML_TAG_PATTERN, '');
}

export function sanitizeText(input: string, maxLength = 2500): string {
  if (typeof input !== 'string') return '';
  const cleaned = stripHtmlTags(input)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\r\n/g, '\n')
    .trim();

  if (cleaned.length <= maxLength) {
    return cleaned;
  }
  return cleaned.slice(0, maxLength).trim();
}

export function sanitizeSvgMarkup(rawSvg: string, width = 800, height = 600): string {
  if (typeof rawSvg !== 'string') return '';
  let cleaned = rawSvg
    .replace(/<\s*(script|foreignObject|iframe|object|embed|link|meta|audio|video)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*(script|foreignObject|iframe|object|embed|link|meta)\b[^>]*\/?>/gi, '')
    .replace(/\bon\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(?:javascript|vbscript|data\s*:\s*text\/html)\s*:/gi, '')
    .replace(/(?:href|xlink:href)\s*=\s*(?:"https?:[^"]*"|'https?:[^']*')/gi, '');

  const svgMatch = cleaned.match(/<svg[\s\S]*?<\/svg>/i);
  if (!svgMatch) {
    return '';
  }
  cleaned = svgMatch[0];
  if (!/\bxmlns=/.test(cleaned)) {
    cleaned = cleaned.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  if (!/\bviewBox=/i.test(cleaned)) {
    cleaned = cleaned.replace('<svg', `<svg viewBox="0 0 ${width} ${height}"`);
  }
  return cleaned.slice(0, 60_000);
}

const VALID_LEVELS: EducationLevel[] = [
  'PAUD/TK',
  'SD/MI',
  'SMP/MTs',
  'SMA/MA',
  'SMK',
  'Kesetaraan',
  'SLB/Khusus',
  'SD',
  'SMP',
  'SMA',
];

const VALID_DIFFICULTIES: DifficultyLevel[] = ['Mudah', 'Sedang', 'Sulit', 'HOTS'];

function sanitizeSafeImageDataUrl(raw: unknown, maxLen = 2_500_000): string {
  if (typeof raw !== 'string') return '';
  if (
    /^data:image\/(png|jpeg|jpg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(raw) &&
    raw.length <= maxLen
  ) {
    return raw;
  }
  return '';
}

function sanitizeLearningPlan(
  raw: Partial<LearningPlanMapping> | undefined,
  level: EducationLevel,
  grade: string
): LearningPlanMapping {
  return {
    phase:
      sanitizeText(raw?.phase ?? getPhaseForGrade(level, grade), 40) ||
      getPhaseForGrade(level, grade),
    cp: sanitizeText(raw?.cp ?? '', 1000),
    tp: sanitizeText(raw?.tp ?? '', 1000),
    atp: sanitizeText(raw?.atp ?? '', 1000),
    kktp: sanitizeText(raw?.kktp ?? '', 800),
    ki: sanitizeText(raw?.ki ?? '', 800),
    kd: sanitizeText(raw?.kd ?? '', 800),
    ipk: sanitizeText(raw?.ipk ?? '', 800),
    assistWithAi: raw?.assistWithAi ?? DEFAULT_LEARNING_PLAN.assistWithAi,
  };
}

export function sanitizeDocIdentity(
  raw: Partial<DocumentIdentity> | undefined,
  fallbackSchool: string
): DocumentIdentity {
  const schoolName = sanitizeText(raw?.schoolName ?? fallbackSchool ?? '', 120);

  return {
    schoolName,
    schoolAddress: sanitizeText(raw?.schoolAddress ?? '', 180),
    schoolNpsn: sanitizeText(raw?.schoolNpsn ?? '', 30),
    schoolExtraInfo: sanitizeText(raw?.schoolExtraInfo ?? '', 180),
    teacherName: sanitizeText(raw?.teacherName ?? '', 100),
    // NIP is optional: never insert placeholder if empty
    teacherNip: sanitizeText(raw?.teacherNip ?? '', 50),
    teacherRank: sanitizeText(raw?.teacherRank ?? '', 80),
    teacherRole: sanitizeText(raw?.teacherRole ?? '', 80),
    teacherSubject: sanitizeText(raw?.teacherSubject ?? '', 100),
    teacherUnit: sanitizeText(raw?.teacherUnit ?? '', 120),
    teacherSignatureDataUrl: sanitizeSafeImageDataUrl(raw?.teacherSignatureDataUrl, 600_000),
    headmasterName: sanitizeText(raw?.headmasterName ?? '', 100),
    headmasterNip: sanitizeText(raw?.headmasterNip ?? '', 50),
    semester: raw?.semester === 'Genap' ? 'Genap' : 'Ganjil',
    academicYear:
      sanitizeText(raw?.academicYear ?? DEFAULT_DOC_IDENTITY.academicYear, 20) || '2026/2027',
    timeAllocation:
      sanitizeText(raw?.timeAllocation ?? DEFAULT_DOC_IDENTITY.timeAllocation, 40) ||
      '90 Menit',
    schoolLogoDataUrl: sanitizeSafeImageDataUrl(raw?.schoolLogoDataUrl, 1_500_000),
    schoolLogoId: raw?.schoolLogoId ? sanitizeText(raw.schoolLogoId, 64) : undefined,
    schoolLogoFit:
      raw?.schoolLogoFit === 'cover' || raw?.schoolLogoFit === 'original'
        ? raw.schoolLogoFit
        : 'contain',
  };
}

function sanitizeScoreBox(raw: Partial<TeacherScoreBoxConfig> | undefined): TeacherScoreBoxConfig {
  const def = DEFAULT_EXPORT_CONFIG.scoreBox;
  return {
    enabled: raw?.enabled ?? def.enabled,
    size: raw?.size === 'compact' || raw?.size === 'large' ? raw.size : 'medium',
    position:
      raw?.position === 'top-left' || raw?.position === 'after-header'
        ? raw.position
        : 'top-right',
    label: sanitizeText(raw?.label ?? def.label, 24) || 'NILAI',
    showInitials: raw?.showInitials ?? def.showInitials,
    showTeacherNote: raw?.showTeacherNote ?? def.showTeacherNote,
  };
}

export function sanitizeExportConfig(
  raw: Partial<DocumentExportConfig> | undefined,
  includeKey: boolean
): DocumentExportConfig {
  const layoutMode: DocumentExportConfig['layoutMode'] =
    raw?.layoutMode === 'single' || raw?.layoutMode === 'auto'
      ? raw.layoutMode
      : 'two-column';
  const columns: 1 | 2 =
    layoutMode === 'single' ? 1 : raw?.columns === 1 && !raw?.layoutMode ? 1 : 2;

  return {
    paperSize:
      raw?.paperSize === 'F4/Folio' || raw?.paperSize === 'Letter'
        ? raw.paperSize
        : 'A4',
    orientation: raw?.orientation === 'landscape' ? 'landscape' : 'portrait',
    marginPreset:
      raw?.marginPreset === 'Sempit' || raw?.marginPreset === 'Lebar'
        ? raw.marginPreset
        : 'Normal',
    layoutMode,
    columns,
    fontFamily:
      raw?.fontFamily === 'Calibri' || raw?.fontFamily === 'Arial'
        ? raw.fontFamily
        : 'Times New Roman',
    fontSize: raw?.fontSize === 11 ? 11 : 12,
    lineSpacing:
      raw?.lineSpacing === 'compact' || raw?.lineSpacing === 'relaxed'
        ? raw.lineSpacing
        : 'normal',
    includeStudentIdentity:
      raw?.includeStudentIdentity ?? DEFAULT_EXPORT_CONFIG.includeStudentIdentity,
    includeSignatureBlock:
      raw?.includeSignatureBlock ?? DEFAULT_EXPORT_CONFIG.includeSignatureBlock,
    includeAnswerKey: raw?.includeAnswerKey ?? includeKey,
    includeBlueprint: raw?.includeBlueprint ?? DEFAULT_EXPORT_CONFIG.includeBlueprint,
    includeRubric: raw?.includeRubric ?? DEFAULT_EXPORT_CONFIG.includeRubric,
    includeAnswerSheet: raw?.includeAnswerSheet ?? DEFAULT_EXPORT_CONFIG.includeAnswerSheet,
    includeImages: raw?.includeImages ?? DEFAULT_EXPORT_CONFIG.includeImages,
    includeHeaderFooter: raw?.includeHeaderFooter ?? DEFAULT_EXPORT_CONFIG.includeHeaderFooter,
    includeAppBranding: raw?.includeAppBranding ?? DEFAULT_EXPORT_CONFIG.includeAppBranding ?? true,
    activeKopId: raw?.activeKopId ? sanitizeText(raw.activeKopId, 64) : undefined,
    scoreBox: sanitizeScoreBox(raw?.scoreBox),
  };
}

export function sanitizeQuestionImage(
  raw: Partial<QuestionImage> | undefined,
  fallbackQuestionId: string
): QuestionImage | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const safeDataUrl = sanitizeSafeImageDataUrl(raw.dataUrl, 3_500_000);
  if (!safeDataUrl) return undefined;

  const format: QuestionImage['format'] =
    raw.format === 'jpg' ||
    raw.format === 'jpeg' ||
    raw.format === 'webp' ||
    raw.format === 'svg'
      ? raw.format
      : 'png';

  const placement: ImagePlacement = raw.placement === 'after' ? 'after' : 'before';
  const displaySize: ImageDisplaySize =
    raw.displaySize === 'small' || raw.displaySize === 'large' ? raw.displaySize : 'medium';

  const aspectRatio: ImageAspectRatio | undefined =
    raw.aspectRatio === '1:1' ||
    raw.aspectRatio === '4:3' ||
    raw.aspectRatio === '3:2' ||
    raw.aspectRatio === '16:9' ||
    raw.aspectRatio === 'Portrait'
      ? raw.aspectRatio
      : undefined;

  const imageType: QuestionImageType | undefined = QUESTION_IMAGE_TYPES.includes(
    raw.imageType as QuestionImageType
  )
    ? (raw.imageType as QuestionImageType)
    : undefined;

  const visualNecessity: VisualNecessity | undefined =
    raw.visualNecessity === 'REQUIRED' ||
    raw.visualNecessity === 'OPTIONAL' ||
    raw.visualNecessity === 'NOT REQUIRED'
      ? raw.visualNecessity
      : undefined;

  const approvalStatus: ImageApprovalStatus | undefined =
    raw.approvalStatus === 'approved' ||
    raw.approvalStatus === 'needs_revision' ||
    raw.approvalStatus === 'pending_review'
      ? raw.approvalStatus
      : undefined;

  const rawPrompt = raw.structuredPrompt;
  const structuredPrompt: StructuredVisualPrompt | undefined =
    rawPrompt && typeof rawPrompt === 'object'
      ? {
          question_id: sanitizeText(rawPrompt.question_id ?? fallbackQuestionId, 64),
          subject: sanitizeText(rawPrompt.subject ?? '', 100),
          grade: sanitizeText(rawPrompt.grade ?? '', 60),
          material: sanitizeText(rawPrompt.material ?? '', 200),
          learning_objective: sanitizeText(rawPrompt.learning_objective ?? '', 300),
          question_text: sanitizeText(rawPrompt.question_text ?? '', 1200),
          answer_options: Array.isArray(rawPrompt.answer_options)
            ? rawPrompt.answer_options.slice(0, 6).map((o) => sanitizeText(String(o), 300))
            : [],
          answer_key: sanitizeText(rawPrompt.answer_key ?? '', 200),
          visual_necessity:
            rawPrompt.visual_necessity === 'REQUIRED' ||
            rawPrompt.visual_necessity === 'OPTIONAL' ||
            rawPrompt.visual_necessity === 'NOT REQUIRED'
              ? rawPrompt.visual_necessity
              : visualNecessity ?? 'OPTIONAL',
          visual_purpose: sanitizeText(rawPrompt.visual_purpose ?? '', 300),
          required_objects: Array.isArray(rawPrompt.required_objects)
            ? rawPrompt.required_objects.slice(0, 12).map((x) => sanitizeText(String(x), 100))
            : [],
          required_actions: Array.isArray(rawPrompt.required_actions)
            ? rawPrompt.required_actions.slice(0, 10).map((x) => sanitizeText(String(x), 100))
            : [],
          required_conditions: Array.isArray(rawPrompt.required_conditions)
            ? rawPrompt.required_conditions.slice(0, 10).map((x) => sanitizeText(String(x), 100))
            : [],
          required_quantities: Array.isArray(rawPrompt.required_quantities)
            ? rawPrompt.required_quantities.slice(0, 10).map((x) => sanitizeText(String(x), 100))
            : [],
          visual_type: QUESTION_IMAGE_TYPES.includes(rawPrompt.visual_type as QuestionImageType)
            ? (rawPrompt.visual_type as QuestionImageType)
            : imageType ?? 'Ilustrasi edukasi',
          composition: sanitizeText(rawPrompt.composition ?? '', 250),
          style: sanitizeText(rawPrompt.style ?? '', 140),
          aspect_ratio:
            rawPrompt.aspect_ratio === '1:1' ||
            rawPrompt.aspect_ratio === '4:3' ||
            rawPrompt.aspect_ratio === '3:2' ||
            rawPrompt.aspect_ratio === '16:9' ||
            rawPrompt.aspect_ratio === 'Portrait'
              ? rawPrompt.aspect_ratio
              : aspectRatio ?? '4:3',
          negative_constraints: Array.isArray(rawPrompt.negative_constraints)
            ? rawPrompt.negative_constraints.slice(0, 10).map((x) => sanitizeText(String(x), 120))
            : [],
        }
      : undefined;

  const rawReport = raw.validationReport;
  const validationReport: VisualValidationReport | undefined =
    rawReport && typeof rawReport === 'object'
      ? {
          semanticStatus:
            rawReport.semanticStatus === 'failed' || rawReport.semanticStatus === 'warning'
              ? rawReport.semanticStatus
              : 'passed',
          semanticScore: Math.max(0, Math.min(100, Math.round(Number(rawReport.semanticScore) || 85))),
          semanticNotes: Array.isArray(rawReport.semanticNotes)
            ? rawReport.semanticNotes.slice(0, 6).map((n) => sanitizeText(String(n), 240))
            : [],
          technicalStatus: rawReport.technicalStatus === 'failed' ? 'failed' : 'passed',
          technicalChecks: Array.isArray(rawReport.technicalChecks)
            ? rawReport.technicalChecks.slice(0, 6).map((c) => sanitizeText(String(c), 200))
            : [],
        }
      : undefined;

  const history: QuestionImageHistoryEntry[] | undefined = Array.isArray(raw.history)
    ? raw.history
        .slice(0, 5)
        .map((h): QuestionImageHistoryEntry | null => {
          const histUrl = sanitizeSafeImageDataUrl(h?.dataUrl, 3_500_000);
          if (!histUrl) return null;
          return {
            id: sanitizeText(h.id ?? `hist-${Date.now()}`, 64),
            fileName: sanitizeText(h.fileName ?? 'riwayat.png', 120),
            format:
              h.format === 'jpg' ||
              h.format === 'jpeg' ||
              h.format === 'webp' ||
              h.format === 'svg'
                ? h.format
                : 'png',
            mimeType: sanitizeText(h.mimeType ?? 'image/png', 60),
            sizeBytes: Math.max(0, Number(h.sizeBytes) || 0),
            width: Number.isFinite(Number(h.width)) ? Number(h.width) : undefined,
            height: Number.isFinite(Number(h.height)) ? Number(h.height) : undefined,
            source: h.source === 'ai' ? 'ai' : 'upload',
            dataUrl: histUrl,
            caption: sanitizeText(h.caption ?? '', 240),
            createdAt: sanitizeText(h.createdAt ?? new Date().toISOString(), 40),
            approvalStatus:
              h.approvalStatus === 'approved' ||
              h.approvalStatus === 'needs_revision' ||
              h.approvalStatus === 'pending_review'
                ? h.approvalStatus
                : undefined,
            analysisSummary: h.analysisSummary ? sanitizeText(h.analysisSummary, 400) : undefined,
          };
        })
        .filter((x): x is QuestionImageHistoryEntry => x !== null)
    : undefined;

  return {
    id: sanitizeText(raw.id ?? `img-${Date.now()}`, 64) || `img-${Date.now()}`,
    questionId: sanitizeText(raw.questionId ?? fallbackQuestionId, 64) || fallbackQuestionId,
    fileName: sanitizeText(raw.fileName ?? 'gambar-soal.png', 120) || 'gambar-soal.png',
    format,
    mimeType: sanitizeText(raw.mimeType ?? 'image/png', 60) || 'image/png',
    sizeBytes: Math.max(0, Number(raw.sizeBytes) || 0),
    width: Number.isFinite(Number(raw.width)) ? Number(raw.width) : undefined,
    height: Number.isFinite(Number(raw.height)) ? Number(raw.height) : undefined,
    source: raw.source === 'ai' ? 'ai' : 'upload',
    dataUrl: safeDataUrl,
    caption: sanitizeText(raw.caption ?? '', 240),
    placement,
    displaySize,
    imageType,
    visualStyle: raw.visualStyle ? sanitizeText(raw.visualStyle, 140) : undefined,
    aspectRatio,
    detailLevel:
      raw.detailLevel === 'Sederhana' || raw.detailLevel === 'Detail'
        ? raw.detailLevel
        : raw.detailLevel === 'Standar'
          ? 'Standar'
          : undefined,
    backgroundStyle:
      raw.backgroundStyle === 'Lembut Edukatif' ||
      raw.backgroundStyle === 'Transparan / Netral'
        ? raw.backgroundStyle
        : raw.backgroundStyle === 'Putih Bersih'
          ? 'Putih Bersih'
          : undefined,
    orientation:
      raw.orientation === 'Square' || raw.orientation === 'Portrait'
        ? raw.orientation
        : raw.orientation === 'Landscape'
          ? 'Landscape'
          : undefined,
    includeLabels: typeof raw.includeLabels === 'boolean' ? raw.includeLabels : undefined,
    analysisSummary: raw.analysisSummary ? sanitizeText(raw.analysisSummary, 400) : undefined,
    visualNecessity,
    structuredPrompt,
    validationReport,
    approvalStatus,
    needsQuestionSyncReview:
      typeof raw.needsQuestionSyncReview === 'boolean' ? raw.needsQuestionSyncReview : undefined,
    questionSnapshotHash: raw.questionSnapshotHash
      ? sanitizeText(raw.questionSnapshotHash, 32)
      : undefined,
    regenerationCount: Number.isFinite(Number(raw.regenerationCount))
      ? Math.max(0, Math.min(20, Math.round(Number(raw.regenerationCount))))
      : undefined,
    customEditInstruction: raw.customEditInstruction
      ? sanitizeText(raw.customEditInstruction, 400)
      : undefined,
    history,
    createdAt: sanitizeText(raw.createdAt ?? new Date().toISOString(), 40),
  };
}

export function sanitizeGeneratorParams(raw: Partial<GeneratorParams>): GeneratorParams {
  const educationLevel: EducationLevel = VALID_LEVELS.includes(
    raw.educationLevel as EducationLevel
  )
    ? (raw.educationLevel as EducationLevel)
    : 'SD/MI';

  const normalizedLevel = normalizeEducationLevel(educationLevel);
  const difficulty: DifficultyLevel = VALID_DIFFICULTIES.includes(
    raw.difficulty as DifficultyLevel
  )
    ? (raw.difficulty as DifficultyLevel)
    : 'Sedang';

  const count = Number.isFinite(Number(raw.questionCount))
    ? Math.max(1, Math.min(50, Math.round(Number(raw.questionCount))))
    : 5;

  const grade = sanitizeText(raw.grade ?? 'Kelas V', 50) || 'Kelas V';
  const schoolName = sanitizeText(raw.schoolName ?? raw.docIdentity?.schoolName ?? '', 120);
  const includeAnswerKey = Boolean(raw.includeAnswerKey ?? true);

  const selectedSubTypes: QuestionSubType[] = Array.isArray(raw.selectedSubTypes)
    ? raw.selectedSubTypes.filter((t): t is QuestionSubType =>
        QUESTION_SUBTYPES.includes(t)
      )
    : ['Pilihan Ganda'];

  const subTypeCounts: SubtypeCountAllocation[] | undefined = Array.isArray(raw.subTypeCounts)
    ? raw.subTypeCounts
        .filter(
          (item): item is SubtypeCountAllocation =>
            Boolean(item) &&
            QUESTION_SUBTYPES.includes(item.subType) &&
            Number.isFinite(Number(item.count)) &&
            Number(item.count) > 0
        )
        .map((item) => ({
          subType: item.subType,
          count: Math.max(1, Math.min(50, Math.round(Number(item.count)))),
        }))
    : undefined;

  const assessmentType: AssessmentType = ASSESSMENT_TYPES.includes(
    raw.assessmentType as AssessmentType
  )
    ? (raw.assessmentType as AssessmentType)
    : 'Asesmen Formatif';

  const distLots = Math.max(0, Math.min(100, Number(raw.cognitiveDistribution?.LOTS ?? 30) || 0));
  const distMots = Math.max(0, Math.min(100, Number(raw.cognitiveDistribution?.MOTS ?? 40) || 0));
  const distHots = Math.max(0, Math.min(100, Number(raw.cognitiveDistribution?.HOTS ?? 30) || 0));

  return {
    educationLevel: normalizedLevel === educationLevel ? educationLevel : educationLevel,
    grade,
    curriculum:
      raw.curriculum === 'Kurikulum 2013 Revisi' ||
      raw.curriculum === 'Kurikulum Satuan Pendidikan (Khusus / Lainnya)' ||
      raw.curriculum === 'Cambridge / Internasional'
        ? raw.curriculum
        : 'Kurikulum Merdeka',
    subject: sanitizeText(raw.subject ?? '', 100),
    topic: sanitizeText(raw.topic ?? '', 500),
    questionFormat:
      raw.questionFormat === 'Esai / Uraian' || raw.questionFormat === 'Campuran'
        ? raw.questionFormat
        : 'Pilihan Ganda',
    selectedSubTypes: selectedSubTypes.length > 0 ? selectedSubTypes : ['Pilihan Ganda'],
    subTypeCounts: subTypeCounts && subTypeCounts.length > 0 ? subTypeCounts : undefined,
    assessmentType,
    akmMode:
      raw.akmMode === 'AKM Literasi Membaca' ||
      raw.akmMode === 'AKM Numerasi' ||
      raw.akmMode === 'Tematik SD' ||
      raw.akmMode === 'LKPD Interaktif'
        ? raw.akmMode
        : 'Reguler',
    difficulty,
    cognitiveDistribution: { LOTS: distLots, MOTS: distMots, HOTS: distHots },
    questionCount: count,
    includeAnswerKey,
    schoolName,
    additionalNotes: sanitizeText(raw.additionalNotes ?? '', 400),
    languageOption:
      raw.languageOption === 'Bahasa Inggris' || raw.languageOption === 'Muatan Bahasa Daerah'
        ? raw.languageOption
        : 'Bahasa Indonesia Baku',
    learningPlan: sanitizeLearningPlan(raw.learningPlan, educationLevel, grade),
    docIdentity: sanitizeDocIdentity(raw.docIdentity, schoolName),
    exportConfig: sanitizeExportConfig(raw.exportConfig, includeAnswerKey),
  };
}

export function sanitizeQuestionItem(
  item: Partial<QuestionItem>,
  index: number
): QuestionItem {
  const safeDifficulty: DifficultyLevel = VALID_DIFFICULTIES.includes(
    item.difficulty as DifficultyLevel
  )
    ? (item.difficulty as DifficultyLevel)
    : 'Sedang';

  const cognitive =
    item.cognitiveLevel && /^C[1-6]$/.test(item.cognitiveLevel)
      ? item.cognitiveLevel
      : 'C2';

  const cognitiveTier: CognitiveTier =
    item.cognitiveTier === 'LOTS' || item.cognitiveTier === 'MOTS' || item.cognitiveTier === 'HOTS'
      ? item.cognitiveTier
      : cognitive === 'C1' || cognitive === 'C2'
        ? 'LOTS'
        : cognitive === 'C3'
          ? 'MOTS'
          : 'HOTS';

  const type: 'Pilihan Ganda' | 'Esai' =
    item.type === 'Esai' ? 'Esai' : 'Pilihan Ganda';

  const questionSubType: QuestionSubType = QUESTION_SUBTYPES.includes(
    item.questionSubType as QuestionSubType
  )
    ? (item.questionSubType as QuestionSubType)
    : type === 'Esai'
      ? 'Uraian'
      : 'Pilihan Ganda';

  const options = Array.isArray(item.options)
    ? item.options.slice(0, 6).map((opt, optIdx) => ({
        label:
          sanitizeText(opt?.label ?? String.fromCharCode(65 + optIdx), 8) ||
          String.fromCharCode(65 + optIdx),
        text: sanitizeText(opt?.text ?? '', 600),
      }))
    : [];

  const matchingPairs = Array.isArray(item.matchingPairs)
    ? item.matchingPairs.slice(0, 8).map((pair) => ({
        prompt: sanitizeText(pair?.prompt ?? '', 300),
        match: sanitizeText(pair?.match ?? '', 300),
      }))
    : undefined;

  const rubric = Array.isArray(item.rubric)
    ? item.rubric.slice(0, 6).map((r) => ({
        criterion: sanitizeText(r?.criterion ?? '', 200),
        maxScore: Math.max(0.01, Math.min(100, Math.round((Number(r?.maxScore) || 10) * 100) / 100)),
        descriptor: sanitizeText(r?.descriptor ?? '', 400),
      }))
    : undefined;

  const scoreWeight = Number.isFinite(Number(item.scoreWeight))
    ? Math.max(0.01, Math.min(100, Math.round(Number(item.scoreWeight) * 100) / 100))
    : type === 'Esai'
      ? 20
      : 10;

  const difficultyFactor: 1 | 2 | 3 =
    safeDifficulty === 'Mudah' ? 1 : safeDifficulty === 'Sedang' ? 2 : 3;

  const safeId = sanitizeText(item.id ?? `q-${index + 1}`, 64) || `q-${index + 1}`;

  const revisionHistory: QuestionRevisionEntry[] | undefined = Array.isArray(item.revisionHistory)
    ? item.revisionHistory.slice(0, 8).map((rev) => ({
        id: sanitizeText(rev?.id ?? `rev-${Date.now()}`, 48),
        questionText: sanitizeText(rev?.questionText ?? '', 1800),
        correctAnswer: sanitizeText(rev?.correctAnswer ?? '', 1500),
        explanation: sanitizeText(rev?.explanation ?? '', 2000),
        changedAt: sanitizeText(rev?.changedAt ?? new Date().toISOString(), 40),
        actionLabel: sanitizeText(rev?.actionLabel ?? 'Revisi', 80),
      }))
    : undefined;

  const qaReport: QuestionQaReport | undefined =
    item.qaReport && typeof item.qaReport === 'object'
      ? {
          qualityScore: Math.max(
            0,
            Math.min(100, Math.round(Number(item.qaReport.qualityScore) || 85))
          ),
          status: item.qaReport.status === 'perlu_revisi' ? 'perlu_revisi' : 'layak',
          summary: sanitizeText(item.qaReport.summary ?? '', 400),
          issues: Array.isArray(item.qaReport.issues)
            ? item.qaReport.issues.slice(0, 8).map((x) => sanitizeText(String(x), 240))
            : [],
          suggestions: Array.isArray(item.qaReport.suggestions)
            ? item.qaReport.suggestions.slice(0, 8).map((x) => sanitizeText(String(x), 240))
            : [],
          checkedAt: sanitizeText(item.qaReport.checkedAt ?? new Date().toISOString(), 40),
        }
      : undefined;

  return {
    id: safeId,
    number: Number.isFinite(Number(item.number)) ? Number(item.number) : index + 1,
    type,
    questionSubType,
    difficulty: safeDifficulty,
    cognitiveLevel: cognitive,
    cognitiveTier,
    stimulus: item.stimulus ? sanitizeText(item.stimulus, 2000) : undefined,
    questionText: sanitizeText(item.questionText ?? '', 1800),
    options: type === 'Pilihan Ganda' || questionSubType === 'Benar dan Salah' ? options : [],
    matchingPairs,
    correctAnswer: sanitizeText(item.correctAnswer ?? '', 1500),
    explanation: sanitizeText(item.explanation ?? '', 2000),
    material: item.material ? sanitizeText(item.material, 200) : undefined,
    indicator: item.indicator ? sanitizeText(item.indicator, 400) : undefined,
    learningObjective: item.learningObjective ? sanitizeText(item.learningObjective, 400) : undefined,
    scoreWeight,
    difficultyFactor,
    scoringCriteria: item.scoringCriteria ? sanitizeText(item.scoringCriteria, 300) : undefined,
    rubric,
    supportingImage: sanitizeQuestionImage(item.supportingImage, safeId),
    isFavorite: typeof item.isFavorite === 'boolean' ? item.isFavorite : undefined,
    revisionHistory,
    qaReport,
  };
}

export function sanitizeQuestionSet(set: QuestionSet): QuestionSet {
  return {
    id: sanitizeText(set.id, 64),
    title: sanitizeText(set.title, 200),
    createdAt: sanitizeText(set.createdAt, 40),
    params: sanitizeGeneratorParams(set.params),
    questions: Array.isArray(set.questions)
      ? set.questions.map((q, idx) => sanitizeQuestionItem(q, idx))
      : [],
    deepAnalysis: set.deepAnalysis
      ? {
          pedagogicalSummary: sanitizeText(set.deepAnalysis.pedagogicalSummary, 1000),
          curriculumAlignmentNote: sanitizeText(set.deepAnalysis.curriculumAlignmentNote, 1000),
          qualityControlChecks: Array.isArray(set.deepAnalysis.qualityControlChecks)
            ? set.deepAnalysis.qualityControlChecks.slice(0, 8).map((c) => sanitizeText(c, 300))
            : [],
          verificationReminder: sanitizeText(set.deepAnalysis.verificationReminder, 600),
        }
      : undefined,
  };
}

export function sanitizeReferenceAttachments(
  raw: unknown
): ReferenceAttachment[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 3).map((item, idx) => {
    const rec = (item ?? {}) as Partial<ReferenceAttachment>;
    const mime = sanitizeText(rec.mimeType ?? 'text/plain', 100);
    const allowedBinaryMime =
      mime === 'application/pdf' ||
      mime === 'image/png' ||
      mime === 'image/jpeg' ||
      mime === 'image/webp';
    const safeBase64 =
      allowedBinaryMime &&
      typeof rec.base64Data === 'string' &&
      /^[A-Za-z0-9+/=]+$/.test(rec.base64Data) &&
      rec.base64Data.length <= 4_500_000
        ? rec.base64Data
        : undefined;

    return {
      id: sanitizeText(rec.id ?? `att-${idx}`, 48),
      name: sanitizeText(rec.name ?? 'dokumen-referensi', 120),
      mimeType: mime,
      sizeBytes: Math.max(0, Number(rec.sizeBytes) || 0),
      extractedText: sanitizeText(rec.extractedText ?? '', 8000),
      base64Data: safeBase64,
    };
  });
}
