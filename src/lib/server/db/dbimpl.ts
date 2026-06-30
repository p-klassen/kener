import Knex from "knex";
import type { Knex as KnexType } from "knex";

// Import all repositories
import { MonitoringRepository } from "./repositories/monitoring.js";
import { MonitorsRepository } from "./repositories/monitors.js";
import { AlertsRepository } from "./repositories/alerts.js";
import { UsersRepository } from "./repositories/users.js";
import { SiteDataRepository } from "./repositories/site-data.js";
import { IncidentsRepository } from "./repositories/incidents.js";
import { ImagesRepository } from "./repositories/images.js";
import { PagesRepository } from "./repositories/pages.js";
import { MaintenancesRepository } from "./repositories/maintenances.js";
import { MonitorAlertConfigRepository } from "./repositories/monitorAlertConfig.js";
import { SubscriptionSystemRepository } from "./repositories/subscriptionSystem.js";
import { EmailTemplateConfigRepository } from "./repositories/emailTemplateConfig.js";
import { GroupsRepository } from "./repositories/groups.js";
import { ResourceAccessRepository } from "./repositories/resource-access.js";

// Re-export types from base
export type { MonitorFilter, TriggerFilter, IncidentFilter, CountResult } from "./repositories/base.js";

// Re-export all db types for convenience
export type * from "../types/db.js";

/**
 * DbImpl - Main database implementation that composes all domain repositories
 *
 * This class delegates all operations to domain-specific repositories while
 * maintaining backward compatibility with existing code.
 */
class DbImpl {
  private _knex: KnexType;

  // Domain repositories
  private monitoring!: MonitoringRepository;
  private monitors!: MonitorsRepository;
  private alerts!: AlertsRepository;
  private users!: UsersRepository;
  private siteData!: SiteDataRepository;
  private incidents!: IncidentsRepository;
  private images!: ImagesRepository;
  private pages!: PagesRepository;
  private maintenances!: MaintenancesRepository;
  private monitorAlertConfig!: MonitorAlertConfigRepository;
  private subscriptionSystem!: SubscriptionSystemRepository;
  private emailTemplateConfig!: EmailTemplateConfigRepository;
  private groups!: GroupsRepository;
  private resourceAccess!: ResourceAccessRepository;

  // Method bindings - declared with definite assignment assertion
  // ============ Monitoring Data ============
  insertMonitoringData!: MonitoringRepository["insertMonitoringData"];
  getMonitoringData!: MonitoringRepository["getMonitoringData"];
  getMonitoringDataAll!: MonitoringRepository["getMonitoringDataAll"];
  getLatestMonitoringData!: MonitoringRepository["getLatestMonitoringData"];
  getLatestMonitoringDataN!: MonitoringRepository["getLatestMonitoringDataN"];
  getMonitoringDataPaginated!: MonitoringRepository["getMonitoringDataPaginated"];
  getMonitoringDataCount!: MonitoringRepository["getMonitoringDataCount"];
  getMonitoringDataAt!: MonitoringRepository["getMonitoringDataAt"];
  getLatestMonitoringDataAllActive!: MonitoringRepository["getLatestMonitoringDataAllActive"];
  getLastHeartbeat!: MonitoringRepository["getLastHeartbeat"];
  getAggregatedMonitoringData!: MonitoringRepository["getAggregatedMonitoringData"];
  getLastStatusBefore!: MonitoringRepository["getLastStatusBefore"];
  getLastStatusBeforeAll!: MonitoringRepository["getLastStatusBeforeAll"];
  getDataGroupByDayAlternative!: MonitoringRepository["getDataGroupByDayAlternative"];
  getLastStatusBeforeCombined!: MonitoringRepository["getLastStatusBeforeCombined"];
  background!: MonitoringRepository["background"];
  consecutivelyStatusFor!: MonitoringRepository["consecutivelyStatusFor"];
  consecutivelyLatencyGreaterThan!: MonitoringRepository["consecutivelyLatencyGreaterThan"];
  consecutivelyLatencyLessThan!: MonitoringRepository["consecutivelyLatencyLessThan"];
  updateMonitoringData!: MonitoringRepository["updateMonitoringData"];
  deleteMonitorDataByTag!: MonitoringRepository["deleteMonitorDataByTag"];
  getStatusCountsByInterval!: MonitoringRepository["getStatusCountsByInterval"];
  getStatusCountsByIntervalGroupedByMonitor!: MonitoringRepository["getStatusCountsByIntervalGroupedByMonitor"];
  getStatusCountsForLastN!: MonitoringRepository["getStatusCountsForLastN"];

  // ============ Monitors ============
  getMonitorsByTags!: MonitorsRepository["getMonitorsByTags"];
  getMonitorsByTag!: MonitorsRepository["getMonitorsByTag"];
  insertMonitor!: MonitorsRepository["insertMonitor"];
  updateMonitor!: MonitorsRepository["updateMonitor"];
  updateMonitorTrigger!: MonitorsRepository["updateMonitorTrigger"];
  getMonitors!: MonitorsRepository["getMonitors"];
  getMonitorByTag!: MonitorsRepository["getMonitorByTag"];
  deleteMonitorsByTag!: MonitorsRepository["deleteMonitorsByTag"];

  // ============ Alerts ============
  insertAlert!: AlertsRepository["insertAlert"];
  alertExistsIncident!: AlertsRepository["alertExistsIncident"];
  alertExists!: AlertsRepository["alertExists"];
  getActiveAlertIncident!: AlertsRepository["getActiveAlertIncident"];
  getAllActiveAlertIncidents!: AlertsRepository["getAllActiveAlertIncidents"];
  getActiveAlert!: AlertsRepository["getActiveAlert"];
  getMonitorAlertsPaginated!: AlertsRepository["getMonitorAlertsPaginated"];
  getMonitorAlertsCount!: AlertsRepository["getMonitorAlertsCount"];
  updateAlertStatus!: AlertsRepository["updateAlertStatus"];
  incrementAlertHealthChecks!: AlertsRepository["incrementAlertHealthChecks"];
  addIncidentNumberToAlert!: AlertsRepository["addIncidentNumberToAlert"];
  deleteMonitorAlertsByTag!: AlertsRepository["deleteMonitorAlertsByTag"];

  // ============ Triggers ============
  createNewTrigger!: AlertsRepository["createNewTrigger"];
  updateTrigger!: AlertsRepository["updateTrigger"];
  getTriggers!: AlertsRepository["getTriggers"];
  getTriggerByID!: AlertsRepository["getTriggerByID"];
  getTriggersByIDs!: AlertsRepository["getTriggersByIDs"];
  deleteTrigger!: AlertsRepository["deleteTrigger"];

  // ============ Users ============
  getUsersCount!: UsersRepository["getUsersCount"];
  getUserByEmail!: UsersRepository["getUserByEmail"];
  getUserPasswordHashById!: UsersRepository["getUserPasswordHashById"];
  getUserPasswordHashesByIds!: UsersRepository["getUserPasswordHashesByIds"];
  getUserById!: UsersRepository["getUserById"];
  insertUser!: UsersRepository["insertUser"];
  updateUserPassword!: UsersRepository["updateUserPassword"];
  updateMustChangePassword!: UsersRepository["updateMustChangePassword"];
  getAllUsers!: UsersRepository["getAllUsers"];
  getUsersPaginated!: UsersRepository["getUsersPaginated"];
  getTotalUsers!: UsersRepository["getTotalUsers"];
  updateUserName!: UsersRepository["updateUserName"];
  updateUserPreferredLocale!: UsersRepository["updateUserPreferredLocale"];
  updateUserRoles!: UsersRepository["updateUserRoles"];
  updateUserIsActive!: UsersRepository["updateUserIsActive"];
  updateUserPasswordById!: UsersRepository["updateUserPasswordById"];
  updateIsVerified!: UsersRepository["updateIsVerified"];
  updateUserEmail!: UsersRepository["updateUserEmail"];
  getUserByExternalId!: UsersRepository["getUserByExternalId"];
  updateUserAuthProvider!: UsersRepository["updateUserAuthProvider"];
  updateUserType!: UsersRepository["updateUserType"];

  // ============ Roles ============
  getRoleById!: UsersRepository["getRoleById"];
  getAllRoles!: UsersRepository["getAllRoles"];
  insertRole!: UsersRepository["insertRole"];
  updateRole!: UsersRepository["updateRole"];
  deleteRole!: UsersRepository["deleteRole"];
  getUsersCountByRoleId!: UsersRepository["getUsersCountByRoleId"];
  migrateUsersRole!: UsersRepository["migrateUsersRole"];
  getRolePermissions!: UsersRepository["getRolePermissions"];
  getAllPermissions!: UsersRepository["getAllPermissions"];
  addRolePermission!: UsersRepository["addRolePermission"];
  removeRolePermission!: UsersRepository["removeRolePermission"];
  getUsersByRoleId!: UsersRepository["getUsersByRoleId"];
  addUserToRole!: UsersRepository["addUserToRole"];
  removeUserFromRole!: UsersRepository["removeUserFromRole"];
  getUserPermissionIds!: UsersRepository["getUserPermissionIds"];
  getUserRoleIds!: UsersRepository["getUserRoleIds"];
  deleteUser!: UsersRepository["deleteUser"];

  // ============ API Keys ============
  createNewApiKey!: UsersRepository["createNewApiKey"];
  updateApiKeyStatus!: UsersRepository["updateApiKeyStatus"];
  deleteApiKey!: UsersRepository["deleteApiKey"];
  getApiKeyByHashedKey!: UsersRepository["getApiKeyByHashedKey"];
  getAllApiKeys!: UsersRepository["getAllApiKeys"];

  // ============ Site Data ============
  insertOrUpdateSiteData!: SiteDataRepository["insertOrUpdateSiteData"];
  getAllSiteData!: SiteDataRepository["getAllSiteData"];
  getSiteData!: SiteDataRepository["getSiteData"];
  getSiteDataByKey!: SiteDataRepository["getSiteDataByKey"];
  getAllSiteDataAnalytics!: SiteDataRepository["getAllSiteDataAnalytics"];

  // ============ Incidents ============
  getIncidentsPaginated!: IncidentsRepository["getIncidentsPaginated"];
  createIncident!: IncidentsRepository["createIncident"];
  getIncidentsPaginatedDesc!: IncidentsRepository["getIncidentsPaginatedDesc"];
  getRecentUpdatedIncidents!: IncidentsRepository["getRecentUpdatedIncidents"];
  getPreviousIncidentId!: IncidentsRepository["getPreviousIncidentId"];
  getIncidentsBetween!: IncidentsRepository["getIncidentsBetween"];
  getIncidentsCount!: IncidentsRepository["getIncidentsCount"];
  getIncidentsCountByTypeAndDateRange!: IncidentsRepository["getIncidentsCountByTypeAndDateRange"];
  updateIncident!: IncidentsRepository["updateIncident"];
  deleteIncident!: IncidentsRepository["deleteIncident"];
  setIncidentEndTimeToNull!: IncidentsRepository["setIncidentEndTimeToNull"];
  getIncidentById!: IncidentsRepository["getIncidentById"];
  getIncidentsByIds!: IncidentsRepository["getIncidentsByIds"];
  getIncidentsByMonitorTag!: IncidentsRepository["getIncidentsByMonitorTag"];
  getIncidentsByMonitorTagRealtime!: IncidentsRepository["getIncidentsByMonitorTagRealtime"];
  getMaintenanceByMonitorTagRealtime!: IncidentsRepository["getMaintenanceByMonitorTagRealtime"];
  getOngoingMaintenances!: IncidentsRepository["getOngoingMaintenances"];
  getUpcomingMaintenances!: IncidentsRepository["getUpcomingMaintenances"];
  getLastMaintenance!: IncidentsRepository["getLastMaintenance"];
  getOngoingIncidents!: IncidentsRepository["getOngoingIncidents"];
  getLastIncident!: IncidentsRepository["getLastIncident"];
  getOngoingMaintenancesByMonitorTags!: IncidentsRepository["getOngoingMaintenancesByMonitorTags"];
  getUpcomingMaintenancesByMonitorTags!: IncidentsRepository["getUpcomingMaintenancesByMonitorTags"];
  getLastMaintenanceByMonitorTags!: IncidentsRepository["getLastMaintenanceByMonitorTags"];
  getOngoingIncidentsByMonitorTags!: IncidentsRepository["getOngoingIncidentsByMonitorTags"];
  getOngoingIncidentsForMonitorList!: IncidentsRepository["getOngoingIncidentsForMonitorList"];
  getOngoingIncidentsForMonitorListWithComments!: IncidentsRepository["getOngoingIncidentsForMonitorListWithComments"];
  geAllGlobalOngoingIncidents!: IncidentsRepository["geAllGlobalOngoingIncidents"];
  getAllGlobalOngoingIncidentsWithComments!: IncidentsRepository["getAllGlobalOngoingIncidentsWithComments"];
  getResolvedIncidentsForMonitorList!: IncidentsRepository["getResolvedIncidentsForMonitorList"];
  getResolvedIncidentsForMonitorListWithComments!: IncidentsRepository["getResolvedIncidentsForMonitorListWithComments"];
  getIncidentsForEventsByDateRange!: IncidentsRepository["getIncidentsForEventsByDateRange"];
  getIncidentsForEventsByDateRangeMonitor!: IncidentsRepository["getIncidentsForEventsByDateRangeMonitor"];
  getLastIncidentByMonitorTags!: IncidentsRepository["getLastIncidentByMonitorTags"];
  getIncidentsCountByTypeAndDateRangeAndMonitorTags!: IncidentsRepository["getIncidentsCountByTypeAndDateRangeAndMonitorTags"];

  // ============ Incident Monitors ============
  insertIncidentMonitor!: IncidentsRepository["insertIncidentMonitor"];
  getIncidentMonitorsByIncidentID!: IncidentsRepository["getIncidentMonitorsByIncidentID"];
  getIncidentMonitorsByIncidentIds!: IncidentsRepository["getIncidentMonitorsByIncidentIds"];
  getMonitorsByIncidentId!: IncidentsRepository["getMonitorsByIncidentId"];
  removeIncidentMonitor!: IncidentsRepository["removeIncidentMonitor"];
  insertIncidentMonitorWithMerge!: IncidentsRepository["insertIncidentMonitorWithMerge"];
  deleteIncidentMonitorsByTag!: IncidentsRepository["deleteIncidentMonitorsByTag"];

  // ============ Incident Comments ============
  insertIncidentComment!: IncidentsRepository["insertIncidentComment"];
  getIncidentComments!: IncidentsRepository["getIncidentComments"];
  getActiveIncidentComments!: IncidentsRepository["getActiveIncidentComments"];
  getActiveIncidentCommentsByIncidentIds!: IncidentsRepository["getActiveIncidentCommentsByIncidentIds"];
  getIncidentCommentByIDAndIncident!: IncidentsRepository["getIncidentCommentByIDAndIncident"];
  updateIncidentCommentByID!: IncidentsRepository["updateIncidentCommentByID"];
  updateIncidentCommentStatusByID!: IncidentsRepository["updateIncidentCommentStatusByID"];
  getIncidentCommentByID!: IncidentsRepository["getIncidentCommentByID"];
  deleteIncidentCommentsByIncidentID!: IncidentsRepository["deleteIncidentCommentsByIncidentID"];

  // ============ Images ============
  insertImage!: ImagesRepository["insertImage"];
  getImageById!: ImagesRepository["getImageById"];
  deleteImage!: ImagesRepository["deleteImage"];
  getAllImages!: ImagesRepository["getAllImages"];
  getAllImagesWithData!: ImagesRepository["getAllImagesWithData"];

  // ============ Pages ============
  createPage!: PagesRepository["createPage"];
  getPageById!: PagesRepository["getPageById"];
  getPageByPath!: PagesRepository["getPageByPath"];
  getAllPages!: PagesRepository["getAllPages"];
  updatePage!: PagesRepository["updatePage"];
  deletePage!: PagesRepository["deletePage"];

  // ============ Page Monitors ============
  addMonitorToPage!: PagesRepository["addMonitorToPage"];
  removeMonitorFromPage!: PagesRepository["removeMonitorFromPage"];
  getPageMonitors!: PagesRepository["getPageMonitors"];
  getPageMonitorsExcludeHidden!: PagesRepository["getPageMonitorsExcludeHidden"];
  getPagesByMonitorTag!: PagesRepository["getPagesByMonitorTag"];
  updatePageMonitorSettings!: PagesRepository["updatePageMonitorSettings"];
  monitorExistsOnPage!: PagesRepository["monitorExistsOnPage"];
  deletePageMonitorsByTag!: PagesRepository["deletePageMonitorsByTag"];
  deletePageMonitorsByPageId!: PagesRepository["deletePageMonitorsByPageId"];
  updatePageMonitorPositions!: PagesRepository["updatePageMonitorPositions"];

  // ============ Maintenances ============
  createMaintenance!: MaintenancesRepository["createMaintenance"];
  createMaintenanceWithMonitors!: MaintenancesRepository["createMaintenanceWithMonitors"];
  getMaintenanceById!: MaintenancesRepository["getMaintenanceById"];
  getMaintenancesByIds!: MaintenancesRepository["getMaintenancesByIds"];
  getAllMaintenances!: MaintenancesRepository["getAllMaintenances"];
  getMaintenancesPaginated!: MaintenancesRepository["getMaintenancesPaginated"];
  getMaintenancesAfterIdPaginated!: MaintenancesRepository["getMaintenancesAfterIdPaginated"];
  getMaintenancesCount!: MaintenancesRepository["getMaintenancesCount"];
  updateMaintenance!: MaintenancesRepository["updateMaintenance"];
  deleteMaintenance!: MaintenancesRepository["deleteMaintenance"];

  // ============ Maintenance Monitors ============
  addMonitorToMaintenance!: MaintenancesRepository["addMonitorToMaintenance"];
  addMonitorsToMaintenance!: MaintenancesRepository["addMonitorsToMaintenance"];
  addMonitorsToMaintenanceWithStatus!: MaintenancesRepository["addMonitorsToMaintenanceWithStatus"];
  removeMonitorFromMaintenance!: MaintenancesRepository["removeMonitorFromMaintenance"];
  removeAllMonitorsFromMaintenance!: MaintenancesRepository["removeAllMonitorsFromMaintenance"];
  getMaintenanceMonitors!: MaintenancesRepository["getMaintenanceMonitors"];
  getMaintenanceMonitorsByMaintenanceIds!: MaintenancesRepository["getMaintenanceMonitorsByMaintenanceIds"];
  getMonitorsByMaintenanceId!: MaintenancesRepository["getMonitorsByMaintenanceId"];
  getMaintenancesForMonitor!: MaintenancesRepository["getMaintenancesForMonitor"];
  deleteMaintenanceMonitorsByTag!: MaintenancesRepository["deleteMaintenanceMonitorsByTag"];
  updateMonitorImpactInMaintenanceMonitors!: MaintenancesRepository["updateMonitorImpactInMaintenanceMonitors"];

  // ============ Maintenance Events ============
  createMaintenanceEvent!: MaintenancesRepository["createMaintenanceEvent"];
  getMaintenanceEventById!: MaintenancesRepository["getMaintenanceEventById"];
  getMaintenanceEventsByMaintenanceId!: MaintenancesRepository["getMaintenanceEventsByMaintenanceId"];
  getMaintenanceEventsByMaintenanceIds!: MaintenancesRepository["getMaintenanceEventsByMaintenanceIds"];
  getMaintenanceEventsByMaintenanceIdWithLimits!: MaintenancesRepository["getMaintenanceEventsByMaintenanceIdWithLimits"];
  getMaintenanceEvents!: MaintenancesRepository["getMaintenanceEvents"];
  getActiveMaintenanceEvents!: MaintenancesRepository["getActiveMaintenanceEvents"];
  getMaintenanceEventsForMonitor!: MaintenancesRepository["getMaintenanceEventsForMonitor"];
  updateMaintenanceEvent!: MaintenancesRepository["updateMaintenanceEvent"];
  updateMaintenanceEventStatus!: MaintenancesRepository["updateMaintenanceEventStatus"];
  deleteMaintenanceEvent!: MaintenancesRepository["deleteMaintenanceEvent"];
  getOngoingMaintenanceEventsByMonitorTags!: MaintenancesRepository["getOngoingMaintenanceEventsByMonitorTags"];
  getUpcomingMaintenanceEventsByMonitorTags!: MaintenancesRepository["getUpcomingMaintenanceEventsByMonitorTags"];
  getMaintenancesByMonitorTagRealtime!: MaintenancesRepository["getMaintenancesByMonitorTagRealtime"];
  getScheduledEventsStartingSoon!: MaintenancesRepository["getScheduledEventsStartingSoon"];
  getScheduledEventsAlreadyStarted!: MaintenancesRepository["getScheduledEventsAlreadyStarted"];
  getReadyEventsInProgress!: MaintenancesRepository["getReadyEventsInProgress"];
  getOngoingEventsCompleted!: MaintenancesRepository["getOngoingEventsCompleted"];

  // ============ Maintenance Events for Monitor List ============
  getOngoingMaintenanceEventsForMonitorList!: MaintenancesRepository["getOngoingMaintenanceEventsForMonitorList"];
  getAllGlobalOngoingMaintenanceEvents!: MaintenancesRepository["getAllGlobalOngoingMaintenanceEvents"];
  getPastMaintenanceEventsForMonitorList!: MaintenancesRepository["getPastMaintenanceEventsForMonitorList"];
  getUpcomingMaintenanceEventsForMonitorList!: MaintenancesRepository["getUpcomingMaintenanceEventsForMonitorList"];
  getMaintenanceEventsForEventsByDateRange!: MaintenancesRepository["getMaintenanceEventsForEventsByDateRange"];
  getMaintenanceEventsForEventsByDateRangeMonitor!: MaintenancesRepository["getMaintenanceEventsForEventsByDateRangeMonitor"];
  getMaintenanceEventsWithDetails!: MaintenancesRepository["getMaintenanceEventsWithDetails"];

  // ============ Monitor Alert Config ============
  insertMonitorAlertConfig!: MonitorAlertConfigRepository["insertMonitorAlertConfig"];
  updateMonitorAlertConfig!: MonitorAlertConfigRepository["updateMonitorAlertConfig"];
  getMonitorAlertConfigById!: MonitorAlertConfigRepository["getMonitorAlertConfigById"];
  getMonitorAlertConfigs!: MonitorAlertConfigRepository["getMonitorAlertConfigs"];
  getMonitorAlertConfigsByMonitorTag!: MonitorAlertConfigRepository["getMonitorAlertConfigsByMonitorTag"];
  getActiveMonitorAlertConfigs!: MonitorAlertConfigRepository["getActiveMonitorAlertConfigs"];
  getActiveMonitorAlertConfigsByMonitorTag!: MonitorAlertConfigRepository["getActiveMonitorAlertConfigsByMonitorTag"];
  deleteMonitorAlertConfig!: MonitorAlertConfigRepository["deleteMonitorAlertConfig"];
  deleteMonitorAlertConfigsByMonitorTag!: MonitorAlertConfigRepository["deleteMonitorAlertConfigsByMonitorTag"];
  getMonitorAlertConfigsCount!: MonitorAlertConfigRepository["getMonitorAlertConfigsCount"];
  getMonitorAlertConfigsPaginated!: MonitorAlertConfigRepository["getMonitorAlertConfigsPaginated"];

  // ============ Monitor Alert Config Triggers ============
  addTriggerToMonitorAlertConfig!: MonitorAlertConfigRepository["addTriggerToMonitorAlertConfig"];
  addTriggersToMonitorAlertConfig!: MonitorAlertConfigRepository["addTriggersToMonitorAlertConfig"];
  removeTriggerFromMonitorAlertConfig!: MonitorAlertConfigRepository["removeTriggerFromMonitorAlertConfig"];
  removeAllTriggersFromMonitorAlertConfig!: MonitorAlertConfigRepository["removeAllTriggersFromMonitorAlertConfig"];
  getMonitorAlertConfigTriggers!: MonitorAlertConfigRepository["getMonitorAlertConfigTriggers"];
  getMonitorAlertConfigTriggerIds!: MonitorAlertConfigRepository["getMonitorAlertConfigTriggerIds"];
  replaceMonitorAlertConfigTriggers!: MonitorAlertConfigRepository["replaceMonitorAlertConfigTriggers"];
  getMonitorAlertConfigWithTriggers!: MonitorAlertConfigRepository["getMonitorAlertConfigWithTriggers"];
  getMonitorAlertConfigsWithTriggersByMonitorTag!: MonitorAlertConfigRepository["getMonitorAlertConfigsWithTriggersByMonitorTag"];
  getActiveMonitorAlertConfigsWithTriggers!: MonitorAlertConfigRepository["getActiveMonitorAlertConfigsWithTriggers"];
  getTriggersAndTagsForConfigIds!: MonitorAlertConfigRepository["getTriggersAndTagsForConfigIds"];
  isTriggerUsedInMonitorAlertConfig!: MonitorAlertConfigRepository["isTriggerUsedInMonitorAlertConfig"];
  getMonitorAlertConfigsByTriggerId!: MonitorAlertConfigRepository["getMonitorAlertConfigsByTriggerId"];

  // ============ Monitor Alert Config Monitors ============
  addMonitorsToAlertConfig!: MonitorAlertConfigRepository["addMonitorsToAlertConfig"];
  removeAllMonitorsFromAlertConfig!: MonitorAlertConfigRepository["removeAllMonitorsFromAlertConfig"];
  replaceAlertConfigMonitors!: MonitorAlertConfigRepository["replaceAlertConfigMonitors"];
  getAlertConfigMonitorTags!: MonitorAlertConfigRepository["getAlertConfigMonitorTags"];

  // ============ Monitor Alerts V2 ============
  insertMonitorAlertV2!: MonitorAlertConfigRepository["insertMonitorAlertV2"];
  updateMonitorAlertV2!: MonitorAlertConfigRepository["updateMonitorAlertV2"];
  updateMonitorAlertV2Status!: MonitorAlertConfigRepository["updateMonitorAlertV2Status"];
  getMonitorAlertV2ById!: MonitorAlertConfigRepository["getMonitorAlertV2ById"];
  getMonitorAlertsV2!: MonitorAlertConfigRepository["getMonitorAlertsV2"];
  getMonitorAlertsV2ByConfigId!: MonitorAlertConfigRepository["getMonitorAlertsV2ByConfigId"];
  hasTriggeredAlertForConfig!: MonitorAlertConfigRepository["hasTriggeredAlertForConfig"];
  getActiveAlertForConfig!: MonitorAlertConfigRepository["getActiveAlertForConfig"];
  getAllTriggeredAlerts!: MonitorAlertConfigRepository["getAllTriggeredAlerts"];
  deleteMonitorAlertV2!: MonitorAlertConfigRepository["deleteMonitorAlertV2"];
  deleteMonitorAlertsV2ByConfigId!: MonitorAlertConfigRepository["deleteMonitorAlertsV2ByConfigId"];
  getMonitorAlertV2WithConfig!: MonitorAlertConfigRepository["getMonitorAlertV2WithConfig"];
  getAllTriggeredAlertsWithConfig!: MonitorAlertConfigRepository["getAllTriggeredAlertsWithConfig"];
  addIncidentToAlert!: MonitorAlertConfigRepository["addIncidentToAlert"];
  getAlertsByIncidentId!: MonitorAlertConfigRepository["getAlertsByIncidentId"];
  getMonitorAlertsV2Count!: MonitorAlertConfigRepository["getMonitorAlertsV2Count"];
  getMonitorAlertsV2Paginated!: MonitorAlertConfigRepository["getMonitorAlertsV2Paginated"];

  // ============ Subscription System V2 (subscriber_users, subscriber_methods, user_subscriptions_v2) ============
  createSubscriberUser!: SubscriptionSystemRepository["createSubscriberUser"];
  getSubscriberUserById!: SubscriptionSystemRepository["getSubscriberUserById"];
  getSubscriberUserByEmail!: SubscriptionSystemRepository["getSubscriberUserByEmail"];
  getSubscriberUserByLinkedUserId!: SubscriptionSystemRepository["getSubscriberUserByLinkedUserId"];
  updateSubscriberUser!: SubscriptionSystemRepository["updateSubscriberUser"];
  deleteSubscriberUser!: SubscriptionSystemRepository["deleteSubscriberUser"];
  getSubscriberUsersCount!: SubscriptionSystemRepository["getSubscriberUsersCount"];
  getSubscriberUsersPaginated!: SubscriptionSystemRepository["getSubscriberUsersPaginated"];
  createSubscriberMethod!: SubscriptionSystemRepository["createSubscriberMethod"];
  getSubscriberMethodById!: SubscriptionSystemRepository["getSubscriberMethodById"];
  getSubscriberMethodsByUserId!: SubscriptionSystemRepository["getSubscriberMethodsByUserId"];
  getSubscriberMethodByUserAndType!: SubscriptionSystemRepository["getSubscriberMethodByUserAndType"];
  updateSubscriberMethod!: SubscriptionSystemRepository["updateSubscriberMethod"];
  deleteSubscriberMethod!: SubscriptionSystemRepository["deleteSubscriberMethod"];
  getActiveMethodsByType!: SubscriptionSystemRepository["getActiveMethodsByType"];
  createUserSubscriptionV2!: SubscriptionSystemRepository["createUserSubscriptionV2"];
  getUserSubscriptionV2ById!: SubscriptionSystemRepository["getUserSubscriptionV2ById"];
  getUserSubscriptionsV2!: SubscriptionSystemRepository["getUserSubscriptionsV2"];
  updateUserSubscriptionV2!: SubscriptionSystemRepository["updateUserSubscriptionV2"];
  deleteUserSubscriptionV2!: SubscriptionSystemRepository["deleteUserSubscriptionV2"];
  subscriptionV2Exists!: SubscriptionSystemRepository["subscriptionV2Exists"];
  getSubscriptionsWithMethodsForUser!: SubscriptionSystemRepository["getSubscriptionsWithMethodsForUser"];
  getSubscribersForEvent!: SubscriptionSystemRepository["getSubscribersForEvent"];
  getSubscribersSummary!: SubscriptionSystemRepository["getSubscribersSummary"];
  getMethodsCountByType!: SubscriptionSystemRepository["getMethodsCountByType"];
  getSubscribersByMethodTypeV2!: SubscriptionSystemRepository["getSubscribersByMethodTypeV2"];
  getSubscriberDetailsByMethodId!: SubscriptionSystemRepository["getSubscriberDetailsByMethodId"];
  upsertSubscriptionScopes!: SubscriptionSystemRepository["upsertSubscriptionScopes"];
  getSubscriptionScopes!: SubscriptionSystemRepository["getSubscriptionScopes"];

  // ============ General Email Templates ============
  insertEmailTemplate!: EmailTemplateConfigRepository["insertEmailTemplate"];
  updateEmailTemplate!: EmailTemplateConfigRepository["updateEmailTemplate"];
  getAllEmailTemplates!: EmailTemplateConfigRepository["getAllEmailTemplates"];
  getEmailTemplateById!: EmailTemplateConfigRepository["getEmailTemplateById"];
  deleteEmailTemplate!: EmailTemplateConfigRepository["deleteEmailTemplate"];
  upsertEmailTemplate!: EmailTemplateConfigRepository["upsertEmailTemplate"];

  // ============ Groups ============
  getAllGroups!: GroupsRepository["getAllGroups"];
  getGroupById!: GroupsRepository["getGroupById"];
  createGroup!: GroupsRepository["createGroup"];
  updateGroup!: GroupsRepository["updateGroup"];
  deleteGroup!: GroupsRepository["deleteGroup"];
  getGroupsCount!: GroupsRepository["getGroupsCount"];

  // ============ Group Members ============
  getGroupMembers!: GroupsRepository["getGroupMembers"];
  addGroupMember!: GroupsRepository["addGroupMember"];
  removeGroupMember!: GroupsRepository["removeGroupMember"];
  getMemberCount!: GroupsRepository["getMemberCount"];

  // ============ Group Roles ============
  getGroupRoles!: GroupsRepository["getGroupRoles"];
  addGroupRole!: GroupsRepository["addGroupRole"];
  removeGroupRole!: GroupsRepository["removeGroupRole"];
  getRoleCount!: GroupsRepository["getRoleCount"];

  // ============ Groups Lookup ============
  getGroupsForUser!: GroupsRepository["getGroupsForUser"];

  // ============ Resource Access ============
  getRolePages!: ResourceAccessRepository["getRolePages"];
  setRolePages!: ResourceAccessRepository["setRolePages"];
  getRoleMonitors!: ResourceAccessRepository["getRoleMonitors"];
  setRoleMonitors!: ResourceAccessRepository["setRoleMonitors"];
  deleteRolesMonitorsByTag!: ResourceAccessRepository["deleteRolesMonitorsByTag"];
  getEffectiveAccess!: ResourceAccessRepository["getEffectiveAccess"];
  getAccessibleResources!: ResourceAccessRepository["getAccessibleResources"];

  /** Exposes the underlying Knex instance for transaction support. */
  get knex(): KnexType {
    return this._knex;
  }

  constructor(opts: KnexType.Config) {
    this._knex = Knex(opts);

    // Initialize repositories
    this.monitoring = new MonitoringRepository(this._knex);
    this.monitors = new MonitorsRepository(this._knex);
    this.alerts = new AlertsRepository(this._knex);
    this.users = new UsersRepository(this._knex);
    this.siteData = new SiteDataRepository(this._knex);
    this.incidents = new IncidentsRepository(this._knex);
    this.images = new ImagesRepository(this._knex);
    this.pages = new PagesRepository(this._knex);
    this.maintenances = new MaintenancesRepository(this._knex);
    this.monitorAlertConfig = new MonitorAlertConfigRepository(this._knex);
    this.subscriptionSystem = new SubscriptionSystemRepository(this._knex);
    this.emailTemplateConfig = new EmailTemplateConfigRepository(this._knex);
    this.groups = new GroupsRepository(this._knex);
    this.resourceAccess = new ResourceAccessRepository(this._knex);

    // Bind all methods from each repository to this instance
    this.bindAll(this.monitoring);
    this.bindAll(this.monitors);
    this.bindAll(this.alerts);
    this.bindAll(this.users);
    this.bindAll(this.siteData);
    this.bindAll(this.incidents);
    this.bindAll(this.images);
    this.bindAll(this.pages);
    this.bindAll(this.maintenances);
    this.bindAll(this.monitorAlertConfig);
    this.bindAll(this.subscriptionSystem);
    this.bindAll(this.emailTemplateConfig);
    this.bindAll(this.groups);
    this.bindAll(this.resourceAccess);

    this.init();
  }

  // Binds every prototype method of a repository onto this instance, preserving `this` context.
  // The public field declarations above define the TypeScript contract; this handles the runtime wiring.
  private bindAll<T extends object>(repo: T): void {
    let proto = Object.getPrototypeOf(repo);
    while (proto && proto !== Object.prototype) {
      for (const key of Object.getOwnPropertyNames(proto)) {
        if (key === "constructor") continue;
        const val = (repo as Record<string, unknown>)[key];
        if (typeof val === "function" && !(this as Record<string, unknown>)[key]) {
          (this as Record<string, unknown>)[key] = val.bind(repo);
        }
      }
      proto = Object.getPrototypeOf(proto);
    }
  }

  async init(): Promise<void> {
    const clientName = (this._knex.client as any)?.config?.client;
    if (clientName === "better-sqlite3") {
      // WAL mode: readers don't block writers; reduces lock contention between
      // the dev-mode scheduler process and the SvelteKit server process.
      await this._knex.raw("PRAGMA journal_mode = WAL");
      // Retry for up to 30 s when another process holds a write lock.
      await this._knex.raw("PRAGMA busy_timeout = 30000");
    }
  }

  async close(): Promise<void> {
    return await this._knex.destroy();
  }
}

export default DbImpl;
