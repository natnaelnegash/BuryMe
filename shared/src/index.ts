/**
 * @buryme/shared — the single source of truth for types shared between
 * backend and web. Everything here is derived from contract/openapi.yaml.
 *
 * DO NOT hand-edit api-types.gen.ts. Run `pnpm types:generate` from the repo
 * root after any change to contract/openapi.yaml, and commit the result.
 */

export type { paths, components, operations } from "./api-types.gen.js";

// Convenience alias: most call sites want a specific schema, not the whole
// `components` namespace. Import as: `Schemas["Obligation"]`.
import type { components } from "./api-types.gen.js";
export type Schemas = components["schemas"];
