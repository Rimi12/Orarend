import { useMemo } from 'react';
import type { Teacher, PlacedLesson, Allocation } from '../types.ts';

export const useTimetableStats = (
  currentState: { allocations: Allocation[], placedLessons: PlacedLesson[] } | null,
  sortedTeachers: Teacher[],
  selectedTeacherId: string | null,
  findTeacher: (id: string) => Teacher | undefined,
  getUnplacedLessonsForTeacher: (teacherId: string) => any[]
) => {
  const teacherHourCounts = useMemo(() => {
    if (!currentState) return [];
    const { allocations, placedLessons } = currentState;
    
    const placedCounts = new Map<string, number>();
    placedLessons.forEach(lesson => {
        const allocationId = lesson.allocation.id;
        placedCounts.set(allocationId, (placedCounts.get(allocationId) || 0) + 1);
    });

    return sortedTeachers.map(teacher => {
        const teacherAllocations = allocations.filter(a => a.teacherId === teacher.id);

        // A pedagógus által fizikailag megtartott egyedi idősávok száma (valós tanítási órák)
        const distinctTeachingSlots = new Set(
          placedLessons
            .filter(l => l.allocation?.teacherId === teacher.id)
            .map(l => `${l.day}_${l.period}`)
        );
        const placedHours = distinctTeachingSlots.size;

        // Allokált heti órák összege
        let totalHours = teacherAllocations.reduce((sum, alloc) => sum + alloc.weeklyHours, 0);

        // Ha a pedagógus egyidejűleg több csoportnak tart órát egy osztályban (pl. Autista összevont A és B csoport),
        // az allokációk összege meghaladja a tényleges idősávok számát. Ha minden órája el van helyezve (vagy csak órarendből lett beolvasva),
        // a valós heti óraszáma a ténylegesen megtartott egyedi idősávok száma (pl. Magyarosi Etelka: 24/24).
        if (totalHours > placedHours && placedHours > 0) {
          const unplacedForTeacher = teacherAllocations.reduce((sum, alloc) => {
            const placedCount = placedCounts.get(alloc.id) || 0;
            return sum + Math.max(0, alloc.weeklyHours - placedCount);
          }, 0);
          if (unplacedForTeacher === 0) {
            totalHours = placedHours;
          }
        }

        return {
            ...teacher,
            display: `${teacher.name} (${placedHours}/${totalHours})`
        };
    });
  }, [currentState, sortedTeachers]);

  const unplacedLessons = useMemo(() => {
    if (!currentState) return [];
    const selectedTeacher = selectedTeacherId ? findTeacher(selectedTeacherId) : null;
    return selectedTeacher ? getUnplacedLessonsForTeacher(selectedTeacher.id) : [];
  }, [currentState, findTeacher, getUnplacedLessonsForTeacher, selectedTeacherId]);

  const totalRemainingHours = useMemo(() => {
    return unplacedLessons.reduce((sum, lesson) => sum + lesson.remainingHours, 0);
  }, [unplacedLessons]);

  return {
    teacherHourCounts,
    unplacedLessons,
    totalRemainingHours
  };
};
