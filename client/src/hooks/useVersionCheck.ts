import { useState, useEffect, useCallback } from 'react';
import apiClient from '../api/client';
import { isNewerVersion } from '../lib/semver';

interface VersionResponse {
  version: string;
  environment: string;
  requiredRefresh: boolean;
}

export function useVersionCheck() {
  const localVersion = __APP_VERSION__;
  const [serverVersion, setServerVersion] = useState<string>(localVersion);
  const [isUpdateAvailable, setIsUpdateAvailable] = useState<boolean>(false);
  const [lastSeenVersion, setLastSeenVersionState] = useState<string>(() => {
    return localStorage.getItem('last_seen_version') || localVersion;
  });

  const setLastSeenVersion = (version: string) => {
    localStorage.setItem('last_seen_version', version);
    setLastSeenVersionState(version);
  };

  const checkVersion = useCallback(async () => {
    if (import.meta.env.DEV) return;
    try {
      const response = await apiClient.get<{ success: boolean; data: VersionResponse }>('/system/version');
      const data = response.data.data;
      setServerVersion(data.version);
      
      const isNew = isNewerVersion(localVersion, data.version);
      setIsUpdateAvailable(isNew);
    } catch (err) {
      console.error('Failed to fetch system version', err);
    }
  }, [localVersion]);

  useEffect(() => {
    // 1. Initial check - wrap in setTimeout to escape synchronous effect body
    const timer = setTimeout(() => {
      checkVersion();
    }, 0);

    // 2. Listen to custom DOM events from Axios interceptor
    const handleVersionDetected = (e: Event) => {
      if (import.meta.env.DEV) return;
      const detectedVersion = (e as CustomEvent<string>).detail;
      if (detectedVersion) {
        setServerVersion(detectedVersion);
        const isNew = isNewerVersion(localVersion, detectedVersion);
        setIsUpdateAvailable(isNew);
      }
    };

    window.addEventListener('app-version-detected', handleVersionDetected as EventListener);

    // 3. Listen to window focus (re-check when returning to tab)
    const handleFocus = () => {
      checkVersion();
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('app-version-detected', handleVersionDetected as EventListener);
      window.removeEventListener('focus', handleFocus);
    };
  }, [checkVersion, localVersion]);

  return {
    localVersion,
    serverVersion,
    isUpdateAvailable,
    lastSeenVersion,
    setLastSeenVersion,
    checkVersion,
  };
}
