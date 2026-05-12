import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("subscriber_users", (table) => {
    table.integer("linked_user_id").nullable().defaultTo(null);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("subscriber_users", (table) => {
    table.dropColumn("linked_user_id");
  });
}
