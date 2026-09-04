// Centralized, typed access to process.env. Values are loaded into
// process.env before this module runs — the "dev"/"start" scripts pass
// `--env-file=../.env` to Node (see backend/package.json) rather than any
// module here doing the loading itself.
//
// Fail fast on a missing required var instead of letting `undefined` leak
// into a query string, Firebase Admin init, etc. and surface as a confusing
// downstream error.
function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required("DATABASE_URL"),
};
