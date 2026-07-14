/// <reference types="vite/client" />

import type { ClashNodeAPI } from "../electron/preload";

declare global {
  interface Window {
    clashnode: ClashNodeAPI;
  }
}

export {};
