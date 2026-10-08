// The reading role (PM-53, PM-54; docs/post-mvp/design/prescription-model.md §7.4; safety policy N-ROLE, N-AMOUNTS). A reader who reads with the study reference sees the formulas' reference
// quantities, the classical 加減 and the medication plan with the reasons — for study and as an aid to a practitioner only. Who does, is the build's configuration (`dose_display` of the
// profile, PD-30): nobody (`off`), those who declared a learner or a practitioner role with the attestation (`roles`), or every reader unless they choose to be a general reader (`all`).
// The attestation's version is kept with the choice; a new version of the safety policy's wording asks again.
import type { KnowledgeBase, Role } from "@tcm/kb";
import type { Prefs, RoleChoice } from "../storage/types.ts";

/** The version of the attestation (safety policy §4, N-ROLE): change it when the wording changes, and every learner and practitioner is asked again. */
export const ROLE_STATEMENT_VERSION = "2026-10-08";

/** What the person chose: a role (with the current attestation), `general` (hide the study reference), or nothing — also when the attestation was given to an earlier wording. */
export function declaredOf(prefs: Prefs): Role | "general" | null {
  const c = prefs.role;
  if (c === undefined) return null;
  if (c.role === "general") return "general";
  return c.version === ROLE_STATEMENT_VERSION ? c.role : null;
}

/** The role a reader has without choosing: the learner where the build serves the study reference to everyone, else none. */
export const defaultRoleOf = (kb: KnowledgeBase): Role | null => (kb.config.profile.dose_display === "all" && kb.roles.includes("learner") ? "learner" : null);

/** The role this reader reads with in this build: their choice, else the build's default. `null` is a general reader. */
export function effectiveRole(declared: Role | "general" | null, kb: KnowledgeBase): Role | null {
  if (declared === "general") return null;
  return declared ?? defaultRoleOf(kb);
}

export const withRole = (role: Role, at: number): Pick<Prefs, "role" | "roleOffered"> => ({ role: { role, at, version: ROLE_STATEMENT_VERSION } satisfies RoleChoice, roleOffered: true });

/** A general reader by choice: no study reference, whatever the build's default (the attestation is withdrawn with the role). */
export const withGeneral = (at: number): Pick<Prefs, "role" | "roleOffered"> => ({ role: { role: "general", at, version: ROLE_STATEMENT_VERSION } satisfies RoleChoice, roleOffered: true });
