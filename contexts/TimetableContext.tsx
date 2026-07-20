import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import type { Teacher, Class, Subject, Allocation, PlacedLesson, UnplacedLesson, TimetableCellData, Collision, SavedState, ParsedData, AllocationUpdateSummary, AppHistoryState } from '../types.ts';
import { TEACHER_COLORS } from '../constants.ts';

const LOCAL_STORAGE_KEY = 'timetableAppStateV1';

interface TimetableContextType {
  dataLoaded: boolean;
  currentState: AppHistoryState | null;
  sortedTeachers: Teacher[];
  sortedClasses: Class[];
  loadParsedData: (data: ParsedData) => void;
  getUnplacedLessonsForTeacher: (teacherId: string) => UnplacedLesson[];
  addLesson: (allocation: Allocation, cell: TimetableCellData) => void;
  removeLesson: (lessonId: string) => void;
  findClass: (id: string) => Class | undefined;
  findSubject: (id: string) => Subject | undefined;
  findTeacher: (id: string) => Teacher | undefined;
  setTeacherAvailability: (teacherId: string, day: number, period: number, isAvailable: boolean) => void;
  setTeacherTraveling: (teacherId: string, isTraveling: boolean) => void;
  checkCollision: (allocation: Allocation, cell: TimetableCellData) => Collision;
  saveStateToStorage: () => void;
  loadStateFromStorage: () => void;
  loadState: (savedState: SavedState) => void;
  clearAllData: () => void;
  prepareAllocationUpdate: (parsedData: ParsedData) => AllocationUpdateSummary;
  applyAllocationUpdate: (summary: AllocationUpdateSummary) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  selectedTeacherId: string | null;
  selectedClassId: string | null;
  driveFileId: string | null;
  setPlacedLessons: (placedLessons: PlacedLesson[]) => void;
}

const TimetableContext = createContext<TimetableContextType | undefined>(undefined);

export const useTimetable = () => {
    const context = useContext(TimetableContext);
    if (context === undefined) {
        throw new Error('useTimetable must be used within a TimetableProvider');
    }
    return context;
};


export const TimetableProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [history, setHistory] = useState<AppHistoryState[]>([]);
    const [historyIndex, setHistoryIndex] = useState<number>(-1);
    
    const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(null);
    const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
    const [driveFileId, setDriveFileId] = useState<string | null>(null);

    const currentState = history[historyIndex] ?? null;
    const dataLoaded = history.length > 0 && historyIndex > -1;

    const sortedTeachers = useMemo(() =>
        currentState ? [...currentState.teachers].sort((a, b) => a.name.localeCompare(b.name, 'hu-HU')) : [],
    [currentState?.teachers]);

    const sortedClasses = useMemo(() =>
        currentState ? [...currentState.classes].sort((a, b) => a.name.localeCompare(b.name, 'hu-HU')) : [],
    [currentState?.classes]);

    const pushNewState = useCallback((newState: AppHistoryState) => {
        let newHistory = history.slice(0, historyIndex + 1);
        newHistory.push(newState);
        if (newHistory.length > 50) {
            newHistory = newHistory.slice(newHistory.length - 50);
        }
        setHistory(newHistory);
        setHistoryIndex(newHistory.length - 1);
    }, [history, historyIndex]);

    const undo = useCallback(() => {
        if (historyIndex > 0) {
            setHistoryIndex(prev => prev - 1);
        }
    }, [historyIndex]);

    const redo = useCallback(() => {
        if (historyIndex < history.length - 1) {
            setHistoryIndex(prev => prev + 1);
        }
    }, [historyIndex, history.length]);

    const canUndo = historyIndex > 0;
    const canRedo = historyIndex < history.length - 1;
    
    const loadParsedData = useCallback((data: ParsedData) => {
        const initialState: AppHistoryState = {
            teachers: data.teachers,
            classes: data.classes,
            subjects: data.subjects,
            allocations: data.allocations,
            placedLessons: [],
        };
        setSelectedTeacherId(data.teachers[0]?.id || null);
        setSelectedClassId(data.classes[0]?.id || null);
        setDriveFileId(null);
        setHistory([initialState]);
        setHistoryIndex(0);
    }, []);

    const findClass = useCallback((id: string) => currentState?.classes.find(c => c.id === id), [currentState]);
    const findSubject = useCallback((id: string) => currentState?.subjects.find(s => s.id === id), [currentState]);
    const findTeacher = useCallback((id: string) => currentState?.teachers.find(t => t.id === id), [currentState]);

    const getUnplacedLessonsForTeacher = useCallback((teacherId: string) => {
        if (!currentState || !teacherId) return [];
        const { allocations, placedLessons } = currentState;
        const teacherAllocations = allocations.filter(a => a.teacherId === teacherId);
        return teacherAllocations.map(allocation => {
            const placedCount = placedLessons.filter(p => p.allocation.id === allocation.id).length;
            return {
                allocation,
                remainingHours: allocation.weeklyHours - placedCount,
            };
        }).sort((a,b) => a.allocation.id.localeCompare(b.allocation.id));
    }, [currentState]);

    const checkCollision = useCallback((allocation: Allocation, cell: TimetableCellData): Collision => {
        if (!currentState) return { teacher: false, class: false, availability: true };

        const teacher = findTeacher(allocation.teacherId);
        const teacherIsAvailable = teacher?.availability[cell.day]?.[cell.period] ?? true;
        
        const isTeacherBusy = currentState.placedLessons.some(p => 
            p.day === cell.day &&
            p.period === cell.period &&
            p.allocation.teacherId === allocation.teacherId
        );
        
        const isClassBusy = currentState.placedLessons.some(p =>
            p.day === cell.day &&
            p.period === cell.period &&
            p.allocation.classId === allocation.classId
        );

        return {
            teacher: isTeacherBusy,
            class: isClassBusy,
            availability: !teacherIsAvailable,
        };
    }, [currentState, findTeacher]);

    const addLesson = useCallback((allocation: Allocation, cell: TimetableCellData) => {
        if (!currentState) return;
        const newLesson: PlacedLesson = {
            id: `${allocation.id}-${crypto.randomUUID()}`,
            allocation,
            day: cell.day,
            period: cell.period,
        };
        pushNewState({ ...currentState, placedLessons: [...currentState.placedLessons, newLesson] });
    }, [currentState, pushNewState]);


    const removeLesson = useCallback((lessonId: string) => {
        if (!currentState) return;
        pushNewState({ ...currentState, placedLessons: currentState.placedLessons.filter(p => p.id !== lessonId) });
    }, [currentState, pushNewState]);

    const setPlacedLessons = useCallback((placedLessons: PlacedLesson[]) => {
        if (!currentState) return;
        pushNewState({ ...currentState, placedLessons });
    }, [currentState, pushNewState]);

    const setTeacherAvailability = useCallback((teacherId: string, day: number, period: number, isAvailable: boolean) => {
        if (!currentState) return;
        let newPlacedLessons = [...currentState.placedLessons];
        const newTeachers = currentState.teachers.map(teacher => {
            if (teacher.id === teacherId) {
                const newAvailability = teacher.availability.map(d => [...d]);
                newAvailability[day][period] = isAvailable;
                if(!isAvailable) {
                    newPlacedLessons = newPlacedLessons.filter(l => 
                        !(l.allocation.teacherId === teacherId && l.day === day && l.period === period)
                    );
                }
                return { ...teacher, availability: newAvailability };
            }
            return teacher;
        });
        pushNewState({ ...currentState, teachers: newTeachers, placedLessons: newPlacedLessons });
    }, [currentState, pushNewState]);
    
    const setTeacherTraveling = useCallback((teacherId: string, isTraveling: boolean) => {
        if (!currentState) return;
        const newTeachers = currentState.teachers.map(teacher => {
            if (teacher.id === teacherId) {
                return { ...teacher, isTraveling };
            }
            return teacher;
        });
        pushNewState({ ...currentState, teachers: newTeachers });
    }, [currentState, pushNewState]);
    
    const saveStateToStorage = useCallback(() => {
        if (!currentState) return;
        try {
            const stateToSave: SavedState = {
                ...currentState,
                version: '2.0.0',
                selectedTeacherId,
                selectedClassId,
                driveFileId,
            };
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(stateToSave));
        } catch (error) {
            console.error("Hiba a mentés során:", error);
        }
    }, [currentState, selectedTeacherId, selectedClassId, driveFileId]);
    
    const loadState = useCallback((savedState: SavedState) => {
        try {
            if (!savedState.version || !savedState.teachers || !savedState.placedLessons || !savedState.allocations) {
                throw new Error("A mentett adat formátuma érvénytelen vagy hiányos.");
            }
            
            const migratedTeachers = savedState.teachers.map((teacher, index) => {
                if (!teacher.color) {
                    return { ...teacher, color: TEACHER_COLORS[index % TEACHER_COLORS.length] };
                }
                return teacher;
            });
            
            // Reconstruct the state object ensuring all keys are present to prevent crashes with older save files.
            const completeState: AppHistoryState = {
                teachers: migratedTeachers,
                classes: savedState.classes || [],
                subjects: savedState.subjects || [],
                allocations: savedState.allocations || [],
                placedLessons: savedState.placedLessons || [],
            };

            setSelectedTeacherId(savedState.selectedTeacherId || (migratedTeachers[0]?.id || null));
            setSelectedClassId(savedState.selectedClassId || (savedState.classes?.[0]?.id || null));
            setDriveFileId(savedState.driveFileId || null);

            setHistory([completeState]);
            setHistoryIndex(0);
        } catch (error) {
            console.error("Hiba az állapot betöltése során:", error);
            alert(`Hiba történt az állapot betöltése közben. ${error instanceof Error ? error.message : ''}`);
        }
    }, []);

    const loadStateFromStorage = useCallback(() => {
        try {
            const savedStateJSON = localStorage.getItem(LOCAL_STORAGE_KEY);
            if (!savedStateJSON) return;
            const savedState: SavedState = JSON.parse(savedStateJSON);
            loadState(savedState);
        } catch (error) {
            console.error("Hiba a betöltés során (localStorage):", error);
            alert("Hiba történt az állapot betöltése közben. A mentett adat sérült lehet.");
            localStorage.removeItem(LOCAL_STORAGE_KEY);
        }
    }, [loadState]);

    const clearAllData = useCallback(() => {
        localStorage.removeItem(LOCAL_STORAGE_KEY);
        setHistory([]);
        setHistoryIndex(-1);
        setSelectedTeacherId(null);
        setSelectedClassId(null);
        setDriveFileId(null);
    }, []);

    const prepareAllocationUpdate = useCallback((parsedData: ParsedData): AllocationUpdateSummary => {
      if (!currentState) throw new Error("Az alkalmazás állapota nem betöltött.");
      const { teachers, classes, subjects, allocations, placedLessons } = currentState;

      const summary: AllocationUpdateSummary = {
        newTeachers: [], removedTeachers: [], newClasses: [], removedClasses: [], newSubjects: [],
        removedSubjects: [], newAllocations: [], removedAllocations: [], modifiedAllocations: [], lessonsToRemove: []
      };
      
      const processEntities = <T extends { id: string; name: string; }>(
        currentEntities: T[], newEntitiesData: T[], entityType: 'teacher' | 'class' | 'subject'
      ): { finalEntities: T[], newItems: T[], removedItems: T[] } => {
        const currentMap = new Map(currentEntities.map(e => [e.name, e]));
        const newMap = new Map(newEntitiesData.map(e => [e.name, e]));
        // FIX: Add 'as T' to preserve the full type (e.g., Teacher) after spreading.
        const newItems = newEntitiesData.filter(e => !currentMap.has(e.name)).map((e, i) => ({ ...e, id: `${entityType[0]}-${crypto.randomUUID()}` } as T));
        const removedItems = currentEntities.filter(e => !newMap.has(e.name));
        const finalEntities = [...currentEntities.filter(e => newMap.has(e.name)), ...newItems];
        return { finalEntities, newItems, removedItems };
      };

      const { finalEntities: finalTeachers, newItems: newTeachers, removedItems: removedTeachers } = processEntities(teachers, parsedData.teachers, 'teacher');
      const { finalEntities: finalClasses, newItems: newClasses, removedItems: removedClasses } = processEntities(classes, parsedData.classes, 'class');
      const { finalEntities: finalSubjects, newItems: newSubjects, removedItems: removedSubjects } = processEntities(subjects, parsedData.subjects, 'subject');
      
      summary.newTeachers = newTeachers as Teacher[];
      summary.removedTeachers = removedTeachers as Teacher[];
      summary.newClasses = newClasses as Class[];
      summary.removedClasses = removedClasses as Class[];
      summary.newSubjects = newSubjects as Subject[];
      summary.removedSubjects = removedSubjects as Subject[];

      const teacherNameMap = new Map(finalTeachers.map(t => [t.name, t.id]));
      const classNameMap = new Map(finalClasses.map(c => [c.name, c.id]));
      const subjectNameMap = new Map(finalSubjects.map(s => [s.name, s.id]));

      const newAllocationsWithStableIds: Allocation[] = parsedData.allocations.map((alloc, i) => {
        const teacherName = parsedData.teachers.find(t => t.id === alloc.teacherId)?.name;
        const className = parsedData.classes.find(c => c.id === alloc.classId)?.name;
        const subjectName = parsedData.subjects.find(s => s.id === alloc.subjectId)?.name;

        if(!teacherName || !className || !subjectName) return null;
        
        return {
          id: `a-${crypto.randomUUID()}`,
          teacherId: teacherNameMap.get(teacherName)!,
          classId: classNameMap.get(className)!,
          subjectId: subjectNameMap.get(subjectName)!,
          weeklyHours: alloc.weeklyHours,
        };
      }).filter((a): a is Allocation => a !== null);
      
      const currentAllocationsMap = new Map(allocations.map(a => [`${a.teacherId}-${a.classId}-${a.subjectId}`, a]));
      const newAllocationsMap = new Map(newAllocationsWithStableIds.map(a => [`${a.teacherId}-${a.classId}-${a.subjectId}`, a]));

      summary.removedAllocations = allocations.filter(a => !newAllocationsMap.has(`${a.teacherId}-${a.classId}-${a.subjectId}`));
      summary.newAllocations = newAllocationsWithStableIds.filter(a => !currentAllocationsMap.has(`${a.teacherId}-${a.classId}-${a.subjectId}`));

      newAllocationsWithStableIds.forEach(newAlloc => {
        const key = `${newAlloc.teacherId}-${newAlloc.classId}-${newAlloc.subjectId}`;
        const oldAlloc = currentAllocationsMap.get(key);
        if (oldAlloc && oldAlloc.weeklyHours !== newAlloc.weeklyHours) {
          summary.modifiedAllocations.push({ old: oldAlloc, new: newAlloc });
        }
      });

      const removedTeacherIds = new Set(summary.removedTeachers.map(t => t.id));
      const removedClassIds = new Set(summary.removedClasses.map(c => c.id));
      const removedSubjectIds = new Set(summary.removedSubjects.map(s => s.id));
      const removedAllocationIds = new Set(summary.removedAllocations.map(a => a.id));

      summary.lessonsToRemove = placedLessons.filter(lesson => 
        removedTeacherIds.has(lesson.allocation.teacherId) ||
        removedClassIds.has(lesson.allocation.classId) ||
        removedSubjectIds.has(lesson.allocation.subjectId) ||
        removedAllocationIds.has(lesson.allocation.id)
      );

      summary.modifiedAllocations.forEach(({ old, new: newAlloc }) => {
        const placedCount = placedLessons.filter(p => p.allocation.id === old.id).length;
        if (placedCount > newAlloc.weeklyHours) {
          const lessonsForThisAlloc = placedLessons.filter(p => p.allocation.id === old.id);
          const lessonsToCull = lessonsForThisAlloc.slice(newAlloc.weeklyHours);
          summary.lessonsToRemove.push(...lessonsToCull);
        }
      });

      return summary;
    }, [currentState]);

    const applyAllocationUpdate = useCallback((summary: AllocationUpdateSummary) => {
        if (!currentState) return;

        const newTeachers = currentState.teachers.filter(t => !summary.removedTeachers.find(rt => rt.id === t.id)).concat(summary.newTeachers);
        const newClasses = currentState.classes.filter(c => !summary.removedClasses.find(rc => rc.id === c.id)).concat(summary.newClasses);
        const newSubjects = currentState.subjects.filter(s => !summary.removedSubjects.find(rs => rs.id === s.id)).concat(summary.newSubjects);

        const allocationsAfterRemoval = currentState.allocations.filter(a => !summary.removedAllocations.find(ra => ra.id === a.id));
        const allocationsAfterModification = allocationsAfterRemoval.map(alloc => {
            const modification = summary.modifiedAllocations.find(m => m.old.id === alloc.id);
            return modification ? { ...alloc, weeklyHours: modification.new.weeklyHours } : alloc;
        });
        const newAllocations = [...allocationsAfterModification, ...summary.newAllocations];
        const lessonsToRemoveIds = new Set(summary.lessonsToRemove.map(l => l.id));
        const newPlacedLessons = currentState.placedLessons.filter(l => !lessonsToRemoveIds.has(l.id));

        pushNewState({
            ...currentState,
            teachers: newTeachers,
            classes: newClasses,
            subjects: newSubjects,
            allocations: newAllocations,
            placedLessons: newPlacedLessons,
        });
    }, [currentState, pushNewState]);

    const value = useMemo(() => ({
        dataLoaded,
        currentState,
        sortedTeachers,
        sortedClasses,
        loadParsedData,
        getUnplacedLessonsForTeacher,
        addLesson,
        removeLesson,
        findClass,
        findSubject,
        findTeacher,
        setTeacherAvailability,
        setTeacherTraveling,
        checkCollision,
        saveStateToStorage,
        loadStateFromStorage,
        loadState,
        clearAllData,
        prepareAllocationUpdate,
        applyAllocationUpdate,
        undo,
        redo,
        canUndo,
        canRedo,
        selectedTeacherId,
        selectedClassId,
        driveFileId,
        setSelectedTeacherId,
        setSelectedClassId,
        setDriveFileId,
        setPlacedLessons,
    }), [
        dataLoaded, currentState, sortedTeachers, sortedClasses, loadParsedData, getUnplacedLessonsForTeacher,
        addLesson, removeLesson, setPlacedLessons, findClass, findSubject, findTeacher,
        setTeacherAvailability, setTeacherTraveling, checkCollision, saveStateToStorage,
        loadStateFromStorage, loadState, clearAllData,
        prepareAllocationUpdate, applyAllocationUpdate, undo, redo, canUndo, canRedo,
        selectedTeacherId, selectedClassId, driveFileId,
        setSelectedTeacherId, setSelectedClassId, setDriveFileId
    ]);

    return (
        <TimetableContext.Provider value={value}>
            {children}
        </TimetableContext.Provider>
    );
};
