// Node-only entry (uses node:fs), kept apart so edge runtimes never bundle it.
export { jsonFileStorage, readJsonLines } from "./storage/jsonFile.js";
export type { JsonFileStorageOptions } from "./storage/jsonFile.js";
