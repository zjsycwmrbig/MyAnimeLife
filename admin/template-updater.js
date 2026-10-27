export const TEMPLATE_REPOSITORY = "zjsycwmrbig/MyAnimeLife";
export const TEMPLATE_BRANCH = "main";

const DATA_PREFIX = "data/";

function encodePath(value) {
  return String(value)
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function isDataPath(path) {
  return path === "data" || path.startsWith(DATA_PREFIX);
}

function isPreservedPath(path) {
  return isDataPath(path) || path === "config/site.json";
}

function blobEntries(tree) {
  return (tree?.tree ?? []).filter(
    (entry) => entry?.type === "blob" && typeof entry.path === "string" && entry.sha,
  );
}

function commitDetails(commit, repository, commitSha) {
  const nested = commit?.commit && typeof commit.commit === "object"
    ? commit.commit
    : null;
  const message = String(nested?.message ?? commit?.message ?? "").trim();
  return {
    message: message.split("\n", 1)[0] || "无提交说明",
    author:
      nested?.author?.name ??
      commit?.author?.name ??
      commit?.author?.login ??
      "未知作者",
    date:
      nested?.author?.date ??
      commit?.author?.date ??
      nested?.committer?.date ??
      commit?.committer?.date ??
      null,
    url:
      commit?.html_url ??
      `https://github.com/${repository}/commit/${commitSha}`,
  };
}

export function buildTemplateTree(templateTree, targetTree) {
  const targetByPath = new Map(blobEntries(targetTree).map((entry) => [entry.path, entry]));
  const entries = new Map();

  for (const entry of blobEntries(templateTree)) {
    const target = targetByPath.get(entry.path);
    const mode = entry.mode || "100644";
    const preserveTarget = isPreservedPath(entry.path) && target;
    const unchangedTarget =
      target &&
      target.sha === entry.sha &&
      (target.mode || "100644") === mode;
    entries.set(entry.path, {
      path: entry.path,
      mode,
      type: "blob",
      sha: preserveTarget || unchangedTarget ? target.sha : entry.sha,
    });
  }

  for (const entry of blobEntries(targetTree)) {
    if (isPreservedPath(entry.path) && !entries.has(entry.path)) {
      entries.set(entry.path, {
        path: entry.path,
        mode: entry.mode || "100644",
        type: "blob",
        sha: entry.sha,
      });
    }
  }

  return [...entries.values()].sort((left, right) =>
    left.path.localeCompare(right.path, "en"),
  );
}

function templateEntriesToCopy(templateTree, targetTree) {
  const targetByPath = new Map(
    blobEntries(targetTree).map((entry) => [entry.path, entry]),
  );
  return blobEntries(templateTree).filter((entry) => {
    const target = targetByPath.get(entry.path);
    if (isPreservedPath(entry.path)) {
      return !target;
    }
    return !(
      target &&
      target.sha === entry.sha &&
      (target.mode || "100644") === (entry.mode || "100644")
    );
  });
}

function createLimiter(limit) {
  let active = 0;
  const queue = [];
  const pump = () => {
    while (active < limit && queue.length) {
      active += 1;
      const { task, resolve, reject } = queue.shift();
      Promise.resolve()
        .then(task)
        .then(resolve, reject)
        .finally(() => {
          active -= 1;
          pump();
        });
    }
  };
  return (task) => new Promise((resolve, reject) => {
    queue.push({ task, resolve, reject });
    pump();
  });
}

export async function getTemplateStatus(client, options = {}) {
  const repository = options.repository ?? TEMPLATE_REPOSITORY;
  const branch = options.branch ?? TEMPLATE_BRANCH;
  const ref = await client.getRefFor(repository, branch);
  const commitSha = ref?.object?.sha;
  if (!commitSha) {
    throw new Error(`找不到模板分支 ${branch}`);
  }
  const commit = await client.getCommitFor(repository, commitSha);
  const details = commitDetails(commit, repository, commitSha);
  return {
    repository,
    branch,
    commit: commitSha,
    commitShort: commitSha.slice(0, 7),
    commitMessage: details.message,
    commitAuthor: details.author,
    commitDate: details.date,
    commitUrl: details.url,
  };
}

export function compareTemplateTrees(templateTree, targetTree) {
  const templateFiles = new Map(
    blobEntries(templateTree)
      .filter((entry) => !isPreservedPath(entry.path))
      .map((entry) => [
        entry.path,
        `${entry.mode || "100644"}:${entry.sha}`,
      ]),
  );
  const targetFiles = new Map(
    blobEntries(targetTree)
      .filter((entry) => !isPreservedPath(entry.path))
      .map((entry) => [
        entry.path,
        `${entry.mode || "100644"}:${entry.sha}`,
      ]),
  );
  const paths = new Set([...templateFiles.keys(), ...targetFiles.keys()]);
  const changedPaths = [...paths]
    .filter((filePath) => templateFiles.get(filePath) !== targetFiles.get(filePath))
    .sort((left, right) => left.localeCompare(right, "en"));
  return {
    updateAvailable: changedPaths.length > 0,
    changedFileCount: changedPaths.length,
    changedPaths,
  };
}

async function latestTemplateUpdate(client) {
  let commits = [];
  try {
    commits = await client.request("/commits?per_page=30");
  } catch {
    return null;
  }
  const commit = (Array.isArray(commits) ? commits : []).find((entry) =>
    /^chore\(admin\):\s*update from MyAnimeLife template/iu.test(
      String(entry?.commit?.message ?? ""),
    ),
  );
  if (!commit?.sha) {
    return null;
  }
  const details = commitDetails(commit, client.repository, commit.sha);
  return {
    commit: commit.sha,
    commitShort: commit.sha.slice(0, 7),
    commitMessage: details.message,
    commitDate: details.date,
    commitUrl: details.url,
  };
}

export async function getTemplateUpdateStatus(client, options = {}) {
  const latest = await getTemplateStatus(client, options);
  const targetRef = await client.getRef();
  const targetCommitSha = targetRef?.object?.sha;
  if (!targetCommitSha) {
    throw new Error(`找不到数据仓库分支 ${client.branch}`);
  }
  const [templateCommit, targetCommit, lastTemplateUpdate] = await Promise.all([
    client.getCommitFor(
      latest.repository,
      latest.commit,
    ),
    client.getCommitFor(client.repository, targetCommitSha),
    latestTemplateUpdate(client),
  ]);
  if (!templateCommit?.tree?.sha || !targetCommit?.tree?.sha) {
    throw new Error("无法比较模板仓库与数据仓库的文件树");
  }
  const [templateTree, targetTree] = await Promise.all([
    client.getTreeFor(latest.repository, templateCommit.tree.sha),
    client.getTreeFor(client.repository, targetCommit.tree.sha),
  ]);
  const comparison = compareTemplateTrees(templateTree, targetTree);
  const targetDetails = commitDetails(
    targetCommit,
    client.repository,
    targetCommitSha,
  );
  return {
    ...latest,
    ...comparison,
    targetCommit: targetCommitSha,
    targetCommitShort: targetCommitSha.slice(0, 7),
    targetCommitMessage: targetDetails.message,
    targetCommitDate: targetDetails.date,
    targetCommitUrl: targetDetails.url,
    lastTemplateUpdate,
  };
}

export async function updateFromTemplate(client, options = {}) {
  if (!client.token) {
    throw new Error("更新管理页需要先在 GitHub 连接设置中填写 Token");
  }
  const retryCountBefore = Number(client.retryCount) || 0;
  const templateRepository = options.repository ?? TEMPLATE_REPOSITORY;
  const templateBranch = options.branch ?? TEMPLATE_BRANCH;
  const targetRef = await client.getRef();
  const targetHead = targetRef?.object?.sha;
  if (!targetHead) {
    throw new Error(`找不到数据仓库分支 ${client.branch}`);
  }

  const [templateRef, targetCommit] = await Promise.all([
    client.getRefFor(templateRepository, templateBranch),
    client.getCommitFor(client.repository, targetHead),
  ]);
  const templateHead = templateRef?.object?.sha;
  if (!templateHead || !targetCommit?.tree?.sha) {
    throw new Error("无法读取模板或数据仓库的 Git 树");
  }
  const templateCommit = await client.getCommitFor(templateRepository, templateHead);
  const templateDetails = commitDetails(
    templateCommit,
    templateRepository,
    templateHead,
  );
  const [templateTree, targetTree] = await Promise.all([
    client.getTreeFor(templateRepository, templateHead),
    client.getTreeFor(client.repository, targetCommit.tree.sha),
  ]);
  const sourceEntries = blobEntries(templateTree);
  const entriesToCopy = templateEntriesToCopy(templateTree, targetTree);
  const limiter = createLimiter(3);
  const copiedSha = new Map();
  await Promise.all(
    entriesToCopy.map((entry) =>
      limiter(async () => {
        const content = await client.getRawBase64For(
          templateRepository,
          entry.path,
          templateBranch,
        );
        copiedSha.set(entry.path, await client.createBlobBase64(content));
      }),
    ),
  );

  const tree = buildTemplateTree(
    {
      tree: sourceEntries.map((entry) => ({
        ...entry,
        sha: copiedSha.get(entry.path) ?? entry.sha,
      })),
    },
    targetTree,
  );
  const nextTree = await client.request("/git/trees", {
    method: "POST",
    body: { tree },
  });
  const commit = await client.request("/git/commits", {
    method: "POST",
    body: {
      message:
        options.message ??
        `chore(admin): update from MyAnimeLife template\n\nTemplate-Commit: ${templateHead}`,
      tree: nextTree.sha,
      parents: [targetHead],
    },
  });

  try {
    await client.request(`/git/refs/heads/${encodePath(client.branch)}`, {
      method: "PATCH",
      body: { sha: commit.sha, force: false },
    });
  } catch (error) {
    if (error?.status === 409 || error?.status === 422) {
      throw new Error("数据仓库在更新期间产生了新提交，未覆盖任何内容。请刷新后重试");
    }
    throw error;
  }

  return {
    commit: commit.sha,
    commitShort: commit.sha.slice(0, 7),
    templateCommit: templateHead,
    templateCommitMessage: templateDetails.message,
    templateCommitAuthor: templateDetails.author,
    templateCommitDate: templateDetails.date,
    templateCommitUrl: templateDetails.url,
    preservedDataFiles: tree.filter((entry) => isDataPath(entry.path)).length,
    preservedConfigFiles: tree.some(
      (entry) => entry.path === "config/site.json",
    )
      ? 1
      : 0,
    updatedFiles: copiedSha.size,
    retryCount: (Number(client.retryCount) || 0) - retryCountBefore,
    removedFiles: blobEntries(targetTree).filter(
      (entry) =>
        !isPreservedPath(entry.path) &&
        !tree.some((next) => next.path === entry.path),
    ).length,
  };
}
