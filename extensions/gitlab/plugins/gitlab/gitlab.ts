import { Plugin } from "@opencode/plugin";
import { GITLAB_SELECT_SKILL_TOOL_NAME, selectGitLabSkill } from "./selector.js";

const GitLabPlugin = Plugin.define({
  id: "gitlab",
  async setup(context) {
    const projectRoot = context.location.directory;
    await context.tool.transform((editor) => editor.add({
      name: GITLAB_SELECT_SKILL_TOOL_NAME,
      description: "列出此 Project 已同步的 GitLab Skills，或讀取指定 frontmatter identity 的原生 Skill 內容。",
      input: {
        type: "object",
        properties: {
          skillName: { type: "string", description: "SKILL.md frontmatter 中的精確 name。未提供時列出所有已同步 Skills。" },
        },
        additionalProperties: false,
      },
      options: { codemode: false },
      async execute(input) {
        return selectGitLabSkill(input, projectRoot);
      },
    }));
  },
});

export default GitLabPlugin;
