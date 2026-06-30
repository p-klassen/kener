import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("api_keys", (table) => {
    table.integer("user_id").nullable().references("id").inTable("users").onDelete("CASCADE");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("api_keys", (table) => {
    table.dropColumn("user_id");
  });
}
