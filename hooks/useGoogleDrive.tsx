import React, { useState, useEffect, useCallback } from 'react';

const SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email';
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';

declare global {
  interface Window {
    gapi: any;
    google: any;
  }
}

export const useGoogleDrive = (apiKey?: string | null, clientId?: string | null) => {
    const [isGapiReady, setIsGapiReady] = useState(false);
    const [isGisReady, setIsGisReady] = useState(false);
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [isAuthenticating, setIsAuthenticating] = useState(false);
    const [authError, setAuthError] = useState<string | null>(null);
    const [userProfile, setUserProfile] = useState<any>(null);
    const [tokenClient, setTokenClient] = useState<any>(null);
    const [pickerApiLoaded, setPickerApiLoaded] = useState(false);
    const [currentFileId, setCurrentFileId] = useState<string | null>(null);

    const isConfigured = !!apiKey && !!clientId;

    const handleAuthFlow = useCallback(async (tokenResponse: any) => {
        if (tokenResponse && tokenResponse.access_token) {
            window.gapi.client.setToken(tokenResponse);
            try {
                // Fetch profile to confirm token is valid and get user info
                const res = await window.gapi.client.request({
                    'path': 'https://www.googleapis.com/oauth2/v3/userinfo'
                });
                setUserProfile(res.result);
                setIsLoggedIn(true);
                setAuthError(null);
            } catch (err) {
                console.error("Hiba a felhasználó adatainak ellenőrzése közben:", err);
                setAuthError("Hiba a bejelentkezés hitelesítése során. Lehet, hogy a beállítások nem megfelelőek, vagy a Google szolgáltatás nem elérhető.");
                window.gapi.client.setToken(null);
                setIsLoggedIn(false);
                setUserProfile(null);
            }
        } else {
            console.error("Érvénytelen token válasz érkezett a bejelentkezés során.", tokenResponse);
            setAuthError("A Google nem adott érvényes hozzáférést. Kérjük, próbálja újra. Ha a hiba továbbra is fennáll, ellenőrizze a böngésző konzolt a részletekért.");
            setIsLoggedIn(false);
            setUserProfile(null);
        }
        setIsAuthenticating(false);
    }, []);

    const gapiLoaded = useCallback(() => {
        if (!apiKey) return;
        window.gapi.load('client:picker', () => {
            window.gapi.client.init({
                apiKey: apiKey,
                discoveryDocs: [DISCOVERY_DOC],
            }).then(() => {
                setIsGapiReady(true);
                setPickerApiLoaded(true);
            }).catch((e: any) => {
                console.error("Hiba a GAPI kliens inicializálása közben:", e);
                setAuthError("A Google API kliens inicializálása sikertelen. Ellenőrizze az API kulcsot.");
                setIsGapiReady(false);
                setPickerApiLoaded(false);
            });
        });
    }, [apiKey]);

    const gisLoaded = useCallback(() => {
        if (!clientId) return;
        try {
            const client = window.google.accounts.oauth2.initTokenClient({
                client_id: clientId,
                scope: SCOPES,
                callback: handleAuthFlow,
            });
            setTokenClient(client);
            setIsGisReady(true);
        } catch(e) {
             console.error("Hiba a GIS kliens inicializálása közben:", e);
             setAuthError("A Google bejelentkezési szolgáltatás inicializálása sikertelen. Ellenőrizze a Kliens ID-t.");
             setIsGisReady(false);
        }
    }, [clientId, handleAuthFlow]);

    useEffect(() => {
        setIsLoggedIn(false);
        setUserProfile(null);
        setAuthError(null);

        if (!isConfigured) {
            setIsGapiReady(false);
            setIsGisReady(false);
            setPickerApiLoaded(false);
            setTokenClient(null);
            return;
        }

        const gapiScript = document.querySelector<HTMLScriptElement>('script[src="https://apis.google.com/js/api.js"]');
        const gisScript = document.querySelector<HTMLScriptElement>('script[src="https://accounts.google.com/gsi/client"]');
        
        if (window.gapi && window.gapi.load) gapiLoaded();
        else if (gapiScript) gapiScript.onload = gapiLoaded;

        if (window.google && window.google.accounts) gisLoaded();
        else if (gisScript) gisScript.onload = gisLoaded;
    
    }, [isConfigured, gapiLoaded, gisLoaded]);
    
    const signIn = useCallback(() => {
        if (tokenClient) {
            try {
              setIsAuthenticating(true);
              setAuthError(null);
              tokenClient.requestAccessToken({prompt: ''});
            } catch (error) {
              console.error("Hiba a bejelentkezés során:", error);
              setAuthError("A bejelentkezési folyamatot nem sikerült elindítani.");
              setIsAuthenticating(false);
            }
        }
    }, [tokenClient]);
    
    const signOut = useCallback(() => {
        if (!isLoggedIn || !window.gapi || !window.google) return;
        setIsAuthenticating(true);
        const accessToken = window.gapi.client.getToken();
        if (accessToken) {
            window.google.accounts.oauth2.revoke(accessToken.access_token, () => {
                window.gapi.client.setToken(null);
                setIsLoggedIn(false);
                setUserProfile(null);
                setIsAuthenticating(false);
            });
        } else {
             setIsLoggedIn(false);
             setUserProfile(null);
             setIsAuthenticating(false);
        }
    }, [isLoggedIn]);
    
    const saveFile = useCallback(async (content: string): Promise<string> => {
        if (!isLoggedIn) throw new Error("A mentéshez be kell jelentkezni.");

        const boundary = '-------314159265358979323846';
        const delimiter = "\r\n--" + boundary + "\r\n";
        const close_delim = "\r\n--" + boundary + "--";

        const metadata = {
            name: 'orarend_mentes.json',
            mimeType: 'application/json',
        };

        const multipartRequestBody =
            delimiter +
            'Content-Type: application/json\r\n\r\n' +
            JSON.stringify(metadata) +
            delimiter +
            'Content-Type: application/json\r\n\r\n' +
            content +
            close_delim;

        const path = currentFileId ? `/upload/drive/v3/files/${currentFileId}` : '/upload/drive/v3/files';
        
        const request = window.gapi.client.request({
            path: path,
            method: currentFileId ? 'PATCH' : 'POST',
            params: { uploadType: 'multipart' },
            headers: {
                'Content-Type': 'multipart/related; boundary="' + boundary + '"'
            },
            body: multipartRequestBody
        });

        const response = await request;
        if (response.result.id) {
            return response.result.id;
        } else {
            throw new Error("Sikertelen mentés a Google Drive-ra");
        }
    }, [isLoggedIn, currentFileId]);
    
    const loadFile = useCallback((): Promise<string> => {
        return new Promise((resolve, reject) => {
             if (!isLoggedIn || !pickerApiLoaded || !apiKey || !clientId) {
                reject("A Google Drive betöltő nincs készen vagy nincs bejelentkezve.");
                return;
            }

            const view = new window.google.picker.View(window.google.picker.ViewId.DOCS);
            view.setMimeTypes("application/json");

            const picker = new window.google.picker.PickerBuilder()
                .enableFeature(window.google.picker.Feature.NAV_HIDDEN)
                .setAppId(clientId.split('-')[0])
                .setOAuthToken(window.gapi.client.getToken().access_token)
                .addView(view)
                .setDeveloperKey(apiKey)
                .setCallback((data: any) => {
                     if (data[window.google.picker.Action.PICKED]) {
                        const fileId = data[window.google.picker.Response.DOCUMENTS][0][window.google.picker.Document.ID];
                        window.gapi.client.drive.files.get({
                            fileId: fileId,
                            alt: 'media'
                        }).then((res: any) => {
                            resolve(res.body);
                        }).catch((err: any) => reject(err));
                    }
                })
                .build();
            picker.setVisible(true);
        });
    }, [pickerApiLoaded, isLoggedIn, apiKey, clientId]);

    return {
        isConfigured,
        isReady: isConfigured && isGapiReady && isGisReady,
        isLoggedIn,
        isAuthenticating,
        authError,
        userProfile,
        signIn,
        signOut,
        saveFile,
        loadFile,
        currentFileId,
        setCurrentFileId
    };
};