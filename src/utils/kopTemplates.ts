import type { DocumentExportConfig, DocumentIdentity, KopTemplate } from '../types/question.ts';

export const APP_OFFICIAL_NAME = 'SMART QUEST GENERATOR';
export const APP_OFFICIAL_BRANDING =
  'By Klick Assets Generator Ft. Lilin Annisa Putri S., S.Pd.';

export function createDefaultKopTemplate(
  overrides: Partial<KopTemplate> = {}
): KopTemplate {
  return {
    id: 'kop-default-a',
    name: 'Resmi Standar Kiri (Layout A)',
    isDefault: true,
    layout: 'A',
    institutionName: '',
    schoolName: '',
    subIdentity: '',
    schoolAddress: '',
    phone: '',
    email: '',
    website: '',
    npsn: '',
    academicYear: '2026/2027',
    semester: 'Ganjil',
    defaultDocTitle: '',
    leftLogoDataUrl: '',
    rightLogoDataUrl: '',
    leftLogoId: undefined,
    rightLogoId: undefined,
    logoFitMode: 'contain',
    logoHorizontalAlign: 'center',
    logoWidthMm: 16,
    logoHeightMm: 16,
    logoLockAspect: true,
    logoGapMm: 4,
    logoVerticalAlign: 'middle',
    customLogoPosition: 'left',
    fontFamily: 'Times New Roman',
    institutionFontSizePt: 11,
    schoolFontSizePt: 14,
    contactFontSizePt: 9,
    textAlign: 'center',
    lineHeight: 1.25,
    textColorHex: '#0F172A',
    accentColorHex: '#15803D',
    headerHeightMm: 28,
    marginLeftMm: 17,
    marginRightMm: 17,
    dividerStyle: 'double',
    dividerThicknessPt: 2.2,
    dividerColorHex: '#0F172A',
    dividerLengthPct: 100,
    dividerMarginTopMm: 2,
    dividerMarginBottomMm: 3,
    pageRule: 'first-only',
    appliedDocs: {
      examPaper: true,
      answerKey: true,
      blueprint: true,
      questionCard: true,
      rubric: true,
      answerSheet: true,
      examCard: true,
    },
    updatedAt: '2026-11-14T00:00:00.000Z',
    ...overrides,
  };
}

export function createStarterKopTemplates(): KopTemplate[] {
  return [
    createDefaultKopTemplate({
      id: 'kop-starter-1',
      name: '1. Resmi Standar Kiri (Layout A)',
      isDefault: true,
      layout: 'A',
      dividerStyle: 'double',
    }),
    createDefaultKopTemplate({
      id: 'kop-starter-2',
      name: '2. Resmi Logo Kiri & Kanan (Layout B)',
      isDefault: false,
      layout: 'B',
      customLogoPosition: 'both',
      dividerStyle: 'thick-thin',
    }),
    createDefaultKopTemplate({
      id: 'kop-starter-3',
      name: '3. Simetris Logo Tengah (Layout C)',
      isDefault: false,
      layout: 'C',
      customLogoPosition: 'top',
      headerHeightMm: 34,
      dividerStyle: 'double',
    }),
    createDefaultKopTemplate({
      id: 'kop-starter-4',
      name: '4. Minimalis Modern Tanpa Logo (Layout D)',
      isDefault: false,
      layout: 'D',
      fontFamily: 'Calibri',
      dividerStyle: 'single',
      dividerColorHex: '#15803D',
      dividerThicknessPt: 1.5,
      headerHeightMm: 22,
    }),
    createDefaultKopTemplate({
      id: 'kop-starter-5',
      name: '5. Kop Ujian & Semester Kustom (Layout E)',
      isDefault: false,
      layout: 'E',
      defaultDocTitle: 'PENILAIAN SUMATIF AKHIR SEMESTER',
      dividerStyle: 'thick-thin',
      dividerColorHex: '#15803D',
    }),
    createDefaultKopTemplate({
      id: 'kop-starter-6',
      name: '6. Kop Administrasi Kisi-Kisi & Kartu Soal',
      isDefault: false,
      layout: 'A',
      fontFamily: 'Arial',
      schoolFontSizePt: 13,
      dividerStyle: 'single',
      dividerColorHex: '#1E293B',
      appliedDocs: {
        examPaper: false,
        answerKey: false,
        blueprint: true,
        questionCard: true,
        rubric: true,
        answerSheet: false,
        examCard: false,
      },
    }),
    createDefaultKopTemplate({
      id: 'kop-starter-7',
      name: '7. Kop Kartu Peserta Ujian Resmi',
      isDefault: false,
      layout: 'A',
      schoolFontSizePt: 11,
      institutionFontSizePt: 9,
      contactFontSizePt: 8,
      headerHeightMm: 18,
      logoWidthMm: 12,
      logoHeightMm: 12,
      dividerStyle: 'single',
      dividerThicknessPt: 1.2,
      appliedDocs: {
        examPaper: false,
        answerKey: false,
        blueprint: false,
        questionCard: false,
        rubric: false,
        answerSheet: false,
        examCard: true,
      },
    }),
  ];
}

export function cloneKopTemplate(
  source: KopTemplate,
  newName: string,
  makeDefault = false
): KopTemplate {
  return {
    ...source,
    id: `kop-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: newName.trim() || `${source.name} (Salinan)`,
    isDefault: makeDefault,
    appliedDocs: { ...source.appliedDocs },
    updatedAt: new Date().toISOString(),
  };
}

export function getPaperWidthMm(
  paperSize: DocumentExportConfig['paperSize'],
  orientation: DocumentExportConfig['orientation']
): number {
  const base =
    paperSize === 'F4/Folio'
      ? { w: 215, h: 330 }
      : paperSize === 'Letter'
        ? { w: 215.9, h: 279.4 }
        : { w: 210, h: 297 };
  return orientation === 'landscape' ? base.h : base.w;
}

export function resolveEffectiveKop(
  kop: KopTemplate | undefined,
  docId: DocumentIdentity
): KopTemplate {
  const base = kop ? { ...kop } : createDefaultKopTemplate();
  return {
    ...base,
    schoolName: (base.schoolName || docId.schoolName || '').trim(),
    schoolAddress: (base.schoolAddress || docId.schoolAddress || '').trim(),
    npsn: (base.npsn || docId.schoolNpsn || '').trim(),
    leftLogoDataUrl: base.leftLogoDataUrl || docId.schoolLogoDataUrl || '',
    logoFitMode: base.logoFitMode || docId.schoolLogoFit || 'contain',
    academicYear: (base.academicYear || docId.academicYear || '2026/2027').trim(),
    semester: base.semester || docId.semester || 'Ganjil',
  };
}

export function shouldRenderKopForDoc(
  kop: KopTemplate | undefined,
  docType: keyof KopTemplate['appliedDocs'],
  pageNumber = 1
): boolean {
  if (!kop) return pageNumber === 1;
  if (!kop.appliedDocs[docType]) return false;
  if (kop.pageRule === 'first-only' && pageNumber > 1) return false;
  return true;
}

export function validateKopTemplate(kop: KopTemplate): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!kop.name.trim()) issues.push('Nama template kop harus diisi.');
  if (kop.logoWidthMm < 6 || kop.logoWidthMm > 45 || kop.logoHeightMm < 6 || kop.logoHeightMm > 45) {
    issues.push('Ukuran logo harus berada pada rentang 6–45 mm.');
  }
  if (kop.headerHeightMm < 12 || kop.headerHeightMm > 70) {
    issues.push('Tinggi area kop berada di luar rentang wajar (12–70 mm).');
  }
  if (kop.dividerLengthPct < 20 || kop.dividerLengthPct > 100) {
    issues.push('Panjang garis pemisah harus antara 20%–100%.');
  }
  return { valid: issues.length === 0, issues };
}
