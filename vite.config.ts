import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import path from "path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "REACT_APP_");

  const processEnvDefines: Record<string, string> = {};
  for (const key in env) {
    processEnvDefines[`process.env.${key}`] = JSON.stringify(env[key]);
  }

  // Also pass through actual process.env REACT_APP_* vars (set at build/deploy time)
  for (const key in process.env) {
    if (key.startsWith("REACT_APP_")) {
      processEnvDefines[`process.env.${key}`] = JSON.stringify(process.env[key]);
    }
  }

  return {
    plugins: [
      react(),
      tailwindcss(),
      nodePolyfills({
        include: ["buffer", "crypto", "stream"],
        globals: { Buffer: true },
      }),
    ],
    resolve: {
      alias: {
        src: path.resolve(__dirname, "src"),
      },
    },
    css: {
      preprocessorOptions: {
        scss: {
          api: "modern-compiler",
          silenceDeprecations: ["import"],
        },
      },
    },
    define: processEnvDefines,
  };
});
