import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // 1. groups
  if (!(await knex.schema.hasTable("groups"))) {
    await knex.schema.createTable("groups", (table) => {
      table.increments("id").primary();
      table.text("name").notNullable();
      table.text("description").nullable();
      table.timestamp("created_at").defaultTo(knex.fn.now());
      table.timestamp("updated_at").defaultTo(knex.fn.now());
    });
  }

  // 2. users_groups
  if (!(await knex.schema.hasTable("users_groups"))) {
    await knex.schema.createTable("users_groups", (table) => {
      table.integer("users_id").unsigned().notNullable().references("id").inTable("users").onDelete("CASCADE");
      table.integer("groups_id").unsigned().notNullable().references("id").inTable("groups").onDelete("CASCADE");
      table.timestamp("created_at").defaultTo(knex.fn.now());
      table.timestamp("updated_at").defaultTo(knex.fn.now());
      table.primary(["users_id", "groups_id"]);
      table.index("users_id", "idx_users_groups_users_id");
    });
  }

  // 3. groups_roles
  if (!(await knex.schema.hasTable("groups_roles"))) {
    await knex.schema.createTable("groups_roles", (table) => {
      table.integer("groups_id").unsigned().notNullable().references("id").inTable("groups").onDelete("CASCADE");
      table.string("roles_id", 100).notNullable().references("id").inTable("roles").onDelete("CASCADE");
      table.timestamp("created_at").defaultTo(knex.fn.now());
      table.timestamp("updated_at").defaultTo(knex.fn.now());
      table.primary(["groups_id", "roles_id"]);
    });
  }

  // 4. roles_pages
  if (!(await knex.schema.hasTable("roles_pages"))) {
    await knex.schema.createTable("roles_pages", (table) => {
      table.string("roles_id", 100).notNullable().references("id").inTable("roles").onDelete("CASCADE");
      table.integer("pages_id").unsigned().notNullable().references("id").inTable("pages").onDelete("CASCADE");
      table.integer("inherit_monitors").notNullable().defaultTo(1);
      table.timestamp("created_at").defaultTo(knex.fn.now());
      table.timestamp("updated_at").defaultTo(knex.fn.now());
      table.primary(["roles_id", "pages_id"]);
      table.index("pages_id", "idx_roles_pages_pages_id");
    });
  }

  // 5. roles_monitors
  if (!(await knex.schema.hasTable("roles_monitors"))) {
    await knex.schema.createTable("roles_monitors", (table) => {
      table.string("roles_id", 100).notNullable().references("id").inTable("roles").onDelete("CASCADE");
      table.string("monitor_tag", 255).notNullable();
      table.timestamp("created_at").defaultTo(knex.fn.now());
      table.timestamp("updated_at").defaultTo(knex.fn.now());
      table.primary(["roles_id", "monitor_tag"]);
    });
  }

  // 6. New columns on pages
  const hasIsPublicPage = await knex.schema.hasColumn("pages", "is_public");
  if (!hasIsPublicPage) {
    await knex.schema.alterTable("pages", (table) => {
      table.integer("is_public").notNullable().defaultTo(1);
    });
  }
  const hasVisibilityMode = await knex.schema.hasColumn("pages", "visibility_mode");
  if (!hasVisibilityMode) {
    await knex.schema.alterTable("pages", (table) => {
      table.string("visibility_mode", 20).notNullable().defaultTo("hidden");
    });
  }

  // 7. New column on monitors
  const hasIsPublicMonitor = await knex.schema.hasColumn("monitors", "is_public");
  if (!hasIsPublicMonitor) {
    await knex.schema.alterTable("monitors", (table) => {
      table.integer("is_public").notNullable().defaultTo(1);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("roles_monitors");
  await knex.schema.dropTableIfExists("roles_pages");
  await knex.schema.dropTableIfExists("groups_roles");
  await knex.schema.dropTableIfExists("users_groups");
  await knex.schema.dropTableIfExists("groups");

  const hasIsPublicPage = await knex.schema.hasColumn("pages", "is_public");
  if (hasIsPublicPage) {
    await knex.schema.alterTable("pages", (table) => { table.dropColumn("is_public"); });
  }
  const hasVisibilityMode = await knex.schema.hasColumn("pages", "visibility_mode");
  if (hasVisibilityMode) {
    await knex.schema.alterTable("pages", (table) => { table.dropColumn("visibility_mode"); });
  }
  const hasIsPublicMonitor = await knex.schema.hasColumn("monitors", "is_public");
  if (hasIsPublicMonitor) {
    await knex.schema.alterTable("monitors", (table) => { table.dropColumn("is_public"); });
  }
}
