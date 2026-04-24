import { chromium, type Browser, type BrowserContext } from "rebrowser-playwright";
import type { AccountConfig } from "../config.js";
import { storageStateForPath } from "./cookies.js";

export interface AccountBrowser {
  browser: Browser;
  context: BrowserContext;
}

export async function launchForAccount(
  account: AccountConfig,
  headed: boolean,
): Promise<AccountBrowser> {
  const browser = await chromium.launch({
    headless: !headed,
    ...(account.proxy
      ? {
          proxy: {
            server: account.proxy.server,
            ...(account.proxy.username ? { username: account.proxy.username } : {}),
            ...(account.proxy.password ? { password: account.proxy.password } : {}),
          },
        }
      : {}),
  });

  const storageState = storageStateForPath(account.cookiePath);
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "en-US",
    timezoneId: "America/New_York",
    ...(storageState ? { storageState } : {}),
  });

  return { browser, context };
}
