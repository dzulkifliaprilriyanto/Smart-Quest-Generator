import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Calculator,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Save,
} from 'lucide-react';
import type { DifficultyLevel, QuestionItem } from '../types/question';
import {
  analyzeScoringStatus,
  formatScore,
  getDefaultScoringCriteria,
  getDifficultyFactor,
  round2,
  scaleRubricToWeight,
} from '../utils/scoring';

interface ScoringDashboardProps {
  questions: QuestionItem[];
  onRecalculate: () => void;
  onResetAuto: () => void;
  onSaveChanges: (nextQuestions: QuestionItem[]) => void;
  onUpdateDifficulty: (questionId: string, difficulty: DifficultyLevel) => void;
}

const DIFFICULTIES: DifficultyLevel[] = ['Mudah', 'Sedang', 'Sulit', 'HOTS'];

export function ScoringDashboard({
  questions,
  onRecalculate,
  onResetAuto,
  onSaveChanges,
  onUpdateDifficulty,
}: ScoringDashboardProps) {
  const [expanded, setExpanded] = useState(false);
  const [showDistributionPreview, setShowDistributionPreview] = useState(true);
  const [draftWeights, setDraftWeights] = useState<Record<string, string>>({});
  const [draftCriteria, setDraftCriteria] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const weightsMap: Record<string, string> = {};
    const critMap: Record<string, string> = {};
    questions.forEach((q) => {
      weightsMap[q.id] = formatScore(q.scoreWeight);
      critMap[q.id] = q.scoringCriteria || getDefaultScoringCriteria(q);
    });
    setDraftWeights(weightsMap);
    setDraftCriteria(critMap);
    setDirty(false);
  }, [questions]);

  const workingQuestions = useMemo(() => {
    if (!dirty) return questions;
    return questions.map((q) => {
      const parsedW = round2(Math.max(0, Number(draftWeights[q.id]) || 0));
      return {
        ...q,
        scoreWeight: parsedW,
        scoringCriteria: draftCriteria[q.id] ?? q.scoringCriteria,
        rubric: scaleRubricToWeight(q.rubric, parsedW),
      };
    });
  }, [questions, draftWeights, draftCriteria, dirty]);

  const summary = useMemo(
    () => analyzeScoringStatus(workingQuestions),
    [workingQuestions]
  );

  const handleSaveManual = () => {
    onSaveChanges(workingQuestions);
    setDirty(false);
  };

  const statusBadgeClass =
    summary.status === 'VALID'
      ? 'border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950/60 dark:text-green-300'
      : summary.status === 'NEEDS RECALCULATION'
        ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300'
        : 'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-300';

  return (
    <div
      data-testid="scoring-dashboard"
      className="no-print rounded-xl border border-slate-200 bg-white p-4 text-xs dark:border-slate-700 dark:bg-[#1E293B]"
    >
      {/* Top Bar Summary */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 font-semibold text-slate-900 dark:text-white">
            <Calculator className="h-4 w-4 text-green-700 dark:text-green-400" aria-hidden="true" />
            <span>Dashboard Nilai Otomatis (Skala 100.00)</span>
          </div>

          <span
            data-testid="scoring-status-badge"
            className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold ${statusBadgeClass}`}
          >
            {summary.status === 'VALID' ? (
              <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
            ) : (
              <AlertTriangle className="h-3 w-3" aria-hidden="true" />
            )}
            <span>
              {summary.status} · Total: {formatScore(summary.totalWeight)}
            </span>
          </span>

          <span className="font-mono-tabular text-[11px] text-slate-600 dark:text-slate-400">
            Mudah: {summary.easyCount} (×1) · Sedang: {summary.mediumCount} (×2) · Sulit/HOTS:{' '}
            {summary.hardCount} (×3) · Faktor: {summary.totalFactor}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={onRecalculate}
            data-testid="btn-recalc-weights"
            className="inline-flex min-h-8 items-center gap-1 rounded-md border border-green-300 bg-green-50 px-2.5 py-1 text-[11px] font-semibold text-green-800 hover:bg-green-100 dark:border-green-800 dark:bg-green-950/60 dark:text-green-300"
          >
            <Calculator className="h-3 w-3" aria-hidden="true" />
            Hitung Ulang Bobot
          </button>

          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            data-testid="btn-toggle-scoring-dashboard"
            className="inline-flex min-h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-[#0F172A] dark:text-slate-200"
          >
            <span>{expanded ? 'Tutup Detail Nilai' : 'Atur Bobot & Kriteria'}</span>
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-4 space-y-4 border-t border-slate-100 pt-4 dark:border-slate-700">
          {/* Metric Cards + Controls */}
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-6">
            <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-2.5 dark:border-slate-700 dark:bg-[#0F172A]">
              <p className="text-[10px] text-slate-500 dark:text-slate-400">Total Soal</p>
              <p className="font-mono-tabular mt-0.5 text-sm font-bold text-slate-900 dark:text-white">
                {summary.totalQuestions} Butir
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-2.5 dark:border-slate-700 dark:bg-[#0F172A]">
              <p className="text-[10px] text-slate-500 dark:text-slate-400">Mudah (Faktor 1)</p>
              <p className="font-mono-tabular mt-0.5 text-sm font-bold text-green-700 dark:text-green-400">
                {summary.easyCount}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-2.5 dark:border-slate-700 dark:bg-[#0F172A]">
              <p className="text-[10px] text-slate-500 dark:text-slate-400">Sedang (Faktor 2)</p>
              <p className="font-mono-tabular mt-0.5 text-sm font-bold text-emerald-700 dark:text-emerald-400">
                {summary.mediumCount}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-2.5 dark:border-slate-700 dark:bg-[#0F172A]">
              <p className="text-[10px] text-slate-500 dark:text-slate-400">Sulit/HOTS (Faktor 3)</p>
              <p className="font-mono-tabular mt-0.5 text-sm font-bold text-amber-700 dark:text-amber-400">
                {summary.hardCount}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-2.5 dark:border-slate-700 dark:bg-[#0F172A]">
              <p className="text-[10px] text-slate-500 dark:text-slate-400">Total Faktor</p>
              <p className="font-mono-tabular mt-0.5 text-sm font-bold text-slate-900 dark:text-white">
                {summary.totalFactor}
              </p>
            </div>
            <div className="rounded-lg border border-green-200 bg-green-50/70 p-2.5 dark:border-green-900/60 dark:bg-green-950/30">
              <p className="text-[10px] text-green-800 dark:text-green-300">Total Nilai Paket</p>
              <p
                data-testid="scoring-total-value"
                className="font-mono-tabular mt-0.5 text-sm font-bold text-green-800 dark:text-green-300"
              >
                {formatScore(summary.totalWeight)}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] text-slate-600 dark:text-slate-300">{summary.statusReason}</p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowDistributionPreview((prev) => !prev)}
                className="inline-flex min-h-8 items-center gap-1 rounded border border-slate-200 bg-white px-2.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-[#0F172A] dark:text-slate-200"
              >
                <BarChart3 className="h-3 w-3" />
                Pratinjau Distribusi Nilai
              </button>
              <button
                type="button"
                onClick={() => {
                  onResetAuto();
                  setDirty(false);
                }}
                data-testid="btn-reset-weights-auto"
                className="inline-flex min-h-8 items-center gap-1 rounded border border-slate-200 bg-white px-2.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-[#0F172A] dark:text-slate-200"
              >
                <RotateCcw className="h-3 w-3" />
                Reset Bobot Otomatis
              </button>
              <button
                type="button"
                onClick={handleSaveManual}
                data-testid="btn-save-scoring-settings"
                className="inline-flex min-h-8 items-center gap-1 rounded bg-green-700 px-3 text-[11px] font-semibold text-white hover:bg-green-800 dark:bg-green-600"
              >
                <Save className="h-3 w-3" />
                Simpan Pengaturan
              </button>
            </div>
          </div>

          {showDistributionPreview && workingQuestions.length > 0 && (
            <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-[#0F172A]">
              <p className="mb-2 text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                Proporsi Bobot per Nomor Soal (Skala 100.00)
              </p>
              <div className="flex h-3 w-full overflow-hidden rounded bg-slate-200 dark:bg-slate-800">
                {workingQuestions.map((q) => {
                  const pct = Math.max(0, Number(q.scoreWeight) || 0);
                  const bg =
                    q.difficulty === 'Mudah'
                      ? 'bg-green-500'
                      : q.difficulty === 'Sedang'
                        ? 'bg-emerald-600'
                        : q.difficulty === 'Sulit'
                          ? 'bg-amber-500'
                          : 'bg-rose-500';
                  return (
                    <div
                      key={q.id}
                      title={`Soal ${q.number} (${q.difficulty}): ${formatScore(q.scoreWeight)}`}
                      className={`${bg} border-r border-white/60 last:border-r-0`}
                      style={{ width: `${pct}%` }}
                    />
                  );
                })}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-4 text-[10px] text-slate-600 dark:text-slate-400">
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-xs bg-green-500" /> Mudah (×1)
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-xs bg-emerald-600" /> Sedang (×2)
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-xs bg-amber-500" /> Sulit (×3)
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-xs bg-rose-500" /> HOTS (×3)
                </span>
              </div>
            </div>
          )}

          {/* Per-question Weight Table */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-[11px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-[#0F172A] dark:text-slate-300">
                  <th className="px-2.5 py-2 font-semibold">No</th>
                  <th className="px-2.5 py-2 font-semibold">Bentuk Soal</th>
                  <th className="px-2.5 py-2 font-semibold">Kesulitan</th>
                  <th className="px-2.5 py-2 text-center font-semibold">Faktor</th>
                  <th className="px-2.5 py-2 font-semibold">Bobot Nilai</th>
                  <th className="px-2.5 py-2 font-semibold">Kriteria Penskoran</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {workingQuestions.map((q) => {
                  const factor = getDifficultyFactor(q.difficulty);
                  return (
                    <tr key={q.id}>
                      <td className="font-mono-tabular px-2.5 py-2 font-semibold">#{q.number}</td>
                      <td className="px-2.5 py-2 whitespace-nowrap">
                        {q.questionSubType || q.type}
                      </td>
                      <td className="px-2.5 py-2">
                        <select
                          aria-label={`Kesulitan soal ${q.number}`}
                          value={q.difficulty}
                          onChange={(e) =>
                            onUpdateDifficulty(q.id, e.target.value as DifficultyLevel)
                          }
                          className="min-h-7 rounded border border-slate-200 bg-white px-2 text-[11px] dark:border-slate-700 dark:bg-[#0F172A]"
                        >
                          {DIFFICULTIES.map((d) => (
                            <option key={d} value={d}>
                              {d}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="font-mono-tabular px-2.5 py-2 text-center font-semibold text-green-700 dark:text-green-400">
                        ×{factor}
                      </td>
                      <td className="px-2.5 py-2">
                        <input
                          type="number"
                          step="0.01"
                          min={0}
                          max={100}
                          aria-label={`Bobot nilai soal ${q.number}`}
                          value={draftWeights[q.id] ?? formatScore(q.scoreWeight)}
                          onChange={(e) => {
                            setDraftWeights((prev) => ({ ...prev, [q.id]: e.target.value }));
                            setDirty(true);
                          }}
                          className="font-mono-tabular min-h-7 w-20 rounded border border-slate-200 bg-white px-2 text-right text-[11px] dark:border-slate-700 dark:bg-[#0F172A]"
                        />
                      </td>
                      <td className="min-w-[240px] px-2.5 py-2">
                        <input
                          type="text"
                          aria-label={`Kriteria skor soal ${q.number}`}
                          value={draftCriteria[q.id] ?? ''}
                          onChange={(e) => {
                            setDraftCriteria((prev) => ({ ...prev, [q.id]: e.target.value }));
                            setDirty(true);
                          }}
                          className="min-h-7 w-full rounded border border-slate-200 bg-white px-2 text-[11px] dark:border-slate-700 dark:bg-[#0F172A]"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
