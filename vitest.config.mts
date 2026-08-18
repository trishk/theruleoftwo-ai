import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
    test: {
        environment: "jsdom",
        globals: true,
        exclude: [
            "**/node_modules/**",
            "**/e2e/**",
        ],
    },
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./"),
            "server-only": path.resolve(
                __dirname,
                "./tests/mocks/server-only.ts"
            ),
        },
    },
});