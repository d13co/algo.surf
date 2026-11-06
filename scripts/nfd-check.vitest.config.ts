// Runs scripts/nfd-history-check.ts (not part of `pnpm test`: it reads a live dtalgod).
// REACT_APP_NETWORK=Mainnet REACT_APP_TIMETRAVEL_ALGOD_URL=https://mainnet-api-dt.d13.co \
//   npx vitest run -c scripts/nfd-check.vitest.config.ts
import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "../vite.config";

export default defineConfig((env) =>
  mergeConfig(viteConfig(env), {
    test: {
      include: ["scripts/nfd-history-check.ts"],
      environment: "node",
      testTimeout: 600_000,
      hookTimeout: 600_000,
    },
  }),
);
