/**
 * 파일 시스템 IPC 핸들러
 */

import { ipcMain } from 'electron'
import { readFile, writeFile, readdir, stat } from 'fs/promises'
import { join, extname, basename } from 'path'
import { FILE_CHANNELS } from '../../shared/ipc-channels'
import type { FileTreeNode, FileContent } from '../../shared/types'

/**
 * 파일 트리 생성 (재귀)
 */
async function buildFileTree(dirPath: string, depth = 0, maxDepth = 5): Promise<FileTreeNode[]> {
  if (depth >= maxDepth) return []

  const entries = await readdir(dirPath, { withFileTypes: true })
  const nodes: FileTreeNode[] = []

  for (const entry of entries) {
    // 숨김 파일/폴더 및 불필요한 폴더 제외
    if (entry.name.startsWith('.') || ['node_modules', 'tmp', 'sstate-cache'].includes(entry.name)) {
      continue
    }

    const fullPath = join(dirPath, entry.name)

    if (entry.isDirectory()) {
      const children = await buildFileTree(fullPath, depth + 1, maxDepth)
      nodes.push({
        name: entry.name,
        path: fullPath,
        type: 'directory',
        children,
      })
    } else {
      nodes.push({
        name: entry.name,
        path: fullPath,
        type: 'file',
        extension: extname(entry.name).slice(1),
      })
    }
  }

  // 디렉토리 먼저, 그 다음 파일 (알파벳 순)
  return nodes.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'directory' ? -1 : 1
    }
    return a.name.localeCompare(b.name)
  })
}

/**
 * 파일 핸들러 등록
 */
export function registerFileHandlers(): void {
  // 파일 읽기
  ipcMain.handle(FILE_CHANNELS.READ_FILE, async (_event, filePath: string): Promise<FileContent> => {
    try {
      const content = await readFile(filePath, 'utf-8')
      return {
        path: filePath,
        content,
        encoding: 'utf-8',
      }
    } catch (error) {
      throw new Error(`Failed to read file: ${filePath}`)
    }
  })

  // 파일 쓰기
  ipcMain.handle(
    FILE_CHANNELS.WRITE_FILE,
    async (_event, filePath: string, content: string): Promise<boolean> => {
      try {
        await writeFile(filePath, content, 'utf-8')
        return true
      } catch (error) {
        throw new Error(`Failed to write file: ${filePath}`)
      }
    }
  )

  // 디렉토리 읽기
  ipcMain.handle(FILE_CHANNELS.READ_DIR, async (_event, dirPath: string): Promise<string[]> => {
    try {
      return await readdir(dirPath)
    } catch (error) {
      throw new Error(`Failed to read directory: ${dirPath}`)
    }
  })

  // 파일 트리 가져오기
  ipcMain.handle(
    FILE_CHANNELS.GET_FILE_TREE,
    async (_event, rootPath: string): Promise<FileTreeNode[]> => {
      try {
        return await buildFileTree(rootPath)
      } catch (error) {
        throw new Error(`Failed to build file tree: ${rootPath}`)
      }
    }
  )

  console.log('[IPC] File handlers registered')
}
