import { defineConfig } from "drizzle-kit";

// Netlify generates migrations for the application schema during deployment.
// The legacy drizzle/ directory is retained as historical migration data.
export default defineConfig({
  dialect: "postgresql",
  schema: "./db/schema.ts",
  out: "./netlify/database/migrations",
});
