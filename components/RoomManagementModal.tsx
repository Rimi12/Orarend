import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { useTimetable } from '../contexts/TimetableContext.tsx';
import { TrashIcon } from './icons/TrashIcon.tsx';
import { PlusIcon } from './icons/PlusIcon.tsx';
import { DocumentArrowUpIcon } from './icons/DocumentArrowUpIcon.tsx';
import { ArrowPathIcon } from './icons/ArrowPathIcon.tsx';

interface RoomManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const RoomManagementModal: React.FC<RoomManagementModalProps> = ({ isOpen, onClose }) => {
  const { rooms, addRoom, updateRoom, deleteRoom, resetRoomsToDefault, importRooms } = useTimetable();
  const [searchTerm, setSearchTerm] = useState('');
  const [newRoomName, setNewRoomName] = useState('');
  const [editingRoom, setEditingRoom] = useState<{ oldName: string; newName: string } | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const filteredRooms = rooms.filter(r => r.toLowerCase().includes(searchTerm.toLowerCase()));

  const handleAddRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoomName.trim()) return;
    if (rooms.includes(newRoomName.trim())) {
      alert('Ez a helyiségnév már létezik a listában!');
      return;
    }
    addRoom(newRoomName.trim());
    setNewRoomName('');
  };

  const handleSaveEdit = () => {
    if (!editingRoom) return;
    const trimmed = editingRoom.newName.trim();
    if (!trimmed) return;
    if (trimmed !== editingRoom.oldName && rooms.includes(trimmed)) {
      alert('Ez a helyiségnév már létezik a listában!');
      return;
    }
    updateRoom(editingRoom.oldName, trimmed);
    setEditingRoom(null);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const binaryStr = event.target?.result;
        if (!binaryStr) return;
        const workbook = XLSX.read(binaryStr, { type: 'binary' });
        
        let loadedRooms: string[] = [];

        // Check for 'Helyiség' sheet or first sheet
        const sheetName = workbook.SheetNames.includes('Helyiség') ? 'Helyiség' : workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

        rows.forEach((row, idx) => {
          if (!row || row.length === 0) return;
          const val = String(row[0] || '').trim();
          // Skip header row if it is 'Helyiség' or 'Név' or 'Helyiség neve'
          if (idx === 0 && (val.toLowerCase() === 'helyiség' || val.toLowerCase() === 'név' || val.toLowerCase().includes('helyiség neve'))) {
            return;
          }
          if (val && !loadedRooms.includes(val)) {
            loadedRooms.push(val);
          }
        });

        if (loadedRooms.length > 0) {
          importRooms(loadedRooms);
          alert(`Sikeresen importálva ${loadedRooms.length} helyiség!`);
        } else {
          alert('Nem sikerült helyiség neveket kiolvasni a fájlból.');
        }
      } catch (err) {
        console.error(err);
        alert('Hiba történt a helyiség export Excel fájl beolvasása közben.');
      } finally {
        e.target.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden border border-gray-200 dark:border-gray-700">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between bg-gray-50 dark:bg-gray-800/80">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🏫</span>
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Kréta Helyiségek Kezelése</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                A Kréta órarend importáláshoz használt érvényes tantermi és foglalkoztatói nevek ({rooms.length} terem)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg text-lg leading-none"
          >
            ✕
          </button>
        </div>

        {/* Toolbar & Add New Room */}
        <div className="p-6 border-b border-gray-100 dark:border-gray-700 space-y-4">
          <form onSubmit={handleAddRoom} className="flex gap-2">
            <input
              type="text"
              value={newRoomName}
              onChange={e => setNewRoomName(e.target.value)}
              placeholder="Új helyiség neve (pl. 5. osztály, Tornaterem...)"
              className="flex-1 px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            />
            <button
              type="submit"
              disabled={!newRoomName.trim()}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold text-sm rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
            >
              <PlusIcon className="w-4 h-4" />
              <span>Hozzáadás</span>
            </button>
          </form>

          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Keresés a helyiségek között..."
                className="w-full pl-9 pr-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <span className="absolute left-3 top-2.5 text-gray-400 text-sm">🔍</span>
            </div>

            {/* Actions: Import Excel & Reset defaults */}
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
                className="px-3 py-2 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 border border-emerald-300 dark:border-emerald-700 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5"
                title="Termek importálása Excel fájlból (termek_export_2026_08_29.xlsx)"
              >
                <DocumentArrowUpIcon className="w-4 h-4" />
                <span>Excel Import</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirm('Biztosan visszaállítod az alapértelmezett 36 Kréta helyiséget?')) {
                    resetRoomsToDefault();
                  }
                }}
                className="px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5"
                title="Alapértelmezett 36 hivatalos Kréta terem visszaállítása"
              >
                <ArrowPathIcon className="w-4 h-4" />
                <span>Alapértelmezettek</span>
              </button>
            </div>
          </div>
        </div>

        {/* Room List */}
        <div className="p-6 flex-1 overflow-y-auto max-h-[50vh] divide-y divide-gray-100 dark:divide-gray-700">
          {filteredRooms.length === 0 ? (
            <div className="text-center py-8 text-gray-400 dark:text-gray-500 text-sm">
              Nincs találat a keresésre.
            </div>
          ) : (
            filteredRooms.map((room, idx) => (
              <div
                key={room}
                className="py-2.5 flex items-center justify-between gap-4 group hover:bg-gray-50 dark:hover:bg-gray-750 px-2 rounded-lg transition-colors"
              >
                {editingRoom?.oldName === room ? (
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      type="text"
                      value={editingRoom.newName}
                      onChange={e => setEditingRoom({ ...editingRoom, newName: e.target.value })}
                      className="flex-1 px-3 py-1.5 border border-blue-500 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      autoFocus
                    />
                    <button
                      onClick={handleSaveEdit}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg"
                    >
                      Mentés
                    </button>
                    <button
                      onClick={() => setEditingRoom(null)}
                      className="px-3 py-1.5 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 text-xs rounded-lg"
                    >
                      Mégse
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-mono text-gray-400 w-6 text-right">{idx + 1}.</span>
                      <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{room}</span>
                    </div>
                    <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => setEditingRoom({ oldName: room, newName: room })}
                        className="px-2 py-1 text-xs text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded"
                        title="Helyiség átnevezése"
                      >
                        Átnevezés
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Biztosan törölni szeretnéd ezt a helyiséget: "${room}"?`)) {
                            deleteRoom(room);
                          }
                        }}
                        className="p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400 rounded"
                        title="Helyiség törlése"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800/80 border-t border-gray-200 dark:border-gray-700 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-lg transition-colors shadow-sm"
          >
            Kész
          </button>
        </div>
      </div>
    </div>
  );
};
