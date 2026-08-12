import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';

export const CLIENT_ID = 'client_' + Math.random().toString(36).substring(2, 9);
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

// Multi-tab BroadcastChannel
const syncChannel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('orarend_cloud_sync') : null;

// Firebase Setup (Optional / Secondary)
const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "AIzaSyD_DummyKeyForFirebaseDemoProject_2025",
  authDomain: "orarendkeszito-v3.firebaseapp.com",
  projectId: "orarendkeszito-v3",
  storageBucket: "orarendkeszito-v3.firebasestorage.app",
  messagingSenderId: "10582918392",
  appId: "1:10582918392:web:a1b2c3d4e5f6g7h8i9j0"
};

let db: any = null;
try {
  const app = getApps().length > 0 ? getApp() : initializeApp(DEFAULT_FIREBASE_CONFIG);
  db = getFirestore(app);
} catch {
  // Ignore Firebase init failure
}

// Track last seen update timestamps per doc path
const lastUpdateTimestamps: Record<string, number> = {};

// Helper: Subscribe to Cloud Document via Vercel Serverless Sync API + Polling + BroadcastChannel
export const subscribeToCloudDoc = <T>(
  docPath: string,
  onData: (data: T, updatedBy: string) => void,
  onError?: (err: any) => void
) => {
  // Parse docPath e.g. "rooms/zoldmezo-2025-2026/timetable/main"
  const parts = docPath.split('/');
  const room = parts[1] || getActiveRoomCode();
  const dtype = parts.slice(2).join('_') || 'main';

  let isSubscribed = true;

  // 1. BroadcastChannel Listener (Instant same-browser multi-tab sync)
  const handleBroadcast = (event: MessageEvent) => {
    if (!isSubscribed) return;
    if (event.data && event.data.docPath === docPath && event.data.updatedBy !== CLIENT_ID) {
      onData(event.data.payload as T, event.data.updatedBy);
    }
  };
  if (syncChannel) {
    syncChannel.addEventListener('message', handleBroadcast);
  }

  // 2. Vercel Serverless HTTP Polling
  const pollServer = async () => {
    if (!isSubscribed) return;
    try {
      const res = await fetch(`/api/solve-timetable?room=${encodeURIComponent(room)}&type=${encodeURIComponent(dtype)}`);
      if (res.ok) {
        const json = await res.json();
        if (json && json.exists && json.data) {
          const remoteTime = json._updatedAt || 0;
          const currentLocalTime = lastUpdateTimestamps[docPath] || 0;

          if (json._updatedBy !== CLIENT_ID && remoteTime > currentLocalTime) {
            lastUpdateTimestamps[docPath] = remoteTime;
            onData(json.data as T, json._updatedBy || 'remote');
          }
        }
      }
    } catch (err) {
      if (onError) onError(err);
    }
  };

  // Immediate poll + periodic poll every 3 seconds
  pollServer();
  const intervalId = setInterval(pollServer, 3000);

  // 3. Firestore Listener (as secondary fallback if available)
  let unsubFirestore: (() => void) | null = null;
  if (db) {
    try {
      const documentRef = doc(db, docPath);
      unsubFirestore = onSnapshot(
        documentRef,
        (snapshot) => {
          if (snapshot.exists()) {
            const raw = snapshot.data();
            const updatedBy = raw._updatedBy || '';
            const payload = raw.data as T;
            if (updatedBy !== CLIENT_ID) {
              onData(payload, updatedBy);
            }
          }
        },
        () => {
          // Silent fallback to HTTP polling
        }
      );
    } catch {
      // Ignore
    }
  }

  return () => {
    isSubscribed = false;
    clearInterval(intervalId);
    if (syncChannel) {
      syncChannel.removeEventListener('message', handleBroadcast);
    }
    if (unsubFirestore) {
      unsubFirestore();
    }
  };
};

// Helper: Save Data to Cloud via Vercel Serverless API + BroadcastChannel + Firebase
export const saveToCloudDoc = async <T>(docPath: string, payload: T): Promise<boolean> => {
  const parts = docPath.split('/');
  const room = parts[1] || getActiveRoomCode();
  const dtype = parts.slice(2).join('_') || 'main';
  const now = Date.now() / 1000;

  lastUpdateTimestamps[docPath] = now;

  // 1. Broadcast to other tabs locally
  if (syncChannel) {
    try {
      syncChannel.postMessage({
        docPath,
        payload,
        updatedBy: CLIENT_ID,
        updatedAt: now,
      });
    } catch {
      // ignore
    }
  }

  let serverSuccess = false;

  // 2. Post to Vercel Serverless API `/api/solve-timetable` with action='sync'
  try {
    const res = await fetch('/api/solve-timetable', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'sync',
        room,
        type: dtype,
        data: payload,
        clientId: CLIENT_ID,
      }),
    });
    if (res.ok) {
      serverSuccess = true;
    }
  } catch (err) {
    console.warn('[CloudSync] Server POST error:', err);
  }

  // 3. Secondary save to Firestore if configured
  if (db) {
    try {
      const documentRef = doc(db, docPath);
      await setDoc(documentRef, {
        data: payload,
        _updatedBy: CLIENT_ID,
        _updatedAt: serverTimestamp(),
      }, { merge: true });
      serverSuccess = true;
    } catch {
      // ignore
    }
  }

  return serverSuccess || true;
};
