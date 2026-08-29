import fs from "node:fs";
import path from "node:path";
import { fetchSocialSignals } from "../src/openclaw-social-connectors.mjs";

const outputPath = process.env.OPENCLAW_SOCIAL_SIGNALS_PATH || "data/openclaw-social-signals.json";
const youtubeChannelIds = String(process.env.OPENCLAW_YOUTUBE_CHANNEL_IDS || "").split(",").map((value) => value.trim()).filter(Boolean);
const signals = await fetchSocialSignals({ youtubeChannelIds });
const payload = { generated_at: new Date().toISOString(), policy: "Discovery signals only. Community and social sources require independent corroboration before publication.", signals };
const target = path.resolve(process.cwd(), outputPath);
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, JSON.stringify(payload, null, 2) + "\n", "utf8");
console.log("Collected " + signals.length + " social discovery signal(s).");
