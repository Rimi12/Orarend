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

  // Reassignment Popover State
  const [reassigningAllocId, setReassigningAllocId] = useState<string | null>(null);
  const [targetTeacherId, setTargetTeacherId] = useState<string>('');
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

  // Filtered allocations
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

  // Overall Statistics
  const totalWeeklyHours = useMemo(() => allocations.reduce((sum, a) => sum + a.weeklyHours, 0), [allocations]);
  const totalPlacedHours = placedLessons.length;

  if (!isOpen) return null;

  const handleStartReassign = (alloc: Allocation) => {
    setReassigningAllocId(alloc.id);
    const availableTargets = sortedTeachers.filter(t => t.id !== alloc.teacherId);
    setTargetTeacherId(availableTargets[0]?.id || '');
    setTransferHours(alloc.weeklyHours);
    setTransferType('all');
  };

  const handleConfirmReassign = (alloc: Allocation) => {
    if (!targetTeacherId) return;
    const hours = transferType === 'all' ? alloc.weeklyHours : Math.min(alloc.weeklyHours, Math.max(1, transferHours));
    reassignAllocationTeacher(alloc.id, targetTeacherId, hours);
    setReassigningAllocId(null);
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
    <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex justify-center items-center z-50 p-3 sm:p-6" onClick={onClose}>
      <div className="bg-white dark:bg-gray-850 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden"
           onClick={e => e.stopPropagation()}>
        
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-3xl">📚</span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Tantárgyfelosztás Kezelő és Módosító</h2>
                <span className="px-2 py-0.5 text-xs font-bold bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300 rounded-md">
                  v3.1.0
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Pedagógusok közötti óracsere, óraszám-változtatás és új tantárgyak hozzáadása az órarend megőrzésével.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsAddFormOpen(!isAddFormOpen)}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
            >
              <span>{isAddFormOpen ? '✖ Bezárás' : '➕ Új tantárgyfelosztás'}</span>
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-2xl font-bold p-1">
              &times;
            </button>
          </div>
        </div>

        {/* ── Quick Add Collapsible Form ── */}
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

        {/* ── Toolbar: Search & Filters ── */}
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
            {/* Filter Toggle Buttons */}
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

        {/* ── Table Container ── */}
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
                    const isReassigning = reassigningAllocId === alloc.id;

                    return (
                      <React.Fragment key={alloc.id}>
                        <tr className="hover:bg-blue-50/40 dark:hover:bg-blue-900/10 transition-colors">
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
                                className="px-2.5 py-1 text-xs font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50 rounded-lg transition-colors flex items-center gap-1"
                                title="Tantárgy átadása másik pedagógusnak"
                              >
                                <span>👤</span>
                                <span>Átadás</span>
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

                        {/* Inline Reassignment Popover Panel */}
                        {isReassigning && (
                          <tr className="bg-blue-50/90 dark:bg-blue-950/70 border-y-2 border-blue-400">
                            <td colSpan={6} className="p-3">
                              <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-blue-900 dark:text-blue-200">
                                    🔄 {subject?.name} ({tClass?.name}) átadása másik pedagógusnak:
                                  </span>
                                </div>

                                <div className="flex flex-wrap items-center gap-3">
                                  <div>
                                    <span className="text-[11px] text-gray-600 dark:text-gray-300 mr-1.5 font-semibold">Új tanár:</span>
                                    <select
                                      value={targetTeacherId}
                                      onChange={e => setTargetTeacherId(e.target.value)}
                                      className="px-2.5 py-1 text-xs bg-white dark:bg-gray-800 border border-blue-300 dark:border-blue-700 rounded-lg font-bold"
                                    >
                                      {sortedTeachers.filter(t => t.id !== alloc.teacherId).map(t => (
                                        <option key={t.id} value={t.id}>{t.name}</option>
                                      ))}
                                    </select>
                                  </div>

                                  <div className="flex items-center gap-2 bg-white/80 dark:bg-gray-800/80 px-2.5 py-1 rounded-lg border border-blue-200 dark:border-blue-800">
                                    <label className="flex items-center gap-1 cursor-pointer font-semibold">
                                      <input
                                        type="radio"
                                        checked={transferType === 'all'}
                                        onChange={() => setTransferType('all')}
                                      />
                                      <span>Mind a {alloc.weeklyHours} óra</span>
                                    </label>
                                    <label className="flex items-center gap-1 cursor-pointer font-semibold ml-2">
                                      <input
                                        type="radio"
                                        checked={transferType === 'partial'}
                                        onChange={() => setTransferType('partial')}
                                      />
                                      <span>Részleges:</span>
                                    </label>
                                    {transferType === 'partial' && (
                                      <input
                                        type="number"
                                        min="1"
                                        max={alloc.weeklyHours - 1}
                                        value={transferHours}
                                        onChange={e => setTransferHours(Math.max(1, Math.min(alloc.weeklyHours - 1, parseInt(e.target.value, 10) || 1)))}
                                        className="w-12 px-1 py-0.5 text-center font-bold border rounded bg-white dark:bg-gray-700"
                                      />
                                    )}
                                  </div>

                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => setReassigningAllocId(null)}
                                      className="px-3 py-1 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 font-semibold rounded-lg"
                                    >
                                      Mégse
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleConfirmReassign(alloc)}
                                      className="px-4 py-1 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-xs"
                                    >
                                      ✓ Átadás Végrehajtása
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

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
