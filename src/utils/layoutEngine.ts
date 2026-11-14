import type {
  DocumentExportConfig,
  DocumentIdentity,
  QuestionItem,
} from '../types/question.ts';

export type LayoutBlock =
  | {
      kind: 'two-column-row';
      left: QuestionItem;
      right?: QuestionItem;
    }
  | {
      kind: 'full-width';
      question: QuestionItem;
    };

/**
 * Determines whether a question is compact enough for two-column exam flow.
 * Essays, matching questions, large-sized images, or very long questions
 * automatically span full width so questions/options/images never split or clip.
 */
export function canFitTwoColumns(
  q: QuestionItem,
  config: DocumentExportConfig
): boolean {
  if (config.layoutMode === 'single') return false;
  if (config.layoutMode === 'two-column') {
    if (q.type === 'Esai') return false;
    if (q.matchingPairs && q.matchingPairs.length > 0) return false;
    if (
      config.includeImages &&
      q.supportingImage &&
      q.supportingImage.displaySize === 'large'
    ) {
      return false;
    }
    return true;
  }

  // 'auto' (Smart Layout)
  if (q.type === 'Esai') return false;
  if (q.matchingPairs && q.matchingPairs.length > 0) return false;
  if (
    config.includeImages &&
    q.supportingImage &&
    q.supportingImage.displaySize === 'large'
  ) {
    return false;
  }
  if ((q.stimulus?.length ?? 0) > 420 || q.questionText.length > 360) {
    return false;
  }
  return true;
}

/**
 * Groups sequential questions into smart two-column rows (left -> right)
 * and full-width blocks while strictly preserving question numbering order.
 */
export function buildExamLayoutBlocks(
  questions: QuestionItem[],
  config: DocumentExportConfig
): LayoutBlock[] {
  const blocks: LayoutBlock[] = [];
  let pendingLeft: QuestionItem | null = null;

  for (const q of questions) {
    if (canFitTwoColumns(q, config)) {
      if (!pendingLeft) {
        pendingLeft = q;
      } else {
        blocks.push({ kind: 'two-column-row', left: pendingLeft, right: q });
        pendingLeft = null;
      }
    } else {
      if (pendingLeft) {
        blocks.push({ kind: 'two-column-row', left: pendingLeft });
        pendingLeft = null;
      }
      blocks.push({ kind: 'full-width', question: q });
    }
  }

  if (pendingLeft) {
    blocks.push({ kind: 'two-column-row', left: pendingLeft });
  }

  return blocks;
}

/**
 * Formats optional Teacher NIP cleanly — returns empty string when blank
 * (never returns placeholder "NIP: -").
 */
export function formatOptionalNip(nip?: string): string {
  const clean = (nip ?? '').trim();
  if (!clean || clean === '-') return '';
  return `NIP. ${clean}`;
}

export function buildTeacherIdentityLines(docId?: DocumentIdentity): string[] {
  if (!docId) return [];
  const lines: string[] = [];
  if (docId.teacherName.trim()) {
    lines.push(docId.teacherName.trim());
  }
  const nipLine = formatOptionalNip(docId.teacherNip);
  if (nipLine) {
    lines.push(nipLine);
  }
  if (docId.teacherRank.trim()) {
    lines.push(docId.teacherRank.trim());
  }
  if (docId.teacherRole.trim()) {
    lines.push(docId.teacherRole.trim());
  }
  if (docId.teacherUnit.trim()) {
    lines.push(docId.teacherUnit.trim());
  }
  return lines;
}

export function getMarginMm(preset: DocumentExportConfig['marginPreset']): number {
  if (preset === 'Sempit') return 12;
  if (preset === 'Lebar') return 24;
  return 17;
}

export function getMarginTwips(preset: DocumentExportConfig['marginPreset']): number {
  if (preset === 'Sempit') return 720; // ~12.7mm
  if (preset === 'Lebar') return 1440; // ~25.4mm
  return 1020; // ~18mm
}
