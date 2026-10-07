export function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // node-ical uses native local dates for floating timestamps. Configure Node
    // once at startup; APP_TIMEZONE is the deployable application setting.
    process.env.TZ = process.env.APP_TIMEZONE || "America/New_York";
  }
}
