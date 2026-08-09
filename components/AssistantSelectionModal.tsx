import React, { useState, useEffect } from 'react';
import type { Teacher } from '../types.ts';
import { ASSISTANT_SCHEDULE_KEY } from './AssistantScheduleModal.tsx';

const STORAGE_KEY = 'assistantSelectedIds';

interface AssistantSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Teachers that have NO allocations in the timetable (potential assistants) */
  potentialAssistants: Teacher[];
  allTeachers: Teacher[];
  onOpen: (selectedAssistants: Teacher[]) => void;
}

export const AssistantSelectionModal: React.FC<AssistantSelectionModalProps> = ({
  isOpen, onClose, potentialAssistants, allTeachers, onOpen,
}) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle');

  // Load saved selection on open
  useEffect(() => {
    if (!isOpen) return;

    // Try to read from the combined assistant schedule state first
    try {
      const raw = localStorage.getItem(ASSISTANT_SCHEDULE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (Array.isArray(saved.selectedAssistantIds) && saved.selectedAssistantIds.length > 0) {
          const validIds = saved.selectedAssistantIds.filter((id: string) => allTeachers.some(t => t.id === id));
          setSelectedIds(new Set(validIds));
          return;
        }
      }
    } catch { /* ignore */ }

    // Fallback: try old key
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const ids = JSON.parse(raw);
        if (Array.isArray(ids)) {
          const validIds = ids.filter((id: string) => potentialAssistants.some(t => t.id === id));
          setSelectedIds(new Set(validIds));
          return;
        }
      }
    } catch { /* ignore */ }

    // Default: select all potential assistants
    setSelectedIds(new Set(potentialAssistants.map(t => t.id)));
  }, [isOpen, potentialAssistants, allTeachers]);

  if (!isOpen) return null;

  const toggle = (id: string) => {
    setSaveStatus('idle');
    setSelectedIds(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  const handleSelectAll  = () => { setSaveStatus('idle'); setSelectedIds(new Set(potentialAssistants.map(t => t.id))); };
  const handleDeselectAll = () => { setSaveStatus('idle'); setSelectedIds(new Set()); };

  const handleSave = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(selectedIds)));
      // Also persist into the main schedule state
      const raw = localStorage.getItem(ASSISTANT_SCHEDULE_KEY);
      let state = raw ? JSON.parse(raw) : { slots: [], locations: [], selectedAssistantIds: [] };
      state.selectedAssistantIds = Array.from(selectedIds);
      localStorage.setItem(ASSISTANT_SCHEDULE_KEY, JSON.stringify(state));
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch { alert('Hiba a mentés során.'); }
  };

  const handleOpenSchedule = () => {
    handleSave();
    const selected = allTeachers.filter(t => selectedIds.has(t.id));
    onOpen(selected);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 max-w-2xl w-full flex flex-col h-[80vh]"
           onClick={e => e.stopPropagation()}>

        <div className="flex items-center gap-3 mb-4">
          <span className="text-2xl">👤</span>
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Asszisztens Beosztás</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Az alábbi tanároknak nincs osztály/tantárgy hozzárendelése a tantárgyfelosztásban. Válaszd ki, kik az asszisztensek!
            </p>
          </div>
        </div>

        {potentialAssistants.length === 0 && (
          <div className="mb-4 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-lg text-amber-800 dark:text-amber-300 text-sm">
            ⚠️ Nincs olyan pedagógus, akinek ne lenne osztály/tantárgy hozzárendelése. Ha mégis szeretnéd valakinek az asszisztens beosztását szerkeszteni, töltsd be a tantárgyfelosztást.
          </div>
        )}

        <div className="flex justify-between items-center mb-3">
          <span className="text-sm text-gray-600 dark:text-gray-400">
            {selectedIds.size} / {potentialAssistants.length} kiválasztva
          </span>
          <div className="flex gap-2">
            <button onClick={handleSelectAll}
              className="px-3 py-1 text-sm bg-gray-200 dark:bg-gray-700 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600">
              Összes
            </button>
            <button onClick={handleDeselectAll}
              className="px-3 py-1 text-sm bg-gray-200 dark:bg-gray-700 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600">
              Egyik sem
            </button>
          </div>
        </div>

        <div className="flex-grow overflow-y-auto border-t border-b border-gray-200 dark:border-gray-700 py-2 pr-2 -mr-2">
          {potentialAssistants.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1.5">
              {potentialAssistants.map(teacher => (
                <label key={teacher.id}
                  className="flex items-center space-x-3 p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700/50 cursor-pointer">
                  <input type="checkbox"
                    checked={selectedIds.has(teacher.id)}
                    onChange={() => toggle(teacher.id)}
                    className="h-5 w-5 rounded text-teal-600 border-gray-300 focus:ring-teal-500"/>
                  <span className="text-gray-800 dark:text-gray-200 truncate text-sm" title={teacher.name}>
                    {teacher.name}
                  </span>
                </label>
              ))}
            </div>
          ) : (
            <p className="text-center text-gray-400 dark:text-gray-500 italic py-8 text-sm">
              Nincs megjeleníthető asszisztens.
            </p>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-3">
          <button onClick={onClose}
            className="px-5 py-2 bg-gray-200 text-gray-800 font-semibold rounded-lg hover:bg-gray-300 dark:bg-gray-600 dark:text-gray-200 dark:hover:bg-gray-500">
            Mégse
          </button>
          <button onClick={handleSave}
            className="px-5 py-2 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition-colors">
            {saveStatus === 'saved' ? '✓ Mentve!' : 'Kijelölés Mentése'}
          </button>
          <button onClick={handleOpenSchedule}
            disabled={selectedIds.size === 0}
            className="px-5 py-2 bg-teal-600 text-white font-semibold rounded-lg hover:bg-teal-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center gap-2">
            👤 Beosztás Megnyitása ({selectedIds.size})
          </button>
        </div>
      </div>
    </div>
  );
};
