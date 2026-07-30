/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

// Injected by vite.config.ts's `define` - the short commit SHA and ISO
// timestamp of the build currently running, shown on More.tsx so anyone
// can confirm which deploy they're actually looking at.
declare const __APP_VERSION__: string;
declare const __BUILD_TIME__: string;
