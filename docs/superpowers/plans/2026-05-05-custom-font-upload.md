# Custom Font Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow admins to upload a custom font file (TTF/OTF/WOFF/WOFF2) as an alternative to the existing external CSS URL approach, with the file served by Kener itself and applied sitewide via an inline `@font-face` declaration.

**Architecture:** Font files are stored in the existing `images` DB table (base64, no `sharp` processing), served via a new `/assets/fonts/[id]` route, and applied in the public layout via an `{@html}` `@font-face` injection. The `font` site data key gains an optional `fileId` field; `fileId` and `cssSrc` are mutually exclusive.

**Tech Stack:** SvelteKit 5 (Svelte 5 runes), TypeScript, Knex.js (`images` table), Tailwind CSS v4, shadcn-svelte

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `src/routes/(assets)/assets/fonts/[id]/+server.ts` | Create | Serve font binary from DB with correct MIME type + cache headers |
| `src/routes/(manage)/manage/api/+server.ts` | Modify | Extend `uploadImage` to accept font MIME types; skip `sharp` for fonts |
| `src/routes/(kener)/+layout.svelte` | Modify | Inject `@font-face` via `{@html}` when `font.fileId` is set |
| `src/routes/(manage)/manage/app/customizations/+page.svelte` | Modify | Redesign Font card with two mutually exclusive sections: CSS URL and file upload |

No DB migrations needed — font files reuse the `images` table.

---

### Task 1: New Font Asset Route

**Files:**
- Create: `src/routes/(assets)/assets/fonts/[id]/+server.ts`

- [ ] **Step 1: Create the directory and file**

```bash
mkdir -p src/routes/\(assets\)/assets/fonts/\[id\]
```

Create `src/routes/(assets)/assets/fonts/[id]/+server.ts`:

```typescript
import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import db from "$lib/server/db/db";

const FONT_MIME_TYPES = new Set(["font/ttf", "font/otf", "font/woff", "font/woff2"]);

export const GET: RequestHandler = async ({ params }) => {
  const { id } = params;

  if (!id) {
    throw error(400, "Font ID is required");
  }

  const record = await db.getImageById(id);

  if (!record || !FONT_MIME_TYPES.has(record.mime_type)) {
    throw error(404, "Font not found");
  }

  const buffer = Buffer.from(record.data, "base64");

  return new Response(buffer, {
    status: 200,
    headers: {
      "Content-Type": record.mime_type,
      "Content-Length": buffer.length.toString(),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
};
```

- [ ] **Step 2: Run type check**

```bash
npm run check
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/routes/\(assets\)/assets/fonts/
git commit -m "feat: add /assets/fonts/[id] route to serve uploaded font files"
```

---

### Task 2: Extend Upload Pipeline for Font Files

**Files:**
- Modify: `src/routes/(manage)/manage/api/+server.ts` (around lines 767–803)

- [ ] **Step 1: Add font MIME types to `allowedMimeTypes` and add a font fast-path before the SVG block**

Locate the `uploadImage` function (line ~767). Make two changes:

**Change 1** — extend `allowedMimeTypes` (line ~767):

```typescript
const allowedMimeTypes = [
  "image/png", "image/jpeg", "image/jpg", "image/webp",
  "image/heic", "image/heif", "image/svg+xml",
  "font/ttf", "font/otf", "font/woff", "font/woff2",
];
```

**Change 2** — add a font fast-path immediately before the SVG block (after line ~789, before the `if (normalizedRequestedMime === "image/svg+xml")` block):

```typescript
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
```

Note: `normalizedRequestedMime` is already set to `mimeType` (with `image/jpg` → `image/jpeg` normalization) — for font types it passes through unchanged. The font MIME types do not trigger the SVG content-sniff check because `looksLikeSvg` checks for `<svg` and `<?xml` byte patterns, which fonts don't contain.

- [ ] **Step 2: Run type check**

```bash
npm run check
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/routes/\(manage\)/manage/api/+server.ts
git commit -m "feat: extend uploadImage to accept font files (TTF/OTF/WOFF/WOFF2)"
```

---

### Task 3: Layout — Apply Uploaded Font via `@font-face`

**Files:**
- Modify: `src/routes/(kener)/+layout.svelte` (lines 19–46)

The layout currently handles fonts like this (lines 21–23 and 33):
```svelte
{#if data.font?.cssSrc}
  <link rel="stylesheet" href={data.font.cssSrc} />
{/if}
...
${data.font?.family ? `--font-family:'${data.font.family}', sans-serif;` : ""}
```

`data.font` currently has type `{ cssSrc: string; family: string }`. It comes from `GetLayoutServerData` → `layoutClientData.ts`. The `FontConfig` type is defined locally in `customizations/+page.svelte` and inline in the layout — there is no shared type file.

- [ ] **Step 1: Update the `<svelte:head>` block**

Replace the existing font `<link>` block (lines 21–23) with:

```svelte
{#if data.font?.fileId}
  {@html `<style>@font-face { font-family: '${data.font.family}'; src: url('${base}/assets/fonts/${data.font.fileId}'); } </style>`}
{:else if data.font?.cssSrc}
  <link rel="stylesheet" href={data.font.cssSrc} />
{/if}
```

Add `import { base } from "$app/paths";` to the `<script>` block if it is not already imported. Check: `resolve` is already imported from `"$app/paths"` at line 9 — add `base` to that same import:

```typescript
import { resolve, base } from "$app/paths";
```

The `--font-family` CSS variable injection at line 33 is unchanged — it still reads `data.font?.family` regardless of which path is active.

The `data.font` type now needs `fileId?: string`. The layout gets font data from the layout server load; the type flows from `layoutClientData.ts`. Add `fileId?: string` inline where `data.font` is typed (if it's typed inline in the layout, update it there; if it comes from a shared type, update that type).

Check line 12: `let { children, data } = $props();` — `data` is typed via `LayoutData` from `./$types`. The actual font shape comes from `layoutClientData.ts`:

- [ ] **Step 2: Update the font type in `layoutController.ts`**

The font return type is explicitly declared in `src/lib/server/controllers/layoutController.ts` at lines 56–59:

```typescript
font: {
  cssSrc: string;
  family: string;
};
```

Change it to:

```typescript
font: {
  cssSrc: string;
  family: string;
  fileId?: string;
  originalName?: string;
};
```

The value is assigned at line 115: `const font = siteData.font || { cssSrc: "", family: "" };` — this will now also carry `fileId` and `originalName` when they are present in the stored JSON. No change needed to the assignment itself.

- [ ] **Step 3: Run type check**

```bash
npm run check
```

Expected: 0 errors. If there are type errors about `fileId` not existing on the font type, add `fileId?: string` to whatever type annotation exists for the font in the layout data chain.

- [ ] **Step 4: Commit**

```bash
git add src/routes/\(kener\)/+layout.svelte src/lib/server/controllers/layoutClientData.ts
git commit -m "feat: apply uploaded font via @font-face injection in public layout"
```

---

### Task 4: Customizations UI — Font Card Redesign

**Files:**
- Modify: `src/routes/(manage)/manage/app/customizations/+page.svelte`

This task rewrites the Font card (lines 685–743). The rest of the file is unchanged.

- [ ] **Step 1: Extend `FontConfig` type and add font state variables**

In the `<script>` block, update the `FontConfig` interface (line ~40):

```typescript
interface FontConfig {
  cssSrc: string;
  family: string;
  fileId?: string;
  originalName?: string;
}
```

Add state variables for the upload section (near the other font state, line ~83):

```typescript
let font = $state<FontConfig>({
  cssSrc: "",
  family: "",
  fileId: "",
});

let uploadingFont = $state(false);
let uploadedFontName = $state(""); // original filename shown in UI
```

Update the data loading block (line ~163) to also read `fileId` and the original font name:

```typescript
if (result.font) {
  font = {
    cssSrc: result.font.cssSrc || "",
    family: result.font.family || "",
    fileId: result.font.fileId || "",
  };
  uploadedFontName = result.font.originalName || "";
}
```

- [ ] **Step 2: Add `saveFontUrl`, `saveFontFile`, and `removeFontFile` functions**

Replace the existing `saveFont` function (line ~265) with three functions:

```typescript
async function saveFontUrl() {
  // Saving CSS URL path: clear fileId
  savingFont = true;
  try {
    const response = await fetch(clientResolver(resolve, "/manage/api"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "storeSiteData",
        data: { font: JSON.stringify({ cssSrc: font.cssSrc, family: font.family, fileId: "" }) }
      })
    });
    const result = await response.json();
    if (result.error) {
      toast.error(result.error);
    } else {
      font.fileId = "";
      uploadedFontName = "";
      toast.success("Font settings saved");
    }
  } catch (e) {
    toast.error("Failed to save font settings");
  } finally {
    savingFont = false;
  }
}

async function saveFontFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  if (file.size > 5 * 1024 * 1024) {
    toast.error("Font file must be under 5 MB");
    input.value = "";
    return;
  }

  uploadingFont = true;
  try {
    // Read file as base64
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(",")[1]);
      };
      reader.onerror = reject;
    });

    // Upload font file
    const uploadRes = await fetch(clientResolver(resolve, "/manage/api"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "uploadImage",
        data: { base64, mimeType: file.type, fileName: file.name, prefix: "font_" }
      })
    });
    const uploadResult = await uploadRes.json();
    if (uploadResult.error) {
      toast.error(uploadResult.error);
      return;
    }

    // Delete old font file if one exists
    if (font.fileId) {
      await fetch(clientResolver(resolve, "/manage/api"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "deleteImage", data: { id: font.fileId } })
      });
    }

    // Save font config: set fileId, clear cssSrc
    const saveRes = await fetch(clientResolver(resolve, "/manage/api"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "storeSiteData",
        data: {
          font: JSON.stringify({
            cssSrc: "",
            family: font.family,
            fileId: uploadResult.id,
            originalName: file.name,
          })
        }
      })
    });
    const saveResult = await saveRes.json();
    if (saveResult.error) {
      toast.error(saveResult.error);
    } else {
      font.cssSrc = "";
      font.fileId = uploadResult.id;
      uploadedFontName = file.name;
      toast.success("Font uploaded and saved");
    }
  } catch (e) {
    toast.error("Failed to upload font");
  } finally {
    uploadingFont = false;
    input.value = "";
  }
}

async function removeFontFile() {
  if (!font.fileId) return;
  savingFont = true;
  try {
    // Delete the DB record
    await fetch(clientResolver(resolve, "/manage/api"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "deleteImage", data: { id: font.fileId } })
    });
    // Clear font config
    const saveRes = await fetch(clientResolver(resolve, "/manage/api"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "storeSiteData",
        data: { font: JSON.stringify({ cssSrc: "", family: "", fileId: "" }) }
      })
    });
    const saveResult = await saveRes.json();
    if (saveResult.error) {
      toast.error(saveResult.error);
    } else {
      font.fileId = "";
      font.family = "";
      uploadedFontName = "";
      toast.success("Font removed");
    }
  } catch (e) {
    toast.error("Failed to remove font");
  } finally {
    savingFont = false;
  }
}
```

- [ ] **Step 3: Replace the Font card HTML (lines 685–743)**

Replace the entire Font `<Card.Root>` block with:

```svelte
<!-- Font Section -->
<Card.Root>
  <Card.Header class="border-b">
    <Card.Title class="flex items-center gap-2">
      Font
      <Tooltip.Root>
        <Tooltip.Trigger>
          <Info class="text-muted-foreground h-4 w-4" />
        </Tooltip.Trigger>
        <Tooltip.Content class="max-w-xs">
          <p>Choose between an external web font CSS URL or upload your own font file.</p>
        </Tooltip.Content>
      </Tooltip.Root>
    </Card.Title>
    <Card.Description>Customize the font used throughout your status page.</Card.Description>
  </Card.Header>
  <Card.Content class="pt-6 flex flex-col gap-6">

    <!-- Option A: External CSS URL -->
    <div class="flex flex-col gap-3">
      <p class="text-sm font-medium">Option A — External CSS URL</p>
      <div class="grid gap-4 md:grid-cols-2">
        <div>
          <Label for="font-url">Font CSS URL</Label>
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
          <Label for="font-family-url">Font Family Name</Label>
          <Input
            bind:value={font.family}
            type="text"
            id="font-family-url"
            placeholder="Lato"
            class="mt-1"
          />
          <p class="text-muted-foreground mt-1 text-xs">Must match the font-family name in the CSS</p>
        </div>
      </div>
      <div class="flex justify-end">
        <Button onclick={saveFontUrl} disabled={savingFont || uploadingFont} variant="outline" size="sm">
          {#if savingFont}
            <Loader class="h-4 w-4 animate-spin" />
          {/if}
          Save URL Font
        </Button>
      </div>
    </div>

    <!-- Divider -->
    <div class="relative flex items-center">
      <div class="flex-grow border-t"></div>
      <span class="text-muted-foreground mx-3 flex-shrink text-xs">or</span>
      <div class="flex-grow border-t"></div>
    </div>

    <!-- Option B: Upload Font File -->
    <div class="flex flex-col gap-3">
      <p class="text-sm font-medium">Option B — Upload Font File</p>
      {#if font.fileId && uploadedFontName}
        <div class="flex items-center gap-2">
          <span class="text-sm">{uploadedFontName}</span>
          <Button
            onclick={removeFontFile}
            disabled={savingFont}
            variant="ghost"
            size="icon-xs"
            aria-label="Remove font file"
          >
            <X class="h-4 w-4" />
          </Button>
        </div>
      {:else}
        <div>
          <Label for="font-upload">Font File</Label>
          <input
            id="font-upload"
            type="file"
            accept=".ttf,.otf,.woff,.woff2"
            onchange={saveFontFile}
            disabled={uploadingFont}
            class="mt-1 block w-full text-sm text-muted-foreground file:mr-4 file:rounded file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium"
          />
          <p class="text-muted-foreground mt-1 text-xs">TTF, OTF, WOFF, or WOFF2. Max 5 MB.</p>
        </div>
      {/if}
      <div>
        <Label for="font-family-file">Font Family Name</Label>
        <Input
          bind:value={font.family}
          type="text"
          id="font-family-file"
          placeholder="MyFont"
          class="mt-1"
        />
        <p class="text-muted-foreground mt-1 text-xs">Used in the CSS font-family declaration</p>
      </div>
      {#if uploadingFont}
        <div class="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader class="h-4 w-4 animate-spin" />
          Uploading font…
        </div>
      {/if}
    </div>

  </Card.Content>
</Card.Root>
```

Add the `X` icon import to the `<script>` imports — check whether it's already imported. If not, add:

```typescript
import X from "@lucide/svelte/icons/x";
```

- [ ] **Step 4: Run type check**

```bash
npm run check
```

Expected: 0 errors.

- [ ] **Step 5: Start the dev server and manually verify the flow**

```bash
npm run dev
```

Manual test checklist:
1. Open `/manage/app/customizations`. The Font card shows two sections separated by "or".
2. **CSS URL path:** Enter a valid CSS URL and family name (e.g., `https://fonts.bunny.net/css?family=lato:400,700&display=swap` / `Lato`). Click "Save URL Font". Reload the public status page — the font applies.
3. **Upload path:** Pick a `.woff2` file and enter a family name. After upload, the filename appears with a remove button. Reload the public status page — the font applies via `@font-face`.
4. Typing in the CSS URL field clears the `fileId` state (mutual exclusion).
5. Clicking the remove button deletes the file and clears the family name.
6. Uploading a second font file replaces the first (old DB record deleted).
7. File > 5 MB shows an error toast and does not upload.

- [ ] **Step 6: Commit**

```bash
git add src/routes/\(manage\)/manage/app/customizations/+page.svelte
git commit -m "feat: redesign Font card with external CSS URL and file upload options"
```
