export function IsValidURL(url: string): boolean {
  const regex = /^(https?:\/\/)?((localhost|[\da-z.-]+\.[a-z]{2,10})(:[0-9]{1,5})?)?(\/[\w .-]*)*\/?$/i;
  return regex.test(url);
}

// Checks if a string looks like a private/loopback IPv4 address.
function isPrivateIPv4(host: string): boolean {
  // Match pure IPv4 literals
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!ipv4) return false;
  const [, a, b, c] = ipv4.map(Number);
  return (
    a === 10 ||                                              // 10.0.0.0/8
    (a === 172 && b >= 16 && b <= 31) ||                    // 172.16.0.0/12
    (a === 192 && b === 168) ||                              // 192.168.0.0/16
    a === 127 ||                                             // 127.0.0.0/8 (loopback)
    (a === 169 && b === 254) ||                              // 169.254.0.0/16 (link-local)
    a === 0                                                  // 0.0.0.0/8
  );
}

// Use this for HTTP monitor URLs to prevent SSRF via private IP literals.
// Hostnames (not raw IPs) are allowed — DNS-based SSRF requires a separate DNS rebinding defense.
// Set env KENER_ALLOW_PRIVATE_MONITOR_URLS=true to disable this check (e.g. for internal monitoring).
export function IsPublicMonitorURL(url: string): boolean {
  if (!IsValidURL(url)) return false;
  if (process.env.KENER_ALLOW_PRIVATE_MONITOR_URLS === "true") return true;
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    const host = parsed.hostname.toLowerCase();
    if (host === "localhost" || host === "::1" || host === "0:0:0:0:0:0:0:1") return false;
    if (isPrivateIPv4(host)) return false;
  } catch {
    return false;
  }
  return true;
}

export function IsValidGHObject(data: string): boolean {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(data);
  } catch (error) {
    return false;
  }

  if (typeof parsed !== "object") return false;

  if (!!parsed.apiURL && (typeof parsed.apiURL !== "string" || !IsValidURL(parsed.apiURL))) return false;

  if (!!parsed.owner && typeof parsed.owner !== "string") return false;
  if (!!parsed.repo && typeof parsed.repo !== "string") return false;
  if (!!parsed.incidentSince && isNaN(parsed.incidentSince as number)) return false;
  return true;
}

export function IsValidObject(data: unknown): boolean {
  return typeof data === "object";
}
export function IsValidJSONString(data: string): boolean {
  try {
    JSON.parse(data);
  } catch (error) {
    return false;
  }
  return true;
}

//IsValidJSONArray
export function IsValidJSONArray(data: string): boolean {
  try {
    const parsed = JSON.parse(data);
    return Array.isArray(parsed);
  } catch (error) {
    return false;
  }
}

export function IsValidNav(nav: string): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(nav);
  } catch (error) {
    return false;
  }
  if (!Array.isArray(parsed)) return false;
  if (parsed.length === 0) return true;
  for (const item of parsed) {
    if (!!!item.name || !!!item.url) return false;
  }
  return true;
}

export function IsValidHero(hero: string): boolean {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(hero);
  } catch (error) {
    return false;
  }

  if (typeof parsed !== "object") return false;
  if (!!parsed.title && typeof parsed.title !== "string") return false;
  if (!!parsed.title && typeof parsed.subtitle !== "string") return false;
  return true;
}

export function IsValidFooterHTML(html: unknown): boolean {
  return typeof html === "string";
}

export function IsValidI18n(i18n: string): boolean {
  try {
    JSON.parse(i18n);
  } catch (error) {
    return false;
  }

  return true;
}

export function IsValidAnalytics(analytics: string): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(analytics);
  } catch (error) {
    return false;
  }
  if (!Array.isArray(parsed)) return false;
  for (const item of parsed) {
    if (typeof item.id !== "string") return false;
    if (typeof item.type !== "string") return false;
  }
  return true;
}

export function IsValidColors(colors: string): boolean {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(colors);
  } catch (error) {
    return false;
  }
  if (typeof parsed !== "object") return false;
  const requiredColorKeys = ["UP", "DOWN", "DEGRADED", "MAINTENANCE"];
  for (const key of requiredColorKeys) {
    if (typeof parsed[key] !== "string" || !/^#[0-9A-Fa-f]{6}$/.test(parsed[key] as string)) return false;
  }
  // Optional color keys
  const optionalColorKeys = ["ACCENT", "ACCENT_FOREGROUND"];
  for (const key of optionalColorKeys) {
    if (parsed[key] !== undefined) {
      if (typeof parsed[key] !== "string" || !/^#[0-9A-Fa-f]{6}$/.test(parsed[key] as string)) return false;
    }
  }
  return true;
}

export const IsValidSMTPConfig = (value: string): boolean => {
  try {
    const parsed = JSON.parse(value);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return false;
    return (
      typeof parsed.smtp_host === "string" && parsed.smtp_host.length > 0 &&
      typeof parsed.smtp_port === "number" && parsed.smtp_port > 0 &&
      typeof parsed.smtp_user === "string" &&
      typeof parsed.smtp_pass === "string" &&
      typeof parsed.smtp_sender === "string" && parsed.smtp_sender.length > 0
    );
  } catch {
    return false;
  }
};
