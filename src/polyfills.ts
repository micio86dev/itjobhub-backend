// pdfjs-dist v5 references DOMMatrix at module-level; polyfill for Bun compiled binary
if (typeof globalThis.DOMMatrix === 'undefined') {
  class DOMMatrixPolyfill {
    a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
    m11 = 1; m12 = 0; m13 = 0; m14 = 0;
    m21 = 0; m22 = 1; m23 = 0; m24 = 0;
    m31 = 0; m32 = 0; m33 = 1; m34 = 0;
    m41 = 0; m42 = 0; m43 = 0; m44 = 1;
    is2D = true;
    isIdentity = true;

    constructor() {}

    multiply() { return new DOMMatrixPolyfill(); }
    translate() { return new DOMMatrixPolyfill(); }
    scale() { return new DOMMatrixPolyfill(); }
    rotate() { return new DOMMatrixPolyfill(); }
    rotateAxisAngle() { return new DOMMatrixPolyfill(); }
    skewX() { return new DOMMatrixPolyfill(); }
    skewY() { return new DOMMatrixPolyfill(); }
    inverse() { return new DOMMatrixPolyfill(); }
    flipX() { return new DOMMatrixPolyfill(); }
    flipY() { return new DOMMatrixPolyfill(); }
    transformPoint() { return { x: 0, y: 0, z: 0, w: 1 }; }
    toFloat32Array() { return new Float32Array(16); }
    toFloat64Array() { return new Float64Array(16); }
    toString() { return 'matrix(1, 0, 0, 1, 0, 0)'; }

    static fromMatrix() { return new DOMMatrixPolyfill(); }
    static fromFloat32Array() { return new DOMMatrixPolyfill(); }
    static fromFloat64Array() { return new DOMMatrixPolyfill(); }
  }

  (globalThis as unknown as Record<string, object>).DOMMatrix = DOMMatrixPolyfill;
}
