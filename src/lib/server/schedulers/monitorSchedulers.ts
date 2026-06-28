import type { MonitorRecordTyped } from "../types/db";
import { Queue, Worker, Job, type JobsOptions, type JobSchedulerTemplateOptions } from "bullmq";
import { Cron } from "croner";
import q from "../queues/q.js";
import { Minuter } from "../cron-minute.js";

let monitorScheduleQueue: Queue | null = null;
let worker: Worker | null = null;
const queueName = "monitorScheduleQueue";

const getQueue = () => {
  if (!monitorScheduleQueue) {
    monitorScheduleQueue = q.createQueue(queueName);
  }
  //ensure worker is created
  addWorker(monitorScheduleQueue);
  return monitorScheduleQueue;
};

export const getSchedulers = async () => {
  const queue = getQueue();
  return await queue.getJobSchedulers();
};

const addWorker = (queue: Queue) => {
  if (worker) return worker;

  // Use a fixed, safely-large concurrency so adding monitors later never
  // freezes the worker (dynamic concurrency cannot be updated after creation).
  worker = q.createWorker(
    queue,
    async (job: Job) => {
      const monitor = job.data as MonitorRecordTyped;
      await Minuter(monitor);
    },
    {
      concurrency: 50,
    },
  );
};

//add job to scheduler queue
export const addJobToSchedulerQueue = async (
  monitor: MonitorRecordTyped,
  id: string,
  options?: JobSchedulerTemplateOptions,
) => {
  if (!monitor.cron) {
    throw new Error("Monitor cron expression is undefined");
  }
  try {
    // Validate by constructing — croner throws on an invalid pattern.
    new Cron(monitor.cron, { maxRuns: 0 });
  } catch {
    console.warn(`[monitorSchedulers] skipping monitor '${monitor.tag}': invalid cron '${monitor.cron}'`);
    return;
  }
  if (!options) {
    options = {};
  }
  options.removeOnComplete = {
    age: 300, // keep up to 5 minutes
    count: 100, // keep up to 100 jobs
  };
  options.removeOnFail = {
    age: 24 * 3600, // keep up to 24 hours
  };
  const queue = getQueue();
  await queue.upsertJobScheduler(
    id,
    {
      pattern: monitor.cron,
      immediately: true,
    },
    {
      data: monitor,
      opts: options,
    },
  );
};

//remove job from scheduler queue
export const removeJobFromSchedulerQueue = async (id: string) => {
  const queue = getQueue();
  await queue.removeJobScheduler(id);
};

//graceful shutdown
export const shutdown = async () => {
  if (worker) {
    await worker.close();
    worker = null;
  }
};

export default {
  shutdown,
};
