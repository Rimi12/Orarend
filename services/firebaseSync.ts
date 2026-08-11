import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getFirestore, 
  doc, 
  onSnapshot, 
  setDoc, 
  getDoc,
  serverTimestamp 
} from 'firebase/firestore';

// Default Firebase Configuration (Shared project for real-time collaboration)
const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "AIzaSyD_DummyKeyForFirebaseDemoProject_2025",
  authDomain: "orarendkeszito-v3.firebaseapp.com",
  projectId: "orarendkeszito-v3",
  storageBucket: "orarendkeszito-v3.firebasestorage.app",
  messagingSenderId: "10582918392",
  appId: "1:10582918392:web:a1b2c3d4e5f6g7h8i9j0"
};

// Generate a random Client ID for this browser tab to filter out echo updates
export const CLIENT_ID = 'client_' + Math.random().toString(36).substring(2, 9);

// Get stored config or default
const getSavedFirebaseConfig = () => {
  const custom = localStorage.getItem('customFirebaseConfig');
  if (custom) {
    try {
      return JSON.parse(custom);
    } catch {
      // fallback
    }
  }
  return DEFAULT_FIREBASE_CONFIG;
};

// Initialize Firebase
const app = getApps().length > 0 ? getApp() : initializeApp(getSavedFirebaseConfig());
export const db = getFirestore(app);

// Local Storage Keys for Room Code
export const ROOM_CODE_KEY = 'cloudSyncRoomCode';
export const DEFAULT_ROOM_CODE = 'zoldmezo-2025-2026';

export const getActiveRoomCode = (): string => {
  return localStorage.getItem(ROOM_CODE_KEY) || DEFAULT_ROOM_CODE;
};

export const setActiveRoomCode = (code: string): string => {
  const sanitized = code.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '') || DEFAULT_ROOM_CODE;
  localStorage.setItem(ROOM_CODE_KEY, sanitized);
  return sanitized;
};

// Helper: Subscribe to Firestore Document with live callback
export const subscribeToCloudDoc = <T>(
  docPath: string,
  onData: (data: T, updatedBy: string) => void,
  onError?: (err: any) => void
) => {
  const documentRef = doc(db, docPath);
  return onSnapshot(
    documentRef,
    (snapshot) => {
      if (snapshot.exists()) {
        const raw = snapshot.data();
        const updatedBy = raw._updatedBy || '';
        const payload = raw.data as T;
        onData(payload, updatedBy);
      }
    },
    (error) => {
      console.warn(`[CloudSync] Subscription error for ${docPath}:`, error);
      if (onError) onError(error);
    }
  );
};

// Helper: Save Data to Cloud
export const saveToCloudDoc = async <T>(docPath: string, payload: T): Promise<boolean> => {
  try {
    const documentRef = doc(db, docPath);
    await setDoc(documentRef, {
      data: payload,
      _updatedBy: CLIENT_ID,
      _updatedAt: serverTimestamp(),
    }, { merge: true });
    return true;
  } catch (err) {
    console.warn(`[CloudSync] Save error for ${docPath}:`, err);
    return false;
  }
};
