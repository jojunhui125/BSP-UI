import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
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
          index: resolve(__dirname, 'src/main/index.ts'),
          // Worker Thread 파일도 빌드
          ParserWorker: resolve(__dirname, 'src/main/workers/ParserWorker.ts')
        },
        output: {
          // Worker 파일 이름 유지
          entryFileNames: (chunkInfo) => {
            if (chunkInfo.name === 'ParserWorker') {
              return 'ParserWorker.js'
            }
            return '[name].js'
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
          index: resolve(__dirname, 'src/preload/index.ts')
        }
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html')
        }
      }
    },
    plugins: [react()],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src/renderer/src'),
        '@shared': resolve(__dirname, 'src/shared')
      }
    },
    optimizeDeps: {
      include: ['monaco-editor']
    }
  }
})
