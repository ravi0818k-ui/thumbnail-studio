import type { Project, ProjectRecord } from '../types'
import { projectThumbnail } from '../engine/export'
import { putProject } from './db'

export async function saveProject(project: Project): Promise<ProjectRecord> {
  const record: ProjectRecord = {
    ...JSON.parse(JSON.stringify(project)),
    updatedAt: Date.now(),
    thumbnail: projectThumbnail(project),
  }
  await putProject(record)
  return record
}

/** Asset ids a project needs in order to reopen correctly. */
export function assetIdsOf(project: Project): string[] {
  const ids: string[] = []
  if (project.background.assetId) ids.push(project.background.assetId)
  for (const obj of project.objects) {
    if (obj.type === 'image') {
      if (obj.assetId) ids.push(obj.assetId)
      if (obj.cutoutAssetId) ids.push(obj.cutoutAssetId)
    }
  }
  return ids
}
