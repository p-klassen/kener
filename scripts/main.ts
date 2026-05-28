import dotenv from "dotenv";
dotenv.config();

import express from "express";
import Startup from "../src/lib/server/startup.ts";
import shutdownSchedulers from "../src/lib/server/schedulers/shutdown.ts";
import shutdownQueues from "../src/lib/server/queues/shutdown.ts";
import dbInstance from "../src/lib/server/db/db.ts";
import { CreateFirstUser } from "../src/lib/server/controllers/userController.ts";
import knex from "knex";
import knexOb from "../knexfile.js";

const PORT = process.env.PORT || 3000;
const base = process.env.KENER_BASE_PATH || "";

function validateRequiredEnvVars(): void {
	const required = ["KENER_SECRET_KEY", "ORIGIN", "REDIS_URL"];
	const missing = required.filter((k) => !process.env[k]);
	if (missing.length > 0) {
		console.error(`Fatal: missing required environment variables: ${missing.join(", ")}`);
		process.exit(1);
	}
}

async function start() {
	// Dynamic import so BODY_SIZE_LIMIT from .env is available
	// before the handler reads it at module top-level
	const { handler } = await import("../build/handler.js");

	validateRequiredEnvVars();

	const app: any = express();
	const db = knex(knexOb);

	app.get(base + "/healthcheck", (req: any, res: any) => {
		res.end("ok");
	});

	app.use(handler);

	//migrations
	async function runMigrations() {
		try {
			// Rename old .js migration entries to .ts in the knex_migrations table
			// so Knex can find the renamed files on disk
			const hasTable = await db.schema.hasTable("knex_migrations");
			if (hasTable) {
				const oldJsMigrations = await db("knex_migrations").where("name", "like", "%.js");
				for (const row of oldJsMigrations) {
					const newName = row.name.replace(/\.js$/, ".ts");
					await db("knex_migrations").where("id", row.id).update({ name: newName });
					console.log(`Renamed migration record: ${row.name} -> ${newName}`);
				}
			}

			console.log("Running migrations...");
			await db.migrate.latest(); // Runs migrations to the latest state
			console.log("Migrations completed successfully!");
		} catch (err) {
			console.error("Error running migrations:", err);
		}
	}

	//seed
	async function runSeed() {
		try {
			console.log("Running seed...");
			await db.seed.run(); // Runs seed to the latest state
			console.log("Seed completed successfully!");
		} catch (err) {
			console.error("Error running seed:", err);
		}
	}

	app.listen(PORT, async () => {
		try {
			await runMigrations();
			await runSeed();
			// Auto-create default admin from environment variables (only when DB has zero users)
			const adminEmail = process.env.KENER_ADMIN_EMAIL;
			const adminPassword = process.env.KENER_ADMIN_PASSWORD;
			if (adminEmail && adminPassword) {
				const countRow = await dbInstance.getUsersCount();
				const userCount = countRow ? Number(countRow.count) : 0;
				if (userCount === 0) {
					try {
						await CreateFirstUser({
							email: adminEmail,
							password: adminPassword,
							name: "Administrator",
							must_change_password: 1,
						});
						console.log(`Default admin created for ${adminEmail}`);
					} catch (err) {
						console.error("Failed to create default admin:", err);
					}
				}
			} else if (adminEmail || adminPassword) {
				console.warn("KENER_ADMIN_EMAIL and KENER_ADMIN_PASSWORD must both be set to auto-create the default admin. Skipping.");
			}
			await db.destroy();
			await Startup();
			console.log("Kener is running on port " + PORT + "!");
		} catch (err) {
			console.error("Fatal error during startup:", err);
			process.exit(1);
		}
	});

	// Graceful shutdown handler
	async function gracefulShutdown(signal: string) {
		console.log(`\nReceived ${signal}. Starting graceful shutdown...`);

		// Hard timeout: force-exit after 30 s if shutdown hangs
		const forceExit = setTimeout(() => {
			console.error("Graceful shutdown timed out after 30 s — forcing exit");
			process.exit(1);
		}, 30_000);
		forceExit.unref(); // don't keep the process alive just for this timer

		try {
			console.log("Shutting down schedulers...");
			await shutdownSchedulers();
			console.log("Schedulers shut down successfully.");

			console.log("Shutting down queues...");
			await shutdownQueues();
			console.log("Queues shut down successfully.");

			console.log("Closing database connection...");
			await dbInstance.close();
			console.log("Database connection closed successfully.");

			clearTimeout(forceExit);
			console.log("Graceful shutdown completed.");
			process.exit(0);
		} catch (err) {
			console.error("Error during graceful shutdown:", err);
			clearTimeout(forceExit);
			process.exit(1);
		}
	}

	// Handle termination signals
	process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
	process.on("SIGINT", () => gracefulShutdown("SIGINT"));
}

start();
