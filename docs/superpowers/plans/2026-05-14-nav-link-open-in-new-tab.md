# Nav-Link „In neuem Tab öffnen" Toggle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pro custom Navigation Link einen Toggle-Switch hinzufügen, der explizit steuert ob der Link im selben oder neuen Tab öffnet.

**Architecture:** Das neue Feld `openInNewTab: boolean` wird zum `NavItem`-Interface hinzugefügt, im Admin als Toggle-UI angezeigt, mit dem nav-JSON gespeichert und in `KenerNav.svelte` anstelle der bisherigen URL-Heuristik ausgewertet.

**Tech Stack:** SvelteKit 5 (Svelte Runes), TypeScript, shadcn-svelte `Switch`-Komponente (bereits importiert)

---

## Dateien

| Aktion | Datei | Was sich ändert |
|---|---|---|
| Modify | `src/lib/server/controllers/layoutController.ts` | `openInNewTab?: boolean` zum navItems-Typ hinzufügen |
| Modify | `src/routes/(manage)/manage/app/site-configurations/+page.svelte` | Interface, onMount, UI, saveNavigation |
| Modify | `src/lib/components/KenerNav.svelte` | target/rel auf `openInNewTab` umstellen |

---

## Task 1: Typ in layoutController.ts erweitern

**Files:**
- Modify: `src/lib/server/controllers/layoutController.ts:38`

- [ ] **Schritt 1: Zeile 38 anpassen**

  Aktuelle Zeile (38):
  ```typescript
  navItems: Array<{ name: string; url: string; iconURL: string }>;
  ```

  Ersetzen durch:
  ```typescript
  navItems: Array<{ name: string; url: string; iconURL: string; openInNewTab?: boolean }>;
  ```

- [ ] **Schritt 2: TypeScript-Check ausführen**

  ```bash
  npm run check
  ```
  Erwartetes Ergebnis: keine neuen Fehler.

- [ ] **Schritt 3: Commit**

  ```bash
  git add src/lib/server/controllers/layoutController.ts
  git commit -m "feat: add openInNewTab to navItems type in layoutController"
  ```

---

## Task 2: Admin-UI anpassen (+page.svelte)

**Files:**
- Modify: `src/routes/(manage)/manage/app/site-configurations/+page.svelte`

### Schritt 2a: NavItem-Interface erweitern

- [ ] **Interface auf Zeile 35–40 anpassen**

  Aktuell:
  ```typescript
  interface NavItem {
    name: string;
    url: string;
    iconURL: string;
    uploading?: boolean;
  }
  ```

  Ersetzen durch:
  ```typescript
  interface NavItem {
    name: string;
    url: string;
    iconURL: string;
    openInNewTab: boolean;
    uploading?: boolean;
  }
  ```

### Schritt 2b: onMount-Mapping erweitern

- [ ] **Zeilen 168–173 anpassen** (Laden der Nav-Daten im `onMount`)

  Aktuell:
  ```typescript
  nav = data.nav.map((item: NavItem) => ({
    name: item.name || "",
    url: item.url || "",
    iconURL: item.iconURL || ""
  }));
  ```

  Ersetzen durch:
  ```typescript
  nav = data.nav.map((item: NavItem) => ({
    name: item.name || "",
    url: item.url || "",
    iconURL: item.iconURL || "",
    openInNewTab: item.openInNewTab ?? item.url.startsWith("http")
  }));
  ```

### Schritt 2c: saveNavigation erweitern

- [ ] **Zeilen 377–381 anpassen** (`cleanNav`-Mapping in `saveNavigation`)

  Aktuell:
  ```typescript
  const cleanNav = nav.map((item) => ({
    name: item.name,
    url: item.url,
    iconURL: item.iconURL
  }));
  ```

  Ersetzen durch:
  ```typescript
  const cleanNav = nav.map((item) => ({
    name: item.name,
    url: item.url,
    iconURL: item.iconURL,
    openInNewTab: item.openInNewTab
  }));
  ```

### Schritt 2d: addNavItem-Funktion erweitern

- [ ] **Zeilen 738–739 anpassen** (`addNavItem`)

  Aktuell:
  ```typescript
  function addNavItem() {
    nav = [...nav, { name: "", url: "", iconURL: "" }];
  }
  ```

  Ersetzen durch:
  ```typescript
  function addNavItem() {
    nav = [...nav, { name: "", url: "", iconURL: "", openInNewTab: false }];
  }
  ```

### Schritt 2e: Toggle-UI in der Nav-Item-Schleife einfügen

- [ ] **Nach dem schließenden `</div>` des 3-spaltigen Grids (Zeile ~1094) einfügen**

  Die Stelle im Template ist das Ende des `<div class="grid flex-1 gap-2 sm:grid-cols-3">` Blocks (endet ca. auf Zeile 1094, direkt vor dem schließenden `</div>` der flex-Container-Row).

  Aktueller Block (gekürzt zur Orientierung):
  ```html
  <div class="flex items-end gap-2 rounded-lg border p-3">
    <div class="grid flex-1 gap-2 sm:grid-cols-3">
      <!-- Name, URL, Icon Felder -->
    </div>
    <Button variant="ghost" size="icon" ...>  <!-- ↑ -->
    <Button variant="ghost" size="icon" ...>  <!-- ↓ -->
    <Button variant="ghost" size="icon" ...>  <!-- ✕ -->
  </div>
  ```

  Die innere `flex`-Row muss umgebaut werden, damit der Toggle in einer eigenen Zeile unterhalb des Grids erscheint. Ersetze den kompletten Nav-Item-Block (Zeilen 1054–1105) durch:

  ```html
  <div class="rounded-lg border p-3">
    <div class="flex items-end gap-2">
      <div class="grid flex-1 gap-2 sm:grid-cols-3">
        <div class="space-y-1">
          <Label for="nav-name-{index}">{$t("manage.site_config.nav_name_label")}</Label>
          <Input id="nav-name-{index}" type="text" bind:value={item.name} placeholder={$t("manage.site_config.nav_name_placeholder")} />
        </div>
        <div class="space-y-1">
          <Label for="nav-url-{index}">{$t("manage.site_config.nav_url_label")}</Label>
          <Input id="nav-url-{index}" type="text" bind:value={item.url} placeholder="https://docs.example.com" />
        </div>
        <div class="space-y-1">
          <Label for="nav-icon-{index}">Icon</Label>
          <div class="flex items-center gap-2">
            {#if item.iconURL}
              <img src={clientResolver(resolve, item.iconURL)} alt="Icon" class="h-6 w-6 object-contain" />
              <Button variant="ghost" size="sm" onclick={() => (item.iconURL = "")}>
                <XIcon class="h-4 w-4" />
              </Button>
            {:else}
              <Button
                variant="outline"
                size="sm"
                disabled={item.uploading}
                onclick={() => document.getElementById(`nav-icon-input-${index}`)?.click()}
              >
                {#if item.uploading}
                  <Loader class="h-4 w-4 animate-spin" />
                {:else}
                  <UploadIcon class="h-4 w-4" />
                {/if}
              </Button>
            {/if}
            <input
              id="nav-icon-input-{index}"
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/webp,image/heic,image/heif,image/svg+xml"
              class="hidden"
              onchange={(e) => handleNavIconUpload(e, index)}
            />
          </div>
        </div>
      </div>
      <Button variant="ghost" size="icon" disabled={index === 0} onclick={() => moveNavItem(index, "up")}>
        <ChevronUpIcon class="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="icon" disabled={index === nav.length - 1} onclick={() => moveNavItem(index, "down")}>
        <ChevronDownIcon class="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="icon" onclick={() => removeNavItem(index)}>
        <XIcon class="h-4 w-4" />
      </Button>
    </div>
    <div class="mt-3 flex items-center gap-2 border-t pt-3">
      <Switch id="nav-new-tab-{index}" bind:checked={item.openInNewTab} />
      <Label for="nav-new-tab-{index}" class="cursor-pointer text-sm font-normal">In neuem Tab öffnen</Label>
    </div>
  </div>
  ```

- [ ] **Schritt: TypeScript-Check ausführen**

  ```bash
  npm run check
  ```
  Erwartetes Ergebnis: keine Fehler.

- [ ] **Schritt: Commit**

  ```bash
  git add src/routes/\(manage\)/manage/app/site-configurations/+page.svelte
  git commit -m "feat: add openInNewTab toggle to nav link editor in site-configurations"
  ```

---

## Task 3: KenerNav.svelte auf openInNewTab umstellen

**Files:**
- Modify: `src/lib/components/KenerNav.svelte:13,62–63,106–107`

### Schritt 3a: Typ-Annotation auf Zeile 13 erweitern

- [ ] **Zeile 13 anpassen**

  Aktuell:
  ```typescript
  const navItems: { name: string; url: string; iconURL: string }[] = data.navItems || [];
  ```

  Ersetzen durch:
  ```typescript
  const navItems: { name: string; url: string; iconURL: string; openInNewTab?: boolean }[] = data.navItems || [];
  ```

### Schritt 3b: Desktop-Nav — target/rel umstellen

- [ ] **Zeilen 62–63 anpassen**

  Aktuell:
  ```typescript
  target={item.url.startsWith("http") ? "_blank" : undefined}
  rel={item.url.startsWith("http") ? "noopener noreferrer" : undefined}
  ```

  Ersetzen durch:
  ```typescript
  target={item.openInNewTab ? "_blank" : undefined}
  rel={item.openInNewTab ? "noopener noreferrer" : undefined}
  ```

### Schritt 3c: Mobile-Dropdown — target/rel umstellen

- [ ] **Zeilen 106–107 anpassen**

  Aktuell:
  ```typescript
  target={item.url.startsWith("http") ? "_blank" : undefined}
  rel={item.url.startsWith("http") ? "noopener noreferrer" : undefined}
  ```

  Ersetzen durch:
  ```typescript
  target={item.openInNewTab ? "_blank" : undefined}
  rel={item.openInNewTab ? "noopener noreferrer" : undefined}
  ```

- [ ] **TypeScript-Check ausführen**

  ```bash
  npm run check
  ```
  Erwartetes Ergebnis: keine Fehler.

- [ ] **Commit**

  ```bash
  git add src/lib/components/KenerNav.svelte
  git commit -m "feat: use openInNewTab field in KenerNav instead of URL heuristic"
  ```

---

## Task 4: Manueller End-to-End-Test

- [ ] **Docker neu bauen und starten**

  ```bash
  docker compose -f docker-compose.dev.yml up -d --build
  ```

- [ ] **Admin öffnen:** `http://localhost:3000/manage/app/site-configurations`

- [ ] **Testfall A — Toggle „neuer Tab" aktiv:**
  1. Nav-Link mit URL `https://example.com` hinzufügen
  2. Toggle „In neuem Tab öffnen" ist voreingestellt auf **an** (weil URL mit `https://` beginnt)
  3. Speichern → Status-Page öffnen → Link klicken → muss in neuem Tab öffnen ✓

- [ ] **Testfall B — Toggle „neuer Tab" deaktiviert:**
  1. Toggle für denselben Link auf **aus** stellen
  2. Speichern → Status-Page → Link klicken → muss im selben Tab öffnen ✓

- [ ] **Testfall C — Relativer Link:**
  1. Nav-Link mit URL `/about` hinzufügen
  2. Toggle ist voreingestellt auf **aus** (kein `http`-Prefix)
  3. Toggle auf **an** stellen → Speichern → Link klickt → neuer Tab ✓

- [ ] **Testfall D — Bestandsdaten:**
  1. Vor dem Feature gespeicherte Links (ohne `openInNewTab` im JSON) sollen beim Laden korrekt den Default erhalten (`http`-Links → Toggle an, relative Links → Toggle aus)
  2. Prüfen: Seite neu laden, vorhandene Links zeigen korrekten Toggle-Zustand ✓

- [ ] **Abschluss-Commit falls noch Anpassungen nötig, sonst fertig.**
