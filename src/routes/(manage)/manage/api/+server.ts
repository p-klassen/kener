import { json } from "@sveltejs/kit";
import Service, { type MonitorWithType } from "$lib/server/services/service.js";
import { format } from "date-fns";
import sharp from "sharp";
import { nanoid } from "nanoid";
import db from "$lib/server/db/db";
import GC from "$lib/global-constants.js";
import {
  CreateUpdateMonitor,
  UpdateMonitoringData,
  InsertKeyValue,
  GetMonitors,
  CreateUpdateTrigger,
  GetAllTriggers,
  UpdateTriggerData,
  DeleteTrigger,
  GetIncidentByIDDashboard,
  GetMonitorsParsed,
  GetAllAPIKeys,
  GetAllSiteData,
  CreateNewAPIKey,
  UpdateApiKeyStatus,
  DeleteApiKey,
  GetIncidentsDashboard,
  CreateIncident,
  AddIncidentMonitor,
  RemoveIncidentMonitor,
  GetIncidentActiveComments,
  UpdateCommentStatusByID,
  AddIncidentComment,
  UpdateCommentByID,
  UpdateIncident,
  DeleteIncident,
  GetTriggerByID,
  GetLoggedInSession,
  UpdateUserData,
  UpdatePassword,
  ChangeOwnEmail,
  AdminResetPassword,
  SendInvitationEmail,
  SendVerificationEmail,
  ResendInvitationEmail,
  GetAllUsersPaginatedDashboard,
  GetUserByIDDashboard,
  GetAllUsers,
  GetAllUsersPaginated,
  GetUsersCount,
  GetUserByID,
  GetUserByEmail,
  ManualUpdateUserData,
  DeleteMonitorCompletelyUsingTag,
  CloneMonitor,
  GetSiteDataByKey,
  GetMonitoringDataPaginated,
} from "$lib/server/controllers/controller.js";

import { GetNowTimestampUTC } from "$lib/server/tool.js";
import {
  CreatePage,
  GetAllPages,
  GetPageById,
  UpdatePage,
  DeletePage,
  AddMonitorToPage,
  RemoveMonitorFromPage,
  GetPageMonitors,
  ReorderPageMonitors,
} from "$lib/server/controllers/pagesController.js";
import {
  CreateMaintenance,
  GetMaintenanceWithEvents,
  GetMaintenancesDashboard,
  UpdateMaintenance,
  DeleteMaintenance,
  CreateMaintenanceEvent,
  GetMaintenanceEventById,
  GetMaintenanceEventsByMaintenanceId,
  UpdateMaintenanceEvent,
  DeleteMaintenanceEvent,
  AddMonitorToMaintenance,
  RemoveMonitorFromMaintenance,
  GetMaintenanceMonitors,
  UpdateMaintenanceMonitorImpact,
} from "$lib/server/controllers/maintenanceController.js";
import {
  CreateMonitorAlertConfig,
  UpdateMonitorAlertConfig,
  GetMonitorAlertConfigById,
  GetMonitorAlertConfigsByMonitorTag,
  DeleteMonitorAlertConfig,
  ToggleMonitorAlertConfigStatus,
  GetMonitorAlertsV2Paginated,
  GetMonitorAlertConfigsPaginated,
  DeleteMonitorAlertV2,
  UpdateMonitorAlertV2Status,
  type MonitorAlertConfigRecord,
  type MonitorAlertV2Record,
} from "$lib/server/controllers/monitorAlertConfigController.js";

import {
  GetSubscribersByMethod,
  GetSubscriberWithSubscriptionsV2,
  GetSubscriberCountsByMethod,
  DeleteUserSubscription,
  UpdateUserSubscriptionStatus,
  GetAdminSubscribersPaginated,
  AdminUpdateSubscriptionStatus,
  AdminDeleteSubscriber,
  AdminAddSubscriber,
  AdminUpdateSubscriptionScope,
} from "$lib/server/controllers/userSubscriptionsController.js";
import {
  GetAllGeneralEmailTemplates,
  GetGeneralEmailTemplateById,
  UpdateGeneralEmailTemplate,
} from "$lib/server/controllers/generalTemplateController.js";
import {
  GetAllRoles,
  GetAllPermissions,
  GetRolePermissions,
  UpdateRolePermissions,
  GetRoleUsers,
  AddUserToRole,
  RemoveUserFromRole,
  CreateRole,
  UpdateRole,
  DeleteRole,
  DeleteUser,
  GetUserPermissions,
  RequirePermission,
} from "$lib/server/controllers/userController.js";
import {
  GetAllGroups,
  GetGroupById,
  CreateGroup,
  UpdateGroup,
  DeleteGroup,
  GetGroupMembers,
  AddGroupMember,
  RemoveGroupMember,
  GetGroupRoles,
  AddGroupRole,
  RemoveGroupRole,
} from "$lib/server/controllers/groupsController.js";
import {
  GetRolePages,
  SetRolePages,
  GetRoleMonitors,
  SetRoleMonitors,
  GetUserEffectiveAccess,
} from "$lib/server/controllers/resourceAccessController.js";
import type { SiteDataForNotification } from "$lib/server/notification/types";
import type { SMTPConfiguration } from "$lib/server/notification/types.js";
import { alertToVariables, siteDataToVariables } from "$lib/server/notification/notification_utils";
import { GetResendConfig, GetResendFromENV, GetSMTPConfig, GetSMTPFromENV } from "$lib/server/controllers/commonController.js";
import type { ResendConfiguration } from "$lib/server/controllers/commonController.js";
import getSMTPTransport from "$lib/server/notification/smtps.js";
import type { TriggerMeta } from "$lib/server/types/db.js";
import sendWebhook from "$lib/server/notification/webhook_notification.js";
import sendEmail from "$lib/server/notification/email_notification.js";
import sendDiscord from "$lib/server/notification/discord_notification.js";
import sendSlack from "$lib/server/notification/slack_notification.js";
import heicConvert from "heic-convert";
import serverResolver from "$lib/server/resolver.js";
import { ACTION_PERMISSION_MAP } from "$lib/allPerms.js";
import { exportData, importData } from "$lib/server/controllers/exportImportController.js";
import {
  GetOidcConfig,
  SaveOidcConfig,
  GetLdapConfig,
  SaveLdapConfig,
  GetLdapConfigPublic,
} from "$lib/server/controllers/authConfigController.js";
import { TestLdapConnection } from "$lib/server/controllers/ldapController.js";

export async function POST({ request, cookies }) {
  const payload = await request.json();
  let action = payload.action;
  let data = payload.data || {};
  let resp: any = {};

  let userDB = await GetLoggedInSession(cookies);
  if (!userDB) {
    return json({ error: "User not logged in" }, { status: 401 });
  }

  // Fetch user permissions once for the entire request
  const userPermissions = await GetUserPermissions(userDB.id);

  // Check permission for the action
  const requiredPermission = ACTION_PERMISSION_MAP[action];
  if (requiredPermission === undefined) {
    return json({ error: "Unknown action" }, { status: 400 });
  }
  if (requiredPermission !== null) {
    try {
      RequirePermission(userPermissions, requiredPermission);
    } catch {
      return json({ error: "You do not have permission to perform this action" }, { status: 403 });
    }
  }

  try {
    if (action == "updateUser") {
      data.userID = userDB.id;
      resp = await UpdateUserData(data);
    } else if (action === "updateUserLocale") {
      const { locale } = data;
      if (!locale || typeof locale !== "string") {
        throw new Error("locale is required and must be a string");
      }
      if (locale.length > 10) {
        throw new Error("locale code too long");
      }
      await db.updateUserPreferredLocale(userDB.id, locale);
      resp = { success: true };
    } else if (action == "getAllSiteData") {
      resp = await GetAllSiteData();
    } else if (action == "manualUpdate") {
      await ManualUpdateUserData(data.id, data);
      resp = await GetUserByIDDashboard(data.id);
    } else if (action == "deleteUser") {
      const targetId = parseInt(String(data.id));
      if (!targetId) throw new Error("User ID is required");
      await DeleteUser(userDB.id, targetId);
      resp = { success: true };
    } else if (action == "updatePassword") {
      if (userDB.auth_provider !== "local") {
        throw new Error("Password cannot be changed for accounts authenticated via OIDC or LDAP");
      }
      data.userID = userDB.id;
      resp = await UpdatePassword(data);
    } else if (action == "changeOwnEmail") {
      const { newEmail, currentPassword } = data;
      if (!newEmail || !currentPassword) {
        throw new Error("New email and current password are required");
      }
      await ChangeOwnEmail(userDB.id, newEmail, currentPassword);
      resp = { success: true };
    } else if (action == "adminResetPassword") {
      const { targetUserId, reason } = data;
      if (!targetUserId || !reason) {
        throw new Error("Target user ID and reason are required");
      }
      await AdminResetPassword(userDB.id, parseInt(String(targetUserId)), reason);
      resp = { success: true };
    } else if (action == "createNewUser") {
      await SendInvitationEmail(data.email, data.role_ids, data.name, data.user_type);
      resp = await GetUserByEmail(data.email);
    } else if (action == "resendInvitation") {
      await ResendInvitationEmail(data.email);
      resp = { success: true };
    } else if (action == "sendVerificationEmail") {
      const toId = parseInt(String(data.toId));
      if (!toId) {
        throw new Error("User ID is required");
      }
      // Non-self verification requires users.write permission
      if (toId !== userDB.id) {
        if (!userPermissions.has("users.write")) {
          return json({ error: "You do not have permission to perform this action" }, { status: 403 });
        }
      }
      await SendVerificationEmail(toId, userDB.id);
      resp = { success: true };
    } else if (action == "getUsers") {
      const page = parseInt(String(data.page)) || 1;
      const limit = parseInt(String(data.limit)) || 10;
      const filter: { is_active?: number; user_type?: string } = {};
      if (data.is_active !== undefined && data.is_active !== null) {
        filter.is_active = parseInt(String(data.is_active));
      }
      if (data.user_type_filter && typeof data.user_type_filter === "string" && ["user", "subscriber"].includes(data.user_type_filter)) {
        filter.user_type = data.user_type_filter;
      }
      const hasFilter = Object.keys(filter).length > 0 ? filter : undefined;
      const users = await GetAllUsersPaginatedDashboard({ page, limit }, hasFilter);
      const totalResult = await GetUsersCount(hasFilter);
      const total = totalResult ? Number(totalResult.count) : 0;
      resp = { users, total };
    } else if (action === "storeSiteData") {
      resp = await storeSiteData(data);
    } else if (action == "storeMonitorData") {
      resp = await CreateUpdateMonitor(data);
    } else if (action == "updateMonitoringData") {
      data.type = GC.MANUAL;
      resp = await UpdateMonitoringData(data);
    } else if (action == "getMonitors") {
      resp = await GetMonitors(data);
    } else if (action == "deleteMonitor") {
      resp = await DeleteMonitorCompletelyUsingTag(data.tag);
    } else if (action == "deleteMonitorData") {
      await db.deleteMonitorDataByTag(data.tag || undefined, data.start, data.end);
      resp = { success: true };
    } else if (action == "cloneMonitor") {
      resp = await CloneMonitor({
        sourceTag: String(data.sourceTag || ""),
        newTag: String(data.newTag || ""),
        newName: String(data.newName || ""),
      });
    } else if (action == "createUpdateTrigger") {
      resp = await CreateUpdateTrigger(data);
    } else if (action == "getTriggers") {
      resp = await GetAllTriggers(data);
    } else if (action == "updateMonitorTriggers") {
      resp = await UpdateTriggerData(data);
    } else if (action == "deleteTrigger") {
      resp = await DeleteTrigger(data.trigger_id);
    } else if (action == "getAllAlertsPaginated") {
      const page = parseInt(String(data.page)) || 1;
      const limit = parseInt(String(data.limit)) || 20;
      const filter: { alert_status?: "TRIGGERED" | "RESOLVED"; config_id?: number } = {};
      if (data.status && data.status !== "ALL") filter.alert_status = data.status as "TRIGGERED" | "RESOLVED";
      if (data.config_id) filter.config_id = parseInt(String(data.config_id));
      resp = await GetMonitorAlertsV2Paginated(page, limit, Object.keys(filter).length > 0 ? filter : undefined);
    } else if (action == "getMonitoringDataPaginated") {
      const page = parseInt(String(data.page)) || 1;
      const limit = parseInt(String(data.limit)) || 50;
      const filter: { monitor_tag?: string; start_time?: number; end_time?: number } = {};
      if (data.monitor_tag && data.monitor_tag !== "ALL") {
        filter.monitor_tag = data.monitor_tag;
      }
      if (data.start_time) {
        filter.start_time = parseInt(String(data.start_time));
      }
      if (data.end_time) {
        filter.end_time = parseInt(String(data.end_time));
      }
      resp = await GetMonitoringDataPaginated(page, limit, Object.keys(filter).length > 0 ? filter : undefined);
    } else if (action == "getAPIKeys") {
      resp = await GetAllAPIKeys();
    } else if (action == "createNewApiKey") {
      resp = await CreateNewAPIKey(data);
    } else if (action == "updateApiKeyStatus") {
      resp = await UpdateApiKeyStatus(data);
    } else if (action == "deleteApiKey") {
      const deleted = await DeleteApiKey(data);
      if (!deleted) {
        throw new Error("API key not found");
      }
      resp = { success: true };
    } else if (action == "getIncidents") {
      resp = await GetIncidentsDashboard(data);
    } else if (action == "getIncident") {
      resp = await GetIncidentByIDDashboard(data);
      if (!!!resp) {
        throw new Error("Incident not found");
      }
    } else if (action == "createIncident") {
      resp = await CreateIncident(data);
    } else if (action == "updateIncident") {
      resp = await UpdateIncident(data.id, data);
    } else if (action == "deleteIncident") {
      resp = await DeleteIncident(data.incident_id);
    } else if (action == "addMonitor") {
      resp = await AddIncidentMonitor(data.incident_id, data.monitor_tag, data.monitor_impact);
    } else if (action == "removeMonitor") {
      resp = await RemoveIncidentMonitor(data.incident_id, data.monitor_tag);
    } else if (action == "getComments") {
      resp = await GetIncidentActiveComments(data.incident_id);
    } else if (action == "addComment") {
      resp = await AddIncidentComment(data.incident_id, data.comment, data.state, data.commented_at);
    } else if (action == "deleteComment") {
      resp = await UpdateCommentStatusByID(data.incident_id, data.comment_id, "INACTIVE");
    } else if (action == "updateComment") {
      resp = await UpdateCommentByID(data.incident_id, data.comment_id, data.comment, data.state, data.commented_at);
    } else if (action == "testTrigger") {
      const trigger = await GetTriggerByID(data.trigger_id);
      const siteData = await GetAllSiteData();
      if (!trigger || !siteData) {
        throw new Error("Trigger not found");
      }
      //fetch the last monitor tag from monitoring data and use that for testing instead of "test-monitor"
      const lastMonitoringData = await GetMonitoringDataPaginated(1, 1);
      let testTag = "test-monitor";
      if (lastMonitoringData && lastMonitoringData.data && lastMonitoringData.data.length > 0) {
        testTag = lastMonitoringData.data[0].monitor_tag;
      }
      const triggerMetaParsed = JSON.parse(trigger.trigger_meta) as TriggerMeta;
      const testAlert: MonitorAlertConfigRecord = {
        id: 1,
        monitor_tag: testTag,
        alert_for: "STATUS",
        alert_value: "DOWN",
        failure_threshold: 1,
        success_threshold: 1,
        alert_description: "This is a test alert",
        create_incident: "NO",
        is_active: "YES",
        severity: "WARNING",
        created_at: new Date(),
        updated_at: new Date(),
      };
      const testAlertData: MonitorAlertV2Record = {
        id: 1,
        config_id: 1,
        monitor_tag: null,
        incident_id: 4,
        alert_status: Math.random() > 0.5 ? "TRIGGERED" : "RESOLVED",
        created_at: new Date(),
        updated_at: new Date(),
      };

      const templateSiteVars = siteDataToVariables(siteData);
      const templateAlertVars = alertToVariables(testAlert, testAlertData, templateSiteVars);
      if (trigger.trigger_type === "webhook") {
        resp = await sendWebhook(
          triggerMetaParsed.webhook_body,
          { ...templateAlertVars, ...templateSiteVars },
          triggerMetaParsed.url,
          JSON.stringify(triggerMetaParsed.headers),
        );
      } else if (trigger.trigger_type === "email") {
        const toAddresses = triggerMetaParsed.to
          .trim()
          .split(",")
          .map((addr) => addr.trim())
          .filter((addr) => addr.length > 0);
        resp = await sendEmail(
          triggerMetaParsed.email_body,
          triggerMetaParsed.email_subject,
          { ...templateAlertVars, ...templateSiteVars },
          toAddresses,
          triggerMetaParsed.from,
        );
      } else if (trigger.trigger_type === "discord") {
        resp = await sendDiscord(
          triggerMetaParsed.discord_body,
          { ...templateAlertVars, ...templateSiteVars },
          triggerMetaParsed.url,
        );
      } else if (trigger.trigger_type === "slack") {
        resp = await sendSlack(
          triggerMetaParsed.slack_body,
          { ...templateAlertVars, ...templateSiteVars },
          triggerMetaParsed.url,
        );
      } else {
        throw new Error("Unsupported trigger type for testing");
      }
    } else if (action == "testMonitor") {
      let monitorID = data.monitor_id;
      let monitors = await GetMonitorsParsed({ id: monitorID });
      let monitor = monitors[0];
      if (monitor.monitor_type === "NONE") {
        throw new Error("Tests can't be run on monitor type NONE");
      }
      const monitorReducedType: MonitorWithType = {
        tag: monitor.tag,
        monitor_type: monitor.monitor_type,
        type_data: monitor.type_data,
        cron: monitor.cron ? monitor.cron : undefined,
      };
      const serviceClient = new Service(monitorReducedType);
      resp = await serviceClient.execute();
    } else if (action == "uploadImage") {
      resp = await uploadImage(data);
    } else if (action == "deleteImage") {
      resp = await db.deleteImage(data.id);
    } else if (action == "getPages") {
      const pages = await GetAllPages();
      // Fetch monitors for each page
      const pagesWithMonitors = await Promise.all(
        pages.map(async (page) => {
          const monitors = await GetPageMonitors(page.id);
          return { ...page, monitors };
        }),
      );
      resp = pagesWithMonitors;
    } else if (action == "createPage") {
      resp = await CreatePage(data);
    } else if (action == "updatePage") {
      const { id, ...updateData } = data;
      resp = await UpdatePage(id, updateData);
    } else if (action == "deletePage") {
      await DeletePage(data.id);
      resp = { success: true };
    } else if (action == "applyPageDefaults") {
      // Load current site defaults (or system fallback)
      const SYSTEM_DEFAULTS = {
        monitor_status_history_days: { desktop: 90, mobile: 30 },
        monitor_layout_style: "default-list" as const,
      };
      let siteDefaults = { ...SYSTEM_DEFAULTS };
      try {
        const raw = await GetSiteDataByKey("pageDefaults");
        if (raw && typeof raw === "object") {
          const partial = raw as typeof SYSTEM_DEFAULTS;
          siteDefaults = {
            ...SYSTEM_DEFAULTS,
            ...partial,
            monitor_status_history_days: {
              ...SYSTEM_DEFAULTS.monitor_status_history_days,
              ...(partial.monitor_status_history_days ?? {}),
            },
          };
        }
      } catch (e) {
        console.error("[applyPageDefaults] Failed to load pageDefaults, using system defaults:", e);
      }

      const pages = await GetAllPages();
      for (const p of pages) {
        let raw: Record<string, unknown> = {};
        if (p.page_settings_json) {
          try {
            const parsed =
              typeof p.page_settings_json === "string"
                ? JSON.parse(p.page_settings_json)
                : p.page_settings_json;
            if (parsed && typeof parsed === "object") raw = parsed as Record<string, unknown>;
          } catch {}
        }

        let changed = false;
        const historyDays = (raw.monitor_status_history_days as Record<string, unknown>) ?? {};

        if (data.force === true) {
          raw.monitor_status_history_days = {
            ...historyDays,
            desktop: siteDefaults.monitor_status_history_days.desktop,
            mobile: siteDefaults.monitor_status_history_days.mobile,
          };
          raw.monitor_layout_style = siteDefaults.monitor_layout_style;
          changed = true;
        } else {
          const needsDesktop = historyDays.desktop === null || historyDays.desktop === undefined;
          const needsMobile = historyDays.mobile === null || historyDays.mobile === undefined;
          const needsLayout =
            raw.monitor_layout_style === null || raw.monitor_layout_style === undefined;
          if (needsDesktop || needsMobile) {
            raw.monitor_status_history_days = {
              ...historyDays,
              ...(needsDesktop && { desktop: siteDefaults.monitor_status_history_days.desktop }),
              ...(needsMobile && { mobile: siteDefaults.monitor_status_history_days.mobile }),
            };
            changed = true;
          }
          if (needsLayout) {
            raw.monitor_layout_style = siteDefaults.monitor_layout_style;
            changed = true;
          }
        }

        if (changed) {
          await UpdatePage(p.id, { page_settings_json: JSON.stringify(raw) });
        }
      }
      resp = { success: true };
    } else if (action == "addMonitorToPage") {
      await AddMonitorToPage(data.page_id, data.monitor_tag);
      resp = { success: true };
    } else if (action == "removeMonitorFromPage") {
      await RemoveMonitorFromPage(data.page_id, data.monitor_tag);
      resp = { success: true };
    } else if (action == "reorderPageMonitors") {
      await ReorderPageMonitors(data.page_id, data.monitor_tags);
      resp = { success: true };
    }
    // ============ Maintenance Actions ============
    else if (action == "getMaintenances") {
      resp = await GetMaintenancesDashboard(data);
    } else if (action == "getMaintenance") {
      resp = await GetMaintenanceWithEvents(data.id);
      if (!resp) {
        throw new Error("Maintenance not found");
      }
    } else if (action == "createMaintenance") {
      resp = await CreateMaintenance(data);
    } else if (action == "updateMaintenance") {
      const { id, ...updateData } = data;
      await UpdateMaintenance(id, updateData);
      resp = { success: true };
    } else if (action == "deleteMaintenance") {
      await DeleteMaintenance(data.id);
      resp = { success: true };
    } else if (action == "getMaintenanceEvents") {
      resp = await GetMaintenanceEventsByMaintenanceId(data.maintenance_id);
    } else if (action == "getMaintenanceEvent") {
      resp = await GetMaintenanceEventById(data.id);
      if (!resp) {
        throw new Error("Maintenance event not found");
      }
    } else if (action == "createMaintenanceEvent") {
      resp = await CreateMaintenanceEvent(data);
    } else if (action == "updateMaintenanceEvent") {
      const { id, ...updateData } = data;
      await UpdateMaintenanceEvent(id, updateData);
      resp = { success: true };
    } else if (action == "deleteMaintenanceEvent") {
      await DeleteMaintenanceEvent(data.id);
      resp = { success: true };
    } else if (action == "addMonitorToMaintenance") {
      await AddMonitorToMaintenance(data.maintenance_id, data.monitor_tag);
      resp = { success: true };
    } else if (action == "removeMonitorFromMaintenance") {
      await RemoveMonitorFromMaintenance(data.maintenance_id, data.monitor_tag);
      resp = { success: true };
    } else if (action == "getMaintenanceMonitors") {
      resp = await GetMaintenanceMonitors(data.maintenance_id);
    } else if (action == "updateMaintenanceMonitorImpact") {
      await UpdateMaintenanceMonitorImpact(data.maintenance_id, data.monitor_tag, data.monitor_impact);
      resp = { success: true };
    }
    // ============ Monitor Alert Config Actions ============
    else if (action == "createMonitorAlertConfig") {
      resp = await CreateMonitorAlertConfig(data);
    } else if (action == "updateMonitorAlertConfig") {
      resp = await UpdateMonitorAlertConfig(data);
    } else if (action == "getMonitorAlertConfig" || action == "getMonitorAlertConfigById") {
      resp = await GetMonitorAlertConfigById(data.id);
      if (!resp) {
        throw new Error("Monitor alert config not found");
      }
    } else if (action == "getMonitorAlertConfigsByMonitorTag") {
      resp = await GetMonitorAlertConfigsByMonitorTag(data.monitor_tag);
    } else if (action == "deleteMonitorAlertConfig") {
      await DeleteMonitorAlertConfig(data.id);
      resp = { success: true };
    } else if (action == "toggleMonitorAlertConfigStatus") {
      resp = await ToggleMonitorAlertConfigStatus(data.id);
    } else if (action == "getAlertConfigsPaginated") {
      const page = parseInt(String(data.page)) || 1;
      const limit = parseInt(String(data.limit)) || 10;
      const filter: { monitor_tag?: string; is_active?: "YES" | "NO"; alert_for?: "STATUS" | "LATENCY" | "UPTIME" } =
        {};
      if (data.monitor_tag) filter.monitor_tag = data.monitor_tag;
      if (data.is_active) filter.is_active = data.is_active as "YES" | "NO";
      if (data.alert_for) filter.alert_for = data.alert_for as "STATUS" | "LATENCY" | "UPTIME";
      resp = await GetMonitorAlertConfigsPaginated(page, limit, Object.keys(filter).length > 0 ? filter : undefined);
    } else if (action == "deleteMonitorAlertV2") {
      const deleteIncident = data.deleteIncident === true;
      // If deleteIncident is true, delete the incident first
      if (deleteIncident && data.incident_id) {
        await db.deleteIncident(data.incident_id);
      }
      resp = await DeleteMonitorAlertV2(data.id);
    } else if (action == "updateMonitorAlertV2Status") {
      resp = await UpdateMonitorAlertV2Status(data.id, data.status);
    }

    // ============ User Subscriptions (Admin) ============
    else if (action == "getSubscribersByMethod") {
      const { method, page = 1, limit = 25 } = data;
      if (!method) {
        throw new Error("Method is required");
      }
      resp = await GetSubscribersByMethod(method, page, limit);
    } else if (action == "getSubscriberWithSubscriptions") {
      // V2: subscriberId is actually the method_id from subscriber_methods table
      const { subscriberId, method } = data;
      if (!subscriberId || !method) {
        throw new Error("subscriberId and method are required");
      }
      // Use V2 function which expects method_id
      const result = await GetSubscriberWithSubscriptionsV2(subscriberId);
      if (result) {
        // Map V2 result to expected format for compatibility with existing UI
        resp = {
          subscriber: {
            id: result.method.id,
            subscriber_send: result.method.method_value,
            subscriber_meta: result.user.email, // Store user email in meta for display
            subscriber_type: result.method.method_type,
            subscriber_status: result.method.status,
            created_at: result.method.created_at,
            updated_at: result.method.updated_at,
          },
          subscriptions: result.subscriptions.map((s) => ({
            id: s.id,
            subscriber_id: s.subscriber_method_id,
            subscription_method: result.method.method_type,
            event_type: s.event_type,
            status: s.status,
            created_at: s.created_at,
            updated_at: s.updated_at,
          })),
        };
      } else {
        resp = { subscriber: null, subscriptions: [] };
      }
    } else if (action == "getSubscriberCountsByMethod") {
      resp = await GetSubscriberCountsByMethod();
    } else if (action == "deleteUserSubscription") {
      const { subscriptionId } = data;
      if (!subscriptionId) {
        throw new Error("subscriptionId is required");
      }
      resp = await DeleteUserSubscription(subscriptionId);
    } else if (action == "updateUserSubscriptionStatus") {
      const { subscriptionId, status } = data;
      if (!subscriptionId || !status) {
        throw new Error("subscriptionId and status are required");
      }
      resp = await UpdateUserSubscriptionStatus(subscriptionId, status);
    }
    // ============ Email Template Config ============

    // ============ General Email Templates ============
    else if (action == "getGeneralEmailTemplates") {
      resp = await GetAllGeneralEmailTemplates();
    } else if (action == "getGeneralEmailTemplateById") {
      const { templateId } = data;
      if (!templateId) {
        throw new Error("Template ID is required");
      }
      resp = await GetGeneralEmailTemplateById(templateId);
      if (!resp) {
        throw new Error("Template not found");
      }
    } else if (action == "updateGeneralEmailTemplate") {
      const { templateId, template_subject, template_html_body, template_text_body } = data;
      if (!templateId) {
        throw new Error("Template ID is required");
      }
      resp = await UpdateGeneralEmailTemplate(templateId, {
        template_subject,
        template_html_body,
        template_text_body,
      });
      if (!resp.success) {
        throw new Error(resp.error);
      }
    }
    // ============ Admin Subscribers Management ============
    else if (action == "getAdminSubscribers") {
      const page = parseInt(String(data.page)) || 1;
      const limit = parseInt(String(data.limit)) || 10;
      resp = await GetAdminSubscribersPaginated(page, limit);
    } else if (action == "adminUpdateSubscriptionStatus") {
      const { methodId, eventType, enabled } = data;
      if (!methodId || !eventType) {
        throw new Error("Method ID and event type are required");
      }
      resp = await AdminUpdateSubscriptionStatus(methodId, eventType, enabled);
      if (!resp.success) {
        throw new Error(resp.error);
      }
    } else if (action == "adminDeleteSubscriber") {
      const { methodId } = data;
      if (!methodId) {
        throw new Error("Method ID is required");
      }
      resp = await AdminDeleteSubscriber(methodId);
      if (!resp.success) {
        throw new Error(resp.error);
      }
    } else if (action == "adminAddSubscriber") {
      const { email, incidents, maintenances } = data;
      if (!email) {
        throw new Error("Email is required");
      }
      resp = await AdminAddSubscriber(email, incidents ?? false, maintenances ?? false);
      if (!resp.success) {
        throw new Error(resp.error);
      }
    } else if (action == "adminUpdateSubscriptionScope") {
      const { methodId, eventType, monitorTags } = data;
      if (!methodId || !eventType) {
        throw new Error("Method ID and event type are required");
      }
      if (!["incidents", "maintenances"].includes(eventType)) {
        throw new Error("eventType must be 'incidents' or 'maintenances'");
      }
      if (monitorTags !== undefined && monitorTags !== null && !Array.isArray(monitorTags)) {
        throw new Error("monitorTags must be an array");
      }
      const safeTags: string[] = Array.isArray(monitorTags) ? monitorTags.slice(0, 500) : [];
      resp = await AdminUpdateSubscriptionScope(methodId, eventType, safeTags);
      if (!resp.success) {
        throw new Error(resp.error);
      }
    } else if (action == "getSubscriptionsConfig") {
      let subscriptionsSettings = await GetSiteDataByKey("subscriptionsSettings");
      if (!!!subscriptionsSettings) {
        subscriptionsSettings = {
          enable: false,
          methods: {
            emails: {
              incidents: true,
              maintenances: true,
            },
          },
        };
      }
      resp = subscriptionsSettings;
    } else if (action == "getSiteDataByKey") {
      const { key } = data;
      if (!key) {
        throw new Error("Key is required");
      }
      let siteData = await GetSiteDataByKey(key);
      if (!!!siteData) {
        throw new Error("Site data not found for the given key");
      }
      resp = siteData;
    } else if (action == "updateSubscriptionsConfig") {
      resp = await InsertKeyValue("subscriptionsSettings", JSON.stringify(data));
    } else if (action === "getSmtpStatus") {
      const envConfig = GetSMTPFromENV();
      if (envConfig) {
        const { smtp_pass: _omit, ...rest } = envConfig;
        resp = { source: "env", config: rest };
      } else {
        const dbRow = await db.getSiteDataByKey("smtp");
        let dbConfig: Omit<SMTPConfiguration, "smtp_pass"> | null = null;
        if (dbRow?.value) {
          try {
            const parsed = JSON.parse(dbRow.value) as SMTPConfiguration;
            const { smtp_pass: _omit, ...rest } = parsed;
            dbConfig = rest;
          } catch {
            dbConfig = null;
          }
        }
        resp = dbConfig ? { source: "db", config: dbConfig } : { source: "none", config: null };
      }
    } else if (action === "saveSmtpConfig") {
      const { smtp_host, smtp_port, smtp_user, smtp_pass, smtp_sender, smtp_secure } = data as {
        smtp_host: string;
        smtp_port: number;
        smtp_user: string;
        smtp_pass: string;
        smtp_sender: string;
        smtp_secure: boolean;
      };
      if (GetSMTPFromENV()) {
        throw new Error("SMTP is configured via environment variables and cannot be overridden");
      }
      if (!smtp_host || !smtp_sender) {
        throw new Error("smtp_host and smtp_sender are required");
      }
      const port = Number(smtp_port);
      if (!port || port < 1 || port > 65535) {
        throw new Error("smtp_port must be a number between 1 and 65535");
      }
      let finalPass = smtp_pass;
      if (!finalPass) {
        const existing = await db.getSiteDataByKey("smtp");
        if (existing?.value) {
          try {
            const parsed = JSON.parse(existing.value) as SMTPConfiguration;
            finalPass = parsed.smtp_pass || "";
          } catch {
            finalPass = "";
          }
        }
      }
      const config: SMTPConfiguration = {
        smtp_host,
        smtp_port: port,
        smtp_user,
        smtp_pass: finalPass,
        smtp_sender,
        smtp_secure: !!smtp_secure,
      };
      await InsertKeyValue("smtp", JSON.stringify(config));
      resp = { success: true };
    } else if (action === "testSmtp") {
      const smtpConfig = await GetSMTPConfig();
      if (!smtpConfig) {
        throw new Error("SMTP is not configured");
      }
      const transport = getSMTPTransport(smtpConfig);
      await transport.sendMail({
        from: smtpConfig.smtp_sender,
        to: userDB.email,
        subject: "Kener SMTP test",
        text: "This is a test email from Kener. Your SMTP configuration is working correctly.",
        html: "<p>This is a test email from Kener. Your SMTP configuration is working correctly.</p>",
      });
      resp = { ok: true };
    } else if (action === "getResendStatus") {
      const envConfig = GetResendFromENV();
      if (envConfig) {
        resp = { source: "env", config: { resend_sender_email: envConfig.resend_sender_email } };
      } else {
        const dbRow = await db.getSiteDataByKey("resend");
        if (dbRow?.value) {
          try {
            const parsed = JSON.parse(dbRow.value) as ResendConfiguration;
            resp = { source: "db", config: { resend_sender_email: parsed.resend_sender_email } };
          } catch {
            resp = { source: "none", config: null };
          }
        } else {
          resp = { source: "none", config: null };
        }
      }
    } else if (action === "saveResendConfig") {
      const { resend_api_key, resend_sender_email } = data as ResendConfiguration;
      if (GetResendFromENV()) {
        throw new Error("Resend is configured via environment variables and cannot be overridden");
      }
      if (!resend_sender_email) {
        throw new Error("resend_sender_email is required");
      }
      let finalKey = resend_api_key;
      if (!finalKey) {
        const existing = await db.getSiteDataByKey("resend");
        if (existing?.value) {
          try {
            const parsed = JSON.parse(existing.value) as ResendConfiguration;
            finalKey = parsed.resend_api_key || "";
          } catch {
            finalKey = "";
          }
        }
      }
      if (!finalKey) {
        throw new Error("resend_api_key is required");
      }
      await InsertKeyValue("resend", JSON.stringify({ resend_api_key: finalKey, resend_sender_email }));
      resp = { success: true };
    } else if (action === "testResend") {
      const resendConfig = await GetResendConfig();
      if (!resendConfig) {
        throw new Error("Resend is not configured");
      }
      const { Resend } = await import("resend");
      const resend = new Resend(resendConfig.resend_api_key);
      await resend.emails.send({
        from: resendConfig.resend_sender_email,
        to: [userDB.email],
        subject: "Kener Resend test",
        text: "This is a test email from Kener. Your Resend configuration is working correctly.",
        html: "<p>This is a test email from Kener. Your Resend configuration is working correctly.</p>",
      });
      resp = { ok: true };
    } else if (action == "getRoles") {
      resp = await GetAllRoles();
    } else if (action == "getAllPermissions") {
      resp = await GetAllPermissions();
    } else if (action == "getRolePermissions") {
      resp = await GetRolePermissions(data.roleId);
    } else if (action == "updateRolePermissions") {
      resp = await UpdateRolePermissions(data.roleId, data.permissionIds);
    } else if (action == "getRoleUsers") {
      resp = await GetRoleUsers(data.roleId);
    } else if (action == "addUserToRole") {
      resp = await AddUserToRole(data.roleId, data.userId);
    } else if (action == "removeUserFromRole") {
      resp = await RemoveUserFromRole(data.roleId, data.userId);
    } else if (action == "createRole") {
      resp = await CreateRole({ role_id: data.role_id, name: data.name });
    } else if (action == "updateRole") {
      resp = await UpdateRole(data.roleId, { name: data.name, status: data.status });
    } else if (action == "deleteRole") {
      resp = await DeleteRole(data.roleId, data.options);
    } else if (action == "getGroups") {
      resp = await GetAllGroups();
    } else if (action == "getGroup") {
      resp = await GetGroupById(data.id);
      if (!resp) throw new Error("Group not found");
    } else if (action == "createGroup") {
      resp = await CreateGroup(data);
    } else if (action == "updateGroup") {
      const { id, ...updateData } = data;
      resp = await UpdateGroup(id, updateData);
    } else if (action == "deleteGroup") {
      await DeleteGroup(data.id);
      resp = { success: true };
    } else if (action == "getGroupMembers") {
      resp = await GetGroupMembers(data.groupId);
    } else if (action == "addGroupMember") {
      await AddGroupMember(data.groupId, data.userId);
      resp = { success: true };
    } else if (action == "removeGroupMember") {
      await RemoveGroupMember(data.groupId, data.userId);
      resp = { success: true };
    } else if (action == "getGroupRoles") {
      resp = await GetGroupRoles(data.groupId);
    } else if (action == "addGroupRole") {
      await AddGroupRole(data.groupId, data.roleId);
      resp = { success: true };
    } else if (action == "removeGroupRole") {
      await RemoveGroupRole(data.groupId, data.roleId);
      resp = { success: true };
    } else if (action == "getRolePages") {
      resp = await GetRolePages(data.roleId);
    } else if (action == "setRolePages") {
      await SetRolePages(data.roleId, data.assignments);
      resp = { success: true };
    } else if (action == "getRoleMonitors") {
      resp = await GetRoleMonitors(data.roleId);
    } else if (action == "setRoleMonitors") {
      await SetRoleMonitors(data.roleId, data.monitorTags);
      resp = { success: true };
    } else if (action == "getUserEffectiveAccess") {
      resp = await GetUserEffectiveAccess(data.userId);
    } else if (action === "getOidcConfig") {
      const cfg = await GetOidcConfig();
      // Never expose client_secret to the frontend
      const { client_secret: _s, ...safeOidc } = cfg;
      resp = { ...safeOidc, client_secret: cfg.client_secret ? "••••••••" : "" };
    } else if (action === "saveOidcConfig") {
      const payload = { ...data };
      // If placeholder is sent back, preserve existing secret
      if (payload.client_secret === "••••••••") {
        const current = await GetOidcConfig();
        payload.client_secret = current.client_secret;
      }
      resp = await SaveOidcConfig(payload);
      // Return without exposing secret
      const { client_secret: _s2, ...safeResp } = resp;
      resp = { ...safeResp, client_secret: resp.client_secret ? "••••••••" : "" };
    } else if (action === "testOidcDiscovery") {
      const { issuer_url } = data as { issuer_url: string };
      if (!issuer_url) throw new Error("issuer_url is required");
      try {
        const discoveryUrl = issuer_url.replace(/\/$/, "") + "/.well-known/openid-configuration";
        const r = await fetch(discoveryUrl, { signal: AbortSignal.timeout(5000) });
        if (!r.ok) throw new Error(`Discovery endpoint returned ${r.status}`);
        const meta = (await r.json()) as Record<string, string>;
        resp = {
          success: true,
          endpoints: {
            authorization_endpoint: meta.authorization_endpoint || "",
            token_endpoint: meta.token_endpoint || "",
            userinfo_endpoint: meta.userinfo_endpoint || "",
            jwks_uri: meta.jwks_uri || "",
            end_session_endpoint: meta.end_session_endpoint || "",
          },
        };
      } catch (e) {
        resp = { success: false, error: e instanceof Error ? e.message : String(e) };
      }
    } else if (action === "getLdapConfig") {
      resp = await GetLdapConfigPublic();
    } else if (action === "saveLdapConfig") {
      resp = await SaveLdapConfig(data);
      // Return without bind_password
      const { bind_password: _p, ...safeLdap } = resp;
      resp = safeLdap;
    } else if (action === "testLdapConnection") {
      resp = await TestLdapConnection(data);
    } else if (action == "exportData") {
      resp = await exportData(data.scope);
    } else if (action == "importData") {
      resp = await importData(data.payload);
    }
  } catch (error: unknown) {
    console.error("[manage/api] unhandled error:", error);
    let message = error instanceof Error ? error.message : String(error);
    // Knex+SQLite errors embed the full SQL before the actual error: "<SQL> - <sqlite error>"
    // Base64 uses only A-Za-z0-9+/= so " - " only appears as the SQL/error separator.
    const lastDash = message.lastIndexOf(" - ");
    if (lastDash > 50) {
      message = message.slice(lastDash + 3);
    }
    resp = { error: message };
    return json(resp, { status: 500 });
  }
  return json(resp, { status: 200 });
}
async function storeSiteData(data: { [x: string]: any }) {
  for (const key in data) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      let element = data[key];
      if (key === "socialPreviewImage" && (element === null || element === undefined)) {
        element = "";
      }
      await InsertKeyValue(key, element);
    }
  }
  return { success: true };
}

interface ImageUploadData {
  base64: string; // base64 encoded image data (without data URI prefix)
  mimeType: string;
  fileName?: string;
  maxWidth?: number;
  maxHeight?: number;
  forceDimensions?: boolean;
  prefix?: string; // prefix for the ID (e.g., "logo_", "favicon_")
}

async function uploadImage(data: ImageUploadData): Promise<{ id: string; url: string }> {
  const {
    base64,
    fileName,
    maxWidth = 256,
    maxHeight = 256,
    forceDimensions = false,
    prefix = "img_",
  } = data;
  let mimeType = data.mimeType;

  if (!base64) {
    throw new Error("Image data is required");
  }

  // Normalize browser-reported font MIME type aliases to canonical values
  const fontMimeAliases: Record<string, string> = {
    "application/x-font-ttf": "font/ttf",
    "application/x-font-otf": "font/otf",
    "application/font-woff": "font/woff",
    "application/font-woff2": "font/woff2",
    "application/vnd.ms-opentype": "font/otf",
    "application/x-font-woff": "font/woff",
  };
  if (fontMimeAliases[mimeType]) {
    mimeType = fontMimeAliases[mimeType];
  }
  // If browser reports octet-stream, try to derive from fileName extension
  if (mimeType === "application/octet-stream" && fileName) {
    const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
    const extMap: Record<string, string> = { ttf: "font/ttf", otf: "font/otf", woff: "font/woff", woff2: "font/woff2" };
    if (extMap[ext]) mimeType = extMap[ext];
  }

  const allowedMimeTypes = [
    "image/png", "image/jpeg", "image/jpg", "image/webp",
    "image/heic", "image/heif", "image/svg+xml",
    "font/ttf", "font/otf", "font/woff", "font/woff2",
  ];
  if (!allowedMimeTypes.includes(mimeType)) {
    throw new Error(`Invalid image type. Allowed types: ${allowedMimeTypes.join(", ")}`);
  }

  // Decode base64 to buffer
  const imageBuffer = Buffer.from(base64, "base64");
  if (!imageBuffer.length) {
    throw new Error("Invalid image data");
  }

  if (imageBuffer.length > GC.MAX_UPLOAD_BYTES) {
    throw new Error("Image is too large. Maximum upload size is 5MB");
  }

  const normalizedRequestedMime = mimeType === "image/jpg" ? "image/jpeg" : mimeType;
  const maybeTextHeader = imageBuffer.subarray(0, 4096).toString("utf8");
  const looksLikeSvg = /<svg[\s>]/i.test(maybeTextHeader) || /<\?xml/i.test(maybeTextHeader);

  // Reject if content looks like SVG but client claims it's not SVG
  if (looksLikeSvg && normalizedRequestedMime !== "image/svg+xml") {
    throw new Error("Image content does not match the declared MIME type");
  }

  // Store font files as-is, bypassing sharp
  const FONT_MIME_TYPES = new Set(["font/ttf", "font/otf", "font/woff", "font/woff2"]);
  if (FONT_MIME_TYPES.has(normalizedRequestedMime)) {
    const ext = normalizedRequestedMime.split("/")[1]; // "ttf", "otf", "woff", "woff2"
    const fontId = `font_${nanoid(16)}.${ext}`;
    await db.insertImage({
      id: fontId,
      data: imageBuffer.toString("base64"),
      mime_type: normalizedRequestedMime,
      original_name: fileName || null,
      width: null,
      height: null,
      size: imageBuffer.length,
    });
    return { id: fontId, url: `/assets/fonts/${fontId}` };
  }

  // Store SVG as-is, bypassing sharp
  if (normalizedRequestedMime === "image/svg+xml") {
    const svgId = `${nanoid(16)}.svg`;
    await db.insertImage({
      id: svgId,
      data: imageBuffer.toString("base64"),
      mime_type: "image/svg+xml",
      original_name: fileName || null,
      width: null,
      height: null,
      size: imageBuffer.length,
    });
    return { id: svgId, url: `/assets/images/${svgId}` };
  }

  let processedBuffer: Buffer;
  let finalMimeType = mimeType;
  let width: number | undefined;
  let height: number | undefined;

  // Pre-convert HEIC/HEIF to JPEG before passing to sharp (sharp may lack HEVC codec)
  let sharpInputBuffer = imageBuffer;
  const heicSignature = imageBuffer.subarray(4, 12).toString("ascii");
  const isHeicData = heicSignature.includes("ftyp");
  if (isHeicData) {
    const converted = await heicConvert({
      buffer: new Uint8Array(imageBuffer) as unknown as ArrayBuffer,
      format: "JPEG",
      quality: 0.85,
    });
    sharpInputBuffer = Buffer.from(converted);
  }

  // Process with sharp and normalize output
  const image = sharp(sharpInputBuffer, { limitInputPixels: GC.MAX_INPUT_PIXELS });
  const metadata = await image.metadata();

  const formatToMime: Record<string, string> = {
    png: "image/png",
    jpeg: "image/jpeg",
    webp: "image/webp",
    svg: "image/svg+xml",
    heic: "image/heic",
    heif: "image/heif",
  };

  const detectedMimeType = metadata.format ? formatToMime[metadata.format] : undefined;
  if (!detectedMimeType) {
    throw new Error("Could not detect a valid image format");
  }

  // HEIC/HEIF files often have .jpg extension (e.g. iPhone photos); allow the mismatch
  const isHeicDetected = detectedMimeType === "image/heic" || detectedMimeType === "image/heif";
  const isHeicRequested = normalizedRequestedMime === "image/heic" || normalizedRequestedMime === "image/heif";
  if (normalizedRequestedMime !== detectedMimeType && !isHeicDetected && !isHeicRequested) {
    throw new Error("Image MIME type does not match file content");
  }

  const sourceWidth = metadata.width || maxWidth;
  const sourceHeight = metadata.height || maxHeight;

  if (sourceWidth > GC.MAX_IMAGE_DIMENSION || sourceHeight > GC.MAX_IMAGE_DIMENSION) {
    throw new Error(
      `Image dimensions exceed maximum allowed size of ${GC.MAX_IMAGE_DIMENSION}x${GC.MAX_IMAGE_DIMENSION}`,
    );
  }

  const boundedMaxWidth = Math.min(maxWidth, GC.MAX_IMAGE_DIMENSION);
  const boundedMaxHeight = Math.min(maxHeight, GC.MAX_IMAGE_DIMENSION);

  // Calculate new dimensions.
  let newWidth = sourceWidth;
  let newHeight = sourceHeight;

  if (forceDimensions) {
    newWidth = Math.max(1, boundedMaxWidth);
    newHeight = Math.max(1, boundedMaxHeight);
  } else if (newWidth > boundedMaxWidth || newHeight > boundedMaxHeight) {
    const ratio = Math.min(boundedMaxWidth / newWidth, boundedMaxHeight / newHeight);
    newWidth = Math.max(1, Math.round(newWidth * ratio));
    newHeight = Math.max(1, Math.round(newHeight * ratio));
  }

  width = newWidth;
  height = newHeight;

  // Keep JPEG as JPEG; convert HEIC/HEIF to JPEG; convert everything else (WebP/PNG) to PNG.
  if (detectedMimeType === "image/jpeg" || isHeicDetected) {
    processedBuffer = await image
      .resize(newWidth, newHeight, {
        fit: forceDimensions ? "cover" : "inside",
        position: "centre",
      })
      .jpeg({ quality: 85 })
      .toBuffer();
    finalMimeType = "image/jpeg";
  } else {
    processedBuffer = await image
      .resize(newWidth, newHeight, {
        fit: forceDimensions ? "cover" : "inside",
        position: "centre",
      })
      .png()
      .toBuffer();
    finalMimeType = "image/png";
  }

  // Generate ID with nanoid and extension
  const fileExtension = finalMimeType === "image/jpeg" ? "jpg" : "png";
  const id = `${nanoid(16)}.${fileExtension}`;

  // Convert processed image back to base64
  const processedBase64 = processedBuffer.toString("base64");

  // Store in database
  await db.insertImage({
    id,
    data: processedBase64,
    mime_type: finalMimeType,
    original_name: fileName || null,
    width: width || null,
    height: height || null,
    size: processedBuffer.length,
  });

  return {
    id,
    url: `/assets/images/${id}`,
  };
}
