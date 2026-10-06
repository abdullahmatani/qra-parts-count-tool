/// <reference types="vite/client" />

declare const __APP_VERSION__: string;
/** The public source repository (GPL-3.0 source offer). */
declare const __SOURCE_URL__: string;

declare module 'libredwg-wasm?url' {
  const url: string;
  export default url;
}
