#!/usr/bin/env bash
#
# Wrapper for the scheduled knowledge-librarian loop (Karpathy rule).
#
# `.github/workflows/knowledge-librarian.yaml` always invokes this script
# directly (never a repository variable's content as a command - a repo
# variable can only choose *which* agent runs, never *what command* runs).
# Set `AGENT_CLI` (repo variable or secret) to the command that runs your
# coding agent non-interactively - e.g. the GitHub Copilot CLI or an internal
# agent runner that accepts a prompt on `-p`/stdin.
#
# CONTRACT (the workflow relies on this):
#   - This script only READS the repo and WRITES files under .lokf/knowledge/
#     (the workflow diffs and commits that path only; tooling files are
#     lokf-scaffolding's domain).
#   - It MUST NOT git commit, push, or open PRs - the workflow owns that.
#   - On success it exits 0 whether or not it changed anything; the workflow
#     diffs the working tree to decide whether to open a PR.
#
# Inputs (env):
#   AGENT_CLI   command that runs the agent given a prompt via -p "<prompt>"
#
set -euo pipefail

# Resolve the repo root from this script's location so it works regardless of cwd.
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

# The lokf-librarian skill may live under any of these skill-directory
# conventions - the three install targets, plus bare skills/ for a repo that
# publishes the skills it also uses. If this repo uses a different one, add it here - a candidate
# list that doesn't match reality fails this whole script at run time, not at
# scaffold time.
skill=""
for candidate in .claude/skills/lokf-librarian/SKILL.md .github/skills/lokf-librarian/SKILL.md \
                 .agents/skills/lokf-librarian/SKILL.md skills/lokf-librarian/SKILL.md; do
  if [ -f "$candidate" ]; then skill="$candidate"; break; fi
done
[ -n "$skill" ] || {
  echo "knowledge-librarian: lokf-librarian SKILL.md not found in .claude/skills/, .github/skills/, .agents/skills/, or skills/" >&2
  exit 2
}

if [ -z "${AGENT_CLI:-}" ]; then
  cat >&2 <<'EOF'
knowledge-librarian: AGENT_CLI is not set.

Set AGENT_CLI to your non-interactive agent command (e.g. a Copilot CLI or
internal runner). This wrapper hands it a prompt built from the lokf-librarian
skill; the agent is expected to edit files under .lokf/knowledge/ only.
EOF
  exit 2
fi

# Build the prompt. The agent should follow the skill verbatim, edit only the
# .lokf/knowledge/ bundle, and make no VCS operations.
# The heredoc is unquoted so $skill expands - which means any backtick in the
# text MUST be escaped (\`) or bash runs it as a command and blanks the word.
prompt="$(cat <<EOF
You are the repository knowledge librarian. Follow this skill file verbatim:
  - $skill

Task (Karpathy rule - continuous small corrections, not a rewrite):
  1. Follow the skill's Scrape & build procedure: bootstrap discovery if the
     bundle has no real concepts yet, otherwise the steady-state refresh of the
     sources recorded in the bundle (concept provenance and
     .lokf/knowledge/playbooks/knowledge-sources.md).
  2. Reconcile the .lokf/ knowledge bundle with the repository: add missing
     concepts, correct stale facts (refreshing each changed concept's
     \`generated\` provenance, which supersedes the v0.1 \`timestamp\`), wire
     typed relations, and prepend dated entries to
     .lokf/knowledge/log.md - but only when the bundle content actually
     changed. If nothing changed, leave the bundle (including log.md)
     untouched; do not log administrative no-op runs.
  3. Only edit files under .lokf/knowledge/. Do NOT run git, open PRs, or touch
     any other path. Cite sources for any claim whose authority is outside the
     repository.
  4. Mark concepts you create, and claims you cannot settle from the
     repository, as \`status: draft\` (with a plain-prose "## Open questions"
     section for the latter), exactly as the skill says. End your reply with a
     short "For the curator" summary: how many concepts are drafts, which
     carry open questions, and how many are confirmed by a person.
EOF
)"

echo "knowledge-librarian: refreshing the .lokf/ bundle via AGENT_CLI"
# shellcheck disable=SC2086
$AGENT_CLI -p "$prompt"
