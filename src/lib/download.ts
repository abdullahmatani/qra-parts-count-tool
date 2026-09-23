/**
 * Saves text as a file through the browser's download (for files the user
 * keeps outside the working directory, e.g. mappings and libraries to reuse
 * in other projects). Nothing leaves the computer: the file is built locally.
 */
export function downloadText(fileName: string, text: string, type = 'application/json'): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
