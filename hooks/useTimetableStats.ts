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
        const totalHours = teacherAllocations.reduce((sum, alloc) => sum + alloc.weeklyHours, 0);
        const placedHours = teacherAllocations.reduce((sum, alloc) => sum + (placedCounts.get(alloc.id) || 0), 0);
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
