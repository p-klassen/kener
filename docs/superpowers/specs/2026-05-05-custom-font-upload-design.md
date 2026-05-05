# Custom Font Upload — Design Spec

**Date:** 2026-05-05

## Overview

Allow admins to upload a custom font file (TTF, OTF, WOFF, WOFF2) as an alternative to the existing external CSS URL approach. Either option can be used; they are mutually exclusive. When a file is uploaded it is served by Kener itself and applied sitewide via an inline `@font-face` declaration.

---

## Scope

- Applies to the status page public layout only (`(kener)/+layout.svelte`).
- The manage dashboard continues to use its own system font stack — no change there.
- Only one custom font at a time. Multiple font weights/styles are out of scope.

---

## Storage

Font files are stored in the existing `images` table using the same base64 + `mime_type` pattern as images. **No new DB migration is needed.**

Accepted MIME types: `font/ttf`, `font/otf`, `font/woff`, `font/woff2`.

Like SVG, font files skip `sharp` processing entirely — the raw bytes are base64-encoded and inserted as-is.

---

## New Asset Route

**File:** `src/routes/(assets)/assets/fonts/[id]/+server.ts`

- Reads `params.id` from the URL.
- Fetches the record from `db.getImageById(id)`.
- Returns a `Response` with:
  - `Content-Type` set to the stored `mime_type`
  - `Cache-Control: public, max-age=31536000, immutable`
- Returns 404 if the record is not found or the mime_type is not a font type (guard against fetching images via the font route).

---

## Upload Pipeline

**File:** `src/routes/(manage)/manage/api/+server.ts`

The existing `uploadImage` action is extended:

- Add font MIME types to `allowedMimeTypes`: `"font/ttf"`, `"font/otf"`, `"font/woff"`, `"font/woff2"`.
- When the detected MIME type is a font type: skip `sharp`, write the raw base64 buffer directly to `db.insertImage`, use prefix `"font_"` so font records are visually distinct from images.
- Existing image flow is unchanged.

---

## Site Data

**Key:** `font` (existing)

**Current shape:** `{ cssSrc: string, family: string }`

**New shape:** `{ cssSrc: string, family: string, fileId?: string }`

**Rule:** `fileId` and `cssSrc` are mutually exclusive. Saving a new font file sets `fileId` and clears `cssSrc`. Saving a CSS URL sets `cssSrc` and clears `fileId` (and triggers deletion of the old font file record from the DB if one exists). Removing the file entirely clears `fileId` and deletes the DB record.

The `siteDataKeys.ts` validator for `font` uses `IsValidJSONString` — no change needed.

The TypeScript type for the font config (currently inline in the layout) gains `fileId?: string`.

---

## Layout

**File:** `src/routes/(kener)/+layout.svelte`

The font application logic gains a second branch:

Svelte `<style>` blocks are compiled statically and cannot contain runtime values. The `@font-face` rule must be injected via `{@html}` inside `<svelte:head>`:

```svelte
<svelte:head>
  {#if font?.fileId}
    {@html `<style>@font-face { font-family: '${font.family}'; src: url('${base}/assets/fonts/${font.fileId}'); } * { font-family: '${font.family}', sans-serif; }</style>`}
  {:else if font?.cssSrc}
    <link rel="stylesheet" href={font.cssSrc} />
  {/if}
</svelte:head>
```

When `font.cssSrc` is active the existing `* { font-family: var(--font-family) }` CSS variable mechanism remains in place. When `font.fileId` is active the injected `<style>` block sets `font-family` directly on `*`.

The `base` path prefix comes from `import { base } from "$app/paths"` (already available in the layout) to respect `KENER_BASE_PATH`.

---

## Customizations UI

**File:** `src/routes/(manage)/manage/app/customizations/+page.svelte`

The existing Font card is redesigned as two mutually exclusive sections:

**Section A — External CSS URL (existing fields, unchanged behavior):**
- "Font CSS URL" text input
- "Font Family Name" text input
- Save button → calls `storeSiteData({ font: { cssSrc, family, fileId: "" } })`, which clears any uploaded file

**Section B — Upload Font File:**
- File input accepting `.ttf,.otf,.woff,.woff2`
- "Font Family Name" text input (shared concept, separate field)
- When a file is already uploaded: show filename + a Remove (×) button
- Save button → reads the file as base64, calls `uploadImage` action, then calls `storeSiteData({ font: { cssSrc: "", family, fileId: <returned id> } })`
- Remove button → calls `storeSiteData({ font: { cssSrc: "", family: "", fileId: "" } })` and deletes the image record via `deleteImage`

The two sections are visually separated (e.g., with an "or" divider). Filling in Section A clears Section B state and vice versa.

---

## Constraints

- Maximum upload size: 5 MB (same as images, enforced by `GC.MAX_UPLOAD_BYTES`).
- Font files are not processed or validated beyond MIME type — corrupted font files will be stored but will silently fail to render in the browser.
- Deleting the font record from the DB when switching away from the uploaded file prevents orphaned records.
