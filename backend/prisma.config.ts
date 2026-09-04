// Prisma CLI configuration (generate / migrate / studio). Prisma 7 moved
// datasource connection info here, out of prisma/schema.prisma.
//
// This is CLI-only config — it has no effect on the running Express app,
// which loads DATABASE_URL itself (via `node --env-file`, see backend's
// "dev"/"start" scripts) and passes it to PrismaClient through an explicit
// driver adapter in src/db/client.ts.
import { config } from "dotenv";
import { defineConfig, env } from "prisma/config";

// .env lives at the repo root (alongside docker-compose.yml), not inside
// backend/ — load it explicitly rather than relying on dotenv's default
// cwd-relative lookup.
config({ path: "../.env" });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
