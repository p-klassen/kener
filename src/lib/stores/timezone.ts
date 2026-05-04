import { writable, derived } from "svelte/store";

const TIMEZONE_STORAGE_KEY = "kener_preferred_timezone";

export interface TimezoneStore {
  selectedTimezone: string;
  availableTimezones: string[];
  serverDefault: string;
}

function getDefaultTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function getAllTimezones(): string[] {
  return Intl.supportedValuesOf("timeZone");
}

const defaultState: TimezoneStore = {
  selectedTimezone: getDefaultTimezone(),
  availableTimezones: [],
  serverDefault: "",
};

function createTimezoneStore() {
  const { subscribe, set, update } = writable<TimezoneStore>(defaultState);

  return {
    subscribe,

    /**
     * Initialize the store
     * Checks localStorage first, then falls back to serverDefault (if valid), then browser's timezone
     */
    init(serverDefault?: string): void {
      const allTimezones = getAllTimezones();
      const effectiveDefault =
        serverDefault && (serverDefault === "UTC" || allTimezones.includes(serverDefault))
          ? serverDefault
          : getDefaultTimezone();
      let preferredTimezone = effectiveDefault;

      // Check localStorage for saved preference (only in browser)
      if (typeof window !== "undefined") {
        const savedTimezone = localStorage.getItem(TIMEZONE_STORAGE_KEY);
        if (savedTimezone && (savedTimezone === "UTC" || allTimezones.includes(savedTimezone))) {
          preferredTimezone = savedTimezone;
        }
      }

      set({
        selectedTimezone: preferredTimezone,
        availableTimezones: ["UTC", ...allTimezones],
        serverDefault: effectiveDefault,
      });
    },

    /**
     * Set the timezone and persist to localStorage
     */
    setTimezone(timezone: string): void {
      update((state) => {
        if (timezone === "UTC" || state.availableTimezones.includes(timezone)) {
          // Save to localStorage
          if (typeof window !== "undefined") {
            localStorage.setItem(TIMEZONE_STORAGE_KEY, timezone);
          }
          return {
            ...state,
            selectedTimezone: timezone,
          };
        }
        return state;
      });
    },

    /**
     * Reset to the admin's server default (or browser timezone if no server default is set).
     * Clears the user's explicit localStorage preference so next load starts fresh from the admin default.
     */
    reset(): void {
      update((state) => {
        const resetTarget = state.serverDefault || getDefaultTimezone();
        if (typeof window !== "undefined") {
          localStorage.removeItem(TIMEZONE_STORAGE_KEY);
        }
        return {
          ...state,
          selectedTimezone: resetTarget,
        };
      });
    },
  };
}

export const timezone = createTimezoneStore();

// Derived store for easy access to just the selected timezone
export const selectedTimezone = derived(timezone, ($tz) => $tz.selectedTimezone);

// Derived store for available timezones
export const availableTimezones = derived(timezone, ($tz) => $tz.availableTimezones);
