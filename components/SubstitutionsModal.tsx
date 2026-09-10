import React, { useState, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import type { Substitution } from '../types.ts';
import { DAYS_OF_WEEK } from '../constants.ts';
import { useTimetable } from '../contexts/TimetableContext.tsx';
import { parseKretaSubstitutionExport } from '../utils.ts';
import { ArrowDownTrayIcon } from './icons/ArrowDownTrayIcon.tsx';
import { TrashIcon } from './icons/TrashIcon.tsx';

interface SubstitutionsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SubstitutionsModal: React.FC<SubstitutionsModalProps> = ({ isOpen, onClose }) => {
  const { substitutions, loadSubstitutionsOnly, setSubstitutions, currentState } = useTimetable();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'longTerm' | 'oneOff' | 'osszevonas'>('all');
  const [selectedDay, setSelectedDay] = useState<number | 'all'>('all');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const stats = useMemo(() => {
    const list = substitutions || [];
    const substituteTeachers = new Set<string>();
    const originalTeachers = new Set<string>();
    let longTermCount = 0;
    let totalOccurrences = 0;

    list.forEach(s => {
      if (s.substituteTeacherName) substituteTeachers.add(s.substituteTeacherName);
      if (s.originalTeacherName) originalTeachers.add(s.originalTeacherName);
      if (s.isLongTerm) longTermCount++;
      totalOccurrences += s.occurrences || 1;
    });

    return {
      totalSlots: list.length,
      longTermSlots: longTermCount,
      substituteCount: substituteTeachers.size,
      originalCount: originalTeachers.size,
      totalOccurrences
    };
  }, [substitutions]);

  const filteredSubstitutions = useMemo(() => {
    let result = [...(substitutions || [])];

    if (filterType === 'longTerm') {
      result = result.filter(s => s.isLongTerm);
    } else if (filterType === 'oneOff') {
      result = result.filter(s => !s.isLongTerm);
    } else if (filterType === 'osszevonas') {
      result = result.filter(s => s.substitutionType === 'Óraösszevonás');
    }

    if (selectedDay !== 'all') {
      result = result.filter(s => s.day === selectedDay);
    }

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      result = result.filter(s =>
        s.substituteTeacherName.toLowerCase().includes(q) ||
        s.originalTeacherName.toLowerCase().includes(q) ||
        s.className.toLowerCase().includes(q) ||
        s.subjectName.toLowerCase().includes(q) ||
        (s.comment && s.comment.toLowerCase().includes(q)) ||
        (s.reason && s.reason.toLowerCase().includes(q))
      );
    }

    return result;
  }, [substitutions, filterType, selectedDay, searchTerm]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const buffer = evt.target?.result as ArrayBuffer;
        const wb = XLSX.read(buffer, { type: 'array' });
        const sheetName = wb.SheetNames.find(n => n.toLowerCase().includes('helyettes')) || wb.SheetNames[0];
        const sheet = wb.Sheets[sheetName];
        const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

        if (rows.length < 2) {
          alert('A feltöltött fájl üres vagy nem tartalmaz megfelelő adatokat.');
          return;
        }

        const parsed = parseKretaSubstitutionExport(
          rows,
          currentState?.teachers || [],
          currentState?.classes || [],
          currentState?.subjects || []
        );

        if (parsed.length === 0) {
          alert('Nem sikerült helyettesítést kinyerni a fájlból. Győződj meg róla, hogy a Kréta "Helyettesítések listája" exportját választottad!');
          return;
        }

        loadSubstitutionsOnly(parsed);
        alert(`✅ Sikeresen betöltve ${parsed.length} helyettesítési idősáv!`);
      } catch (err) {
        console.error('Hiba a helyettesítési fájl beolvasásakor:', err);
        alert('Hiba történt a helyettesítési fájl feldolgozása közben.');
      }
    };
    reader.readAsArrayBuffer(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClearSubstitutions = () => {
    if (window.confirm('Biztosan törölni szeretnéd a betöltött helyettesítéseket?')) {
      setSubstitutions([]);
      try {
        localStorage.removeItem('timetable_substitutions_v1');
      } catch {}
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-gray-800 dark:to-gray-850">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <span className="text-2xl">🔄</span>
              Kréta Helyettesítések Áttekintése
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              A Kréta „Helyettesítések listája export” alapján felismert tartós és eseti helyettesítések.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".xlsx,.xls"
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors shadow-sm"
              title="Új vagy frissített helyettesítések Excel importálása"
            >
              <ArrowDownTrayIcon className="w-4 h-4" />
              Új fájl betöltése
            </button>

            {substitutions && substitutions.length > 0 && (
              <button
                onClick={handleClearSubstitutions}
                className="px-3 py-2 bg-red-100 dark:bg-red-900/40 hover:bg-red-200 dark:hover:bg-red-900/60 text-red-700 dark:text-red-300 text-xs font-semibold rounded-lg flex items-center gap-1 transition-colors"
                title="Helyettesítések törlése"
              >
                <TrashIcon className="w-4 h-4" />
                Törlés
              </button>
            )}

            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ml-2"
            >
              ✕
            </button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700 grid grid-cols-2 sm:grid-cols-4 gap-4 bg-gray-50/50 dark:bg-gray-800/50">
          <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
            <div className="text-xs text-gray-500 dark:text-gray-400 font-medium">Helyettesítési idősáv</div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
              {stats.totalSlots}
            </div>
            <div className="text-[11px] text-gray-400 mt-0.5">összesen {stats.totalOccurrences} alkalmat fed le</div>
          </div>

          <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-amber-200 dark:border-amber-900/40 shadow-sm">
            <div className="text-xs text-amber-600 dark:text-amber-400 font-medium">📅 Tartós helyettesítés</div>
            <div className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">
              {stats.longTermSlots}
            </div>
            <div className="text-[11px] text-gray-400 mt-0.5">több héten át heti rendszerességgel</div>
          </div>

          <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-blue-200 dark:border-blue-900/40 shadow-sm">
            <div className="text-xs text-blue-600 dark:text-blue-400 font-medium">👤 Helyettesítő pedagógus</div>
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">
              {stats.substituteCount}
            </div>
            <div className="text-[11px] text-gray-400 mt-0.5">kolléga tart órákat</div>
          </div>

          <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-rose-200 dark:border-rose-900/40 shadow-sm">
            <div className="text-xs text-rose-600 dark:text-rose-400 font-medium">⚠️ Helyettesített pedagógus</div>
            <div className="text-2xl font-bold text-rose-600 dark:text-rose-400 mt-1">
              {stats.originalCount}
            </div>
            <div className="text-[11px] text-gray-400 mt-0.5">kolléga hiányzik</div>
          </div>
        </div>

        {/* Filters and Search */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-gray-300 dark:border-gray-600 p-0.5 bg-gray-50 dark:bg-gray-900 text-xs">
              <button
                onClick={() => setFilterType('all')}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                  filterType === 'all'
                    ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm font-semibold'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
                }`}
              >
                Minden ({substitutions?.length || 0})
              </button>
              <button
                onClick={() => setFilterType('longTerm')}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                  filterType === 'longTerm'
                    ? 'bg-amber-100 dark:bg-amber-900/50 text-amber-900 dark:text-amber-200 font-semibold'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
                }`}
              >
                Csak tartós ({stats.longTermSlots})
              </button>
              <button
                onClick={() => setFilterType('oneOff')}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                  filterType === 'oneOff'
                    ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm font-semibold'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
                }`}
              >
                Eseti ({stats.totalSlots - stats.longTermSlots})
              </button>
              <button
                onClick={() => setFilterType('osszevonas')}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                  filterType === 'osszevonas'
                    ? 'bg-purple-100 dark:bg-purple-900/50 text-purple-900 dark:text-purple-200 font-semibold'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
                }`}
              >
                Óraösszevonások
              </button>
            </div>

            <select
              value={selectedDay}
              onChange={(e) => setSelectedDay(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              className="px-3 py-1.5 text-xs bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 focus:ring-1 focus:ring-amber-500"
            >
              <option value="all">Minden nap</option>
              {DAYS_OF_WEEK.map((dayName, idx) => (
                <option key={idx} value={idx}>{dayName}</option>
              ))}
            </select>
          </div>

          <div className="relative w-full sm:w-64">
            <input
              type="text"
              placeholder="Keresés tanárra, osztályra, tárgyra..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-1.5 text-xs bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1.5 text-xs text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Table Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {filteredSubstitutions.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              <span className="text-4xl block mb-2">📋</span>
              <p className="font-semibold">Nincs a szűrésnek megfelelő helyettesítés.</p>
              <p className="text-xs mt-1">Tölts be egy „helyettesiteseklistajaexport.xlsx” fájlt, vagy módosítsd a keresési feltételeket.</p>
            </div>
          ) : (
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 font-semibold bg-gray-50 dark:bg-gray-850">
                  <th className="p-3">Időpont</th>
                  <th className="p-3">Típus</th>
                  <th className="p-3">Helyettesítő Pedagógus</th>
                  <th className="p-3">Helyettesített Pedagógus</th>
                  <th className="p-3">Osztály / Csoport</th>
                  <th className="p-3">Tantárgy</th>
                  <th className="p-3 text-center">Gyakoriság</th>
                  <th className="p-3">Érintett Időszak</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {filteredSubstitutions.map((sub) => (
                  <tr
                    key={sub.id}
                    className="hover:bg-amber-50/50 dark:hover:bg-amber-950/20 transition-colors"
                  >
                    <td className="p-3 font-semibold text-gray-800 dark:text-gray-200 whitespace-nowrap">
                      {DAYS_OF_WEEK[sub.day]} {sub.period + 1}. óra
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        sub.substitutionType === 'Óraösszevonás'
                          ? 'bg-purple-100 dark:bg-purple-900/50 text-purple-800 dark:text-purple-300'
                          : 'bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300'
                      }`}>
                        {sub.substitutionType}
                      </span>
                    </td>
                    <td className="p-3 font-medium text-blue-700 dark:text-blue-300">
                      {sub.substituteTeacherName}
                    </td>
                    <td className="p-3 text-rose-700 dark:text-rose-300 font-medium">
                      {sub.originalTeacherName}
                    </td>
                    <td className="p-3 font-semibold text-gray-900 dark:text-white">
                      {sub.className}
                    </td>
                    <td className="p-3 text-gray-700 dark:text-gray-300">
                      {sub.subjectName}
                    </td>
                    <td className="p-3 text-center">
                      <span className={`px-2 py-0.5 rounded font-bold text-[11px] ${
                        sub.isLongTerm
                          ? 'bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-100'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                      }`}>
                        {sub.occurrences}x {sub.isLongTerm ? '📅 Tartós' : 'Eseti'}
                      </span>
                    </td>
                    <td className="p-3 text-gray-500 dark:text-gray-400 font-mono text-[11px] whitespace-nowrap">
                      {sub.dateRange}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-800/80">
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {filteredSubstitutions.length} helyettesítési idősáv megjelenítve (összesen {substitutions?.length || 0})
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-semibold text-xs rounded-lg transition-colors"
          >
            Bezárás
          </button>
        </div>

      </div>
    </div>
  );
};
