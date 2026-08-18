import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import type { ParsedData } from '../types.ts';
import { FolderOpenIcon } from './icons/FolderOpenIcon.tsx';
import { DocumentArrowUpIcon } from './icons/DocumentArrowUpIcon.tsx';
import { GoogleIcon } from './icons/GoogleIcon.tsx';
import { SpinnerIcon } from './icons/SpinnerIcon.tsx';
import { parseTimetableFile } from '../utils.ts';

// Explicit type definition for the googleDrive prop
// This avoids needing to export useGoogleDrive's return type
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
}

export const FileUploadScreen: React.FC<FileUploadScreenProps> = ({ onDataLoaded, onLoadFromStorage, onLoadFromSaveFile, googleDrive, onLoadFromDrive }) => {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [saveExists, setSaveExists] = useState(false);

  React.useEffect(() => {
    const handleUpdate = () => {
      setSaveExists(!!localStorage.getItem('timetableAppStateV1'));
    };
    window.addEventListener('storage', handleUpdate);
    handleUpdate(); // Initial check
    return () => window.removeEventListener('storage', handleUpdate);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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

        if (jsonData.length < 3) {
            throw new Error("A fájl üres vagy nem megfelelő formátumú. Legalább 3 sornak kell lennie.");
        }

        const parsedData = parseTimetableFile(jsonData);

        if (parsedData.teachers.length === 0 || parsedData.allocations.length === 0) {
            throw new Error("Nem sikerült tanárokat vagy órafelosztásokat beolvasni. Ellenőrizze a fájl formátumát és a követelményeket.");
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
    <div className="min-h-screen flex flex-col justify-center items-center bg-gray-100 dark:bg-gray-900 p-4">
        <div className="text-center p-8 max-w-2xl w-full bg-white dark:bg-gray-800 rounded-2xl shadow-xl">
            <h1 className="text-4xl font-extrabold text-gray-800 dark:text-white mb-2">Órarendkészítő Kézzel</h1>
            <p className="text-lg text-gray-600 dark:text-gray-400 mb-8">Kezdje új órarenddel, vagy töltsön be egy korábbi munkát.</p>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label
                  htmlFor="file-upload"
                  className={`flex items-center justify-center px-6 py-4 w-full bg-blue-600 text-white font-bold text-lg rounded-xl shadow-lg hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-400 dark:focus:ring-blue-800 transform hover:scale-105 transition-all duration-300 cursor-pointer ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                  {isLoading ? 'Feldolgozás...' : 'Új órarend (.xlsx)'}
                  <input id="file-upload" name="file-upload" type="file" className="sr-only" onChange={handleFileChange} accept=".xlsx, .xls" disabled={isLoading} />
              </label>
              
              <label
                htmlFor="save-file-upload"
                className={`flex items-center justify-center px-6 py-4 w-full bg-indigo-600 text-white font-bold text-lg rounded-xl shadow-lg hover:bg-indigo-700 focus:outline-none focus:ring-4 focus:ring-indigo-400 dark:focus:ring-indigo-800 transform hover:scale-105 transition-all duration-300 cursor-pointer ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <DocumentArrowUpIcon className="h-6 w-6 mr-3" />
                Betöltés Fájlból
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

              {saveExists && (
                  <button
                    onClick={onLoadFromStorage}
                    disabled={isLoading}
                    className="flex items-center justify-center px-6 py-4 w-full bg-green-600 text-white font-bold text-lg rounded-xl shadow-lg hover:bg-green-700 focus:outline-none focus:ring-4 focus:ring-green-400 dark:focus:ring-green-800 transform hover:scale-105 transition-all duration-300 cursor-pointer"
                  >
                    <FolderOpenIcon className="h-6 w-6 mr-3" />
                    Betöltés Böngészőből
                  </button>
              )}

              {googleDrive.isConfigured && googleDrive.isReady && (
                <>
                {googleDrive.isLoggedIn ? (
                  <button
                    onClick={onLoadFromDrive}
                    disabled={isLoading || googleDrive.isAuthenticating}
                    className="flex items-center justify-center px-6 py-4 w-full bg-teal-500 text-white font-bold text-lg rounded-xl shadow-lg hover:bg-teal-600 focus:outline-none focus:ring-4 focus:ring-teal-300 dark:focus:ring-teal-800 transform hover:scale-105 transition-all duration-300 cursor-pointer disabled:opacity-50"
                  >
                     <GoogleIcon className="h-6 w-6 mr-3" />
                     Betöltés Drive-ról
                  </button>
                ) : (
                  <button
                    onClick={googleDrive.signIn}
                    disabled={isLoading || googleDrive.isAuthenticating}
                    className="flex items-center justify-center px-6 py-4 w-full bg-white border border-gray-300 text-gray-700 font-bold text-lg rounded-xl shadow-lg hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors disabled:opacity-50"
                  >
                    {googleDrive.isAuthenticating ? (
                        <>
                          <SpinnerIcon className="h-6 w-6 mr-3" />
                          Bejelentkezés...
                        </>
                      ) : (
                        <>
                          <GoogleIcon className="h-6 w-6 mr-3" />
                          Bejelentkezés
                        </>
                      )}
                  </button>
                )}
                </>
              )}
            </div>

            {(error || googleDrive.authError) && (
                <div className="mt-6 p-4 bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-300 rounded-lg" role="alert">
                    <p className="font-bold">Hiba!</p>
                    {error && <p>{error}</p>}
                    {googleDrive.authError && <p>{googleDrive.authError}</p>}
                </div>
            )}

            <div className="mt-8 text-left text-sm text-gray-500 dark:text-gray-400 space-y-2">
                <p><strong>Formátum követelmények (.xlsx):</strong></p>
                <ul className="list-disc list-inside pl-2">
                    <li><strong>A oszlop (A3-tól):</strong> Osztálynevek</li>
                    <li><strong>C oszlop (C3-tól):</strong> Tantárgynevek</li>
                    <li><strong>1. sor (E1-től):</strong> Tanárnevek</li>
                    <li><strong>Adatcellák (E3-tól):</strong> Heti óraszámok (egész számként)</li>
                </ul>
            </div>
        </div>
    </div>
  );
};
