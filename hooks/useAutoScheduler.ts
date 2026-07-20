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
  const { currentState, setPlacedLessons, findSubject, findClass } = useTimetable();
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [generationCount, setGenerationCount] = useState(0);
  const [bestFitness, setBestFitness] = useState(0);

  const abortRef = useRef<boolean>(false);

  // Precalculate available slots for a teacher
  const getTeacherAvailableSlots = useCallback((teacher: Teacher) => {
    const slots: { day: number; period: number }[] = [];
    for (let day = 0; day < 5; day++) {
      for (let period = 0; period < 8; period++) {
        if (teacher?.availability[day]?.[period] !== false) {
          slots.push({ day, period });
        }
      }
    }
    return slots.length > 0 ? slots : [{ day: 0, period: 0 }];
  }, []);

  const calculateFitness = useCallback((genes: Chromosome['genes'], allTeachers: Teacher[]): number => {
    let score = 0;

    // Index mappings to speed up checking
    const teacherLessons: Record<string, { day: number; period: number; classId: string; groupName: string }[]> = {};
    const classLessons: Record<string, { day: number; period: number; groupName: string; subjectName: string }[]> = {};

    genes.forEach(gene => {
      const { allocation, day, period } = gene;
      const teacher = allTeachers.find(t => t.id === allocation.teacherId);
      const subject = findSubject(allocation.subjectId);

      const groupName = allocation.originalGroup || '';
      const subjectName = subject?.name || '';
      const teacherId = allocation.teacherId;
      const classId = allocation.classId;

      // 1. Teacher availability (Szigorú Hard Constraint)
      const isTeacherAvailable = teacher?.availability[day]?.[period] ?? true;
      if (!isTeacherAvailable) {
        score -= 200000;
      }

      // Add to teacher lookup
      if (!teacherLessons[teacherId]) teacherLessons[teacherId] = [];
      teacherLessons[teacherId].push({ day, period, classId, groupName });

      // Add to class lookup
      if (!classLessons[classId]) classLessons[classId] = [];
      classLessons[classId].push({ day, period, groupName, subjectName });
    });

    // 2. Teacher collisions (Szigorú Hard Constraint)
    Object.keys(teacherLessons).forEach(teacherId => {
      const lessons = teacherLessons[teacherId];
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
            // Collision! Teacher is teaching different classes at the same time
            score -= 200000 * (count - 1);
          }
        }
      });

      // Teacher Lyukasóra (Soft Constraint)
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
              score -= 50; // Soft penalty for teacher gap
            }
          }
        }
      });
    });

    // 3. Class constraints (Hard & Soft Constraints)
    Object.keys(classLessons).forEach(classId => {
      const lessons = classLessons[classId];
      const slots: Record<string, typeof lessons> = {};
      lessons.forEach(l => {
        const slotKey = `${l.day}-${l.period}`;
        if (!slots[slotKey]) slots[slotKey] = [];
        slots[slotKey].push(l);
      });

      Object.keys(slots).forEach(slotKey => {
        const lessonsInSlot = slots[slotKey];
        if (lessonsInSlot.length > 1) {
          // Parallel lessons for class: ONLY allowed if they are separate groups (e.g. A and B).
          // If any lesson is whole-class (groupName is empty ""), it cannot run parallel with any other.
          const groups = lessonsInSlot.map(l => l.groupName);
          const hasWholeClass = groups.some(g => g === '');
          if (hasWholeClass) {
            score -= 200000 * (lessonsInSlot.length - 1);
          } else {
            // Check for duplicate group names (e.g. both are A csoport)
            const uniqueGroups = new Set(groups);
            if (uniqueGroups.size < groups.length) {
              score -= 200000 * (groups.length - uniqueGroups.size);
            }
          }
        }
      });

      // 4. Class Gaps / Lyukasóra-mentesség (Szigorú Hard Constraint)
      const days: Record<number, number[]> = {};
      lessons.forEach(l => {
        if (!days[l.day]) days[l.day] = [];
        days[l.day].push(l.period);
      });

      Object.keys(days).forEach(dStr => {
        const pList = days[Number(dStr)].sort((a, b) => a - b);
        if (pList.length > 0) {
          const minP = pList[0];
          const maxP = pList[pList.length - 1];
          
          // Strict: no empty periods between min and max
          for (let p = minP + 1; p < maxP; p++) {
            if (!pList.includes(p)) {
              score -= 200000; // Huge penalty for student lyukasóra!
            }
          }

          // Class must start at first period (index 0)
          if (minP > 0) {
            score -= 50000 * minP; // Penalty if class starts late
          }
        }
      });

      // 5. Napközi & Academic timing (Szigorú Hard & Soft Constraints)
      lessons.forEach(l => {
        const isNapközi = l.subjectName.toLowerCase().includes('napközi') || l.subjectName.toLowerCase().includes('szabadidő');
        const isAcademic = !isNapközi && 
                          !l.subjectName.toLowerCase().includes('habilitáció') && 
                          !l.subjectName.toLowerCase().includes('rehabilitáció') &&
                          !l.subjectName.toLowerCase().includes('kollégium') &&
                          !l.subjectName.toLowerCase().includes('fejlesztés') &&
                          !l.subjectName.toLowerCase().includes('logopédia');

        // Napközi must be afternoon (period >= 4)
        if (isNapközi && l.period < 4) {
          score -= 200000; // Szigorú Hard Constraint: Napközi cannot be in morning
        }

        // Academic should be morning (period < 4)
        if (isAcademic && l.period >= 4) {
          score -= 30000; // Strong penalty if academic is forced to afternoon
        }
      });

      // Subject daily distribution (Soft Constraint)
      const daySubjects: Record<string, Set<string>> = {};
      lessons.forEach(l => {
        const key = `${l.day}`;
        if (!daySubjects[key]) daySubjects[key] = new Set();
        if (daySubjects[key].has(l.subjectName) && l.subjectName !== 'Napközi') {
          score -= 20; // Soft penalty for duplicate subject on same day
        }
        daySubjects[key].add(l.subjectName);
      });
    });

    return score;
  }, [findSubject, findClass]);

  // Local Search (Hill Climbing / Memetic Search) to resolve remaining conflicts locally
  const runLocalSearch = useCallback((
    genes: Chromosome['genes'],
    teachers: Teacher[],
    allocationAvailableSlots: Map<string, { day: number; period: number }[]>
  ): Chromosome['genes'] => {
    let improved = true;
    let currentGenes = genes.map(g => ({ ...g }));
    let currentFitness = calculateFitness(currentGenes, teachers);

    // Run up to 4 optimization passes
    for (let pass = 0; pass < 4; pass++) {
      improved = false;
      for (let i = 0; i < currentGenes.length; i++) {
        const gene = currentGenes[i];
        const slots = allocationAvailableSlots.get(gene.allocation.id)!;
        
        let bestSlot = { day: gene.day, period: gene.period };
        let bestSlotFitness = currentFitness;

        for (const slot of slots) {
          if (slot.day === gene.day && slot.period === gene.period) continue;
          
          // Try slot change
          currentGenes[i].day = slot.day;
          currentGenes[i].period = slot.period;
          
          const f = calculateFitness(currentGenes, teachers);
          if (f > bestSlotFitness) {
            bestSlotFitness = f;
            bestSlot = { day: slot.day, period: slot.period };
            improved = true;
          }
        }

        // Apply best slot
        currentGenes[i].day = bestSlot.day;
        currentGenes[i].period = bestSlot.period;
        currentFitness = bestSlotFitness;
      }
      if (!improved) break;
    }
    return currentGenes;
  }, [calculateFitness]);

  const generateTimetable = useCallback(async (options: { resetAll: boolean }) => {
    if (!currentState) return;
    setIsGenerating(true);
    setProgress(0);
    setGenerationCount(0);
    setBestFitness(-999999);
    abortRef.current = false;

    const { allocations, placedLessons, teachers } = currentState;

    // Filter out allocations of traveling teachers
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
      alert("Nincsenek automatikusan tervezhető órák.");
      setIsGenerating(false);
      return;
    }

    // Keep existing lessons of traveling teachers
    const preservedLessons = options.resetAll 
      ? placedLessons.filter(l => {
          const teacher = teachers.find(t => t.id === l.allocation.teacherId);
          return teacher?.isTraveling;
        })
      : [...placedLessons];

    // Filter out lessons that are already placed (if scheduling remaining)
    let finalLessonsToPlace = [...lessonsToPlace];
    if (!options.resetAll) {
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

    // Precalculate available slots for each allocation
    const allocationAvailableSlots = new Map<string, { day: number; period: number }[]>();
    finalLessonsToPlace.forEach(alloc => {
      if (!allocationAvailableSlots.has(alloc.id)) {
        const teacher = teachers.find(t => t.id === alloc.teacherId)!;
        allocationAvailableSlots.set(alloc.id, getTeacherAvailableSlots(teacher));
      }
    });

    // 2. Initialize Genetic Algorithm parameters (Szigorított méretek)
    const populationSize = 120;
    const maxGenerations = 500;
    const mutationRate = 0.2;
    const crossoverRate = 0.5;

    // Create random chromosome and apply initial local search to give it a head-start
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

      // Apply initial local search to resolve easy conflicts immediately
      const optimizedGenes = runLocalSearch(genes, teachers, allocationAvailableSlots);
      return { 
        genes: optimizedGenes, 
        fitness: calculateFitness(optimizedGenes, teachers) 
      };
    };

    // Initialize population
    let population: Chromosome[] = [];
    for (let i = 0; i < populationSize; i++) {
      population.push(createRandomChromosome());
    }

    let currentGen = 0;
    const runGenerationChunk = () => {
      if (abortRef.current) {
        setIsGenerating(false);
        return;
      }

      const chunkCount = 15; // Generations per tick
      for (let c = 0; c < chunkCount; c++) {
        if (currentGen >= maxGenerations) break;

        population.sort((a, b) => b.fitness - a.fitness);

        const newPopulation: Chromosome[] = [];

        // Carry over top 10 elites
        for (let i = 0; i < 10; i++) {
          newPopulation.push(population[i]);
        }

        // Apply local search to the top 3 elites in each generation to accelerate convergence
        for (let i = 0; i < 3; i++) {
          const optimizedGenes = runLocalSearch(newPopulation[i].genes, teachers, allocationAvailableSlots);
          newPopulation[i] = {
            genes: optimizedGenes,
            fitness: calculateFitness(optimizedGenes, teachers)
          };
        }

        // Selection & reproduction
        while (newPopulation.length < populationSize) {
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

      population.sort((a, b) => b.fitness - a.fitness);
      const best = population[0];
      setGenerationCount(currentGen);
      setBestFitness(best.fitness);
      setProgress(Math.round((currentGen / maxGenerations) * 100));

      if (currentGen < maxGenerations) {
        setTimeout(runGenerationChunk, 10);
      } else {
        // Finished GA! Run a final, deep local search pass on the absolute best solution
        const finalOptimizedGenes = runLocalSearch(best.genes, teachers, allocationAvailableSlots);
        const finalFitness = calculateFitness(finalOptimizedGenes, teachers);
        
        setBestFitness(finalFitness);
        setProgress(100);
        setIsGenerating(false);

        // Apply genes back to placements
        const newPlacedLessons: PlacedLesson[] = [...preservedLessons];
        finalOptimizedGenes.forEach(gene => {
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
  }, [currentState, getTeacherAvailableSlots, runLocalSearch, calculateFitness, setPlacedLessons]);

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
