/**
 * Validation utilities and constraints for ebook file uploads.
 */

export const MAX_FILE_SIZE_MB = 30;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024; // 31,457,280 bytes

export interface FileValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates that an uploaded ebook has a supported extension (.pdf or .epub)
 * and does not exceed the maximum file size limit (30MB).
 */
export function validateEbookFile(file: { name: string; size: number }): FileValidationResult {
  const nameLower = file.name.toLowerCase();
  if (!nameLower.endsWith('.pdf') && !nameLower.endsWith('.epub')) {
    return {
      valid: false,
      error: 'Invalid file format. Only PDF and EPUB files are supported.',
    };
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: `File size exceeds the ${MAX_FILE_SIZE_MB}MB limit.`,
    };
  }

  return { valid: true };
}
