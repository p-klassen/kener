import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const hasCol = await knex.schema.hasColumn("users", "user_type");
  if (!hasCol) {
    await knex.schema.alterTable("users", (table) => {
      table.string("user_type").notNullable().defaultTo("user");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasCol = await knex.schema.hasColumn("users", "user_type");
  if (hasCol) {
    await knex.schema.alterTable("users", (table) => {
      table.dropColumn("user_type");
    });
  }
}
