import { Repo } from "../repo.js";

const channel = new BroadcastChannel("sync-status");

export async function triggerSync() {
  channel.postMessage({ type: "syncing" });

  try {
    const repo = await new Repo();
    await repo.sync();
    channel.postMessage({ type: "synced" });
  } catch (error) {
    channel.postMessage({ type: "error", message: error.message });
  }
}
