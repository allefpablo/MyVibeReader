import { describe, it, expect } from 'vitest';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import xmldomPkg from '@xmldom/xmldom/package.json';

describe('XML Parser Security & Dependency Audit', () => {
  it('enforces @xmldom/xmldom version >= 0.8.15 to patch known CVEs', () => {
    const version = xmldomPkg.version;
    const [major, minor, patch] = version.split('.').map(Number);

    // Verify version is at least 0.8.15 or higher (0.9.x, etc.)
    const isSecure =
      major > 0 ||
      (major === 0 && minor > 8) ||
      (major === 0 && minor === 8 && patch >= 15);

    expect(isSecure).toBe(true);
  });

  it('guarantees legacy vulnerable xmldom package is not present', () => {
    let resolved = false;
    try {
      require.resolve('xmldom');
      resolved = true;
    } catch {
      resolved = false;
    }
    expect(resolved).toBe(false);
  });

  it('safely parses standard EPUB container XML metadata', () => {
    const epubContainerXml = `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;

    const doc = new DOMParser().parseFromString(epubContainerXml, 'text/xml');
    expect(doc.documentElement.nodeName).toBe('container');
    const rootfiles = doc.getElementsByTagName('rootfile');
    expect(rootfiles.length).toBe(1);
    expect(rootfiles[0].getAttribute('full-path')).toBe('OEBPS/content.opf');
  });

  it('safely handles CDATA sections without escaping or unsafe markup injection (GHSA-wh4c-j3r5-mjhp)', () => {
    const xmlWithCdata = '<note><content><![CDATA[<script>alert("xss")</script>]]></content></note>';
    const doc = new DOMParser().parseFromString(xmlWithCdata, 'text/xml');
    const contentNode = doc.getElementsByTagName('content')[0];
    
    // The script tag should be treated as text/cdata, not child element nodes
    expect(contentNode.childNodes.length).toBe(1);
    expect(contentNode.getElementsByTagName('script').length).toBe(0);

    const serialized = new XMLSerializer().serializeToString(doc);
    expect(serialized).toContain('alert("xss")');
    // Re-parsing the serialized output should still not create child script elements
    const reparsed = new DOMParser().parseFromString(serialized, 'text/xml');
    expect(reparsed.getElementsByTagName('script').length).toBe(0);
  });

  it('safely handles comments and processing instructions without node injection', () => {
    const xml = '<root><!-- comment with <tags> inside --><?pi target="value"?><child/></root>';
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    expect(doc.getElementsByTagName('tags').length).toBe(0);
    expect(doc.getElementsByTagName('child').length).toBe(1);
  });
});
