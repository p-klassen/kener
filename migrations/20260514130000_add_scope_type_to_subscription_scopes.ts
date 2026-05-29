import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const hasScopeType = await knex.schema.hasColumn("subscription_monitor_scopes", "scope_type");
  if (hasScopeType) return;
  await knex.schema.alterTable("subscription_monitor_scopes", (table) => {
    table.dropUnique(["subscription_id", "monitor_tag"]);
    table.string("scope_type", 20).notNullable().defaultTo("monitor");
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
