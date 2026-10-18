import { defineConfig, transformWithOxc } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  base: "./",
  plugins: [
    {
      name: "mini-ui-jsx-source",
      enforce: "pre",
      async transform(code, id) {
        if (id.replaceAll("\\", "/").includes("/vendor/mini-ui/src/") && id.endsWith(".js")) {
          return transformWithOxc(code, id, { lang: "jsx", jsx: { runtime: "automatic" } });
        }
      },
    },
    react(),
  ],
  resolve: {
    alias: { "@mini-ui": fileURLToPath(new URL("./vendor/mini-ui/src", import.meta.url)) },
    dedupe: ["react", "react-dom"],
  },
  server: { strictPort: true },
  optimizeDeps: { include: ["react", "react-dom/client", "react/jsx-runtime", "@remixicon/react"] },
});
