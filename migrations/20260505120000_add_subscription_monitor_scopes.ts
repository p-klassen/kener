import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("subscription_monitor_scopes"))) {
    await knex.schema.createTable("subscription_monitor_scopes", (table) => {
      table.increments("id").primary();
      table.integer("subscription_id").unsigned().notNullable();
      table.string("monitor_tag", 255).notNullable();
      table.unique(["subscription_id", "monitor_tag"]);
      table.index(["subscription_id"]);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("subscription_monitor_scopes");
}
