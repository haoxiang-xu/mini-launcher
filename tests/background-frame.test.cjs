const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// Run the real component effect against a canvas that models WebGL's clearing
// on presentation and resize. The browser probe verifies the same GPU behavior.
async function background(t) {
  const { transformWithOxc } = await import("vite");
  const file = path.join(__dirname, "../vendor/mini-ui/src/BUILTIN_COMPONENTs/background/shader_blob_background/shader_blob_background.js");
  const { code } = await transformWithOxc(fs.readFileSync(file, "utf8"), file, { lang: "jsx", jsx: { runtime: "classic" } });
  const effects = [], observers = [], frames = new Map();
  const root = { clientWidth: 1280, clientHeight: 720 };
  let contextOptions, painted = false, width = 0, height = 0, frameId = 0;
  const gl = new Proxy({
    getShaderParameter: () => true, getProgramParameter: () => true,
    createShader: () => ({}), createProgram: () => ({}), createBuffer: () => ({}),
    getUniformLocation: (_, name) => name,
    drawArrays: () => { painted = true; },
  }, { get: (target, key) => target[key] || (() => {}) });
  const canvas = {
    get width() { return width; }, set width(value) { width = value; painted = false; },
    get height() { return height; }, set height(value) { height = value; painted = false; },
    getContext: (_, options) => { contextOptions = options; return gl; },
  };
  const sandbox = {
    React: { createElement: (tag, props) => { if (props?.ref) props.ref.current = tag === "canvas" ? canvas : root; } },
    useRef: (current) => ({ current }), useState: (value) => [value, () => {}],
    useEffect: (callback) => effects.push(callback),
    requestAnimationFrame: (callback) => { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame: (id) => frames.delete(id),
    ResizeObserver: class { constructor(callback) { observers.push(callback); } observe() {} disconnect() {} },
    IntersectionObserver: class { observe() {} disconnect() {} },
    window: { devicePixelRatio: 1 }, performance: { now: () => 1000 }, console,
  };
  vm.createContext(sandbox);
  vm.runInContext(code.replace(/^import[^\n]+from "react";\n/m, "").replace("export default ShaderBlobBackground;", "globalThis.renderBackground = ShaderBlobBackground;"), sandbox);
  sandbox.renderBackground({ pixelRatio: 0.45, shape: "torus", count: 2, blur: 40 });
  const cleanups = effects.map((effect) => effect());
  t.after(() => cleanups.forEach((cleanup) => cleanup?.()));
  return {
    canvas,
    get painted() { return painted; },
    frame() { const [id, callback] = frames.entries().next().value; frames.delete(id); callback(); },
    present() { if (!contextOptions.preserveDrawingBuffer) painted = false; },
    resize() { root.clientWidth -= 4; observers.forEach((callback) => callback()); },
  };
}

test("blurred background retains its last frame between GPU presentations", async (t) => {
  const scene = await background(t);
  scene.frame();
  assert.equal(scene.painted, true);
  scene.present();
  assert.equal(scene.painted, true, "a repaint between animation frames must not sample an empty buffer");
});

test("resize cannot expose an empty frame before the replacement is drawn", async (t) => {
  const scene = await background(t);
  scene.frame();
  const originalWidth = scene.canvas.width;
  scene.resize();
  assert.equal(scene.painted, true, "resize observer must not clear the visible canvas early");
  scene.frame();
  assert.ok(scene.canvas.width < originalWidth, "the next rendered frame must adopt the new size");
  assert.equal(scene.painted, true);
});
