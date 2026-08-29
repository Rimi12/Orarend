import React, { useState, useMemo, useEffect } from 'react';
import { useTimetable } from '../contexts/TimetableContext.tsx';
import { DAYS_OF_WEEK } from '../constants.ts';
import type { PlacedLesson, Teacher } from '../types.ts';
import { getTeacherPrimaryRoom, resolveLessonRoom } from '../kretaTemplateData.ts';
import { Squares2X2Icon } from './icons/Squares2X2Icon.tsx';

export interface LessonRoomItem {
  lesson: PlacedLesson;
  dayName: string;
  period: number;
  className: string;
  groupName: string;
  subjectName: string;
  teacherName: string;
  room: string;
  isCertain: boolean;
  reason: string;
}

interface KretaExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  teacher?: Teacher;
  lessons: PlacedLesson[];
  onConfirmExport: (lessonRoomsMap: Record<string, string>, fileName?: string) => void;
}

export const KretaExportModal: React.FC<KretaExportModalProps> = ({
  isOpen,
  onClose,
  teacher,
  lessons,
  onConfirmExport
}) => {
  const { currentState, findClass, findSubject, findTeacher, rooms } = useTimetable();

  // Calculate teacher primary room info
  const primaryInfo = useMemo(() => {
    if (!teacher || !currentState) return null;
    return getTeacherPrimaryRoom(
      teacher.id,
      currentState.placedLessons,
      currentState.classes,
      rooms
    );
  }, [teacher, currentState, rooms]);

  // Initial room mapping for all lessons in modal
  const [roomSelections, setRoomSelections] = useState<Record<string, string>>({});
  const [globalRoom, setGlobalRoom] = useState<string>('');
  const [filterAmbiguousOnly, setFilterAmbiguousOnly] = useState(false);

  // Initialize lesson items
  const lessonItems: LessonRoomItem[] = useMemo(() => {
    if (!currentState) return [];
    const classes = currentState.classes;
    const subjects = currentState.subjects;
    const defaultTeacherRoom = primaryInfo?.primaryRoom || rooms[0] || '1. osztály';

    return lessons.map(lesson => {
      const origClass = lesson.allocation.originalClass || '';
      const origGroup = lesson.allocation.originalGroup || '';
      const resolvedClass = findClass(lesson.allocation.classId)?.name || '';
      const className = origClass || (resolvedClass.includes('csoport') ? '' : resolvedClass);
      const groupName = origGroup || (resolvedClass.includes('csoport') ? resolvedClass : '');
      const subjectObj = findSubject(lesson.allocation.subjectId);
      const subjectName = subjectObj?.name || 'N/A';
      const teacherObj = findTeacher(lesson.allocation.teacherId);
      const teacherName = teacherObj?.name || 'N/A';

      const resolved = resolveLessonRoom(
        lesson,
        defaultTeacherRoom,
        classes,
        subjects,
        rooms
      );

      const assignedRoom = roomSelections[lesson.id] ?? resolved.room;

      return {
        lesson,
        dayName: DAYS_OF_WEEK[lesson.day] || '',
        period: lesson.period + 1,
        className,
        groupName,
        subjectName,
        teacherName,
        room: assignedRoom,
        isCertain: resolved.isCertain,
        reason: resolved.reason
      };
    }).sort((a, b) => {
      if (a.lesson.day !== b.lesson.day) return a.lesson.day - b.lesson.day;
      return a.lesson.period - b.lesson.period;
    });
  }, [lessons, currentState, primaryInfo, rooms, roomSelections, findClass, findSubject, findTeacher]);

  // Set default global room to primary room
  useEffect(() => {
    if (primaryInfo?.primaryRoom) {
      setGlobalRoom(primaryInfo.primaryRoom);
    } else if (rooms.length > 0) {
      setGlobalRoom(rooms[0]);
    }
  }, [primaryInfo, rooms]);

  if (!isOpen) return null;

  const handleRoomChange = (lessonId: string, room: string) => {
    setRoomSelections(prev => ({
      ...prev,
      [lessonId]: room
    }));
  };

  const handleApplyGlobalRoom = () => {
    if (!globalRoom) return;
    const updated: Record<string, string> = { ...roomSelections };
    lessons.forEach(l => {
      updated[l.id] = globalRoom;
    });
    setRoomSelections(updated);
  };

  const handleApplyTeacherPrimaryRoom = () => {
    if (!primaryInfo?.primaryRoom) return;
    const updated: Record<string, string> = { ...roomSelections };
    lessons.forEach(l => {
      // Keep special rooms like Tornaterem, Informatika, etc., but update general classes
      const sName = (findSubject(l.allocation.subjectId)?.name || '').toLowerCase();
      if (!sName.includes('testnevelés') && !sName.includes('mozgás') && !sName.includes('informatika') && !sName.includes('úszás')) {
        updated[l.id] = primaryInfo.primaryRoom;
      }
    });
    setRoomSelections(updated);
  };

  const displayedLessons = filterAmbiguousOnly
    ? lessonItems.filter(item => !item.isCertain)
    : lessonItems;

  const ambiguousCount = lessonItems.filter(item => !item.isCertain).length;

  const handleExport = () => {
    const finalMap: Record<string, string> = {};
    lessonItems.forEach(item => {
      finalMap[item.lesson.id] = roomSelections[item.lesson.id] || item.room;
    });
    onConfirmExport(finalMap);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden border border-gray-200 dark:border-gray-700">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between bg-gray-50 dark:bg-gray-800/80">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-cyan-100 dark:bg-cyan-900/50 text-cyan-600 dark:text-cyan-300 rounded-lg">
              <Squares2X2Icon className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <span>Kréta Import Export Ellenőrzés</span>
                {teacher && (
                  <span className="text-sm font-normal text-cyan-700 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-950/60 px-2.5 py-0.5 rounded-full border border-cyan-200 dark:border-cyan-800">
                    {teacher.name} ({lessons.length} óra)
                  </span>
                )}
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Kérjük ellenőrizd az órákhoz rendelt Kréta helyiségneveket az import fájl elkészítése előtt!
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg text-lg leading-none"
          >
            ✕
          </button>
        </div>

        {/* Primary Room & Quick Controls Banner */}
        <div className="p-5 bg-cyan-50/50 dark:bg-cyan-950/20 border-b border-cyan-100 dark:border-cyan-900/40 space-y-3">
          {primaryInfo && (
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                <span className="font-semibold text-gray-900 dark:text-white">Alapértelmezett osztályterem:</span>
                <span className="px-2.5 py-1 bg-white dark:bg-gray-700 rounded-lg border border-cyan-200 dark:border-cyan-800 font-medium text-cyan-700 dark:text-cyan-300">
                  {primaryInfo.primaryRoom} ({primaryInfo.hourCount} óra itt: {primaryInfo.primaryClassName || 'osztály'})
                </span>
                {primaryInfo.isAmbiguous && (
                  <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded border border-amber-300 dark:border-amber-700">
                    ⚠️ Több osztályban azonos óraszám
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleApplyTeacherPrimaryRoom}
                  className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-semibold rounded-lg transition-colors shadow-sm"
                  title="A pedagógus fő osztálytermének beállítása minden általános órára"
                >
                  Fő osztályterem ({primaryInfo.primaryRoom}) alkalmazása
                </button>
              </div>
            </div>
          )}

          {/* Mass room setter & filter */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-cyan-100/60 dark:border-cyan-900/40">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Minden óra helyisége legyen:</span>
              <select
                value={globalRoom}
                onChange={e => setGlobalRoom(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-xs text-gray-900 dark:text-white focus:ring-2 focus:ring-cyan-500 outline-none"
              >
                {rooms.map(r => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleApplyGlobalRoom}
                className="px-3 py-1.5 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 text-xs font-semibold rounded-lg transition-colors"
              >
                Alkalmaz mindegyikre
              </button>
            </div>

            {ambiguousCount > 0 && (
              <label className="flex items-center gap-2 text-xs font-medium text-amber-700 dark:text-amber-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filterAmbiguousOnly}
                  onChange={e => setFilterAmbiguousOnly(e.target.checked)}
                  className="rounded border-amber-400 text-amber-600 focus:ring-amber-500"
                />
                <span>Csak az ellenőrizendő órák mutatása ({ambiguousCount} óra)</span>
              </label>
            )}
          </div>
        </div>

        {/* Table of Lessons */}
        <div className="flex-1 overflow-y-auto max-h-[52vh] p-4">
          <table className="w-full text-left text-sm border-collapse">
            <thead className="bg-gray-100 dark:bg-gray-700 text-xs font-semibold text-gray-600 dark:text-gray-300 sticky top-0 z-10">
              <tr>
                <th className="py-2.5 px-3 rounded-l-lg">Nap & Óra</th>
                <th className="py-2.5 px-3">Osztály / Csoport</th>
                <th className="py-2.5 px-3">Tantárgy</th>
                <th className="py-2.5 px-3 rounded-r-lg">Kréta Helyiség (Terem)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {displayedLessons.map(item => {
                const isSelectedCustom = roomSelections[item.lesson.id] !== undefined;
                return (
                  <tr
                    key={item.lesson.id}
                    className={`hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors ${
                      !item.isCertain && !isSelectedCustom ? 'bg-amber-50/40 dark:bg-amber-950/20' : ''
                    }`}
                  >
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <span className="font-semibold text-gray-800 dark:text-gray-200">{item.dayName}</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400 ml-1.5 font-mono">{item.period}. óra</span>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="font-medium text-gray-900 dark:text-white">
                        {item.className || item.groupName || '—'}
                      </div>
                      {item.className && item.groupName && (
                        <div className="text-xs text-gray-400">{item.groupName}</div>
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="text-gray-800 dark:text-gray-200">{item.subjectName}</span>
                    </td>
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-2">
                        <select
                          value={item.room}
                          onChange={e => handleRoomChange(item.lesson.id, e.target.value)}
                          className="w-56 px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs focus:ring-2 focus:ring-cyan-500 outline-none"
                        >
                          {rooms.map(r => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                        {!item.isCertain && !isSelectedCustom ? (
                          <span
                            className="text-xs text-amber-600 dark:text-amber-400 font-semibold px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60"
                            title={item.reason}
                          >
                            ⚠️ Ellenőrizd
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400" title={item.reason}>
                            ✓
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800/80 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Összesen: <strong className="text-gray-700 dark:text-gray-300">{lessons.length} óra</strong> kerül exportálásra.
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 text-gray-700 dark:text-gray-200 font-semibold text-sm rounded-lg transition-colors"
            >
              Mégse
            </button>
            <button
              type="button"
              onClick={handleExport}
              className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-700 text-white font-semibold text-sm rounded-lg transition-colors flex items-center gap-2 shadow-sm hover:scale-[1.01] active:scale-[0.99]"
            >
              <Squares2X2Icon className="w-5 h-5" />
              <span>Kréta Excel letöltése és mentése (.xlsx)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
