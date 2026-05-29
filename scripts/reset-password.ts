#!/usr/bin/env node
/**
 * Usage (inside the container):
 *   node --experimental-strip-types /app/scripts/reset-password.ts --email user@example.com
 *   node --experimental-strip-types /app/scripts/reset-password.ts --email user@example.com --password 'NewPass1!'
 *
 * Password rules: min 8 chars, at least one uppercase, one lowercase, one digit.
 */

import readline from "readline";
import bcrypt from "bcrypt";
import knex from "knex";
import dotenv from "dotenv";

dotenv.config();

const SALT_ROUNDS = 12;

function parseArgs(): { email: string | null; password: string | null } {
  const args = process.argv.slice(2);
  let email: string | null = null;
  let password: string | null = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--email" && args[i + 1]) email = args[++i];
    else if (args[i] === "--password" && args[i + 1]) password = args[++i];
  }
  return { email, password };
}

function validatePassword(pw: string): string | null {
  if (pw.length < 8) return "Mindestens 8 Zeichen erforderlich.";
  if (!/[A-Z]/.test(pw)) return "Mindestens ein Großbuchstabe erforderlich.";
  if (!/[a-z]/.test(pw)) return "Mindestens ein Kleinbuchstabe erforderlich.";
  if (!/\d/.test(pw)) return "Mindestens eine Ziffer erforderlich.";
  return null;
}

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (ans) => { rl.close(); resolve(ans.trim()); }));
}

function promptHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    process.stdout.write(question);
    process.stdin.setRawMode?.(true);
    let input = "";
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    const onData = (ch: string) => {
      if (ch === "\n" || ch === "\r" || ch === "") {
        process.stdin.setRawMode?.(false);
        process.stdin.removeListener("data", onData);
        process.stdout.write("\n");
        rl.close();
        resolve(input);
      } else if (ch === "") {
        process.stdout.write("\n");
        process.exit(0);
      } else if (ch === "") {
        input = input.slice(0, -1);
      } else {
        input += ch;
      }
    };
    process.stdin.on("data", onData);
  });
}

function buildKnex() {
  const databaseURL = process.env.DATABASE_URL || "sqlite://./database/kener.sqlite.db";
  const [type, path] = databaseURL.split("://");
  if (type === "sqlite") {
    return knex({ client: "better-sqlite3", connection: { filename: path }, useNullAsDefault: true });
  } else if (type === "postgresql") {
    return knex({ client: "pg", connection: databaseURL });
  } else if (type === "mysql") {
    return knex({ client: "mysql2", connection: databaseURL });
  }
  console.error(`Unbekannter Datenbanktyp: ${type}`);
  process.exit(1);
}

async function main() {
  let { email, password } = parseArgs();

  if (!email) {
    email = await prompt("E-Mail-Adresse: ");
  }
  if (!email) {
    console.error("Fehler: E-Mail-Adresse ist erforderlich.");
    process.exit(1);
  }

  const db = buildKnex();

  try {
    const user = await db("users").where({ email }).first();
    if (!user) {
      console.error(`Fehler: Kein User mit der E-Mail '${email}' gefunden.`);
      process.exit(1);
    }
    console.log(`User gefunden: ${user.name} (${user.email})`);

    if (!password) {
      while (true) {
        password = await promptHidden("Neues Passwort: ");
        const confirm = await promptHidden("Passwort bestätigen: ");
        if (password !== confirm) {
          console.log("Passwörter stimmen nicht überein. Bitte erneut versuchen.");
          password = null;
          continue;
        }
        const err = validatePassword(password);
        if (err) {
          console.log(`Ungültiges Passwort: ${err}`);
          password = null;
          continue;
        }
        break;
      }
    } else {
      const err = validatePassword(password);
      if (err) {
        console.error(`Ungültiges Passwort: ${err}`);
        process.exit(1);
      }
    }

    const hash = await bcrypt.hash(password!, SALT_ROUNDS);
    await db("users").where({ email }).update({ password_hash: hash, must_change_password: 0 });
    console.log(`✓ Passwort für '${email}' erfolgreich zurückgesetzt.`);
  } finally {
    await db.destroy();
  }
}

main().catch((err) => {
  console.error("Fehler:", err.message);
  process.exit(1);
});
