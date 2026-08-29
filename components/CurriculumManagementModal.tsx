import React, { useState, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import type { Teacher, Class, Subject, Allocation, PlacedLesson, ParsedData } from '../types.ts';
import { DAYS_OF_WEEK } from '../constants.ts';
import { parseTimetableFile, normalizeClassName, normalizeSubjectName } from '../utils.ts';
import { Squares2X2Icon } from './icons/Squares2X2Icon.tsx';
import { DocumentArrowUpIcon } from './icons/DocumentArrowUpIcon.tsx';

interface CurriculumManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  teachers: Teacher[];
  classes: Class[];
  subjects: Subject[];
  allocations: Allocation[];
  placedLessons: PlacedLesson[];
  initialAllocations?: Allocation[];
  reassignAllocationTeacher: (allocationId: string, targetTeacherId: string, hoursToTransfer?: number) => void;
  updateAllocationHours: (allocationId: string, newWeeklyHours: number) => void;
  addCustomAllocation: (teacherId: string, classId: string, subjectNameOrId: string, weeklyHours: number) => void;
  removeCustomAllocation: (allocationId: string) => void;
  onExportCurriculum?: (teacherIdFilter?: string) => void;
}

interface CandidateEvaluation {
  teacher: Teacher;
  totalCurrentHours: number;
  freeCount: number;
  totalPlacedCount: number;
  fitScore: 'perfect' | 'partial' | 'clash' | 'free';
  clashes: { day: number; period: number; reason: string }[];
  isAvailableAll: boolean;
}

export type DiffChangeType = 'teacher_changed' | 'hours_changed' | 'added_in_app' | 'removed_in_app' | 'identical';

export interface DiffRowItem {
  key: string;
  className: string;
  groupName: string;
  subjectName: string;
  baseTeacherName: string;
  baseWeeklyHours: number;
  currentTeacherName: string;
  currentWeeklyHours: number;
  changeType: DiffChangeType;
  details: string;
}

export const CurriculumManagementModal: React.FC<CurriculumManagementModalProps> = ({
  isOpen,
  onClose,
  teachers,
  classes,
  subjects,
  allocations,
  placedLessons,
  initialAllocations,
  reassignAllocationTeacher,
  updateAllocationHours,
  addCustomAllocation,
  removeCustomAllocation,
  onExportCurriculum
}) => {
  // Navigation Tabs: 'edit' | 'diff' | 'export'
  const [activeTab, setActiveTab] = useState<'edit' | 'diff' | 'export'>('edit');

  const [searchTerm, setSearchTerm] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'teacher' | 'class'>('all');
  const [selectedTeacherFilter, setSelectedTeacherFilter] = useState<string>('');
  const [selectedClassFilter, setSelectedClassFilter] = useState<string>('');
  const [isAddFormOpen, setIsAddFormOpen] = useState(false);

  // New Allocation Form State
  const [newTeacherId, setNewTeacherId] = useState('');
  const [newClassId, setNewClassId] = useState('');
  const [newSubjectInput, setNewSubjectInput] = useState('');
  const [newWeeklyHours, setNewWeeklyHours] = useState(2);

  // Smart Reassignment View State
  const [reassigningAlloc, setReassigningAlloc] = useState<Allocation | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string>('');
  const [candidateFilter, setCandidateFilter] = useState<'all' | 'perfect' | 'partial'>('all');
  const [candidateSearch, setCandidateSearch] = useState('');
  const [transferHours, setTransferHours] = useState<number>(1);
  const [transferType, setTransferType] = useState<'all' | 'partial'>('all');

  // ── Diff & Comparison State ──────────────────────────────────────────────────
  const [diffSource, setDiffSource] = useState<'initial' | 'uploaded'>('initial');
  const [uploadedKretaData, setUploadedKretaData] = useState<ParsedData | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string>('');
  const [diffFilter, setDiffFilter] = useState<'all' | 'changes_only' | 'teacher_only' | 'hours_only' | 'added_only' | 'removed_only'>('changes_only');
  const [diffSearch, setDiffSearch] = useState('');
  const [showTeacherHourSummary, setShowTeacherHourSummary] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Lookup maps
  const teacherMap = useMemo(() => new Map(teachers.map(t => [t.id, t])), [teachers]);
  const classMap = useMemo(() => new Map(classes.map(c => [c.id, c])), [classes]);
  const subjectMap = useMemo(() => new Map(subjects.map(s => [s.id, s])), [subjects]);

  // Placed hours counter per allocation ID
  const placedCountMap = useMemo(() => {
    const map = new Map<string, number>();
    placedLessons.forEach(p => {
      map.set(p.allocation.id, (map.get(p.allocation.id) || 0) + 1);
    });
    return map;
  }, [placedLessons]);

  // Sorted helpers
  const sortedTeachers = useMemo(() => [...teachers].sort((a, b) => a.name.localeCompare(b.name, 'hu-HU')), [teachers]);
  const sortedClasses = useMemo(() => [...classes].sort((a, b) => a.name.localeCompare(b.name, 'hu-HU')), [classes]);
  const sortedSubjects = useMemo(() => [...subjects].sort((a, b) => a.name.localeCompare(b.name, 'hu-HU')), [subjects]);

  // Filtered allocations for main view
  const filteredAllocations = useMemo(() => {
    return allocations.filter(alloc => {
      const teacher = teacherMap.get(alloc.teacherId);
      const tClass = classMap.get(alloc.classId);
      const subject = subjectMap.get(alloc.subjectId);

      const teacherName = teacher?.name || '';
      const className = tClass?.name || '';
      const subjectName = subject?.name || '';

      if (filterMode === 'teacher' && selectedTeacherFilter && alloc.teacherId !== selectedTeacherFilter) {
        return false;
      }
      if (filterMode === 'class' && selectedClassFilter && alloc.classId !== selectedClassFilter) {
        return false;
      }

      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase().trim();
        const matchesTeacher = teacherName.toLowerCase().includes(query);
        const matchesClass = className.toLowerCase().includes(query);
        const matchesSubject = subjectName.toLowerCase().includes(query);
        if (!matchesTeacher && !matchesClass && !matchesSubject) {
          return false;
        }
      }

      return true;
    }).sort((a, b) => {
      const tA = teacherMap.get(a.teacherId)?.name || '';
      const tB = teacherMap.get(b.teacherId)?.name || '';
      const comp = tA.localeCompare(tB, 'hu-HU');
      if (comp !== 0) return comp;
      const cA = classMap.get(a.classId)?.name || '';
      const cB = classMap.get(b.classId)?.name || '';
      return cA.localeCompare(cB, 'hu-HU');
    });
  }, [allocations, filterMode, selectedTeacherFilter, selectedClassFilter, searchTerm, teacherMap, classMap, subjectMap]);

  // ── Smart Candidates Calculation ─────────────────────────────────────────────
  const candidateEvaluations = useMemo<CandidateEvaluation[]>(() => {
    if (!reassigningAlloc) return [];

    const allocPlaced = placedLessons.filter(p => p.allocation.id === reassigningAlloc.id);
    const targetTeachers = sortedTeachers.filter(t => t.id !== reassigningAlloc.teacherId);

    const evals: CandidateEvaluation[] = targetTeachers.map(teacher => {
      const tPlaced = placedLessons.filter(p => p.allocation.teacherId === teacher.id);
      const totalCurrentHours = allocations
        .filter(a => a.teacherId === teacher.id)
        .reduce((sum, a) => sum + a.weeklyHours, 0);

      const clashes: { day: number; period: number; reason: string }[] = [];
      let freeCount = 0;
      let isAvailableAll = true;

      allocPlaced.forEach(pl => {
        const isAvailable = teacher.availability?.[pl.day]?.[pl.period] ?? true;
        if (!isAvailable) isAvailableAll = false;

        const collision = tPlaced.find(p => p.day === pl.day && p.period === pl.period);

        if (collision) {
          const colSubject = subjectMap.get(collision.allocation.subjectId)?.name || 'Óra';
          const colClass = classMap.get(collision.allocation.classId)?.name || 'Osztály';
          clashes.push({
            day: pl.day,
            period: pl.period,
            reason: `Foglalt: ${colSubject} (${colClass})`
          });
        } else if (!isAvailable) {
          clashes.push({
            day: pl.day,
            period: pl.period,
            reason: 'Nem elérhető (nem tanít)'
          });
        } else {
          freeCount++;
        }
      });

      let fitScore: 'perfect' | 'partial' | 'clash' | 'free' = 'free';
      if (allocPlaced.length > 0) {
        if (freeCount === allocPlaced.length) {
          fitScore = 'perfect';
        } else if (freeCount > 0) {
          fitScore = 'partial';
        } else {
          fitScore = 'clash';
        }
      }

      return {
        teacher,
        totalCurrentHours,
        freeCount,
        totalPlacedCount: allocPlaced.length,
        fitScore,
        clashes,
        isAvailableAll
      };
    });

    return evals.sort((a, b) => {
      const scoreOrder = { perfect: 0, partial: 1, free: 2, clash: 3 };
      const sComp = scoreOrder[a.fitScore] - scoreOrder[b.fitScore];
      if (sComp !== 0) return sComp;
      return a.totalCurrentHours - b.totalCurrentHours;
    });
  }, [reassigningAlloc, sortedTeachers, allocations, placedLessons, subjectMap, classMap]);

  const filteredCandidates = useMemo(() => {
    return candidateEvaluations.filter(c => {
      if (candidateFilter === 'perfect' && c.fitScore !== 'perfect' && c.fitScore !== 'free') return false;
      if (candidateFilter === 'partial' && c.fitScore === 'clash') return false;
      if (candidateSearch.trim()) {
        return c.teacher.name.toLowerCase().includes(candidateSearch.toLowerCase().trim());
      }
      return true;
    });
  }, [candidateEvaluations, candidateFilter, candidateSearch]);

  const activeCandidate = useMemo(() => {
    return candidateEvaluations.find(c => c.teacher.id === selectedCandidateId) || candidateEvaluations[0] || null;
  }, [candidateEvaluations, selectedCandidateId]);

  // ── Handle Upload Kréta TTF File for Comparison ──────────────────────────────
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const binaryStr = event.target?.result;
        if (!binaryStr) return;
        const workbook = XLSX.read(binaryStr, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        const parsed = parseTimetableFile(rows);
        
        setUploadedKretaData(parsed);
        setUploadedFileName(file.name);
        setDiffSource('uploaded');
        alert(`Sikeresen beolvasva a Kréta tantárgyfelosztás fájl (${file.name})!\n${parsed.teachers.length} pedagógus, ${parsed.allocations.length} tantárgyfelosztási sor.`);
      } catch (err) {
        console.error("Hiba a Kréta fájl beolvasása közben:", err);
        alert("Hiba történt a Kréta tantárgyfelosztás Excel fájl beolvasása közben.");
      } finally {
        e.target.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  // ── Comparison Engine Calculation ────────────────────────────────────────────
  const { diffRows, diffStats, teacherHourComparison } = useMemo(() => {
    // Determine baseline allocations
    let baseAllocs: Allocation[] = [];
    let baseTeacherMap = new Map<string, string>();
    let baseClassMap = new Map<string, string>();
    let baseSubjectMap = new Map<string, string>();

    if (diffSource === 'uploaded' && uploadedKretaData) {
      baseAllocs = uploadedKretaData.allocations;
      uploadedKretaData.teachers.forEach(t => baseTeacherMap.set(t.id, t.name));
      uploadedKretaData.classes.forEach(c => baseClassMap.set(c.id, c.name));
      uploadedKretaData.subjects.forEach(s => baseSubjectMap.set(s.id, s.name));
    } else {
      baseAllocs = initialAllocations || [];
      teachers.forEach(t => baseTeacherMap.set(t.id, t.name));
      classes.forEach(c => baseClassMap.set(c.id, c.name));
      subjects.forEach(s => baseSubjectMap.set(s.id, s.name));
    }

    // Helper to generate a normalized item key
    const makeItemKey = (alloc: Allocation, cMap: Map<string, any>, sMap: Map<string, any>) => {
      const origC = typeof alloc.originalClass === 'string' ? alloc.originalClass : '';
      const origG = typeof alloc.originalGroup === 'string' ? alloc.originalGroup : '';
      
      const cVal = cMap.get(alloc.classId);
      const cName = typeof cVal === 'string' ? cVal : (cVal && typeof cVal === 'object' ? cVal.name : '') || '';
      
      const sVal = sMap.get(alloc.subjectId);
      const sName = typeof sVal === 'string' ? sVal : (sVal && typeof sVal === 'object' ? sVal.name : '') || '';

      const normC = normalizeClassName(origC || (origG ? '' : cName));
      const normG = origG || (typeof cName === 'string' && cName.includes('csoport') ? cName : '');
      const normS = normalizeSubjectName(sName);

      return `${normC}###${normG}###${normS}`;
    };

    // Group base allocations by itemKey
    interface AllocAgg {
      teacherName: string;
      weeklyHours: number;
      className: string;
      groupName: string;
      subjectName: string;
    }

    const baseMap = new Map<string, AllocAgg[]>();
    baseAllocs.forEach(a => {
      const key = makeItemKey(a, baseClassMap, baseSubjectMap);
      const tVal = baseTeacherMap.get(a.teacherId);
      const tName = typeof tVal === 'string' ? tVal : (tVal && typeof tVal === 'object' ? (tVal as any).name : 'Ismeretlen tanár') || 'Ismeretlen tanár';
      
      const cVal = baseClassMap.get(a.classId);
      const cName = a.originalClass || (typeof cVal === 'string' ? cVal : (cVal && typeof cVal === 'object' ? (cVal as any).name : '')) || '';
      const gName = a.originalGroup || '';
      
      const sVal = baseSubjectMap.get(a.subjectId);
      const sName = (typeof sVal === 'string' ? sVal : (sVal && typeof sVal === 'object' ? (sVal as any).name : '')) || '';

      if (!baseMap.has(key)) baseMap.set(key, []);
      baseMap.get(key)!.push({
        teacherName: tName,
        weeklyHours: a.weeklyHours,
        className: cName,
        groupName: gName,
        subjectName: sName
      });
    });

    // Group current allocations by itemKey
    const currentMap = new Map<string, AllocAgg[]>();
    allocations.forEach(a => {
      const key = makeItemKey(a, classMap, subjectMap);
      const tName = teacherMap.get(a.teacherId)?.name || 'Ismeretlen tanár';
      const cName = a.originalClass || classMap.get(a.classId)?.name || '';
      const gName = a.originalGroup || '';
      const sName = subjectMap.get(a.subjectId)?.name || '';

      if (!currentMap.has(key)) currentMap.set(key, []);
      currentMap.get(key)!.push({
        teacherName: tName,
        weeklyHours: a.weeklyHours,
        className: cName,
        groupName: gName,
        subjectName: sName
      });
    });

    // All unique keys
    const allKeys = new Set([...Array.from(baseMap.keys()), ...Array.from(currentMap.keys())]);
    const rows: DiffRowItem[] = [];

    let teacherChangesCount = 0;
    let hoursChangesCount = 0;
    let addedCount = 0;
    let removedCount = 0;

    allKeys.forEach(key => {
      const baseItems = baseMap.get(key) || [];
      const currentItems = currentMap.get(key) || [];

      // Extract sample names
      const sample = currentItems[0] || baseItems[0];
      const className = sample?.className || '';
      const groupName = sample?.groupName || '';
      const subjectName = sample?.subjectName || '';

      // Check existence
      if (baseItems.length === 0 && currentItems.length > 0) {
        // Added in current app
        addedCount++;
        currentItems.forEach(ci => {
          rows.push({
            key,
            className,
            groupName,
            subjectName,
            baseTeacherName: '— (Nem szerepel)',
            baseWeeklyHours: 0,
            currentTeacherName: ci.teacherName,
            currentWeeklyHours: ci.weeklyHours,
            changeType: 'added_in_app',
            details: `Új felosztás az órarendben: +${ci.weeklyHours} óra (${ci.teacherName})`
          });
        });
        return;
      }

      if (currentItems.length === 0 && baseItems.length > 0) {
        // Removed in current app / only in base
        removedCount++;
        baseItems.forEach(bi => {
          rows.push({
            key,
            className,
            groupName,
            subjectName,
            baseTeacherName: bi.teacherName,
            baseWeeklyHours: bi.weeklyHours,
            currentTeacherName: '— (Törölve)',
            currentWeeklyHours: 0,
            changeType: 'removed_in_app',
            details: `Hiányzik az órarendből: volt ${bi.weeklyHours} óra (${bi.teacherName})`
          });
        });
        return;
      }

      // Both exist: compare teacher and hours
      const baseTotalHours = baseItems.reduce((s, i) => s + i.weeklyHours, 0);
      const currTotalHours = currentItems.reduce((s, i) => s + i.weeklyHours, 0);
      const baseTeachersStr = baseItems.map(i => i.teacherName).sort().join(', ');
      const currTeachersStr = currentItems.map(i => i.teacherName).sort().join(', ');

      const isTeacherDiff = baseTeachersStr !== currTeachersStr;
      const isHoursDiff = baseTotalHours !== currTotalHours;

      if (isTeacherDiff && isHoursDiff) {
        teacherChangesCount++;
        hoursChangesCount++;
        rows.push({
          key,
          className,
          groupName,
          subjectName,
          baseTeacherName: `${baseTeachersStr} (${baseTotalHours} óra)`,
          baseWeeklyHours: baseTotalHours,
          currentTeacherName: `${currTeachersStr} (${currTotalHours} óra)`,
          currentWeeklyHours: currTotalHours,
          changeType: 'teacher_changed',
          details: `Tanárcsere (${baseTeachersStr} ➔ ${currTeachersStr}) és óraszám módosulás (${baseTotalHours} ➔ ${currTotalHours} óra)`
        });
      } else if (isTeacherDiff) {
        teacherChangesCount++;
        rows.push({
          key,
          className,
          groupName,
          subjectName,
          baseTeacherName: baseTeachersStr,
          baseWeeklyHours: baseTotalHours,
          currentTeacherName: currTeachersStr,
          currentWeeklyHours: currTotalHours,
          changeType: 'teacher_changed',
          details: `Tanárcsere: ${baseTeachersStr} ➔ ${currTeachersStr}`
        });
      } else if (isHoursDiff) {
        hoursChangesCount++;
        rows.push({
          key,
          className,
          groupName,
          subjectName,
          baseTeacherName: baseTeachersStr,
          baseWeeklyHours: baseTotalHours,
          currentTeacherName: currTeachersStr,
          currentWeeklyHours: currTotalHours,
          changeType: 'hours_changed',
          details: `Óraszám változás: ${baseTotalHours} óra ➔ ${currTotalHours} óra (${currTotalHours > baseTotalHours ? '+' : ''}${currTotalHours - baseTotalHours} óra)`
        });
      } else {
        rows.push({
          key,
          className,
          groupName,
          subjectName,
          baseTeacherName: baseTeachersStr,
          baseWeeklyHours: baseTotalHours,
          currentTeacherName: currTeachersStr,
          currentWeeklyHours: currTotalHours,
          changeType: 'identical',
          details: 'Változatlan'
        });
      }
    });

    // Calculate teacher total weekly hours comparison
    const teacherHoursMap: Record<string, { teacherName: string; baseHours: number; currentHours: number; delta: number }> = {};

    teachers.forEach(t => {
      teacherHoursMap[t.name] = {
        teacherName: t.name,
        baseHours: 0,
        currentHours: 0,
        delta: 0
      };
    });

    baseAllocs.forEach(a => {
      const tName = baseTeacherMap.get(a.teacherId) || 'Ismeretlen';
      if (!teacherHoursMap[tName]) {
        teacherHoursMap[tName] = { teacherName: tName, baseHours: 0, currentHours: 0, delta: 0 };
      }
      teacherHoursMap[tName].baseHours += a.weeklyHours;
    });

    allocations.forEach(a => {
      const tName = teacherMap.get(a.teacherId)?.name || 'Ismeretlen';
      if (!teacherHoursMap[tName]) {
        teacherHoursMap[tName] = { teacherName: tName, baseHours: 0, currentHours: 0, delta: 0 };
      }
      teacherHoursMap[tName].currentHours += a.weeklyHours;
    });

    Object.values(teacherHoursMap).forEach(item => {
      item.delta = item.currentHours - item.baseHours;
    });

    const sortedTeacherHourList = Object.values(teacherHoursMap)
      .filter(i => i.baseHours > 0 || i.currentHours > 0)
      .sort((a, b) => {
        if (Math.abs(b.delta) !== Math.abs(a.delta)) {
          return Math.abs(b.delta) - Math.abs(a.delta);
        }
        return a.teacherName.localeCompare(b.teacherName, 'hu-HU');
      });

    return {
      diffRows: rows.sort((a, b) => {
        const typePriority = { teacher_changed: 0, hours_changed: 1, added_in_app: 2, removed_in_app: 3, identical: 4 };
        const pComp = typePriority[a.changeType] - typePriority[b.changeType];
        if (pComp !== 0) return pComp;
        const cComp = a.className.localeCompare(b.className, 'hu-HU');
        if (cComp !== 0) return cComp;
        return a.subjectName.localeCompare(b.subjectName, 'hu-HU');
      }),
      diffStats: {
        totalChanges: teacherChangesCount + hoursChangesCount + addedCount + removedCount,
        teacherChangesCount,
        hoursChangesCount,
        addedCount,
        removedCount
      },
      teacherHourComparison: sortedTeacherHourList
    };
  }, [diffSource, uploadedKretaData, initialAllocations, allocations, teachers, classes, subjects, teacherMap, classMap, subjectMap]);

  // Filtered diff rows for display
  const displayedDiffRows = useMemo(() => {
    return diffRows.filter(row => {
      if (diffFilter === 'changes_only' && row.changeType === 'identical') return false;
      if (diffFilter === 'teacher_only' && row.changeType !== 'teacher_changed') return false;
      if (diffFilter === 'hours_only' && row.changeType !== 'hours_changed') return false;
      if (diffFilter === 'added_only' && row.changeType !== 'added_in_app') return false;
      if (diffFilter === 'removed_only' && row.changeType !== 'removed_in_app') return false;

      if (diffSearch.trim()) {
        const query = diffSearch.toLowerCase().trim();
        const matchesClass = row.className.toLowerCase().includes(query) || row.groupName.toLowerCase().includes(query);
        const matchesSubject = row.subjectName.toLowerCase().includes(query);
        const matchesTeacher = row.baseTeacherName.toLowerCase().includes(query) || row.currentTeacherName.toLowerCase().includes(query);
        if (!matchesClass && !matchesSubject && !matchesTeacher) return false;
      }

      return true;
    });
  }, [diffRows, diffFilter, diffSearch]);

  if (!isOpen) return null;

  const totalWeeklyHours = allocations.reduce((sum, a) => sum + a.weeklyHours, 0);
  const totalPlacedHours = placedLessons.length;

  const handleStartReassign = (alloc: Allocation) => {
    setReassigningAlloc(alloc);
    setTransferHours(alloc.weeklyHours);
    setTransferType('all');
    setSelectedCandidateId('');
  };

  const handleConfirmReassign = () => {
    if (!reassigningAlloc || !activeCandidate) return;
    const hours = transferType === 'all'
      ? reassigningAlloc.weeklyHours
      : Math.min(reassigningAlloc.weeklyHours, Math.max(1, transferHours));

    reassignAllocationTeacher(reassigningAlloc.id, activeCandidate.teacher.id, hours);
    setReassigningAlloc(null);
  };

  const handleAddNewAllocation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeacherId || !newClassId || !newSubjectInput.trim() || newWeeklyHours <= 0) {
      alert('Kérjük töltsön ki minden mezőt a hozzáadáshoz!');
      return;
    }
    addCustomAllocation(newTeacherId, newClassId, newSubjectInput.trim(), newWeeklyHours);
    setNewSubjectInput('');
    setIsAddFormOpen(false);
  };

  const handleDeleteAllocation = (alloc: Allocation) => {
    const teacherName = teacherMap.get(alloc.teacherId)?.name || 'Pedagógus';
    const className = classMap.get(alloc.classId)?.name || 'Osztály';
    const subjectName = subjectMap.get(alloc.subjectId)?.name || 'Tantárgy';
    const placedCount = placedCountMap.get(alloc.id) || 0;

    const message = placedCount > 0
      ? `Biztosan törölni szeretnéd a következő felosztást?\n\n${teacherName} – ${className} – ${subjectName} (${alloc.weeklyHours} óra)\n\n⚠️ Figyelem: A már beosztott ${placedCount} óra is törlődni fog az órarendből!`
      : `Biztosan törölni szeretnéd ezt a felosztást?\n\n${teacherName} – ${className} – ${subjectName} (${alloc.weeklyHours} óra)`;

    if (window.confirm(message)) {
      removeCustomAllocation(alloc.id);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex justify-center items-center z-50 p-2 sm:p-4 lg:p-6" onClick={onClose}>
      <div className="bg-white dark:bg-gray-850 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-7xl max-h-[94vh] flex flex-col overflow-hidden"
           onClick={e => e.stopPropagation()}>
        
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-2xl sm:text-3xl">📚</span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">Tantárgyfelosztás Kezelő és Exportáló</h2>
                <span className="px-2 py-0.5 text-xs font-bold bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300 rounded-md">
                  v3.1.0 (Kréta export & Diff)
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Pedagóguscsere, óraszám-módosítás, eredeti és Kréta állapotok összehasonlítása, valamint kereszttáblás Kréta import export.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Tab Navigation */}
            <div className="flex bg-gray-200 dark:bg-gray-700 p-1 rounded-xl gap-1 text-xs font-bold">
              <button
                onClick={() => { setActiveTab('edit'); setReassigningAlloc(null); }}
                className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
                  activeTab === 'edit'
                    ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-xs'
                    : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                <span>📋 Szerkesztés</span>
              </button>
              <button
                onClick={() => { setActiveTab('diff'); setReassigningAlloc(null); }}
                className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 relative ${
                  activeTab === 'diff'
                    ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-xs'
                    : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                <span>🔍 Összehasonlítás (Diff)</span>
                {diffStats.totalChanges > 0 && (
                  <span className="px-1.5 py-0.2 bg-amber-500 text-white rounded-full text-[10px]">
                    {diffStats.totalChanges}
                  </span>
                )}
              </button>
              <button
                onClick={() => { setActiveTab('export'); setReassigningAlloc(null); }}
                className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
                  activeTab === 'export'
                    ? 'bg-white dark:bg-gray-800 text-cyan-600 dark:text-cyan-400 shadow-xs'
                    : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                <span>📤 Kréta Export</span>
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg text-lg ml-2"
            >
              ✕
            </button>
          </div>
        </div>

        {/* ── TAB 1: Szerkesztés & Tanárcsere ── */}
        {activeTab === 'edit' && (
          <>
            {/* Reassignment / Candidate View */}
            {reassigningAlloc ? (
              <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-gray-50/50 dark:bg-gray-900/30">
                {/* Top Reassign Banner */}
                <div className="p-4 bg-blue-50 dark:bg-blue-950/40 border-b border-blue-100 dark:border-blue-900/50 flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setReassigningAlloc(null)}
                      className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-xs font-bold rounded-lg hover:bg-gray-50"
                    >
                      ← Vissza
                    </button>
                    <div>
                      <div className="text-xs font-bold text-blue-800 dark:text-blue-300 uppercase">
                        Kiválasztott tantárgyfelosztási sor átadása:
                      </div>
                      <div className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <span>{teacherMap.get(reassigningAlloc.teacherId)?.name}</span>
                        <span>➔</span>
                        <span className="text-blue-600 dark:text-blue-400">{classMap.get(reassigningAlloc.classId)?.name}</span>
                        <span>•</span>
                        <span>{subjectMap.get(reassigningAlloc.subjectId)?.name}</span>
                        <span className="text-sm font-semibold text-gray-500">({reassigningAlloc.weeklyHours} heti óra)</span>
                      </div>
                    </div>
                  </div>

                  {activeCandidate && (
                    <div className="flex items-center gap-3 bg-white dark:bg-gray-800 p-2 rounded-xl border border-blue-200 dark:border-blue-800">
                      <div className="text-xs">
                        <span className="text-gray-500">Átadandó óraszám: </span>
                        <select
                          value={transferType}
                          onChange={e => setTransferType(e.target.value as any)}
                          className="bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 font-bold text-xs"
                        >
                          <option value="all">Minden óra ({reassigningAlloc.weeklyHours} óra)</option>
                          <option value="partial">Részleges átadás</option>
                        </select>
                        {transferType === 'partial' && (
                          <input
                            type="number"
                            min={1}
                            max={reassigningAlloc.weeklyHours - 1}
                            value={transferHours}
                            onChange={e => setTransferHours(parseInt(e.target.value, 10) || 1)}
                            className="w-14 ml-2 p-1 border rounded text-xs text-center font-bold"
                          />
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={handleConfirmReassign}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg transition-all shadow-xs flex items-center gap-1"
                      >
                        <span>✓ Átadás jóváhagyása ({activeCandidate.teacher.name})</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Candidate Selection List */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <div className="text-xs font-bold text-gray-600 dark:text-gray-400">
                      Válassz átvevő pedagógust ({filteredCandidates.length} találat):
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Pedagógus keresése..."
                        value={candidateSearch}
                        onChange={e => setCandidateSearch(e.target.value)}
                        className="px-3 py-1.5 border rounded-lg text-xs bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      />
                      <select
                        value={candidateFilter}
                        onChange={e => setCandidateFilter(e.target.value as any)}
                        className="px-2.5 py-1.5 border rounded-lg text-xs bg-white dark:bg-gray-800"
                      >
                        <option value="all">Minden pedagógus</option>
                        <option value="perfect">Csak ütközésmentesek</option>
                        <option value="partial">Részben ráérők</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {filteredCandidates.map(candidate => {
                      const isSelected = (activeCandidate?.teacher.id === candidate.teacher.id);
                      return (
                        <div
                          key={candidate.teacher.id}
                          onClick={() => setSelectedCandidateId(candidate.teacher.id)}
                          className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                            isSelected
                              ? 'border-blue-500 bg-blue-50/70 dark:bg-blue-950/60 ring-2 ring-blue-400 shadow-sm'
                              : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-blue-300'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="font-bold text-sm text-gray-900 dark:text-white">{candidate.teacher.name}</span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              candidate.fitScore === 'perfect' || candidate.fitScore === 'free'
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300'
                                : candidate.fitScore === 'partial'
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300'
                                : 'bg-red-100 text-red-800 dark:bg-red-900/60 dark:text-red-300'
                            }`}>
                              {candidate.fitScore === 'perfect' || candidate.fitScore === 'free'
                                ? '✓ Tökéletesen ráér'
                                : candidate.fitScore === 'partial'
                                ? `⚠️ ${candidate.freeCount}/${candidate.totalPlacedCount} időpont jó`
                                : `❌ ${candidate.clashes.length} ütközés`}
                            </span>
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center justify-between">
                            <span>Jelenlegi óraszáma: <strong>{candidate.totalCurrentHours} óra</strong></span>
                            {candidate.clashes.length > 0 && (
                              <span className="text-red-500 text-[11px] truncate max-w-[150px]" title={candidate.clashes.map(c => c.reason).join(', ')}>
                                {candidate.clashes[0].reason}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              /* Regular Allocations List */
              <div className="flex-1 flex flex-col min-h-0 overflow-hidden p-6 space-y-4">
                {/* Search & Action Bar */}
                <div className="flex flex-wrap items-center justify-between gap-3 shrink-0">
                  <div className="flex items-center gap-2 flex-1 min-w-[280px]">
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                      placeholder="Keresés pedagógus, osztály vagy tantárgy alapján..."
                      className="w-full px-3.5 py-2 text-sm bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <select
                      value={filterMode === 'teacher' ? selectedTeacherFilter : filterMode === 'class' ? selectedClassFilter : 'all'}
                      onChange={e => {
                        const val = e.target.value;
                        if (val === 'all') {
                          setFilterMode('all');
                          setSelectedTeacherFilter('');
                          setSelectedClassFilter('');
                        } else if (val.startsWith('t_')) {
                          setFilterMode('teacher');
                          setSelectedTeacherFilter(val.replace('t_', ''));
                          setSelectedClassFilter('');
                        } else if (val.startsWith('c_')) {
                          setFilterMode('class');
                          setSelectedClassFilter(val.replace('c_', ''));
                          setSelectedTeacherFilter('');
                        }
                      }}
                      className="px-3 py-2 text-xs font-semibold bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl"
                    >
                      <option value="all">Minden felosztás</option>
                      <optgroup label="Pedagógus szerint">
                        {sortedTeachers.map(t => (
                          <option key={t.id} value={`t_${t.id}`}>{t.name}</option>
                        ))}
                      </optgroup>
                      <optgroup label="Osztály szerint">
                        {sortedClasses.map(c => (
                          <option key={c.id} value={`c_${c.id}`}>{c.name}</option>
                        ))}
                      </optgroup>
                    </select>

                    <button
                      type="button"
                      onClick={() => setIsAddFormOpen(prev => !prev)}
                      className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 shadow-xs"
                    >
                      <span>{isAddFormOpen ? '✕ Mégse' : '➕ Új felosztás hozzáadása'}</span>
                    </button>
                  </div>
                </div>

                {/* Add New Allocation Form */}
                {isAddFormOpen && (
                  <form onSubmit={handleAddNewAllocation} className="p-4 bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-2xl flex flex-wrap items-center gap-3">
                    <select
                      value={newTeacherId}
                      onChange={e => setNewTeacherId(e.target.value)}
                      className="px-3 py-1.5 text-xs bg-white dark:bg-gray-800 border rounded-lg font-medium"
                      required
                    >
                      <option value="">Válassz pedagógust...</option>
                      {sortedTeachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>

                    <select
                      value={newClassId}
                      onChange={e => setNewClassId(e.target.value)}
                      className="px-3 py-1.5 text-xs bg-white dark:bg-gray-800 border rounded-lg font-medium"
                      required
                    >
                      <option value="">Válassz osztályt...</option>
                      {sortedClasses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>

                    <input
                      type="text"
                      value={newSubjectInput}
                      onChange={e => setNewSubjectInput(e.target.value)}
                      placeholder="Tantárgy neve..."
                      className="px-3 py-1.5 text-xs bg-white dark:bg-gray-800 border rounded-lg flex-1 min-w-[150px]"
                      required
                    />

                    <div className="flex items-center gap-1 text-xs font-semibold">
                      <span>Óraszám:</span>
                      <input
                        type="number"
                        min={1}
                        max={30}
                        value={newWeeklyHours}
                        onChange={e => setNewWeeklyHours(parseInt(e.target.value, 10) || 1)}
                        className="w-14 px-2 py-1.5 text-xs border rounded-lg text-center font-bold"
                      />
                    </div>

                    <button
                      type="submit"
                      className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg transition-colors"
                    >
                      Hozzáadás
                    </button>
                  </form>
                )}

                {/* Main Allocations Table */}
                <div className="flex-1 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-xl">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-gray-100 dark:bg-gray-700/80 sticky top-0 z-10 text-gray-700 dark:text-gray-200 font-bold">
                      <tr>
                        <th className="py-2.5 px-3">Pedagógus</th>
                        <th className="py-2.5 px-3">Osztály / Csoport</th>
                        <th className="py-2.5 px-3">Tantárgy</th>
                        <th className="py-2.5 px-3 text-center">Heti óra</th>
                        <th className="py-2.5 px-3 text-center">Órarendi állapot</th>
                        <th className="py-2.5 px-3 text-right">Műveletek</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                      {filteredAllocations.map(alloc => {
                        const teacher = teacherMap.get(alloc.teacherId);
                        const tClass = classMap.get(alloc.classId);
                        const subject = subjectMap.get(alloc.subjectId);
                        const placedCount = placedCountMap.get(alloc.id) || 0;
                        const isAllPlaced = placedCount >= alloc.weeklyHours;

                        return (
                          <tr key={alloc.id} className="hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors">
                            <td className="py-2 px-3 font-semibold text-gray-900 dark:text-white">
                              {teacher?.name || 'N/A'}
                            </td>
                            <td className="py-2 px-3 text-gray-700 dark:text-gray-300">
                              <div>{alloc.originalClass || tClass?.name || 'N/A'}</div>
                              {alloc.originalGroup && <div className="text-[10px] text-gray-400">{alloc.originalGroup}</div>}
                            </td>
                            <td className="py-2 px-3 text-gray-800 dark:text-gray-200 font-medium">
                              {subject?.name || 'N/A'}
                            </td>
                            <td className="py-2 px-3 text-center">
                              <div className="inline-flex items-center gap-1.5 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-lg">
                                <button
                                  type="button"
                                  onClick={() => updateAllocationHours(alloc.id, Math.max(1, alloc.weeklyHours - 1))}
                                  className="w-5 h-5 font-bold hover:bg-gray-200 dark:hover:bg-gray-600 rounded text-gray-700 dark:text-gray-200"
                                >
                                  −
                                </button>
                                <span className="font-mono font-bold">{alloc.weeklyHours}</span>
                                <button
                                  type="button"
                                  onClick={() => updateAllocationHours(alloc.id, alloc.weeklyHours + 1)}
                                  className="w-5 h-5 font-bold hover:bg-gray-200 dark:hover:bg-gray-600 rounded text-gray-700 dark:text-gray-200"
                                >
                                  +
                                </button>
                              </div>
                            </td>
                            <td className="py-2 px-3 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                isAllPlaced
                                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                                  : placedCount > 0
                                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                                  : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                              }`}>
                                {placedCount} / {alloc.weeklyHours} beosztva {isAllPlaced && '✓'}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleStartReassign(alloc)}
                                  className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg transition-colors flex items-center gap-1"
                                  title="Átadás más pedagógusnak"
                                >
                                  <span>🔄 Átadás</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteAllocation(alloc)}
                                  className="p-1 text-gray-400 hover:text-red-600 rounded"
                                  title="Törlés"
                                >
                                  🗑️
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── TAB 2: Összehasonlítás & Változások (Diff View) ── */}
        {activeTab === 'diff' && (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden p-6 space-y-4">
            {/* Top Source Switcher & Upload */}
            <div className="p-4 bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 rounded-2xl flex flex-wrap items-center justify-between gap-4 shrink-0">
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Összehasonlítási Bázis:</span>
                <div className="inline-flex bg-gray-200 dark:bg-gray-700 p-1 rounded-xl gap-1 text-xs font-bold">
                  <button
                    onClick={() => setDiffSource('initial')}
                    className={`px-3 py-1.5 rounded-lg transition-colors ${
                      diffSource === 'initial'
                        ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-xs'
                        : 'text-gray-600 dark:text-gray-300'
                    }`}
                  >
                    🕒 Kezdeti állapot ({initialAllocations?.length || allocations.length} sor)
                  </button>
                  <button
                    onClick={() => {
                      if (!uploadedKretaData) {
                        fileInputRef.current?.click();
                      } else {
                        setDiffSource('uploaded');
                      }
                    }}
                    className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
                      diffSource === 'uploaded'
                        ? 'bg-white dark:bg-gray-800 text-emerald-600 dark:text-emerald-400 shadow-xs'
                        : 'text-gray-600 dark:text-gray-300'
                    }`}
                  >
                    <span>📁 Feltöltött Kréta Export</span>
                    {uploadedFileName && <span className="text-[10px] opacity-75">({uploadedFileName})</span>}
                  </button>
                </div>
              </div>

              {/* Hidden file input & upload button */}
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  className="sr-only"
                  accept=".xlsx, .xls"
                  onChange={handleFileUpload}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3.5 py-1.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 text-xs font-bold rounded-xl hover:bg-emerald-100 flex items-center gap-1.5 transition-colors"
                >
                  <DocumentArrowUpIcon className="w-4 h-4" />
                  <span>Kréta TTF Fájl Feltöltése (.xlsx)</span>
                </button>
              </div>
            </div>

            {/* KPI Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 shrink-0">
              <div className="p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl">
                <div className="text-[11px] font-bold text-blue-800 dark:text-blue-300 uppercase">Összes Eltérés</div>
                <div className="text-xl font-extrabold text-blue-900 dark:text-blue-100 mt-0.5">{diffStats.totalChanges} db</div>
              </div>
              <div className="p-3 bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 rounded-xl">
                <div className="text-[11px] font-bold text-purple-800 dark:text-purple-300 uppercase">Tanárcsere</div>
                <div className="text-xl font-extrabold text-purple-900 dark:text-purple-100 mt-0.5">{diffStats.teacherChangesCount} db</div>
              </div>
              <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl">
                <div className="text-[11px] font-bold text-amber-800 dark:text-amber-300 uppercase">Óraszám változás</div>
                <div className="text-xl font-extrabold text-amber-900 dark:text-amber-100 mt-0.5">{diffStats.hoursChangesCount} db</div>
              </div>
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl">
                <div className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300 uppercase">Új felosztás</div>
                <div className="text-xl font-extrabold text-emerald-900 dark:text-emerald-100 mt-0.5">+{diffStats.addedCount} db</div>
              </div>
            </div>

            {/* Filter & Subtab Controls */}
            <div className="flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl text-xs font-semibold">
                <button
                  onClick={() => setDiffFilter('changes_only')}
                  className={`px-3 py-1 rounded-lg ${diffFilter === 'changes_only' ? 'bg-white dark:bg-gray-700 font-bold shadow-xs' : 'text-gray-500'}`}
                >
                  Összes változás ({diffStats.totalChanges})
                </button>
                <button
                  onClick={() => setDiffFilter('teacher_only')}
                  className={`px-3 py-1 rounded-lg ${diffFilter === 'teacher_only' ? 'bg-white dark:bg-gray-700 font-bold shadow-xs text-purple-600' : 'text-gray-500'}`}
                >
                  Tanárcserék ({diffStats.teacherChangesCount})
                </button>
                <button
                  onClick={() => setDiffFilter('hours_only')}
                  className={`px-3 py-1 rounded-lg ${diffFilter === 'hours_only' ? 'bg-white dark:bg-gray-700 font-bold shadow-xs text-amber-600' : 'text-gray-500'}`}
                >
                  Óraszám eltérések ({diffStats.hoursChangesCount})
                </button>
                <button
                  onClick={() => setDiffFilter('added_only')}
                  className={`px-3 py-1 rounded-lg ${diffFilter === 'added_only' ? 'bg-white dark:bg-gray-700 font-bold shadow-xs text-emerald-600' : 'text-gray-500'}`}
                >
                  Csak új felosztások ({diffStats.addedCount})
                </button>
                <button
                  onClick={() => setDiffFilter('all')}
                  className={`px-3 py-1 rounded-lg ${diffFilter === 'all' ? 'bg-white dark:bg-gray-700 font-bold shadow-xs' : 'text-gray-500'}`}
                >
                  Minden sor ({diffRows.length})
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowTeacherHourSummary(prev => !prev)}
                  className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 text-xs font-bold rounded-xl transition-colors"
                >
                  {showTeacherHourSummary ? '📋 Részletes táblázat' : '👥 Pedagógus összóra eltérések'}
                </button>
                <input
                  type="text"
                  placeholder="Keresés eltérésekben..."
                  value={diffSearch}
                  onChange={e => setDiffSearch(e.target.value)}
                  className="px-3 py-1.5 text-xs border rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
            </div>

            {/* Table Area */}
            <div className="flex-1 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-xl">
              {showTeacherHourSummary ? (
                /* Teacher Total Hours Delta Table */
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-gray-100 dark:bg-gray-700/80 sticky top-0 z-10 text-gray-700 dark:text-gray-200 font-bold">
                    <tr>
                      <th className="py-2.5 px-3">Pedagógus</th>
                      <th className="py-2.5 px-3 text-center">Bázis / Kréta összóra</th>
                      <th className="py-2.5 px-3 text-center">Jelenlegi órarend összóra</th>
                      <th className="py-2.5 px-3 text-center">Különbség (Δ)</th>
                      <th className="py-2.5 px-3 text-right">Művelet</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {teacherHourComparison.map(item => {
                      const hasDelta = item.delta !== 0;
                      return (
                        <tr key={item.teacherName} className={`hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors ${hasDelta ? 'bg-amber-50/40 dark:bg-amber-950/20' : ''}`}>
                          <td className="py-2 px-3 font-semibold text-gray-900 dark:text-white">{item.teacherName}</td>
                          <td className="py-2 px-3 text-center font-mono font-bold text-gray-600 dark:text-gray-400">{item.baseHours} óra</td>
                          <td className="py-2 px-3 text-center font-mono font-bold text-gray-900 dark:text-white">{item.currentHours} óra</td>
                          <td className="py-2 px-3 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-extrabold font-mono ${
                              item.delta > 0
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300'
                                : item.delta < 0
                                ? 'bg-red-100 text-red-800 dark:bg-red-900/60 dark:text-red-300'
                                : 'bg-gray-100 text-gray-500'
                            }`}>
                              {item.delta > 0 ? `+${item.delta}` : item.delta} óra
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right">
                            {onExportCurriculum && (
                              <button
                                type="button"
                                onClick={() => {
                                  const tObj = teachers.find(t => t.name === item.teacherName);
                                  if (tObj) onExportCurriculum(tObj.id);
                                }}
                                className="px-2.5 py-1 text-xs bg-cyan-600 hover:bg-cyan-700 text-white font-bold rounded-lg transition-colors"
                              >
                                Export (.xlsx)
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                /* Detailed Row by Row Diff Table */
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-gray-100 dark:bg-gray-700/80 sticky top-0 z-10 text-gray-700 dark:text-gray-200 font-bold">
                    <tr>
                      <th className="py-2.5 px-3">Osztály / Csoport</th>
                      <th className="py-2.5 px-3">Tantárgy</th>
                      <th className="py-2.5 px-3">Bázis / Kréta Állapot</th>
                      <th className="py-2.5 px-3">Jelenlegi Órarendi Állapot</th>
                      <th className="py-2.5 px-3 text-right">Eltérés / Megjegyzés</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {displayedDiffRows.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-gray-400">
                          Nincs megjeleníthető eltérés a kiválasztott szűrők alapján.
                        </td>
                      </tr>
                    ) : (
                      displayedDiffRows.map((row, idx) => {
                        const isChanged = row.changeType !== 'identical';
                        return (
                          <tr
                            key={`${row.key}_${idx}`}
                            className={`hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors ${
                              row.changeType === 'teacher_changed'
                                ? 'bg-purple-50/50 dark:bg-purple-950/20'
                                : row.changeType === 'hours_changed'
                                ? 'bg-amber-50/50 dark:bg-amber-950/20'
                                : row.changeType === 'added_in_app'
                                ? 'bg-emerald-50/50 dark:bg-emerald-950/20'
                                : row.changeType === 'removed_in_app'
                                ? 'bg-red-50/50 dark:bg-red-950/20'
                                : ''
                            }`}
                          >
                            <td className="py-2 px-3 text-gray-900 dark:text-white font-semibold">
                              <div>{row.className || '—'}</div>
                              {row.groupName && <div className="text-[10px] text-gray-400">{row.groupName}</div>}
                            </td>
                            <td className="py-2 px-3 text-gray-800 dark:text-gray-200 font-medium">
                              {row.subjectName}
                            </td>
                            <td className="py-2 px-3 text-gray-600 dark:text-gray-400">
                              <span className="font-semibold">{row.baseTeacherName}</span>
                              {row.baseWeeklyHours > 0 && <span className="ml-1 text-[11px]">({row.baseWeeklyHours} óra)</span>}
                            </td>
                            <td className="py-2 px-3 font-semibold text-gray-900 dark:text-white">
                              <span>{row.currentTeacherName}</span>
                              {row.currentWeeklyHours > 0 && <span className="ml-1 text-[11px] text-blue-600 dark:text-blue-400">({row.currentWeeklyHours} óra)</span>}
                            </td>
                            <td className="py-2 px-3 text-right">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                row.changeType === 'teacher_changed'
                                  ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/60 dark:text-purple-300'
                                  : row.changeType === 'hours_changed'
                                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300'
                                  : row.changeType === 'added_in_app'
                                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300'
                                  : row.changeType === 'removed_in_app'
                                  ? 'bg-red-100 text-red-800 dark:bg-red-900/60 dark:text-red-300'
                                  : 'bg-gray-100 text-gray-500'
                              }`}>
                                {row.details}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ── TAB 3: Kréta Export ── */}
        {activeTab === 'export' && (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto p-6 space-y-6">
            <div className="p-6 bg-gradient-to-r from-cyan-50 to-blue-50 dark:from-cyan-950/40 dark:to-blue-950/40 border border-cyan-200 dark:border-cyan-800 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">🏫</span>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">Teljes Intézményi Kréta Tantárgyfelosztás</h3>
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-300 max-w-xl">
                  A Kréta kereszttáblás import sablonja (<code className="font-mono text-cyan-700 dark:text-cyan-300">TantargyfelosztasImport_Sablon_Kereszttablas.xlsx</code>) alapján elkészíti az intézmény összes osztályának és tanárának egybefüggő TTF import fájlját.
                </p>
              </div>

              {onExportCurriculum && (
                <button
                  type="button"
                  onClick={() => onExportCurriculum()}
                  className="px-6 py-3 bg-cyan-600 hover:bg-cyan-700 text-white font-bold text-sm rounded-xl transition-all shadow-md flex items-center gap-2 shrink-0 hover:scale-105 active:scale-95"
                >
                  <Squares2X2Icon className="w-5 h-5" />
                  <span>Teljes Intézmény TTF Export (.xlsx)</span>
                </button>
              )}
            </div>

            <div className="space-y-3">
              <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Tanáronkénti Különálló TTF Export:</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {sortedTeachers.map(teacher => {
                  const teacherAllocs = allocations.filter(a => a.teacherId === teacher.id);
                  const totalH = teacherAllocs.reduce((s, a) => s + a.weeklyHours, 0);
                  if (totalH === 0) return null;

                  return (
                    <div
                      key={teacher.id}
                      className="p-3.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl flex items-center justify-between gap-3 shadow-xs"
                    >
                      <div>
                        <div className="font-bold text-xs text-gray-900 dark:text-white truncate">{teacher.name}</div>
                        <div className="text-[11px] text-gray-500">{totalH} heti óra ({teacherAllocs.length} tantárgy)</div>
                      </div>
                      {onExportCurriculum && (
                        <button
                          type="button"
                          onClick={() => onExportCurriculum(teacher.id)}
                          className="px-2.5 py-1.5 bg-cyan-50 hover:bg-cyan-100 dark:bg-cyan-950/60 dark:hover:bg-cyan-900/60 text-cyan-700 dark:text-cyan-300 border border-cyan-300 dark:border-cyan-700 rounded-lg text-xs font-bold transition-colors"
                          title={`${teacher.name} Kréta TTF import fájl letöltése`}
                        >
                          Export
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── Footer Summary & Quick Export ── */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 shrink-0 text-xs text-gray-600 dark:text-gray-400">
          <div className="flex items-center gap-4 font-semibold">
            <span>👥 {teachers.length} pedagógus</span>
            <span>•</span>
            <span>🏫 {classes.length} osztály</span>
            <span>•</span>
            <span>📖 {allocations.length} tantárgyfelosztási sor</span>
            <span>•</span>
            <span className="text-gray-900 dark:text-white font-bold">⏱️ Összesen: {totalWeeklyHours} heti óra ({totalPlacedHours} beosztva)</span>
          </div>

          <div className="flex items-center gap-3">
            {onExportCurriculum && (
              <button
                onClick={() => onExportCurriculum()}
                className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
              >
                <Squares2X2Icon className="w-4 h-4" />
                <span>Teljes TTF Export (.xlsx)</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="px-5 py-1.5 bg-gray-800 hover:bg-gray-900 dark:bg-gray-200 dark:hover:bg-white text-white dark:text-gray-900 font-bold rounded-xl shadow-xs transition-colors"
            >
              Bezárás
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
