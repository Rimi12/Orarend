import React, { useState } from 'react';
import type { AppHistoryState, Class, Teacher, Subject, PlacedLesson } from '../types.ts';
import { NUMBER_OF_DAYS, NUMBER_OF_PERIODS, DAYS_OF_WEEK } from '../constants.ts';
import { PrintIcon } from './icons/PrintIcon.tsx';

interface GymScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentState: AppHistoryState | null;
  findClass: (id: string) => Class | undefined;
  findTeacher: (id: string) => Teacher | undefined;
  findSubject: (id: string) => Subject | undefined;
}

export const isPEClass = (subjectName: string): boolean => {
  const s = subjectName.toLowerCase();
  return s.includes('testnevelés') || s.includes('tesi') || s.includes('úszás') || s.includes('gyógytestnevelés');
};

export const getGymForClass = (className: string): 'kis' | 'nagy' => {
  const name = className.toLowerCase().trim();
  // 1., 2., 3. grades belong to Kis tornaterem
  if (/\b(1|2|3)(\.|\/|[a-z]|\s|$)/.test(name) && !/\b(10|11|12|13|14|15|16|17|18|19|20)\b/.test(name)) {
    return 'kis';
  }
  return 'nagy';
};

export const GymScheduleModal: React.FC<GymScheduleModalProps> = ({
  isOpen,
  onClose,
  currentState,
  findClass,
  findTeacher,
  findSubject
}) => {
  const [activeTab, setActiveTab] = useState<'both' | 'kis' | 'nagy'>('both');

  if (!isOpen || !currentState) return null;

  const { placedLessons } = currentState;

  // Filter only PE lessons
  const peLessons = placedLessons.filter(lesson => {
    const subject = findSubject(lesson.allocation.subjectId);
    return subject ? isPEClass(subject.name) : false;
  });

  // Group PE lessons into Kis Gym and Nagy Gym timetables
  // Map structure: [gymType]['day-period'] -> PlacedLesson[]
  const gymGrid: Record<'kis' | 'nagy', Record<string, PlacedLesson[]>> = {
    kis: {},
    nagy: {}
  };

  peLessons.forEach(lesson => {
    const cls = findClass(lesson.allocation.classId);
    const className = cls?.name || '';
    const gym = getGymForClass(className);
    const key = `${lesson.day}-${lesson.period}`;
    if (!gymGrid[gym][key]) {
      gymGrid[gym][key] = [];
    }
    gymGrid[gym][key].push(lesson);
  });

  const handlePrint = () => {
    window.print();
  };

  const renderGymTable = (gymType: 'kis' | 'nagy', gymTitle: string, badgeColor: string, description: string) => {
    let collisionCount = 0;
    for (let d = 0; d < NUMBER_OF_DAYS; d++) {
      for (let p = 0; p < NUMBER_OF_PERIODS; p++) {
        const key = `${d}-${p}`;
        if (gymGrid[gymType][key] && gymGrid[gymType][key].length > 1) {
          collisionCount++;
        }
      }
    }

    return (
      <div className="flex-1 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm overflow-hidden flex flex-col">
        <div className="flex items-center justify-between mb-3 border-b border-gray-100 dark:border-gray-700 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className={`px-2.5 py-1 text-xs font-bold rounded-md ${badgeColor}`}>
                {gymTitle}
              </span>
              {collisionCount > 0 && (
                <span className="px-2 py-0.5 bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 text-xs font-bold rounded-md animate-pulse">
                  ⚠️ {collisionCount} ütközés
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{description}</p>
          </div>
        </div>

        <div className="overflow-x-auto flex-1">
          <table className="w-full text-xs text-center border-collapse">
            <thead>
              <tr className="bg-gray-100 dark:bg-gray-700/60 text-gray-700 dark:text-gray-300">
                <th className="p-2 border border-gray-200 dark:border-gray-700 w-12 font-bold">Óra</th>
                {DAYS_OF_WEEK.map((dayName, dIdx) => (
                  <th key={dIdx} className="p-2 border border-gray-200 dark:border-gray-700 font-bold min-w-[120px]">
                    {dayName}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: NUMBER_OF_PERIODS }, (_, pIdx) => (
                <tr key={pIdx} className="border-b border-gray-200 dark:border-gray-700">
                  <td className="p-2 font-bold bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400">
                    {pIdx + 1}.
                  </td>
                  {Array.from({ length: NUMBER_OF_DAYS }, (_, dIdx) => {
                    const key = `${dIdx}-${pIdx}`;
                    const cellLessons = gymGrid[gymType][key] || [];
                    const isCollision = cellLessons.length > 1;

                    return (
                      <td
                        key={dIdx}
                        className={`p-1.5 border border-gray-200 dark:border-gray-700 vertical-top h-20 transition-colors ${
                          isCollision
                            ? 'bg-red-50 dark:bg-red-950/40 border-red-300 dark:border-red-800'
                            : cellLessons.length > 0
                            ? 'bg-blue-50/60 dark:bg-blue-950/20'
                            : 'bg-white dark:bg-gray-800'
                        }`}
                      >
                        {isCollision && (
                          <div className="text-[10px] font-bold text-red-600 dark:text-red-400 mb-1 flex items-center justify-center gap-1">
                            <span>⚠️ ÜTKÖZÉS!</span>
                          </div>
                        )}

                        <div className="space-y-1">
                          {cellLessons.map(l => {
                            const cls = findClass(l.allocation.classId);
                            const teacher = findTeacher(l.allocation.teacherId);
                            const subject = findSubject(l.allocation.subjectId);

                            return (
                              <div
                                key={l.id}
                                className={`p-1.5 rounded-lg text-left shadow-xs border ${
                                  isCollision
                                    ? 'bg-red-100 border-red-300 text-red-900 dark:bg-red-900/40 dark:border-red-700 dark:text-red-200'
                                    : 'bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-200'
                                }`}
                              >
                                <div className="font-bold text-[11px] truncate">
                                  {cls?.name || 'Osztály'}
                                </div>
                                <div className="text-[10px] opacity-90 truncate">
                                  👤 {teacher?.name || 'Tanár'}
                                </div>
                                <div className="text-[9px] text-gray-500 dark:text-gray-400 truncate">
                                  {subject?.name || 'Testnevelés'}
                                  {l.allocation.originalGroup ? ` (${l.allocation.originalGroup})` : ''}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 max-w-6xl w-full max-h-[92vh] flex flex-col transform transition-all no-print">
        
        {/* Header */}
        <div className="flex items-center justify-between mb-4 border-b border-gray-200 dark:border-gray-700 pb-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-100 dark:bg-emerald-900/40 rounded-xl text-emerald-600 dark:text-emerald-400">
              <span className="text-xl">🏀</span>
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Tornatermi Órarend Beosztás</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Testnevelés és gyógytestnevelés órák terem szerinti eloszlása
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* View Mode Buttons */}
            <div className="bg-gray-100 dark:bg-gray-700 p-1 rounded-lg flex items-center text-xs font-semibold">
              <button
                onClick={() => setActiveTab('both')}
                className={`px-3 py-1.5 rounded-md transition-colors ${
                  activeTab === 'both'
                    ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-xs'
                    : 'text-gray-600 dark:text-gray-300 hover:text-gray-900'
                }`}
              >
                🏢 Mindkét tornaterem
              </button>
              <button
                onClick={() => setActiveTab('kis')}
                className={`px-3 py-1.5 rounded-md transition-colors ${
                  activeTab === 'kis'
                    ? 'bg-white dark:bg-gray-800 text-emerald-600 dark:text-emerald-400 shadow-xs'
                    : 'text-gray-600 dark:text-gray-300 hover:text-gray-900'
                }`}
              >
                🟢 Kis tornaterem (1-3.)
              </button>
              <button
                onClick={() => setActiveTab('nagy')}
                className={`px-3 py-1.5 rounded-md transition-colors ${
                  activeTab === 'nagy'
                    ? 'bg-white dark:bg-gray-800 text-indigo-600 dark:text-indigo-400 shadow-xs'
                    : 'text-gray-600 dark:text-gray-300 hover:text-gray-900'
                }`}
              >
                🔵 Nagy tornaterem (4-12.)
              </button>
            </div>

            <button
              onClick={handlePrint}
              className="p-2 text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
              title="Nyomtatás"
            >
              <PrintIcon className="w-5 h-5" />
            </button>

            <button
              onClick={onClose}
              className="px-3.5 py-1.5 bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200 font-semibold text-xs rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors ml-2"
            >
              Bezárás
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto min-h-0 flex gap-4">
          {(activeTab === 'both' || activeTab === 'kis') &&
            renderGymTable(
              'kis',
              'Kis tornaterem',
              'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-200',
              'Kizárólag az 1., 2. és 3. osztályok tesióráinak elhelyezésére'
            )}

          {(activeTab === 'both' || activeTab === 'nagy') &&
            renderGymTable(
              'nagy',
              'Nagy tornaterem',
              'bg-indigo-100 text-indigo-900 dark:bg-indigo-900/50 dark:text-indigo-200',
              'A 4. osztálytól felfelé (4-12. osztályok, Szakiskola, Utazó, etc.)'
            )}
        </div>
      </div>
    </div>
  );
};
