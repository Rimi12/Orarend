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
  const { currentState, setPlacedLessons, findTeacher, findSubject, findClass } = useTimetable();
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [generationCount, setGenerationCount] = useState(0);
  const [bestFitness, setBestFitness] = useState(0);

  const abortRef = useRef<boolean>(false);

  const calculateFitness = useCallback((genes: Chromosome['genes'], allTeachers: Teacher[]): number => {
    let score = 0;

    // Index mappings to speed up checking
    const teacherLessons: Record<string, { day: number; period: number; classId: string; groupName: string }[]> = {};
    const classLessons: Record<string, { day: number; period: number; groupName: string; subjectName: string }[]> = {};

    genes.forEach(gene => {
      const { allocation, day, period } = gene;
      const teacher = allTeachers.find(t => t.id === allocation.teacherId);
      const subject = findSubject(allocation.subjectId);
      const cls = findClass(allocation.classId);

      const groupName = allocation.originalGroup || '';
      const subjectName = subject?.name || '';
      const teacherId = allocation.teacherId;
      const classId = allocation.classId;

      // 1. Teacher availability (Hard Constraint)
      const isTeacherAvailable = teacher?.availability[day]?.[period] ?? true;
      if (!isTeacherAvailable) {
        score -= 2000;
      }

      // Add to teacher lookup
      if (!teacherLessons[teacherId]) teacherLessons[teacherId] = [];
      teacherLessons[teacherId].push({ day, period, classId, groupName });

      // Add to class lookup
      if (!classLessons[classId]) classLessons[classId] = [];
      classLessons[classId].push({ day, period, groupName, subjectName });
    });

    // 2. Teacher collisions (Hard Constraint)
    Object.keys(teacherLessons).forEach(teacherId => {
      const lessons = teacherLessons[teacherId];
      // Group by day & period
      const slots: Record<string, typeof lessons> = {};
      lessons.forEach(l => {
        const slotKey = `${l.day}-${l.period}`;
        if (!slots[slotKey]) slots[slotKey] = [];
        slots[slotKey].push(l);
      });

      Object.keys(slots).forEach(slotKey => {
        const count = slots[slotKey].length;
        if (count > 1) {
          // Parallel lesson check: allowed if they share the exact same classId (same merged class)
          const classIds = new Set(slots[slotKey].map(l => l.classId));
          if (classIds.size > 1) {
            // Teacher is teaching different classes at the same time -> Collision!
            score -= 1000 * (count - 1);
          }
        }
      });

      // 3. Teacher Lyukasóra (Soft Constraint)
      // Group by day to find gaps
      const days: Record<number, number[]> = {};
      lessons.forEach(l => {
        if (!days[l.day]) days[l.day] = [];
        days[l.day].push(l.period);
      });

      Object.keys(days).forEach(dStr => {
        const pList = days[Number(dStr)].sort((a, b) => a - b);
        if (pList.length > 1) {
          const minP = pList[0];
          const maxP = pList[pList.length - 1];
          // Count missing periods between min and max
          for (let p = minP + 1; p < maxP; p++) {
            if (!pList.includes(p)) {
              score -= 15; // Penalty per teacher gap hour
            }
          }
        }
      });
    });

    // 4. Class / Group collisions (Hard & Soft Constraints)
    Object.keys(classLessons).forEach(classId => {
      const lessons = classLessons[classId];
      // Group by day & period
      const slots: Record<string, typeof lessons> = {};
      lessons.forEach(l => {
        const slotKey = `${l.day}-${l.period}`;
        if (!slots[slotKey]) slots[slotKey] = [];
        slots[slotKey].push(l);
      });

      Object.keys(slots).forEach(slotKey => {
        const lessonsInSlot = slots[slotKey];
        if (lessonsInSlot.length > 1) {
          // Check if they are group lessons. Parallel is allowed if they have different non-empty groups.
          // If any lesson is whole-class (groupName is empty), it cannot run parallel with anything.
          const groups = lessonsInSlot.map(l => l.groupName);
          const hasWholeClass = groups.some(g => g === '');
          if (hasWholeClass) {
            score -= 1000 * (lessonsInSlot.length - 1);
          } else {
            // All are group lessons. Check for duplicate groups.
            const uniqueGroups = new Set(groups);
            if (uniqueGroups.size < groups.length) {
              score -= 1000 * (groups.length - uniqueGroups.size);
            }
          }
        }
      });

      // 5. Student Lyukasóra (Soft Constraint)
      const days: Record<number, number[]> = {};
      lessons.forEach(l => {
        if (!days[l.day]) days[l.day] = [];
        days[l.day].push(l.period);
      });

      Object.keys(days).forEach(dStr => {
        const pList = days[Number(dStr)].sort((a, b) => a - b);
        if (pList.length > 1) {
          const minP = pList[0];
          const maxP = pList[pList.length - 1];
          for (let p = minP + 1; p < maxP; p++) {
            if (!pList.includes(p)) {
              score -= 60; // Hard penalty for student lyukasóra
            }
          }
        }
      });

      // 6. Subject-Period Dist & Napközi Timing (Soft Constraints)
      lessons.forEach(l => {
        const isNapközi = l.subjectName.toLowerCase().includes('napközi') || l.subjectName.toLowerCase().includes('szabadidő');
        const isAcademic = !isNapközi && 
                          !l.subjectName.toLowerCase().includes('habilitáció') && 
                          !l.subjectName.toLowerCase().includes('rehabilitáció') &&
                          !l.subjectName.toLowerCase().includes('kollégium') &&
                          !l.subjectName.toLowerCase().includes('fejlesztés') &&
                          !l.subjectName.toLowerCase().includes('logopédia');

        // Napközi must be in afternoon (period >= 4, which is 5th period 0-indexed)
        if (isNapközi && l.period < 4) {
          score -= 300; // Napközi in morning is heavily penalized
        }

        // Academic must be in morning (period < 4)
        if (isAcademic && l.period >= 4) {
          score -= 30; // Academic in afternoon is penalized
        }
      });

      // 7. Subject daily distribution (Soft Constraint)
      // Penalize multiple identical subjects for the same class on the same day
      const daySubjects: Record<string, Set<string>> = {};
      lessons.forEach(l => {
        const key = `${l.day}`;
        if (!daySubjects[key]) daySubjects[key] = new Set();
        if (daySubjects[key].has(l.subjectName) && l.subjectName !== 'Napközi') {
          score -= 15; // Penalty for duplicate subject on same day
        }
        daySubjects[key].add(l.subjectName);
      });
    });

    return score;
  }, [findSubject, findClass]);

  const generateTimetable = useCallback(async (options: { resetAll: boolean }) => {
    if (!currentState) return;
    setIsGenerating(true);
    setProgress(0);
    setGenerationCount(0);
    setBestFitness(-999999);
    abortRef.current = false;

    // 1. Gather all allocations to schedule
    const { allocations, placedLessons, teachers } = currentState;

    // Filter out allocations where the teacher is traveling / manual only
    const activeAllocations = allocations.filter(a => {
      const teacher = teachers.find(t => t.id === a.teacherId);
      return !teacher?.isTraveling;
    });

    // Create individual hours list
    const lessonsToPlace: Allocation[] = [];
    activeAllocations.forEach(alloc => {
      for (let i = 0; i < alloc.weeklyHours; i++) {
        lessonsToPlace.push(alloc);
      }
    });

    if (lessonsToPlace.length === 0) {
      alert("Nincsenek automatikusan tervezhető órák (lehet, hogy minden tanár utazónak van jelölve).");
      setIsGenerating(false);
      return;
    }

    // Keep existing lessons of traveling teachers
    const preservedLessons = options.resetAll 
      ? placedLessons.filter(l => {
          const teacher = teachers.find(t => t.id === l.allocation.teacherId);
          return teacher?.isTraveling; // Keep only traveling
        })
      : [...placedLessons]; // Keep everything

    // If we are scheduling remaining, filter out lessonsToPlace that are already placed
    let finalLessonsToPlace = [...lessonsToPlace];
    if (!options.resetAll) {
      // For each placed lesson of non-traveling teachers, subtract one weekly hour from what we need to place
      const placedNonTraveling = placedLessons.filter(l => {
        const teacher = teachers.find(t => t.id === l.allocation.teacherId);
        return !teacher?.isTraveling;
      });

      placedNonTraveling.forEach(placed => {
        const idx = finalLessonsToPlace.findIndex(a => a.id === placed.allocation.id);
        if (idx > -1) {
          finalLessonsToPlace.splice(idx, 1);
        }
      });
    }

    if (finalLessonsToPlace.length === 0) {
      alert("Minden óra be van már osztva!");
      setIsGenerating(false);
      return;
    }

    // Helper to get available slots for a teacher
    const getAvailableSlots = (teacherId: string) => {
      const teacher = teachers.find(t => t.id === teacherId);
      const slots: { day: number; period: number }[] = [];
      for (let day = 0; day < 5; day++) {
        for (let period = 0; period < 8; period++) {
          if (teacher?.availability[day]?.[period] !== false) {
            slots.push({ day, period });
          }
        }
      }
      return slots.length > 0 ? slots : [{ day: 0, period: 0 }];
    };

    // Precalculate available slots for each allocation
    const allocationAvailableSlots = new Map<string, { day: number; period: number }[]>();
    finalLessonsToPlace.forEach(alloc => {
      if (!allocationAvailableSlots.has(alloc.id)) {
        allocationAvailableSlots.set(alloc.id, getAvailableSlots(alloc.teacherId));
      }
    });

    // 2. Initialize Genetic Algorithm parameters
    const populationSize = 60;
    const maxGenerations = 300;
    const mutationRate = 0.15;
    const crossoverRate = 0.5;

    // Create random chromosome helper
    const createRandomChromosome = (): Chromosome => {
      const genes = finalLessonsToPlace.map(alloc => {
        const slots = allocationAvailableSlots.get(alloc.id)!;
        const randomSlot = slots[Math.floor(Math.random() * slots.length)];
        return {
          allocation: alloc,
          day: randomSlot.day,
          period: randomSlot.period
        };
      });
      return { genes, fitness: calculateFitness(genes, teachers) };
    };

    // Initialize population
    let population: Chromosome[] = [];
    for (let i = 0; i < populationSize; i++) {
      population.push(createRandomChromosome());
    }

    // Run generations in chunks async
    let currentGen = 0;
    const runGenerationChunk = () => {
      if (abortRef.current) {
        setIsGenerating(false);
        return;
      }

      const chunkCount = 20; // run 20 generations per tick
      for (let c = 0; c < chunkCount; c++) {
        if (currentGen >= maxGenerations) break;

        // Sort population by fitness
        population.sort((a, b) => b.fitness - a.fitness);

        const newPopulation: Chromosome[] = [];

        // Elitisms: carry over top 5
        for (let i = 0; i < 6; i++) {
          newPopulation.push(population[i]);
        }

        // Selection & reproduction
        while (newPopulation.length < populationSize) {
          // Tournament selection
          const tournamentSelect = () => {
            const index1 = Math.floor(Math.random() * populationSize);
            const index2 = Math.floor(Math.random() * populationSize);
            return population[index1].fitness > population[index2].fitness ? population[index1] : population[index2];
          };

          const parent1 = tournamentSelect();
          const parent2 = tournamentSelect();

          let childGenes1 = parent1.genes.map(g => ({ ...g }));
          let childGenes2 = parent2.genes.map(g => ({ ...g }));

          // Crossover
          if (Math.random() < crossoverRate && childGenes1.length > 1) {
            const cutPoint = Math.floor(Math.random() * childGenes1.length);
            for (let i = cutPoint; i < childGenes1.length; i++) {
              const temp = childGenes1[i];
              childGenes1[i] = childGenes2[i];
              childGenes2[i] = temp;
            }
          }

          // Mutation
          const mutate = (genes: Chromosome['genes']) => {
            return genes.map(g => {
              if (Math.random() < mutationRate) {
                const slots = allocationAvailableSlots.get(g.allocation.id)!;
                const randomSlot = slots[Math.floor(Math.random() * slots.length)];
                return {
                  ...g,
                  day: randomSlot.day,
                  period: randomSlot.period
                };
              }
              return g;
            });
          };

          childGenes1 = mutate(childGenes1);
          childGenes2 = mutate(childGenes2);

          newPopulation.push({ genes: childGenes1, fitness: calculateFitness(childGenes1, teachers) });
          if (newPopulation.length < populationSize) {
            newPopulation.push({ genes: childGenes2, fitness: calculateFitness(childGenes2, teachers) });
          }
        }

        population = newPopulation;
        currentGen++;
      }

      // Update state
      population.sort((a, b) => b.fitness - a.fitness);
      const best = population[0];
      setGenerationCount(currentGen);
      setBestFitness(best.fitness);
      setProgress(Math.round((currentGen / maxGenerations) * 100));

      if (currentGen < maxGenerations) {
        setTimeout(runGenerationChunk, 10);
      } else {
        // Finished!
        setIsGenerating(false);
        setProgress(100);

        // Apply genes back to placements
        const newPlacedLessons: PlacedLesson[] = [...preservedLessons];
        best.genes.forEach(gene => {
          newPlacedLessons.push({
            id: `${gene.allocation.id}-${crypto.randomUUID()}`,
            allocation: gene.allocation,
            day: gene.day,
            period: gene.period
          });
        });

        setPlacedLessons(newPlacedLessons);
      }
    };

    setTimeout(runGenerationChunk, 10);
  }, [currentState, calculateFitness, setPlacedLessons]);

  const cancelGeneration = useCallback(() => {
    abortRef.current = true;
    setIsGenerating(false);
  }, []);

  return {
    isGenerating,
    progress,
    generationCount,
    bestFitness,
    generateTimetable,
    cancelGeneration
  };
};
