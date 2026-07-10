import { Repo } from "../repo.js";
import { Config } from "./config.js";

const channel = new BroadcastChannel("sync-status");

export async function triggerSync() {
  channel.postMessage({ type: "syncing" });

  try {
    const repo = await new Repo();

    let config;
    try {
      config = await repo.getConfig();
    } catch {
      config = Config.default();
    }

    try {
      await repo.sync();
      channel.postMessage({ type: "synced" });
      if (config.notifyOnAutoSync) {
        const nc = new BroadcastChannel("notification");
        nc.postMessage({ title: "Sync", message: "Synchronization successful", type: "info" });
        nc.close();
      }
    } catch (error) {
      channel.postMessage({ type: "error", message: error.message });
      if (config.notifyOnAutoSync) {
        const nc = new BroadcastChannel("notification");
        nc.postMessage({ title: "Sync Error", message: error.message, type: "error" });
        nc.close();
      }
    }
  } catch (error) {
    channel.postMessage({ type: "error", message: error.message });
  }
}
