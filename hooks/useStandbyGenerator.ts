import { useState, useCallback } from 'react';
import { Teacher } from '../types.ts';
import { useTimetable } from '../contexts/TimetableContext.tsx';
import { NUMBER_OF_DAYS } from '../constants.ts';
import { GoogleGenAI, Type } from "@google/genai";

const STANDBY_PERIOD_COUNT = 8;

export const useStandbyGenerator = () => {
  const { currentState, findTeacher } = useTimetable();
  
  const [isStandbySelectionModalOpen, setIsStandbySelectionModalOpen] = useState(false);
  const [lastGeneratedTeacherIds, setLastGeneratedTeacherIds] = useState<string[] | null>(null);
  const [standbySchedule, setStandbySchedule] = useState<Map<string, Teacher[]> | null>(null);
  const [standbyReport, setStandbyReport] = useState<{ eligibleTeachers: Teacher[]; unassignedTeachers: Teacher[]; understaffedSlots: { day: number; period: number; count: number }[], aiExplanation?: string } | null>(null);
  const [isStandbyModalOpen, setIsStandbyModalOpen] = useState(false);
  const [isGeneratingWithAI, setIsGeneratingWithAI] = useState(false);

  const getEligibleTeachersAndSlots = useCallback((selectedTeacherIds: string[]) => {
      if (!currentState) return { eligibleTeachers: [] as Teacher[], strictPreferredSlots: new Map(), strictFallbackSlots: new Map(), exceptionPreferredSlots: new Map(), exceptionFallbackSlots: new Map() };
      
      const { teachers, placedLessons } = currentState;

      const eligibleTeachers = teachers.filter(teacher => selectedTeacherIds.includes(teacher.id));
      
      const lessonsPerDay = new Map<string, number[]>();
      eligibleTeachers.forEach(teacher => {
          const dailyCounts = Array(NUMBER_OF_DAYS).fill(0);
          placedLessons.filter(l => l.allocation.teacherId === teacher.id)
              .forEach(l => {
                  dailyCounts[l.day]++;
              });
          lessonsPerDay.set(teacher.id, dailyCounts);
      });

      const hasLessonMap = new Map<string, boolean>();
      placedLessons.forEach(l => {
        hasLessonMap.set(`${l.allocation.teacherId}-${l.day}-${l.period}`, true);
      });

      const strictPreferredSlots = new Map<string, { day: number, period: number }[]>();
      const strictFallbackSlots = new Map<string, { day: number, period: number }[]>();
      const exceptionPreferredSlots = new Map<string, { day: number, period: number }[]>();
      const exceptionFallbackSlots = new Map<string, { day: number, period: number }[]>();

      eligibleTeachers.forEach(teacher => {
          const s_pref_slots: { day: number, period: number }[] = [];
          const s_fall_slots: { day: number, period: number }[] = [];
          const e_pref_slots: { day: number, period: number }[] = [];
          const e_fall_slots: { day: number, period: number }[] = [];

          const teacherDailyLessons = lessonsPerDay.get(teacher.id) || [];

          for (let day = 0; day < NUMBER_OF_DAYS; day++) {
              const isHighWorkloadDay = (teacherDailyLessons[day] || 0) >= 6;
              for (let period = 0; period < STANDBY_PERIOD_COUNT; period++) {
                  if (hasLessonMap.get(`${teacher.id}-${day}-${period}`)) continue;
                  
                  if (!(teacher.availability[day]?.[period] ?? true)) continue;

                  const hasLessonBefore = period > 0 && hasLessonMap.get(`${teacher.id}-${day}-${period - 1}`);
                  const hasLessonAfter = period < STANDBY_PERIOD_COUNT - 1 && hasLessonMap.get(`${teacher.id}-${day}-${period + 1}`);
                  if (hasLessonBefore || hasLessonAfter) {
                      if (isHighWorkloadDay) {
                         s_fall_slots.push({ day, period });
                      } else {
                         s_pref_slots.push({ day, period });
                      }
                      continue; 
                  }

                  const hasLessonTwoBefore = period > 1 && !hasLessonMap.get(`${teacher.id}-${day}-${period - 1}`) && hasLessonMap.get(`${teacher.id}-${day}-${period - 2}`);
                  const hasLessonTwoAfter = period < STANDBY_PERIOD_COUNT - 2 && !hasLessonMap.get(`${teacher.id}-${day}-${period + 1}`) && hasLessonMap.get(`${teacher.id}-${day}-${period + 2}`);
                  if (hasLessonTwoBefore || hasLessonTwoAfter) {
                      if (isHighWorkloadDay) {
                         e_fall_slots.push({ day, period });
                      } else {
                         e_pref_slots.push({ day, period });
                      }
                  }
              }
          }
          strictPreferredSlots.set(teacher.id, s_pref_slots);
          strictFallbackSlots.set(teacher.id, s_fall_slots);
          exceptionPreferredSlots.set(teacher.id, e_pref_slots);
          exceptionFallbackSlots.set(teacher.id, e_fall_slots);
      });

      return { eligibleTeachers, strictPreferredSlots, strictFallbackSlots, exceptionPreferredSlots, exceptionFallbackSlots };
  }, [currentState]);

  const handleGenerateStandbySchedule = useCallback((selectedTeacherIds: string[]) => {
    const { eligibleTeachers, strictPreferredSlots, strictFallbackSlots, exceptionPreferredSlots, exceptionFallbackSlots } = getEligibleTeachersAndSlots(selectedTeacherIds);
    
    const assignmentsBySlot = new Map<string, Teacher[]>();
    const teacherDutyCount = new Map<string, number>(eligibleTeachers.map(t => [t.id, 0]));

    const allSlots: {day: number, period: number}[] = [];
    for (let day = 0; day < NUMBER_OF_DAYS; day++) {
        for (let period = 0; period < STANDBY_PERIOD_COUNT; period++) {
            assignmentsBySlot.set(`${day}-${period}`, []);
            allSlots.push({ day, period });
        }
    }

    for (let i = allSlots.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [allSlots[i], allSlots[j]] = [allSlots[j], allSlots[i]];
    }

    const checkDailyAssignmentRules = (teacherId: string, day: number, period: number): boolean => {
        const dutiesOnDay: number[] = [];
        for (let p = 0; p < STANDBY_PERIOD_COUNT; p++) {
            if (assignmentsBySlot.get(`${day}-${p}`)?.some(assigned => assigned.id === teacherId)) {
                dutiesOnDay.push(p);
            }
        }
    
        if (dutiesOnDay.length >= 2) return false;
        if (dutiesOnDay.length === 1) {
            return Math.abs(dutiesOnDay[0] - period) === 1;
        }
        return true;
    };

    const assignTeacherToSlot = (day: number, period: number, candidatePool: Teacher[]): boolean => {
        const slotKey = `${day}-${period}`;
        const candidates = candidatePool.filter(t => {
            if ((teacherDutyCount.get(t.id) ?? 0) >= 3) return false;
            if (assignmentsBySlot.get(slotKey)?.some(assigned => assigned.id === t.id)) return false;
            if (!checkDailyAssignmentRules(t.id, day, period)) return false;
            return true;
        });

        if (candidates.length === 0) return false;

        candidates.sort((a, b) => {
            const aDuties = teacherDutyCount.get(a.id) ?? 0;
            const bDuties = teacherDutyCount.get(b.id) ?? 0;
            if (aDuties !== bDuties) return aDuties - bDuties;

            const aSlots = (strictPreferredSlots.get(a.id)?.length ?? 0) + (exceptionPreferredSlots.get(a.id)?.length ?? 0) + (strictFallbackSlots.get(a.id)?.length ?? 0) + (exceptionFallbackSlots.get(a.id)?.length ?? 0);
            const bSlots = (strictPreferredSlots.get(b.id)?.length ?? 0) + (exceptionPreferredSlots.get(b.id)?.length ?? 0) + (strictFallbackSlots.get(b.id)?.length ?? 0) + (exceptionFallbackSlots.get(b.id)?.length ?? 0);
            return aSlots - bSlots;
        });
        
        const bestCandidate = candidates[0];
        assignmentsBySlot.get(slotKey)?.push(bestCandidate);
        teacherDutyCount.set(bestCandidate.id, (teacherDutyCount.get(bestCandidate.id) ?? 0) + 1);
        return true;
    };

    // Main assignment loop - try to fill 3 slots per period
    for (let i = 0; i < 3; i++) {
        for (const { day, period } of allSlots) {
            if ((assignmentsBySlot.get(`${day}-${period}`)?.length ?? 0) > i) continue;

            const createPool = (slotMap: Map<string, { day: number, period: number }[]>) => 
                eligibleTeachers.filter(t => (slotMap.get(t.id) || []).some(s => s.day === day && s.period === period));

            if (assignTeacherToSlot(day, period, createPool(strictPreferredSlots))) continue;
            if (assignTeacherToSlot(day, period, createPool(exceptionPreferredSlots))) continue;
            if (assignTeacherToSlot(day, period, createPool(strictFallbackSlots))) continue;
            if (assignTeacherToSlot(day, period, createPool(exceptionFallbackSlots))) continue;
        }
    }

    const report = {
      eligibleTeachers: eligibleTeachers.sort((a,b) => a.name.localeCompare(b.name, 'hu-HU')),
      unassignedTeachers: eligibleTeachers.filter(t => (teacherDutyCount.get(t.id) ?? 0) !== 3),
      understaffedSlots: [] as { day: number; period: number; count: number }[],
    };


    for (let day = 0; day < NUMBER_OF_DAYS; day++) {
      for (let period = 0; period < STANDBY_PERIOD_COUNT; period++) {
        const count = assignmentsBySlot.get(`${day}-${period}`)?.length ?? 0;
        if (count !== 3) {
          report.understaffedSlots.push({ day, period, count });
        }
      }
    }
    
    setStandbySchedule(assignmentsBySlot);
    setStandbyReport(report);
    setIsStandbyModalOpen(true);
  }, [getEligibleTeachersAndSlots]);

  const handleStartStandbyGeneration = useCallback((selectedTeacherIds: string[]) => {
      setIsStandbySelectionModalOpen(false);
      setLastGeneratedTeacherIds(selectedTeacherIds);
      if (selectedTeacherIds.length === 0) {
          alert("Nincs kiválasztott tanár a generáláshoz.");
          return;
      }
      handleGenerateStandbySchedule(selectedTeacherIds);
  }, [handleGenerateStandbySchedule]);

  const handleRepairStandbyWithAI = useCallback(async () => {
      if (!process.env.API_KEY) {
          alert("A Gemini API kulcs nincs beállítva. Kérjük, konfigurálja a `process.env.API_KEY` változót.");
          return;
      }
      if (!standbySchedule || !standbyReport || !lastGeneratedTeacherIds || !currentState) {
          alert("A javításhoz először generáljon egy alapbeosztást.");
          return;
      }

      setIsGeneratingWithAI(true);

      try {
          const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
          
          const { eligibleTeachers, strictPreferredSlots, strictFallbackSlots, exceptionPreferredSlots, exceptionFallbackSlots } = getEligibleTeachersAndSlots(lastGeneratedTeacherIds);
          
          const allPotentialSlotsByTeacher = new Map<string, { day: number; period: number }[]>();
          eligibleTeachers.forEach(teacher => {
              const slots = [
                  ...(strictPreferredSlots.get(teacher.id) || []),
                  ...(exceptionPreferredSlots.get(teacher.id) || []),
                  ...(strictFallbackSlots.get(teacher.id) || []),
                  ...(exceptionFallbackSlots.get(teacher.id) || []),
              ];
              const uniqueSlots = Array.from(new Set(slots.map(s => JSON.stringify(s)))).map(s => JSON.parse(s));
              allPotentialSlotsByTeacher.set(teacher.id, uniqueSlots);
          });

          const lessonsPerDay = new Map<string, number[]>();
          eligibleTeachers.forEach(teacher => {
              const dailyCounts = Array(NUMBER_OF_DAYS).fill(0);
              currentState.placedLessons.filter(l => l.allocation.teacherId === teacher.id)
                  .forEach(l => {
                      dailyCounts[l.day]++;
                  });
              lessonsPerDay.set(teacher.id, dailyCounts);
          });

          const teacherDataForPrompt = eligibleTeachers.map(t => {
              const slots = allPotentialSlotsByTeacher.get(t.id) || [];
              const dailyLessons = lessonsPerDay.get(t.id) || [];
              const workload = `napi óraszámok: [H: ${dailyLessons[0]}, K: ${dailyLessons[1]}, Sz: ${dailyLessons[2]}, Cs: ${dailyLessons[3]}, P: ${dailyLessons[4]}]`;
              return `${t.name} (ID: ${t.id}) beosztható: [${slots.map(s => `{nap: ${s.day}, óra: ${s.period}}`).join(', ')}] (${workload})`;
          }).join('\n');
          
          const prompt = `
              Feladat: Hozz létre egy teljesen új tanári "rendelkezésre állási" beosztást a nulláról a megadott adatok alapján. A cél egy 100%-ban szabályos és optimális beosztás létrehozása.

              **MEGSZEGHETETLEN SZABÁLYOK ÉS CÉLOK (HIERARCHIKUS SORRENDBEN):**

              1.  **NAPI KORLÁT (SZABÁLY):** Egy tanárnak egy napon legfeljebb KÉT órája lehet, és CSAK ÉS KIZÁRÓLAG akkor, ha azok KÖZVETLENÜL EGYMÁST KÖVETŐ órák. Ez a szabály SOHA nem szeghető meg.
                  *   HELYES PÉLDA: Hétfő, 2. óra és Hétfő, 3. óra.
                  *   HELYTELEN PÉLDA: Hétfő, 2. óra és Hétfő, 4. óra.

              2.  **ELÉRHETŐSÉG (SZABÁLY):** Egy tanár CSAK olyan idősávba osztható be, ami a számára megadott személyes "beosztható" időpontok listáján szerepel. Ez a szabály SOHA nem szeghető meg.

              3.  **TELJES LEFEDETTSÉG (CÉL):** A két fő cél, amit el kell érned:
                  *   Minden tanárnak PONTOSAN 3 rendelkezésre állási órát kell kapnia a héten.
                  *   Minden egyes idősávba (heti 40 óra) PONTOSAN 3 tanárt kell beosztani.
                  Ezek a célok egyenrangúak és elengedhetetlenek a tökéletes megoldáshoz.

              4.  **TERHELÉS OPTIMALIZÁLÁSA (PREFERENCIA):** A fenti szabályok és célok betartása mellett törekedj arra, hogy NE ossz be tanárt olyan napra, ahol már 6 vagy több tanítási órája van. Ezt a preferenciát csak akkor hagyd figyelmen kívül, ha a 3. pontban leírt célok másképp nem teljesíthetőek. A bemeneti adatok tartalmazzák minden tanár napi óraszámát.

              **Munkamenet:**
              1.  A bemeneti adatok alapján (tanárok, lehetséges óráik, napi terhelésük) hozz létre egy új beosztást.
              2.  A kimeneted SOHA ne sértse meg az 1-es és 2-es szabályt.
              3.  Próbáld meg a 3-as pontban leírt mindkét célt maradéktalanul teljesíteni.
              4.  Az 'explanation' mezőben KÖTELEZŐ elmagyaráznod, ha nem sikerült tökéletes megoldást (a 3. pontban leírt mindkét cél teljesül) találnod, VAGY ha a 4. pontban leírt terhelési preferenciát meg kellett sértened. Írd le röviden a problémát (pl. "Gipsz Jakabnak csak 2 óra jutott a napi korlát miatt." vagy "Gipsz Jakabnak kedden 7 órája van, de csak így lehetett beosztani a 3. óráját."). Ha a megoldás tökéletes és a terhelési szabály sem sérült, hagyd üresen a mezőt.

              **Bemeneti adatok:**
              - Napok: 0 (Hétfő) - 4 (Péntek)
              - Órák: 0 (1. óra) - 7 (8. óra)
              - Beosztható tanárok, az ő lehetséges időpontjaik, és a napi tanítási óraszámaik (0-indexelt nap és óra):
              ${teacherDataForPrompt}

              **Kimeneti formátum:**
              A választ kizárólag egy JSON objektumként add vissza a megadott séma szerint.
          `;

          const responseSchema = {
              type: Type.OBJECT,
              properties: {
                  assignments: {
                      type: Type.ARRAY,
                      description: "A javasolt, szabályos beosztások listája.",
                      items: {
                          type: Type.OBJECT,
                          properties: {
                              teacherId: { type: Type.STRING, description: "A tanár egyedi azonosítója." },
                              day: { type: Type.INTEGER, description: "A nap indexe (0=Hétfő, ..., 4=Péntek)." },
                              period: { type: Type.INTEGER, description: "Az óra indexe (0=1. óra, ..., 7=8. óra)." },
                          },
                          required: ["teacherId", "day", "period"]
                      }
                  },
                  explanation: {
                      type: Type.STRING,
                      description: "Magyarázat, ha a megoldás nem tökéletes (nem minden cél teljesült). Ha a megoldás tökéletes, ez a mező lehet üres."
                  }
              },
              required: ["assignments"]
          };

          const response = await ai.models.generateContent({
              model: "gemini-2.5-flash",
              contents: prompt,
              config: {
                  responseMimeType: "application/json",
                  responseSchema: responseSchema,
              },
          });

          const jsonStr = response.text.trim();
          const result = JSON.parse(jsonStr) as { 
              assignments: { teacherId: string, day: number, period: number }[],
              explanation?: string 
          };
          
          const aiExplanation = result.explanation;

          const assignmentsBySlot = new Map<string, Teacher[]>();
          for (let day = 0; day < NUMBER_OF_DAYS; day++) {
              for (let period = 0; period < STANDBY_PERIOD_COUNT; period++) {
                  assignmentsBySlot.set(`${day}-${period}`, []);
              }
          }
          
          const teacherDutyCount = new Map<string, number>(eligibleTeachers.map(t => [t.id, 0]));
          
          result.assignments.forEach(assignment => {
              const slotKey = `${assignment.day}-${assignment.period}`;
              const teacher = findTeacher(assignment.teacherId);
              // Az AI-nak csak 0-7 közötti órákat kellene visszaadnia, de a biztonság kedvéért itt is ellenőrizzük.
              if(teacher && assignment.period < STANDBY_PERIOD_COUNT && assignmentsBySlot.has(slotKey)) {
                  assignmentsBySlot.get(slotKey)?.push(teacher);
                  teacherDutyCount.set(teacher.id, (teacherDutyCount.get(teacher.id) || 0) + 1);
              }
          });

          const newReport = {
              eligibleTeachers: eligibleTeachers.sort((a,b) => a.name.localeCompare(b.name, 'hu-HU')),
              unassignedTeachers: eligibleTeachers.filter(t => (teacherDutyCount.get(t.id) ?? 0) !== 3),
              understaffedSlots: [] as { day: number; period: number; count: number }[],
              aiExplanation: aiExplanation,
          };

          for (let day = 0; day < NUMBER_OF_DAYS; day++) {
              for (let period = 0; period < STANDBY_PERIOD_COUNT; period++) {
                  const count = assignmentsBySlot.get(`${day}-${period}`)?.length ?? 0;
                  if (count !== 3) {
                      newReport.understaffedSlots.push({ day, period, count });
                  }
              }
          }
          
          setStandbySchedule(assignmentsBySlot);
          setStandbyReport(newReport);

      } catch (error) {
          console.error("Hiba az AI-alapú javítás során:", error);
          alert("Hiba történt a mesterséges intelligencia válaszának feldolgozása közben. Kérjük, próbálja újra.");
      } finally {
          setIsGeneratingWithAI(false);
      }
  }, [currentState, standbySchedule, standbyReport, lastGeneratedTeacherIds, getEligibleTeachersAndSlots, findTeacher]);

  return {
    isStandbySelectionModalOpen,
    setIsStandbySelectionModalOpen,
    isStandbyModalOpen,
    setIsStandbyModalOpen,
    standbySchedule,
    standbyReport,
    isGeneratingWithAI,
    handleStartStandbyGeneration,
    handleRepairStandbyWithAI
  };
};
