// electron.vite.config.ts
import { resolve } from "path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
var __electron_vite_injected_dirname = "D:\\6. DSSAD\\00.TEST\\BSP UI\\code";
var electron_vite_config_default = defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({
      // 모든 dependencies를 외부화 (네이티브 모듈 포함)
      // better-sqlite3, ssh2 등 네이티브 모듈이 번들링되지 않도록 함
      exclude: []
    })],
    build: {
      // 네이티브 모듈 지원을 위한 설정
      commonjsOptions: {
        ignoreDynamicRequires: true
      },
      rollupOptions: {
        input: {
          index: resolve(__electron_vite_injected_dirname, "src/main/index.ts"),
          // Worker Thread 파일도 빌드
          ParserWorker: resolve(__electron_vite_injected_dirname, "src/main/workers/ParserWorker.ts")
        },
        output: {
          // Worker 파일 이름 유지
          entryFileNames: (chunkInfo) => {
            if (chunkInfo.name === "ParserWorker") {
              return "ParserWorker.js";
            }
            return "[name].js";
          }
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__electron_vite_injected_dirname, "src/preload/index.ts")
        }
      }
    }
  },
  renderer: {
    root: resolve(__electron_vite_injected_dirname, "src/renderer"),
    build: {
      rollupOptions: {
        input: {
          index: resolve(__electron_vite_injected_dirname, "src/renderer/index.html")
        }
      }
    },
    plugins: [react()],
    resolve: {
      alias: {
        "@": resolve(__electron_vite_injected_dirname, "src/renderer/src"),
        "@shared": resolve(__electron_vite_injected_dirname, "src/shared")
      }
    },
    optimizeDeps: {
      include: ["monaco-editor"]
    }
  }
});
export {
  electron_vite_config_default as default
};
