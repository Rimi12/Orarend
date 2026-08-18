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
  const [showAllTeachers, setShowAllTeachers] = useState(false);
  const [filterText, setFilterText] = useState('');

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
          const validIds = ids.filter((id: string) => allTeachers.some(t => t.id === id));
          setSelectedIds(new Set(validIds));
          return;
        }
      }
    } catch { /* ignore */ }

    // Default: select all potential assistants
    setSelectedIds(new Set(potentialAssistants.map(t => t.id)));
  }, [isOpen, potentialAssistants, allTeachers]);

  if (!isOpen) return null;

  const currentList = (showAllTeachers || potentialAssistants.length === 0) ? allTeachers : potentialAssistants;
  const filteredList = currentList.filter(t => t.name.toLowerCase().includes(filterText.toLowerCase()));

  const toggle = (id: string) => {
    setSaveStatus('idle');
    setSelectedIds(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  const handleSelectAll  = () => {
    setSaveStatus('idle');
    setSelectedIds(new Set(currentList.map(t => t.id)));
  };

  const handleDeselectAll = () => {
    setSaveStatus('idle');
    setSelectedIds(new Set());
  };

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
    <div className="fixed inset-0 bg-black/60 flex justify-center items-center z-50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 max-w-2xl w-full flex flex-col h-[85vh]"
           onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between mb-3 pb-3 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <span className="text-3xl">👤</span>
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Asszisztensek Kiválasztása</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Válaszd ki, kik vegyenek részt az asszisztens beosztásban!
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl font-bold">
            &times;
          </button>
        </div>

        {/* Filter & View Mode Controls */}
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3 bg-gray-50 dark:bg-gray-750 p-2.5 rounded-xl border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Keresés név alapján..."
              value={filterText}
              onChange={e => setFilterText(e.target.value)}
              className="px-3 py-1 text-xs bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white w-44"
            />
            <label className="flex items-center gap-1.5 text-xs text-gray-700 dark:text-gray-300 cursor-pointer font-medium">
              <input
                type="checkbox"
                checked={showAllTeachers}
                onChange={e => setShowAllTeachers(e.target.checked)}
                className="rounded text-teal-600 focus:ring-teal-500"
              />
              <span>Összes munkatárs mutatása</span>
            </label>
          </div>

          <div className="flex items-center gap-1">
            <button onClick={handleSelectAll}
              className="px-2.5 py-1 text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 font-semibold">
              Összes
            </button>
            <button onClick={handleDeselectAll}
              className="px-2.5 py-1 text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 font-semibold">
              Egyik sem
            </button>
          </div>
        </div>

        <div className="text-xs text-gray-500 dark:text-gray-400 mb-2 flex justify-between">
          <span>{selectedIds.size} kiválasztva</span>
          <span>{filteredList.length} találat a listában</span>
        </div>

        {/* List of Teachers */}
        <div className="flex-grow overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-xl p-3 bg-gray-50/50 dark:bg-gray-850/50">
          {filteredList.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {filteredList.map(teacher => {
                const isSelected = selectedIds.has(teacher.id);
                return (
                  <label
                    key={teacher.id}
                    className={`flex items-center space-x-2.5 p-2 rounded-lg border transition-all cursor-pointer select-none ${
                      isSelected
                        ? 'bg-teal-50 dark:bg-teal-950/40 border-teal-300 dark:border-teal-700 shadow-xs'
                        : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggle(teacher.id)}
                      className="h-4 w-4 rounded text-teal-600 border-gray-300 focus:ring-teal-500"
                    />
                    <span className="text-gray-900 dark:text-gray-100 truncate text-xs font-medium" title={teacher.name}>
                      {teacher.name}
                    </span>
                  </label>
                );
              })}
            </div>
          ) : (
            <p className="text-center text-gray-400 dark:text-gray-500 italic py-8 text-xs">
              Nincs megjeleníthető dolgozó.
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="mt-4 flex justify-end gap-2.5 pt-3 border-t border-gray-200 dark:border-gray-700">
          <button onClick={onClose}
            className="px-4 py-2 text-xs font-semibold bg-gray-200 text-gray-800 rounded-xl hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600">
            Mégse
          </button>
          <button onClick={handleSave}
            className="px-4 py-2 text-xs font-bold bg-green-600 text-white rounded-xl hover:bg-green-700 transition-colors shadow-xs">
            {saveStatus === 'saved' ? '✓ Mentve!' : 'Kijelölés Mentése'}
          </button>
          <button onClick={handleOpenSchedule}
            disabled={selectedIds.size === 0}
            className="px-5 py-2 text-xs font-bold bg-teal-600 text-white rounded-xl hover:bg-teal-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5 shadow-xs">
            <span>👤 Beosztás Megnyitása ({selectedIds.size})</span>
          </button>
        </div>
      </div>
    </div>
  );
};
