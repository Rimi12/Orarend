import React from 'react';
import type { AllocationUpdateSummary, Teacher, Class, Subject } from '../types.ts';

interface UpdateAllocationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  summary: AllocationUpdateSummary;
  findTeacher: (id: string) => Teacher | undefined;
  findClass: (id: string) => Class | undefined;
  findSubject: (id: string) => Subject | undefined;
}

export const UpdateAllocationModal: React.FC<UpdateAllocationModalProps> = ({ 
    isOpen, onClose, onConfirm, summary, findTeacher, findClass, findSubject 
}) => {
  if (!isOpen) return null;

  const totalChanges = 
    summary.newTeachers.length + summary.removedTeachers.length +
    summary.newClasses.length + summary.removedClasses.length +
    summary.newSubjects.length + summary.removedSubjects.length +
    summary.newAllocations.length + summary.removedAllocations.length +
    summary.modifiedAllocations.length;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 max-w-4xl w-full transform transition-all" onClick={e => e.stopPropagation()}>
        <h2 className="text-2xl font-bold mb-2 text-gray-900 dark:text-white">Tantárgyfelosztás frissítése</h2>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          A rendszer összehasonlította a jelenlegi állapotot a feltöltött fájllal. Kérjük, erősítse meg a változtatásokat.
        </p>

        {totalChanges === 0 && summary.lessonsToRemove.length === 0 ? (
            <div className="text-center p-6 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <p className="text-lg font-semibold text-green-800 dark:text-green-200">Nem található változás a tantárgyfelosztásban.</p>
            </div>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto space-y-6 pr-4 -mr-4">
            {summary.lessonsToRemove.length > 0 && (
                <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-700 rounded-lg">
                    <h3 className="font-bold text-red-800 dark:text-red-200 mb-2">Figyelem! A következő {summary.lessonsToRemove.length} óra törlődni fog az órarendből:</h3>
                    <ul className="list-disc list-inside text-sm text-red-700 dark:text-red-300 space-y-1 max-h-40 overflow-y-auto">
                        {summary.lessonsToRemove.map(lesson => {
                            const teacher = findTeacher(lesson.allocation.teacherId);
                            const subject = findSubject(lesson.allocation.subjectId);
                            const tClass = findClass(lesson.allocation.classId);
                            return <li key={lesson.id}>{teacher?.name} - {tClass?.name} - {subject?.name}</li>
                        })}
                    </ul>
                </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                <SummarySection title="Új tanárok" items={summary.newTeachers} color="green" />
                <SummarySection title="Törölt tanárok" items={summary.removedTeachers} color="red" />
                <SummarySection title="Új osztályok" items={summary.newClasses} color="green" />
                <SummarySection title="Törölt osztályok" items={summary.removedClasses} color="red" />
                <SummarySection title="Új tantárgyak" items={summary.newSubjects} color="green" />
                <SummarySection title="Törölt tantárgyak" items={summary.removedSubjects} color="red" />
            </div>

            {(summary.newAllocations.length > 0 || summary.removedAllocations.length > 0 || summary.modifiedAllocations.length > 0) && (
              <div>
                <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-2">Felosztás változások</h3>
                <div className="space-y-2 text-sm">
                  {summary.newAllocations.map(alloc => (
                      <div key={alloc.id} className="p-2 rounded bg-green-50 dark:bg-green-900/20">ÚJ: {findTeacher(alloc.teacherId)?.name} - {findClass(alloc.classId)?.name} - {findSubject(alloc.subjectId)?.name} ({alloc.weeklyHours} óra)</div>
                  ))}
                   {summary.removedAllocations.map(alloc => (
                      <div key={alloc.id} className="p-2 rounded bg-red-50 dark:bg-red-900/20">TÖRÖLT: {findTeacher(alloc.teacherId)?.name} - {findClass(alloc.classId)?.name} - {findSubject(alloc.subjectId)?.name} ({alloc.weeklyHours} óra)</div>
                  ))}
                  {summary.modifiedAllocations.map(({old: oldAlloc, new: newAlloc}) => (
                      <div key={oldAlloc.id} className="p-2 rounded bg-yellow-50 dark:bg-yellow-900/20">MÓDOSULT: {findTeacher(oldAlloc.teacherId)?.name} - {findClass(oldAlloc.classId)?.name} - {findSubject(oldAlloc.subjectId)?.name} ({oldAlloc.weeklyHours} → {newAlloc.weeklyHours} óra)</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        
        <div className="mt-8 flex justify-end gap-4">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-gray-200 text-gray-800 font-semibold rounded-lg hover:bg-gray-300 dark:bg-gray-600 dark:text-gray-200 dark:hover:bg-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-400 transition-colors duration-200"
          >
            Mégse
          </button>
          <button
            onClick={onConfirm}
            className="px-6 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 transition-colors duration-200 disabled:bg-gray-400"
            disabled={totalChanges === 0 && summary.lessonsToRemove.length === 0}
          >
            Változtatások megerősítése
          </button>
        </div>
      </div>
    </div>
  );
};

interface SummarySectionProps {
    title: string;
    items: {name: string}[];
    color: 'green' | 'red';
}

const SummarySection: React.FC<SummarySectionProps> = ({ title, items, color }) => {
    if (items.length === 0) return null;
    const bgColor = color === 'green' ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20';
    const textColor = color === 'green' ? 'text-green-800 dark:text-green-200' : 'text-red-800 dark:text-red-200';
    return (
        <div className={`p-3 rounded-lg ${bgColor}`}>
            <h4 className={`font-bold mb-1 ${textColor}`}>{title} ({items.length})</h4>
            <ul className="list-disc list-inside">
                {items.map(item => <li key={item.name}>{item.name}</li>)}
            </ul>
        </div>
    );
};