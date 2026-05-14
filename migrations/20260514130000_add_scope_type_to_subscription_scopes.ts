import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("subscription_monitor_scopes", (table) => {
    // Drop old unique on (subscription_id, monitor_tag) — will be replaced
    table.dropUnique(["subscription_id", "monitor_tag"]);
    // Add scope_type; default 'monitor' covers all existing rows
    table.string("scope_type", 20).notNullable().defaultTo("monitor");
    // New unique: same scope_identifier (monitor tag or page slug) + scope_type per subscription
    table.unique(["subscription_id", "scope_type", "monitor_tag"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("subscription_monitor_scopes", (table) => {
    table.dropUnique(["subscription_id", "scope_type", "monitor_tag"]);
    table.dropColumn("scope_type");
    table.unique(["subscription_id", "monitor_tag"]);
  });
}
