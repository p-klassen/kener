import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const existing = await knex("roles").where("id", "subscriber").first();
  if (!existing) {
    await knex("roles").insert({
      id: "subscriber",
      role_name: "Subscriber",
      readonly: 1,
      status: "ACTIVE",
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex("roles").where("id", "subscriber").delete();
}
