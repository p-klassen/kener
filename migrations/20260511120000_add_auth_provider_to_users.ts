import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const hasAuthProvider = await knex.schema.hasColumn("users", "auth_provider");
  const hasExternalId = await knex.schema.hasColumn("users", "external_id");

  if (!hasAuthProvider || !hasExternalId) {
    await knex.schema.alterTable("users", (table) => {
      if (!hasAuthProvider) {
        table.string("auth_provider", 20).notNullable().defaultTo("local");
      }
      if (!hasExternalId) {
        table.text("external_id").nullable();
      }
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasAuthProvider = await knex.schema.hasColumn("users", "auth_provider");
  const hasExternalId = await knex.schema.hasColumn("users", "external_id");

  await knex.schema.alterTable("users", (table) => {
    if (hasAuthProvider) table.dropColumn("auth_provider");
    if (hasExternalId) table.dropColumn("external_id");
  });
}
