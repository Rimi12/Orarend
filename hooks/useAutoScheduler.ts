import { useState, useCallback, useRef, useEffect } from 'react';
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

  // Partition allocations into 3 groups (Group 1: Óvoda + 1-4. osztályok & tanáraik minden órája, Group 2: Felsősök 5-8, Group 3: Középiskola/Szakiskola/Egyéb)
  const partitionAllocations = useCallback((activeAllocations: Allocation[]) => {
    if (!currentState) return { g1: [], g2: [], g3: [] };
    const { classes } = currentState;

    const isLowerGradeClass = (className: string): boolean => {
      const name = className.toLowerCase().trim();
      if (name.includes('óvoda') || name.includes('ovoda')) return true;
      if (/\b(1|2|3|4)(\.|\/|[a-z]|\s|$)/.test(name)) {
        if (!/\b(10|11|12|14|15|16|17|18|19|20|5|6|7|8|9)\b/.test(name)) {
          return true;
        }
      }
      if (name.includes('hit-') || name.includes('etika')) {
        if (/\b[1-4]\b/.test(name)) return true;
      }
      return false;
    };

    const isUpperGradeClass = (className: string): boolean => {
      return /\b(5|6|7|8)\b/.test(className.toLowerCase());
    };

    const lowerClassIds = new Set(
      classes.filter(c => isLowerGradeClass(c.name)).map(c => c.id)
    );

    // Find all teachers who teach in Óvoda or 1-4 grades
    const phase1TeacherIds = new Set<string>();
    activeAllocations.forEach(a => {
      if (lowerClassIds.has(a.classId)) {
        phase1TeacherIds.add(a.teacherId);
      }
    });

    const g1: Allocation[] = [];
    const g2: Allocation[] = [];
    const g3: Allocation[] = [];

    activeAllocations.forEach(a => {
      const className = classes.find(c => c.id === a.classId)?.name || '';
      if (phase1TeacherIds.has(a.teacherId)) {
        // Pedagógusok akik alsósokban is tanítanak: az összes órájuk az 1. csoportba kerül
        g1.push(a);
      } else if (isUpperGradeClass(className)) {
        // Felsős osztályok (5-8) tanárai: 2. csoport
        g2.push(a);
      } else {
        // Középiskola / Szakiskola / Egyéb: 3. csoport
        g3.push(a);
      }
    });

    return { g1, g2, g3 };
  }, [currentState]);

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

  // Calculate current placement status per group
  const getGroupPlacementStatus = useCallback(() => {
    if (!currentState) {
      return {
        g1Placed: 0, g1Total: 0,
        g2Placed: 0, g2Total: 0,
        g3Placed: 0, g3Total: 0,
        recommendedStartPhase: 1
      };
    }

    const { allocations, placedLessons, teachers } = currentState;
    const activeAllocations = allocations.filter(a => {
      const teacher = teachers.find(t => t.id === a.teacherId);
      return !teacher?.isTraveling;
    });

    const { g1, g2, g3 } = partitionAllocations(activeAllocations);

    const placedAllocIds = new Set(placedLessons.map(l => l.allocation.id));

    const getPlacedHours = (group: Allocation[]) =>
      group.filter(a => placedAllocIds.has(a.id)).reduce((sum, a) => sum + (a.weeklyHours || 1), 0);

    const getTotalHours = (group: Allocation[]) =>
      group.reduce((sum, a) => sum + (a.weeklyHours || 1), 0);

    const g1Placed = getPlacedHours(g1);
    const g1Total = getTotalHours(g1);
    const g2Placed = getPlacedHours(g2);
    const g2Total = getTotalHours(g2);
    const g3Placed = getPlacedHours(g3);
    const g3Total = getTotalHours(g3);

    let recommendedStartPhase = 1;
    if (g1Total > 0 && g1Placed >= g1Total * 0.9) {
      if (g2Total > 0 && g2Placed >= g2Total * 0.9) {
        recommendedStartPhase = 3;
      } else {
        recommendedStartPhase = 2;
      }
    }

    return {
      g1Placed, g1Total,
      g2Placed, g2Total,
      g3Placed, g3Total,
      recommendedStartPhase
    };
  }, [currentState, partitionAllocations]);

  // Start 3-Phase Generation (Phase 1, Phase 2, or Phase 3)
  const generateTimetable = useCallback(async (options: { resetAll: boolean; startPhase?: number }) => {
    if (!currentState) return;
    setIsGenerating(true);
    setWaitingForNextPhase(false);
    setHasRun(false);

    const { allocations, placedLessons, teachers } = currentState;

    const activeAllocations = allocations.filter(a => {
      const teacher = teachers.find(t => t.id === a.teacherId);
      return !teacher?.isTraveling;
    });

    const { g1, g2, g3 } = partitionAllocations(activeAllocations);

    setPhaseStats({
      g1Count: g1.reduce((s, a) => s + (a.weeklyHours || 1), 0),
      g2Count: g2.reduce((s, a) => s + (a.weeklyHours || 1), 0),
      g3Count: g3.reduce((s, a) => s + (a.weeklyHours || 1), 0)
    });

    const status = getGroupPlacementStatus();
    const targetPhase = options.startPhase || (options.resetAll ? 1 : status.recommendedStartPhase);

    const initialPreserved = options.resetAll
      ? placedLessons.filter(l => {
          const teacher = teachers.find(t => t.id === l.allocation.teacherId);
          return teacher?.isTraveling;
        })
      : [...placedLessons];

    phaseGroupsRef.current = { g1, g2, g3, initialPreserved, resetAll: options.resetAll };
    currentAccumulatedPlacedRef.current = [...initialPreserved];

    if (targetPhase === 1) {
      setCurrentPhase(1);
      setProgress(25);
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
    } else if (targetPhase === 2) {
      setCurrentPhase(2);
      setProgress(50);
      const result2 = await runPhaseSolve(2, g2, initialPreserved);
      if (result2) {
        currentAccumulatedPlacedRef.current = result2;
        setPlacedLessons(result2);
        setProgress(66);
        setIsGenerating(false);
        setWaitingForNextPhase(true);
      } else {
        setIsGenerating(false);
        setProgress(0);
        setCurrentPhase(0);
      }
    } else if (targetPhase === 3) {
      setCurrentPhase(3);
      setProgress(80);
      const result3 = await runPhaseSolve(3, g3, initialPreserved);
      if (result3) {
        currentAccumulatedPlacedRef.current = result3;
        setPlacedLessons(result3);
        setProgress(100);
        setIsGenerating(false);
        setWaitingForNextPhase(false);
        setHasRun(true);
      } else {
        setIsGenerating(false);
        setProgress(0);
        setCurrentPhase(0);
      }
    }
  }, [currentState, partitionAllocations, getGroupPlacementStatus, setPlacedLessons]);

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

  // Automatically reset hasRun when allocations change or placedLessons are cleared
  const prevAllocLengthRef = useRef<number>(0);
  useEffect(() => {
    if (currentState?.allocations && currentState.allocations.length !== prevAllocLengthRef.current) {
      prevAllocLengthRef.current = currentState.allocations.length;
      setHasRun(false);
      setWaitingForNextPhase(false);
      setCurrentPhase(0);
    }
  }, [currentState?.allocations]);

  return {
    isGenerating,
    progress,
    currentPhase,
    waitingForNextPhase,
    hasRun,
    phaseStats,
    groupPlacementStatus: getGroupPlacementStatus(),
    generateTimetable,
    proceedToNextPhase,
    cancelGeneration,
    resetSchedulerState: cancelGeneration
  };
};

