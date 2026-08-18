import React from 'react';
import { LessonCard } from './LessonCard.tsx';
import type { Class, Subject, PlacedLesson } from '../types.ts';

interface UnplacedLessonsSidebarProps {
  totalRemainingHours: number;
  unplacedLessons: any[]; // Or proper type
  findClass: (id: string) => Class | undefined;
  findSubject: (id: string) => Subject | undefined;
}

export const UnplacedLessonsSidebar: React.FC<UnplacedLessonsSidebarProps> = ({
  totalRemainingHours,
  unplacedLessons,
  findClass,
  findSubject
}) => {
  return (
    <div className="lg:col-span-1 bg-white dark:bg-gray-800 shadow-lg rounded-2xl p-6 flex flex-col no-print">
      <div className="flex justify-between items-baseline mb-4">
        <h3 className="text-xl font-bold text-gray-900 dark:text-white">Beosztandó órák</h3>
        {totalRemainingHours > 0 && (
            <span className="text-lg font-bold text-blue-600 dark:text-blue-400">
                Összesen: {totalRemainingHours} óra
            </span>
        )}
      </div>
      <div className="overflow-y-auto flex-grow min-h-0 unplaced-lessons-list">
        {unplacedLessons.length > 0 ? (
          unplacedLessons.map(lesson => (
            <LessonCard
              key={lesson.allocation.id}
              lesson={lesson}
              findClass={findClass}
              findSubject={findSubject}
              isDraggable={lesson.remainingHours > 0}
            />
          ))
        ) : (
          <div className="text-center text-gray-500 dark:text-gray-400 mt-8">Nincsenek beosztandó órák.</div>
        )}
      </div>
    </div>
  );
};
