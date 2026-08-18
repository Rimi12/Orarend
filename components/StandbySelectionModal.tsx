import React, { useState, useEffect } from 'react';
import type { Teacher } from '../types.ts';

interface StandbySelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (selectedTeacherIds: string[]) => void;
  allTeachers: Teacher[];
}

const STANDBY_SELECTION_STORAGE_KEY = 'standbyDutySelectedTeacherIds';

export const StandbySelectionModal: React.FC<StandbySelectionModalProps> = ({ isOpen, onClose, onGenerate, allTeachers }) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle');

  useEffect(() => {
    if (isOpen) {
      // Try to load saved selection from localStorage
      const savedSelectionJSON = localStorage.getItem(STANDBY_SELECTION_STORAGE_KEY);
      if (savedSelectionJSON) {
        try {
          const savedIds = JSON.parse(savedSelectionJSON);
          if (Array.isArray(savedIds)) {
            const validIds = savedIds.filter(id => allTeachers.some(t => t.id === id));
            setSelectedIds(new Set(validIds));
            return;
          }
        } catch (e) {
          console.error("Failed to parse saved standby selection", e);
          localStorage.removeItem(STANDBY_SELECTION_STORAGE_KEY);
        }
      }

      // Fallback to default selection if nothing is loaded
      const initialSelected = allTeachers
        .filter(t => t.name !== 'Barnáné Szodorai Mária')
        .map(t => t.id);
      setSelectedIds(new Set(initialSelected));
    }
  }, [isOpen, allTeachers]);

  if (!isOpen) return null;

  const handleToggle = (teacherId: string) => {
    setSaveStatus('idle');
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(teacherId)) {
        newSet.delete(teacherId);
      } else {
        newSet.add(teacherId);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    setSaveStatus('idle');
    setSelectedIds(new Set(allTeachers.map(t => t.id)));
  };

  const handleDeselectAll = () => {
    setSaveStatus('idle');
    setSelectedIds(new Set());
  };

  const handleGenerateClick = () => {
    onGenerate(Array.from(selectedIds));
  };
  
  const handleSaveSelection = () => {
    try {
      localStorage.setItem(STANDBY_SELECTION_STORAGE_KEY, JSON.stringify(Array.from(selectedIds)));
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (e) {
      console.error("Failed to save standby selection", e);
      alert('Hiba történt a mentés során.');
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 max-w-2xl w-full flex flex-col h-[80vh]" onClick={e => e.stopPropagation()}>
        <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">Rendelkezésre Állás - Tanárok Kiválasztása</h2>
        
        <div className="flex justify-between items-center mb-4">
            <p className="text-gray-600 dark:text-gray-400">Válassza ki a beosztásba bevonni kívánt tanárokat.</p>
            <div className="flex gap-2">
                <button onClick={handleSelectAll} className="px-3 py-1 text-sm bg-gray-200 dark:bg-gray-700 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600">Összes</button>
                <button onClick={handleDeselectAll} className="px-3 py-1 text-sm bg-gray-200 dark:bg-gray-700 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600">Egyik sem</button>
            </div>
        </div>

        <div className="flex-grow overflow-y-auto border-t border-b border-gray-200 dark:border-gray-700 py-2 pr-2 -mr-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-2">
                {allTeachers.map(teacher => (
                    <label key={teacher.id} className="flex items-center space-x-3 p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700/50 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={selectedIds.has(teacher.id)}
                            onChange={() => handleToggle(teacher.id)}
                            className="h-5 w-5 rounded text-blue-600 border-gray-300 focus:ring-blue-500"
                        />
                        <span className="text-gray-800 dark:text-gray-200 truncate" title={teacher.name}>{teacher.name}</span>
                    </label>
                ))}
            </div>
        </div>
        
        <div className="mt-6 flex justify-end gap-4">
          <button onClick={onClose} className="px-6 py-2 bg-gray-200 text-gray-800 font-semibold rounded-lg hover:bg-gray-300 dark:bg-gray-600 dark:text-gray-200 dark:hover:bg-gray-500">
            Mégse
          </button>
          <button onClick={handleSaveSelection} className="px-6 py-2 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition-colors">
            {saveStatus === 'saved' ? 'Mentve!' : 'Kijelölés Mentése'}
          </button>
          <button onClick={handleGenerateClick} className="px-6 py-2 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 disabled:bg-gray-400" disabled={selectedIds.size === 0}>
            Generálás ({selectedIds.size} tanár)
          </button>
        </div>
      </div>
    </div>
  );
};
