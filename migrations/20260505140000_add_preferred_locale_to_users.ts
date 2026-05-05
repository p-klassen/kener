import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const hasCol = await knex.schema.hasColumn("users", "preferred_locale");
  if (!hasCol) {
    await knex.schema.alterTable("users", (table) => {
      table.string("preferred_locale", 10).nullable().defaultTo(null);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasCol = await knex.schema.hasColumn("users", "preferred_locale");
  if (hasCol) {
    await knex.schema.alterTable("users", (table) => {
      table.dropColumn("preferred_locale");
    });
  }
}
