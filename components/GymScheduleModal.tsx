import React, { useState, useEffect, useRef, useCallback } from 'react';
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

export const getDefaultGymForClass = (className: string): 'kis' | 'nagy' => {
  const name = className.toLowerCase().trim();
  // 1., 2., 3. grades belong to Kis tornaterem by default
  if (/\b(1|2|3)(\.|\/|[a-z]|\s|$)/.test(name) && !/\b(10|11|12|13|14|15|16|17|18|19|20)\b/.test(name)) {
    return 'kis';
  }
  return 'nagy';
};

const GYM_OVERRIDES_KEY = 'gymScheduleOverrides';

export const GymScheduleModal: React.FC<GymScheduleModalProps> = ({
  isOpen,
  onClose,
  currentState,
  findClass,
  findTeacher,
  findSubject,
}) => {
  const [activeTab, setActiveTab] = useState<'both' | 'kis' | 'nagy'>('both');
  const [isMaximized, setIsMaximized] = useState(false);
  const [leftWidth, setLeftWidth] = useState(50); // % width of Kis tornaterem when both are shown
  const [isDraggingResizer, setIsDraggingResizer] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Gym room overrides for individual lessons: lessonId -> 'kis' | 'nagy'
  const [gymOverrides, setGymOverrides] = useState<Record<string, 'kis' | 'nagy'>>({});

  // Active dragged lesson state: { lessonId, fromGym, day, period }
  const [draggedItem, setDraggedItem] = useState<{
    lessonId: string;
    fromGym: 'kis' | 'nagy';
    day: number;
    period: number;
  } | null>(null);

  // Load gym overrides from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(GYM_OVERRIDES_KEY);
      if (saved) {
        setGymOverrides(JSON.parse(saved));
      }
    } catch (e) {
      console.error('Error loading gym overrides:', e);
    }
  }, [isOpen]);

  // Save gym overrides
  const moveLessonToGym = useCallback((lessonId: string, targetGym: 'kis' | 'nagy') => {
    setGymOverrides(prev => {
      const updated = { ...prev, [lessonId]: targetGym };
      try {
        localStorage.setItem(GYM_OVERRIDES_KEY, JSON.stringify(updated));
      } catch (e) {
        console.error('Error saving gym overrides:', e);
      }
      return updated;
    });
  }, []);

  const resetGymOverrides = () => {
    if (window.confirm('Biztosan visszaállítod az összes kézi teremáthelyezést az osztályok szerinti alapértelmezésre (1-3. Kis terem, 4-12. Nagy terem)?')) {
      setGymOverrides({});
      localStorage.removeItem(GYM_OVERRIDES_KEY);
    }
  };

  // Resizer mouse handlers
  const handleMouseDownResizer = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingResizer(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingResizer || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const newWidth = ((e.clientX - rect.left) / rect.width) * 100;
      if (newWidth >= 20 && newWidth <= 80) {
        setLeftWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsDraggingResizer(false);
    };

    if (isDraggingResizer) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingResizer]);

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
    nagy: {},
  };

  peLessons.forEach(lesson => {
    const cls = findClass(lesson.allocation.classId);
    const className = cls?.name || '';
    // Priority: custom override if present, else default
    const gym = gymOverrides[lesson.id] || getDefaultGymForClass(className);
    const key = `${lesson.day}-${lesson.period}`;
    if (!gymGrid[gym][key]) {
      gymGrid[gym][key] = [];
    }
    gymGrid[gym][key].push(lesson);
  });

  // ── High-Quality Printing Engine ──────────────────────────────────────────────
  const triggerGymPrint = (printTarget: 'kis' | 'nagy' | 'both') => {
    const rootElement = document.getElementById('root');
    if (!rootElement) {
      window.print();
      return;
    }

    const printHost = document.createElement('div');
    printHost.id = 'print-container';

    const buildGymTableHtml = (targetGym: 'kis' | 'nagy', title: string, subTitle: string) => {
      const grid = gymGrid[targetGym];
      let rowsHtml = '';

      for (let pIdx = 0; pIdx < NUMBER_OF_PERIODS; pIdx++) {
        let cellsHtml = `<td style="font-weight: bold; background: #f0f0f0; width: 40px; text-align: center; border: 1px solid #444; padding: 4px;">${pIdx + 1}.</td>`;

        for (let dIdx = 0; dIdx < NUMBER_OF_DAYS; dIdx++) {
          const key = `${dIdx}-${pIdx}`;
          const cellLessons = grid[key] || [];

          if (cellLessons.length === 0) {
            cellsHtml += `<td style="border: 1px solid #444; height: 50px; background: #fff;"></td>`;
          } else {
            const lessonsHtml = cellLessons.map(l => {
              const cls = findClass(l.allocation.classId)?.name || 'Osztály';
              const teacher = findTeacher(l.allocation.teacherId)?.name || 'Tanár';
              const subject = findSubject(l.allocation.subjectId)?.name || 'Testnevelés';
              const group = l.allocation.originalGroup ? ` (${l.allocation.originalGroup})` : '';

              return `
                <div style="margin: 2px 0; padding: 3px 4px; border: 1px solid #333; border-radius: 4px; background: #f7f7f7; text-align: left;">
                  <div style="font-weight: bold; font-size: 8.5pt; color: #000;">${cls}</div>
                  <div style="font-size: 7.5pt; color: #222;">👤 ${teacher}</div>
                  <div style="font-size: 7pt; color: #555;">${subject}${group}</div>
                </div>
              `;
            }).join('');

            const bg = cellLessons.length > 1 ? '#ffebee' : '#ffffff';
            cellsHtml += `<td style="border: 1px solid #444; padding: 2px; vertical-align: top; background: ${bg};">${lessonsHtml}</td>`;
          }
        }

        rowsHtml += `<tr>${cellsHtml}</tr>`;
      }

      return `
        <div style="padding: 10px; width: 100%; box-sizing: border-box;">
          <div style="text-align: center; margin-bottom: 8px;">
            <h1 style="font-size: 14pt; font-weight: bold; margin: 0; color: #000;">🏀 ${title}</h1>
            <p style="font-size: 9pt; color: #555; margin: 2px 0 0 0;">${subTitle}</p>
          </div>
          <table style="width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 8pt;">
            <thead>
              <tr style="background: #e5e5e5;">
                <th style="border: 1px solid #444; width: 40px; padding: 5px; font-weight: bold; text-align: center;">Óra</th>
                ${DAYS_OF_WEEK.map(d => `<th style="border: 1px solid #444; padding: 5px; font-weight: bold; text-align: center;">${d}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        </div>
      `;
    };

    if (printTarget === 'kis' || printTarget === 'both') {
      const kisContainer = document.createElement('div');
      kisContainer.innerHTML = buildGymTableHtml('kis', 'Kis tornaterem órarendi beosztása', '1., 2. és 3. osztályok testnevelés és gyógytestnevelés órái');
      if (printTarget === 'both') {
        kisContainer.style.pageBreakAfter = 'always';
      }
      printHost.appendChild(kisContainer);
    }

    if (printTarget === 'nagy' || printTarget === 'both') {
      const nagyContainer = document.createElement('div');
      nagyContainer.innerHTML = buildGymTableHtml('nagy', 'Nagy tornaterem órarendi beosztása', '4-12. osztályok testnevelés és gyógytestnevelés órái');
      printHost.appendChild(nagyContainer);
    }

    const originalDisplay = rootElement.style.display;
    rootElement.style.display = 'none';
    document.body.appendChild(printHost);

    const cleanup = () => {
      rootElement.style.display = originalDisplay;
      if (document.body.contains(printHost)) {
        document.body.removeChild(printHost);
      }
      window.removeEventListener('afterprint', cleanup);
    };

    window.removeEventListener('afterprint', cleanup);
    window.addEventListener('afterprint', cleanup);
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

    const otherGym: 'kis' | 'nagy' = gymType === 'kis' ? 'nagy' : 'kis';
    const otherGymName = gymType === 'kis' ? 'Nagy terem' : 'Kis terem';

    return (
      <div className="flex-1 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3.5 shadow-xs overflow-hidden flex flex-col min-w-0">
        {/* Table Header */}
        <div className="flex items-center justify-between mb-2.5 border-b border-gray-100 dark:border-gray-700 pb-2.5 shrink-0">
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
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 truncate">{description}</p>
          </div>

          <button
            onClick={() => triggerGymPrint(gymType)}
            className="px-2.5 py-1 text-[11px] font-semibold bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg transition-colors flex items-center gap-1"
            title={`${gymTitle} nyomtatása (A4 fekvő)`}
          >
            <PrintIcon className="w-3.5 h-3.5" />
            <span>Nyomtatás</span>
          </button>
        </div>

        {/* Timetable Grid */}
        <div className="overflow-auto flex-1 border border-gray-200 dark:border-gray-700 rounded-lg">
          <table className="w-full text-xs text-center border-separate border-spacing-0 table-fixed min-w-[500px]">
            <thead>
              <tr className="bg-gray-100 dark:bg-gray-750 text-gray-700 dark:text-gray-300">
                <th className="sticky top-0 z-20 border-b border-r border-gray-200 dark:border-gray-700 p-1.5 w-10 font-bold bg-gray-100 dark:bg-gray-750">
                  Óra
                </th>
                {DAYS_OF_WEEK.map((dayName, dIdx) => (
                  <th key={dIdx} className="sticky top-0 z-20 border-b border-r border-gray-200 dark:border-gray-700 p-1.5 font-bold bg-gray-100 dark:bg-gray-750">
                    {dayName}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: NUMBER_OF_PERIODS }, (_, pIdx) => (
                <tr key={pIdx} className="border-b border-gray-200 dark:border-gray-700">
                  {/* Period Number */}
                  <td className="p-1 font-bold bg-gray-50 dark:bg-gray-800/80 border-b border-r border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400">
                    {pIdx + 1}.
                  </td>

                  {/* Day Columns */}
                  {Array.from({ length: NUMBER_OF_DAYS }, (_, dIdx) => {
                    const key = `${dIdx}-${pIdx}`;
                    const cellLessons = gymGrid[gymType][key] || [];
                    const isCollision = cellLessons.length > 1;

                    // Drag and Drop validation: ONLY matching slot (same day & period) across gyms is accepted!
                    const isDragActive = draggedItem !== null;
                    const isMatchingSlot = draggedItem?.day === dIdx && draggedItem?.period === pIdx;
                    const isCrossGym = draggedItem?.fromGym !== gymType;
                    const isValidDropTarget = isDragActive && isMatchingSlot && isCrossGym;
                    const isInvalidDragOver = isDragActive && (!isMatchingSlot || !isCrossGym);

                    return (
                      <td
                        key={dIdx}
                        onDragOver={e => {
                          if (isValidDropTarget) {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = 'move';
                          }
                        }}
                        onDrop={e => {
                          e.preventDefault();
                          if (isValidDropTarget && draggedItem) {
                            moveLessonToGym(draggedItem.lessonId, gymType);
                            setDraggedItem(null);
                          }
                        }}
                        className={`p-1 border-b border-r border-gray-200 dark:border-gray-700 vertical-top h-20 transition-all ${
                          isValidDropTarget
                            ? 'bg-emerald-100/90 dark:bg-emerald-950/80 ring-2 ring-emerald-500 ring-inset animate-pulse'
                            : isCollision
                            ? 'bg-red-50 dark:bg-red-950/40'
                            : cellLessons.length > 0
                            ? 'bg-blue-50/40 dark:bg-blue-950/20'
                            : isDragActive && !isValidDropTarget
                            ? 'bg-gray-50/40 dark:bg-gray-800/40 opacity-70'
                            : 'bg-white dark:bg-gray-800'
                        }`}
                      >
                        {isCollision && (
                          <div className="text-[9px] font-bold text-red-600 dark:text-red-400 mb-1 flex items-center justify-center gap-0.5">
                            <span>⚠️ ÜTKÖZÉS</span>
                          </div>
                        )}

                        {isValidDropTarget && cellLessons.length === 0 && (
                          <div className="h-full flex items-center justify-center text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                            <span>⬇️ Dobd ide</span>
                          </div>
                        )}

                        <div className="space-y-1">
                          {cellLessons.map(l => {
                            const cls = findClass(l.allocation.classId);
                            const teacher = findTeacher(l.allocation.teacherId);
                            const subject = findSubject(l.allocation.subjectId);
                            const isCustomMoved = !!gymOverrides[l.id];

                            return (
                              <div
                                key={l.id}
                                draggable
                                onDragStart={e => {
                                  setDraggedItem({
                                    lessonId: l.id,
                                    fromGym: gymType,
                                    day: l.day,
                                    period: l.period,
                                  });
                                  e.dataTransfer.setData('text/plain', l.id);
                                }}
                                onDragEnd={() => setDraggedItem(null)}
                                className={`p-1.5 rounded-lg text-left shadow-2xs border cursor-grab active:cursor-grabbing transition-transform hover:scale-[1.02] group relative ${
                                  isCollision
                                    ? 'bg-red-100 border-red-300 text-red-900 dark:bg-red-900/50 dark:border-red-700 dark:text-red-200'
                                    : gymType === 'kis'
                                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-950/50 dark:border-emerald-800 dark:text-emerald-200'
                                    : 'bg-indigo-50 border-indigo-200 text-indigo-900 dark:bg-indigo-950/50 dark:border-indigo-800 dark:text-indigo-200'
                                }`}
                                title="Húzd a másik tornaterem azonos idősávjába, vagy kattints a teremcsere gombra!"
                              >
                                <div className="flex items-center justify-between gap-1">
                                  <span className="font-bold text-[11px] truncate">
                                    {cls?.name || 'Osztály'}
                                  </span>
                                  {isCustomMoved && (
                                    <span className="text-[9px] px-1 bg-amber-200 text-amber-900 dark:bg-amber-800 dark:text-amber-100 rounded font-bold" title="Kézzel áthelyezve">
                                      ⇄ Kézi
                                    </span>
                                  )}
                                </div>

                                <div className="text-[10px] opacity-90 truncate">
                                  👤 {teacher?.name || 'Tanár'}
                                </div>
                                <div className="text-[9px] text-gray-500 dark:text-gray-400 truncate">
                                  {subject?.name || 'Testnevelés'}
                                  {l.allocation.originalGroup ? ` (${l.allocation.originalGroup})` : ''}
                                </div>

                                {/* Quick Move Button */}
                                <div className="mt-1 pt-1 border-t border-black/10 dark:border-white/10 flex items-center justify-between opacity-80 group-hover:opacity-100 transition-opacity">
                                  <button
                                    type="button"
                                    onClick={e => {
                                      e.stopPropagation();
                                      moveLessonToGym(l.id, otherGym);
                                    }}
                                    className="text-[9px] font-bold text-blue-700 dark:text-blue-300 hover:underline flex items-center gap-0.5"
                                    title={`Áthelyezés a(z) ${otherGymName}be (azonos idősávban)`}
                                  >
                                    <span>⇄</span>
                                    <span>{otherGymName}be</span>
                                  </button>
                                  <span className="text-[9px] text-gray-400">✋ Húzható</span>
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

  const hasCustomOverrides = Object.keys(gymOverrides).length > 0;

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex justify-center items-center z-50 p-2 sm:p-4 lg:p-6" onClick={onClose}>
      <div
        className={`bg-white dark:bg-gray-850 shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col transition-all overflow-hidden ${
          isMaximized
            ? 'fixed inset-0 w-screen h-screen rounded-none'
            : 'rounded-2xl w-full max-w-[98vw] h-[94vh]'
        }`}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between px-6 py-3.5 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 shrink-0 gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-100 dark:bg-emerald-900/40 rounded-xl text-emerald-600 dark:text-emerald-400 text-2xl">
              🏀
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">Tornatermi Órarend Beosztás</h2>
                <span className="px-2 py-0.5 text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300 rounded-md">
                  Kis & Nagy tornaterem
                </span>
                {hasCustomOverrides && (
                  <span className="px-2 py-0.5 text-[11px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200 rounded-md">
                    {Object.keys(gymOverrides).length} kézi áthelyezés
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Az órák kézzel is átmozgathatóak a két terem között (kizárólag azonos idősávban).
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* View Mode Selector */}
            <div className="bg-gray-200 dark:bg-gray-700 p-1 rounded-xl flex items-center text-xs font-semibold">
              <button
                onClick={() => setActiveTab('both')}
                className={`px-3 py-1 rounded-lg transition-all ${
                  activeTab === 'both'
                    ? 'bg-white dark:bg-gray-850 text-blue-600 dark:text-blue-400 font-bold shadow-xs'
                    : 'text-gray-600 dark:text-gray-300'
                }`}
              >
                🏢 Mindkét terem
              </button>
              <button
                onClick={() => setActiveTab('kis')}
                className={`px-3 py-1 rounded-lg transition-all ${
                  activeTab === 'kis'
                    ? 'bg-white dark:bg-gray-850 text-emerald-600 dark:text-emerald-400 font-bold shadow-xs'
                    : 'text-gray-600 dark:text-gray-300'
                }`}
              >
                🟢 Kis tornaterem (1-3.)
              </button>
              <button
                onClick={() => setActiveTab('nagy')}
                className={`px-3 py-1 rounded-lg transition-all ${
                  activeTab === 'nagy'
                    ? 'bg-white dark:bg-gray-850 text-indigo-600 dark:text-indigo-400 font-bold shadow-xs'
                    : 'text-gray-600 dark:text-gray-300'
                }`}
              >
                🔵 Nagy tornaterem (4-12.)
              </button>
            </div>

            {/* Print Buttons */}
            <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-750 p-1 rounded-xl border border-gray-200 dark:border-gray-700 text-xs">
              <button
                onClick={() => triggerGymPrint('kis')}
                className="px-2.5 py-1 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-950 font-bold rounded-lg transition-colors flex items-center gap-1"
                title="Kizárólag a Kis tornaterem nyomtatása (A4 fekvő)"
              >
                <PrintIcon className="w-3.5 h-3.5" />
                <span>Kis terem</span>
              </button>
              <span className="text-gray-300 dark:text-gray-600">|</span>
              <button
                onClick={() => triggerGymPrint('nagy')}
                className="px-2.5 py-1 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-950 font-bold rounded-lg transition-colors flex items-center gap-1"
                title="Kizárólag a Nagy tornaterem nyomtatása (A4 fekvő)"
              >
                <PrintIcon className="w-3.5 h-3.5" />
                <span>Nagy terem</span>
              </button>
              <span className="text-gray-300 dark:text-gray-600">|</span>
              <button
                onClick={() => triggerGymPrint('both')}
                className="px-2.5 py-1 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-950 font-bold rounded-lg transition-colors flex items-center gap-1"
                title="Mindkét terem nyomtatása külön lapokra (2 db fekvő A4 oldal)"
              >
                <PrintIcon className="w-3.5 h-3.5" />
                <span>Mindkettő</span>
              </button>
            </div>

            {/* Reset Overrides Button if custom moved */}
            {hasCustomOverrides && (
              <button
                onClick={resetGymOverrides}
                className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 dark:bg-amber-900/30 dark:hover:bg-amber-900/50 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700 rounded-xl text-xs font-semibold transition-colors"
                title="Összes kézi teremáthelyezés visszaállítása alaphelyzetbe"
              >
                ↺ Alaphelyzet
              </button>
            )}

            {/* Maximize / Minimize Button */}
            <button
              onClick={() => setIsMaximized(!isMaximized)}
              className="p-1.5 text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg text-sm font-bold"
              title={isMaximized ? 'Ablak kicsinyítése' : 'Teljes képernyő'}
            >
              {isMaximized ? '🗗' : '🗖'}
            </button>

            {/* Close Button */}
            <button
              onClick={onClose}
              className="px-3.5 py-1.5 bg-gray-800 hover:bg-gray-900 dark:bg-gray-200 dark:hover:bg-white text-white dark:text-gray-900 font-bold text-xs rounded-xl shadow-xs transition-colors ml-1"
            >
              Bezárás
            </button>
          </div>
        </div>

        {/* Drag Helper Notice */}
        {draggedItem && (
          <div className="bg-emerald-500 text-white px-4 py-1.5 text-center text-xs font-bold shrink-0 animate-pulse flex items-center justify-center gap-2">
            <span>✋ Óra mozgatása:</span>
            <span>Húzd a másik tornaterem <b>{DAYS_OF_WEEK[draggedItem.day]} {draggedItem.period + 1}. óra</b> idősávjába! (Más idősávba nem tehető át)</span>
          </div>
        )}

        {/* Content with Resizable Split-Pane when in 'both' mode */}
        <div ref={containerRef} className="flex-1 overflow-hidden min-h-0 p-3 flex flex-col md:flex-row gap-0 relative">
          {activeTab === 'both' ? (
            <>
              {/* Left Gym: Kis tornaterem */}
              <div
                className="h-full flex flex-col min-h-0 min-w-0"
                style={{ width: `${leftWidth}%`, minWidth: '20%', maxWidth: '80%' }}
              >
                {renderGymTable(
                  'kis',
                  'Kis tornaterem',
                  'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-200',
                  '1., 2. és 3. osztályok tesiórái (húzható a Nagy terembe)'
                )}
              </div>

              {/* Resizer Handle */}
              <div
                onMouseDown={handleMouseDownResizer}
                className="w-2 hover:w-3 bg-gray-300 hover:bg-emerald-500 dark:bg-gray-700 dark:hover:bg-emerald-500 cursor-col-resize self-stretch transition-all rounded active:bg-emerald-600 z-10 mx-1 flex items-center justify-center shrink-0"
                title="Húzd a két tornaterem méretarányának változtatásához"
              >
                <div className="w-0.5 h-8 bg-gray-400 dark:bg-gray-500 rounded" />
              </div>

              {/* Right Gym: Nagy tornaterem */}
              <div
                className="h-full flex flex-col min-h-0 min-w-0"
                style={{ width: `${100 - leftWidth}%`, minWidth: '20%', maxWidth: '80%' }}
              >
                {renderGymTable(
                  'nagy',
                  'Nagy tornaterem',
                  'bg-indigo-100 text-indigo-900 dark:bg-indigo-900/50 dark:text-indigo-200',
                  '4-12. osztályok tesiórái (húzható a Kis terembe)'
                )}
              </div>
            </>
          ) : activeTab === 'kis' ? (
            <div className="w-full h-full flex flex-col min-h-0 min-w-0">
              {renderGymTable(
                'kis',
                'Kis tornaterem',
                'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-200',
                'Kizárólag az 1., 2. és 3. osztályok tesióráinak elhelyezésére'
              )}
            </div>
          ) : (
            <div className="w-full h-full flex flex-col min-h-0 min-w-0">
              {renderGymTable(
                'nagy',
                'Nagy tornaterem',
                'bg-indigo-100 text-indigo-900 dark:bg-indigo-900/50 dark:text-indigo-200',
                'A 4. osztálytól felfelé (4-12. osztályok, Szakiskola, Utazó, etc.)'
              )}
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="px-6 py-2 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 shrink-0">
          <div className="flex items-center gap-4">
            <span>💡 <b>Tipp:</b> A két terem közötti elválasztósávot húzva szabadon méretezheted a termek szélességét.</span>
            <span>•</span>
            <span>Az órák áthúzhatóak a másik terembe (kizárólag azonos idősávba).</span>
          </div>
          <span className="font-semibold text-gray-700 dark:text-gray-300">Összesen {peLessons.length} beosztott tesióra</span>
        </div>
      </div>
    </div>
  );
};
