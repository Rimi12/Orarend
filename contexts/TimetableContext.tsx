import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import type { Teacher, Class, Subject, Allocation, PlacedLesson, UnplacedLesson, TimetableCellData, Collision, SavedState, ParsedData, AllocationUpdateSummary, AppHistoryState } from '../types.ts';
import { TEACHER_COLORS } from '../constants.ts';
import { migrateHittanState } from '../utils.ts';
import { getActiveRoomCode, setActiveRoomCode, subscribeToCloudDoc, saveToCloudDoc, CLIENT_ID } from '../services/firebaseSync.ts';

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
  clearClassTimetable: (classId: string) => void;
  clearTeacherTimetable: (teacherId: string) => void;
  setTeacherAvailability: (teacherId: string, day: number, period: number, isAvailable: boolean) => void;
  setTeacherTraveling: (teacherId: string, isTraveling: boolean) => void;
  bulkUpdateTeachersAvailability: (availabilityList: { id?: string; name?: string; availability?: boolean[][]; isTraveling?: boolean }[]) => void;
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
  // Curriculum Management
  reassignAllocationTeacher: (allocationId: string, targetTeacherId: string, hoursToTransfer?: number) => void;
  updateAllocationHours: (allocationId: string, newWeeklyHours: number) => void;
  addCustomAllocation: (teacherId: string, classId: string, subjectNameOrId: string, weeklyHours: number) => void;
  removeCustomAllocation: (allocationId: string) => void;

  // Cloud Sync
  roomCode: string;
  syncStatus: 'connected' | 'syncing' | 'offline' | 'error';
  lastSyncedAt: Date | null;
  isSyncModalOpen: boolean;
  setIsSyncModalOpen: (open: boolean) => void;
  setRoomCode: (code: string) => void;
  pushToCloud: () => void;
  pullFromCloud: () => void;
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

    // ── Cloud Sync State ────────────────────────────────────────────────────────
    const [roomCode, setRoomCodeState] = useState<string>(getActiveRoomCode());
    const [syncStatus, setSyncStatus] = useState<'connected' | 'syncing' | 'offline' | 'error'>('offline');
    const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
    const [isSyncModalOpen, setIsSyncModalOpen] = useState<boolean>(false);

    const setRoomCode = useCallback((newCode: string) => {
        const sanitized = setActiveRoomCode(newCode);
        setRoomCodeState(sanitized);
    }, []);

    // Live Cloud Subscription for Timetable State
    useEffect(() => {
        if (!roomCode) return;
        setSyncStatus('syncing');

        const unsubscribe = subscribeToCloudDoc<AppHistoryState>(
            `rooms/${roomCode}/timetable/main`,
            (cloudState, updatedBy) => {
                setSyncStatus('connected');
                setLastSyncedAt(new Date());
                if (updatedBy !== CLIENT_ID && cloudState && Array.isArray(cloudState.teachers)) {
                    const migrated = migrateHittanState(cloudState);
                    setHistory(prev => {
                        const newHist = [...prev, migrated];
                        return newHist.length > 50 ? newHist.slice(newHist.length - 50) : newHist;
                    });
                    setHistoryIndex(prev => prev + 1);
                    try {
                        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({ ...migrated, version: '2.0.0' }));
                    } catch {}
                }
            },
            () => {
                setSyncStatus('offline');
            }
        );

        return () => unsubscribe();
    }, [roomCode]);

    const currentState = history[historyIndex] ?? null;
    const dataLoaded = history.length > 0 && historyIndex > -1;

    const pushToCloud = useCallback(() => {
        if (!currentState || !roomCode) return;
        setSyncStatus('syncing');
        saveToCloudDoc(`rooms/${roomCode}/timetable/main`, currentState).then((success) => {
            if (success) {
                setSyncStatus('connected');
                setLastSyncedAt(new Date());
            } else {
                setSyncStatus('offline');
            }
        });
    }, [currentState, roomCode]);

    const pullFromCloud = useCallback(() => {
        pushToCloud();
    }, [pushToCloud]);

    const sortedTeachers = useMemo(() =>
        currentState ? [...currentState.teachers].sort((a, b) => a.name.localeCompare(b.name, 'hu-HU')) : [],
    [currentState?.teachers]);

    const sortedClasses = useMemo(() =>
        currentState ? [...currentState.classes].sort((a, b) => a.name.localeCompare(b.name, 'hu-HU')) : [],
    [currentState?.classes]);

    const pushNewState = useCallback((newState: AppHistoryState) => {
        const migratedState = migrateHittanState(newState);
        let newHistory = history.slice(0, historyIndex + 1);
        newHistory.push(migratedState);
        if (newHistory.length > 50) {
            newHistory = newHistory.slice(newHistory.length - 50);
        }
        setHistory(newHistory);
        setHistoryIndex(newHistory.length - 1);

        if (roomCode) {
            saveToCloudDoc(`rooms/${roomCode}/timetable/main`, migratedState).then(success => {
                if (success) {
                    setSyncStatus('connected');
                    setLastSyncedAt(new Date());
                }
            });
        }
    }, [history, historyIndex, roomCode]);

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
        const initialState: AppHistoryState = migrateHittanState({
            teachers: data.teachers,
            classes: data.classes,
            subjects: data.subjects,
            allocations: data.allocations,
            placedLessons: [],
        });
        setSelectedTeacherId(initialState.teachers[0]?.id || null);
        setSelectedClassId(initialState.classes[0]?.id || null);
        setDriveFileId(null);
        setHistory([initialState]);
        setHistoryIndex(0);
        try {
            const stateToSave: SavedState = {
                ...initialState,
                version: '2.0.0',
                selectedTeacherId: initialState.teachers[0]?.id || null,
                selectedClassId: initialState.classes[0]?.id || null,
                driveFileId: null,
            };
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(stateToSave));
        } catch {}
        if (roomCode) {
            saveToCloudDoc(`rooms/${roomCode}/timetable/main`, initialState);
        }
    }, [roomCode]);

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

    const clearClassTimetable = useCallback((classId: string) => {
        if (!currentState) return;
        const newPlaced = currentState.placedLessons.filter(l => l.allocation.classId !== classId);
        pushNewState({ ...currentState, placedLessons: newPlaced });
    }, [currentState, pushNewState]);

    const clearTeacherTimetable = useCallback((teacherId: string) => {
        if (!currentState) return;
        const newPlaced = currentState.placedLessons.filter(l => l.allocation.teacherId !== teacherId);
        pushNewState({ ...currentState, placedLessons: newPlaced });
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

    const bulkUpdateTeachersAvailability = useCallback((availabilityList: { id?: string; name?: string; availability?: boolean[][]; isTraveling?: boolean }[]) => {
        if (!currentState) return;
        const newTeachers = currentState.teachers.map(teacher => {
            const match = availabilityList.find(a => (a.id && a.id === teacher.id) || (a.name && a.name.trim().toLowerCase() === teacher.name.trim().toLowerCase()));
            if (match) {
                return {
                    ...teacher,
                    availability: match.availability ? match.availability.map(d => [...d]) : teacher.availability,
                    isTraveling: match.isTraveling !== undefined ? match.isTraveling : teacher.isTraveling
                };
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

            const migratedState = migrateHittanState(completeState);
            setHistory([migratedState]);
            setHistoryIndex(0);

            let targetClassId = savedState.selectedClassId || null;
            if (targetClassId && !migratedState.classes.some(c => c.id === targetClassId)) {
                const oldClass = (savedState.classes || []).find(c => c.id === targetClassId);
                if (oldClass) {
                    const normName = normalizeClassName(oldClass.name);
                    const match = migratedState.classes.find(c => c.name === normName);
                    if (match) targetClassId = match.id;
                }
            }
            if (!targetClassId || !migratedState.classes.some(c => c.id === targetClassId)) {
                targetClassId = migratedState.classes[0]?.id || null;
            }

            setSelectedTeacherId(savedState.selectedTeacherId || (migratedTeachers[0]?.id || null));
            setSelectedClassId(targetClassId);
            setDriveFileId(savedState.driveFileId || null);

            try {
                const stateToSave: SavedState = {
                    ...migratedState,
                    version: '2.0.0',
                    selectedTeacherId: savedState.selectedTeacherId || (migratedTeachers[0]?.id || null),
                    selectedClassId: targetClassId,
                    driveFileId: savedState.driveFileId || null,
                };
                localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(stateToSave));
            } catch {}
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
      
      const currentAllocationsMap = new Map<string, Allocation>(allocations.map(a => [`${a.teacherId}-${a.classId}-${a.subjectId}`, a]));
      const newAllocationsMap = new Map<string, Allocation>(newAllocationsWithStableIds.map(a => [`${a.teacherId}-${a.classId}-${a.subjectId}`, a]));

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

    // ── Curriculum Management Functions ──────────────────────────────────────────
    const reassignAllocationTeacher = useCallback((allocationId: string, targetTeacherId: string, hoursToTransfer?: number) => {
        if (!currentState) return;
        const currentAlloc = currentState.allocations.find(a => a.id === allocationId);
        if (!currentAlloc || currentAlloc.teacherId === targetTeacherId) return;

        const targetTeacher = currentState.teachers.find(t => t.id === targetTeacherId);
        if (!targetTeacher) return;

        const transferAll = hoursToTransfer === undefined || hoursToTransfer >= currentAlloc.weeklyHours;

        if (transferAll) {
            // Full reassignment:
            const updatedAllocations = currentState.allocations.map(a => {
                if (a.id === allocationId) {
                    return { ...a, teacherId: targetTeacherId };
                }
                return a;
            });
            const updatedPlaced = currentState.placedLessons.map(p => {
                if (p.allocation.id === allocationId) {
                    return {
                        ...p,
                        allocation: { ...p.allocation, teacherId: targetTeacherId }
                    };
                }
                return p;
            });
            pushNewState({
                ...currentState,
                allocations: updatedAllocations,
                placedLessons: updatedPlaced
            });
        } else {
            // Partial split:
            const hoursKept = currentAlloc.weeklyHours - hoursToTransfer;
            const newAllocId = `a-${crypto.randomUUID()}`;
            const newAllocation: Allocation = {
                id: newAllocId,
                teacherId: targetTeacherId,
                classId: currentAlloc.classId,
                subjectId: currentAlloc.subjectId,
                weeklyHours: hoursToTransfer,
                originalClass: currentAlloc.originalClass,
                originalGroup: currentAlloc.originalGroup,
            };

            const updatedAllocations = currentState.allocations.map(a => {
                if (a.id === allocationId) {
                    return { ...a, weeklyHours: hoursKept };
                }
                return a;
            }).concat(newAllocation);

            // For placed lessons: keep first `hoursKept` placed lessons for currentAlloc, transfer remaining placed lessons up to `hoursToTransfer` to newAllocation
            let countKept = 0;
            let countTransferred = 0;
            const updatedPlaced = currentState.placedLessons.map(p => {
                if (p.allocation.id === allocationId) {
                    if (countKept < hoursKept) {
                        countKept++;
                        return { ...p, allocation: { ...p.allocation, weeklyHours: hoursKept } };
                    } else if (countTransferred < hoursToTransfer) {
                        countTransferred++;
                        return {
                            ...p,
                            allocation: newAllocation
                        };
                    }
                }
                return p;
            });

            pushNewState({
                ...currentState,
                allocations: updatedAllocations,
                placedLessons: updatedPlaced
            });
        }
    }, [currentState, pushNewState]);

    const updateAllocationHours = useCallback((allocationId: string, newWeeklyHours: number) => {
        if (!currentState || newWeeklyHours <= 0) return;
        const currentAlloc = currentState.allocations.find(a => a.id === allocationId);
        if (!currentAlloc) return;

        const updatedAllocations = currentState.allocations.map(a => {
            if (a.id === allocationId) {
                return { ...a, weeklyHours: newWeeklyHours };
            }
            return a;
        });

        // Check if placed lessons exceed newWeeklyHours
        let placedCount = 0;
        const updatedPlaced = currentState.placedLessons.filter(p => {
            if (p.allocation.id === allocationId) {
                placedCount++;
                return placedCount <= newWeeklyHours;
            }
            return true;
        }).map(p => {
            if (p.allocation.id === allocationId) {
                return { ...p, allocation: { ...p.allocation, weeklyHours: newWeeklyHours } };
            }
            return p;
        });

        pushNewState({
            ...currentState,
            allocations: updatedAllocations,
            placedLessons: updatedPlaced
        });
    }, [currentState, pushNewState]);

    const addCustomAllocation = useCallback((teacherId: string, classId: string, subjectNameOrId: string, weeklyHours: number) => {
        if (!currentState || !teacherId || !classId || !subjectNameOrId || weeklyHours <= 0) return;

        let subjectId = subjectNameOrId;
        let newSubjects = [...currentState.subjects];

        // Check if subjectNameOrId is an existing Subject ID or Name
        const existingSubject = currentState.subjects.find(s => s.id === subjectNameOrId || s.name.trim().toLowerCase() === subjectNameOrId.trim().toLowerCase());
        if (existingSubject) {
            subjectId = existingSubject.id;
        } else {
            subjectId = `s-${crypto.randomUUID()}`;
            newSubjects.push({ id: subjectId, name: subjectNameOrId.trim() });
        }

        const newAllocation: Allocation = {
            id: `a-${crypto.randomUUID()}`,
            teacherId,
            classId,
            subjectId,
            weeklyHours: Math.max(1, Math.min(40, Math.round(weeklyHours))),
        };

        pushNewState({
            ...currentState,
            subjects: newSubjects,
            allocations: [...currentState.allocations, newAllocation]
        });
    }, [currentState, pushNewState]);

    const removeCustomAllocation = useCallback((allocationId: string) => {
        if (!currentState) return;
        const updatedAllocations = currentState.allocations.filter(a => a.id !== allocationId);
        const updatedPlaced = currentState.placedLessons.filter(p => p.allocation.id !== allocationId);

        pushNewState({
            ...currentState,
            allocations: updatedAllocations,
            placedLessons: updatedPlaced
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
        clearClassTimetable,
        clearTeacherTimetable,
        setTeacherAvailability,
        setTeacherTraveling,
        bulkUpdateTeachersAvailability,
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
        
        // Curriculum Management
        reassignAllocationTeacher,
        updateAllocationHours,
        addCustomAllocation,
        removeCustomAllocation,

        roomCode,
        syncStatus,
        lastSyncedAt,
        isSyncModalOpen,
        setIsSyncModalOpen,
        setRoomCode,
        pushToCloud,
        pullFromCloud,
    }), [
        dataLoaded, currentState, sortedTeachers, sortedClasses, loadParsedData, getUnplacedLessonsForTeacher,
        addLesson, removeLesson, setPlacedLessons, findClass, findSubject, findTeacher,
        clearClassTimetable, clearTeacherTimetable, setTeacherAvailability, setTeacherTraveling,
        bulkUpdateTeachersAvailability, checkCollision, saveStateToStorage,
        loadStateFromStorage, loadState, clearAllData,
        prepareAllocationUpdate, applyAllocationUpdate, undo, redo, canUndo, canRedo,
        selectedTeacherId, selectedClassId, driveFileId,
        setSelectedTeacherId, setSelectedClassId, setDriveFileId,
        reassignAllocationTeacher, updateAllocationHours, addCustomAllocation, removeCustomAllocation,
        roomCode, syncStatus, lastSyncedAt, isSyncModalOpen, setRoomCode, pushToCloud, pullFromCloud
    ]);

    return (
        <TimetableContext.Provider value={value}>
            {children}
        </TimetableContext.Provider>
    );
};
