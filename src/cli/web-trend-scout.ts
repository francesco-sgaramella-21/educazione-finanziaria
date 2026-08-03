import { resolve } from "node:path";

import { saveWebTrendReport, WEB_TREND_SCOUT_NOTICE } from "../agents/web-trend-scout.js";

const REPORT_PATH = resolve("outputs/trend-report.json");

await saveWebTrendReport(REPORT_PATH);

console.log("Web Trend Scout");
console.log(WEB_TREND_SCOUT_NOTICE);
console.log(`Report salvato: ${REPORT_PATH}`);
