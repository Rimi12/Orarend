

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { TimetableProvider, useTimetable } from './contexts/TimetableContext.tsx';
import type { Teacher, Class } from './types.ts';
import { TimetableGrid } from './components/TimetableGrid.tsx';
import { UnplacedLessonsSidebar } from './components/UnplacedLessonsSidebar.tsx';
import { AvailabilityModal } from './components/AvailabilityModal.tsx';
import { FileUploadScreen } from './components/FileUploadScreen.tsx';
import { useGoogleDrive } from './hooks/useGoogleDrive.tsx';
import { useDragAndDrop } from './hooks/useDragAndDrop.ts';
import { useExport } from './hooks/useExport.ts';
import { useStandbyGenerator } from './hooks/useStandbyGenerator.ts';
import { useDataManagement } from './hooks/useDataManagement.ts';
import { useTimetableStats } from './hooks/useTimetableStats.ts';
import { GoogleApiSettingsModal } from './components/GoogleApiSettingsModal.tsx';
import { UpdateAllocationModal } from './components/UpdateAllocationModal.tsx';
import { ParallelLessonModal } from './components/ParallelLessonModal.tsx';
import { StandbyDutyModal } from './components/StandbyDutyModal.tsx';
import { StandbySelectionModal } from './components/StandbySelectionModal.tsx';
import { Header } from './components/Header.tsx';

const App: React.FC = () => {
  return (
    <TimetableProvider>
      <Main />
    </TimetableProvider>
  );
};

const Main: React.FC = () => {
  const { 
    dataLoaded, currentState, loadParsedData, getUnplacedLessonsForTeacher, 
    addLesson, removeLesson, findClass, findSubject, findTeacher, setTeacherAvailability, checkCollision,
    saveStateToStorage, loadStateFromStorage,
    undo, redo, canUndo, canRedo,
    selectedTeacherId, selectedClassId, driveFileId,
    setSelectedTeacherId, setSelectedClassId,
    sortedTeachers, sortedClasses,
  } = useTimetable();
  
  const [isAvailabilityModalOpen, setIsAvailabilityModalOpen] = useState(false);
  
  const [googleApiKey, setGoogleApiKey] = useState<string | null>(null);
  const [googleClientId, setGoogleClientId] = useState<string | null>(null);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  const {
    draggedAllocation,
    parallelConfirmation,
    handleDragStart,
    handleDragEnd,
    handleGlobalDragOver,
    handleDrop,
    handleConfirmParallel,
    handleCancelParallel
  } = useDragAndDrop();

  const { handleExport, handleExportForKreta } = useExport();

  const {
    isStandbySelectionModalOpen,
    setIsStandbySelectionModalOpen,
    isStandbyModalOpen,
    setIsStandbyModalOpen,
    standbySchedule,
    standbyReport,
    isGeneratingWithAI,
    handleStartStandbyGeneration,
    handleRepairStandbyWithAI
  } = useStandbyGenerator();

  useEffect(() => {
    setGoogleApiKey(localStorage.getItem('googleApiKey'));
    setGoogleClientId(localStorage.getItem('googleClientId'));
  }, []);

  const googleDrive = useGoogleDrive(googleApiKey, googleClientId);
  
  const {
    saveStatus,
    isUpdateModalOpen,
    setIsUpdateModalOpen,
    updateSummary,
    setUpdateSummary,
    updateFileRef,
    handleLoadStateFromJson,
    handleSaveToDrive,
    handleSaveToFile,
    handleReset,
    handleLoadFromDrive,
    handleAllocationUpdateFileChange,
    handleConfirmUpdate
  } = useDataManagement(googleDrive);
  
  const handleSaveApiKeys = useCallback((apiKey: string, clientId: string) => {
    localStorage.setItem('googleApiKey', apiKey);
    localStorage.setItem('googleClientId', clientId);
    setGoogleApiKey(apiKey);
    setGoogleClientId(clientId);
  }, []);
  
  useEffect(() => {
    if (dataLoaded) {
      const timer = setTimeout(() => {
        saveStateToStorage();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [currentState, dataLoaded, saveStateToStorage, selectedTeacherId, selectedClassId, driveFileId]);
  
  useEffect(() => {
    if (driveFileId !== googleDrive.currentFileId) {
      googleDrive.setCurrentFileId(driveFileId ?? null);
    }
  }, [driveFileId, googleDrive.currentFileId, googleDrive.setCurrentFileId]);

  const { teacherHourCounts, unplacedLessons, totalRemainingHours } = useTimetableStats(
    currentState,
    sortedTeachers,
    selectedTeacherId,
    findTeacher,
    getUnplacedLessonsForTeacher
  );


  if (!dataLoaded || !currentState) {
    return <FileUploadScreen
        onDataLoaded={loadParsedData}
        onLoadFromStorage={loadStateFromStorage}
        onLoadFromSaveFile={handleLoadStateFromJson}
        googleDrive={googleDrive}
        onLoadFromDrive={handleLoadFromDrive}
      />;
  }
  
  const { placedLessons } = currentState;

  const selectedTeacher = findTeacher(selectedTeacherId || '');
  const selectedClass = findClass(selectedClassId || '');
  
  const teacherTimetableLessons = placedLessons.filter(l => l.allocation.teacherId === selectedTeacherId);
  const classTimetableLessons = placedLessons.filter(l => l.allocation.classId === selectedClassId);
  
  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-200 p-4 lg:p-8" onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragOver={handleGlobalDragOver}>
      <Header
        canUndo={canUndo}
        canRedo={canRedo}
        undo={undo}
        redo={redo}
        selectedClassId={selectedClassId}
        setSelectedClassId={setSelectedClassId}
        sortedClasses={sortedClasses}
        selectedTeacherId={selectedTeacherId}
        setSelectedTeacherId={setSelectedTeacherId}
        teacherHourCounts={teacherHourCounts}
        selectedTeacher={selectedTeacher}
        setIsAvailabilityModalOpen={setIsAvailabilityModalOpen}
        setIsStandbySelectionModalOpen={setIsStandbySelectionModalOpen}
        handleExportForKreta={handleExportForKreta}
        setIsSettingsModalOpen={setIsSettingsModalOpen}
        googleDrive={googleDrive}
        saveStatus={saveStatus}
        handleSaveToDrive={handleSaveToDrive}
        handleSaveToFile={handleSaveToFile}
        updateFileRef={updateFileRef}
        handleAllocationUpdateFileChange={handleAllocationUpdateFileChange}
        handleReset={handleReset}
      />

      {googleDrive.authError && (
        <div className="my-4 p-4 bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-300 rounded-lg no-print" role="alert">
            <p className="font-bold">Bejelentkezési Hiba!</p>
            <p>{googleDrive.authError}</p>
        </div>
      )}

      <main className="grid grid-cols-1 xl:grid-cols-3 gap-6 h-[calc(100vh-12rem)]">
        <div className="xl:col-span-1 class-timetable-wrapper">
          {selectedClass && (
            <TimetableGrid
              title={`${selectedClass.name} órarendje`}
              lessons={classTimetableLessons}
              onDrop={handleDrop}
              onRemoveLesson={removeLesson}
              findClass={findClass}
              findSubject={findSubject}
              findTeacher={findTeacher}
              viewType="class"
              draggedAllocation={draggedAllocation}
              checkCollision={checkCollision}
              onExport={() => handleExport('class')}
            />
          )}
        </div>

        <div className="xl:col-span-2 grid grid-cols-1 lg:grid-cols-4 gap-6 teacher-timetable-wrapper">
          <div className="lg:col-span-3">
            {selectedTeacher && (
              <TimetableGrid
                title={`${selectedTeacher.name} órarendje`}
                lessons={teacherTimetableLessons}
                onDrop={handleDrop}
                onRemoveLesson={removeLesson}
                findClass={findClass}
                findSubject={findSubject}
                findTeacher={findTeacher}
                viewType="teacher"
                isLocked={(day, period) => !(selectedTeacher.availability[day]?.[period] ?? true)}
                draggedAllocation={draggedAllocation}
                checkCollision={checkCollision}
                onExport={() => handleExport('teacher')}
              />
            )}
          </div>
          
          <UnplacedLessonsSidebar
            totalRemainingHours={totalRemainingHours}
            unplacedLessons={unplacedLessons}
            findClass={findClass}
            findSubject={findSubject}
          />
        </div>
      </main>

      {selectedTeacher && <AvailabilityModal
        teacher={selectedTeacher}
        onClose={() => setIsAvailabilityModalOpen(false)}
        onAvailabilityChange={setTeacherAvailability}
        isOpen={isAvailabilityModalOpen}
      />}

      <GoogleApiSettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        onSave={handleSaveApiKeys}
        initialApiKey={googleApiKey}
        initialClientId={googleClientId}
      />
      
      {updateSummary && <UpdateAllocationModal
        isOpen={isUpdateModalOpen}
        onClose={() => { setIsUpdateModalOpen(false); setUpdateSummary(null); }}
        onConfirm={handleConfirmUpdate}
        summary={updateSummary}
        findTeacher={findTeacher}
        findClass={findClass}
        findSubject={findSubject}
       />}
      
      <ParallelLessonModal
        isOpen={!!parallelConfirmation}
        onClose={handleCancelParallel}
        onConfirm={handleConfirmParallel}
        confirmationData={parallelConfirmation}
        findTeacher={findTeacher}
        findClass={findClass}
        findSubject={findSubject}
      />

      <StandbySelectionModal
        isOpen={isStandbySelectionModalOpen}
        onClose={() => setIsStandbySelectionModalOpen(false)}
        onGenerate={handleStartStandbyGeneration}
        allTeachers={sortedTeachers}
      />

      <StandbyDutyModal
        isOpen={isStandbyModalOpen}
        onClose={() => setIsStandbyModalOpen(false)}
        schedule={standbySchedule}
        report={standbyReport}
        onRepairWithAI={handleRepairStandbyWithAI}
        isGeneratingAI={isGeneratingWithAI}
      />

    </div>
  );
};

export default App;