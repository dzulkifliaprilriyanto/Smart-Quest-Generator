import { useMemo, useState } from 'react';
import { Download, Image as ImageIcon, Printer, Trash2 } from 'lucide-react';
import type { KopTemplate, QuestionImage, QuestionItem, QuestionSet } from '../types/question';
import { buildKisiKisiRows } from '../utils/formatter';
import { exportAsDocx, exportAsPdf, exportAsXlsx } from '../utils/exporter';
import { formatScore } from '../utils/scoring';

interface AdministrationViewProps {
  questionSet: QuestionSet | null;
  activeKopTemplate?: KopTemplate;
  onUpdateQuestion: (questionId: string, patch: Partial<QuestionItem>) => void;
  onOpenPrintPreview: () => void;
  onNotify: (msg: string) => void;
  onGoToStudio: () => void;
}

type AdminSubTab = 'kisikisi' | 'kartu' | 'rubrik' | 'lembar' | 'remedial' | 'gambar';

function formatBytes(bytes: number): string {
  if (!bytes || bytes < 1024) return `${bytes || 0} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatImageDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export function AdministrationView({
  questionSet,
  activeKopTemplate,
  onUpdateQuestion,
  onOpenPrintPreview,
  onNotify,
  onGoToStudio,
}: AdministrationViewProps) {
  const [subTab, setSubTab] = useState<AdminSubTab>('kisikisi');
  const [previewImg, setPreviewImg] = useState<{
    questionNumber: number;
    img: QuestionImage;
  } | null>(null);
  const [visibleCols, setVisibleCols] = useState({
    school: false,
    semester: false,
    tp: true,
    material: true,
    indicator: true,
    cognitive: true,
    form: true,
    answerKey: true,
  });

  const kisiRows = useMemo(() => {
    if (!questionSet) return [];
    return buildKisiKisiRows(questionSet);
  }, [questionSet]);

  const registeredImages = useMemo(() => {
    if (!questionSet) return [];
    return questionSet.questions
      .filter((q): q is QuestionItem & { supportingImage: QuestionImage } =>
        Boolean(q.supportingImage)
      )
      .map((q) => ({
        questionId: q.id,
        questionNumber: q.number,
        image: q.supportingImage,
      }));
  }, [questionSet]);

  if (!questionSet) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-8 text-center dark:border-slate-700 dark:bg-[#1E293B]">
        <h1 className="font-display text-xl font-semibold text-slate-900 dark:text-white">
          Kisi-Kisi & Administrasi Guru Indonesia
        </h1>
        <p className="mx-auto mt-2 max-w-xl text-sm text-slate-600 dark:text-slate-300">
          Belum ada paket soal aktif. Buat paket soal baru atau muat salah satu contoh di
          Studio Soal untuk menyusun Kisi-Kisi, Kartu Soal, Rubrik Penskoran, Lembar
          Jawaban, Bank Gambar Soal, serta Program Remedial & Pengayaan secara otomatis.
        </p>
        <button
          type="button"
          onClick={onGoToStudio}
          className="mt-5 inline-flex min-h-10 items-center rounded-lg bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 dark:bg-green-600"
        >
          Kembali ke Studio Soal
        </button>
      </section>
    );
  }

  return (
    <section aria-label="Kisi-kisi dan administrasi guru" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-[#1E293B]">
        <div>
          <h1 className="font-display text-xl font-semibold text-slate-900 dark:text-white">
            Dokumen Administrasi & Kisi-Kisi Asesmen
          </h1>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
            {questionSet.params.docIdentity?.schoolName
              ? `${questionSet.params.docIdentity.schoolName} · `
              : ''}
            Template administrasi siap sunting & ekspor (tanpa Kotak Nilai di halaman kisi-kisi).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onOpenPrintPreview}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-xs font-semibold text-green-800 hover:bg-green-100 dark:border-green-800 dark:bg-green-950/60 dark:text-green-300"
          >
            <Printer className="h-3.5 w-3.5" aria-hidden="true" />
            Pratinjau Cetak
          </button>
          <button
            type="button"
            onClick={() => {
              exportAsXlsx(questionSet, { includeAnswerKey: true });
              onNotify('Kisi-kisi & Rekap XLSX berhasil diunduh.');
            }}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Ekspor XLSX
          </button>
          <button
            type="button"
            onClick={async () => {
              await exportAsDocx(questionSet, {
                includeAnswerKey: true,
                kopTemplate: activeKopTemplate,
                exportConfig: {
                  includeBlueprint: true,
                  includeRubric: true,
                  includeAnswerSheet: true,
                },
              });
              onNotify('Paket Administrasi Lengkap DOCX berhasil diunduh.');
            }}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs font-semibold text-green-800 hover:bg-green-100 dark:border-green-800 dark:bg-green-950/60 dark:text-green-300"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Paket Lengkap DOCX
          </button>
          <button
            type="button"
            onClick={() => {
              exportAsPdf(questionSet, {
                includeAnswerKey: true,
                kopTemplate: activeKopTemplate,
                exportConfig: { includeBlueprint: true, includeRubric: true },
              });
              onNotify('Paket Administrasi PDF berhasil diunduh.');
            }}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-green-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-green-800 dark:bg-green-600 dark:hover:bg-green-500"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Paket PDF
          </button>
        </div>
      </div>

      {/* Sub-navigation for Administration Templates */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-[#1E293B]">
        {(
          [
            ['kisikisi', 'Kisi-Kisi Soal'],
            ['kartu', 'Kartu Soal'],
            ['rubrik', 'Rubrik & Penskoran'],
            ['lembar', 'Lembar Jawaban Siswa'],
            ['remedial', 'Program Remedial, Pengayaan & LKPD'],
            ['gambar', `Bank Gambar Soal (${registeredImages.length})`],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setSubTab(id)}
            aria-pressed={subTab === id}
            data-testid={`admin-subtab-${id}`}
            className={`min-h-9 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
              subTab === id
                ? 'bg-green-700 text-white dark:bg-green-600'
                : 'text-slate-700 hover:bg-green-50 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {subTab === 'kisikisi' && (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-[#1E293B]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              Tabel Kisi-Kisi Soal (Tersinkron Otomatis)
            </h2>
            <div className="flex flex-wrap items-center gap-3 text-xs">
              {(
                [
                  ['school', 'Satuan Pendidikan'],
                  ['semester', 'Semester'],
                  ['tp', 'TP / KD'],
                  ['answerKey', 'Kunci'],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="inline-flex cursor-pointer items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={visibleCols[key]}
                    onChange={(e) =>
                      setVisibleCols((prev) => ({ ...prev, [key]: e.target.checked }))
                    }
                    className="h-3.5 w-3.5 accent-green-700"
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-[#0F172A] dark:text-slate-300">
                  <th className="px-3 py-2.5 font-semibold">No. Soal</th>
                  {visibleCols.school && <th className="px-3 py-2.5 font-semibold">Satuan Pendidikan</th>}
                  <th className="px-3 py-2.5 font-semibold">Mapel / Kelas</th>
                  {visibleCols.semester && <th className="px-3 py-2.5 font-semibold">Semester</th>}
                  {visibleCols.tp && <th className="px-3 py-2.5 font-semibold">Tujuan Pembelajaran / KD</th>}
                  <th className="px-3 py-2.5 font-semibold">Materi</th>
                  <th className="px-3 py-2.5 font-semibold">Indikator Soal</th>
                  <th className="px-3 py-2.5 font-semibold">Level</th>
                  <th className="px-3 py-2.5 font-semibold">Bentuk</th>
                  {visibleCols.answerKey && <th className="px-3 py-2.5 font-semibold">Kunci</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {kisiRows.map((row, idx) => {
                  const q = questionSet.questions[idx];
                  return (
                    <tr key={row.questionNumber} className="align-top">
                      <td className="font-mono-tabular px-3 py-2.5 font-semibold">
                        {row.questionNumber}
                      </td>
                      {visibleCols.school && <td className="px-3 py-2.5">{row.schoolName}</td>}
                      <td className="px-3 py-2.5">
                        {row.subject}
                        <div className="text-[11px] text-slate-500">{row.gradePhase}</div>
                      </td>
                      {visibleCols.semester && <td className="px-3 py-2.5">{row.semester}</td>}
                      {visibleCols.tp && (
                        <td className="min-w-[190px] px-3 py-2.5">
                          <textarea
                            rows={3}
                            aria-label={`TP soal ${row.questionNumber}`}
                            value={q?.learningObjective ?? row.learningObjective}
                            onChange={(e) =>
                              q &&
                              onUpdateQuestion(q.id, { learningObjective: e.target.value })
                            }
                            className="w-full resize-none rounded border border-transparent bg-transparent px-1.5 py-1 leading-relaxed hover:border-slate-200 focus:border-green-600 focus:bg-white focus:outline-none dark:hover:border-slate-600 dark:focus:bg-[#0F172A]"
                          />
                        </td>
                      )}
                      <td className="min-w-[150px] px-3 py-2.5">
                        <textarea
                          rows={3}
                          aria-label={`Materi soal ${row.questionNumber}`}
                          value={q?.material ?? row.material}
                          onChange={(e) =>
                            q && onUpdateQuestion(q.id, { material: e.target.value })
                          }
                          className="w-full resize-none rounded border border-transparent bg-transparent px-1.5 py-1 leading-relaxed hover:border-slate-200 focus:border-green-600 focus:bg-white focus:outline-none dark:hover:border-slate-600 dark:focus:bg-[#0F172A]"
                        />
                      </td>
                      <td className="min-w-[230px] px-3 py-2.5">
                        <textarea
                          rows={3}
                          aria-label={`Indikator soal ${row.questionNumber}`}
                          value={q?.indicator ?? row.indicator}
                          onChange={(e) =>
                            q && onUpdateQuestion(q.id, { indicator: e.target.value })
                          }
                          className="w-full resize-none rounded border border-transparent bg-transparent px-1.5 py-1 leading-relaxed hover:border-slate-200 focus:border-green-600 focus:bg-white focus:outline-none dark:hover:border-slate-600 dark:focus:bg-[#0F172A]"
                        />
                      </td>
                      <td className="font-mono-tabular px-3 py-2.5 font-semibold whitespace-nowrap">
                        {row.cognitiveLevel}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{row.questionForm}</td>
                      {visibleCols.answerKey && (
                        <td className="px-3 py-2.5 font-medium text-green-700 dark:text-green-400">
                          {row.correctAnswer}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subTab === 'kartu' && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {questionSet.questions.map((q, idx) => (
            <div
              key={q.id}
              className="rounded-xl border border-slate-200 bg-white p-5 text-xs dark:border-slate-700 dark:bg-[#1E293B]"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 dark:border-slate-700">
                <span className="font-semibold text-slate-900 dark:text-white">
                  KARTU SOAL NO. {idx + 1}
                </span>
                <span className="font-mono-tabular text-slate-500">
                  {q.cognitiveLevel} · {q.questionSubType || q.type}
                </span>
              </div>
              <dl className="mt-3 space-y-2">
                <div>
                  <dt className="font-semibold text-slate-700 dark:text-slate-300">Materi:</dt>
                  <dd className="text-slate-600 dark:text-slate-400">
                    {q.material || questionSet.params.topic}
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold text-slate-700 dark:text-slate-300">Indikator:</dt>
                  <dd className="text-slate-600 dark:text-slate-400">{q.indicator || 'Belum diisi'}</dd>
                </div>
                {q.supportingImage && (
                  <div>
                    <dt className="font-semibold text-slate-700 dark:text-slate-300">
                      Visual Pendukung:
                    </dt>
                    <dd className="mt-1">
                      <img
                        src={q.supportingImage.dataUrl}
                        alt={q.supportingImage.caption}
                        className="max-h-28 rounded border border-slate-200 bg-white object-contain p-1"
                      />
                    </dd>
                  </div>
                )}
                <div>
                  <dt className="font-semibold text-slate-700 dark:text-slate-300">Rumusan Soal:</dt>
                  <dd className="mt-0.5 text-slate-900 dark:text-slate-100">{q.questionText}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-green-700 dark:text-green-400">
                    Kunci & Bobot ({formatScore(q.scoreWeight)}):
                  </dt>
                  <dd className="text-slate-700 dark:text-slate-300">{q.correctAnswer}</dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
      )}

      {subTab === 'rubrik' && (
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-[#1E293B]">
          <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
            Pedoman Penskoran & Rubrik Penilaian
          </h2>
          {questionSet.questions.map((q, idx) => (
            <div
              key={q.id}
              className="border-b border-slate-100 pb-4 last:border-b-0 last:pb-0 dark:border-slate-700"
            >
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-900 dark:text-white">
                  Butir {idx + 1} ({q.questionSubType || q.type})
                </span>
                <span className="font-mono-tabular font-semibold text-green-700 dark:text-green-400">
                  Skor Maksimal: {formatScore(q.scoreWeight)}
                </span>
              </div>
              {q.rubric && q.rubric.length > 0 ? (
                <ul className="mt-2 space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
                  {q.rubric.map((r, rIdx) => (
                    <li key={rIdx} className="rounded-md bg-slate-50 px-3 py-2 dark:bg-[#0F172A]">
                      <span className="font-semibold">{r.criterion}</span> (Maks{' '}
                      {formatScore(r.maxScore)}): {r.descriptor}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400">
                  Penilaian objektif: Jawaban benar diberi skor {formatScore(q.scoreWeight)}; jawaban
                  salah/kosong diberi skor 0.00. Kunci: {q.correctAnswer}.
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {subTab === 'lembar' && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-[#1E293B]">
          <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
            Pratinjau Lembar Jawaban Peserta Didik
          </h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Otomatis disertakan pada halaman akhir saat Anda mengunduh dokumen DOCX.
          </p>
          <div className="mt-4 grid grid-cols-1 gap-2 rounded-lg border border-slate-200 p-4 text-xs sm:grid-cols-3 dark:border-slate-700">
            <div>Nama Siswa: ..............................</div>
            <div>Kelas / Fase: ............................</div>
            <div>Nilai Akhir: .............................</div>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="py-2 pr-4">No.</th>
                  <th className="py-2 pr-4">Bentuk</th>
                  <th className="py-2 pr-4">Kolom Jawaban</th>
                  <th className="py-2 text-right">Skor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {questionSet.questions.map((q, idx) => (
                  <tr key={q.id}>
                    <td className="font-mono-tabular py-2.5 pr-4 font-semibold">{idx + 1}</td>
                    <td className="py-2.5 pr-4">{q.questionSubType || q.type}</td>
                    <td className="font-mono-tabular py-2.5 pr-4 text-slate-600 dark:text-slate-300">
                      {q.options.length > 0
                        ? q.options.map((o) => `[ ${o.label} ]`).join('  ')
                        : '................................................................'}
                    </td>
                    <td className="font-mono-tabular py-2.5 text-right">
                      .... / {formatScore(q.scoreWeight)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subTab === 'remedial' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-5 text-xs dark:border-slate-700 dark:bg-[#1E293B]">
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              Template Program Remedial & Pengayaan
            </h2>
            <p className="mt-1.5 leading-relaxed text-slate-600 dark:text-slate-300">
              <span className="font-semibold text-slate-900 dark:text-white">
                Program Remedial:
              </span>{' '}
              Ditujukan bagi peserta didik yang belum mencapai KKTP pada tujuan pembelajaran{' '}
              <em>{questionSet.params.learningPlan?.tp || questionSet.params.topic}</em>.
              Bentuk layanan meliputi bimbingan ulang konsep dasar (C1–C2), latihan terbimbing,
              serta asesmen ulang setara.
            </p>
            <p className="mt-3 leading-relaxed text-slate-600 dark:text-slate-300">
              <span className="font-semibold text-slate-900 dark:text-white">
                Program Pengayaan:
              </span>{' '}
              Ditujukan bagi peserta didik yang melampaui KKTP melalui studi kasus HOTS
              lintas konsep atau proyek mandiri terapan pada topik{' '}
              <em>{questionSet.params.topic}</em>.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 text-xs dark:border-slate-700 dark:bg-[#1E293B]">
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              Kerangka LKPD & Penilaian Sikap/Proyek
            </h2>
            <ul className="mt-2 space-y-1.5 leading-relaxed text-slate-600 dark:text-slate-300">
              <li>
                1. <span className="font-semibold">Identitas LKPD:</span>{' '}
                {questionSet.params.subject} · {questionSet.params.grade}
              </li>
              <li>
                2. <span className="font-semibold">Tujuan Aktivitas:</span>{' '}
                {questionSet.params.learningPlan?.tp || questionSet.params.topic}
              </li>
              <li>
                3. <span className="font-semibold">Langkah Kerja:</span> Amati stimulus/kasus
                → Diskusikan pemecahan masalah → Presentasikan hasil → Refleksi diri.
              </li>
              <li>
                4. <span className="font-semibold">Observasi Sikap/Kinerja (Opsional):</span>{' '}
                Bernalar kritis, gotong royong, dan ketelitian pengerjaan sesuai kebijakan sekolah.
              </li>
            </ul>
          </div>
        </div>
      )}

      {/* Bank Gambar Soal (Image Management Registry) */}
      {subTab === 'gambar' && (
        <div
          data-testid="image-registry-panel"
          className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-[#1E293B]"
        >
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-white">
                <ImageIcon className="h-4 w-4 text-green-700 dark:text-green-400" />
                Registri Bank Gambar Pendukung Soal
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Setiap gambar terhubung secara independen ke nomor dan ID butir soal terkait.
              </p>
            </div>
          </div>

          {registeredImages.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-xs text-slate-600 dark:border-slate-700 dark:text-slate-400">
              Belum ada gambar pendukung soal yang terpasang. Buka tab{' '}
              <button
                type="button"
                onClick={onGoToStudio}
                className="font-semibold text-green-700 underline dark:text-green-400"
              >
                Studio Soal
              </button>{' '}
              lalu gunakan tombol <strong>Generate Image</strong> atau <strong>Upload Image</strong>{' '}
              pada butir soal yang membutuhkan visualisasi.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-[#0F172A] dark:text-slate-300">
                    <th className="px-3 py-2.5 font-semibold">Pratinjau</th>
                    <th className="px-3 py-2.5 font-semibold">ID Gambar</th>
                    <th className="px-3 py-2.5 font-semibold">ID / No. Soal</th>
                    <th className="px-3 py-2.5 font-semibold">Nama File</th>
                    <th className="px-3 py-2.5 font-semibold">Format</th>
                    <th className="px-3 py-2.5 font-semibold">Ukuran</th>
                    <th className="px-3 py-2.5 font-semibold">Sumber</th>
                    <th className="px-3 py-2.5 font-semibold">Keterangan</th>
                    <th className="px-3 py-2.5 font-semibold">Waktu</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {registeredImages.map(({ questionId, questionNumber, image }) => (
                    <tr key={image.id} className="align-middle">
                      <td className="px-3 py-2">
                        <img
                          src={image.dataUrl}
                          alt={image.caption}
                          className="h-10 w-14 rounded border border-slate-200 bg-white object-contain p-0.5"
                        />
                      </td>
                      <td className="font-mono-tabular px-3 py-2 text-[11px] text-slate-500">
                        {image.id}
                      </td>
                      <td className="font-mono-tabular px-3 py-2 font-semibold">
                        Soal {questionNumber}{' '}
                        <span className="block text-[10px] font-normal text-slate-500">
                          {questionId}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-medium">{image.fileName}</td>
                      <td className="font-mono-tabular px-3 py-2 uppercase">
                        {image.format}
                      </td>
                      <td className="font-mono-tabular px-3 py-2 whitespace-nowrap">
                        {formatBytes(image.sizeBytes)}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span
                          className={`font-semibold ${
                            image.source === 'ai'
                              ? 'text-green-700 dark:text-green-400'
                              : 'text-emerald-700 dark:text-emerald-300'
                          }`}
                        >
                          {image.source === 'ai' ? 'AI Generator' : 'Upload Manual'}
                        </span>
                      </td>
                      <td className="max-w-[200px] truncate px-3 py-2" title={image.caption}>
                        {image.caption}
                      </td>
                      <td className="font-mono-tabular px-3 py-2 whitespace-nowrap text-slate-500">
                        {formatImageDate(image.createdAt)}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setPreviewImg({ questionNumber, img: image })}
                            className="rounded border border-slate-200 px-2 py-1 text-[11px] font-medium hover:bg-green-50 dark:border-slate-700"
                          >
                            Lihat
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              onUpdateQuestion(questionId, { supportingImage: undefined });
                              onNotify(`Gambar pada Soal ${questionNumber} dihapus.`);
                            }}
                            aria-label={`Hapus gambar soal ${questionNumber}`}
                            className="inline-flex h-7 w-7 items-center justify-center rounded text-slate-500 hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {previewImg && (
            <div
              role="dialog"
              aria-modal="true"
              className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4"
            >
              <div className="w-full max-w-xl rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-[#1E293B]">
                <div className="mb-3 flex items-center justify-between">
                  <span className="font-semibold">
                    Visual Soal {previewImg.questionNumber} — {previewImg.img.fileName}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPreviewImg(null)}
                    className="rounded border border-slate-200 px-2.5 py-1 text-xs dark:border-slate-700"
                  >
                    Tutup
                  </button>
                </div>
                <img
                  src={previewImg.img.dataUrl}
                  alt={previewImg.img.caption}
                  className="mx-auto max-h-[60vh] rounded border border-slate-200 bg-white object-contain p-2"
                />
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
