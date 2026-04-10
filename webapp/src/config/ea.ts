/**
 * Single source of truth for the EA download filename.
 * Update ONLY this constant when releasing a new EA version.
 * Both the dashboard button and the welcome email use this.
 */
export const EA_FILENAME = "IronRisk_Dashboard.ex5";
export const EA_DOWNLOAD_PATH = `/downloads/${EA_FILENAME}`;
export const EA_DOWNLOAD_URL = `https://ironrisk.pro/downloads/${EA_FILENAME}`;
