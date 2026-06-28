import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const dbClient = knex.client.config.client;

  if (dbClient === "sqlite3" || dbClient === "better-sqlite3") {
    // SQLite does not support ALTER TABLE ADD CONSTRAINT; add the unique index directly.
    try {
      await knex.raw(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_maintenance_events_maintenance_id_start ON maintenances_events (maintenance_id, start_date_time)",
      );
    } catch (_e) {
      // Index may already exist; ignore.
    }
  } else {
    // PostgreSQL / MySQL: use a proper unique constraint.
    try {
      await knex.schema.alterTable("maintenances_events", (table) => {
        table.unique(["maintenance_id", "start_date_time"], {
          indexName: "uq_maintenance_events_maintenance_id_start",
        });
      });
    } catch (_e) {
      // Constraint may already exist; ignore.
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  const dbClient = knex.client.config.client;

  if (dbClient === "sqlite3" || dbClient === "better-sqlite3") {
    try {
      await knex.raw("DROP INDEX IF EXISTS uq_maintenance_events_maintenance_id_start");
    } catch (_e) {
      // Index may not exist; ignore.
    }
  } else {
    try {
      await knex.schema.alterTable("maintenances_events", (table) => {
        table.dropUnique(["maintenance_id", "start_date_time"], "uq_maintenance_events_maintenance_id_start");
      });
    } catch (_e) {
      // Constraint may not exist; ignore.
    }
  }
}
