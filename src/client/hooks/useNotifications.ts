import { useCallback, useEffect, useRef, useState } from 'react';

export interface NotificationPreferences {
  enabled: boolean;
  onSuccess: boolean;
  onFailure: boolean;
  soundEnabled: boolean;
}

const DEFAULT_PREFS: NotificationPreferences = {
  enabled: true,
  onSuccess: false,
  onFailure: true,
  soundEnabled: false,
};

const STORAGE_KEY = 'notification-preferences';

function loadPreferences(): NotificationPreferences {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...DEFAULT_PREFS, ...(JSON.parse(stored) as Partial<NotificationPreferences>) };
    }
  } catch {
    // Ignore parse errors
  }
  return DEFAULT_PREFS;
}

function savePreferences(prefs: NotificationPreferences): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

export function useNotifications() {
  const [preferences, setPreferences] = useState<NotificationPreferences>(loadPreferences);
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'denied'
  );
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    savePreferences(preferences);
  }, [preferences]);

  const requestPermission = useCallback(async () => {
    if (typeof Notification === 'undefined') return;
    const result = await Notification.requestPermission();
    setPermission(result);
  }, []);

  const notify = useCallback(
    (title: string, options?: { body?: string; isError?: boolean }) => {
      if (!preferences.enabled) return;

      const isError = options?.isError ?? false;

      // Check if this notification type is enabled
      if (isError && !preferences.onFailure) return;
      if (!isError && !preferences.onSuccess) return;

      // Browser notification
      if (permission === 'granted') {
        const notificationOptions: NotificationOptions = {
          tag: 'personal-automator',
        };
        if (options?.body) {
          notificationOptions.body = options.body;
        }
        const notification = new Notification(title, notificationOptions);

        // Auto-close after 5 seconds
        setTimeout(() => notification.close(), 5000);
      }

      // Sound alert
      if (preferences.soundEnabled) {
        try {
          if (!audioRef.current) {
            // Create a simple beep using AudioContext
            const audioContext = new AudioContext();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            oscillator.frequency.value = isError ? 300 : 600;
            gainNode.gain.value = 0.1;
            oscillator.start();
            setTimeout(() => {
              oscillator.stop();
              void audioContext.close();
            }, 200);
          }
        } catch {
          // Ignore audio errors
        }
      }
    },
    [preferences, permission]
  );

  const updatePreferences = useCallback((updates: Partial<NotificationPreferences>) => {
    setPreferences((prev) => ({ ...prev, ...updates }));
  }, []);

  return {
    preferences,
    permission,
    notify,
    requestPermission,
    updatePreferences,
  };
}
