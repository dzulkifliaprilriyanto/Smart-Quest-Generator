import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  DocumentExportConfig,
  DocumentIdentity,
  EducationLevel,
  ExamCardConfig,
  ExamCardParticipant,
  GeneratorParams,
  KopTemplate,
  LogoFitMode,
  QuestionItem,
  QuestionSet,
  ReferenceAttachment,
  StoredLogoAsset,
  StudentResponseEntry,
  SubjectCatalogMap,
  ThemeMode,
  ValidationErrors,
} from '../types/question';
import {
  DEFAULT_GENERATOR_PARAMS,
  DEFAULT_SUBJECT_CATALOG,
  SAMPLE_QUESTION_SETS,
  getDefaultGradeForLevel,
  getPhaseForGrade,
  getSubjectsForLevel,
  normalizeEducationLevel,
} from '../utils/curriculum';
import {
  sanitizeDocIdentity,
  sanitizeExportConfig,
  sanitizeGeneratorParams,
  sanitizeQuestionSet,
} from '../utils/sanitizer';
import { validateGeneratorParams } from '../utils/validation';
import { MAX_QUESTIONS_LIMIT, computeQuestionSnapshotHash } from '../utils/imageQuota';
import { autoRepairQuestionSet } from '../utils/masterValidator';
import { calculateIntelligentScores, getDefaultScoringCriteria } from '../utils/scoring';
import { cloneKopTemplate, createStarterKopTemplates } from '../utils/kopTemplates';
import { createDefaultExamCardConfig } from '../utils/examCard';
import {
  scrubLegacyExamCardConfigDefaults,
  scrubLegacyKopTemplatesDefaults,
  scrubLegacyParamsDefaults,
} from '../utils/logoManager';
import {
  clearAllHistory,
  deleteHistoryItem,
  deleteLogoAsset,
  loadActiveKopId,
  loadAllLogos,
  loadDraft,
  loadExamCardConfig,
  loadExamCardParticipants,
  loadHistory,
  loadKopTemplates,
  loadPrimaryLogoId,
  loadStudentResponses,
  loadSubjectCatalog,
  loadThemePreference,
  saveActiveKopId,
  saveDraft,
  saveExamCardConfig,
  saveExamCardParticipants,
  saveKopTemplates,
  saveLogoAsset,
  savePrimaryLogoId,
  saveStudentResponses,
  saveSubjectCatalog,
  saveThemePreference,
  saveToHistory,
} from '../utils/storage';

export type StudioTab =
  | 'studio'
  | 'kop'
  | 'exam-cards'
  | 'administration'
  | 'analytics'
  | 'history'
  | 'guide';

function normalizeThemeMode(val: unknown): ThemeMode {
  if (val === 'dark' || val === 'system' || val === 'light') return val;
  return 'light';
}

export function useSoalStudio() {
  const [activeTab, setActiveTab] = useState<StudioTab>('studio');
  const [theme, setTheme] = useState<ThemeMode>('light');
  const [params, setParams] = useState<GeneratorParams>(DEFAULT_GENERATOR_PARAMS);
  const [activeSet, setActiveSet] = useState<QuestionSet | null>(null);
  const [history, setHistory] = useState<QuestionSet[]>([]);
  const [subjectCatalog, setSubjectCatalog] = useState<SubjectCatalogMap>(
    DEFAULT_SUBJECT_CATALOG
  );
  const [attachments, setAttachments] = useState<ReferenceAttachment[]>([]);
  const [studentResponses, setStudentResponses] = useState<StudentResponseEntry[]>([]);
  const [kktpThreshold, setKktpThreshold] = useState<number>(75);

  // Kop Dokumen state
  const [kopTemplates, setKopTemplates] = useState<KopTemplate[]>(() =>
    createStarterKopTemplates()
  );
  const [activeKopId, setActiveKopId] = useState<string>('kop-starter-1');

  // Exam Card Generator state
  const [examCardParticipants, setExamCardParticipants] = useState<ExamCardParticipant[]>([]);
  const [examCardConfig, setExamCardConfig] = useState<ExamCardConfig>(() =>
    createDefaultExamCardConfig(DEFAULT_GENERATOR_PARAMS.docIdentity)
  );

  // Persistent Logo Library state
  const [logos, setLogos] = useState<StoredLogoAsset[]>([]);
  const [primaryLogoId, setPrimaryLogoId] = useState<string | null>(null);

  const [fieldErrors, setFieldErrors] = useState<ValidationErrors>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);

  const autosaveTimerRef = useRef<number | null>(null);
  const paramsRef = useRef<GeneratorParams>(params);
  paramsRef.current = params;
  const activeSetRef = useRef<QuestionSet | null>(activeSet);
  activeSetRef.current = activeSet;
  const kopTemplatesRef = useRef<KopTemplate[]>(kopTemplates);
  kopTemplatesRef.current = kopTemplates;

  const activeKopTemplate = useMemo(
    () =>
      kopTemplates.find((k) => k.id === activeKopId) ??
      kopTemplates.find((k) => k.isDefault) ??
      kopTemplates[0],
    [kopTemplates, activeKopId]
  );

  useEffect(() => {
    const root = document.documentElement;
    const applyDark = (isDark: boolean) => {
      if (isDark) {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    };

    if (theme === 'dark') {
      applyDark(true);
      return;
    }
    if (theme === 'light') {
      applyDark(false);
      return;
    }

    const mq =
      typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-color-scheme: dark)')
        : null;
    applyDark(mq ? mq.matches : false);
    if (!mq) return;

    const listener = (ev: MediaQueryListEvent) => applyDark(ev.matches);
    mq.addEventListener('change', listener);
    return () => mq.removeEventListener('change', listener);
  }, [theme]);

  useEffect(() => {
    let mounted = true;
    async function hydrate() {
      const [
        savedTheme,
        savedDraft,
        savedHistory,
        savedCatalog,
        savedKops,
        savedActiveKop,
        savedParticipants,
        savedCardCfg,
        savedLogos,
        savedPrimaryLogo,
      ] = await Promise.all([
        loadThemePreference(),
        loadDraft(),
        loadHistory(),
        loadSubjectCatalog(),
        loadKopTemplates(),
        loadActiveKopId(),
        loadExamCardParticipants(),
        loadExamCardConfig(),
        loadAllLogos(),
        loadPrimaryLogoId(),
      ]);

      if (!mounted) return;

      if (savedTheme) setTheme(normalizeThemeMode(savedTheme));
      if (savedCatalog) setSubjectCatalog(savedCatalog);
      if (savedLogos) setLogos(savedLogos);
      if (savedPrimaryLogo) setPrimaryLogoId(savedPrimaryLogo);

      if (savedKops && savedKops.length > 0) {
        const { cleaned: cleanedKops, changed: kopsChanged } =
          scrubLegacyKopTemplatesDefaults(savedKops);
        setKopTemplates(cleanedKops);
        if (kopsChanged) {
          saveKopTemplates(cleanedKops);
        }
        const resolvedId =
          savedActiveKop && cleanedKops.some((k) => k.id === savedActiveKop)
            ? savedActiveKop
            : cleanedKops.find((k) => k.isDefault)?.id ?? cleanedKops[0]!.id;
        setActiveKopId(resolvedId);
      } else {
        const starters = createStarterKopTemplates();
        setKopTemplates(starters);
        setActiveKopId(starters[0]!.id);
        saveKopTemplates(starters);
        saveActiveKopId(starters[0]!.id);
      }

      if (savedParticipants && savedParticipants.length > 0) {
        setExamCardParticipants(savedParticipants);
      }
      if (savedCardCfg) {
        const { cleaned: cleanedCardCfg, changed: cardChanged } =
          scrubLegacyExamCardConfigDefaults(savedCardCfg);
        setExamCardConfig((prev) => ({ ...prev, ...cleanedCardCfg }));
        if (cardChanged) {
          saveExamCardConfig({ ...createDefaultExamCardConfig(), ...cleanedCardCfg });
        }
      }

      if (savedDraft) {
        const sanitizedDraftParams = sanitizeGeneratorParams(savedDraft.params);
        const { cleaned: cleanedParams, changed: paramsChanged } =
          scrubLegacyParamsDefaults(sanitizedDraftParams);
        setParams(cleanedParams);
        let cleanActiveSet: QuestionSet | null = null;
        if (savedDraft.activeSet) {
          cleanActiveSet = sanitizeQuestionSet(savedDraft.activeSet);
          setActiveSet(cleanActiveSet);
          const resp = await loadStudentResponses(cleanActiveSet.id);
          if (mounted) setStudentResponses(resp);
        }
        if (paramsChanged) {
          saveDraft(cleanedParams, cleanActiveSet);
        }
      }
      setHistory(savedHistory.map(sanitizeQuestionSet));
      setIsHydrated(true);
    }
    hydrate();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current);
    }
    autosaveTimerRef.current = window.setTimeout(() => {
      saveDraft(params, activeSet);
    }, 250);

    return () => {
      if (autosaveTimerRef.current !== null) {
        window.clearTimeout(autosaveTimerRef.current);
      }
    };
  }, [params, activeSet, isHydrated]);

  const showNotice = useCallback((message: string) => {
    setStatusNotice(message);
    window.setTimeout(() => {
      setStatusNotice((prev) => (prev === message ? null : prev));
    }, 3400);
  }, []);

  const setThemeMode = useCallback((next: ThemeMode) => {
    const normalized = normalizeThemeMode(next);
    setTheme(normalized);
    saveThemePreference(normalized);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next: ThemeMode = prev === 'light' ? 'dark' : prev === 'dark' ? 'system' : 'light';
      saveThemePreference(next);
      return next;
    });
  }, []);

  const syncActiveSetParams = useCallback((updater: (p: GeneratorParams) => GeneratorParams) => {
    setActiveSet((prevSet) => {
      if (!prevSet) return null;
      const updated = sanitizeQuestionSet({
        ...prevSet,
        params: updater(prevSet.params),
      });
      saveToHistory(updated);
      setHistory((hist) => hist.map((item) => (item.id === updated.id ? updated : item)));
      return updated;
    });
  }, []);

  const updateParam = useCallback(
    <K extends keyof GeneratorParams>(key: K, value: GeneratorParams[K]) => {
      setParams((prev) => {
        const next = { ...prev, [key]: value };
        if (key === 'grade') {
          next.learningPlan = {
            ...prev.learningPlan,
            phase: getPhaseForGrade(prev.educationLevel, String(value)),
          };
        }
        if (key === 'schoolName') {
          next.docIdentity = {
            ...prev.docIdentity,
            schoolName: String(value),
          };
        }
        return next;
      });
      if (
        key === 'docIdentity' ||
        key === 'exportConfig' ||
        key === 'schoolName' ||
        key === 'includeAnswerKey'
      ) {
        syncActiveSetParams((prevSetParams) => {
          const updated = { ...prevSetParams, [key]: value };
          if (key === 'schoolName') {
            updated.docIdentity = {
              ...prevSetParams.docIdentity,
              schoolName: String(value),
            };
          }
          return updated;
        });
      }
      setFieldErrors((prev) => {
        if (!prev[key as keyof ValidationErrors]) return prev;
        const copy = { ...prev };
        delete copy[key as keyof ValidationErrors];
        return copy;
      });
      setApiError(null);
    },
    [syncActiveSetParams]
  );

  const updateDocIdentity = useCallback(
    (patch: Partial<DocumentIdentity>) => {
      setParams((prev) => {
        const nextDoc = sanitizeDocIdentity(
          { ...(prev.docIdentity ?? {}), ...patch },
          patch.schoolName !== undefined ? patch.schoolName : prev.schoolName ?? ''
        );
        return {
          ...prev,
          schoolName: patch.schoolName !== undefined ? nextDoc.schoolName : prev.schoolName,
          docIdentity: nextDoc,
        };
      });
      syncActiveSetParams((prevSetParams) => {
        const nextDoc = sanitizeDocIdentity(
          { ...(prevSetParams.docIdentity ?? {}), ...patch },
          patch.schoolName !== undefined ? patch.schoolName : prevSetParams.schoolName ?? ''
        );
        return {
          ...prevSetParams,
          schoolName:
            patch.schoolName !== undefined ? nextDoc.schoolName : prevSetParams.schoolName,
          docIdentity: nextDoc,
        };
      });
    },
    [syncActiveSetParams]
  );

  const updateExportConfig = useCallback(
    (patch: Partial<DocumentExportConfig>) => {
      setParams((prev) => {
        const prevCfg = prev.exportConfig;
        const nextCfg = sanitizeExportConfig(
          {
            ...(prevCfg ?? {}),
            ...patch,
            scoreBox: patch.scoreBox
              ? { ...(prevCfg?.scoreBox ?? {}), ...patch.scoreBox }
              : prevCfg?.scoreBox,
          },
          prev.includeAnswerKey
        );
        return { ...prev, exportConfig: nextCfg };
      });
      syncActiveSetParams((prevSetParams) => {
        const prevCfg = prevSetParams.exportConfig;
        const nextCfg = sanitizeExportConfig(
          {
            ...(prevCfg ?? {}),
            ...patch,
            scoreBox: patch.scoreBox
              ? { ...(prevCfg?.scoreBox ?? {}), ...patch.scoreBox }
              : prevCfg?.scoreBox,
          },
          prevSetParams.includeAnswerKey
        );
        return { ...prevSetParams, exportConfig: nextCfg };
      });
    },
    [syncActiveSetParams]
  );

  const changeEducationLevel = useCallback(
    (level: EducationLevel) => {
      const nextGrade = getDefaultGradeForLevel(level);
      const nextPhase = getPhaseForGrade(level, nextGrade);
      const nextSubjects = getSubjectsForLevel(level, subjectCatalog);
      setParams((prev) => ({
        ...prev,
        educationLevel: level,
        grade: nextGrade,
        subject: nextSubjects.includes(prev.subject) ? prev.subject : nextSubjects[0] ?? '',
        learningPlan: {
          ...prev.learningPlan,
          phase: nextPhase,
        },
      }));
      setFieldErrors({});
      setApiError(null);
    },
    [subjectCatalog]
  );

  const addSubjectToCatalog = useCallback(
    async (level: EducationLevel, subjectName: string) => {
      const cleanName = subjectName.trim();
      if (!cleanName) return;
      const key = normalizeEducationLevel(level);
      setSubjectCatalog((prev) => {
        const current = prev[key] ?? [];
        if (current.includes(cleanName)) return prev;
        const updated = { ...prev, [key]: [...current, cleanName] };
        saveSubjectCatalog(updated);
        return updated;
      });
      showNotice(`Mata pelajaran "${cleanName}" ditambahkan ke katalog ${key}.`);
    },
    [showNotice]
  );

  const removeSubjectFromCatalog = useCallback(
    async (level: EducationLevel, subjectName: string) => {
      const key = normalizeEducationLevel(level);
      setSubjectCatalog((prev) => {
        const current = prev[key] ?? [];
        if (current.length <= 1) return prev;
        const updated = {
          ...prev,
          [key]: current.filter((s) => s !== subjectName),
        };
        saveSubjectCatalog(updated);
        return updated;
      });
      showNotice(`Mata pelajaran "${subjectName}" dihapus dari katalog ${key}.`);
    },
    [showNotice]
  );

  const resetCatalogToDefault = useCallback(async () => {
    setSubjectCatalog(DEFAULT_SUBJECT_CATALOG);
    await saveSubjectCatalog(DEFAULT_SUBJECT_CATALOG);
    showNotice('Katalog mata pelajaran dikembalikan ke pengaturan awal nasional.');
  }, [showNotice]);

  const resetForm = useCallback(() => {
    setParams({
      ...DEFAULT_GENERATOR_PARAMS,
      topic: '',
      additionalNotes: '',
    });
    setAttachments([]);
    setFieldErrors({});
    setApiError(null);
    showNotice('Parameter formulir telah diatur ulang.');
  }, [showNotice]);

  const startNewPackage = useCallback(() => {
    setActiveSet(null);
    setStudentResponses([]);
    setParams(DEFAULT_GENERATOR_PARAMS);
    setAttachments([]);
    setFieldErrors({});
    setApiError(null);
    setActiveTab('studio');
    showNotice('Siap membuat paket asesmen baru.');
  }, [showNotice]);

  const generateQuestions = useCallback(async () => {
    const rawValidation = validateGeneratorParams(params);
    if (!rawValidation.isValid) {
      setFieldErrors(rawValidation.errors);
      setApiError('Periksa kembali kolom yang ditandai sebelum melanjutkan.');
      return false;
    }
    const cleanParams = sanitizeGeneratorParams(params);
    const validation = validateGeneratorParams(cleanParams);
    if (!validation.isValid) {
      setFieldErrors(validation.errors);
      setApiError('Periksa kembali kolom yang ditandai sebelum melanjutkan.');
      return false;
    }

    setFieldErrors({});
    setApiError(null);
    setIsGenerating(true);

    try {
      const res = await fetch('/api/generate-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...cleanParams,
          attachments,
        }),
      });

      const data = (await res.json()) as {
        questionSet?: QuestionSet;
        error?: string;
        fieldErrors?: ValidationErrors;
      };

      if (!res.ok || !data.questionSet) {
        if (data.fieldErrors) {
          setFieldErrors(data.fieldErrors);
        }
        throw new Error(data.error || 'Gagal membuat paket soal otomatis.');
      }

      const rawClean = sanitizeQuestionSet(data.questionSet);
      const cleanSet: QuestionSet = {
        ...rawClean,
        questions: calculateIntelligentScores(rawClean.questions),
      };
      setActiveSet(cleanSet);
      setStudentResponses([]);
      await saveToHistory(cleanSet);
      setHistory((prev) => [cleanSet, ...prev.filter((item) => item.id !== cleanSet.id)]);
      showNotice(
        `Berhasil menyusun ${cleanSet.questions.length} butir soal (total bobot 100.00) beserta kisi-kisi.`
      );
      return true;
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Terjadi gangguan jaringan saat menghubungi server.';
      setApiError(message);
      return false;
    } finally {
      setIsGenerating(false);
    }
  }, [params, attachments, showNotice]);

  const loadSampleSet = useCallback(
    async (sampleId: string) => {
      const found = SAMPLE_QUESTION_SETS.find((s) => s.id === sampleId);
      if (!found) return;

      const clonedRaw = sanitizeQuestionSet({
        ...found,
        id: `${found.id}-${Date.now()}`,
        createdAt: new Date().toISOString(),
      });
      const cloned: QuestionSet = {
        ...clonedRaw,
        questions: calculateIntelligentScores(clonedRaw.questions),
      };

      setParams(cloned.params);
      setActiveSet(cloned);
      setStudentResponses([]);
      setFieldErrors({});
      setApiError(null);
      await saveToHistory(cloned);
      setHistory((prev) => [cloned, ...prev.filter((item) => item.id !== cloned.id)]);
      setActiveTab('studio');
      showNotice(`Contoh paket "${cloned.title}" dimuat ke pratinjau.`);
    },
    [showNotice]
  );

  const loadFromHistory = useCallback(
    async (entry: QuestionSet) => {
      const clean = sanitizeQuestionSet(entry);
      setParams(clean.params);
      setActiveSet(clean);
      const resp = await loadStudentResponses(clean.id);
      setStudentResponses(resp);
      setFieldErrors({});
      setApiError(null);
      setActiveTab('studio');
      showNotice(`Paket soal "${clean.title}" dipulihkan dari riwayat lokal.`);
    },
    [showNotice]
  );

  const removeFromHistory = useCallback(
    async (id: string) => {
      await deleteHistoryItem(id);
      setHistory((prev) => prev.filter((item) => item.id !== id));
      showNotice('Entri riwayat dihapus.');
    },
    [showNotice]
  );

  const wipeHistory = useCallback(async () => {
    await clearAllHistory();
    setHistory([]);
    showNotice('Seluruh riwayat aktivitas lokal telah dibersihkan.');
  }, [showNotice]);

  const syncQuestionNumbering = (list: QuestionItem[]): QuestionItem[] =>
    list.map((q, idx) => {
      const nextNum = idx + 1;
      if (!q.supportingImage) return { ...q, number: nextNum };
      const updatedCaption = q.supportingImage.caption.replace(
        /^(Gambar pendukung|Ilustrasi|Visual) Soal \d+$/i,
        (_, prefix) => `${prefix} Soal ${nextNum}`
      );
      return {
        ...q,
        number: nextNum,
        supportingImage: {
          ...q.supportingImage,
          questionId: q.id,
          caption: updatedCaption,
        },
      };
    });

  const removeQuestionItem = useCallback(
    (questionId: string) => {
      setActiveSet((prev) => {
        if (!prev) return null;
        const remaining = syncQuestionNumbering(
          prev.questions.filter((q) => q.id !== questionId)
        );
        const reweighted = calculateIntelligentScores(remaining);
        const updated = { ...prev, questions: reweighted };
        saveToHistory(updated);
        setHistory((hist) =>
          hist.map((item) => (item.id === updated.id ? updated : item))
        );
        return updated;
      });
      showNotice('Butir soal dihapus dan bobot nilai dihitung ulang otomatis ke 100.00.');
    },
    [showNotice]
  );

  const updateQuestionItem = useCallback(
    (
      questionId: string,
      patch: Partial<QuestionItem>,
      actionLabel = 'Penyuntingan Butir Soal'
    ) => {
      setActiveSet((prev) => {
        if (!prev) return null;
        const difficultyChanged = patch.difficulty !== undefined;
        let updatedQuestions = prev.questions.map((q) => {
          if (q.id !== questionId) return q;

          const merged: QuestionItem = { ...q, ...patch };
          const textChanged =
            (patch.questionText !== undefined && patch.questionText !== q.questionText) ||
            (patch.correctAnswer !== undefined && patch.correctAnswer !== q.correctAnswer);

          if (textChanged) {
            const revEntry = {
              id: `rev-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
              questionText: q.questionText,
              correctAnswer: q.correctAnswer,
              explanation: q.explanation,
              changedAt: new Date().toISOString(),
              actionLabel,
            };
            merged.revisionHistory = [revEntry, ...(q.revisionHistory ?? [])].slice(0, 8);
          }

          if (merged.supportingImage && patch.supportingImage === undefined) {
            const prevHash =
              merged.supportingImage.questionSnapshotHash ?? computeQuestionSnapshotHash(q);
            const nextHash = computeQuestionSnapshotHash(merged);
            if (prevHash !== nextHash) {
              merged.supportingImage = {
                ...merged.supportingImage,
                approvalStatus: 'needs_revision',
                needsQuestionSyncReview: true,
              };
            }
          }

          return merged;
        });

        if (difficultyChanged && patch.scoreWeight === undefined) {
          updatedQuestions = calculateIntelligentScores(updatedQuestions);
        }

        const updated = sanitizeQuestionSet({ ...prev, questions: updatedQuestions });
        saveToHistory(updated);
        setHistory((hist) =>
          hist.map((item) => (item.id === updated.id ? updated : item))
        );
        return updated;
      });
      if (patch.supportingImage === undefined && patch.isFavorite === undefined) {
        showNotice(
          patch.difficulty !== undefined
            ? 'Tingkat kesulitan diperbarui & bobot nilai dihitung ulang ke 100.00.'
            : 'Perubahan butir soal tersimpan dan disinkronkan ke kisi-kisi.'
        );
      }
    },
    [showNotice]
  );

  const duplicateQuestionItem = useCallback(
    (questionId: string) => {
      if (!activeSet) return;
      if (activeSet.questions.length >= MAX_QUESTIONS_LIMIT) {
        showNotice(
          `Maksimal ${MAX_QUESTIONS_LIMIT} soal dalam satu paket. Hapus soal lain terlebih dahulu.`
        );
        return;
      }
      setActiveSet((prev) => {
        if (!prev || prev.questions.length >= MAX_QUESTIONS_LIMIT) return prev;
        const idx = prev.questions.findIndex((q) => q.id === questionId);
        if (idx === -1) return prev;
        const source = prev.questions[idx]!;
        const copyItem: QuestionItem = {
          ...source,
          id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          questionText: `${source.questionText} (Variasi Salinan)`,
          supportingImage: undefined,
          revisionHistory: undefined,
          qaReport: undefined,
        };
        const nextList = syncQuestionNumbering([
          ...prev.questions.slice(0, idx + 1),
          copyItem,
          ...prev.questions.slice(idx + 1),
        ]);
        const reweighted = calculateIntelligentScores(nextList);
        const updated = sanitizeQuestionSet({ ...prev, questions: reweighted });
        saveToHistory(updated);
        setHistory((hist) =>
          hist.map((item) => (item.id === updated.id ? updated : item))
        );
        return updated;
      });
      showNotice('Soal diduplikasi & bobot seluruh paket dihitung ulang ke 100.00.');
    },
    [activeSet, showNotice]
  );

  const repairActiveSet = useCallback(() => {
    setActiveSet((prev) => {
      if (!prev) return null;
      const { repairedSet, appliedFixes } = autoRepairQuestionSet(prev);
      const updated = sanitizeQuestionSet(repairedSet);
      saveToHistory(updated);
      setHistory((hist) =>
        hist.map((item) => (item.id === updated.id ? updated : item))
      );
      showNotice(
        appliedFixes.length > 0
          ? `Validasi memperbaiki: ${appliedFixes[0]}`
          : 'Struktur paket soal sudah konsisten dan memenuhi standar.'
      );
      return updated;
    });
  }, [showNotice]);

  // Intelligent Scoring Dashboard Handlers
  const recalculateQuestionWeights = useCallback(() => {
    setActiveSet((prev) => {
      if (!prev) return null;
      const nextQuestions = calculateIntelligentScores(prev.questions);
      const updated = sanitizeQuestionSet({ ...prev, questions: nextQuestions });
      saveToHistory(updated);
      setHistory((hist) => hist.map((item) => (item.id === updated.id ? updated : item)));
      return updated;
    });
    showNotice('Bobot nilai seluruh soal dihitung ulang menjadi tepat 100.00.');
  }, [showNotice]);

  const resetQuestionWeightsAuto = useCallback(() => {
    setActiveSet((prev) => {
      if (!prev) return null;
      const cleared = prev.questions.map((q) => ({
        ...q,
        scoringCriteria: getDefaultScoringCriteria(q),
      }));
      const nextQuestions = calculateIntelligentScores(cleared);
      const updated = sanitizeQuestionSet({ ...prev, questions: nextQuestions });
      saveToHistory(updated);
      setHistory((hist) => hist.map((item) => (item.id === updated.id ? updated : item)));
      return updated;
    });
    showNotice('Pengaturan bobot nilai dikembalikan ke distribusi proporsional otomatis (100.00).');
  }, [showNotice]);

  const saveScoringChanges = useCallback(
    (nextQuestions: QuestionItem[]) => {
      setActiveSet((prev) => {
        if (!prev) return null;
        const updated = sanitizeQuestionSet({ ...prev, questions: nextQuestions });
        saveToHistory(updated);
        setHistory((hist) => hist.map((item) => (item.id === updated.id ? updated : item)));
        return updated;
      });
      showNotice('Pengaturan bobot & kriteria penskoran disimpan.');
    },
    [showNotice]
  );

  // Kop Dokumen CRUD Handlers
  const selectActiveKop = useCallback(
    (kopId: string) => {
      setActiveKopId(kopId);
      saveActiveKopId(kopId);
      updateExportConfig({ activeKopId: kopId });
    },
    [updateExportConfig]
  );

  const saveKopTemplate = useCallback(
    (kop: KopTemplate) => {
      const stamped: KopTemplate = {
        ...kop,
        updatedAt: new Date().toISOString(),
      };
      setKopTemplates((prev) => {
        const exists = prev.some((k) => k.id === stamped.id);
        const next = exists
          ? prev.map((k) => (k.id === stamped.id ? stamped : k))
          : [...prev, stamped];
        saveKopTemplates(next);
        return next;
      });
      showNotice(`Template kop "${stamped.name}" berhasil disimpan.`);
    },
    [showNotice]
  );

  const saveKopAsNew = useCallback(
    (source: KopTemplate, newName: string) => {
      const cloned = cloneKopTemplate(source, newName, false);
      setKopTemplates((prev) => {
        const next = [...prev, cloned];
        saveKopTemplates(next);
        return next;
      });
      setActiveKopId(cloned.id);
      saveActiveKopId(cloned.id);
      updateExportConfig({ activeKopId: cloned.id });
      showNotice(`Template kop baru "${cloned.name}" disimpan dan diaktifkan.`);
      return cloned;
    },
    [showNotice, updateExportConfig]
  );

  const duplicateKopTemplate = useCallback(
    (kopId: string) => {
      const found = kopTemplates.find((k) => k.id === kopId);
      if (!found) return null;
      const cloned = cloneKopTemplate(found, `${found.name} (Salinan)`, false);
      setKopTemplates((prev) => {
        const next = [...prev, cloned];
        saveKopTemplates(next);
        return next;
      });
      setActiveKopId(cloned.id);
      saveActiveKopId(cloned.id);
      updateExportConfig({ activeKopId: cloned.id });
      showNotice(`Template kop "${cloned.name}" diduplikasi.`);
      return cloned;
    },
    [kopTemplates, showNotice, updateExportConfig]
  );

  const renameKopTemplate = useCallback(
    (kopId: string, newName: string) => {
      const clean = newName.trim();
      if (!clean) return;
      setKopTemplates((prev) => {
        const next = prev.map((k) =>
          k.id === kopId ? { ...k, name: clean, updatedAt: new Date().toISOString() } : k
        );
        saveKopTemplates(next);
        return next;
      });
      showNotice(`Nama template kop diubah menjadi "${clean}".`);
    },
    [showNotice]
  );

  const deleteKopTemplate = useCallback(
    (kopId: string): boolean => {
      if (kopTemplates.length <= 1) {
        showNotice('Minimal harus ada 1 template kop yang tersimpan.');
        return false;
      }
      const next = kopTemplates.filter((k) => k.id !== kopId);
      setKopTemplates(next);
      saveKopTemplates(next);
      if (activeKopId === kopId) {
        const fallback = next.find((k) => k.isDefault) ?? next[0]!;
        setActiveKopId(fallback.id);
        saveActiveKopId(fallback.id);
        updateExportConfig({ activeKopId: fallback.id });
      }
      showNotice('Template kop dihapus.');
      return true;
    },
    [kopTemplates, activeKopId, showNotice, updateExportConfig]
  );

  const setDefaultKopTemplate = useCallback(
    (kopId: string) => {
      setKopTemplates((prev) => {
        const next = prev.map((k) => ({ ...k, isDefault: k.id === kopId }));
        saveKopTemplates(next);
        return next;
      });
      setActiveKopId(kopId);
      saveActiveKopId(kopId);
      updateExportConfig({ activeKopId: kopId });
      showNotice('Template kop dijadikan default untuk ekspor dokumen.');
    },
    [showNotice, updateExportConfig]
  );

  const resetKopToStarter = useCallback(
    (kopId?: string) => {
      const starters = createStarterKopTemplates();
      if (kopId) {
        const match = starters.find((s) => s.id === kopId) ?? starters[0]!;
        setKopTemplates((prev) => {
          const next = prev.map((k) =>
            k.id === kopId ? { ...match, id: k.id, name: k.name } : k
          );
          saveKopTemplates(next);
          return next;
        });
        showNotice('Pengaturan kop dikembalikan ke setelan awal template.');
      } else {
        setKopTemplates(starters);
        setActiveKopId(starters[0]!.id);
        saveKopTemplates(starters);
        saveActiveKopId(starters[0]!.id);
        showNotice('Seluruh 7 template kop dikembalikan ke pengaturan awal.');
      }
    },
    [showNotice]
  );

  const syncProfileToActiveKop = useCallback(() => {
    if (!activeKopTemplate) return;
    const docId = params.docIdentity;
    const synced: KopTemplate = {
      ...activeKopTemplate,
      schoolName: docId.schoolName || activeKopTemplate.schoolName,
      schoolAddress: docId.schoolAddress || activeKopTemplate.schoolAddress,
      npsn: docId.schoolNpsn || activeKopTemplate.npsn,
      leftLogoDataUrl: docId.schoolLogoDataUrl || activeKopTemplate.leftLogoDataUrl,
      academicYear: docId.academicYear || activeKopTemplate.academicYear,
      semester: docId.semester || activeKopTemplate.semester,
      updatedAt: new Date().toISOString(),
    };
    saveKopTemplate(synced);
    showNotice('Identitas sekolah dari Profil Sekolah berhasil disalin ke Kop aktif.');
  }, [activeKopTemplate, params.docIdentity, saveKopTemplate, showNotice]);

  // Exam Card Generator Handlers
  const updateExamCardParticipants = useCallback(
    (next: ExamCardParticipant[]) => {
      setExamCardParticipants(next);
      saveExamCardParticipants(next);
    },
    []
  );

  const upsertExamCardParticipant = useCallback(
    (participant: ExamCardParticipant) => {
      setExamCardParticipants((prev) => {
        const exists = prev.some((p) => p.id === participant.id);
        const next = exists
          ? prev.map((p) => (p.id === participant.id ? participant : p))
          : [...prev, participant];
        saveExamCardParticipants(next);
        return next;
      });
    },
    []
  );

  const deleteExamCardParticipant = useCallback(
    (id: string) => {
      setExamCardParticipants((prev) => {
        const next = prev.filter((p) => p.id !== id);
        saveExamCardParticipants(next);
        return next;
      });
      showNotice('Data peserta dihapus dari daftar kartu ujian.');
    },
    [showNotice]
  );

  const updateExamCardConfig = useCallback((patch: Partial<ExamCardConfig>) => {
    setExamCardConfig((prev) => {
      const next = { ...prev, ...patch };
      saveExamCardConfig(next);
      return next;
    });
  }, []);

  // Logo Library CRUD & Multi-Target Application
  const saveStoredLogo = useCallback(async (asset: StoredLogoAsset) => {
    const stamped: StoredLogoAsset = {
      ...asset,
      updated_at: new Date().toISOString(),
    };
    setLogos((prev) => [stamped, ...prev.filter((l) => l.logo_id !== stamped.logo_id)]);
    await saveLogoAsset(stamped);
  }, []);

  const removeStoredLogo = useCallback(
    async (logoId: string) => {
      await deleteLogoAsset(logoId);
      setLogos((prev) => prev.filter((l) => l.logo_id !== logoId));
      if (primaryLogoId === logoId) {
        setPrimaryLogoId(null);
        await savePrimaryLogoId(null);
      }
      if (params.docIdentity.schoolLogoId === logoId) {
        updateDocIdentity({ schoolLogoDataUrl: '', schoolLogoId: undefined });
      }
      setKopTemplates((prev) => {
        let modified = false;
        const next = prev.map((tpl) => {
          if (tpl.leftLogoId === logoId || tpl.rightLogoId === logoId) {
            modified = true;
            return {
              ...tpl,
              leftLogoDataUrl: tpl.leftLogoId === logoId ? '' : tpl.leftLogoDataUrl,
              leftLogoId: tpl.leftLogoId === logoId ? undefined : tpl.leftLogoId,
              rightLogoDataUrl: tpl.rightLogoId === logoId ? '' : tpl.rightLogoDataUrl,
              rightLogoId: tpl.rightLogoId === logoId ? undefined : tpl.rightLogoId,
            };
          }
          return tpl;
        });
        if (modified) saveKopTemplates(next);
        return modified ? next : prev;
      });
      if (examCardConfig.customLogoId === logoId) {
        updateExamCardConfig({ customLogoDataUrl: '', customLogoId: undefined });
      }
      showNotice('Logo dihapus dari pustaka tersimpan.');
    },
    [
      primaryLogoId,
      params.docIdentity.schoolLogoId,
      updateDocIdentity,
      examCardConfig.customLogoId,
      updateExamCardConfig,
      showNotice,
    ]
  );

  const applyLogoToTargets = useCallback(
    async (
      asset: StoredLogoAsset,
      targets: {
        profile?: boolean;
        kopIds?: string[];
        kopSide?: 'left' | 'right';
        examCard?: boolean;
        makePrimary?: boolean;
        fitMode?: LogoFitMode;
      }
    ) => {
      await saveStoredLogo(asset);
      const fitMode = targets.fitMode ?? asset.fit_mode ?? 'contain';

      if (targets.makePrimary) {
        setPrimaryLogoId(asset.logo_id);
        await savePrimaryLogoId(asset.logo_id);
      }

      if (targets.profile || targets.makePrimary) {
        const cur = paramsRef.current;
        const nextDoc = sanitizeDocIdentity(
          {
            ...(cur.docIdentity ?? {}),
            schoolLogoDataUrl: asset.dataUrl,
            schoolLogoId: asset.logo_id,
            schoolLogoFit: fitMode,
          },
          cur.schoolName ?? ''
        );
        const nextParams: GeneratorParams = {
          ...cur,
          docIdentity: nextDoc,
        };
        paramsRef.current = nextParams;
        updateDocIdentity({
          schoolLogoDataUrl: asset.dataUrl,
          schoolLogoId: asset.logo_id,
          schoolLogoFit: fitMode,
        });
        await saveDraft(nextParams, activeSetRef.current);
      }

      if (targets.kopIds && targets.kopIds.length > 0) {
        const targetSet = new Set(targets.kopIds);
        const side = targets.kopSide ?? 'left';
        const nextKops = kopTemplatesRef.current.map((tpl) => {
          if (!targetSet.has(tpl.id)) return tpl;
          return {
            ...tpl,
            ...(side === 'right'
              ? { rightLogoDataUrl: asset.dataUrl, rightLogoId: asset.logo_id }
              : { leftLogoDataUrl: asset.dataUrl, leftLogoId: asset.logo_id }),
            logoFitMode: fitMode,
            updatedAt: new Date().toISOString(),
          };
        });
        kopTemplatesRef.current = nextKops;
        setKopTemplates(nextKops);
        await saveKopTemplates(nextKops);
      }

      if (targets.examCard) {
        updateExamCardConfig({
          customLogoDataUrl: asset.dataUrl,
          customLogoId: asset.logo_id,
          logoFitMode: fitMode,
        });
      }
    },
    [saveStoredLogo, updateDocIdentity, updateExamCardConfig]
  );

  const updateStudentResponses = useCallback(
    async (nextResponses: StudentResponseEntry[]) => {
      setStudentResponses(nextResponses);
      if (activeSet) {
        await saveStudentResponses(activeSet.id, nextResponses);
      }
    },
    [activeSet]
  );

  return {
    activeTab,
    setActiveTab,
    theme,
    setThemeMode,
    toggleTheme,
    params,
    updateParam,
    updateDocIdentity,
    updateExportConfig,
    changeEducationLevel,
    subjectCatalog,
    addSubjectToCatalog,
    removeSubjectFromCatalog,
    resetCatalogToDefault,
    attachments,
    setAttachments,
    studentResponses,
    updateStudentResponses,
    kktpThreshold,
    setKktpThreshold,
    resetForm,
    startNewPackage,
    activeSet,
    history,
    fieldErrors,
    isGenerating,
    apiError,
    statusNotice,
    showNotice,
    generateQuestions,
    loadSampleSet,
    loadFromHistory,
    removeFromHistory,
    wipeHistory,
    removeQuestionItem,
    updateQuestionItem,
    duplicateQuestionItem,
    repairActiveSet,
    recalculateQuestionWeights,
    resetQuestionWeightsAuto,
    saveScoringChanges,
    kopTemplates,
    activeKopId,
    activeKopTemplate,
    selectActiveKop,
    saveKopTemplate,
    saveKopAsNew,
    duplicateKopTemplate,
    renameKopTemplate,
    deleteKopTemplate,
    setDefaultKopTemplate,
    resetKopToStarter,
    syncProfileToActiveKop,
    examCardParticipants,
    updateExamCardParticipants,
    upsertExamCardParticipant,
    deleteExamCardParticipant,
    examCardConfig,
    updateExamCardConfig,
    logos,
    primaryLogoId,
    saveStoredLogo,
    removeStoredLogo,
    applyLogoToTargets,
  };
}
