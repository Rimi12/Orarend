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
import type { Class, Teacher } from '../types.ts';

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
  handleExportForKreta: () => void;
  setIsSettingsModalOpen: (isOpen: boolean) => void;
  googleDrive: any;
  saveStatus: 'idle' | 'saving' | 'saved';
  handleSaveToDrive: () => void;
  handleSaveToFile: () => void;
  updateFileRef: React.RefObject<HTMLInputElement>;
  handleAllocationUpdateFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleReset: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  canUndo, canRedo, undo, redo,
  selectedClassId, setSelectedClassId, sortedClasses,
  selectedTeacherId, setSelectedTeacherId, teacherHourCounts, selectedTeacher,
  setIsAvailabilityModalOpen, setIsStandbySelectionModalOpen,
  handleExportForKreta, setIsSettingsModalOpen,
  googleDrive, saveStatus, handleSaveToDrive, handleSaveToFile,
  updateFileRef, handleAllocationUpdateFileChange, handleReset
}) => {
  return (
    <header className="bg-white dark:bg-gray-800 shadow-md rounded-2xl p-4 mb-6 flex flex-wrap items-center justify-between gap-4 no-print">
      <h1 className="text-2xl font-bold text-blue-600 dark:text-blue-400">
        Órarend Tervező
        <span className="text-sm font-normal text-gray-400 dark:text-gray-500 ml-2 align-baseline">v2.0.0</span>
      </h1>
      <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-4 flex-grow">
        <div className="flex items-center gap-2">
          <button
            onClick={undo}
            disabled={!canUndo}
            className="p-2.5 bg-gray-200 text-gray-700 font-semibold rounded-lg hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Visszavonás"
          >
            <ArrowUturnLeftIcon className="w-5 h-5" />
          </button>
          <button
            onClick={redo}
            disabled={!canRedo}
            className="p-2.5 bg-gray-200 text-gray-700 font-semibold rounded-lg hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Mégis"
          >
            <ArrowUturnRightIcon className="w-5 h-5" />
          </button>
        </div>
        <div className="hidden sm:block border-l border-gray-300 dark:border-gray-600 h-8 mx-2"></div>
        <div>
          <label htmlFor="class-select" className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">Osztály</label>
          <select id="class-select" value={selectedClassId || ''} onChange={e => setSelectedClassId(e.target.value)} className="w-40 sm:w-48 bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500">
            {sortedClasses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="teacher-select" className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">Tanár</label>
          <select id="teacher-select" value={selectedTeacherId || ''} onChange={e => setSelectedTeacherId(e.target.value)} className="w-56 sm:w-64 bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500">
            {teacherHourCounts.map(t => <option key={t.id} value={t.id}>{t.display}</option>)}
          </select>
        </div>
        <button
          onClick={() => setIsAvailabilityModalOpen(true)}
          disabled={!selectedTeacher}
          className="px-4 py-2.5 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
        >
          Elérhetőség
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
            onClick={handleExportForKreta}
            className="px-4 py-2.5 bg-cyan-600 text-white font-semibold rounded-lg hover:bg-cyan-700 focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-colors flex items-center gap-2"
            title="Teljes órarend exportálása Kréta import formátumban"
          >
            <Squares2X2Icon className="w-5 h-5" />
            <span className="hidden lg:inline">Kréta Export</span>
          </button>
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
