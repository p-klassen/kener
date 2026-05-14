import { json, error } from "@sveltejs/kit";
import type { APIServerRequest } from "$lib/server/types/api-server";
import type { SubscriptionsConfig } from "$lib/server/types/db.js";
import { GetSiteDataByKey } from "$lib/server/controllers/siteDataController";
import {
  SubscriberLogin,
  VerifySubscriberOTP,
  VerifySubscriberToken,
  UpdateSubscriberPreferences,
  LoginWithAccount,
} from "$lib/server/controllers/userSubscriptionsController";
import { GetLoggedInSession } from "$lib/server/controllers/userController";
import db from "$lib/server/db/db.js";

interface LoginRequest {
  action: "login";
  email: string;
}

interface VerifyRequest {
  action: "verify";
  email: string;
  code: string;
}

interface GetPreferencesRequest {
  action: "getPreferences";
  token: string;
}

interface UpdatePreferencesRequest {
  action: "updatePreferences";
  token: string;
  incidents?: boolean;
  incident_monitors?: string[];
  incident_pages?: string[];
  maintenances?: boolean;
  maintenance_monitors?: string[];
  maintenance_pages?: string[];
}

interface LoginWithAccountRequest {
  action: "loginWithAccount";
}

type PostRequestBody =
  | LoginRequest
  | VerifyRequest
  | GetPreferencesRequest
  | UpdatePreferencesRequest
  | LoginWithAccountRequest;

export default async function post(req: APIServerRequest): Promise<Response> {
  const body = req.body as PostRequestBody;
  const { action } = body;

  // Check if subscriptions are enabled
  const config = await GetSubscriptionConfig();
  if (!config || !config.enable) {
    return error(400, { message: "Subscriptions are not enabled" });
  }

  const emailEnabled = config.methods?.emails?.incidents === true || config.methods?.emails?.maintenances === true;
  if (!emailEnabled) {
    return error(400, { message: "Email subscriptions are not enabled" });
  }

  switch (action) {
    case "login":
      return handleLogin((body as LoginRequest).email, config);
    case "verify":
      return handleVerify((body as VerifyRequest).email, (body as VerifyRequest).code);
    case "getPreferences":
      return handleGetPreferences((body as GetPreferencesRequest).token, config);
    case "updatePreferences":
      return handleUpdatePreferences(
        (body as UpdatePreferencesRequest).token,
        (body as UpdatePreferencesRequest).incidents,
        (body as UpdatePreferencesRequest).incident_monitors,
        (body as UpdatePreferencesRequest).incident_pages,
        (body as UpdatePreferencesRequest).maintenances,
        (body as UpdatePreferencesRequest).maintenance_monitors,
        (body as UpdatePreferencesRequest).maintenance_pages,
        config,
      );
    case "loginWithAccount":
      return handleLoginWithAccount(req);
    default:
      return error(400, { message: "Invalid action" });
  }
}

async function GetSubscriptionConfig(): Promise<SubscriptionsConfig | null> {
  const subscriptionsSettings = await GetSiteDataByKey("subscriptionsSettings");
  if (!subscriptionsSettings) {
    return null;
  }
  return subscriptionsSettings as SubscriptionsConfig;
}

async function handleLogin(email: string, config: SubscriptionsConfig): Promise<Response> {
  const result = await SubscriberLogin(email);
  if (!result.success) {
    return error(400, { message: result.error || "Failed to send verification code" });
  }

  return json({ success: true, message: "Verification code sent" });
}

async function handleVerify(email: string, code: string): Promise<Response> {
  const result = await VerifySubscriberOTP(email, code);
  if (!result.success) {
    return error(400, { message: result.error || "Verification failed" });
  }

  return json({ success: true, token: result.token });
}

async function handleGetPreferences(token: string, config: SubscriptionsConfig): Promise<Response> {
  const result = await VerifySubscriberToken(token);
  if (!result.success || !result.user || !result.method) {
    return error(401, { message: result.error || "Invalid token" });
  }

  const allSubs = await db.getUserSubscriptionsV2({
    subscriber_user_id: result.user.id,
    subscriber_method_id: result.method.id,
  });

  const incidentSub = allSubs.find((s) => s.event_type === "incidents" && s.status === "ACTIVE");
  const maintenanceSub = allSubs.find((s) => s.event_type === "maintenances" && s.status === "ACTIVE");

  const [incidentScopes, maintenanceScopes] = await Promise.all([
    incidentSub ? db.getSubscriptionScopes(incidentSub.id) : Promise.resolve({ monitors: [], pages: [] }),
    maintenanceSub ? db.getSubscriptionScopes(maintenanceSub.id) : Promise.resolve({ monitors: [], pages: [] }),
  ]);

  return json({
    success: true,
    email: result.user?.email,
    subscriptions: result.subscriptions,
    availableSubscriptions: {
      incidents: config.methods?.emails?.incidents === true,
      maintenances: config.methods?.emails?.maintenances === true,
    },
    incident_monitors: incidentScopes.monitors,
    incident_pages: incidentScopes.pages,
    maintenance_monitors: maintenanceScopes.monitors,
    maintenance_pages: maintenanceScopes.pages,
  });
}

async function handleUpdatePreferences(
  token: string,
  incidents: boolean | undefined,
  incidentMonitors: string[] | undefined,
  incidentPages: string[] | undefined,
  maintenances: boolean | undefined,
  maintenanceMonitors: string[] | undefined,
  maintenancePages: string[] | undefined,
  config: SubscriptionsConfig,
): Promise<Response> {
  const preferences: {
    incidents?: boolean;
    incident_monitors?: string[];
    incident_pages?: string[];
    maintenances?: boolean;
    maintenance_monitors?: string[];
    maintenance_pages?: string[];
  } = {};

  if (config.methods?.emails?.incidents) {
    if (incidents !== undefined) {
      preferences.incidents = incidents;
    }
    if (incidentMonitors !== undefined) {
      if (!Array.isArray(incidentMonitors)) {
        return error(400, { message: "incident_monitors must be an array" });
      }
      preferences.incident_monitors = incidentMonitors.slice(0, 500).map(String);
    }
    if (incidentPages !== undefined) {
      if (!Array.isArray(incidentPages)) {
        return error(400, { message: "incident_pages must be an array" });
      }
      preferences.incident_pages = incidentPages.slice(0, 100).map(String);
    }
  }
  if (config.methods?.emails?.maintenances) {
    if (maintenances !== undefined) {
      preferences.maintenances = maintenances;
    }
    if (maintenanceMonitors !== undefined) {
      if (!Array.isArray(maintenanceMonitors)) {
        return error(400, { message: "maintenance_monitors must be an array" });
      }
      preferences.maintenance_monitors = maintenanceMonitors.slice(0, 500).map(String);
    }
    if (maintenancePages !== undefined) {
      if (!Array.isArray(maintenancePages)) {
        return error(400, { message: "maintenance_pages must be an array" });
      }
      preferences.maintenance_pages = maintenancePages.slice(0, 100).map(String);
    }
  }

  const result = await UpdateSubscriberPreferences(token, preferences);
  if (!result.success) {
    return error(400, { message: result.error || "Failed to update preferences" });
  }

  return json({ success: true });
}

async function handleLoginWithAccount(req: APIServerRequest): Promise<Response> {
  const session = await GetLoggedInSession(req.cookies);
  if (!session) {
    return error(401, { message: "Not logged in" });
  }

  const result = await LoginWithAccount(session.id, session.email);
  if (!result.success) {
    return error(400, { message: result.error || "Failed to link account" });
  }

  return json({ success: true, token: result.token });
}
