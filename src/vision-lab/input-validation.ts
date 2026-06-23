export const VISION_IMAGE_MAX_BYTES = 12 * 1024 * 1024;

export const VISION_IMAGE_ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

export const VISION_IMAGE_ACCEPT_ATTRIBUTE = VISION_IMAGE_ACCEPTED_TYPES.join(',');

const ACCEPTED_TYPE_LABEL = 'PNG, JPEG, or WebP';
const MAX_SIZE_LABEL = '12 MiB';

export interface VisionImageValidationResult {
  message: string | null;
  valid: boolean;
}

function extensionMimeType(name: string) {
  const extension = name.toLowerCase().split('.').pop();
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  return null;
}

export function validateVisionImageFile(file: Pick<File, 'name' | 'size' | 'type'>) {
  const reportedType = file.type || extensionMimeType(file.name);
  if (!reportedType || !VISION_IMAGE_ACCEPTED_TYPES.includes(reportedType as never)) {
    return {
      message: `Choose a ${ACCEPTED_TYPE_LABEL} image. HEIC, SVG, GIF, and other formats are not supported yet.`,
      valid: false,
    } satisfies VisionImageValidationResult;
  }

  if (file.size > VISION_IMAGE_MAX_BYTES) {
    return {
      message: `Choose an image smaller than ${MAX_SIZE_LABEL}. Large images can exhaust browser memory during local preprocessing.`,
      valid: false,
    } satisfies VisionImageValidationResult;
  }

  return { message: null, valid: true } satisfies VisionImageValidationResult;
}
