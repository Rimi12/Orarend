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

    // Index mappings
    const teacherLessons: Record<string, { day: number; period: number; classId: string; groupName: string }[]> = {};
    const classLessons: Record<string, { day: number; period: number; groupName: string; subjectName: string; allocationId: string }[]> = {};

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
      classLessons[classId].push({ day, period, groupName, subjectName, allocationId: allocation.id });
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

    // 3. Class constraints & EGYMI rules
    Object.keys(classLessons).forEach(classId => {
      const lessons = classLessons[classId];
      const cls = findClass(classId);
      const className = cls?.name || '';

      const slots: Record<string, typeof lessons> = {};
      lessons.forEach(l => {
        const slotKey = `${l.day}-${l.period}`;
        if (!slots[slotKey]) slots[slotKey] = [];
        slots[slotKey].push(l);
      });

      // Parallel lesson checks with Habilitáció exceptions
      Object.keys(slots).forEach(slotKey => {
        const lessonsInSlot = slots[slotKey];
        if (lessonsInSlot.length > 1) {
          // Check for Habilitáció parallel exceptions
          const hasHab = lessonsInSlot.some(l => {
            const sLower = l.subjectName.toLowerCase();
            return sLower.includes('habilitáció') || sLower.includes('rehabilitáció') || sLower.includes('logopédia');
          });

          const hasNapközi = lessonsInSlot.some(l => {
            const sLower = l.subjectName.toLowerCase();
            return sLower.includes('napközi') || sLower.includes('szabadidő') || sLower.includes('tanulószoba');
          });

          const hasTesi = lessonsInSlot.some(l => {
            const sLower = l.subjectName.toLowerCase();
            return sLower.includes('testnevelés') || sLower.includes('tesi');
          });

          const is9or10Grade = className.includes('9.') || className.includes('10.');

          // Exception 1: Habilitáció + Napközi is allowed
          // Exception 2: In 9th/10th grade, Habilitáció + Tesi is allowed
          const isAllowedException = (hasHab && hasNapközi) || (is9or10Grade && hasHab && hasTesi);

          if (!isAllowedException) {
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
        }
      });

      // 4. Class Gaps / Lyukasóra-mentesség & Continuity
      const days: Record<number, typeof lessons> = {};
      lessons.forEach(l => {
        if (!days[l.day]) days[l.day] = [];
        days[l.day].push(l);
      });

      Object.keys(days).forEach(dStr => {
        const dayNum = Number(dStr);
        const dayLessons = days[dayNum];
        const pList = dayLessons.map(l => l.period).sort((a, b) => a - b);

        if (pList.length > 0) {
          const minP = pList[0];
          const maxP = pList[pList.length - 1];

          // Strict: no empty periods between min and max
          for (let p = minP + 1; p < maxP; p++) {
            if (!pList.includes(p)) {
              score -= 200000; // Class gap penalty!
            }
          }

          // Class must start at period 1 (index 0)
          if (minP > 0) {
            score -= 50000 * minP;
          }

          // Napközi / Tanulószoba MUST be after all academic lessons on that day
          const maxAcademicPeriod = Math.max(
            -1,
            ...dayLessons
              .filter(l => {
                const sLower = l.subjectName.toLowerCase();
                return !sLower.includes('napközi') && !sLower.includes('tanulószoba') && !sLower.includes('szabadidő');
              })
              .map(l => l.period)
          );

          const minNapköziPeriod = Math.min(
            99,
            ...dayLessons
              .filter(l => {
                const sLower = l.subjectName.toLowerCase();
                return sLower.includes('napközi') || sLower.includes('tanulószoba') || sLower.includes('szabadidő');
              })
              .map(l => l.period)
          );

          // Academic lesson scheduled AFTER Napközi on the same day is forbidden
          if (minNapköziPeriod !== 99 && maxAcademicPeriod > minNapköziPeriod) {
            score -= 200000;
          }
        }
      });

      // 5. Academic lessons time window (1-7. óra -> period indexes 0-6)
      lessons.forEach(l => {
        const sLower = l.subjectName.toLowerCase();
        const isNapközi = sLower.includes('napközi') || sLower.includes('tanulószoba') || sLower.includes('szabadidő');
        const isHabilitáció = sLower.includes('habilitáció') || sLower.includes('rehabilitáció');

        // Rendes tanóra cannot be in period >= 7 (8. óra and above)
        if (!isNapközi && !isHabilitáció && l.period >= 7) {
          score -= 200000;
        }
      });

      // 6. Testnevelés (PE) & Úszás (Swimming) rules
      const peLessons = lessons.filter(l => {
        const sLower = l.subjectName.toLowerCase();
        return sLower.includes('testnevelés') || sLower.includes('tesi');
      });

      if (peLessons.length > 0) {
        const peDays = new Set(peLessons.map(l => l.day));

        // Exception: 3. osztály swimming on Wednesday (day 2, period 0 and 1)
        if (className.includes('3.')) {
          const wedPePeriods = peLessons.filter(l => l.day === 2).map(l => l.period);
          const hasWedSwimming = wedPePeriods.includes(0) && wedPePeriods.includes(1);
          if (!hasWedSwimming) {
            score -= 200000;
          }
        }
        // Exception: 5. osztály swimming on Friday (day 4, period 0 and 1)
        else if (className.includes('5.')) {
          const friPePeriods = peLessons.filter(l => l.day === 4).map(l => l.period);
          const hasFriSwimming = friPePeriods.includes(0) && friPePeriods.includes(1);
          if (!hasFriSwimming) {
            score -= 200000;
          }
        } 
        // Standard classes: PE should be present on all days where class has lessons
        else {
          for (let d = 0; d < 5; d++) {
            if (days[d] && days[d].length > 0 && !peDays.has(d)) {
              score -= 30000; // Soft penalty if PE is missing on a school day
            }
          }
        }
      }

      // 7. Festő osztályok (9. festő és 10. festő) Gyakorlati Tömbösítés
      if (className.includes('festő') || className.includes('festo')) {
        const practiceLessons = lessons.filter(l => {
          const sLower = l.subjectName.toLowerCase();
          return sLower.includes('gyakorlat') || sLower.includes('szakmai');
        });

        if (practiceLessons.length > 0) {
          const practiceDays = Array.from(new Set(practiceLessons.map(l => l.day))).sort((a, b) => a - b);
          // Check if practice days are 2 consecutive days (e.g. [0,1] or [1,2] or [2,3] or [3,4])
          const isConsecutive = practiceDays.length === 2 && (practiceDays[1] - practiceDays[0] === 1);
          if (!isConsecutive) {
            score -= 100000; // Penalty if practice is not 2 consecutive days
          }
        }
      }
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

    const indices = Array.from({ length: currentGenes.length }, (_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }

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

      const populationSize = 60;
      const maxGenerations = 300;
      const mutationRate = 0.25;
      const crossoverRate = 0.6;

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

        const chunkCount = 10;
        for (let c = 0; c < chunkCount; c++) {
          if (currentGen >= maxGenerations) break;

          population.sort((a, b) => b.fitness - a.fitness);

          const newPopulation: Chromosome[] = [];

          for (let i = 0; i < 5; i++) {
            newPopulation.push(population[i]);
          }

          const optimizedTop = runLocalSearch(newPopulation[0].genes, teachers, allocationAvailableSlots);
          newPopulation[0] = {
            genes: optimizedTop,
            fitness: calculateFitness(optimizedTop, teachers)
          };

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

            if (Math.random() < crossoverRate && childGenes1.length > 1) {
              const cutPoint = Math.floor(Math.random() * childGenes1.length);
              for (let i = cutPoint; i < childGenes1.length; i++) {
                const temp = childGenes1[i];
                childGenes1[i] = childGenes2[i];
                childGenes2[i] = temp;
              }
            }

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
          const finalOptimizedGenes = runLocalSearch(best.genes, teachers, allocationAvailableSlots);
          const finalFitness = calculateFitness(finalOptimizedGenes, teachers);
          
          setBestFitness(finalFitness);
          setProgress(100);
          setIsGenerating(false);

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
