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

function blobEntries(tree) {
  return (tree?.tree ?? []).filter(
    (entry) => entry?.type === "blob" && typeof entry.path === "string" && entry.sha,
  );
}

export function buildTemplateTree(templateTree, targetTree) {
  const targetByPath = new Map(blobEntries(targetTree).map((entry) => [entry.path, entry]));
  const entries = new Map();

  for (const entry of blobEntries(templateTree)) {
    entries.set(entry.path, {
      path: entry.path,
      mode: entry.mode || "100644",
      type: "blob",
      sha: isDataPath(entry.path) && targetByPath.has(entry.path)
        ? targetByPath.get(entry.path).sha
        : entry.sha,
    });
  }

  for (const entry of blobEntries(targetTree)) {
    if (isDataPath(entry.path) && !entries.has(entry.path)) {
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
  return {
    repository,
    branch,
    commit: commitSha,
    commitShort: commitSha.slice(0, 7),
  };
}

export async function updateFromTemplate(client, options = {}) {
  if (!client.token) {
    throw new Error("更新管理页需要先在 GitHub 连接设置中填写 Token");
  }
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
  const [templateTree, targetTree] = await Promise.all([
    client.getTreeFor(templateRepository, templateHead),
    client.getTreeFor(client.repository, targetCommit.tree.sha),
  ]);
  const targetDataPaths = new Set(
    blobEntries(targetTree).filter((entry) => isDataPath(entry.path)).map((entry) => entry.path),
  );
  const sourceEntries = blobEntries(templateTree);
  const limiter = createLimiter(4);
  const copiedSha = new Map();
  await Promise.all(
    sourceEntries
      .filter((entry) => !isDataPath(entry.path) || !targetDataPaths.has(entry.path))
      .map((entry) => limiter(async () => {
        const content = await client.getRawBase64For(
          templateRepository,
          entry.path,
          templateBranch,
        );
        copiedSha.set(entry.path, await client.createBlobBase64(content));
      })),
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
      message: options.message ?? "chore(admin): update from MyAnimeLife template",
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
    preservedDataFiles: tree.filter((entry) => isDataPath(entry.path)).length,
    updatedFiles: copiedSha.size,
    removedFiles: blobEntries(targetTree).filter(
      (entry) => !isDataPath(entry.path) && !tree.some((next) => next.path === entry.path),
    ).length,
  };
}
