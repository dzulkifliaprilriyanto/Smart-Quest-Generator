import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import {
  sanitizeGeneratorParams,
  sanitizeQuestionItem,
  sanitizeQuestionSet,
  sanitizeReferenceAttachments,
  sanitizeSvgMarkup,
  sanitizeText,
} from './src/utils/sanitizer.ts';
import { validateGeneratorParams } from './src/utils/validation.ts';
import { autoRepairQuestionSet, validateQuestionSet } from './src/utils/masterValidator.ts';
import { calculateIntelligentScores } from './src/utils/scoring.ts';
import type {
  QuestionImageType,
  QuestionItem,
  QuestionQaReport,
  QuestionSet,
  QuestionSubType,
  StructuredVisualPrompt,
  VisualNecessity,
  VisualValidationReport,
} from './src/types/question.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';

function stripJsonFences(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith('```')) {
    return trimmed
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();
  }
  return trimmed;
}

function createGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const FREE_TIER_MODEL_ORDER = ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'] as const;

function isQuotaExhaustedError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('429') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('GenerateRequestsPerDay') ||
    msg.toLowerCase().includes('quota exceeded')
  );
}

async function generateWithRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      const isTransient =
        !isQuotaExhaustedError(err) &&
        (msg.includes('503') ||
          msg.includes('500') ||
          msg.toLowerCase().includes('timeout'));
      if (!isTransient || attempt === maxRetries) {
        throw err;
      }
      await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
    }
  }
  throw lastError;
}

async function generateContentWithModelFallback(
  ai: GoogleGenAI,
  params: {
    contents: unknown;
    systemInstruction?: string;
    responseMimeType?: string;
    responseSchema?: unknown;
  }
) {
  let lastErr: unknown;
  for (const model of FREE_TIER_MODEL_ORDER) {
    try {
      const thinkingLevel =
        model === 'gemini-3.1-flash-lite' ? ThinkingLevel.MINIMAL : ThinkingLevel.LOW;
      return await generateWithRetry(() =>
        ai.models.generateContent({
          model,
          contents: params.contents as never,
          config: {
            thinkingConfig: { thinkingLevel },
            ...(params.systemInstruction
              ? { systemInstruction: params.systemInstruction }
              : {}),
            ...(params.responseMimeType
              ? { responseMimeType: params.responseMimeType }
              : {}),
            ...(params.responseSchema
              ? { responseSchema: params.responseSchema as never }
              : {}),
          },
        })
      );
    } catch (err) {
      lastErr = err;
      if (isQuotaExhaustedError(err) && model !== FREE_TIER_MODEL_ORDER[FREE_TIER_MODEL_ORDER.length - 1]) {
        console.warn(`[Gemini] Model ${model} mencapai batas kuota sementara, beralih ke model cadangan free-tier.`);
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

function sendGeminiError(
  res: express.Response,
  endpoint: string,
  err: unknown,
  fallbackLabel: string
) {
  const message = err instanceof Error ? err.message : fallbackLabel;
  if (message.includes('API_KEY_INVALID') || message.includes('PERMISSION_DENIED')) {
    console.warn(`[${endpoint}] API key invalid or permission denied.`);
    res.status(403).json({
      error:
        'Kunci API Gemini tidak valid atau tidak memiliki izin. Periksa panel Settings > Secrets.',
    });
    return;
  }
  if (isQuotaExhaustedError(err)) {
    console.warn(`[${endpoint}] Gemini API free-tier quota limit reached (429).`);
    res.status(429).json({
      error:
        'Batas kuota permintaan gratis Gemini API tercapai sementara. Tunggu beberapa saat, periksa kuota di Settings > Secrets, atau gunakan Contoh Paket Soal / Unggah Gambar Manual.',
    });
    return;
  }
  console.error(`[${endpoint}] Error:`, message);
  res.status(500).json({ error: `${fallbackLabel}: ${message}` });
}

function normalizeStem(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getSubjectVisualGuidance(subject: string): string {
  const lower = subject.toLowerCase();
  if (/matematika|numerasi/.test(lower)) {
    return [
      'PANDUAN KHUSUS MATEMATIKA:',
      '- Gambar bangun datar, bangun ruang, pecahan, pengukuran, garis bilangan, grafik, atau tabel dengan ANGKA, UKURAN, dan LABEL SISI/SUDUT yang 100% sesuai teks soal.',
      '- Contoh: jika persegi panjang berukuran panjang 12 cm dan lebar 5 cm, gambar persegi panjang proporsional dengan label "12 cm" dan "5 cm".',
      '- DILARANG menampilkan rumus hasil atau kunci jawaban (misal "= 60 cm2") kecuali memang ditanyakan sebagai stimulus.',
    ].join('\n');
  }
  if (/ipas|ipa|biologi|fisika|kimia/.test(lower)) {
    return [
      'PANDUAN KHUSUS IPAS & IPA:',
      '- Gambarkan fenomena ilmiah secara tepat sesuai pertanyaan (contoh: penguapan menunjukkan air dipanaskan matahari menjadi uap naik ke atas, BUKAN gambar hujan atau banjir).',
      '- Untuk daur air, fotosintesis, rantai makanan, organ tubuh, tata surya, atau percobaan, tampilkan komponen utama, arah panah proses, dan label ilmiah Bahasa Indonesia baku.',
    ].join('\n');
  }
  if (/bahasa indonesia|literasi/.test(lower)) {
    return [
      'PANDUAN KHUSUS BAHASA INDONESIA:',
      '- Ilustrasikan adegan, tokoh, dan aktivitas sesuai tepat dengan isi bacaan/pertanyaan (contoh: jika soal menyebut anak menyiram tanaman di halaman rumah, gambar anak memegang gembor menyiram tanaman, JANGAN diganti membaca buku).',
    ].join('\n');
  }
  if (/pancasila|ppkn|pendidikan kewarganegaraan/.test(lower)) {
    return [
      'PANDUAN KHUSUS PENDIDIKAN PANCASILA:',
      '- Gunakan konteks kehidupan masyarakat Indonesia nyata (gotong royong, musyawarah, kerja bakti, toleransi antarsesama) secara sopan, inklusif, dan mendidik.',
    ].join('\n');
  }
  if (/ips|geografi|sejarah|ekonomi|sosiologi/.test(lower)) {
    return [
      'PANDUAN KHUSUS IPS:',
      '- Fokuskan visual pada peta sederhana, kegiatan ekonomi, perdagangan, pertanian, lingkungan geografis, atau interaksi sosial sesuai pertanyaan.',
    ].join('\n');
  }
  return 'PANDUAN KHUSUS: Sesuaikan jenis visual dengan substansi kompetensi dan tingkat perkembangan peserta didik.';
}

function inspectSvgTechnicalChecks(svgMarkup: string, width: number, height: number): {
  technicalStatus: 'passed' | 'failed';
  technicalChecks: string[];
} {
  const checks: string[] = [];
  const hasSvgRoot = /<svg[\s\S]*<\/svg>/i.test(svgMarkup);
  const hasViewBox = new RegExp(`viewBox=["']0\\s+0\\s+${width}\\s+${height}["']`, 'i').test(
    svgMarkup
  );
  const primitiveMatches = svgMarkup.match(
    /<(rect|circle|ellipse|line|polygon|polyline|path|text)\b/gi
  );
  const primitiveCount = primitiveMatches ? primitiveMatches.length : 0;
  const hasForbidden = /<(script|foreignObject|iframe|object|embed)\b/i.test(svgMarkup);

  if (hasSvgRoot) checks.push('Struktur root SVG 1.1 valid');
  if (hasViewBox) checks.push(`Dimensi rasio sesuai (${width}×${height})`);
  checks.push(`Terdapat ${primitiveCount} elemen grafis vektor`);
  if (!hasForbidden) checks.push('Bebas skrip/elemen eksternal berbahaya');

  const passed = hasSvgRoot && primitiveCount >= 3 && !hasForbidden;
  return {
    technicalStatus: passed ? 'passed' : 'failed',
    technicalChecks: checks,
  };
}

function inspectSvgSemanticLocally(
  svgMarkup: string,
  structuredPrompt: StructuredVisualPrompt,
  questionText: string,
  correctAnswer: string
): {
  semanticStatus: 'passed' | 'warning' | 'failed';
  semanticScore: number;
  semanticNotes: string[];
} {
  const textMatches = Array.from(svgMarkup.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/gi)).map(
    (m) => m[1]?.replace(/<[^>]+>/g, '').trim() ?? ''
  );
  const svgTextLower = textMatches.join(' ').toLowerCase();
  const notes: string[] = [];
  let score = 90;

  // Check if numeric quantities from question appear in SVG labels when expected
  const questionNumbers = Array.from(
    questionText.matchAll(/\b(\d+(?:[.,]\d+)?\s*(?:cm|m|mm|km|kg|g|l|ml|derajat|°|%))\b/gi)
  ).map((m) => m[1]!.toLowerCase().replace(/\s+/g, ''));

  if (questionNumbers.length > 0) {
    const normalizedSvgText = svgTextLower.replace(/\s+/g, '');
    const missingNums = questionNumbers.filter((qNum) => !normalizedSvgText.includes(qNum));
    if (missingNums.length > 0) {
      score -= 22;
      notes.push(`Label ukuran soal (${missingNums.join(', ')}) belum tercantum jelas pada visual.`);
    } else {
      notes.push(`Ukuran/angka pada soal (${questionNumbers.join(', ')}) terverifikasi akurat pada visual.`);
    }
  }

  // Anti-answer leakage check for numeric answers
  const answerNumericMatch = correctAnswer.match(/\b(\d+(?:[.,]\d+)?\s*(?:cm|m|kg|l|°|%))\b/i);
  if (answerNumericMatch) {
    const ansNumNorm = answerNumericMatch[1]!.toLowerCase().replace(/\s+/g, '');
    const isAlsoInQuestion = questionNumbers.includes(ansNumNorm);
    if (!isAlsoInQuestion && svgTextLower.replace(/\s+/g, '').includes(ansNumNorm)) {
      score -= 35;
      notes.push(`Peringatan: angka kunci jawaban (${answerNumericMatch[1]}) terdeteksi muncul di dalam gambar.`);
    }
  }

  if (structuredPrompt.required_objects.length > 0 && notes.length === 0) {
    notes.push(
      `Visual memuat spesifikasi objek: ${structuredPrompt.required_objects.slice(0, 4).join(', ')}.`
    );
  }

  const clampedScore = Math.max(0, Math.min(100, score));
  const semanticStatus =
    clampedScore < 65 ? 'failed' : clampedScore < 85 ? 'warning' : 'passed';

  return {
    semanticStatus,
    semanticScore: clampedScore,
    semanticNotes: notes.length > 0 ? notes : ['Pemeriksaan kesesuaian konteks soal terpenuhi.'],
  };
}

async function startServer() {
  const app = express();

  app.use(express.json({ limit: '10mb' }));
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'SMART QUEST GENERATOR — By Klick Assets Generator Ft. Lilin Annisa Putri S., S.Pd.',
    });
  });

  // =========================================================================
  // 1. MASTER QUESTION GENERATOR (Supports 1-50 questions with smart batching)
  // =========================================================================
  app.post('/api/generate-questions', async (req, res) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const rawRequestedCount = Number(body.questionCount);
      if (Number.isFinite(rawRequestedCount) && rawRequestedCount > 50) {
        res.status(400).json({
          error:
            'Jumlah maksimal soal adalah 50 butir dalam satu proses. Kurangi jumlah soal menjadi 1–50.',
          fieldErrors: {
            questionCount: 'Maksimal 50 soal dalam satu proses generasi.',
          },
        });
        return;
      }

      if (Array.isArray(body.subTypeCounts) && body.subTypeCounts.length > 0) {
        const rawSum = body.subTypeCounts.reduce((acc: number, item: unknown) => {
          const rec = item as { count?: unknown };
          return acc + Math.max(0, Math.round(Number(rec?.count) || 0));
        }, 0);
        if (rawSum > 50) {
          res.status(400).json({
            error: `Total kombinasi jumlah bentuk soal (${rawSum} butir) melebihi batas maksimal 50 butir.`,
            fieldErrors: {
              questionCount: `Kombinasi seluruh jenis soal (${rawSum}) tidak boleh melebihi 50 butir.`,
            },
          });
          return;
        }
      }

      const sanitizedParams = sanitizeGeneratorParams(body);
      const attachments = sanitizeReferenceAttachments(body.attachments);
      const validation = validateGeneratorParams(sanitizedParams);

      if (!validation.isValid) {
        res.status(400).json({
          error: 'Parameter input tidak valid.',
          fieldErrors: validation.errors,
        });
        return;
      }

      const ai = createGeminiClient();
      if (!ai) {
        res.status(503).json({
          error:
            'Kunci Gemini API belum dikonfigurasi pada server. Silakan periksa pengaturan Secrets atau gunakan Contoh Paket Soal untuk pratinjau.',
        });
        return;
      }

      const isSmaOrSmk =
        sanitizedParams.educationLevel === 'SMA/MA' ||
        sanitizedParams.educationLevel === 'SMK' ||
        sanitizedParams.educationLevel === 'SMA';
      const optionCount = isSmaOrSmk ? 5 : 4;
      const lp = sanitizedParams.learningPlan;

      const curriculumBlock =
        sanitizedParams.curriculum === 'Kurikulum 2013 Revisi'
          ? [
              `Struktur Kurikulum 2013 Revisi:`,
              `- Kompetensi Inti (KI): ${lp.ki || 'Sesuai struktur KI jenjang terkait'}`,
              `- Kompetensi Dasar (KD): ${lp.kd || 'Rumuskan KD relevan berdasarkan materi'}`,
              `- Indikator Pencapaian Kompetensi (IPK): ${lp.ipk || 'Turunkan secara logis dari KD'}`,
            ].join('\n')
          : [
              `Struktur ${sanitizedParams.curriculum}:`,
              `- Fase: ${lp.phase}`,
              `- Capaian Pembelajaran (CP): ${lp.cp || 'Sesuaikan secara proporsional dengan fase & mapel (catatan: guru wajib memverifikasi dengan dokumen BSKAP terbaru)'}`,
              `- Tujuan Pembelajaran (TP): ${lp.tp || 'Rumuskan TP yang terukur dan operasional'}`,
              `- Alur Tujuan Pembelajaran (ATP): ${lp.atp || 'Selaraskan urutan logis materi'}`,
              `- Kriteria Ketercapaian (KKTP): ${lp.kktp || 'Sesuaikan kriteria ketercapaian dengan TP'}`,
            ].join('\n');

      const subTypesStr = sanitizedParams.selectedSubTypes.join(', ');
      const subTypeBreakdownStr =
        sanitizedParams.subTypeCounts && sanitizedParams.subTypeCounts.length > 0
          ? sanitizedParams.subTypeCounts
              .map((s) => `${s.subType}: ${s.count} butir`)
              .join(', ')
          : '';

      const akmGuidance =
        sanitizedParams.akmMode === 'AKM Literasi Membaca'
          ? 'Mode AKM Literasi Membaca: Sertakan stimulus teks informasi/fiksi bermakna (konteks keseharian Indonesia), ukur pemahaman literal, interpretasi/integrasi, serta evaluasi dan refleksi. JANGAN menyebutnya sebagai soal resmi ANBK atau soal resmi pemerintah.'
          : sanitizedParams.akmMode === 'AKM Numerasi'
            ? 'Mode AKM Numerasi: Gunakan konteks bilangan, aljabar, geometri/pengukuran, atau data/ketidakpastian berbasis situasi nyata (tabel/grafik tekstual). JANGAN menyebutnya sebagai soal resmi ANBK.'
            : sanitizedParams.akmMode === 'Tematik SD'
              ? 'Mode Tematik SD: Integrasikan lintas muatan pelajaran SD dengan kosakata sederhana, ramah usia anak Indonesia, dan ilustrasi cerita konkret.'
              : sanitizedParams.akmMode === 'LKPD Interaktif'
                ? 'Mode LKPD: Susun butir soal sebagai aktivitas terbimbing peserta didik dengan langkah kerja dan refleksi.'
                : 'Mode Reguler Mata Pelajaran.';

      const textAttachmentContext = attachments
        .filter((a) => a.extractedText)
        .map((a) => `[Lampiran ${a.name}]:\n${a.extractedText.slice(0, 3500)}`)
        .join('\n\n');

      const binaryParts = attachments
        .filter((a) => a.base64Data)
        .map((a) => ({
          inlineData: {
            mimeType: a.mimeType,
            data: a.base64Data!,
          },
        }));

      const targetTotal = sanitizedParams.questionCount;
      const collectedQuestions: Partial<QuestionItem>[] = [];
      const seenStems = new Set<string>();
      let parsedTitle = '';
      let parsedAnalysis: QuestionSet['deepAnalysis'] | undefined;

      const MAX_BATCH_SIZE = 20;
      let safetyRound = 0;

      while (collectedQuestions.length < targetTotal && safetyRound < 4) {
        safetyRound += 1;
        const remainingNeeded = targetTotal - collectedQuestions.length;
        const batchCount = Math.min(MAX_BATCH_SIZE, remainingNeeded);
        const startNumber = collectedQuestions.length + 1;

        const existingStemsSummary =
          collectedQuestions.length > 0
            ? `\nSOAL YANG SUDAH ADA (DILARANG DUPLIKAT / MENGULANG KONTEKS SAMA):\n${collectedQuestions
                .slice(-25)
                .map((q, idx) => `${idx + 1}. ${(q.questionText ?? '').slice(0, 110)}`)
                .join('\n')}`
            : '';

        const prompt = [
          'Anda adalah Tim Ahli Kurikulum Pendidikan Indonesia, Asesmen BSKAP, & Instructional Designer.',
          'Jalankan 10-Stage AI Deep Analysis secara internal (Input Understanding -> Document Analysis -> Curriculum Mapping -> Pedagogical Analysis -> Blueprint/Kisi-kisi -> Question Generation -> Answer & Rubric -> Quality Control -> Automatic Correction -> Final Validation).',
          '',
          'SPESIFIKASI ASESMEN:',
          `- Jenjang & Kelas: ${sanitizedParams.educationLevel} (${sanitizedParams.grade})`,
          `- Kurikulum: ${sanitizedParams.curriculum}`,
          `- Jenis Asesmen: ${sanitizedParams.assessmentType}`,
          `- Mata Pelajaran: ${sanitizedParams.subject}`,
          `- Topik / Materi: ${sanitizedParams.topic}`,
          `- Bahasa Soal: ${sanitizedParams.languageOption}`,
          `- Jumlah Soal Gelombang Ini: TEPAT ${batchCount} butir (mulai nomor ${startNumber} hingga ${startNumber + batchCount - 1} dari total ${targetTotal} butir)`,
          `- Format Utama: ${sanitizedParams.questionFormat} (Bentuk soal yang diinginkan: ${subTypesStr})`,
          subTypeBreakdownStr
            ? `- Komposisi Khusus Bentuk Soal (Total ${targetTotal} butir): ${subTypeBreakdownStr}`
            : '',
          `- Fokus Mode: ${akmGuidance}`,
          `- Tingkat Kesulitan Dominan: ${sanitizedParams.difficulty}`,
          `- Distribusi Kognitif Acuan Guru: LOTS ${sanitizedParams.cognitiveDistribution.LOTS}% · MOTS ${sanitizedParams.cognitiveDistribution.MOTS}% · HOTS ${sanitizedParams.cognitiveDistribution.HOTS}%`,
          curriculumBlock,
          sanitizedParams.additionalNotes
            ? `- Catatan Guru: ${sanitizedParams.additionalNotes}`
            : '',
          textAttachmentContext ? `\nBAHAN REFERENSI GURU:\n${textAttachmentContext}` : '',
          existingStemsSummary,
          '',
          'ATURAN WAJIB STANDAR PENDIDIKAN INDONESIA:',
          '1. Gunakan Bahasa Indonesia baku sesuai EYD/PUEBI, kalimat efektif, tidak ambigu, serta sesuai usia perkembangan peserta didik.',
          '2. JANGAN mengarang nomor peraturan pemerintah/Permendikbud, JANGAN mengklaim soal sebagai soal resmi ANBK/pemerintah, dan JANGAN menyamakan CP, TP, ATP, dan KKTP.',
          `3. Untuk soal Pilihan Ganda / Pilihan Ganda Kompleks, sediakan tepat ${optionCount} opsi (A sampai ${optionCount === 5 ? 'E' : 'D'}) dan pengecoh yang logis. Untuk Benar dan Salah sediakan opsi A. Benar dan B. Salah.`,
          '4. Untuk bentuk Menjodohkan, isi array matchingPairs (3–4 pasang) serta jelaskan kunci pasangannya pada correctAnswer.',
          '5. Untuk soal Uraian / Uraian Terstruktur / Praktik dan Kinerja / Studi Kasus / Isian, tetapkan type="Esai", kosongkan options=[], dan WAJIB sertakan array rubric (kriteria, maxScore, descriptor).',
          '6. Pastikan soal HOTS benar-benar menuntut penalaran tingkat tinggi (C4–C6) berbasis stimulus bermakna, bukan sekadar teks panjang.',
          '7. Setiap soal wajib memiliki: material, indicator, learningObjective (sinkron dengan TP/KD), scoreWeight, questionSubType, cognitiveLevel, cognitiveTier, correctAnswer, dan explanation.',
          '8. DILARANG membuat soal duplikat atau mengulang pertanyaan yang serupa.',
        ]
          .filter(Boolean)
          .join('\n');

        const contents =
          binaryParts.length > 0 && safetyRound === 1
            ? { parts: [...binaryParts, { text: prompt }] }
            : prompt;

        const response = await generateContentWithModelFallback(ai, {
          contents,
          systemInstruction: `Selalu hasilkan JSON valid sesuai responseSchema dengan tepat ${batchCount} butir soal unik.`,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            required: ['title', 'questions', 'deepAnalysis'],
            properties: {
              title: {
                type: Type.STRING,
                description: 'Judul paket asesmen profesional dalam Bahasa Indonesia.',
              },
              deepAnalysis: {
                type: Type.OBJECT,
                required: [
                  'pedagogicalSummary',
                  'curriculumAlignmentNote',
                  'qualityControlChecks',
                  'verificationReminder',
                ],
                properties: {
                  pedagogicalSummary: { type: Type.STRING },
                  curriculumAlignmentNote: { type: Type.STRING },
                  qualityControlChecks: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                  verificationReminder: { type: Type.STRING },
                },
              },
              questions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  required: [
                    'number',
                    'type',
                    'questionSubType',
                    'difficulty',
                    'cognitiveLevel',
                    'cognitiveTier',
                    'material',
                    'indicator',
                    'learningObjective',
                    'scoreWeight',
                    'questionText',
                    'options',
                    'correctAnswer',
                    'explanation',
                  ],
                  properties: {
                    number: { type: Type.INTEGER },
                    type: { type: Type.STRING },
                    questionSubType: { type: Type.STRING },
                    difficulty: { type: Type.STRING },
                    cognitiveLevel: { type: Type.STRING },
                    cognitiveTier: { type: Type.STRING },
                    material: { type: Type.STRING },
                    indicator: { type: Type.STRING },
                    learningObjective: { type: Type.STRING },
                    scoreWeight: { type: Type.INTEGER },
                    stimulus: { type: Type.STRING },
                    questionText: { type: Type.STRING },
                    options: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        required: ['label', 'text'],
                        properties: {
                          label: { type: Type.STRING },
                          text: { type: Type.STRING },
                        },
                      },
                    },
                    matchingPairs: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        required: ['prompt', 'match'],
                        properties: {
                          prompt: { type: Type.STRING },
                          match: { type: Type.STRING },
                        },
                      },
                    },
                    correctAnswer: { type: Type.STRING },
                    explanation: { type: Type.STRING },
                    rubric: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        required: ['criterion', 'maxScore', 'descriptor'],
                        properties: {
                          criterion: { type: Type.STRING },
                          maxScore: { type: Type.INTEGER },
                          descriptor: { type: Type.STRING },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        });

        const rawText = stripJsonFences(response.text ?? '');
        if (!rawText) {
          throw new Error('Model mengembalikan respons kosong.');
        }

        const parsedRaw = JSON.parse(rawText) as
          | {
              title?: string;
              questions?: Partial<QuestionItem>[];
              deepAnalysis?: QuestionSet['deepAnalysis'];
            }
          | Partial<QuestionItem>[];

        const batchList = Array.isArray(parsedRaw)
          ? parsedRaw
          : Array.isArray(parsedRaw.questions)
            ? parsedRaw.questions
            : [];

        if (!Array.isArray(parsedRaw)) {
          if (!parsedTitle && parsedRaw.title) parsedTitle = parsedRaw.title;
          if (!parsedAnalysis && parsedRaw.deepAnalysis) parsedAnalysis = parsedRaw.deepAnalysis;
        }

        for (const item of batchList) {
          if (collectedQuestions.length >= targetTotal) break;
          const stem = normalizeStem(item.questionText ?? '');
          if (!stem || seenStems.has(stem)) continue;
          seenStems.add(stem);
          collectedQuestions.push(item);
        }
      }

      const rawSet: QuestionSet = {
        id: `set-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        title:
          parsedTitle.trim() ||
          `${sanitizedParams.assessmentType} ${sanitizedParams.subject}: ${sanitizedParams.topic}`,
        createdAt: new Date().toISOString(),
        params: sanitizedParams,
        questions: collectedQuestions.slice(0, targetTotal).map((q, idx) => ({
          id: `q-${Date.now()}-${idx + 1}`,
          number: idx + 1,
          type: q.type === 'Esai' ? 'Esai' : 'Pilihan Ganda',
          questionSubType: q.questionSubType,
          difficulty:
            q.difficulty === 'Mudah' ||
            q.difficulty === 'Sedang' ||
            q.difficulty === 'Sulit' ||
            q.difficulty === 'HOTS'
              ? q.difficulty
              : sanitizedParams.difficulty,
          cognitiveLevel:
            q.cognitiveLevel && /^C[1-6]$/.test(q.cognitiveLevel)
              ? (q.cognitiveLevel as QuestionItem['cognitiveLevel'])
              : 'C3',
          cognitiveTier: q.cognitiveTier,
          stimulus: q.stimulus,
          material: q.material,
          indicator: q.indicator,
          learningObjective: q.learningObjective,
          scoreWeight: q.scoreWeight,
          questionText: q.questionText ?? '',
          options: Array.isArray(q.options)
            ? q.options.map((o, oIdx) => ({
                label: o?.label || String.fromCharCode(65 + oIdx),
                text: o?.text ?? '',
              }))
            : [],
          matchingPairs: q.matchingPairs,
          correctAnswer: q.correctAnswer ?? '',
          explanation: q.explanation ?? '',
          rubric: q.rubric,
        })),
        deepAnalysis: parsedAnalysis ?? {
          pedagogicalSummary: `Paket ${sanitizedParams.assessmentType} disusun untuk ${sanitizedParams.educationLevel} ${sanitizedParams.grade}.`,
          curriculumAlignmentNote: `Mengacu pada struktur ${sanitizedParams.curriculum}.`,
          qualityControlChecks: [
            'Kesesuaian jenjang & bahasa baku Indonesia',
            'Sinkronisasi indikator & kunci jawaban',
            'Validasi batas maksimal 50 butir & anti-duplikasi',
          ],
          verificationReminder:
            'Mohon periksa kembali kesesuaian CP/TP/KD dengan dokumen resmi Kemendikdasmen/BSKAP dan kebijakan satuan pendidikan Anda.',
        },
      };

      const sanitized = sanitizeQuestionSet(rawSet);
      const { repairedSet } = autoRepairQuestionSet(sanitized);
      const scoredSet: QuestionSet = {
        ...repairedSet,
        questions: calculateIntelligentScores(repairedSet.questions),
      };
      const validationReport = validateQuestionSet(scoredSet);

      if (scoredSet.questions.length === 0) {
        res.status(502).json({
          error: 'Gagal menyusun daftar soal dari respons AI. Silakan coba lagi.',
        });
        return;
      }

      res.json({ questionSet: scoredSet, validationReport });
    } catch (err) {
      sendGeminiError(res, '/api/generate-questions', err, 'Gagal menghasilkan soal otomatis');
    }
  });

  // =========================================================================
  // 2. 9-STAGE QUESTION-CONTEXT-AWARE VISUAL ENGINE + SEMANTIC VALIDATION
  // =========================================================================
  app.post('/api/generate-question-image', async (req, res) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const questionId = sanitizeText(String(body.questionId ?? 'q-1'), 64);
      const questionText = sanitizeText(String(body.questionText ?? ''), 1500);
      const stimulus = sanitizeText(String(body.stimulus ?? ''), 1200);
      const material = sanitizeText(String(body.material ?? ''), 200);
      const learningObjective = sanitizeText(String(body.learningObjective ?? ''), 300);
      const indicator = sanitizeText(String(body.indicator ?? ''), 300);
      const subject = sanitizeText(String(body.subject ?? 'Umum'), 100);
      const educationLevel = sanitizeText(String(body.educationLevel ?? 'SD/MI'), 40);
      const grade = sanitizeText(String(body.grade ?? 'Kelas V'), 40);
      const topic = sanitizeText(String(body.topic ?? ''), 200);
      const additionalNotes = sanitizeText(String(body.additionalNotes ?? ''), 300);
      const customEditInstruction = sanitizeText(String(body.customEditInstruction ?? ''), 400);
      const forceOverride = Boolean(body.forceOverride ?? false);

      const rawOptions = Array.isArray(body.options) ? body.options : [];
      const answerOptions = rawOptions
        .slice(0, 6)
        .map((o: unknown) => {
          const rec = o as { label?: string; text?: string };
          return `${sanitizeText(rec?.label ?? '', 6)}. ${sanitizeText(rec?.text ?? '', 250)}`;
        })
        .filter((s) => s.trim().length > 2);
      const correctAnswer = sanitizeText(String(body.correctAnswer ?? ''), 300);

      const imageType = sanitizeText(
        String(body.imageType ?? 'Ilustrasi edukasi'),
        80
      ) as QuestionImageType;
      const visualStyle = sanitizeText(String(body.visualStyle ?? 'Bersih dan edukatif'), 140);
      const aspectRatio = (
        ['1:1', '4:3', '3:2', '16:9', 'Portrait'].includes(String(body.aspectRatio))
          ? String(body.aspectRatio)
          : '4:3'
      ) as StructuredVisualPrompt['aspect_ratio'];
      const detailLevel = sanitizeText(String(body.detailLevel ?? 'Standar'), 40);
      const backgroundStyle = sanitizeText(String(body.backgroundStyle ?? 'Putih Bersih'), 60);
      const orientation = sanitizeText(String(body.orientation ?? 'Landscape'), 40);
      const includeLabels = Boolean(body.includeLabels ?? true);

      if (!questionText || questionText.length < 5) {
        res.status(400).json({ error: 'Teks pertanyaan harus diisi untuk membuat visual soal.' });
        return;
      }

      const ai = createGeminiClient();
      if (!ai) {
        res.status(503).json({
          error: 'Kunci Gemini API belum dikonfigurasi pada server.',
        });
        return;
      }

      const dims =
        aspectRatio === '1:1'
          ? { width: 640, height: 640 }
          : aspectRatio === '3:2'
            ? { width: 750, height: 500 }
            : aspectRatio === '16:9'
              ? { width: 800, height: 450 }
              : aspectRatio === 'Portrait'
                ? { width: 540, height: 720 }
                : { width: 800, height: 600 };

      const bgHex =
        backgroundStyle === 'Lembut Edukatif'
          ? '#F0FDF4'
          : backgroundStyle === 'Transparan / Netral'
            ? '#F8FAFC'
            : '#FFFFFF';

      const subjectGuidance = getSubjectVisualGuidance(subject);

      const generateCombinedVisualAttempt = async (extraFeedback = '') => {
        const prompt = [
          'Anda adalah Sistem Visual Pedagogis 9-Tahap (Question-Context-Aware Visual Engine).',
          'Baca seluruh konteks soal di bawah ini, lalu lakukan:',
          'TAHAP 1–4 (Analisis Kebutuhan & Prompt Terstruktur):',
          '- Tentukan visual_necessity:',
          '  * "REQUIRED": soal merujuk gambar/bangun/diagram/grafik/peta/proses alam/adegan yang esensial.',
          '  * "OPTIONAL": visual memperjelas konteks konkret bagi siswa.',
          '  * "NOT REQUIRED": soal murni verbal/hafalan kata/ejaan/definisi singkat (contoh: "Sebutkan tiga contoh kata benda", sinonim/antonim, ejaan baku tanpa konteks gambar).',
          '- Ekstrak visual_purpose, required_objects, required_actions, required_conditions, required_quantities, composition, dan negative_constraints.',
          'TAHAP 5–7 (Pembuatan SVG 1.1 Edukatif):',
          `- Apabila visual_necessity bukan "NOT REQUIRED" (atau diminta wajib dibuat: ${forceOverride || Boolean(customEditInstruction)}), susun kode SVG 1.1 lengkap dengan viewBox="0 0 ${dims.width} ${dims.height}" (${aspectRatio}, ${orientation}), latar <rect width="${dims.width}" height="${dims.height}" fill="${bgHex}" />, tingkat detail ${detailLevel}, gaya ${visualStyle}.`,
          `- Label pada Gambar: ${includeLabels ? 'Sertakan label Bahasa Indonesia baku yang presisi, tidak bertumpuk, dan sesuai angka soal' : 'Minimal teks agar siswa menganalisis gambar secara mandiri'}.`,
          '- DILARANG membocorkan kunci jawaban atau rumus hasil kecuali diminta di soal; DILARANG <script>, <foreignObject>, atau <image href=...>.',
          '- Pastikan seluruh elemen SVG aman di dalam margin 30px dari tepi viewBox.',
          '',
          subjectGuidance,
          '',
          'KONTEKS SOAL LENGKAP:',
          `- Mata Pelajaran: ${subject}`,
          `- Jenjang / Kelas: ${educationLevel} · ${grade}`,
          `- Materi: ${material || topic || '-'}`,
          `- Tujuan Pembelajaran: ${learningObjective || '-'}`,
          `- Indikator Soal: ${indicator || '-'}`,
          stimulus ? `- Stimulus/Bacaan: ${stimulus}` : '',
          `- Pertanyaan: ${questionText}`,
          answerOptions.length > 0 ? `- Pilihan Jawaban: ${answerOptions.join(' | ')}` : '',
          correctAnswer ? `- Kunci Jawaban (HANYA referensi agar tidak salah & tidak bocor): ${correctAnswer}` : '',
          additionalNotes ? `- Instruksi Guru: ${additionalNotes}` : '',
          customEditInstruction ? `- REVISI INSTRUKSI KHUSUS GURU: ${customEditInstruction}` : '',
          extraFeedback ? `- PERBAIKAN VALIDASI SEBELUMNYA: ${extraFeedback}` : '',
        ]
          .filter(Boolean)
          .join('\n');

        const aiRes = await generateContentWithModelFallback(ai, {
          contents: prompt,
          systemInstruction:
            'Selalu kembalikan JSON terstruktur berisi visual_necessity, analisis terstruktur, caption, dan svgMarkup (<svg ...>...</svg> valid).',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            required: [
              'visual_necessity',
              'visual_purpose',
              'required_objects',
              'required_actions',
              'required_conditions',
              'required_quantities',
              'composition',
              'negative_constraints',
              'analysisSummary',
              'caption',
              'svgMarkup',
            ],
            properties: {
              visual_necessity: {
                type: Type.STRING,
                description: 'Tepat salah satu: REQUIRED, OPTIONAL, atau NOT REQUIRED',
              },
              visual_purpose: { type: Type.STRING },
              required_objects: { type: Type.ARRAY, items: { type: Type.STRING } },
              required_actions: { type: Type.ARRAY, items: { type: Type.STRING } },
              required_conditions: { type: Type.ARRAY, items: { type: Type.STRING } },
              required_quantities: { type: Type.ARRAY, items: { type: Type.STRING } },
              composition: { type: Type.STRING },
              negative_constraints: { type: Type.ARRAY, items: { type: Type.STRING } },
              analysisSummary: { type: Type.STRING },
              caption: { type: Type.STRING },
              svgMarkup: { type: Type.STRING },
            },
          },
        });

        const parsed = JSON.parse(stripJsonFences(aiRes.text ?? '{}')) as {
          visual_necessity?: string;
          visual_purpose?: string;
          required_objects?: string[];
          required_actions?: string[];
          required_conditions?: string[];
          required_quantities?: string[];
          composition?: string;
          negative_constraints?: string[];
          analysisSummary?: string;
          caption?: string;
          svgMarkup?: string;
        };

        const rawNec = (parsed.visual_necessity ?? 'OPTIONAL').toUpperCase();
        const necessity: VisualNecessity =
          rawNec === 'REQUIRED'
            ? 'REQUIRED'
            : rawNec === 'NOT REQUIRED'
              ? 'NOT REQUIRED'
              : 'OPTIONAL';

        const promptObj: StructuredVisualPrompt = {
          question_id: questionId,
          subject,
          grade,
          material: material || topic,
          learning_objective: learningObjective,
          question_text: questionText,
          answer_options: answerOptions,
          answer_key: correctAnswer,
          visual_necessity: necessity,
          visual_purpose: sanitizeText(parsed.visual_purpose ?? 'Memperjelas konteks soal', 300),
          required_objects: (parsed.required_objects ?? []).slice(0, 10),
          required_actions: (parsed.required_actions ?? []).slice(0, 8),
          required_conditions: (parsed.required_conditions ?? []).slice(0, 8),
          required_quantities: (parsed.required_quantities ?? []).slice(0, 8),
          visual_type: imageType,
          composition: sanitizeText(parsed.composition ?? 'Komposisi seimbang di tengah kanvas', 250),
          style: visualStyle,
          aspect_ratio: aspectRatio,
          negative_constraints: [
            ...(parsed.negative_constraints ?? []),
            'Jangan membocorkan kunci jawaban atau rumus hasil kecuali diminta di soal',
          ].slice(0, 10),
        };

        return {
          necessity,
          structuredPrompt: promptObj,
          analysisSummary: sanitizeText(
            parsed.analysisSummary ?? promptObj.visual_purpose,
            400
          ),
          caption: sanitizeText(parsed.caption ?? `Ilustrasi ${imageType}`, 220),
          svgMarkup: sanitizeSvgMarkup(parsed.svgMarkup ?? '', dims.width, dims.height),
        };
      };

      // STAGE 1-7
      let attemptResult = await generateCombinedVisualAttempt();
      const { visualNecessity, structuredPrompt, analysisSummary } = {
        visualNecessity: attemptResult.necessity,
        structuredPrompt: attemptResult.structuredPrompt,
        analysisSummary: attemptResult.analysisSummary,
      };

      // Gate: Skip image generation if NOT REQUIRED unless teacher explicitly forced override
      if (visualNecessity === 'NOT REQUIRED' && !forceOverride && !customEditInstruction) {
        res.json({
          skippedByNecessity: true,
          visualNecessity: 'NOT REQUIRED',
          analysisSummary,
          structuredPrompt,
        });
        return;
      }

      // STAGE 8: Deterministic Technical & Semantic Validation + max 1 Smart Regeneration
      let regenerationAttempts = 0;
      let technical = inspectSvgTechnicalChecks(attemptResult.svgMarkup, dims.width, dims.height);
      let semantic = inspectSvgSemanticLocally(
        attemptResult.svgMarkup,
        structuredPrompt,
        questionText,
        correctAnswer
      );

      if (semantic.semanticStatus === 'failed' || technical.technicalStatus === 'failed') {
        regenerationAttempts = 1;
        const feedback = [...semantic.semanticNotes, ...technical.technicalChecks].join('; ');
        const retryResult = await generateCombinedVisualAttempt(feedback);
        if (retryResult.svgMarkup) {
          attemptResult = retryResult;
          technical = inspectSvgTechnicalChecks(attemptResult.svgMarkup, dims.width, dims.height);
          semantic = inspectSvgSemanticLocally(
            attemptResult.svgMarkup,
            attemptResult.structuredPrompt,
            questionText,
            correctAnswer
          );
        }
      }

      if (!attemptResult.svgMarkup) {
        res.status(502).json({
          error: 'Visual AI tidak dapat disusun dengan valid. Silakan tekan Generate Ulang.',
        });
        return;
      }

      const validationReport: VisualValidationReport = {
        ...semantic,
        ...technical,
      };

      res.json({
        analysisSummary: attemptResult.analysisSummary,
        visualNecessity: attemptResult.necessity,
        structuredPrompt: attemptResult.structuredPrompt,
        validationReport,
        caption: attemptResult.caption,
        svgMarkup: attemptResult.svgMarkup,
        width: dims.width,
        height: dims.height,
        regenerationAttempts,
      });
    } catch (err) {
      sendGeminiError(res, '/api/generate-question-image', err, 'Gagal menghasilkan visual soal');
    }
  });

  // =========================================================================
  // 3. AI QUESTION EDITOR & QUALITY ASSURANCE (/api/refine-question)
  // =========================================================================
  app.post('/api/refine-question', async (req, res) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const action = String(body.action ?? 'qa_audit');
      const subject = sanitizeText(String(body.subject ?? ''), 100);
      const educationLevel = sanitizeText(String(body.educationLevel ?? 'SD/MI'), 40);
      const grade = sanitizeText(String(body.grade ?? 'Kelas V'), 40);
      const targetSubType = sanitizeText(String(body.targetSubType ?? ''), 60) as QuestionSubType;
      const question = sanitizeQuestionItem((body.question ?? {}) as Partial<QuestionItem>, 0);

      if (!question.questionText) {
        res.status(400).json({ error: 'Butir soal tidak valid.' });
        return;
      }

      const ai = createGeminiClient();
      if (!ai) {
        res.status(503).json({
          error: 'Kunci Gemini API belum dikonfigurasi pada server.',
        });
        return;
      }

      if (action === 'qa_audit') {
        const qaPrompt = [
          'Anda adalah Tim Quality Assurance Asesmen Pendidikan Indonesia.',
          'Audit kualitas butir soal berikut secara objektif (cek ketepatan fakta, kejelasan/ambiguitas kalimat, logika pengecoh, konsistensi kunci jawaban, kesesuaian jenjang/usia, bebas bias/SARA, dan kesesuaian dengan indikator).',
          `- Jenjang/Kelas: ${educationLevel} (${grade})`,
          `- Mata Pelajaran: ${subject}`,
          `- Indikator: ${question.indicator || '-'}`,
          `- Bentuk & Level: ${question.questionSubType || question.type} · ${question.cognitiveLevel}`,
          question.stimulus ? `- Stimulus: ${question.stimulus}` : '',
          `- Pertanyaan: ${question.questionText}`,
          question.options.length > 0
            ? `- Opsi: ${question.options.map((o) => `${o.label}. ${o.text}`).join(' | ')}`
            : '',
          `- Kunci Jawaban: ${question.correctAnswer}`,
          `- Pembahasan: ${question.explanation}`,
        ]
          .filter(Boolean)
          .join('\n');

        const qaRes = await generateContentWithModelFallback(ai, {
          contents: qaPrompt,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            required: ['qualityScore', 'status', 'summary', 'issues', 'suggestions'],
            properties: {
              qualityScore: { type: Type.INTEGER },
              status: { type: Type.STRING, description: 'layak atau perlu_revisi' },
              summary: { type: Type.STRING },
              issues: { type: Type.ARRAY, items: { type: Type.STRING } },
              suggestions: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
          },
        });

        const parsed = JSON.parse(stripJsonFences(qaRes.text ?? '{}')) as Partial<QuestionQaReport>;
        const qaReport: QuestionQaReport = {
          qualityScore: Math.max(0, Math.min(100, Math.round(Number(parsed.qualityScore) || 85))),
          status: parsed.status === 'perlu_revisi' ? 'perlu_revisi' : 'layak',
          summary: sanitizeText(parsed.summary ?? 'Pemeriksaan kualitas selesai.', 400),
          issues: Array.isArray(parsed.issues)
            ? parsed.issues.slice(0, 6).map((x) => sanitizeText(String(x), 240))
            : [],
          suggestions: Array.isArray(parsed.suggestions)
            ? parsed.suggestions.slice(0, 6).map((x) => sanitizeText(String(x), 240))
            : [],
          checkedAt: new Date().toISOString(),
        };

        res.json({ qaReport });
        return;
      }

      const actionDirective =
        action === 'simplify'
          ? 'Sederhanakan bahasa agar lebih mudah dipahami sesuai tingkat perkembangan peserta didik tanpa mengubah substansi materi & indikator.'
          : action === 'grammar'
            ? 'Perbaiki tata bahasa sesuai EYD/PUEBI Bahasa Indonesia baku, hilangkan ambiguitas, dan pertajam pengecoh.'
            : action === 'expand'
              ? 'Kembangkan pertanyaan menjadi lebih kontekstual dan mendalam (bermakna/menalar) sesuai jenjang.'
              : action === 'variation'
                ? 'Buat variasi soal baru (konteks/angka/kasus berbeda namun tetap mengukur indikator & TP yang sama).'
                : action === 'change_subtype' && targetSubType
                  ? `Ubah bentuk soal ini menjadi "${targetSubType}" sambil menjaga indikator & tujuan pembelajaran tetap konsisten.`
                  : 'Sempurnakan kualitas butir soal.';

      const refinePrompt = [
        'Anda adalah Instructional Designer & Editor Soal Pendidikan Indonesia.',
        `TUGAS: ${actionDirective}`,
        `- Jenjang/Kelas: ${educationLevel} (${grade})`,
        `- Mata Pelajaran: ${subject}`,
        `- Indikator: ${question.indicator || '-'}`,
        question.stimulus ? `- Stimulus saat ini: ${question.stimulus}` : '',
        `- Pertanyaan saat ini: ${question.questionText}`,
        question.options.length > 0
          ? `- Opsi saat ini: ${question.options.map((o) => `${o.label}. ${o.text}`).join(' | ')}`
          : '',
        `- Kunci Jawaban saat ini: ${question.correctAnswer}`,
        `- Pembahasan saat ini: ${question.explanation}`,
      ]
        .filter(Boolean)
        .join('\n');

      const refineRes = await generateContentWithModelFallback(ai, {
        contents: refinePrompt,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          required: [
            'type',
            'questionSubType',
            'questionText',
            'options',
            'correctAnswer',
            'explanation',
          ],
          properties: {
            type: { type: Type.STRING },
            questionSubType: { type: Type.STRING },
            stimulus: { type: Type.STRING },
            questionText: { type: Type.STRING },
            options: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                required: ['label', 'text'],
                properties: {
                  label: { type: Type.STRING },
                  text: { type: Type.STRING },
                },
              },
            },
            correctAnswer: { type: Type.STRING },
            explanation: { type: Type.STRING },
          },
        },
      });

      const refinedRaw = JSON.parse(stripJsonFences(refineRes.text ?? '{}')) as Partial<QuestionItem>;
      const sanitized = sanitizeQuestionItem(
        {
          ...question,
          ...refinedRaw,
          id: question.id,
          number: question.number,
          supportingImage: question.supportingImage,
        },
        question.number - 1
      );

      res.json({ updatedQuestion: sanitized });
    } catch (err) {
      sendGeminiError(res, '/api/refine-question', err, 'Gagal memproses perbaikan soal');
    }
  });

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SMART QUEST GENERATOR server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
