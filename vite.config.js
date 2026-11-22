import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { resolve } from "node:path";

export default defineConfig({
  base: "/call-center-pwa/",
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        doctor: resolve(__dirname, "doctor.html"),
      },
    },
  },
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "icons/icon.svg",
        "icons/icon-192.png",
        "icons/icon-512.png",
        "doctor.webmanifest",
      ],
      manifest: {
        name: "كول سنتر — تسجيل العملاء",
        short_name: "كول سنتر",
        description: "تسجيل عملاء الكول سنتر واستهداف المحتملين مع تصدير شيت",
        start_url: "./",
        scope: "./",
        display: "standalone",
        orientation: "any",
        background_color: "#eef6f4",
        theme_color: "#0b5f5a",
        lang: "ar",
        dir: "rtl",
        icons: [
          {
            src: "icons/icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
          {
            src: "icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any maskable",
          },
          {
            src: "icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        navigateFallback: "index.html",
        navigateFallbackDenylist: [/doctor\.html/],
        globPatterns: ["**/*.{js,css,html,svg,png,webmanifest}"],
      },
    }),
  ],
});
