import Knex, { type Knex as KnexType } from "knex";
import GC from "../../global-constants.js";
import { GetRequiredSecrets, ReplaceAllOccurrences } from "../tool.js";
import { performance } from "node:perf_hooks";
import type { SqlMonitor, MonitoringResult } from "../types/monitor.js";

class SqlCall {
  monitor: SqlMonitor;
  envSecrets: Array<{ find: string; replace: string | undefined }>;

  constructor(monitor: SqlMonitor) {
    this.monitor = monitor;
    this.envSecrets = GetRequiredSecrets(`${monitor.type_data.connectionString}`);
  }

  async execute(): Promise<MonitoringResult> {
    let client = this.monitor.type_data.dbType;
    let connection = this.monitor.type_data.connectionString;
    for (let i = 0; i < this.envSecrets.length; i++) {
      const secret = this.envSecrets[i];
      if (secret.replace !== undefined) {
        connection = ReplaceAllOccurrences(connection, secret.find, secret.replace);
      }
    }
    let query = this.monitor.type_data.query;
    let timeout = this.monitor.type_data.timeout || 5000;

    const startTime = performance.now();
    let knexInstance: KnexType | null = null;

    try {
      // Create database configuration
      const config = {
        client: client,
        connection: connection,
        pool: { min: 0, max: 1 },
        acquireConnectionTimeout: timeout,
      };

      // Initialize knex
      knexInstance = Knex(config);

      if (client === "sqlite3" || client === "better-sqlite3") {
        // SQLite does not support server-side query cancellation via the Knex timeout
        // option, so we fall back to Promise.race. The query will continue running in
        // the background after the timeout fires, but connection cleanup in `finally`
        // will still occur.
        let timeoutHandle: ReturnType<typeof setTimeout>;
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutHandle = setTimeout(() => reject(new Error("Query timeout")), timeout);
        });
        const queryPromise = knexInstance.raw(query).finally(() => clearTimeout(timeoutHandle!));
        await Promise.race([queryPromise, timeoutPromise]);
      } else {
        // For MySQL and PostgreSQL, Knex supports a built-in timeout with { cancel: true }
        // which sends a KILL QUERY / pg_cancel_backend() so the query is actually stopped
        // on the server rather than merely abandoned client-side.
        await knexInstance.raw(query).timeout(timeout, { cancel: true });
      }

      // Calculate latency
      const latency = Math.round(performance.now() - startTime);

      return {
        status: GC.UP,
        latency: latency,
        type: GC.REALTIME,
      };
    } catch (error: unknown) {
      let errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.length > 200) {
        errorMessage = errorMessage.substring(0, 200) + "...";
      }
      console.log(`Error executing SQL query for monitor with tag ${this.monitor.tag}:`, errorMessage);
      const latency = Math.round(performance.now() - startTime);

      // Handle timeout specifically
      if (error instanceof Error && error.message === "Query timeout") {
        return {
          status: GC.DOWN,
          latency: latency,
          type: GC.TIMEOUT,
          error_message: "Query execution exceeded timeout of " + timeout + "ms",
        };
      }

      // Handle other connection or query errors
      return {
        status: GC.DOWN,
        latency: latency,
        type: GC.ERROR,
        error_message: errorMessage,
      };
    } finally {
      // Destroy knex instance to clean up connections
      if (knexInstance) {
        try {
          await knexInstance.destroy();
        } catch (destroyError) {
          console.error("Error closing database connection:", destroyError);
        }
      }
    }
  }
}

export default SqlCall;
