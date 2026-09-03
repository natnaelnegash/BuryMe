import express from "express";

const app = express();
const PORT = process.env.PORT ?? 4000;

app.use(express.json());

// Health check — kept deliberately dependency-free so it works before
// Postgres/Firebase Admin are wired up in Slice 1.
app.get("/api/v1/health", (_req, res) => {
  res.json({ status: "ok", service: "buryme-backend" });
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`buryme-backend listening on :${PORT}`);
});
