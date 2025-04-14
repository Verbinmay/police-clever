import { APP_SETTINGS } from '../settings/app-settings';

export function validateEnvironmentVariables() {
  for (const setting in APP_SETTINGS) {
    if (!process.env[setting]) {
      throw new Error(`${setting} environment variable is not set`);
    }
  }
}
