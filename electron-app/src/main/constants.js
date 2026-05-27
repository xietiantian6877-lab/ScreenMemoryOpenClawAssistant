const path = require("path");

const PROJECT_ROOT = path.resolve(__dirname, "..", "..", "..");
const DATA_DIR = path.join(PROJECT_ROOT, "data");
const MEMORY_DIR = path.join(DATA_DIR, "memory");
const PACKAGES_DIR = path.join(DATA_DIR, "memory_packages");
const CONFIG_PATH = path.join(DATA_DIR, "electron-config.json");
const ROOT_CONFIG_PATH = path.join(PROJECT_ROOT, "config.toml");

const DEFAULT_CONFIG = {
  tunnelBaseUrl: "",
  apiKey: "",
  observeIntervalSeconds: 60,
  observeIntervalMinSeconds: 10,
  observeIntervalMaxSeconds: 60,
  notifyIntervalMinutes: 60,
  blockedCheckMinutes: 6,
  memoryEndpoint: "/memory/sync",
  assistantMode: "api",
  directModelProvider: "OpenAI",
  directBaseUrl: "https://fast.allincoding.cc",
  directApiKey: "",
  directModel: "gpt-5.5",
  directReviewModel: "gpt-5.4",
  directReasoningEffort: "xhigh",
  directWireApi: "responses",
  disableResponseStorage: true,
  networkAccess: "enabled",
  windowsWslSetupAcknowledged: true,
  directTimeoutMs: 60000,
  modelContextWindow: 1000000,
  modelAutoCompactTokenLimit: 900000,
  sendScreenshotsToModel: false,
  buddyDefaultMode: "cursor",
  companionMode: "watch",
  proactiveGuidance: false,
  casualChat: true,
  casualChatFrequency: 70,
  codexModel: "gpt-5.5",
  codexReasoningEffort: "xhigh",
  codexAccessMode: "full",
  codexSearch: true
};

const WINDOW_BOUNDS = {
  TYPEWRITER_WIDTH: 300,
  TYPEWRITER_HEIGHT: 112,
  TYPEWRITER_POINTER_PAD: 18,
  TYPEWRITER_MAX_WIDTH: 540,
  TYPEWRITER_MAX_HEIGHT_RATIO: 0.58,
  MAIN_SHADOW_PAD: 24,
  MAIN_CONTENT_WIDTH: 820,
  MAIN_COMPOSER_HEIGHT: 318,
  MAIN_SETTINGS_HEIGHT: 318,
  MAIN_COLLAPSED_SIZE: 74
};

module.exports = {
  PROJECT_ROOT,
  DATA_DIR,
  MEMORY_DIR,
  PACKAGES_DIR,
  CONFIG_PATH,
  ROOT_CONFIG_PATH,
  DEFAULT_CONFIG,
  WINDOW_BOUNDS
};
