/** Whether the browser can read and write a local folder (Chromium; risk R2). */
export function isFileSystemAccessSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}
