import { useState } from 'react';
import { Header } from './components/Header';
import { GeneratorForm } from './components/GeneratorForm';
import { QuestionPreview } from './components/QuestionPreview';
import { KopDokumenEditor } from './components/KopDokumenEditor';
import { ExamCardGeneratorView } from './components/ExamCardGeneratorView';
import { AdministrationView } from './components/AdministrationView';
import { AssessmentAnalyticsView } from './components/AssessmentAnalyticsView';
import { HistoryView } from './components/HistoryView';
import { CurriculumGuide } from './components/CurriculumGuide';
import { DocumentPreviewModal } from './components/DocumentPreviewModal';
import { useSoalStudio } from './hooks/useSoalStudio';
import { APP_OFFICIAL_BRANDING, APP_OFFICIAL_NAME } from './utils/kopTemplates';

export default function App() {
  const [printPreviewOpen, setPrintPreviewOpen] = useState(false);

  const {
    activeTab,
    setActiveTab,
    theme,
    setThemeMode,
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
    removeStoredLogo,
    applyLogoToTargets,
  } = useSoalStudio();

  return (
    <div className="flex min-h-screen flex-col bg-[#F0FDF4]/45 text-slate-900 transition-colors duration-150 dark:bg-[#0F172A] dark:text-slate-100">
      <Header
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onNewPackage={startNewPackage}
        historyCount={history.length}
      />

      {statusNotice && (
        <div
          role="status"
          aria-live="polite"
          className="no-print border-b border-green-200 bg-green-50 px-4 py-2 text-center text-xs font-medium text-green-900 dark:border-green-900/60 dark:bg-green-950/60 dark:text-green-200"
        >
          {statusNotice}
        </div>
      )}

      <main className="no-print mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-6">
        {activeTab === 'studio' && (
          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[430px_minmax(0,1fr)]">
            <GeneratorForm
              params={params}
              subjectCatalog={subjectCatalog}
              attachments={attachments}
              onChangeAttachments={setAttachments}
              errors={fieldErrors}
              isGenerating={isGenerating}
              apiError={apiError}
              logos={logos}
              kopTemplates={kopTemplates}
              activeKopId={activeKopId}
              onUpdateParam={updateParam}
              onUpdateDocIdentity={updateDocIdentity}
              onUpdateExportConfig={updateExportConfig}
              onChangeLevel={changeEducationLevel}
              onApplyLogoToTargets={applyLogoToTargets}
              onDeleteStoredLogo={removeStoredLogo}
              onNotify={showNotice}
              onOpenKopEditor={() => setActiveTab('kop')}
              onReset={resetForm}
              onSubmit={generateQuestions}
            />

            <QuestionPreview
              questionSet={activeSet}
              isGenerating={isGenerating}
              theme={theme}
              onSelectTheme={setThemeMode}
              includeAnswerKey={params.includeAnswerKey}
              onToggleAnswerKey={(val) => updateParam('includeAnswerKey', val)}
              activeKopTemplate={activeKopTemplate}
              onOpenPrintPreview={() => setPrintPreviewOpen(true)}
              onLoadSample={loadSampleSet}
              onRemoveQuestion={removeQuestionItem}
              onDuplicateQuestion={duplicateQuestionItem}
              onRepairSet={repairActiveSet}
              onUpdateQuestion={updateQuestionItem}
              onRecalculateWeights={recalculateQuestionWeights}
              onResetWeightsAuto={resetQuestionWeightsAuto}
              onSaveScoringChanges={saveScoringChanges}
              onNotify={showNotice}
            />
          </div>
        )}

        {activeTab === 'kop' && (
          <KopDokumenEditor
            templates={kopTemplates}
            activeKopId={activeKopId}
            activeKopTemplate={activeKopTemplate}
            schoolIdentity={params.docIdentity}
            logos={logos}
            onApplyLogoToTargets={applyLogoToTargets}
            onDeleteStoredLogo={removeStoredLogo}
            onSelectTemplate={selectActiveKop}
            onSaveTemplate={saveKopTemplate}
            onSaveAsNew={saveKopAsNew}
            onDuplicateTemplate={duplicateKopTemplate}
            onRenameTemplate={renameKopTemplate}
            onDeleteTemplate={deleteKopTemplate}
            onSetDefault={setDefaultKopTemplate}
            onResetStarter={resetKopToStarter}
            onSyncFromSchoolProfile={syncProfileToActiveKop}
            onNotify={showNotice}
          />
        )}

        {activeTab === 'exam-cards' && (
          <ExamCardGeneratorView
            participants={examCardParticipants}
            config={examCardConfig}
            kopTemplates={kopTemplates}
            activeKopTemplate={activeKopTemplate}
            docIdentity={params.docIdentity}
            includeAppBranding={params.exportConfig.includeAppBranding !== false}
            logos={logos}
            onApplyLogoToTargets={applyLogoToTargets}
            onDeleteStoredLogo={removeStoredLogo}
            onUpdateParticipants={updateExamCardParticipants}
            onUpsertParticipant={upsertExamCardParticipant}
            onDeleteParticipant={deleteExamCardParticipant}
            onUpdateConfig={updateExamCardConfig}
            onNotify={showNotice}
          />
        )}

        {activeTab === 'administration' && (
          <AdministrationView
            questionSet={activeSet}
            activeKopTemplate={activeKopTemplate}
            onUpdateQuestion={updateQuestionItem}
            onOpenPrintPreview={() => setPrintPreviewOpen(true)}
            onNotify={showNotice}
            onGoToStudio={() => setActiveTab('studio')}
          />
        )}

        {activeTab === 'analytics' && (
          <AssessmentAnalyticsView
            questionSet={activeSet}
            responses={studentResponses}
            kktpThreshold={kktpThreshold}
            onChangeKktp={setKktpThreshold}
            onUpdateResponses={updateStudentResponses}
            onGoToStudio={() => setActiveTab('studio')}
          />
        )}

        {activeTab === 'history' && (
          <HistoryView
            history={history}
            subjectCatalog={subjectCatalog}
            onAddSubject={addSubjectToCatalog}
            onRemoveSubject={removeSubjectFromCatalog}
            onResetCatalog={resetCatalogToDefault}
            onLoadSet={loadFromHistory}
            onDeleteEntry={removeFromHistory}
            onClearAll={wipeHistory}
            onNotify={showNotice}
          />
        )}

        {activeTab === 'guide' && <CurriculumGuide />}
      </main>

      <footer className="no-print border-t border-slate-200 bg-white px-4 py-4 text-xs text-slate-600 sm:px-6 dark:border-slate-700 dark:bg-[#1E293B] dark:text-slate-400">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-2">
          <span>
            <strong className="font-semibold text-green-800 dark:text-green-400">
              {APP_OFFICIAL_NAME}
            </strong>{' '}
            — {APP_OFFICIAL_BRANDING}
            {params.docIdentity.schoolName.trim()
              ? ` · ${params.docIdentity.schoolName.trim()}`
              : ''}
          </span>
          <span>
            Penyimpanan otomatis lokal aktif melalui IndexedDB · Verifikasi dokumen oleh pendidik
            dianjurkan
          </span>
        </div>
      </footer>

      {activeSet && (
        <DocumentPreviewModal
          open={printPreviewOpen}
          onClose={() => setPrintPreviewOpen(false)}
          questionSet={activeSet}
          includeAnswerKey={params.includeAnswerKey}
          kopTemplates={kopTemplates}
          activeKopId={activeKopId}
          activeKopTemplate={activeKopTemplate}
          onSelectKop={selectActiveKop}
          onToggleAnswerKey={(val) => updateParam('includeAnswerKey', val)}
          onUpdateExportConfig={updateExportConfig}
          onNotify={showNotice}
        />
      )}
    </div>
  );
}
