import { triggerSync } from "./objects/sync.js";

let intervalId = null;

onmessage = (event) => {
  if (event.data.type === "init") {
    intervalId = setInterval(() => {
      triggerSync();
    }, 1000 * 60);
  } else if (event.data.type === "stop") {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }
};
