

import React from 'react';
import { DAYS_OF_WEEK, PERIODS } from '../constants.ts';
import type { PlacedLesson, Class, Subject, Teacher, TimetableCellData, Allocation, Collision, Substitution } from '../types.ts';
import { DragType } from '../types.ts';
import { PlacedLessonCard } from './LessonCard.tsx';
import { ExportIcon } from './icons/ExportIcon.tsx';
import { PrintIcon } from './icons/PrintIcon.tsx';
import { TrashIcon } from './icons/TrashIcon.tsx';
import { Squares2X2Icon } from './icons/Squares2X2Icon.tsx';

const SubstitutionCellCard: React.FC<{
  substitution: Substitution;
  role: 'substitute' | 'absent' | 'class';
}> = ({ substitution, role }) => {
  const isAbsent = role === 'absent';
  const isClass = role === 'class';
  const tooltip = [
    `Típus: ${substitution.substitutionType}`,
    `Tantárgy: ${substitution.subjectName}`,
    `Osztály: ${substitution.className}`,
    `Helyettesítő kolléga: ${substitution.substituteTeacherName}`,
    `Helyettesített kolléga: ${substitution.originalTeacherName}`,
    `Időszak: ${substitution.dateRange} (${substitution.occurrences} alkalom)`,
    substitution.reason ? `Ok: ${substitution.reason}` : '',
    substitution.comment ? `Megjegyzés: ${substitution.comment}` : ''
  ].filter(Boolean).join('\n');

  return (
    <div
      title={tooltip}
      className={`w-full text-left p-1 rounded-md text-xs shadow-sm border transition-all cursor-help select-none ${
        isAbsent
          ? 'bg-red-50 dark:bg-red-950/40 border-red-300 dark:border-red-800 text-red-900 dark:text-red-200'
          : 'bg-amber-50 dark:bg-amber-950/50 border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200'
      }`}
    >
      <div className="flex items-center justify-between gap-1 mb-0.5">
        <span className={`px-1 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
          isAbsent
            ? 'bg-red-200 dark:bg-red-900/60 text-red-800 dark:text-red-300'
            : 'bg-amber-200 dark:bg-amber-800/60 text-amber-800 dark:text-amber-200'
        }`}>
          {isAbsent ? '⚠️ Helyettesítve' : (substitution.substitutionType === 'Óraösszevonás' ? '👥 Összevonás' : '🔄 Helyettesítés')}
        </span>
        {substitution.isLongTerm && (
          <span className="text-[9px] font-semibold opacity-75" title="Tartós helyettesítés">
            {substitution.occurrences}x
          </span>
        )}
      </div>
      <div className="font-bold truncate text-[11px] leading-tight">
        {isClass ? substitution.subjectName : substitution.className}
      </div>
      <div className="truncate text-[10px] opacity-85 leading-tight">
        {isClass ? substitution.substituteTeacherName : substitution.subjectName}
      </div>
      {!isClass && (
        <div className="text-[9px] truncate italic opacity-75 mt-0.5">
          {isAbsent ? `${substitution.substituteTeacherName} tartja` : `${substitution.originalTeacherName} helyett`}
        </div>
      )}
    </div>
  );
};

interface TimetableGridProps {
  title: string;
  lessons: PlacedLesson[];
  onDrop: (allocation: Allocation, cell: TimetableCellData) => void;
  onRemoveLesson: (lessonId: string) => void;
  findClass: (id: string) => Class | undefined;
  findSubject: (id: string) => Subject | undefined;
  findTeacher: (id: string) => Teacher | undefined;
  viewType: 'teacher' | 'class';
  isLocked?: (day: number, period: number) => boolean;
  draggedAllocation: Allocation | null;
  checkCollision: (allocation: Allocation, cell: TimetableCellData) => Collision;
  onExport: () => void;
  onExportKreta?: () => void;
  onClearTimetable?: () => void;
  substitutions?: Substitution[];
  currentEntityId?: string | null;
  currentEntityName?: string;
}

export const TimetableGrid: React.FC<TimetableGridProps> = ({
  title,
  lessons,
  onDrop,
  onRemoveLesson,
  findClass,
  findSubject,
  findTeacher,
  viewType,
  isLocked,
  draggedAllocation,
  checkCollision,
  onExport,
  onExportKreta,
  onClearTimetable,
  substitutions,
  currentEntityId,
  currentEntityName
}) => {
  const [dragOverCell, setDragOverCell] = React.useState<TimetableCellData | null>(null);
  const gridRef = React.useRef<HTMLDivElement>(null);
  const scrollableContainerRef = React.useRef<HTMLDivElement>(null);

  const handleDragOver = (e: React.DragEvent<HTMLTableCellElement>, day: number, period: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverCell({ day, period });
  };

  const handleDragLeave = () => {
    setDragOverCell(null);
  };
  
  const handleDrop = (e: React.DragEvent<HTMLTableCellElement>, day: number, period: number) => {
    e.preventDefault();
    setDragOverCell(null);
    const allocationJson = e.dataTransfer.getData(DragType.LESSON);
    if (allocationJson) {
      const allocation = JSON.parse(allocationJson) as Allocation;
      onDrop(allocation, { day, period });
    }
  };

  const handlePrint = () => {
    const gridElement = gridRef.current;
    const rootElement = document.getElementById('root');
    if (!gridElement || !rootElement) return;

    // 1. Klónozzuk a nyomtatandó elemet.
    const printContents = gridElement.cloneNode(true) as HTMLElement;
    
    // 2. Létrehozzuk az ideiglenes konténert a klónnak.
    const printHost = document.createElement('div');
    printHost.id = 'print-container';
    printHost.appendChild(printContents);

    // 3. Beállítjuk a böngésző címet a PDF mentési fájlnévhez (pl. tanár vagy osztály neve).
    const originalTitle = document.title;
    if (title) {
      document.title = title.replace(/[\\/:*?"<>|]/g, ' ').trim();
    }

    // 4. Elrejtjük az eredeti alkalmazást és hozzáadjuk a nyomtatási konténert.
    const originalDisplay = rootElement.style.display;
    rootElement.style.display = 'none';
    document.body.appendChild(printHost);
    
    // 5. A nyomtatás utáni takarítás.
    const cleanup = () => {
      document.title = originalTitle;
      rootElement.style.display = originalDisplay;
      if (document.body.contains(printHost)) {
        document.body.removeChild(printHost);
      }
      window.removeEventListener('afterprint', cleanup);
    };

    window.removeEventListener('afterprint', cleanup);
    window.addEventListener('afterprint', cleanup);

    // 6. Elindítjuk a nyomtatást.
    window.print();
  };

  const handleGridDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (!draggedAllocation) return;

    const container = scrollableContainerRef.current;
    if (!container) return;

    const { clientY } = e;
    const { top, bottom } = container.getBoundingClientRect();
    const scrollThreshold = 60; // Pixels from the top/bottom edge
    const scrollAmount = 10; // Pixels to scroll per event fire

    if (clientY < top + scrollThreshold) {
      container.scrollTop -= scrollAmount;
    } else if (clientY > bottom - scrollThreshold) {
      container.scrollTop += scrollAmount;
    }
  };


  return (
    <div 
        ref={gridRef} 
        className="bg-white dark:bg-gray-800 shadow-lg rounded-2xl p-6 h-full flex flex-col"
        onDragOver={handleGridDragOver}
    >
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{title}</h2>
        <div className="flex items-center gap-2 no-print">
            {viewType === 'teacher' && onExportKreta && (
              <button 
                onClick={onExportKreta}
                className="px-3 py-1.5 bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-300 hover:bg-cyan-100 dark:hover:bg-cyan-900/60 border border-cyan-300 dark:border-cyan-700 transition-all rounded-lg flex items-center gap-1.5 font-semibold text-xs shadow-sm hover:scale-[1.02] active:scale-[0.98]"
                title={`${title} exportálása Kréta import Excel formátumban (.xlsx)`}
                aria-label={`${title} Kréta import export`}
              >
                <Squares2X2Icon className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                <span>Kréta Import</span>
              </button>
            )}
            {onClearTimetable && (
              <button 
                onClick={onClearTimetable}
                className="p-2 text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 transition-colors rounded-full"
                title={`${title} teljes órarendjének törlése / ürítése`}
                aria-label={`${title} órarendjének törlése`}
              >
                <TrashIcon className="w-6 h-6" />
              </button>
            )}
            <button 
              onClick={onExport}
              className="p-2 text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 transition-colors rounded-full"
              title={`${title} vizuális táblázat exportálása (.xlsx)`}
              aria-label={`${title} vizuális táblázat exportálása`}
            >
              <ExportIcon className="w-6 h-6" />
            </button>
            <button 
              onClick={handlePrint}
              className="p-2 text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 transition-colors rounded-full"
              title={`${title} nyomtatása`}
              aria-label={`${title} nyomtatása`}
            >
              <PrintIcon className="w-6 h-6" />
            </button>
        </div>
      </div>
      <div ref={scrollableContainerRef} className="flex-grow overflow-y-auto overflow-x-hidden">
        <table className="w-full h-full border-collapse table-fixed">
          <thead>
            <tr className="border-b-2 border-gray-200 dark:border-gray-700">
              <th className="p-2 text-left font-semibold text-sm text-gray-500 dark:text-gray-400 w-12"></th>
              {DAYS_OF_WEEK.map(day => (
                <th key={day} className="p-2 text-center font-semibold text-sm text-gray-500 dark:text-gray-400">{day}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERIODS.map((period, periodIndex) => (
              <tr key={period}>
                <td className="p-2 text-center font-semibold text-sm text-gray-500 dark:text-gray-400 border-r-2 border-gray-200 dark:border-gray-700">{period}</td>
                {DAYS_OF_WEEK.map((_, dayIndex) => {
                  const lessonsInCell = lessons.filter(l => l.day === dayIndex && l.period === periodIndex);
                  const cellIsLocked = isLocked ? isLocked(dayIndex, periodIndex) : false;

                  const cellSubs = (substitutions || []).filter(s => s.day === dayIndex && s.period === periodIndex);

                  let substituteForTeacher: Substitution[] = [];
                  let absentForTeacher: Substitution[] = [];
                  let classSubs: Substitution[] = [];

                  if (viewType === 'teacher' && (currentEntityId || currentEntityName)) {
                    const cleanName = (currentEntityName || '').trim().toLowerCase();
                    substituteForTeacher = cellSubs.filter(s =>
                      (currentEntityId && s.substituteTeacherId === currentEntityId) ||
                      (cleanName && s.substituteTeacherName.trim().toLowerCase() === cleanName)
                    );
                    absentForTeacher = cellSubs.filter(s =>
                      (currentEntityId && s.originalTeacherId === currentEntityId) ||
                      (cleanName && s.originalTeacherName.trim().toLowerCase() === cleanName)
                    );
                  } else if (viewType === 'class' && (currentEntityId || currentEntityName)) {
                    const cleanName = (currentEntityName || '').trim().toLowerCase();
                    classSubs = cellSubs.filter(s =>
                      (currentEntityId && s.classId === currentEntityId) ||
                      (cleanName && s.className.trim().toLowerCase() === cleanName)
                    );
                  }

                  const hasTeacherSub = substituteForTeacher.length > 0;
                  
                  let cellBg = 'bg-gray-50 dark:bg-gray-800';
                  if(dragOverCell?.day === dayIndex && dragOverCell?.period === periodIndex && draggedAllocation) {
                      const collision = checkCollision(draggedAllocation, {day: dayIndex, period: periodIndex});
                      // Green/Red highlight logic for drop zone
                      if (collision.availability) {
                          cellBg = 'bg-red-200 dark:bg-red-900/50'; // Hard collision (unavailable)
                      } else if (collision.teacher || collision.class) {
                          cellBg = 'bg-yellow-200 dark:bg-yellow-900/50'; // Soft collision (parallel lesson)
                      }
                      else {
                          cellBg = 'bg-green-200 dark:bg-green-900/50'; // No collision
                      }
                  } else if (hasTeacherSub) {
                      cellBg = 'bg-amber-50/60 dark:bg-amber-950/20';
                  } else if (cellIsLocked) {
                      cellBg = 'bg-gray-200 dark:bg-gray-700/50';
                  }

                  return (
                    <td
                      key={dayIndex}
                      onDragOver={(e) => handleDragOver(e, dayIndex, periodIndex)}
                      onDrop={(e) => handleDrop(e, dayIndex, periodIndex)}
                      onDragLeave={handleDragLeave}
                      className={`border border-gray-200 dark:border-gray-700 h-20 transition-colors duration-200 ${cellBg}`}
                      data-locked={cellIsLocked}
                    >
                      <div className="w-full h-full relative flex flex-wrap items-center justify-center p-0.5 gap-0.5 overflow-y-auto">
                        {cellIsLocked && lessonsInCell.length === 0 && !hasTeacherSub && (
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <svg className="w-6 h-6 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                          </div>
                        )}
                        {substituteForTeacher.map(sub => (
                          <SubstitutionCellCard key={`sub-${sub.id}`} substitution={sub} role="substitute" />
                        ))}
                        {absentForTeacher.map(sub => (
                          <SubstitutionCellCard key={`absent-${sub.id}`} substitution={sub} role="absent" />
                        ))}
                        {classSubs.map(sub => (
                          <SubstitutionCellCard key={`class-${sub.id}`} substitution={sub} role="class" />
                        ))}
                        {lessonsInCell.map(lessonInCell => (
                           <PlacedLessonCard
                                key={lessonInCell.id}
                                lesson={lessonInCell}
                                findClass={findClass}
                                findSubject={findSubject}
                                findTeacher={findTeacher}
                                onRemove={onRemoveLesson}
                                viewType={viewType}
                                isParallel={lessonsInCell.length > 1}
                            />
                        ))}
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