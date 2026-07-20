import React from 'react';
import type { ParallelLessonConfirmation, Teacher, Class, Subject } from '../types.ts';
import { ExclamationTriangleIcon } from './icons/ExclamationTriangleIcon.tsx';

interface ParallelLessonModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  confirmationData: ParallelLessonConfirmation | null;
  findTeacher: (id: string) => Teacher | undefined;
  findClass: (id: string) => Class | undefined;
  findSubject: (id: string) => Subject | undefined;
}

export const ParallelLessonModal: React.FC<ParallelLessonModalProps> = ({ 
    isOpen, onClose, onConfirm, confirmationData, findTeacher, findClass, findSubject 
}) => {
  if (!isOpen || !confirmationData) return null;
  
  const { allocation, collision, existingLessons } = confirmationData;

  const newLessonTeacher = findTeacher(allocation.teacherId);
  const newLessonClass = findClass(allocation.classId);
  const newLessonSubject = findSubject(allocation.subjectId);

  const renderCollisionInfo = () => {
    const teacherConflict = collision.teacher && existingLessons.some(l => l.allocation.teacherId === allocation.teacherId);
    const classConflict = collision.class && existingLessons.some(l => l.allocation.classId === allocation.classId);
    
    let messages = [];

    if (teacherConflict) {
        messages.push(<span key="t">A(z) <strong>{newLessonTeacher?.name}</strong> tanárnak</span>);
    }
    if (classConflict) {
        messages.push(<span key="c">A(z) <strong>{newLessonClass?.name}</strong> osztálynak</span>);
    }

    if (messages.length === 0) return "Ütközés történt.";

    const joinedMessage = messages.reduce((prev, curr, i) => [prev, (i > 0 ? ' és ' : ''), curr], [] as any);
    
    return <>{joinedMessage} ebben az idősávban már van órája.</>;
  }


  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 max-w-2xl w-full transform transition-all" onClick={e => e.stopPropagation()}>
        <div className="flex items-start">
            <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-yellow-100 dark:bg-yellow-900/30 sm:mx-0 sm:h-10 sm:w-10">
                <ExclamationTriangleIcon className="h-6 w-6 text-yellow-600 dark:text-yellow-400" aria-hidden="true" />
            </div>
            <div className="ml-4 text-left">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white" id="modal-title">Ütközés észlelve</h2>
                <div className="mt-2">
                    <p className="text-base text-gray-600 dark:text-gray-400">
                        {renderCollisionInfo()}
                    </p>
                </div>
            </div>
        </div>

        <div className="mt-6 space-y-4">
            <div>
                <h3 className="font-semibold text-gray-800 dark:text-gray-200">Felvenni kívánt óra:</h3>
                <div className="mt-1 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-blue-800 dark:text-blue-200">
                    <strong>{newLessonTeacher?.name}</strong> - {newLessonClass?.name} - {newLessonSubject?.name}
                </div>
            </div>
             <div>
                <h3 className="font-semibold text-gray-800 dark:text-gray-200">Már meglévő óra(k) az idősávban:</h3>
                <ul className="mt-1 space-y-1">
                {existingLessons.map(lesson => (
                    <li key={lesson.id} className="p-3 bg-gray-100 dark:bg-gray-700/50 rounded-lg">
                        <strong>{findTeacher(lesson.allocation.teacherId)?.name}</strong> - {findClass(lesson.allocation.classId)?.name} - {findSubject(lesson.allocation.subjectId)?.name}
                    </li>
                ))}
                </ul>
            </div>
        </div>

        <p className="mt-6 text-sm text-gray-500 dark:text-gray-400">
          Biztosan fel szeretné venni az új órát párhuzamosan a meglévővel? Ez a funkció differenciált oktatás esetén hasznos.
        </p>

        <div className="mt-8 flex justify-end gap-4">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2 bg-gray-200 text-gray-800 font-semibold rounded-lg hover:bg-gray-300 dark:bg-gray-600 dark:text-gray-200 dark:hover:bg-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-400 transition-colors duration-200"
          >
            Mégse
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-6 py-2 bg-yellow-500 text-white font-semibold rounded-lg hover:bg-yellow-600 focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:ring-opacity-50 transition-colors duration-200"
          >
            Párhuzamos óra felvétele
          </button>
        </div>
      </div>
    </div>
  );
};
