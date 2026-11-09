import { Plugin as OpenCodeV2Plugin } from "@opencode/plugin";
import { GITLAB_SELECT_SKILL_TOOL_NAME, selectGitLabSkill } from "./gitlab-selector.js";

const GitLabPlugin = OpenCodeV2Plugin.define({
  id: "gitlab",
  async setup(context) {
    await context.tool.transform((editor) => editor.add({
      name: GITLAB_SELECT_SKILL_TOOL_NAME,
      description: "List GitLab Skills cloned during Project synchronization by parent/catalog, or read one SKILL.md from the Plugin-local Skills directory.",
      input: {
        type: "object",
        properties: {
          parent: { type: "string", description: "Exact first-level directory under plugins/gitlab/skills." },
          catalog: { type: "string", description: "Exact catalog directory under the selected parent." },
          skillName: { type: "string", description: "Exact Skill directory under the selected catalog or a direct child." },
        },
        additionalProperties: false,
      },
      options: { codemode: false },
      async execute(input) {
        return selectGitLabSkill(input);
      },
    }));
  },
});

export default GitLabPlugin;
