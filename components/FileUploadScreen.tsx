import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import type { ParsedData, KretaCombinedImportResult } from '../types.ts';
import { FolderOpenIcon } from './icons/FolderOpenIcon.tsx';
import { DocumentArrowUpIcon } from './icons/DocumentArrowUpIcon.tsx';
import { GoogleIcon } from './icons/GoogleIcon.tsx';
import { SpinnerIcon } from './icons/SpinnerIcon.tsx';
import { ArrowDownTrayIcon } from './icons/ArrowDownTrayIcon.tsx';
import { parseTimetableFile, parseKretaCombinedExports } from '../utils.ts';

// Explicit type definition for the googleDrive prop
type GoogleDriveProp = {
  isConfigured: boolean;
  isReady: boolean;
  isLoggedIn: boolean;
  signIn: () => void;
  isAuthenticating: boolean;
  authError: string | null;
  loadFile: () => Promise<string>;
};

interface FileUploadScreenProps {
  onDataLoaded: (data: ParsedData) => void;
  onLoadFromStorage: () => void;
  onLoadFromSaveFile: (jsonString: string) => void;
  googleDrive: GoogleDriveProp;
  onLoadFromDrive: () => void;
  onCombinedKretaLoaded?: (result: KretaCombinedImportResult) => void;
}

export const FileUploadScreen: React.FC<FileUploadScreenProps> = ({
  onDataLoaded,
  onLoadFromStorage,
  onLoadFromSaveFile,
  googleDrive,
  onLoadFromDrive,
  onCombinedKretaLoaded
}) => {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [saveExists, setSaveExists] = useState(false);

  // Dedicated Kréta Import State
  const [orarendFile, setOrarendFile] = useState<File | null>(null);
  const [ttfFile, setTtfFile] = useState<File | null>(null);
  const [subFile, setSubFile] = useState<File | null>(null);

  const orarendInputRef = useRef<HTMLInputElement>(null);
  const ttfInputRef = useRef<HTMLInputElement>(null);
  const subInputRef = useRef<HTMLInputElement>(null);
  const singleFileInputRef = useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    const handleUpdate = () => {
      setSaveExists(!!localStorage.getItem('timetableAppStateV1'));
    };
    window.addEventListener('storage', handleUpdate);
    handleUpdate(); // Initial check
    return () => window.removeEventListener('storage', handleUpdate);
  }, []);

  // Handle Dual/Triple Kréta Files Submission
  const handleDualKretaSubmit = async () => {
    if (!orarendFile) {
      setError("Kérjük, válassza ki a Kréta Órarend Export (.xlsx) fájlt!");
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
        throw new Error("A Kréta Órarend fájl üres vagy hibás formátumú.");
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
      if (subFile) {
        const subBuffer = await subFile.arrayBuffer();
        const wbSub = XLSX.read(subBuffer, { type: 'array' });
        const sheetNameS = wbSub.SheetNames.find(n => n.toLowerCase().includes('helyettes')) || wbSub.SheetNames[0];
        const sheetSub = wbSub.Sheets[sheetNameS];
        subRows = XLSX.utils.sheet_to_json(sheetSub, { header: 1 });
      }

      // 4. Combined Parsing
      const result = parseKretaCombinedExports(orarendRows, ttfRows, subRows);

      if (result.stats.totalLessonsPlaced === 0) {
        throw new Error("Nem sikerült elhelyezett tanórákat beolvasni az Órarend fájlból. Ellenőrizze a fejlécet és a sorokat.");
      }

      if (onCombinedKretaLoaded) {
        onCombinedKretaLoaded(result);
      }
    } catch (err: any) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Hiba történt a Kréta fájlok feldolgozása közben.');
      setIsLoading(false);
    }
  };

  // Smart single file handler (handles both Kréta Órarend and TTF)
  const handleSingleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setError(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const binaryStr = event.target?.result;
        if (!binaryStr) {
          throw new Error("A fájl olvasása sikertelen.");
        }
        const workbook = XLSX.read(binaryStr, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        if (jsonData.length < 2) {
          throw new Error("A fájl üres vagy nem megfelelő formátumú. Legalább 2 sornak kell lennie.");
        }

        // Detect if this is a Kréta Órarend Export
        const headerStr = (jsonData[0] || []).join(' ').toLowerCase();
        const isKretaOrarend = headerStr.includes('hetirend') || (headerStr.includes('nap') && headerStr.includes('óra'));

        if (isKretaOrarend) {
          const combinedResult = parseKretaCombinedExports(jsonData);
          if (combinedResult.stats.totalLessonsPlaced === 0) {
            throw new Error("Nem sikerült tanórákat beolvasni a Kréta órarendből.");
          }
          if (onCombinedKretaLoaded) {
            onCombinedKretaLoaded(combinedResult);
            return;
          }
        }

        // Otherwise process as standard Cross-table TTF
        const parsedData = parseTimetableFile(jsonData);

        if (parsedData.teachers.length === 0 || parsedData.allocations.length === 0) {
          throw new Error("Nem sikerült tanárokat vagy órafelosztásokat beolvasni. Ellenőrizze a fájl formátumát.");
        }

        onDataLoaded(parsedData);
      } catch (err) {
        console.error(err);
        setError(err instanceof Error ? err.message : 'Ismeretlen hiba történt a fájl feldolgozása közben.');
        setIsLoading(false);
      }
    };
    reader.onerror = () => {
      setError("Hiba történt a fájl olvasása közben.");
      setIsLoading(false);
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  const handleSaveFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setError(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const jsonString = event.target?.result as string;
        if (!jsonString) {
          throw new Error("A fájl olvasása sikertelen.");
        }
        onLoadFromSaveFile(jsonString);
      } catch (err) {
        console.error(err);
        setError(err instanceof Error ? err.message : 'Ismeretlen hiba történt a mentési fájl feldolgozása közben.');
        setIsLoading(false);
      }
    };
    reader.onerror = () => {
      setError("Hiba történt a mentési fájl olvasása közben.");
      setIsLoading(false);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center bg-gray-100 dark:bg-gray-900 p-4 sm:p-6 lg:p-8">
      <div className="text-center p-6 sm:p-8 max-w-3xl w-full bg-white dark:bg-gray-800 rounded-3xl shadow-2xl border border-gray-200 dark:border-gray-700">
        
        {/* Header */}
        <div className="mb-6">
          <div className="inline-flex items-center justify-center p-3 bg-blue-50 dark:bg-blue-950/50 rounded-2xl mb-3">
            <span className="text-4xl">🗓️</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 dark:text-white tracking-tight">
            Órarendkészítő Kézzel <span className="text-blue-600 text-lg sm:text-xl font-bold">v3.1.0</span>
          </h1>
          <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 mt-1">
            Töltsön be kész Kréta exportokat, vagy folytassa korábbi munkáját.
          </p>
        </div>

        {/* Error message */}
        {(error || googleDrive.authError) && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 rounded-2xl text-xs text-left" role="alert">
            <p className="font-bold flex items-center gap-1.5 mb-1">
              <span>⚠️</span>
              <span>Hiba történt:</span>
            </p>
            {error && <p>{error}</p>}
            {googleDrive.authError && <p>{googleDrive.authError}</p>}
          </div>
        )}

        {/* ── Kiemelt blokk: Kréta Órarend & TTF Betöltése ── */}
        <div className="mb-6 p-5 bg-gradient-to-br from-blue-50/80 to-indigo-50/80 dark:from-blue-950/30 dark:to-indigo-950/30 border border-blue-200 dark:border-blue-800/60 rounded-2xl text-left shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-xl">📥</span>
              <h2 className="text-base font-bold text-gray-900 dark:text-white">
                Kréta Exportok Közvetlen Betöltése
              </h2>
            </div>
            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 bg-blue-600 text-white rounded-md">
              Új funkció
            </span>
          </div>
          <p className="text-xs text-gray-600 dark:text-gray-400 mb-4">
            Válassza ki a Krétából letöltött órarendet (<code className="font-mono bg-white dark:bg-gray-800 px-1 py-0.5 rounded text-[11px]">OrarendExport.xlsx</code>) a tanórák és termek azonnali megjelenítéséhez. Opcionálisan adja meg a tantárgyfelosztást is az órakeretek ellenőrzéséhez!
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            {/* File 1: Órarend */}
            <div className="p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
                  <span>🗓️</span> 1. Órarend Export (.xlsx)
                </span>
                <span className="text-[10px] font-bold text-blue-600 bg-blue-50 dark:bg-blue-950/50 px-1.5 py-0.5 rounded">
                  Kötelező
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <input
                  type="file"
                  ref={orarendInputRef}
                  className="sr-only"
                  accept=".xlsx, .xls"
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) setOrarendFile(f);
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  onClick={() => orarendInputRef.current?.click()}
                  className={`flex-1 py-2 px-3 text-xs font-bold rounded-lg border transition-all truncate text-left ${
                    orarendFile
                      ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700'
                      : 'bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-100'
                  }`}
                  title={orarendFile ? orarendFile.name : 'Válasszon órarend fájlt'}
                >
                  {orarendFile ? `✓ ${orarendFile.name}` : '📁 Válasszon fájlt...'}
                </button>
                {orarendFile && (
                  <button
                    type="button"
                    onClick={() => setOrarendFile(null)}
                    className="text-xs text-red-500 hover:text-red-700 font-bold px-1"
                    title="Eltávolítás"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* File 2: TTF */}
            <div className="p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
                  <span>📚</span> 2. Tantárgyfelosztás (.xlsx)
                </span>
                <span className="text-[10px] font-bold text-gray-500 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
                  Opcionális
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <input
                  type="file"
                  ref={ttfInputRef}
                  className="sr-only"
                  accept=".xlsx, .xls"
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) setTtfFile(f);
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  onClick={() => ttfInputRef.current?.click()}
                  className={`flex-1 py-2 px-3 text-xs font-bold rounded-lg border transition-all truncate text-left ${
                    ttfFile
                      ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-700'
                      : 'bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-100'
                  }`}
                  title={ttfFile ? ttfFile.name : 'Válasszon TTF fájlt (opcionális)'}
                >
                  {ttfFile ? `✓ ${ttfFile.name}` : '📁 Válasszon TTF-et...'}
                </button>
                {ttfFile && (
                  <button
                    type="button"
                    onClick={() => setTtfFile(null)}
                    className="text-xs text-red-500 hover:text-red-700 font-bold px-1"
                    title="Eltávolítás"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* File 3: Helyettesítések */}
            <div className="p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
                  <span>🔄</span> 3. Helyettesítések (.xlsx)
                </span>
                <span className="text-[10px] font-bold text-amber-600 bg-amber-50 dark:bg-amber-950/50 px-1.5 py-0.5 rounded">
                  Opcionális
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <input
                  type="file"
                  ref={subInputRef}
                  className="sr-only"
                  accept=".xlsx, .xls"
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) setSubFile(f);
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  onClick={() => subInputRef.current?.click()}
                  className={`flex-1 py-2 px-3 text-xs font-bold rounded-lg border transition-all truncate text-left ${
                    subFile
                      ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700'
                      : 'bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-100'
                  }`}
                  title={subFile ? subFile.name : 'Válasszon Helyettesítés export fájlt (opcionális)'}
                >
                  {subFile ? `✓ ${subFile.name}` : '📁 Válasszon fájlt...'}
                </button>
                {subFile && (
                  <button
                    type="button"
                    onClick={() => setSubFile(null)}
                    className="text-xs text-red-500 hover:text-red-700 font-bold px-1"
                    title="Eltávolítás"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleDualKretaSubmit}
            disabled={!orarendFile || isLoading}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-bold text-sm rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <SpinnerIcon className="w-5 h-5 animate-spin" />
                <span>Kréta exportok feldolgozása...</span>
              </>
            ) : (
              <>
                <ArrowDownTrayIcon className="w-5 h-5" />
                <span>Kréta Exportok Betöltése és Megjelenítése</span>
              </>
            )}
          </button>
        </div>

        {/* ── Egyéb betöltési lehetőségek ── */}
        <div className="pt-2 border-t border-gray-200 dark:border-gray-700 text-left mb-6">
          <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
            Egyéb betöltési lehetőségek:
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Új órarend / TTF egyetlen fájlból */}
            <input
              id="file-upload"
              ref={singleFileInputRef}
              type="file"
              className="sr-only"
              onChange={handleSingleFileChange}
              accept=".xlsx, .xls"
              disabled={isLoading}
            />
            <button
              type="button"
              onClick={() => singleFileInputRef.current?.click()}
              disabled={isLoading}
              className="flex items-center justify-center px-4 py-3 bg-gray-800 dark:bg-gray-700 hover:bg-gray-900 dark:hover:bg-gray-600 text-white font-bold text-sm rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              <DocumentArrowUpIcon className="h-5 w-5 mr-2" />
              <span>Egyéni .xlsx Fájl Betöltése</span>
            </button>

            {/* Betöltés mentett JSON fájlból */}
            <label
              htmlFor="save-file-upload"
              className={`flex items-center justify-center px-4 py-3 bg-indigo-600 text-white font-bold text-sm rounded-xl shadow-xs hover:bg-indigo-700 transition-colors cursor-pointer ${
                isLoading ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              <DocumentArrowUpIcon className="h-5 w-5 mr-2" />
              <span>Betöltés Fájlból (.json)</span>
              <input
                id="save-file-upload"
                name="save-file-upload"
                type="file"
                className="sr-only"
                onChange={handleSaveFileChange}
                accept=".json"
                disabled={isLoading}
              />
            </label>

            {/* Betöltés localStorage-ból */}
            {saveExists && (
              <button
                onClick={onLoadFromStorage}
                disabled={isLoading}
                className="flex items-center justify-center px-4 py-3 bg-emerald-600 text-white font-bold text-sm rounded-xl shadow-xs hover:bg-emerald-700 transition-colors cursor-pointer"
              >
                <FolderOpenIcon className="h-5 w-5 mr-2" />
                <span>Betöltés Böngészőből</span>
              </button>
            )}

            {/* Google Drive */}
            {googleDrive.isConfigured && googleDrive.isReady && (
              <>
                {googleDrive.isLoggedIn ? (
                  <button
                    onClick={onLoadFromDrive}
                    disabled={isLoading || googleDrive.isAuthenticating}
                    className="flex items-center justify-center px-4 py-3 bg-teal-600 text-white font-bold text-sm rounded-xl shadow-xs hover:bg-teal-700 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <GoogleIcon className="h-5 w-5 mr-2" />
                    <span>Betöltés Drive-ról</span>
                  </button>
                ) : (
                  <button
                    onClick={googleDrive.signIn}
                    disabled={isLoading || googleDrive.isAuthenticating}
                    className="flex items-center justify-center px-4 py-3 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 font-bold text-sm rounded-xl shadow-xs hover:bg-gray-50 transition-colors disabled:opacity-50"
                  >
                    {googleDrive.isAuthenticating ? (
                      <>
                        <SpinnerIcon className="h-5 w-5 mr-2" />
                        <span>Bejelentkezés...</span>
                      </>
                    ) : (
                      <>
                        <GoogleIcon className="h-5 w-5 mr-2" />
                        <span>Google Bejelentkezés</span>
                      </>
                    )}
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Footer info */}
        <div className="text-left text-xs text-gray-500 dark:text-gray-400 space-y-1.5 pt-3 border-t border-gray-200 dark:border-gray-700">
          <p className="font-semibold text-gray-700 dark:text-gray-300">
            Támogatott formátumok:
          </p>
          <ul className="list-disc list-inside pl-1 space-y-0.5">
            <li><strong>Kréta Órarend Export (.xlsx):</strong> Hivatalos soros órarend (Hetirend, Nap, Óra, Osztály, Csoport, Tantárgy, Tanár, Helyiség).</li>
            <li><strong>Kréta Tantárgyfelosztás (.xlsx):</strong> Kereszttáblás tantárgyfelosztási import/export minta.</li>
            <li><strong>Mentett állapot (.json):</strong> Az órarendkészítőből korábban lementett teljes állapot.</li>
          </ul>
        </div>
      </div>
    </div>
  );
};
