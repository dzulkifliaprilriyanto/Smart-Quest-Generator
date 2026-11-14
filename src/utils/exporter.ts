import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  PageBreak,
  PageOrientation,
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
  DocumentExportConfig,
  KopTemplate,
  QuestionImage,
  QuestionItem,
  QuestionSet,
} from '../types/question';
import { DEFAULT_DOC_IDENTITY, DEFAULT_EXPORT_CONFIG } from './curriculum';
import {
  buildKisiKisiRows,
  buildSafeFilename,
  formatQuestionSetAsText,
} from './formatter';
import {
  buildExamLayoutBlocks,
  buildTeacherIdentityLines,
  formatOptionalNip,
  getMarginMm,
  getMarginTwips,
} from './layoutEngine';
import {
  APP_OFFICIAL_BRANDING,
  APP_OFFICIAL_NAME,
  resolveEffectiveKop,
  shouldRenderKopForDoc,
} from './kopTemplates';
import {
  extractDimensionsFromDataUrl,
  extractImageDimensionsFromBytes,
  fitImageBoxDimensions,
} from './logoManager';
import { formatScore, round2 } from './scoring';

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportAsTxt(
  set: QuestionSet,
  options: { includeAnswerKey: boolean; filteredQuestions?: QuestionItem[] }
): void {
  const content = formatQuestionSetAsText(set, options);
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  triggerDownload(blob, buildSafeFilename(set, 'txt'));
}

function getMergedConfig(
  set: QuestionSet,
  options: { includeAnswerKey: boolean; exportConfig?: Partial<DocumentExportConfig> }
): DocumentExportConfig {
  return {
    ...DEFAULT_EXPORT_CONFIG,
    ...set.params.exportConfig,
    ...(options.exportConfig ?? {}),
    scoreBox: {
      ...DEFAULT_EXPORT_CONFIG.scoreBox,
      ...(set.params.exportConfig?.scoreBox ?? {}),
      ...(options.exportConfig?.scoreBox ?? {}),
    },
    includeAnswerKey: options.includeAnswerKey,
  };
}

function getDocxPageSizeTwips(
  paperSize: DocumentExportConfig['paperSize'],
  orientation: DocumentExportConfig['orientation']
): { width: number; height: number } {
  const base =
    paperSize === 'F4/Folio'
      ? { width: 12189, height: 18709 }
      : paperSize === 'Letter'
        ? { width: 12240, height: 15840 }
        : { width: 11906, height: 16838 };

  if (orientation === 'landscape') {
    return { width: base.height, height: base.width };
  }
  return base;
}

function dataUrlToUint8Array(dataUrl: string): Uint8Array | null {
  try {
    const commaIdx = dataUrl.indexOf(',');
    if (commaIdx === -1) return null;
    const base64 = dataUrl.slice(commaIdx + 1);
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

function detectDocxImageType(dataUrl: string): 'jpg' | 'png' | 'gif' {
  if (dataUrl.includes('image/jpeg') || dataUrl.includes('image/jpg')) return 'jpg';
  if (dataUrl.includes('image/gif')) return 'gif';
  return 'png';
}

function detectPdfImageFormat(dataUrl: string): 'JPEG' | 'PNG' | 'WEBP' {
  if (dataUrl.includes('image/jpeg') || dataUrl.includes('image/jpg')) return 'JPEG';
  if (dataUrl.includes('image/webp')) return 'WEBP';
  return 'PNG';
}

function getScaledImagePixels(
  img: QuestionImage,
  maxWidthPx: number
): { width: number; height: number } {
  const factor =
    img.displaySize === 'small' ? 0.55 : img.displaySize === 'large' ? 0.96 : 0.78;
  const targetW = Math.round(maxWidthPx * factor);
  const natW = img.width || 800;
  const natH = img.height || 600;
  const ratio = natH / Math.max(1, natW);
  const targetH = Math.max(48, Math.round(targetW * ratio));
  return { width: targetW, height: targetH };
}

function getScaledImageMm(
  img: QuestionImage,
  maxWidthMm: number
): { width: number; height: number } {
  const factor =
    img.displaySize === 'small' ? 0.52 : img.displaySize === 'large' ? 0.95 : 0.76;
  const targetW = maxWidthMm * factor;
  const natW = img.width || 800;
  const natH = img.height || 600;
  const targetH = Math.max(14, Math.min(95, targetW * (natH / Math.max(1, natW))));
  return { width: targetW, height: targetH };
}

function makeBorderlessCell(
  text: string,
  widthPct: number,
  font: string,
  sizeHalfPt: number,
  bold = false
): TableCell {
  const borderNone = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  const lines = text.split('\n');
  return new TableCell({
    width: { size: widthPct, type: WidthType.PERCENTAGE },
    borders: { top: borderNone, bottom: borderNone, left: borderNone, right: borderNone },
    children: lines.map(
      (line) =>
        new Paragraph({
          spacing: { after: 35 },
          children: [new TextRun({ text: line, bold, size: sizeHalfPt, font })],
        })
    ),
  });
}

function makeTableCell(
  text: string,
  font: string,
  sizeHalfPt: number,
  bold = false,
  shadingHex?: string
): TableCell {
  return new TableCell({
    shading: shadingHex ? { fill: shadingHex } : undefined,
    children: [
      new Paragraph({
        spacing: { before: 40, after: 40 },
        children: [new TextRun({ text, bold, size: sizeHalfPt, font })],
      }),
    ],
  });
}

function buildQuestionDocxParagraphs(
  q: QuestionItem,
  font: string,
  bodySize: number,
  smallSize: number,
  lineMult: number,
  cfg: DocumentExportConfig,
  maxImgPx: number
): Array<Paragraph | Table> {
  const items: Array<Paragraph | Table> = [];
  const afterSpacing = Math.round(60 * lineMult);

  const pushImageBlock = () => {
    if (!cfg.includeImages || !q.supportingImage?.dataUrl) return;
    if (q.supportingImage.format === 'svg') return;
    const imgBytes = dataUrlToUint8Array(q.supportingImage.dataUrl);
    if (!imgBytes) return;
    const dims = getScaledImagePixels(q.supportingImage, maxImgPx);
    items.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 80, after: 40 },
        children: [
          new ImageRun({
            data: imgBytes,
            type: detectDocxImageType(q.supportingImage.dataUrl),
            transformation: { width: dims.width, height: dims.height },
          }),
        ],
      })
    );
    if (q.supportingImage.caption) {
      items.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 60 },
          children: [
            new TextRun({
              text: q.supportingImage.caption,
              italics: true,
              size: smallSize - 2,
              color: '475569',
              font,
            }),
          ],
        })
      );
    }
  };

  if (q.stimulus) {
    items.push(
      new Paragraph({
        spacing: { before: 80, after: 50 },
        shading: { fill: 'F0FDF4' },
        children: [
          new TextRun({
            text: `Stimulus Soal ${q.number}: `,
            bold: true,
            size: smallSize,
            font,
            color: '14532D',
          }),
          new TextRun({
            text: q.stimulus,
            italics: true,
            size: smallSize,
            font,
            color: '334155',
          }),
        ],
      })
    );
  }

  if (q.supportingImage?.placement !== 'after') {
    pushImageBlock();
  }

  items.push(
    new Paragraph({
      spacing: { before: 80, after: afterSpacing },
      children: [
        new TextRun({ text: `${q.number}. `, bold: true, size: bodySize, font }),
        new TextRun({ text: q.questionText, size: bodySize, font }),
      ],
    })
  );

  if (q.supportingImage?.placement === 'after') {
    pushImageBlock();
  }

  if (q.matchingPairs && q.matchingPairs.length > 0) {
    items.push(
      new Table({
        width: { size: 96, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              makeTableCell('Pernyataan (Premis)', font, smallSize, true, 'DCFCE7'),
              makeTableCell('Pasangan Jawaban', font, smallSize, true, 'DCFCE7'),
            ],
          }),
          ...q.matchingPairs.map(
            (pair, pIdx) =>
              new TableRow({
                children: [
                  makeTableCell(`${pIdx + 1}. ${pair.prompt}`, font, smallSize),
                  makeTableCell(
                    `( ... ) ${String.fromCharCode(65 + pIdx)}. ${pair.match}`,
                    font,
                    smallSize
                  ),
                ],
              })
          ),
        ],
      })
    );
  } else if (q.options.length > 0) {
    q.options.forEach((opt) => {
      items.push(
        new Paragraph({
          indent: { left: 320 },
          spacing: { after: Math.round(30 * lineMult) },
          children: [
            new TextRun({ text: `${opt.label}. `, bold: true, size: bodySize - 2, font }),
            new TextRun({ text: opt.text, size: bodySize - 2, font }),
          ],
        })
      );
    });
  } else {
    items.push(
      new Paragraph({
        indent: { left: 320 },
        spacing: { before: 50, after: 110 },
        children: [
          new TextRun({
            text: 'Jawaban: ____________________________________________________________________',
            size: smallSize,
            color: '94A3B8',
            font,
          }),
        ],
      })
    );
  }

  return items;
}

function mapKopDividerBorderStyle(
  style: KopTemplate['dividerStyle']
): (typeof BorderStyle)[keyof typeof BorderStyle] {
  if (style === 'double' || style === 'thick-thin') return BorderStyle.DOUBLE;
  if (style === 'custom') return BorderStyle.DASHED;
  return BorderStyle.SINGLE;
}

function buildKopCenterParagraphsDocx(
  kop: KopTemplate,
  docTitle: string,
  font: string,
  bodySize: number
): Paragraph[] {
  const align =
    kop.textAlign === 'left'
      ? AlignmentType.LEFT
      : kop.textAlign === 'right'
        ? AlignmentType.RIGHT
        : AlignmentType.CENTER;
  const textHex = kop.textColorHex.replace('#', '') || '0F172A';
  const accentHex = kop.accentColorHex.replace('#', '') || '15803D';
  const instSize = Math.round((kop.institutionFontSizePt || 11) * 2);
  const schoolSize = Math.round((kop.schoolFontSizePt || 14) * 2);
  const contactSize = Math.round((kop.contactFontSizePt || 9) * 2);

  const paras: Paragraph[] = [];

  if (kop.institutionName.trim()) {
    paras.push(
      new Paragraph({
        alignment: align,
        spacing: { after: 20 },
        children: [
          new TextRun({
            text: kop.institutionName.trim().toUpperCase(),
            bold: true,
            size: instSize,
            font: kop.fontFamily || font,
            color: textHex,
          }),
        ],
      })
    );
  }

  if (kop.schoolName.trim()) {
    paras.push(
      new Paragraph({
        alignment: align,
        spacing: { after: 25 },
        children: [
          new TextRun({
            text: kop.schoolName.trim().toUpperCase(),
            bold: true,
            size: schoolSize,
            font: kop.fontFamily || font,
            color: textHex,
          }),
        ],
      })
    );
  }

  if (kop.subIdentity.trim()) {
    paras.push(
      new Paragraph({
        alignment: align,
        spacing: { after: 20 },
        children: [
          new TextRun({
            text: kop.subIdentity.trim(),
            size: contactSize,
            font: kop.fontFamily || font,
            color: '475569',
          }),
        ],
      })
    );
  }

  if (kop.schoolAddress.trim()) {
    paras.push(
      new Paragraph({
        alignment: align,
        spacing: { after: 20 },
        children: [
          new TextRun({
            text: kop.schoolAddress.trim(),
            size: contactSize,
            font: kop.fontFamily || font,
            color: '475569',
          }),
        ],
      })
    );
  }

  const contactParts = [
    kop.phone.trim() ? `Telp. ${kop.phone.trim()}` : '',
    kop.email.trim() ? `Email: ${kop.email.trim()}` : '',
    kop.website.trim() || '',
    kop.npsn.trim() ? `NPSN: ${kop.npsn.trim()}` : '',
  ].filter(Boolean);

  if (contactParts.length > 0) {
    paras.push(
      new Paragraph({
        alignment: align,
        spacing: { after: 30 },
        children: [
          new TextRun({
            text: contactParts.join(' · '),
            size: Math.max(14, contactSize - 1),
            font: kop.fontFamily || font,
            color: '475569',
          }),
        ],
      })
    );
  }

  const resolvedTitle = kop.defaultDocTitle.trim() || docTitle;
  paras.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      spacing: { before: 40, after: 40 },
      children: [
        new TextRun({
          text: resolvedTitle.toUpperCase(),
          bold: true,
          size: bodySize + 2,
          font: kop.fontFamily || font,
          color: accentHex,
        }),
      ],
    })
  );

  return paras;
}

export async function exportAsDocx(
  set: QuestionSet,
  options: {
    includeAnswerKey: boolean;
    filteredQuestions?: QuestionItem[];
    exportConfig?: Partial<DocumentExportConfig>;
    kopTemplate?: KopTemplate;
  }
): Promise<void> {
  const questions = options.filteredQuestions ?? set.questions;
  const cfg = getMergedConfig(set, options);
  const docId = { ...DEFAULT_DOC_IDENTITY, ...(set.params.docIdentity ?? {}) };
  const effectiveKop = resolveEffectiveKop(options.kopTemplate, docId);
  const font = effectiveKop.fontFamily || cfg.fontFamily || 'Times New Roman';
  const bodySize = (cfg.fontSize || 12) * 2;
  const smallSize = bodySize - 4;
  const lineMult =
    cfg.lineSpacing === 'compact' ? 0.8 : cfg.lineSpacing === 'relaxed' ? 1.35 : 1;
  const schoolName = (
    effectiveKop.schoolName ||
    docId.schoolName ||
    set.params.schoolName ||
    ''
  ).trim();

  const children: Array<Paragraph | Table> = [];
  const borderNone = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  const boxBorder = { style: BorderStyle.SINGLE, size: 8, color: '1E293B' };

  const makeScoreBoxTable = () =>
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              shading: { fill: 'F0FDF4' },
              borders: { top: boxBorder, bottom: boxBorder, left: boxBorder, right: boxBorder },
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing: { before: 30, after: 30 },
                  children: [
                    new TextRun({
                      text: (cfg.scoreBox.label || 'NILAI').toUpperCase(),
                      bold: true,
                      size: smallSize,
                      font,
                      color: '14532D',
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({
              borders: { top: boxBorder, bottom: boxBorder, left: boxBorder, right: boxBorder },
              children: [
                new Paragraph({
                  spacing: { before: 180, after: 180 },
                  children: [new TextRun({ text: ' ', size: bodySize })],
                }),
                ...(cfg.scoreBox.showInitials
                  ? [
                      new Paragraph({
                        spacing: { after: 40 },
                        children: [
                          new TextRun({
                            text: 'Paraf Guru: ________',
                            size: smallSize - 2,
                            font,
                            color: '475569',
                          }),
                        ],
                      }),
                    ]
                  : []),
                ...(cfg.scoreBox.showTeacherNote
                  ? [
                      new Paragraph({
                        spacing: { after: 30 },
                        children: [
                          new TextRun({
                            text: 'Catatan: ___________',
                            size: smallSize - 2,
                            font,
                            color: '475569',
                          }),
                        ],
                      }),
                    ]
                  : []),
              ],
            }),
          ],
        }),
      ],
    });

  // Render Page 1 Kop according to KopTemplate Layout A–E
  const renderKopOnExam = shouldRenderKopForDoc(effectiveKop, 'examPaper', 1);
  const logoMaxW = Math.round((effectiveKop.logoWidthMm || 16) * 3.2);
  const logoMaxH = Math.round((effectiveKop.logoHeightMm || 16) * 3.2);
  const leftLogoBytes =
    effectiveKop.leftLogoDataUrl ? dataUrlToUint8Array(effectiveKop.leftLogoDataUrl) : null;
  const rightLogoBytes =
    effectiveKop.rightLogoDataUrl ? dataUrlToUint8Array(effectiveKop.rightLogoDataUrl) : null;
  const leftLogoNat = leftLogoBytes ? extractImageDimensionsFromBytes(leftLogoBytes) : null;
  const rightLogoNat = rightLogoBytes ? extractImageDimensionsFromBytes(rightLogoBytes) : null;
  const fitMode = effectiveKop.logoFitMode || docId.schoolLogoFit || 'contain';
  const leftLogoSize = leftLogoNat
    ? fitImageBoxDimensions(leftLogoNat.width, leftLogoNat.height, logoMaxW, logoMaxH, fitMode)
    : { width: logoMaxW, height: logoMaxH };
  const rightLogoSize = rightLogoNat
    ? fitImageBoxDimensions(rightLogoNat.width, rightLogoNat.height, logoMaxW, logoMaxH, fitMode)
    : { width: logoMaxW, height: logoMaxH };

  const kopCenterParas = buildKopCenterParagraphsDocx(effectiveKop, set.title, font, bodySize);

  const showLeftLogo =
    renderKopOnExam &&
    Boolean(leftLogoBytes) &&
    (effectiveKop.layout === 'A' ||
      effectiveKop.layout === 'B' ||
      (effectiveKop.layout === 'E' &&
        (effectiveKop.customLogoPosition === 'left' ||
          effectiveKop.customLogoPosition === 'both')));
  const showRightLogo =
    renderKopOnExam &&
    Boolean(rightLogoBytes) &&
    (effectiveKop.layout === 'B' ||
      (effectiveKop.layout === 'E' &&
        (effectiveKop.customLogoPosition === 'right' ||
          effectiveKop.customLogoPosition === 'both')));
  const showTopLogo =
    renderKopOnExam &&
    Boolean(leftLogoBytes) &&
    (effectiveKop.layout === 'C' ||
      (effectiveKop.layout === 'E' && effectiveKop.customLogoPosition === 'top'));

  let kopBlockNodes: Array<Paragraph | Table> = [];
  if (renderKopOnExam) {
    if (showTopLogo && leftLogoBytes) {
      kopBlockNodes = [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 50 },
          children: [
            new ImageRun({
              data: leftLogoBytes,
              type: detectDocxImageType(effectiveKop.leftLogoDataUrl),
              transformation: {
                width: Math.round(leftLogoSize.width),
                height: Math.round(leftLogoSize.height),
              },
            }),
          ],
        }),
        ...kopCenterParas,
      ];
    } else if (showLeftLogo || showRightLogo) {
      const cells: TableCell[] = [];
      if (showLeftLogo && leftLogoBytes) {
        cells.push(
          new TableCell({
            width: { size: 15, type: WidthType.PERCENTAGE },
            borders: { top: borderNone, bottom: borderNone, left: borderNone, right: borderNone },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new ImageRun({
                    data: leftLogoBytes,
                    type: detectDocxImageType(effectiveKop.leftLogoDataUrl),
                    transformation: {
                      width: Math.round(leftLogoSize.width),
                      height: Math.round(leftLogoSize.height),
                    },
                  }),
                ],
              }),
            ],
          })
        );
      }
      cells.push(
        new TableCell({
          width: {
            size: showLeftLogo && showRightLogo ? 70 : 85,
            type: WidthType.PERCENTAGE,
          },
          borders: { top: borderNone, bottom: borderNone, left: borderNone, right: borderNone },
          children: kopCenterParas,
        })
      );
      if (showRightLogo && rightLogoBytes) {
        cells.push(
          new TableCell({
            width: { size: 15, type: WidthType.PERCENTAGE },
            borders: { top: borderNone, bottom: borderNone, left: borderNone, right: borderNone },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new ImageRun({
                    data: rightLogoBytes,
                    type: detectDocxImageType(effectiveKop.rightLogoDataUrl),
                    transformation: {
                      width: Math.round(rightLogoSize.width),
                      height: Math.round(rightLogoSize.height),
                    },
                  }),
                ],
              }),
            ],
          })
        );
      }
      kopBlockNodes = [
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [new TableRow({ children: cells })],
        }),
      ];
    } else {
      kopBlockNodes = kopCenterParas;
    }
  } else {
    kopBlockNodes = [
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        spacing: { after: 60 },
        children: [
          new TextRun({
            text: set.title.toUpperCase(),
            bold: true,
            size: bodySize + 2,
            font,
            color: '14532D',
          }),
        ],
      }),
    ];
  }

  if (cfg.scoreBox.enabled && cfg.scoreBox.position !== 'after-header') {
    const isLeft = cfg.scoreBox.position === 'top-left';
    const scoreWidth = cfg.scoreBox.size === 'compact' ? 18 : cfg.scoreBox.size === 'large' ? 28 : 22;
    const kopCell = new TableCell({
      width: { size: 100 - scoreWidth, type: WidthType.PERCENTAGE },
      borders: { top: borderNone, bottom: borderNone, left: borderNone, right: borderNone },
      children: kopBlockNodes,
    });
    const scoreCell = new TableCell({
      width: { size: scoreWidth, type: WidthType.PERCENTAGE },
      borders: { top: borderNone, bottom: borderNone, left: borderNone, right: borderNone },
      children: [makeScoreBoxTable()],
    });

    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: isLeft ? [scoreCell, kopCell] : [kopCell, scoreCell],
          }),
        ],
      })
    );
  } else {
    children.push(...kopBlockNodes);
  }

  if (effectiveKop.dividerStyle !== 'none') {
    children.push(
      new Paragraph({
        spacing: {
          before: Math.round((effectiveKop.dividerMarginTopMm || 2) * 20),
          after: Math.round((effectiveKop.dividerMarginBottomMm || 3) * 40),
        },
        border: {
          bottom: {
            style: mapKopDividerBorderStyle(effectiveKop.dividerStyle),
            size: Math.max(4, Math.round((effectiveKop.dividerThicknessPt || 2) * 6)),
            color: effectiveKop.dividerColorHex.replace('#', '') || '0F172A',
          },
        },
        children: [],
      })
    );
  }

  // Formal Indonesian Exam Identity Grid (omit empty school/teacher rows cleanly)
  const teacherNipDisplay = formatOptionalNip(docId.teacherNip);
  const teacherNameTrim = docId.teacherName.trim();
  const teacherText = teacherNameTrim
    ? teacherNipDisplay
      ? `${teacherNameTrim} (${teacherNipDisplay})`
      : teacherNameTrim
    : '';

  const leftMeta: Array<[string, string]> = [
    ...(schoolName ? [['SATUAN PENDIDIKAN', schoolName] as [string, string]] : []),
    ['MATA PELAJARAN', set.params.subject],
    ['KELAS / FASE', `${set.params.educationLevel} · ${set.params.grade} (${set.params.learningPlan?.phase || '-'})`],
    ...(teacherText ? [['GURU PENYUSUN', teacherText] as [string, string]] : []),
  ];
  const rightMeta: Array<[string, string]> = [
    ['SEMESTER / TA', `${docId.semester} / ${docId.academicYear}`],
    ['ALOKASI WAKTU', docId.timeAllocation],
    ['JUMLAH SOAL', `${questions.length} Butir`],
    ['KURIKULUM', set.params.curriculum],
  ];
  const rowTotal = Math.max(leftMeta.length, rightMeta.length);

  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: Array.from({ length: rowTotal }, (_, rIdx) => {
        const lItem = leftMeta[rIdx];
        const rItem = rightMeta[rIdx];
        return new TableRow({
          children: [
            makeBorderlessCell(lItem ? lItem[0] : '', 23, font, smallSize, Boolean(lItem)),
            makeBorderlessCell(lItem ? `: ${lItem[1]}` : '', 27, font, smallSize),
            makeBorderlessCell(rItem ? rItem[0] : '', 21, font, smallSize, Boolean(rItem)),
            makeBorderlessCell(rItem ? `: ${rItem[1]}` : '', 29, font, smallSize),
          ],
        });
      }),
    })
  );

  if (cfg.scoreBox.enabled && cfg.scoreBox.position === 'after-header') {
    children.push(
      new Paragraph({ spacing: { before: 80, after: 40 }, children: [] }),
      makeScoreBoxTable()
    );
  }

  if (cfg.includeStudentIdentity) {
    children.push(
      new Paragraph({ spacing: { before: 90, after: 30 }, children: [] }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              makeTableCell('Nama Peserta Didik : ..............................................', font, smallSize),
              makeTableCell('Kelas / No. Absen : .................... / ........', font, smallSize),
            ],
          }),
        ],
      })
    );
  }

  children.push(
    new Paragraph({
      spacing: { before: 120, after: 50 },
      children: [
        new TextRun({
          text: 'PETUNJUK PENGERJAAN:',
          bold: true,
          size: smallSize,
          font,
          color: '15803D',
        }),
      ],
    }),
    new Paragraph({
      spacing: { after: 30 },
      children: [
        new TextRun({
          text: '1. Berdoalah sebelum mulai mengerjakan dan tuliskan identitas diri dengan lengkap.',
          size: smallSize,
          font,
        }),
      ],
    }),
    new Paragraph({
      spacing: { after: 120 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'CBD5E1' } },
      children: [
        new TextRun({
          text: '2. Bacalah setiap stimulus, gambar, tabel, atau pertanyaan dengan teliti sebelum menjawab.',
          size: smallSize,
          font,
        }),
      ],
    })
  );

  // Smart Layout Rendering (Two-Column PG & Full-Width Essay/Large Images)
  const blocks = buildExamLayoutBlocks(questions, cfg);
  blocks.forEach((block) => {
    if (block.kind === 'two-column-row') {
      const leftChildren = buildQuestionDocxParagraphs(
        block.left,
        font,
        bodySize,
        smallSize,
        lineMult,
        cfg,
        240
      );
      const rightChildren = block.right
        ? buildQuestionDocxParagraphs(block.right, font, bodySize, smallSize, lineMult, cfg, 240)
        : [new Paragraph({ children: [] })];

      children.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              cantSplit: true,
              children: [
                new TableCell({
                  width: { size: 49, type: WidthType.PERCENTAGE },
                  borders: { top: borderNone, bottom: borderNone, left: borderNone, right: borderNone },
                  children: leftChildren,
                }),
                new TableCell({
                  width: { size: 2, type: WidthType.PERCENTAGE },
                  borders: { top: borderNone, bottom: borderNone, left: borderNone, right: borderNone },
                  children: [new Paragraph({ children: [] })],
                }),
                new TableCell({
                  width: { size: 49, type: WidthType.PERCENTAGE },
                  borders: { top: borderNone, bottom: borderNone, left: borderNone, right: borderNone },
                  children: rightChildren,
                }),
              ],
            }),
          ],
        })
      );
    } else {
      children.push(
        ...buildQuestionDocxParagraphs(block.question, font, bodySize, smallSize, lineMult, cfg, 440)
      );
    }
  });

  // Signature Block (Optional Headmaster, Optional Teacher NIP)
  if (cfg.includeSignatureBlock) {
    const teacherLines = buildTeacherIdentityLines(docId);
    const headmasterLines = [
      'Mengetahui,',
      'Kepala Sekolah',
      '',
      '',
      docId.headmasterName.trim() || '.........................',
      ...(formatOptionalNip(docId.headmasterNip) ? [formatOptionalNip(docId.headmasterNip)] : []),
    ];

    const teacherSignatureChildren: Paragraph[] = [
      new Paragraph({
        spacing: { after: 35 },
        children: [new TextRun({ text: 'Guru Penyusun / Mata Pelajaran,', size: smallSize, font })],
      }),
    ];
    if (docId.teacherSignatureDataUrl) {
      const sigBytes = dataUrlToUint8Array(docId.teacherSignatureDataUrl);
      if (sigBytes) {
        teacherSignatureChildren.push(
          new Paragraph({
            spacing: { after: 30 },
            children: [
              new ImageRun({
                data: sigBytes,
                type: detectDocxImageType(docId.teacherSignatureDataUrl),
                transformation: { width: 96, height: 42 },
              }),
            ],
          })
        );
      }
    } else {
      teacherSignatureChildren.push(
        new Paragraph({ spacing: { before: 160, after: 160 }, children: [] })
      );
    }
    teacherLines.forEach((line, i) => {
      teacherSignatureChildren.push(
        new Paragraph({
          spacing: { after: 25 },
          children: [new TextRun({ text: line, bold: i === 0, size: smallSize, font })],
        })
      );
    });

    children.push(
      new Paragraph({ spacing: { before: 220, after: 50 }, children: [] }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              makeBorderlessCell(headmasterLines.join('\n'), 50, font, smallSize),
              new TableCell({
                width: { size: 50, type: WidthType.PERCENTAGE },
                borders: { top: borderNone, bottom: borderNone, left: borderNone, right: borderNone },
                children: teacherSignatureChildren,
              }),
            ],
          }),
        ],
      })
    );
  }

  // Section 2: Kunci Jawaban
  if (cfg.includeAnswerKey && questions.length > 0) {
    children.push(
      new Paragraph({ children: [new PageBreak()] }),
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { after: 150 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: '15803D' } },
        children: [
          new TextRun({
            text: 'KUNCI JAWABAN, PEMBAHASAN & RUBRIK PENSKORAN',
            bold: true,
            size: bodySize + 2,
            color: '15803D',
            font,
          }),
        ],
      })
    );

    questions.forEach((q, index) => {
      children.push(
        new Paragraph({
          spacing: { before: 90, after: 30 },
          children: [
            new TextRun({ text: `${index + 1}. Kunci Jawaban: `, bold: true, size: smallSize, font }),
            new TextRun({
              text: `${q.correctAnswer} (Bobot: ${formatScore(q.scoreWeight)})`,
              bold: true,
              size: smallSize,
              color: '15803D',
              font,
            }),
          ],
        })
      );
      if (q.explanation) {
        children.push(
          new Paragraph({
            indent: { left: 320 },
            spacing: { after: 45 },
            children: [
              new TextRun({
                text: `Pembahasan: ${q.explanation}`,
                size: smallSize,
                color: '334155',
                font,
              }),
            ],
          })
        );
      }
      if (cfg.includeRubric && q.rubric && q.rubric.length > 0) {
        q.rubric.forEach((r) => {
          children.push(
            new Paragraph({
              indent: { left: 480 },
              spacing: { after: 25 },
              children: [
                new TextRun({
                  text: `• ${r.criterion} (Maks ${r.maxScore}): ${r.descriptor}`,
                  size: smallSize - 2,
                  color: '475569',
                  font,
                }),
              ],
            })
          );
        });
      }
    });
  }

  // Section 3: Kisi-Kisi Soal (NEVER prints Teacher Score Box)
  if (cfg.includeBlueprint && questions.length > 0) {
    const kisiRows = buildKisiKisiRows(set, questions);
    children.push(
      new Paragraph({ children: [new PageBreak()] }),
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { after: 120 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: '15803D' } },
        children: [
          new TextRun({
            text: schoolName
              ? `KISI-KISI PENULISAN SOAL — ${schoolName.toUpperCase()}`
              : 'KISI-KISI PENULISAN SOAL',
            bold: true,
            size: bodySize + 2,
            color: '15803D',
            font,
          }),
        ],
      }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              makeTableCell('No', font, smallSize - 2, true, 'DCFCE7'),
              makeTableCell('Tujuan Pembelajaran / KD', font, smallSize - 2, true, 'DCFCE7'),
              makeTableCell('Materi', font, smallSize - 2, true, 'DCFCE7'),
              makeTableCell('Indikator Soal', font, smallSize - 2, true, 'DCFCE7'),
              makeTableCell('Level', font, smallSize - 2, true, 'DCFCE7'),
              makeTableCell('Bentuk', font, smallSize - 2, true, 'DCFCE7'),
              makeTableCell('No. Soal', font, smallSize - 2, true, 'DCFCE7'),
            ],
          }),
          ...kisiRows.map(
            (row) =>
              new TableRow({
                children: [
                  makeTableCell(String(row.number), font, smallSize - 2),
                  makeTableCell(row.learningObjective, font, smallSize - 2),
                  makeTableCell(row.material, font, smallSize - 2),
                  makeTableCell(row.indicator, font, smallSize - 2),
                  makeTableCell(row.cognitiveLevel, font, smallSize - 2),
                  makeTableCell(row.questionForm, font, smallSize - 2),
                  makeTableCell(String(row.questionNumber), font, smallSize - 2),
                ],
              })
          ),
        ],
      })
    );
  }

  // Section 4: Lembar Jawaban Siswa
  if (cfg.includeAnswerSheet && questions.length > 0) {
    children.push(
      new Paragraph({ children: [new PageBreak()] }),
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { after: 120 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: '15803D' } },
        children: [
          new TextRun({
            text: schoolName
              ? `LEMBAR JAWABAN PESERTA DIDIK — ${schoolName.toUpperCase()}`
              : 'LEMBAR JAWABAN PESERTA DIDIK',
            bold: true,
            size: bodySize + 2,
            color: '15803D',
            font,
          }),
        ],
      }),
      new Paragraph({
        spacing: { after: 120 },
        children: [
          new TextRun({
            text: 'Nama: ____________________________________   Kelas: ____________   Nilai: ________',
            size: smallSize,
            font,
          }),
        ],
      }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              makeTableCell('No.', font, smallSize - 2, true, 'F0FDF4'),
              makeTableCell('Bentuk Soal', font, smallSize - 2, true, 'F0FDF4'),
              makeTableCell('Jawaban Peserta Didik', font, smallSize - 2, true, 'F0FDF4'),
              makeTableCell('Skor', font, smallSize - 2, true, 'F0FDF4'),
            ],
          }),
          ...questions.map(
            (q, idx) =>
              new TableRow({
                children: [
                  makeTableCell(String(idx + 1), font, smallSize - 2),
                  makeTableCell(q.questionSubType || q.type, font, smallSize - 2),
                  makeTableCell(
                    q.options.length > 0
                      ? q.options.map((o) => `[ ${o.label} ]`).join('   ')
                      : '..........................................................................',
                    font,
                    smallSize - 2
                  ),
                  makeTableCell(`.... / ${formatScore(q.scoreWeight)}`, font, smallSize - 2),
                ],
              })
          ),
        ],
      })
    );
  }

  if (cfg.includeAppBranding !== false) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 180 },
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

  const pageSize = getDocxPageSizeTwips(cfg.paperSize, cfg.orientation);
  const marginTwips = getMarginTwips(cfg.marginPreset);
  const doc = new Document({
    title: `${APP_OFFICIAL_NAME} — ${set.title}`,
    creator: APP_OFFICIAL_BRANDING,
    description: `Dokumen asesmen ${set.params.subject} disusun dengan ${APP_OFFICIAL_NAME}`,
    sections: [
      {
        properties: {
          page: {
            size: {
              ...pageSize,
              orientation:
                cfg.orientation === 'landscape'
                  ? PageOrientation.LANDSCAPE
                  : PageOrientation.PORTRAIT,
            },
            margin: {
              top: marginTwips,
              right: marginTwips,
              bottom: marginTwips,
              left: marginTwips,
            },
          },
        },
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  triggerDownload(blob, buildSafeFilename(set, 'docx'));
}

function hexToPdfRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '').trim();
  if (clean.length !== 6) return [15, 23, 42];
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return [15, 23, 42];
  return [r, g, b];
}

export function exportAsPdf(
  set: QuestionSet,
  options: {
    includeAnswerKey: boolean;
    filteredQuestions?: QuestionItem[];
    exportConfig?: Partial<DocumentExportConfig>;
    kopTemplate?: KopTemplate;
  }
): void {
  const questions = options.filteredQuestions ?? set.questions;
  const cfg = getMergedConfig(set, options);
  const docId = { ...DEFAULT_DOC_IDENTITY, ...(set.params.docIdentity ?? {}) };
  const effectiveKop = resolveEffectiveKop(options.kopTemplate, docId);

  const format: string | number[] =
    cfg.paperSize === 'F4/Folio'
      ? [215, 330]
      : cfg.paperSize === 'Letter'
        ? 'letter'
        : 'a4';

  const doc = new jsPDF({
    unit: 'mm',
    format,
    orientation: cfg.orientation,
  });

  doc.setProperties({
    title: `${APP_OFFICIAL_NAME} — ${set.title}`,
    subject: `${set.params.subject} (${set.params.assessmentType})`,
    author: APP_OFFICIAL_BRANDING,
    creator: APP_OFFICIAL_NAME,
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = getMarginMm(cfg.marginPreset);
  const contentWidth = pageWidth - marginX * 2;
  const lineMult =
    cfg.lineSpacing === 'compact' ? 0.85 : cfg.lineSpacing === 'relaxed' ? 1.25 : 1;
  let cursorY = marginX;

  const pdfFont =
    (effectiveKop.fontFamily || cfg.fontFamily) === 'Times New Roman' ? 'times' : 'helvetica';
  const baseFontSize = cfg.fontSize === 11 ? 9.8 : 10.5;
  const schoolName = (
    effectiveKop.schoolName ||
    docId.schoolName ||
    set.params.schoolName ||
    ''
  ).trim();

  const ensureSpace = (neededMm: number) => {
    if (cursorY + neededMm > pageHeight - marginX - 6) {
      doc.addPage();
      cursorY = marginX;
    }
  };

  // Teacher Score Box Dimensions
  const scoreBoxW =
    cfg.scoreBox.size === 'compact' ? 28 : cfg.scoreBox.size === 'large' ? 42 : 34;
  const scoreBoxH =
    cfg.scoreBox.size === 'compact'
      ? 18
      : cfg.scoreBox.size === 'large'
        ? 28
        : 22 + (cfg.scoreBox.showInitials ? 4 : 0) + (cfg.scoreBox.showTeacherNote ? 4 : 0);

  const drawScoreBoxAt = (bx: number, by: number) => {
    doc.setDrawColor(20, 83, 45);
    doc.setFillColor(240, 253, 244);
    doc.setLineWidth(0.45);
    doc.rect(bx, by, scoreBoxW, 6.5, 'FD');
    doc.setFillColor(255, 255, 255);
    doc.rect(bx, by + 6.5, scoreBoxW, scoreBoxH - 6.5, 'D');
    doc.setFont(pdfFont, 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(20, 83, 45);
    doc.text((cfg.scoreBox.label || 'NILAI').toUpperCase(), bx + scoreBoxW / 2, by + 4.4, {
      align: 'center',
    });

    let innerY = by + scoreBoxH - 3.5;
    if (cfg.scoreBox.showTeacherNote) {
      doc.setFont(pdfFont, 'normal');
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text('Catatan: ...........', bx + 2, innerY);
      innerY -= 4;
    }
    if (cfg.scoreBox.showInitials) {
      doc.setFont(pdfFont, 'normal');
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text('Paraf: ........', bx + 2, innerY);
    }
  };

  // Header + KopTemplate Layout A-E + Optional Score Box (avoid overlap!)
  const hasTopScoreBox = cfg.scoreBox.enabled && cfg.scoreBox.position !== 'after-header';
  const headerStartY = cursorY;
  const headerCenterX = hasTopScoreBox
    ? cfg.scoreBox.position === 'top-left'
      ? marginX + scoreBoxW + (contentWidth - scoreBoxW) / 2
      : marginX + (contentWidth - scoreBoxW) / 2
    : pageWidth / 2;
  const headerTextMaxW = hasTopScoreBox ? contentWidth - scoreBoxW - 12 : contentWidth - 10;

  const renderKop = shouldRenderKopForDoc(effectiveKop, 'examPaper', 1);
  const logoW = Math.min(24, Math.max(8, effectiveKop.logoWidthMm || 14));
  const logoH = Math.min(24, Math.max(8, effectiveKop.logoHeightMm || 14));
  const showLeft =
    renderKop &&
    Boolean(effectiveKop.leftLogoDataUrl) &&
    (effectiveKop.layout === 'A' ||
      effectiveKop.layout === 'B' ||
      (effectiveKop.layout === 'E' &&
        (effectiveKop.customLogoPosition === 'left' ||
          effectiveKop.customLogoPosition === 'both')));
  const showRight =
    renderKop &&
    Boolean(effectiveKop.rightLogoDataUrl) &&
    (effectiveKop.layout === 'B' ||
      (effectiveKop.layout === 'E' &&
        (effectiveKop.customLogoPosition === 'right' ||
          effectiveKop.customLogoPosition === 'both')));
  const showTop =
    renderKop &&
    Boolean(effectiveKop.leftLogoDataUrl) &&
    (effectiveKop.layout === 'C' ||
      (effectiveKop.layout === 'E' && effectiveKop.customLogoPosition === 'top'));

  const [tr, tg, tb] = hexToPdfRgb(effectiveKop.textColorHex);
  const [ar, ag, ab] = hexToPdfRgb(effectiveKop.accentColorHex);
  const alignOpt: 'left' | 'center' | 'right' =
    effectiveKop.textAlign === 'left' || effectiveKop.textAlign === 'right'
      ? effectiveKop.textAlign
      : 'center';
  const alignX =
    alignOpt === 'left'
      ? marginX + (showLeft ? logoW + 4 : 0) + (hasTopScoreBox && cfg.scoreBox.position === 'top-left' ? scoreBoxW + 3 : 0)
      : alignOpt === 'right'
        ? pageWidth - marginX - (showRight ? logoW + 4 : 0) - (hasTopScoreBox && cfg.scoreBox.position === 'top-right' ? scoreBoxW + 3 : 0)
        : headerCenterX;

  const pdfLogoFit = effectiveKop.logoFitMode || docId.schoolLogoFit || 'contain';
  const getFittedPdfLogo = (src: string) => {
    const dims = extractDimensionsFromDataUrl(src);
    return dims
      ? fitImageBoxDimensions(dims.width, dims.height, logoW, logoH, pdfLogoFit)
      : { width: logoW, height: logoH };
  };

  if (renderKop) {
    if (showTop && effectiveKop.leftLogoDataUrl) {
      try {
        const fitted = getFittedPdfLogo(effectiveKop.leftLogoDataUrl);
        doc.addImage(
          effectiveKop.leftLogoDataUrl,
          detectPdfImageFormat(effectiveKop.leftLogoDataUrl),
          headerCenterX - fitted.width / 2,
          cursorY,
          fitted.width,
          fitted.height
        );
        cursorY += fitted.height + 3;
      } catch {
        // Ignore invalid logo
      }
    } else {
      if (showLeft && effectiveKop.leftLogoDataUrl) {
        try {
          const fitted = getFittedPdfLogo(effectiveKop.leftLogoDataUrl);
          const lx =
            hasTopScoreBox && cfg.scoreBox.position === 'top-left'
              ? marginX + scoreBoxW + 4
              : marginX;
          doc.addImage(
            effectiveKop.leftLogoDataUrl,
            detectPdfImageFormat(effectiveKop.leftLogoDataUrl),
            lx + (logoW - fitted.width) / 2,
            cursorY - 1 + (logoH - fitted.height) / 2,
            fitted.width,
            fitted.height
          );
        } catch {
          // Ignore invalid logo
        }
      }
      if (showRight && effectiveKop.rightLogoDataUrl) {
        try {
          const fitted = getFittedPdfLogo(effectiveKop.rightLogoDataUrl);
          const rx =
            hasTopScoreBox && cfg.scoreBox.position === 'top-right'
              ? pageWidth - marginX - scoreBoxW - logoW - 4
              : pageWidth - marginX - logoW;
          doc.addImage(
            effectiveKop.rightLogoDataUrl,
            detectPdfImageFormat(effectiveKop.rightLogoDataUrl),
            rx + (logoW - fitted.width) / 2,
            cursorY - 1 + (logoH - fitted.height) / 2,
            fitted.width,
            fitted.height
          );
        } catch {
          // Ignore invalid logo
        }
      }
    }

    if (effectiveKop.institutionName.trim()) {
      doc.setFont(pdfFont, 'bold');
      doc.setFontSize(Math.max(8, Math.min(14, effectiveKop.institutionFontSizePt || 10.5)));
      doc.setTextColor(tr, tg, tb);
      doc.text(effectiveKop.institutionName.trim().toUpperCase(), alignX, cursorY + 2, {
        align: alignOpt,
      });
      cursorY += 5;
    }

    if (schoolName) {
      doc.setFont(pdfFont, 'bold');
      doc.setFontSize(Math.max(10, Math.min(18, effectiveKop.schoolFontSizePt || 12)));
      doc.setTextColor(tr, tg, tb);
      doc.text(schoolName.toUpperCase(), alignX, cursorY + 3, { align: alignOpt });
      cursorY += 6;
    }

    if (effectiveKop.subIdentity.trim()) {
      doc.setFont(pdfFont, 'normal');
      doc.setFontSize(Math.max(7.5, Math.min(11, effectiveKop.contactFontSizePt || 8.5)));
      doc.setTextColor(71, 85, 105);
      doc.text(effectiveKop.subIdentity.trim(), alignX, cursorY, { align: alignOpt });
      cursorY += 4;
    }

    if (effectiveKop.schoolAddress.trim()) {
      doc.setFont(pdfFont, 'normal');
      doc.setFontSize(Math.max(7.5, Math.min(11, effectiveKop.contactFontSizePt || 8.5)));
      doc.setTextColor(71, 85, 105);
      doc.text(effectiveKop.schoolAddress.trim(), alignX, cursorY, { align: alignOpt });
      cursorY += 4;
    }

    const extraId = [
      effectiveKop.phone.trim() ? `Telp. ${effectiveKop.phone.trim()}` : '',
      effectiveKop.email.trim() ? `Email: ${effectiveKop.email.trim()}` : '',
      effectiveKop.website.trim() || '',
      effectiveKop.npsn.trim() ? `NPSN: ${effectiveKop.npsn.trim()}` : '',
    ]
      .filter(Boolean)
      .join(' · ');
    if (extraId) {
      doc.setFont(pdfFont, 'normal');
      doc.setFontSize(Math.max(7, Math.min(10, (effectiveKop.contactFontSizePt || 8.5) - 0.5)));
      doc.setTextColor(71, 85, 105);
      doc.text(extraId, alignX, cursorY, { align: alignOpt });
      cursorY += 4;
    }

    if ((showLeft || showRight) && !showTop) {
      cursorY = Math.max(cursorY, headerStartY + logoH + 1);
    }
  }

  doc.setFont(pdfFont, 'bold');
  doc.setFontSize(12);
  doc.setTextColor(ar, ag, ab);
  const resolvedDocTitle = effectiveKop.defaultDocTitle.trim() || set.title;
  const titleLines = doc.splitTextToSize(resolvedDocTitle.toUpperCase(), headerTextMaxW);
  doc.text(titleLines, headerCenterX, cursorY + 1.5, { align: 'center' });
  cursorY += titleLines.length * 5 + 2;

  if (hasTopScoreBox) {
    const bx =
      cfg.scoreBox.position === 'top-left'
        ? marginX
        : pageWidth - marginX - scoreBoxW;
    drawScoreBoxAt(bx, headerStartY);
    cursorY = Math.max(cursorY, headerStartY + scoreBoxH + 2);
  }

  if (effectiveKop.dividerStyle !== 'none') {
    const [dr, dg, db] = hexToPdfRgb(effectiveKop.dividerColorHex);
    const lenRatio = Math.max(0.2, Math.min(1, (effectiveKop.dividerLengthPct || 100) / 100));
    const lineW = contentWidth * lenRatio;
    const lineStartX = marginX + (contentWidth - lineW) / 2;
    cursorY += Math.max(1, effectiveKop.dividerMarginTopMm || 1.5);
    doc.setDrawColor(dr, dg, db);
    doc.setLineWidth(Math.max(0.3, (effectiveKop.dividerThicknessPt || 2) * 0.35));
    if (effectiveKop.dividerStyle === 'custom') {
      doc.setLineDashPattern([2, 1.5], 0);
    }
    doc.line(lineStartX, cursorY, lineStartX + lineW, cursorY);
    if (effectiveKop.dividerStyle === 'custom') {
      doc.setLineDashPattern([], 0);
    }
    if (effectiveKop.dividerStyle === 'double' || effectiveKop.dividerStyle === 'thick-thin') {
      doc.setLineWidth(0.25);
      doc.line(lineStartX, cursorY + 0.9, lineStartX + lineW, cursorY + 0.9);
      cursorY += 1;
    }
    cursorY += Math.max(2, effectiveKop.dividerMarginBottomMm || 3);
  } else {
    cursorY += 3;
  }

  const teacherNipDisplay = formatOptionalNip(docId.teacherNip);
  const teacherNameTrim = docId.teacherName.trim();
  const teacherLine = teacherNameTrim
    ? teacherNipDisplay
      ? `${teacherNameTrim} (${teacherNipDisplay})`
      : teacherNameTrim
    : '';

  const metaRows: Array<[string, string]> = [
    ...(schoolName ? [['Satuan Pendidikan', schoolName] as [string, string]] : []),
    ['Mata Pelajaran', `${set.params.subject} (${set.params.assessmentType})`],
    [
      'Jenjang / Kelas / Fase',
      `${set.params.educationLevel} · ${set.params.grade} (${set.params.learningPlan?.phase || '-'})`,
    ],
    ...(teacherLine ? [['Guru Penyusun', teacherLine] as [string, string]] : []),
    [
      'Semester / Tahun / Waktu',
      `${docId.semester} · ${docId.academicYear} · ${docId.timeAllocation}`,
    ],
    ['Kurikulum / Topik', `${set.params.curriculum} — ${set.params.topic}`],
  ];

  doc.setFontSize(9);
  metaRows.forEach(([label, val]) => {
    ensureSpace(5.5);
    doc.setFont(pdfFont, 'bold');
    doc.setTextColor(51, 65, 85);
    doc.text(label, marginX, cursorY);
    doc.setFont(pdfFont, 'normal');
    doc.setTextColor(15, 23, 42);
    const valLines = doc.splitTextToSize(`: ${val}`, contentWidth - 42);
    doc.text(valLines, marginX + 42, cursorY);
    cursorY += Math.max(4.6, valLines.length * 4.4);
  });

  if (cfg.scoreBox.enabled && cfg.scoreBox.position === 'after-header') {
    cursorY += 2;
    ensureSpace(scoreBoxH + 4);
    drawScoreBoxAt(pageWidth - marginX - scoreBoxW, cursorY);
    cursorY += scoreBoxH + 3;
  }

  if (cfg.includeStudentIdentity) {
    cursorY += 2;
    ensureSpace(10);
    doc.setDrawColor(148, 163, 184);
    doc.setLineWidth(0.3);
    doc.rect(marginX, cursorY, contentWidth, 8.5);
    doc.setFont(pdfFont, 'normal');
    doc.setFontSize(8.8);
    doc.text(
      'Nama Peserta Didik: ................................................   Kelas: .............   No. Absen: ........',
      marginX + 3,
      cursorY + 5.5
    );
    cursorY += 12;
  } else {
    cursorY += 3;
    doc.setDrawColor(203, 213, 225);
    doc.line(marginX, cursorY, pageWidth - marginX, cursorY);
    cursorY += 5;
  }

  // Helper to measure and render a single question cleanly inside (colX, colW) without splitting
  const measureQuestionHeight = (q: QuestionItem, colW: number): number => {
    let h = 0;
    if (q.stimulus) {
      doc.setFont(pdfFont, 'italic');
      doc.setFontSize(baseFontSize - 1);
      h += doc.splitTextToSize(`Stimulus: ${q.stimulus}`, colW).length * 4.3 * lineMult + 2;
    }
    if (cfg.includeImages && q.supportingImage?.dataUrl && q.supportingImage.format !== 'svg') {
      const dims = getScaledImageMm(q.supportingImage, colW);
      h += dims.height + (q.supportingImage.caption ? 5.5 : 2.5);
    }
    doc.setFont(pdfFont, 'normal');
    doc.setFontSize(baseFontSize);
    h += doc.splitTextToSize(`${q.number}. ${q.questionText}`, colW).length * 4.6 * lineMult + 2;

    if (q.matchingPairs && q.matchingPairs.length > 0) {
      q.matchingPairs.forEach((pair, pIdx) => {
        const line = `(${pIdx + 1}) ${pair.prompt} <---> [ ... ] ${String.fromCharCode(65 + pIdx)}. ${pair.match}`;
        h += doc.splitTextToSize(line, colW - 4).length * 4.4 * lineMult + 1;
      });
    } else if (q.options.length > 0) {
      doc.setFontSize(baseFontSize - 0.5);
      q.options.forEach((opt) => {
        h += doc.splitTextToSize(`${opt.label}. ${opt.text}`, colW - 5).length * 4.4 * lineMult + 0.8;
      });
    } else {
      h += 10;
    }
    return h + 3;
  };

  const renderQuestionAt = (q: QuestionItem, startX: number, startY: number, colW: number): number => {
    let y = startY;

    const renderImg = () => {
      if (!cfg.includeImages || !q.supportingImage?.dataUrl || q.supportingImage.format === 'svg') {
        return;
      }
      const dims = getScaledImageMm(q.supportingImage, colW);
      const imgX = startX + (colW - dims.width) / 2;
      try {
        doc.addImage(
          q.supportingImage.dataUrl,
          detectPdfImageFormat(q.supportingImage.dataUrl),
          imgX,
          y,
          dims.width,
          dims.height
        );
        y += dims.height + 2;
        if (q.supportingImage.caption) {
          doc.setFont(pdfFont, 'italic');
          doc.setFontSize(8);
          doc.setTextColor(71, 85, 105);
          doc.text(q.supportingImage.caption, startX + colW / 2, y + 1.5, { align: 'center' });
          y += 4.5;
        }
      } catch {
        // Skip invalid image safely
      }
    };

    if (q.stimulus) {
      doc.setFont(pdfFont, 'italic');
      doc.setFontSize(baseFontSize - 1);
      doc.setTextColor(51, 65, 85);
      const stimLines = doc.splitTextToSize(`Stimulus: ${q.stimulus}`, colW);
      doc.text(stimLines, startX, y);
      y += stimLines.length * 4.3 * lineMult + 2;
    }

    if (q.supportingImage?.placement !== 'after') {
      renderImg();
    }

    doc.setFont(pdfFont, 'normal');
    doc.setFontSize(baseFontSize);
    doc.setTextColor(15, 23, 42);
    const qLines = doc.splitTextToSize(`${q.number}. ${q.questionText}`, colW);
    doc.text(qLines, startX, y);
    y += qLines.length * 4.6 * lineMult + 1.8;

    if (q.supportingImage?.placement === 'after') {
      renderImg();
    }

    if (q.matchingPairs && q.matchingPairs.length > 0) {
      q.matchingPairs.forEach((pair, pIdx) => {
        const line = `(${pIdx + 1}) ${pair.prompt}   <--->   [ ... ] ${String.fromCharCode(65 + pIdx)}. ${pair.match}`;
        const pairLines = doc.splitTextToSize(line, colW - 4);
        doc.setFontSize(baseFontSize - 0.8);
        doc.text(pairLines, startX + 2, y);
        y += pairLines.length * 4.4 * lineMult + 0.8;
      });
    } else if (q.options.length > 0) {
      q.options.forEach((opt) => {
        const optLines = doc.splitTextToSize(`${opt.label}. ${opt.text}`, colW - 5);
        doc.setFontSize(baseFontSize - 0.5);
        doc.text(optLines, startX + 4, y);
        y += optLines.length * 4.4 * lineMult + 0.8;
      });
    } else {
      doc.setFontSize(9);
      doc.setTextColor(148, 163, 184);
      doc.text('Jawaban: ____________________________________________________________', startX + 4, y + 2);
      y += 9;
    }
    return y + 3;
  };

  // Smart Layout Two-Column Flow for PDF
  const colGap = 7;
  const halfColW = (contentWidth - colGap) / 2;
  const blocks = buildExamLayoutBlocks(questions, cfg);

  blocks.forEach((block) => {
    if (block.kind === 'two-column-row') {
      const leftH = measureQuestionHeight(block.left, halfColW);
      const rightH = block.right ? measureQuestionHeight(block.right, halfColW) : 0;
      const rowH = Math.max(leftH, rightH);
      ensureSpace(Math.min(rowH, pageHeight - marginX * 2 - 12));
      const rowStartY = cursorY;
      const endLeftY = renderQuestionAt(block.left, marginX, rowStartY, halfColW);
      const endRightY = block.right
        ? renderQuestionAt(block.right, marginX + halfColW + colGap, rowStartY, halfColW)
        : rowStartY;
      cursorY = Math.max(endLeftY, endRightY) + 1.5;
    } else {
      const fullH = measureQuestionHeight(block.question, contentWidth);
      ensureSpace(Math.min(fullH, pageHeight - marginX * 2 - 12));
      cursorY = renderQuestionAt(block.question, marginX, cursorY, contentWidth) + 1.5;
    }
  });

  // Signature Block
  if (cfg.includeSignatureBlock) {
    ensureSpace(34);
    cursorY += 5;
    const rightColX = pageWidth - marginX - 60;
    doc.setFont(pdfFont, 'normal');
    doc.setFontSize(9.2);
    doc.setTextColor(15, 23, 42);
    doc.text('Mengetahui,', marginX, cursorY);
    doc.text('Guru Penyusun / Mata Pelajaran,', rightColX, cursorY);
    cursorY += 4.5;
    doc.text('Kepala Sekolah', marginX, cursorY);

    if (docId.teacherSignatureDataUrl) {
      try {
        doc.addImage(
          docId.teacherSignatureDataUrl,
          detectPdfImageFormat(docId.teacherSignatureDataUrl),
          rightColX,
          cursorY + 1,
          26,
          12
        );
      } catch {
        // Ignore invalid signature
      }
    }

    cursorY += 15;
    doc.setFont(pdfFont, 'bold');
    doc.text(docId.headmasterName.trim() || '.........................', marginX, cursorY);
    doc.text(docId.teacherName, rightColX, cursorY);
    cursorY += 4.5;
    doc.setFont(pdfFont, 'normal');
    doc.setFontSize(8.5);
    const hmNip = formatOptionalNip(docId.headmasterNip);
    if (hmNip) {
      doc.text(hmNip, marginX, cursorY);
    }
    const tLines = buildTeacherIdentityLines(docId).slice(1);
    tLines.forEach((line, i) => {
      doc.text(line, rightColX, cursorY + i * 4);
    });
  }

  // Kunci Jawaban
  if (cfg.includeAnswerKey && questions.length > 0) {
    doc.addPage();
    cursorY = marginX;
    doc.setFont(pdfFont, 'bold');
    doc.setFontSize(12.5);
    doc.setTextColor(21, 128, 61);
    doc.text('KUNCI JAWABAN, PEMBAHASAN & RUBRIK PENSKORAN', marginX, cursorY);
    cursorY += 3;
    doc.setDrawColor(21, 128, 61);
    doc.line(marginX, cursorY, pageWidth - marginX, cursorY);
    cursorY += 7;

    questions.forEach((q, idx) => {
      const answerLines = doc.splitTextToSize(
        `${idx + 1}. Kunci: ${q.correctAnswer} (Bobot: ${formatScore(q.scoreWeight)})`,
        contentWidth
      );
      const expLines = q.explanation
        ? doc.splitTextToSize(`Pembahasan: ${q.explanation}`, contentWidth - 6)
        : [];
      ensureSpace(answerLines.length * 4.8 + expLines.length * 4.6 + 8);

      doc.setFont(pdfFont, 'bold');
      doc.setFontSize(10);
      doc.setTextColor(21, 128, 61);
      doc.text(answerLines, marginX, cursorY);
      cursorY += answerLines.length * 4.8;

      if (expLines.length > 0) {
        doc.setFont(pdfFont, 'normal');
        doc.setFontSize(9.5);
        doc.setTextColor(51, 65, 85);
        doc.text(expLines, marginX + 5, cursorY);
        cursorY += expLines.length * 4.6;
      }

      if (cfg.includeRubric && q.rubric && q.rubric.length > 0) {
        q.rubric.forEach((r) => {
          const rLines = doc.splitTextToSize(
            `• ${r.criterion} (Maks ${r.maxScore}): ${r.descriptor}`,
            contentWidth - 10
          );
          ensureSpace(rLines.length * 4.5 + 2);
          doc.setFontSize(9);
          doc.setTextColor(71, 85, 105);
          doc.text(rLines, marginX + 8, cursorY);
          cursorY += rLines.length * 4.5;
        });
      }
      cursorY += 3;
    });
  }

  // Kisi-Kisi Soal (NEVER prints Teacher Score Box)
  if (cfg.includeBlueprint && questions.length > 0) {
    doc.addPage();
    cursorY = marginX;
    doc.setFont(pdfFont, 'bold');
    doc.setFontSize(12.5);
    doc.setTextColor(21, 128, 61);
    doc.text(
      schoolName
        ? `KISI-KISI PENULISAN SOAL — ${schoolName.toUpperCase()}`
        : 'KISI-KISI PENULISAN SOAL',
      marginX,
      cursorY
    );
    cursorY += 3;
    doc.setDrawColor(21, 128, 61);
    doc.line(marginX, cursorY, pageWidth - marginX, cursorY);
    cursorY += 7;

    const kisiRows = buildKisiKisiRows(set, questions);
    kisiRows.forEach((row) => {
      const text = `No. ${row.questionNumber} [${row.cognitiveLevel} · ${row.questionForm}] | Materi: ${row.material} | TP/KD: ${row.learningObjective} | Indikator: ${row.indicator}`;
      const lines = doc.splitTextToSize(text, contentWidth);
      ensureSpace(lines.length * 4.6 + 4);
      doc.setFont(pdfFont, 'normal');
      doc.setFontSize(9);
      doc.setTextColor(30, 41, 59);
      doc.text(lines, marginX, cursorY);
      cursorY += lines.length * 4.6 + 2.5;
    });
  }

  if (cfg.includeHeaderFooter || cfg.includeAppBranding !== false) {
    const totalPages = doc.getNumberOfPages();
    for (let p = 1; p <= totalPages; p += 1) {
      doc.setPage(p);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184);
      const footerLabel = cfg.includeHeaderFooter
        ? [schoolName, set.params.subject, `Halaman ${p} dari ${totalPages}`]
            .filter(Boolean)
            .join(' · ')
        : '';
      if (footerLabel) {
        doc.text(footerLabel, pageWidth / 2, pageHeight - 8, { align: 'center' });
      }
      if (cfg.includeAppBranding !== false) {
        doc.setFontSize(6.5);
        doc.text(
          `${APP_OFFICIAL_NAME} · ${APP_OFFICIAL_BRANDING}`,
          pageWidth / 2,
          pageHeight - 4.2,
          { align: 'center' }
        );
      }
    }
  }

  doc.save(buildSafeFilename(set, 'pdf'));
}

export function exportAsXlsx(
  set: QuestionSet,
  options: { includeAnswerKey: boolean; filteredQuestions?: QuestionItem[] }
): void {
  const questions = options.filteredQuestions ?? set.questions;
  const kisiRows = buildKisiKisiRows(set, questions);
  const schoolName = (
    set.params.docIdentity?.schoolName ||
    set.params.schoolName ||
    ''
  ).trim();
  const teacherName = (set.params.docIdentity?.teacherName || '').trim();

  const wb = XLSX.utils.book_new();

  // Sheet 1: Kisi-Kisi Soal
  const kisiHeaderSuffix = [
    schoolName ? schoolName.toUpperCase() : '',
    teacherName ? `(${teacherName})` : '',
  ]
    .filter(Boolean)
    .join(' ');
  const kisiSheetData = [
    [kisiHeaderSuffix ? `KISI-KISI PENULISAN SOAL — ${kisiHeaderSuffix}` : 'KISI-KISI PENULISAN SOAL'],
    [
      'No',
      'Satuan Pendidikan',
      'Mata Pelajaran',
      'Kelas / Fase',
      'Semester',
      'Tujuan Pembelajaran / KD',
      'Materi',
      'Indikator Soal',
      'Level Kognitif',
      'Bentuk Soal',
      'No. Soal',
      ...(options.includeAnswerKey ? ['Kunci Jawaban'] : []),
    ],
    ...kisiRows.map((r) => [
      r.number,
      r.schoolName,
      r.subject,
      r.gradePhase,
      r.semester,
      r.learningObjective,
      r.material,
      r.indicator,
      r.cognitiveLevel,
      r.questionForm,
      r.questionNumber,
      ...(options.includeAnswerKey ? [r.correctAnswer] : []),
    ]),
  ];
  const wsKisi = XLSX.utils.aoa_to_sheet(kisiSheetData);
  XLSX.utils.book_append_sheet(wb, wsKisi, 'Kisi-Kisi Soal');

  // Sheet 2: Bank Soal & Kunci
  const bankSheetData = [
    [
      'No',
      'Bentuk Soal',
      'Tingkat Kesulitan',
      'Level Kognitif',
      'Bobot Skor',
      'Stimulus',
      'Pertanyaan',
      'Gambar Pendukung',
      'Opsi Jawaban',
      ...(options.includeAnswerKey ? ['Kunci Jawaban', 'Pembahasan'] : []),
    ],
    ...questions.map((q, idx) => [
      idx + 1,
      q.questionSubType || q.type,
      q.difficulty,
      q.cognitiveLevel,
      round2(Number(q.scoreWeight) || 0),
      q.stimulus || '',
      q.questionText,
      q.supportingImage?.dataUrl ? `${q.supportingImage.caption || 'Ada gambar'} (${q.supportingImage.source})` : '-',
      q.options.map((o) => `${o.label}. ${o.text}`).join(' | '),
      ...(options.includeAnswerKey ? [q.correctAnswer, q.explanation] : []),
    ]),
  ];
  const wsBank = XLSX.utils.aoa_to_sheet(bankSheetData);
  XLSX.utils.book_append_sheet(wb, wsBank, 'Bank Soal');

  // Sheet 3: Template Rekap Nilai
  const gradeSheetData = [
    [
      schoolName
        ? `REKAPITULASI NILAI ASESMEN — ${schoolName.toUpperCase()} (${set.params.subject.toUpperCase()})`
        : `REKAPITULASI NILAI ASESMEN — ${set.params.subject.toUpperCase()}`,
    ],
    [
      'Nama Siswa',
      ...questions.map((_, idx) => `Soal ${idx + 1} (Maks ${formatScore(questions[idx]?.scoreWeight)})`),
      'Total Skor',
      'Nilai (%)',
      'Keterangan KKTP',
    ],
    [
      'Contoh Siswa 1',
      ...questions.map((q) => round2(Number(q.scoreWeight) || 0)),
      round2(questions.reduce((s, q) => s + (Number(q.scoreWeight) || 0), 0)),
      100,
      'Tuntas',
    ],
  ];
  const wsGrade = XLSX.utils.aoa_to_sheet(gradeSheetData);
  XLSX.utils.book_append_sheet(wb, wsGrade, 'Rekap Nilai');

  XLSX.writeFile(wb, buildSafeFilename(set, 'xlsx'));
}
