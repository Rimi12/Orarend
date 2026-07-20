import React, { useState, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { useTimetable } from '../contexts/TimetableContext.tsx';
import { SavedState, AllocationUpdateSummary } from '../types.ts';
import { parseTimetableFile } from '../utils.ts';

export const useDataManagement = (googleDrive: any) => {
  const { 
    currentState, loadState, clearAllData,
    prepareAllocationUpdate, applyAllocationUpdate,
    setDriveFileId
  } = useTimetable();

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [updateSummary, setUpdateSummary] = useState<AllocationUpdateSummary | null>(null);
  const updateFileRef = useRef<HTMLInputElement>(null);

  const handleLoadStateFromJson = useCallback((jsonString: string) => {
    try {
        const savedState: SavedState = JSON.parse(jsonString);
        loadState(savedState);
    } catch (error) {
        alert("Hiba a mentési fájl feldgozása közben. A fájl sérült vagy nem megfelelő formátumú.");
    }
  }, [loadState]);

  const handleSaveToDrive = async () => {
    if (!currentState) return;
    setSaveStatus('saving');
    try {
      const stateToSave: SavedState = { ...currentState, version: '2.0.0' };
      const newDriveFileId = await googleDrive.saveFile(JSON.stringify(stateToSave, null, 2));
      setDriveFileId(newDriveFileId);
      setSaveStatus('saved');
    } catch (error) {
      console.error("Hiba a Drive-ra mentés során:", error);
      alert("Hiba történt a Google Drive-ra mentés közben.");
      setSaveStatus('idle');
    } finally {
      setTimeout(() => setSaveStatus('idle'), 2000);
    }
  };

  const handleSaveToFile = () => {
    if (!currentState) return;
    try {
      const stateToSave: SavedState = { ...currentState, version: '2.0.0' };
      const blob = new Blob([JSON.stringify(stateToSave, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const date = new Date().toISOString().slice(0, 10);
      a.download = `orarend_mentes_${date}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Hiba a fájlba mentés során:", error);
      alert("Hiba történt a fájlba mentés közben.");
    }
  };

  const handleReset = () => {
    if (window.confirm("Biztosan törölni szeretné a jelenlegi órarendet és a mentést? Ez a művelet nem vonható vissza.")) {
      clearAllData();
    }
  };

  const handleLoadFromDrive = async () => {
    try {
      const content = await googleDrive.loadFile();
      handleLoadStateFromJson(content);
    } catch(error) {
      console.error("Error loading from drive", error);
      alert("Hiba a Google Drive-ból való betöltés során.");
    }
  };

  const handleAllocationUpdateFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const binaryStr = event.target?.result;
            if (!binaryStr) throw new Error("A fájl olvasása sikertelen.");
            
            const workbook = XLSX.read(binaryStr, { type: 'binary' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const jsonData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

            const parsedData = parseTimetableFile(jsonData);
            const summary = prepareAllocationUpdate(parsedData);
            setUpdateSummary(summary);
            setIsUpdateModalOpen(true);
        } catch (err) {
            console.error(err);
            alert(err instanceof Error ? err.message : 'Ismeretlen hiba a fájl feldolgozása közben.');
        } finally {
            e.target.value = '';
        }
    };
    reader.onerror = () => {
        alert("Hiba történt a fájl olvasása közben.");
        e.target.value = '';
    };
    reader.readAsBinaryString(file);
  };

  const handleConfirmUpdate = () => {
      if (updateSummary) {
          applyAllocationUpdate(updateSummary);
      }
      setIsUpdateModalOpen(false);
      setUpdateSummary(null);
  };

  return {
    saveStatus,
    isUpdateModalOpen,
    setIsUpdateModalOpen,
    updateSummary,
    setUpdateSummary,
    updateFileRef,
    handleLoadStateFromJson,
    handleSaveToDrive,
    handleSaveToFile,
    handleReset,
    handleLoadFromDrive,
    handleAllocationUpdateFileChange,
    handleConfirmUpdate
  };
};
