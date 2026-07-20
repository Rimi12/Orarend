import React from 'react';
import { DAYS_OF_WEEK, PERIODS } from '../constants.ts';
import type { Teacher } from '../types.ts';

interface AvailabilityModalProps {
  isOpen: boolean;
  teacher: Teacher | null;
  onClose: () => void;
  onAvailabilityChange: (teacherId: string, day: number, period: number, isAvailable: boolean) => void;
  onTravelingChange?: (teacherId: string, isTraveling: boolean) => void;
}

export const AvailabilityModal: React.FC<AvailabilityModalProps> = ({ isOpen, teacher, onClose, onAvailabilityChange, onTravelingChange }) => {
  if (!isOpen || !teacher) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 max-w-4xl w-full transform transition-all">
        <h2 className="text-2xl font-bold mb-2 text-gray-900 dark:text-white">
          <span className="text-blue-600 dark:text-blue-400">{teacher.name}</span> elérhetősége
        </h2>
        <p className="text-gray-600 dark:text-gray-400 mb-6">Jelölje be azokat az időpontokat, amikor a tanár <span className="font-semibold text-red-500">NEM</span> elérhető.</p>
        
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