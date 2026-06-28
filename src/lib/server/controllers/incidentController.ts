import db from "../db/db.js";
import type {
  MonitorRecordInsert,
  TriggerRecordInsert,
  MonitoringDataInsert,
  MonitorAlertInsert,
  IncidentFilter,
  MonitorAlert,
  TriggerFilter,
  UserRecordInsert,
  UserRecord,
  MonitorRecordTyped,
  IncidentRecord,
  IncidentCommentRecord,
  MonitorAlertV2Record,
  MonitorAlertConfigRecord,
} from "../types/db.js";
import GC from "../../global-constants.js";
import { getUnixTime, differenceInSeconds } from "date-fns";

interface IncidentsDashboardInput {
  page: number;
  limit: number;
  filter: {
    status: string;
  };
}

export interface IncidentInput {
  title: string;
  start_date_time: number;
  end_date_time?: number | null;
  status?: string;
  state?: string;
  incident_type?: string;
  incident_source?: string;
  is_global?: string;
}

interface IncidentUpdateInput {
  title?: string;
  start_date_time?: number;
  end_date_time?: number | null;
  status?: string;
  state?: string;
  is_global?: string;
}

export const GetIncidentsOpenHome = async (
  homeIncidentCount: number | null,
  start: number,
  end: number,
): Promise<unknown[]> => {
  const count = parseInt(String(homeIncidentCount), 10);
  if (isNaN(count) || count <= 0) return [];
  homeIncidentCount = count;
  let incidents = (await db.getRecentUpdatedIncidents(homeIncidentCount, start, end)) as (IncidentRecord & {
    monitors?: unknown[];
    comments?: unknown[];
  })[];

  if (incidents.length === 0) return incidents;

  const ids = incidents.map((i) => i.id);
  const allMonitors = await db.getIncidentMonitorsByIncidentIds(ids);
  const monitorsMap = new Map<number, Array<{ monitor_tag: string; monitor_impact: string | null }>>();
  for (const m of allMonitors) {
    const list = monitorsMap.get(m.incident_id) ?? [];
    list.push({ monitor_tag: m.monitor_tag, monitor_impact: m.monitor_impact });
    monitorsMap.set(m.incident_id, list);
  }

  const allComments = await db.getActiveIncidentCommentsByIncidentIds(ids);
  const commentsMap = new Map<number, IncidentCommentRecord[]>();
  for (const c of allComments) {
    const list = commentsMap.get(c.incident_id) ?? [];
    list.push(c);
    commentsMap.set(c.incident_id, list);
  }

  for (const incident of incidents) {
    incident.monitors = monitorsMap.get(incident.id) ?? [];
    incident.comments = commentsMap.get(incident.id) ?? [];
  }

  return incidents;
};

export const GetIncidentComments = async (incident_id: number): Promise<IncidentCommentRecord[]> => {
  let incidentExists = await db.getIncidentById(incident_id);
  if (!incidentExists) {
    throw new Error(`Incident with id ${incident_id} does not exist`);
  }
  return await db.getIncidentComments(incident_id);
};
export const GetIncidentActiveComments = async (incident_id: number): Promise<IncidentCommentRecord[]> => {
  return await db.getActiveIncidentComments(incident_id);
};

export const GetIncidentMonitors = async (
  incident_id: number,
): Promise<Array<{ monitor_tag: string; monitor_impact: string | null }>> => {
  let incidentMonitors = await db.getIncidentMonitorsByIncidentID(incident_id);
  return incidentMonitors.map((m) => ({
    monitor_tag: m.monitor_tag,
    monitor_impact: m.monitor_impact,
  }));
};

export const RemoveIncidentMonitor = async (incident_id: number, monitor_tag: string): Promise<number> => {
  let incidentExists = await db.getIncidentById(incident_id);
  if (!incidentExists) {
    throw new Error(`Incident with id ${incident_id} does not exist`);
  }
  return await db.removeIncidentMonitor(incident_id, monitor_tag);
};

export const GetIncidentsDashboard = async (
  data: IncidentsDashboardInput,
): Promise<{ incidents: unknown[]; total: number }> => {
  let filter: IncidentFilter = {};
  if (data.filter.status != "ALL") {
    filter = { status: data.filter.status };
  }

  let incidents = (await db.getIncidentsPaginatedDesc(data.page, data.limit, filter)) as (IncidentRecord & {
    monitors?: unknown[];
    isAutoCreated?: boolean;
  })[];
  let totalResult = await db.getIncidentsCount(filter);
  let total = totalResult ? Number(totalResult.count) : 0;

  if (incidents.length > 0) {
    const ids = incidents.map((i) => i.id);
    const allMonitors = await db.getIncidentMonitorsByIncidentIds(ids);
    const monitorsMap = new Map<number, Array<{ monitor_tag: string; monitor_impact: string | null }>>();
    for (const m of allMonitors) {
      const list = monitorsMap.get(m.incident_id) ?? [];
      list.push({ monitor_tag: m.monitor_tag, monitor_impact: m.monitor_impact });
      monitorsMap.set(m.incident_id, list);
    }

    for (const incident of incidents) {
      incident.monitors = monitorsMap.get(incident.id) ?? [];
      incident.isAutoCreated = await db.alertExistsIncident(incident.id);
    }
  }

  return {
    incidents: incidents,
    total: total,
  };
};
export const GetIncidentByIDDashboard = async (data: {
  incident_id: number;
}): Promise<Omit<IncidentRecord, "incident_source"> | undefined> => {
  let incident = await db.getIncidentById(data.incident_id);

  return incident;
};
export const GetIncidentsPaginated = async (
  page: number,
  limit: number,
  filter: IncidentFilter,
  direction: "after" | "before",
): Promise<unknown[]> => {
  let incidents = (await db.getIncidentsPaginated(page, limit, filter, direction)) as (IncidentRecord & {
    monitors?: unknown[];
    comments?: unknown[];
  })[];

  if (incidents.length === 0) return incidents;

  const ids = incidents.map((i) => i.id);

  // Batch-fetch all incident monitors and resolve full monitor records
  const rawMonitors = await db.getIncidentMonitorsByIncidentIds(ids);
  const monitorDetailCache: Record<string, unknown> = {};
  for (const m of rawMonitors) {
    if (!monitorDetailCache[m.monitor_tag]) {
      const monitor = await db.getMonitorByTag(m.monitor_tag);
      if (monitor) {
        monitorDetailCache[m.monitor_tag] = {
          id: monitor.id,
          tag: monitor.tag,
          name: monitor.name,
          image: monitor.image,
          impact_type: m.monitor_impact,
        };
      }
    }
  }

  const monitorsMap = new Map<number, unknown[]>();
  for (const m of rawMonitors) {
    const list = monitorsMap.get(m.incident_id) ?? [];
    list.push(monitorDetailCache[m.monitor_tag]);
    monitorsMap.set(m.incident_id, list);
  }

  const allComments = await db.getActiveIncidentCommentsByIncidentIds(ids);
  const commentsMap = new Map<number, IncidentCommentRecord[]>();
  for (const c of allComments) {
    const list = commentsMap.get(c.incident_id) ?? [];
    list.push(c);
    commentsMap.set(c.incident_id, list);
  }

  for (const incident of incidents) {
    incident.monitors = monitorsMap.get(incident.id) ?? [];
    incident.comments = commentsMap.get(incident.id) ?? [];
  }

  return incidents;
};
export const GetIncidentsPage = async (start: number, open: number): Promise<unknown[]> => {
  let incidents = (await db.getIncidentsBetween(start, open)) as (IncidentRecord & {
    monitors?: unknown[];
    comments?: unknown[];
  })[];

  if (incidents.length === 0) return incidents;

  const ids = incidents.map((i) => i.id);
  const allMonitors = await db.getIncidentMonitorsByIncidentIds(ids);
  const monitorsMap = new Map<number, Array<{ monitor_tag: string; monitor_impact: string | null }>>();
  for (const m of allMonitors) {
    const list = monitorsMap.get(m.incident_id) ?? [];
    list.push({ monitor_tag: m.monitor_tag, monitor_impact: m.monitor_impact });
    monitorsMap.set(m.incident_id, list);
  }

  const allComments = await db.getActiveIncidentCommentsByIncidentIds(ids);
  const commentsMap = new Map<number, IncidentCommentRecord[]>();
  for (const c of allComments) {
    const list = commentsMap.get(c.incident_id) ?? [];
    list.push(c);
    commentsMap.set(c.incident_id, list);
  }

  for (const incident of incidents) {
    incident.monitors = monitorsMap.get(incident.id) ?? [];
    incident.comments = commentsMap.get(incident.id) ?? [];
  }

  return incidents;
};
export const GetIncidentsByIDS = async (ids: number[]): Promise<unknown[]> => {
  if (ids.length == 0) {
    return [];
  }
  let incidents = (await db.getIncidentsByIds(ids)) as (IncidentRecord & {
    monitors?: unknown[];
    comments?: unknown[];
  })[];
  for (let i = 0; i < incidents.length; i++) {
    incidents[i].monitors = [];
  }

  //get comments
  for (let i = 0; i < incidents.length; i++) {
    incidents[i].comments = await GetIncidentActiveComments(incidents[i].id);
  }

  return incidents;
};

export const CreateNewIncidentWithCommentAndMonitor = async (
  data: IncidentInput,
  update: string,
  monitorTag: string,
  monitorStatus: string,
): Promise<{ incident_id: number }> => {
  let incidentCreation: { incident_id: number } | null = null;
  try {
    incidentCreation = await CreateIncident(data);
    await AddIncidentComment(incidentCreation.incident_id, update, GC.INVESTIGATING, data.start_date_time);
    await AddIncidentMonitor(incidentCreation.incident_id, monitorTag, monitorStatus);
    return incidentCreation;
  } catch (err) {
    // Compensate: remove the incident if the comment/monitor association failed,
    // so orphaned incidents cannot suppress future alerts
    if (incidentCreation?.incident_id) {
      try {
        await db.deleteIncident(incidentCreation.incident_id);
      } catch (cleanupErr) {
        console.error(`Failed to clean up partial incident #${incidentCreation.incident_id}:`, cleanupErr);
      }
    }
    throw err;
  }
};

export const IncidentCreateAlertMarkdown = (
  alert: MonitorAlertV2Record,
  config: MonitorAlertConfigRecord,
  monitorName: string,
  monitorTag: string,
  incidentState: string,
): string => {
  let update = config.alert_description || "Alert triggered";
  update = `${config.alert_description || "Alert triggered"}\n\n`;
  update = update + `| Setting | Value |\n`;
  update = update + `| :--- | :--- |\n`;
  update = update + `| **Monitor Name** | ${monitorName} |\n`;
  update = update + `| **Monitor Tag** | ${monitorTag} |\n`;
  update = update + `| **Incident Status** | ${incidentState} |\n`;
  update = update + `| **Severity** | ${config.severity} |\n`;
  update = update + `| **Alert Type** | ${config.alert_for} |\n`;
  update = update + `| **Alert Value** | ${config.alert_value} |\n`;
  update = update + `| **Failure Threshold** | ${config.failure_threshold} |\n`;
  return update;
};

export const ClosureCommentAlertMarkdown = (
  alert: MonitorAlertV2Record,
  config: MonitorAlertConfigRecord,
  monitorName: string,
  monitorTag: string,
  incidentState: string,
): string => {
  let comment = "The alert has been resolved";

  // Calculate duration in seconds between created_at and updated_at
  const durationInSeconds = differenceInSeconds(new Date(alert.updated_at), new Date(alert.created_at));
  const durationInMinutes = Math.round(durationInSeconds / 60);

  comment = comment + `, Total duration: ${durationInMinutes} minutes`;

  // Add alert details
  comment = comment + `\n\n#### Alert Details\n\n`;
  comment = comment + `| Setting | Value |\n`;
  comment = comment + `| :--- | :--- |\n`;
  comment = comment + `| **Monitor Name** | ${monitorName} |\n`;
  comment = comment + `| **Incident Status** | ${incidentState} |\n`;
  comment = comment + `| **Monitor Tag** | ${monitorTag} |\n`;
  comment = comment + `| **Alert Type** | ${config.alert_for} |\n`;
  comment = comment + `| **Alert Value** | ${config.alert_value} |\n`;
  comment = comment + `| **Severity** | ${config.severity} |\n`;
  comment = comment + `| **Failure Threshold** | ${config.failure_threshold} |\n`;
  comment = comment + `| **Success Threshold** | ${config.success_threshold} |\n`;

  return comment;
};

export const CreateIncident = async (data: IncidentInput): Promise<{ incident_id: number }> => {
  //return error if no title or startDateTime
  if (!data.title || !data.start_date_time) {
    throw new Error("Title and startDateTime are required");
  }

  let incident = {
    title: data.title,
    start_date_time: data.start_date_time,
    status: !!data.status ? data.status : "OPEN",
    end_date_time: !!data.end_date_time ? data.end_date_time : null,
    state: !!data.state ? data.state : "INVESTIGATING",
    incident_type: !!data.incident_type ? data.incident_type : "INCIDENT",
    incident_source: !!data.incident_source ? data.incident_source : "DASHBOARD",
    is_global: data.is_global || "YES",
  };

  //incident_type == INCIDENT delete endDateTime
  if (incident.incident_type === "INCIDENT") {
    incident.end_date_time = null;
  }

  //if endDateTime is provided and it is less than startDateTime, throw error
  if (!!incident.end_date_time && incident.end_date_time < incident.start_date_time) {
    throw new Error("End date time cannot be less than start date time");
  }

  let newIncident = await db.createIncident(incident);

  //we need to
  // queueController.PushDataToQueue(newIncident.id, "createIncident", {
  //   message: `${incident.incident_type} Created`,
  //   ...incident,
  // });
  return {
    incident_id: newIncident.id,
  };
};

export const UpdateIncident = async (incident_id: number, data: IncidentUpdateInput): Promise<number> => {
  let incidentExists = await db.getIncidentById(incident_id);

  if (!incidentExists) {
    throw new Error(`Incident with id ${incident_id} does not exist`);
  }

  const effectiveStart = data.start_date_time ?? incidentExists.start_date_time;
  if (data.end_date_time && data.end_date_time < effectiveStart) {
    throw new Error("End date time cannot be less than start date time");
  }

  let updateObject: Partial<IncidentRecord> & { id: number } = {
    id: incident_id,
    title: data.title !== undefined ? data.title : incidentExists.title,
    start_date_time: data.start_date_time !== undefined ? data.start_date_time : incidentExists.start_date_time,
    status: data.status !== undefined ? data.status : incidentExists.status,
    state: data.state !== undefined ? data.state : incidentExists.state,
    end_date_time: data.end_date_time !== undefined ? data.end_date_time : incidentExists.end_date_time,
    is_global: data.is_global !== undefined ? data.is_global : incidentExists.is_global,
  };

  //check if updateObject same as incidentExists
  // if (
  //   JSON.stringify(updateObject) ===
  //   JSON.stringify({
  //     id: incidentExists.id,
  //     title: incidentExists.title,
  //     start_date_time: incidentExists.start_date_time,
  //     status: incidentExists.status,
  //     state: incidentExists.state,
  //     end_date_time: incidentExists.end_date_time,
  //   })
  // ) {
  //   queueController.PushDataToQueue(incident_id, "updateIncident", {
  //     message: `${incidentExists.incident_type} has been updated to ${updateObject.state}`,
  //     incident_type: incidentExists.incident_type,
  //     title: incidentExists.title,
  //   });
  // }

  return await db.updateIncident(updateObject as IncidentRecord);
};

export const AddIncidentMonitor = async (
  incident_id: number,
  monitor_tag: string,
  monitor_impact: string,
): Promise<number[]> => {
  //monitor_impact must be DOWN or DEGRADED or MAINTENANCE or NONE
  if (
    ![GC.DOWN, GC.DEGRADED, GC.MAINTENANCE].includes(
      monitor_impact as typeof GC.DOWN | typeof GC.DEGRADED | typeof GC.MAINTENANCE,
    )
  ) {
    throw new Error("Monitor impact must be either DOWN, DEGRADED, MAINTENANCE");
  }

  //check if monitor exists
  let monitorExists = await db.getMonitorByTag(monitor_tag);
  if (!monitorExists) {
    throw new Error(`Monitor with tag ${monitor_tag} does not exist`);
  }

  //check if incident exists
  let incidentExists = await db.getIncidentById(incident_id);
  if (!incidentExists) {
    throw new Error(`Incident with id ${incident_id} does not exist`);
  }

  // queueController.PushDataToQueue(incident_id, "insertIncidentMonitor", {
  //   title: incidentExists.title,
  //   message: `Monitor ${monitor_tag} added to ${incidentExists.incident_type}. Impact is ${monitor_impact}`,
  //   incident_type: incidentExists.incident_type,
  // });
  return await db.insertIncidentMonitorWithMerge({
    incident_id,
    monitor_tag,
    monitor_impact,
  });
};

export const UpdateCommentByID = async (
  incident_id: number,
  comment_id: number,
  comment: string,
  state: string,
  commented_at: number,
): Promise<number> => {
  let incidentExists = await db.getIncidentById(incident_id);
  if (!incidentExists) {
    throw new Error(`Incident with id ${incident_id} does not exist`);
  }
  let commentExists = await db.getIncidentCommentByIDAndIncident(incident_id, comment_id);
  if (!commentExists) {
    throw new Error(`Comment with id ${comment_id} does not exist`);
  }
  // queueController.PushDataToQueue(incident_id, "updateIncidentComment", {
  //   title: incidentExists.title,
  //   message: `${comment}`,
  //   incident_type: incidentExists.incident_type,
  // });
  let c = await db.updateIncidentCommentByID(comment_id, comment, state, commented_at);
  if (c) {
    let incidentUpdate: IncidentUpdateInput = {
      state: state,
    };
    if (state === GC.RESOLVED) {
      incidentUpdate.end_date_time = commented_at;
    } else {
      if (incidentExists.state === GC.RESOLVED) {
        await db.setIncidentEndTimeToNull(incident_id);
      }
    }
    await UpdateIncident(incident_id, incidentUpdate);
  }
  return c;
};
export const AddIncidentComment = async (
  incident_id: number,
  comment: string,
  state: string,
  commented_at: number,
): Promise<IncidentCommentRecord> => {
  let incidentExists = await db.getIncidentById(incident_id);
  if (!incidentExists) {
    throw new Error(`Incident with id ${incident_id} does not exist`);
  }

  if (!!!state) {
    state = incidentExists.state;
  }

  let c = await db.insertIncidentComment(incident_id, comment, state, commented_at);
  let incidentType = incidentExists.incident_type;
  //update incident state
  if (c && incidentType === GC.INCIDENT) {
    let incidentUpdate: IncidentUpdateInput = {
      state: state,
    };
    if (state === GC.RESOLVED) {
      incidentUpdate.end_date_time = commented_at;
    } else {
      if (incidentExists.state === GC.RESOLVED) {
        await db.setIncidentEndTimeToNull(incident_id);
      }
    }
    await UpdateIncident(incident_id, incidentUpdate);
  }

  return c;
};

export const UpdateCommentStatusByID = async (
  incident_id: number,
  comment_id: number,
  status: string,
): Promise<number> => {
  let commentExists = await db.getIncidentCommentByIDAndIncident(incident_id, comment_id);
  if (!commentExists) {
    throw new Error(`Comment with id ${comment_id} does not exist`);
  }
  return await db.updateIncidentCommentStatusByID(comment_id, status);
};

export const ParseIncidentToAPIResp = async (
  incident_id: number,
): Promise<{
  id: number;
  start_date_time: number;
  end_date_time: number | null;
  created_at: Date;
  updated_at: Date;
  title: string;
  status: string;
  state: string;
}> => {
  let incident = await db.getIncidentById(incident_id);
  if (!incident) {
    throw new Error(`Incident with id ${incident_id} not found`);
  }
  let resp = {
    id: incident.id,
    start_date_time: incident.start_date_time,
    end_date_time: incident.end_date_time,
    created_at: incident.created_at,
    updated_at: incident.updated_at,
    title: incident.title,
    status: incident.status,
    state: incident.state,
  };

  return resp;
};

export const DeleteIncident = async (incident_id: number): Promise<{ success: boolean }> => {
  const incident = await db.getIncidentById(incident_id);
  if (!incident) {
    throw new Error(`Incident with id ${incident_id} does not exist`);
  }

  // Set incident_id to null in monitor_alerts_v2
  const alerts = await db.getAlertsByIncidentId(incident_id);
  for (const alert of alerts) {
    await db.updateMonitorAlertV2(alert.id, { incident_id: null });
  }

  // Delete incident monitors
  const monitors = await db.getIncidentMonitorsByIncidentID(incident_id);
  for (const monitor of monitors) {
    await db.removeIncidentMonitor(incident_id, monitor.monitor_tag);
  }

  // Delete incident comments permanently
  await db.deleteIncidentCommentsByIncidentID(incident_id);

  // Delete the incident
  await db.deleteIncident(incident_id);

  return { success: true };
};
