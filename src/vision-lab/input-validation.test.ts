import { describe, expect, it } from 'vitest';

import { validateVisionImageFile, VISION_IMAGE_MAX_BYTES } from './input-validation';

describe('Vision Desk input validation', () => {
  it('accepts supported browser image formats', () => {
    expect(
      validateVisionImageFile({ name: 'sample.png', size: 1024, type: 'image/png' }),
    ).toMatchObject({ valid: true });
    expect(
      validateVisionImageFile({ name: 'sample.jpg', size: 1024, type: 'image/jpeg' }),
    ).toMatchObject({ valid: true });
    expect(
      validateVisionImageFile({ name: 'sample.webp', size: 1024, type: 'image/webp' }),
    ).toMatchObject({ valid: true });
  });

  it('falls back to known file extensions when browsers omit the MIME type', () => {
    expect(validateVisionImageFile({ name: 'sample.jpeg', size: 1024, type: '' })).toMatchObject({
      valid: true,
    });
  });

  it('rejects unsupported image formats', () => {
    expect(validateVisionImageFile({ name: 'sample.svg', size: 1024, type: 'image/svg+xml' }))
      .toMatchInlineSnapshot(`
        {
          "message": "Choose a PNG, JPEG, or WebP image. HEIC, SVG, GIF, and other formats are not supported yet.",
          "valid": false,
        }
      `);
  });

  it('rejects images above the local preprocessing limit', () => {
    expect(
      validateVisionImageFile({
        name: 'huge.png',
        size: VISION_IMAGE_MAX_BYTES + 1,
        type: 'image/png',
      }),
    ).toMatchInlineSnapshot(`
      {
        "message": "Choose an image smaller than 12 MiB. Large images can exhaust browser memory during local preprocessing.",
        "valid": false,
      }
    `);
  });
});
