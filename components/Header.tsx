import React from 'react';
import { ArrowUturnLeftIcon } from './icons/ArrowUturnLeftIcon.tsx';
import { ArrowUturnRightIcon } from './icons/ArrowUturnRightIcon.tsx';
import { UsersIcon } from './icons/UsersIcon.tsx';
import { Squares2X2Icon } from './icons/Squares2X2Icon.tsx';
import { CogIcon } from './icons/CogIcon.tsx';
import { GoogleIcon } from './icons/GoogleIcon.tsx';
import { SpinnerIcon } from './icons/SpinnerIcon.tsx';
import { SaveIcon } from './icons/SaveIcon.tsx';
import { DocumentArrowDownIcon } from './icons/DocumentArrowDownIcon.tsx';
import { DocumentRefreshIcon } from './icons/DocumentRefreshIcon.tsx';
import { ArrowPathIcon } from './icons/ArrowPathIcon.tsx';
import { SparklesIcon } from './icons/SparklesIcon.tsx';
import { TrashIcon } from './icons/TrashIcon.tsx';
import type { Class, Teacher } from '../types.ts';
import { useTimetable } from '../contexts/TimetableContext.tsx';

interface HeaderProps {
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  selectedClassId: string | null;
  setSelectedClassId: (id: string) => void;
  sortedClasses: Class[];
  selectedTeacherId: string | null;
  setSelectedTeacherId: (id: string) => void;
  teacherHourCounts: (Teacher & { display: string })[];
  selectedTeacher: Teacher | undefined;
  setIsAvailabilityModalOpen: (isOpen: boolean) => void;
  setIsStandbySelectionModalOpen: (isOpen: boolean) => void;
  setIsGymModalOpen: (isOpen: boolean) => void;
  setIsAssistantModalOpen: (isOpen: boolean) => void;
  setIsCurriculumModalOpen: (isOpen: boolean) => void;
  handleExportForKreta: () => void;
  handleExportTeacherForKreta?: (teacherId?: string) => void;
  handleExportAllTeachersForKreta?: () => void;
  setIsSettingsModalOpen: (isOpen: boolean) => void;
  googleDrive: any;
  saveStatus: 'idle' | 'saving' | 'saved';
  handleSaveToDrive: () => void;
  handleSaveToFile: () => void;
  updateFileRef: React.RefObject<HTMLInputElement>;
  handleAllocationUpdateFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleReset: () => void;
  onStartAutoSchedule: () => void;
  onClearClassTimetable?: () => void;
  onClearTeacherTimetable?: () => void;
  
  // Cloud Sync
  onOpenCloudSync?: () => void;
  syncStatus?: 'connected' | 'syncing' | 'offline' | 'error';
  roomCode?: string;
}

export const Header: React.FC<HeaderProps> = ({
  canUndo, canRedo, undo, redo,
  selectedClassId, setSelectedClassId, sortedClasses,
  selectedTeacherId, setSelectedTeacherId, teacherHourCounts, selectedTeacher,
  setIsAvailabilityModalOpen, setIsStandbySelectionModalOpen, setIsGymModalOpen, setIsAssistantModalOpen,
  setIsCurriculumModalOpen,
  handleExportForKreta, handleExportTeacherForKreta, handleExportAllTeachersForKreta, setIsSettingsModalOpen,
  googleDrive, saveStatus, handleSaveToDrive, handleSaveToFile,
  updateFileRef, handleAllocationUpdateFileChange, handleReset,
  onStartAutoSchedule, onClearClassTimetable, onClearTeacherTimetable,
  onOpenCloudSync, syncStatus = 'offline', roomCode = 'zoldmezo-2025'
}) => {
  const { rooms, setIsRoomModalOpen } = useTimetable();
  const [isKretaMenuOpen, setIsKretaMenuOpen] = React.useState(false);
  const kretaMenuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (kretaMenuRef.current && !kretaMenuRef.current.contains(event.target as Node)) {
        setIsKretaMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  return (
    <header className="bg-white dark:bg-gray-800 shadow-md rounded-2xl p-4 mb-6 flex flex-wrap items-center justify-between gap-4 no-print">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🗓️</span>
          <div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white leading-tight">Órarend Tervező</h1>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200">
              v3.1.0 (Kréta export & helyiségek)
            </span>
          </div>
        </div>

        {onOpenCloudSync && (
          <button
            onClick={onOpenCloudSync}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
              syncStatus === 'connected'
                ? 'bg-emerald-50 border-emerald-300 text-emerald-700 dark:bg-emerald-950/50 dark:border-emerald-700 dark:text-emerald-300 hover:bg-emerald-100'
                : syncStatus === 'syncing'
                ? 'bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-950/50 dark:border-blue-700 dark:text-blue-300 animate-pulse'
                : 'bg-amber-50 border-amber-300 text-amber-700 dark:bg-amber-950/50 dark:border-amber-700 dark:text-amber-300 hover:bg-amber-100'
            }`}
            title="Közös szerkesztés (Firebase szinkronizáció) beállításai"
          >
            <span className={`w-2 h-2 rounded-full ${
              syncStatus === 'connected' ? 'bg-emerald-500' : syncStatus === 'syncing' ? 'bg-blue-500' : 'bg-amber-500'
            }`} />
            <span className="hidden sm:inline">
              {syncStatus === 'connected' ? `Élő szoba: ${roomCode}` : syncStatus === 'syncing' ? 'Szinkronizálás...' : 'Offline szoba'}
            </span>
          </button>
        )}

        <div className="flex items-center gap-1 border-l border-gray-300 dark:border-gray-600 pl-2">
          <button
            onClick={undo}
            disabled={!canUndo}
            className="p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
            title="Visszavonás (Ctrl+Z)"
          >
            <ArrowUturnLeftIcon className="w-5 h-5" />
          </button>
          <button
            onClick={redo}
            disabled={!canRedo}
            className="p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
            title="Újra (Ctrl+Y)"
          >
            <ArrowUturnRightIcon className="w-5 h-5" />
          </button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label htmlFor="class-select" className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Osztály:
          </label>
          <select
            id="class-select"
            value={selectedClassId || ''}
            onChange={(e) => setSelectedClassId(e.target.value)}
            className="px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm font-medium"
          >
            <option value="">Válassz osztályt...</option>
            {sortedClasses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {selectedClassId && onClearClassTimetable && (
            <button
              onClick={onClearClassTimetable}
              className="p-2 bg-red-100 hover:bg-red-200 text-red-700 dark:bg-red-900/40 dark:hover:bg-red-800/60 dark:text-red-300 rounded-lg transition-colors"
              title="Kijelölt osztály összes órájának törlése"
            >
              <TrashIcon className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="teacher-select" className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Pedagógus:
          </label>
          <select
            id="teacher-select"
            value={selectedTeacherId || ''}
            onChange={(e) => setSelectedTeacherId(e.target.value)}
            className="px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm font-medium"
          >
            <option value="">Válassz pedagógust...</option>
            {teacherHourCounts.map((t) => (
              <option key={t.id} value={t.id}>
                {t.display}
              </option>
            ))}
          </select>
          {selectedTeacher && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setIsAvailabilityModalOpen(true)}
                className="px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 rounded-lg text-xs font-semibold transition-colors"
                title="Pedagógus elérhetőségének (nem ráérésének) beállítása"
              >
                Nem ér rá
              </button>
              {handleExportTeacherForKreta && (
                <button
                  onClick={() => handleExportTeacherForKreta(selectedTeacher.id)}
                  className="px-3 py-2 bg-cyan-50 hover:bg-cyan-100 text-cyan-700 dark:bg-cyan-950/60 dark:hover:bg-cyan-900/60 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1"
                  title="Pedagógus Kréta import fájl (.xlsx) elkészítése"
                >
                  <Squares2X2Icon className="w-3.5 h-3.5" />
                  <span>Kréta Export</span>
                </button>
              )}
              {onClearTeacherTimetable && (
                <button
                  onClick={onClearTeacherTimetable}
                  className="p-2 bg-red-100 hover:bg-red-200 text-red-700 dark:bg-red-900/40 dark:hover:bg-red-800/60 dark:text-red-300 rounded-lg transition-colors"
                  title="Kijelölt pedagógus összes órájának törlése"
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={onStartAutoSchedule}
          className="px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all flex items-center gap-2"
          title="Automatikus AI órarend-tervezés"
        >
          <SparklesIcon className="w-5 h-5 text-yellow-300 animate-pulse" />
          <span className="hidden lg:inline">AI Tervezés</span>
        </button>
        <button
            onClick={() => setIsStandbySelectionModalOpen(true)}
            className="px-4 py-2.5 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-colors flex items-center gap-2"
            title="Rendelkezésre állási beosztás generálása"
          >
            <UsersIcon className="w-5 h-5" />
            <span className="hidden lg:inline">Rendelkezésre Állás</span>
          </button>
          <button
            onClick={() => setIsGymModalOpen(true)}
            className="px-4 py-2.5 bg-emerald-600 text-white font-semibold rounded-lg hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors flex items-center gap-2"
            title="Tornatermi (Kis és Nagy tornaterem) órarend beosztás"
          >
            <span className="text-lg">🏀</span>
            <span className="hidden lg:inline">Tornatermek</span>
          </button>
          <button
            onClick={() => setIsAssistantModalOpen(true)}
            className="px-4 py-2.5 bg-teal-600 text-white font-semibold rounded-lg hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-colors flex items-center gap-2"
            title="Asszisztens beosztás szerkesztése"
          >
            <span className="text-lg">👤</span>
            <span className="hidden lg:inline">Asszisztens</span>
          </button>
          <button
            onClick={() => setIsRoomModalOpen(true)}
            className="px-4 py-2.5 bg-amber-600 text-white font-semibold rounded-lg hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500 transition-colors flex items-center gap-2"
            title="Kréta tantermek és helyiségek szerkesztése (36 hivatalos terem)"
          >
            <span className="text-lg">🏫</span>
            <span className="hidden lg:inline">Termek ({rooms.length})</span>
          </button>
          <div className="relative" ref={kretaMenuRef}>
            <div className="inline-flex rounded-lg shadow-sm">
              <button
                onClick={handleExportForKreta}
                className="px-3.5 py-2.5 bg-cyan-600 text-white font-semibold rounded-l-lg hover:bg-cyan-700 focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-colors flex items-center gap-2"
                title="Teljes órarend exportálása Kréta import formátumban (.xlsx)"
              >
                <Squares2X2Icon className="w-5 h-5" />
                <span className="hidden lg:inline">Kréta Export</span>
              </button>
              <button
                onClick={() => setIsKretaMenuOpen(prev => !prev)}
                className="px-2 py-2.5 bg-cyan-700 text-white font-semibold rounded-r-lg hover:bg-cyan-800 border-l border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-colors"
                title="Kréta export opciók (Tanáronkénti / Teljes / Kötegelt)"
              >
                <svg className={`w-4 h-4 transition-transform ${isKretaMenuOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
            {isKretaMenuOpen && (
              <div className="absolute right-0 mt-2 w-72 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 py-2 z-50 animate-in fade-in zoom-in-95 duration-100">
                <div className="px-3 py-1.5 border-b border-gray-100 dark:border-gray-700 text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                  Kréta Import Formátum (.xlsx)
                </div>
                
                {/* 1. Selected Teacher */}
                <button
                  onClick={() => {
                    setIsKretaMenuOpen(false);
                    if (handleExportTeacherForKreta) {
                      handleExportTeacherForKreta(selectedTeacherId || undefined);
                    }
                  }}
                  disabled={!selectedTeacherId}
                  className="w-full text-left px-4 py-2.5 hover:bg-cyan-50 dark:hover:bg-cyan-950/40 text-sm text-gray-700 dark:text-gray-200 flex items-start gap-2.5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <span className="text-base mt-0.5">👤</span>
                  <div>
                    <div className="font-semibold text-gray-900 dark:text-white">Kiválasztott pedagógus órarendje</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {selectedTeacher ? `${selectedTeacher.name} Kréta import fájlja` : 'Válassz ki egy tanárt a listából'}
                    </div>
                  </div>
                </button>

                {/* 2. Full school */}
                <button
                  onClick={() => {
                    setIsKretaMenuOpen(false);
                    handleExportForKreta();
                  }}
                  className="w-full text-left px-4 py-2.5 hover:bg-cyan-50 dark:hover:bg-cyan-950/40 text-sm text-gray-700 dark:text-gray-200 flex items-start gap-2.5 transition-colors border-t border-gray-100 dark:border-gray-700/50"
                >
                  <span className="text-base mt-0.5">🏫</span>
                  <div>
                    <div className="font-semibold text-gray-900 dark:text-white">Teljes intézményi órarend</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Minden osztály és tanár egy fájlban</div>
                  </div>
                </button>

                {/* 3. Batch all teachers */}
                {handleExportAllTeachersForKreta && (
                  <button
                    onClick={() => {
                      setIsKretaMenuOpen(false);
                      handleExportAllTeachersForKreta();
                    }}
                    className="w-full text-left px-4 py-2.5 hover:bg-cyan-50 dark:hover:bg-cyan-950/40 text-sm text-gray-700 dark:text-gray-200 flex items-start gap-2.5 transition-colors border-t border-gray-100 dark:border-gray-700/50"
                  >
                    <span className="text-base mt-0.5">👥</span>
                    <div>
                      <div className="font-semibold text-gray-900 dark:text-white">Összes pedagógus külön-külön</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">Minden tanárhoz saját fájl a 2026 mappába</div>
                    </div>
                  </button>
                )}
              </div>
            )}
          </div>
        <div className="flex items-center gap-2 border-l border-gray-300 dark:border-gray-600 pl-2 sm:pl-4">
            <button
              onClick={() => setIsSettingsModalOpen(true)}
              className="p-2.5 bg-gray-200 text-gray-700 font-semibold rounded-lg hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-400 transition-colors"
              title="Google API Beállítások"
            >
              <CogIcon className="w-5 h-5" />
            </button>
            {googleDrive.isReady && (
            <>
              {googleDrive.isLoggedIn ? (
                <div className="flex items-center gap-2">
                  <img src={googleDrive.userProfile?.picture} alt="profilkép" className="w-8 h-8 rounded-full" />
                  <button onClick={googleDrive.signOut} disabled={googleDrive.isAuthenticating} className="text-sm font-semibold text-gray-600 hover:text-red-500 disabled:opacity-50">Kijelentkezés</button>
                </div>
              ) : (
                <button onClick={googleDrive.signIn} disabled={googleDrive.isAuthenticating} className="px-3 py-2.5 bg-white border border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors flex items-center gap-2 disabled:opacity-50">
                  {googleDrive.isAuthenticating ? (<><SpinnerIcon className="w-5 h-5" /> <span className="hidden sm:inline">Bejelentkezés...</span></>) : (<><GoogleIcon className="w-5 h-5"/> <span className="hidden sm:inline">Bejelentkezés Google-lel</span></>)}
                </button>
              )}
            </>
          )}
          {googleDrive.isConfigured && 
            <button onClick={handleSaveToDrive} disabled={!googleDrive.isLoggedIn || saveStatus !== 'idle'} className="px-3 py-2.5 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-green-500 transition-all flex items-center gap-2" title="Mentés a Google Drive-ra">
                <SaveIcon className="w-5 h-5" />
                <span className="hidden sm:inline">{saveStatus === 'idle' ? 'Mentés Drive-ra' : saveStatus === 'saving' ? 'Mentés...' : 'Mentve!'}</span>
            </button>
          }
          <button onClick={handleSaveToFile} className="px-3 py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors flex items-center gap-2" title="Mentés fájlba (.json)">
              <DocumentArrowDownIcon className="w-5 h-5" />
          </button>
          <input type="file" ref={updateFileRef} className="sr-only" onChange={handleAllocationUpdateFileChange} accept=".xlsx, .xls" />
          <button onClick={() => updateFileRef.current?.click()} className="px-3 py-2.5 bg-teal-600 text-white font-semibold rounded-lg hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-colors flex items-center gap-2" title="Tantárgyfelosztás frissítése (.xlsx)">
              <DocumentRefreshIcon className="w-5 h-5" />
          </button>
          <button onClick={handleReset} className="px-3 py-2.5 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 transition-colors flex items-center gap-2" title="Újrakezdés, minden adat törlése">
              <ArrowPathIcon className="w-5 h-5" />
          </button>
        </div>
      </div>
    </header>
  );
};
