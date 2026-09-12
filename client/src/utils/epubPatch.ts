import ePub from 'epubjs';

/**
 * Robust zip entry locator that handles common real-world EPUB archive quirks:
 * 1. Exact path match
 * 2. Leading slash variations (/OEBPS/... vs OEBPS/...)
 * 3. File extension variations (.xhtml vs .html, .jpeg vs .jpg)
 * 4. Case-insensitive filename matching (cover.jpg vs Cover.JPG)
 */
function findZipEntry(zip: any, path: string) {
  if (!zip || !path) return null;
  let entry = zip.file(path);
  if (entry) return entry;

  const cleanPath = path.replace(/^\//, '');
  entry = zip.file(cleanPath);
  if (entry) return entry;

  // Try extension swap (.xhtml <-> .html)
  if (cleanPath.endsWith('.xhtml')) {
    entry = zip.file(cleanPath.replace(/\.xhtml$/i, '.html'));
    if (entry) return entry;
  } else if (cleanPath.endsWith('.html')) {
    entry = zip.file(cleanPath.replace(/\.html$/i, '.xhtml'));
    if (entry) return entry;
  }

  // Try case-insensitive lookup
  const lower = cleanPath.toLowerCase();
  for (const key of Object.keys(zip.files || {})) {
    if (key.toLowerCase() === lower) {
      return zip.files[key];
    }
  }

  // Try case-insensitive lookup with swapped extension
  const swappedLower = lower.endsWith('.xhtml')
    ? lower.replace(/\.xhtml$/i, '.html')
    : lower.endsWith('.html')
    ? lower.replace(/\.html$/i, '.xhtml')
    : lower;
  for (const key of Object.keys(zip.files || {})) {
    if (key.toLowerCase() === swappedLower) {
      return zip.files[key];
    }
  }

  return null;
}

function patchArchive(archive: any) {
  if (!archive || archive._isPatched) return;
  archive._isPatched = true;

  const origGetText = archive.getText.bind(archive);
  archive.getText = function (url: string, encoding?: string) {
    const decoded = window.decodeURIComponent(url.startsWith('/') ? url.slice(1) : url);
    let entry = this.zip?.file(decoded);
    if (!entry && this.zip) {
      entry = findZipEntry(this.zip, decoded);
    }
    if (entry) {
      return entry.async('string');
    }
    return origGetText(url, encoding);
  };

  const origGetBlob = archive.getBlob.bind(archive);
  archive.getBlob = function (url: string, mimeType?: string) {
    const decoded = window.decodeURIComponent(url.startsWith('/') ? url.slice(1) : url);
    let entry = this.zip?.file(decoded);
    if (!entry && this.zip) {
      entry = findZipEntry(this.zip, decoded);
    }
    if (entry) {
      return entry.async('uint8array').then((bytes: Uint8Array) => {
        return new Blob([bytes], { type: mimeType || 'application/octet-stream' });
      });
    }
    return origGetBlob(url, mimeType);
  };
}

let isPatched = false;

export function applyEpubPatches() {
  if (isPatched) return;
  isPatched = true;

  const BookProto = (ePub as any).Book?.prototype;
  if (!BookProto) return;

  const origUnarchive = BookProto.unarchive;
  if (origUnarchive) {
    BookProto.unarchive = function (data: any, encoding: any) {
      return origUnarchive.call(this, data, encoding).then((res: any) => {
        patchArchive(this.archive);
        return res;
      });
    };
  }

  const origLoadNavigation = BookProto.loadNavigation;
  if (origLoadNavigation) {
    BookProto.loadNavigation = function (packaging: any) {
      return origLoadNavigation.call(this, packaging).catch((err: any) => {
        console.warn('Initial loadNavigation failed, attempting fallback:', err?.message || err);
        if (packaging && packaging.ncxPath) {
          return this.load(packaging.ncxPath, 'xml')
            .then((_xml: any) => {
              this.navigation = { toc: [], landmarks: [], length: 0 };
              return this.navigation;
            })
            .catch(() => {
              this.navigation = { toc: [], landmarks: [], length: 0 };
              return this.navigation;
            });
        }
        this.navigation = { toc: [], landmarks: [], length: 0 };
        return this.navigation;
      });
    };
  }
}
