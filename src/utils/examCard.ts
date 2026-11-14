import {
  AlignmentType,
  BorderStyle,
  Document,
  ImageRun,
  Packer,
  PageBreak,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';
import type {
  DocumentIdentity,
  ExamCardConfig,
  ExamCardParticipant,
  KopTemplate,
} from '../types/question.ts';
import { formatOptionalNip } from './layoutEngine.ts';
import { APP_OFFICIAL_BRANDING, APP_OFFICIAL_NAME, resolveEffectiveKop } from './kopTemplates.ts';
import { extractDimensionsFromDataUrl, fitImageBoxDimensions } from './logoManager.ts';

export function createDefaultExamCardConfig(
  docId?: Partial<DocumentIdentity>
): ExamCardConfig {
  return {
    templateId: 'classic',
    cardTitle: 'KARTU PESERTA UJIAN',
    academicYear: docId?.academicYear || '2026/2027',
    issuePlace: '',
    issueDateText: 'Mei 2026',
    headmasterName: docId?.headmasterName || '',
    headmasterNip: docId?.headmasterNip || '',
    kopMode: 'school-identity',
    logoPosition: 'left',
    customLogoDataUrl: '',
    customLogoId: undefined,
    logoFitMode: 'contain',
    paperSize: 'a4',
    customWidthMm: 95,
    customHeightMm: 62,
    cardsPerPage: 4,
    cardGapMm: 6,
    showCutMarks: true,
    showNis: true,
    showBirthPlaceDate: true,
    showRoom: true,
    showSeatNumber: true,
    borderColorHex: '#0F172A',
    accentColorHex: '#15803D',
    fontFamily: 'Times New Roman',
  };
}

export interface ParticipantValidationIssue {
  participantId: string;
  rowIndex: number;
  issues: string[];
}

export interface ParticipantValidationSummary {
  valid: boolean;
  duplicateNumbers: string[];
  missingFieldCount: number;
  issuesByRow: ParticipantValidationIssue[];
}

export function validateParticipants(
  participants: ExamCardParticipant[]
): ParticipantValidationSummary {
  const numberCounts = new Map<string, number>();
  for (const p of participants) {
    const key = p.participantNumber.trim().toLowerCase();
    if (key) {
      numberCounts.set(key, (numberCounts.get(key) ?? 0) + 1);
    }
  }

  const duplicateNumbers: string[] = [];
  numberCounts.forEach((count, num) => {
    if (count > 1) duplicateNumbers.push(num);
  });

  const issuesByRow: ParticipantValidationIssue[] = [];
  let missingFieldCount = 0;

  participants.forEach((p, idx) => {
    const rowIssues: string[] = [];
    if (!p.name.trim()) rowIssues.push('Nama lengkap kosong');
    if (!p.participantNumber.trim()) rowIssues.push('Nomor peserta kosong');
    if (!p.className.trim()) rowIssues.push('Kelas kosong');

    if (rowIssues.length > 0) missingFieldCount += 1;

    const normNum = p.participantNumber.trim().toLowerCase();
    if (normNum && (numberCounts.get(normNum) ?? 0) > 1) {
      rowIssues.push(`Nomor peserta "${p.participantNumber.trim()}" ganda`);
    }

    if (rowIssues.length > 0) {
      issuesByRow.push({
        participantId: p.id,
        rowIndex: idx + 1,
        issues: rowIssues,
      });
    }
  });

  return {
    valid: issuesByRow.length === 0,
    duplicateNumbers,
    missingFieldCount,
    issuesByRow,
  };
}

export type SpreadsheetColumnMapping = {
  name: string;
  participantNumber: string;
  nis: string;
  nisn: string;
  birthPlaceDate: string;
  birthDateSeparate: string;
  className: string;
  room: string;
  seatNumber: string;
  photoFileName: string;
};

export interface ParsedSpreadsheetResult {
  headers: string[];
  rows: Record<string, string>[];
  suggestedMapping: SpreadsheetColumnMapping;
}

function findMatchingHeader(headers: string[], candidates: string[]): string {
  const lowerMap = new Map(headers.map((h) => [h.toLowerCase().trim(), h]));
  for (const cand of candidates) {
    const exact = lowerMap.get(cand);
    if (exact) return exact;
  }
  for (const h of headers) {
    const hl = h.toLowerCase();
    if (candidates.some((c) => hl.includes(c))) return h;
  }
  return '';
}

export function detectSpreadsheetMapping(headers: string[]): SpreadsheetColumnMapping {
  return {
    name: findMatchingHeader(headers, ['nama lengkap', 'nama siswa', 'nama peserta', 'nama']),
    participantNumber: findMatchingHeader(headers, [
      'nomor peserta',
      'no peserta',
      'no. peserta',
      'no ujian',
      'nomor ujian',
    ]),
    nis: findMatchingHeader(headers, ['nis']),
    nisn: findMatchingHeader(headers, ['nisn']),
    birthPlaceDate: findMatchingHeader(headers, [
      'tempat, tanggal lahir',
      'tempat tanggal lahir',
      'ttl',
      'tempat lahir',
    ]),
    birthDateSeparate: findMatchingHeader(headers, ['tanggal lahir', 'tgl lahir']),
    className: findMatchingHeader(headers, ['kelas', 'rombel']),
    room: findMatchingHeader(headers, ['ruang ujian', 'ruang', 'ruangan']),
    seatNumber: findMatchingHeader(headers, ['nomor meja', 'no meja', 'no. meja', 'meja', 'kursi']),
    photoFileName: findMatchingHeader(headers, ['foto', 'nama file foto', 'pas foto']),
  };
}

export function parseParticipantSpreadsheet(
  data: ArrayBuffer | Uint8Array
): ParsedSpreadsheetResult {
  const workbook = XLSX.read(data, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    return {
      headers: [],
      rows: [],
      suggestedMapping: detectSpreadsheetMapping([]),
    };
  }
  const sheet = workbook.Sheets[firstSheetName]!;
  const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    raw: false,
  });

  const headerSet = new Set<string>();
  jsonRows.forEach((row) => {
    Object.keys(row).forEach((k) => {
      if (k && !k.startsWith('__EMPTY')) headerSet.add(k);
    });
  });
  const headers = Array.from(headerSet);

  const normalizedRows = jsonRows
    .map((row) => {
      const out: Record<string, string> = {};
      headers.forEach((h) => {
        out[h] = String(row[h] ?? '').trim();
      });
      return out;
    })
    .filter((row) => Object.values(row).some((v) => v.length > 0));

  return {
    headers,
    rows: normalizedRows,
    suggestedMapping: detectSpreadsheetMapping(headers),
  };
}

export function buildParticipantsFromRows(
  rows: Record<string, string>[],
  mapping: SpreadsheetColumnMapping
): ExamCardParticipant[] {
  return rows.map((row, idx) => {
    const placePart = mapping.birthPlaceDate ? (row[mapping.birthPlaceDate] ?? '').trim() : '';
    const datePart =
      mapping.birthDateSeparate && mapping.birthDateSeparate !== mapping.birthPlaceDate
        ? (row[mapping.birthDateSeparate] ?? '').trim()
        : '';
    const birthPlaceDate =
      placePart && datePart ? `${placePart}, ${datePart}` : placePart || datePart || '';

    return {
      id: `peserta-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
      name: mapping.name ? (row[mapping.name] ?? '').trim() : '',
      participantNumber: mapping.participantNumber
        ? (row[mapping.participantNumber] ?? '').trim()
        : '',
      nis: mapping.nis ? (row[mapping.nis] ?? '').trim() : '',
      nisn: mapping.nisn ? (row[mapping.nisn] ?? '').trim() : '',
      birthPlaceDate,
      className: mapping.className ? (row[mapping.className] ?? '').trim() : '',
      room: mapping.room ? (row[mapping.room] ?? '').trim() : '',
      seatNumber: mapping.seatNumber ? (row[mapping.seatNumber] ?? '').trim() : '',
      photoFileName: mapping.photoFileName ? (row[mapping.photoFileName] ?? '').trim() : '',
    };
  });
}

export function downloadParticipantTemplateXlsx(): void {
  const wb = XLSX.utils.book_new();
  const rows = [
    [
      'Nama',
      'Nomor Peserta',
      'NIS',
      'NISN',
      'Tempat, Tanggal Lahir',
      'Kelas',
      'Ruang',
      'Nomor Meja',
      'Nama File Foto',
    ],
    [
      'Contoh: Aulia Rahma',
      '2026-05-001',
      '24001',
      '',
      'Pasuruan, 14 Mei 2015',
      'Kelas V',
      'Ruang 01',
      '01',
      '2026-05-001.jpg',
    ],
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Template Peserta');
  XLSX.writeFile(wb, 'template-peserta-kartu-ujian.xlsx');
}

/**
 * Strictly binds bulk photo files to matching participants by:
 * 1) explicit photoFileName match, 2) participantNumber match, or 3) exact participant name match.
 * Each participant keeps its own independent photoDataUrl without leaking across rows.
 */
export function matchBulkPhotosToParticipants(
  participants: ExamCardParticipant[],
  uploadedPhotos: Array<{ fileName: string; dataUrl: string }>
): { updated: ExamCardParticipant[]; matchedCount: number } {
  const stripExt = (s: string) => s.replace(/\.[^.]+$/, '').trim().toLowerCase();
  const norm = (s: string) =>
    stripExt(s)
      .replace(/[^a-z0-9]+/g, '')
      .trim();

  const byFileName = new Map<string, { fileName: string; dataUrl: string }>();
  const byNormBase = new Map<string, { fileName: string; dataUrl: string }>();

  uploadedPhotos.forEach((ph) => {
    byFileName.set(ph.fileName.trim().toLowerCase(), ph);
    byNormBase.set(norm(ph.fileName), ph);
  });

  let matchedCount = 0;
  const updated = participants.map((p) => {
    const explicitKey = (p.photoFileName || '').trim().toLowerCase();
    const numKey = norm(p.participantNumber);
    const nameKey = norm(p.name);

    const matched =
      (explicitKey && byFileName.get(explicitKey)) ||
      (explicitKey && byNormBase.get(norm(explicitKey))) ||
      (numKey && byNormBase.get(numKey)) ||
      (nameKey && byNormBase.get(nameKey));

    if (!matched) return p;
    matchedCount += 1;
    return {
      ...p,
      photoDataUrl: matched.dataUrl,
      photoFileName: matched.fileName,
    };
  });

  return { updated, matchedCount };
}

function getCardGridLayout(config: ExamCardConfig): {
  pageFormat: string | number[];
  pageOrientation: 'portrait' | 'landscape';
  cols: number;
  rows: number;
  cardW: number;
  cardH: number;
} {
  if (config.paperSize === 'reference') {
    return {
      pageFormat: [115, 78],
      pageOrientation: 'landscape',
      cols: 1,
      rows: 1,
      cardW: 103,
      cardH: 66,
    };
  }
  if (config.paperSize === 'a6-landscape') {
    return {
      pageFormat: [148, 105],
      pageOrientation: 'landscape',
      cols: 1,
      rows: 1,
      cardW: 134,
      cardH: 91,
    };
  }
  if (config.paperSize === 'custom') {
    const cw = Math.max(70, Math.min(200, config.customWidthMm || 95));
    const ch = Math.max(48, Math.min(140, config.customHeightMm || 62));
    return {
      pageFormat: [cw + 12, ch + 12],
      pageOrientation: 'landscape',
      cols: 1,
      rows: 1,
      cardW: cw,
      cardH: ch,
    };
  }

  const pageSize =
    config.paperSize === 'f4'
      ? { w: 215, h: 330 }
      : config.paperSize === 'letter'
        ? { w: 215.9, h: 279.4 }
        : { w: 210, h: 297 };

  const count = config.cardsPerPage === 'auto' ? 4 : config.cardsPerPage;
  const cols = count === 1 ? 1 : count === 2 ? 1 : 2;
  const rows = count === 1 ? 1 : count === 2 ? 2 : count === 6 ? 3 : 2;
  const margin = 10;
  const gap = Math.max(2, Math.min(15, config.cardGapMm || 6));
  const cardW = (pageSize.w - margin * 2 - gap * (cols - 1)) / cols;
  const cardH = Math.min(
    75,
    (pageSize.h - margin * 2 - gap * (rows - 1)) / rows
  );

  return {
    pageFormat: [pageSize.w, pageSize.h],
    pageOrientation: 'portrait',
    cols,
    rows,
    cardW,
    cardH,
  };
}

function detectPdfImgFmt(dataUrl: string): 'JPEG' | 'PNG' | 'WEBP' {
  if (dataUrl.includes('image/jpeg') || dataUrl.includes('image/jpg')) return 'JPEG';
  if (dataUrl.includes('image/webp')) return 'WEBP';
  return 'PNG';
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return [15, 23, 42];
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return [15, 23, 42];
  return [r, g, b];
}

export function exportExamCardsPdf(
  participants: ExamCardParticipant[],
  config: ExamCardConfig,
  kopTemplate: KopTemplate | undefined,
  docId: DocumentIdentity,
  includeAppBranding = true
): void {
  if (participants.length === 0) return;

  const layout = getCardGridLayout(config);
  const doc = new jsPDF({
    unit: 'mm',
    format: layout.pageFormat,
    orientation: layout.pageOrientation,
  });

  doc.setProperties({
    title: `${APP_OFFICIAL_NAME} — ${config.cardTitle}`,
    subject: 'Kartu Peserta Ujian',
    author: APP_OFFICIAL_BRANDING,
    creator: APP_OFFICIAL_NAME,
  });

  const pdfFont = config.fontFamily === 'Times New Roman' ? 'times' : 'helvetica';
  const effectiveKop = resolveEffectiveKop(kopTemplate, docId);
  const perPage = layout.cols * layout.rows;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const gap = Math.max(2, Math.min(15, config.cardGapMm || 6));
  const totalGridW = layout.cols * layout.cardW + (layout.cols - 1) * gap;
  const totalGridH = layout.rows * layout.cardH + (layout.rows - 1) * gap;
  const startX = Math.max(5, (pageW - totalGridW) / 2);
  const startY = Math.max(5, (pageH - totalGridH) / 2);

  const [br, bg, bb] = hexToRgb(config.borderColorHex);
  const [ar, ag, ab] = hexToRgb(config.accentColorHex);

  participants.forEach((p, idx) => {
    const pageIdx = Math.floor(idx / perPage);
    const slotIdx = idx % perPage;
    if (idx > 0 && slotIdx === 0) {
      doc.addPage();
    }

    const col = slotIdx % layout.cols;
    const row = Math.floor(slotIdx / layout.cols);
    const cx = startX + col * (layout.cardW + gap);
    const cy = startY + row * (layout.cardH + gap);
    const cw = layout.cardW;
    const ch = layout.cardH;

    // Cut marks around card
    if (config.showCutMarks && perPage > 1) {
      doc.setDrawColor(148, 163, 184);
      doc.setLineWidth(0.2);
      const mk = 2.5;
      doc.line(cx - mk, cy, cx, cy);
      doc.line(cx, cy - mk, cx, cy);
      doc.line(cx + cw, cy, cx + cw + mk, cy);
      doc.line(cx + cw, cy - mk, cx + cw, cy);
      doc.line(cx - mk, cy + ch, cx, cy + ch);
      doc.line(cx, cy + ch, cx, cy + ch + mk);
      doc.line(cx + cw, cy + ch, cx + cw + mk, cy + ch);
      doc.line(cx + cw, cy + ch, cx + cw, cy + ch + mk);
    }

    // Card outer rectangular frame
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(br, bg, bb);
    doc.setLineWidth(config.templateId === 'modern' ? 0.45 : 0.6);
    doc.rect(cx, cy, cw, ch, 'FD');

    if (config.templateId === 'modern' || config.templateId === 'school-identity') {
      doc.setFillColor(ar, ag, ab);
      doc.rect(cx, cy, cw, 1.8, 'F');
    }

    let y = cy + 4.5;
    const padX = 3.5;

    // Card Header per Kop Mode & Logo Position
    const leftLogoSrc = config.customLogoDataUrl || effectiveKop.leftLogoDataUrl || '';
    const rightLogoSrc =
      effectiveKop.rightLogoDataUrl || config.customLogoDataUrl || effectiveKop.leftLogoDataUrl || '';
    const logoPos = config.logoPosition ?? 'left';
    const allowLogos =
      logoPos !== 'none' &&
      (config.kopMode !== 'simple-header' || Boolean(config.customLogoDataUrl));

    const drawCardLogo = (src: string, x: number, yPos: number) => {
      try {
        const dims = extractDimensionsFromDataUrl(src);
        const fitted = dims
          ? fitImageBoxDimensions(dims.width, dims.height, 8.5, 8.5, config.logoFitMode ?? 'contain')
          : { width: 8.5, height: 8.5 };
        const dx = x + (8.5 - fitted.width) / 2;
        const dy = yPos + (8.5 - fitted.height) / 2;
        doc.addImage(src, detectPdfImgFmt(src), dx, dy, fitted.width, fitted.height);
      } catch {
        // Skip invalid image
      }
    };

    if (allowLogos && leftLogoSrc && (logoPos === 'left' || logoPos === 'both')) {
      drawCardLogo(leftLogoSrc, cx + padX, cy + 2.8);
    }
    if (allowLogos && rightLogoSrc && (logoPos === 'right' || logoPos === 'both')) {
      drawCardLogo(rightLogoSrc, cx + cw - padX - 8.5, cy + 2.8);
    }

    const headerCenterX = cx + cw / 2;
    if (config.kopMode !== 'simple-header' && effectiveKop.schoolName) {
      doc.setFont(pdfFont, 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(ar, ag, ab);
      doc.text(effectiveKop.schoolName.toUpperCase(), headerCenterX, y, {
        align: 'center',
      });
      y += 3.4;
      if (config.kopMode === 'full-kop' && effectiveKop.schoolAddress) {
        doc.setFont(pdfFont, 'normal');
        doc.setFontSize(5.8);
        doc.setTextColor(71, 85, 105);
        doc.text(effectiveKop.schoolAddress, headerCenterX, y, { align: 'center' });
        y += 2.8;
      }
    }

    doc.setFont(pdfFont, 'bold');
    doc.setFontSize(8.8);
    doc.setTextColor(15, 23, 42);
    doc.text(config.cardTitle.toUpperCase(), headerCenterX, y, { align: 'center' });
    y += 3.4;

    if (config.academicYear.trim()) {
      doc.setFont(pdfFont, 'normal');
      doc.setFontSize(6.8);
      doc.setTextColor(71, 85, 105);
      doc.text(`Tahun Ajaran ${config.academicYear.trim()}`, headerCenterX, y, {
        align: 'center',
      });
      y += 2.5;
    }

    // Header divider line
    doc.setDrawColor(br, bg, bb);
    doc.setLineWidth(0.35);
    doc.line(cx + padX, y, cx + cw - padX, y);
    y += 3.5;

    // Student details on left
    const fields: Array<[string, string]> = [
      ['Nama', p.name || '-'],
      ['No. Peserta', p.participantNumber || '-'],
    ];
    if (config.showNis && (p.nis || p.nisn)) {
      fields.push([
        p.nis && p.nisn ? 'NIS / NISN' : p.nis ? 'NIS' : 'NISN',
        p.nis && p.nisn ? `${p.nis} / ${p.nisn}` : p.nis || p.nisn || '-',
      ]);
    }
    if (config.showBirthPlaceDate && p.birthPlaceDate) {
      fields.push(['Tempat, Tgl Lahir', p.birthPlaceDate]);
    }
    fields.push(['Kelas', p.className || '-']);
    if (config.showRoom && p.room) {
      fields.push(['Ruang', p.room]);
    }
    if (config.showSeatNumber && p.seatNumber) {
      fields.push(['No. Meja', p.seatNumber]);
    }

    const labelW = Math.min(26, cw * 0.29);
    doc.setFontSize(6.8);
    fields.forEach(([lbl, val]) => {
      doc.setFont(pdfFont, 'normal');
      doc.setTextColor(51, 65, 85);
      doc.text(lbl, cx + padX, y);
      doc.setFont(pdfFont, 'bold');
      doc.setTextColor(15, 23, 42);
      const valLines = doc.splitTextToSize(`: ${val}`, cw - padX * 2 - labelW);
      doc.text(valLines[0] || `: ${val}`, cx + padX + labelW, y);
      y += 3.35;
    });

    // Bottom section: Left 3:4 Photo + Right Signature block
    const photoW = 15;
    const photoH = 20;
    const bottomAreaY = cy + ch - photoH - 3.2;
    const photoX = cx + padX + 1;

    doc.setDrawColor(100, 116, 139);
    doc.setLineWidth(0.3);
    doc.rect(photoX, bottomAreaY, photoW, photoH, 'D');

    if (p.photoDataUrl) {
      try {
        doc.addImage(
          p.photoDataUrl,
          detectPdfImgFmt(p.photoDataUrl),
          photoX + 0.3,
          bottomAreaY + 0.3,
          photoW - 0.6,
          photoH - 0.6
        );
      } catch {
        // Fallback label if corrupted
        doc.setFont(pdfFont, 'normal');
        doc.setFontSize(6);
        doc.text('3x4', photoX + photoW / 2, bottomAreaY + photoH / 2, { align: 'center' });
      }
    } else {
      doc.setFont(pdfFont, 'normal');
      doc.setFontSize(5.8);
      doc.setTextColor(148, 163, 184);
      doc.text('Pas Foto', photoX + photoW / 2, bottomAreaY + photoH / 2 - 1.2, {
        align: 'center',
      });
      doc.text('3 x 4', photoX + photoW / 2, bottomAreaY + photoH / 2 + 2.2, {
        align: 'center',
      });
    }

    const sigX = cx + cw - padX - 36;
    const placeDate = [config.issuePlace.trim(), config.issueDateText.trim()]
      .filter(Boolean)
      .join(', ');
    let sy = bottomAreaY + 2.5;
    doc.setFont(pdfFont, 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(15, 23, 42);
    if (placeDate) {
      doc.text(placeDate, sigX, sy);
      sy += 3;
    }
    doc.text('Kepala Sekolah,', sigX, sy);
    sy += 9.5;
    doc.setFont(pdfFont, 'bold');
    doc.text(config.headmasterName.trim() || '...........................', sigX, sy);
    const hmNip = formatOptionalNip(config.headmasterNip);
    if (hmNip) {
      sy += 3;
      doc.setFont(pdfFont, 'normal');
      doc.setFontSize(6);
      doc.text(hmNip, sigX, sy);
    }

    if (includeAppBranding && slotIdx === perPage - 1) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      doc.setTextColor(148, 163, 184);
      doc.text(
        `${APP_OFFICIAL_NAME} · ${APP_OFFICIAL_BRANDING} · Hal. ${pageIdx + 1}`,
        pageW / 2,
        pageH - 3,
        { align: 'center' }
      );
    }
  });

  doc.save(`kartu-peserta-ujian-${Date.now()}.pdf`);
}

function dataUrlToBytes(dataUrl: string): Uint8Array | null {
  try {
    const idx = dataUrl.indexOf(',');
    if (idx === -1) return null;
    const bin = atob(dataUrl.slice(idx + 1));
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) arr[i] = bin.charCodeAt(i);
    return arr;
  } catch {
    return null;
  }
}

export async function exportExamCardsDocx(
  participants: ExamCardParticipant[],
  config: ExamCardConfig,
  kopTemplate: KopTemplate | undefined,
  docId: DocumentIdentity,
  includeAppBranding = true
): Promise<void> {
  if (participants.length === 0) return;
  const effectiveKop = resolveEffectiveKop(kopTemplate, docId);
  const font = config.fontFamily || 'Times New Roman';
  const hmNip = formatOptionalNip(config.headmasterNip);
  const cardBorder = {
    style: BorderStyle.SINGLE,
    size: 12,
    color: config.borderColorHex.replace('#', '') || '0F172A',
  };
  const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };

  const buildCardTable = (p: ExamCardParticipant): Table => {
    const placeDate = [config.issuePlace.trim(), config.issueDateText.trim()]
      .filter(Boolean)
      .join(', ');

    const photoCellChildren: Paragraph[] = [];
    if (p.photoDataUrl) {
      const bytes = dataUrlToBytes(p.photoDataUrl);
      if (bytes) {
        photoCellChildren.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new ImageRun({
                data: bytes,
                type: p.photoDataUrl.includes('jpeg') || p.photoDataUrl.includes('jpg') ? 'jpg' : 'png',
                transformation: { width: 54, height: 72 },
              }),
            ],
          })
        );
      }
    }
    if (photoCellChildren.length === 0) {
      photoCellChildren.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 180, after: 180 },
          children: [new TextRun({ text: 'Foto 3×4', size: 16, font, color: '94A3B8' })],
        })
      );
    }

    const detailLines: Paragraph[] = [
      new Paragraph({
        spacing: { after: 25 },
        children: [
          new TextRun({ text: 'Nama: ', size: 17, font }),
          new TextRun({ text: p.name || '-', bold: true, size: 17, font }),
        ],
      }),
      new Paragraph({
        spacing: { after: 25 },
        children: [
          new TextRun({ text: 'Nomor Peserta: ', size: 17, font }),
          new TextRun({ text: p.participantNumber || '-', bold: true, size: 17, font }),
        ],
      }),
      ...(config.showNis && (p.nis || p.nisn)
        ? [
            new Paragraph({
              spacing: { after: 25 },
              children: [
                new TextRun({ text: 'NIS / NISN: ', size: 17, font }),
                new TextRun({
                  text: [p.nis, p.nisn].filter(Boolean).join(' / '),
                  size: 17,
                  font,
                }),
              ],
            }),
          ]
        : []),
      ...(config.showBirthPlaceDate && p.birthPlaceDate
        ? [
            new Paragraph({
              spacing: { after: 25 },
              children: [
                new TextRun({ text: 'Tempat, Tgl Lahir: ', size: 17, font }),
                new TextRun({ text: p.birthPlaceDate, size: 17, font }),
              ],
            }),
          ]
        : []),
      new Paragraph({
        spacing: { after: 25 },
        children: [
          new TextRun({ text: 'Kelas: ', size: 17, font }),
          new TextRun({ text: p.className || '-', bold: true, size: 17, font }),
        ],
      }),
      ...(config.showRoom && p.room
        ? [
            new Paragraph({
              spacing: { after: 25 },
              children: [
                new TextRun({ text: 'Ruang: ', size: 17, font }),
                new TextRun({ text: p.room, size: 17, font }),
              ],
            }),
          ]
        : []),
      ...(config.showSeatNumber && p.seatNumber
        ? [
            new Paragraph({
              spacing: { after: 25 },
              children: [
                new TextRun({ text: 'Nomor Meja: ', size: 17, font }),
                new TextRun({ text: p.seatNumber, size: 17, font }),
              ],
            }),
          ]
        : []),
    ];

    const leftLogoSrc = config.customLogoDataUrl || effectiveKop.leftLogoDataUrl || '';
    const rightLogoSrc =
      effectiveKop.rightLogoDataUrl || config.customLogoDataUrl || effectiveKop.leftLogoDataUrl || '';
    const logoPos = config.logoPosition ?? 'left';
    const allowLogos =
      logoPos !== 'none' &&
      (config.kopMode !== 'simple-header' || Boolean(config.customLogoDataUrl));
    const showLeftCardLogo = allowLogos && Boolean(leftLogoSrc) && (logoPos === 'left' || logoPos === 'both');
    const showRightCardLogo = allowLogos && Boolean(rightLogoSrc) && (logoPos === 'right' || logoPos === 'both');

    const headerTextRuns: Paragraph[] = [];
    if (config.kopMode !== 'simple-header' && effectiveKop.schoolName) {
      headerTextRuns.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 20 },
          children: [
            new TextRun({
              text: effectiveKop.schoolName.toUpperCase(),
              bold: true,
              size: 18,
              color: config.accentColorHex.replace('#', '') || '15803D',
              font,
            }),
          ],
        })
      );
    }
    headerTextRuns.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 15 },
        children: [
          new TextRun({
            text: config.cardTitle.toUpperCase(),
            bold: true,
            size: 20,
            font,
          }),
        ],
      })
    );
    if (config.academicYear.trim()) {
      headerTextRuns.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 30 },
          children: [
            new TextRun({
              text: `Tahun Ajaran ${config.academicYear}`,
              size: 16,
              color: '475569',
              font,
            }),
          ],
        })
      );
    }

    const buildDocxCardLogoCell = (src: string) => {
      const bytes = dataUrlToBytes(src);
      const dims = extractDimensionsFromDataUrl(src);
      const fitted = dims
        ? fitImageBoxDimensions(dims.width, dims.height, 26, 26, config.logoFitMode ?? 'contain')
        : { width: 26, height: 26 };
      return new TableCell({
        width: { size: 15, type: WidthType.PERCENTAGE },
        borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder },
        children: bytes
          ? [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new ImageRun({
                    data: bytes,
                    type: src.includes('jpeg') || src.includes('jpg') ? 'jpg' : 'png',
                    transformation: {
                      width: Math.round(fitted.width),
                      height: Math.round(fitted.height),
                    },
                  }),
                ],
              }),
            ]
          : [new Paragraph({ children: [] })],
      });
    };

    const headerRuns: Array<Paragraph | Table> =
      showLeftCardLogo || showRightCardLogo
        ? [
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: [
                new TableRow({
                  children: [
                    ...(showLeftCardLogo ? [buildDocxCardLogoCell(leftLogoSrc)] : []),
                    new TableCell({
                      width: {
                        size: showLeftCardLogo && showRightCardLogo ? 70 : 85,
                        type: WidthType.PERCENTAGE,
                      },
                      borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder },
                      children: headerTextRuns,
                    }),
                    ...(showRightCardLogo ? [buildDocxCardLogoCell(rightLogoSrc)] : []),
                  ],
                }),
              ],
            }),
            new Paragraph({
              spacing: { after: 35 },
              border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: '0F172A' } },
              children: [],
            }),
          ]
        : [
            ...headerTextRuns,
            new Paragraph({
              spacing: { after: 35 },
              border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: '0F172A' } },
              children: [],
            }),
          ];

    const footerSubTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 32, type: WidthType.PERCENTAGE },
              borders: { top: cardBorder, bottom: cardBorder, left: cardBorder, right: cardBorder },
              children: photoCellChildren,
            }),
            new TableCell({
              width: { size: 68, type: WidthType.PERCENTAGE },
              borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder },
              children: [
                new Paragraph({
                  alignment: AlignmentType.LEFT,
                  indent: { left: 260 },
                  spacing: { after: 20 },
                  children: [new TextRun({ text: placeDate, size: 16, font })],
                }),
                new Paragraph({
                  indent: { left: 260 },
                  spacing: { after: 220 },
                  children: [new TextRun({ text: 'Kepala Sekolah,', size: 16, font })],
                }),
                new Paragraph({
                  indent: { left: 260 },
                  spacing: { after: 15 },
                  children: [
                    new TextRun({
                      text: config.headmasterName.trim() || '...........................',
                      bold: true,
                      size: 16,
                      font,
                    }),
                  ],
                }),
                ...(hmNip
                  ? [
                      new Paragraph({
                        indent: { left: 260 },
                        children: [new TextRun({ text: hmNip, size: 15, font })],
                      }),
                    ]
                  : []),
              ],
            }),
          ],
        }),
      ],
    });

    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          cantSplit: true,
          children: [
            new TableCell({
              borders: { top: cardBorder, bottom: cardBorder, left: cardBorder, right: cardBorder },
              children: [...headerRuns, ...detailLines, footerSubTable],
            }),
          ],
        }),
      ],
    });
  };

  const children: Array<Paragraph | Table> = [];
  const perPage = config.cardsPerPage === 1 || config.cardsPerPage === 2 ? config.cardsPerPage : 4;

  for (let i = 0; i < participants.length; i += 2) {
    if (i > 0 && i % perPage === 0) {
      children.push(new Paragraph({ children: [new PageBreak()] }));
    }
    const left = participants[i]!;
    const right = participants[i + 1];
    if (perPage <= 2 || !right) {
      children.push(buildCardTable(left));
      children.push(new Paragraph({ spacing: { after: 120 }, children: [] }));
      if (right) {
        children.push(buildCardTable(right));
        children.push(new Paragraph({ spacing: { after: 120 }, children: [] }));
      }
    } else {
      children.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              cantSplit: true,
              children: [
                new TableCell({
                  width: { size: 48, type: WidthType.PERCENTAGE },
                  borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder },
                  children: [buildCardTable(left)],
                }),
                new TableCell({
                  width: { size: 4, type: WidthType.PERCENTAGE },
                  borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder },
                  children: [new Paragraph({ children: [] })],
                }),
                new TableCell({
                  width: { size: 48, type: WidthType.PERCENTAGE },
                  borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder },
                  children: [buildCardTable(right)],
                }),
              ],
            }),
          ],
        }),
        new Paragraph({ spacing: { after: 120 }, children: [] })
      );
    }
  }

  if (includeAppBranding) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 120 },
        children: [
          new TextRun({
            text: `${APP_OFFICIAL_NAME} · ${APP_OFFICIAL_BRANDING}`,
            size: 14,
            color: '94A3B8',
            font,
          }),
        ],
      })
    );
  }

  const doc = new Document({
    title: `${APP_OFFICIAL_NAME} — ${config.cardTitle}`,
    creator: APP_OFFICIAL_BRANDING,
    description: `Kartu Peserta Ujian dihasilkan oleh ${APP_OFFICIAL_NAME}`,
    sections: [
      {
        properties: {
          page: {
            margin: { top: 720, right: 720, bottom: 720, left: 720 },
          },
        },
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `kartu-peserta-ujian-${Date.now()}.docx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
