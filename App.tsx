

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
import { GymScheduleModal } from './components/GymScheduleModal.tsx';
import { AssistantSelectionModal } from './components/AssistantSelectionModal.tsx';
import { AssistantScheduleModal } from './components/AssistantScheduleModal.tsx';
import { CurriculumManagementModal } from './components/CurriculumManagementModal.tsx';
import { CloudSyncModal } from './components/CloudSyncModal.tsx';
import { Header } from './components/Header.tsx';
import { useAutoScheduler } from './hooks/useAutoScheduler.ts';
import { AutoSchedulerModal } from './components/AutoSchedulerModal.tsx';

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
    clearClassTimetable, clearTeacherTimetable,
    saveStateToStorage, loadStateFromStorage,
    undo, redo, canUndo, canRedo,
    selectedTeacherId, selectedClassId, driveFileId,
    setSelectedTeacherId, setSelectedClassId,
    sortedTeachers, sortedClasses,
    setTeacherTraveling, setPlacedLessons,
    reassignAllocationTeacher, updateAllocationHours, addCustomAllocation, removeCustomAllocation,
    roomCode, syncStatus, lastSyncedAt, isSyncModalOpen, setIsSyncModalOpen, setRoomCode, pushToCloud, pullFromCloud
  } = useTimetable();
  
  const [isAvailabilityModalOpen, setIsAvailabilityModalOpen] = useState(false);
  const [isCurriculumModalOpen, setIsCurriculumModalOpen] = useState(false);
  const [isAutoSchedulerOpen, setIsAutoSchedulerOpen] = useState(false);
  const [isGymModalOpen, setIsGymModalOpen] = useState(false);
  const [isAssistantSelectionOpen, setIsAssistantSelectionOpen] = useState(false);
  const [isAssistantScheduleOpen, setIsAssistantScheduleOpen] = useState(false);
  const [selectedAssistants, setSelectedAssistants] = useState<import('./types.ts').Teacher[]>([]);
  
  const [googleApiKey, setGoogleApiKey] = useState<string | null>(null);
  const [googleClientId, setGoogleClientId] = useState<string | null>(null);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  // Automatic data transfer from v3.0 via URL Hash
  useEffect(() => {
    if (window.location.hash.startsWith('#transfer=')) {
      try {
        const raw = decodeURIComponent(window.location.hash.slice(10));
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed) {
            const strVal = typeof parsed === 'string' ? parsed : JSON.stringify(parsed);
            localStorage.setItem('assistantScheduleState', strVal);
            window.dispatchEvent(new Event('assistantScheduleUpdated'));
            window.history.replaceState(null, '', window.location.pathname);
            setIsAssistantScheduleOpen(true);
            setTimeout(() => {
              alert('✅ Az asszisztens beosztás sikeresen és hiánytalanul átkerült a v3-ból!');
            }, 300);
          }
        }
      } catch (e) {
        console.error('Transfer error:', e);
      }
    }
  }, []);

  // Potential assistants: teachers with NO allocations at all
  const potentialAssistants = useMemo(() => {
    if (!currentState) return [];
    const teachersWithAllocs = new Set(currentState.allocations.map(a => a.teacherId));
    return sortedTeachers.filter(t => !teachersWithAllocs.has(t.id));
  }, [currentState, sortedTeachers]);

  const autoScheduler = useAutoScheduler();

  // Resizable panel states and handlers
  const [leftWidth, setLeftWidth] = useState(33.3); // Width of Class Timetable in %
  const [isXlScreen, setIsXlScreen] = useState(window.innerWidth >= 1280);

  useEffect(() => {
    const handleResize = () => {
      setIsXlScreen(window.innerWidth >= 1280);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const startResize = useCallback((mouseDownEvent: React.MouseEvent) => {
    mouseDownEvent.preventDefault();
    const startX = mouseDownEvent.clientX;
    const startWidth = leftWidth;
    const container = mouseDownEvent.currentTarget.parentElement;
    if (!container) return;
    const containerWidth = container.clientWidth;

    const doDrag = (mouseMoveEvent: MouseEvent) => {
      const deltaX = mouseMoveEvent.clientX - startX;
      const newWidthPercent = startWidth + (deltaX / containerWidth) * 100;
      // Constraint to keep left panel between 20% and 60%
      if (newWidthPercent >= 20 && newWidthPercent <= 60) {
        setLeftWidth(newWidthPercent);
      }
    };

    const stopDrag = () => {
      document.removeEventListener('mousemove', doDrag);
      document.removeEventListener('mouseup', stopDrag);
    };

    document.addEventListener('mousemove', doDrag);
    document.addEventListener('mouseup', stopDrag);
  }, [leftWidth]);

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

  const {
    handleExport,
    handleExportForKreta,
    handleExportTeacherForKreta,
    handleExportAllTeachersForKreta
  } = useExport();

  const {
    isStandbySelectionModalOpen,
    setIsStandbySelectionModalOpen,
    isStandbyModalOpen,
    setIsStandbyModalOpen,
    standbySchedule,
    standbyReport,
    isGeneratingWithAI,
    handleStartStandbyGeneration,
    handleRepairStandbyWithAI,
    handleSaveStandbyJSON,
    handleLoadStandbyJSON
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

  const selectedTeacher = findTeacher(selectedTeacherId || '');
  const selectedClass = findClass(selectedClassId || '');

  const handleClearClassTimetable = useCallback(() => {
    if (selectedClass) {
      if (window.confirm(`Biztosan törölni szeretnéd a(z) "${selectedClass.name}" osztály teljes órarendjét?\n\nMinden beosztott óra visszakerül a beosztatlan órák közé.`)) {
        clearClassTimetable(selectedClass.id);
      }
    }
  }, [selectedClass, clearClassTimetable]);

  const handleClearTeacherTimetable = useCallback(() => {
    if (selectedTeacher) {
      if (window.confirm(`Biztosan törölni szeretnéd ${selectedTeacher.name} teljes órarendjét?\n\nMinden beosztott órája visszakerül a beosztatlan órák közé.`)) {
        clearTeacherTimetable(selectedTeacher.id);
      }
    }
  }, [selectedTeacher, clearTeacherTimetable]);

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
        setIsGymModalOpen={setIsGymModalOpen}
        setIsAssistantModalOpen={() => setIsAssistantSelectionOpen(true)}
        setIsCurriculumModalOpen={setIsCurriculumModalOpen}
        handleExportForKreta={handleExportForKreta}
        handleExportTeacherForKreta={handleExportTeacherForKreta}
        handleExportAllTeachersForKreta={handleExportAllTeachersForKreta}
        setIsSettingsModalOpen={setIsSettingsModalOpen}
        googleDrive={googleDrive}
        saveStatus={saveStatus}
        handleSaveToDrive={handleSaveToDrive}
        handleSaveToFile={handleSaveToFile}
        updateFileRef={updateFileRef}
        handleAllocationUpdateFileChange={handleAllocationUpdateFileChange}
        handleReset={handleReset}
        onStartAutoSchedule={() => setIsAutoSchedulerOpen(true)}
        onClearClassTimetable={handleClearClassTimetable}
        onClearTeacherTimetable={handleClearTeacherTimetable}
        onOpenCloudSync={() => setIsSyncModalOpen(true)}
        syncStatus={syncStatus}
        roomCode={roomCode}
      />

      {googleDrive.authError && (
        <div className="my-4 p-4 bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-300 rounded-lg no-print" role="alert">
            <p className="font-bold">Bejelentkezési Hiba!</p>
            <p>{googleDrive.authError}</p>
        </div>
      )}

      <main className="flex flex-col xl:flex-row gap-4 h-[calc(100vh-12rem)] relative">
        <div 
          className="class-timetable-wrapper h-full flex flex-col min-h-0 overflow-hidden"
          style={{ width: isXlScreen ? `${leftWidth}%` : '100%', minWidth: isXlScreen ? '20%' : 'auto' }}
        >
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
              onClearTimetable={handleClearClassTimetable}
            />
          )}
        </div>

        {/* Resizer Handle */}
        <div 
          className="hidden xl:block w-1.5 hover:w-2.5 bg-gray-300 hover:bg-blue-500 dark:bg-gray-700 dark:hover:bg-blue-500 cursor-col-resize self-stretch transition-all rounded active:bg-blue-600 z-10"
          onMouseDown={startResize}
          title="Húzd a méretezéshez"
        />

        <div 
          className="flex-1 min-w-0 teacher-timetable-wrapper h-full grid grid-cols-1 lg:grid-cols-4 gap-6 min-h-0"
        >
          <div className="lg:col-span-3 h-full flex flex-col min-h-0 overflow-hidden">
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
                isLocked={(day, period) => !(selectedTeacher?.availability?.[day]?.[period] ?? true)}
                draggedAllocation={draggedAllocation}
                checkCollision={checkCollision}
                onExport={() => handleExport('teacher')}
                onExportKreta={() => handleExportTeacherForKreta(selectedTeacher.id)}
                onClearTimetable={handleClearTeacherTimetable}
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
        onTravelingChange={setTeacherTraveling}
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
        onSaveJSON={handleSaveStandbyJSON}
        onLoadJSON={handleLoadStandbyJSON}
      />

      <AutoSchedulerModal
        isOpen={isAutoSchedulerOpen}
        onClose={() => setIsAutoSchedulerOpen(false)}
        isGenerating={autoScheduler.isGenerating}
        progress={autoScheduler.progress}
        currentPhase={autoScheduler.currentPhase}
        waitingForNextPhase={autoScheduler.waitingForNextPhase}
        hasRun={autoScheduler.hasRun}
        phaseStats={autoScheduler.phaseStats}
        groupPlacementStatus={autoScheduler.groupPlacementStatus}
        onGenerate={autoScheduler.generateTimetable}
        onProceed={autoScheduler.proceedToNextPhase}
        onCancel={autoScheduler.cancelGeneration}
      />

      <GymScheduleModal
        isOpen={isGymModalOpen}
        onClose={() => setIsGymModalOpen(false)}
        currentState={currentState}
        findClass={findClass}
        findTeacher={findTeacher}
        findSubject={findSubject}
      />

      <AssistantSelectionModal
        isOpen={isAssistantSelectionOpen}
        onClose={() => setIsAssistantSelectionOpen(false)}
        potentialAssistants={potentialAssistants}
        allTeachers={sortedTeachers}
        onOpen={(assistants) => {
          setSelectedAssistants(assistants);
          setIsAssistantSelectionOpen(false);
          setIsAssistantScheduleOpen(true);
        }}
      />

      <AssistantScheduleModal
        isOpen={isAssistantScheduleOpen}
        onClose={() => setIsAssistantScheduleOpen(false)}
        selectedAssistants={selectedAssistants}
        allTeachers={sortedTeachers}
      />

      <CurriculumManagementModal
        isOpen={isCurriculumModalOpen}
        onClose={() => setIsCurriculumModalOpen(false)}
        teachers={currentState.teachers}
        classes={currentState.classes}
        subjects={currentState.subjects}
        allocations={currentState.allocations}
        placedLessons={currentState.placedLessons}
        reassignAllocationTeacher={reassignAllocationTeacher}
        updateAllocationHours={updateAllocationHours}
        addCustomAllocation={addCustomAllocation}
        removeCustomAllocation={removeCustomAllocation}
      />

      <CloudSyncModal
        isOpen={isSyncModalOpen}
        onClose={() => setIsSyncModalOpen(false)}
        syncStatus={syncStatus}
        lastSyncedAt={lastSyncedAt}
        onRoomCodeChanged={setRoomCode}
        onPushLocalToCloud={pushToCloud}
        onPullCloudToLocal={pullFromCloud}
      />

    </div>
  );
};

export default App;