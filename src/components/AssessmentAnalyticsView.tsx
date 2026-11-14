import { useMemo, useState } from 'react';
import { Plus, Trash2, Users } from 'lucide-react';
import type { QuestionSet, StudentResponseEntry } from '../types/question';
import {
  analyzeQuestionItems,
  evaluateStudentResponses,
} from '../utils/assessmentAnalytics';
import { formatScore } from '../utils/scoring';

interface AssessmentAnalyticsViewProps {
  questionSet: QuestionSet | null;
  responses: StudentResponseEntry[];
  kktpThreshold: number;
  onChangeKktp: (val: number) => void;
  onUpdateResponses: (next: StudentResponseEntry[]) => void;
  onGoToStudio: () => void;
}

export function AssessmentAnalyticsView({
  questionSet,
  responses,
  kktpThreshold,
  onChangeKktp,
  onUpdateResponses,
  onGoToStudio,
}: AssessmentAnalyticsViewProps) {
  const [newStudentName, setNewStudentName] = useState('');

  const evaluations = useMemo(() => {
    if (!questionSet) return [];
    return evaluateStudentResponses(questionSet.questions, responses, kktpThreshold);
  }, [questionSet, responses, kktpThreshold]);

  const itemAnalysis = useMemo(() => {
    if (!questionSet) {
      return { hasSufficientData: false, minimumRequired: 6, metrics: [] };
    }
    return analyzeQuestionItems(questionSet.questions, responses, kktpThreshold);
  }, [questionSet, responses, kktpThreshold]);

  if (!questionSet) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-8 text-center dark:border-slate-700 dark:bg-[#1E293B]">
        <h1 className="font-display text-xl font-semibold text-slate-900 dark:text-white">
          Penilaian, Ketuntasan KKTP & Analisis Butir Soal
        </h1>
        <p className="mx-auto mt-2 max-w-xl text-sm text-slate-600 dark:text-slate-300">
          Muat atau buat paket soal terlebih dahulu di Studio Soal untuk memasukkan hasil
          jawaban siswa, menghitung konversi nilai sesuai KKTP, serta menganalisis butir
          soal.
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

  const handleAddStudent = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newStudentName.trim();
    if (!clean) return;
    const entry: StudentResponseEntry = {
      id: `std-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      studentName: clean,
      answers: {},
      manualScores: {},
    };
    onUpdateResponses([...responses, entry]);
    setNewStudentName('');
  };

  const handleLoadSampleResponses = () => {
    const sampleNames = [
      'Aulia Rahma',
      'Bima Pratama',
      'Citra Lestari',
      'Dimas Wijaya',
      'Eka Putri',
      'Fajar Nugroho',
    ];
    const generated: StudentResponseEntry[] = sampleNames.map((name, sIdx) => {
      const answers: Record<string, string> = {};
      const manualScores: Record<string, number> = {};
      questionSet.questions.forEach((q, qIdx) => {
        const weight = q.scoreWeight ?? (q.type === 'Esai' ? 20 : 10);
        if (q.type === 'Pilihan Ganda' && q.options.length > 0) {
          const isCorrect = (sIdx + qIdx) % 3 !== 0 || sIdx === 0 || sIdx === 2;
          answers[q.id] = isCorrect
            ? q.correctAnswer.trim().slice(0, 1).toUpperCase() || 'A'
            : q.options[(qIdx + 1) % q.options.length]?.label ?? 'D';
        } else {
          manualScores[q.id] = sIdx < 2 ? weight : sIdx < 4 ? Math.round(weight * 0.75) : Math.round(weight * 0.45);
        }
      });
      return {
        id: `sample-std-${sIdx + 1}`,
        studentName: name,
        answers,
        manualScores,
      };
    });
    onUpdateResponses(generated);
  };

  const tuntasCount = evaluations.filter(
    (e) => e.status === 'Tuntas' || e.status === 'Pengayaan'
  ).length;
  const avgScore =
    evaluations.length > 0
      ? Math.round(
          (evaluations.reduce((s, e) => s + e.percentageScore, 0) / evaluations.length) * 10
        ) / 10
      : 0;

  return (
    <section aria-label="Penilaian dan analisis hasil" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-[#1E293B]">
        <div>
          <h1 className="font-display text-xl font-semibold text-slate-900 dark:text-white">
            Penilaian, Rekap Nilai & Analisis Butir Soal
          </h1>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
            Ambang ketuntasan mengikuti kebijakan satuan pendidikan dan KKTP yang Anda tetapkan.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300">
            <span>Ambang KKTP (%):</span>
            <input
              type="number"
              min={1}
              max={100}
              value={kktpThreshold}
              onChange={(e) => onChangeKktp(Number(e.target.value) || 75)}
              className="font-mono-tabular min-h-9 w-16 rounded-lg border border-slate-200 bg-white px-2 text-center text-xs dark:border-slate-700 dark:bg-[#0F172A]"
            />
          </label>

          <button
            type="button"
            onClick={handleLoadSampleResponses}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-800 hover:bg-green-100 dark:border-green-800 dark:bg-green-950/60 dark:text-green-300"
          >
            <Users className="h-3.5 w-3.5" aria-hidden="true" />
            Muat 6 Sampel Respons Siswa
          </button>
        </div>
      </div>

      {/* Add Student Form + Summary */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <form
          onSubmit={handleAddStudent}
          className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-4 lg:col-span-2 dark:border-slate-700 dark:bg-[#1E293B]"
        >
          <input
            type="text"
            aria-label="Nama peserta didik baru"
            value={newStudentName}
            onChange={(e) => setNewStudentName(e.target.value)}
            placeholder="Masukkan nama peserta didik..."
            className="min-h-10 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs text-slate-900 focus:border-green-600 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-[#0F172A] dark:text-slate-100"
          />
          <button
            type="submit"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-green-700 px-4 py-2 text-xs font-semibold text-white hover:bg-green-800 dark:bg-green-600"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Tambah Siswa
          </button>
        </form>

        <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-5 py-4 text-xs dark:border-slate-700 dark:bg-[#1E293B]">
          <div>
            <span className="text-slate-500 dark:text-slate-400">Rata-rata Kelas</span>
            <p className="font-mono-tabular mt-0.5 text-lg font-bold text-slate-900 dark:text-white">
              {avgScore}%
            </p>
          </div>
          <div className="text-right">
            <span className="text-slate-500 dark:text-slate-400">Tuntas KKTP</span>
            <p className="font-mono-tabular mt-0.5 text-lg font-bold text-green-700 dark:text-green-400">
              {tuntasCount}/{evaluations.length}
            </p>
          </div>
        </div>
      </div>

      {/* Student Grading Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-[#1E293B]">
        {responses.length === 0 ? (
          <div className="px-6 py-12 text-center text-xs text-slate-600 dark:text-slate-400">
            Belum ada data jawaban peserta didik. Tambahkan siswa di atas atau klik{' '}
            <span className="font-semibold">Muat 6 Sampel Respons Siswa</span> untuk menguji
            perhitungan nilai, rekomendasi remedial/pengayaan, dan analisis butir soal.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-[#0F172A] dark:text-slate-300">
                  <th className="px-3 py-2.5 font-semibold">Nama Peserta Didik</th>
                  {questionSet.questions.map((q, idx) => (
                    <th key={q.id} className="px-2 py-2.5 text-center font-semibold">
                      S{idx + 1} ({q.type === 'Pilihan Ganda' ? 'Opsi' : `Skor/${formatScore(q.scoreWeight)}`})
                    </th>
                  ))}
                  <th className="px-3 py-2.5 text-right font-semibold">Nilai</th>
                  <th className="px-3 py-2.5 font-semibold">Status KKTP & Tindak Lanjut</th>
                  <th className="px-2 py-2.5 text-right font-semibold">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {responses.map((student, sIdx) => {
                  const evalResult = evaluations[sIdx];
                  return (
                    <tr key={student.id}>
                      <td className="px-3 py-2.5 font-medium text-slate-900 dark:text-slate-100">
                        {student.studentName}
                      </td>
                      {questionSet.questions.map((q) => (
                        <td key={q.id} className="px-2 py-2 text-center">
                          {q.type === 'Pilihan Ganda' ? (
                            <input
                              type="text"
                              maxLength={2}
                              aria-label={`Jawaban ${student.studentName} soal ${q.number}`}
                              value={student.answers[q.id] ?? ''}
                              onChange={(e) => {
                                const updated = responses.map((r) =>
                                  r.id === student.id
                                    ? {
                                        ...r,
                                        answers: { ...r.answers, [q.id]: e.target.value.toUpperCase() },
                                      }
                                    : r
                                );
                                onUpdateResponses(updated);
                              }}
                              className="font-mono-tabular h-8 w-11 rounded border border-slate-200 bg-white text-center text-xs uppercase dark:border-slate-700 dark:bg-[#0F172A]"
                            />
                          ) : (
                            <input
                              type="number"
                              min={0}
                              max={q.scoreWeight ?? 20}
                              aria-label={`Skor ${student.studentName} soal ${q.number}`}
                              value={student.manualScores[q.id] ?? 0}
                              onChange={(e) => {
                                const updated = responses.map((r) =>
                                  r.id === student.id
                                    ? {
                                        ...r,
                                        manualScores: {
                                          ...r.manualScores,
                                          [q.id]: Number(e.target.value) || 0,
                                        },
                                      }
                                    : r
                                );
                                onUpdateResponses(updated);
                              }}
                              className="font-mono-tabular h-8 w-14 rounded border border-slate-200 bg-white text-center text-xs dark:border-slate-700 dark:bg-[#0F172A]"
                            />
                          )}
                        </td>
                      ))}
                      <td className="font-mono-tabular px-3 py-2.5 text-right font-semibold">
                        {evalResult?.percentageScore ?? 0}%
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`font-semibold ${
                            evalResult?.status === 'Pengayaan'
                              ? 'text-green-700 dark:text-green-400'
                              : evalResult?.status === 'Tuntas'
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : 'text-amber-700 dark:text-amber-400'
                          }`}
                        >
                          {evalResult?.status}
                        </span>
                        <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                          {evalResult?.recommendation}
                        </p>
                      </td>
                      <td className="px-2 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateResponses(responses.filter((r) => r.id !== student.id))
                          }
                          aria-label={`Hapus data ${student.studentName}`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Item Analysis Section */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-[#1E293B]">
        <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
          Analisis Butir Soal (Tingkat Kesukaran & Daya Pembeda)
        </h2>
        {!itemAnalysis.hasSufficientData ? (
          <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
            Statistik butir soal hanya dihitung apabila tersedia minimal{' '}
            <span className="font-mono-tabular font-semibold">{itemAnalysis.minimumRequired}</span>{' '}
            data respons peserta didik (saat ini: {responses.length}) agar analisis tingkat
            kesukaran dan daya pembeda tetap valid.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-400">
                  <th className="py-2 pr-3">No. Soal</th>
                  <th className="py-2 pr-3 text-right">Indeks Kesukaran (P)</th>
                  <th className="py-2 pr-3">Kategori Kesukaran</th>
                  <th className="py-2 pr-3 text-right">Daya Pembeda (D)</th>
                  <th className="py-2 pr-3">Kelayakan Butir</th>
                  <th className="py-2">Sebaran Jawaban / Pengecoh</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {itemAnalysis.metrics.map((m) => (
                  <tr key={m.questionId}>
                    <td className="font-mono-tabular py-2.5 pr-3 font-semibold">
                      Soal {m.questionNumber}
                    </td>
                    <td className="font-mono-tabular py-2.5 pr-3 text-right">
                      {m.correctRateP?.toFixed(2)}
                    </td>
                    <td className="py-2.5 pr-3">{m.difficultyCategory}</td>
                    <td className="font-mono-tabular py-2.5 pr-3 text-right">
                      {m.discriminationD?.toFixed(2)}
                    </td>
                    <td className="py-2.5 pr-3">{m.discriminationCategory}</td>
                    <td className="font-mono-tabular py-2.5 text-slate-500 dark:text-slate-400">
                      {m.distractorSummary}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
