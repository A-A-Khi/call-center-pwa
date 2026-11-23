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
        "icons/apple-touch-icon.png",
        "icons/logo-official.png",
        "doctor.webmanifest",
        "sw-notifications.js",
      ],
      manifest: {
        name: "كول سنتر — Dentist on Call",
        short_name: "كول سنتر",
        description: "تسجيل عملاء الكول سنتر واستهداف المحتملين مع تصدير شيت",
        start_url: "./",
        scope: "./",
        display: "standalone",
        orientation: "any",
        background_color: "#000000",
        theme_color: "#000000",
        lang: "ar",
        dir: "rtl",
        icons: [
          {
            src: "icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "maskable",
          },
          {
            src: "icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        importScripts: ["sw-notifications.js"],
        navigateFallback: "index.html",
        navigateFallbackDenylist: [/doctor\.html/],
        globPatterns: ["**/*.{js,css,html,svg,png,webmanifest}"],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
});
