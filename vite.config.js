import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { resolve } from "node:path";

/** Keep the call-center manifest off the doctor page so they install as separate PWAs. */
function doctorOwnManifest() {
  return {
    name: "doctor-own-manifest",
    enforce: "post",
    transformIndexHtml: {
      order: "post",
      handler(html, ctx) {
        const file = `${ctx.filename || ""}${ctx.path || ""}`.replace(/\\/g, "/");
        if (!/doctor/i.test(file)) return html;
        return html
          .replace(
            /<link\s+rel="manifest"\s+href="\/call-center-pwa\/manifest\.webmanifest"\s*\/?>/gi,
            ""
          )
          .replace(
            /<link\s+rel="manifest"\s+href="[^"]*\/manifest\.webmanifest"\s*\/?>/gi,
            (tag) => (tag.includes("doctor.webmanifest") ? tag : "")
          );
      },
    },
  };
}

export default defineConfig({
  base: "/call-center-pwa/",
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        center: resolve(__dirname, "center/index.html"),
        doctor: resolve(__dirname, "doctor/index.html"),
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
        "icons/doctor-192.png",
        "icons/doctor-512.png",
        "icons/doctor-apple-touch-icon.png",
        "doctor.webmanifest",
        "sw-notifications.js",
      ],
      manifest: {
        id: "/call-center-pwa/center/",
        name: "كول سنتر — Dentist on Call",
        short_name: "كول سنتر",
        description: "تسجيل عملاء الكول سنتر واستهداف المحتملين مع تصدير شيت",
        start_url: "/call-center-pwa/center/",
        scope: "/call-center-pwa/center/",
        display: "standalone",
        orientation: "any",
        background_color: "#000000",
        theme_color: "#111111",
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
        navigateFallback: "center/index.html",
        navigateFallbackDenylist: [/\/doctor(?:\/|$)/],
        globPatterns: ["**/*.{js,css,html,svg,png,webmanifest}"],
      },
      devOptions: {
        enabled: false,
      },
    }),
    // Must run after VitePWA so it can strip the injected call-center manifest.
    doctorOwnManifest(),
  ],
});
