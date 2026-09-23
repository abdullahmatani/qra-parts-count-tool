/**
 * Saves text as a file through the browser's download (for files the user
 * keeps outside the working directory, e.g. mappings and libraries to reuse
 * in other projects). Nothing leaves the computer: the file is built locally.
 */
export function downloadText(fileName: string, text: string, type = 'application/json'): void {
  downloadBlob(fileName, new Blob([text], { type }));
}

export function downloadBlob(fileName: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
