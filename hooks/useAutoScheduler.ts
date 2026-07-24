import { useState, useCallback, useRef } from 'react';
import { useTimetable } from '../contexts/TimetableContext.tsx';
import type { Allocation, PlacedLesson, Teacher } from '../types.ts';

interface Chromosome {
  genes: {
    allocation: Allocation;
    day: number;
    period: number;
  }[];
  fitness: number;
}

export const useAutoScheduler = () => {
  const { currentState, setPlacedLessons } = useTimetable();
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentPhase, setCurrentPhase] = useState<number>(0); // 0, 1, 2, 3
  const [waitingForNextPhase, setWaitingForNextPhase] = useState<boolean>(false);
  const [hasRun, setHasRun] = useState<boolean>(false);
  const [phaseStats, setPhaseStats] = useState<{ g1Count: number; g2Count: number; g3Count: number }>({
    g1Count: 0,
    g2Count: 0,
    g3Count: 0
  });

  // Stored state between phases
  const phaseGroupsRef = useRef<{
    g1: Allocation[];
    g2: Allocation[];
    g3: Allocation[];
    initialPreserved: PlacedLesson[];
    resetAll: boolean;
  }>({ g1: [], g2: [], g3: [], initialPreserved: [], resetAll: true });

  const currentAccumulatedPlacedRef = useRef<PlacedLesson[]>([]);

  // Partition allocations into 3 groups
  const partitionAllocations = useCallback((activeAllocations: Allocation[]) => {
    const teacherClassCounts = new Map<string, Set<string>>();
    activeAllocations.forEach(a => {
      if (!teacherClassCounts.has(a.teacherId)) {
        teacherClassCounts.set(a.teacherId, new Set());
      }
      teacherClassCounts.get(a.teacherId)!.add(a.classId);
    });

    const singleClassTeacherIds = new Set<string>();
    const multiClassTeachers: { teacherId: string; classCount: number; hours: number }[] = [];

    teacherClassCounts.forEach((classesSet, teacherId) => {
      if (classesSet.size === 1) {
        singleClassTeacherIds.add(teacherId);
      } else {
        const totalHours = activeAllocations
          .filter(a => a.teacherId === teacherId)
          .reduce((sum, a) => sum + (a.weeklyHours || 1), 0);
        multiClassTeachers.push({
          teacherId,
          classCount: classesSet.size,
          hours: totalHours
        });
      }
    });

    multiClassTeachers.sort((a, b) => b.classCount - a.classCount || b.hours - a.hours);

    const halfCount = Math.max(1, Math.ceil(multiClassTeachers.length / 2));
    const group2TeacherIds = new Set(
      multiClassTeachers.slice(0, halfCount).map(t => t.teacherId)
    );

    const g1: Allocation[] = [];
    const g2: Allocation[] = [];
    const g3: Allocation[] = [];

    activeAllocations.forEach(a => {
      if (singleClassTeacherIds.has(a.teacherId)) {
        g1.push(a);
      } else if (group2TeacherIds.has(a.teacherId)) {
        g2.push(a);
      } else {
        g3.push(a);
      }
    });

    return { g1, g2, g3 };
  }, []);

  // Run CP-SAT for a specific phase
  const runPhaseSolve = async (
    phaseNum: number,
    phaseAllocations: Allocation[],
    preservedLessons: PlacedLesson[]
  ): Promise<PlacedLesson[] | null> => {
    if (!currentState) return null;
    const { allocations, teachers, classes, subjects } = currentState;

    try {
      const res = await fetch('/api/solve-timetable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allocations: phaseAllocations,
          teachers,
          classes,
          subjects,
          preservedLessons: preservedLessons.map(l => ({
            allocationId: l.allocation.id,
            day: l.day,
            period: l.period
          }))
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.status === 'OPTIMAL' || data.status === 'FEASIBLE') {
          console.log(`[auto-scheduler] Phase ${phaseNum} solved successfully:`, data.status);
          const newPlacedLessons: PlacedLesson[] = [];

          data.placedLessons.forEach((item: any) => {
            const alloc = allocations.find(a => a.id === item.allocationId);
            if (alloc) {
              newPlacedLessons.push({
                id: `${alloc.id}-${crypto.randomUUID()}`,
                allocation: alloc,
                day: item.day,
                period: item.period
              });
            }
          });

          return newPlacedLessons;
        } else {
          const msg = data.message || 'Ismeretlen hiba';
          console.error(`[auto-scheduler] Phase ${phaseNum} CP-SAT INFEASIBLE:`, msg);
          alert(`❌ Hiba a(z) ${phaseNum}. csoport generálásakor.\n\nOk: ${msg}\n\nEllenőrizd az allokációkat és a szabályokat!`);
          return null;
        }
      } else {
        alert(`❌ Az órarend-generáló szerver hibát adott vissza a(z) ${phaseNum}. csoportnál (HTTP ${res.status}).`);
        return null;
      }
    } catch (err) {
      console.error(`[auto-scheduler] Phase ${phaseNum} API error:`, err);
      alert('❌ Nem sikerült elérni az órarend-generáló szervert. Ellenőrizd a kapcsolatot!');
      return null;
    }
  };

  // Start 3-Phase Generation (Phase 1)
  const generateTimetable = useCallback(async (options: { resetAll: boolean }) => {
    if (!currentState) return;
    setIsGenerating(true);
    setProgress(10);
    setCurrentPhase(1);
    setWaitingForNextPhase(false);
    setHasRun(false);

    const { allocations, placedLessons, teachers } = currentState;

    const activeAllocations = allocations.filter(a => {
      const teacher = teachers.find(t => t.id === a.teacherId);
      return !teacher?.isTraveling;
    });

    const initialPreserved = options.resetAll
      ? placedLessons.filter(l => {
          const teacher = teachers.find(t => t.id === l.allocation.teacherId);
          return teacher?.isTraveling;
        })
      : [...placedLessons];

    const { g1, g2, g3 } = partitionAllocations(activeAllocations);
    phaseGroupsRef.current = { g1, g2, g3, initialPreserved, resetAll: options.resetAll };

    setPhaseStats({
      g1Count: g1.reduce((s, a) => s + (a.weeklyHours || 1), 0),
      g2Count: g2.reduce((s, a) => s + (a.weeklyHours || 1), 0),
      g3Count: g3.reduce((s, a) => s + (a.weeklyHours || 1), 0)
    });

    setProgress(25);

    // Run Phase 1
    const result1 = await runPhaseSolve(1, g1, initialPreserved);
    if (result1) {
      currentAccumulatedPlacedRef.current = result1;
      setPlacedLessons(result1);
      setProgress(33);
      setIsGenerating(false);
      setWaitingForNextPhase(true);
    } else {
      setIsGenerating(false);
      setProgress(0);
      setCurrentPhase(0);
    }
  }, [currentState, partitionAllocations, setPlacedLessons]);

  // Proceed to next phase (Phase 2 or Phase 3)
  const proceedToNextPhase = useCallback(async () => {
    if (currentPhase === 1) {
      // Start Phase 2
      setIsGenerating(true);
      setWaitingForNextPhase(false);
      setCurrentPhase(2);
      setProgress(45);

      const { g2 } = phaseGroupsRef.current;
      const currentPreserved = currentAccumulatedPlacedRef.current;

      const result2 = await runPhaseSolve(2, g2, currentPreserved);
      if (result2) {
        currentAccumulatedPlacedRef.current = result2;
        setPlacedLessons(result2);
        setProgress(66);
        setIsGenerating(false);
        setWaitingForNextPhase(true);
      } else {
        setIsGenerating(false);
      }
    } else if (currentPhase === 2) {
      // Start Phase 3
      setIsGenerating(true);
      setWaitingForNextPhase(false);
      setCurrentPhase(3);
      setProgress(80);

      const { g3 } = phaseGroupsRef.current;
      const currentPreserved = currentAccumulatedPlacedRef.current;

      const result3 = await runPhaseSolve(3, g3, currentPreserved);
      if (result3) {
        currentAccumulatedPlacedRef.current = result3;
        setPlacedLessons(result3);
        setProgress(100);
        setIsGenerating(false);
        setWaitingForNextPhase(false);
        setHasRun(true);
      } else {
        setIsGenerating(false);
      }
    }
  }, [currentPhase, setPlacedLessons]);

  const cancelGeneration = useCallback(() => {
    setIsGenerating(false);
    setWaitingForNextPhase(false);
    setCurrentPhase(0);
    setProgress(0);
    setHasRun(false);
  }, []);

  return {
    isGenerating,
    progress,
    currentPhase,
    waitingForNextPhase,
    hasRun,
    phaseStats,
    generateTimetable,
    proceedToNextPhase,
    cancelGeneration
  };
};

