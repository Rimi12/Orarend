import React, { useState, useMemo } from 'react';
import type { Teacher, Class, Subject, Allocation, PlacedLesson } from '../types.ts';

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
      if (p && p.allocation) {
        map.set(p.allocation.id, (map.get(p.allocation.id) || 0) + 1);
      }
    });
    return map;
  }, [placedLessons]);

  // Sorted helpers
  const sortedTeachers = useMemo(() => [...teachers].sort((a, b) => a.name.localeCompare(b.name, 'hu-HU')), [teachers]);
  const sortedClasses = useMemo(() => [...classes].sort((a, b) => a.name.localeCompare(b.name, 'hu-HU')), [classes]);

  // Filtered allocations for main view
  const filteredAllocations = useMemo(() => {
    return allocations.filter(alloc => {
      const teacher = teacherMap.get(alloc.teacherId);
      const tClass = classMap.get(alloc.classId);
      const subject = subjectMap.get(alloc.subjectId);

      const teacherName = teacher?.name || '';
      const className = alloc.originalClass || tClass?.name || '';
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
        const matchesClass = className.toLowerCase().includes(query) || (alloc.originalGroup && alloc.originalGroup.toLowerCase().includes(query));
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

    const allocPlaced = placedLessons.filter(p => p && p.allocation && p.allocation.id === reassigningAlloc.id);
    const targetTeachers = sortedTeachers.filter(t => t.id !== reassigningAlloc.teacherId);

    const evals: CandidateEvaluation[] = targetTeachers.map(teacher => {
      const tPlaced = placedLessons.filter(p => p && p.allocation && p.allocation.teacherId === teacher.id);
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
    const className = alloc.originalClass || classMap.get(alloc.classId)?.name || 'Osztály';
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
      <div className="bg-white dark:bg-gray-850 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden"
           onClick={e => e.stopPropagation()}>
        
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-2xl sm:text-3xl">📚</span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">Tantárgyfelosztás Szerkesztése</h2>
                <span className="px-2 py-0.5 text-xs font-bold bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300 rounded-md">
                  v3.1.0
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {reassigningAlloc 
                  ? 'Intelligens pedagóguscsere és órarend-illeszkedés vizsgálata'
                  : 'Pedagógusok közötti óracsere, óraszám-módosítás és új tantárgyak felvétele az órarend megőrzésével.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {reassigningAlloc && (
              <button
                onClick={() => setReassigningAlloc(null)}
                className="px-3.5 py-1.5 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-semibold text-xs rounded-xl transition-colors"
              >
                ← Vissza a listához
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

        {/* ── Content Area ── */}
        {reassigningAlloc ? (
          /* Smart Reassignment View */
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-gray-50/50 dark:bg-gray-900/30">
            {/* Top Reassign Banner */}
            <div className="p-4 bg-blue-50 dark:bg-blue-950/40 border-b border-blue-100 dark:border-blue-900/50 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div>
                  <div className="text-xs font-bold text-blue-800 dark:text-blue-300 uppercase">
                    Kiválasztott tantárgyfelosztási sor átadása:
                  </div>
                  <div className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <span>{teacherMap.get(reassigningAlloc.teacherId)?.name}</span>
                    <span>➔</span>
                    <span className="text-blue-600 dark:text-blue-400">{reassigningAlloc.originalClass || classMap.get(reassigningAlloc.classId)?.name}</span>
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
          /* Main Allocations Table View */
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden p-6 space-y-4">
            {/* Search & Filter Bar */}
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

            {/* Table */}
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

        {/* ── Footer ── */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 shrink-0 text-xs text-gray-600 dark:text-gray-400">
          <div className="flex items-center gap-4 font-semibold">
            <span>👥 {teachers.length} pedagógus</span>
            <span>•</span>
            <span>🏫 {classes.length} osztály</span>
            <span>•</span>
            <span>📖 {allocations.length} felosztás</span>
            <span>•</span>
            <span className="text-gray-900 dark:text-white font-bold">⏱️ Összesen: {totalWeeklyHours} heti óra ({totalPlacedHours} beosztva)</span>
          </div>

          <button
            onClick={onClose}
            className="px-5 py-1.5 bg-gray-800 hover:bg-gray-900 dark:bg-gray-200 dark:hover:bg-white text-white dark:text-gray-900 font-bold rounded-xl shadow-xs transition-colors"
          >
            Bezárás
          </button>
        </div>

      </div>
    </div>
  );
};
