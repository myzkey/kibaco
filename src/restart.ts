import fs from "fs-extra";
import path from "node:path";
import { restartRequestDir, restartRequestPath } from "./paths.js";

export const ALL_PROJECTS_RESTART = "__all__";

export type RestartRequest = {
  projectName: string;
  force: boolean;
};

export async function requestProjectRestart(workspace: string, projectName: string, options: { force?: boolean } = {}) {
  const filePath = restartRequestPath(workspace, projectName);
  await fs.ensureDir(restartRequestDir(workspace));
  await fs.writeJson(filePath, { projectName, force: Boolean(options.force), requestedAt: new Date().toISOString() });
}

export async function consumeRestartRequests(workspace: string) {
  return (await consumeRestartRequestDetails(workspace)).map((request) => request.projectName);
}

export async function consumeRestartRequestDetails(workspace: string): Promise<RestartRequest[]> {
  const directory = restartRequestDir(workspace);
  if (!(await fs.pathExists(directory))) return [];
  const files = await fs.readdir(directory);
  const requests = (
    await Promise.all(
      files
        .filter((file) => file.endsWith(".json"))
        .map(async (file) => {
          const request = (await fs.readJson(path.join(directory, file)).catch(() => null)) as Partial<RestartRequest> | null;
          return {
            projectName: request?.projectName ?? file.slice(0, -".json".length),
            force: Boolean(request?.force)
          };
        })
    )
  ).filter((request) => request.projectName.length > 0);
  await Promise.all(files.map((file) => fs.remove(path.join(directory, file))));
  return requests;
}
