const CLIPBOARD_TIMEOUT_MS = 750;

function legacyCopyText(text: string) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.append(textarea);
  textarea.select();

  try {
    if (!document.execCommand('copy')) {
      throw new Error('The browser rejected the clipboard operation.');
    }
  } finally {
    textarea.remove();
  }
}

export async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    let timeoutId = 0;
    try {
      await Promise.race([
        navigator.clipboard.writeText(text),
        new Promise<never>((_, reject) => {
          timeoutId = window.setTimeout(
            () => reject(new Error('Clipboard access timed out.')),
            CLIPBOARD_TIMEOUT_MS,
          );
        }),
      ]);
      return;
    } catch {
      // Some browsers leave clipboard permission requests pending. Fall back locally.
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  legacyCopyText(text);
}
