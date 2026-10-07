// The reading role (PM-53; docs/post-mvp/design/prescription-model.md §7.4; safety policy N-ROLE): a learner or a practitioner who declared it with the attestation reaches L3 in
// a build that serves roles — the composition with its amounts, the classical 加減, the personalised plan and its reasons. A general reader has no role. The attestation's
// version is kept with the choice; a new version of the safety policy's wording asks again.
import type { Role } from "@tcm/kb";
import type { Prefs, RoleChoice } from "../storage/types.ts";

/** The version of the attestation (safety policy §4, N-ROLE): change it when the wording changes, and every learner and practitioner is asked again. */
export const ROLE_STATEMENT_VERSION = "2026-10-08";

/** The role this device reads with, or null for a general reader (also when the attestation was given to an earlier wording). */
export const roleOf = (prefs: Prefs): Role | null => (prefs.role !== undefined && prefs.role.version === ROLE_STATEMENT_VERSION ? prefs.role.role : null);

export const withRole = (role: Role, at: number): Pick<Prefs, "role" | "roleOffered"> => ({ role: { role, at, version: ROLE_STATEMENT_VERSION } satisfies RoleChoice, roleOffered: true });

/** Back to a general reader: the attestation is withdrawn with the role. */
export const withoutRole = (): Pick<Prefs, "role" | "roleOffered"> => ({ role: undefined, roleOffered: true });
