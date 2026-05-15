# Design: Nav-Link „In neuem Tab öffnen" Toggle

**Datum:** 2026-05-14
**Status:** Approved

## Zusammenfassung

Pro custom Navigation Link im Admin-Bereich (`/manage/app/site-configurations`) wird ein Toggle-Switch hinzugefügt, mit dem sich explizit steuern lässt, ob der Link im selben oder in einem neuen Tab geöffnet wird. Damit wird die bisherige automatische URL-Heuristik (`url.startsWith("http")`) durch eine explizite Nutzereinstellung ersetzt.

## Anforderungen

- Jeder Nav-Link im Admin bekommt einen Toggle „In neuem Tab öffnen"
- Bestehende Links ohne gespeicherten Wert erhalten beim Laden den Wert `url.startsWith("http")` als Default (bisheriges Verhalten bleibt erhalten)
- Der Wert wird persistent gespeichert (Teil des nav-JSON-Blobs in der DB)
- Die öffentliche Nav (`KenerNav.svelte`) nutzt den gespeicherten Wert statt der Heuristik

## Datenmodell

### NavItem Interface (Admin-Seite)

```typescript
interface NavItem {
  name: string;
  url: string;
  iconURL: string;
  openInNewTab: boolean;  // neu
  uploading?: boolean;    // nur client-seitig, wird nicht gespeichert
}
```

### Laden (onMount)

```typescript
nav = data.nav.map((item: NavItem) => ({
  name: item.name || "",
  url: item.url || "",
  iconURL: item.iconURL || "",
  openInNewTab: item.openInNewTab ?? item.url.startsWith("http")
}));
```

### Speichern (saveNavigation)

```typescript
const cleanNav = nav.map((item) => ({
  name: item.name,
  url: item.url,
  iconURL: item.iconURL,
  openInNewTab: item.openInNewTab
}));
```

## UI

**Platzierung:** Option B — Toggle als eigene Zeile unterhalb des 3-spaltigen Grids (Name | URL | Icon), abgesetzt durch eine leichte Trennlinie.

```
┌─────────────────────────────────────────────────────┐
│  Name          URL                  Icon             │
│  [__________]  [__________________] [📁 Upload]      │
│ ─────────────────────────────────────────────────── │
│  ○●  In neuem Tab öffnen                             │
└─────────────────────────────────────────────────────┘  [↑] [↓] [✕]
```

**Komponente:** `Switch` aus `$lib/components/ui/switch` — bereits auf der Seite importiert, kein neues Dependency.

**Label:** „In neuem Tab öffnen" (vorerst hardcoded, kein i18n erforderlich für dieses Feature)

## Öffentliche Navigation

**Datei:** `src/lib/components/KenerNav.svelte`

Die URL-Heuristik wird durch den expliziten Feldwert ersetzt — sowohl im Desktop- als auch im Mobile-Dropdown:

```typescript
// Vorher
target={item.url.startsWith("http") ? "_blank" : undefined}
rel={item.url.startsWith("http") ? "noopener noreferrer" : undefined}

// Nachher
target={item.openInNewTab ? "_blank" : undefined}
rel={item.openInNewTab ? "noopener noreferrer" : undefined}
```

## Betroffene Dateien

| Datei | Art der Änderung |
|---|---|
| `src/routes/(manage)/manage/app/site-configurations/+page.svelte` | Interface erweitern, onMount anpassen, Toggle-UI einfügen, saveNavigation anpassen |
| `src/lib/components/KenerNav.svelte` | target/rel-Logik auf `openInNewTab` umstellen (2 Stellen: Desktop + Mobile) |
| `src/lib/server/controllers/layoutController.ts` | `navItems`-Typ um `openInNewTab?: boolean` erweitern |

## Nicht im Scope

- i18n für das Toggle-Label
- Änderungen am Backend/API (nav wird als JSON-String gespeichert, kein Schema-Change nötig)
- Änderungen an der Embed- oder Docs-Nav
