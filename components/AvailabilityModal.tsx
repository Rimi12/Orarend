import React, { useRef } from 'react';
import { DAYS_OF_WEEK, PERIODS } from '../constants.ts';
import type { Teacher } from '../types.ts';
import { useTimetable } from '../contexts/TimetableContext.tsx';
import { DocumentArrowDownIcon } from './icons/DocumentArrowDownIcon.tsx';
import { DocumentRefreshIcon } from './icons/DocumentRefreshIcon.tsx';

interface AvailabilityModalProps {
  isOpen: boolean;
  teacher: Teacher | null;
  onClose: () => void;
  onAvailabilityChange: (teacherId: string, day: number, period: number, isAvailable: boolean) => void;
  onTravelingChange?: (teacherId: string, isTraveling: boolean) => void;
}

export const AvailabilityModal: React.FC<AvailabilityModalProps> = ({ isOpen, teacher, onClose, onAvailabilityChange, onTravelingChange }) => {
  const { sortedTeachers, bulkUpdateTeachersAvailability } = useTimetable();
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen || !teacher) return null;

  const handleExportAvailability = () => {
    const data = {
      type: 'teacher_availability',
      version: 1,
      savedAt: new Date().toISOString(),
      teachers: sortedTeachers.map(t => ({
        id: t.id,
        name: t.name,
        isTraveling: t.isTraveling || false,
        availability: t.availability
      }))
    };

    const jsonString = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tanari_elerhetosegek_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportAvailability = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        let listToUpdate: { id?: string; name?: string; availability?: boolean[][]; isTraveling?: boolean }[] = [];

        if (json.type === 'teacher_availability' && Array.isArray(json.teachers)) {
          listToUpdate = json.teachers;
        } else if (Array.isArray(json.teachers)) {
          listToUpdate = json.teachers;
        } else if (Array.isArray(json)) {
          listToUpdate = json;
        }

        if (listToUpdate.length > 0) {
          bulkUpdateTeachersAvailability(listToUpdate);
          alert(`✅ ${listToUpdate.length} pedagógus elérhetősége sikeresen betöltve!`);
        } else {
          alert('❌ Érvénytelen elérhetőség fájl formátum!');
        }
      } catch (err) {
        alert('❌ Hiba a fájl beolvasásakor. Győződj meg róla, hogy érvényes JSON fájlt választottál!');
      }
    };
    reader.readAsText(file);
    if (e.target) e.target.value = '';
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 max-w-4xl w-full transform transition-all">
        <div className="flex flex-wrap justify-between items-center mb-4 gap-3">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              <span className="text-blue-600 dark:text-blue-400">{teacher.name}</span> elérhetősége
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">Jelölje be azokat az időpontokat, amikor a tanár <span className="font-semibold text-red-500">NEM</span> elérhető.</p>
          </div>

          {/* Separate Export/Import buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportAvailability}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
              title="Összes pedagógus elérhetőségének és utazási beállításainak mentése fájlba"
            >
              <DocumentArrowDownIcon className="w-4 h-4" />
              Mentés (.json)
            </button>

            <input
              type="file"
              ref={fileInputRef}
              className="sr-only"
              onChange={handleImportAvailability}
              accept=".json"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
              title="Elérhetőségi beállítások betöltése mentett fájlból"
            >
              <DocumentRefreshIcon className="w-4 h-4" />
              Betöltés (.json)
            </button>
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-center">
            <thead>
              <tr>
                <th className="p-3 font-semibold text-sm text-gray-700 dark:text-gray-300">Idősáv</th>
                {DAYS_OF_WEEK.map(day => (
                  <th key={day} className="p-3 font-semibold text-sm text-gray-700 dark:text-gray-300">{day}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERIODS.map((period, periodIndex) => (
                <tr key={period} className="border-t border-gray-200 dark:border-gray-700">
                  <td className="p-3 font-medium text-gray-600 dark:text-gray-400">{period}</td>
                  {DAYS_OF_WEEK.map((_, dayIndex) => {
                    const isAvailable = teacher.availability[dayIndex]?.[periodIndex] ?? true;
                    return (
                      <td key={`${dayIndex}-${periodIndex}`} className="p-3">
                        <label className="flex justify-center items-center cursor-pointer">
                          <input
                            type="checkbox"
                            className="h-6 w-6 rounded-md text-red-600 bg-gray-200 border-gray-300 focus:ring-red-500 dark:bg-gray-600 dark:border-gray-500 dark:focus:ring-red-600"
                            checked={!isAvailable}
                            onChange={(e) => onAvailabilityChange(teacher.id, dayIndex, periodIndex, !e.target.checked)}
                          />
                        </label>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Traveling Checkbox */}
        {onTravelingChange && (
          <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-700/30 border border-gray-200 dark:border-gray-700 rounded-xl flex items-center gap-3 no-print">
            <input
              id="traveling-checkbox"
              type="checkbox"
              className="h-5 w-5 rounded text-blue-600 focus:ring-blue-500 border-gray-300 dark:bg-gray-600 dark:border-gray-500 cursor-pointer"
              checked={teacher.isTraveling || false}
              onChange={(e) => onTravelingChange(teacher.id, e.target.checked)}
            />
            <label htmlFor="traveling-checkbox" className="text-sm font-semibold text-gray-700 dark:text-gray-300 cursor-pointer select-none">
              Utazó pedagógus / Kézi tervezésű órarend (AI generáló motor hagyja ki)
            </label>
          </div>
        )}

        <div className="mt-8 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 transition-colors duration-200"
          >
            Bezárás
          </button>
        </div>
      </div>
    </div>
  );
};