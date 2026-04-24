import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface ProxyConfig {
  server: string;
  username?: string;
  password?: string;
}

export interface AccountConfig {
  label: string;
  cookiePath: string;
  proxy?: ProxyConfig | null;
}

export interface AppConfig {
  dbPath: string;
  headed: boolean;
  accounts: AccountConfig[];
}

export function loadConfig(): AppConfig {
  const accountsPath = resolve("config/accounts.json");
  const accounts = JSON.parse(readFileSync(accountsPath, "utf-8")) as AccountConfig[];

  return {
    dbPath: process.env.DB_PATH ?? "./data/terapeak.db",
    headed: process.env.HEADED === "true",
    accounts,
  };
}
