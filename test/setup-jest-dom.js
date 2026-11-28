// The vendored gateway-trace test uses jest-dom matchers and relies on RTL cleaning up between tests.
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => cleanup());
// The Real-or-mock modal remembers a dismissal in sessionStorage; every test starts with it open again.
afterEach(() => { try { sessionStorage.clear(); } catch { /* none */ } });

// React Flow measures the DOM; jsdom has no layout, so give it the few browser APIs it reads (the diagram kit needs them).
class RO { observe() {} unobserve() {} disconnect() {} }
globalThis.ResizeObserver ??= RO;
globalThis.DOMMatrixReadOnly ??= class { constructor() { this.m22 = 1; } };
if (typeof HTMLElement !== "undefined") {
  Object.defineProperties(HTMLElement.prototype, {
    offsetWidth: { configurable: true, get() { return 200; } },
    offsetHeight: { configurable: true, get() { return 80; } },
  });
}
