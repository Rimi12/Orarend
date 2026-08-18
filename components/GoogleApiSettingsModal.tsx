import React, { useState, useEffect } from 'react';

interface GoogleApiSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (apiKey: string, clientId: string) => void;
  initialApiKey?: string | null;
  initialClientId?: string | null;
}

export const GoogleApiSettingsModal: React.FC<GoogleApiSettingsModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialApiKey,
  initialClientId,
}) => {
  const [apiKey, setApiKey] = useState('');
  const [clientId, setClientId] = useState('');

  useEffect(() => {
    if (isOpen) {
        setApiKey(initialApiKey || '');
        setClientId(initialClientId || '');
    }
  }, [initialApiKey, initialClientId, isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    onSave(apiKey, clientId);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 max-w-2xl w-full transform transition-all" onClick={e => e.stopPropagation()}>
        <h2 className="text-2xl font-bold mb-2 text-gray-900 dark:text-white">Google Drive Beállítások</h2>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          Adja meg a Google API kulcsokat a Drive integráció engedélyezéséhez. Ezeket a kulcsokat a böngésző helyi tárolójában mentjük el.
        </p>

        <div className="space-y-4">
          <div>
            <label htmlFor="api-key" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Google API Key
            </label>
            <input
              type="password"
              id="api-key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white"
              placeholder="Adja meg az API kulcsot"
            />
          </div>
          <div>
            <label htmlFor="client-id" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Google Client ID
            </label>
            <input
              type="text"
              id="client-id"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="w-full bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white"
              placeholder="Adja meg a kliens ID-t"
            />
          </div>
        </div>

        <div className="mt-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-700 rounded-lg text-sm text-yellow-800 dark:text-yellow-200">
          <h3 className="font-bold mb-2">Sikertelen bejelentkezés? (access_denied hiba)</h3>
          <p className="mb-2">
            Ez a hiba leggyakrabban a Google Cloud projekt beállítási problémáiból adódik. Ellenőrizze a következőket:
          </p>
          <ul className="list-disc list-inside space-y-2">
            <li>
              <strong>Engedélyezett JavaScript-források:</strong> A
              <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="font-semibold underline hover:text-yellow-600 dark:hover:text-yellow-400">
                Hitelesítő adatok
              </a> oldalon, az Ön Kliens ID-ja alatt, az engedélyezett források listájának tartalmaznia kell a pontos webcímet, ahonnan az alkalmazást futtatja. Pl: <code>https://your-app-url.run.app</code> (elgépelés és perjel nélkül a végén).
            </li>
            <li>
              <strong>OAuth Hozzájárulási Képernyő:</strong>
              <ul className="list-['-_'] list-inside pl-4 mt-1 space-y-1">
                <li>
                  Menjen az <a href="https://console.cloud.google.com/apis/credentials/consent" target="_blank" rel="noopener noreferrer" className="font-semibold underline hover:text-yellow-600 dark:hover:text-yellow-400">OAuth Hozzájárulási Képernyő</a> oldalra.
                </li>
                <li>
                  <strong>Publikálási Állapot:</strong> Ha az állapot <strong>"Tesztelés"</strong>, akkor a "Tesztfelhasználók" szekcióban a <strong>"+ ADD USERS"</strong> gombbal hozzá kell adnia a saját Google email címét. Csak a listán szereplő felhasználók tudnak bejelentkezni.
                </li>
                <li>
                  Ha az állapot <strong>"Éles"</strong>, ennek nem kellene problémát okoznia.
                </li>
              </ul>
            </li>
          </ul>
        </div>

        <div className="mt-8 flex justify-end gap-4">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-gray-200 text-gray-800 font-semibold rounded-lg hover:bg-gray-300 dark:bg-gray-600 dark:text-gray-200 dark:hover:bg-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-400 transition-colors duration-200"
          >
            Mégse
          </button>
          <button
            onClick={handleSave}
            className="px-6 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 transition-colors duration-200"
          >
            Mentés
          </button>
        </div>
      </div>
    </div>
  );
};