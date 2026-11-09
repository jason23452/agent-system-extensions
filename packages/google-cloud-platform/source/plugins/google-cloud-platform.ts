import { Plugin as OpenCodeV2Plugin } from "@opencode/plugin";
import { callGcloudBackend, currentProject } from "./google-cloud-platform/cli.ts";

const GoogleCloudPlatformPlugin = OpenCodeV2Plugin.define({
  id: "google-cloud-platform",
  async setup(context) {
    const directory = context.location.directory;
    await context.tool.transform((editor) => editor.add({
      name: "gcloud_cli",
      description: "Run a gcloud CLI command in this Agent System Project's authenticated Google Cloud CLI container. Provide argv elements without a shell; include --project when a Google Cloud project is required. Authentication/token-management commands are handled by the Extension login controls.",
      input: {
        type: "object",
        properties: {
          commandArgs: {
            type: "array",
            items: { type: "string", minLength: 1, maxLength: 2_048 },
            minItems: 1,
            maxItems: 64,
            description: "gcloud argv after the gcloud executable, for example [\"run\", \"services\", \"list\", \"--project\", \"my-project\", \"--region\", \"us-central1\"]",
          },
        },
        required: ["commandArgs"],
        additionalProperties: false,
      },
      options: { codemode: false },
      async execute(input) {
        const project = currentProject({ directory });
        const result = await callGcloudBackend(project, input.commandArgs);
        return { content: JSON.stringify(result, null, 2) };
      },
    }));
  },
});

export default GoogleCloudPlatformPlugin;
