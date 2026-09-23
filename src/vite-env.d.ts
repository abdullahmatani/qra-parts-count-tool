/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

declare module 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url' {
  const url: string;
  export default url;
}

declare module 'libredwg-wasm?url' {
  const url: string;
  export default url;
}
