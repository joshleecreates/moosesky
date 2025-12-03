import express from "express";
import { WebApp } from "@514labs/moose-lib";
import path from "path";

const app = express();

// Resolve public directory from project root
const publicDir = path.join(process.cwd(), "app/public");

// Serve static files from public directory
app.use(express.static(publicDir));

// Serve index.html for root path
app.get("/", (req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

export const dashboardApp = new WebApp("dashboard", app, {
  mountPath: "/dashboard",
  metadata: {
    description: "Bluesky Word Trends Dashboard",
  },
});
