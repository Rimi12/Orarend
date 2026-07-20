import React, { useState } from 'react';
import { SparklesIcon } from './icons/SparklesIcon.tsx';
import { SpinnerIcon } from './icons/SpinnerIcon.tsx';

interface AutoSchedulerModalProps {
  isOpen: boolean;
  onClose: () => void;
  isGenerating: boolean;
  progress: number;
  generationCount: number;
  bestFitness: number;
  onGenerate: (options: { resetAll: boolean }) => void;
  onCancel: () => void;
}

export const AutoSchedulerModal: React.FC<AutoSchedulerModalProps> = ({
  isOpen,
  onClose,
  isGenerating,
  progress,
  generationCount,
  bestFitness,
  onGenerate,
  onCancel
}) => {
  const [resetAll, setResetAll] = useState(true);
  const [hasRun, setHasRun] = useState(false);

  if (!isOpen) return null;

  const handleStart = () => {
    setHasRun(true);
    onGenerate({ resetAll });
  };

  // Convert fitness penalty score to a readable conflict score/message
  const getConflictLabel = (fitness: number) => {
    if (fitness === -999999) return "Várakozás...";
    if (fitness >= 0) return "Tökéletes beosztás! (0 konfliktus)";
    
    // Penalties: hard conflict is -1000, soft is smaller
    const hardConflicts = Math.floor(Math.abs(fitness) / 1000);
    const softConflicts = Math.abs(fitness) % 1000;
    
    if (hardConflicts > 0) {
      return `${hardConflicts} db ütközés / ${softConflicts} minőségi eltérés`;
    }
    return `Nincs ütközés! (${softConflicts} minőségi optimalizáció)`;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 max-w-lg w-full transform transition-all no-print">
        
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-blue-100 dark:bg-blue-900/40 rounded-lg text-blue-600 dark:text-blue-400">
            <SparklesIcon className="w-7 h-7 animate-pulse" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">AI Órarend-generáló</h2>
        </div>

        {!isGenerating && !hasRun && (
          <div>
            <p className="text-gray-600 dark:text-gray-400 mb-6 text-sm">
              Az automatikus órarend-generáló egy Genetikus Algoritmus segítségével osztja be az órákat. Figyelembe veszi a tanárok elérhetőségét, a napközi délutáni elhelyezkedését, és minimalizálja a lyukasórákat.
              <br />
              <strong className="text-blue-600 dark:text-blue-400">Fontos:</strong> Az utazónak jelölt kollégák óráit a rendszer nem módosítja.
            </p>

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
                  <span className="block text-xs text-gray-500 dark:text-gray-400">Törli a jelenleg beosztott órákat (kivéve az utazók óráit) és teljesen újat generál.</span>
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
                  <span className="block text-xs text-gray-500 dark:text-gray-400">Megtartja az eddig kézzel beosztott órákat, és csak a megmaradt órákat tervezi be az üres helyekre.</span>
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
                Generálás indítása
              </button>
            </div>
          </div>
        )}

        {isGenerating && (
          <div className="py-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-bold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                <SpinnerIcon className="w-5 h-5 animate-spin text-blue-600 dark:text-blue-400" />
                Órarend optimalizálása folyamatban...
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

            {/* Stats */}
            <div className="bg-gray-50 dark:bg-gray-700/30 p-4 rounded-xl border border-gray-200 dark:border-gray-700 mb-6 text-sm space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">AI Generáció:</span>
                <span className="font-semibold text-gray-800 dark:text-gray-200">{generationCount} / 300</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Ütközések és minőség:</span>
                <span className="font-semibold text-orange-600 dark:text-orange-400">{getConflictLabel(bestFitness)}</span>
              </div>
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

        {!isGenerating && hasRun && (
          <div>
            <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl text-green-700 dark:text-green-300 mb-6 flex items-center gap-3">
              <svg className="w-6 h-6 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
              </svg>
              <div>
                <span className="block font-bold">Az órarend elkészült!</span>
                <span className="text-sm">A rendszer sikeresen beosztotta az órákat az optimális idősávokba.</span>
              </div>
            </div>

            <div className="flex justify-between items-center bg-gray-50 dark:bg-gray-700/30 p-4 rounded-xl border border-gray-200 dark:border-gray-700 mb-6 text-sm">
              <span className="text-gray-500 dark:text-gray-400">Végső ütközési szint:</span>
              <span className="font-bold text-gray-800 dark:text-gray-200">{getConflictLabel(bestFitness)}</span>
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => {
                  setHasRun(false);
                  onClose();
                }}
                className="px-6 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors"
              >
                Bezárás
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
