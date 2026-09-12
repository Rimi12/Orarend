import React from 'react';
import type { UnplacedLesson, Class, Subject, PlacedLesson, Teacher } from '../types.ts';
import { DragType } from '../types.ts';
import { TrashIcon } from './icons/TrashIcon.tsx';

interface LessonCardProps {
  lesson: UnplacedLesson;
  findClass: (id: string) => Class | undefined;
  findSubject: (id: string) => Subject | undefined;
  isDraggable: boolean;
}

export const LessonCard: React.FC<LessonCardProps> = ({ lesson, findClass, findSubject, isDraggable }) => {
  const subject = findSubject(lesson.allocation.subjectId);
  const targetClass = findClass(lesson.allocation.classId);

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    e.dataTransfer.setData(DragType.LESSON, JSON.stringify(lesson.allocation));
    e.dataTransfer.effectAllowed = 'move';
  };

  const cardStyle = `
    p-3 rounded-lg shadow-md mb-3 transition-all duration-200 ease-in-out
    ${isDraggable 
      ? 'bg-white dark:bg-gray-700 hover:shadow-xl hover:-translate-y-1 cursor-grab' 
      : 'bg-gray-200 dark:bg-gray-600 opacity-60 cursor-not-allowed'}
  `;

  return (
    <div
      draggable={isDraggable}
      onDragStart={handleDragStart}
      className={cardStyle}
    >
      <div className="font-bold text-gray-800 dark:text-white">{subject?.name || 'Ismeretlen tantárgy'}</div>
      <div className="text-sm text-gray-600 dark:text-gray-300">Osztály: {targetClass?.name || 'N/A'}</div>
      <div className="text-sm text-blue-600 dark:text-blue-400 font-semibold mt-1">
        Heti óraszám: {lesson.remainingHours} / {lesson.allocation.weeklyHours}
      </div>
    </div>
  );
};

interface PlacedLessonCardProps {
    lesson: PlacedLesson;
    findClass: (id: string) => Class | undefined;
    findSubject: (id: string) => Subject | undefined;
    findTeacher: (id: string) => Teacher | undefined;
    onRemove: (lessonId: string) => void;
    viewType: 'teacher' | 'class';
    isParallel: boolean;
}

export const PlacedLessonCard: React.FC<PlacedLessonCardProps> = ({ lesson, findClass, findSubject, findTeacher, onRemove, viewType, isParallel }) => {
    const subject = findSubject(lesson.allocation.subjectId);
    const targetClass = findClass(lesson.allocation.classId);
    const teacher = findTeacher(lesson.allocation.teacherId);

    const mainText = viewType === 'teacher' ? targetClass?.name : teacher?.name;
    const subText = subject?.name;
    
    const backgroundColor = teacher?.color || 'bg-gray-500';

    const rawGroup = (lesson.allocation.originalGroup || '').trim();
    let groupBadge = '';
    if (rawGroup) {
      if (/^[AB]\s+csoport/i.test(rawGroup)) {
        groupBadge = rawGroup.substring(0, 1).toUpperCase() + ' csop.';
      } else if (/napköz/i.test(rawGroup)) {
        groupBadge = 'Napközi';
      } else if (/etika|hit/i.test(rawGroup) || /etika|hit/i.test(subText || '')) {
        const isHittan = /hittan/i.test(teacher?.name || '') || /hittan/i.test(rawGroup);
        const matchNum = rawGroup.match(/\d+/);
        const numSuffix = matchNum ? ` ${matchNum[0]}` : '';
        groupBadge = isHittan ? `Hittan${numSuffix}` : `Etika${numSuffix}`;
      } else if (/^(11|12)\s+csoport/i.test(rawGroup)) {
        groupBadge = rawGroup;
      } else if (!rawGroup.toLowerCase().includes('osztály') && rawGroup.length <= 15) {
        groupBadge = rawGroup;
      }
    }

    const cardClasses = isParallel
        ? `relative p-1 ${backgroundColor} text-white rounded shadow-md flex flex-col justify-center items-center text-center leading-tight overflow-hidden flex-grow basis-[48%] min-h-[48%]`
        : `relative w-full h-full p-2 ${backgroundColor} text-white rounded-md shadow-lg flex flex-col justify-center items-center text-center leading-tight overflow-hidden`;
    
    const mainTextSize = isParallel ? 'text-xxs' : 'text-xs';
    const subTextSize = isParallel ? 'text-[0.6rem] leading-[0.7rem]' : 'text-xxs';

    const roomInfo = lesson.room ? ` [${lesson.room}]` : '';
    const cardTitle = `${mainText || ''} - ${subText || ''}${rawGroup ? ` (${rawGroup})` : ''}${roomInfo}`;

    return (
        <div className={`PlacedLessonCard ${cardClasses}`}>
            <button
                onClick={() => onRemove(lesson.id)}
                className="absolute top-0.5 right-0.5 p-0.5 bg-red-600 rounded-full text-white hover:bg-red-700 transition-colors opacity-80 hover:opacity-100 z-10"
                aria-label="Óra törlése"
            >
                <TrashIcon className="w-3 h-3"/>
            </button>
            <div title={cardTitle} className={`font-bold ${mainTextSize} truncate w-full`}>{mainText}</div>
            <div title={cardTitle} className={`${subTextSize} truncate w-full flex items-center justify-center gap-1`}>
                <span className="truncate">{subText}</span>
                {groupBadge && (
                    <span className="shrink-0 text-[0.75em] font-semibold bg-black/35 text-white/95 px-1 py-0.2 rounded border border-white/20">
                        {groupBadge}
                    </span>
                )}
            </div>
        </div>
    );
};