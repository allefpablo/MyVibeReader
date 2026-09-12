import { describe, it, expect } from 'vitest';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { sanitizeEpubDocument } from '../utils/sanitizeEpub';

describe('EPUB Content Security & Sanitization', () => {
  const parseHtml = (html: string): Document => {
    return new DOMParser().parseFromString(html, 'text/html');
  };

  const serialize = (doc: Document): string => {
    return new XMLSerializer().serializeToString(doc);
  };

  it('removes <script> elements and external script references', () => {
    const maliciousHtml = `
      <html>
        <head>
          <script src="https://evil.com/payload.js"></script>
        </head>
        <body>
          <p>Normal chapter text</p>
          <script>window.maliciousCode = true;</script>
        </body>
      </html>
    `;
    const doc = parseHtml(maliciousHtml);
    sanitizeEpubDocument(doc);

    expect(doc.getElementsByTagName('script').length).toBe(0);
    const output = serialize(doc);
    expect(output).not.toContain('evil.com');
    expect(output).not.toContain('maliciousCode');
    expect(output).toContain('Normal chapter text');
  });

  it('removes dangerous object, embed, iframe, and base elements', () => {
    const maliciousHtml = `
      <html>
        <head>
          <base href="https://evil.com/" />
        </head>
        <body>
          <object data="exploit.swf"></object>
          <embed src="exploit.pdf"></embed>
          <iframe src="https://phishing.com"></iframe>
          <p>Legitimate text</p>
        </body>
      </html>
    `;
    const doc = parseHtml(maliciousHtml);
    sanitizeEpubDocument(doc);

    expect(doc.getElementsByTagName('base').length).toBe(0);
    expect(doc.getElementsByTagName('object').length).toBe(0);
    expect(doc.getElementsByTagName('embed').length).toBe(0);
    expect(doc.getElementsByTagName('iframe').length).toBe(0);
    expect(serialize(doc)).toContain('Legitimate text');
  });

  it('strips all inline event handler attributes (on*)', () => {
    const maliciousHtml = `
      <html>
        <body onload="doEvil()">
          <img src="chapter1.png" onerror="stealData()" />
          <a href="/chapter2" onclick="trackUser()" onmouseover="popup()">Next</a>
          <button onfocus="trigger()">Button</button>
        </body>
      </html>
    `;
    const doc = parseHtml(maliciousHtml);
    sanitizeEpubDocument(doc);

    const body = doc.getElementsByTagName('body')[0];
    expect(body.hasAttribute('onload')).toBe(false);

    const img = doc.getElementsByTagName('img')[0];
    expect(img.hasAttribute('onerror')).toBe(false);
    expect(img.getAttribute('src')).toBe('chapter1.png');

    const link = doc.getElementsByTagName('a')[0];
    expect(link.hasAttribute('onclick')).toBe(false);
    expect(link.hasAttribute('onmouseover')).toBe(false);
    expect(link.getAttribute('href')).toBe('/chapter2');

    const button = doc.getElementsByTagName('button')[0];
    expect(button.hasAttribute('onfocus')).toBe(false);

    const output = serialize(doc);
    expect(output).not.toContain('doEvil');
    expect(output).not.toContain('stealData');
    expect(output).not.toContain('trackUser');
    expect(output).not.toContain('popup');
  });

  it('neutralizes javascript:, vbscript:, and data:text/html links and URLs', () => {
    const maliciousHtml = `
      <html>
        <body>
          <a id="js-link" href="javascript:alert(document.cookie)">Click me</a>
          <a id="vb-link" href="vbscript:msgbox(1)">Click me</a>
          <a id="data-link" href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">Payload</a>
          <a id="obfuscated-link" href="java&#x09;script:evil()">Obfuscated</a>
          <a id="safe-link" href="chapter2.xhtml">Safe Chapter</a>
        </body>
      </html>
    `;
    const doc = parseHtml(maliciousHtml);
    sanitizeEpubDocument(doc);

    const links = doc.getElementsByTagName('a');
    for (let i = 0; i < links.length; i++) {
      const link = links[i];
      const id = link.getAttribute('id');
      const href = link.getAttribute('href');

      if (id === 'safe-link') {
        expect(href).toBe('chapter2.xhtml');
      } else {
        expect(!link.hasAttribute('href') || href === '#' || !(href ?? '').toLowerCase().includes('script')).toBe(true);
      }
      expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    }
  });

  it('neutralizes javascript: in img src attributes', () => {
    const maliciousHtml = `
      <html>
        <body>
          <img id="bad-img" src="javascript:evil()" />
          <img id="good-img" src="valid.jpg" />
        </body>
      </html>
    `;
    const doc = parseHtml(maliciousHtml);
    sanitizeEpubDocument(doc);

    const imgs = doc.getElementsByTagName('img');
    let badImg: Element | null = null;
    let goodImg: Element | null = null;
    for (let i = 0; i < imgs.length; i++) {
      if (imgs[i].getAttribute('id') === 'bad-img') badImg = imgs[i];
      if (imgs[i].getAttribute('id') === 'good-img') goodImg = imgs[i];
    }

    expect(badImg?.hasAttribute('src')).toBe(false);
    expect(goodImg?.getAttribute('src')).toBe('valid.jpg');
    expect(serialize(doc)).not.toContain('evil()');
  });

  it('safely handles null and undefined document inputs without crashing', () => {
    expect(() => sanitizeEpubDocument(null)).not.toThrow();
    expect(() => sanitizeEpubDocument(undefined)).not.toThrow();
  });
});
