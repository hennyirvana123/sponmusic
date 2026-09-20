import { defineConfig, loadEnv } from "vite";
import dyadComponentTagger from "@dyad-sh/react-vite-component-tagger";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { nitro } from "nitro/vite";

export default defineConfig(({ command, mode }) => {
  if (command === "serve" && mode === "development") {
    const env = loadEnv(mode, process.cwd(), "DEV_BASIC_PITCH_URL");
    if (!process.env.DEV_BASIC_PITCH_URL && env.DEV_BASIC_PITCH_URL) {
      process.env.DEV_BASIC_PITCH_URL = env.DEV_BASIC_PITCH_URL;
    }
  }
  return {
    server: { host: "::", port: 8080 },
    plugins: [dyadComponentTagger(), react(), nitro()],
    resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  };
});
