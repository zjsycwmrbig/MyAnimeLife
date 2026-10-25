# Repository Workflow

This workspace is the public template repository:

- Template repository: `zjsycwmrbig/MyAnimeLife`
- Personal data repository: `zjsycwmrbig/my-anime-life`

The template is the source of truth for code, documentation, tests, workflows,
site templates, the admin UI, and the userscript. The personal data repository
is a template-generated copy that also contains user records and personal
configuration.

Unless the user explicitly says otherwise, keep these repositories in sync:

1. Make and verify code or documentation changes in the template repository.
2. Merge those same non-data changes into the personal data repository.
3. Leave both working trees uncommitted until the user explicitly confirms a
   commit.

When syncing into the personal data repository, merge code and documentation
only. Never delete, truncate, overwrite, or reset any of the following:

- `data/anime.jsonl`
- `data/anime-index.jsonl`
- `data/backups/`
- repository URL, branch, token-related local settings, or any other personal
  configuration

Do not use destructive whole-repository replacement, `git reset --hard`,
`git checkout --`, or a blind archive extraction that can cover personal data.
Inspect the data repository status and diffs before and after synchronization.
If a code change also requires a data schema migration, preserve all existing
records and implement the migration as an explicit merge.
