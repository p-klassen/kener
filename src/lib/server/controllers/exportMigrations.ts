import type { ExportPayload } from "./exportImportController.js";

// The current version of the export format.
// Bump this whenever a breaking change is made to the export schema,
// and add a corresponding migration step to MIGRATIONS below.
export const CURRENT_EXPORT_VERSION = 1;

export type MigrationChange = {
  entity: string;      // "monitors", "pages", "users", etc.
  identifier: string;  // e.g. monitor tag, page path, user email
  description: string; // human-readable explanation of what was changed
};

export type MigrationResult = {
  applied: boolean;
  from_version: number;
  to_version: number;
  changes: MigrationChange[];
};

type MigrationStep = {
  // The version number that this step upgrades FROM (i.e. files with version < to_version).
  from_version: number;
  // The version that results after applying this step.
  to_version: number;
  // Short label shown in the UI, e.g. "v1 → v2: renamed monitor field 'foo' to 'bar'"
  label: string;
  // Mutates `payload` in place and returns the list of individual changes made.
  // Only called when payload.version < to_version.
  apply: (payload: ExportPayload) => MigrationChange[];
};

// ---------------------------------------------------------------------------
// Migration registry
// Add a new MigrationStep here whenever the export format changes.
// Steps must be ordered by to_version (ascending) and cover every version
// increment exactly once.
//
// Template for a new migration:
//
// {
//   from_version: N,
//   to_version: N + 1,
//   label: "vN → v(N+1): description of what changed",
//   apply(payload) {
//     const changes: MigrationChange[] = [];
//
//     // Example: rename a field on every monitor
//     for (const m of payload.config?.monitors ?? []) {
//       const raw = m as Record<string, unknown>;
//       if ("old_field" in raw && !("new_field" in raw)) {
//         raw["new_field"] = raw["old_field"];
//         delete raw["old_field"];
//         changes.push({
//           entity: "monitors",
//           identifier: m.tag,
//           description: "field 'old_field' renamed to 'new_field'",
//         });
//       }
//     }
//
//     return changes;
//   },
// },
// ---------------------------------------------------------------------------
const MIGRATIONS: MigrationStep[] = [
  // No migrations yet — the export format has not had a breaking change since v1.
  // Add steps here as the format evolves.
];

/**
 * Applies all necessary migrations to bring `payload` up to CURRENT_EXPORT_VERSION.
 *
 * Returns a deep-cloned, migrated payload (the original is not mutated) together
 * with a MigrationResult describing what was changed.  If no migrations are
 * needed (payload.version === CURRENT_EXPORT_VERSION or no steps apply), the
 * original payload reference is returned unchanged with applied=false.
 */
export function migratePayload(payload: ExportPayload): { payload: ExportPayload; migration: MigrationResult } {
  const from_version = typeof payload.version === "number" && payload.version > 0 ? payload.version : 0;

  const relevantSteps = MIGRATIONS.filter((s) => from_version < s.to_version);

  if (relevantSteps.length === 0) {
    return {
      payload,
      migration: {
        applied: false,
        from_version,
        to_version: CURRENT_EXPORT_VERSION,
        changes: [],
      },
    };
  }

  // Deep-clone so we never mutate the caller's data
  const migrated: ExportPayload = JSON.parse(JSON.stringify(payload));
  const allChanges: MigrationChange[] = [];

  for (const step of relevantSteps) {
    const changes = step.apply(migrated);
    allChanges.push(...changes);
  }

  migrated.version = CURRENT_EXPORT_VERSION;

  return {
    payload: migrated,
    migration: {
      applied: allChanges.length > 0,
      from_version,
      to_version: CURRENT_EXPORT_VERSION,
      changes: allChanges,
    },
  };
}
