import type {
  AkmFocusMode,
  AssessmentType,
  CognitiveTier,
  CurriculumType,
  DifficultyLevel,
  DocumentExportConfig,
  DocumentIdentity,
  EducationLevel,
  GeneratorParams,
  ImageAspectRatio,
  LearningPlanMapping,
  QuestionImageConfig,
  QuestionImageType,
  QuestionSet,
  QuestionSubType,
  SubjectCatalogMap,
} from '../types/question.ts';
import { calculateIntelligentScores } from './scoring.ts';

export interface GradeOption {
  value: string;
  faseMerdeka: string;
}

export function normalizeEducationLevel(level: EducationLevel): EducationLevel {
  if (level === 'SD') return 'SD/MI';
  if (level === 'SMP') return 'SMP/MTs';
  if (level === 'SMA') return 'SMA/MA';
  return level;
}

export const EDUCATION_LEVELS: Array<{ value: EducationLevel; label: string }> = [
  { value: 'PAUD/TK', label: 'PAUD / TK' },
  { value: 'SD/MI', label: 'SD / MI' },
  { value: 'SMP/MTs', label: 'SMP / MTs' },
  { value: 'SMA/MA', label: 'SMA / MA' },
  { value: 'SMK', label: 'SMK / MAK' },
  { value: 'Kesetaraan', label: 'Pendidikan Kesetaraan' },
  { value: 'SLB/Khusus', label: 'Pendidikan Khusus / SLB' },
];

export const CURRICULUM_OPTIONS: CurriculumType[] = [
  'Kurikulum Merdeka',
  'Kurikulum 2013 Revisi',
  'Kurikulum Satuan Pendidikan (Khusus / Lainnya)',
];

export const ASSESSMENT_TYPES: AssessmentType[] = [
  'Asesmen Formatif',
  'Asesmen Sumatif',
  'Asesmen Diagnostik',
  'Asesmen Harian',
  'Asesmen Tengah Semester',
  'Asesmen Akhir Semester',
  'Asesmen Akhir Tahun',
  'Asesmen Remedial',
  'Asesmen Pengayaan',
  'Asesmen Praktik',
  'Asesmen Proyek',
  'Asesmen Portofolio',
];

export const AKM_FOCUS_MODES: Array<{
  value: AkmFocusMode;
  label: string;
  description: string;
}> = [
  {
    value: 'Reguler',
    label: 'Reguler (Mata Pelajaran)',
    description: 'Asesmen standar mata pelajaran sesuai kurikulum satuan pendidikan.',
  },
  {
    value: 'AKM Literasi Membaca',
    label: 'Inspirasi AKM Literasi Membaca',
    description:
      'Teks informasi/fiksi dengan pemahaman literal, interpretasi, dan evaluasi refleksi (bukan soal resmi pemerintah).',
  },
  {
    value: 'AKM Numerasi',
    label: 'Inspirasi AKM Numerasi',
    description:
      'Bilangan, aljabar, geometri, data & ketidakpastian berbasis konteks nyata dan tabel/grafik.',
  },
  {
    value: 'Tematik SD',
    label: 'Tematik / Lintas Mapel SD',
    description:
      'Integrasi lintas muatan pelajaran khusus SD/MI dengan bahasa yang ramah usia anak.',
  },
  {
    value: 'LKPD Interaktif',
    label: 'LKPD & Aktivitas Siswa',
    description:
      'Lembar Kerja Peserta Didik lengkap dengan langkah kerja, pertanyaan pemantik, dan refleksi.',
  },
];

export const QUESTION_SUBTYPES: QuestionSubType[] = [
  'Pilihan Ganda',
  'Pilihan Ganda Kompleks',
  'Benar dan Salah',
  'Menjodohkan',
  'Isian Singkat',
  'Isian Rumpang',
  'Jawaban Singkat',
  'Uraian',
  'Uraian Terstruktur',
  'Soal Berbasis Stimulus',
  'Soal Berbasis Bacaan',
  'Soal Berbasis Gambar',
  'Soal Berbasis Tabel',
  'Soal Berbasis Grafik',
  'Soal Berbasis Diagram',
  'Studi Kasus',
  'Pemecahan Masalah',
  'Praktik dan Kinerja',
];

export const GRADES_BY_LEVEL: Record<string, GradeOption[]> = {
  'PAUD/TK': [
    { value: 'Kelompok A (4–5 Tahun)', faseMerdeka: 'Fase Fondasi' },
    { value: 'Kelompok B (5–6 Tahun)', faseMerdeka: 'Fase Fondasi' },
  ],
  'SD/MI': [
    { value: 'Kelas I', faseMerdeka: 'Fase A' },
    { value: 'Kelas II', faseMerdeka: 'Fase A' },
    { value: 'Kelas III', faseMerdeka: 'Fase B' },
    { value: 'Kelas IV', faseMerdeka: 'Fase B' },
    { value: 'Kelas V', faseMerdeka: 'Fase C' },
    { value: 'Kelas VI', faseMerdeka: 'Fase C' },
  ],
  'SMP/MTs': [
    { value: 'Kelas VII', faseMerdeka: 'Fase D' },
    { value: 'Kelas VIII', faseMerdeka: 'Fase D' },
    { value: 'Kelas IX', faseMerdeka: 'Fase D' },
  ],
  'SMA/MA': [
    { value: 'Kelas X', faseMerdeka: 'Fase E' },
    { value: 'Kelas XI', faseMerdeka: 'Fase F' },
    { value: 'Kelas XII', faseMerdeka: 'Fase F' },
  ],
  SMK: [
    { value: 'Kelas X (Dasar Keahlian)', faseMerdeka: 'Fase E' },
    { value: 'Kelas XI (Konsentrasi Keahlian)', faseMerdeka: 'Fase F' },
    { value: 'Kelas XII / XIII (Konsentrasi & PKL)', faseMerdeka: 'Fase F' },
  ],
  Kesetaraan: [
    { value: 'Paket A (Setara SD)', faseMerdeka: 'Fase A–C' },
    { value: 'Paket B (Setara SMP)', faseMerdeka: 'Fase D' },
    { value: 'Paket C (Setara SMA)', faseMerdeka: 'Fase E–F' },
  ],
  'SLB/Khusus': [
    { value: 'SDLB (Adaptif)', faseMerdeka: 'Fase A–C (Usia Mental Adaptif)' },
    { value: 'SMPLB (Adaptif)', faseMerdeka: 'Fase D (Adaptif)' },
    { value: 'SMALB (Adaptif)', faseMerdeka: 'Fase E–F (Adaptif)' },
  ],
  // Legacy aliases for backward compatibility
  SD: [
    { value: 'Kelas 1', faseMerdeka: 'Fase A' },
    { value: 'Kelas 2', faseMerdeka: 'Fase A' },
    { value: 'Kelas 3', faseMerdeka: 'Fase B' },
    { value: 'Kelas 4', faseMerdeka: 'Fase B' },
    { value: 'Kelas 5', faseMerdeka: 'Fase C' },
    { value: 'Kelas 6', faseMerdeka: 'Fase C' },
  ],
  SMP: [
    { value: 'Kelas 7', faseMerdeka: 'Fase D' },
    { value: 'Kelas 8', faseMerdeka: 'Fase D' },
    { value: 'Kelas 9', faseMerdeka: 'Fase D' },
  ],
  SMA: [
    { value: 'Kelas 10', faseMerdeka: 'Fase E' },
    { value: 'Kelas 11', faseMerdeka: 'Fase F' },
    { value: 'Kelas 12', faseMerdeka: 'Fase F' },
  ],
};

export const DEFAULT_SUBJECT_CATALOG: SubjectCatalogMap = {
  'PAUD/TK': [
    'Nilai Agama dan Budi Pekerti',
    'Jati Diri',
    'Dasar-Dasar Literasi dan STEAM',
  ],
  'SD/MI': [
    'Pendidikan Agama dan Budi Pekerti',
    'Pendidikan Pancasila',
    'Bahasa Indonesia',
    'Matematika',
    'IPAS (Ilmu Pengetahuan Alam dan Sosial)',
    'PJOK',
    'Seni Budaya',
    'Bahasa Inggris',
    'Muatan Lokal',
  ],
  'SMP/MTs': [
    'Pendidikan Agama dan Budi Pekerti',
    'Pendidikan Pancasila',
    'Bahasa Indonesia',
    'Matematika',
    'IPA',
    'IPS',
    'Bahasa Inggris',
    'PJOK',
    'Informatika',
    'Seni Budaya',
    'Muatan Lokal',
  ],
  'SMA/MA': [
    'Pendidikan Agama dan Budi Pekerti',
    'Pendidikan Pancasila',
    'Bahasa Indonesia',
    'Matematika',
    'Bahasa Inggris',
    'Fisika',
    'Kimia',
    'Biologi',
    'Ekonomi',
    'Geografi',
    'Sejarah',
    'Sosiologi',
    'Informatika',
    'Seni Budaya',
    'PJOK',
    'Muatan Lokal',
  ],
  SMK: [
    'Pendidikan Agama dan Budi Pekerti',
    'Pendidikan Pancasila',
    'Bahasa Indonesia',
    'Matematika',
    'Bahasa Inggris',
    'Informatika',
    'Projek IPAS',
    'Dasar-Dasar Program Keahlian',
    'Konsentrasi Keahlian',
    'Projek Kreatif dan Kewirausahaan',
    'Asesmen Praktik / Uji Kompetensi Kejuruan',
  ],
  Kesetaraan: [
    'Bahasa Indonesia',
    'Matematika',
    'Pendidikan Pancasila',
    'IPA / IPAS Terapan',
    'IPS Terapan',
    'Bahasa Inggris',
    'Keterampilan Fungsional',
  ],
  'SLB/Khusus': [
    'Program Kebutuhan Khusus (Bina Diri / Komunikasi)',
    'Bahasa Indonesia Adaptif',
    'Matematika Fungsional',
    'IPAS Adaptif',
    'Pendidikan Pancasila',
    'Keterampilan Vokasional',
  ],
};

export const TOPIC_SUGGESTIONS: Record<string, Record<string, string[]>> = {
  'PAUD/TK': {
    'Dasar-Dasar Literasi dan STEAM': [
      'Mengenal Bentuk Geometri & Warna di Lingkungan Sekitar',
      'Mengelompokkan Benda Berdasarkan Ukuran dan Jumlah 1–10',
    ],
  },
  'SD/MI': {
    Matematika: [
      'Pecahan Sederhana & Operasi Hitung Sehari-hari',
      'Bangun Datar, Keliling, dan Luas Persegi Panjang',
      'Pengukuran Panjang, Berat, dan Waktu',
    ],
    'IPAS (Ilmu Pengetahuan Alam dan Sosial)': [
      'Rantai Makanan dan Keseimbangan Ekosistem Sawah',
      'Siklus Air dan Pelestarian Sumber Daya Alam',
      'Sistem Pernapasan dan Pencernaan Manusia',
    ],
    'Bahasa Indonesia': [
      'Menemukan Ide Pokok dan Informasi Tersurat Bacaan',
      'Memahami Teks Fiksi Anak dan Pesan Moral',
      'Kalimat Efektif dan Penggunaan Ejaan Bahasa Indonesia',
    ],
  },
  'SMP/MTs': {
    Matematika: [
      'Persamaan Linear Satu Variabel',
      'Teorema Pythagoras dan Penerapannya',
      'Statistika: Membaca Tabel, Diagram, dan Ukuran Pemusatan',
    ],
    IPA: [
      'Sistem Peredaran Darah Manusia',
      'Gaya, Gerak, dan Hukum Newton dalam Keseharian',
      'Zat, Perubahan Wujud, dan Pemisahan Campuran',
    ],
    'Bahasa Indonesia': [
      'Teks Eksplanasi dan Hubungan Sebab Akibat',
      'Teks Berita dan Evaluasi Fakta vs Opini',
    ],
  },
  'SMA/MA': {
    Matematika: [
      'Turunan Fungsi Aljabar & Optimasi Kontekstual',
      'Peluang Kejadian Majemuk dan Kombinatorika',
    ],
    Biologi: [
      'Metabolisme Sel, Enzim, dan Respirasi Aerob',
      'Substansi Genetika dan Sintesis Protein',
    ],
    Ekonomi: [
      'Mekanisme Pasar, Permintaan, dan Penawaran',
      'Kebijakan Moneter, Fiskal, dan Inflasi',
    ],
  },
  SMK: {
    'Dasar-Dasar Program Keahlian': [
      'Keselamatan dan Kesehatan Kerja (K3LH) di Lingkungan Industri',
      'Membaca Spesifikasi Teknis dan Prosedur Operasi Standar (SOP)',
    ],
    'Konsentrasi Keahlian': [
      'Studi Kasus Pemecahan Masalah Layanan / Produksi Pelanggan',
      'Uji Kinerja Praktik Kerja dan Pengendalian Mutu',
    ],
  },
};

export const DIFFICULTY_DETAILS: Record<
  DifficultyLevel,
  { label: string; cognitiveTarget: string; tier: CognitiveTier; description: string }
> = {
  Mudah: {
    label: 'Mudah (Dasar)',
    cognitiveTarget: 'C1–C2 · LOTS',
    tier: 'LOTS',
    description: 'Mengingat definisi, mengidentifikasi fakta, dan memahami konsep dasar.',
  },
  Sedang: {
    label: 'Sedang (Menengah)',
    cognitiveTarget: 'C3 · MOTS',
    tier: 'MOTS',
    description: 'Menerapkan rumus, aturan, atau prosedur pada masalah rutin kontekstual.',
  },
  Sulit: {
    label: 'Sulit (Analitis)',
    cognitiveTarget: 'C4 · HOTS',
    tier: 'HOTS',
    description: 'Menganalisis hubungan antarkonsep, menelaah data, dan memecahkan kasus multi-langkah.',
  },
  HOTS: {
    label: 'HOTS (Penalaran Tinggi)',
    cognitiveTarget: 'C4–C6 · HOTS',
    tier: 'HOTS',
    description:
      'Menuntut analisis mendalam, evaluasi argumen/solusi, atau kreasi rancangan berbasis stimulus nyata.',
  },
};

export const QUESTION_IMAGE_TYPES: QuestionImageType[] = [
  'Ilustrasi edukasi',
  'Gambar realistis',
  'Diagram',
  'Grafik',
  'Tabel visual',
  'Infografis',
  'Peta sederhana',
  'Bangun datar dan bangun ruang',
  'Ilustrasi eksperimen',
  'Ilustrasi aktivitas sehari-hari',
  'Gambar objek pembelajaran',
  'Ilustrasi anatomi atau sains',
];

export const IMAGE_ASPECT_RATIOS: Array<{ value: ImageAspectRatio; label: string }> = [
  { value: '1:1', label: '1:1 (Persegi)' },
  { value: '4:3', label: '4:3 (Klasik)' },
  { value: '3:2', label: '3:2 (Foto/Soal)' },
  { value: '16:9', label: '16:9 (Lebar)' },
  { value: 'Portrait', label: 'Portrait (3:4)' },
];

export const DEFAULT_IMAGE_GEN_CONFIG: QuestionImageConfig = {
  imageType: 'Ilustrasi edukasi',
  visualStyle: 'Bersih, edukatif, garis tegas ramah cetak',
  aspectRatio: '4:3',
  detailLevel: 'Standar',
  backgroundStyle: 'Putih Bersih',
  orientation: 'Landscape',
  includeLabels: true,
};

export const DEFAULT_LEARNING_PLAN: LearningPlanMapping = {
  phase: 'Fase C',
  cp: '',
  tp: '',
  atp: '',
  kktp: '',
  ki: '',
  kd: '',
  ipk: '',
  assistWithAi: true,
};

export const DEFAULT_DOC_IDENTITY: DocumentIdentity = {
  schoolName: '',
  schoolAddress: '',
  schoolNpsn: '',
  schoolExtraInfo: '',
  teacherName: '',
  teacherNip: '',
  teacherRank: '',
  teacherRole: '',
  teacherSubject: '',
  teacherUnit: '',
  teacherSignatureDataUrl: '',
  headmasterName: '',
  headmasterNip: '',
  semester: 'Ganjil',
  academicYear: '2026/2027',
  timeAllocation: '90 Menit',
  schoolLogoDataUrl: '',
  schoolLogoId: undefined,
  schoolLogoFit: 'contain',
};

export const DEFAULT_EXPORT_CONFIG: DocumentExportConfig = {
  paperSize: 'A4',
  orientation: 'portrait',
  marginPreset: 'Normal',
  layoutMode: 'two-column',
  columns: 2,
  fontFamily: 'Times New Roman',
  fontSize: 12,
  lineSpacing: 'normal',
  includeStudentIdentity: true,
  includeSignatureBlock: true,
  includeAnswerKey: true,
  includeBlueprint: true,
  includeRubric: true,
  includeAnswerSheet: true,
  includeImages: true,
  includeHeaderFooter: true,
  includeAppBranding: true,
  scoreBox: {
    enabled: true,
    size: 'medium',
    position: 'top-right',
    label: 'NILAI',
    showInitials: false,
    showTeacherNote: false,
  },
};

export function getGradesForLevel(level: EducationLevel): GradeOption[] {
  const normalized = normalizeEducationLevel(level);
  return GRADES_BY_LEVEL[level] ?? GRADES_BY_LEVEL[normalized] ?? GRADES_BY_LEVEL['SMP/MTs'];
}

export function getDefaultGradeForLevel(level: EducationLevel): string {
  return getGradesForLevel(level)[0]?.value ?? 'Kelas VII';
}

export function getPhaseForGrade(level: EducationLevel, grade: string): string {
  const found = getGradesForLevel(level).find((g) => g.value === grade);
  return found?.faseMerdeka ?? 'Fase D';
}

export function getSubjectsForLevel(
  level: EducationLevel,
  customCatalog?: SubjectCatalogMap
): string[] {
  const normalized = normalizeEducationLevel(level);
  const catalog = customCatalog ?? DEFAULT_SUBJECT_CATALOG;
  return (
    catalog[normalized] ??
    catalog[level] ??
    DEFAULT_SUBJECT_CATALOG[normalized] ??
    DEFAULT_SUBJECT_CATALOG['SMP/MTs']
  );
}

export function getTopicSuggestions(level: EducationLevel, subject: string): string[] {
  const normalized = normalizeEducationLevel(level);
  const bySubject = TOPIC_SUGGESTIONS[normalized]?.[subject];
  if (bySubject && bySubject.length > 0) return bySubject;
  return [
    `Pemahaman Konsep Inti ${subject || 'Materi Utama'}`,
    `Studi Kasus Kontekstual ${subject || 'Pembelajaran'}`,
    `Evaluasi & Pemecahan Masalah ${subject || 'Bab Utama'}`,
  ];
}

export const DEFAULT_GENERATOR_PARAMS: GeneratorParams = {
  educationLevel: 'SD/MI',
  grade: 'Kelas V',
  curriculum: 'Kurikulum Merdeka',
  subject: 'Matematika',
  topic: 'Bangun Datar, Keliling, dan Luas Persegi Panjang dalam Kehidupan Sehari-hari',
  questionFormat: 'Campuran',
  selectedSubTypes: ['Pilihan Ganda', 'Uraian Terstruktur'],
  assessmentType: 'Asesmen Formatif',
  akmMode: 'Reguler',
  difficulty: 'Sedang',
  cognitiveDistribution: { LOTS: 30, MOTS: 40, HOTS: 30 },
  questionCount: 5,
  includeAnswerKey: true,
  schoolName: '',
  additionalNotes: 'Sertakan stimulus cerita kontekstual yang ramah peserta didik sekolah dasar.',
  languageOption: 'Bahasa Indonesia Baku',
  learningPlan: {
    ...DEFAULT_LEARNING_PLAN,
    phase: 'Fase C',
    tp: 'Peserta didik dapat menentukan keliling dan luas bangun datar persegi dan persegi panjang dalam konteks nyata.',
  },
  docIdentity: DEFAULT_DOC_IDENTITY,
  exportConfig: DEFAULT_EXPORT_CONFIG,
};

const RAW_SAMPLE_QUESTION_SETS: QuestionSet[] = [
  {
    id: 'sample-sd-ipas',
    title: 'Asesmen Formatif IPAS SD: Ekosistem Sawah & Rantai Makanan',
    createdAt: '2026-11-12T08:00:00.000Z',
    params: {
      ...DEFAULT_GENERATOR_PARAMS,
      educationLevel: 'SD/MI',
      grade: 'Kelas V',
      curriculum: 'Kurikulum Merdeka',
      subject: 'IPAS (Ilmu Pengetahuan Alam dan Sosial)',
      topic: 'Rantai Makanan dan Keseimbangan Ekosistem Sawah',
      questionFormat: 'Campuran',
      selectedSubTypes: ['Pilihan Ganda', 'Menjodohkan', 'Uraian'],
      assessmentType: 'Asesmen Formatif',
      akmMode: 'Tematik SD',
      difficulty: 'Sedang',
      questionCount: 4,
      schoolName: '',
      additionalNotes: 'Gunakan bahasa yang sederhana dan dekat dengan keseharian anak SD.',
      learningPlan: {
        ...DEFAULT_LEARNING_PLAN,
        phase: 'Fase C',
        cp: 'Peserta didik menyelidiki bagaimana hubungan saling ketergantungan antarkomponen biotik-abiotik dapat memengaruhi kestabilan suatu ekosistem di lingkungan sekitarnya.',
        tp: 'Peserta didik menganalisis peran produsen, konsumen, dan pengurai dalam rantai makanan ekosistem sawah.',
        kktp: 'Peserta didik mampu menjelaskan dampak perubahan salah satu populasi dalam rantai makanan secara tepat.',
      },
      docIdentity: {
        ...DEFAULT_DOC_IDENTITY,
        schoolName: '',
        timeAllocation: '60 Menit',
      },
    },
    questions: [
      {
        id: 'sd-q1',
        number: 1,
        type: 'Pilihan Ganda',
        questionSubType: 'Pilihan Ganda',
        difficulty: 'Mudah',
        cognitiveLevel: 'C1',
        cognitiveTier: 'LOTS',
        material: 'Peran Produsen dalam Ekosistem',
        indicator: 'Disajikan deskripsi ekosistem sawah, siswa mengidentifikasi peran tanaman padi sebagai produsen.',
        learningObjective: 'Mengidentifikasi komponen rantai makanan di sawah.',
        scoreWeight: 10,
        questionText:
          'Di sawah milik Pak Budi, tumbuh subur tanaman padi. Tanaman padi disebut sebagai produsen karena mampu membuat makanannya sendiri melalui proses...',
        options: [
          { label: 'A', text: 'Respirasi di malam hari' },
          { label: 'B', text: 'Fotosintesis dengan bantuan cahaya matahari' },
          { label: 'C', text: 'Penyerapan energi dari belalang' },
          { label: 'D', text: 'Penguraian sisa daun oleh cacing' },
        ],
        correctAnswer: 'B',
        explanation:
          'Tumbuhan hijau seperti padi memiliki zat hijau daun (klorofil) untuk membuat makanan sendiri melalui fotosintesis.',
      },
      {
        id: 'sd-q2',
        number: 2,
        type: 'Pilihan Ganda',
        questionSubType: 'Soal Berbasis Bacaan',
        difficulty: 'Sedang',
        cognitiveLevel: 'C3',
        cognitiveTier: 'MOTS',
        material: 'Ketidakseimbangan Rantai Makanan',
        indicator: 'Siswa menentukan dampak berkurangnya salah satu predator dalam rantai makanan.',
        learningObjective: 'Menganalisis ketergantungan antarpopulasi dalam ekosistem.',
        scoreWeight: 15,
        stimulus:
          'Rantai makanan di sawah Desa Makmur terdiri atas: Padi -> Tikus -> Ular Sawah -> Burung Elang. Belakangan ini banyak ular sawah ditangkap manusia secara berlebihan.',
        questionText:
          'Berdasarkan bacaan singkat di atas, dampak paling cepat yang terjadi pada ekosistem sawah jika populasi ular berkurang drastis adalah...',
        options: [
          { label: 'A', text: 'Populasi tikus ikut menurun karena tidak ada ular' },
          { label: 'B', text: 'Populasi tikus meningkat pesat sehingga merusak tanaman padi' },
          { label: 'C', text: 'Populasi burung elang bertambah karena makanan melimpah' },
          { label: 'D', text: 'Tanaman padi tumbuh lebih lebat sepanjang musim' },
        ],
        correctAnswer: 'B',
        explanation:
          'Ular sawah merupakan pemangsa alami tikus. Ketika ular berkurang, tikus berkembang biak tanpa pengendali alami dan menyerang tanaman padi.',
      },
      {
        id: 'sd-q3',
        number: 3,
        type: 'Pilihan Ganda',
        questionSubType: 'Pilihan Ganda Kompleks',
        difficulty: 'HOTS',
        cognitiveLevel: 'C4',
        cognitiveTier: 'HOTS',
        material: 'Pengendalian Hama Ramah Lingkungan',
        indicator: 'Siswa mengevaluasi cara menjaga keseimbangan ekosistem sawah tanpa merusak rantai makanan.',
        learningObjective: 'Menentukan solusi pelestarian keseimbangan ekosistem.',
        scoreWeight: 20,
        questionText:
          'Petani ingin mengendalikan hama tikus tanpa mencemari tanah dan membunuh burung hantu. Langkah yang paling tepat dilakukan adalah...',
        options: [
          { label: 'A', text: 'Memasang rumah burung hantu (rubuha) di tepi pematang sawah' },
          { label: 'B', text: 'Menyemprot pestisida kimia dosis tinggi setiap dua hari' },
          { label: 'C', text: 'Membakar seluruh rumput liar agar semua hewan pergi' },
          { label: 'D', text: 'Mengeringkan saluran irigasi sawah sepanjang tahun' },
        ],
        correctAnswer: 'A',
        explanation:
          'Burung hantu merupakan predator alami tikus. Membuat rubuha menjaga rantai makanan tetap seimbang tanpa racun kimia.',
      },
      {
        id: 'sd-q4',
        number: 4,
        type: 'Esai',
        questionSubType: 'Uraian',
        difficulty: 'Sedang',
        cognitiveLevel: 'C2',
        cognitiveTier: 'MOTS',
        material: 'Peran Pengurai (Dekomposer)',
        indicator: 'Siswa menjelaskan peran jamur dan bakteri pengurai bagi kesuburan tanah sawah.',
        learningObjective: 'Menjelaskan peran dekomposer dalam siklus nutrisi.',
        scoreWeight: 25,
        questionText:
          'Jelaskan dengan bahasamu sendiri mengapa bakteri dan jamur pengurai sangat penting bagi kesuburan tanah sawah setelah masa panen!',
        options: [],
        correctAnswer:
          'Bakteri dan jamur menguraikan sisa jerami, akar, dan bangkai hewan menjadi unsur hara/kompos alami yang menyuburkan kembali tanah untuk tanaman padi berikutnya.',
        explanation:
          'Dekomposer mengembalikan nutrisi organik ke dalam tanah sehingga siklus kehidupan di ekosistem tetap berjalan.',
        rubric: [
          {
            criterion: 'Ketepatan menyebutkan fungsi pengurai',
            maxScore: 15,
            descriptor: 'Menjelaskan proses penguraian sisa tumbuhan/hewan menjadi zat hara.',
          },
          {
            criterion: 'Keterkaitan dengan kesuburan tanah',
            maxScore: 10,
            descriptor: 'Menjelaskan manfaat zat hara bagi pertumbuhan tanaman selanjutnya.',
          },
        ],
      },
    ],
  },
  {
    id: 'sample-smp-math',
    title: 'Asesmen Formatif Matematika SMP: Teorema Pythagoras',
    createdAt: '2026-11-12T08:30:00.000Z',
    params: {
      ...DEFAULT_GENERATOR_PARAMS,
      educationLevel: 'SMP/MTs',
      grade: 'Kelas VIII',
      subject: 'Matematika',
      topic: 'Teorema Pythagoras dan Penerapannya dalam Kehidupan Sehari-hari',
      learningPlan: {
        ...DEFAULT_LEARNING_PLAN,
        phase: 'Fase D',
        tp: 'Peserta didik dapat membuktikan dan menerapkan Teorema Pythagoras untuk menyelesaikan masalah kontekstual.',
      },
    },
    questions: [
      {
        id: 'smp-q1',
        number: 1,
        type: 'Pilihan Ganda',
        questionSubType: 'Pilihan Ganda',
        difficulty: 'Mudah',
        cognitiveLevel: 'C2',
        cognitiveTier: 'LOTS',
        material: 'Rumus Dasar Pythagoras',
        indicator: 'Siswa menghitung panjang hipotenusa dari dua sisi siku-siku yang diketahui.',
        learningObjective: 'Menentukan panjang sisi segitiga siku-siku.',
        scoreWeight: 15,
        questionText:
          'Sebuah segitiga siku-siku memiliki panjang kedua sisi penyiku masing-masing 6 cm dan 8 cm. Panjang sisi miring (hipotenusa) segitiga tersebut adalah...',
        options: [
          { label: 'A', text: '10 cm' },
          { label: 'B', text: '12 cm' },
          { label: 'C', text: '14 cm' },
          { label: 'D', text: '48 cm' },
        ],
        correctAnswer: 'A',
        explanation:
          'c^2 = a^2 + b^2 = 6^2 + 8^2 = 36 + 64 = 100, sehingga c = akar(100) = 10 cm.',
      },
      {
        id: 'smp-q2',
        number: 2,
        type: 'Pilihan Ganda',
        questionSubType: 'Pemecahan Masalah',
        difficulty: 'Sedang',
        cognitiveLevel: 'C3',
        cognitiveTier: 'MOTS',
        material: 'Aplikasi Tangga Bersandar',
        indicator: 'Siswa menerapkan Teorema Pythagoras untuk menentukan tinggi dinding yang dicapai tangga.',
        learningObjective: 'Menyelesaikan masalah sehari-hari menggunakan Pythagoras.',
        scoreWeight: 20,
        questionText:
          'Sebuah tangga sepanjang 5 meter disandarkan pada dinding vertikal. Jika jarak ujung bawah tangga ke dasar dinding adalah 3 meter, tinggi dinding yang dicapai ujung atas tangga adalah...',
        options: [
          { label: 'A', text: '2 meter' },
          { label: 'B', text: '3,5 meter' },
          { label: 'C', text: '4 meter' },
          { label: 'D', text: '8 meter' },
        ],
        correctAnswer: 'C',
        explanation:
          't = akar(5^2 - 3^2) = akar(25 - 9) = akar(16) = 4 meter.',
      },
      {
        id: 'smp-q3',
        number: 3,
        type: 'Pilihan Ganda',
        questionSubType: 'Pilihan Ganda',
        difficulty: 'Sulit',
        cognitiveLevel: 'C4',
        cognitiveTier: 'HOTS',
        material: 'Tripel Pythagoras',
        indicator: 'Siswa menganalisis kelompok tiga bilangan yang membentuk segitiga siku-siku.',
        learningObjective: 'Menguji kebenaran tripel Pythagoras.',
        scoreWeight: 25,
        questionText:
          'Kelompok tiga bilangan berikut yang merupakan tripel Pythagoras dan membentuk segitiga siku-siku adalah...',
        options: [
          { label: 'A', text: '7, 12, 15' },
          { label: 'B', text: '9, 40, 41' },
          { label: 'C', text: '8, 14, 17' },
          { label: 'D', text: '10, 20, 25' },
        ],
        correctAnswer: 'B',
        explanation:
          '9^2 + 40^2 = 81 + 1600 = 1681 dan 41^2 = 1681.',
      },
      {
        id: 'smp-q4',
        number: 4,
        type: 'Esai',
        questionSubType: 'Uraian Terstruktur',
        difficulty: 'HOTS',
        cognitiveLevel: 'C5',
        cognitiveTier: 'HOTS',
        material: 'Optimasi Lintasan Terpendek',
        indicator: 'Siswa mengevaluasi selisih jarak tempuh rute memutar dan lintasan lurus berbasis arah mata angin.',
        learningObjective: 'Mengevaluasi efisiensi jarak tempuh menggunakan Pythagoras.',
        scoreWeight: 40,
        questionText:
          'Seorang kurir bersepeda dari gudang ke arah utara sejauh 12 km, lalu berbelok ke timur sejauh 9 km menuju rumah pelanggan. Jika tersedia jalan pintas lurus dari gudang ke rumah pelanggan, berapa kilometer jarak yang dapat dihemat kurir tersebut? Jelaskan langkah perhitunganmu.',
        options: [],
        correctAnswer:
          'Jarak memutar = 12 + 9 = 21 km. Jalan pintas = akar(12^2 + 9^2) = akar(225) = 15 km. Penghematan jarak = 21 - 15 = 6 km.',
        explanation:
          'Arah utara dan timur membentuk sudut siku-siku 90 derajat sehingga lintasan terpendek merupakan sisi miring.',
        rubric: [
          {
            criterion: 'Pemodelan segitiga siku-siku & jarak memutar',
            maxScore: 15,
            descriptor: 'Menghitung total jarak awal (21 km) dan mengidentifikasi sisi siku-siku 12 km dan 9 km.',
          },
          {
            criterion: 'Perhitungan panjang lintasan lurus',
            maxScore: 15,
            descriptor: 'Menerapkan Pythagoras dengan hasil tepat 15 km.',
          },
          {
            criterion: 'Kesimpulan selisih penghematan jarak',
            maxScore: 10,
            descriptor: 'Menyimpulkan penghematan 6 km secara jelas.',
          },
        ],
      },
    ],
  },
  {
    id: 'sample-sma-akm',
    title: 'Latihan Literasi & Numerasi SMA: Metabolisme & Data Laju Enzim',
    createdAt: '2026-11-12T09:00:00.000Z',
    params: {
      ...DEFAULT_GENERATOR_PARAMS,
      educationLevel: 'SMA/MA',
      grade: 'Kelas XII',
      curriculum: 'Kurikulum Merdeka',
      subject: 'Biologi',
      topic: 'Kerja Enzim Katalase, Inhibitor, dan Interpretasi Data Eksperimen',
      questionFormat: 'Pilihan Ganda',
      selectedSubTypes: ['Soal Berbasis Tabel', 'Studi Kasus'],
      assessmentType: 'Asesmen Sumatif',
      akmMode: 'AKM Numerasi',
      difficulty: 'HOTS',
      questionCount: 3,
      schoolName: '',
      additionalNotes: 'Gunakan 5 opsi jawaban A sampai E dan stimulus data percobaan.',
      learningPlan: {
        ...DEFAULT_LEARNING_PLAN,
        phase: 'Fase F',
        cp: 'Peserta didik menganalisis keterkaitan struktur organel sel dengan proses metabolisme dan regulasi kerja enzim berdasarkan data eksperimen.',
        tp: 'Peserta didik menyimpulkan pengaruh pH dan inhibitor terhadap laju reaksi enzimatik melalui data tabel percobaan.',
      },
      docIdentity: {
        ...DEFAULT_DOC_IDENTITY,
        schoolName: '',
        timeAllocation: '90 Menit',
      },
    },
    questions: [
      {
        id: 'sma-q1',
        number: 1,
        type: 'Pilihan Ganda',
        questionSubType: 'Soal Berbasis Tabel',
        difficulty: 'Sulit',
        cognitiveLevel: 'C4',
        cognitiveTier: 'HOTS',
        material: 'Pengaruh pH terhadap Aktivitas Katalase',
        indicator: 'Disajikan kondisi percobaan ekstrak hati + HCl, siswa menganalisis penyebab turunnya laju reaksi.',
        learningObjective: 'Menganalisis faktor pH yang memengaruhi kerja enzim.',
        scoreWeight: 30,
        stimulus:
          'Dalam percobaan enzim katalase menggunakan ekstrak hati ayam dan larutan H2O2: Tabung 1 (pH 7, suhu 37°C) menghasilkan gelembung gas sangat banyak; Tabung 2 (ditambah HCl hingga pH 2, suhu 37°C) hanya menghasilkan sedikit sekali gelembung.',
        questionText:
          'Berdasarkan hasil pengamatan tersebut, penyebab utama penurunan drastis aktivitas enzim katalase pada Tabung 2 adalah...',
        options: [
          { label: 'A', text: 'Substrat H2O2 menguap seluruhnya akibat kondisi asam' },
          { label: 'B', text: 'Enzim katalase mengalami denaturasi akibat pH sangat asam sehingga sisi aktif berubah' },
          { label: 'C', text: 'HCl bertindak sebagai kofaktor yang menghambat pembentukan air' },
          { label: 'D', text: 'Enzim katalase hanya aktif pada kondisi sangat basa (pH > 11)' },
          { label: 'E', text: 'Gas oksigen bereaksi kembali membentuk glukosa di dasar tabung' },
        ],
        correctAnswer: 'B',
        explanation:
          'Enzim katalase bekerja optimal pada pH netral (~7). Lingkungan pH terlalu rendah merusak ikatan penstabil struktur tersier protein enzim (denaturasi).',
      },
      {
        id: 'sma-q2',
        number: 2,
        type: 'Pilihan Ganda',
        questionSubType: 'Studi Kasus',
        difficulty: 'HOTS',
        cognitiveLevel: 'C5',
        cognitiveTier: 'HOTS',
        material: 'Inhibisi Non-Kompetitif pada Rantai Transpor Elektron',
        indicator: 'Siswa mengevaluasi dampak blokade sitokrom c oksidase oleh sianida terhadap sintesis ATP.',
        learningObjective: 'Mengevaluasi mekanisme kerja inhibitor enzim dalam respirasi aerob.',
        scoreWeight: 40,
        questionText:
          'Sianida mengikat gugus besi heme pada enzim sitokrom c oksidase di membran dalam mitokondria secara non-kompetitif. Dampak langsung yang dialami sel meskipun pasokan oksigen di udara cukup adalah...',
        options: [
          { label: 'A', text: 'Glikolisis berhenti total di sitoplasma karena glukosa tidak dapat masuk' },
          { label: 'B', text: 'Pembentukan ATP melalui fosforilasi oksidatif terhenti karena aliran elektron terputus' },
          { label: 'C', text: 'Siklus Krebs menghasilkan ATP dua kali lipat lebih banyak' },
          { label: 'D', text: 'NADH langsung teroksidasi menjadi oksigen bebas' },
          { label: 'E', text: 'Piruvat langsung berubah menjadi asetil-KoA tanpa enzim' },
        ],
        correctAnswer: 'B',
        explanation:
          'Terhambatnya sitokrom c oksidase menghentikan transfer elektron menuju O2, sehingga gradien H+ gagal terbentuk dan sintesis ATP via ATP sintase berhenti.',
      },
      {
        id: 'sma-q3',
        number: 3,
        type: 'Pilihan Ganda',
        questionSubType: 'Pilihan Ganda',
        difficulty: 'Sedang',
        cognitiveLevel: 'C3',
        cognitiveTier: 'MOTS',
        material: 'Inhibitor Kompetitif',
        indicator: 'Siswa menentukan cara mengatasi pengaruh inhibitor kompetitif pada laju reaksi enzim.',
        learningObjective: 'Membedakan sifat inhibitor kompetitif dan non-kompetitif.',
        scoreWeight: 30,
        questionText:
          'Pada mekanisme inhibisi kompetitif, penurunan laju reaksi enzimatik dapat dipulihkan oleh sistem sel dengan cara...',
        options: [
          { label: 'A', text: 'Menurunkan suhu lingkungan hingga mendekati 0°C' },
          { label: 'B', text: 'Meningkatkan konsentrasi substrat jauh melebihi konsentrasi inhibitor' },
          { label: 'C', text: 'Menambahkan asam kuat ke dalam sitosol sel' },
          { label: 'D', text: 'Mengurangi sintesis protein enzim di ribosom' },
          { label: 'E', text: 'Menghilangkan seluruh kofaktor logam dari sisi alosterik' },
        ],
        correctAnswer: 'B',
        explanation:
          'Inhibitor kompetitif bersaing memperebutkan sisi aktif yang sama dengan substrat, sehingga penambahan substrat berlebih akan menggeser kesetimbangan kembali ke ikatan enzim-substrat.',
      },
    ],
  },
];

export const SAMPLE_QUESTION_SETS: QuestionSet[] = RAW_SAMPLE_QUESTION_SETS.map((sample) => ({
  ...sample,
  questions: calculateIntelligentScores(sample.questions),
}));
