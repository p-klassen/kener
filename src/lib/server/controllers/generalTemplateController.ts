import db from "$lib/server/db/db";
import type { GeneralEmailTemplateRecord, GeneralEmailTemplateRecordInsert } from "$lib/server/types/db";

/**
 * Get all general email templates
 */
export async function GetAllGeneralEmailTemplates(): Promise<GeneralEmailTemplateRecord[]> {
  return await db.getAllEmailTemplates();
}

/**
 * Get a general email template by ID
 */
export async function GetGeneralEmailTemplateById(templateId: string): Promise<GeneralEmailTemplateRecord | undefined> {
  return await db.getEmailTemplateById(templateId);
}

/**
 * Get a general email template by ID with locale fallback.
 * Tries `{templateId}.{locale}` first, then falls back to `{templateId}`.
 */
export async function GetGeneralEmailTemplateByIdAndLocale(
  templateId: string,
  locale: string | null | undefined,
): Promise<GeneralEmailTemplateRecord | undefined> {
  if (locale && locale !== "en") {
    const localized = await db.getEmailTemplateById(`${templateId}.${locale}`);
    if (localized) return localized;
  }
  return await db.getEmailTemplateById(templateId);
}

/**
 * Update a general email template
 */
export async function UpdateGeneralEmailTemplate(
  templateId: string,
  data: Partial<Omit<GeneralEmailTemplateRecordInsert, "template_id">>,
): Promise<{ success: boolean; error?: string }> {
  // Check if template exists
  const existingTemplate = await db.getEmailTemplateById(templateId);
  if (!existingTemplate) {
    return { success: false, error: `Template with ID ${templateId} not found` };
  }

  await db.updateEmailTemplate(templateId, data);
  return { success: true };
}
