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
          const classIds = new Set(slots[slotKey].map(l => l.classId));
          if (classIds.size > 1) {
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
              score -= 50;
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
          const groups = lessonsInSlot.map(l => l.groupName);
          const hasWholeClass = groups.some(g => g === '');
          if (hasWholeClass) {
            score -= 200000 * (lessonsInSlot.length - 1);
          } else {
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
          
          for (let p = minP + 1; p < maxP; p++) {
            if (!pList.includes(p)) {
              score -= 200000;
            }
          }

          if (minP > 0) {
            score -= 50000 * minP;
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

        if (isNapközi && l.period < 4) {
          score -= 200000;
        }

        if (isAcademic && l.period >= 4) {
          score -= 30000;
        }
      });

      // Subject daily distribution (Soft Constraint)
      const daySubjects: Record<string, Set<string>> = {};
      lessons.forEach(l => {
        const key = `${l.day}`;
        if (!daySubjects[key]) daySubjects[key] = new Set();
        if (daySubjects[key].has(l.subjectName) && l.subjectName !== 'Napközi') {
          score -= 20;
        }
        daySubjects[key].add(l.subjectName);
      });
    });

    return score;
  }, [findSubject, findClass]);

  // Ultra-fast, conflict-targeted local search (Hill Climbing)
  const runLocalSearch = useCallback((
    genes: Chromosome['genes'],
    teachers: Teacher[],
    allocationAvailableSlots: Map<string, { day: number; period: number }[]>
  ): Chromosome['genes'] => {
    let currentGenes = genes.map(g => ({ ...g }));
    let currentFitness = calculateFitness(currentGenes, teachers);

    if (currentFitness >= 0) return currentGenes; // Already perfect!

    // Shuffle gene indices to avoid bias
    const indices = Array.from({ length: currentGenes.length }, (_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }

    // Try improving up to 30 genes per pass to keep execution time under 5ms
    let tries = 0;
    for (const i of indices) {
      if (tries > 30) break;
      tries++;

      const gene = currentGenes[i];
      const slots = allocationAvailableSlots.get(gene.allocation.id)!;
      let bestSlot = { day: gene.day, period: gene.period };
      let bestSlotFitness = currentFitness;

      for (const slot of slots) {
        if (slot.day === gene.day && slot.period === gene.period) continue;
        
        currentGenes[i].day = slot.day;
        currentGenes[i].period = slot.period;
        
        const f = calculateFitness(currentGenes, teachers);
        if (f > bestSlotFitness) {
          bestSlotFitness = f;
          bestSlot = { day: slot.day, period: slot.period };
        }
      }

      currentGenes[i].day = bestSlot.day;
      currentGenes[i].period = bestSlot.period;
      currentFitness = bestSlotFitness;
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

    // Yield to React state update so UI modal renders immediately
    setTimeout(() => {
      if (!currentState || abortRef.current) return;

      const { allocations, placedLessons, teachers } = currentState;

      const activeAllocations = allocations.filter(a => {
        const teacher = teachers.find(t => t.id === a.teacherId);
        return !teacher?.isTraveling;
      });

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

      const preservedLessons = options.resetAll 
        ? placedLessons.filter(l => {
            const teacher = teachers.find(t => t.id === l.allocation.teacherId);
            return teacher?.isTraveling;
          })
        : [...placedLessons];

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

      const allocationAvailableSlots = new Map<string, { day: number; period: number }[]>();
      finalLessonsToPlace.forEach(alloc => {
        if (!allocationAvailableSlots.has(alloc.id)) {
          const teacher = teachers.find(t => t.id === alloc.teacherId)!;
          allocationAvailableSlots.set(alloc.id, getTeacherAvailableSlots(teacher));
        }
      });

      // Optimal GA Parameters
      const populationSize = 60;
      const maxGenerations = 300;
      const mutationRate = 0.25;
      const crossoverRate = 0.6;

      // Fast random chromosome creation (NO heavy sync local search during init)
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

        return { 
          genes, 
          fitness: calculateFitness(genes, teachers) 
        };
      };

      // Initialize population lightweight
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

        const chunkCount = 10; // 10 generations per tick to keep UI buttery smooth
        for (let c = 0; c < chunkCount; c++) {
          if (currentGen >= maxGenerations) break;

          population.sort((a, b) => b.fitness - a.fitness);

          const newPopulation: Chromosome[] = [];

          // Elitism: carry top 5
          for (let i = 0; i < 5; i++) {
            newPopulation.push(population[i]);
          }

          // Apply targeted local search ONLY to top 1 elite to boost progress
          const optimizedTop = runLocalSearch(newPopulation[0].genes, teachers, allocationAvailableSlots);
          newPopulation[0] = {
            genes: optimizedTop,
            fitness: calculateFitness(optimizedTop, teachers)
          };

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
          setTimeout(runGenerationChunk, 15);
        } else {
          // Final optimization pass on best solution
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

      setTimeout(runGenerationChunk, 15);
    }, 50);

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
