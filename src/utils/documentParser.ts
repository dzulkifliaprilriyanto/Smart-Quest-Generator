import JSZip from 'jszip';
import type { ReferenceAttachment } from '../types/question.ts';

function decodeXmlEntities(xml: string): string {
  return xml
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function extractTextFromXml(xml: string): string {
  return decodeXmlEntities(
    xml
      .replace(/<\/w:p>/g, '\n')
      .replace(/<\/a:p>/g, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export async function parseReferenceFile(file: File): Promise<ReferenceAttachment> {
  const maxBytes = 4 * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new Error(`Ukuran berkas "${file.name}" melebihi batas maksimal 4 MB.`);
  }

  const lower = file.name.toLowerCase();
  const id = `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  // Plain text / Markdown / CSV
  if (
    lower.endsWith('.txt') ||
    lower.endsWith('.md') ||
    lower.endsWith('.csv') ||
    file.type.startsWith('text/')
  ) {
    const text = await file.text();
    return {
      id,
      name: file.name,
      mimeType: file.type || 'text/plain',
      sizeBytes: file.size,
      extractedText: text.slice(0, 8000),
    };
  }

  // DOCX via JSZip (word/document.xml)
  if (lower.endsWith('.docx')) {
    const buffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(buffer);
    const docXml = await zip.file('word/document.xml')?.async('string');
    const extracted = docXml ? extractTextFromXml(docXml) : '';
    if (!extracted) {
      throw new Error(`Tidak ditemukan teks yang dapat dibaca di dalam berkas DOCX "${file.name}".`);
    }
    return {
      id,
      name: file.name,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      sizeBytes: file.size,
      extractedText: extracted.slice(0, 8000),
    };
  }

  // PPTX via JSZip (ppt/slides/slide*.xml)
  if (lower.endsWith('.pptx')) {
    const buffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(buffer);
    const slideNames = Object.keys(zip.files)
      .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    const parts: string[] = [];
    for (const slideName of slideNames.slice(0, 25)) {
      const xml = await zip.file(slideName)?.async('string');
      if (xml) {
        const text = extractTextFromXml(xml);
        if (text) parts.push(text);
      }
    }
    const extracted = parts.join('\n\n');
    if (!extracted) {
      throw new Error(`Tidak ditemukan teks slide pada berkas PPTX "${file.name}".`);
    }
    return {
      id,
      name: file.name,
      mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      sizeBytes: file.size,
      extractedText: extracted.slice(0, 8000),
    };
  }

  // PDF or Image (sent directly as multimodal inlineData to Gemini Stage 2)
  if (
    lower.endsWith('.pdf') ||
    file.type === 'application/pdf' ||
    file.type === 'image/png' ||
    file.type === 'image/jpeg' ||
    file.type === 'image/webp'
  ) {
    const buffer = await file.arrayBuffer();
    const base64Data = arrayBufferToBase64(buffer);
    const mimeType =
      file.type || (lower.endsWith('.pdf') ? 'application/pdf' : 'image/png');
    return {
      id,
      name: file.name,
      mimeType,
      sizeBytes: file.size,
      extractedText: `Lampiran ${mimeType === 'application/pdf' ? 'PDF' : 'Gambar'} siap dianalisis AI (${file.name}).`,
      base64Data,
    };
  }

  throw new Error(
    `Format berkas "${file.name}" belum didukung. Gunakan TXT, DOCX, PPTX, PDF, PNG, JPG, atau WEBP.`
  );
}
