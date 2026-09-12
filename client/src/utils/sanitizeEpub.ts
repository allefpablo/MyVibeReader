/**
 * Sanitizes EPUB XHTML document contents to prevent script execution,
 * iframe hijacking, clickjacking, tabnabbing, and cross-site scripting (XSS).
 */

const DANGEROUS_TAGS = [
  'script',
  'object',
  'embed',
  'applet',
  'iframe',
  'frame',
  'base',
];

const DANGEROUS_PROTOCOLS = [
  'javascript:',
  'vbscript:',
  'data:text/html',
  'data:application/javascript',
  'data:text/javascript',
];

function getAllElements(root: Element | null): Element[] {
  if (!root) return [];
  const results: Element[] = [root];
  if (root.children && root.children.length > 0) {
    for (let i = 0; i < root.children.length; i++) {
      results.push(...getAllElements(root.children[i]));
    }
  } else if (root.childNodes && root.childNodes.length > 0) {
    for (let i = 0; i < root.childNodes.length; i++) {
      const child = root.childNodes[i];
      if (child.nodeType === 1) { // Node.ELEMENT_NODE
        results.push(...getAllElements(child as Element));
      }
    }
  }
  return results;
}

export function sanitizeEpubDocument(doc: Document | null | undefined): void {
  if (!doc || !doc.documentElement) return;

  // 1. Remove dangerous elements completely
  for (const tag of DANGEROUS_TAGS) {
    const elements = doc.querySelectorAll
      ? doc.querySelectorAll(tag)
      : doc.getElementsByTagName(tag);

    const list = Array.from(elements);
    for (const el of list) {
      if (el.parentNode) {
        el.parentNode.removeChild(el);
      }
    }
  }

  // 2. Walk all remaining elements to strip event handlers and sanitize attributes
  const allElements = doc.querySelectorAll
    ? Array.from(doc.querySelectorAll('*'))
    : getAllElements(doc.documentElement);

  for (const el of allElements) {
    if (!el.attributes) continue;

    const attrsToRemove: string[] = [];
    for (let i = 0; i < el.attributes.length; i++) {
      const attr = el.attributes[i];
      const attrName = attr.name.toLowerCase();

      // Strip all inline 'on*' event handlers (e.g. onload, onerror, onclick)
      if (attrName.startsWith('on')) {
        attrsToRemove.push(attr.name);
        continue;
      }

      // Sanitize URL attributes against script schemes and dangerous data types
      if (
        attrName === 'href' ||
        attrName === 'src' ||
        attrName === 'action' ||
        attrName === 'formaction' ||
        attrName === 'xlink:href'
      ) {
        // Strip control characters and whitespace often used in URL obfuscation (e.g. java\x09script:)
        const normalizedValue = (attr.value || '')
          .replace(/[\u0000-\u001F\u007F-\u009F\s]/g, '')
          .toLowerCase();

        for (const protocol of DANGEROUS_PROTOCOLS) {
          if (normalizedValue.startsWith(protocol)) {
            attrsToRemove.push(attr.name);
            break;
          }
        }
      }
    }

    for (const name of attrsToRemove) {
      el.removeAttribute(name);
    }

    // Harden hyperlinks against tabnabbing and opener hijacking
    const tagName = el.tagName.toLowerCase();
    if (tagName === 'a' || tagName === 'area') {
      el.setAttribute('rel', 'noopener noreferrer');
    }
  }
}
