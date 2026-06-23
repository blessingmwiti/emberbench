import { describe, expect, it } from 'vitest';

import { fitVisionImageDimensions } from './preprocess-image';

describe('Vision Desk image preprocessing', () => {
  it('keeps small images at their original dimensions', () => {
    expect(fitVisionImageDimensions(640, 420)).toEqual({ height: 420, width: 640 });
  });

  it('caps landscape images to the maximum dimension', () => {
    expect(fitVisionImageDimensions(4096, 2048)).toEqual({ height: 640, width: 1280 });
  });

  it('caps portrait images to the maximum dimension', () => {
    expect(fitVisionImageDimensions(1200, 2400)).toEqual({ height: 1280, width: 640 });
  });

  it('does not return zero dimensions after scaling', () => {
    expect(fitVisionImageDimensions(1, 4096)).toEqual({ height: 1280, width: 1 });
  });
});
