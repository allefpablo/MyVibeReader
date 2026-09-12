// Polyfills for modern ECMAScript features missing in older WebViews (such as Android WebView)
// Essential for PDF.js v6 and EPUB readers.

// Uint8Array.prototype.toHex
if (typeof (Uint8Array.prototype as any).toHex !== 'function') {
  (Uint8Array.prototype as any).toHex = function (): string {
    let hex = '';
    for (let i = 0; i < this.length; i++) {
      hex += this[i].toString(16).padStart(2, '0');
    }
    return hex;
  };
}

// Uint8Array.prototype.setFromHex
if (typeof (Uint8Array.prototype as any).setFromHex !== 'function') {
  (Uint8Array.prototype as any).setFromHex = function (hexString: string): { read: number; written: number } {
    const cleanHex = hexString.replace(/[^0-9a-fA-F]/g, '');
    const bytes = cleanHex.match(/.{1,2}/g) || [];
    const len = Math.min(bytes.length, this.length);
    for (let i = 0; i < len; i++) {
      this[i] = parseInt(bytes[i], 16);
    }
    return { read: len * 2, written: len };
  };
}

// Map.prototype.getOrInsertComputed
if (typeof (Map.prototype as any).getOrInsertComputed !== 'function') {
  (Map.prototype as any).getOrInsertComputed = function (key: any, callback: (key: any) => any): any {
    if (this.has(key)) {
      return this.get(key);
    }
    const value = callback(key);
    this.set(key, value);
    return value;
  };
}

// Map.prototype.getOrInsert
if (typeof (Map.prototype as any).getOrInsert !== 'function') {
  (Map.prototype as any).getOrInsert = function (key: any, defaultValue: any): any {
    if (this.has(key)) {
      return this.get(key);
    }
    this.set(key, defaultValue);
    return defaultValue;
  };
}

// Promise.withResolvers
if (typeof (Promise as any).withResolvers !== 'function') {
  (Promise as any).withResolvers = function <T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: any) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

export {};
