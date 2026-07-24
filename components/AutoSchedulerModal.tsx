import React, { useState } from 'react';
import { SparklesIcon } from './icons/SparklesIcon.tsx';
import { SpinnerIcon } from './icons/SpinnerIcon.tsx';

interface AutoSchedulerModalProps {
  isOpen: boolean;
  onClose: () => void;
  isGenerating: boolean;
  progress: number;
  currentPhase: number;
  waitingForNextPhase: boolean;
  hasRun: boolean;
  phaseStats: { g1Count: number; g2Count: number; g3Count: number };
  onGenerate: (options: { resetAll: boolean }) => void;
  onProceed: () => void;
  onCancel: () => void;
}

export const AutoSchedulerModal: React.FC<AutoSchedulerModalProps> = ({
  isOpen,
  onClose,
  isGenerating,
  progress,
  currentPhase,
  waitingForNextPhase,
  hasRun,
  phaseStats,
  onGenerate,
  onProceed,
  onCancel
}) => {
  const [resetAll, setResetAll] = useState(true);

  if (!isOpen) return null;

  const handleStart = () => {
    onGenerate({ resetAll });
  };

  const getPhaseName = (phase: number) => {
    switch (phase) {
      case 1:
        return '1. Csoport: Egy osztályban tanítók';
      case 2:
        return '2. Csoport: Több osztályos kiemelt függőségek';
      case 3:
        return '3. Csoport: Maradék órák és tanárok';
      default:
        return '';
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 max-w-lg w-full transform transition-all no-print">
        
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-blue-100 dark:bg-blue-900/40 rounded-lg text-blue-600 dark:text-blue-400">
            <SparklesIcon className="w-7 h-7 animate-pulse" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">AI Órarend-generáló</h2>
            <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">3-Fázisú Lépcsőzetes Tervezés (Google OR-Tools CP-SAT)</span>
          </div>
        </div>

        {/* State 1: Initial Setup */}
        {!isGenerating && !waitingForNextPhase && !hasRun && (
          <div>
            <p className="text-gray-600 dark:text-gray-400 mb-4 text-sm">
              Az AI 3 egymást követő lépésben készíti el az órarendet a maximális megbízhatóság érdekében. Minden csoport végén megkérdezi a továbblépést:
            </p>

            <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-xl p-3 mb-6 text-xs text-blue-900 dark:text-blue-200 space-y-1">
              <div className="font-semibold text-sm mb-1">📅 Szakaszos Tervezés Csoportjai:</div>
              <div>🔹 <strong>1. csoport:</strong> Csak 1 osztályban tanítók ({phaseStats.g1Count} tanóra)</div>
              <div>🔹 <strong>2. csoport:</strong> Kiemelt több osztályos függőségek ({phaseStats.g2Count} tanóra)</div>
              <div>🔹 <strong>3. csoport:</strong> Maradék pedagógusok ({phaseStats.g3Count} tanóra)</div>
            </div>

            {/* Selection Options */}
            <div className="bg-gray-50 dark:bg-gray-700/30 p-4 rounded-xl border border-gray-200 dark:border-gray-700 mb-6">
              <span className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-3">Tervezési mód:</span>
              
              <label className="flex items-start gap-3 cursor-pointer mb-4">
                <input
                  type="radio"
                  name="schedule-mode"
                  className="mt-1 h-4.5 w-4.5 text-blue-600 border-gray-300 focus:ring-blue-500"
                  checked={resetAll}
                  onChange={() => setResetAll(true)}
                />
                <div>
                  <span className="block text-sm font-semibold text-gray-800 dark:text-gray-200">Teljes órarend újratervezése</span>
                  <span className="block text-xs text-gray-500 dark:text-gray-400">Törli a jelenleg beosztott órákat (kivéve az utazók óráit) és 3 lépésben teljesen újat generál.</span>
                </div>
              </label>

              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="schedule-mode"
                  className="mt-1 h-4.5 w-4.5 text-blue-600 border-gray-300 focus:ring-blue-500"
                  checked={!resetAll}
                  onChange={() => setResetAll(false)}
                />
                <div>
                  <span className="block text-sm font-semibold text-gray-800 dark:text-gray-200">Csak a beosztatlan órák elhelyezése</span>
                  <span className="block text-xs text-gray-500 dark:text-gray-400">Megtartja a kézzel beosztott órákat, és csak a megmaradt órákat tervezi be.</span>
                </div>
              </label>
            </div>

            {/* Buttons */}
            <div className="flex gap-3 justify-end">
              <button
                onClick={onClose}
                className="px-5 py-2 bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200 font-semibold rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              >
                Mégse
              </button>
              <button
                onClick={handleStart}
                className="px-6 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors flex items-center gap-2"
              >
                🚀 1. Csoport generálása (Indítás)
              </button>
            </div>
          </div>
        )}

        {/* State 2: Generating Phase Active */}
        {isGenerating && (
          <div className="py-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-bold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                <SpinnerIcon className="w-5 h-5 animate-spin text-blue-600 dark:text-blue-400" />
                {getPhaseName(currentPhase)} optimális elhelyezése...
              </span>
              <span className="text-sm font-bold text-blue-600 dark:text-blue-400">{progress}%</span>
            </div>

            {/* Progress bar */}
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 mb-6 overflow-hidden">
              <div 
                className="bg-blue-600 h-full rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>

            <div className="bg-gray-50 dark:bg-gray-700/30 p-4 rounded-xl border border-gray-200 dark:border-gray-700 mb-6 text-sm text-gray-600 dark:text-gray-300 space-y-1">
              <div>⚙️ <strong>CP-SAT Matematikai Solver:</strong> Kényszerek és ütközésmentes beosztás keresése...</div>
              <div className="text-xs text-gray-500">Ez eltarthat néhány másodpercig. Kérlek várj türelemmel!</div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={onCancel}
                className="px-6 py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition-colors"
              >
                Leállítás
              </button>
            </div>
          </div>
        )}

        {/* State 3: Waiting for Next Phase Confirmation */}
        {!isGenerating && waitingForNextPhase && (
          <div className="py-2">
            <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl text-green-700 dark:text-green-300 mb-5 flex items-center gap-3">
              <svg className="w-7 h-7 shrink-0 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
              </svg>
              <div>
                <span className="block font-bold text-base">
                  {currentPhase === 1 && '1. Csoport (egy osztályos pedagógusok) órarendje elkészült!'}
                  {currentPhase === 2 && '2. Csoport (kiemelt több osztályos pedagógusok) órarendje elkészült!'}
                </span>
                <span className="text-xs">A rendszer sikeresen beosztotta a(z) {currentPhase}. csoport óráit.</span>
              </div>
            </div>

            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 mb-6 text-sm text-blue-900 dark:text-blue-200 font-medium">
              ❓ <strong>Kérdés:</strong> Jöhet a(z) {currentPhase + 1}. csoport ({currentPhase === 1 ? 'több osztályos kiemelt pedagógusok' : 'maradék pedagógusok'}) órarendjének a létrehozása?
            </div>

            <div className="flex justify-between items-center gap-3">
              <button
                onClick={onCancel}
                className="px-4 py-2 bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200 font-semibold rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors text-sm"
              >
                Leállítás ezen a ponton
              </button>

              <button
                onClick={onProceed}
                className="px-6 py-2 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 transition-colors flex items-center gap-2"
              >
                ▶️ Igen, jöhet a {currentPhase + 1}. csoport!
              </button>
            </div>
          </div>
        )}

        {/* State 4: Completed All 3 Phases */}
        {!isGenerating && !waitingForNextPhase && hasRun && (
          <div>
            <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl text-green-700 dark:text-green-300 mb-6 flex items-center gap-3">
              <svg className="w-8 h-8 shrink-0 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
              </svg>
              <div>
                <span className="block font-bold text-lg">Mind a 3 csoport órarendje elkészült! 🎉</span>
                <span className="text-sm">A teljes iskola órarendjének beosztása sikeresen befejeződött mind a 3 fázisban.</span>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={onClose}
                className="px-6 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors"
              >
                Bezárás és Órarend Megtekintése
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

