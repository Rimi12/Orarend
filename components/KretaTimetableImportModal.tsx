import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import type { KretaCombinedImportResult } from '../types.ts';
import { parseKretaCombinedExports } from '../utils.ts';
import { DocumentArrowUpIcon } from './icons/DocumentArrowUpIcon.tsx';
import { FolderOpenIcon } from './icons/FolderOpenIcon.tsx';
import { SpinnerIcon } from './icons/SpinnerIcon.tsx';
import { ArrowDownTrayIcon } from './icons/ArrowDownTrayIcon.tsx';

interface KretaTimetableImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportConfirmed: (result: KretaCombinedImportResult) => void;
}

export const KretaTimetableImportModal: React.FC<KretaTimetableImportModalProps> = ({
  isOpen,
  onClose,
  onImportConfirmed
}) => {
  const [orarendFile, setOrarendFile] = useState<File | null>(null);
  const [ttfFile, setTtfFile] = useState<File | null>(null);
  const [substitutionFile, setSubstitutionFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsedPreview, setParsedPreview] = useState<KretaCombinedImportResult | null>(null);

  const orarendInputRef = useRef<HTMLInputElement>(null);
  const ttfInputRef = useRef<HTMLInputElement>(null);
  const substitutionInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleProcessFiles = async () => {
    if (!orarendFile) {
      setError("Kérjük, válassza ki a Krétából letöltött Órarend export fájlt (.xlsx)!");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // 1. Read Órarend File
      const orarendBuffer = await orarendFile.arrayBuffer();
      const wbOrarend = XLSX.read(orarendBuffer, { type: 'array' });
      const sheetNameO = wbOrarend.Sheets['Órarend'] ? 'Órarend' : wbOrarend.SheetNames[0];
      const sheetOrarend = wbOrarend.Sheets[sheetNameO];
      const orarendRows: any[][] = XLSX.utils.sheet_to_json(sheetOrarend, { header: 1 });

      if (!orarendRows || orarendRows.length < 2) {
        throw new Error("A Kréta Órarend fájl üres vagy nem tartalmaz megfelelő sorokat.");
      }

      // 2. Read TTF File if provided
      let ttfRows: any[][] | undefined = undefined;
      if (ttfFile) {
        const ttfBuffer = await ttfFile.arrayBuffer();
        const wbTtf = XLSX.read(ttfBuffer, { type: 'array' });
        const sheetNameT = wbTtf.Sheets['TTF_Kereszttablas_Import_Minta']
          ? 'TTF_Kereszttablas_Import_Minta'
          : wbTtf.SheetNames[0];
        const sheetTtf = wbTtf.Sheets[sheetNameT];
        ttfRows = XLSX.utils.sheet_to_json(sheetTtf, { header: 1 });
      }

      // 3. Read Substitutions File if provided
      let subRows: any[][] | undefined = undefined;
      if (substitutionFile) {
        const subBuffer = await substitutionFile.arrayBuffer();
        const wbSub = XLSX.read(subBuffer, { type: 'array' });
        const sheetNameS = wbSub.SheetNames.find(n => n.toLowerCase().includes('helyettes')) || wbSub.SheetNames[0];
        const sheetSub = wbSub.Sheets[sheetNameS];
        subRows = XLSX.utils.sheet_to_json(sheetSub, { header: 1 });
      }

      // 4. Parse and Combine
      const result = parseKretaCombinedExports(orarendRows, ttfRows, subRows);

      if (result.stats.totalLessonsPlaced === 0) {
        throw new Error("Nem sikerült elhelyezett tanórákat beolvasni az Órarend exportból. Kérjük, ellenőrizze a fájl oszlopait (Nap, Óra, Tanár, Tantárgy).");
      }

      setParsedPreview(result);
    } catch (err: any) {
      console.error("Kréta importálási hiba:", err);
      setError(err?.message || "Hiba történt a Kréta fájlok feldolgozása közben.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleApplyImport = () => {
    if (!parsedPreview) return;
    onImportConfirmed(parsedPreview);
    onClose();
  };

  const handleReset = () => {
    setOrarendFile(null);
    setTtfFile(null);
    setSubstitutionFile(null);
    setParsedPreview(null);
    setError(null);
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex justify-center items-center z-50 p-3 sm:p-6" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-850 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-3xl">📥</span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">
                  Kréta Órarend és Tantárgyfelosztás Betöltése
                </h2>
                <span className="px-2 py-0.5 text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300 rounded-md">
                  Kréta Export
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Töltse be a Krétából exportált heti órarendet, termekkel együtt. Opcionálisan adja meg a tantárgyfelosztást is az ellenőrzéshez!
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg text-lg"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="p-4 bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-800 rounded-xl text-red-700 dark:text-red-300 text-xs flex items-start gap-2.5">
              <span className="text-base">⚠️</span>
              <div>
                <div className="font-bold">Hiba a feldolgozás során</div>
                <div>{error}</div>
              </div>
            </div>
          )}

          {!parsedPreview ? (
            <div className="space-y-5">
              {/* File 1: Órarend Export */}
              <div className="p-4 border-2 border-dashed border-blue-300 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-950/20 rounded-2xl">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">🗓️</span>
                    <div>
                      <div className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-2">
                        <span>1. Kréta Órarend Export (.xlsx)</span>
                        <span className="text-[10px] px-2 py-0.5 bg-blue-600 text-white font-bold rounded-full">
                          Kötelező
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        A Krétából letöltött teljes heti órarend (pl. <code className="bg-white dark:bg-gray-800 px-1 py-0.5 rounded text-[11px]">OrarendExport.xlsx</code>), ami tartalmazza a napokat, órákat és termeket.
                      </p>
                    </div>
                  </div>

                  <div>
                    <input
                      type="file"
                      ref={orarendInputRef}
                      className="sr-only"
                      accept=".xlsx, .xls"
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (file) setOrarendFile(file);
                        e.target.value = '';
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => orarendInputRef.current?.click()}
                      className={`px-4 py-2 text-xs font-bold rounded-xl transition-all shadow-xs flex items-center gap-1.5 ${
                        orarendFile
                          ? 'bg-blue-600 text-white hover:bg-blue-700'
                          : 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 border border-blue-300 dark:border-blue-700 hover:bg-blue-50'
                      }`}
                    >
                      <DocumentArrowUpIcon className="w-4 h-4" />
                      <span>{orarendFile ? 'Fájl cseréje' : 'Fájl kiválasztása'}</span>
                    </button>
                  </div>
                </div>

                {orarendFile && (
                  <div className="mt-3 pt-3 border-t border-blue-200 dark:border-blue-800/60 flex items-center justify-between text-xs text-blue-900 dark:text-blue-200 font-semibold">
                    <div className="flex items-center gap-1.5">
                      <span>✓ Kiválasztva:</span>
                      <span className="font-mono bg-white dark:bg-gray-800 px-2 py-0.5 rounded border border-blue-200 dark:border-blue-700">
                        {orarendFile.name}
                      </span>
                      <span className="text-gray-500 text-[11px]">({(orarendFile.size / 1024).toFixed(1)} KB)</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setOrarendFile(null)}
                      className="text-red-500 hover:text-red-700 text-xs font-bold"
                    >
                      Eltávolítás
                    </button>
                  </div>
                )}
              </div>

              {/* File 2: Tantárgyfelosztás Export */}
              <div className="p-4 border-2 border-dashed border-indigo-200 dark:border-indigo-800 bg-indigo-50/40 dark:bg-indigo-950/20 rounded-2xl">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">📚</span>
                    <div>
                      <div className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-2">
                        <span>2. Kréta Tantárgyfelosztás (.xlsx)</span>
                        <span className="text-[10px] px-2 py-0.5 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-bold rounded-full">
                          Ajánlott / Opcionális
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        A Kréta kereszttáblás TTF exportja (szerződéses heti óraszámok egyeztetéséhez és a még el nem helyezett órák kimutatásához).
                      </p>
                    </div>
                  </div>

                  <div>
                    <input
                      type="file"
                      ref={ttfInputRef}
                      className="sr-only"
                      accept=".xlsx, .xls"
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (file) setTtfFile(file);
                        e.target.value = '';
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => ttfInputRef.current?.click()}
                      className={`px-4 py-2 text-xs font-bold rounded-xl transition-all shadow-xs flex items-center gap-1.5 ${
                        ttfFile
                          ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                          : 'bg-white dark:bg-gray-800 text-indigo-600 dark:text-indigo-400 border border-indigo-300 dark:border-indigo-700 hover:bg-indigo-50'
                      }`}
                    >
                      <DocumentArrowUpIcon className="w-4 h-4" />
                      <span>{ttfFile ? 'Fájl cseréje' : 'Fájl kiválasztása'}</span>
                    </button>
                  </div>
                </div>

                {ttfFile && (
                  <div className="mt-3 pt-3 border-t border-indigo-200 dark:border-indigo-800/60 flex items-center justify-between text-xs text-indigo-900 dark:text-indigo-200 font-semibold">
                    <div className="flex items-center gap-1.5">
                      <span>✓ Kiválasztva:</span>
                      <span className="font-mono bg-white dark:bg-gray-800 px-2 py-0.5 rounded border border-indigo-200 dark:border-indigo-700">
                        {ttfFile.name}
                      </span>
                      <span className="text-gray-500 text-[11px]">({(ttfFile.size / 1024).toFixed(1)} KB)</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setTtfFile(null)}
                      className="text-red-500 hover:text-red-700 text-xs font-bold"
                    >
                      Eltávolítás
                    </button>
                  </div>
                )}
              </div>

              {/* File 3: Helyettesítések Export */}
              <div className="p-4 border-2 border-dashed border-amber-300 dark:border-amber-700/60 bg-amber-50/40 dark:bg-amber-950/20 rounded-2xl">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">🔄</span>
                    <div>
                      <div className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-2">
                        <span>3. Kréta Helyettesítések Exportja (.xlsx)</span>
                        <span className="text-[10px] px-2 py-0.5 bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300 font-bold rounded-full">
                          Opcionális
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        A Kréta <code className="bg-white dark:bg-gray-800 px-1 py-0.5 rounded text-[11px]">helyettesiteseklistajaexport.xlsx</code> exportja a helyettesítések órarendi megjelenítéséhez. Az alkalmazás automatikusan a végleges (szeptember 7-i héttől érvényes) adatokat dolgozza fel, a kezdeti 1. hét ideiglenes adatait kiszűri.
                      </p>
                    </div>
                  </div>

                  <div>
                    <input
                      type="file"
                      ref={substitutionInputRef}
                      className="sr-only"
                      accept=".xlsx, .xls"
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (file) setSubstitutionFile(file);
                        e.target.value = '';
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => substitutionInputRef.current?.click()}
                      className={`px-4 py-2 text-xs font-bold rounded-xl transition-all shadow-xs flex items-center gap-1.5 ${
                        substitutionFile
                          ? 'bg-amber-600 text-white hover:bg-amber-700'
                          : 'bg-white dark:bg-gray-800 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-700 hover:bg-amber-50'
                      }`}
                    >
                      <DocumentArrowUpIcon className="w-4 h-4" />
                      <span>{substitutionFile ? 'Fájl cseréje' : 'Fájl kiválasztása'}</span>
                    </button>
                  </div>
                </div>

                {substitutionFile && (
                  <div className="mt-3 pt-3 border-t border-amber-200 dark:border-amber-800/60 flex items-center justify-between text-xs text-amber-900 dark:text-amber-200 font-semibold">
                    <div className="flex items-center gap-1.5">
                      <span>✓ Kiválasztva:</span>
                      <span className="font-mono bg-white dark:bg-gray-800 px-2 py-0.5 rounded border border-amber-200 dark:border-amber-700">
                        {substitutionFile.name}
                      </span>
                      <span className="text-gray-500 text-[11px]">({(substitutionFile.size / 1024).toFixed(1)} KB)</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSubstitutionFile(null)}
                      className="text-red-500 hover:text-red-700 text-xs font-bold"
                    >
                      Eltávolítás
                    </button>
                  </div>
                )}
              </div>

              {/* Action Button */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleProcessFiles}
                  disabled={!orarendFile || isLoading}
                  className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 text-white font-bold text-sm rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <>
                      <SpinnerIcon className="w-5 h-5 animate-spin" />
                      <span>Kréta exportok beolvasása és elemzése...</span>
                    </>
                  ) : (
                    <>
                      <ArrowDownTrayIcon className="w-5 h-5" />
                      <span>Fájlok Feldolgozása és Előnézet</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            /* Parsed Preview Stage */
            <div className="space-y-6">
              <div className="p-4 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-300 dark:border-emerald-800 rounded-2xl flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">✅</span>
                  <div>
                    <h3 className="font-bold text-sm text-emerald-900 dark:text-emerald-200">
                      A Kréta adatok sikeresen beolvasva és feldolgozva!
                    </h3>
                    <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-0.5">
                      Az alábbi összegzés szerint a tanórák azonnal megjelennek az órarendi rácson.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleReset}
                  className="text-xs font-semibold text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 underline"
                >
                  Másik fájlok választása
                </button>
              </div>

              {/* Key Stat Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="p-3.5 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl">
                  <div className="text-[11px] font-bold text-blue-700 dark:text-blue-300 uppercase">Elhelyezett Tanórák</div>
                  <div className="text-2xl font-extrabold text-blue-900 dark:text-blue-100 mt-0.5">
                    {parsedPreview.stats.totalLessonsPlaced} óra
                  </div>
                  <div className="text-[10px] text-blue-600 dark:text-blue-400 mt-1">Azonnal a heti rácsban</div>
                </div>

                <div className="p-3.5 bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 rounded-xl">
                  <div className="text-[11px] font-bold text-purple-700 dark:text-purple-300 uppercase">Pedagógusok</div>
                  <div className="text-2xl font-extrabold text-purple-900 dark:text-purple-100 mt-0.5">
                    {parsedPreview.stats.teachersCount} fő
                  </div>
                  <div className="text-[10px] text-purple-600 dark:text-purple-400 mt-1">Órarenddel rendelkező tanárok</div>
                </div>

                <div className="p-3.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl">
                  <div className="text-[11px] font-bold text-amber-700 dark:text-amber-300 uppercase">Osztályok / Csoportok</div>
                  <div className="text-2xl font-extrabold text-amber-900 dark:text-amber-100 mt-0.5">
                    {parsedPreview.stats.classesCount} db
                  </div>
                  <div className="text-[10px] text-amber-600 dark:text-amber-400 mt-1">Normalizált osztályok</div>
                </div>

                <div className="p-3.5 bg-teal-50 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800 rounded-xl">
                  <div className="text-[11px] font-bold text-teal-700 dark:text-teal-300 uppercase">Helyiségek / Termek</div>
                  <div className="text-2xl font-extrabold text-teal-900 dark:text-teal-100 mt-0.5">
                    {parsedPreview.rooms.length} terem
                  </div>
                  <div className="text-[10px] text-teal-600 dark:text-teal-400 mt-1">Tanórákhoz hozzárendelve</div>
                </div>

                {parsedPreview.substitutions && parsedPreview.substitutions.length > 0 && (
                  <div className="p-3.5 bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 rounded-xl">
                    <div className="text-[11px] font-bold text-orange-700 dark:text-orange-300 uppercase">Helyettesítések</div>
                    <div className="text-2xl font-extrabold text-orange-900 dark:text-orange-100 mt-0.5">
                      {parsedPreview.substitutions.length} sáv
                    </div>
                    <div className="text-[10px] text-orange-600 dark:text-orange-400 mt-1">
                      {parsedPreview.substitutions.filter(s => s.isLongTerm).length} tartós helyettesítés
                    </div>
                  </div>
                )}

                <div className="p-3.5 bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 rounded-xl">
                  <div className="text-[11px] font-bold text-indigo-700 dark:text-indigo-300 uppercase">Tantárgyfelosztás</div>
                  <div className="text-2xl font-extrabold text-indigo-900 dark:text-indigo-100 mt-0.5">
                    {parsedPreview.stats.allocationsCount} sor
                  </div>
                  <div className="text-[10px] text-indigo-600 dark:text-indigo-400 mt-1">
                    {parsedPreview.stats.ttfAllocationsCount ? 'TTF-fel szinkronizálva' : 'Órarendből generálva'}
                  </div>
                </div>

                <div className="p-3.5 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 rounded-xl">
                  <div className="text-[11px] font-bold text-rose-700 dark:text-rose-300 uppercase">Fel Nem Vett Órák</div>
                  <div className="text-2xl font-extrabold text-rose-900 dark:text-rose-100 mt-0.5">
                    {parsedPreview.stats.unplacedHoursCount} óra
                  </div>
                  <div className="text-[10px] text-rose-600 dark:text-rose-400 mt-1">
                    {parsedPreview.stats.unplacedHoursCount > 0 ? 'Draggable sávban elérhető' : 'Minden óra elhelyezve!'}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  type="button"
                  onClick={handleReset}
                  className="px-4 py-2 text-xs font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors"
                >
                  Vissza a választáshoz
                </button>
                <button
                  type="button"
                  onClick={handleApplyImport}
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-lg transition-all flex items-center gap-2"
                >
                  <span>✓ Órarend Betöltése és Megjelenítése</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 shrink-0 text-xs text-gray-500 dark:text-gray-400">
          <div>
            Kréta-kompatibilis órarendi struktúra felismerése (<code className="text-[11px] font-mono font-semibold">Hetirend, Nap, Óra, Osztály, Csoport, Tantárgy, Tanár, Helyiség</code>).
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-gray-800 dark:bg-gray-200 hover:bg-gray-900 dark:hover:bg-white text-white dark:text-gray-900 font-bold rounded-xl transition-colors"
          >
            Mégse
          </button>
        </div>
      </div>
    </div>
  );
};
