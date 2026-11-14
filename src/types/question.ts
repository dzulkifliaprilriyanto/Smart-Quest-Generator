export type EducationLevel =
  | 'PAUD/TK'
  | 'SD/MI'
  | 'SMP/MTs'
  | 'SMA/MA'
  | 'SMK'
  | 'Kesetaraan'
  | 'SLB/Khusus'
  | 'SD'
  | 'SMP'
  | 'SMA';

export type CurriculumType =
  | 'Kurikulum Merdeka'
  | 'Kurikulum 2013 Revisi'
  | 'Kurikulum Satuan Pendidikan (Khusus / Lainnya)'
  | 'Cambridge / Internasional';

export type QuestionFormat = 'Pilihan Ganda' | 'Esai / Uraian' | 'Campuran';

export type QuestionSubType =
  | 'Pilihan Ganda'
  | 'Pilihan Ganda Kompleks'
  | 'Benar dan Salah'
  | 'Menjodohkan'
  | 'Isian Singkat'
  | 'Isian Rumpang'
  | 'Jawaban Singkat'
  | 'Uraian'
  | 'Uraian Terstruktur'
  | 'Soal Berbasis Stimulus'
  | 'Soal Berbasis Bacaan'
  | 'Soal Berbasis Gambar'
  | 'Soal Berbasis Tabel'
  | 'Soal Berbasis Grafik'
  | 'Soal Berbasis Diagram'
  | 'Studi Kasus'
  | 'Pemecahan Masalah'
  | 'Praktik dan Kinerja';

export type AssessmentType =
  | 'Asesmen Diagnostik'
  | 'Asesmen Formatif'
  | 'Asesmen Sumatif'
  | 'Asesmen Harian'
  | 'Asesmen Tengah Semester'
  | 'Asesmen Akhir Semester'
  | 'Asesmen Akhir Tahun'
  | 'Asesmen Remedial'
  | 'Asesmen Pengayaan'
  | 'Asesmen Praktik'
  | 'Asesmen Proyek'
  | 'Asesmen Portofolio';

export type AkmFocusMode =
  | 'Reguler'
  | 'AKM Literasi Membaca'
  | 'AKM Numerasi'
  | 'Tematik SD'
  | 'LKPD Interaktif';

export type DifficultyLevel = 'Mudah' | 'Sedang' | 'Sulit' | 'HOTS';

export type CognitiveLevel = 'C1' | 'C2' | 'C3' | 'C4' | 'C5' | 'C6';

export type CognitiveTier = 'LOTS' | 'MOTS' | 'HOTS';

export type ExportFormat = 'txt' | 'docx' | 'pdf' | 'xlsx';

export type ThemeMode = 'light' | 'dark' | 'system';

export type QuestionImageType =
  | 'Ilustrasi edukasi'
  | 'Gambar realistis'
  | 'Diagram'
  | 'Grafik'
  | 'Tabel visual'
  | 'Infografis'
  | 'Peta sederhana'
  | 'Bangun datar dan bangun ruang'
  | 'Ilustrasi eksperimen'
  | 'Ilustrasi aktivitas sehari-hari'
  | 'Gambar objek pembelajaran'
  | 'Ilustrasi anatomi atau sains';

export type ImageAspectRatio = '1:1' | '4:3' | '3:2' | '16:9' | 'Portrait';

export type ImageDetailLevel = 'Sederhana' | 'Standar' | 'Detail';

export type ImageBackgroundStyle =
  | 'Putih Bersih'
  | 'Lembut Edukatif'
  | 'Transparan / Netral';

export type ImagePlacement = 'before' | 'after';

export type ImageDisplaySize = 'small' | 'medium' | 'large';

export interface QuestionImageConfig {
  imageType: QuestionImageType;
  visualStyle: string;
  aspectRatio: ImageAspectRatio;
  detailLevel: ImageDetailLevel;
  backgroundStyle: ImageBackgroundStyle;
  orientation: 'Landscape' | 'Square' | 'Portrait';
  includeLabels: boolean;
}

export type VisualNecessity = 'REQUIRED' | 'OPTIONAL' | 'NOT REQUIRED';

export type ImageApprovalStatus = 'pending_review' | 'approved' | 'needs_revision';

export interface StructuredVisualPrompt {
  question_id: string;
  subject: string;
  grade: string;
  material: string;
  learning_objective: string;
  question_text: string;
  answer_options: string[];
  answer_key: string;
  visual_necessity: VisualNecessity;
  visual_purpose: string;
  required_objects: string[];
  required_actions: string[];
  required_conditions: string[];
  required_quantities: string[];
  visual_type: QuestionImageType;
  composition: string;
  style: string;
  aspect_ratio: ImageAspectRatio;
  negative_constraints: string[];
}

export interface VisualValidationReport {
  semanticStatus: 'passed' | 'warning' | 'failed';
  semanticScore: number;
  semanticNotes: string[];
  technicalStatus: 'passed' | 'failed';
  technicalChecks: string[];
}

export interface QuestionImageHistoryEntry {
  id: string;
  fileName: string;
  format: 'png' | 'jpg' | 'jpeg' | 'webp' | 'svg';
  mimeType: string;
  sizeBytes: number;
  width?: number;
  height?: number;
  source: 'ai' | 'upload';
  dataUrl: string;
  caption: string;
  createdAt: string;
  approvalStatus?: ImageApprovalStatus;
  analysisSummary?: string;
}

export interface QuestionImage {
  id: string;
  questionId: string;
  fileName: string;
  format: 'png' | 'jpg' | 'jpeg' | 'webp' | 'svg';
  mimeType: string;
  sizeBytes: number;
  width?: number;
  height?: number;
  source: 'ai' | 'upload';
  dataUrl: string;
  caption: string;
  placement: ImagePlacement;
  displaySize: ImageDisplaySize;
  imageType?: QuestionImageType;
  visualStyle?: string;
  aspectRatio?: ImageAspectRatio;
  detailLevel?: ImageDetailLevel;
  backgroundStyle?: ImageBackgroundStyle;
  orientation?: 'Landscape' | 'Square' | 'Portrait';
  includeLabels?: boolean;
  analysisSummary?: string;
  visualNecessity?: VisualNecessity;
  structuredPrompt?: StructuredVisualPrompt;
  validationReport?: VisualValidationReport;
  approvalStatus?: ImageApprovalStatus;
  needsQuestionSyncReview?: boolean;
  questionSnapshotHash?: string;
  regenerationCount?: number;
  customEditInstruction?: string;
  history?: QuestionImageHistoryEntry[];
  createdAt: string;
}

export interface CognitiveDistribution {
  LOTS: number;
  MOTS: number;
  HOTS: number;
}

export interface LearningPlanMapping {
  // Kurikulum Merdeka
  phase: string;
  cp: string;
  tp: string;
  atp: string;
  kktp: string;
  // Kurikulum 2013
  ki: string;
  kd: string;
  ipk: string;
  // Opsi Bantuan AI
  assistWithAi: boolean;
}

export interface DocumentIdentity {
  schoolName: string;
  schoolAddress: string;
  schoolNpsn: string;
  schoolExtraInfo: string;
  teacherName: string;
  teacherNip: string;
  teacherRank: string;
  teacherRole: string;
  teacherSubject: string;
  teacherUnit: string;
  teacherSignatureDataUrl: string;
  headmasterName: string;
  headmasterNip: string;
  semester: 'Ganjil' | 'Genap';
  academicYear: string;
  timeAllocation: string;
  schoolLogoDataUrl: string;
  schoolLogoId?: string;
  schoolLogoFit?: LogoFitMode;
}

export type LogoFitMode = 'contain' | 'cover' | 'original';
export type LogoSlot = 'school' | 'left' | 'right' | 'foundation' | 'alternative';

export interface StoredLogoAsset {
  logo_id: string;
  file_name: string;
  file_type: 'png' | 'jpg' | 'jpeg' | 'webp';
  mime_type: string;
  file_size: number;
  width: number;
  height: number;
  fit_mode: LogoFitMode;
  slot: LogoSlot;
  rotation_deg: number;
  dataUrl: string;
  uploaded_at: string;
  updated_at: string;
}

export interface TeacherScoreBoxConfig {
  enabled: boolean;
  size: 'compact' | 'medium' | 'large';
  position: 'top-right' | 'top-left' | 'after-header';
  label: string;
  showInitials: boolean;
  showTeacherNote: boolean;
}

export interface DocumentExportConfig {
  paperSize: 'A4' | 'F4/Folio' | 'Letter';
  orientation: 'portrait' | 'landscape';
  marginPreset: 'Normal' | 'Sempit' | 'Lebar';
  layoutMode: 'auto' | 'single' | 'two-column';
  columns: 1 | 2;
  fontFamily: 'Times New Roman' | 'Calibri' | 'Arial';
  fontSize: 11 | 12;
  lineSpacing: 'compact' | 'normal' | 'relaxed';
  includeStudentIdentity: boolean;
  includeSignatureBlock: boolean;
  includeAnswerKey: boolean;
  includeBlueprint: boolean;
  includeRubric: boolean;
  includeAnswerSheet: boolean;
  includeImages: boolean;
  includeHeaderFooter: boolean;
  includeAppBranding?: boolean;
  activeKopId?: string;
  scoreBox: TeacherScoreBoxConfig;
}

export interface ReferenceAttachment {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  extractedText: string;
  base64Data?: string;
}

export interface SubtypeCountAllocation {
  subType: QuestionSubType;
  count: number;
}

export interface GeneratorParams {
  educationLevel: EducationLevel;
  grade: string;
  curriculum: CurriculumType;
  subject: string;
  topic: string;
  questionFormat: QuestionFormat;
  selectedSubTypes: QuestionSubType[];
  subTypeCounts?: SubtypeCountAllocation[];
  assessmentType: AssessmentType;
  akmMode: AkmFocusMode;
  difficulty: DifficultyLevel;
  cognitiveDistribution: CognitiveDistribution;
  questionCount: number;
  includeAnswerKey: boolean;
  schoolName: string;
  additionalNotes: string;
  languageOption: 'Bahasa Indonesia Baku' | 'Bahasa Inggris' | 'Muatan Bahasa Daerah';
  learningPlan: LearningPlanMapping;
  docIdentity: DocumentIdentity;
  exportConfig: DocumentExportConfig;
}

export interface QuestionOption {
  label: string;
  text: string;
}

export interface MatchingPair {
  prompt: string;
  match: string;
}

export interface RubricCriterion {
  criterion: string;
  maxScore: number;
  descriptor: string;
}

export interface QuestionRevisionEntry {
  id: string;
  questionText: string;
  correctAnswer: string;
  explanation: string;
  changedAt: string;
  actionLabel: string;
}

export interface QuestionQaReport {
  qualityScore: number;
  status: 'layak' | 'perlu_revisi';
  summary: string;
  issues: string[];
  suggestions: string[];
  checkedAt: string;
}

export interface QuestionItem {
  id: string;
  number: number;
  type: 'Pilihan Ganda' | 'Esai';
  questionSubType?: QuestionSubType;
  difficulty: DifficultyLevel;
  cognitiveLevel: CognitiveLevel;
  cognitiveTier?: CognitiveTier;
  stimulus?: string;
  questionText: string;
  options: QuestionOption[];
  matchingPairs?: MatchingPair[];
  correctAnswer: string;
  explanation: string;
  material?: string;
  indicator?: string;
  learningObjective?: string;
  scoreWeight?: number;
  difficultyFactor?: 1 | 2 | 3;
  scoringCriteria?: string;
  rubric?: RubricCriterion[];
  supportingImage?: QuestionImage;
  isFavorite?: boolean;
  revisionHistory?: QuestionRevisionEntry[];
  qaReport?: QuestionQaReport;
}

export type ScoringValidationStatus = 'VALID' | 'NEEDS RECALCULATION' | 'INVALID';

export interface ScoringDashboardSummary {
  totalQuestions: number;
  easyCount: number;
  mediumCount: number;
  hardCount: number;
  totalFactor: number;
  totalWeight: number;
  status: ScoringValidationStatus;
  statusReason: string;
  isManualOverride: boolean;
}

export type KopLayoutId = 'A' | 'B' | 'C' | 'D' | 'E';
export type KopLineStyle =
  | 'single'
  | 'double'
  | 'thick'
  | 'thin'
  | 'thick-thin'
  | 'none'
  | 'custom';
export type KopPageRule = 'all' | 'first-only' | 'first-full-rest-simple';

export interface KopTemplate {
  id: string;
  name: string;
  isDefault: boolean;
  layout: KopLayoutId;
  institutionName: string;
  schoolName: string;
  subIdentity: string;
  schoolAddress: string;
  phone: string;
  email: string;
  website: string;
  npsn: string;
  academicYear: string;
  semester: 'Ganjil' | 'Genap';
  defaultDocTitle: string;
  leftLogoDataUrl: string;
  rightLogoDataUrl: string;
  leftLogoId?: string;
  rightLogoId?: string;
  logoFitMode?: LogoFitMode;
  logoHorizontalAlign?: 'left' | 'center' | 'right';
  logoWidthMm: number;
  logoHeightMm: number;
  logoLockAspect: boolean;
  logoGapMm: number;
  logoVerticalAlign: 'top' | 'middle' | 'bottom';
  customLogoPosition: 'left' | 'right' | 'both' | 'top' | 'none';
  fontFamily: 'Times New Roman' | 'Calibri' | 'Arial' | 'Georgia';
  institutionFontSizePt: number;
  schoolFontSizePt: number;
  contactFontSizePt: number;
  textAlign: 'left' | 'center' | 'right';
  lineHeight: number;
  textColorHex: string;
  accentColorHex: string;
  headerHeightMm: number;
  marginLeftMm: number;
  marginRightMm: number;
  dividerStyle: KopLineStyle;
  dividerThicknessPt: number;
  dividerColorHex: string;
  dividerLengthPct: number;
  dividerMarginTopMm: number;
  dividerMarginBottomMm: number;
  pageRule: KopPageRule;
  appliedDocs: {
    examPaper: boolean;
    answerKey: boolean;
    blueprint: boolean;
    questionCard: boolean;
    rubric: boolean;
    answerSheet: boolean;
    examCard: boolean;
  };
  updatedAt: string;
}

export type ExamCardTemplateId = 'classic' | 'modern' | 'school-identity' | 'custom';
export type ExamCardKopMode =
  | 'school-identity'
  | 'school-logo'
  | 'full-kop'
  | 'simple-header';
export type ExamCardPaperSize =
  | 'reference'
  | 'a6-landscape'
  | 'custom'
  | 'a4'
  | 'f4'
  | 'letter';

export interface ExamCardParticipant {
  id: string;
  name: string;
  participantNumber: string;
  nis?: string;
  nisn?: string;
  birthPlaceDate: string;
  className: string;
  room: string;
  seatNumber: string;
  photoDataUrl?: string;
  photoFileName?: string;
}

export interface ExamCardConfig {
  templateId: ExamCardTemplateId;
  cardTitle: string;
  academicYear: string;
  issuePlace: string;
  issueDateText: string;
  headmasterName: string;
  headmasterNip: string;
  kopMode: ExamCardKopMode;
  logoPosition?: 'left' | 'right' | 'both' | 'none';
  customLogoDataUrl?: string;
  customLogoId?: string;
  logoFitMode?: LogoFitMode;
  paperSize: ExamCardPaperSize;
  customWidthMm: number;
  customHeightMm: number;
  cardsPerPage: 1 | 2 | 4 | 6 | 'auto';
  cardGapMm: number;
  showCutMarks: boolean;
  showNis: boolean;
  showBirthPlaceDate: boolean;
  showRoom: boolean;
  showSeatNumber: boolean;
  borderColorHex: string;
  accentColorHex: string;
  fontFamily: 'Times New Roman' | 'Calibri' | 'Arial';
}

export interface KisiKisiRow {
  number: number;
  schoolName: string;
  subject: string;
  gradePhase: string;
  semester: string;
  learningObjective: string;
  material: string;
  indicator: string;
  cognitiveLevel: CognitiveLevel;
  questionForm: string;
  questionNumber: number;
  correctAnswer: string;
}

export interface DeepAnalysisReport {
  pedagogicalSummary: string;
  curriculumAlignmentNote: string;
  qualityControlChecks: string[];
  verificationReminder: string;
}

export interface QuestionSet {
  id: string;
  title: string;
  createdAt: string;
  params: GeneratorParams;
  questions: QuestionItem[];
  deepAnalysis?: DeepAnalysisReport;
}

export interface ValidationErrors {
  educationLevel?: string;
  grade?: string;
  curriculum?: string;
  subject?: string;
  topic?: string;
  questionCount?: string;
  schoolName?: string;
  additionalNotes?: string;
}

export interface QuestionFilterState {
  typeFilter: 'Semua' | 'Pilihan Ganda' | 'Esai';
  difficultyFilter: 'Semua' | DifficultyLevel;
  searchQuery: string;
}

export interface QuestionSetStats {
  total: number;
  multipleChoiceCount: number;
  essayCount: number;
  totalScoreWeight: number;
  byDifficulty: Record<DifficultyLevel, number>;
}

export type SubjectCatalogMap = Record<string, string[]>;

export interface StudentResponseEntry {
  id: string;
  studentName: string;
  answers: Record<string, string>;
  manualScores: Record<string, number>;
}

export interface StudentEvaluationResult {
  studentId: string;
  studentName: string;
  earnedScore: number;
  maxScore: number;
  percentageScore: number;
  status: 'Pengayaan' | 'Tuntas' | 'Perlu Remedial';
  recommendation: string;
}

export interface ItemAnalysisMetrics {
  questionId: string;
  questionNumber: number;
  correctRateP: number | null;
  difficultyCategory: string;
  discriminationD: number | null;
  discriminationCategory: string;
  distractorSummary: string;
}

export interface MasterValidationCheck {
  id: string;
  label: string;
  status: 'passed' | 'warning' | 'failed';
  detail: string;
  autoFixable?: boolean;
}

export interface MasterValidationReport {
  isValid: boolean;
  overallScore: number;
  checks: MasterValidationCheck[];
  warnings: string[];
  errors: string[];
  checkedAt: string;
}
