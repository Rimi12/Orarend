import React, { useState, useMemo } from 'react';
import type { Teacher, Class, Subject, Allocation, PlacedLesson } from '../types.ts';
import { DAYS_OF_WEEK } from '../constants.ts';

interface CurriculumManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  teachers: Teacher[];
  classes: Class[];
  subjects: Subject[];
  allocations: Allocation[];
  placedLessons: PlacedLesson[];
  reassignAllocationTeacher: (allocationId: string, targetTeacherId: string, hoursToTransfer?: number) => void;
  updateAllocationHours: (allocationId: string, newWeeklyHours: number) => void;
  addCustomAllocation: (teacherId: string, classId: string, subjectNameOrId: string, weeklyHours: number) => void;
  removeCustomAllocation: (allocationId: string) => void;
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

export const CurriculumManagementModal: React.FC<CurriculumManagementModalProps> = ({
  isOpen,
  onClose,
  teachers,
  classes,
  subjects,
  allocations,
  placedLessons,
  reassignAllocationTeacher,
  updateAllocationHours,
  addCustomAllocation,
  removeCustomAllocation,
}) => {
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
        isAvailableAll,
      };
    });

    // Sort: 'perfect' first, then 'partial' (descending freeCount), then 'free', then 'clash'
    const rankMap = { perfect: 0, free: 1, partial: 2, clash: 3 };
    return evals.sort((a, b) => {
      const rA = rankMap[a.fitScore];
      const rB = rankMap[b.fitScore];
      if (rA !== rB) return rA - rB;
      if (a.fitScore === 'partial' && b.fitScore === 'partial') {
        if (b.freeCount !== a.freeCount) return b.freeCount - a.freeCount;
      }
      return a.teacher.name.localeCompare(b.teacher.name, 'hu-HU');
    });
  }, [reassigningAlloc, sortedTeachers, placedLessons, allocations, subjectMap, classMap]);

  // Filtered Candidates
  const filteredCandidates = useMemo(() => {
    return candidateEvaluations.filter(c => {
      if (candidateFilter === 'perfect' && c.fitScore !== 'perfect' && c.fitScore !== 'free') return false;
      if (candidateFilter === 'partial' && c.fitScore !== 'partial') return false;
      if (candidateSearch.trim()) {
        const query = candidateSearch.toLowerCase().trim();
        if (!c.teacher.name.toLowerCase().includes(query)) return false;
      }
      return true;
    });
  }, [candidateEvaluations, candidateFilter, candidateSearch]);

  // Active candidate for timetable preview
  const activeCandidate = useMemo(() => {
    if (!selectedCandidateId) {
      return filteredCandidates[0] || candidateEvaluations[0] || null;
    }
    return candidateEvaluations.find(c => c.teacher.id === selectedCandidateId) || filteredCandidates[0] || null;
  }, [selectedCandidateId, candidateEvaluations, filteredCandidates]);

  // Overall Statistics
  const totalWeeklyHours = useMemo(() => allocations.reduce((sum, a) => sum + a.weeklyHours, 0), [allocations]);
  const totalPlacedHours = placedLessons.length;

  if (!isOpen) return null;

  const handleStartReassign = (alloc: Allocation) => {
    setReassigningAlloc(alloc);
    setTransferHours(alloc.weeklyHours);
    setTransferType('all');
    setCandidateFilter('all');
    setCandidateSearch('');
    // Auto-select first best candidate
    const allocPlaced = placedLessons.filter(p => p.allocation.id === alloc.id);
    const firstTarget = sortedTeachers.find(t => t.id !== alloc.teacherId);
    if (firstTarget) {
      setSelectedCandidateId(firstTarget.id);
    }
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

  // Placed lessons for currently reassigning allocation
  const currentAllocPlacedLessons = useMemo(() => {
    if (!reassigningAlloc) return [];
    return placedLessons.filter(p => p.allocation.id === reassigningAlloc.id);
  }, [reassigningAlloc, placedLessons]);

  // Lessons of candidate teacher
  const candidatePlacedLessons = useMemo(() => {
    if (!activeCandidate) return [];
    return placedLessons.filter(p => p.allocation.teacherId === activeCandidate.teacher.id);
  }, [activeCandidate, placedLessons]);

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
                <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">Tantárgyfelosztás Kezelő és Módosító</h2>
                <span className="px-2 py-0.5 text-xs font-bold bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300 rounded-md">
                  v3.1.0
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {reassigningAlloc 
                  ? 'Intelligens pedagóguscsere és vizuális órarend-illeszkedés vizsgálata'
                  : 'Pedagógusok közötti óracsere, óraszám-változtatás és új tantárgyak hozzáadása az órarend megőrzésével.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {reassigningAlloc ? (
              <button
                onClick={() => setReassigningAlloc(null)}
                className="px-3.5 py-1.5 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-semibold text-xs rounded-xl transition-colors flex items-center gap-1.5"
              >
                <span>← Vissza a listához</span>
              </button>
            ) : (
              <button
                onClick={() => setIsAddFormOpen(!isAddFormOpen)}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
              >
                <span>{isAddFormOpen ? '✖ Bezárás' : '➕ Új tantárgyfelosztás'}</span>
              </button>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-2xl font-bold p-1">
              &times;
            </button>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════════════ */}
        {/* ── SMART REASSIGNMENT VIEW WITH VISUAL TIMETABLE PREVIEW ──────────────── */}
        {/* ══════════════════════════════════════════════════════════════════════════ */}
        {reassigningAlloc ? (
          <div className="flex-1 flex flex-col min-h-0 bg-gray-50/50 dark:bg-gray-900/50 overflow-hidden">
            {/* Top Allocation Banner */}
            <div className="px-6 py-3 bg-blue-50 dark:bg-blue-950/40 border-b border-blue-200 dark:border-blue-800/60 flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center text-xl font-bold shadow-xs">
                  🔄
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-gray-900 dark:text-white">
                      {subjectMap.get(reassigningAlloc.subjectId)?.name || 'Tantárgy'}
                    </span>
                    <span className="px-2 py-0.5 text-xs font-bold bg-white dark:bg-gray-800 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700 rounded-md">
                      {classMap.get(reassigningAlloc.classId)?.name || 'Osztály'}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                      (Jelenlegi pedagógus: <b>{teacherMap.get(reassigningAlloc.teacherId)?.name}</b>)
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-600 dark:text-gray-300 mt-0.5">
                    <span>⏱️ Heti óraszám: <b>{reassigningAlloc.weeklyHours} óra</b></span>
                    <span>•</span>
                    <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                      📅 Órarendbe beosztva: <b>{currentAllocPlacedLessons.length} óra</b> (ezek időpontjai fixen megmaradnak)
                    </span>
                  </div>
                </div>
              </div>

              {/* Transfer Mode Selector */}
              <div className="flex items-center gap-2 bg-white dark:bg-gray-800 px-3 py-1.5 rounded-xl border border-gray-300 dark:border-gray-600 text-xs shadow-2xs">
                <label className="flex items-center gap-1.5 cursor-pointer font-semibold text-gray-800 dark:text-gray-200">
                  <input
                    type="radio"
                    name="transferScope"
                    checked={transferType === 'all'}
                    onChange={() => setTransferType('all')}
                    className="text-blue-600"
                  />
                  <span>Mind a {reassigningAlloc.weeklyHours} óra átadása</span>
                </label>

                {reassigningAlloc.weeklyHours > 1 && (
                  <>
                    <span className="text-gray-300 dark:text-gray-600">|</span>
                    <label className="flex items-center gap-1.5 cursor-pointer font-semibold text-gray-800 dark:text-gray-200">
                      <input
                        type="radio"
                        name="transferScope"
                        checked={transferType === 'partial'}
                        onChange={() => setTransferType('partial')}
                        className="text-blue-600"
                      />
                      <span>Részleges átadás:</span>
                    </label>
                    {transferType === 'partial' && (
                      <div className="inline-flex items-center gap-1">
                        <input
                          type="number"
                          min="1"
                          max={reassigningAlloc.weeklyHours - 1}
                          value={transferHours}
                          onChange={e => setTransferHours(Math.max(1, Math.min(reassigningAlloc.weeklyHours - 1, parseInt(e.target.value, 10) || 1)))}
                          className="w-12 px-1.5 py-0.5 text-center font-bold border border-blue-400 rounded bg-blue-50 dark:bg-gray-700 text-blue-900 dark:text-white"
                        />
                        <span className="font-semibold text-gray-600 dark:text-gray-400">óra</span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Split Content: Left Candidates List, Right Visual Timetable Preview */}
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 min-h-0 divide-y lg:divide-y-0 lg:divide-x divide-gray-200 dark:divide-gray-700">
              
              {/* ── Left Column: Candidate Teachers List (col-span-5) ── */}
              <div className="lg:col-span-5 flex flex-col min-h-0 bg-white dark:bg-gray-850">
                {/* Candidates Filter & Search */}
                <div className="p-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-800/40 space-y-2 shrink-0">
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-2.5 pointer-events-none text-gray-400 text-xs">🔍</span>
                    <input
                      type="text"
                      value={candidateSearch}
                      onChange={e => setCandidateSearch(e.target.value)}
                      placeholder="Pedagógus keresése..."
                      className="w-full pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                    {candidateSearch && (
                      <button onClick={() => setCandidateSearch('')} className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-gray-400 text-xs">✕</button>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 text-[11px] font-semibold">
                    <button
                      onClick={() => setCandidateFilter('all')}
                      className={`px-2.5 py-1 rounded-lg transition-all ${
                        candidateFilter === 'all'
                          ? 'bg-blue-600 text-white font-bold shadow-xs'
                          : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      Mindenki ({candidateEvaluations.length})
                    </button>
                    <button
                      onClick={() => setCandidateFilter('perfect')}
                      className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 ${
                        candidateFilter === 'perfect'
                          ? 'bg-emerald-600 text-white font-bold shadow-xs'
                          : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                      }`}
                    >
                      <span>🟢</span>
                      <span>100% Szabad ({candidateEvaluations.filter(c => c.fitScore === 'perfect' || c.fitScore === 'free').length})</span>
                    </button>
                    {candidateEvaluations.some(c => c.fitScore === 'partial') && (
                      <button
                        onClick={() => setCandidateFilter('partial')}
                        className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 ${
                          candidateFilter === 'partial'
                            ? 'bg-amber-600 text-white font-bold shadow-xs'
                            : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                        }`}
                      >
                        <span>🟡</span>
                        <span>Részben jó ({candidateEvaluations.filter(c => c.fitScore === 'partial').length})</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Candidate List Scrollable */}
                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                  {filteredCandidates.length === 0 ? (
                    <div className="text-center py-12 text-gray-400">
                      <span className="text-3xl block mb-1">🔍</span>
                      <p className="text-xs font-semibold">Nincs a szűrésnek megfelelő kolléga.</p>
                    </div>
                  ) : (
                    filteredCandidates.map(cand => {
                      const isSelected = activeCandidate?.teacher.id === cand.teacher.id;
                      const addedHours = transferType === 'all' ? reassigningAlloc.weeklyHours : transferHours;
                      const nextHours = cand.totalCurrentHours + addedHours;

                      return (
                        <div
                          key={cand.teacher.id}
                          onClick={() => setSelectedCandidateId(cand.teacher.id)}
                          className={`p-3 rounded-xl border transition-all cursor-pointer text-xs ${
                            isSelected
                              ? 'bg-blue-50/90 dark:bg-blue-950/60 border-blue-500 shadow-md ring-2 ring-blue-400/40'
                              : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-xs'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-2">
                              <span className={`w-3.5 h-3.5 rounded-full ${cand.teacher.color || 'bg-blue-400'}`} />
                              <span className="font-bold text-gray-900 dark:text-white text-sm">
                                {cand.teacher.name}
                              </span>
                            </div>

                            {/* Fit Badge */}
                            {cand.fitScore === 'perfect' || cand.fitScore === 'free' ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300 flex items-center gap-1 border border-emerald-300 dark:border-emerald-700">
                                <span>🟢</span>
                                <span>100% Illeszkedik ({cand.freeCount}/{cand.totalPlacedCount})</span>
                              </span>
                            ) : cand.fitScore === 'partial' ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300 flex items-center gap-1 border border-amber-300 dark:border-amber-700">
                                <span>🟡</span>
                                <span>Részben ({cand.freeCount}/{cand.totalPlacedCount} óra)</span>
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300 flex items-center gap-1 border border-red-300 dark:border-red-700">
                                <span>🔴</span>
                                <span>Ütközik (0/{cand.totalPlacedCount})</span>
                              </span>
                            )}
                          </div>

                          <div className="flex items-center justify-between text-[11px] text-gray-600 dark:text-gray-300">
                            <div>
                              <span>Heti terhelés: </span>
                              <span className="font-bold text-gray-800 dark:text-gray-200">{cand.totalCurrentHours} óra</span>
                              <span className="text-blue-600 dark:text-blue-400 font-bold ml-1">➔ {nextHours} óra</span>
                            </div>

                            <span className="text-blue-600 dark:text-blue-400 font-semibold underline text-[11px]">
                              {isSelected ? 'Órarend megnyitva 👉' : 'Órarend megtekintése'}
                            </span>
                          </div>

                          {/* Clashes Details if any */}
                          {cand.clashes.length > 0 && (
                            <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700/60 space-y-1">
                              {cand.clashes.map((c, idx) => (
                                <div key={idx} className="text-[10px] text-red-600 dark:text-red-400 flex items-center gap-1 font-medium">
                                  <span>⚠️</span>
                                  <span>{DAYS_OF_WEEK[c.day]} {c.period + 1}. óra: {c.reason}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* ── Right Column: Visual Timetable Preview (col-span-7) ── */}
              <div className="lg:col-span-7 flex flex-col min-h-0 bg-gray-50/50 dark:bg-gray-900/40 p-4">
                {activeCandidate ? (
                  <div className="flex-1 flex flex-col min-h-0">
                    {/* Timetable Header */}
                    <div className="flex items-center justify-between mb-3 shrink-0">
                      <div className="flex items-center gap-2">
                        <span className={`w-3.5 h-3.5 rounded-full ${activeCandidate.teacher.color || 'bg-blue-400'}`} />
                        <div>
                          <h3 className="font-bold text-gray-900 dark:text-white text-sm">
                            {activeCandidate.teacher.name} heti órarendje (Szimulált előnézet)
                          </h3>
                          <p className="text-[11px] text-gray-500 dark:text-gray-400">
                            A zöld keretes kártyák jelzik, hova kerülnének az új órák a tanár naptárában.
                          </p>
                        </div>
                      </div>

                      {/* Legend */}
                      <div className="flex items-center gap-2 text-[10px] font-semibold">
                        <span className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-400 rounded">
                          ✨ Új átvett óra
                        </span>
                        <span className="px-2 py-0.5 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded">
                          Meglévő óra
                        </span>
                      </div>
                    </div>

                    {/* 5-Day Weekly Matrix Table */}
                    <div className="flex-1 border border-gray-200 dark:border-gray-700 rounded-xl overflow-auto bg-white dark:bg-gray-850 shadow-xs">
                      <table className="border-separate border-spacing-0 w-full text-xs text-center table-fixed">
                        <thead>
                          <tr className="bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                            <th className="sticky top-0 z-20 border-b border-gray-300 dark:border-gray-600 p-2 font-bold w-12 bg-gray-100 dark:bg-gray-800">Óra</th>
                            {DAYS_OF_WEEK.map((dayName, dIdx) => (
                              <th key={dIdx} className="sticky top-0 z-20 border-b border-gray-300 dark:border-gray-600 p-2 font-bold bg-gray-100 dark:bg-gray-800">
                                {dayName}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                          {[0, 1, 2, 3, 4, 5, 6, 7].map(period => (
                            <tr key={period} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/40">
                              {/* Period Number */}
                              <td className="p-1.5 font-bold text-gray-500 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30">
                                {period + 1}.
                              </td>

                              {/* Days 0..4 */}
                              {[0, 1, 2, 3, 4].map(day => {
                                const isTargetSlot = currentAllocPlacedLessons.some(p => p.day === day && p.period === period);
                                const existingLesson = candidatePlacedLessons.find(p => p.day === day && p.period === period);
                                const isAvailable = activeCandidate.teacher.availability?.[day]?.[period] ?? true;

                                if (isTargetSlot) {
                                  if (existingLesson) {
                                    // Collision
                                    const colSubject = subjectMap.get(existingLesson.allocation.subjectId)?.name || 'Óra';
                                    const colClass = classMap.get(existingLesson.allocation.classId)?.name || 'Osztály';
                                    const targetSubject = subjectMap.get(reassigningAlloc.subjectId)?.name || 'Új óra';
                                    return (
                                      <td key={day} className="p-1 border-r border-gray-200 dark:border-gray-700 bg-red-50 dark:bg-red-950/40">
                                        <div className="p-1.5 bg-red-100 dark:bg-red-900/60 border-2 border-red-500 rounded-lg text-left shadow-xs">
                                          <div className="text-[9px] font-bold text-red-700 dark:text-red-200 flex items-center gap-0.5">
                                            <span>⚠️ ÜTKÖZÉS</span>
                                          </div>
                                          <div className="font-bold text-red-900 dark:text-white truncate text-[11px]">
                                            {colSubject} ({colClass})
                                          </div>
                                          <div className="text-[9px] text-red-800 dark:text-red-300 font-semibold truncate">
                                            + {targetSubject}
                                          </div>
                                        </div>
                                      </td>
                                    );
                                  } else if (!isAvailable) {
                                    // Unavailable slot
                                    return (
                                      <td key={day} className="p-1 border-r border-gray-200 dark:border-gray-700 bg-amber-50 dark:bg-amber-950/40">
                                        <div className="p-1.5 bg-amber-100 dark:bg-amber-900/50 border border-amber-400 rounded-lg text-left">
                                          <div className="text-[9px] font-bold text-amber-800 dark:text-amber-200">
                                            🚫 Nem elérhető
                                          </div>
                                          <div className="text-[10px] font-semibold text-amber-900 dark:text-amber-100 truncate">
                                            {subjectMap.get(reassigningAlloc.subjectId)?.name}
                                          </div>
                                        </div>
                                      </td>
                                    );
                                  } else {
                                    // Perfect Fit Target Slot!
                                    const targetSubject = subjectMap.get(reassigningAlloc.subjectId)?.name || 'Tantárgy';
                                    const targetClass = classMap.get(reassigningAlloc.classId)?.name || 'Osztály';
                                    return (
                                      <td key={day} className="p-1 border-r border-gray-200 dark:border-gray-700 bg-emerald-50/80 dark:bg-emerald-950/40">
                                        <div className="p-1.5 bg-emerald-100 dark:bg-emerald-900/80 border-2 border-emerald-500 dark:border-emerald-400 rounded-lg text-left shadow-xs animate-pulse">
                                          <div className="text-[9px] font-bold text-emerald-800 dark:text-emerald-200 flex items-center gap-0.5">
                                            <span>✨ ÚJ ÓRA</span>
                                          </div>
                                          <div className="font-bold text-emerald-950 dark:text-white truncate text-[11px]">
                                            {targetSubject}
                                          </div>
                                          <div className="text-[10px] text-emerald-800 dark:text-emerald-300 font-semibold truncate">
                                            {targetClass}
                                          </div>
                                        </div>
                                      </td>
                                    );
                                  }
                                }

                                if (existingLesson) {
                                  // Existing lesson of candidate teacher
                                  const exSubject = subjectMap.get(existingLesson.allocation.subjectId)?.name || 'Óra';
                                  const exClass = classMap.get(existingLesson.allocation.classId)?.name || 'Osztály';
                                  return (
                                    <td key={day} className="p-1 border-r border-gray-200 dark:border-gray-700">
                                      <div className="p-1.5 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-left">
                                        <div className="font-semibold text-gray-900 dark:text-gray-100 truncate text-[11px]">
                                          {exSubject}
                                        </div>
                                        <div className="text-[10px] text-gray-500 dark:text-gray-400 font-medium truncate">
                                          {exClass}
                                        </div>
                                      </div>
                                    </td>
                                  );
                                }

                                if (!isAvailable) {
                                  // Unavailable normal slot
                                  return (
                                    <td key={day} className="p-1 border-r border-gray-200 dark:border-gray-700 bg-gray-100/50 dark:bg-gray-800/30">
                                      <span className="text-[10px] text-gray-400 font-semibold">—</span>
                                    </td>
                                  );
                                }

                                // Empty slot
                                return (
                                  <td key={day} className="p-1 border-r border-gray-200 dark:border-gray-700">
                                    <div className="h-9 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50" />
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Action Bar */}
                    <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between shrink-0">
                      <div className="text-xs text-gray-600 dark:text-gray-300">
                        <span>Kiválasztva: </span>
                        <b className="text-gray-900 dark:text-white">{activeCandidate.teacher.name}</b>
                        {activeCandidate.fitScore === 'perfect' || activeCandidate.fitScore === 'free' ? (
                          <span className="text-emerald-600 dark:text-emerald-400 font-bold ml-2">✓ 100%-ban szabad, 0 ütközés</span>
                        ) : activeCandidate.fitScore === 'partial' ? (
                          <span className="text-amber-600 dark:text-amber-400 font-bold ml-2">⚠️ Részleges illeszkedés ({activeCandidate.freeCount}/{activeCandidate.totalPlacedCount})</span>
                        ) : (
                          <span className="text-red-600 dark:text-red-400 font-bold ml-2">⚠️ Ütközések vannak az órarendjében</span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setReassigningAlloc(null)}
                          className="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 text-gray-800 dark:text-gray-200 font-semibold rounded-xl text-xs"
                        >
                          Mégse
                        </button>
                        <button
                          type="button"
                          onClick={handleConfirmReassign}
                          className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs shadow-md transition-all flex items-center gap-1.5"
                        >
                          <span>✓ Átadás</span>
                          <span>{activeCandidate.teacher.name} részére</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-gray-400">
                    <p className="text-xs font-semibold">Válassz ki egy pedagógust a bal oldali listából az órarendi előnézethez.</p>
                  </div>
                )}
              </div>

            </div>
          </div>
        ) : (
          /* ══════════════════════════════════════════════════════════════════════════ */
          /* ── MAIN ALLOCATIONS TABLE VIEW ────────────────────────────────────────── */
          /* ══════════════════════════════════════════════════════════════════════════ */
          <>
            {/* Quick Add Form */}
            {isAddFormOpen && (
              <form onSubmit={handleAddNewAllocation} className="px-6 py-4 bg-emerald-50/80 dark:bg-emerald-950/40 border-b border-emerald-200 dark:border-emerald-800 shrink-0">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold text-emerald-900 dark:text-emerald-200 flex items-center gap-1">
                    <span>➕</span> Új tantárgyfelosztási tétel rögzítése:
                  </h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 mb-1">Pedagógus:</label>
                    <select
                      value={newTeacherId}
                      onChange={e => setNewTeacherId(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white"
                      required
                    >
                      <option value="">-- Válassz tanárt --</option>
                      {sortedTeachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 mb-1">Osztály:</label>
                    <select
                      value={newClassId}
                      onChange={e => setNewClassId(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white"
                      required
                    >
                      <option value="">-- Válassz osztályt --</option>
                      {sortedClasses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 mb-1">Tantárgy:</label>
                    <input
                      type="text"
                      list="subjects-datalist"
                      placeholder="Pl. Matematika, Ének..."
                      value={newSubjectInput}
                      onChange={e => setNewSubjectInput(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white"
                      required
                    />
                    <datalist id="subjects-datalist">
                      {sortedSubjects.map(s => <option key={s.id} value={s.name} />)}
                    </datalist>
                  </div>

                  <div className="flex items-end gap-2">
                    <div className="w-24">
                      <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 mb-1">Heti óraszám:</label>
                      <input
                        type="number"
                        min="1"
                        max="40"
                        value={newWeeklyHours}
                        onChange={e => setNewWeeklyHours(parseInt(e.target.value, 10) || 1)}
                        className="w-full px-3 py-1.5 text-xs bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white font-bold"
                        required
                      />
                    </div>
                    <button
                      type="submit"
                      className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg transition-colors shadow-xs"
                    >
                      Hozzáadás
                    </button>
                  </div>
                </div>
              </form>
            )}

            {/* Toolbar: Search & Filters */}
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/40 flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2 flex-1 min-w-[240px] max-w-md">
                <div className="relative w-full">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-gray-400 text-sm">🔍</span>
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    placeholder="Keresés tanár, osztály vagy tantárgy alapján..."
                    className="w-full pl-9 pr-3 py-1.5 text-xs bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                  {searchTerm && (
                    <button onClick={() => setSearchTerm('')} className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-gray-400 hover:text-gray-600 text-xs">✕</button>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center bg-gray-200 dark:bg-gray-700 p-1 rounded-xl text-xs font-semibold">
                  <button
                    onClick={() => setFilterMode('all')}
                    className={`px-3 py-1 rounded-lg transition-all ${filterMode === 'all' ? 'bg-white dark:bg-gray-850 text-blue-600 dark:text-blue-400 font-bold shadow-xs' : 'text-gray-600 dark:text-gray-300'}`}
                  >
                    Összes ({allocations.length})
                  </button>
                  <button
                    onClick={() => { setFilterMode('teacher'); if (!selectedTeacherFilter && sortedTeachers[0]) setSelectedTeacherFilter(sortedTeachers[0].id); }}
                    className={`px-3 py-1 rounded-lg transition-all ${filterMode === 'teacher' ? 'bg-white dark:bg-gray-850 text-blue-600 dark:text-blue-400 font-bold shadow-xs' : 'text-gray-600 dark:text-gray-300'}`}
                  >
                    Tanár szerint
                  </button>
                  <button
                    onClick={() => { setFilterMode('class'); if (!selectedClassFilter && sortedClasses[0]) setSelectedClassFilter(sortedClasses[0].id); }}
                    className={`px-3 py-1 rounded-lg transition-all ${filterMode === 'class' ? 'bg-white dark:bg-gray-850 text-blue-600 dark:text-blue-400 font-bold shadow-xs' : 'text-gray-600 dark:text-gray-300'}`}
                  >
                    Osztály szerint
                  </button>
                </div>

                {filterMode === 'teacher' && (
                  <select
                    value={selectedTeacherFilter}
                    onChange={e => setSelectedTeacherFilter(e.target.value)}
                    className="px-3 py-1.5 text-xs bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white font-medium"
                  >
                    {sortedTeachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                )}

                {filterMode === 'class' && (
                  <select
                    value={selectedClassFilter}
                    onChange={e => setSelectedClassFilter(e.target.value)}
                    className="px-3 py-1.5 text-xs bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white font-medium"
                  >
                    {sortedClasses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                )}
              </div>
            </div>

            {/* Table Container */}
            <div className="flex-1 overflow-auto p-4">
              {filteredAllocations.length === 0 ? (
                <div className="text-center py-16 text-gray-400">
                  <span className="text-4xl block mb-2">🔍</span>
                  <p className="text-sm font-semibold">Nem található a keresésnek megfelelő tantárgyfelosztás.</p>
                </div>
              ) : (
                <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden shadow-xs">
                  <table className="border-separate border-spacing-0 w-full text-xs">
                    <thead>
                      <tr className="bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                        <th className="sticky top-0 z-20 border-b border-gray-300 dark:border-gray-600 p-2.5 font-bold text-left bg-gray-100 dark:bg-gray-800">Pedagógus</th>
                        <th className="sticky top-0 z-20 border-b border-gray-300 dark:border-gray-600 p-2.5 font-bold text-left bg-gray-100 dark:bg-gray-800">Osztály</th>
                        <th className="sticky top-0 z-20 border-b border-gray-300 dark:border-gray-600 p-2.5 font-bold text-left bg-gray-100 dark:bg-gray-800">Tantárgy</th>
                        <th className="sticky top-0 z-20 border-b border-gray-300 dark:border-gray-600 p-2.5 font-bold text-center bg-gray-100 dark:bg-gray-800">Heti óraszám</th>
                        <th className="sticky top-0 z-20 border-b border-gray-300 dark:border-gray-600 p-2.5 font-bold text-center bg-gray-100 dark:bg-gray-800">Órarendi állapot</th>
                        <th className="sticky top-0 z-20 border-b border-gray-300 dark:border-gray-600 p-2.5 font-bold text-right bg-gray-100 dark:bg-gray-800">Műveletek</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {filteredAllocations.map(alloc => {
                        const teacher = teacherMap.get(alloc.teacherId);
                        const tClass = classMap.get(alloc.classId);
                        const subject = subjectMap.get(alloc.subjectId);
                        const placedCount = placedCountMap.get(alloc.id) || 0;
                        const isAllPlaced = placedCount >= alloc.weeklyHours;

                        return (
                          <tr key={alloc.id} className="hover:bg-blue-50/40 dark:hover:bg-blue-900/10 transition-colors">
                            {/* Pedagógus */}
                            <td className="p-2.5 font-semibold text-gray-900 dark:text-gray-100">
                              <div className="flex items-center gap-2">
                                <span className={`w-3 h-3 rounded-full ${teacher?.color || 'bg-blue-400'}`} />
                                <span>{teacher?.name || 'Ismeretlen'}</span>
                              </div>
                            </td>

                            {/* Osztály */}
                            <td className="p-2.5 font-bold text-gray-800 dark:text-gray-200">
                              <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded-md">
                                {tClass?.name || 'Ismeretlen'}
                              </span>
                            </td>

                            {/* Tantárgy */}
                            <td className="p-2.5 font-semibold text-gray-800 dark:text-gray-200">
                              {subject?.name || 'Ismeretlen'}
                            </td>

                            {/* Heti óraszám editor */}
                            <td className="p-2.5 text-center">
                              <div className="inline-flex items-center gap-1 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg p-0.5 shadow-2xs">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (alloc.weeklyHours > 1) {
                                      updateAllocationHours(alloc.id, alloc.weeklyHours - 1);
                                    }
                                  }}
                                  disabled={alloc.weeklyHours <= 1}
                                  className="w-5 h-5 flex items-center justify-center font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded disabled:opacity-30"
                                  title="Óraszám csökkentése"
                                >
                                  −
                                </button>
                                <span className="w-7 text-center font-mono font-bold text-sm text-gray-900 dark:text-white">
                                  {alloc.weeklyHours}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => updateAllocationHours(alloc.id, alloc.weeklyHours + 1)}
                                  className="w-5 h-5 flex items-center justify-center font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                                  title="Óraszám növelése"
                                >
                                  +
                                </button>
                              </div>
                            </td>

                            {/* Órarendi állapot */}
                            <td className="p-2.5 text-center">
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

                            {/* Műveletek */}
                            <td className="p-2.5 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleStartReassign(alloc)}
                                  className="px-3 py-1 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all shadow-xs flex items-center gap-1.5"
                                  title="Intelligens pedagóguscsere és órarendi illeszkedés vizsgálata"
                                >
                                  <span>🔄</span>
                                  <span>Átadás másnak</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteAllocation(alloc)}
                                  className="px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                  title="Tantárgyfelosztási sor törlése"
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
              )}
            </div>
          </>
        )}

        {/* ── Footer Summary ── */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 shrink-0 text-xs text-gray-600 dark:text-gray-400">
          <div className="flex items-center gap-4 font-semibold">
            <span>👥 {teachers.length} pedagógus</span>
            <span>•</span>
            <span>🏫 {classes.length} osztály</span>
            <span>•</span>
            <span>📖 {allocations.length} tantárgyfelosztás</span>
            <span>•</span>
            <span className="text-gray-900 dark:text-white font-bold">⏱️ Összesen: {totalWeeklyHours} heti óra ({totalPlacedHours} beosztva)</span>
          </div>

          <button
            onClick={onClose}
            className="px-5 py-1.5 bg-gray-800 hover:bg-gray-900 dark:bg-gray-200 dark:hover:bg-white text-white dark:text-gray-900 font-bold rounded-xl shadow-xs transition-colors"
          >
            Kész / Bezárás
          </button>
        </div>

      </div>
    </div>
  );
};
