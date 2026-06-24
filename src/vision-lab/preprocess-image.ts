export const VISION_IMAGE_MAX_DIMENSION = 1280;

export interface VisionImageDimensions {
  height: number;
  width: number;
}

export interface VisionImageMetadata extends VisionImageDimensions {
  originalBytes: number;
  processedBytes: number;
  resized: boolean;
}

export interface VisionImagePreprocessResult extends VisionImageMetadata {
  blob: Blob;
}

interface LoadedImage extends VisionImageDimensions {
  close: () => void;
  source: CanvasImageSource;
}

export function fitVisionImageDimensions(
  width: number,
  height: number,
  maxDimension = VISION_IMAGE_MAX_DIMENSION,
): VisionImageDimensions {
  if (width <= 0 || height <= 0) return { height: 0, width: 0 };
  const largestSide = Math.max(width, height);
  if (largestSide <= maxDimension) return { height, width };
  const scale = maxDimension / largestSide;
  return {
    height: Math.max(1, Math.round(height * scale)),
    width: Math.max(1, Math.round(width * scale)),
  };
}

async function loadImage(blob: Blob): Promise<LoadedImage> {
  if ('createImageBitmap' in window) {
    const bitmap = await createImageBitmap(blob);
    return {
      close: () => bitmap.close(),
      height: bitmap.height,
      source: bitmap,
      width: bitmap.width,
    };
  }

  const objectUrl = URL.createObjectURL(blob);
  const image = new Image();
  image.decoding = 'async';
  image.src = objectUrl;
  await image.decode();
  return {
    close: () => URL.revokeObjectURL(objectUrl),
    height: image.naturalHeight,
    source: image,
    width: image.naturalWidth,
  };
}

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }
      reject(new Error('This browser could not prepare the image for local analysis.'));
    }, 'image/png');
  });
}

export async function preprocessVisionImage(blob: Blob): Promise<VisionImagePreprocessResult> {
  const loaded = await loadImage(blob);
  try {
    const dimensions = fitVisionImageDimensions(loaded.width, loaded.height);
    if (dimensions.width === 0 || dimensions.height === 0) {
      throw new Error('This image has invalid dimensions.');
    }

    const canvas = document.createElement('canvas');
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser could not prepare the image for local analysis.');
    context.drawImage(loaded.source, 0, 0, dimensions.width, dimensions.height);
    const processed = await canvasToBlob(canvas);
    return {
      blob: processed,
      height: dimensions.height,
      originalBytes: blob.size,
      processedBytes: processed.size,
      resized: dimensions.width !== loaded.width || dimensions.height !== loaded.height,
      width: dimensions.width,
    };
  } finally {
    loaded.close();
  }
}
