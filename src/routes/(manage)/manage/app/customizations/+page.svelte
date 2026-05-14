<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Textarea } from "$lib/components/ui/textarea/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
import * as Breadcrumb from "$lib/components/ui/breadcrumb/index.js";
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import * as Select from "$lib/components/ui/select/index.js";
  import * as RadioGroup from "$lib/components/ui/radio-group/index.js";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import Loader from "@lucide/svelte/icons/loader";
  import SaveIcon from "@lucide/svelte/icons/save";
  import Info from "@lucide/svelte/icons/info";
  import X from "@lucide/svelte/icons/x";
  import { toast } from "svelte-sonner";
  import { mode } from "mode-watcher";
  import constants from "$lib/global-constants";
  import { t } from "$lib/stores/i18n";

  import CodeMirror from "svelte-codemirror-editor";
  import { html } from "@codemirror/lang-html";
  import { css } from "@codemirror/lang-css";
  import { githubLight, githubDark } from "@uiw/codemirror-theme-github";
  import ColorPicker from "svelte-awesome-color-picker";
  import { resolve } from "$app/paths";
  import clientResolver from "$lib/client/resolver.js";
  import type { SiteAnnouncement, PageOrderingSettings } from "$lib/types/site.js";
  import ArrowUp from "@lucide/svelte/icons/arrow-up";
  import ArrowDown from "@lucide/svelte/icons/arrow-down";
  import GripVertical from "@lucide/svelte/icons/grip-vertical";

  interface StatusColors {
    UP: string;
    DOWN: string;
    DEGRADED: string;
    MAINTENANCE: string;
    ACCENT: string;
    ACCENT_FOREGROUND: string;
  }

  interface FontConfig {
    cssSrc: string;
    family: string;
    fileId?: string;
    originalName?: string;
  }

  type AnnouncementForm = Omit<SiteAnnouncement, "reshowAfterInHours" | "ctaURL" | "ctaText"> & {
    reshowAfterInHours: string;
    ctaURL: string;
    ctaText: string;
  };

  // State
  let loading = $state(true);
  let savingFooter = $state(false);
  let savingColors = $state(false);
  let savingFont = $state(false);
  let uploadingFont = $state(false);
  let uploadedFontName = $state("");
  let detectedFamilies = $state<string[]>([]);
  let pendingFontFile = $state<File | null>(null);
  let savingCSS = $state(false);
  let savingTheme = $state(false);
  let savingAnnouncement = $state(false);
  let savingPageOrdering = $state(false);
  let loadingPages = $state(false);

  // Data
  let footerHTML = $state("");
  let defaultFooterHTML = $state("");
  let theme = $state<"light" | "dark" | "system">("system");
  let themeToggle = $state<"YES" | "NO">("YES");
  let colors = $state<StatusColors>({
    UP: "#67ab95",
    DOWN: "#ca3038",
    DEGRADED: "#e6ca61",
    MAINTENANCE: "#6679cc",
    ACCENT: "#f4f4f5",
    ACCENT_FOREGROUND: "#e96e2d"
  });
  let colorsDark = $state<StatusColors>({
    UP: "#67ab95",
    DOWN: "#ca3038",
    DEGRADED: "#e6ca61",
    MAINTENANCE: "#6679cc",
    ACCENT: "#27272a",
    ACCENT_FOREGROUND: "#e96e2d"
  });
  let font = $state<FontConfig>({
    cssSrc: "",
    family: ""
  });
  let customCSS = $state("");
  let announcement = $state<AnnouncementForm>({
    title: "",
    message: "",
    type: "INFO",
    reshowAfterInHours: "",
    cancellable: true,
    ctaURL: "",
    ctaText: ""
  });

  // Page ordering
  interface PageItem {
    id: number;
    page_path: string;
    page_title: string;
  }
  let pageOrderingEnabled = $state(false);
  let orderedPageIds = $state<number[]>([]);
  let allPages = $state<PageItem[]>([]);
  let displayPages = $derived.by(() => {
    if (orderedPageIds.length === 0) {
      return allPages;
    }
    const ordered: PageItem[] = [];
    for (const id of orderedPageIds) {
      const page = allPages.find((p) => p.id === id);
      if (page) ordered.push(page);
    }
    // Append pages not in the order list (newly added)
    for (const page of allPages) {
      if (!orderedPageIds.includes(page.id)) {
        ordered.push(page);
      }
    }
    return ordered;
  });

  async function fetchSettings() {
    loading = true;
    try {
      const response = await fetch(clientResolver(resolve, "/manage/api"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "getAllSiteData" })
      });
      const result = await response.json();
      if (result.error) {
        toast.error(result.error);
      } else {
        if (result.footerHTML) {
          footerHTML = result.footerHTML;
        }
        if (result.colors) {
          colors = {
            UP: result.colors.UP || "#67ab95",
            DOWN: result.colors.DOWN || "#ca3038",
            DEGRADED: result.colors.DEGRADED || "#e6ca61",
            MAINTENANCE: result.colors.MAINTENANCE || "#6679cc",
            ACCENT: result.colors.ACCENT || "#f4f4f5",
            ACCENT_FOREGROUND: result.colors.ACCENT_FOREGROUND || result.colors.ACCENT || "#e96e2d"
          };
        }
        if (result.colorsDark) {
          colorsDark = {
            UP: result.colorsDark.UP || colors.UP,
            DOWN: result.colorsDark.DOWN || colors.DOWN,
            DEGRADED: result.colorsDark.DEGRADED || colors.DEGRADED,
            MAINTENANCE: result.colorsDark.MAINTENANCE || colors.MAINTENANCE,
            ACCENT: result.colorsDark.ACCENT || "#27272a",
            ACCENT_FOREGROUND:
              result.colorsDark.ACCENT_FOREGROUND || result.colorsDark.ACCENT || colors.ACCENT_FOREGROUND
          };
        } else {
          colorsDark = { ...colors, ACCENT: "#27272a" };
        }
        if (result.font) {
          font = {
            cssSrc: result.font.cssSrc || "",
            family: result.font.family || "",
            fileId: result.font.fileId || "",
          };
          uploadedFontName = result.font.originalName || "";
        }
        if (result.customCSS) {
          customCSS = result.customCSS;
        }
        if (result.theme) {
          theme = result.theme as "light" | "dark" | "system";
        }
        if (result.themeToggle) {
          themeToggle = result.themeToggle as "YES" | "NO";
        }
        if (result.announcement) {
          announcement = {
            title: result.announcement.title || "",
            message: result.announcement.message || "",
            type: result.announcement.type || "INFO",
            reshowAfterInHours:
              result.announcement.reshowAfterInHours === null || result.announcement.reshowAfterInHours === undefined
                ? ""
                : String(result.announcement.reshowAfterInHours),
            cancellable: result.announcement.cancellable ?? true,
            ctaURL: result.announcement.ctaURL || "",
            ctaText: result.announcement.ctaText || ""
          };
        }
        if (result.pageOrderingSettings) {
          pageOrderingEnabled = result.pageOrderingSettings.enabled ?? false;
          orderedPageIds = result.pageOrderingSettings.order ?? [];
        }
      }
      // Set default footer HTML
      defaultFooterHTML = `<div class="container relative mt-4 max-w-[655px]">
  <div class="flex flex-col items-center gap-4 px-8 md:flex-row md:gap-2 md:px-0">
    <p class="text-center text-sm leading-loose text-muted-foreground">
      Made using
      <a href="https://github.com/rajnandan1/kener" target="_blank" class="font-medium underline underline-offset-4">
        Kener
      </a>
      an open source status page system built with Svelte and TailwindCSS.
    </p>
  </div>
</div>`;
    } catch (e) {
      toast.error("Failed to load settings");
    } finally {
      loading = false;
    }
  }

  // Save functions for each section
  async function saveFooter() {
    savingFooter = true;
    try {
      const response = await fetch(clientResolver(resolve, "/manage/api"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "storeSiteData",
          data: { footerHTML }
        })
      });
      const result = await response.json();
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Footer saved successfully");
      }
    } catch (e) {
      toast.error("Failed to save footer");
    } finally {
      savingFooter = false;
    }
  }

  async function saveColors() {
    savingColors = true;
    try {
      const response = await fetch(clientResolver(resolve, "/manage/api"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "storeSiteData",
          data: { colors: JSON.stringify(colors), colorsDark: JSON.stringify(colorsDark) }
        })
      });
      const result = await response.json();
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success($t("manage.customizations.colors_save"));
      }
    } catch (e) {
      toast.error("Failed to save colors");
    } finally {
      savingColors = false;
    }
  }

  async function saveFontUrl() {
    savingFont = true;
    try {
      if (font.fileId) {
        const deleteRes = await fetch(clientResolver(resolve, "/manage/api"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "deleteImage", data: { id: font.fileId } })
        });
        const deleteResult = await deleteRes.json();
        if (deleteResult.error) {
          console.warn("Failed to delete old font file:", deleteResult.error);
        }
      }

      const response = await fetch(clientResolver(resolve, "/manage/api"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "storeSiteData",
          data: {
            font: JSON.stringify({ cssSrc: font.cssSrc, family: font.family, fileId: "", originalName: "" })
          }
        })
      });
      const result = await response.json();
      if (result.error) {
        toast.error(result.error);
      } else {
        font.fileId = "";
        uploadedFontName = "";
        toast.success("Font settings saved successfully");
      }
    } catch (e) {
      toast.error("Failed to save font settings");
    } finally {
      savingFont = false;
    }
  }

  async function parseFontFamilyNames(buffer: ArrayBuffer): Promise<string[]> {
    try {
      const view = new DataView(buffer);
      const magic = view.getUint32(0);

      // WOFF2 uses Brotli — not supported by DecompressionStream
      if (magic === 0x774f4632) return [];

      const isWOFF = magic === 0x774f4646;
      const numTables = isWOFF ? view.getUint16(12) : view.getUint16(4);
      const dirOffset = isWOFF ? 44 : 12;
      const dirEntrySize = isWOFF ? 20 : 16;

      let nameOffset = -1;
      let nameCompLen = -1;
      let nameOrigLen = -1;

      for (let i = 0; i < numTables; i++) {
        const base = dirOffset + i * dirEntrySize;
        const tag = String.fromCharCode(
          view.getUint8(base),
          view.getUint8(base + 1),
          view.getUint8(base + 2),
          view.getUint8(base + 3)
        );
        if (tag === "name") {
          if (isWOFF) {
            nameOffset = view.getUint32(base + 4);
            nameCompLen = view.getUint32(base + 8);
            nameOrigLen = view.getUint32(base + 12);
          } else {
            nameOffset = view.getUint32(base + 8);
            nameCompLen = view.getUint32(base + 12);
            nameOrigLen = nameCompLen;
          }
          break;
        }
      }

      if (nameOffset === -1) return [];

      let nameData: DataView;
      let nameBase = 0;

      if (isWOFF && nameCompLen < nameOrigLen) {
        // zlib-compressed WOFF table — decompress with DecompressionStream
        const compressed = buffer.slice(nameOffset, nameOffset + nameCompLen);
        const ds = new DecompressionStream("deflate");
        const writer = ds.writable.getWriter();
        writer.write(new Uint8Array(compressed));
        writer.close();
        nameData = new DataView(await new Response(ds.readable).arrayBuffer());
      } else {
        nameData = view;
        nameBase = nameOffset;
      }

      const count = nameData.getUint16(nameBase + 2);
      const stringOffset = nameData.getUint16(nameBase + 4);
      const families = new Set<string>();

      for (let i = 0; i < count; i++) {
        const rec = nameBase + 6 + i * 12;
        const platformID = nameData.getUint16(rec);
        const nameID = nameData.getUint16(rec + 6);

        // nameID 1 = Font Family, 16 = Typographic Family (preferred)
        if (nameID !== 1 && nameID !== 16) continue;

        const len = nameData.getUint16(rec + 8);
        const off = nameData.getUint16(rec + 10);
        const strBase = nameBase + stringOffset + off;

        let name = "";
        if (platformID === 3 || platformID === 0) {
          for (let j = 0; j < len; j += 2) {
            name += String.fromCharCode(nameData.getUint16(strBase + j));
          }
        } else {
          for (let j = 0; j < len; j++) {
            name += String.fromCharCode(nameData.getUint8(strBase + j));
          }
        }

        name = name.trim();
        if (name) families.add(name);
      }

      return [...families];
    } catch {
      return [];
    }
  }

  async function uploadFontFile(file: File) {
    if (!font.family.trim()) {
      toast.error("Please enter a font family name");
      return;
    }
    uploadingFont = true;
    const previousFileId = font.fileId;
    try {
      const base64 = await fileToBase64Font(file);
      const uploadResponse = await fetch(clientResolver(resolve, "/manage/api"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "uploadImage",
          data: { base64, mimeType: fontMimeTypeFromName(file.name), fileName: file.name }
        })
      });
      const uploadResult = await uploadResponse.json();
      if (uploadResult.error) {
        toast.error(uploadResult.error);
        return;
      }

      const saveResponse = await fetch(clientResolver(resolve, "/manage/api"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "storeSiteData",
          data: {
            font: JSON.stringify({
              cssSrc: "",
              family: font.family,
              fileId: uploadResult.id,
              originalName: file.name
            })
          }
        })
      });
      const saveResult = await saveResponse.json();
      if (saveResult.error) {
        toast.error(saveResult.error);
      } else {
        font.cssSrc = "";
        font.fileId = uploadResult.id;
        uploadedFontName = file.name;
        pendingFontFile = null;
        detectedFamilies = [];
        toast.success("Font uploaded successfully");

        if (previousFileId) {
          const deleteRes = await fetch(clientResolver(resolve, "/manage/api"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "deleteImage", data: { id: previousFileId } })
          });
          const deleteResult = await deleteRes.json();
          if (deleteResult.error) console.warn("Failed to delete old font file:", deleteResult.error);
        }
      }
    } catch {
      toast.error("Failed to upload font");
    } finally {
      uploadingFont = false;
    }
  }

  function fontMimeTypeFromName(filename: string): string {
    const ext = filename.split(".").pop()?.toLowerCase() ?? "";
    const map: Record<string, string> = { ttf: "font/ttf", otf: "font/otf", woff: "font/woff", woff2: "font/woff2" };
    return map[ext] ?? "font/ttf";
  }

  function fileToBase64Font(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(",")[1];
        resolve(base64);
      };
      reader.onerror = (error) => reject(error);
    });
  }

  async function saveFontFile(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    input.value = "";

    if (file.size > 2 * 1024 * 1024) {
      toast.error("Font file must be under 2 MB");
      return;
    }

    const buffer = await file.arrayBuffer();
    const families = await parseFontFamilyNames(buffer);

    if (families.length === 1) {
      font.family = families[0];
      await uploadFontFile(file);
    } else if (families.length > 1) {
      detectedFamilies = families;
      font.family = families[0];
      pendingFontFile = file;
    } else {
      // Auto-detection failed (e.g. WOFF2) — let user enter family manually
      detectedFamilies = [];
      pendingFontFile = file;
    }
  }

  async function removeFontFile() {
    if (!font.fileId) return;
    savingFont = true;
    try {
      const deleteRes = await fetch(clientResolver(resolve, "/manage/api"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "deleteImage", data: { id: font.fileId } })
      });
      const deleteResult = await deleteRes.json();
      if (deleteResult.error) {
        toast.error("Failed to remove font file");
        return;
      }

      const response = await fetch(clientResolver(resolve, "/manage/api"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "storeSiteData",
          data: {
            font: JSON.stringify({ cssSrc: "", family: "", fileId: "", originalName: "" })
          }
        })
      });
      const result = await response.json();
      if (result.error) {
        toast.error(result.error);
      } else {
        font.fileId = "";
        font.family = "";
        uploadedFontName = "";
        toast.success("Font removed successfully");
      }
    } catch (e) {
      toast.error("Failed to remove font");
    } finally {
      savingFont = false;
    }
  }

  async function saveCustomCSS() {
    savingCSS = true;
    try {
      const response = await fetch(clientResolver(resolve, "/manage/api"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "storeSiteData",
          data: { customCSS }
        })
      });
      const result = await response.json();
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Custom CSS saved successfully");
      }
    } catch (e) {
      toast.error("Failed to save custom CSS");
    } finally {
      savingCSS = false;
    }
  }

  async function saveTheme() {
    savingTheme = true;
    try {
      const response = await fetch(clientResolver(resolve, "/manage/api"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "storeSiteData",
          data: { theme, themeToggle }
        })
      });
      const result = await response.json();
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Theme settings saved successfully");
      }
    } catch (e) {
      toast.error("Failed to save theme settings");
    } finally {
      savingTheme = false;
    }
  }

  async function saveAnnouncement() {
    savingAnnouncement = true;
    try {
      const rawReshow = announcement.reshowAfterInHours;
      const parsedReshow = rawReshow == null ? "" : String(rawReshow).trim();
      const reshowAfterInHours = parsedReshow.length === 0 ? null : Math.max(0, Number(parsedReshow));

      const payload: SiteAnnouncement = {
        title: announcement.title.trim(),
        message: announcement.message.trim(),
        type: announcement.type,
        reshowAfterInHours: Number.isFinite(reshowAfterInHours as number) ? reshowAfterInHours : null,
        cancellable: announcement.cancellable,
        ctaURL: announcement.ctaURL.trim() ? announcement.ctaURL.trim() : null,
        ctaText: announcement.ctaText.trim() ? announcement.ctaText.trim() : null
      };

      const response = await fetch(clientResolver(resolve, "/manage/api"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "storeSiteData",
          data: { announcement: JSON.stringify(payload) }
        })
      });

      const result = await response.json();
      if (result.error) {
        toast.error(result.error);
      } else {
        announcement.reshowAfterInHours = reshowAfterInHours == null ? "" : String(reshowAfterInHours);
        toast.success("Announcement settings saved successfully");
      }
    } catch (e) {
      toast.error("Failed to save announcement settings");
    } finally {
      savingAnnouncement = false;
    }
  }

  async function fetchPages() {
    loadingPages = true;
    try {
      const response = await fetch(clientResolver(resolve, "/manage/api"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "getPages" })
      });
      const result = await response.json();
      if (Array.isArray(result)) {
        allPages = result.map((p: { id: number; page_path: string; page_title: string }) => ({
          id: p.id,
          page_path: p.page_path,
          page_title: p.page_title
        }));
      }
    } catch {
      // silently fail
    } finally {
      loadingPages = false;
    }
  }

  async function savePageOrdering() {
    savingPageOrdering = true;
    try {
      const payload: PageOrderingSettings = {
        enabled: pageOrderingEnabled,
        order: displayPages.map((p) => p.id)
      };

      const response = await fetch(clientResolver(resolve, "/manage/api"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "storeSiteData",
          data: { pageOrderingSettings: JSON.stringify(payload) }
        })
      });
      const result = await response.json();
      if (result.error) {
        toast.error(result.error);
      } else {
        orderedPageIds = displayPages.map((p) => p.id);
        toast.success("Page ordering saved successfully");
      }
    } catch (e) {
      toast.error("Failed to save page ordering");
    } finally {
      savingPageOrdering = false;
    }
  }

  function movePageUp(index: number) {
    if (index <= 0) return;
    const pages = displayPages.map((p) => p.id);
    [pages[index - 1], pages[index]] = [pages[index], pages[index - 1]];
    orderedPageIds = pages;
  }

  function movePageDown(index: number) {
    const pages = displayPages.map((p) => p.id);
    if (index >= pages.length - 1) return;
    [pages[index], pages[index + 1]] = [pages[index + 1], pages[index]];
    orderedPageIds = pages;
  }

  function resetFooter() {
    footerHTML = defaultFooterHTML;
  }

  import { onMount } from "svelte";
  import { Spinner } from "$lib/components/ui/spinner";

  // Initialize on mount
  onMount(() => {
    fetchSettings();
    fetchPages();
  });
</script>

<div class="flex w-full flex-col gap-4 p-4">
  {#if loading}
    <div class="flex items-center justify-center py-12">
      <Spinner class="h-6 w-6" />
    </div>
  {:else}
    <!-- Footer HTML Section -->
    <Card.Root>
      <Card.Header class="border-b">
        <Card.Title>{$t("manage.customizations.footer_title")}</Card.Title>
        <Card.Description>
          {$t("manage.customizations.footer_desc")}
        </Card.Description>
      </Card.Header>
      <Card.Content class="pt-6 min-w-0">
        <div class="w-full">
          <div class="overflow-hidden rounded-md border">
            <CodeMirror
              bind:value={footerHTML}
              lang={html()}
              theme={mode.current === "dark" ? githubDark : githubLight}
              styles={{
                "&": {
                  width: "100%",
                  maxWidth: "100%",
                  height: "320px"
                }
              }}
            />
          </div>
        </div>
      </Card.Content>
      <Card.Footer class="flex justify-between border-t pt-6">
        <Button variant="outline" onclick={resetFooter}>{$t("manage.customizations.footer_reset")}</Button>
        <Button onclick={saveFooter} disabled={savingFooter}>
          {#if savingFooter}
            <Loader class="h-4 w-4 animate-spin" />
          {:else}
            <SaveIcon class="h-4 w-4" />
          {/if}
          {$t("manage.common.save")}
        </Button>
      </Card.Footer>
    </Card.Root>

    <!-- Status Colors Section -->
    <Card.Root>
      <Card.Header class="border-b">
        <Card.Title>{$t("manage.customizations.colors_title")}</Card.Title>
        <Card.Description
          >{$t("manage.customizations.colors_desc")}</Card.Description
        >
      </Card.Header>
      <Card.Content class="pt-6">
        <div class="rounded-lg border">
          <!-- Header -->
          <div class="grid grid-cols-3 border-b px-4 py-3">
            <span class="text-muted-foreground text-sm font-medium">{$t("manage.customizations.colors_col_name")}</span>
            <span class="text-muted-foreground text-sm font-medium">{$t("manage.customizations.colors_col_light")}</span>
            <span class="text-muted-foreground text-sm font-medium">{$t("manage.customizations.colors_col_dark")}</span>
          </div>
          <!-- Rows -->
          {#each [
            { label: constants.UP,          light: "UP",               dark: "UP" },
            { label: constants.DEGRADED,    light: "DEGRADED",         dark: "DEGRADED" },
            { label: constants.DOWN,        light: "DOWN",             dark: "DOWN" },
            { label: constants.MAINTENANCE, light: "MAINTENANCE",      dark: "MAINTENANCE" },
            { label: "Accent",              light: "ACCENT",           dark: "ACCENT" },
            { label: "Accent Foreground",   light: "ACCENT_FOREGROUND",dark: "ACCENT_FOREGROUND" },
          ] as row (row.label)}
            <div class="grid grid-cols-3 items-center border-b px-4 py-2 last:border-0">
              <span class="text-sm font-medium">{row.label}</span>
              <div>
                <ColorPicker
                  bind:hex={colors[row.light as keyof StatusColors]}
                  position="responsive"
                  isAlpha={false}
                  isDark={mode.current === "dark"}
                  --input-size="16px"
                  isTextInput={true}
                  label=""
                />
              </div>
              <div>
                <ColorPicker
                  bind:hex={colorsDark[row.dark as keyof StatusColors]}
                  position="responsive"
                  isAlpha={false}
                  isDark={mode.current === "dark"}
                  --input-size="16px"
                  isTextInput={true}
                  label=""
                />
              </div>
            </div>
          {/each}
        </div>
      </Card.Content>
      <Card.Footer class="flex justify-end border-t pt-6">
        <Button onclick={saveColors} disabled={savingColors}>
          {#if savingColors}
            <Loader class="h-4 w-4 animate-spin" />
          {:else}
            <SaveIcon class="h-4 w-4" />
          {/if}
          {$t("manage.common.save")}
        </Button>
      </Card.Footer>
    </Card.Root>

    <!-- Font Section -->
    <Card.Root>
      <Card.Header class="border-b">
        <Card.Title class="flex items-center gap-2">
          {$t("manage.customizations.font_title")}
          <Tooltip.Root>
            <Tooltip.Trigger>
              <Info class="text-muted-foreground h-4 w-4" />
            </Tooltip.Trigger>
            <Tooltip.Content class="max-w-xs">
              <p>Choose between an external web font CSS URL or upload your own font file.</p>
            </Tooltip.Content>
          </Tooltip.Root>
        </Card.Title>
        <Card.Description>{$t("manage.customizations.font_desc")}</Card.Description>
      </Card.Header>
      <Card.Content class="pt-6 flex flex-col gap-6">

        <!-- Option A: External CSS URL -->
        <div class="flex flex-col gap-3">
          <p class="text-sm font-medium">{$t("manage.customizations.font_option_a")}</p>
          <div class="grid gap-4 md:grid-cols-2">
            <div>
              <Label for="font-url">{$t("manage.customizations.font_css_url_label")}</Label>
              <Input
                bind:value={font.cssSrc}
                oninput={() => { font.fileId = ""; uploadedFontName = ""; }}
                type="text"
                id="font-url"
                placeholder="https://fonts.bunny.net/css?family=lato:400,700&display=swap"
                class="mt-1"
              />
              <p class="text-muted-foreground mt-1 text-xs">URL to a CSS file from Google Fonts, Bunny Fonts, etc.</p>
            </div>
            <div>
              <Label for="font-family-url">{$t("manage.customizations.font_family_label")}</Label>
              <Input
                bind:value={font.family}
                type="text"
                id="font-family-url"
                placeholder={$t("manage.customizations.font_family_placeholder")}
                class="mt-1"
              />
              <p class="text-muted-foreground mt-1 text-xs">{$t("manage.customizations.font_family_helper")}</p>
            </div>
          </div>
          <div class="flex justify-end">
            <Button onclick={saveFontUrl} disabled={savingFont || uploadingFont} variant="outline" size="sm">
              {#if savingFont}
                <Loader class="h-4 w-4 animate-spin" />
              {:else}
                <SaveIcon class="h-4 w-4" />
              {/if}
              {$t("manage.common.save")}
            </Button>
          </div>
        </div>

        <!-- Divider -->
        <div class="relative flex items-center">
          <div class="flex-grow border-t"></div>
          <span class="text-muted-foreground mx-3 flex-shrink text-xs">{$t("manage.customizations.font_or")}</span>
          <div class="flex-grow border-t"></div>
        </div>

        <!-- Option B: Upload Font File -->
        <div class="flex flex-col gap-3">
          <p class="text-sm font-medium">{$t("manage.customizations.font_option_b")}</p>

          {#if pendingFontFile}
            <!-- File selected — waiting for family confirmation -->
            <div class="bg-muted flex items-center gap-2 rounded-lg px-3 py-2 text-sm">
              <span class="truncate">{pendingFontFile.name}</span>
            </div>

            {#if detectedFamilies.length > 1}
              <div>
                <Label>{$t("manage.customizations.font_select_family")}</Label>
                <Select.Root type="single" bind:value={font.family}>
                  <Select.Trigger class="mt-1 w-full">
                    {font.family || $t("manage.customizations.font_select_family")}
                  </Select.Trigger>
                  <Select.Content>
                    {#each detectedFamilies as family (family)}
                      <Select.Item value={family}>{family}</Select.Item>
                    {/each}
                  </Select.Content>
                </Select.Root>
              </div>
            {:else}
              <div>
                <Label for="font-family-pending">{$t("manage.customizations.font_family_label")}</Label>
                <Input
                  bind:value={font.family}
                  type="text"
                  id="font-family-pending"
                  placeholder="MyFont"
                  class="mt-1"
                />
                <p class="text-muted-foreground mt-1 text-xs">{$t("manage.customizations.font_family_helper")}</p>
              </div>
            {/if}

            <div class="flex items-center gap-2">
              <Button
                onclick={() => { pendingFontFile = null; detectedFamilies = []; }}
                variant="outline"
                size="sm"
                disabled={uploadingFont}
              >
                {$t("manage.common.cancel")}
              </Button>
              <Button
                onclick={() => pendingFontFile && uploadFontFile(pendingFontFile)}
                disabled={uploadingFont || !font.family.trim()}
                size="sm"
              >
                {#if uploadingFont}
                  <Loader class="h-4 w-4 animate-spin" />
                {/if}
                {$t("manage.customizations.font_upload_btn")}
              </Button>
            </div>

          {:else}
            {#if font.fileId && uploadedFontName}
              <!-- Active font badge -->
              <div class="bg-muted flex items-center gap-2 rounded-lg px-3 py-2">
                <div class="flex min-w-0 flex-1 flex-col">
                  <span class="text-sm font-medium">{$t("manage.customizations.font_active_file")}</span>
                  <span class="text-muted-foreground truncate text-xs">{uploadedFontName}{font.family ? ` · ${font.family}` : ""}</span>
                </div>
                <Button
                  onclick={removeFontFile}
                  disabled={savingFont}
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Remove font file"
                >
                  <X class="h-4 w-4" />
                </Button>
              </div>
            {/if}

            <div>
              <Label for="font-upload">{$t("manage.customizations.font_file_label")}</Label>
              <input
                id="font-upload"
                type="file"
                accept=".ttf,.otf,.woff,.woff2"
                onchange={saveFontFile}
                disabled={uploadingFont}
                class="mt-1 block w-full text-sm text-muted-foreground file:mr-4 file:rounded file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium"
              />
              <p class="text-muted-foreground mt-1 text-xs">{$t("manage.customizations.font_file_helper")}</p>
            </div>

            {#if uploadingFont}
              <div class="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader class="h-4 w-4 animate-spin" />
                {$t("manage.customizations.font_uploading")}
              </div>
            {/if}
          {/if}
        </div>

      </Card.Content>
    </Card.Root>

    <!-- Theme Configuration Section -->
    <Card.Root>
      <Card.Header class="border-b">
        <Card.Title>{$t("manage.customizations.theme_title")}</Card.Title>
        <Card.Description>{$t("manage.customizations.theme_desc")}</Card.Description>
      </Card.Header>
      <Card.Content class="space-y-6 pt-6">
        <div class="space-y-3">
          <Label>{$t("manage.customizations.theme_default_label")}</Label>
          <RadioGroup.Root bind:value={theme} class="flex flex-col gap-3">
            <div class="flex items-center space-x-2">
              <RadioGroup.Item value="light" id="theme-light" />
              <Label for="theme-light" class="cursor-pointer font-normal">{$t("manage.customizations.theme_light")}</Label>
            </div>
            <div class="flex items-center space-x-2">
              <RadioGroup.Item value="dark" id="theme-dark" />
              <Label for="theme-dark" class="cursor-pointer font-normal">{$t("manage.customizations.theme_dark")}</Label>
            </div>
            <div class="flex items-center space-x-2">
              <RadioGroup.Item value="system" id="theme-system" />
              <Label for="theme-system" class="cursor-pointer font-normal">{$t("manage.customizations.theme_system")}</Label>
            </div>
          </RadioGroup.Root>
          <p class="text-muted-foreground text-xs">
            {$t("manage.customizations.theme_default_helper")}
          </p>
        </div>

        <div class="flex items-start space-x-3 rounded-lg border p-4">
          <Checkbox
            id="theme-toggle"
            checked={themeToggle === "YES"}
            onCheckedChange={(checked) => (themeToggle = checked ? "YES" : "NO")}
          />
          <div class="space-y-1">
            <Label for="theme-toggle" class="cursor-pointer">{$t("manage.customizations.theme_toggle_label")}</Label>
            <p class="text-muted-foreground text-sm">
              {$t("manage.customizations.theme_toggle_helper")}
            </p>
          </div>
        </div>
      </Card.Content>
      <Card.Footer class="flex justify-end border-t pt-6">
        <Button onclick={saveTheme} disabled={savingTheme}>
          {#if savingTheme}
            <Loader class="h-4 w-4 animate-spin" />
          {:else}
            <SaveIcon class="h-4 w-4" />
          {/if}
          {$t("manage.common.save")}
        </Button>
      </Card.Footer>
    </Card.Root>

    <!-- Announcement Section -->
    <Card.Root>
      <Card.Header class="border-b">
        <Card.Title>{$t("manage.customizations.announcement_title")}</Card.Title>
        <Card.Description>{$t("manage.customizations.announcement_desc")}</Card.Description>
      </Card.Header>
      <Card.Content class="space-y-4 pt-6">
        <div class="grid gap-4 md:grid-cols-2">
          <div class="space-y-2">
            <Label for="announcement-title">{$t("manage.customizations.announcement_title_label")}</Label>
            <Input id="announcement-title" bind:value={announcement.title} placeholder={$t("manage.customizations.announcement_title_placeholder")} />
          </div>
          <div class="space-y-2">
            <Label for="announcement-type">{$t("manage.customizations.announcement_type_label")}</Label>
            <Select.Root
              type="single"
              value={announcement.type}
              onValueChange={(v: string | undefined) => v && (announcement.type = v as "INFO" | "WARNING" | "ERROR")}
            >
              <Select.Trigger id="announcement-type" class="w-full">{announcement.type}</Select.Trigger>
              <Select.Content>
                <Select.Item value="INFO">INFO</Select.Item>
                <Select.Item value="WARNING">WARNING</Select.Item>
                <Select.Item value="ERROR">ERROR</Select.Item>
              </Select.Content>
            </Select.Root>
          </div>
        </div>

        <div class="space-y-2">
          <Label for="announcement-message">{$t("manage.customizations.announcement_message_label")}</Label>
          <Textarea
            id="announcement-message"
            bind:value={announcement.message}
            placeholder="We are currently performing infrastructure upgrades."
            rows={4}
          />
        </div>

        <div class="grid gap-4 md:grid-cols-3">
          <div class="space-y-2">
            <Label for="announcement-reshow">{$t("manage.customizations.announcement_reshow_label")}</Label>
            <Input
              id="announcement-reshow"
              type="number"
              min="0"
              bind:value={announcement.reshowAfterInHours}
              placeholder={$t("manage.customizations.announcement_reshow_helper")}
            />
            <p class="text-muted-foreground text-xs">Leave empty for null.</p>
          </div>
          <div class="space-y-2">
            <Label for="announcement-cta">{$t("manage.customizations.announcement_cta_url_label")}</Label>
            <Input
              id="announcement-cta-url"
              bind:value={announcement.ctaURL}
              placeholder="https://status.example.com/incident/123"
            />
          </div>
          <div class="space-y-2">
            <Label for="announcement-cta-text">{$t("manage.customizations.announcement_cta_text_label")}</Label>
            <Input id="announcement-cta-text" bind:value={announcement.ctaText} placeholder={$t("manage.customizations.announcement_cta_text_placeholder")} />
          </div>
        </div>

        <div class="flex items-start space-x-3 rounded-lg border p-4">
          <Checkbox
            id="announcement-cancellable"
            checked={announcement.cancellable}
            onCheckedChange={(checked) => (announcement.cancellable = checked === true)}
          />
          <div class="space-y-1">
            <Label for="announcement-cancellable" class="cursor-pointer">{$t("manage.customizations.announcement_cancellable_label")}</Label>
            <p class="text-muted-foreground text-sm">{$t("manage.customizations.announcement_cancellable_helper")}</p>
          </div>
        </div>
      </Card.Content>
      <Card.Footer class="flex justify-end border-t pt-6">
        <Button onclick={saveAnnouncement} disabled={savingAnnouncement}>
          {#if savingAnnouncement}
            <Loader class="h-4 w-4 animate-spin" />
          {:else}
            <SaveIcon class="h-4 w-4" />
          {/if}
          {$t("manage.common.save")}
        </Button>
      </Card.Footer>
    </Card.Root>

    <!-- Page Ordering Section -->
    <Card.Root>
      <Card.Header class="border-b">
        <Card.Title>{$t("manage.customizations.page_ordering_title")}</Card.Title>
        <Card.Description>
          {$t("manage.customizations.page_ordering_desc")}
        </Card.Description>
      </Card.Header>
      <Card.Content class="space-y-4 pt-6">
        <div class="flex items-start space-x-3 rounded-lg border p-4">
          <Checkbox
            id="page-ordering-enabled"
            checked={pageOrderingEnabled}
            onCheckedChange={(checked) => (pageOrderingEnabled = checked === true)}
          />
          <div class="space-y-1">
            <Label for="page-ordering-enabled" class="cursor-pointer">{$t("manage.customizations.page_ordering_enable")}</Label>
            <p class="text-muted-foreground text-sm">
              {$t("manage.customizations.page_ordering_enable_helper")}
            </p>
          </div>
        </div>

        {#if loadingPages}
          <div class="flex items-center justify-center py-6">
            <Spinner class="h-5 w-5" />
          </div>
        {:else if allPages.length === 0}
          <p class="text-muted-foreground py-4 text-center text-sm">{$t("manage.customizations.page_ordering_empty")}</p>
        {:else}
          <div class="rounded-lg border">
            {#each displayPages as page, index (page.id)}
              <div
                class="flex items-center justify-between px-4 py-3 {index < displayPages.length - 1 ? 'border-b' : ''}"
              >
                <div class="flex items-center gap-3">
                  <GripVertical class="text-muted-foreground h-4 w-4 shrink-0" />
                  <div>
                    <p class="text-sm font-medium">{page.page_title}</p>
                    <p class="text-muted-foreground text-xs">/{page.page_path || ""}</p>
                  </div>
                </div>
                {#if pageOrderingEnabled}
                  <div class="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      class="h-8 w-8"
                      disabled={index === 0}
                      onclick={() => movePageUp(index)}
                    >
                      <ArrowUp class="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      class="h-8 w-8"
                      disabled={index === displayPages.length - 1}
                      onclick={() => movePageDown(index)}
                    >
                      <ArrowDown class="h-4 w-4" />
                    </Button>
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </Card.Content>
      <Card.Footer class="flex justify-end border-t pt-6">
        <Button onclick={savePageOrdering} disabled={savingPageOrdering || loadingPages}>
          {#if savingPageOrdering}
            <Loader class="h-4 w-4 animate-spin" />
          {:else}
            <SaveIcon class="h-4 w-4" />
          {/if}
          {$t("manage.common.save")}
        </Button>
      </Card.Footer>
    </Card.Root>

    <!-- Custom CSS Section -->
    <Card.Root>
      <Card.Header class="border-b">
        <Card.Title>{$t("manage.customizations.css_title")}</Card.Title>
        <Card.Description>
          Add custom CSS to further customize the appearance of your status page. Do not include &lt;style&gt; tags.
          Learn more in the
          <a
            href="https://kener.ing/docs/v4/guides/custom-js-css-guide"
            target="_blank"
            class="text-foreground underline underline-offset-4"
          >
            documentation
          </a>.
        </Card.Description>
      </Card.Header>
      <Card.Content class="pt-6 min-w-0">
        <div class="w-full">
          <div class="overflow-hidden rounded-md border">
            <CodeMirror
              bind:value={customCSS}
              lang={css()}
              theme={mode.current === "dark" ? githubDark : githubLight}
              styles={{
                "&": {
                  width: "100%",
                  maxWidth: "100%",
                  height: "320px"
                }
              }}
            />
          </div>
        </div>
      </Card.Content>
      <Card.Footer class="flex justify-end border-t pt-6">
        <Button onclick={saveCustomCSS} disabled={savingCSS}>
          {#if savingCSS}
            <Loader class="h-4 w-4 animate-spin" />
          {:else}
            <SaveIcon class="h-4 w-4" />
          {/if}
          {$t("manage.common.save")}
        </Button>
      </Card.Footer>
    </Card.Root>
  {/if}
</div>
