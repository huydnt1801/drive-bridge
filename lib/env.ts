export function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function dataFilePath(): string {
  return process.env.DRIVER_BRIDGE_DATA_FILE?.trim() || "./data/connections.json";
}
