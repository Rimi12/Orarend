

import React from 'react';
import { DAYS_OF_WEEK, PERIODS } from '../constants.ts';
import type { PlacedLesson, Class, Subject, Teacher, TimetableCellData, Allocation, Collision } from '../types.ts';
import { DragType } from '../types.ts';
import { PlacedLessonCard } from './LessonCard.tsx';
import { ExportIcon } from './icons/ExportIcon.tsx';
import { PrintIcon } from './icons/PrintIcon.tsx';

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
  onExport
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

    // 3. Elrejtjük az eredeti alkalmazást és hozzáadjuk a nyomtatási konténert.
    const originalDisplay = rootElement.style.display;
    rootElement.style.display = 'none';
    document.body.appendChild(printHost);
    
    // 4. A nyomtatás utáni takarítás.
    const cleanup = () => {
      // Visszaállítjuk az eredeti állapotot.
      rootElement.style.display = originalDisplay;
      if (document.body.contains(printHost)) {
        document.body.removeChild(printHost);
      }
      window.removeEventListener('afterprint', cleanup);
    };

    window.addEventListener('afterprint', cleanup);

    // 5. Elindítjuk a nyomtatást.
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
            <button 
              onClick={onExport}
              className="p-2 text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 transition-colors rounded-full"
              aria-label={`${title} exportálása`}
            >
              <ExportIcon className="w-6 h-6" />
            </button>
            <button 
              onClick={handlePrint}
              className="p-2 text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 transition-colors rounded-full"
              aria-label={`${title} nyomtatása`}
            >
              <PrintIcon className="w-6 h-6" />
            </button>
        </div>
      </div>
      <div ref={scrollableContainerRef} className="flex-grow overflow-auto">
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
                      <div className="w-full h-full relative flex flex-wrap items-center justify-center p-0.5 gap-0.5">
                        {cellIsLocked && lessonsInCell.length === 0 && (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <svg className="w-6 h-6 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                          </div>
                        )}
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