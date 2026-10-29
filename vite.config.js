import { defineConfig, loadEnv } from "vite";
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "MAPILLARY_");
  return {
    base: "./",
    define: { __MAPILLARY_TOKEN__: JSON.stringify(env.MAPILLARY_TOKEN || "") },
  };
});
