import React, { useState, useEffect } from 'react';
import { getActiveRoomCode, setActiveRoomCode, saveToCloudDoc, CLIENT_ID } from '../services/firebaseSync.ts';

interface CloudSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  syncStatus: 'connected' | 'syncing' | 'offline' | 'error';
  lastSyncedAt: Date | null;
  onRoomCodeChanged: (newCode: string) => void;
  onPushLocalToCloud: () => void;
  onPullCloudToLocal: () => void;
}

export const CloudSyncModal: React.FC<CloudSyncModalProps> = ({
  isOpen,
  onClose,
  syncStatus,
  lastSyncedAt,
  onRoomCodeChanged,
  onPushLocalToCloud,
  onPullCloudToLocal,
}) => {
  const [roomCode, setRoomCodeInput] = useState(getActiveRoomCode());
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setRoomCodeInput(getActiveRoomCode());
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSaveRoom = (e: React.FormEvent) => {
    e.preventDefault();
    const updated = setActiveRoomCode(roomCode);
    setRoomCodeInput(updated);
    onRoomCodeChanged(updated);
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in">
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">☁️</span>
            <div>
              <h2 className="font-bold text-lg leading-snug">Élő Felhő Szinkronizáció</h2>
              <p className="text-xs text-blue-100">Közös valós idejű órarendszerkesztés több gépről</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 text-white font-bold flex items-center justify-center transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6 text-gray-800 dark:text-gray-200">
          {/* Current Status */}
          <div className="flex items-center justify-between p-3.5 bg-gray-50 dark:bg-gray-800/60 rounded-xl border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3">
              <span className="relative flex h-3.5 w-3.5">
                {syncStatus === 'connected' && (
                  <>
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500"></span>
                  </>
                )}
                {syncStatus === 'syncing' && (
                  <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-amber-500 animate-pulse"></span>
                )}
                {(syncStatus === 'offline' || syncStatus === 'error') && (
                  <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-red-500"></span>
                )}
              </span>
              <div>
                <div className="text-sm font-semibold">
                  {syncStatus === 'connected' && 'Élő felhős kapcsolat aktív'}
                  {syncStatus === 'syncing' && 'Szinkronizálás folyamatban...'}
                  {syncStatus === 'offline' && 'Helyi mód (Nincs élő kapcsolat)'}
                  {syncStatus === 'error' && 'Hiba a felhős kapcsolódáskor'}
                </div>
                {lastSyncedAt && (
                  <div className="text-[11px] text-gray-500 dark:text-gray-400">
                    Utolsó szinkronizáció: {lastSyncedAt.toLocaleTimeString('hu-HU')}
                  </div>
                )}
              </div>
            </div>

            <span className="text-xs px-2.5 py-1 rounded-full font-mono bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200">
              {CLIENT_ID}
            </span>
          </div>

          {/* Room Code Selector */}
          <form onSubmit={handleSaveRoom} className="space-y-2">
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
              Közös Szoba Kód (Projekt azonosító)
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Adjatok meg ugyanazt a kódnevet a kollégáddal a két külön gépen, hogy ugyanazt az órarendet lássátok!
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={roomCode}
                onChange={(e) => setRoomCodeInput(e.target.value)}
                className="flex-1 font-mono text-sm px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                placeholder="Pl: zoldmezo-2025-2026"
              />
              <button
                type="submit"
                className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl text-sm transition-colors shadow-xs"
              >
                Csatlakozás
              </button>
            </div>
          </form>

          {/* Copy Button */}
          <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-950/40 rounded-xl border border-blue-200 dark:border-blue-800/60 text-xs">
            <span className="text-blue-900 dark:text-blue-200 font-medium">
              Aktív szoba kódod: <strong className="font-mono text-blue-700 dark:text-blue-300">{getActiveRoomCode()}</strong>
            </span>
            <button
              onClick={handleCopyCode}
              className="px-3 py-1.5 bg-white dark:bg-blue-900 hover:bg-blue-100 text-blue-700 dark:text-blue-200 rounded-lg border border-blue-300 dark:border-blue-700 font-semibold transition-colors flex items-center gap-1.5"
            >
              {copied ? '✓ Másolva!' : '📋 Kód másolása'}
            </button>
          </div>

          {/* Manual Push / Pull Options */}
          <div className="pt-2 border-t border-gray-200 dark:border-gray-800 space-y-2">
            <span className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
              Kézi kényszerített szinkronizálás
            </span>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={onPushLocalToCloud}
                className="p-3 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 text-xs font-medium rounded-xl border border-gray-300 dark:border-gray-700 transition-colors flex flex-col items-center gap-1"
              >
                <span className="text-base">⬆️</span>
                <span>Helyi feltöltése felhőbe</span>
              </button>
              <button
                onClick={onPullCloudToLocal}
                className="p-3 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 text-xs font-medium rounded-xl border border-gray-300 dark:border-gray-700 transition-colors flex flex-col items-center gap-1"
              >
                <span className="text-base">⬇️</span>
                <span>Felhős adat letöltése</span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-gray-50 dark:bg-gray-800/40 border-t border-gray-200 dark:border-gray-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 rounded-xl text-sm font-semibold transition-colors"
          >
            Bezárás
          </button>
        </div>
      </div>
    </div>
  );
};
