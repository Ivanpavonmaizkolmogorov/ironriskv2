/**
 * Single source of truth for EA/Service download filenames.
 * Update ONLY these constants when releasing new versions.
 */

// Legacy EA Dashboard (optional visual overlay)
export const EA_FILENAME = "IronRisk_Dashboard.ex5";
export const EA_DOWNLOAD_PATH = `/downloads/${EA_FILENAME}`;
export const EA_DOWNLOAD_URL = `https://ironrisk.pro/downloads/${EA_FILENAME}`;

// New: Background Service (core connector)
export const SERVICE_FILENAME = "IronRisk_Service.ex5";
export const SERVICE_DOWNLOAD_PATH = `/downloads/${SERVICE_FILENAME}`;

// New: PowerShell Installer
export const INSTALLER_FILENAME = "Install-IronRisk.bat";
export const INSTALLER_DOWNLOAD_PATH = `/downloads/${INSTALLER_FILENAME}`;
