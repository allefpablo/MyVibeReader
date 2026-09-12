import { describe, it, expect } from 'vitest';
import { validateEbookFile, MAX_FILE_SIZE_BYTES, MAX_FILE_SIZE_MB } from '../utils/fileValidation';

describe('File Upload Size Limits and Validation', () => {
  it('enforces 30MB maximum limit constant', () => {
    expect(MAX_FILE_SIZE_MB).toBe(30);
    expect(MAX_FILE_SIZE_BYTES).toBe(30 * 1024 * 1024);
  });

  it('accepts valid PDF and EPUB files under 30MB', () => {
    const validPdf = { name: 'sample.pdf', size: 10 * 1024 * 1024 }; // 10MB
    const validEpub = { name: 'sample.epub', size: 29 * 1024 * 1024 }; // 29MB

    expect(validateEbookFile(validPdf).valid).toBe(true);
    expect(validateEbookFile(validEpub).valid).toBe(true);
  });

  it('accepts a file exactly at the 30MB boundary', () => {
    const boundaryFile = { name: 'boundary.pdf', size: 30 * 1024 * 1024 };
    expect(validateEbookFile(boundaryFile).valid).toBe(true);
  });

  it('rejects files exceeding 30MB with informative error message', () => {
    const oversizedFile = { name: 'huge-book.pdf', size: 30 * 1024 * 1024 + 1 };
    const result = validateEbookFile(oversizedFile);

    expect(result.valid).toBe(false);
    expect(result.error).toContain('30MB');
  });

  it('rejects unsupported file formats', () => {
    const mobiFile = { name: 'book.mobi', size: 5 * 1024 * 1024 };
    const result = validateEbookFile(mobiFile);

    expect(result.valid).toBe(false);
    expect(result.error).toContain('Only PDF and EPUB');
  });
});
