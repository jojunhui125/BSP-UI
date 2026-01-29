/**
 * 프로젝트 관련 IPC 핸들러
 */

import { ipcMain, dialog, BrowserWindow } from 'electron'
import { readFile, access } from 'fs/promises'
import { join, basename } from 'path'
import { PROJECT_CHANNELS } from '../../shared/ipc-channels'
import type { ProjectInfo, LayerInfo } from '../../shared/types'

/**
 * bblayers.conf 파싱하여 레이어 정보 추출
 */
async function parseBblayers(projectPath: string): Promise<LayerInfo[]> {
  const bblayersPath = join(projectPath, 'build', 'conf', 'bblayers.conf')
  
  try {
    await access(bblayersPath)
    const content = await readFile(bblayersPath, 'utf-8')
    
    // BBLAYERS 변수에서 레이어 경로 추출
    const bblayersMatch = content.match(/BBLAYERS\s*[?:]?=\s*"([^"]+)"/s)
    if (!bblayersMatch) return []
    
    const layerPaths = bblayersMatch[1]
      .split(/\s+/)
      .filter((p) => p.trim() && !p.startsWith('#'))
      .map((p) => p.replace(/\$\{[^}]+\}/g, projectPath)) // 변수 치환 (간단히)
    
    // 각 레이어의 layer.conf에서 우선순위 추출 (간소화)
    const layers: LayerInfo[] = layerPaths.map((layerPath, index) => ({
      name: basename(layerPath),
      path: layerPath,
      priority: 10 - index, // 임시 우선순위
    }))
    
    return layers
  } catch {
    return []
  }
}

/**
 * local.conf에서 MACHINE, DISTRO 추출
 */
async function parseLocalConf(projectPath: string): Promise<{ machine?: string; distro?: string }> {
  const localConfPath = join(projectPath, 'build', 'conf', 'local.conf')
  
  try {
    await access(localConfPath)
    const content = await readFile(localConfPath, 'utf-8')
    
    const machineMatch = content.match(/^MACHINE\s*[?:]?=\s*"?([^"\s]+)"?/m)
    const distroMatch = content.match(/^DISTRO\s*[?:]?=\s*"?([^"\s]+)"?/m)
    
    return {
      machine: machineMatch?.[1],
      distro: distroMatch?.[1],
    }
  } catch {
    return {}
  }
}

/**
 * 프로젝트 핸들러 등록
 */
export function registerProjectHandlers(): void {
  // 폴더 선택 다이얼로그
  ipcMain.handle(PROJECT_CHANNELS.SELECT_FOLDER, async (event): Promise<string | null> => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return null
    
    const result = await dialog.showOpenDialog(window, {
      properties: ['openDirectory'],
      title: 'BSP 프로젝트 폴더 선택',
    })
    
    return result.canceled ? null : result.filePaths[0]
  })

  // 프로젝트 열기
  ipcMain.handle(
    PROJECT_CHANNELS.OPEN_PROJECT,
    async (_event, projectPath: string): Promise<ProjectInfo> => {
      const [layers, localConf] = await Promise.all([
        parseBblayers(projectPath),
        parseLocalConf(projectPath),
      ])
      
      return {
        path: projectPath,
        name: basename(projectPath),
        machine: localConf.machine,
        distro: localConf.distro,
        layers,
      }
    }
  )

  // 프로젝트 정보 가져오기
  ipcMain.handle(
    PROJECT_CHANNELS.GET_INFO,
    async (_event, projectPath: string): Promise<ProjectInfo | null> => {
      try {
        const [layers, localConf] = await Promise.all([
          parseBblayers(projectPath),
          parseLocalConf(projectPath),
        ])
        
        return {
          path: projectPath,
          name: basename(projectPath),
          machine: localConf.machine,
          distro: localConf.distro,
          layers,
        }
      } catch {
        return null
      }
    }
  )

  console.log('[IPC] Project handlers registered')
}
