---
name: minimal-api-service-cloud-run-pipeline
description: "Use when the user asks for the minimal-api-service Azure DevOps CI/CD template that builds a Docker image, pushes it to Artifact Registry, and deploys it to Cloud Run."
---

# Minimal API Service Cloud Run Pipeline

When invoked, create or return `azure-pipelines.yml` using this exact template. Do not add stages, tests, public-access flags, or infrastructure changes unless the user explicitly asks.

```yaml
trigger:
  branches:
    include:
      - main

pool:
  vmImage: ubuntu-latest

variables:
  GCP_PROJECT_ID: esgdemo-449422
  GCP_REGION: asia-east1
  GCP_SERVICE_ACCOUNT_EMAIL: agent-system-gcp-mcp@esgdemo-449422.iam.gserviceaccount.com
  ARTIFACT_REPOSITORY: minimal-api-service
  CLOUD_RUN_SERVICE: minimal-api-service

steps:
  - task: DownloadSecureFile@1
    name: gcpServiceAccount
    inputs:
      secureFile: gcp-service-account.json

  - script: |
      set -euo pipefail

      gcloud auth activate-service-account \
        --key-file="$(gcpServiceAccount.secureFilePath)"

      gcloud config set project "$(GCP_PROJECT_ID)"

      if ! gcloud artifacts repositories describe "$(ARTIFACT_REPOSITORY)" \
        --location="$(GCP_REGION)" \
        --project="$(GCP_PROJECT_ID)"; then

        gcloud artifacts repositories create "$(ARTIFACT_REPOSITORY)" \
          --repository-format=docker \
          --location="$(GCP_REGION)" \
          --project="$(GCP_PROJECT_ID)"
      fi

      gcloud auth configure-docker "$(GCP_REGION)-docker.pkg.dev" --quiet

      IMAGE_URI="$(GCP_REGION)-docker.pkg.dev/$(GCP_PROJECT_ID)/$(ARTIFACT_REPOSITORY)/$(ARTIFACT_REPOSITORY):$(Build.SourceVersion)"

      docker build --tag "$IMAGE_URI" .
      docker push "$IMAGE_URI"

      gcloud run deploy "$(CLOUD_RUN_SERVICE)" \
        --image "$IMAGE_URI" \
        --project="$(GCP_PROJECT_ID)" \
        --region="$(GCP_REGION)" \
        --service-account="$(GCP_SERVICE_ACCOUNT_EMAIL)" \
        --quiet

    displayName: Build, publish, and deploy
```

`gcp-service-account.json` is an Azure DevOps Secure File. Never place its contents in source control, a pipeline variable, or a response.

## Azure DevOps Repository Remote Workflow

當 pipeline 要放在巢狀本機 Repository，例如 `repository/<name>` 時：

1. 使用 `azure_devops_create_repository` 建立 Azure DevOps Repository，並保留工具回傳的 Repository identity。
2. 使用 `azure_devops_clone_repository` 將該 Repository clone 到目前 Project 的 `repository/<name>`；使用回傳的 `path` 作為後續工具的 `repositoryPath`。若未提供 `repositoryPath`，`azure_devops_configure_remote` 會自動選擇與已驗證 Repository 同名的 `repository/<repositoryName>` checkout；若 clone 使用自訂資料夾名稱，必須傳入回傳的 `path`。
3. 使用 `azure_devops_git_config` 並傳入該 `repositoryPath`，將該 checkout 的 local Git identity 設為 `user.name=opencode`、`user.email=opencode@double-cash.com`，設定 `credential.helper=cache --timeout=900`，並將 ADO PAT 暫存於 Git credential cache 與 Plugin 記憶體 15 分鐘。PAT 本身不寫入 Git config 或磁碟。
4. 使用 `azure_devops_configure_remote` 設定 remote，並傳入相同的 `repositoryPath` 與已驗證的 Repository identity。此工具會在指定的巢狀 checkout 操作：remote 尚未存在時新增；已指向標準 Azure DevOps URL 時視為成功且不重複修改；只有在要更換不同 remote 時才傳入 `updateExisting: true`。
5. 開始修改前若需要更新 checkout，使用 `azure_devops_git_pull` 並傳入相同的 `repositoryPath`；可指定 `branch`，省略時 Git 會使用目前分支設定的 upstream。此工具會驗證 remote 對應目前 Azure DevOps Organization/Project，並透過 credential broker 暫時提供 PAT。
6. 在該 checkout 提交所需檔案，再以相同的 `repositoryPath` 和預期 branch 呼叫 `azure_devops_push`。

不要省略巢狀 Repository 的 `repositoryPath`，也不要在父層 Project worktree 設定 remote。`azure_devops_git_pull` 與 `azure_devops_push` 每次都必須指定 `repositoryPath`；`azure_devops_git_config` 省略該欄位時才會操作目前 Git worktree。
