import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const hasCol = await knex.schema.hasColumn("users", "must_change_password");
  if (!hasCol) {
    await knex.schema.alterTable("users", (table) => {
      table.integer("must_change_password").notNullable().defaultTo(0);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasCol = await knex.schema.hasColumn("users", "must_change_password");
  if (hasCol) {
    await knex.schema.alterTable("users", (table) => {
      table.dropColumn("must_change_password");
    });
  }
}
