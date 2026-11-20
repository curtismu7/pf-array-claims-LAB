// customer.config (rule 12): branding and vocabulary for a customer's copy of this demo. An optional, git-ignored customer.config.json
// beside the compose file (see customer.config.example.json) sets the organisation name shown in the intro.
// Anything invalid is ignored, never trusted: a bad file leaves the defaults. Nothing here is a secret.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ORG = /^[A-Za-z0-9][A-Za-z0-9 .,&'-]{0,59}$/;
const DEFAULT_FILE = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "customer.config.json");

export function parseCustomerConfig(text) {
  let raw;
  try { raw = JSON.parse(text); } catch { return { org: null }; }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { org: null };
  return {
    org: typeof raw.org === "string" && ORG.test(raw.org) ? raw.org : null
  };
}

export function loadCustomerConfig(file = DEFAULT_FILE) {
  try { return parseCustomerConfig(readFileSync(file, "utf8")); } catch { return { org: null }; }
}
