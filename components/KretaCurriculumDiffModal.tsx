import React, { useState, useMemo, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import type { Teacher, Class, Subject, Allocation, ParsedData } from '../types.ts';
import { parseTimetableFile, normalizeClassName, normalizeSubjectName } from '../utils.ts';
import { Squares2X2Icon } from './icons/Squares2X2Icon.tsx';
import { DocumentArrowUpIcon } from './icons/DocumentArrowUpIcon.tsx';

interface KretaCurriculumDiffModalProps {
  isOpen: boolean;
  onClose: () => void;
  teachers: Teacher[];
  classes: Class[];
  subjects: Subject[];
  allocations: Allocation[];
  initialAllocations?: Allocation[];
  onExportCurriculum: (teacherIdFilter?: string) => void;
  selectedTeacherId?: string | null;
}

export type DiffChangeType = 'teacher_changed' | 'hours_changed' | 'added_in_app' | 'removed_in_app' | 'identical';

export interface DiffRowItem {
  key: string;
  className: string;
  groupName: string;
  subjectName: string;
  baseTeacherNames: string[];
  baseTeacherDisplay: string;
  baseWeeklyHours: number;
  currentTeacherNames: string[];
  currentTeacherDisplay: string;
  currentWeeklyHours: number;
  changeType: DiffChangeType;
  details: string;
}

export const KretaCurriculumDiffModal: React.FC<KretaCurriculumDiffModalProps> = ({
  isOpen,
  onClose,
  teachers,
  classes,
  subjects,
  allocations,
  initialAllocations,
  onExportCurriculum,
  selectedTeacherId: initialTeacherFilter
}) => {
  // Selected Teacher Filter: 'all' or teacher.id
  const [activeTeacherFilter, setActiveTeacherFilter] = useState<string>(initialTeacherFilter || 'all');
  const [diffSource, setDiffSource] = useState<'initial' | 'uploaded'>('initial');
  const [uploadedKretaData, setUploadedKretaData] = useState<ParsedData | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string>('');
  const [diffFilter, setDiffFilter] = useState<'all' | 'changes_only' | 'teacher_only' | 'hours_only' | 'added_only'>('changes_only');
  const [searchTerm, setSearchTerm] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync activeTeacherFilter when modal opens or initialTeacherFilter changes
  useEffect(() => {
    if (isOpen && initialTeacherFilter) {
      setActiveTeacherFilter(initialTeacherFilter);
    }
  }, [isOpen, initialTeacherFilter]);

  // Maps
  const teacherMap = useMemo(() => new Map(teachers.map(t => [t.id, t])), [teachers]);
  const classMap = useMemo(() => new Map(classes.map(c => [c.id, c])), [classes]);
  const subjectMap = useMemo(() => new Map(subjects.map(s => [s.id, s])), [subjects]);

  const sortedTeachers = useMemo(() => [...teachers].sort((a, b) => a.name.localeCompare(b.name, 'hu-HU')), [teachers]);

  // Handle uploaded Kréta export file (.xlsx)
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

  // ── Comparison Engine ────────────────────────────────────────────────────────
  const { diffRows, diffStats, teacherHourComparison } = useMemo(() => {
    let baseAllocs: Allocation[] = [];
    let baseTeacherMap = new Map<string, string>();
    let baseClassMap = new Map<string, string>();
    let baseSubjectMap = new Map<string, string>();

    if (diffSource === 'uploaded' && uploadedKretaData) {
      baseAllocs = uploadedKretaData.allocations;
      uploadedKretaData.teachers.forEach(t => baseTeacherMap.set(t.id, t.name.trim()));
      uploadedKretaData.classes.forEach(c => baseClassMap.set(c.id, c.name.trim()));
      uploadedKretaData.subjects.forEach(s => baseSubjectMap.set(s.id, s.name.trim()));
    } else {
      baseAllocs = initialAllocations || [];
      teachers.forEach(t => baseTeacherMap.set(t.id, t.name.trim()));
      classes.forEach(c => baseClassMap.set(c.id, c.name.trim()));
      subjects.forEach(s => baseSubjectMap.set(s.id, s.name.trim()));
    }

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
      const tName = typeof tVal === 'string' ? tVal.trim() : (tVal && typeof tVal === 'object' ? (tVal as any).name?.trim() : 'Ismeretlen tanár') || 'Ismeretlen tanár';
      
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

    const currentMap = new Map<string, AllocAgg[]>();
    allocations.forEach(a => {
      const key = makeItemKey(a, classMap, subjectMap);
      const tName = teacherMap.get(a.teacherId)?.name?.trim() || 'Ismeretlen tanár';
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

    const allKeys = new Set([...Array.from(baseMap.keys()), ...Array.from(currentMap.keys())]);
    const rows: DiffRowItem[] = [];

    let teacherChangesCount = 0;
    let hoursChangesCount = 0;
    let addedCount = 0;
    let removedCount = 0;

    allKeys.forEach(key => {
      const baseItems = baseMap.get(key) || [];
      const currentItems = currentMap.get(key) || [];

      const sample = currentItems[0] || baseItems[0];
      const className = sample?.className || '';
      const groupName = sample?.groupName || '';
      const subjectName = sample?.subjectName || '';

      if (baseItems.length === 0 && currentItems.length > 0) {
        addedCount++;
        currentItems.forEach(ci => {
          rows.push({
            key,
            className,
            groupName,
            subjectName,
            baseTeacherNames: [],
            baseTeacherDisplay: '— (Nem szerepel)',
            baseWeeklyHours: 0,
            currentTeacherNames: [ci.teacherName],
            currentTeacherDisplay: ci.teacherName,
            currentWeeklyHours: ci.weeklyHours,
            changeType: 'added_in_app',
            details: `Új órarendi felosztás: +${ci.weeklyHours} óra (${ci.teacherName})`
          });
        });
        return;
      }

      if (currentItems.length === 0 && baseItems.length > 0) {
        removedCount++;
        baseItems.forEach(bi => {
          rows.push({
            key,
            className,
            groupName,
            subjectName,
            baseTeacherNames: [bi.teacherName],
            baseTeacherDisplay: bi.teacherName,
            baseWeeklyHours: bi.weeklyHours,
            currentTeacherNames: [],
            currentTeacherDisplay: '— (Törölve)',
            currentWeeklyHours: 0,
            changeType: 'removed_in_app',
            details: `Hiányzik az órarendből: volt ${bi.weeklyHours} óra (${bi.teacherName})`
          });
        });
        return;
      }

      const baseTotalHours = baseItems.reduce((s, i) => s + i.weeklyHours, 0);
      const currTotalHours = currentItems.reduce((s, i) => s + i.weeklyHours, 0);
      const baseNames = baseItems.map(i => i.teacherName).sort();
      const currNames = currentItems.map(i => i.teacherName).sort();
      const baseTeachersStr = baseNames.join(', ');
      const currTeachersStr = currNames.join(', ');

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
          baseTeacherNames: baseNames,
          baseTeacherDisplay: baseTeachersStr,
          baseWeeklyHours: baseTotalHours,
          currentTeacherNames: currNames,
          currentTeacherDisplay: currTeachersStr,
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
          baseTeacherNames: baseNames,
          baseTeacherDisplay: baseTeachersStr,
          baseWeeklyHours: baseTotalHours,
          currentTeacherNames: currNames,
          currentTeacherDisplay: currTeachersStr,
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
          baseTeacherNames: baseNames,
          baseTeacherDisplay: baseTeachersStr,
          baseWeeklyHours: baseTotalHours,
          currentTeacherNames: currNames,
          currentTeacherDisplay: currTeachersStr,
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
          baseTeacherNames: baseNames,
          baseTeacherDisplay: baseTeachersStr,
          baseWeeklyHours: baseTotalHours,
          currentTeacherNames: currNames,
          currentTeacherDisplay: currTeachersStr,
          currentWeeklyHours: currTotalHours,
          changeType: 'identical',
          details: 'Változatlan'
        });
      }
    });

    // Teacher total hours comparison calculation strictly by teacher name
    const teacherHoursMap: Record<string, { teacherId?: string; teacherName: string; baseHours: number; currentHours: number; delta: number; changesCount: number }> = {};

    teachers.forEach(t => {
      const cleanName = t.name.trim();
      teacherHoursMap[cleanName] = {
        teacherId: t.id,
        teacherName: cleanName,
        baseHours: 0,
        currentHours: 0,
        delta: 0,
        changesCount: 0
      };
    });

    baseAllocs.forEach(a => {
      const rawName = baseTeacherMap.get(a.teacherId);
      const tName = typeof rawName === 'string' ? rawName.trim() : 'Ismeretlen';
      if (!teacherHoursMap[tName]) {
        teacherHoursMap[tName] = { teacherId: a.teacherId, teacherName: tName, baseHours: 0, currentHours: 0, delta: 0, changesCount: 0 };
      }
      teacherHoursMap[tName].baseHours += a.weeklyHours;
    });

    allocations.forEach(a => {
      const rawName = teacherMap.get(a.teacherId)?.name;
      const tName = typeof rawName === 'string' ? rawName.trim() : 'Ismeretlen';
      if (!teacherHoursMap[tName]) {
        teacherHoursMap[tName] = { teacherId: a.teacherId, teacherName: tName, baseHours: 0, currentHours: 0, delta: 0, changesCount: 0 };
      }
      teacherHoursMap[tName].currentHours += a.weeklyHours;
    });

    // Count changes per teacher strictly by touched names
    rows.forEach(r => {
      if (r.changeType !== 'identical') {
        const touched = new Set([...r.baseTeacherNames, ...r.currentTeacherNames]);
        touched.forEach(tName => {
          if (teacherHoursMap[tName]) {
            teacherHoursMap[tName].changesCount++;
          }
        });
      }
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

  // Selected teacher object
  const selectedTeacherObj = useMemo(() => {
    if (activeTeacherFilter === 'all') return null;
    return teachers.find(t => t.id === activeTeacherFilter) || null;
  }, [activeTeacherFilter, teachers]);

  // Filtered rows for display strictly matching the selected teacher
  const displayedRows = useMemo(() => {
    return diffRows.filter(row => {
      // Teacher filter (strictly by normalized teacher name!)
      if (selectedTeacherObj) {
        const targetName = selectedTeacherObj.name.trim().toLowerCase();
        const isInBase = row.baseTeacherNames.some(n => n.trim().toLowerCase() === targetName);
        const isInCurrent = row.currentTeacherNames.some(n => n.trim().toLowerCase() === targetName);
        if (!isInBase && !isInCurrent) return false;
      }

      // Change type filter
      if (diffFilter === 'changes_only' && row.changeType === 'identical') return false;
      if (diffFilter === 'teacher_only' && row.changeType !== 'teacher_changed') return false;
      if (diffFilter === 'hours_only' && row.changeType !== 'hours_changed') return false;
      if (diffFilter === 'added_only' && row.changeType !== 'added_in_app') return false;

      // Text search
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase().trim();
        const matchesClass = row.className.toLowerCase().includes(query) || row.groupName.toLowerCase().includes(query);
        const matchesSubject = row.subjectName.toLowerCase().includes(query);
        const matchesTeacher = row.baseTeacherDisplay.toLowerCase().includes(query) || row.currentTeacherDisplay.toLowerCase().includes(query);
        if (!matchesClass && !matchesSubject && !matchesTeacher) return false;
      }

      return true;
    });
  }, [diffRows, selectedTeacherObj, diffFilter, searchTerm]);

  // Selected teacher summary info
  const selectedTeacherSummary = useMemo(() => {
    if (!selectedTeacherObj) return null;
    const cleanName = selectedTeacherObj.name.trim();
    return teacherHourComparison.find(i => i.teacherName === cleanName) || {
      teacherName: cleanName,
      baseHours: 0,
      currentHours: allocations.filter(a => a.teacherId === selectedTeacherObj.id).reduce((s, a) => s + a.weeklyHours, 0),
      delta: 0,
      changesCount: 0
    };
  }, [selectedTeacherObj, teacherHourComparison, allocations]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex justify-center items-center z-50 p-2 sm:p-4 lg:p-6" onClick={onClose}>
      <div className="bg-white dark:bg-gray-850 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-7xl max-h-[94vh] flex flex-col overflow-hidden"
           onClick={e => e.stopPropagation()}>
        
        {/* ── Modal Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-2xl sm:text-3xl">📊</span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">Kréta Tantárgyfelosztás Összehasonlító & Export</h2>
                <span className="px-2 py-0.5 text-xs font-bold bg-cyan-100 text-cyan-800 dark:bg-cyan-900/60 dark:text-cyan-300 rounded-md">
                  Kereszttáblás Kréta formátum
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Órarendi tantárgyfelosztás összevetése a Kréta adatokkal pedagógusonként vagy intézményi szinten, hivatalos kereszttáblás exporttal.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Quick Export Action */}
            {selectedTeacherObj ? (
              <button
                type="button"
                onClick={() => onExportCurriculum(selectedTeacherObj.id)}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white font-bold text-xs rounded-xl transition-all shadow-xs flex items-center gap-1.5"
                title={`${selectedTeacherObj.name} Kréta kereszttáblás TTF exportálása`}
              >
                <Squares2X2Icon className="w-4 h-4" />
                <span>{selectedTeacherObj.name} TTF Export (.xlsx)</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onExportCurriculum()}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white font-bold text-xs rounded-xl transition-all shadow-xs flex items-center gap-1.5"
                title="Teljes intézményi kereszttáblás TTF exportálása"
              >
                <Squares2X2Icon className="w-4 h-4" />
                <span>Teljes Intézmény TTF Export (.xlsx)</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg text-lg"
            >
              ✕
            </button>
          </div>
        </div>

        {/* ── Filter & Options Bar ── */}
        <div className="p-4 bg-gray-50/80 dark:bg-gray-900/40 border-b border-gray-200 dark:border-gray-700 flex flex-wrap items-center justify-between gap-4 shrink-0">
          {/* Teacher Selector */}
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-gray-700 dark:text-gray-300">Pedagógus nézet:</label>
            <select
              value={activeTeacherFilter}
              onChange={e => setActiveTeacherFilter(e.target.value)}
              className="px-3.5 py-1.5 text-xs font-bold bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white"
            >
              <option value="all">🏫 Teljes Intézmény (Minden pedagógus)</option>
              {sortedTeachers.map(t => {
                const totalH = allocations.filter(a => a.teacherId === t.id).reduce((s, a) => s + a.weeklyHours, 0);
                return (
                  <option key={t.id} value={t.id}>
                    👤 {t.name} ({totalH} órarendi heti óra)
                  </option>
                );
              })}
            </select>
          </div>

          {/* Comparison Baseline Selector & Upload */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-gray-500 uppercase">Összevetés Bázisa:</span>
            <div className="inline-flex bg-gray-200 dark:bg-gray-700 p-1 rounded-xl gap-1 text-xs font-bold">
              <button
                type="button"
                onClick={() => setDiffSource('initial')}
                className={`px-3 py-1 rounded-lg transition-colors ${
                  diffSource === 'initial'
                    ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-xs'
                    : 'text-gray-600 dark:text-gray-300'
                }`}
              >
                🕒 Eredeti állapot
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!uploadedKretaData) {
                    fileInputRef.current?.click();
                  } else {
                    setDiffSource('uploaded');
                  }
                }}
                className={`px-3 py-1 rounded-lg transition-colors flex items-center gap-1 ${
                  diffSource === 'uploaded'
                    ? 'bg-white dark:bg-gray-800 text-emerald-600 dark:text-emerald-400 shadow-xs'
                    : 'text-gray-600 dark:text-gray-300'
                }`}
              >
                <span>📁 Kréta Export Fájl</span>
                {uploadedFileName && <span className="text-[10px] opacity-75">({uploadedFileName})</span>}
              </button>
            </div>

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
              className="px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 text-xs font-bold rounded-xl hover:bg-emerald-100 flex items-center gap-1.5 transition-colors"
              title="Friss Kréta TTF fájl feltöltése (.xlsx)"
            >
              <DocumentArrowUpIcon className="w-4 h-4" />
              <span>Kréta Fájl Feltöltése</span>
            </button>
          </div>
        </div>

        {/* ── Main Content Area ── */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden p-6 space-y-4">
          {/* Selected Teacher Summary Banner (if a single teacher is selected) */}
          {selectedTeacherObj && selectedTeacherSummary && (
            <div className="p-4 bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-950/40 dark:to-cyan-950/40 border border-blue-200 dark:border-blue-800 rounded-2xl flex flex-wrap items-center justify-between gap-4 shrink-0">
              <div className="flex items-center gap-3">
                <span className="text-3xl">👨‍🏫</span>
                <div>
                  <h3 className="text-base font-bold text-gray-900 dark:text-white">{selectedTeacherObj.name}</h3>
                  <div className="text-xs text-gray-600 dark:text-gray-300 flex items-center gap-3 mt-0.5 font-medium">
                    <span>Bázis / Kréta: <strong>{selectedTeacherSummary.baseHours} heti óra</strong></span>
                    <span>•</span>
                    <span>Jelenlegi Órarend: <strong>{selectedTeacherSummary.currentHours} heti óra</strong></span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="text-center bg-white dark:bg-gray-800 px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs">
                  <div className="text-[10px] font-bold text-gray-400 uppercase">Óraszám Eltérés (Δ)</div>
                  <div className={`text-lg font-extrabold font-mono ${
                    selectedTeacherSummary.delta > 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : selectedTeacherSummary.delta < 0
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-gray-700 dark:text-gray-300'
                  }`}>
                    {selectedTeacherSummary.delta > 0 ? `+${selectedTeacherSummary.delta}` : selectedTeacherSummary.delta} óra
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onExportCurriculum(selectedTeacherObj.id)}
                  className="px-4 py-2.5 bg-cyan-600 hover:bg-cyan-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
                >
                  <Squares2X2Icon className="w-4 h-4" />
                  <span>Kréta TTF Letöltése (.xlsx)</span>
                </button>
              </div>
            </div>
          )}

          {/* School-Wide KPI Summary (if institution view) */}
          {activeTeacherFilter === 'all' && (
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
                <div className="text-[11px] font-bold text-amber-800 dark:text-amber-300 uppercase">Óraszám eltérés</div>
                <div className="text-xl font-extrabold text-amber-900 dark:text-amber-100 mt-0.5">{diffStats.hoursChangesCount} db</div>
              </div>
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl">
                <div className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300 uppercase">Új hozzáadás</div>
                <div className="text-xl font-extrabold text-emerald-900 dark:text-emerald-100 mt-0.5">+{diffStats.addedCount} db</div>
              </div>
            </div>
          )}

          {/* Filter Tabs & Search */}
          <div className="flex flex-wrap items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl text-xs font-semibold">
              <button
                type="button"
                onClick={() => setDiffFilter('changes_only')}
                className={`px-3 py-1 rounded-lg ${diffFilter === 'changes_only' ? 'bg-white dark:bg-gray-700 font-bold shadow-xs' : 'text-gray-500'}`}
              >
                Csak eltérések
              </button>
              <button
                type="button"
                onClick={() => setDiffFilter('teacher_only')}
                className={`px-3 py-1 rounded-lg ${diffFilter === 'teacher_only' ? 'bg-white dark:bg-gray-700 font-bold shadow-xs text-purple-600' : 'text-gray-500'}`}
              >
                Tanárcserék
              </button>
              <button
                type="button"
                onClick={() => setDiffFilter('hours_only')}
                className={`px-3 py-1 rounded-lg ${diffFilter === 'hours_only' ? 'bg-white dark:bg-gray-700 font-bold shadow-xs text-amber-600' : 'text-gray-500'}`}
              >
                Óraszám eltérések
              </button>
              <button
                type="button"
                onClick={() => setDiffFilter('all')}
                className={`px-3 py-1 rounded-lg ${diffFilter === 'all' ? 'bg-white dark:bg-gray-700 font-bold shadow-xs' : 'text-gray-500'}`}
              >
                Minden sor ({displayedRows.length})
              </button>
            </div>

            <input
              type="text"
              placeholder="Keresés osztály, tantárgy vagy pedagógus alapján..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="px-3.5 py-1.5 text-xs border rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white min-w-[260px]"
            />
          </div>

          {/* Diff Table */}
          <div className="flex-1 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-xl">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-gray-100 dark:bg-gray-700/80 sticky top-0 z-10 text-gray-700 dark:text-gray-200 font-bold">
                <tr>
                  <th className="py-2.5 px-3">Osztály / Csoport</th>
                  <th className="py-2.5 px-3">Tantárgy</th>
                  <th className="py-2.5 px-3">Bázis / Kréta állapot</th>
                  <th className="py-2.5 px-3">Jelenlegi órarend állapot</th>
                  <th className="py-2.5 px-3 text-right">Eltérés típusa / Megjegyzés</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {displayedRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-gray-400">
                      Nincs megjeleníthető felosztási eltérés a kiválasztott szűrők alapján.
                    </td>
                  </tr>
                ) : (
                  displayedRows.map((row, idx) => {
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
                          <span className="font-semibold">{row.baseTeacherDisplay}</span>
                          {row.baseWeeklyHours > 0 && <span className="ml-1 text-[11px]">({row.baseWeeklyHours} óra)</span>}
                        </td>
                        <td className="py-2 px-3 font-semibold text-gray-900 dark:text-white">
                          <span>{row.currentTeacherDisplay}</span>
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
          </div>
        </div>

        {/* ── Modal Footer ── */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 shrink-0 text-xs text-gray-600 dark:text-gray-400">
          <div className="flex items-center gap-4 font-semibold">
            <span>👥 {teachers.length} pedagógus</span>
            <span>•</span>
            <span>📖 {allocations.length} órarendi felosztás</span>
            <span>•</span>
            <span className="text-gray-900 dark:text-white font-bold">
              {selectedTeacherObj 
                ? `Kiválasztva: ${selectedTeacherObj.name}`
                : `Összes eltérés: ${diffStats.totalChanges} db`}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {selectedTeacherObj ? (
              <button
                type="button"
                onClick={() => onExportCurriculum(selectedTeacherObj.id)}
                className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
              >
                <Squares2X2Icon className="w-4 h-4" />
                <span>{selectedTeacherObj.name} Export (.xlsx)</span>
              </button>
            ) : (
              <button
                type="button"
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
